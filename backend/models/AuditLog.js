const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  action: { type: String, required: true },
  actorRole: { type: String, required: true },
  actorUsername: { type: String, required: true },
  targetType: { type: String, required: true },
  targetId: { type: String, default: '' },
  details: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

// ── Performance indexes ───────────────────────────────────────────────────────
// Primary: paginated audit log sorted by newest first
auditLogSchema.index({ createdAt: -1 });
// Filter by actor (admin search)
auditLogSchema.index({ actorUsername: 1, createdAt: -1 });
// Filter by action type (admin search)
auditLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);