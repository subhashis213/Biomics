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

// GET /live/status — any authenticated user checks if a class is active or scheduled
router.get('/status', authenticateToken(), async (req, res) => {
  try {
    const activeClass = await LiveClass.findOne({ isActive: true }).sort({ startedAt: -1 }).lean();
    if (activeClass) {
      return res.json({
        active: true,
        title: activeClass.title,
        meetUrl: activeClass.meetUrl,
        startedAt: activeClass.startedAt
      });
    }
    // Check for the next upcoming scheduled class
    const upcoming = await LiveClass
      .findOne({ isScheduled: true, isActive: false, scheduledAt: { $gt: new Date() } })
      .sort({ scheduledAt: 1 })
      .lean();
    return res.json({
      active: false,
      upcoming: upcoming ? {
        _id: upcoming._id,
        title: upcoming.title,
        scheduledAt: upcoming.scheduledAt,
        meetUrl: upcoming.meetUrl || null
      } : null
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get live class status' });
  }
});

// POST /live/schedule — admin schedules an upcoming class
router.post('/schedule', authenticateToken('admin'), async (req, res) => {
  const title = String(req.body.title || '').trim() || 'Live Class';
  const meetUrl = String(req.body.meetUrl || '').trim();
  const scheduledAt = req.body.scheduledAt ? new Date(req.body.scheduledAt) : null;

  if (!scheduledAt || isNaN(scheduledAt.getTime())) {
    return res.status(400).json({ error: 'A valid scheduled date and time is required' });
  }
  if (scheduledAt.getTime() <= Date.now()) {
    return res.status(400).json({ error: 'Scheduled time must be in the future' });
  }
  if (meetUrl && !isValidMeetUrl(meetUrl)) {
    return res.status(400).json({ error: 'A valid Google Meet link (https://meet.google.com/...) is required' });
  }

  try {
    // Replace any existing pending scheduled class
    await LiveClass.deleteMany({ isScheduled: true, isActive: false });
    const scheduled = await LiveClass.create({
      title,
      meetUrl: meetUrl || '',
      isActive: false,
      isScheduled: true,
      scheduledAt
    });
    return res.status(201).json({
      _id: scheduled._id,
      title: scheduled.title,
      meetUrl: scheduled.meetUrl,
      scheduledAt: scheduled.scheduledAt
    });
  } catch (err) {
    console.error('[schedule] error:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to schedule class' });
  }
});

// DELETE /live/schedule — admin cancels the scheduled class
router.delete('/schedule', authenticateToken('admin'), async (req, res) => {
  try {
    await LiveClass.deleteMany({ isScheduled: true, isActive: false });
    return res.json({ message: 'Scheduled class cancelled' });
  } catch (err) {
    console.error('[cancel-schedule] error:', err.message);
    return res.status(500).json({ error: err.message || 'Failed to cancel scheduled class' });
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
