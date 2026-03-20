const mongoose = require('mongoose');

const liveClassSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  meetUrl: { type: String, trim: true, default: '' },
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date, default: null },
  isActive: { type: Boolean, default: true },
  isScheduled: { type: Boolean, default: false },
  scheduledAt: { type: Date, default: null }
});

module.exports = mongoose.model('LiveClass', liveClassSchema);
