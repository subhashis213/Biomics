const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
// Auto-restart trigger
const express = require('express');
const fs = require('fs');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const Admin = require('./models/Admin');
const videoRoutes = require('./routes/videoRoutes');
const authRoutes = require('./routes/authRoutes');
const feedbackRoutes = require('./routes/feedbackRoutes');
const quizRoutes = require('./routes/quizRoutes');
const liveClassRoutes = require('./routes/liveClassRoutes');
const livekitRoutes = require('./routes/livekitRoutes');
const classServerRoutes = require('./routes/classServerRoutes');
const moduleRoutes = require('./routes/moduleRoutes');
const mockExamRoutes = require('./routes/mockExamRoutes');
const announcementRoutes = require('./routes/announcementRoutes');
const chatRoutes = require('./routes/chatRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const testSeriesRoutes = require('./routes/testSeriesRoutes');

const app = express();
const livekitPublicUrl = String(process.env.LIVEKIT_URL || '').trim();
let livekitHttpOrigin = '';
let livekitWsOrigin = '';

if (livekitPublicUrl) {
  try {
    const parsedLivekitUrl = new URL(livekitPublicUrl);
    livekitHttpOrigin = parsedLivekitUrl.origin;
    if (parsedLivekitUrl.protocol === 'https:') {
      livekitWsOrigin = `wss://${parsedLivekitUrl.host}`;
    } else if (parsedLivekitUrl.protocol === 'http:') {
      livekitWsOrigin = `ws://${parsedLivekitUrl.host}`;
    }
  } catch (_) {
    livekitHttpOrigin = '';
    livekitWsOrigin = '';
  }
}

// ABSOLUTE FIRST MIDDLEWARE: answer every OPTIONS preflight immediately before
// Helmet, rate-limiters, or any route handler can run. This guarantees browsers
// always get a valid 204 for cross-origin POST/PUT/PATCH preflights.
const SERVER_VERSION = '2.1.0';
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin;
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
    const requestedHeaders = req.headers['access-control-request-headers'];
    res.setHeader('Access-Control-Allow-Headers', requestedHeaders || 'Content-Type,Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(204).end();
  }
  next();
});

const rawCorsOrigin = String(process.env.CORS_ORIGIN || '').trim();

function buildCorsOriginResolver(rawValue) {
  if (!rawValue) return true;

  const lowered = rawValue.toLowerCase();
  if (lowered === 'true' || rawValue === '*') return true;

  const allowedOrigins = rawValue
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (!allowedOrigins.length) return true;

  function normalizeHost(hostname) {
    const value = String(hostname || '').toLowerCase();
    return value.startsWith('www.') ? value.slice(4) : value;
  }

  const parsedAllowedOrigins = allowedOrigins.map((origin) => {
    try {
      const parsed = new URL(origin);
      return {
        exact: origin,
        protocol: parsed.protocol,
        host: normalizeHost(parsed.hostname),
        port: parsed.port || ''
      };
    } catch {
      return { exact: origin, protocol: '', host: normalizeHost(origin), port: '' };
    }
  });

  return function resolveCorsOrigin(requestOrigin, callback) {
    // Allow same-origin/curl/server-to-server requests with no Origin header.
    if (!requestOrigin) {
      callback(null, true);
      return;
    }

    // Always allow Capacitor native mobile app origins (Android/iOS).
    // androidScheme: 'https' causes the app to send https://localhost as origin.
    const capacitorOrigins = ['https://localhost', 'http://localhost', 'capacitor://localhost', 'ionic://localhost'];
    if (capacitorOrigins.includes(requestOrigin)) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.includes(requestOrigin)) {
      callback(null, true);
      return;
    }

    try {
      const parsedRequest = new URL(requestOrigin);
      const requestProtocol = parsedRequest.protocol;
      const requestHost = normalizeHost(parsedRequest.hostname);
      const requestPort = parsedRequest.port || '';

      const hasHostMatch = parsedAllowedOrigins.some((allowed) => {
        if (!allowed.host) return false;
        if (allowed.host !== requestHost) return false;
        if (allowed.protocol && allowed.protocol !== requestProtocol) return false;
        if (allowed.port && allowed.port !== requestPort) return false;
        return true;
      });

      if (hasHostMatch) {
        callback(null, true);
        return;
      }
    } catch {
      // Fall through to explicit block error.
    }

    callback(new Error(`CORS blocked for origin: ${requestOrigin}`));
  };
}

const corsOrigin = buildCorsOriginResolver(rawCorsOrigin);
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth requests. Try again later.' }
});

function authLimiterMiddleware(req, res, next) {
  if (req.path.startsWith('/activity/session')) {
    return next();
  }
  return authLimiter(req, res, next);
}

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      // Allow Jitsi Meet to be embedded as an iframe for live classes
      'frame-src': ["'self'", 'https://meet.jit.si'],
      'img-src': ["'self'", 'data:', 'https:'],
      'connect-src': [
        "'self'",
        'https://chat.stream-io-api.com',
        'wss://chat.stream-io-api.com',
        ...(livekitHttpOrigin ? [livekitHttpOrigin] : []),
        ...(livekitWsOrigin ? [livekitWsOrigin] : [])
      ],
    }
  }
}));

// Handle CORS preflight (OPTIONS) for ALL routes BEFORE any other middleware.
// Without this, browsers block every cross-origin POST/PATCH/PUT because the
// preflight never gets a valid 204 response.
app.options('*', cors({ origin: corsOrigin }));

app.use(cors({ origin: corsOrigin }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.json());
app.use('/videos', videoRoutes);
app.use('/auth', authLimiterMiddleware, authRoutes);
app.use('/feedback', feedbackRoutes);
app.use('/quizzes', quizRoutes);
app.use('/live', liveClassRoutes);
app.use('/api/class', classServerRoutes);
app.use('/api/livekit', livekitRoutes);
app.use('/modules', moduleRoutes);
app.use('/mock-exams', mockExamRoutes);
app.use('/announcements', announcementRoutes);
app.use('/chat', chatRoutes);
app.use('/payments', paymentRoutes);
app.use('/test-series', testSeriesRoutes);

// Health check — used by keep-alive ping and uptime monitors
app.get('/health', (req, res) => res.json({ status: 'ok', version: SERVER_VERSION, ts: Date.now() }));

const frontendDistPath = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/auth') || req.path.startsWith('/videos') || req.path.startsWith('/uploads') || req.path.startsWith('/feedback') || req.path.startsWith('/quizzes') || req.path.startsWith('/live') || req.path.startsWith('/api/class') || req.path.startsWith('/api/livekit') || req.path.startsWith('/modules') || req.path.startsWith('/mock-exams') || req.path.startsWith('/announcements') || req.path.startsWith('/chat') || req.path.startsWith('/payments') || req.path.startsWith('/test-series')) {
      return next();
    }
    return res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
}

const PORT = process.env.PORT || 5002;
let serverStarted = false;

function startServer() {
  if (serverStarted) return;
  serverStarted = true;
  app.listen(PORT, () => console.log(`✓ Server running on port ${PORT}`));
}

// Migration function to ensure all videos have a module field
async function migrateVideos() {
  try {
    const Video = require('./models/Video');
    const result = await Video.updateMany(
      { module: { $exists: false } },
      { $set: { module: 'General' } }
    );
    if (result.modifiedCount > 0) {
      console.log(`✓ Migrated ${result.modifiedCount} videos - set missing module field to 'General'`);
    }
  } catch (err) {
    console.error('Migration error:', err.message);
  }
}

async function migrateQuizIndexes() {
  try {
    const Quiz = require('./models/Quiz');
    const indexName = 'category_1_module_1';
    const indexes = await Quiz.collection.indexes();
    const hasLegacyUniqueIndex = indexes.some((idx) => idx.name === indexName && idx.unique);
    if (hasLegacyUniqueIndex) {
      await Quiz.collection.dropIndex(indexName);
      console.log('✓ Dropped legacy unique index category_1_module_1 from quizzes');
    }
  } catch (err) {
    console.error('Quiz index migration error:', err.message);
  }
}

async function ensureAdminAccount() {
  const username = String(process.env.ADMIN_USERNAME || '').trim();
  const password = String(process.env.ADMIN_PASSWORD || '').trim();

  if (!username || !password) {
    return;
  }

  try {
    const existing = await Admin.findOne({ username }).lean();
    if (existing) {
      console.log(`✓ Admin account ready for ${username}`);
      return;
    }

    const admin = new Admin({ username, password });
    await admin.save();
    console.log(`✓ Created admin account for ${username}`);
  } catch (err) {
    console.error('Admin bootstrap error:', err.message);
  }
}

mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 })
  .then(async () => {
    console.log('✓ Connected to MongoDB');
    await migrateVideos();
    await migrateQuizIndexes();
    await ensureAdminAccount();
    startServer();
  })
  .catch(err => {
    console.error('MongoDB connection error:', err.message || err);
    console.warn('⚠ Starting server without database connection. DB-backed endpoints may fail until MongoDB is available.');
    startServer();
  });
