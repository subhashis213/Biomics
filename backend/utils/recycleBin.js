const RecycleBin = require('../models/RecycleBin');
const { logAdminAction } = require('./auditLog');

// Lazy load models to avoid circular dependencies
function getModelMap() {
  return {
    TopicTest: require('../models/TopicTest'),
    Module: require('../models/Module'),
    Topic: require('../models/Topic'),
    Video: require('../models/Video'),
    Quiz: require('../models/Quiz'),
    MockExam: require('../models/MockExam'),
    FullMockTest: require('../models/FullMockTest'),
    FreeStudyResource: require('../models/FreeStudyResource')
  };
}

/**
 * Archives documents to the RecycleBin before deletion from active collections.
 * @param {Object} Model - Mongoose Model (e.g. TopicTest, Video, etc.)
 * @param {Object|Array} filterOrDocs - Mongoose filter object OR array of document objects/docs
 * @param {Object} req - Express request object for admin username tracking
 * @param {Function} [summaryFormatter] - Optional function(doc) -> String
 * @returns {Promise<number>} - Number of archived documents
 */
async function archiveToRecycleBin(Model, filterOrDocs, req, summaryFormatter) {
  try {
    if (!Model) return 0;
    const modelName = Model.modelName || 'Unknown';
    let docs = [];

    if (Array.isArray(filterOrDocs)) {
      docs = filterOrDocs.map(d => typeof d.toObject === 'function' ? d.toObject() : d);
    } else if (filterOrDocs && typeof filterOrDocs === 'object') {
      docs = await Model.find(filterOrDocs).lean();
    }

    if (!docs.length) return 0;

    const entries = docs.map(doc => {
      let summary = '';
      if (typeof summaryFormatter === 'function') {
        summary = summaryFormatter(doc);
      } else if (doc.title) {
        summary = `${doc.category || ''} ${doc.module ? '/' + doc.module : ''} ${doc.topic ? '/' + doc.topic : ''}: ${doc.title}`.replace(/\s+/g, ' ').trim();
      } else if (doc.name) {
        summary = `${doc.category || ''} ${doc.module ? '/' + doc.module : ''}: ${doc.name}`.replace(/\s+/g, ' ').trim();
      } else {
        summary = `${modelName} (${doc._id || 'unknown'})`;
      }

      return {
        originalCollection: modelName,
        originalId: doc._id,
        data: doc,
        summary: summary || `${modelName} item`,
        deletedBy: req?.user?.username || req?.user?.email || 'admin',
        deletedAt: new Date()
      };
    });

    await RecycleBin.insertMany(entries, { ordered: false });
    return entries.length;
  } catch (err) {
    console.error('[recycleBin] Error archiving to recycle bin:', err?.message || err);
    // Best effort archive; if archive fails due to duplicate or DB error, return 0
    return 0;
  }
}

/**
 * Restores an item from the RecycleBin back into its original collection.
 * @param {string} recycleBinId - ID of the document in RecycleBin collection
 * @param {Object} req - Express request object for audit logging
 * @returns {Promise<Object>} - Restored document
 */
async function restoreFromRecycleBin(recycleBinId, req) {
  const item = await RecycleBin.findById(recycleBinId).lean();
  if (!item) {
    throw new Error('Archived item not found in Recycle Bin.');
  }

  const modelMap = getModelMap();
  const TargetModel = modelMap[item.originalCollection];
  if (!TargetModel) {
    throw new Error(`Cannot restore: collection '${item.originalCollection}' is not registered.`);
  }

  // Check if an item with the same ID already exists in live table
  if (item.originalId) {
    const existingById = await TargetModel.findById(item.originalId).lean();
    if (existingById) {
      throw new Error(`Cannot restore: an active item with ID ${item.originalId} already exists in ${item.originalCollection}.`);
    }
  }

  // For unique index checks (like Module or Topic name), check if same name/module exists
  if (item.originalCollection === 'Module' && item.data?.category && item.data?.name) {
    const existingByName = await TargetModel.findOne({
      category: item.data.category,
      name: item.data.name,
      batch: item.data.batch || ''
    }).lean();
    if (existingByName) {
      throw new Error(`Cannot restore: a Module named "${item.data.name}" in category "${item.data.category}" already exists.`);
    }
  } else if (item.originalCollection === 'Topic' && item.data?.category && item.data?.module && item.data?.name) {
    const existingByName = await TargetModel.findOne({
      category: item.data.category,
      module: item.data.module,
      name: item.data.name
    }).lean();
    if (existingByName) {
      throw new Error(`Cannot restore: a Topic named "${item.data.name}" in module "${item.data.module}" already exists.`);
    }
  }

  // Create document in target table
  const docData = { ...item.data };
  delete docData.__v; // Remove version key to allow clean insertion

  const restored = await TargetModel.create(docData);
  await RecycleBin.findByIdAndDelete(recycleBinId);

  await logAdminAction(req, {
    action: 'RECYCLE_BIN_RESTORE',
    targetType: item.originalCollection,
    targetId: String(restored._id || item.originalId),
    details: { summary: item.summary, restoredBy: req?.user?.username || 'admin' }
  });

  return restored;
}

module.exports = {
  archiveToRecycleBin,
  restoreFromRecycleBin,
  getModelMap
};
