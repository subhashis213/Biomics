const mongoose = require('mongoose');

function normalizeCourseText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

const courseBatchSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: '' },
  active: { type: Boolean, default: true },
  /** Authoritative module titles for this batch (admin catalog; merged with DB/content on read). */
  moduleNames: { type: [String], default: [] }
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
    const modSeen = new Set();
    const moduleNames = [];
    (Array.isArray(entry?.moduleNames) ? entry.moduleNames : []).forEach((raw) => {
      const mod = normalizeCourseText(raw);
      if (!mod) return;
      const mk = mod.toLowerCase();
      if (modSeen.has(mk)) return;
      modSeen.add(mk);
      moduleNames.push(mod);
    });
    normalizedBatches.push({
      name,
      description: String(entry?.description || '').trim(),
      active: entry?.active !== false,
      moduleNames
    });
  });
  this.batches = normalizedBatches;
  next();
});

module.exports = mongoose.model('Course', courseSchema);
