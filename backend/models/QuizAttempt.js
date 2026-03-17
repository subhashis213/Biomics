const mongoose = require('mongoose');

const quizAttemptSchema = new mongoose.Schema({
  quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
  username: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true },
  module: { type: String, required: true, trim: true },
  score: { type: Number, required: true, min: 0 },
  total: { type: Number, required: true, min: 1 },
  answers: [{ type: Number, min: -1, max: 3 }],
  durationSeconds: { type: Number, min: 0 },
  submittedAt: { type: Date, default: Date.now }
});

quizAttemptSchema.index({ username: 1, category: 1, module: 1, submittedAt: -1 });

module.exports = mongoose.model('QuizAttempt', quizAttemptSchema);
