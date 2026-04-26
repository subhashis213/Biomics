const mongoose = require('mongoose');

// ModulePricing stores Pro/Elite prices per module per course.
// moduleName === 'ALL_MODULES' is the course-wide bundle entry.
const modulePricingSchema = new mongoose.Schema({
  category: { type: String, required: true, trim: true },
  batch: { type: String, trim: true, default: 'General' },
  moduleName: { type: String, required: true, trim: true, default: 'ALL_MODULES' },
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

modulePricingSchema.index({ category: 1, batch: 1, moduleName: 1 }, { unique: true });

module.exports = mongoose.model('ModulePricing', modulePricingSchema);
