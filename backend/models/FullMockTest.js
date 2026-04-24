const mongoose = require('mongoose');

const fullMockQuestionSchema = new mongoose.Schema({
  question: { type: String, required: true, trim: true },
  imageUrl: { type: String, trim: true, default: '' },
  imageName: { type: String, trim: true, default: '' },
  options: {
    type: [{ type: String, trim: true }],
    validate: {
      validator: (v) => Array.isArray(v) && v.length === 4 && v.every((o) => o && o.trim().length > 0),
      message: 'Each question must have exactly 4 non-empty options.'
    },
    required: true
  },
  correctIndex: { type: Number, min: 0, max: 3, required: true },
  explanation: { type: String, trim: true, default: '' }
}, { _id: false });

// Full-length mock test — part of Test Series (on-demand, not time-scheduled like MockExam).
const fullMockTestSchema = new mongoose.Schema({
  category: { type: String, required: true, trim: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: '' },
  durationMinutes: { type: Number, min: 5, max: 300, default: 90 },
  questions: {
    type: [fullMockQuestionSchema],
    validate: {
      validator: (v) => Array.isArray(v) && v.length > 0,
      message: 'Full mock test must contain at least one question.'
    },
    required: true
  },
  batch: { type: String, trim: true, default: '' },
  updatedBy: { type: String, trim: true, default: '' },
  updatedAt: { type: Date, default: Date.now }
});

fullMockTestSchema.index({ category: 1 });

module.exports = mongoose.model('FullMockTest', fullMockTestSchema);
