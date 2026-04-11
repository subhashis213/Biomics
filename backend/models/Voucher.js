const mongoose = require('mongoose');

const voucherSchema = new mongoose.Schema({
  code: { type: String, required: true, trim: true, uppercase: true, unique: true },
  description: { type: String, trim: true, default: '' },
  discountType: { type: String, enum: ['percent', 'fixed'], required: true },
  discountValue: { type: Number, required: true, min: 0 },
  maxDiscountInPaise: { type: Number, min: 0, default: null },
  active: { type: Boolean, default: true },
  validFrom: { type: Date, default: null },
  validUntil: { type: Date, default: null },
  usageLimit: { type: Number, min: 1, default: null },
  usedCount: { type: Number, min: 0, default: 0 },
  applicableCourses: [{ type: String, trim: true }],
  applicableTestSeries: [{ type: String, enum: ['topic_test', 'full_mock'], trim: true }],
  createdBy: { type: String, trim: true, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Voucher', voucherSchema);
