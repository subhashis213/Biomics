const mongoose = require('mongoose');

const mockExamQuestionSchema = new mongoose.Schema({
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

const mockExamSchema = new mongoose.Schema({
  category: { type: String, required: true, trim: true },
  batch: { type: String, trim: true, default: '' },
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  examDate: { type: Date, required: true },
  examWindowEndAt: { type: Date, default: null },
  durationMinutes: { type: Number, min: 5, max: 300, default: 60 },
  resultReleased: { type: Boolean, default: false },
  noticeEnabled: { type: Boolean, default: true },
  questions: {
    type: [mockExamQuestionSchema],
    validate: {
      validator: (value) => Array.isArray(value) && value.length > 0,
      message: 'Mock exam must contain at least one question.'
    },
    required: true
  },
  updatedBy: { type: String, trim: true },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('MockExam', mockExamSchema);
