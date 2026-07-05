/**
 * fixTestSeriesSchemaAndData.js
 *
 * 1. Standardizes module names across all content collections (fixing case and spelling inconsistencies
 *    like 'Cell biology' -> 'Cell Biology' and 'Cell Signalling' -> 'Cell Signaling').
 * 2. Migrates stranded topics from legacy course 'CSIR-NET Life Science' to active course 'CSIR LifeScience NET2026'.
 * 3. Migrates stranded TopicTests (e.g. Drosophila PYQ under Developmental Biology in Free trial) to 'CSIR LifeScience NET2026'.
 * 4. Ensures Module catalog consistency for active courses without duplicate entries.
 *
 * Usage:
 *   node backend/scripts/fixTestSeriesSchemaAndData.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const TopicTest = require('../models/TopicTest');
const Topic = require('../models/Topic');
const Module = require('../models/Module');
const Video = require('../models/Video');
const Quiz = require('../models/Quiz');
const FreeStudyResource = require('../models/FreeStudyResource');

const FROM_COURSE = 'CSIR-NET Life Science';
const TO_COURSE = 'CSIR LifeScience NET2026';
const ACTIVE_BATCH = 'BATCH 1.0 CSIR NET LIFE SCIENCE';

async function standardizeModuleNames(collection, modelName, fieldName = 'module') {
  console.log(`\n--- Standardizing module names in ${modelName} ---`);
  const docs = await collection.find({}).lean();
  let updatedCount = 0;

  for (const doc of docs) {
    const currentVal = doc[fieldName] || '';
    let newVal = currentVal.trim();

    if (/^cell biology$/i.test(newVal)) {
      newVal = 'Cell Biology';
    } else if (/^cell signalling$/i.test(newVal)) {
      newVal = 'Cell Signaling';
    }

    if (newVal !== currentVal) {
      try {
        await collection.updateOne({ _id: doc._id }, { $set: { [fieldName]: newVal } });
        updatedCount++;
        console.log(`[${modelName}] Updated id=${doc._id}: "${currentVal}" -> "${newVal}"`);
      } catch (err) {
        if (err.code === 11000) {
          // Duplicate key collision (e.g., in Topic or Module unique index)
          console.warn(`[${modelName}] Collision updating id=${doc._id} ("${currentVal}" -> "${newVal}"). Removing duplicate legacy doc.`);
          await collection.deleteOne({ _id: doc._id });
          updatedCount++;
        } else {
          console.error(`[${modelName}] Error updating id=${doc._id}:`, err.message);
        }
      }
    }
  }
  console.log(`[${modelName}] Total standardized/resolved: ${updatedCount}`);
}

async function migrateStrandedTopics() {
  console.log(`\n--- Migrating stranded Topics from "${FROM_COURSE}" to "${TO_COURSE}" ---`);
  const legacyTopics = await Topic.find({ category: FROM_COURSE });
  let migrated = 0;
  let merged = 0;

  for (const topic of legacyTopics) {
    const existingActive = await Topic.findOne({
      category: TO_COURSE,
      module: topic.module,
      name: topic.name
    });

    if (!existingActive) {
      topic.category = TO_COURSE;
      await topic.save();
      migrated++;
      console.log(`[Topic Migrated] [${topic.module}] "${topic.name}" -> ${TO_COURSE}`);
    } else {
      // Redundant legacy copy exists in active course
      await Topic.deleteOne({ _id: topic._id });
      merged++;
      console.log(`[Topic Merged/Removed Duplicate] [${topic.module}] "${topic.name}"`);
    }
  }
  console.log(`Topic Migration Complete: Migrated=${migrated}, Deduplicated/Merged=${merged}`);
}

async function migrateStrandedTopicTests() {
  console.log(`\n--- Migrating stranded TopicTests ---`);
  // 1. Move Developmental Biology tests (e.g. Drosophila PYQ in Free trial) to active course
  const devTests = await TopicTest.find({ module: /developmental biology/i });
  let updatedDev = 0;

  for (const test of devTests) {
    if (test.category !== TO_COURSE) {
      const oldCat = test.category;
      const oldBatch = test.batch;
      test.category = TO_COURSE;
      test.batch = ACTIVE_BATCH;
      await test.save();
      updatedDev++;
      console.log(`[TopicTest Migrated] "${test.title}" (${test.module}): [${oldCat} / ${oldBatch}] -> [${TO_COURSE} / ${ACTIVE_BATCH}]`);
    }
  }

  // 2. Check if any other TopicTests are stranded in FROM_COURSE or legacy aliases
  const legacyTests = await TopicTest.find({ category: FROM_COURSE });
  let updatedLegacy = 0;
  for (const test of legacyTests) {
    test.category = TO_COURSE;
    if (!test.batch || test.batch === 'Free batches') {
      test.batch = ACTIVE_BATCH;
    }
    await test.save();
    updatedLegacy++;
    console.log(`[Legacy TopicTest Migrated] "${test.title}" (${test.module}) -> [${TO_COURSE} / ${test.batch}]`);
  }

  console.log(`TopicTest Migration Complete: DevTests Migrated=${updatedDev}, Legacy Tests Migrated=${updatedLegacy}`);
}

async function syncModuleCatalog() {
  console.log(`\n--- Synchronizing Module Catalog for "${TO_COURSE}" ---`);
  const legacyModules = await Module.find({ category: FROM_COURSE });
  let synced = 0;

  for (const mod of legacyModules) {
    const existingActive = await Module.findOne({
      category: TO_COURSE,
      name: mod.name
    });

    if (!existingActive) {
      // Create a clean entry in active course
      await Module.create({
        category: TO_COURSE,
        name: mod.name,
        batch: ACTIVE_BATCH,
        description: mod.description || `${mod.name} Module`,
        order: mod.order || 0,
        active: true
      });
      synced++;
      console.log(`[Module Created in Active Course] "${mod.name}"`);
    }
    // Remove the legacy module record to prevent schema duplication
    await Module.deleteOne({ _id: mod._id });
  }
  console.log(`Module Catalog Sync Complete: New Active Modules Created=${synced}, Legacy Modules Cleaned=${legacyModules.length}`);
}

async function main() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('ERROR: MONGODB_URI or MONGO_URI not found in environment variables.');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('Connected successfully.');

  try {
    // 1. Standardize module names across all collections
    await standardizeModuleNames(TopicTest, 'TopicTest', 'module');
    await standardizeModuleNames(Topic, 'Topic', 'module');
    await standardizeModuleNames(Module, 'Module', 'name');
    await standardizeModuleNames(Video, 'Video', 'module');
    await standardizeModuleNames(Quiz, 'Quiz', 'module');
    await standardizeModuleNames(FreeStudyResource, 'FreeStudyResource', 'module');

    // 2. Migrate stranded topics from legacy course
    await migrateStrandedTopics();

    // 3. Migrate stranded topic tests
    await migrateStrandedTopicTests();

    // 4. Synchronize module catalog
    await syncModuleCatalog();

    console.log('\n✅ Database remediation completed successfully!');
  } catch (err) {
    console.error('\n❌ Error during database remediation:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

main();
