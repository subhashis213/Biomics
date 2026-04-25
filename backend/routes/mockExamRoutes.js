const express = require('express');
const PDFDocument = require('pdfkit');
const MockExam = require('../models/MockExam');
const MockExamAttempt = require('../models/MockExamAttempt');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const { hasCourseAccess } = require('../utils/courseAccess');

const router = express.Router();

function resolveCorrectIndex(question = {}) {
  const options = Array.isArray(question.options) ? question.options : [];
  const direct = Number(question.correctIndex);
  if (Number.isInteger(direct) && direct >= 0 && direct < options.length) return direct;
  return -1;
}

function sanitizeQuestionsForStudent(questions = []) {
  return questions.map((item) => ({
    question: item.question,
    options: item.options,
    explanation: item.explanation || ''
  }));
}

function sanitizeQuestionsForReview(questions = [], answers = []) {
  return questions.map((question, index) => {
    const correctIndex = resolveCorrectIndex(question);
    const selectedIndex = Number(answers[index]);
    const normalizedSelected = Number.isInteger(selectedIndex) && selectedIndex >= 0 && selectedIndex <= 3 ? selectedIndex : -1;
    return {
      question: question.question,
      options: question.options,
      selectedIndex: normalizedSelected,
      correctIndex,
      correctAnswer: (Array.isArray(question.options) && correctIndex >= 0) ? question.options[correctIndex] : '',
      isCorrect: correctIndex >= 0 && normalizedSelected === correctIndex,
      explanation: question.explanation || ''
    };
  });
}

function validateExamPayload(payload) {
  if (!payload || typeof payload !== 'object') return 'Invalid mock exam payload.';
  const { category, title, examDate, examWindowEndAt, durationMinutes, questions } = payload;
  if (!category || !title || !examDate) return 'Category, title and exam date are required.';
  if (!Array.isArray(questions) || questions.length === 0) return 'At least one question is required.';

  const date = new Date(examDate);
  if (Number.isNaN(date.getTime())) return 'Exam date is invalid.';

  if (examWindowEndAt) {
    const windowEnd = new Date(examWindowEndAt);
    if (Number.isNaN(windowEnd.getTime())) return 'Exam window end date is invalid.';
    if (windowEnd.getTime() <= date.getTime()) {
      return 'Exam window end must be after exam start date.';
    }
  }

  const duration = Number(durationMinutes || 60);
  if (!Number.isFinite(duration) || duration < 5 || duration > 300) {
    return 'Duration must be between 5 and 300 minutes.';
  }

  for (const item of questions) {
    if (!item.question || !Array.isArray(item.options) || item.options.length !== 4) {
      return 'Each question must include question text and exactly 4 options.';
    }
    if (typeof item.correctIndex !== 'number' || item.correctIndex < 0 || item.correctIndex > 3) {
      return 'Each question must have a correct option index between 0 and 3.';
    }
  }

  return null;
}

function getMonthValue(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
}

function parseMonthFilter(value) {
  const month = String(value || '').trim();
  if (!month) return '';
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : null;
}

function normalizeCourseName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildCourseRegex(value) {
  return new RegExp(`^${escapeRegex(normalizeCourseName(value))}$`, 'i');
}

async function resolveAccessibleCourses(userDoc) {
  const candidateCourses = new Set();
  const enrolledCourse = normalizeCourseName(userDoc?.class);
  if (enrolledCourse) candidateCourses.add(enrolledCourse);

  if (Array.isArray(userDoc?.purchasedCourses)) {
    userDoc.purchasedCourses.forEach((entry) => {
      const course = normalizeCourseName(entry?.course);
      if (course) candidateCourses.add(course);
    });
  }

  const accessibleCourses = [];
  for (const courseName of candidateCourses) {
    // eslint-disable-next-line no-await-in-loop
    const canAccess = await hasCourseAccess(userDoc, courseName);
    if (canAccess) accessibleCourses.push(courseName);
  }
  return accessibleCourses;
}

// Admin: create or update monthly mock exam
router.post('/', authenticateToken('admin'), async (req, res) => {
  try {
    const validationError = validateExamPayload(req.body);
    if (validationError) return res.status(400).json({ error: validationError });

    const examId = req.body.examId ? String(req.body.examId).trim() : '';
    const payload = {
      category: String(req.body.category).trim(),
      title: String(req.body.title).trim(),
      description: String(req.body.description || '').trim(),
      examDate: new Date(req.body.examDate),
      examWindowEndAt: req.body.examWindowEndAt ? new Date(req.body.examWindowEndAt) : null,
      durationMinutes: Number(req.body.durationMinutes || 60),
      resultReleased: Boolean(req.body.resultReleased),
      noticeEnabled: req.body.noticeEnabled !== false,
      questions: req.body.questions.map((item) => ({
        question: String(item.question).trim(),
        options: item.options.map((opt) => String(opt).trim()),
        correctIndex: Number(item.correctIndex),
        explanation: String(item.explanation || '').trim()
      })),
      updatedBy: req.user.username,
      updatedAt: new Date()
    };

    let exam;
    if (examId) {
      exam = await MockExam.findByIdAndUpdate(examId, { $set: payload }, { new: true });
      if (!exam) return res.status(404).json({ error: 'Mock exam not found for update.' });
    } else {
      exam = await MockExam.create(payload);
    }

    return res.status(201).json({ message: 'Mock exam saved.', exam });
  } catch {
    return res.status(500).json({ error: 'Failed to save mock exam.' });
  }
});

// Admin: list exams
router.get('/admin', authenticateToken('admin'), async (req, res) => {
  try {
    const category = String(req.query.category || '').trim();
    const filter = category ? { category } : {};
    const exams = await MockExam.find(filter).sort({ examDate: -1, updatedAt: -1 }).lean();
    return res.json({ exams });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch mock exams.' });
  }
});

// Admin: monthly mock exam performance table
router.get('/admin/performance', authenticateToken('admin'), async (req, res) => {
  try {
    const category = String(req.query.category || '').trim();
    const monthFilter = parseMonthFilter(req.query.month);
    if (monthFilter === null) {
      return res.status(400).json({ error: 'Invalid month filter. Use YYYY-MM format.' });
    }

    const examFilter = category ? { category } : {};
    const exams = await MockExam.find(examFilter, { _id: 1, title: 1, category: 1, examDate: 1 }).lean();

    const months = Array.from(new Set(exams
      .map((exam) => getMonthValue(exam.examDate))
      .filter(Boolean)))
      .sort((a, b) => b.localeCompare(a));

    const filteredExams = monthFilter
      ? exams.filter((exam) => getMonthValue(exam.examDate) === monthFilter)
      : exams;
    const examIds = filteredExams.map((exam) => exam._id);

    if (!examIds.length) {
      return res.json({ performance: [], months });
    }

    const examById = new Map(filteredExams.map((exam) => [String(exam._id), exam]));
    const attempts = await MockExamAttempt.find(
      { examId: { $in: examIds } },
      { username: 1, examId: 1, score: 1, total: 1, submittedAt: 1 }
    ).lean();

    const performance = attempts
      .map((attempt) => {
        const exam = examById.get(String(attempt.examId));
        if (!exam) return null;
        const percentage = attempt.total > 0 ? Math.round((attempt.score / attempt.total) * 100) : 0;
        return {
          username: attempt.username,
          examTitle: exam.title,
          category: exam.category,
          month: getMonthValue(exam.examDate),
          score: attempt.score,
          total: attempt.total,
          percentage,
          submittedAt: attempt.submittedAt
        };
      })
      .filter(Boolean)
      .sort((left, right) => {
        if (right.percentage !== left.percentage) return right.percentage - left.percentage;
        return new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime();
      })
      .slice(0, 300)
      .map((entry, index) => ({
        rank: index + 1,
        ...entry
      }));

    return res.json({ performance, months });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch mock exam performance.' });
  }
});

// Admin: release/hide result
router.patch('/:id/release', authenticateToken('admin'), async (req, res) => {
  try {
    const resultReleased = Boolean(req.body?.resultReleased);
    const exam = await MockExam.findByIdAndUpdate(
      req.params.id,
      { $set: { resultReleased, updatedAt: new Date(), updatedBy: req.user.username } },
      { new: true }
    ).lean();
    if (!exam) return res.status(404).json({ error: 'Mock exam not found.' });
    return res.json({
      message: resultReleased ? 'Results released.' : 'Results hidden.',
      exam
    });
  } catch {
    return res.status(500).json({ error: 'Failed to update result release.' });
  }
});

// Admin: enable/disable student dashboard notices for an exam
router.patch('/:id/notice', authenticateToken('admin'), async (req, res) => {
  try {
    const noticeEnabled = req.body?.noticeEnabled !== false;
    const exam = await MockExam.findByIdAndUpdate(
      req.params.id,
      { $set: { noticeEnabled, updatedAt: new Date(), updatedBy: req.user.username } },
      { new: true }
    ).lean();

    if (!exam) return res.status(404).json({ error: 'Mock exam not found.' });
    return res.json({
      message: noticeEnabled ? 'Exam notice enabled.' : 'Exam notice disabled.',
      exam
    });
  } catch {
    return res.status(500).json({ error: 'Failed to update exam notice setting.' });
  }
});

// Admin: delete exam and all student attempts for that exam
router.delete('/:id', authenticateToken('admin'), async (req, res) => {
  try {
    const exam = await MockExam.findByIdAndDelete(req.params.id).lean();
    if (!exam) return res.status(404).json({ error: 'Mock exam not found.' });

    await MockExamAttempt.deleteMany({ examId: exam._id });
    return res.json({ message: 'Mock exam deleted successfully.', examId: String(exam._id) });
  } catch {
    return res.status(500).json({ error: 'Failed to delete mock exam.' });
  }
});

// Student: list exams for their course + status
router.get('/my-course', authenticateToken('user'), async (req, res) => {
  try {
    const user = await User.findOne({ username: req.user.username }, { class: 1, purchasedCourses: 1, _id: 0 }).lean();
    if (!user?.class) return res.status(404).json({ error: 'Student profile not found.' });

    const accessibleCourses = await resolveAccessibleCourses(user);
    if (!accessibleCourses.length) return res.json({ exams: [], notices: [] });

    const courseFilters = accessibleCourses.map((courseName) => ({ category: buildCourseRegex(courseName) }));
    const exams = await MockExam.find(courseFilters.length ? { $or: courseFilters } : {}).sort({ examDate: -1 }).lean();
    const examIds = exams.map((exam) => exam._id);

    const attempts = await MockExamAttempt.find(
      { username: req.user.username, examId: { $in: examIds } },
      { examId: 1, score: 1, total: 1, submittedAt: 1 }
    ).lean();

    const attemptMap = new Map(attempts.map((attempt) => [String(attempt.examId), attempt]));
    const now = Date.now();

    const notices = [];
    const serializedExams = exams.map((exam) => {
      const attempt = attemptMap.get(String(exam._id)) || null;
      const isUpcoming = new Date(exam.examDate).getTime() > now;
      const resultReady = Boolean(exam.resultReleased && attempt);
      const noticeEnabled = exam.noticeEnabled !== false;

      if (isUpcoming && noticeEnabled) {
        notices.push({
          type: 'upcoming',
          examId: exam._id,
          title: exam.title,
          examDate: exam.examDate,
          course: exam.category
        });
      }
      if (resultReady && noticeEnabled) {
        notices.push({
          type: 'resultReleased',
          examId: exam._id,
          title: exam.title,
          examDate: exam.examDate,
          course: exam.category
        });
      }
      if (!isUpcoming && !resultReady && noticeEnabled) {
        notices.push({
          type: 'noticeEnabled',
          examId: exam._id,
          title: exam.title,
          examDate: exam.examDate,
          course: exam.category
        });
      }

      return {
        _id: exam._id,
        category: exam.category,
        title: exam.title,
        description: exam.description || '',
        examDate: exam.examDate,
        examWindowEndAt: exam.examWindowEndAt || null,
        durationMinutes: exam.durationMinutes || 60,
        questionCount: Array.isArray(exam.questions) ? exam.questions.length : 0,
        attempted: Boolean(attempt),
        windowClosed: Boolean(!attempt && exam.examWindowEndAt && new Date(exam.examWindowEndAt).getTime() < now),
        noticeEnabled,
        attemptSummary: attempt
          ? {
              score: attempt.score,
              total: attempt.total,
              percentage: Math.round((attempt.score / attempt.total) * 100),
              submittedAt: attempt.submittedAt
            }
          : null,
        resultReleased: Boolean(exam.resultReleased)
      };
    });

    return res.json({ exams: serializedExams, notices });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch mock exams.' });
  }
});

// Student: get exam to attempt (single-attempt guarded)
router.get('/my-course/:id', authenticateToken('user'), async (req, res) => {
  try {
    const exam = await MockExam.findById(req.params.id).lean();
    if (!exam) return res.status(404).json({ error: 'Mock exam not found.' });

    const user = await User.findOne({ username: req.user.username }, { class: 1, purchasedCourses: 1, _id: 0 }).lean();
    if (!user?.class) {
      return res.status(403).json({ error: 'You are not authorized for this exam.' });
    }

    const canAccess = await hasCourseAccess(user, exam.category);
    if (!canAccess) return res.status(403).json({ error: 'Please unlock your course to access exams.' });

    const examStartsAt = new Date(exam.examDate).getTime();
    if (Number.isFinite(examStartsAt) && Date.now() < examStartsAt) {
      return res.status(403).json({ error: `Exam will start on ${new Date(exam.examDate).toLocaleString()}.` });
    }

    const attempt = await MockExamAttempt.findOne({ examId: exam._id, username: req.user.username }, { _id: 1 }).lean();
    const examWindowEndAt = exam.examWindowEndAt ? new Date(exam.examWindowEndAt).getTime() : null;
    const windowClosed = Boolean(!attempt && Number.isFinite(examWindowEndAt) && Date.now() > examWindowEndAt);
    if (windowClosed) {
      return res.status(403).json({ error: 'Exam window is over.' });
    }

    return res.json({
      exam: {
        _id: exam._id,
        category: exam.category,
        title: exam.title,
        description: exam.description || '',
        examDate: exam.examDate,
        examWindowEndAt: exam.examWindowEndAt || null,
        durationMinutes: exam.durationMinutes || 60,
        questions: sanitizeQuestionsForStudent(exam.questions || []),
        attempted: Boolean(attempt),
        resultReleased: Boolean(exam.resultReleased)
      }
    });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch mock exam.' });
  }
});

// Student: leaderboard for monthly mock exams in their course
router.get('/leaderboard', authenticateToken('user'), async (req, res) => {
  try {
    const user = await User.findOne({ username: req.user.username }, { class: 1, purchasedCourses: 1, _id: 0 }).lean();
    if (!user?.class) return res.status(404).json({ error: 'Student profile not found.' });

    const monthFilter = parseMonthFilter(req.query.month);
    if (monthFilter === null) {
      return res.status(400).json({ error: 'Invalid month filter. Use YYYY-MM format.' });
    }

    const accessibleCourses = await resolveAccessibleCourses(user);
    if (!accessibleCourses.length) return res.json({ leaderboard: [], months: [] });

    const courseFilters = accessibleCourses.map((courseName) => ({ category: buildCourseRegex(courseName) }));
    const exams = await MockExam.find(
      courseFilters.length ? { $or: courseFilters } : {},
      { _id: 1, title: 1, examDate: 1, category: 1 }
    ).lean();
    const months = Array.from(new Set(exams
      .map((exam) => getMonthValue(exam.examDate))
      .filter(Boolean)))
      .sort((a, b) => b.localeCompare(a));

    const filteredExams = monthFilter
      ? exams.filter((exam) => getMonthValue(exam.examDate) === monthFilter)
      : exams;
    const examIds = filteredExams.map((exam) => exam._id);
    if (!examIds.length) return res.json({ leaderboard: [], months });

    const examTitleById = new Map(filteredExams.map((exam) => [String(exam._id), exam.title]));
    const attempts = await MockExamAttempt.find(
      { examId: { $in: examIds } },
      { username: 1, examId: 1, score: 1, total: 1, submittedAt: 1, category: 1 }
    )
      .sort({ submittedAt: -1 })
      .lean();

    const byUser = new Map();

    attempts.forEach((attempt) => {
      const username = String(attempt.username || '').trim();
      if (!username) return;

      const percentage = attempt.total > 0 ? Math.round((attempt.score / attempt.total) * 100) : 0;
      const examId = String(attempt.examId || '');
      const current = byUser.get(username);

      if (!current) {
        byUser.set(username, {
          username,
          bestScore: attempt.score,
          bestTotal: attempt.total,
          bestPercentage: percentage,
          examTitle: examTitleById.get(examId) || 'Monthly Mock Exam',
          examsAttempted: 1,
          attemptedExamTitles: [examTitleById.get(examId) || 'Monthly Mock Exam'],
          bestSubmittedAt: attempt.submittedAt ? new Date(attempt.submittedAt).getTime() : 0,
          latestSubmittedAt: attempt.submittedAt ? new Date(attempt.submittedAt).getTime() : 0
        });
        return;
      }

      current.examsAttempted += 1;
      const currentExamTitle = examTitleById.get(examId) || 'Monthly Mock Exam';
      if (!current.attemptedExamTitles.includes(currentExamTitle)) {
        current.attemptedExamTitles.push(currentExamTitle);
      }
      const submittedAtMs = attempt.submittedAt ? new Date(attempt.submittedAt).getTime() : 0;
      if (submittedAtMs > current.latestSubmittedAt) {
        current.latestSubmittedAt = submittedAtMs;
      }

      const shouldReplaceBest = percentage > current.bestPercentage
        || (percentage === current.bestPercentage && attempt.score > current.bestScore)
        || (percentage === current.bestPercentage && attempt.score === current.bestScore && submittedAtMs > current.bestSubmittedAt);

      if (shouldReplaceBest) {
        current.bestScore = attempt.score;
        current.bestTotal = attempt.total;
        current.bestPercentage = percentage;
        current.examTitle = examTitleById.get(examId) || 'Monthly Mock Exam';
        current.bestSubmittedAt = submittedAtMs;
      }
    });

    const leaderboard = Array.from(byUser.values())
      .sort((left, right) => {
        if (right.bestPercentage !== left.bestPercentage) return right.bestPercentage - left.bestPercentage;
        if (right.bestScore !== left.bestScore) return right.bestScore - left.bestScore;
        return (right.latestSubmittedAt || 0) - (left.latestSubmittedAt || 0);
      })
      .slice(0, 50)
      .map((entry, index) => ({
        rank: index + 1,
        username: entry.username,
        examTitle: entry.examTitle,
        bestScore: entry.bestScore,
        bestTotal: entry.bestTotal,
        bestPercentage: entry.bestPercentage,
        examsAttempted: entry.examsAttempted,
        attemptedExamTitles: entry.attemptedExamTitles
      }));

    return res.json({ leaderboard, months });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch exam leaderboard.' });
  }
});

// Student: submit exam once only
router.post('/:id/submit', authenticateToken('user'), async (req, res) => {
  try {
    const { answers, durationSeconds } = req.body || {};
    if (!Array.isArray(answers)) return res.status(400).json({ error: 'Answers array is required.' });

    const exam = await MockExam.findById(req.params.id).lean();
    if (!exam) return res.status(404).json({ error: 'Mock exam not found.' });

    const user = await User.findOne({ username: req.user.username }, { class: 1, purchasedCourses: 1, _id: 0 }).lean();
    if (!user?.class) {
      return res.status(403).json({ error: 'You are not authorized for this exam.' });
    }

    const canAccess = await hasCourseAccess(user, exam.category);
    if (!canAccess) return res.status(403).json({ error: 'Please unlock your course to submit exams.' });

    const examStartsAt = new Date(exam.examDate).getTime();
    if (Number.isFinite(examStartsAt) && Date.now() < examStartsAt) {
      return res.status(403).json({ error: `Exam will start on ${new Date(exam.examDate).toLocaleString()}.` });
    }

    const examWindowEndAt = exam.examWindowEndAt ? new Date(exam.examWindowEndAt).getTime() : null;
    if (Number.isFinite(examWindowEndAt) && Date.now() > examWindowEndAt) {
      return res.status(403).json({ error: 'Exam window is over.' });
    }

    const existingAttempt = await MockExamAttempt.findOne({ examId: exam._id, username: req.user.username }, { _id: 1 }).lean();
    if (existingAttempt) {
      return res.status(409).json({ error: 'You have already attempted this exam. Reattempt is not allowed.' });
    }

    const normalizedAnswers = exam.questions.map((_, idx) => {
      const value = Number(answers[idx]);
      return Number.isInteger(value) && value >= 0 && value <= 3 ? value : -1;
    });

    let score = 0;
    exam.questions.forEach((question, idx) => {
      const correctIndex = resolveCorrectIndex(question);
      if (correctIndex >= 0 && normalizedAnswers[idx] === correctIndex) score += 1;
    });

    const attempt = await MockExamAttempt.create({
      examId: exam._id,
      username: req.user.username,
      category: exam.category,
      score,
      total: exam.questions.length,
      answers: normalizedAnswers,
      durationSeconds: Number.isFinite(Number(durationSeconds)) ? Math.max(0, Number(durationSeconds)) : undefined
    });

    return res.json({
      message: 'Exam submitted successfully. Result will be visible when released by admin.',
      result: {
        attemptId: attempt._id,
        score,
        total: exam.questions.length,
        percentage: Math.round((score / exam.questions.length) * 100),
        released: Boolean(exam.resultReleased)
      }
    });
  } catch {
    return res.status(500).json({ error: 'Failed to submit exam.' });
  }
});

// Student: view result (only after admin release)
router.get('/:id/result', authenticateToken('user'), async (req, res) => {
  try {
    const exam = await MockExam.findById(req.params.id).lean();
    if (!exam) return res.status(404).json({ error: 'Mock exam not found.' });

    const attempt = await MockExamAttempt.findOne({ examId: exam._id, username: req.user.username }).lean();
    if (!attempt) return res.status(404).json({ error: 'You have not attempted this exam yet.' });
    if (!exam.resultReleased) {
      return res.status(403).json({ error: 'Result is not released yet. Please check later.' });
    }

    const review = sanitizeQuestionsForReview(exam.questions || [], attempt.answers || []);

    return res.json({
      result: {
        examId: exam._id,
        title: exam.title,
        category: exam.category,
        score: attempt.score,
        total: attempt.total,
        percentage: Math.round((attempt.score / attempt.total) * 100),
        submittedAt: attempt.submittedAt,
        review
      }
    });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch exam result.' });
  }
});

// Student: download result PDF (released only)
router.get('/:id/result/pdf', authenticateToken('user'), async (req, res) => {
  try {
    const exam = await MockExam.findById(req.params.id).lean();
    if (!exam) return res.status(404).json({ error: 'Mock exam not found.' });

    const attempt = await MockExamAttempt.findOne({ examId: exam._id, username: req.user.username }).lean();
    if (!attempt) return res.status(404).json({ error: 'You have not attempted this exam yet.' });
    if (!exam.resultReleased) {
      return res.status(403).json({ error: 'Result is not released yet. Please check later.' });
    }

    const review = sanitizeQuestionsForReview(exam.questions || [], attempt.answers || []);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="biomics-mock-exam-${exam._id}.pdf"`);

    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    doc.pipe(res);

    const pageMargin = 40;
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const contentWidth = pageWidth - (pageMargin * 2);
    const contentBottom = pageHeight - pageMargin - 6;
    const percentage = Math.round((attempt.score / attempt.total) * 100);
    const durationMinutes = Number.isFinite(Number(attempt.durationSeconds))
      ? Math.max(1, Math.round(Number(attempt.durationSeconds) / 60))
      : null;
    const submittedAt = new Date(attempt.submittedAt).toLocaleString();

    const normalizeLine = (value, maxChars) => {
      const text = String(value || '').replace(/\s+/g, ' ').trim();
      if (!text) return '';
      if (text.length <= maxChars) return text;
      return `${text.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
    };

    const ensureSpace = (heightNeeded) => {
      if (doc.y + heightNeeded <= contentBottom) return;
      doc.addPage();
      doc.y = pageMargin;
    };

    const textHeight = (size, text, width) => {
      doc.fontSize(size);
      return doc.heightOfString(text, { width, align: 'left' });
    };

    doc.save();
    doc.roundedRect(pageMargin, pageMargin, contentWidth, 82, 14).fill('#0f766e');
    doc.restore();
    doc.fillColor('#ffffff').fontSize(17).text('Biomics Hub Monthly Mock Exam Report', pageMargin + 16, pageMargin + 16, {
      width: contentWidth - 32,
      align: 'left'
    });
    doc.fillColor('#d1fae5').fontSize(10).text(`Student: ${normalizeLine(req.user.username, 50)}   |   Course: ${normalizeLine(exam.category, 40)}`, pageMargin + 16, pageMargin + 42, {
      width: contentWidth - 32,
      align: 'left'
    });
    doc.fillColor('#ccfbf1').fontSize(10).text(`Exam: ${normalizeLine(exam.title, 90)}`, pageMargin + 16, pageMargin + 58, {
      width: contentWidth - 32,
      align: 'left'
    });

    doc.y = pageMargin + 94;

    doc.save();
    doc.roundedRect(pageMargin, doc.y, contentWidth, 72, 10).fillAndStroke('#f8fafc', '#dbe4ef');
    doc.restore();
    doc.fillColor('#334155').fontSize(10).text(`Submitted: ${submittedAt}`, pageMargin + 12, doc.y + 10, { width: contentWidth - 24 });
    if (durationMinutes) {
      doc.text(`Duration Used: ${durationMinutes} min`, pageMargin + 12, doc.y + 24, { width: contentWidth - 24 });
    }

    const statY = doc.y + 42;
    const statGap = 8;
    const statWidth = (contentWidth - 24 - statGap * 3) / 4;
    const statItems = [
      { label: 'Score', value: `${attempt.score}/${attempt.total}` },
      { label: 'Percent', value: `${percentage}%` },
      { label: 'Correct', value: String(attempt.score) },
      { label: 'Wrong', value: String(Math.max(0, attempt.total - attempt.score)) }
    ];

    statItems.forEach((item, index) => {
      const x = pageMargin + 12 + index * (statWidth + statGap);
      doc.save();
      doc.roundedRect(x, statY, statWidth, 22, 6).fill('#e2e8f0');
      doc.restore();
      doc.fillColor('#475569').fontSize(7).text(item.label, x + 6, statY + 3, { width: statWidth - 12 });
      doc.fillColor('#0f172a').fontSize(9).text(item.value, x + 6, statY + 11, { width: statWidth - 12 });
    });

    doc.y += 82;
    ensureSpace(28);
    doc.fillColor('#0f172a').fontSize(13).text('Question Review', pageMargin, doc.y, { width: contentWidth });
    doc.y += 6;
    doc.save();
    doc.moveTo(pageMargin, doc.y).lineTo(pageMargin + contentWidth, doc.y).lineWidth(1).strokeColor('#cbd5e1').stroke();
    doc.restore();
    doc.y += 8;

    review.forEach((item, idx) => {
      const statusText = item.isCorrect ? 'Correct' : 'Incorrect';
      const statusColor = item.isCorrect ? '#166534' : '#991b1b';
      const boxBg = item.isCorrect ? '#f0fdf4' : '#fef2f2';
      const boxBorder = item.isCorrect ? '#86efac' : '#fecaca';

      const qText = `Q${idx + 1}. ${normalizeLine(item.question, 240)}`;
      const yourAnswer = item.selectedIndex >= 0 ? item.options[item.selectedIndex] : 'Not answered';
      const yourText = `Your answer: ${normalizeLine(yourAnswer, 150)}`;
      const correctText = `Correct answer: ${normalizeLine(item.correctAnswer || 'N/A', 150)}`;
      const explanation = normalizeLine(item.explanation, 190);
      const explanationText = explanation ? `Explanation: ${explanation}` : '';

      const textWidth = contentWidth - 20;
      const qHeight = textHeight(9.5, qText, textWidth);
      const yourHeight = textHeight(8.5, yourText, textWidth);
      const correctHeight = textHeight(8.5, correctText, textWidth);
      const statusHeight = textHeight(8.5, `Status: ${statusText}`, textWidth);
      const explanationHeight = explanationText ? textHeight(8, explanationText, textWidth) : 0;
      const rowHeight = 8 + qHeight + 3 + yourHeight + 2 + correctHeight + 2 + statusHeight + (explanationHeight ? (2 + explanationHeight) : 0) + 8;

      ensureSpace(rowHeight + 6);

      const rowY = doc.y;
      doc.save();
      doc.roundedRect(pageMargin, rowY, contentWidth, rowHeight, 8).fillAndStroke(boxBg, boxBorder);
      doc.restore();

      let y = rowY + 6;
      doc.fillColor('#0f172a').fontSize(9.5).text(qText, pageMargin + 10, y, { width: textWidth, align: 'left' });
      y += qHeight + 3;
      doc.fillColor('#334155').fontSize(8.5).text(yourText, pageMargin + 10, y, { width: textWidth, align: 'left' });
      y += yourHeight + 2;
      doc.fillColor('#334155').fontSize(8.5).text(correctText, pageMargin + 10, y, { width: textWidth, align: 'left' });
      y += correctHeight + 2;
      doc.fillColor(statusColor).fontSize(8.5).text(`Status: ${statusText}`, pageMargin + 10, y, { width: textWidth, align: 'left' });
      y += statusHeight;
      if (explanationText) {
        doc.fillColor('#475569').fontSize(8).text(explanationText, pageMargin + 10, y + 2, { width: textWidth, align: 'left' });
      }

      doc.y = rowY + rowHeight + 6;
    });

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      doc.save();
      doc.fontSize(9)
        .fillColor('#64748b')
        .text(`Page ${i - range.start + 1}`, pageMargin, pageMargin - 20, {
          width: contentWidth,
          align: 'right',
          lineBreak: false
        });
      doc.restore();
    }

    doc.end();
  } catch {
    return res.status(500).json({ error: 'Failed to generate result PDF.' });
  }
});

module.exports = router;
