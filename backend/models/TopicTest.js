const mongoose = require('mongoose');

const topicTestQuestionSchema = new mongoose.Schema({
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

// Module/Topic-wise test — part of Test Series (not the monthly scheduled exam).
const topicTestSchema = new mongoose.Schema({
  category: { type: String, required: true, trim: true },
  module: { type: String, required: true, trim: true },
  topic: { type: String, required: true, trim: true, default: 'General' },
  title: { type: String, required: true, trim: true },
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
  durationMinutes: { type: Number, min: 5, max: 300, default: 30 },
  questions: {
    type: [topicTestQuestionSchema],
    validate: {
      validator: (v) => Array.isArray(v) && v.length > 0,
      message: 'Topic test must contain at least one question.'
    },
    required: true
  },
  updatedBy: { type: String, trim: true, default: '' },
  updatedAt: { type: Date, default: Date.now }
});

topicTestSchema.index({ category: 1, module: 1, topic: 1 });

module.exports = mongoose.model('TopicTest', topicTestSchema);
