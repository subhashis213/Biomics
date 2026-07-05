require('dotenv').config();
const mongoose = require('mongoose');
const TopicTest = require('../models/TopicTest');
const RecycleBin = require('../models/RecycleBin');
const { archiveToRecycleBin, restoreFromRecycleBin } = require('../utils/recycleBin');

async function verifyFlow() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/biomicshub';
  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB.');

  try {
    console.log('\n--- Step 1: Creating dummy TopicTest ---');
    const dummyTest = await TopicTest.create({
      title: 'TEST_RECYCLE_BIN_VERIFICATION_ITEM',
      category: 'CSIR LifeScience NET2026',
      module: 'Cell Biology',
      topic: 'Test Topic Verification',
      questions: [{ question: 'Q1', options: ['Option A', 'Option B', 'Option C', 'Option D'], correctIndex: 0 }]
    });
    console.log(`Created TopicTest with ID: ${dummyTest._id}`);

    console.log('\n--- Step 2: Archiving to Recycle Bin ---');
    const mockReq = { user: { username: 'verification_script_admin' }, ip: '127.0.0.1' };
    await archiveToRecycleBin(TopicTest, [dummyTest], mockReq);
    await TopicTest.findByIdAndDelete(dummyTest._id);
    console.log('Archived and deleted from TopicTest collection.');

    console.log('\n--- Step 3: Verifying state in database ---');
    const checkTopicTest = await TopicTest.findById(dummyTest._id);
    const checkRecycleBin = await RecycleBin.findOne({ originalId: dummyTest._id });

    if (checkTopicTest) {
      throw new Error('FAILED: Document still exists in TopicTest collection!');
    }
    if (!checkRecycleBin) {
      throw new Error('FAILED: Document not found in RecycleBin collection!');
    }
    console.log(`SUCCESS: Document safely stored in RecycleBin (ID: ${checkRecycleBin._id}, Summary: "${checkRecycleBin.summary}")`);

    console.log('\n--- Step 4: Restoring from Recycle Bin ---');
    const restoredDoc = await restoreFromRecycleBin(checkRecycleBin._id, mockReq);
    console.log(`Restored document ID: ${restoredDoc._id}`);

    console.log('\n--- Step 5: Verifying restored state ---');
    const finalCheckTopicTest = await TopicTest.findById(dummyTest._id);
    const finalCheckRecycleBin = await RecycleBin.findById(checkRecycleBin._id);

    if (!finalCheckTopicTest) {
      throw new Error('FAILED: Document was not restored to TopicTest collection!');
    }
    if (finalCheckRecycleBin) {
      throw new Error('FAILED: Document was not removed from RecycleBin after restore!');
    }
    console.log('SUCCESS: Document successfully restored to TopicTest collection and removed from RecycleBin!');

    console.log('\n--- Step 6: Cleanup ---');
    await TopicTest.findByIdAndDelete(dummyTest._id);
    console.log('Cleaned up verification test document.');

    console.log('\n🎉 ALL RECYCLE BIN VERIFICATION CHECKS PASSED SUCCESSFULLY! 🎉\n');
  } catch (error) {
    console.error('\n❌ VERIFICATION FAILED:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

verifyFlow();
