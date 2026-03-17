const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const User = require('../models/User');
const Admin = require('../models/Admin');
const { logAdminAction } = require('../utils/auditLog');
const { authenticateToken, JWT_SECRET, JWT_EXPIRES_IN } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const router = express.Router();

const registerSchema = z.object({
  phone: z.string().min(1).max(20),
  username: z.string().min(1).max(50),
  class: z.string().min(1).max(20),
  city: z.string().min(1).max(50),
  password: z.string().min(6, 'Password must be at least 6 characters')
});

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required')
});

// User Registration
router.post('/register', validate(registerSchema), async (req, res) => {
  const { phone, username, class: userClass, city, password } = req.body;
  if (!phone || !username || !userClass || !city || !password) return res.status(400).json({ error: 'All fields required' });
  try {
    const normalizedPhone = String(phone).trim();
    const normalizedUsername = String(username).trim();
    const normalizedClass = String(userClass).trim();
    const normalizedCity = String(city).trim();

    const exists = await User.findOne({ $or: [{ phone: normalizedPhone }, { username: normalizedUsername }] }).lean();
    if (exists) return res.status(400).json({ error: 'User already exists' });
    const user = new User({
      phone: normalizedPhone,
      username: normalizedUsername,
      class: normalizedClass,
      city: normalizedCity,
      password
    });
    await user.save();
    res.status(201).json({
      message: 'User registered',
      user: {
        username: user.username,
        phone: user.phone,
        class: user.class,
        city: user.city
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Student list for admin panel — admin only
router.get('/users', authenticateToken('admin'), async (req, res) => {
  try {
    const users = await User.find({}, { username: 1, class: 1, phone: 1, city: 1, _id: 0 }).sort({ username: 1 }).lean();
    res.json({ total: users.length, users });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Remove a student user — admin only
router.delete('/users/:username', authenticateToken('admin'), async (req, res) => {
  const username = String(req.params.username || '').trim();
  if (!username) return res.status(400).json({ error: 'Username is required' });

  try {
    const deleted = await User.findOneAndDelete({ username });
    if (!deleted) return res.status(404).json({ error: 'User not found' });
    await logAdminAction(req, {
      action: 'user.remove',
      targetType: 'user',
      targetId: deleted.username,
      details: { class: deleted.class, city: deleted.city }
    });
    return res.json({ message: 'User removed successfully' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to remove user' });
  }
});

// User Login
router.post('/login', validate(loginSchema), async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'All fields required' });
  try {
    const user = await User.findOne({ username: String(username).trim() });
    if (!user) return res.status(400).json({ error: 'User not found' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: 'Invalid password' });
    const token = jwt.sign(
      { username: user.username, role: 'user' },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    res.json({
      message: 'Login successful',
      token,
      user: {
        username: user.username,
        phone: user.phone,
        class: user.class,
        city: user.city
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Admin Login
router.post('/admin-login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'All fields required' });
  try {
    const admin = await Admin.findOne({ username: String(username).trim() });
    if (!admin) return res.status(400).json({ error: 'Admin not found' });
    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) return res.status(400).json({ error: 'Invalid password' });
    const token = jwt.sign(
      { username: admin.username, role: 'admin' },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    res.json({
      message: 'Admin login successful',
      token,
      admin: {
        username: admin.username
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Admin login failed' });
  }
});

module.exports = router;
