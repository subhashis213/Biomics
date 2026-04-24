const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const Video = require('./models/Video');
const Quiz = require('./models/Quiz');
const TopicTest = require('./models/TopicTest');
const MockExam = require('./models/MockExam');
const FullMockTest = require('./models/FullMockTest');

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function parseArgs(argv) {
  const args = { mode: 'move', dryRun: false };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;

    const key = token.slice(2);
    if (key === 'dryRun') {
      args.dryRun = true;
      continue;
    }

    const nextValue = argv[i + 1];
    if (!nextValue || nextValue.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }
    args[key] = nextValue;
    i += 1;
  }

  return args;
}

function buildMatchFilter({ course, moduleName, topicName, fromBatch }) {
  const filter = { category: normalizeText(course) };
  const normalizedModule = normalizeText(moduleName);
  const normalizedTopic = normalizeText(topicName);
  const normalizedFromBatch = normalizeText(fromBatch);

  if (normalizedModule) filter.module = normalizedModule;
  if (normalizedTopic) filter.topic = normalizedTopic;

  // If fromBatch specified, filter by that batch. Otherwise migrate ALL content from course (regardless of batch)
  if (normalizedFromBatch) {
    filter.batch = normalizedFromBatch;
  }
  // If fromBatch is empty, no batch filter is added — this migrates ALL content in the course

  return filter;
}

async function runMove(model, matchFilter, targetBatch, dryRun) {
  const total = await model.countDocuments(matchFilter);
  if (dryRun || total === 0) {
    return { total, updated: 0 };
  }

  const result = await model.updateMany(matchFilter, {
    $set: {
      batch: targetBatch,
      updatedAt: new Date()
    }
  });

  return {
    total,
    updated: Number(result?.modifiedCount || 0)
  };
}

async function runCopy(model, matchFilter, targetBatch, dryRun) {
  const docs = await model.find(matchFilter).lean();
  const total = docs.length;
  if (dryRun || total === 0) {
    return { total, copied: 0, skipped: 0 };
  }

  let copied = 0;
  let skipped = 0;

  for (const doc of docs) {
    const clone = { ...doc };
    delete clone._id;
    delete clone.__v;

    clone.batch = targetBatch;
    clone.createdAt = new Date();
    clone.updatedAt = new Date();

    const duplicateFilter = {
      category: clone.category,
      batch: clone.batch
    };

    if (clone.module) duplicateFilter.module = clone.module;
    if (clone.topic) duplicateFilter.topic = clone.topic;
    if (clone.title) duplicateFilter.title = clone.title;

    const alreadyExists = await model.findOne(duplicateFilter).select({ _id: 1 }).lean();
    if (alreadyExists) {
      skipped += 1;
      continue;
    }

    await model.create(clone);
    copied += 1;
  }

  return { total, copied, skipped };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const course = normalizeText(args.course);
  const targetBatch = normalizeText(args.targetBatch || args.batch);
  const mode = normalizeText(args.mode || 'move').toLowerCase();

  if (!course) {
    throw new Error('Missing --course. Example: --course "CSIR-NET Life Science"');
  }
  if (!targetBatch) {
    throw new Error('Missing --targetBatch (or --batch). Example: --targetBatch "Batch 2027"');
  }
  if (!['move', 'copy'].includes(mode)) {
    throw new Error('Invalid --mode. Allowed values: move, copy');
  }

  const filter = buildMatchFilter({
    course,
    moduleName: args.module,
    topicName: args.topic,
    fromBatch: args.fromBatch
  });

  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/biomicshub';
  await mongoose.connect(mongoUri);

  try {
    const runner = mode === 'copy' ? runCopy : runMove;

    const [videos, quizzes, topicTests, mockExams, fullMockTests] = await Promise.all([
      runner(Video, filter, targetBatch, Boolean(args.dryRun)),
      runner(Quiz, filter, targetBatch, Boolean(args.dryRun)),
      runner(TopicTest, filter, targetBatch, Boolean(args.dryRun)),
      runner(MockExam, filter, targetBatch, Boolean(args.dryRun)),
      runner(FullMockTest, filter, targetBatch, Boolean(args.dryRun))
    ]);

    const output = {
      mode,
      dryRun: Boolean(args.dryRun),
      course,
      targetBatch,
      filter,
      result: {
        videos,
        quizzes,
        topicTests,
        mockExams,
        testSeries: fullMockTests
      }
    };

    console.log(JSON.stringify(output, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
