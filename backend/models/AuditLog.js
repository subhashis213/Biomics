const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  action: { type: String, required: true },
  actorRole: { type: String, required: true },
  actorUsername: { type: String, required: true },
  targetType: { type: String, required: true },
  targetId: { type: String, default: '' },
  details: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

module.exports = mongoose.model('AuditLog', auditLogSchema);