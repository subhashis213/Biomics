const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const DeviceToken = require('../models/DeviceToken');
const Announcement = require('../models/Announcement');
const { isConfigured, sendToTokens } = require('../utils/pushNotifications');

const router = express.Router();

// Authenticated as either a student or admin. We accept any valid token here
// (role is read from the verified payload) so both apps can register devices.
function authenticateAny(req, res, next) {
  const handler = authenticateToken();
  return handler(req, res, next);
}

// Register / refresh a device push token for the logged-in account.
router.post('/register', authenticateAny, async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    if (!token) return res.status(400).json({ error: 'Device token is required.' });
    const platform = String(req.body?.platform || 'android').trim().toLowerCase();
    const role = req.user?.role === 'admin' ? 'admin' : 'user';

    await DeviceToken.findOneAndUpdate(
      { token },
      {
        $set: {
          token,
          username: req.user.username,
          role,
          platform,
          lastSeenAt: new Date()
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.json({
      message: 'Device registered.',
      registered: true,
      role,
      pushConfigured: isConfigured()
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to register device.' });
  }
});

// Remove a device token (on logout).
router.post('/unregister', authenticateAny, async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    if (token) await DeviceToken.deleteOne({ token });
    return res.json({ message: 'Device unregistered.' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to unregister device.' });
  }
});

// Student/admin: list recent notifications (backed by announcements).
router.get('/', authenticateAny, async (req, res) => {
  try {
    const announcements = await Announcement.find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return res.json({ notifications: announcements });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch notifications.' });
  }
});

// Admin: send a push notification to students. Persists as an announcement so
// it also appears in the in-app notifications list.
router.post('/admin/send', authenticateToken('admin'), async (req, res) => {
  try {
    const title = String(req.body?.title || '').trim();
    const message = String(req.body?.message || '').trim();
    const audience = String(req.body?.audience || 'students').trim().toLowerCase();
    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required.' });
    }

    const announcement = await Announcement.create({
      title,
      message,
      isActive: true,
      createdBy: req.user?.username || ''
    });

    const roleFilter = audience === 'all' ? {} : { role: 'user' };
    const devices = await DeviceToken.find(roleFilter, { token: 1, _id: 0 }).lean();
    const tokens = devices.map((d) => d.token).filter(Boolean);

    const result = await sendToTokens(tokens, {
      title,
      body: message,
      data: { type: 'announcement', announcementId: String(announcement._id) }
    });

    // Prune tokens FCM reports as permanently invalid.
    if (Array.isArray(result.invalidTokens) && result.invalidTokens.length) {
      await DeviceToken.deleteMany({ token: { $in: result.invalidTokens } });
    }

    return res.status(201).json({
      message: result.configured
        ? `Notification sent to ${result.successCount} device(s).`
        : 'Saved as announcement. Push not sent — Firebase is not configured yet.',
      announcement,
      push: {
        configured: result.configured,
        successCount: result.successCount,
        failureCount: result.failureCount,
        targeted: tokens.length
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to send notification.' });
  }
});

// Admin: push diagnostics.
router.get('/admin/status', authenticateToken('admin'), async (req, res) => {
  try {
    const [studentDevices, adminDevices] = await Promise.all([
      DeviceToken.countDocuments({ role: 'user' }),
      DeviceToken.countDocuments({ role: 'admin' })
    ]);
    return res.json({
      pushConfigured: isConfigured(),
      studentDevices,
      adminDevices
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch push status.' });
  }
});

module.exports = router;
