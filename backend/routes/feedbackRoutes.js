const express = require('express');
const mongoose = require('mongoose');
const { z } = require('zod');
const Feedback = require('../models/Feedback');
const { authenticateToken } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { logAdminAction } = require('../utils/auditLog');

const feedbackSchema = z.object({
  message: z.string().min(1, 'Feedback message is required').max(1000),
  rating: z.coerce.number().int().min(1, 'Rating must be between 1 and 5').max(5, 'Rating must be between 1 and 5')
});

const router = express.Router();

// Student creates feedback
router.post('/', authenticateToken('user'), validate(feedbackSchema), async (req, res) => {
  const { message, rating } = req.body;
  const trimmedMessage = String(message || '').trim();
  const numericRating = Number(rating);

  if (!trimmedMessage) {
    return res.status(400).json({ error: 'Feedback message is required' });
  }

  if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
    return res.status(400).json({ error: 'Rating must be between 1 and 5' });
  }

  try {
    const feedback = await Feedback.create({
      username: req.user.username,
      rating: numericRating,
      message: trimmedMessage
    });

    return res.status(201).json({
      message: 'Feedback submitted successfully',
      feedback: {
        username: feedback.username,
        rating: feedback.rating,
        message: feedback.message,
        createdAt: feedback.createdAt
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

// Admin reads feedback list
router.get('/', authenticateToken('admin'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [feedback, total] = await Promise.all([
      Feedback.find({}, { _id: 1, username: 1, rating: 1, message: 1, createdAt: 1 })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Feedback.countDocuments({})
    ]);

    return res.json({ total, feedback, pagination: { page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch feedback' });
  }
});

// Admin deletes feedback
router.delete('/:id', authenticateToken('admin'), async (req, res) => {
  try {
    const rawId = String(req.params.id || '');
    let deleted = null;

    if (mongoose.Types.ObjectId.isValid(rawId)) {
      deleted = await Feedback.findByIdAndDelete(rawId);
    } else if (rawId.startsWith('meta:')) {
      let parsed;
      try {
        parsed = JSON.parse(rawId.slice(5));
      } catch {
        return res.status(400).json({ error: 'Invalid feedback delete token.' });
      }

      const username = String(parsed?.u || '').trim();
      const createdAt = String(parsed?.c || '').trim();
      const message = String(parsed?.m || '').trim();

      if (!username || !createdAt) {
        return res.status(400).json({ error: 'Invalid feedback delete token.' });
      }

      deleted = await Feedback.findOneAndDelete({
        username,
        createdAt: new Date(createdAt),
        ...(message ? { message } : {})
      });
    }

    if (!deleted) {
      return res.status(404).json({ error: 'Feedback not found.' });
    }
    await logAdminAction(req, { action: 'DELETE_FEEDBACK', targetType: 'Feedback', targetId: String(deleted._id || ''), details: { username: deleted.username } });
    return res.json({ message: 'Feedback deleted.' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete feedback.' });
  }
});

// Admin deletes feedback by metadata (fallback when legacy list payload has no _id)
router.delete('/', authenticateToken('admin'), async (req, res) => {
  const { username, createdAt, message } = req.body || {};

  if (!username || !createdAt) {
    return res.status(400).json({ error: 'username and createdAt are required.' });
  }

  try {
    const filter = {
      username: String(username),
      createdAt: new Date(createdAt)
    };

    if (message) {
      filter.message = String(message);
    }

    const deleted = await Feedback.findOneAndDelete(filter);
    if (!deleted) {
      return res.status(404).json({ error: 'Feedback not found.' });
    }
    return res.json({ message: 'Feedback deleted.' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete feedback.' });
  }
});

module.exports = router;
