const mongoose = require('mongoose');

const loginOtpSchema = new mongoose.Schema({
  phone: { type: String, sparse: true, index: true },
  email: { type: String, sparse: true, index: true },
  otpHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
  lastSentAt: { type: Date, required: true },
  resendCount: { type: Number, default: 1 },
  used: { type: Boolean, default: false }
}, { timestamps: true });

loginOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('LoginOtp', loginOtpSchema);