const mongoose = require('mongoose');

const liveClassSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: '' },
  roomName: { type: String, required: true, trim: true },
  meetUrl: { type: String, trim: true, default: '' },
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date, default: null },
  isActive: { type: Boolean, default: true },
  isScheduled: { type: Boolean, default: false },
  scheduledAt: { type: Date, default: null },
  scheduledEndAt: { type: Date, default: null },
  status: { type: String, enum: ['scheduled', 'live', 'ended', 'cancelled'], default: 'live' },
  course: { type: String, trim: true, default: '' },
  maxParticipants: { type: Number, default: 101 },
  premiumOnly: { type: Boolean, default: true },
  allowedUsernames: [{ type: String, trim: true }],
  removedUsernames: [{ type: String, trim: true }],
  createdBy: { type: String, trim: true, default: '' },
  serverInstanceId: { type: String, trim: true, default: '' },
  pollState: {
    isActive: { type: Boolean, default: false },
    question: { type: String, trim: true, default: '' },
    options: [{ type: String, trim: true }],
    correctOption: { type: String, trim: true, default: '' },
    revealed: { type: Boolean, default: false },
    updatedAt: { type: Date, default: null }
  }
}, { timestamps: true });

module.exports = mongoose.model('LiveClass', liveClassSchema);
