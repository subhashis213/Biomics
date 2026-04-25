const express = require('express');
const StudentVoice = require('../models/StudentVoice');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

function sanitizeVoice(doc = {}) {
  return {
    _id: doc._id,
    name: String(doc.name || '').trim(),
    role: String(doc.role || '').trim(),
    message: String(doc.message || '').trim(),
    rating: Math.max(1, Math.min(5, Number(doc.rating || 5))),
    avatarUrl: String(doc.avatarUrl || '').trim(),
    active: doc.active !== false,
    sortOrder: Number(doc.sortOrder || 0),
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null
  };
}

router.get('/student-voices', async (req, res) => {
  try {
    const docs = await StudentVoice.find({ active: true })
      .sort({ sortOrder: 1, createdAt: -1 })
      .limit(100)
      .lean();
    return res.json({ voices: docs.map(sanitizeVoice) });
  } catch {
    return res.status(500).json({ error: 'Failed to load student voices.' });
  }
});

router.get('/student-voices/admin', authenticateToken('admin'), async (req, res) => {
  try {
    const docs = await StudentVoice.find({})
      .sort({ sortOrder: 1, createdAt: -1 })
      .limit(200)
      .lean();
    return res.json({ voices: docs.map(sanitizeVoice) });
  } catch {
    return res.status(500).json({ error: 'Failed to load student voices.' });
  }
});

router.post('/student-voices/admin', authenticateToken('admin'), async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const message = String(req.body?.message || '').trim();
    const role = String(req.body?.role || '').trim();
    const rating = Math.max(1, Math.min(5, Number(req.body?.rating || 5)));
    const avatarUrl = String(req.body?.avatarUrl || '').trim();
    const active = req.body?.active !== false;
    const sortOrder = Number.isFinite(Number(req.body?.sortOrder)) ? Number(req.body.sortOrder) : 0;

    if (!name || !message) {
      return res.status(400).json({ error: 'Name and message are required.' });
    }

    await StudentVoice.create({
      name,
      role,
      message,
      rating,
      avatarUrl,
      active,
      sortOrder,
      createdBy: String(req.user?.username || '').trim(),
      updatedBy: String(req.user?.username || '').trim()
    });

    const docs = await StudentVoice.find({}).sort({ sortOrder: 1, createdAt: -1 }).lean();
    return res.status(201).json({ voices: docs.map(sanitizeVoice) });
  } catch {
    return res.status(500).json({ error: 'Failed to create student voice.' });
  }
});

router.patch('/student-voices/admin/:id', authenticateToken('admin'), async (req, res) => {
  try {
    const voiceId = String(req.params?.id || '').trim();
    if (!voiceId) return res.status(400).json({ error: 'Voice ID is required.' });

    const voice = await StudentVoice.findById(voiceId);
    if (!voice) return res.status(404).json({ error: 'Student voice not found.' });

    if (req.body?.name != null) voice.name = String(req.body.name).trim();
    if (req.body?.role != null) voice.role = String(req.body.role).trim();
    if (req.body?.message != null) voice.message = String(req.body.message).trim();
    if (req.body?.avatarUrl != null) voice.avatarUrl = String(req.body.avatarUrl).trim();
    if (req.body?.rating != null) voice.rating = Math.max(1, Math.min(5, Number(req.body.rating || 5)));
    if (req.body?.active != null) voice.active = req.body.active !== false;
    if (req.body?.sortOrder != null && Number.isFinite(Number(req.body.sortOrder))) {
      voice.sortOrder = Number(req.body.sortOrder);
    }
    voice.updatedBy = String(req.user?.username || '').trim();

    if (!String(voice.name || '').trim() || !String(voice.message || '').trim()) {
      return res.status(400).json({ error: 'Name and message are required.' });
    }

    await voice.save();
    const docs = await StudentVoice.find({}).sort({ sortOrder: 1, createdAt: -1 }).lean();
    return res.json({ voices: docs.map(sanitizeVoice) });
  } catch {
    return res.status(500).json({ error: 'Failed to update student voice.' });
  }
});

router.delete('/student-voices/admin/:id', authenticateToken('admin'), async (req, res) => {
  try {
    const voiceId = String(req.params?.id || '').trim();
    if (!voiceId) return res.status(400).json({ error: 'Voice ID is required.' });
    await StudentVoice.findByIdAndDelete(voiceId);
    const docs = await StudentVoice.find({}).sort({ sortOrder: 1, createdAt: -1 }).lean();
    return res.json({ voices: docs.map(sanitizeVoice) });
  } catch {
    return res.status(500).json({ error: 'Failed to delete student voice.' });
  }
});

module.exports = router;
