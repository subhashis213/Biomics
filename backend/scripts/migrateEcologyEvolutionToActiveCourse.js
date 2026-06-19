/**
 * Move Ecology, Evolution, and Genetics test-series content from archived course
 * "CSIR-NET Life Science" → active catalog course "CSIR LifeScience NET2026".
 *
 * Usage: node scripts/migrateEcologyEvolutionToActiveCourse.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Module = require('../models/Module');
const Topic = require('../models/Topic');
const TopicTest = require('../models/TopicTest');

const FROM_COURSE = 'CSIR-NET Life Science';
const TO_COURSE = 'CSIR LifeScience NET2026';
const MODULES = ['Ecology', 'Evolution', 'Genetics'];

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  const testFilter = { category: FROM_COURSE, module: { $in: MODULES } };
  const before = await TopicTest.countDocuments(testFilter);

  const testResult = await TopicTest.updateMany(testFilter, { $set: { category: TO_COURSE } });

  const topicResult = await Topic.updateMany(
    { category: FROM_COURSE, module: { $in: MODULES } },
    { $set: { category: TO_COURSE } }
  );

  for (const name of MODULES) {
    const exists = await Module.findOne({ category: TO_COURSE, name }).lean();
    if (exists) continue;
    const source = await Module.findOne({ category: FROM_COURSE, name }).lean();
    try {
      await Module.create({
        category: TO_COURSE,
        name,
        batch: source?.batch || '',
        createdBy: source?.createdBy || 'migration'
      });
    } catch (err) {
      if (err?.code !== 11000) throw err;
    }
  }

  const after = await TopicTest.countDocuments({ category: TO_COURSE, module: { $in: MODULES } });

  console.log(JSON.stringify({
    from: FROM_COURSE,
    to: TO_COURSE,
    modules: MODULES,
    topicTestsMatched: before,
    topicTestsUpdated: testResult.modifiedCount,
    topicsUpdated: topicResult.modifiedCount,
    targetCourseModuleTestCount: after
  }, null, 2));

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
