const mongoose = require('mongoose');

// Persisted result for each Full Mock Test submission (Test Series section).
// Students may retake — no unique constraint per test.
const fullMockAttemptSchema = new mongoose.Schema({
  mockId: { type: mongoose.Schema.Types.ObjectId, ref: 'FullMockTest', required: true },
  username: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true },
  title: { type: String, required: true, trim: true },
  score: { type: Number, required: true, min: 0 },
  total: { type: Number, required: true, min: 1 },
  durationSeconds: { type: Number, min: 0, default: 0 },
  submittedAt: { type: Date, default: Date.now }
});

fullMockAttemptSchema.index({ username: 1, category: 1, submittedAt: -1 });
fullMockAttemptSchema.index({ mockId: 1, username: 1 });

module.exports = mongoose.model('FullMockAttempt', fullMockAttemptSchema);
