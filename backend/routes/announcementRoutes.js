const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const Announcement = require('../models/Announcement');

const router = express.Router();

// Student + admin: list active announcements.
router.get('/', authenticateToken('user'), async (req, res) => {
  try {
    const announcements = await Announcement.find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.json({ announcements });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch announcements.' });
  }
});

// Admin: list all announcements (active + inactive).
router.get('/admin', authenticateToken('admin'), async (req, res) => {
  try {
    const announcements = await Announcement.find({})
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return res.json({ announcements });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch admin announcements.' });
  }
});

// Admin: create announcement.
router.post('/', authenticateToken('admin'), async (req, res) => {
  try {
    const title = String(req.body?.title || '').trim();
    const message = String(req.body?.message || '').trim();

    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required.' });
    }

    const announcement = await Announcement.create({
      title,
      message,
      isActive: req.body?.isActive !== false,
      createdBy: req.user?.username || ''
    });

    return res.status(201).json({
      message: 'Announcement published.',
      announcement
    });
  } catch {
    return res.status(500).json({ error: 'Failed to create announcement.' });
  }
});

// Admin: toggle active status.
router.patch('/:id', authenticateToken('admin'), async (req, res) => {
  try {
    const isActive = req.body?.isActive !== false;

    const announcement = await Announcement.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          isActive,
          updatedAt: new Date()
        }
      },
      { new: true }
    ).lean();

    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found.' });
    }

    return res.json({
      message: isActive ? 'Announcement enabled.' : 'Announcement disabled.',
      announcement
    });
  } catch {
    return res.status(500).json({ error: 'Failed to update announcement.' });
  }
});

// Admin: delete announcement.
router.delete('/:id', authenticateToken('admin'), async (req, res) => {
  try {
    const deleted = await Announcement.findByIdAndDelete(req.params.id).lean();
    if (!deleted) {
      return res.status(404).json({ error: 'Announcement not found.' });
    }

    return res.json({ message: 'Announcement deleted.' });
  } catch {
    return res.status(500).json({ error: 'Failed to delete announcement.' });
  }
});

module.exports = router;
