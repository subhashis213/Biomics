const mongoose = require('mongoose');

const deviceTokenSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true, trim: true },
  username: { type: String, required: true, trim: true, index: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user', index: true },
  platform: { type: String, trim: true, default: 'android' },
  lastSeenAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('DeviceToken', deviceTokenSchema);
