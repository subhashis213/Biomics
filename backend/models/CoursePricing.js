const mongoose = require('mongoose');

const coursePricingSchema = new mongoose.Schema({
  category: { type: String, required: true, trim: true, unique: true },
  proPriceInPaise: { type: Number, required: true, min: 0, default: 0 },
  elitePriceInPaise: { type: Number, required: true, min: 0, default: 0 },
  proTenureMonths: { type: Number, required: true, min: 1, default: 1 },
  eliteTenureMonths: { type: Number, required: true, min: 1, default: 3 },
  currency: { type: String, default: 'INR', uppercase: true, trim: true },
  active: { type: Boolean, default: true },
  updatedBy: { type: String, trim: true, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('CoursePricing', coursePricingSchema);
