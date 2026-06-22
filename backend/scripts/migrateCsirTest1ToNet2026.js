/**
 * Migrate content from archived CSIR NET LIFESCIENCE TEST1 → CSIR LifeScience NET2026.
 * Skips topic tests that already exist in the target (same module + topic + title).
 *
 * Usage:
 *   node scripts/migrateCsirTest1ToNet2026.js          # dry-run
 *   node scripts/migrateCsirTest1ToNet2026.js --apply  # write changes
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Module = require('../models/Module');
const TopicTest = require('../models/TopicTest');
const Video = require('../models/Video');
const Quiz = require('../models/Quiz');
const MockExam = require('../models/MockExam');
const FullMockTest = require('../models/FullMockTest');

const FROM_COURSE = 'CSIR NET LIFESCIENCE TEST1';
const TO_COURSE = 'CSIR LifeScience NET2026';
const TARGET_BATCH = 'BATCH 1.0 CSIR NET LIFE SCIENCE';
const APPLY = process.argv.includes('--apply');

function testKey(doc) {
  return `${doc.module}|${doc.topic}|${doc.title}`.toLowerCase();
}

async function migrateTopicTests() {
  const [sourceTests, targetTests] = await Promise.all([
    TopicTest.find({ category: FROM_COURSE }).lean(),
    TopicTest.find({ category: TO_COURSE }).select('module topic title').lean()
  ]);
  const existing = new Set(targetTests.map(testKey));
  const toMove = [];
  const skipped = [];

  sourceTests.forEach((doc) => {
    if (existing.has(testKey(doc))) skipped.push(doc._id);
    else toMove.push(doc._id);
  });

  if (APPLY && toMove.length) {
    await TopicTest.updateMany(
      { _id: { $in: toMove } },
      { $set: { category: TO_COURSE, batch: TARGET_BATCH, updatedAt: new Date() } }
    );
  }

  return { total: sourceTests.length, moved: toMove.length, skippedDuplicates: skipped.length };
}

async function migrateSimple(model, label) {
  const total = await model.countDocuments({ category: FROM_COURSE });
  if (!APPLY || !total) return { label, total, moved: 0 };
  const result = await model.updateMany(
    { category: FROM_COURSE },
    { $set: { category: TO_COURSE, batch: TARGET_BATCH, updatedAt: new Date() } }
  );
  return { label, total, moved: Number(result.modifiedCount || 0) };
}

async function ensureModules() {
  const moduleNames = await TopicTest.distinct('module', { category: TO_COURSE });
  let ensured = 0;
  for (const name of moduleNames) {
    if (!name) continue;
    if (APPLY) {
      try {
        await Module.updateOne(
          { category: TO_COURSE, name, batch: TARGET_BATCH },
          {
            $setOnInsert: {
              category: TO_COURSE,
              name,
              batch: TARGET_BATCH,
              createdBy: 'migration'
            }
          },
          { upsert: true }
        );
      } catch (err) {
        if (err?.code !== 11000) throw err;
      }
    }
    ensured += 1;
  }
  return ensured;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);

  const topicStats = await migrateTopicTests();
  const videoStats = await migrateSimple(Video, 'videos');
  const quizStats = await migrateSimple(Quiz, 'quizzes');
  const mockExamStats = await migrateSimple(MockExam, 'mockExams');
  const fullMockStats = await migrateSimple(FullMockTest, 'fullMocks');
  const modulesEnsured = await ensureModules();

  const after = await TopicTest.countDocuments({ category: TO_COURSE });
  const remaining = await TopicTest.countDocuments({ category: FROM_COURSE });

  console.log(JSON.stringify({
    mode: APPLY ? 'apply' : 'dry-run',
    from: FROM_COURSE,
    to: TO_COURSE,
    targetBatch: TARGET_BATCH,
    topicTests: topicStats,
    videos: videoStats,
    quizzes: quizStats,
    mockExams: mockExamStats,
    fullMocks: fullMockStats,
    modulesEnsured,
    targetTopicTestCountAfter: after,
    remainingOnSourceCourse: remaining
  }, null, 2));

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
