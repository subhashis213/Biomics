const express = require('express');
const router = express.Router();
const Module = require('../models/Module');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken('admin'), async (req, res) => {
  try {
    const category = String(req.query.category || '').trim();
    const filter = category ? { category } : {};
    const modules = await Module.find(filter).sort({ category: 1, name: 1 }).lean();
    return res.json({ modules });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch modules' });
  }
});

router.post('/', authenticateToken('admin'), async (req, res) => {
  const category = String(req.body.category || '').trim();
  const name = String(req.body.name || '').trim();
  if (!category || !name) {
    return res.status(400).json({ error: 'category and name are required' });
  }

  try {
    const moduleDoc = await Module.findOneAndUpdate(
      { category, name },
      { $setOnInsert: { category, name, createdBy: req.user?.username || '' } },
      { upsert: true, new: true }
    ).lean();
    return res.status(201).json({ module: moduleDoc });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create module' });
  }
});

router.delete('/', authenticateToken('admin'), async (req, res) => {
  const category = String(req.body.category || '').trim();
  const name = String(req.body.name || '').trim();
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
