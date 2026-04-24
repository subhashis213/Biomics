const mongoose = require('mongoose');

const batchPricingSchema = new mongoose.Schema({
  category: { type: String, required: true, trim: true },
  batchName: { type: String, required: true, trim: true },
  proPriceInPaise: { type: Number, required: true, min: 0, default: 0 },
  elitePriceInPaise: { type: Number, required: true, min: 0, default: 0 },
  proMrpInPaise: { type: Number, min: 0, default: 0 },
  eliteMrpInPaise: { type: Number, min: 0, default: 0 },
  proTenureMonths: { type: Number, required: true, min: 1, default: 1 },
  eliteTenureMonths: { type: Number, required: true, min: 1, default: 3 },
  thumbnailUrl: { type: String, trim: true, default: '' },
  thumbnailName: { type: String, trim: true, default: '' },
  currency: { type: String, default: 'INR', uppercase: true, trim: true },
  active: { type: Boolean, default: true },
  updatedBy: { type: String, trim: true, default: '' }
}, { timestamps: true });

batchPricingSchema.index({ category: 1, batchName: 1 }, { unique: true });

module.exports = mongoose.model('BatchPricing', batchPricingSchema);
