const mongoose = require('mongoose');

// Persisted result for each Topic Test submission (Test Series section).
// Students may retake — no unique constraint per test.
const topicTestAttemptSchema = new mongoose.Schema({
  testId: { type: mongoose.Schema.Types.ObjectId, ref: 'TopicTest', required: true },
  username: { type: String, required: true, trim: true },
  category: { type: String, required: true, trim: true },
  module: { type: String, required: true, trim: true },
  topic: { type: String, required: true, trim: true, default: 'General' },
  title: { type: String, required: true, trim: true },
  score: { type: Number, required: true, min: 0 },
  total: { type: Number, required: true, min: 1 },
  durationSeconds: { type: Number, min: 0, default: 0 },
  feedbackReaction: { type: String, enum: ['up', 'down'], default: null },
  feedbackAt: { type: Date, default: null },
  submittedAt: { type: Date, default: Date.now }
});

topicTestAttemptSchema.index({ username: 1, category: 1, module: 1, submittedAt: -1 });
topicTestAttemptSchema.index({ testId: 1, username: 1 });

module.exports = mongoose.model('TopicTestAttempt', topicTestAttemptSchema);
