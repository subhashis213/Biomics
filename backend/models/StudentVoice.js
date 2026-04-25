const mongoose = require('mongoose');

const studentVoiceSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  role: { type: String, trim: true, default: '' },
  message: { type: String, required: true, trim: true },
  rating: { type: Number, min: 1, max: 5, default: 5 },
  avatarUrl: { type: String, trim: true, default: '' },
  active: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
  createdBy: { type: String, trim: true, default: '' },
  updatedBy: { type: String, trim: true, default: '' }
}, { timestamps: true });

studentVoiceSchema.index({ active: 1, sortOrder: 1, createdAt: -1 });

module.exports = mongoose.model('StudentVoice', studentVoiceSchema);
