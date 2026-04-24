const mongoose = require('mongoose');

const quizQuestionSchema = new mongoose.Schema({
  question: { type: String, required: true, trim: true },
  options: {
    type: [{ type: String, trim: true }],
    validate: {
      validator: (value) => Array.isArray(value) && value.length === 4 && value.every((opt) => opt && opt.trim().length > 0),
      message: 'Each question must have exactly 4 non-empty options.'
    },
    required: true
  },
  correctIndex: { type: Number, min: 0, max: 3, required: true },
  explanation: { type: String, trim: true }
}, { _id: false });

const quizSchema = new mongoose.Schema({
  category: { type: String, required: true, trim: true },
  batch: { type: String, trim: true, default: '' },
  module: { type: String, required: true, trim: true },
  topic: { type: String, trim: true, default: 'General' },
  title: { type: String, required: true, trim: true },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    default: 'medium'
  },
  requireExplanation: { type: Boolean, default: false },
  timeLimitMinutes: { type: Number, min: 1, max: 180, default: 15 },
  questions: {
    type: [quizQuestionSchema],
    validate: {
      validator: (value) => Array.isArray(value) && value.length > 0,
      message: 'Quiz must contain at least one question.'
    },
    required: true
  },
  updatedBy: { type: String, trim: true },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Quiz', quizSchema);
