const mongoose = require('mongoose');

const freeStudyResourceSchema = new mongoose.Schema({
  courseName: { type: String, required: true, trim: true, index: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  resourceType: {
    type: String,
    enum: ['book', 'material', 'job-notes'],
    default: 'material',
    index: true
  },
  filename: { type: String, required: true, trim: true },
  originalName: { type: String, default: '', trim: true },
  fileUrl: { type: String, default: '', trim: true },
  cloudinaryPublicId: { type: String, default: '', trim: true },
  mimeType: { type: String, default: 'application/pdf', trim: true },
  fileSize: { type: Number, default: 0 },
  coverUrl: { type: String, default: '', trim: true },
  isActive: { type: Boolean, default: true, index: true },
  sortOrder: { type: Number, default: 0 },
  createdBy: { type: String, default: '', trim: true }
}, { timestamps: true });

module.exports = mongoose.model('FreeStudyResource', freeStudyResourceSchema);
