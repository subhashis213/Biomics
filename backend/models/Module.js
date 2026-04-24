const mongoose = require('mongoose');

const moduleSchema = new mongoose.Schema({
  category: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true },
  batch: { type: String, trim: true, default: '' },
  createdBy: { type: String, default: '', trim: true }
}, {
  timestamps: true
});

// Unique per category + name + batch (allow same module name across batches)
moduleSchema.index({ category: 1, name: 1, batch: 1 }, { unique: true });

module.exports = mongoose.model('Module', moduleSchema);
