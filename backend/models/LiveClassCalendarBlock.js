const mongoose = require('mongoose');

const liveClassCalendarBlockSchema = new mongoose.Schema({
  course: { type: String, required: true, trim: true },
  batch: { type: String, trim: true, default: 'General' },
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: '' },
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, required: true },
  kind: { type: String, enum: ['blocked-slot'], default: 'blocked-slot' },
  createdBy: { type: String, trim: true, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('LiveClassCalendarBlock', liveClassCalendarBlockSchema);
