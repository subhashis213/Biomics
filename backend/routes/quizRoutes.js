const express = require('express');
const Quiz = require('../models/Quiz');
const QuizAttempt = require('../models/QuizAttempt');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

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

function validateQuizPayload(payload) {
  if (!payload || typeof payload !== 'object') return 'Invalid quiz payload.';
  const { category, module, title, questions, difficulty, timeLimitMinutes, requireExplanation } = payload;
  if (!category || !module || !title) return 'Category, module and title are required.';
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

// Admin: create or update a module quiz
router.post('/', authenticateToken('admin'), async (req, res) => {
  try {
    const validationError = validateQuizPayload(req.body);
    if (validationError) return res.status(400).json({ error: validationError });

    const category = String(req.body.category).trim();
    const moduleName = String(req.body.module).trim();
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
            module: moduleName,
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
        module: moduleName,
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

// Admin: bulk-delete all quizzes for a category+module
router.delete('/module', authenticateToken('admin'), async (req, res) => {
  const { category, module: moduleName } = req.body;
  if (!category || !moduleName) {
    return res.status(400).json({ error: 'category and module are required' });
  }
  try {
    const normalizedModule = String(moduleName).trim();
    const isGeneralModule = normalizedModule.toLowerCase() === 'general';
    const moduleFilter = isGeneralModule
      ? { $or: [{ module: 'General' }, { module: '' }, { module: null }, { module: { $exists: false } }] }
      : { module: normalizedModule };
    const quizzes = await Quiz.find({ category, ...moduleFilter });
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
    await QuizAttempt.deleteMany({ quizId: deleted._id });
    return res.json({ message: 'Quiz deleted.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete quiz.' });
  }
});

// Admin: list quizzes (optional filters)
router.get('/', authenticateToken('admin'), async (req, res) => {
  try {
    const category = String(req.query.category || '').trim();
    const filter = category ? { category } : {};
    const quizzes = await Quiz.find(filter).sort({ category: 1, module: 1, updatedAt: -1 }).lean();
    return res.json({ quizzes });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch quizzes.' });
  }
});

// Student: list available module quizzes for their course
router.get('/my-course', authenticateToken('user'), async (req, res) => {
  try {
    const user = await User.findOne({ username: req.user.username }, { class: 1, _id: 0 }).lean();
    if (!user?.class) return res.status(404).json({ error: 'Student profile not found.' });

    const quizzes = await Quiz.find(
      { category: user.class },
      { category: 1, module: 1, title: 1, difficulty: 1, requireExplanation: 1, timeLimitMinutes: 1, updatedAt: 1, questions: 1 }
    )
      .sort({ module: 1 })
      .lean();

    return res.json({
      course: user.class,
      quizzes: quizzes.map((quiz) => ({
        _id: quiz._id,
        category: quiz.category,
        module: quiz.module,
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

    const user = await User.findOne({ username: req.user.username }, { class: 1, _id: 0 }).lean();
    if (!user?.class || user.class !== quiz.category) {
      return res.status(403).json({ error: 'You are not authorized for this quiz.' });
    }

    return res.json({
      quiz: {
        _id: quiz._id,
        category: quiz.category,
        module: quiz.module,
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

    const user = await User.findOne({ username: req.user.username }, { class: 1, _id: 0 }).lean();
    if (!user?.class) return res.status(404).json({ error: 'Student profile not found.' });

    const quizList = await Quiz.find({ category: user.class, module: moduleName }).lean();
    if (!quizList.length) return res.status(404).json({ error: 'Quiz not found for this module.' });

    return res.json({
      quizzes: quizList.map((quiz) => ({
        _id: quiz._id,
        category: quiz.category,
        module: quiz.module,
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

    const user = await User.findOne({ username: req.user.username }, { class: 1, _id: 0 }).lean();
    if (!user?.class || user.class !== quiz.category) {
      return res.status(403).json({ error: 'You are not authorized for this quiz.' });
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
    const attempts = await QuizAttempt.find({ username: req.user.username })
      .sort({ submittedAt: -1 })
      .limit(20)
      .lean();
    return res.json({ attempts });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch quiz attempts.' });
  }
});

// Student: leaderboard based on each user's best attempt in their course
router.get('/leaderboard', authenticateToken('user'), async (req, res) => {
  try {
    const user = await User.findOne({ username: req.user.username }, { class: 1, _id: 0 }).lean();
    if (!user?.class) return res.status(404).json({ error: 'Student profile not found.' });

    const moduleFilter = String(req.query.module || '').trim();
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
