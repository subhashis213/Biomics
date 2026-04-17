const crypto = require('crypto');
const express = require('express');
const Razorpay = require('razorpay');
const { authenticateToken } = require('../middleware/auth');
const { logAdminAction } = require('../utils/auditLog');
const TestSeriesPricing = require('../models/TestSeriesPricing');
const TopicTest = require('../models/TopicTest');
const FullMockTest = require('../models/FullMockTest');
const TopicTestAttempt = require('../models/TopicTestAttempt');
const FullMockAttempt = require('../models/FullMockAttempt');
const TestSeriesPayment = require('../models/TestSeriesPayment');
const User = require('../models/User');
const Voucher = require('../models/Voucher');

const router = express.Router();

const SUPPORTED_COURSES = [
  '11th', '12th', 'NEET', 'IIT-JAM', 'CSIR-NET Life Science', 'GATE'
];

const SERIES_TYPES = ['topic_test', 'full_mock'];

// ─── helpers ────────────────────────────────────────────────────────────────

function normalizeCourse(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function getRazorpayConfig() {
  const keyId = String(process.env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET || '').trim();
  const hasConfig = Boolean(keyId && keySecret);
  return {
    keyId,
    keySecret,
    hasConfig,
    client: hasConfig ? new Razorpay({ key_id: keyId, key_secret: keySecret }) : null
  };
}

function buildReceipt(course, seriesType) {
  const c = normalizeCourse(course).replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 10);
  const s = String(seriesType || '').replace(/[^a-z_]/g, '').slice(0, 10);
  return `ts_${c}_${s}_${Date.now()}`.slice(0, 40);
}

/** Check if user has paid (status=paid) for a specific seriesType in their course. */
async function hasTestSeriesAccess(username, course, seriesType) {
  const normalC = normalizeCourse(course);
  const exists = await TestSeriesPayment.findOne({
    username,
    course: normalC,
    seriesType,
    status: 'paid'
  }).lean();
  return Boolean(exists);
}

/**
 * Full access rules:
 *  - 'topic_test' purchase  → access to both topic tests AND full mocks
 *  - 'full_mock' purchase  → access to full mocks only
 */
async function resolveStudentAccess(username, course) {
  const normalC = normalizeCourse(course);
  const payments = await TestSeriesPayment.find({
    username,
    course: normalC,
    status: 'paid'
  }).lean();

  const hasTopicTest = payments.some((p) => p.seriesType === 'topic_test');
  const hasFullMock = payments.some((p) => p.seriesType === 'full_mock' || p.seriesType === 'topic_test');

  return { hasTopicTest, hasFullMock };
}

function validateQuestions(questions) {
  if (!Array.isArray(questions) || questions.length === 0) return 'At least one question is required.';
  for (const item of questions) {
    if (!item.question || !Array.isArray(item.options) || item.options.length !== 4) {
      return 'Each question must include question text and exactly 4 options.';
    }
    if (typeof item.correctIndex !== 'number' || item.correctIndex < 0 || item.correctIndex > 3) {
      return 'Each question must have correctIndex between 0 and 3.';
    }
  }
  return null;
}

function sanitizeQuestions(questions = []) {
  return questions.map((item) => ({
    question: String(item.question).trim(),
    options: item.options.map((opt) => String(opt).trim()),
    correctIndex: Number(item.correctIndex),
    explanation: String(item.explanation || '').trim()
  }));
}

function sanitizeQuestionsForStudent(questions = []) {
  return questions.map((item) => ({
    question: item.question,
    options: item.options,
    explanation: ''   // hide explanation until submitted
  }));
}

function calculatePercentage(score, total) {
  const safeTotal = Number(total || 0);
  if (safeTotal <= 0) return 0;
  return Math.round((Number(score || 0) / safeTotal) * 100);
}

function summarizeAttempts(attempts = []) {
  if (!attempts.length) {
    return {
      attempts: 0,
      averageScore: 0,
      bestScore: 0,
      lastAttemptAt: null
    };
  }

  const percentages = attempts.map((attempt) => calculatePercentage(attempt.score, attempt.total));
  const averageScore = Math.round(percentages.reduce((sum, value) => sum + value, 0) / percentages.length);
  return {
    attempts: attempts.length,
    averageScore,
    bestScore: Math.max(...percentages),
    lastAttemptAt: attempts[0]?.submittedAt || null
  };
}

// ─── Admin: Pricing ──────────────────────────────────────────────────────────

// GET /test-series/pricing/admin — list all courses with pricing
router.get('/pricing/admin', authenticateToken('admin'), async (req, res) => {
  try {
    const docs = await TestSeriesPricing.find().sort({ category: 1 }).lean();
    // Ensure every supported course appears even if no doc yet
    const map = new Map(docs.map((d) => [d.category, d]));
    const pricing = SUPPORTED_COURSES.map((cat) => map.get(cat) || {
      category: cat,
      topicTestPriceInPaise: 0,
      fullMockPriceInPaise: 0,
      currency: 'INR',
      active: true
    });
    return res.json({ pricing });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch test series pricing.' });
  }
});

// POST /test-series/pricing — admin upsert pricing for one course
router.post('/pricing', authenticateToken('admin'), async (req, res) => {
  try {
    const category = normalizeCourse(req.body?.category);
    if (!SUPPORTED_COURSES.includes(category)) {
      return res.status(400).json({ error: 'Invalid course category.' });
    }
    const topicTestPriceInPaise = Math.max(0, Number(req.body?.topicTestPriceInPaise || 0));
    const fullMockPriceInPaise = Math.max(0, Number(req.body?.fullMockPriceInPaise || 0));
    const active = req.body?.active !== false;

    const doc = await TestSeriesPricing.findOneAndUpdate(
      { category },
      {
        $set: { topicTestPriceInPaise, fullMockPriceInPaise, active, updatedBy: req.user.username }
      },
      { upsert: true, new: true }
    ).lean();

    await logAdminAction(req.user.username, 'UPDATE_TEST_SERIES_PRICING',
      `Set ${category} topic_test=${topicTestPriceInPaise} full_mock=${fullMockPriceInPaise}`);
    return res.json({ message: 'Test series pricing saved.', pricing: doc });
  } catch {
    return res.status(500).json({ error: 'Failed to save test series pricing.' });
  }
});

// ─── Admin: Topic Tests ──────────────────────────────────────────────────────

// GET /test-series/topic-tests/admin
router.get('/topic-tests/admin', authenticateToken('admin'), async (req, res) => {
  try {
    const category = normalizeCourse(req.query.category);
    const filter = category ? { category } : {};
    const tests = await TopicTest.find(filter).sort({ category: 1, module: 1, topic: 1 }).lean();
    return res.json({ tests });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch topic tests.' });
  }
});

// POST /test-series/topic-tests — create or update a topic test
router.post('/topic-tests', authenticateToken('admin'), async (req, res) => {
  try {
    const category = normalizeCourse(req.body?.category);
    const module = String(req.body?.module || '').trim();
    const topic = String(req.body?.topic || 'General').trim() || 'General';
    const title = String(req.body?.title || '').trim();
    const difficulty = String(req.body?.difficulty || 'medium').trim();
    const durationMinutes = Number(req.body?.durationMinutes || 30);
    const questions = req.body?.questions;

    if (!category || !module || !title) {
      return res.status(400).json({ error: 'Course, module and title are required.' });
    }
    const qError = validateQuestions(questions);
    if (qError) return res.status(400).json({ error: qError });

    const payload = {
      category,
      module,
      topic,
      title,
      difficulty: ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium',
      durationMinutes: Math.min(300, Math.max(5, durationMinutes)),
      questions: sanitizeQuestions(questions),
      updatedBy: req.user.username,
      updatedAt: new Date()
    };

    const testId = String(req.body?.testId || '').trim();
    let test;
    if (testId) {
      test = await TopicTest.findByIdAndUpdate(testId, { $set: payload }, { new: true });
      if (!test) return res.status(404).json({ error: 'Topic test not found.' });
    } else {
      test = await TopicTest.create(payload);
    }
    await logAdminAction(req.user.username, testId ? 'UPDATE_TOPIC_TEST' : 'CREATE_TOPIC_TEST', `${category}/${module}/${topic}: ${title}`);
    return res.status(201).json({ message: 'Topic test saved.', test });
  } catch {
    return res.status(500).json({ error: 'Failed to save topic test.' });
  }
});

// DELETE /test-series/topic-tests/:testId
router.delete('/topic-tests/:testId', authenticateToken('admin'), async (req, res) => {
  try {
    const test = await TopicTest.findByIdAndDelete(req.params.testId);
    if (!test) return res.status(404).json({ error: 'Topic test not found.' });
    await logAdminAction(req.user.username, 'DELETE_TOPIC_TEST', `Deleted topic test ${req.params.testId}`);
    return res.json({ message: 'Topic test deleted.' });
  } catch {
    return res.status(500).json({ error: 'Failed to delete topic test.' });
  }
});

// ─── Admin: Full Mock Tests ──────────────────────────────────────────────────

// GET /test-series/full-mocks/admin
router.get('/full-mocks/admin', authenticateToken('admin'), async (req, res) => {
  try {
    const category = normalizeCourse(req.query.category);
    const filter = category ? { category } : {};
    const mocks = await FullMockTest.find(filter).sort({ category: 1, updatedAt: -1 }).lean();
    return res.json({ mocks });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch full mock tests.' });
  }
});

// POST /test-series/full-mocks
router.post('/full-mocks', authenticateToken('admin'), async (req, res) => {
  try {
    const category = normalizeCourse(req.body?.category);
    const title = String(req.body?.title || '').trim();
    const description = String(req.body?.description || '').trim();
    const durationMinutes = Number(req.body?.durationMinutes || 90);
    const questions = req.body?.questions;

    if (!category || !title) return res.status(400).json({ error: 'Course and title are required.' });
    const qError = validateQuestions(questions);
    if (qError) return res.status(400).json({ error: qError });

    const payload = {
      category,
      title,
      description,
      durationMinutes: Math.min(300, Math.max(5, durationMinutes)),
      questions: sanitizeQuestions(questions),
      updatedBy: req.user.username,
      updatedAt: new Date()
    };

    const mockId = String(req.body?.mockId || '').trim();
    let mock;
    if (mockId) {
      mock = await FullMockTest.findByIdAndUpdate(mockId, { $set: payload }, { new: true });
      if (!mock) return res.status(404).json({ error: 'Full mock test not found.' });
    } else {
      mock = await FullMockTest.create(payload);
    }
    await logAdminAction(req.user.username, mockId ? 'UPDATE_FULL_MOCK' : 'CREATE_FULL_MOCK', `${category}: ${title}`);
    return res.status(201).json({ message: 'Full mock test saved.', mock });
  } catch {
    return res.status(500).json({ error: 'Failed to save full mock test.' });
  }
});

// DELETE /test-series/full-mocks/:mockId
router.delete('/full-mocks/:mockId', authenticateToken('admin'), async (req, res) => {
  try {
    const mock = await FullMockTest.findByIdAndDelete(req.params.mockId);
    if (!mock) return res.status(404).json({ error: 'Full mock test not found.' });
    await logAdminAction(req.user.username, 'DELETE_FULL_MOCK', `Deleted full mock ${req.params.mockId}`);
    return res.json({ message: 'Full mock test deleted.' });
  } catch {
    return res.status(500).json({ error: 'Failed to delete full mock test.' });
  }
});

// ─── Student: Syllabus Preview (no purchase required) ───────────────────────

// GET /test-series/topic-tests/syllabus — metadata only, visible to any authenticated student
router.get('/topic-tests/syllabus', authenticateToken('user'), async (req, res) => {
  try {
    const user = await User.findOne({ username: req.user.username }, { class: 1 }).lean();
    if (!user?.class) return res.status(404).json({ error: 'Student profile not found.' });
    const course = normalizeCourse(user.class);
    const { hasTopicTest } = await resolveStudentAccess(req.user.username, course);
    const tests = await TopicTest.find({ category: course })
      .sort({ module: 1, topic: 1 })
      .lean();
    const items = tests.map((t) => ({
      _id: t._id,
      module: t.module,
      topic: t.topic,
      title: t.title,
      difficulty: t.difficulty,
      durationMinutes: t.durationMinutes,
      questionCount: t.questions.length
    }));
    return res.json({ items, hasTopicTest, course });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch topic test syllabus.' });
  }
});

// GET /test-series/full-mocks/syllabus — metadata only, visible to any authenticated student
router.get('/full-mocks/syllabus', authenticateToken('user'), async (req, res) => {
  try {
    const user = await User.findOne({ username: req.user.username }, { class: 1 }).lean();
    if (!user?.class) return res.status(404).json({ error: 'Student profile not found.' });
    const course = normalizeCourse(user.class);
    const { hasFullMock } = await resolveStudentAccess(req.user.username, course);
    const mocks = await FullMockTest.find({ category: course })
      .sort({ updatedAt: -1 })
      .lean();
    const items = mocks.map((m) => ({
      _id: m._id,
      title: m.title,
      description: m.description,
      durationMinutes: m.durationMinutes,
      questionCount: m.questions.length
    }));
    return res.json({ items, hasFullMock, course });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch full mock syllabus.' });
  }
});

// ─── Student: Pricing & Access ───────────────────────────────────────────────

// GET /test-series/pricing/student — returns pricing + access status for the student's course
router.get('/pricing/student', authenticateToken('user'), async (req, res) => {
  try {
    const user = await User.findOne({ username: req.user.username }, { class: 1 }).lean();
    if (!user?.class) return res.status(404).json({ error: 'Student profile not found.' });
    const course = normalizeCourse(user.class);
    const pricing = await TestSeriesPricing.findOne({ category: course }).lean();
    const access = await resolveStudentAccess(req.user.username, course);
    return res.json({
      course,
      pricing: {
        topicTestPriceInPaise: pricing?.topicTestPriceInPaise || 0,
        fullMockPriceInPaise: pricing?.fullMockPriceInPaise || 0,
        currency: pricing?.currency || 'INR'
      },
      access
    });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch test series access.' });
  }
});

// ─── Student: Topic Tests ────────────────────────────────────────────────────

// GET /test-series/topic-tests/student — list topic tests for student's course (access check)
router.get('/topic-tests/student', authenticateToken('user'), async (req, res) => {
  try {
    const user = await User.findOne({ username: req.user.username }, { class: 1 }).lean();
    if (!user?.class) return res.status(404).json({ error: 'Student profile not found.' });
    const course = normalizeCourse(user.class);
    const { hasTopicTest } = await resolveStudentAccess(req.user.username, course);
    if (!hasTopicTest) return res.status(403).json({ error: 'Topic Test Series not purchased for this course.' });

    const tests = await TopicTest.find({ category: course })
      .sort({ module: 1, topic: 1 })
      .lean();

    const sanitized = tests.map((t) => ({
      _id: t._id,
      category: t.category,
      module: t.module,
      topic: t.topic,
      title: t.title,
      difficulty: t.difficulty,
      durationMinutes: t.durationMinutes,
      questionCount: t.questions.length
    }));
    return res.json({ tests: sanitized });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch topic tests.' });
  }
});

// GET /test-series/topic-tests/student/:testId — get test questions (access check)
router.get('/topic-tests/student/:testId', authenticateToken('user'), async (req, res) => {
  try {
    const user = await User.findOne({ username: req.user.username }, { class: 1 }).lean();
    if (!user?.class) return res.status(404).json({ error: 'Student profile not found.' });
    const course = normalizeCourse(user.class);
    const { hasTopicTest } = await resolveStudentAccess(req.user.username, course);
    if (!hasTopicTest) return res.status(403).json({ error: 'Topic Test Series not purchased.' });

    const test = await TopicTest.findById(req.params.testId).lean();
    if (!test || normalizeCourse(test.category) !== course) {
      return res.status(404).json({ error: 'Topic test not found.' });
    }
    return res.json({
      _id: test._id,
      category: test.category,
      module: test.module,
      topic: test.topic,
      title: test.title,
      difficulty: test.difficulty,
      durationMinutes: test.durationMinutes,
      questions: sanitizeQuestionsForStudent(test.questions)
    });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch topic test.' });
  }
});

// POST /test-series/topic-tests/student/:testId/submit — submit answers, get results
router.post('/topic-tests/student/:testId/submit', authenticateToken('user'), async (req, res) => {
  try {
    const user = await User.findOne({ username: req.user.username }, { class: 1 }).lean();
    if (!user?.class) return res.status(404).json({ error: 'Student profile not found.' });
    const course = normalizeCourse(user.class);
    const { hasTopicTest } = await resolveStudentAccess(req.user.username, course);
    if (!hasTopicTest) return res.status(403).json({ error: 'Topic Test Series not purchased.' });

    const test = await TopicTest.findById(req.params.testId).lean();
    if (!test || normalizeCourse(test.category) !== course) {
      return res.status(404).json({ error: 'Topic test not found.' });
    }

    const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
    let score = 0;
    const review = test.questions.map((q, i) => {
      const correctIndex = Number(q.correctIndex);
      const selectedIndex = Number.isInteger(Number(answers[i])) && Number(answers[i]) >= 0 ? Number(answers[i]) : -1;
      const isCorrect = selectedIndex === correctIndex;
      if (isCorrect) score += 1;
      return {
        question: q.question,
        options: q.options,
        selectedIndex,
        correctIndex,
        isCorrect,
        explanation: q.explanation || ''
      };
    });

    const durationSeconds = Number.isFinite(Number(req.body?.durationSeconds)) ? Math.max(0, Number(req.body.durationSeconds)) : 0;

    await TopicTestAttempt.create({
      testId: test._id,
      username: req.user.username,
      category: test.category,
      module: test.module,
      topic: test.topic,
      title: test.title,
      score,
      total: test.questions.length,
      durationSeconds
    }).catch(() => { /* non-fatal — don't block result delivery */ });

    return res.json({
      score,
      total: test.questions.length,
      percentage: Math.round((score / test.questions.length) * 100),
      review
    });
  } catch {
    return res.status(500).json({ error: 'Failed to submit topic test.' });
  }
});

// ─── Student: Full Mock Tests ────────────────────────────────────────────────

// GET /test-series/full-mocks/student
router.get('/full-mocks/student', authenticateToken('user'), async (req, res) => {
  try {
    const user = await User.findOne({ username: req.user.username }, { class: 1 }).lean();
    if (!user?.class) return res.status(404).json({ error: 'Student profile not found.' });
    const course = normalizeCourse(user.class);
    const { hasFullMock } = await resolveStudentAccess(req.user.username, course);
    if (!hasFullMock) return res.status(403).json({ error: 'Full Mock Test Series not purchased for this course.' });

    const mocks = await FullMockTest.find({ category: course })
      .sort({ updatedAt: -1 })
      .lean();

    const sanitized = mocks.map((m) => ({
      _id: m._id,
      category: m.category,
      title: m.title,
      description: m.description,
      durationMinutes: m.durationMinutes,
      questionCount: m.questions.length
    }));
    return res.json({ mocks: sanitized });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch full mock tests.' });
  }
});

// GET /test-series/full-mocks/student/:mockId
router.get('/full-mocks/student/:mockId', authenticateToken('user'), async (req, res) => {
  try {
    const user = await User.findOne({ username: req.user.username }, { class: 1 }).lean();
    if (!user?.class) return res.status(404).json({ error: 'Student profile not found.' });
    const course = normalizeCourse(user.class);
    const { hasFullMock } = await resolveStudentAccess(req.user.username, course);
    if (!hasFullMock) return res.status(403).json({ error: 'Full Mock Test Series not purchased.' });

    const mock = await FullMockTest.findById(req.params.mockId).lean();
    if (!mock || normalizeCourse(mock.category) !== course) {
      return res.status(404).json({ error: 'Full mock test not found.' });
    }
    return res.json({
      _id: mock._id,
      category: mock.category,
      title: mock.title,
      description: mock.description,
      durationMinutes: mock.durationMinutes,
      questions: sanitizeQuestionsForStudent(mock.questions)
    });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch full mock test.' });
  }
});

// POST /test-series/full-mocks/student/:mockId/submit
router.post('/full-mocks/student/:mockId/submit', authenticateToken('user'), async (req, res) => {
  try {
    const user = await User.findOne({ username: req.user.username }, { class: 1 }).lean();
    if (!user?.class) return res.status(404).json({ error: 'Student profile not found.' });
    const course = normalizeCourse(user.class);
    const { hasFullMock } = await resolveStudentAccess(req.user.username, course);
    if (!hasFullMock) return res.status(403).json({ error: 'Full Mock Test Series not purchased.' });

    const mock = await FullMockTest.findById(req.params.mockId).lean();
    if (!mock || normalizeCourse(mock.category) !== course) {
      return res.status(404).json({ error: 'Full mock test not found.' });
    }

    const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
    let score = 0;
    const review = mock.questions.map((q, i) => {
      const correctIndex = Number(q.correctIndex);
      const selectedIndex = Number.isInteger(Number(answers[i])) && Number(answers[i]) >= 0 ? Number(answers[i]) : -1;
      const isCorrect = selectedIndex === correctIndex;
      if (isCorrect) score += 1;
      return {
        question: q.question,
        options: q.options,
        selectedIndex,
        correctIndex,
        isCorrect,
        explanation: q.explanation || ''
      };
    });

    const durationSeconds = Number.isFinite(Number(req.body?.durationSeconds)) ? Math.max(0, Number(req.body.durationSeconds)) : 0;

    await FullMockAttempt.create({
      mockId: mock._id,
      username: req.user.username,
      category: mock.category,
      title: mock.title,
      score,
      total: mock.questions.length,
      durationSeconds
    }).catch(() => { /* non-fatal — don't block result delivery */ });

    return res.json({
      score,
      total: mock.questions.length,
      percentage: Math.round((score / mock.questions.length) * 100),
      review
    });
  } catch {
    return res.status(500).json({ error: 'Failed to submit full mock test.' });
  }
});

// GET /test-series/performance/student
router.get('/performance/student', authenticateToken('user'), async (req, res) => {
  try {
    const user = await User.findOne({ username: req.user.username }, { class: 1 }).lean();
    if (!user?.class) return res.status(404).json({ error: 'Student profile not found.' });

    const course = normalizeCourse(user.class);
    const access = await resolveStudentAccess(req.user.username, course);

    const [topicAttempts, fullMockAttempts] = await Promise.all([
      access.hasTopicTest
        ? TopicTestAttempt.find({ username: req.user.username, category: course }).sort({ submittedAt: -1 }).lean()
        : Promise.resolve([]),
      access.hasFullMock
        ? FullMockAttempt.find({ username: req.user.username, category: course }).sort({ submittedAt: -1 }).lean()
        : Promise.resolve([])
    ]);

    const modulePerformanceMap = new Map();
    const topicKeys = new Set();

    topicAttempts.forEach((attempt) => {
      const moduleName = String(attempt.module || 'General').trim() || 'General';
      const topicName = String(attempt.topic || 'General').trim() || 'General';
      const percentage = calculatePercentage(attempt.score, attempt.total);
      const moduleKey = moduleName.toLowerCase();
      const topicKey = `${moduleKey}::${topicName.toLowerCase()}`;
      topicKeys.add(topicKey);

      if (!modulePerformanceMap.has(moduleKey)) {
        modulePerformanceMap.set(moduleKey, {
          module: moduleName,
          attempts: 0,
          totalPct: 0,
          bestScore: 0,
          lastAttemptAt: null,
          topics: new Map()
        });
      }

      const moduleEntry = modulePerformanceMap.get(moduleKey);
      moduleEntry.attempts += 1;
      moduleEntry.totalPct += percentage;
      moduleEntry.bestScore = Math.max(moduleEntry.bestScore, percentage);
      if (!moduleEntry.lastAttemptAt || new Date(attempt.submittedAt) > new Date(moduleEntry.lastAttemptAt)) {
        moduleEntry.lastAttemptAt = attempt.submittedAt;
      }

      if (!moduleEntry.topics.has(topicKey)) {
        moduleEntry.topics.set(topicKey, {
          topic: topicName,
          attempts: 0,
          totalPct: 0,
          bestScore: 0,
          lastAttemptAt: null
        });
      }

      const topicEntry = moduleEntry.topics.get(topicKey);
      topicEntry.attempts += 1;
      topicEntry.totalPct += percentage;
      topicEntry.bestScore = Math.max(topicEntry.bestScore, percentage);
      if (!topicEntry.lastAttemptAt || new Date(attempt.submittedAt) > new Date(topicEntry.lastAttemptAt)) {
        topicEntry.lastAttemptAt = attempt.submittedAt;
      }
    });

    const modulePerformance = Array.from(modulePerformanceMap.values())
      .map((moduleEntry) => ({
        module: moduleEntry.module,
        attempts: moduleEntry.attempts,
        averageScore: moduleEntry.attempts ? Math.round(moduleEntry.totalPct / moduleEntry.attempts) : 0,
        bestScore: moduleEntry.bestScore,
        lastAttemptAt: moduleEntry.lastAttemptAt,
        topics: Array.from(moduleEntry.topics.values())
          .map((topicEntry) => ({
            topic: topicEntry.topic,
            attempts: topicEntry.attempts,
            averageScore: topicEntry.attempts ? Math.round(topicEntry.totalPct / topicEntry.attempts) : 0,
            bestScore: topicEntry.bestScore,
            lastAttemptAt: topicEntry.lastAttemptAt
          }))
          .sort((left, right) => {
            if (right.averageScore !== left.averageScore) return right.averageScore - left.averageScore;
            return left.topic.localeCompare(right.topic);
          })
      }))
      .sort((left, right) => {
        if (right.averageScore !== left.averageScore) return right.averageScore - left.averageScore;
        return left.module.localeCompare(right.module);
      });

    const fullMockPerformanceMap = new Map();
    fullMockAttempts.forEach((attempt) => {
      const mockTitle = String(attempt.title || 'Full Mock Test').trim() || 'Full Mock Test';
      const mockKey = mockTitle.toLowerCase();
      const percentage = calculatePercentage(attempt.score, attempt.total);

      if (!fullMockPerformanceMap.has(mockKey)) {
        fullMockPerformanceMap.set(mockKey, {
          title: mockTitle,
          attempts: 0,
          totalPct: 0,
          bestScore: 0,
          lastAttemptAt: null
        });
      }

      const mockEntry = fullMockPerformanceMap.get(mockKey);
      mockEntry.attempts += 1;
      mockEntry.totalPct += percentage;
      mockEntry.bestScore = Math.max(mockEntry.bestScore, percentage);
      if (!mockEntry.lastAttemptAt || new Date(attempt.submittedAt) > new Date(mockEntry.lastAttemptAt)) {
        mockEntry.lastAttemptAt = attempt.submittedAt;
      }
    });

    const fullMockPerformance = Array.from(fullMockPerformanceMap.values())
      .map((entry) => ({
        title: entry.title,
        attempts: entry.attempts,
        averageScore: entry.attempts ? Math.round(entry.totalPct / entry.attempts) : 0,
        bestScore: entry.bestScore,
        lastAttemptAt: entry.lastAttemptAt
      }))
      .sort((left, right) => {
        if (right.bestScore !== left.bestScore) return right.bestScore - left.bestScore;
        return left.title.localeCompare(right.title);
      });

    return res.json({
      course,
      access,
      summary: {
        topicTests: {
          ...summarizeAttempts(topicAttempts),
          modulesCovered: modulePerformance.length,
          topicsCovered: topicKeys.size
        },
        fullMocks: summarizeAttempts(fullMockAttempts)
      },
      modulePerformance,
      fullMockPerformance,
      recentTopicAttempts: topicAttempts.slice(0, 8).map((attempt) => ({
        _id: attempt._id,
        title: attempt.title,
        module: attempt.module,
        topic: attempt.topic,
        score: attempt.score,
        total: attempt.total,
        percentage: calculatePercentage(attempt.score, attempt.total),
        submittedAt: attempt.submittedAt
      })),
      recentFullMockAttempts: fullMockAttempts.slice(0, 8).map((attempt) => ({
        _id: attempt._id,
        title: attempt.title,
        score: attempt.score,
        total: attempt.total,
        percentage: calculatePercentage(attempt.score, attempt.total),
        submittedAt: attempt.submittedAt
      }))
    });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch test series performance.' });
  }
});

// ─── Payment: Preview ────────────────────────────────────────────────────────

// GET /test-series/payment/preview?seriesType=topic_test|full_mock
router.get('/payment/preview', authenticateToken('user'), async (req, res) => {
  try {
    const user = await User.findOne({ username: req.user.username }, { class: 1 }).lean();
    if (!user?.class) return res.status(404).json({ error: 'Student profile not found.' });
    const course = normalizeCourse(user.class);

    const seriesType = String(req.query.seriesType || '').trim();
    if (!SERIES_TYPES.includes(seriesType)) {
      return res.status(400).json({ error: 'seriesType must be topic_test or full_mock.' });
    }

    const access = await resolveStudentAccess(req.user.username, course);
    const alreadyOwned = seriesType === 'topic_test' ? access.hasTopicTest
      : access.hasFullMock;

    if (alreadyOwned) {
      return res.json({ alreadyOwned: true, course, seriesType });
    }

    const pricing = await TestSeriesPricing.findOne({ category: course }).lean();
    const priceKey = seriesType === 'topic_test' ? 'topicTestPriceInPaise' : 'fullMockPriceInPaise';
    const amountInPaise = Math.max(0, Number(pricing?.[priceKey] || 0));

    return res.json({
      alreadyOwned: false,
      course,
      seriesType,
      amountInPaise,
      currency: pricing?.currency || 'INR'
    });
  } catch {
    return res.status(500).json({ error: 'Failed to preview test series payment.' });
  }
});

// POST /test-series/payment/preview-voucher
router.post('/payment/preview-voucher', authenticateToken('user'), async (req, res) => {
  try {
    const user = await User.findOne({ username: req.user.username }, { class: 1 }).lean();
    if (!user?.class) return res.status(404).json({ error: 'Student profile not found.' });
    const course = normalizeCourse(user.class);

    const seriesType = String(req.body?.seriesType || '').trim();
    const voucherCode = String(req.body?.voucherCode || '').trim().toUpperCase();

    if (!SERIES_TYPES.includes(seriesType)) {
      return res.status(400).json({ error: 'seriesType must be topic_test or full_mock.' });
    }
    if (!voucherCode) {
      return res.status(400).json({ error: 'Voucher code is required.' });
    }

    const pricing = await TestSeriesPricing.findOne({ category: course }).lean();
    const priceKey = seriesType === 'topic_test' ? 'topicTestPriceInPaise' : 'fullMockPriceInPaise';
    const originalAmountInPaise = Math.max(0, Number(pricing?.[priceKey] || 0));

    const voucher = await Voucher.findOne({ code: voucherCode }).lean();
    if (!voucher || !voucher.active) {
      return res.status(400).json({ error: 'Invalid or inactive voucher code.' });
    }

    // Check expiry & usage limit
    const now = Date.now();
    if (voucher.validUntil && new Date(voucher.validUntil).getTime() < now) {
      return res.status(400).json({ error: 'This voucher has expired.' });
    }
    if (voucher.validFrom && new Date(voucher.validFrom).getTime() > now) {
      return res.status(400).json({ error: 'This voucher is not yet active.' });
    }
    if (Number.isFinite(voucher.usageLimit) && voucher.usageLimit > 0 && voucher.usedCount >= voucher.usageLimit) {
      return res.status(400).json({ error: 'This voucher has reached its usage limit.' });
    }

    // Check if voucher is applicable to test series
    const hasTestSeriesRestriction = Array.isArray(voucher.applicableTestSeries) && voucher.applicableTestSeries.length > 0;
    if (hasTestSeriesRestriction && !voucher.applicableTestSeries.includes(seriesType)) {
      return res.status(400).json({ error: 'This voucher is not applicable for this test series type.' });
    }

    // Check course restriction
    if (Array.isArray(voucher.applicableCourses) && voucher.applicableCourses.length > 0) {
      const normalizedCourse = normalizeCourse(course);
      const applicable = voucher.applicableCourses.some(
        (c) => normalizeCourse(c) === normalizedCourse
      );
      if (!applicable) {
        return res.status(400).json({ error: 'This voucher is not applicable for your course.' });
      }
    }

    // Compute discount
    let discountInPaise = 0;
    if (voucher.discountType === 'percent') {
      discountInPaise = Math.floor((originalAmountInPaise * Math.max(0, Number(voucher.discountValue || 0))) / 100);
    } else {
      discountInPaise = Math.floor(Math.max(0, Number(voucher.discountValue || 0)));
    }
    if (Number.isFinite(voucher.maxDiscountInPaise) && voucher.maxDiscountInPaise > 0) {
      discountInPaise = Math.min(discountInPaise, Math.floor(voucher.maxDiscountInPaise));
    }
    discountInPaise = Math.max(0, Math.min(originalAmountInPaise, discountInPaise));
    const finalAmountInPaise = Math.max(0, originalAmountInPaise - discountInPaise);

    return res.json({
      valid: true,
      originalAmountInPaise,
      discountInPaise,
      finalAmountInPaise,
      currency: pricing?.currency || 'INR',
      voucherCode: voucher.code,
      description: voucher.description || ''
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Failed to preview voucher.' });
  }
});

// POST /test-series/payment/create-order
router.post('/payment/create-order', authenticateToken('user'), async (req, res) => {
  try {
    const { keyId, client: razorpay, hasConfig } = getRazorpayConfig();
    const user = await User.findOne({ username: req.user.username }, { class: 1 }).lean();
    if (!user?.class) return res.status(404).json({ error: 'Student profile not found.' });
    const course = normalizeCourse(user.class);

    const seriesType = String(req.body?.seriesType || '').trim();
    const voucherCode = String(req.body?.voucherCode || '').trim().toUpperCase();
    if (!SERIES_TYPES.includes(seriesType)) {
      return res.status(400).json({ error: 'seriesType must be topic_test or full_mock.' });
    }

    const access = await resolveStudentAccess(req.user.username, course);
    const alreadyOwned = seriesType === 'topic_test' ? access.hasTopicTest : access.hasFullMock;
    if (alreadyOwned) {
      return res.json({ alreadyOwned: true, message: 'Already purchased.' });
    }

    const pricing = await TestSeriesPricing.findOne({ category: course }).lean();
    const priceKey = seriesType === 'topic_test' ? 'topicTestPriceInPaise' : 'fullMockPriceInPaise';
    const originalAmountInPaise = Math.max(0, Number(pricing?.[priceKey] || 0));

    // Apply voucher discount if provided
    let discountInPaise = 0;
    let appliedVoucherId = null;
    if (voucherCode && originalAmountInPaise > 0) {
      const voucher = await Voucher.findOne({ code: voucherCode, active: true }).lean();
      if (voucher) {
        const now = Date.now();
        const notExpired = !voucher.validUntil || new Date(voucher.validUntil).getTime() >= now;
        const notBeforeStart = !voucher.validFrom || new Date(voucher.validFrom).getTime() <= now;
        const withinLimit = !Number.isFinite(voucher.usageLimit) || voucher.usageLimit <= 0 || voucher.usedCount < voucher.usageLimit;
        const tsApplicable = !Array.isArray(voucher.applicableTestSeries) || voucher.applicableTestSeries.length === 0 || voucher.applicableTestSeries.includes(seriesType);
        const courseApplicable = !Array.isArray(voucher.applicableCourses) || voucher.applicableCourses.length === 0 || voucher.applicableCourses.some((c) => normalizeCourse(c) === course);
        if (notExpired && notBeforeStart && withinLimit && tsApplicable && courseApplicable) {
          if (voucher.discountType === 'percent') {
            discountInPaise = Math.floor((originalAmountInPaise * Math.max(0, Number(voucher.discountValue || 0))) / 100);
          } else {
            discountInPaise = Math.floor(Math.max(0, Number(voucher.discountValue || 0)));
          }
          if (Number.isFinite(voucher.maxDiscountInPaise) && voucher.maxDiscountInPaise > 0) {
            discountInPaise = Math.min(discountInPaise, Math.floor(voucher.maxDiscountInPaise));
          }
          discountInPaise = Math.max(0, Math.min(originalAmountInPaise, discountInPaise));
          appliedVoucherId = voucher._id;
        }
      }
    }
    const finalAmountInPaise = Math.max(0, originalAmountInPaise - discountInPaise);

    if (originalAmountInPaise <= 0 || finalAmountInPaise <= 0) {
      // Free or fully discounted — grant access immediately
      await TestSeriesPayment.create({
        username: req.user.username,
        course,
        seriesType,
        status: 'paid',
        amountInPaise: 0,
        originalAmountInPaise,
        discountInPaise,
        voucherCode: voucherCode || null,
        currency: pricing?.currency || 'INR',
        paidAt: new Date()
      });
      if (appliedVoucherId) {
        await Voucher.findByIdAndUpdate(appliedVoucherId, { $inc: { usedCount: 1 } });
      }
      return res.json({ free: true, alreadyOwned: false });
    }

    if (!hasConfig || !razorpay) {
      return res.status(500).json({ error: 'Razorpay is not configured on the server.' });
    }

    const receipt = buildReceipt(course, seriesType);
    const razorpayOrder = await razorpay.orders.create({
      amount: finalAmountInPaise,
      currency: pricing?.currency || 'INR',
      receipt
    });

    await TestSeriesPayment.create({
      username: req.user.username,
      course,
      seriesType,
      status: 'created',
      amountInPaise: finalAmountInPaise,
      originalAmountInPaise,
      discountInPaise,
      voucherCode: voucherCode || null,
      appliedVoucherId: appliedVoucherId || null,
      currency: pricing?.currency || 'INR',
      razorpayOrderId: razorpayOrder.id
    });

    return res.json({
      razorpayOrder,
      keyId,
      amountInPaise: finalAmountInPaise,
      originalAmountInPaise,
      discountInPaise,
      currency: pricing?.currency || 'INR',
      seriesType,
      course
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Failed to create test series order.' });
  }
});

// POST /test-series/payment/verify
router.post('/payment/verify', authenticateToken('user'), async (req, res) => {
  try {
    const { keySecret } = getRazorpayConfig();
    if (!keySecret) return res.status(500).json({ error: 'Payment verification not configured.' });

    const {
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      seriesType,
      course: reqCourse
    } = req.body || {};

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({ error: 'Payment details are incomplete.' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (expectedSignature !== razorpaySignature) {
      return res.status(400).json({ error: 'Payment verification failed. Invalid signature.' });
    }

    const user = await User.findOne({ username: req.user.username }, { class: 1 }).lean();
    if (!user?.class) return res.status(404).json({ error: 'Student profile not found.' });
    const course = normalizeCourse(user.class);

    const paymentRecord = await TestSeriesPayment.findOneAndUpdate(
      { razorpayOrderId, username: req.user.username },
      {
        $set: {
          razorpayPaymentId,
          razorpaySignature,
          status: 'paid',
          paidAt: new Date()
        }
      },
      { new: false }
    );

    // Increment voucher usage count if a voucher was applied
    if (paymentRecord?.appliedVoucherId) {
      await Voucher.findByIdAndUpdate(paymentRecord.appliedVoucherId, { $inc: { usedCount: 1 } });
    }

    // Also mark the complementary full_mock if topic_test was purchased,
    // by checking it is not already an independent record.
    const resolvedType = String(seriesType || reqCourse || '');
    if (resolvedType === 'topic_test') {
      const existingFullMock = await TestSeriesPayment.findOne({
        username: req.user.username,
        course,
        seriesType: 'full_mock',
        status: 'paid'
      });
      if (!existingFullMock) {
        // Complementary full_mock granted at no charge
        await TestSeriesPayment.create({
          username: req.user.username,
          course,
          seriesType: 'full_mock',
          status: 'paid',
          amountInPaise: 0,
          originalAmountInPaise: 0,
          currency: 'INR',
          paidAt: new Date()
        });
      }
    }

    return res.json({ success: true, message: 'Payment verified. Test series unlocked.' });
  } catch {
    return res.status(500).json({ error: 'Failed to verify test series payment.' });
  }
});

module.exports = router;
