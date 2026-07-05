const mongoose = require('mongoose');

const recycleBinSchema = new mongoose.Schema({
  originalCollection: { type: String, required: true, trim: true, index: true },
  originalId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  summary: { type: String, required: true, trim: true },
  deletedBy: { type: String, trim: true, default: '' },
  deletedAt: { type: Date, default: Date.now, index: true }
});

recycleBinSchema.index({ originalCollection: 1, deletedAt: -1 });

module.exports = mongoose.model('RecycleBin', recycleBinSchema);
