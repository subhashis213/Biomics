const express = require('express');
const router = express.Router();
const Module = require('../models/Module');
const { authenticateToken } = require('../middleware/auth');

function normalizeValue(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

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
  if (!category || !name) {
    return res.status(400).json({ error: 'category and name are required' });
  }

  try {
    const existingModule = await Module.findOne({ category, name }).lean();
    if (existingModule) {
      return res.json({ module: existingModule, alreadyExists: true });
    }

    const createdModule = await Module.create({
      category,
      name,
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
    return res.json({ message: 'Module removed' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to remove module' });
  }
});

module.exports = router;
