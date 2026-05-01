const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const Quiz = require('../models/Quiz');
const QuizAttempt = require('../models/QuizAttempt');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const { hasCourseAccess, hasModuleAccess, normalizeCourseName } = require('../utils/courseAccess');
const { resolveStudentCourseFromRequest } = require('../utils/resolveStudentCourse');
const { logAdminAction } = require('../utils/auditLog');
const { withOptionalBatch } = require('../utils/adminBatchScope');

const router = express.Router();
const PDF_MAX_SIZE_BYTES = 25 * 1024 * 1024;
const PDF_TEXT_MAX_CHARS = 240000;
const PDF_OCR_FALLBACK_TEXT_THRESHOLD = 160;
const GEMINI_API_VERSION = String(process.env.GEMINI_API_VERSION || 'v1beta').trim();
const GEMINI_API_BASE = `https://generativelanguage.googleapis.com/${GEMINI_API_VERSION}`;
const GEMINI_MODEL_CANDIDATES = [
  String(process.env.GEMINI_MODEL || '').trim(),
  'gemini-2.5-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-pro'
].filter(Boolean);
const GEMINI_SYSTEM_PROMPT = "You are an expert MCQ extractor. Extract ALL multiple choice questions from the given text. Return ONLY a valid JSON array with no markdown, no explanation. Each object must have: question (string), options (array of exactly 4 strings), correct (0-based index number of correct answer, use 0 if unknown). Extract every single question you find.";
const geminiModelCache = {
  model: null,
  fetchedAt: 0
};

function supportsGenerateContent(model = {}) {
  const methods = Array.isArray(model?.supportedGenerationMethods)
    ? model.supportedGenerationMethods
    : [];
  return methods.includes('generateContent');
}

async function listSupportedGeminiModels(apiKey) {
  const response = await fetch(
    `${GEMINI_API_BASE}/models?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    }
  );

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || 'Failed to list Gemini models.';
    throw new Error(message);
  }

  const models = Array.isArray(body?.models) ? body.models : [];
  return models
    .filter(supportsGenerateContent)
    .map((model) => String(model?.name || '').replace(/^models\//, '').trim())
    .filter(Boolean);
}

function pickPreferredModel(availableModels = []) {
  for (const candidate of GEMINI_MODEL_CANDIDATES) {
    if (availableModels.includes(candidate)) return candidate;
  }

  const flash = availableModels.find((name) => /flash/i.test(name));
  return flash || availableModels[0] || null;
}

function buildModelPriorityList(availableModels = []) {
  const prioritized = [];

  for (const candidate of GEMINI_MODEL_CANDIDATES) {
    if (availableModels.includes(candidate) && !prioritized.includes(candidate)) {
      prioritized.push(candidate);
    }
  }

  for (const model of availableModels) {
    if (!prioritized.includes(model)) prioritized.push(model);
  }

  return prioritized;
}

async function resolveGeminiModel(apiKey, { forceRefresh = false } = {}) {
  const cacheAgeMs = Date.now() - geminiModelCache.fetchedAt;
  const canUseCache = !forceRefresh && geminiModelCache.model && cacheAgeMs < 10 * 60 * 1000;
  if (canUseCache) return geminiModelCache.model;

  const availableModels = await listSupportedGeminiModels(apiKey);
  const selected = pickPreferredModel(availableModels);
  if (!selected) {
    throw new Error('No Gemini model with generateContent support is available for this API key.');
  }

  geminiModelCache.model = selected;
  geminiModelCache.fetchedAt = Date.now();
  return selected;
}

function isModelAvailabilityError(message = '') {
  const text = String(message || '').toLowerCase();
  return text.includes('not found for api version')
    || text.includes('not supported for generatecontent')
    || text.includes('no longer available to new users')
    || text.includes('model is no longer available')
    || text.includes('deprecated')
    || text.includes('retired');
}

function isRetriableGeminiError(message = '') {
  const text = String(message || '').toLowerCase();
  return text.includes('high demand')
    || text.includes('overloaded')
    || text.includes('unavailable')
    || text.includes('rate limit')
    || text.includes('resource exhausted')
    || text.includes('try again later');
}

const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PDF_MAX_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    const mimetype = String(file?.mimetype || '').toLowerCase();
    const originalName = String(file?.originalname || '').toLowerCase();
    const isPdf = mimetype === 'application/pdf' || originalName.endsWith('.pdf');
    if (!isPdf) {
      cb(new Error('Only PDF files are allowed.'));
      return;
    }
    cb(null, true);
  }
});

function cleanGeminiJson(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return '[]';
  if (raw.startsWith('```')) {
    return raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
  }
  return raw;
}

function parseGeminiQuestions(rawText = '') {
  const cleaned = cleanGeminiJson(rawText);

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed?.questions)) return parsed.questions;
  } catch (_) {
    // Fallback below for malformed wrappers.
  }

  const firstArray = cleaned.match(/\[[\s\S]*\]/);
  if (firstArray?.[0]) {
    try {
      const parsedArray = JSON.parse(firstArray[0]);
      if (Array.isArray(parsedArray)) return parsedArray;
    } catch (_) {
      // Continue to final error.
    }
  }

  throw new Error('Gemini returned invalid JSON format for questions.');
}

function normalizeExtractedQuestions(payload) {
  if (!Array.isArray(payload)) return [];

  return payload
    .map((item) => {
      const question = String(item?.question || '').trim();
      const options = Array.isArray(item?.options)
        ? item.options.map((opt) => String(opt || '').trim()).slice(0, 4)
        : [];

      if (options.length < 4) {
        while (options.length < 4) {
          options.push('');
        }
      }

      const correctRaw = Number(item?.correct);
      const correct = Number.isInteger(correctRaw) && correctRaw >= 0 && correctRaw <= 3 ? correctRaw : 0;

      if (!question) return null;

      return {
        question,
        options,
        correctIndex: correct
      };
    })
    .filter(Boolean);
}

async function extractQuestionsWithGemini({ extractedText = '', pdfBuffer = null, pdfMimeType = 'application/pdf' } = {}) {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing on the server.');
  }

  const normalizedText = String(extractedText || '').trim();
  const hasPdfBuffer = Boolean(pdfBuffer?.length);

  const runGeminiExtraction = async ({ includePdfInline = false } = {}) => {
    const callGemini = async (modelName) => {
      const parts = [];

      if (includePdfInline && hasPdfBuffer) {
        parts.push({
          text: normalizedText
            ? 'The attached PDF may be scanned or image-based. Use both the PDF pages and the extracted text to find every MCQ.'
            : 'The attached PDF may be scanned or image-based. Read the PDF directly and extract every MCQ you can find.'
        });

        if (normalizedText) {
          parts.push({ text: `Supplemental extracted text from the PDF:\n${normalizedText}` });
        }

        parts.push({
          inlineData: {
            mimeType: pdfMimeType || 'application/pdf',
            data: Buffer.from(pdfBuffer).toString('base64')
          }
        });
      } else {
        parts.push({ text: normalizedText });
      }

      const response = await fetch(
        `${GEMINI_API_BASE}/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: {
              parts: [{ text: GEMINI_SYSTEM_PROMPT }]
            },
            contents: [
              {
                role: 'user',
                parts
              }
            ],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: 'application/json'
            }
          })
        }
      );

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = body?.error?.message || 'Gemini API request failed.';
        throw new Error(message);
      }

      const responseParts = body?.candidates?.[0]?.content?.parts;
      const rawText = Array.isArray(responseParts)
        ? responseParts.map((part) => String(part?.text || '')).join('\n').trim()
        : '';

      if (!rawText) {
        throw new Error('Gemini returned an empty response.');
      }

      const parsed = parseGeminiQuestions(rawText);
      const questions = normalizeExtractedQuestions(parsed);

      if (!questions.length) {
        throw new Error('No multiple choice questions could be detected in this PDF.');
      }

      return questions;
    };

    const availableModels = await listSupportedGeminiModels(apiKey);
    const prioritizedModels = buildModelPriorityList(availableModels);

    if (!prioritizedModels.length) {
      throw new Error('No Gemini model with generateContent support is available for this API key.');
    }

    let lastError = null;

    for (const modelName of prioritizedModels) {
      try {
        geminiModelCache.model = modelName;
        geminiModelCache.fetchedAt = Date.now();
        return await callGemini(modelName);
      } catch (error) {
        lastError = error;
        const message = String(error?.message || '');
        const canTryAnotherModel = isModelAvailabilityError(message) || isRetriableGeminiError(message);
        if (!canTryAnotherModel) {
          throw error;
        }
      }
    }

    throw lastError || new Error('Gemini extraction failed after trying all available models.');
  };

  if (normalizedText) {
    try {
      return await runGeminiExtraction({ includePdfInline: false });
    } catch (error) {
      const fallbackAllowed = hasPdfBuffer && normalizedText.length < PDF_OCR_FALLBACK_TEXT_THRESHOLD;
      if (!fallbackAllowed) throw error;
    }
  }

  if (hasPdfBuffer) {
    try {
      return await runGeminiExtraction({ includePdfInline: true });
    } catch (error) {
      const message = String(error?.message || 'Failed to extract questions from PDF.');
      if (/payload|too large|request size|inline data/i.test(message)) {
        throw new Error('This scanned PDF is too large for AI OCR. Please upload a smaller chapter PDF or compress the file.');
      }
      throw error;
    }
  }

  throw new Error('Could not extract readable content from this PDF.');
}

function resolveCorrectIndex(question = {}) {
  const normalizedOptions = Array.isArray(question.options) ? question.options : [];
  const direct = Number(question.correctIndex);
  if (Number.isInteger(direct) && direct >= 0 && direct < normalizedOptions.length) {
    return direct;
  }

  // Backward compatibility for legacy quiz shapes.
  const legacyOption = Number(question.correctOption);
  if (Number.isInteger(legacyOption)) {
    const zeroBased = legacyOption >= 1 && legacyOption <= normalizedOptions.length
      ? legacyOption - 1
      : legacyOption;
    if (zeroBased >= 0 && zeroBased < normalizedOptions.length) {
      return zeroBased;
    }
  }

  if (typeof question.correctAnswer === 'string' && normalizedOptions.length) {
    const byLabel = normalizedOptions.findIndex((opt) => String(opt).trim().toLowerCase() === question.correctAnswer.trim().toLowerCase());
    if (byLabel >= 0) return byLabel;
  }

  return -1;
}

function sanitizeQuestionsForStudent(questions = []) {
  return questions.map((item) => ({
    question: item.question,
    options: item.options,
    correctIndex: resolveCorrectIndex(item),
    explanation: item.explanation || ''
  }));
}

function alphanumericKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function sameCourseCategory(left, right) {
  const l = normalizeCourseName(left || '');
  const r = normalizeCourseName(right || '');
  if (!l || !r) return false;
  if (l.toLowerCase() === r.toLowerCase()) return true;
  return alphanumericKey(l) === alphanumericKey(r);
}

function normalizeModuleKey(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function validateQuizPayload(payload) {
  if (!payload || typeof payload !== 'object') return 'Invalid quiz payload.';
  const { category, module, title, questions, difficulty, timeLimitMinutes, requireExplanation, topic } = payload;
  if (!category || !module || !title) return 'Category, module and title are required.';
  if (topic != null && typeof topic !== 'string') return 'Topic must be text.';
  if (!Array.isArray(questions) || questions.length === 0) return 'At least one question is required.';
  if (difficulty && !['easy', 'medium', 'hard'].includes(String(difficulty))) {
    return 'Difficulty must be easy, medium, or hard.';
  }
  if (timeLimitMinutes != null) {
    const limit = Number(timeLimitMinutes);
    if (!Number.isFinite(limit) || limit < 1 || limit > 180) {
      return 'Time limit must be between 1 and 180 minutes.';
    }
  }

  if (requireExplanation != null && typeof requireExplanation !== 'boolean') {
    return 'Require explanation must be true or false.';
  }

  for (const q of questions) {
    if (!q.question || !Array.isArray(q.options) || q.options.length !== 4) {
      return 'Each question must include question text and exactly 4 options.';
    }
    if (typeof q.correctIndex !== 'number' || q.correctIndex < 0 || q.correctIndex > 3) {
      return 'Each question must have a correct option index between 0 and 3.';
    }
    if (requireExplanation && (!q.explanation || !String(q.explanation).trim())) {
      return 'Explanation is required for all questions when explanation mode is enabled.';
    }
  }

  return null;
}

// Admin: extract MCQ questions from PDF using Gemini
router.post('/extract-pdf-mcq', authenticateToken('admin'), (req, res) => {
  pdfUpload.single('pdf')(req, res, async (uploadError) => {
    if (uploadError) {
      if (uploadError instanceof multer.MulterError && uploadError.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'PDF file size must be 25MB or less.' });
      }
      return res.status(400).json({ error: uploadError.message || 'Invalid PDF upload.' });
    }

    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'PDF file is required.' });
    }

    try {
      const parsedPdf = await pdfParse(req.file.buffer).catch(() => ({ text: '' }));
      const extractedText = String(parsedPdf?.text || '').trim();
      const boundedText = extractedText.length > PDF_TEXT_MAX_CHARS
        ? extractedText.slice(0, PDF_TEXT_MAX_CHARS)
        : extractedText;

      const questions = await extractQuestionsWithGemini({
        extractedText: boundedText,
        pdfBuffer: req.file.buffer,
        pdfMimeType: req.file.mimetype || 'application/pdf'
      });

      return res.json({ questions });
    } catch (error) {
      const message = String(error?.message || 'Failed to extract questions from PDF.');
      const lower = message.toLowerCase();
      const status = lower.includes('quota') || lower.includes('rate limit')
        ? 429
        : lower.includes('api key') || lower.includes('permission')
          ? 401
          : 500;

      console.error('[extract-pdf-mcq] Failed:', message);
      return res.status(status).json({ error: message });
    }
  });
});

// Admin: create or update a module quiz
router.post('/', authenticateToken('admin'), async (req, res) => {
  try {
    const validationError = validateQuizPayload(req.body);
    if (validationError) return res.status(400).json({ error: validationError });

    const category = String(req.body.category).trim();
    const batch = req.body.batch ? String(req.body.batch).trim() : '';
    const moduleName = String(req.body.module).trim();
    const topicName = String(req.body.topic || 'General').trim() || 'General';
    const title = String(req.body.title).trim();
    const difficulty = req.body.difficulty ? String(req.body.difficulty).toLowerCase() : 'medium';
    const requireExplanation = Boolean(req.body.requireExplanation);
    const timeLimitMinutes = Number(req.body.timeLimitMinutes || 15);
    const quizId = req.body.quizId ? String(req.body.quizId).trim() : '';
    const questions = req.body.questions.map((item) => ({
      question: String(item.question).trim(),
      options: item.options.map((option) => String(option).trim()),
      correctIndex: Number(item.correctIndex),
      explanation: item.explanation ? String(item.explanation).trim() : ''
    }));

    let quiz;
    if (quizId) {
      quiz = await Quiz.findByIdAndUpdate(
        quizId,
        {
          $set: {
            category,
            batch,
            module: moduleName,
            topic: topicName,
            title,
            difficulty,
            requireExplanation,
            timeLimitMinutes,
            questions,
            updatedBy: req.user.username,
            updatedAt: new Date()
          }
        },
        { new: true }
      );
      if (!quiz) return res.status(404).json({ error: 'Quiz not found for update.' });
    } else {
      quiz = await Quiz.create({
        category,
        batch,
        module: moduleName,
        topic: topicName,
        title,
        difficulty,
        requireExplanation,
        timeLimitMinutes,
        questions,
        updatedBy: req.user.username,
        updatedAt: new Date()
      });
    }

    return res.status(201).json({ message: 'Quiz saved.', quiz });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to save quiz.' });
  }
});

// Admin: quiz analytics — per-quiz attempt statistics
router.get('/admin/analytics', authenticateToken('admin'), async (req, res) => {
  try {
    const category = String(req.query.category || '').trim();
    const quizFilter = category ? { category } : {};
    const quizzes = await Quiz.find(quizFilter, { _id: 1, title: 1, category: 1, module: 1, topic: 1, difficulty: 1 }).lean();
    const quizIds = quizzes.map((q) => q._id);

    const attempts = await QuizAttempt.find({ quizId: { $in: quizIds } }, {
      quizId: 1, score: 1, total: 1, username: 1, submittedAt: 1
    }).lean();

    // Build per-quiz stats
    const statsMap = {};
    for (const q of quizzes) {
      statsMap[q._id.toString()] = {
        quizId: q._id,
        title: q.title,
        category: q.category,
        module: q.module,
        topic: q.topic || 'General',
        difficulty: q.difficulty,
        totalAttempts: 0,
        totalScore: 0,
        totalQuestions: 0,
        passCount: 0
      };
    }

    for (const a of attempts) {
      const key = String(a.quizId);
      if (!statsMap[key]) continue;
      const stat = statsMap[key];
      stat.totalAttempts += 1;
      stat.totalScore += Number(a.score || 0);
      stat.totalQuestions += Number(a.total || 0);
      if (Number(a.total) > 0 && Number(a.score) / Number(a.total) >= 0.6) {
        stat.passCount += 1;
      }
    }

    const analytics = Object.values(statsMap).map((s) => ({
      ...s,
      avgScore: s.totalAttempts > 0 ? (s.totalScore / s.totalAttempts).toFixed(1) : '0.0',
      avgPct: s.totalAttempts > 0 && s.totalQuestions > 0
        ? ((s.totalScore / s.totalQuestions) * 100).toFixed(0)
        : '0',
      passRate: s.totalAttempts > 0
        ? ((s.passCount / s.totalAttempts) * 100).toFixed(0)
        : '0'
    }));

    return res.json({ analytics });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch quiz analytics.' });
  }
});

// Admin: bulk-delete all quizzes for a category+module
router.delete('/module', authenticateToken('admin'), async (req, res) => {
  const { category, module: moduleName, batch } = req.body || {};
  if (!category || !moduleName) {
    return res.status(400).json({ error: 'category and module are required' });
  }
  try {
    const normalizedModule = String(moduleName).trim();
    const batchFilter = String(batch || '').trim();
    const isGeneralModule = normalizedModule.toLowerCase() === 'general';
    const moduleFilter = isGeneralModule
      ? { $or: [{ module: 'General' }, { module: '' }, { module: null }, { module: { $exists: false } }] }
      : { module: normalizedModule };
    let match = { category, ...moduleFilter };
    if (batchFilter) {
      match = withOptionalBatch({ category, ...moduleFilter }, batchFilter);
    }
    const quizzes = await Quiz.find(match);
    const ids = quizzes.map(q => q._id);
    await Quiz.deleteMany({ _id: { $in: ids } });
    await QuizAttempt.deleteMany({ quizId: { $in: ids } });
    return res.json({ message: 'Module quizzes deleted', deletedCount: ids.length });
  } catch (err) {
    console.error('[module-quiz-delete]', err.message);
    return res.status(500).json({ error: 'Failed to delete module quizzes' });
  }
});

// Admin: delete quiz
router.delete('/:id', authenticateToken('admin'), async (req, res) => {
  try {
    const deleted = await Quiz.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Quiz not found.' });
    const deletedObj = deleted.toObject();
    await QuizAttempt.deleteMany({ quizId: deleted._id });
    await logAdminAction(req, {
      action: 'DELETE_QUIZ',
      targetType: 'Quiz',
      targetId: String(deleted._id),
      details: {
        title: deleted.title,
        category: deleted.category,
        module: deleted.module,
        snapshot: {
          _id: String(deletedObj._id),
          category: deletedObj.category,
          module: deletedObj.module,
          topic: deletedObj.topic || 'General',
          title: deletedObj.title,
          difficulty: deletedObj.difficulty,
          requireExplanation: deletedObj.requireExplanation,
          timeLimitMinutes: deletedObj.timeLimitMinutes,
          questions: Array.isArray(deletedObj.questions) ? deletedObj.questions : [],
          updatedBy: deletedObj.updatedBy,
          updatedAt: deletedObj.updatedAt
        }
      }
    });
    return res.json({ message: 'Quiz deleted.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete quiz.' });
  }
});

// Admin: list quizzes (optional filters)
router.get('/', authenticateToken('admin'), async (req, res) => {
  try {
    const category = String(req.query.category || '').trim();
    const quizzesRaw = await Quiz.find({}).sort({ category: 1, module: 1, topic: 1, updatedAt: -1 }).lean();
    const quizzes = category
      ? quizzesRaw.filter((quiz) => sameCourseCategory(quiz?.category, category))
      : quizzesRaw;
    return res.json({ quizzes });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch quizzes.' });
  }
});

// Student: list available module quizzes for their course
router.get('/my-course', authenticateToken('user'), async (req, res) => {
  try {
    const user = await User.findOne({ username: req.user.username }, { class: 1, purchasedCourses: 1, _id: 0 }).lean();
    const purchasedHints = (user?.purchasedCourses || []).map((p) => p.course).filter(Boolean);
    const enrolledAnchor = (user?.class && String(user.class).trim()) || purchasedHints[0] || '';
    if (!user || !enrolledAnchor) return res.status(404).json({ error: 'Student profile not found.' });

    const queryCourse = typeof req.query.course === 'string' ? req.query.course.trim() : '';
    const canonicalCourse = await resolveStudentCourseFromRequest(
      queryCourse || enrolledAnchor,
      enrolledAnchor,
      purchasedHints
    );
    if (!canonicalCourse) return res.status(404).json({ error: 'Course not found.' });

    const quizzesRaw = await Quiz.find(
      {},
      { category: 1, batch: 1, module: 1, topic: 1, title: 1, difficulty: 1, requireExplanation: 1, timeLimitMinutes: 1, updatedAt: 1, questions: 1 }
    )
      .sort({ module: 1 })
      .lean();
    const quizzes = quizzesRaw.filter((quiz) => sameCourseCategory(quiz?.category, canonicalCourse));

    const accessibleQuizzes = [];
    for (const quiz of quizzes) {
      const canAccessModule = await hasModuleAccess(user, quiz.category, quiz.module || 'General', quiz.batch || 'General');
      if (canAccessModule) accessibleQuizzes.push(quiz);
    }

    return res.json({
      course: canonicalCourse,
      quizzes: accessibleQuizzes.map((quiz) => ({
        _id: quiz._id,
        category: quiz.category,
        course: quiz.category,
        batch: String(quiz.batch || '').trim(),
        module: quiz.module,
        topic: quiz.topic || 'General',
        title: quiz.title,
        difficulty: quiz.difficulty || 'medium',
        requireExplanation: quiz.requireExplanation,
        timeLimitMinutes: quiz.timeLimitMinutes || 15,
        updatedAt: quiz.updatedAt,
        questionCount: Array.isArray(quiz.questions) ? quiz.questions.length : 0,
        questions: sanitizeQuestionsForStudent(quiz.questions || [])
      }))
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch quizzes.' });
  }
});

// Student: get quiz by id (safe for list->open workflow)
router.get('/my-course/quiz/:id', authenticateToken('user'), async (req, res) => {
  try {
    const quiz = await Quiz.findById(req.params.id).lean();
    if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });

    const user = await User.findOne({ username: req.user.username }, { class: 1, purchasedCourses: 1, _id: 0 }).lean();
    const purchasedHints = (user?.purchasedCourses || []).map((p) => p.course).filter(Boolean);
    const enrolledAnchor = (user?.class && String(user.class).trim()) || purchasedHints[0] || '';
    if (!user || !enrolledAnchor) {
      return res.status(403).json({ error: 'You are not authorized for this quiz.' });
    }
    const queryCourse = typeof req.query.course === 'string' ? req.query.course.trim() : '';
    const scopeCourse = await resolveStudentCourseFromRequest(
      queryCourse || quiz.category,
      enrolledAnchor,
      purchasedHints
    );
    if (normalizeCourseName(quiz.category) !== normalizeCourseName(scopeCourse)) {
      return res.status(403).json({ error: 'You are not authorized for this quiz.' });
    }
    const canAccess = await hasModuleAccess(user, quiz.category, quiz.module || 'General', quiz.batch || 'General');
    if (!canAccess) {
      return res.status(402).json({ error: 'Please unlock this module to access quizzes.' });
    }

    return res.json({
      quiz: {
        _id: quiz._id,
        category: quiz.category,
        module: quiz.module,
        topic: quiz.topic || 'General',
        title: quiz.title,
        difficulty: quiz.difficulty || 'medium',
        requireExplanation: Boolean(quiz.requireExplanation),
        timeLimitMinutes: quiz.timeLimitMinutes || 15,
        questions: sanitizeQuestionsForStudent(quiz.questions)
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch quiz.' });
  }
});

// Student: get chapter-wise quiz without answers
router.get('/my-course/:module', authenticateToken('user'), async (req, res) => {
  try {
    const moduleName = String(req.params.module || '').trim();
    if (!moduleName) return res.status(400).json({ error: 'Module is required.' });

    const user = await User.findOne({ username: req.user.username }, { class: 1, purchasedCourses: 1, _id: 0 }).lean();
    const purchasedHints = (user?.purchasedCourses || []).map((p) => p.course).filter(Boolean);
    const enrolledAnchor = (user?.class && String(user.class).trim()) || purchasedHints[0] || '';
    if (!user || !enrolledAnchor) return res.status(404).json({ error: 'Student profile not found.' });
    const queryCourse = typeof req.query.course === 'string' ? req.query.course.trim() : '';
    const canonicalCourse = await resolveStudentCourseFromRequest(
      queryCourse || enrolledAnchor,
      enrolledAnchor,
      purchasedHints
    );
    if (!canonicalCourse) return res.status(404).json({ error: 'Course not found.' });
    const canAccess = await hasModuleAccess(user, canonicalCourse, moduleName, req.query?.batch || 'General');
    if (!canAccess) {
      return res.status(402).json({ error: 'Please unlock this module to access quizzes.' });
    }

    const normalizedModule = normalizeModuleKey(moduleName);
    const quizListRaw = await Quiz.find({}).lean();
    const quizList = quizListRaw.filter(
      (quiz) => sameCourseCategory(quiz?.category, canonicalCourse)
        && normalizeModuleKey(quiz?.module || 'General') === normalizedModule
    );
    if (!quizList.length) return res.status(404).json({ error: 'Quiz not found for this module.' });

    return res.json({
      quizzes: quizList.map((quiz) => ({
        _id: quiz._id,
        category: quiz.category,
        module: quiz.module,
        topic: quiz.topic || 'General',
        title: quiz.title,
        difficulty: quiz.difficulty || 'medium',
        requireExplanation: Boolean(quiz.requireExplanation),
        timeLimitMinutes: quiz.timeLimitMinutes || 15,
        questions: sanitizeQuestionsForStudent(quiz.questions)
      }))
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch quiz.' });
  }
});

// Student: submit quiz answers and get instant score
router.post('/:id/submit', authenticateToken('user'), async (req, res) => {
  try {
    const { answers, durationSeconds } = req.body || {};
    if (!Array.isArray(answers)) return res.status(400).json({ error: 'Answers array is required.' });

    const quiz = await Quiz.findById(req.params.id).lean();
    if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });

    const user = await User.findOne({ username: req.user.username }, { class: 1, purchasedCourses: 1, _id: 0 }).lean();
    if (!user?.class) {
      return res.status(403).json({ error: 'You are not authorized for this quiz.' });
    }
    const canAccess = await hasModuleAccess(user, quiz.category, quiz.module || 'General', quiz.batch || 'General');
    if (!canAccess) {
      return res.status(402).json({ error: 'Please unlock this module to submit quizzes.' });
    }

    const normalizedAnswers = quiz.questions.map((_, idx) => {
      const value = Number(answers[idx]);
      return Number.isInteger(value) && value >= 0 && value <= 3 ? value : -1;
    });

    let score = 0;
    quiz.questions.forEach((question, idx) => {
      const correctIndex = resolveCorrectIndex(question);
      if (correctIndex >= 0 && normalizedAnswers[idx] === correctIndex) score += 1;
    });

    const review = quiz.questions.map((question, idx) => {
      const correctIndex = resolveCorrectIndex(question);
      return {
        question: question.question,
        options: question.options,
        selectedIndex: normalizedAnswers[idx],
        correctIndex,
        correctAnswer: (Array.isArray(question.options) && correctIndex >= 0) ? question.options[correctIndex] : '',
        isCorrect: correctIndex >= 0 && normalizedAnswers[idx] === correctIndex,
        explanation: question.explanation || ''
      };
    });

    const attempt = await QuizAttempt.create({
      quizId: quiz._id,
      username: req.user.username,
      category: quiz.category,
      module: quiz.module,
      score,
      total: quiz.questions.length,
      answers: normalizedAnswers,
      durationSeconds: Number.isFinite(Number(durationSeconds)) ? Math.max(0, Number(durationSeconds)) : undefined
    });

    return res.json({
      message: 'Quiz submitted.',
      result: {
        attemptId: attempt._id,
        score,
        total: quiz.questions.length,
        percentage: Math.round((score / quiz.questions.length) * 100),
        review
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to submit quiz.' });
  }
});

// Student: get recent quiz attempts for score tracking
router.get('/my-attempts/recent', authenticateToken('user'), async (req, res) => {
  try {
    const user = await User.findOne({ username: req.user.username }, { class: 1, purchasedCourses: 1, _id: 0 }).lean();
    if (!user?.class) return res.status(404).json({ error: 'Student profile not found.' });
    const canAccess = await hasCourseAccess(user, user.class);
    if (!canAccess) return res.json({ attempts: [] });

    const attempts = await QuizAttempt.find({ username: req.user.username })
      .sort({ submittedAt: -1 })
      .limit(20)
      .lean();
    const filteredAttempts = [];
    for (const attempt of attempts) {
      const canAccessModule = await hasModuleAccess(user, attempt.category || user.class, attempt.module || 'General', attempt.batch || 'General');
      if (canAccessModule) filteredAttempts.push(attempt);
    }
    const quizIds = Array.from(new Set(
      filteredAttempts
        .map((attempt) => String(attempt?.quizId || '').trim())
        .filter(Boolean)
    ));
    const quizzes = quizIds.length
      ? await Quiz.find({ _id: { $in: quizIds } }, { _id: 1, batch: 1, category: 1 }).lean()
      : [];
    const quizMetaById = new Map(quizzes.map((quiz) => [String(quiz._id), quiz]));

    const shapedAttempts = filteredAttempts.map((attempt) => {
      const quizMeta = quizMetaById.get(String(attempt?.quizId || '')) || {};
      const course = String(attempt?.category || quizMeta?.category || user.class || '').trim();
      return {
        ...attempt,
        course,
        category: course,
        batch: String(quizMeta?.batch || '').trim()
      };
    });

    return res.json({ attempts: shapedAttempts });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch quiz attempts.' });
  }
});

// Student: leaderboard based on each user's best attempt in their course
router.get('/leaderboard', authenticateToken('user'), async (req, res) => {
  try {
    const user = await User.findOne({ username: req.user.username }, { class: 1, purchasedCourses: 1, _id: 0 }).lean();
    if (!user?.class) return res.status(404).json({ error: 'Student profile not found.' });
    const canAccess = await hasCourseAccess(user, user.class);
    if (!canAccess) return res.json({ leaderboard: [], modules: [] });

    const moduleFilter = String(req.query.module || '').trim();
    if (moduleFilter) {
      const canAccessModule = await hasModuleAccess(user, user.class, moduleFilter, req.query?.batch || 'General');
      if (!canAccessModule) return res.json({ leaderboard: [], modules: [] });
    }
    const matchFilter = { category: user.class };
    if (moduleFilter) {
      matchFilter.module = moduleFilter;
    }

    const leaderboard = await QuizAttempt.aggregate([
      { $match: matchFilter },
      {
        $addFields: {
          percentage: {
            $cond: [
              { $gt: ['$total', 0] },
              { $multiply: [{ $divide: ['$score', '$total'] }, 100] },
              0
            ]
          }
        }
      },
      { $sort: { percentage: -1, score: -1, submittedAt: -1 } },
      {
        $group: {
          _id: '$username',
          bestAttempt: { $first: '$$ROOT' },
          attemptsCount: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          username: '$_id',
          module: '$bestAttempt.module',
          score: '$bestAttempt.score',
          total: '$bestAttempt.total',
          percentage: { $round: ['$bestAttempt.percentage', 2] },
          submittedAt: '$bestAttempt.submittedAt',
          attemptsCount: 1
        }
      },
      { $sort: { percentage: -1, score: -1, submittedAt: 1, username: 1 } },
      { $limit: 50 }
    ]);

    const modules = await QuizAttempt.distinct('module', { category: user.class });
    const sortedModules = modules
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    return res.json({
      course: user.class,
      moduleFilter: moduleFilter || null,
      modules: sortedModules,
      leaderboard: leaderboard.map((entry, index) => ({
        ...entry,
        rank: index + 1
      }))
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch leaderboard.' });
  }
});

module.exports = router;
