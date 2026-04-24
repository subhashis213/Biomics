const mongoose = require('mongoose');

// Tracks test series purchases — completely separate from Pro/Elite course payments.
// seriesType:
//   'topic_test'  → unlocks topic-wise tests AND full mocks (complementary)
//   'full_mock'   → unlocks full mock tests only
const testSeriesPaymentSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true, index: true },
  course: { type: String, required: true, trim: true, index: true },
  seriesType: {
    type: String,
    enum: ['topic_test', 'full_mock'],
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['created', 'paid', 'failed'],
    default: 'created',
    index: true
  },
  amountInPaise: { type: Number, required: true, min: 0 },
  originalAmountInPaise: { type: Number, required: true, min: 0 },
  discountInPaise: { type: Number, default: 0, min: 0 },
  voucherCode: { type: String, trim: true, default: null },
  appliedVoucherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Voucher', default: null },
  currency: { type: String, default: 'INR', uppercase: true, trim: true },
  razorpayOrderId: { type: String, trim: true, default: '', index: true },
  razorpayPaymentId: { type: String, trim: true, default: '' },
  razorpaySignature: { type: String, trim: true, default: '' },
  paidAt: { type: Date, default: null },
  validityDays: { type: Number, min: 1, default: 60 },
  expiresAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('TestSeriesPayment', testSeriesPaymentSchema);
