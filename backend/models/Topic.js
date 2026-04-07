const mongoose = require('mongoose');

const topicSchema = new mongoose.Schema({
  category: { type: String, required: true, trim: true },
  module: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true },
  createdBy: { type: String, default: '', trim: true }
}, {
  timestamps: true
});

topicSchema.index({ category: 1, module: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Topic', topicSchema);
