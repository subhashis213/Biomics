const mongoose = require('mongoose');

function normalizeCourseText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

const courseBatchSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: '' },
  active: { type: Boolean, default: true }
}, { _id: false });

const courseSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true },
  displayName: { type: String, trim: true, default: '' },
  description: { type: String, trim: true, default: '' },
  icon: { type: String, trim: true, default: '' },
  active: { type: Boolean, default: true },
  archived: { type: Boolean, default: false },
  batches: { type: [courseBatchSchema], default: [] },
  createdBy: { type: String, trim: true, default: '' },
  updatedBy: { type: String, trim: true, default: '' }
}, { timestamps: true });

courseSchema.pre('validate', function normalizeFields(next) {
  this.name = normalizeCourseText(this.name);
  this.displayName = normalizeCourseText(this.displayName || this.name);
  this.description = String(this.description || '').trim();

  const normalizedBatches = [];
  const seen = new Set();
  (Array.isArray(this.batches) ? this.batches : []).forEach((entry) => {
    const name = normalizeCourseText(entry?.name);
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    normalizedBatches.push({
      name,
      description: String(entry?.description || '').trim(),
      active: entry?.active !== false
    });
  });
  this.batches = normalizedBatches;
  next();
});

module.exports = mongoose.model('Course', courseSchema);
