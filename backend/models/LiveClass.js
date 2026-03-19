const mongoose = require('mongoose');

const liveClassSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  meetUrl: { type: String, required: true, trim: true },
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date, default: null },
  isActive: { type: Boolean, default: true }
});

module.exports = mongoose.model('LiveClass', liveClassSchema);
