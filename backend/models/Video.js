const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  url: { type: String, required: true },
  category: { type: String, default: 'General' },
  batch: { type: String, default: '' },
  module: { type: String, default: 'General' },
  topic: { type: String, default: 'General' },
  uploadedAt: { type: Date, default: Date.now },
  materials: [
    {
      name: { type: String },      // original display filename
      filename: { type: String }   // server-stored filename
    }
  ]
});

// ── Performance indexes ───────────────────────────────────────────────────────
// Primary query: Video.find({ category }).sort({ uploadedAt: -1 })
videoSchema.index({ category: 1, uploadedAt: -1 });
// Filtered sub-list: Video.find({ category, module, topic })
videoSchema.index({ category: 1, module: 1, topic: 1 });

module.exports = mongoose.model('Video', videoSchema);
