const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const { v2: cloudinary } = require('cloudinary');
const { z } = require('zod');
const mongoose = require('mongoose');
const User = require('../models/User');
const Admin = require('../models/Admin');
const LoginOtp = require('../models/LoginOtp');
const AuditLog = require('../models/AuditLog');
const Video = require('../models/Video');
const Quiz = require('../models/Quiz');
const Voucher = require('../models/Voucher');
const { logAdminAction } = require('../utils/auditLog');
const { authenticateToken, JWT_SECRET, JWT_EXPIRES_IN } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const router = express.Router();

const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES || 5);
const OTP_COOLDOWN_SECONDS = Number(process.env.OTP_COOLDOWN_SECONDS || 45);
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);
const RECOVERY_RETENTION_DAYS = 15;
const RECOVERY_RETENTION_MS = RECOVERY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
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

function formatReadyStateLabel(state) {
  if (state === 1) return 'connected';
  if (state === 2) return 'connecting';
  if (state === 3) return 'disconnecting';
  return 'disconnected';
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
  email: z.string().email('Invalid email address').max(254).optional().or(z.literal('')),
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

const sendEmailOtpSchema = z.object({
  email: z.string().email('Valid Gmail address is required').max(254)
});

const verifyEmailOtpSchema = z.object({
  email: z.string().email('Valid email is required').max(254),
  otp: z.string().length(6, 'OTP must be 6 digits')
});

async function sendOtpEmailViaResend(email, otp) {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('Email service is not configured. Missing RESEND_API_KEY.');
  }

  const fromEmail = String(process.env.RESEND_FROM_EMAIL || '').trim();
  if (!fromEmail) {
    throw new Error('Email provider is not configured. Missing RESEND_FROM_EMAIL.');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: `Biomics Hub <${fromEmail}>`,
      to: [email],
      subject: 'Your Biomics Hub Login OTP',
      html: `
        <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0b0e14;color:#e4e9f8;border-radius:16px;">
          <h2 style="margin:0 0 8px;color:#6ee7b7;font-size:1.4rem;">Biomics Hub</h2>
          <p style="margin:0 0 24px;color:#9aa5c2;font-size:0.9rem;">Your one-time login code</p>
          <div style="background:#1d2335;border:1px solid rgba(110,231,183,0.25);border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
            <span style="font-size:2.4rem;font-weight:800;letter-spacing:0.18em;color:#6ee7b7;">${otp}</span>
          </div>
          <p style="margin:0;font-size:0.82rem;color:#5f6b85;">This OTP expires in ${OTP_EXPIRY_MINUTES} minutes. Never share it with anyone.</p>
        </div>
      `
    })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.error(`[EMAIL OTP] Resend API failed (${response.status}):`, text || 'no-body');
    throw new Error('Email service is temporarily unavailable. Please try again in 1 minute.');
  }
}

async function sendOtpEmail(email, otp) {
  await sendOtpEmailViaResend(email, otp);
}

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

const adminUpdateProfileSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(50).optional(),
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
  const { phone, username, email, class: userClass, city, birthDate, password } = req.body;
  if (!phone || !username || !userClass || !city || !birthDate || !password) return res.status(400).json({ error: 'All fields required' });
  try {
    const normalizedPhone = String(phone).trim();
    const normalizedUsername = String(username).trim();
    const normalizedEmail = String(email || '').trim().toLowerCase();
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
      email: normalizedEmail,
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
        email: user.email,
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
          { city: new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
          { email: new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
        ] }
      : {};

    const [users, total] = await Promise.all([
      User.find(filter, { username: 1, class: 1, phone: 1, city: 1, email: 1, createdAt: 1, _id: 0 })
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

router.get('/admin/storage-stats', authenticateToken('admin'), async (req, res) => {
  try {
    const db = mongoose.connection?.db;
    if (!db) {
      return res.status(503).json({ error: 'MongoDB connection is not available right now.' });
    }

    const dbStats = await db.stats(1);
    const collectionsMeta = await db.listCollections({}, { nameOnly: true }).toArray();
    const collectionNames = collectionsMeta
      .map((entry) => String(entry?.name || '').trim())
      .filter((name) => name && !name.startsWith('system.'));

    const collectionStats = await Promise.all(collectionNames.map(async (name) => {
      try {
        const stats = await db.command({ collStats: name, scale: 1 });
        const storageSizeBytes = Number(stats?.storageSize || 0);
        const dataSizeBytes = Number(stats?.size || 0);
        const totalIndexSizeBytes = Number(stats?.totalIndexSize || 0);
        const documentCount = Number(stats?.count || 0);
        return {
          name,
          documentCount,
          avgDocumentSizeBytes: Number(stats?.avgObjSize || 0),
          dataSizeBytes,
          storageSizeBytes,
          freeStorageSizeBytes: Number(stats?.freeStorageSize || 0),
          totalIndexSizeBytes,
          indexCount: Number(stats?.nindexes || 0),
          usagePercent: storageSizeBytes > 0
            ? Math.round((dataSizeBytes / storageSizeBytes) * 1000) / 10
            : 0
        };
      } catch {
        return {
          name,
          documentCount: 0,
          avgDocumentSizeBytes: 0,
          dataSizeBytes: 0,
          storageSizeBytes: 0,
          freeStorageSizeBytes: 0,
          totalIndexSizeBytes: 0,
          indexCount: 0,
          usagePercent: 0
        };
      }
    }));

    const sortedCollections = collectionStats
      .sort((left, right) => right.storageSizeBytes - left.storageSizeBytes);

    const topCollections = sortedCollections.slice(0, 8);
    const totalCollectionStorage = sortedCollections.reduce((sum, item) => sum + Number(item.storageSizeBytes || 0), 0);
    const totalCollectionIndexes = sortedCollections.reduce((sum, item) => sum + Number(item.totalIndexSizeBytes || 0), 0);
    const totalDocuments = sortedCollections.reduce((sum, item) => sum + Number(item.documentCount || 0), 0);

    return res.json({
      snapshotAt: new Date().toISOString(),
      connection: {
        readyState: mongoose.connection.readyState,
        status: formatReadyStateLabel(mongoose.connection.readyState),
        host: mongoose.connection.host || '',
        port: mongoose.connection.port || '',
        databaseName: mongoose.connection.name || dbStats?.db || ''
      },
      database: {
        collections: Number(dbStats?.collections || collectionNames.length || 0),
        views: Number(dbStats?.views || 0),
        documents: Number(dbStats?.objects || totalDocuments || 0),
        avgDocumentSizeBytes: Number(dbStats?.avgObjSize || 0),
        dataSizeBytes: Number(dbStats?.dataSize || 0),
        storageSizeBytes: Number(dbStats?.storageSize || totalCollectionStorage || 0),
        totalIndexSizeBytes: Number(dbStats?.indexSize || totalCollectionIndexes || 0),
        indexCount: Number(dbStats?.indexes || 0),
        fileSizeBytes: Number(dbStats?.fileSize || 0),
        fsUsedSizeBytes: Number(dbStats?.fsUsedSize || 0),
        fsTotalSizeBytes: Number(dbStats?.fsTotalSize || 0),
        storageEngine: dbStats?.raw ? 'wiredTiger' : 'mongodb'
      },
      topCollections,
      collections: sortedCollections
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load MongoDB storage stats.' });
  }
});

function extractRecoveryMeta(log) {
  const action = String(log?.action || '').trim();
  const snapshot = log?.details?.snapshot;
  const hasSnapshot = snapshot && typeof snapshot === 'object';
  const hasTargetId = String(log?.targetId || '').trim().length > 0;

  if (action === 'video.delete') {
    return {
      mode: 'restore',
      supported: hasSnapshot,
      label: 'Restore deleted video',
      reason: hasSnapshot ? '' : 'Snapshot missing in this audit entry.'
    };
  }

  if (action === 'DELETE_QUIZ') {
    return {
      mode: 'restore',
      supported: hasSnapshot,
      label: 'Restore deleted quiz',
      reason: hasSnapshot ? '' : 'Snapshot missing in this audit entry.'
    };
  }

  if (action === 'DELETE_VOUCHER') {
    return {
      mode: 'restore',
      supported: hasSnapshot,
      label: 'Restore deleted voucher',
      reason: hasSnapshot ? '' : 'Snapshot missing in this audit entry.'
    };
  }

  if (action === 'user.remove') {
    return {
      mode: 'restore',
      supported: hasSnapshot,
      label: 'Restore removed user',
      reason: hasSnapshot ? '' : 'Snapshot missing in this audit entry.'
    };
  }

  if (action === 'video.create') {
    return {
      mode: 'undo-create',
      supported: hasTargetId,
      label: 'Undo created video',
      reason: hasTargetId ? '' : 'Target id missing in this audit entry.'
    };
  }

  if (action === 'CREATE_VOUCHER') {
    return {
      mode: 'undo-create',
      supported: hasTargetId,
      label: 'Undo created voucher',
      reason: hasTargetId ? '' : 'Target id missing in this audit entry.'
    };
  }

  return {
    mode: 'none',
    supported: false,
    label: 'Not recoverable',
    reason: 'This action type is not supported for recovery.'
  };
}

const RECOVERY_ACTIONS = ['video.delete', 'DELETE_QUIZ', 'DELETE_VOUCHER', 'user.remove', 'video.create', 'CREATE_VOUCHER'];

function getRecoveryCutoffDate() {
  return new Date(Date.now() - RECOVERY_RETENTION_MS);
}

function parseDateQuery(value, { endOfDay = false } = {}) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  // Accept YYYY-MM-DD safely from UI date input.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}${endOfDay ? 'T23:59:59.999' : 'T00:00:00.000'}Z`);
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

async function purgeExpiredRecoveryLogs() {
  const cutoff = getRecoveryCutoffDate();
  await AuditLog.deleteMany({
    action: { $in: RECOVERY_ACTIONS },
    createdAt: { $lt: cutoff }
  });
}

router.get('/admin/recovery-actions', authenticateToken('admin'), async (req, res) => {
  try {
    await purgeExpiredRecoveryLogs();

    const limit = Math.min(80, Math.max(1, parseInt(req.query.limit, 10) || 30));
    const retentionCutoff = getRecoveryCutoffDate();
    const fromDate = req.query.from ? parseDateQuery(req.query.from, { endOfDay: false }) : null;
    const toDate = req.query.to ? parseDateQuery(req.query.to, { endOfDay: true }) : null;

    if (req.query.from && !fromDate) {
      return res.status(400).json({ error: 'Invalid "from" date. Use YYYY-MM-DD.' });
    }
    if (req.query.to && !toDate) {
      return res.status(400).json({ error: 'Invalid "to" date. Use YYYY-MM-DD.' });
    }
    if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
      return res.status(400).json({ error: '"From" date must be earlier than or equal to "To" date.' });
    }

    const createdAtFilter = { $gte: retentionCutoff };
    if (fromDate) {
      createdAtFilter.$gte = new Date(Math.max(retentionCutoff.getTime(), fromDate.getTime()));
    }
    if (toDate) {
      createdAtFilter.$lte = toDate;
    }

    const logs = await AuditLog.find({
      action: { $in: RECOVERY_ACTIONS },
      createdAt: createdAtFilter
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const actions = logs.map((log) => ({
      ...log,
      recovery: {
        ...extractRecoveryMeta(log),
        alreadyApplied: Boolean(log?.details?.recovery?.appliedAt)
      }
    }));

    return res.json({ actions });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load recovery actions.' });
  }
});

router.post('/admin/recovery-actions/:id/apply', authenticateToken('admin'), async (req, res) => {
  try {
    await purgeExpiredRecoveryLogs();

    const log = await AuditLog.findById(req.params.id).lean();
    if (!log) return res.status(404).json({ error: 'Recovery action not found.' });

    if (new Date(log.createdAt).getTime() < getRecoveryCutoffDate().getTime()) {
      return res.status(410).json({ error: `Recovery expired. Only ${RECOVERY_RETENTION_DAYS}-day-old data is supported.` });
    }

    const recovery = extractRecoveryMeta(log);
    if (!recovery.supported) {
      return res.status(400).json({ error: recovery.reason || 'This audit action cannot be recovered.' });
    }

    if (log?.details?.recovery?.appliedAt) {
      return res.status(409).json({ error: 'This recovery action has already been applied.' });
    }

    const action = String(log.action || '').trim();
    const snapshot = log?.details?.snapshot || {};

    if (action === 'video.delete') {
      const payload = {
        title: String(snapshot.title || '').trim(),
        description: String(snapshot.description || ''),
        url: String(snapshot.url || '').trim(),
        category: String(snapshot.category || 'General').trim() || 'General',
        module: String(snapshot.module || 'General').trim() || 'General',
        uploadedAt: snapshot.uploadedAt ? new Date(snapshot.uploadedAt) : new Date(),
        materials: Array.isArray(snapshot.materials) ? snapshot.materials : []
      };
      if (!payload.title || !payload.url) {
        return res.status(400).json({ error: 'Snapshot is incomplete. Cannot restore this video.' });
      }
      if (mongoose.Types.ObjectId.isValid(String(log.targetId || ''))) {
        const existing = await Video.findById(log.targetId).lean();
        if (existing) return res.status(409).json({ error: 'Video already exists. Recovery not needed.' });
        payload._id = log.targetId;
      }
      await Video.create(payload);
    } else if (action === 'DELETE_QUIZ') {
      const payload = {
        category: String(snapshot.category || '').trim(),
        module: String(snapshot.module || '').trim(),
        title: String(snapshot.title || '').trim(),
        difficulty: String(snapshot.difficulty || 'medium').trim() || 'medium',
        requireExplanation: Boolean(snapshot.requireExplanation),
        timeLimitMinutes: Number(snapshot.timeLimitMinutes || 15),
        questions: Array.isArray(snapshot.questions) ? snapshot.questions : [],
        updatedBy: String(snapshot.updatedBy || req.user.username || 'admin').trim(),
        updatedAt: snapshot.updatedAt ? new Date(snapshot.updatedAt) : new Date()
      };
      if (!payload.category || !payload.module || !payload.title || !payload.questions.length) {
        return res.status(400).json({ error: 'Snapshot is incomplete. Cannot restore this quiz.' });
      }
      if (mongoose.Types.ObjectId.isValid(String(log.targetId || ''))) {
        const existing = await Quiz.findById(log.targetId).lean();
        if (existing) return res.status(409).json({ error: 'Quiz already exists. Recovery not needed.' });
        payload._id = log.targetId;
      }
      await Quiz.create(payload);
    } else if (action === 'DELETE_VOUCHER') {
      const payload = {
        code: String(snapshot.code || '').trim().toUpperCase(),
        description: String(snapshot.description || ''),
        discountType: String(snapshot.discountType || '').trim(),
        discountValue: Number(snapshot.discountValue || 0),
        maxDiscountInPaise: snapshot.maxDiscountInPaise == null ? null : Number(snapshot.maxDiscountInPaise || 0),
        active: snapshot.active !== false,
        validFrom: snapshot.validFrom ? new Date(snapshot.validFrom) : null,
        validUntil: snapshot.validUntil ? new Date(snapshot.validUntil) : null,
        usageLimit: snapshot.usageLimit == null ? null : Number(snapshot.usageLimit || 0),
        usedCount: Number(snapshot.usedCount || 0),
        applicableCourses: Array.isArray(snapshot.applicableCourses) ? snapshot.applicableCourses : [],
        createdBy: String(snapshot.createdBy || req.user.username || '')
      };
      if (!payload.code || !payload.discountType || !payload.discountValue) {
        return res.status(400).json({ error: 'Snapshot is incomplete. Cannot restore this voucher.' });
      }
      const existingByCode = await Voucher.findOne({ code: payload.code }).lean();
      if (existingByCode) return res.status(409).json({ error: 'Voucher code already exists. Recovery not needed.' });
      if (mongoose.Types.ObjectId.isValid(String(log.targetId || ''))) {
        payload._id = log.targetId;
      }
      await Voucher.create(payload);
    } else if (action === 'user.remove') {
      const payload = {
        phone: String(snapshot.phone || '').trim(),
        username: String(snapshot.username || '').trim(),
        class: String(snapshot.class || '').trim(),
        city: String(snapshot.city || '').trim(),
        security: snapshot.security && typeof snapshot.security === 'object' ? snapshot.security : undefined,
        avatar: snapshot.avatar && typeof snapshot.avatar === 'object' ? snapshot.avatar : undefined,
        password: String(snapshot.password || ''),
        favorites: Array.isArray(snapshot.favorites) ? snapshot.favorites : [],
        completedVideos: Array.isArray(snapshot.completedVideos) ? snapshot.completedVideos : [],
        purchasedCourses: Array.isArray(snapshot.purchasedCourses) ? snapshot.purchasedCourses : []
      };
      if (!payload.phone || !payload.username || !payload.class || !payload.city || !payload.password) {
        return res.status(400).json({ error: 'Snapshot is incomplete. Cannot restore this user.' });
      }
      const existsUsername = await User.findOne({ username: payload.username }).lean();
      if (existsUsername) return res.status(409).json({ error: 'Username already exists. Cannot restore user.' });
      const existsPhone = await User.findOne({ phone: payload.phone }).lean();
      if (existsPhone) return res.status(409).json({ error: 'Phone number already exists. Cannot restore user.' });
      await User.create(payload);
    } else if (action === 'video.create') {
      const deleted = await Video.findByIdAndDelete(log.targetId);
      if (!deleted) return res.status(404).json({ error: 'Target video not found. It may already be removed.' });
    } else if (action === 'CREATE_VOUCHER') {
      const deleted = await Voucher.findByIdAndDelete(log.targetId);
      if (!deleted) return res.status(404).json({ error: 'Target voucher not found. It may already be removed.' });
    } else {
      return res.status(400).json({ error: 'Unsupported recovery action.' });
    }

    const nextDetails = {
      ...(log.details || {}),
      recovery: {
        appliedAt: new Date().toISOString(),
        appliedBy: req.user?.username || 'admin',
        mode: recovery.mode
      }
    };

    await AuditLog.updateOne({ _id: log._id }, { $set: { details: nextDetails } });
    await logAdminAction(req, {
      action: 'RECOVERY_APPLY',
      targetType: log.targetType || 'unknown',
      targetId: String(log.targetId || ''),
      details: { sourceAuditId: String(log._id), sourceAction: log.action, mode: recovery.mode }
    });

    return res.json({ success: true, message: `${recovery.label} applied successfully.` });
  } catch (err) {
    if (String(err?.message || '').includes('duplicate key')) {
      return res.status(409).json({ error: 'Recovery failed due to a duplicate key conflict.' });
    }
    return res.status(500).json({ error: 'Failed to apply recovery action.' });
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
    const deletedObj = deleted.toObject();
    await logAdminAction(req, {
      action: 'user.remove',
      targetType: 'user',
      targetId: deleted.username,
      details: {
        class: deleted.class,
        city: deleted.city,
        snapshot: {
          phone: deletedObj.phone,
          username: deletedObj.username,
          class: deletedObj.class,
          city: deletedObj.city,
          security: deletedObj.security,
          avatar: deletedObj.avatar,
          password: deletedObj.password,
          favorites: deletedObj.favorites || [],
          completedVideos: deletedObj.completedVideos || [],
          purchasedCourses: deletedObj.purchasedCourses || []
        }
      }
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
      cooldownSeconds: OTP_COOLDOWN_SECONDS
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

// ── Email OTP: send ──────────────────────────────────────────
router.post('/send-email-otp', validate(sendEmailOtpSchema), async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  try {
    const user = await User.findOne({ email: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).lean();
    if (!user) return res.status(404).json({ error: 'No account found with this email address' });

    const now = new Date();
    const existing = await LoginOtp.findOne({ email });
    if (existing?.lastSentAt) {
      const diffSeconds = Math.floor((now.getTime() - existing.lastSentAt.getTime()) / 1000);
      if (diffSeconds < OTP_COOLDOWN_SECONDS) {
        return res.status(429).json({ error: `Please wait ${OTP_COOLDOWN_SECONDS - diffSeconds}s before requesting another OTP` });
      }
    }

    const otp = generateOtp();
    const otpHash = hashOtp(email, otp);
    const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await LoginOtp.findOneAndUpdate(
      { email },
      { $set: { otpHash, expiresAt, attempts: 0, lastSentAt: now, used: false }, $inc: { resendCount: 1 } },
      { new: true, upsert: true }
    );

    await sendOtpEmail(email, otp);
    return res.json({
      message: 'OTP sent to your Gmail',
      cooldownSeconds: OTP_COOLDOWN_SECONDS
    });
  } catch (err) {
    const message = String(err?.message || 'Failed to send OTP email');
    const status = /temporarily unavailable|authentication failed|not configured/i.test(message) ? 503 : 500;
    return res.status(status).json({ error: message });
  }
});

// ── Email OTP: verify ────────────────────────────────────────
router.post('/verify-email-otp', validate(verifyEmailOtpSchema), async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const otp = String(req.body.otp || '').trim();

  try {
    const user = await User.findOne({ email: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
    if (!user) return res.status(400).json({ error: 'User not found' });

    const otpRecord = await LoginOtp.findOne({ email });
    if (!otpRecord || otpRecord.used) {
      return res.status(400).json({ error: 'OTP not found. Please request a new OTP' });
    }
    if (otpRecord.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: 'OTP expired. Please request a new OTP' });
    }
    if (otpRecord.attempts >= OTP_MAX_ATTEMPTS) {
      return res.status(429).json({ error: 'Too many invalid attempts. Request a new OTP' });
    }

    const incomingHash = hashOtp(email, otp);
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
      user: { username: user.username, email: user.email, phone: user.phone, class: user.class, city: user.city }
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
        username: admin.username,
        avatarUrl: buildAvatarUrl(admin)
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Admin login failed' });
  }
});

router.get('/admin/me', authenticateToken('admin'), async (req, res) => {
  try {
    const admin = await Admin.findOne(
      { username: req.user.username },
      { username: 1, avatar: 1, _id: 0 }
    ).lean();

    if (!admin) return res.status(404).json({ error: 'Admin profile not found' });

    return res.json({
      admin: {
        username: admin.username,
        avatarUrl: buildAvatarUrl(admin)
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch admin profile' });
  }
});

router.patch('/admin/me', authenticateToken('admin'), validate(adminUpdateProfileSchema), async (req, res) => {
  try {
    const admin = await Admin.findOne({ username: req.user.username });
    if (!admin) return res.status(404).json({ error: 'Admin profile not found' });

    const nextUsername = req.body.username ? String(req.body.username).trim() : admin.username;
    const nextPassword = req.body.password ? String(req.body.password).trim() : '';

    if (nextUsername !== admin.username) {
      const existingByUsername = await Admin.findOne({ username: new RegExp(`^${escapeRegex(nextUsername)}$`, 'i') }).lean();
      if (existingByUsername) return res.status(400).json({ error: 'Username already in use' });
      admin.username = nextUsername;
    }

    if (nextPassword) {
      if (nextPassword.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      admin.password = nextPassword;
    }

    await admin.save();

    const token = jwt.sign(
      { username: admin.username, role: 'admin' },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.json({
      message: 'Admin profile updated successfully',
      token,
      admin: {
        username: admin.username,
        avatarUrl: buildAvatarUrl(admin)
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update admin profile' });
  }
});

router.post('/admin/me/avatar', authenticateToken('admin'), avatarUpload.single('avatar'), async (req, res) => {
  try {
    const admin = await Admin.findOne({ username: req.user.username });
    if (!admin) return res.status(404).json({ error: 'Admin profile not found' });
    if (!req.file) return res.status(400).json({ error: 'Profile image is required' });

    const previousFilename = admin.avatar?.filename;
    const previousPublicId = admin.avatar?.publicId;

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

    admin.avatar = nextAvatar;
    await admin.save();

    if (hasCloudinaryConfig) {
      safelyRemoveFile(req.file.path);
      await deleteAvatarFromCloudinary(previousPublicId);
    }

    if (previousFilename && previousFilename !== req.file.filename) {
      const previousPath = path.join(uploadsDir, path.basename(previousFilename));
      safelyRemoveFile(previousPath);
    }

    return res.json({
      message: 'Admin profile photo updated successfully',
      admin: {
        username: admin.username,
        avatarUrl: buildAvatarUrl(admin)
      }
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to update admin profile photo' });
  }
});

router.delete('/admin/me/avatar', authenticateToken('admin'), async (req, res) => {
  try {
    const admin = await Admin.findOne({ username: req.user.username });
    if (!admin) return res.status(404).json({ error: 'Admin profile not found' });

    const previousFilename = admin.avatar?.filename;
    const previousPublicId = admin.avatar?.publicId;
    admin.avatar = { url: '', publicId: '', filename: '', originalName: '' };
    await admin.save();

    await deleteAvatarFromCloudinary(previousPublicId);

    if (previousFilename) {
      const previousPath = path.join(uploadsDir, path.basename(previousFilename));
      safelyRemoveFile(previousPath);
    }

    return res.json({
      message: 'Admin profile photo removed successfully',
      admin: {
        username: admin.username,
        avatarUrl: ''
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to remove admin profile photo' });
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
