const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const { v2: cloudinary } = require('cloudinary');
const { z } = require('zod');
const User = require('../models/User');
const Admin = require('../models/Admin');
const LoginOtp = require('../models/LoginOtp');
const AuditLog = require('../models/AuditLog');
const { logAdminAction } = require('../utils/auditLog');
const { authenticateToken, JWT_SECRET, JWT_EXPIRES_IN } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const router = express.Router();

const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES || 5);
const OTP_COOLDOWN_SECONDS = Number(process.env.OTP_COOLDOWN_SECONDS || 45);
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);
const uploadsDir = path.join(__dirname, '../uploads');

const cloudinaryCloudName = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
const cloudinaryApiKey = String(process.env.CLOUDINARY_API_KEY || '').trim();
const cloudinaryApiSecret = String(process.env.CLOUDINARY_API_SECRET || '').trim();
const hasCloudinaryConfig = !!(cloudinaryCloudName && cloudinaryApiKey && cloudinaryApiSecret);

if (hasCloudinaryConfig) {
  cloudinary.config({
    cloud_name: cloudinaryCloudName,
    api_key: cloudinaryApiKey,
    api_secret: cloudinaryApiSecret,
    secure: true
  });
}

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeBase = path.basename(file.originalname || 'avatar', ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `avatar-${Date.now()}-${safeBase}${ext || '.jpg'}`);
  }
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if ((file.mimetype || '').startsWith('image/')) return cb(null, true);
    return cb(new Error('Only image files are allowed for profile photo'));
  }
});

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeBirthDate(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function isBcryptHash(value) {
  return typeof value === 'string' && /^\$2[aby]\$\d{2}\$.{53}$/.test(value);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildAvatarUrl(user) {
  const cloudAvatarUrl = String(user?.avatar?.url || '').trim();
  if (cloudAvatarUrl) return cloudAvatarUrl;

  const rawFilename = user?.avatar?.filename;
  if (!rawFilename) return '';
  const filename = path.basename(String(rawFilename));
  return filename ? `/uploads/${encodeURIComponent(filename)}` : '';
}

function resolveAvatarState(user) {
  const cloudAvatarUrl = String(user?.avatar?.url || '').trim();
  if (cloudAvatarUrl) {
    return { avatarUrl: cloudAvatarUrl, stale: false };
  }

  const rawFilename = user?.avatar?.filename;
  if (!rawFilename) {
    return { avatarUrl: '', stale: false };
  }

  const filename = path.basename(String(rawFilename));
  const avatarPath = path.join(uploadsDir, filename);
  if (!fs.existsSync(avatarPath)) {
    return { avatarUrl: '', stale: true };
  }

  return {
    avatarUrl: `/uploads/${encodeURIComponent(filename)}`,
    stale: false
  };
}

function safelyRemoveFile(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (_) {
    // Non-fatal cleanup error.
  }
}

async function uploadAvatarToCloudinary(localPath) {
  if (!hasCloudinaryConfig) return null;
  if (!localPath) throw new Error('Avatar upload path is missing');

  const uploadResult = await cloudinary.uploader.upload(localPath, {
    folder: 'biomicshub/avatars',
    resource_type: 'image',
    overwrite: true
  });

  return {
    url: String(uploadResult?.secure_url || '').trim(),
    publicId: String(uploadResult?.public_id || '').trim()
  };
}

async function deleteAvatarFromCloudinary(publicId) {
  const normalizedPublicId = String(publicId || '').trim();
  if (!hasCloudinaryConfig || !normalizedPublicId) return;
  try {
    await cloudinary.uploader.destroy(normalizedPublicId, { resource_type: 'image' });
  } catch (_) {
    // Non-fatal cleanup error.
  }
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
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Birth date is required'),
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

const forgotPasswordSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Birth date is required'),
  password: z.string().min(8, 'Password must be at least 8 characters')
});

const updateProfileSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(50).optional(),
  phone: z.string().regex(/^\d{10}$/, 'Phone number must be exactly 10 digits').optional(),
  city: z.string().min(2, 'City must be at least 2 characters').max(50).optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional()
});

// Check if username exists
router.post('/check-username', async (req, res) => {
  const { username } = req.body;
  if (!username || typeof username !== 'string') {
    return res.status(400).json({ error: 'Username is required' });
  }
  try {
    const normalizedUsername = String(username).trim();
    const user = await User.findOne({ username: new RegExp(`^${escapeRegex(normalizedUsername)}$`, 'i') }).lean();
    res.json({ exists: !!user });
  } catch (err) {
    res.status(500).json({ error: 'Check failed' });
  }
});

// User Registration
router.post('/register', validate(registerSchema), async (req, res) => {
  const { phone, username, class: userClass, city, birthDate, password } = req.body;
  if (!phone || !username || !userClass || !city || !birthDate || !password) return res.status(400).json({ error: 'All fields required' });
  try {
    const normalizedPhone = String(phone).trim();
    const normalizedUsername = String(username).trim();
    const normalizedClass = String(userClass).trim();
    const normalizedCity = String(city).trim();
    const normalizedBirthDate = normalizeBirthDate(birthDate);

    if (!normalizedBirthDate) {
      return res.status(400).json({ error: 'Invalid birth date' });
    }

    const exists = await User.findOne({ $or: [{ phone: normalizedPhone }, { username: normalizedUsername }] }).lean();
    if (exists) return res.status(400).json({ error: 'User already exists' });
    
    const normalizedPassword = String(password).trim();
    if (normalizedPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const user = new User({
      phone: normalizedPhone,
      username: normalizedUsername,
      class: normalizedClass,
      city: normalizedCity,
      security: {
        question: 'What is your birth date?',
        birthDate: new Date(`${normalizedBirthDate}T00:00:00.000Z`)
      },
      password: normalizedPassword
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
    console.error('Registration error:', err.message);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/forgot-password', validate(forgotPasswordSchema), async (req, res) => {
  const { username, birthDate, password } = req.body;
  try {
    const normalizedUsername = String(username).trim();
    const user = await User.findOne({ username: new RegExp(`^${escapeRegex(normalizedUsername)}$`, 'i') });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const storedBirthDate = normalizeBirthDate(user.security?.birthDate);
    const incomingBirthDate = normalizeBirthDate(birthDate);
    if (!storedBirthDate || !incomingBirthDate || storedBirthDate !== incomingBirthDate) {
      return res.status(400).json({ error: 'Security answer is incorrect' });
    }

    const normalizedPassword = String(password).trim();
    if (normalizedPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    user.password = normalizedPassword;
    await user.save();

    // Defensive check: ensure stored password matches what user just set.
    const reloaded = await User.findById(user._id).select('password').lean();
    const verifyOk = reloaded?.password && await bcrypt.compare(normalizedPassword, String(reloaded.password));
    if (!verifyOk) {
      return res.status(500).json({ error: 'Password reset failed. Please try again.' });
    }

    return res.json({ message: 'Password reset successful. Please sign in with your new password.' });
  } catch (err) {
    console.error('Forgot password error:', err.message);
    return res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Student list for admin panel — admin only
router.get('/users', authenticateToken('admin'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;
    const search = String(req.query.search || '').trim();
    const filter = search
      ? { $or: [
          { username: new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
          { city: new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
        ] }
      : {};

    const [users, total] = await Promise.all([
      User.find(filter, { username: 1, class: 1, phone: 1, city: 1, createdAt: 1, _id: 0 })
        .sort({ username: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter)
    ]);
    res.json({ total, users, pagination: { page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Audit log viewer — admin only
router.get('/admin/audit-logs', authenticateToken('admin'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const filter = {};
    if (req.query.action) filter.action = new RegExp(String(req.query.action).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (req.query.actor) filter.actorUsername = new RegExp(String(req.query.actor).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    const [logs, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(filter)
    ]);

    return res.json({ logs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch audit logs.' });
  }
});

router.get('/me', authenticateToken('user'), async (req, res) => {
  try {
    const user = await User.findOne(
      { username: req.user.username },
      { username: 1, phone: 1, class: 1, city: 1, avatar: 1, _id: 0 }
    ).lean();

    if (!user) return res.status(404).json({ error: 'Student profile not found' });

    const avatarState = resolveAvatarState(user);
    if (avatarState.stale) {
      await User.updateOne(
        { username: user.username },
        { $set: { avatar: { url: '', publicId: '', filename: '', originalName: '' } } }
      );
    }

    return res.json({
      user: {
        username: user.username,
        phone: user.phone,
        class: user.class,
        city: user.city,
        avatarUrl: avatarState.avatarUrl
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

router.patch('/me', authenticateToken('user'), validate(updateProfileSchema), async (req, res) => {
  try {
    const user = await User.findOne({ username: req.user.username });
    if (!user) return res.status(404).json({ error: 'Student profile not found' });

    const nextUsername = req.body.username ? String(req.body.username).trim() : user.username;
    const nextPhone = req.body.phone ? normalizePhone(req.body.phone) : user.phone;
    const nextCity = req.body.city ? String(req.body.city).trim() : user.city;
    const nextPassword = req.body.password ? String(req.body.password).trim() : '';

    if (nextUsername !== user.username) {
      const existingByUsername = await User.findOne({ username: nextUsername }).lean();
      if (existingByUsername) return res.status(400).json({ error: 'Username already in use' });
      user.username = nextUsername;
    }

    if (nextPhone !== user.phone) {
      const existingByPhone = await User.findOne({ phone: nextPhone }).lean();
      if (existingByPhone) return res.status(400).json({ error: 'Phone number already in use' });
      user.phone = nextPhone;
    }

    user.city = nextCity;
    if (nextPassword) {
      if (nextPassword.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      user.password = nextPassword;
    }

    await user.save();

    const token = jwt.sign(
      { username: user.username, role: 'user' },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.json({
      message: 'Profile updated successfully',
      token,
      user: {
        username: user.username,
        phone: user.phone,
        class: user.class,
        city: user.city,
        avatarUrl: buildAvatarUrl(user)
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

router.post('/me/avatar', authenticateToken('user'), avatarUpload.single('avatar'), async (req, res) => {
  try {
    const user = await User.findOne({ username: req.user.username });
    if (!user) return res.status(404).json({ error: 'Student profile not found' });
    if (!req.file) return res.status(400).json({ error: 'Profile image is required' });

    const previousFilename = user.avatar?.filename;
    const previousPublicId = user.avatar?.publicId;

    let nextAvatar = {
      url: '',
      publicId: '',
      filename: req.file.filename,
      originalName: req.file.originalname || req.file.filename
    };

    if (hasCloudinaryConfig) {
      const uploadedToCloudinary = await uploadAvatarToCloudinary(req.file.path);
      if (!uploadedToCloudinary?.url) {
        return res.status(500).json({ error: 'Cloud avatar upload failed' });
      }
      nextAvatar = {
        url: uploadedToCloudinary.url,
        publicId: uploadedToCloudinary.publicId,
        filename: '',
        originalName: req.file.originalname || req.file.filename
      };
    }

    user.avatar = nextAvatar;
    await user.save();

    if (hasCloudinaryConfig) {
      safelyRemoveFile(req.file.path);
      await deleteAvatarFromCloudinary(previousPublicId);
    }

    if (previousFilename && previousFilename !== req.file.filename) {
      const previousPath = path.join(uploadsDir, path.basename(previousFilename));
      safelyRemoveFile(previousPath);
    }

    return res.json({
      message: 'Profile photo updated successfully',
      user: {
        username: user.username,
        phone: user.phone,
        class: user.class,
        city: user.city,
        avatarUrl: buildAvatarUrl(user)
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to update profile photo' });
  }
});

router.delete('/me/avatar', authenticateToken('user'), async (req, res) => {
  try {
    const user = await User.findOne({ username: req.user.username });
    if (!user) return res.status(404).json({ error: 'Student profile not found' });

    const previousFilename = user.avatar?.filename;
    const previousPublicId = user.avatar?.publicId;
    user.avatar = { url: '', publicId: '', filename: '', originalName: '' };
    await user.save();

    await deleteAvatarFromCloudinary(previousPublicId);

    if (previousFilename) {
      const previousPath = path.join(uploadsDir, path.basename(previousFilename));
      safelyRemoveFile(previousPath);
    }

    return res.json({
      message: 'Profile photo removed successfully',
      user: {
        username: user.username,
        phone: user.phone,
        class: user.class,
        city: user.city,
        avatarUrl: ''
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to remove profile photo' });
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
    const normalizedUsername = String(username).trim();
    const user = await User.findOne({ username: new RegExp(`^${escapeRegex(normalizedUsername)}$`, 'i') });
    if (!user) return res.status(400).json({ error: 'User not found' });

    const inputPassword = String(password);
    const storedPassword = String(user.password || '');
    const storedPasswordTrimmed = storedPassword.trim();
    const storedIsHash = isBcryptHash(storedPasswordTrimmed);

    let valid = false;
    if (storedIsHash) {
      valid = await bcrypt.compare(inputPassword, storedPasswordTrimmed);
      if (!valid && inputPassword !== inputPassword.trim()) {
        valid = await bcrypt.compare(inputPassword.trim(), storedPasswordTrimmed);
      }
    } else {
      valid = storedPasswordTrimmed === inputPassword.trim();
    }

    if (valid && !storedIsHash) {
      user.password = await bcrypt.hash(inputPassword.trim(), 10);
      await user.save();
    }

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
    const normalizedUsername = String(username).trim();
    const admin = await Admin.findOne({ username: new RegExp(`^${escapeRegex(normalizedUsername)}$`, 'i') });
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

router.use((err, req, res, next) => {
  if (!err) return next();
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message || 'Profile upload failed' });
  }
  return res.status(400).json({ error: err.message || 'Profile upload failed' });
});

module.exports = router;
