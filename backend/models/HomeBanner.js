const mongoose = require('mongoose');

const homeBannerSchema = new mongoose.Schema({
  title: { type: String, trim: true, default: '' },
  imageUrl: { type: String, required: true, trim: true },
  linkUrl: { type: String, trim: true, default: '' },
  active: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
  createdBy: { type: String, trim: true, default: '' },
  updatedBy: { type: String, trim: true, default: '' }
}, { timestamps: true });

homeBannerSchema.index({ active: 1, sortOrder: 1, createdAt: -1 });

module.exports = mongoose.model('HomeBanner', homeBannerSchema);
