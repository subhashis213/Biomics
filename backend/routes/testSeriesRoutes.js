const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const Razorpay = require('razorpay');
const { v2: cloudinary } = require('cloudinary');
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
const Course = require('../models/Course');

const router = express.Router();
const uploadsDir = path.join(__dirname, '../uploads');

const cloudinaryCloudName = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
const cloudinaryApiKey = String(process.env.CLOUDINARY_API_KEY || '').trim();
const cloudinaryApiSecret = String(process.env.CLOUDINARY_API_SECRET || '').trim();
const hasCloudinaryConfig = !!(cloudinaryCloudName && cloudinaryApiKey && cloudinaryApiSecret);

if (hasCloudinaryConfig) {
  cloudinary.config({
    cloud_name: cloudinaryCloudName,
    api_key: cloudinaryApiKey,
    api_secret: cloudinaryApiSecret,
    secure: true
  });
}

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const questionImageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeBase = path.basename(file.originalname || 'question-image', ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `test-series-question-${Date.now()}-${safeBase}${ext || '.png'}`);
  }
});

const questionImageUpload = multer({
  storage: questionImageStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if ((file.mimetype || '').startsWith('image/')) return cb(null, true);
    return cb(new Error('Only image files are allowed for question images.'));
  }
});

const testSeriesThumbnailStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeBase = path.basename(file.originalname || 'test-series-thumbnail', ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `test-series-thumbnail-${Date.now()}-${safeBase}${ext || '.png'}`);
  }
});

const testSeriesThumbnailUpload = multer({
  storage: testSeriesThumbnailStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if ((file.mimetype || '').startsWith('image/')) return cb(null, true);
    return cb(new Error('Only image files are allowed for test series thumbnails.'));
  }
});

const LEGACY_SUPPORTED_COURSES = [
  '11th', '12th', 'NEET', 'GAT-B', 'IIT-JAM', 'CSIR-NET Life Science', 'GATE'
];

const SERIES_TYPES = ['topic_test', 'full_mock'];
const DEFAULT_TEST_SERIES_VALIDITY_DAYS = 60;

// ─── helpers ────────────────────────────────────────────────────────────────

function normalizeCourse(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

async function getSupportedCourses() {
  const docs = await Course.find({}).sort({ name: 1 }).lean();
  const names = docs
    .filter((entry) => (
      entry
      && entry.archived !== true
      && entry.active !== false
      && entry.isDeleted !== true
      && !entry.deletedAt
    ))
    .map((entry) => normalizeCourse(entry?.name))
    .filter(Boolean);

  if (names.length) return names;
  return docs.length ? [] : LEGACY_SUPPORTED_COURSES;
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

function addDays(baseDate, days) {
  const next = new Date(baseDate);
  next.setDate(next.getDate() + Math.max(1, Number(days || DEFAULT_TEST_SERIES_VALIDITY_DAYS)));
  return next;
}

function resolvePaidAtDate(paymentDoc = {}) {
  const paidAt = paymentDoc?.paidAt ? new Date(paymentDoc.paidAt) : null;
  if (paidAt && !Number.isNaN(paidAt.getTime())) return paidAt;
  const createdAt = paymentDoc?.createdAt ? new Date(paymentDoc.createdAt) : null;
  if (createdAt && !Number.isNaN(createdAt.getTime())) return createdAt;
  return null;
}

function resolvePaymentExpiryDate(paymentDoc = {}) {
  const explicit = paymentDoc?.expiresAt ? new Date(paymentDoc.expiresAt) : null;
  if (explicit && !Number.isNaN(explicit.getTime())) return explicit;
  const paidAt = resolvePaidAtDate(paymentDoc);
  if (!paidAt) return null;
  const fallbackDays = Math.max(1, Number(paymentDoc?.validityDays || DEFAULT_TEST_SERIES_VALIDITY_DAYS));
  return addDays(paidAt, fallbackDays);
}

function computeActiveValidityWindow(payments = [], now = new Date()) {
  let latestActiveUntil = null;
  let latestExpiredUntil = null;

  payments.forEach((payment) => {
    const validUntil = resolvePaymentExpiryDate(payment);
    if (!validUntil) return;
    if (validUntil.getTime() >= now.getTime()) {
      if (!latestActiveUntil || validUntil > latestActiveUntil) latestActiveUntil = validUntil;
      return;
    }
    if (!latestExpiredUntil || validUntil > latestExpiredUntil) latestExpiredUntil = validUntil;
  });

  return {
    hasActive: Boolean(latestActiveUntil),
    activeValidUntil: latestActiveUntil ? latestActiveUntil.toISOString() : null,
    latestExpiredAt: latestExpiredUntil ? latestExpiredUntil.toISOString() : null,
    hadAnyPurchase: payments.length > 0
  };
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

  const now = new Date();
  const topicPayments = payments.filter((p) => p.seriesType === 'topic_test');
  const fullMockSourcePayments = payments.filter((p) => p.seriesType === 'full_mock' || p.seriesType === 'topic_test');

  const topicWindow = computeActiveValidityWindow(topicPayments, now);
  const fullMockWindow = computeActiveValidityWindow(fullMockSourcePayments, now);

  const hasTopicTest = topicWindow.hasActive;
  const hasFullMock = fullMockWindow.hasActive;

  return {
    hasTopicTest,
    hasFullMock,
    topicValidUntil: topicWindow.activeValidUntil,
    fullMockValidUntil: fullMockWindow.activeValidUntil,
    topicExpired: !hasTopicTest && topicWindow.hadAnyPurchase,
    fullMockExpired: !hasFullMock && fullMockWindow.hadAnyPurchase,
    topicLastExpiredAt: topicWindow.latestExpiredAt,
    fullMockLastExpiredAt: fullMockWindow.latestExpiredAt,
    anyExpired: (!hasTopicTest && topicWindow.hadAnyPurchase) || (!hasFullMock && fullMockWindow.hadAnyPurchase)
  };
}

function normalizeValidityDays(value, fallback = DEFAULT_TEST_SERIES_VALIDITY_DAYS) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(3650, Math.floor(parsed)));
}

function getSeriesValidityDays(pricing, seriesType) {
  if (seriesType === 'topic_test') {
    return normalizeValidityDays(pricing?.topicTestValidityDays, DEFAULT_TEST_SERIES_VALIDITY_DAYS);
  }
  return normalizeValidityDays(pricing?.fullMockValidityDays, DEFAULT_TEST_SERIES_VALIDITY_DAYS);
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

function normalizeQuestionImage(item = {}) {
  return {
    imageUrl: String(item.imageUrl || '').trim(),
    imageName: String(item.imageName || '').trim()
  };
}

function sanitizeQuestions(questions = []) {
  return questions.map((item) => ({
    question: String(item.question).trim(),
    ...normalizeQuestionImage(item),
    options: item.options.map((opt) => String(opt).trim()),
    correctIndex: Number(item.correctIndex),
    explanation: String(item.explanation || '').trim()
  }));
}

function sanitizeQuestionsForStudent(questions = []) {
  return questions.map((item) => ({
    question: item.question,
    ...normalizeQuestionImage(item),
    options: item.options,
    explanation: ''   // hide explanation until submitted
  }));
}

function buildTopicTestSignature(testLike = {}) {
  const normalizedQuestions = Array.isArray(testLike.questions)
    ? testLike.questions.map((item) => ({
        question: String(item?.question || '').trim(),
        imageUrl: String(item?.imageUrl || '').trim(),
        imageName: String(item?.imageName || '').trim(),
        options: Array.isArray(item?.options) ? item.options.map((opt) => String(opt || '').trim()) : [],
        correctIndex: Number(item?.correctIndex ?? -1),
        explanation: String(item?.explanation || '').trim()
      }))
    : [];

  return JSON.stringify({
    category: normalizeCourse(testLike.category),
    title: String(testLike.title || '').trim(),
    difficulty: String(testLike.difficulty || 'medium').trim(),
    durationMinutes: Number(testLike.durationMinutes || 0),
    questions: normalizedQuestions
  });
}

function calculatePercentage(score, total) {
  const safeTotal = Number(total || 0);
  if (safeTotal <= 0) return 0;
  return Math.round((Number(score || 0) / safeTotal) * 100);
}

function safelyRemoveFile(filePath) {
  if (!filePath) return;
  try {
    fs.rmSync(filePath, { force: true });
  } catch (_) {
    // Non-fatal cleanup error.
  }
}

async function uploadQuestionImageToCloudinary(localPath) {
  if (!hasCloudinaryConfig) return null;
  if (!localPath) throw new Error('Question image upload path is missing.');

  const uploadResult = await cloudinary.uploader.upload(localPath, {
    folder: 'biomicshub/test-series-questions',
    resource_type: 'image',
    overwrite: true
  });

  return {
    url: String(uploadResult?.secure_url || '').trim(),
    publicId: String(uploadResult?.public_id || '').trim()
  };
}

async function uploadTestSeriesThumbnailToCloudinary(localPath) {
  if (!hasCloudinaryConfig) return null;
  if (!localPath) throw new Error('Test series thumbnail upload path is missing.');

  const uploadResult = await cloudinary.uploader.upload(localPath, {
    folder: 'biomicshub/test-series-thumbnails',
    resource_type: 'image',
    overwrite: true
  });

  return {
    url: String(uploadResult?.secure_url || '').trim(),
    publicId: String(uploadResult?.public_id || '').trim()
  };
}

function resolveTargetCourse(userCourse, requestedCourse, supportedCourses = []) {
  const normalizedUserCourse = normalizeCourse(userCourse);
  const normalizedRequestedCourse = normalizeCourse(requestedCourse);
  if (normalizedRequestedCourse && supportedCourses.includes(normalizedRequestedCourse)) {
    return normalizedRequestedCourse;
  }
  return normalizedUserCourse;
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

router.post('/question-image', authenticateToken('admin'), (req, res) => {
  questionImageUpload.single('image')(req, res, async (uploadError) => {
    try {
      if (uploadError instanceof multer.MulterError && uploadError.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Question image must be 8 MB or smaller.' });
      }
      if (uploadError) {
        return res.status(400).json({ error: uploadError.message || 'Failed to upload question image.' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'Question image is required.' });
      }

      let imageUrl = `/uploads/${encodeURIComponent(req.file.filename)}`;
      if (hasCloudinaryConfig) {
        const uploadedImage = await uploadQuestionImageToCloudinary(req.file.path);
        if (!uploadedImage?.url) {
          safelyRemoveFile(req.file.path);
          return res.status(500).json({ error: 'Cloud question image upload failed.' });
        }
        imageUrl = uploadedImage.url;
        safelyRemoveFile(req.file.path);
      }

      return res.status(201).json({
        message: 'Question image uploaded.',
        imageUrl,
        imageName: String(req.file.originalname || req.file.filename || '').trim()
      });
    } catch {
      if (req.file?.path) {
        safelyRemoveFile(req.file.path);
      }
      return res.status(500).json({ error: 'Failed to upload question image.' });
    }
  });
});

// ─── Admin: Pricing ──────────────────────────────────────────────────────────

// GET /test-series/pricing/admin — list all courses with pricing
router.get('/pricing/admin', authenticateToken('admin'), async (req, res) => {
  try {
    const supportedCourses = await getSupportedCourses();
    const docs = await TestSeriesPricing.find().sort({ category: 1 }).lean();
    // Ensure every supported course appears even if no doc yet
    const map = new Map(docs.map((d) => [d.category, d]));
    const pricing = supportedCourses.map((cat) => map.get(cat) || {
      category: cat,
      topicTestPriceInPaise: 0,
      topicTestMrpInPaise: 0,
      topicTestValidityDays: DEFAULT_TEST_SERIES_VALIDITY_DAYS,
      fullMockPriceInPaise: 0,
      fullMockMrpInPaise: 0,
      fullMockValidityDays: DEFAULT_TEST_SERIES_VALIDITY_DAYS,
      thumbnailUrl: '',
      thumbnailName: '',
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
    const supportedCourses = await getSupportedCourses();
    const category = normalizeCourse(req.body?.category);
    if (!supportedCourses.includes(category)) {
      return res.status(400).json({ error: 'Invalid course category.' });
    }
    const topicTestPriceInPaise = Math.max(0, Number(req.body?.topicTestPriceInPaise || 0));
    const topicTestMrpInPaise = Math.max(topicTestPriceInPaise, Number(req.body?.topicTestMrpInPaise || 0));
    const topicTestValidityDays = normalizeValidityDays(req.body?.topicTestValidityDays, DEFAULT_TEST_SERIES_VALIDITY_DAYS);
    const fullMockPriceInPaise = Math.max(0, Number(req.body?.fullMockPriceInPaise || 0));
    const fullMockMrpInPaise = Math.max(fullMockPriceInPaise, Number(req.body?.fullMockMrpInPaise || 0));
    const fullMockValidityDays = normalizeValidityDays(req.body?.fullMockValidityDays, DEFAULT_TEST_SERIES_VALIDITY_DAYS);
    const thumbnailUrl = String(req.body?.thumbnailUrl || '').trim();
    const thumbnailName = String(req.body?.thumbnailName || '').trim();
    const active = req.body?.active !== false;

    const doc = await TestSeriesPricing.findOneAndUpdate(
      { category },
      {
        $set: {
          topicTestPriceInPaise,
          topicTestMrpInPaise,
          topicTestValidityDays,
          fullMockPriceInPaise,
          fullMockMrpInPaise,
          fullMockValidityDays,
          thumbnailUrl,
          thumbnailName,
          active,
          updatedBy: req.user.username
        }
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

router.post('/pricing-thumbnail', authenticateToken('admin'), (req, res) => {
  testSeriesThumbnailUpload.single('image')(req, res, async (uploadError) => {
    try {
      if (uploadError instanceof multer.MulterError && uploadError.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Test series thumbnail must be 8 MB or smaller.' });
      }
      if (uploadError) {
        return res.status(400).json({ error: uploadError.message || 'Failed to upload test series thumbnail.' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'Test series thumbnail is required.' });
      }

      let thumbnailUrl = `/uploads/${encodeURIComponent(req.file.filename)}`;
      if (hasCloudinaryConfig) {
        const uploadedImage = await uploadTestSeriesThumbnailToCloudinary(req.file.path);
        if (!uploadedImage?.url) {
          safelyRemoveFile(req.file.path);
          return res.status(500).json({ error: 'Cloud test series thumbnail upload failed.' });
        }
        thumbnailUrl = uploadedImage.url;
        safelyRemoveFile(req.file.path);
      }

      return res.status(201).json({
        message: 'Test series thumbnail uploaded.',
        thumbnailUrl,
        thumbnailName: String(req.file.originalname || req.file.filename || '').trim()
      });
    } catch {
      if (req.file?.path) {
        safelyRemoveFile(req.file.path);
      }
      return res.status(500).json({ error: 'Failed to upload test series thumbnail.' });
    }
  });
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
    const batch = req.body?.batch ? String(req.body.batch).trim() : '';
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
      batch,
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
      const existingTest = await TopicTest.findById(testId);
      if (!existingTest) return res.status(404).json({ error: 'Topic test not found.' });

      const originalPlacement = {
        category: normalizeCourse(existingTest.category),
        module: String(existingTest.module || '').trim(),
        topic: String(existingTest.topic || 'General').trim() || 'General'
      };

      existingTest.set(payload);
      test = await existingTest.save();

      const movedPlacement = originalPlacement.category !== payload.category
        || originalPlacement.module !== payload.module
        || originalPlacement.topic !== payload.topic;

      if (movedPlacement) {
        const categoriesToCheck = Array.from(new Set([
          normalizeCourse(originalPlacement.category),
          normalizeCourse(payload.category)
        ].filter(Boolean)));
        const savedSignature = buildTopicTestSignature(test);

        const duplicateCandidates = await TopicTest.find({
          _id: { $ne: test._id },
          category: { $in: categoriesToCheck },
          title: payload.title
        });

        const duplicateIds = duplicateCandidates
          .filter((candidate) => buildTopicTestSignature(candidate) === savedSignature)
          .map((candidate) => candidate._id);

        if (duplicateIds.length) {
          await TopicTest.deleteMany({ _id: { $in: duplicateIds } });
        }
      }
    } else {
      test = await TopicTest.create(payload);
    }
    await logAdminAction(req.user.username, testId ? 'UPDATE_TOPIC_TEST' : 'CREATE_TOPIC_TEST', `${category}/${module}/${topic}: ${title}`);
    return res.status(testId ? 200 : 201).json({ message: 'Topic test saved.', test });
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
    const batch = req.body?.batch ? String(req.body.batch).trim() : '';
    const title = String(req.body?.title || '').trim();
    const description = String(req.body?.description || '').trim();
    const durationMinutes = Number(req.body?.durationMinutes || 90);
    const questions = req.body?.questions;

    if (!category || !title) return res.status(400).json({ error: 'Course and title are required.' });
    const qError = validateQuestions(questions);
    if (qError) return res.status(400).json({ error: qError });

    const payload = {
      category,
      batch,
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
      .sort({ title: 1, updatedAt: -1 })
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
    const supportedCourses = await getSupportedCourses();
    const course = resolveTargetCourse(user.class, req.query?.course, supportedCourses);
    if (!supportedCourses.includes(course)) {
      return res.status(400).json({ error: 'Invalid course category.' });
    }
    const pricing = await TestSeriesPricing.findOne({ category: course }).lean();
    const access = await resolveStudentAccess(req.user.username, course);
    return res.json({
      course,
      pricing: {
        topicTestPriceInPaise: pricing?.topicTestPriceInPaise || 0,
        topicTestMrpInPaise: Math.max(Number(pricing?.topicTestMrpInPaise || 0), Number(pricing?.topicTestPriceInPaise || 0)),
        topicTestValidityDays: getSeriesValidityDays(pricing, 'topic_test'),
        fullMockPriceInPaise: pricing?.fullMockPriceInPaise || 0,
        fullMockMrpInPaise: Math.max(Number(pricing?.fullMockMrpInPaise || 0), Number(pricing?.fullMockPriceInPaise || 0)),
        fullMockValidityDays: getSeriesValidityDays(pricing, 'full_mock'),
        currency: pricing?.currency || 'INR'
      },
      access
    });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch test series access.' });
  }
});

router.get('/catalog/student', authenticateToken('user'), async (req, res) => {
  try {
    const user = await User.findOne({ username: req.user.username }, { class: 1 }).lean();
    const supportedCourses = await getSupportedCourses();
    const pricingDocs = await TestSeriesPricing.find({ category: { $in: supportedCourses } }).lean();
    const pricingByCourse = new Map(pricingDocs.map((doc) => [normalizeCourse(doc.category), doc]));

    const courses = await Promise.all(supportedCourses.map(async (courseName) => {
      const pricing = pricingByCourse.get(courseName) || null;
      const access = await resolveStudentAccess(req.user.username, courseName);
      return {
        courseName,
        thumbnailUrl: String(pricing?.thumbnailUrl || '').trim(),
        thumbnailName: String(pricing?.thumbnailName || '').trim(),
        isEnrolledCourse: normalizeCourse(user?.class) === courseName,
        pricing: {
          topicTestPriceInPaise: Math.max(0, Number(pricing?.topicTestPriceInPaise || 0)),
          topicTestMrpInPaise: Math.max(Number(pricing?.topicTestMrpInPaise || 0), Number(pricing?.topicTestPriceInPaise || 0)),
          topicTestValidityDays: getSeriesValidityDays(pricing, 'topic_test'),
          fullMockPriceInPaise: Math.max(0, Number(pricing?.fullMockPriceInPaise || 0)),
          fullMockMrpInPaise: Math.max(Number(pricing?.fullMockMrpInPaise || 0), Number(pricing?.fullMockPriceInPaise || 0)),
          fullMockValidityDays: getSeriesValidityDays(pricing, 'full_mock'),
          currency: String(pricing?.currency || 'INR')
        },
        access
      };
    }));

    return res.json({ courses });
  } catch {
    return res.status(500).json({ error: 'Failed to load test series catalog.' });
  }
});

// ─── Student: Topic Tests ────────────────────────────────────────────────────

// GET /test-series/topic-tests/student — list topic tests for student's course (access check)
router.get('/topic-tests/student', authenticateToken('user'), async (req, res) => {
  try {
    const user = await User.findOne({ username: req.user.username }, { class: 1 }).lean();
    if (!user?.class) return res.status(404).json({ error: 'Student profile not found.' });
    const supportedCourses = await getSupportedCourses();
    const course = resolveTargetCourse(user.class, req.query?.course, supportedCourses);
    if (!supportedCourses.includes(course)) {
      return res.status(400).json({ error: 'Invalid course category.' });
    }
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
    const supportedCourses = await getSupportedCourses();
    const course = resolveTargetCourse(user.class, req.query?.course, supportedCourses);
    if (!supportedCourses.includes(course)) {
      return res.status(400).json({ error: 'Invalid course category.' });
    }
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
    const supportedCourses = await getSupportedCourses();
    const course = resolveTargetCourse(user.class, req.body?.course, supportedCourses);
    if (!supportedCourses.includes(course)) {
      return res.status(400).json({ error: 'Invalid course category.' });
    }
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
        imageUrl: String(q.imageUrl || '').trim(),
        imageName: String(q.imageName || '').trim(),
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
    const supportedCourses = await getSupportedCourses();
    const course = resolveTargetCourse(user.class, req.query?.course, supportedCourses);
    if (!supportedCourses.includes(course)) {
      return res.status(400).json({ error: 'Invalid course category.' });
    }
    const { hasFullMock } = await resolveStudentAccess(req.user.username, course);
    if (!hasFullMock) return res.status(403).json({ error: 'Full Mock Test Series not purchased for this course.' });

    const mocks = await FullMockTest.find({ category: course })
      .sort({ title: 1, updatedAt: -1 })
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
    const supportedCourses = await getSupportedCourses();
    const course = resolveTargetCourse(user.class, req.query?.course, supportedCourses);
    if (!supportedCourses.includes(course)) {
      return res.status(400).json({ error: 'Invalid course category.' });
    }
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
    const supportedCourses = await getSupportedCourses();
    const course = resolveTargetCourse(user.class, req.body?.course, supportedCourses);
    if (!supportedCourses.includes(course)) {
      return res.status(400).json({ error: 'Invalid course category.' });
    }
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
        imageUrl: String(q.imageUrl || '').trim(),
        imageName: String(q.imageName || '').trim(),
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

    const supportedCourses = await getSupportedCourses();
    const requestedCourse = normalizeCourse(req.query?.course);
    const selectedCourse = (requestedCourse && requestedCourse !== 'all')
      ? resolveTargetCourse(user.class, requestedCourse, supportedCourses)
      : 'all';

    const accessByCourseEntries = await Promise.all(
      supportedCourses.map(async (courseName) => {
        const accessForCourse = await resolveStudentAccess(req.user.username, courseName);
        return [courseName, accessForCourse];
      })
    );
    const accessByCourse = Object.fromEntries(accessByCourseEntries);

    const topicCourses = supportedCourses.filter((courseName) => Boolean(accessByCourse?.[courseName]?.hasTopicTest));
    const fullMockCourses = supportedCourses.filter((courseName) => Boolean(accessByCourse?.[courseName]?.hasFullMock));

    const topicCourseFilter = selectedCourse === 'all'
      ? topicCourses
      : (topicCourses.includes(selectedCourse) ? [selectedCourse] : []);
    const fullMockCourseFilter = selectedCourse === 'all'
      ? fullMockCourses
      : (fullMockCourses.includes(selectedCourse) ? [selectedCourse] : []);

    const [topicAttemptsRaw, fullMockAttemptsRaw] = await Promise.all([
      topicCourseFilter.length
        ? TopicTestAttempt.find({ username: req.user.username, category: { $in: topicCourseFilter } }).sort({ submittedAt: -1 }).lean()
        : Promise.resolve([]),
      fullMockCourseFilter.length
        ? FullMockAttempt.find({ username: req.user.username, category: { $in: fullMockCourseFilter } }).sort({ submittedAt: -1 }).lean()
        : Promise.resolve([])
    ]);

    const topicTestIds = Array.from(new Set(topicAttemptsRaw.map((attempt) => String(attempt?.testId || '').trim()).filter(Boolean)));
    const fullMockIds = Array.from(new Set(fullMockAttemptsRaw.map((attempt) => String(attempt?.mockId || '').trim()).filter(Boolean)));

    const [topicTests, fullMocks] = await Promise.all([
      topicTestIds.length ? TopicTest.find({ _id: { $in: topicTestIds } }, { _id: 1, batch: 1, category: 1 }).lean() : Promise.resolve([]),
      fullMockIds.length ? FullMockTest.find({ _id: { $in: fullMockIds } }, { _id: 1, batch: 1, category: 1 }).lean() : Promise.resolve([])
    ]);

    const topicMetaById = new Map(topicTests.map((item) => [String(item._id), item]));
    const fullMockMetaById = new Map(fullMocks.map((item) => [String(item._id), item]));

    const topicAttempts = topicAttemptsRaw.map((attempt) => {
      const meta = topicMetaById.get(String(attempt?.testId || '')) || {};
      const courseName = normalizeCourse(attempt?.category || meta?.category || user.class);
      return {
        ...attempt,
        category: courseName,
        course: courseName,
        batch: String(meta?.batch || '').trim()
      };
    });

    const fullMockAttempts = fullMockAttemptsRaw.map((attempt) => {
      const meta = fullMockMetaById.get(String(attempt?.mockId || '')) || {};
      const courseName = normalizeCourse(attempt?.category || meta?.category || user.class);
      return {
        ...attempt,
        category: courseName,
        course: courseName,
        batch: String(meta?.batch || '').trim()
      };
    });

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

    const selectedAccess = selectedCourse === 'all'
      ? {
          hasTopicTest: topicCourseFilter.length > 0,
          hasFullMock: fullMockCourseFilter.length > 0
        }
      : (accessByCourse[selectedCourse] || { hasTopicTest: false, hasFullMock: false });

    return res.json({
      course: normalizeCourse(user.class),
      selectedCourse,
      availableCourses: supportedCourses,
      accessByCourse,
      access: selectedAccess,
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
        course: attempt.course,
        category: attempt.category,
        batch: attempt.batch || '',
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
        course: attempt.course,
        category: attempt.category,
        batch: attempt.batch || '',
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
    const mrpKey = seriesType === 'topic_test' ? 'topicTestMrpInPaise' : 'fullMockMrpInPaise';
    const amountInPaise = Math.max(0, Number(pricing?.[priceKey] || 0));
    const mrpAmountInPaise = Math.max(amountInPaise, Number(pricing?.[mrpKey] || 0));
    const validityDays = getSeriesValidityDays(pricing, seriesType);

    return res.json({
      alreadyOwned: false,
      course,
      seriesType,
      amountInPaise,
      mrpAmountInPaise,
      validityDays,
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
    const supportedCourses = await getSupportedCourses();
    const course = resolveTargetCourse(user.class, req.body?.course, supportedCourses);
    if (!supportedCourses.includes(course)) {
      return res.status(400).json({ error: 'Invalid course category.' });
    }

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
    const mrpKey = seriesType === 'topic_test' ? 'topicTestMrpInPaise' : 'fullMockMrpInPaise';
    const originalAmountInPaise = Math.max(0, Number(pricing?.[priceKey] || 0));
    const mrpAmountInPaise = Math.max(originalAmountInPaise, Number(pricing?.[mrpKey] || 0));
    const validityDays = getSeriesValidityDays(pricing, seriesType);
    const purchasePaidAt = new Date();
    const expiresAt = addDays(purchasePaidAt, validityDays);
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
      mrpAmountInPaise,
      discountInPaise,
      finalAmountInPaise,
      validityDays,
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
    const supportedCourses = await getSupportedCourses();
    const course = resolveTargetCourse(user.class, req.body?.course, supportedCourses);
    if (!supportedCourses.includes(course)) {
      return res.status(400).json({ error: 'Invalid course category.' });
    }

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
    const mrpKey = seriesType === 'topic_test' ? 'topicTestMrpInPaise' : 'fullMockMrpInPaise';
    const originalAmountInPaise = Math.max(0, Number(pricing?.[priceKey] || 0));
    const mrpAmountInPaise = Math.max(originalAmountInPaise, Number(pricing?.[mrpKey] || 0));
    const validityDays = getSeriesValidityDays(pricing, seriesType);
    const purchasePaidAt = new Date();
    const expiresAt = addDays(purchasePaidAt, validityDays);

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
        paidAt: purchasePaidAt,
        validityDays,
        expiresAt
      });
      if (appliedVoucherId) {
        await Voucher.findByIdAndUpdate(appliedVoucherId, { $inc: { usedCount: 1 } });
      }
      return res.json({ free: true, alreadyOwned: false, validityDays, expiresAt });
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
      validityDays,
      expiresAt,
      razorpayOrderId: razorpayOrder.id
    });

    return res.json({
      razorpayOrder,
      keyId,
      amountInPaise: finalAmountInPaise,
      mrpAmountInPaise,
      originalAmountInPaise,
      discountInPaise,
      validityDays,
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
      razorpaySignature
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
    if (!paymentRecord) {
      return res.status(404).json({ error: 'Payment order not found.' });
    }

    const course = normalizeCourse(paymentRecord.course);
    const purchasedSeriesType = String(paymentRecord.seriesType || '').trim();
    const paidAt = new Date();
    const validityDays = normalizeValidityDays(paymentRecord.validityDays, DEFAULT_TEST_SERIES_VALIDITY_DAYS);
    const expiresAt = addDays(paidAt, validityDays);

    await TestSeriesPayment.updateOne(
      { _id: paymentRecord._id },
      { $set: { paidAt, expiresAt, validityDays } }
    );

    // Increment voucher usage count if a voucher was applied
    if (paymentRecord?.appliedVoucherId) {
      await Voucher.findByIdAndUpdate(paymentRecord.appliedVoucherId, { $inc: { usedCount: 1 } });
    }

    // Also mark the complementary full_mock if topic_test was purchased,
    // by checking it is not already an independent record.
    if (purchasedSeriesType === 'topic_test') {
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
          paidAt,
          validityDays,
          expiresAt
        });
      }
    }

    return res.json({ success: true, message: 'Payment verified. Test series unlocked.' });
  } catch {
    return res.status(500).json({ error: 'Failed to verify test series payment.' });
  }
});

module.exports = router;
