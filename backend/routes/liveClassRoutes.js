const express = require('express');
const LiveClass = require('../models/LiveClass');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const { logAdminAction } = require('../utils/auditLog');
const { ALL_MODULES, getActiveCourseMembership, getActiveModuleMembership, hasCourseAccess, normalizeCourseName } = require('../utils/courseAccess');
const GENERAL_BATCH = 'General';

function normalizeBatchName(value) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return GENERAL_BATCH;
  const key = normalized.toLowerCase();
  if (key === 'general' || key === 'all' || key === 'all batches') return GENERAL_BATCH;
  return normalized;
}


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

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeUsernameList(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => normalizeUsername(value))
    .filter(Boolean))];
}

async function canUserDiscoverClass(user, liveClass) {
  const targetCourse = normalizeCourseName(liveClass?.course);
  if (!targetCourse) return true;

  if (await hasCourseAccess(user, targetCourse)) return true;

  const enrolledCourse = normalizeCourseName(user?.class);
  return Boolean(enrolledCourse) && enrolledCourse === targetCourse;
}

async function canUserAccessClass(user, liveClass) {
  const username = normalizeUsername(user?.username);
  const removedUsernames = normalizeUsernameList(liveClass?.removedUsernames || []);
  if (username && removedUsernames.includes(username)) return false;

  const allowedUsernames = normalizeUsernameList(liveClass?.allowedUsernames || []);
  if (username && allowedUsernames.includes(username)) return true;

  const targetCourse = normalizeCourseName(liveClass?.course);
  const targetBatch = normalizeBatchName(liveClass?.batch);
  if (!targetCourse) return true;

  if (!await hasCourseAccess(user, targetCourse)) {
    const enrolledCourse = normalizeCourseName(user?.class);
    if (!(Boolean(enrolledCourse) && enrolledCourse === targetCourse)) {
      return false;
    }
  }

  if (targetBatch === GENERAL_BATCH) return true;

  if (getActiveModuleMembership(user, targetCourse, targetBatch)) return true;
  if (getActiveModuleMembership(user, targetCourse, ALL_MODULES)) return true;

  return false;
}

async function loadCurrentUser(username) {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) return null;
  return User.findOne({ username: new RegExp(`^${normalizedUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).lean();
}

function serializeStatusClass(liveClass, options = {}) {
  if (!liveClass) return null;

  return {
    _id: String(liveClass._id || ''),
    title: String(liveClass.title || '').trim(),
    description: String(liveClass.description || '').trim(),
    course: String(liveClass.course || '').trim(),
    batch: normalizeBatchName(liveClass.batch),
    meetUrl: String(liveClass.meetUrl || '').trim(),
    startedAt: liveClass.startedAt || null,
    scheduledAt: liveClass.scheduledAt || null,
    status: String(liveClass.status || '').trim() || (liveClass.isActive ? 'live' : liveClass.isScheduled ? 'scheduled' : 'ended'),
    isLocked: Boolean(options.isLocked),
    lockMessage: options.isLocked ? 'Unlock the course content to enter this live class room.' : ''
  };
}

// GET /live/status — any authenticated user checks if a class is active or scheduled
router.get('/status', authenticateToken(), async (req, res) => {
  try {
    const role = String(req.user?.role || 'user').trim();
    const currentUser = role === 'admin' ? null : await loadCurrentUser(req.user?.username);
    const activeClass = await LiveClass.findOne({ $or: [{ isActive: true }, { status: 'live' }] }).sort({ startedAt: -1, updatedAt: -1 }).lean();
    if (activeClass && role === 'admin') {
      const serialized = serializeStatusClass(activeClass);
      return res.json({
        active: true,
        title: serialized.title,
        meetUrl: serialized.meetUrl,
        startedAt: serialized.startedAt,
        activeClass: serialized,
        lockedActiveClass: null,
        upcoming: null
      });
    }

    if (activeClass && currentUser) {
      const canAccessActiveClass = await canUserAccessClass(currentUser, activeClass);
      if (canAccessActiveClass) {
        const serialized = serializeStatusClass(activeClass);
        return res.json({
          active: true,
          title: serialized.title,
          meetUrl: serialized.meetUrl,
          startedAt: serialized.startedAt,
          activeClass: serialized,
          lockedActiveClass: null,
          upcoming: null
        });
      }

      if (await canUserDiscoverClass(currentUser, activeClass)) {
        return res.json({
          active: false,
          activeClass: null,
          lockedActiveClass: serializeStatusClass(activeClass, { isLocked: true }),
          upcoming: null
        });
      }
    }

    // Check for the next upcoming scheduled class
    const upcoming = await LiveClass
      .findOne({ isScheduled: true, isActive: false, status: 'scheduled', scheduledAt: { $gt: new Date() } })
      .sort({ scheduledAt: 1 })
      .lean();

    const canAccessUpcoming = role === 'admin' || (currentUser && upcoming && canUserAccessClass(currentUser, upcoming));
    const resolvedUpcomingAccess = role === 'admin' || Boolean(currentUser && upcoming && await canUserAccessClass(currentUser, upcoming));
    const serializedUpcoming = upcoming && resolvedUpcomingAccess ? serializeStatusClass(upcoming) : null;

    return res.json({
      active: false,
      activeClass: null,
      lockedActiveClass: null,
      upcoming: serializedUpcoming
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
    await logAdminAction(req, { action: 'SCHEDULE_LIVE_CLASS', targetType: 'LiveClass', targetId: String(scheduled._id), details: { title, scheduledAt } });
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
    await logAdminAction(req, { action: 'CANCEL_SCHEDULED_CLASS', targetType: 'LiveClass', targetId: '', details: {} });
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
    await logAdminAction(req, { action: 'START_LIVE_CLASS', targetType: 'LiveClass', targetId: String(liveClass._id), details: { title, meetUrl } });
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
    await logAdminAction(req, { action: 'END_LIVE_CLASS', targetType: 'LiveClass', targetId: '', details: { ended: result.modifiedCount } });
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
