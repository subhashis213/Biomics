require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const videoRoutes = require('./routes/videoRoutes');
const authRoutes = require('./routes/authRoutes');
const feedbackRoutes = require('./routes/feedbackRoutes');
const quizRoutes = require('./routes/quizRoutes');

const app = express();
const corsOrigin = process.env.CORS_ORIGIN || true;
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth requests. Try again later.' }
});

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors({ origin: corsOrigin }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  next();
});
app.use(express.json());
app.use('/videos', videoRoutes);
app.use('/auth', authLimiter, authRoutes);
app.use('/feedback', feedbackRoutes);
app.use('/quizzes', quizRoutes);

const frontendDistPath = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/auth') || req.path.startsWith('/videos') || req.path.startsWith('/uploads') || req.path.startsWith('/feedback') || req.path.startsWith('/quizzes')) {
      return next();
    }
    return res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
}

const PORT = process.env.PORT || 5002;

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

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('✓ Connected to MongoDB');
    await migrateVideos();
    await migrateQuizIndexes();
    app.listen(PORT, () => console.log(`✓ Server running on port ${PORT}`));
  })
  .catch(err => console.error('MongoDB connection error:', err));
