/**
 * diagnoseAndRestoreTestSeries.js
 *
 * Connects to MongoDB Atlas and:
 * 1. Reports current TopicTest and FullMockTest counts.
 * 2. Shows the last 30 audit log entries related to test series deletions.
 * 3. Shows what's in the RecycleBin for TopicTest and FullMockTest.
 * 4. With --restore flag: restores ALL TopicTest and FullMockTest items from the RecycleBin.
 *
 * Usage:
 *   node scripts/diagnoseAndRestoreTestSeries.js
 *   node scripts/diagnoseAndRestoreTestSeries.js --restore
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

// ── Schemas (strict:false for flexible restore) ──────────────────────────────
const RecycleBin = mongoose.model('RecycleBin', new mongoose.Schema({
  originalCollection: String,
  originalId: mongoose.Schema.Types.Mixed,
  data: mongoose.Schema.Types.Mixed,
  summary: String,
  deletedBy: String,
  deletedAt: Date
}));

const AuditLog = mongoose.model('AuditLog', new mongoose.Schema({
  action: String,
  actorRole: String,
  actorUsername: String,
  targetType: String,
  targetId: String,
  details: mongoose.Schema.Types.Mixed
}, { timestamps: true }));

const TopicTest = mongoose.model('TopicTest', new mongoose.Schema({}, { strict: false }));
const FullMockTest = mongoose.model('FullMockTest', new mongoose.Schema({}, { strict: false }));

function banner(title) {
  const line = '─'.repeat(65);
  console.log('\n' + line);
  console.log('  ' + title);
  console.log(line);
}

async function run() {
  const MONGO_URI = process.env.MONGO_URI;
  if (!MONGO_URI) { console.error('MONGO_URI not set in .env'); process.exit(1); }

  console.log('Connecting to MongoDB Atlas...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected to:', mongoose.connection.host);

  const doRestore = process.argv.includes('--restore');

  // 1. Current counts
  banner('1. Current live counts');
  const [topicCount, fullMockCount] = await Promise.all([
    TopicTest.countDocuments(),
    FullMockTest.countDocuments()
  ]);
  console.log('  TopicTest documents   :', topicCount);
  console.log('  FullMockTest documents:', fullMockCount);

  // 2. Recent audit logs
  banner('2. Last 30 audit log entries (test-series related)');
  const recentLogs = await AuditLog.find({
    $or: [
      { targetType: 'TopicTest' },
      { targetType: 'FullMockTest' },
      { action: /TOPIC_TEST|FULL_MOCK|RECYCLE/i }
    ]
  }).sort({ createdAt: -1 }).limit(30).lean();

  if (!recentLogs.length) {
    console.log('  No matching audit log entries found.');
  } else {
    recentLogs.forEach(log => {
      const ts = log.createdAt ? new Date(log.createdAt).toISOString() : 'unknown';
      const det = log.details ? JSON.stringify(log.details).slice(0, 100) : '';
      console.log(`  [${ts}] ${String(log.action).padEnd(30)} by ${log.actorUsername} -> ${log.targetType} ${det}`);
    });
  }

  // Check for recycle bin empty events
  const emptyLogs = await AuditLog.find({ action: 'RECYCLE_BIN_EMPTY' }).sort({ createdAt: -1 }).limit(5).lean();
  if (emptyLogs.length) {
    banner('  WARNING: RECYCLE BIN EMPTY EVENTS DETECTED');
    emptyLogs.forEach(log => {
      const ts = log.createdAt ? new Date(log.createdAt).toISOString() : 'unknown';
      console.log(`  [${ts}] RECYCLE_BIN_EMPTY by ${log.actorUsername} - details: ${JSON.stringify(log.details)}`);
    });
  }

  // 3. RecycleBin contents
  banner('3. RecycleBin contents (TopicTest & FullMockTest)');
  const binItems = await RecycleBin.find({
    originalCollection: { $in: ['TopicTest', 'FullMockTest'] }
  }).sort({ deletedAt: -1 }).lean();

  if (!binItems.length) {
    console.log('  NO TopicTest or FullMockTest items found in RecycleBin.');
    console.log('  Possible causes:');
    console.log('    a) RecycleBin was emptied by an admin ("Empty Trash" button)');
    console.log('    b) Items deleted directly from MongoDB Atlas console (bypassed API)');
    console.log('    c) Items were permanently deleted via the permanent-delete API');
  } else {
    console.log('  Found ' + binItems.length + ' item(s) in RecycleBin:');
    binItems.forEach((item, i) => {
      const deletedAt = item.deletedAt ? new Date(item.deletedAt).toISOString() : 'unknown';
      console.log('  [' + (i+1) + '] collection:' + item.originalCollection + '  summary:"' + item.summary + '"  deletedBy:' + item.deletedBy + '  deletedAt:' + deletedAt);
    });
  }

  // 4. Restore
  if (!doRestore) {
    banner('4. Restore (DRY RUN — run with --restore to actually restore)');
    if (binItems.length) {
      console.log('  Would restore ' + binItems.length + ' item(s) from RecycleBin.');
    } else {
      console.log('  Nothing to restore from RecycleBin.');
    }
  } else {
    banner('4. Restoring items from RecycleBin...');
    if (!binItems.length) {
      console.log('  Nothing to restore.');
    } else {
      let restored = 0, skipped = 0;
      for (const item of binItems) {
        try {
          const TargetModel = item.originalCollection === 'TopicTest' ? TopicTest : FullMockTest;
          if (item.originalId) {
            const existing = await TargetModel.findById(item.originalId).lean();
            if (existing) {
              console.log('  SKIP: ' + item.originalCollection + ' ' + item.originalId + ' already exists in live collection.');
              skipped++;
              continue;
            }
          }
          const docData = { ...item.data };
          delete docData.__v;
          await TargetModel.create(docData);
          await RecycleBin.findByIdAndDelete(item._id);
          console.log('  RESTORED: ' + item.originalCollection + ' "' + item.summary + '" (id: ' + item.originalId + ')');
          restored++;
        } catch (err) {
          console.error('  ERROR restoring ' + item._id + ':', err.message);
          skipped++;
        }
      }
      console.log('\n  Done. Restored: ' + restored + '  Skipped/Errors: ' + skipped);
    }
  }

  // 5. Summary
  banner('5. Diagnosis Summary');
  if (binItems.length > 0) {
    console.log('  Items ARE in RecycleBin -- they can be restored!');
    console.log('  Run: node scripts/diagnoseAndRestoreTestSeries.js --restore');
  } else if (emptyLogs.length > 0) {
    console.log('  CAUSE: RecycleBin was emptied by an admin - items are permanently gone from RecycleBin.');
    console.log('  RECOVERY: Use MongoDB Atlas backup/restore (Point-in-Time Recovery).');
    console.log('  Go to: Atlas -> Your Cluster -> Backup -> Restore');
  } else {
    console.log('  CAUSE UNCLEAR: Items may have been deleted directly from Atlas console,');
    console.log('  or via a bulk delete that bypassed the RecycleBin.');
    console.log('  Check Atlas -> Activity Feed for any recent drop/delete operations.');
  }

  await mongoose.disconnect();
  console.log('\nDisconnected from MongoDB Atlas.\n');
}

run().catch(err => { console.error('Fatal:', err); process.exit(1); });
