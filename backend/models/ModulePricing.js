const mongoose = require('mongoose');

// ModulePricing stores Pro/Elite prices per module per course.
// moduleName === 'ALL_MODULES' is the course-wide bundle entry.
const modulePricingSchema = new mongoose.Schema({
  category: { type: String, required: true, trim: true },
  moduleName: { type: String, required: true, trim: true, default: 'ALL_MODULES' },
  proPriceInPaise: { type: Number, required: true, min: 0, default: 0 },
  elitePriceInPaise: { type: Number, required: true, min: 0, default: 0 },
  currency: { type: String, default: 'INR', uppercase: true, trim: true },
  active: { type: Boolean, default: true },
  updatedBy: { type: String, trim: true, default: '' }
}, { timestamps: true });

modulePricingSchema.index({ category: 1, moduleName: 1 }, { unique: true });

module.exports = mongoose.model('ModulePricing', modulePricingSchema);
