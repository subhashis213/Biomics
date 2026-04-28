const express = require('express');
const Course = require('../models/Course');
const Module = require('../models/Module');
const ModulePricing = require('../models/ModulePricing');
const BatchPricing = require('../models/BatchPricing');
const Video = require('../models/Video');
const Quiz = require('../models/Quiz');
const TopicTest = require('../models/TopicTest');
const MockExam = require('../models/MockExam');
const FullMockTest = require('../models/FullMockTest');
const ModuleAttempt = require('../models/QuizAttempt');
const TopicTestAttempt = require('../models/TopicTestAttempt');
const MockExamAttempt = require('../models/MockExamAttempt');
const FullMockAttempt = require('../models/FullMockAttempt');
const Topic = require('../models/Topic');
const CoursePricing = require('../models/CoursePricing');
const TestSeriesPricing = require('../models/TestSeriesPricing');
const Payment = require('../models/Payment');
const TestSeriesPayment = require('../models/TestSeriesPayment');
const LiveClass = require('../models/LiveClass');
const LiveClassCalendarBlock = require('../models/LiveClassCalendarBlock');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const { ALL_MODULES } = require('../utils/courseAccess');

const router = express.Router();
const DEFAULT_ADMIN_COURSES = [
  '11th',
  '12th',
  'NEET',
  'GAT-B',
  'IIT-JAM',
  'CSIR-NET Life Science',
  'GATE'
];

function normalizeValue(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeNameKey(value) {
  return normalizeValue(value).toLowerCase();
}

async function findCourseDocByName(courseName) {
  const normalizedKey = normalizeNameKey(courseName);
  if (!normalizedKey) return null;
  const docs = await Course.find({}).sort({ updatedAt: -1 });
  return docs.find((entry) => normalizeNameKey(entry?.name) === normalizedKey) || null;
}

function collectNormalizedNames(values = []) {
  const unique = new Map();
  values.forEach((value) => {
    const normalized = normalizeValue(value);
    if (!normalized) return;
    const key = normalizeNameKey(normalized);
    if (!unique.has(key)) unique.set(key, normalized);
  });
  return Array.from(unique.values());
}

async function ensureAdminCourseDocuments(adminUsername = '') {
  const [
    existingCourses,
    moduleCategories,
    videoCategories,
    quizCategories,
    topicTestCategories,
    mockExamCategories,
    fullMockCategories,
    modulePricingCategories,
    batchPricingCategories
  ] = await Promise.all([
    Course.find({}).select({ name: 1 }).lean(),
    Module.distinct('category', {}),
    Video.distinct('category', {}),
    Quiz.distinct('category', {}),
    TopicTest.distinct('category', {}),
    MockExam.distinct('category', {}),
    FullMockTest.distinct('category', {}),
    ModulePricing.distinct('category', {}),
    BatchPricing.distinct('category', {})
  ]);

  const knownNames = collectNormalizedNames([
    ...DEFAULT_ADMIN_COURSES,
    ...moduleCategories,
    ...videoCategories,
    ...quizCategories,
    ...topicTestCategories,
    ...mockExamCategories,
    ...fullMockCategories,
    ...modulePricingCategories,
    ...batchPricingCategories
  ]);

  if (!knownNames.length) return;

  const existingKeys = new Set(
    (existingCourses || []).map((entry) => normalizeNameKey(entry?.name))
  );

  const missing = knownNames.filter((name) => !existingKeys.has(normalizeNameKey(name)));
  if (!missing.length) return;

  const byUser = String(adminUsername || '').trim();
  await Course.insertMany(
    missing.map((name) => ({
      name,
      displayName: name,
      description: '',
      icon: '',
      active: true,
      batches: [],
      createdBy: byUser,
      updatedBy: byUser
    })),
    { ordered: false }
  );
}

async function buildCoursesWithMeta(filter = {}) {
  const courses = await Course.find({
    archived: { $ne: true },
    isDeleted: { $ne: true },
    deletedAt: { $exists: false },
    ...(filter || {})
  }).sort({ name: 1 }).lean();
  const courseNames = courses.map((entry) => normalizeValue(entry?.name)).filter(Boolean);

  const [modules, bundlePricingDocs, videos, quizzes, topicTests, mockExams, testSeries] = await Promise.all([
    Module.find({ category: { $in: courseNames } }).select({ category: 1 }).lean(),
    ModulePricing.find({ moduleName: ALL_MODULES, category: { $in: courseNames } })
      .select({ category: 1, thumbnailUrl: 1, thumbnailName: 1 })
      .lean(),
    Video.find({ category: { $in: courseNames } }).select({ category: 1 }).lean(),
    Quiz.find({ category: { $in: courseNames } }).select({ category: 1 }).lean(),
    TopicTest.find({ category: { $in: courseNames } }).select({ category: 1 }).lean(),
    MockExam.find({ category: { $in: courseNames } }).select({ category: 1 }).lean(),
    FullMockTest.find({ category: { $in: courseNames } }).select({ category: 1 }).lean()
  ]);

  const moduleCountByCourse = modules.reduce((acc, item) => {
    const key = normalizeNameKey(item?.category);
    if (!key) return acc;
    acc.set(key, Number(acc.get(key) || 0) + 1);
    return acc;
  }, new Map());

  const videoCountByCourse = videos.reduce((acc, item) => {
    const key = normalizeNameKey(item?.category);
    if (!key) return acc;
    acc.set(key, Number(acc.get(key) || 0) + 1);
    return acc;
  }, new Map());

  const quizCountByCourse = quizzes.reduce((acc, item) => {
    const key = normalizeNameKey(item?.category);
    if (!key) return acc;
    acc.set(key, Number(acc.get(key) || 0) + 1);
    return acc;
  }, new Map());

  const testCountByCourse = [...topicTests, ...mockExams, ...testSeries].reduce((acc, item) => {
    const key = normalizeNameKey(item?.category);
    if (!key) return acc;
    acc.set(key, Number(acc.get(key) || 0) + 1);
    return acc;
  }, new Map());

  const pricingByCourse = bundlePricingDocs.reduce((acc, item) => {
    const key = normalizeNameKey(item?.category);
    if (!key) return acc;
    acc.set(key, item);
    return acc;
  }, new Map());

  return courses.map((entry) => {
    const courseName = normalizeValue(entry?.name);
    const key = normalizeNameKey(courseName);
    const pricing = pricingByCourse.get(key) || null;
    return {
      name: courseName,
      displayName: normalizeValue(entry?.displayName || courseName),
      description: String(entry?.description || '').trim(),
      icon: String(entry?.icon || '').trim(),
      active: entry?.active !== false,
      batches: Array.isArray(entry?.batches)
        ? entry.batches
          .map((batch) => ({
            name: normalizeValue(batch?.name),
            active: batch?.active !== false
          }))
          .filter((batch) => Boolean(batch.name))
        : [],
      moduleCount: Number(moduleCountByCourse.get(key) || 0),
      videoCount: Number(videoCountByCourse.get(key) || 0),
      quizCount: Number(quizCountByCourse.get(key) || 0),
      testCount: Number(testCountByCourse.get(key) || 0),
      thumbnailUrl: String(pricing?.thumbnailUrl || '').trim(),
      thumbnailName: String(pricing?.thumbnailName || '').trim(),
      createdAt: entry?.createdAt || null,
      updatedAt: entry?.updatedAt || null
    };
  });
}

router.get('/admin', authenticateToken('admin'), async (req, res) => {
  try {
    await ensureAdminCourseDocuments(String(req.user?.username || '').trim());
    const courses = await buildCoursesWithMeta({});
    return res.json({ courses });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch course catalog.' });
  }
});

router.get('/student', authenticateToken('user'), async (req, res) => {
  try {
    const courses = await buildCoursesWithMeta({ active: true });
    return res.json({
      courses: courses.map((entry) => ({
        ...entry,
        batches: entry.batches.filter((batch) => batch.active)
      }))
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch student courses.' });
  }
});

router.post('/admin', authenticateToken('admin'), async (req, res) => {
  try {
    const name = normalizeValue(req.body?.name);
    const displayName = normalizeValue(req.body?.displayName || name);
    const description = String(req.body?.description || '').trim();
    const icon = String(req.body?.icon || '').trim();

    if (!name) {
      return res.status(400).json({ error: 'Course name is required.' });
    }

    const existing = await findCourseDocByName(name);
    if (existing && existing.archived !== true) {
      return res.status(409).json({ error: 'Course already exists.' });
    }

    if (existing && existing.archived === true) {
      existing.archived = false;
      existing.active = true;
      existing.displayName = displayName || name;
      existing.description = description;
      existing.icon = icon;
      existing.updatedBy = String(req.user?.username || '').trim();
      await existing.save();
      const courses = await buildCoursesWithMeta({});
      return res.status(201).json({ courses });
    }

    await Course.create({
      name,
      displayName,
      description,
      icon,
      active: true,
      archived: false,
      batches: [],
      createdBy: String(req.user?.username || '').trim(),
      updatedBy: String(req.user?.username || '').trim()
    });

    const courses = await buildCoursesWithMeta({});
    return res.status(201).json({ courses });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to create course.' });
  }
});

router.put('/admin/:courseName', authenticateToken('admin'), async (req, res) => {
  try {
    const courseName = normalizeValue(req.params.courseName);
    const displayName = normalizeValue(req.body?.displayName || '');
    const description = String(req.body?.description || '').trim();
    const icon = String(req.body?.icon || '').trim();
    const active = req.body?.active !== false;

    if (!courseName) {
      return res.status(400).json({ error: 'Course name is required.' });
    }

    const courseDoc = await findCourseDocByName(courseName);
    if (!courseDoc) {
      return res.status(404).json({ error: 'Course not found.' });
    }

    if (displayName) courseDoc.displayName = displayName;
    courseDoc.description = description;
    courseDoc.icon = icon;
    courseDoc.active = active;
    courseDoc.updatedBy = String(req.user?.username || '').trim();
    await courseDoc.save();

    const courses = await buildCoursesWithMeta({});
    return res.json({ courses });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update course.' });
  }
});

router.delete('/admin/:courseName', authenticateToken('admin'), async (req, res) => {
  try {
    const courseName = normalizeValue(req.params.courseName);
    if (!courseName) {
      return res.status(400).json({ error: 'Course name is required.' });
    }

    const courseDoc = await findCourseDocByName(courseName);
    if (!courseDoc) {
      return res.status(404).json({ error: 'Course not found.' });
    }

    courseDoc.archived = true;
    courseDoc.active = false;
    courseDoc.updatedBy = String(req.user?.username || '').trim();
    await courseDoc.save();

    const courses = await buildCoursesWithMeta({});
    return res.json({ courses });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete course.' });
  }
});

router.put('/admin/:courseName/rename', authenticateToken('admin'), async (req, res) => {
  try {
    const courseName = normalizeValue(req.params.courseName);
    const nextName = normalizeValue(req.body?.name);

    if (!courseName || !nextName) {
      return res.status(400).json({ error: 'Current and new course names are required.' });
    }
    if (normalizeNameKey(courseName) === normalizeNameKey(nextName)) {
      return res.status(400).json({ error: 'New course name must be different.' });
    }

    const courseDoc = await findCourseDocByName(courseName);
    if (!courseDoc) {
      return res.status(404).json({ error: 'Course not found.' });
    }

    const duplicate = await findCourseDocByName(nextName);
    if (duplicate && String(duplicate._id) !== String(courseDoc._id)) {
      return res.status(409).json({ error: 'Another course already uses this name.' });
    }

    const previousName = normalizeValue(courseDoc.name);

    await Promise.all([
      Module.updateMany({ category: previousName }, { $set: { category: nextName } }),
      ModulePricing.updateMany({ category: previousName }, { $set: { category: nextName } }),
      BatchPricing.updateMany({ category: previousName }, { $set: { category: nextName } }),
      CoursePricing.updateMany({ category: previousName }, { $set: { category: nextName } }),
      TestSeriesPricing.updateMany({ category: previousName }, { $set: { category: nextName } }),
      Video.updateMany({ category: previousName }, { $set: { category: nextName } }),
      Quiz.updateMany({ category: previousName }, { $set: { category: nextName } }),
      Topic.updateMany({ category: previousName }, { $set: { category: nextName } }),
      TopicTest.updateMany({ category: previousName }, { $set: { category: nextName } }),
      MockExam.updateMany({ category: previousName }, { $set: { category: nextName } }),
      FullMockTest.updateMany({ category: previousName }, { $set: { category: nextName } }),
      ModuleAttempt.updateMany({ category: previousName }, { $set: { category: nextName } }),
      TopicTestAttempt.updateMany({ category: previousName }, { $set: { category: nextName } }),
      MockExamAttempt.updateMany({ category: previousName }, { $set: { category: nextName } }),
      FullMockAttempt.updateMany({ category: previousName }, { $set: { category: nextName } }),
      Payment.updateMany({ course: previousName }, { $set: { course: nextName } }),
      TestSeriesPayment.updateMany({ course: previousName }, { $set: { course: nextName } }),
      LiveClass.updateMany({ course: previousName }, { $set: { course: nextName } }),
      LiveClassCalendarBlock.updateMany({ course: previousName }, { $set: { course: nextName } }),
      User.updateMany({ class: previousName }, { $set: { class: nextName } }),
      User.updateMany(
        { 'purchasedCourses.course': previousName },
        { $set: { 'purchasedCourses.$[entry].course': nextName } },
        { arrayFilters: [{ 'entry.course': previousName }] }
      )
    ]);

    courseDoc.name = nextName;
    courseDoc.displayName = normalizeValue(req.body?.displayName || nextName);
    courseDoc.updatedBy = String(req.user?.username || '').trim();
    await courseDoc.save();

    const courses = await buildCoursesWithMeta({});
    return res.json({ courses, renamedFrom: previousName, renamedTo: nextName });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to rename course.' });
  }
});

router.post('/admin/:courseName/batches', authenticateToken('admin'), async (req, res) => {
  try {
    const courseName = normalizeValue(req.params.courseName);
    const batchName = normalizeValue(req.body?.name);

    if (!courseName || !batchName) {
      return res.status(400).json({ error: 'Course name and batch name are required.' });
    }

    const courseDoc = await findCourseDocByName(courseName);
    if (!courseDoc) {
      return res.status(404).json({ error: 'Course not found.' });
    }

    const existing = (courseDoc.batches || []).some((entry) => normalizeNameKey(entry?.name) === normalizeNameKey(batchName));
    if (existing) {
      return res.status(409).json({ error: 'Batch already exists for this course.' });
    }

    courseDoc.batches = [...(courseDoc.batches || []), { name: batchName, active: true }];
    courseDoc.updatedBy = String(req.user?.username || '').trim();
    await courseDoc.save();

    const courses = await buildCoursesWithMeta({});
    return res.status(201).json({ courses });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to add batch.' });
  }
});

router.delete('/admin/:courseName/batches/:batchName', authenticateToken('admin'), async (req, res) => {
  try {
    const courseName = normalizeValue(req.params.courseName);
    const batchName = normalizeValue(req.params.batchName);

    if (!courseName || !batchName) {
      return res.status(400).json({ error: 'Course name and batch name are required.' });
    }

    const courseDoc = await findCourseDocByName(courseName);
    if (!courseDoc) {
      return res.status(404).json({ error: 'Course not found.' });
    }

    courseDoc.batches = (courseDoc.batches || []).filter((entry) => normalizeNameKey(entry?.name) !== normalizeNameKey(batchName));
    courseDoc.updatedBy = String(req.user?.username || '').trim();
    await courseDoc.save();

    const courses = await buildCoursesWithMeta({});
    return res.json({ courses });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to remove batch.' });
  }
});

router.put('/admin/:courseName/batches/:batchName/rename', authenticateToken('admin'), async (req, res) => {
  try {
    const courseName = normalizeValue(req.params.courseName);
    const batchName = normalizeValue(req.params.batchName);
    const nextBatchName = normalizeValue(req.body?.name);

    if (!courseName || !batchName || !nextBatchName) {
      return res.status(400).json({ error: 'Course, current batch, and new batch names are required.' });
    }
    if (normalizeNameKey(batchName) === normalizeNameKey(nextBatchName)) {
      return res.status(400).json({ error: 'New batch name must be different.' });
    }

    const courseDoc = await findCourseDocByName(courseName);
    if (!courseDoc) {
      return res.status(404).json({ error: 'Course not found.' });
    }

    const batchExists = (courseDoc.batches || []).some((entry) => normalizeNameKey(entry?.name) === normalizeNameKey(batchName));
    if (!batchExists) {
      return res.status(404).json({ error: 'Batch not found for this course.' });
    }

    const duplicateBatch = (courseDoc.batches || []).some((entry) => normalizeNameKey(entry?.name) === normalizeNameKey(nextBatchName));
    if (duplicateBatch) {
      return res.status(409).json({ error: 'Another batch already uses this name in this course.' });
    }

    courseDoc.batches = (courseDoc.batches || []).map((entry) => {
      if (normalizeNameKey(entry?.name) !== normalizeNameKey(batchName)) return entry;
      return { name: nextBatchName, active: entry?.active !== false };
    });
    courseDoc.updatedBy = String(req.user?.username || '').trim();
    await courseDoc.save();

    await Promise.all([
      BatchPricing.updateMany(
        { category: courseName, batchName },
        { $set: { batchName: nextBatchName } }
      ),
      Module.updateMany(
        { category: courseName, batch: batchName },
        { $set: { batch: nextBatchName } }
      ),
      Video.updateMany(
        { category: courseName, batch: batchName },
        { $set: { batch: nextBatchName } }
      ),
      Quiz.updateMany(
        { category: courseName, batch: batchName },
        { $set: { batch: nextBatchName } }
      ),
      TopicTest.updateMany(
        { category: courseName, batch: batchName },
        { $set: { batch: nextBatchName } }
      ),
      MockExam.updateMany(
        { category: courseName, batch: batchName },
        { $set: { batch: nextBatchName } }
      ),
      FullMockTest.updateMany(
        { category: courseName, batch: batchName },
        { $set: { batch: nextBatchName } }
      )
    ]);

    const courses = await buildCoursesWithMeta({});
    return res.json({ courses, renamedFrom: batchName, renamedTo: nextBatchName });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to rename batch.' });
  }
});

// Bulk migrate content to a batch
router.post('/admin/:courseName/migrate-content', authenticateToken('admin'), async (req, res) => {
  try {
    const courseName = normalizeValue(req.params.courseName);
    const targetBatch = normalizeValue(req.body?.targetBatch);
    const mode = (String(req.body?.mode || 'move').trim().toLowerCase());
    const moduleName = normalizeValue(req.body?.module || '');
    const topicName = normalizeValue(req.body?.topic || '');
    const fromBatch = normalizeValue(req.body?.fromBatch || '');
    const sourceCourse = normalizeValue(req.body?.sourceCourse || '');

    if (!courseName || !targetBatch) {
      return res.status(400).json({ error: 'Course name and target batch are required.' });
    }

    if (!['move', 'copy'].includes(mode)) {
      return res.status(400).json({ error: 'Mode must be "move" or "copy".' });
    }

    const courseDoc = await findCourseDocByName(courseName);
    if (!courseDoc) {
      return res.status(404).json({ error: 'Target course not found.' });
    }

    // Determine the source course for content migration
    const contentSourceCourse = sourceCourse || courseName;

    // Build match filter
    const filter = { category: normalizeValue(contentSourceCourse) };
    if (moduleName) filter.module = moduleName;
    if (topicName) filter.topic = topicName;

    // If fromBatch is specified, filter by that batch. Otherwise, migrate ALL content from source course (regardless of batch)
    if (fromBatch) {
      filter.batch = fromBatch;
    }
    // If fromBatch is empty, don't add any batch filter — this migrates ALL content in the source course to target batch

    // Import models inside the route to avoid circular dependency
    const Video = require('../models/Video');
    const Quiz = require('../models/Quiz');
    const TopicTest = require('../models/TopicTest');
    const MockExam = require('../models/MockExam');
    const FullMockTest = require('../models/FullMockTest');

    const runMove = async (model) => {
      const total = await model.countDocuments(filter);
      const result = await model.updateMany(filter, {
        $set: {
          category: courseName, // Update category if cross-course migration
          batch: targetBatch,
          updatedAt: new Date()
        }
      });
      return { total, updated: Number(result?.modifiedCount || 0) };
    };

    const runCopy = async (model) => {
      const docs = await model.find(filter).lean();
      const total = docs.length;
      let copied = 0;
      let skipped = 0;

      for (const doc of docs) {
        const clone = { ...doc };
        delete clone._id;
        delete clone.__v;

        clone.category = courseName; // Update category for cross-course migration
        clone.batch = targetBatch;
        clone.createdAt = new Date();
        clone.updatedAt = new Date();

        const duplicateFilter = {
          category: clone.category,
          batch: clone.batch
        };

        if (clone.module) duplicateFilter.module = clone.module;
        if (clone.topic) duplicateFilter.topic = clone.topic;
        if (clone.title) duplicateFilter.title = clone.title;

        const alreadyExists = await model.findOne(duplicateFilter).select({ _id: 1 }).lean();
        if (alreadyExists) {
          skipped += 1;
          continue;
        }

        await model.create(clone);
        copied += 1;
      }

      return { total, copied, skipped };
    };

    const runner = mode === 'copy' ? runCopy : runMove;

    const [videos, quizzes, topicTests, mockExams, testSeries] = await Promise.all([
      runner(Video),
      runner(Quiz),
      runner(TopicTest),
      runner(MockExam),
      runner(FullMockTest)
    ]);

    // Keep pricing workspace in sync by ensuring migrated modules exist in Module collection
    // for the target course + batch, even when content came from another course.
    const migratedModuleNames = collectNormalizedNames([
      ...(await Video.distinct('module', { category: courseName, batch: targetBatch })),
      ...(await Quiz.distinct('module', { category: courseName, batch: targetBatch })),
      ...(await TopicTest.distinct('module', { category: courseName, batch: targetBatch })),
      ...(await MockExam.distinct('module', { category: courseName, batch: targetBatch })),
      ...(await FullMockTest.distinct('module', { category: courseName, batch: targetBatch }))
    ]);

    if (migratedModuleNames.length) {
      await Promise.all(
        migratedModuleNames.map((moduleEntry) => Module.updateOne(
          { category: courseName, name: moduleEntry, batch: targetBatch },
          {
            $setOnInsert: {
              category: courseName,
              name: moduleEntry,
              batch: targetBatch,
              createdBy: String(req.user?.username || '').trim()
            }
          },
          { upsert: true }
        ))
      );
    }

    // When a specific source batch is selected, carry its module pricing template
    // to the target batch so newly migrated modules appear immediately in pricing UI.
    let pricingTemplatesSynced = 0;
    if (fromBatch) {
      const sourcePricingDocs = await ModulePricing.find({
        category: contentSourceCourse,
        batch: fromBatch,
        moduleName: { $ne: ALL_MODULES }
      }).lean();
      const allowedModuleKeys = new Set(migratedModuleNames.map((name) => normalizeNameKey(name)));
      const docsToSync = sourcePricingDocs.filter((doc) => allowedModuleKeys.has(normalizeNameKey(doc?.moduleName)));
      if (docsToSync.length) {
        await Promise.all(
          docsToSync.map((doc) => ModulePricing.updateOne(
            {
              category: courseName,
              batch: targetBatch,
              moduleName: normalizeValue(doc.moduleName)
            },
            {
              $set: {
                category: courseName,
                batch: targetBatch,
                moduleName: normalizeValue(doc.moduleName),
                proPriceInPaise: Number(doc.proPriceInPaise || 0),
                elitePriceInPaise: Number(doc.elitePriceInPaise || 0),
                proMrpInPaise: Number(doc.proMrpInPaise || 0),
                eliteMrpInPaise: Number(doc.eliteMrpInPaise || 0),
                proTenureMonths: Number(doc.proTenureMonths || 1),
                eliteTenureMonths: Number(doc.eliteTenureMonths || 3),
                currency: String(doc.currency || 'INR').trim().toUpperCase(),
                active: doc.active !== false,
                updatedBy: String(req.user?.username || '').trim()
              }
            },
            { upsert: true }
          ))
        );
        pricingTemplatesSynced = docsToSync.length;
      }
    }

    return res.json({
      success: true,
      mode,
      sourceCourse: contentSourceCourse,
      targetCourse: courseName,
      targetBatch,
      filter,
      result: {
        videos,
        quizzes,
        topicTests,
        mockExams,
        testSeries
      },
      sync: {
        modulesEnsured: migratedModuleNames.length,
        pricingTemplatesSynced
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to migrate content.' });
  }
});

// Get all migration data with batch-level content counts
router.get('/admin/migration-data', authenticateToken('admin'), async (req, res) => {
  try {
    const Video = require('../models/Video');
    const Quiz = require('../models/Quiz');
    const TopicTest = require('../models/TopicTest');
    const MockExam = require('../models/MockExam');
    const FullMockTest = require('../models/FullMockTest');

    // Fetch all courses from Course collection - only non-archived and active
    const coursesFromDb = await Course.find({ archived: { $ne: true }, active: true }).sort({ name: 1 }).lean();

    // Fetch all content with category and batch fields
    const [videos, quizzes, topicTests, mockExams, testSeries, modules] = await Promise.all([
      Video.find({}).select('title category batch module').lean(),
      Quiz.find({}).select('title category batch module').lean(),
      TopicTest.find({}).select('title category batch module').lean(),
      MockExam.find({}).select('title category batch module').lean(),
      FullMockTest.find({}).select('title category batch module').lean(),
      Module.find({}).select('name category batch').lean()
    ]);

    // Get all unique categories from content
    const allCategories = new Set();
    const categoryBatchesMap = new Map(); // category -> Set of batches
    const categoryContentMap = new Map(); // category|batch -> content counts

    // Process all content collections
    const processContent = (items, type) => {
      items.forEach(item => {
        const category = normalizeValue(item?.category);
        const batch = normalizeValue(item?.batch) || 'default';
        
        if (!category) return;
        
        allCategories.add(category);
        
        // Track batches per category
        if (!categoryBatchesMap.has(category)) {
          categoryBatchesMap.set(category, new Set());
        }
        categoryBatchesMap.get(category).add(batch);
        
        // Track content counts
        const key = `${category}|${batch}`;
        if (!categoryContentMap.has(key)) {
          categoryContentMap.set(key, { videos: 0, quizzes: 0, tests: 0, modules: new Set() });
        }
        
        const content = categoryContentMap.get(key);
        if (type === 'video') content.videos++;
        else if (type === 'quiz') content.quizzes++;
        else content.tests++;
        
        if (item.module) content.modules.add(item.module);
      });
    };

    processContent(videos, 'video');
    processContent(quizzes, 'quiz');
    processContent([...topicTests, ...mockExams, ...testSeries], 'test');

    // Also add courses from Course collection
    coursesFromDb.forEach(course => {
      const courseName = normalizeValue(course?.name);
      if (courseName) {
        allCategories.add(courseName);
        
        // Add batches from course schema
        if (Array.isArray(course?.batches)) {
          if (!categoryBatchesMap.has(courseName)) {
            categoryBatchesMap.set(courseName, new Set());
          }
          course.batches.forEach(b => {
            const batchName = normalizeValue(b?.name);
            if (batchName) {
              categoryBatchesMap.get(courseName).add(batchName);
            }
          });
        }
      }
    });

    // Build response with all categories (from content and Course collection)
    // Only include categories that exist in the Course collection (non-archived, active)
    const validCourseNames = new Set(coursesFromDb.map(c => normalizeValue(c?.name)));
    
    const response = Array.from(allCategories)
      .filter(categoryName => validCourseNames.has(categoryName)) // Only include courses from Course collection
      .sort()
      .map((categoryName) => {
        const batches = categoryBatchesMap.get(categoryName) || new Set();
        const courseFromDb = coursesFromDb.find(c => normalizeValue(c?.name) === categoryName);
        
        return {
          name: categoryName,
          displayName: courseFromDb ? normalizeValue(courseFromDb?.displayName || categoryName) : categoryName,
          description: courseFromDb ? String(courseFromDb?.description || '').trim() : '',
          active: courseFromDb ? courseFromDb?.active !== false : true,
          modules: categoryContentMap.has(`${categoryName}|default`) 
            ? categoryContentMap.get(`${categoryName}|default`).modules.size 
            : 0,
          batches: Array.from(batches)
            .sort()
            .map((batchName) => {
              const content = categoryContentMap.get(`${categoryName}|${batchName}`) || {
                videos: 0,
                quizzes: 0,
                tests: 0
              };
              
              // Get batch active status from course collection
              const courseBatch = courseFromDb?.batches?.find(b => normalizeValue(b?.name) === batchName);
              const batchActive = courseBatch ? courseBatch.active !== false : true;
              
              return {
                name: batchName,
                active: batchActive,
                videos: content.videos || 0,
                quizzes: content.quizzes || 0,
                tests: content.tests || 0,
                totalContent: (content.videos || 0) + (content.quizzes || 0) + (content.tests || 0)
              };
            })
            .filter(batch => batch.active) // Only include active batches
        };
      });

    return res.json({ courses: response });
  } catch (error) {
    console.error('Migration data error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch migration data.' });
  }
});

module.exports = router;
