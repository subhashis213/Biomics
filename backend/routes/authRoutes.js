const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const User = require('../models/User');
const Admin = require('../models/Admin');
const LoginOtp = require('../models/LoginOtp');
const { logAdminAction } = require('../utils/auditLog');
const { authenticateToken, JWT_SECRET, JWT_EXPIRES_IN } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const router = express.Router();

const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES || 5);
const OTP_COOLDOWN_SECONDS = Number(process.env.OTP_COOLDOWN_SECONDS || 45);
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashOtp(phone, otp) {
  const otpSecret = process.env.OTP_SECRET || JWT_SECRET;
  return crypto.createHash('sha256').update(`${phone}:${otp}:${otpSecret}`).digest('hex');
}

async function sendOtpSms(phone, otp) {
  const provider = String(process.env.SMS_PROVIDER || '').toLowerCase();
  const dryRun = String(process.env.SMS_DRY_RUN || '').toLowerCase() === 'true';

  if (!provider || provider === 'none' || dryRun) {
    console.log(`OTP for ${phone}: ${otp}`);
    return;
  }

  if (provider === 'twilio') {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER;
    const countryCode = String(process.env.SMS_COUNTRY_CODE || '+91').trim();
    const to = phone.startsWith('+') ? phone : `${countryCode}${phone}`;

    if (!accountSid || !authToken || !from) {
      throw new Error('Twilio credentials are missing');
    }

    const body = new URLSearchParams({
      To: to,
      From: from,
      Body: `Your Biomics Hub OTP is ${otp}. It is valid for ${OTP_EXPIRY_MINUTES} minutes.`
    });

    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    });

    if (!response.ok) {
      const payload = await response.text();
      throw new Error(`Twilio send failed (${response.status}): ${payload}`);
    }
    return;
  }

  // Placeholder for real SMS provider integration.
  // Keep provider disabled until concrete API credentials and payload contract are configured.
  console.log(`SMS provider '${provider}' configured, but no adapter is implemented yet. OTP for ${phone}: ${otp}`);
}

const registerSchema = z.object({
  phone: z.string().min(1).max(20),
  username: z.string().min(1).max(50),
  class: z.string().min(1).max(50),
  city: z.string().min(1).max(50),
  password: z.string().min(6, 'Password must be at least 6 characters')
});

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required')
});

const sendOtpSchema = z.object({
  phone: z.string().min(10, 'Valid phone number is required').max(20)
});

const verifyOtpSchema = z.object({
  phone: z.string().min(10, 'Valid phone number is required').max(20),
  otp: z.string().length(6, 'OTP must be 6 digits')
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

router.post('/send-otp', validate(sendOtpSchema), async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  if (!/^\d{10}$/.test(phone)) {
    return res.status(400).json({ error: 'Enter a valid 10-digit phone number' });
  }

  try {
    const user = await User.findOne({ phone }).lean();
    if (!user) return res.status(404).json({ error: 'User not found for this mobile number' });

    const now = new Date();
    const existingOtp = await LoginOtp.findOne({ phone });
    if (existingOtp?.lastSentAt) {
      const diffSeconds = Math.floor((now.getTime() - existingOtp.lastSentAt.getTime()) / 1000);
      if (diffSeconds < OTP_COOLDOWN_SECONDS) {
        return res.status(429).json({ error: `Please wait ${OTP_COOLDOWN_SECONDS - diffSeconds}s before requesting another OTP` });
      }
    }

    const otp = generateOtp();
    const otpHash = hashOtp(phone, otp);
    const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await LoginOtp.findOneAndUpdate(
      { phone },
      {
        $set: {
          otpHash,
          expiresAt,
          attempts: 0,
          lastSentAt: now,
          used: false
        },
        $inc: { resendCount: 1 }
      },
      { new: true, upsert: true }
    );

    await sendOtpSms(phone, otp);
    return res.json({
      message: 'OTP sent successfully',
      cooldownSeconds: OTP_COOLDOWN_SECONDS,
      ...(process.env.NODE_ENV !== 'production' ? { devOtp: otp } : {})
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to send OTP' });
  }
});

router.post('/verify-otp', validate(verifyOtpSchema), async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const otp = String(req.body.otp || '').trim();

  if (!/^\d{10}$/.test(phone) || !/^\d{6}$/.test(otp)) {
    return res.status(400).json({ error: 'Invalid phone number or OTP format' });
  }

  try {
    const user = await User.findOne({ phone });
    if (!user) return res.status(400).json({ error: 'User not found' });

    const otpRecord = await LoginOtp.findOne({ phone });
    if (!otpRecord || otpRecord.used) {
      return res.status(400).json({ error: 'OTP not found. Please request a new OTP' });
    }

    if (otpRecord.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: 'OTP expired. Please request a new OTP' });
    }

    if (otpRecord.attempts >= OTP_MAX_ATTEMPTS) {
      return res.status(429).json({ error: 'Too many invalid attempts. Request a new OTP' });
    }

    const incomingHash = hashOtp(phone, otp);
    if (incomingHash !== otpRecord.otpHash) {
      otpRecord.attempts += 1;
      await otpRecord.save();
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    otpRecord.used = true;
    await otpRecord.save();

    const token = jwt.sign(
      { username: user.username, role: 'user' },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.json({
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
    return res.status(500).json({ error: 'OTP verification failed' });
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
