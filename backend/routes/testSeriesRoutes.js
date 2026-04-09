const crypto = require('crypto');
const express = require('express');
const Razorpay = require('razorpay');
const { authenticateToken } = require('../middleware/auth');
const { logAdminAction } = require('../utils/auditLog');
const TestSeriesPricing = require('../models/TestSeriesPricing');
const TopicTest = require('../models/TopicTest');
const FullMockTest = require('../models/FullMockTest');
const TestSeriesPayment = require('../models/TestSeriesPayment');
const User = require('../models/User');

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

// POST /test-series/payment/create-order
router.post('/payment/create-order', authenticateToken('user'), async (req, res) => {
  try {
    const { keyId, client: razorpay, hasConfig } = getRazorpayConfig();
    const user = await User.findOne({ username: req.user.username }, { class: 1 }).lean();
    if (!user?.class) return res.status(404).json({ error: 'Student profile not found.' });
    const course = normalizeCourse(user.class);

    const seriesType = String(req.body?.seriesType || '').trim();
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

    if (originalAmountInPaise <= 0) {
      // Free — grant access immediately
      await TestSeriesPayment.create({
        username: req.user.username,
        course,
        seriesType,
        status: 'paid',
        amountInPaise: 0,
        originalAmountInPaise: 0,
        currency: pricing?.currency || 'INR',
        paidAt: new Date()
      });
      return res.json({ free: true, alreadyOwned: false });
    }

    if (!hasConfig || !razorpay) {
      return res.status(500).json({ error: 'Razorpay is not configured on the server.' });
    }

    const receipt = buildReceipt(course, seriesType);
    const razorpayOrder = await razorpay.orders.create({
      amount: originalAmountInPaise,
      currency: pricing?.currency || 'INR',
      receipt
    });

    await TestSeriesPayment.create({
      username: req.user.username,
      course,
      seriesType,
      status: 'created',
      amountInPaise: originalAmountInPaise,
      originalAmountInPaise,
      currency: pricing?.currency || 'INR',
      razorpayOrderId: razorpayOrder.id
    });

    return res.json({
      razorpayOrder,
      keyId,
      amountInPaise: originalAmountInPaise,
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

    await TestSeriesPayment.findOneAndUpdate(
      { razorpayOrderId, username: req.user.username },
      {
        $set: {
          razorpayPaymentId,
          razorpaySignature,
          status: 'paid',
          paidAt: new Date()
        }
      }
    );

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
