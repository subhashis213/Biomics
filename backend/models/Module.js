const mongoose = require('mongoose');

const moduleSchema = new mongoose.Schema({
  category: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true },
  createdBy: { type: String, default: '', trim: true }
}, {
  timestamps: true
});

moduleSchema.index({ category: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Module', moduleSchema);
