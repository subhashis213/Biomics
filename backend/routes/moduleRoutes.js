const express = require('express');
const router = express.Router();
const Module = require('../models/Module');
const Topic = require('../models/Topic');
const Video = require('../models/Video');
const ModulePricing = require('../models/ModulePricing');
const { authenticateToken } = require('../middleware/auth');

function normalizeValue(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
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
    await Topic.deleteOne({ category, module: moduleName, name });
    return res.json({ message: 'Topic removed' });
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
  if (!category || !name) {
    return res.status(400).json({ error: 'category and name are required' });
  }

  try {
    await Module.deleteOne({ category, name });
    await Topic.deleteMany({ category, module: name });
    await ModulePricing.deleteOne({ category, moduleName: name });
    return res.json({ message: 'Module removed' });
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
  if (!category || !oldName || !newName) {
    return res.status(400).json({ error: 'category, oldName and newName are required' });
  }
  if (oldName === newName) return res.json({ message: 'No change' });

  try {
    const existing = await Module.findOne({ category, name: newName }).lean();
    if (existing) return res.status(409).json({ error: 'A module with this name already exists' });

    await Module.updateOne({ category, name: oldName }, { $set: { name: newName } });
    await Topic.updateMany({ category, module: oldName }, { $set: { module: newName } });
    await Video.updateMany({ category, module: oldName }, { $set: { module: newName } });
    await ModulePricing.updateOne({ category, moduleName: oldName }, { $set: { moduleName: newName } });
    return res.json({ message: 'Module renamed' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to rename module' });
  }
});

module.exports = router;
