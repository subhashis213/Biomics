const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true, index: true },
  course: { type: String, required: true, trim: true, index: true },
  batch: { type: String, trim: true, default: 'General', index: true },
  moduleName: { type: String, trim: true, default: 'ALL_MODULES', index: true },
  planType: { type: String, enum: ['pro', 'elite'], required: true },
  durationMonths: { type: Number, required: true, min: 1 },
  status: {
    type: String,
    enum: ['created', 'paid', 'failed'],
    default: 'created',
    index: true
  },
  amountInPaise: { type: Number, required: true, min: 0 },
  originalAmountInPaise: { type: Number, required: true, min: 0 },
  discountInPaise: { type: Number, required: true, min: 0, default: 0 },
  currency: { type: String, required: true, default: 'INR', uppercase: true, trim: true },
  voucherCode: { type: String, trim: true, default: '' },
  voucherSnapshot: {
    discountType: { type: String, enum: ['percent', 'fixed', ''], default: '' },
    discountValue: { type: Number, default: 0 }
  },
  razorpayOrderId: { type: String, trim: true, default: '', index: true },
  razorpayPaymentId: { type: String, trim: true, default: '' },
  razorpaySignature: { type: String, trim: true, default: '' },
  paidAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
