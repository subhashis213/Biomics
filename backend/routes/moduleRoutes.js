const express = require('express');
const router = express.Router();
const Module = require('../models/Module');
const Topic = require('../models/Topic');
const Video = require('../models/Video');
const Quiz = require('../models/Quiz');
const TopicTest = require('../models/TopicTest');
const MockExam = require('../models/MockExam');
const FullMockTest = require('../models/FullMockTest');
const ModulePricing = require('../models/ModulePricing');
const { authenticateToken } = require('../middleware/auth');

function normalizeValue(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function buildBatchOrClause(batchName) {
  const normalized = normalizeValue(batchName || '');
  if (!normalized) return null;
  return [
    { batch: normalized },
    { batch: 'General' },
    { batch: '' },
    { batch: null },
    { batch: { $exists: false } }
  ];
}

function withOptionalBatch(baseFilter, batchName) {
  const batchClause = buildBatchOrClause(batchName);
  if (!batchClause) return baseFilter;
  return {
    $and: [
      baseFilter,
      { $or: batchClause }
    ]
  };
}

router.get('/catalog', authenticateToken('user'), async (req, res) => {
  try {
    const modules = await Module.find({}, { category: 1, name: 1, _id: 0 })
      .sort({ category: 1, name: 1 })
      .lean();
    return res.json({ modules });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch module catalog' });
  }
});

router.get('/topics', authenticateToken('admin'), async (req, res) => {
  try {
    const category = normalizeValue(req.query.category || '');
    const moduleName = normalizeValue(req.query.module || '');
    if (!category || !moduleName) {
      return res.status(400).json({ error: 'category and module are required' });
    }
    const topics = await Topic.find({ category, module: moduleName }).sort({ name: 1 }).lean();
    return res.json({ topics });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch topics' });
  }
});

router.get('/topics/for-student', authenticateToken('user'), async (req, res) => {
  try {
    const category = normalizeValue(req.query.category || '');
    const moduleName = normalizeValue(req.query.module || '');
    if (!category || !moduleName) {
      return res.status(400).json({ error: 'category and module are required' });
    }
    const topics = await Topic.find({ category, module: moduleName }).sort({ name: 1 }).lean();
    return res.json({ topics });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch topics' });
  }
});

router.post('/topics', authenticateToken('admin'), async (req, res) => {
  const category = normalizeValue(req.body.category || '');
  const moduleName = normalizeValue(req.body.module || '');
  const name = normalizeValue(req.body.name || '');
  if (!category || !moduleName || !name) {
    return res.status(400).json({ error: 'category, module and name are required' });
  }

  try {
    const existingTopic = await Topic.findOne({ category, module: moduleName, name }).lean();
    if (existingTopic) {
      return res.json({ topic: existingTopic, alreadyExists: true });
    }

    const createdTopic = await Topic.create({
      category,
      module: moduleName,
      name,
      createdBy: req.user?.username || ''
    });

    return res.status(201).json({ topic: createdTopic.toObject() });
  } catch (err) {
    if (err?.code === 11000) {
      const topicDoc = await Topic.findOne({ category, module: moduleName, name }).lean();
      return res.json({ topic: topicDoc, alreadyExists: true });
    }
    return res.status(500).json({ error: 'Failed to create topic' });
  }
});

router.delete('/topics', authenticateToken('admin'), async (req, res) => {
  const category = normalizeValue(req.body.category || '');
  const moduleName = normalizeValue(req.body.module || '');
  const name = normalizeValue(req.body.name || '');
  if (!category || !moduleName || !name) {
    return res.status(400).json({ error: 'category, module and name are required' });
  }

  try {
    const [topicDeleteResult, videoDeleteResult, quizDeleteResult, topicTestDeleteResult, mockExamDeleteResult, fullMockDeleteResult] = await Promise.all([
      Topic.deleteOne({ category, module: moduleName, name }),
      Video.deleteMany({ category, module: moduleName, topic: name }),
      Quiz.deleteMany({ category, module: moduleName, topic: name }),
      TopicTest.deleteMany({ category, module: moduleName, topic: name }),
      MockExam.deleteMany({ category, module: moduleName, topic: name }),
      FullMockTest.deleteMany({ category, module: moduleName, topic: name })
    ]);
    return res.json({
      message: 'Topic removed',
      deleted: {
        topics: Number(topicDeleteResult?.deletedCount || 0),
        videos: Number(videoDeleteResult?.deletedCount || 0),
        quizzes: Number(quizDeleteResult?.deletedCount || 0),
        topicTests: Number(topicTestDeleteResult?.deletedCount || 0),
        mockExams: Number(mockExamDeleteResult?.deletedCount || 0),
        fullMocks: Number(fullMockDeleteResult?.deletedCount || 0)
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to remove topic' });
  }
});

router.get('/', authenticateToken('admin'), async (req, res) => {
  try {
    const category = normalizeValue(req.query.category || '');
    const filter = category ? { category } : {};
    const modules = await Module.find(filter).sort({ category: 1, name: 1 }).lean();
    return res.json({ modules });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch modules' });
  }
});

router.post('/', authenticateToken('admin'), async (req, res) => {
  const category = normalizeValue(req.body.category || '');
  const name = normalizeValue(req.body.name || '');
  const batch = normalizeValue(req.body.batch || '');
  if (!category || !name) {
    return res.status(400).json({ error: 'category and name are required' });
  }

  try {
    const existingModule = await Module.findOne({ category, name, batch }).lean();
    if (existingModule) {
      return res.json({ module: existingModule, alreadyExists: true });
    }

    const createdModule = await Module.create({
      category,
      name,
      batch,
      createdBy: req.user?.username || ''
    });

    return res.status(201).json({ module: createdModule.toObject() });
  } catch (err) {
    if (err?.code === 11000) {
      const moduleDoc = await Module.findOne({ category, name }).lean();
      return res.json({ module: moduleDoc, alreadyExists: true });
    }
    return res.status(500).json({ error: 'Failed to create module' });
  }
});

router.delete('/', authenticateToken('admin'), async (req, res) => {
  const category = normalizeValue(req.body.category || '');
  const name = normalizeValue(req.body.name || '');
  const batch = normalizeValue(req.body.batch || '');
  const hasBatchFilter = Boolean(batch);
  if (!category || !name) {
    return res.status(400).json({ error: 'category and name are required' });
  }

  try {
    const scopedFilter = withOptionalBatch({ category, module: name }, hasBatchFilter ? batch : '');
    const moduleScopedFilter = withOptionalBatch({ category, name }, hasBatchFilter ? batch : '');
    const pricingScopedFilter = withOptionalBatch({ category, moduleName: name }, hasBatchFilter ? batch : '');

    const topicDeletion = hasBatchFilter
      ? Promise.resolve({ deletedCount: 0 })
      : Topic.deleteMany({ category, module: name });

    const [moduleDeleteResult, topicDeleteResult, pricingDeleteResult, videoDeleteResult, quizDeleteResult, topicTestDeleteResult, mockExamDeleteResult, fullMockDeleteResult] = await Promise.all([
      Module.deleteMany(moduleScopedFilter),
      topicDeletion,
      ModulePricing.deleteMany(pricingScopedFilter),
      Video.deleteMany(scopedFilter),
      Quiz.deleteMany(scopedFilter),
      TopicTest.deleteMany(scopedFilter),
      MockExam.deleteMany(scopedFilter),
      FullMockTest.deleteMany(scopedFilter)
    ]);

    return res.json({
      message: 'Module removed',
      deleted: {
        modules: Number(moduleDeleteResult?.deletedCount || 0),
        topics: Number(topicDeleteResult?.deletedCount || 0),
        pricingRows: Number(pricingDeleteResult?.deletedCount || 0),
        videos: Number(videoDeleteResult?.deletedCount || 0),
        quizzes: Number(quizDeleteResult?.deletedCount || 0),
        topicTests: Number(topicTestDeleteResult?.deletedCount || 0),
        mockExams: Number(mockExamDeleteResult?.deletedCount || 0),
        fullMocks: Number(fullMockDeleteResult?.deletedCount || 0)
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to remove module' });
  }
});

router.put('/topics/rename', authenticateToken('admin'), async (req, res) => {
  const category = normalizeValue(req.body.category || '');
  const moduleName = normalizeValue(req.body.module || '');
  const oldName = normalizeValue(req.body.oldName || '');
  const newName = normalizeValue(req.body.newName || '');
  if (!category || !moduleName || !oldName || !newName) {
    return res.status(400).json({ error: 'category, module, oldName and newName are required' });
  }
  if (oldName === newName) return res.json({ message: 'No change' });

  try {
    const existing = await Topic.findOne({ category, module: moduleName, name: newName }).lean();
    if (existing) return res.status(409).json({ error: 'A topic with this name already exists in this module' });

    await Topic.updateOne({ category, module: moduleName, name: oldName }, { $set: { name: newName } });
    await Video.updateMany({ category, module: moduleName, topic: oldName }, { $set: { topic: newName } });
    return res.json({ message: 'Topic renamed' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to rename topic' });
  }
});

router.put('/rename', authenticateToken('admin'), async (req, res) => {
  const category = normalizeValue(req.body.category || '');
  const oldName = normalizeValue(req.body.oldName || '');
  const newName = normalizeValue(req.body.newName || '');
  const batch = normalizeValue(req.body.batch || 'General') || 'General';
  if (!category || !oldName || !newName) {
    return res.status(400).json({ error: 'category, oldName and newName are required' });
  }
  if (oldName === newName) return res.json({ message: 'No change' });

  try {
    const existing = await Module.findOne({ category, name: newName, batch }).lean();
    if (existing) return res.status(409).json({ error: 'A module with this name already exists' });

    await Module.updateOne({ category, name: oldName, batch }, { $set: { name: newName } });
    await Topic.updateMany({ category, module: oldName }, { $set: { module: newName } });
    await Video.updateMany({ category, module: oldName }, { $set: { module: newName } });
    await ModulePricing.updateOne({ category, batch, moduleName: oldName }, { $set: { moduleName: newName } });
    return res.json({ message: 'Module renamed' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to rename module' });
  }
});

module.exports = router;
