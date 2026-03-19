const express = require('express');
const LiveClass = require('../models/LiveClass');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Only allow meet.google.com links
function isValidMeetUrl(url) {
  try {
    const parsed = new URL(String(url || ''));
    return parsed.hostname === 'meet.google.com' && parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// GET /live/status — any authenticated user checks if a class is active
router.get('/status', authenticateToken(), async (req, res) => {
  try {
    const activeClass = await LiveClass.findOne({ isActive: true }).sort({ startedAt: -1 }).lean();
    if (!activeClass) return res.json({ active: false });
    return res.json({
      active: true,
      title: activeClass.title,
      meetUrl: activeClass.meetUrl,
      startedAt: activeClass.startedAt
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get live class status' });
  }
});

// POST /live/start — admin starts a live class
router.post('/start', authenticateToken('admin'), async (req, res) => {
  const title = String(req.body.title || '').trim() || 'Live Class';
  const meetUrl = String(req.body.meetUrl || '').trim();

  if (!isValidMeetUrl(meetUrl)) {
    return res.status(400).json({ error: 'A valid Google Meet link (https://meet.google.com/...) is required' });
  }

  try {
    // End any currently active classes first
    await LiveClass.updateMany({ isActive: true }, { $set: { isActive: false, endedAt: new Date() } });

    const liveClass = await LiveClass.create({ title, meetUrl });
    return res.status(201).json({
      active: true,
      title: liveClass.title,
      meetUrl: liveClass.meetUrl,
      startedAt: liveClass.startedAt
    });
  } catch (err) {
    console.error('Start live class error:', err.message);
    return res.status(500).json({ error: 'Failed to start live class' });
  }
});

// POST /live/end — admin ends the active live class
router.post('/end', authenticateToken('admin'), async (req, res) => {
  try {
    const result = await LiveClass.updateMany(
      { isActive: true },
      { $set: { isActive: false, endedAt: new Date() } }
    );
    return res.json({ message: 'Live class ended', ended: result.modifiedCount });
  } catch (err) {
    console.error('End live class error:', err.message);
    return res.status(500).json({ error: 'Failed to end live class' });
  }
});

// GET /live/history — admin views past sessions
router.get('/history', authenticateToken('admin'), async (req, res) => {
  try {
    const sessions = await LiveClass.find()
      .sort({ startedAt: -1 })
      .limit(20)
      .lean();
    return res.json({ sessions });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch history' });
  }
});

module.exports = router;
