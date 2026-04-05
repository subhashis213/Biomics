const mongoose = require('mongoose');

const mockExamAttemptSchema = new mongoose.Schema({
  examId: { type: mongoose.Schema.Types.ObjectId, ref: 'MockExam', required: true },
  username: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true },
  score: { type: Number, required: true, min: 0 },
  total: { type: Number, required: true, min: 1 },
  answers: [{ type: Number, min: -1, max: 3 }],
  durationSeconds: { type: Number, min: 0 },
  submittedAt: { type: Date, default: Date.now }
});

mockExamAttemptSchema.index({ examId: 1, username: 1 }, { unique: true });
mockExamAttemptSchema.index({ username: 1, category: 1, submittedAt: -1 });

module.exports = mongoose.model('MockExamAttempt', mockExamAttemptSchema);
