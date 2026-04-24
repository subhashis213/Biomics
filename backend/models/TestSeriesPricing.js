const mongoose = require('mongoose');

// Stores per-course pricing for Test Series plans (separate from Pro/Elite).
// topicTestPriceInPaise: price to unlock Module/Topic-wise tests for that course
// fullMockPriceInPaise:  price to unlock Full Length Mock Tests only
const testSeriesPricingSchema = new mongoose.Schema({
  category: { type: String, required: true, trim: true, unique: true },
  topicTestPriceInPaise: { type: Number, required: true, min: 0, default: 0 },
  topicTestMrpInPaise: { type: Number, required: true, min: 0, default: 0 },
  topicTestValidityDays: { type: Number, required: true, min: 1, default: 60 },
  fullMockPriceInPaise: { type: Number, required: true, min: 0, default: 0 },
  fullMockMrpInPaise: { type: Number, required: true, min: 0, default: 0 },
  fullMockValidityDays: { type: Number, required: true, min: 1, default: 60 },
  thumbnailUrl: { type: String, trim: true, default: '' },
  thumbnailName: { type: String, trim: true, default: '' },
  currency: { type: String, default: 'INR', uppercase: true, trim: true },
  active: { type: Boolean, default: true },
  updatedBy: { type: String, trim: true, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('TestSeriesPricing', testSeriesPricingSchema);
