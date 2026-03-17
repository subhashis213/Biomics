const AuditLog = require('../models/AuditLog');

async function logAdminAction(req, payload) {
  try {
    await AuditLog.create({
      action: payload.action,
      actorRole: req.user?.role || 'unknown',
      actorUsername: req.user?.username || 'unknown',
      targetType: payload.targetType || 'unknown',
      targetId: payload.targetId || '',
      details: payload.details || {}
    });
  } catch {
    // Best effort logging only; do not block the primary action.
  }
}

module.exports = { logAdminAction };
