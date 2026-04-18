const mongoose = require('mongoose');

const userActivitySessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true, index: true },
  username: { type: String, required: true, index: true },
  role: { type: String, required: true, index: true },
  startedAt: { type: Date, required: true, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
  endedAt: { type: Date, default: null },
  isActive: { type: Boolean, default: true },
  totalActiveSeconds: { type: Number, default: 0 },
  pageViews: { type: Number, default: 0 },
  firstPath: { type: String, default: '/' },
  lastPath: { type: String, default: '/' },
  lastTitle: { type: String, default: '' },
  dayBuckets: { type: Map, of: Number, default: () => ({}) }
}, { timestamps: true });

module.exports = mongoose.model('UserActivitySession', userActivitySessionSchema);