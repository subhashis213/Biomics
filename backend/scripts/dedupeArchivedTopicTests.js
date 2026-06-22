/**
 * Remove duplicate topic tests left in archived legacy courses after migration
 * to CSIR LifeScience NET2026 (same module + topic + title).
 *
 * Usage:
 *   node scripts/dedupeArchivedTopicTests.js          # dry-run
 *   node scripts/dedupeArchivedTopicTests.js --apply  # delete duplicates
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const TopicTest = require('../models/TopicTest');
const { getLegacySourceCourses, normalizeCourse } = require('../utils/legacyCourseAliases');

const PRIMARY_COURSE = 'CSIR LifeScience NET2026';
const APPLY = process.argv.includes('--apply');

function testKey(doc) {
  return `${doc.module}|${doc.topic}|${doc.title}`.toLowerCase();
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);

  const primaryTests = await TopicTest.find({ category: PRIMARY_COURSE }).lean();
  const primaryKeys = new Set(primaryTests.map(testKey));

  const legacyCourses = getLegacySourceCourses(PRIMARY_COURSE);
  const summary = [];

  for (const legacyCourse of legacyCourses) {
    const legacyTests = await TopicTest.find({ category: legacyCourse }).lean();
    const duplicateIds = legacyTests
      .filter((test) => primaryKeys.has(testKey(test)))
      .map((test) => test._id);
    const uniqueLeft = legacyTests.length - duplicateIds.length;

    if (APPLY && duplicateIds.length) {
      await TopicTest.deleteMany({ _id: { $in: duplicateIds } });
    }

    summary.push({
      legacyCourse,
      total: legacyTests.length,
      duplicatesRemoved: duplicateIds.length,
      uniqueRemaining: uniqueLeft
    });
  }

  const primaryCount = await TopicTest.countDocuments({ category: PRIMARY_COURSE });
  const totalRemaining = await TopicTest.countDocuments();

  console.log(JSON.stringify({
    mode: APPLY ? 'apply' : 'dry-run',
    primaryCourse: PRIMARY_COURSE,
    legacyCourses: summary,
    primaryTopicTestCount: primaryCount,
    totalTopicTestsInDb: totalRemaining
  }, null, 2));

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
