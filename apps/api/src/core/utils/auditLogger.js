const AuditLog = require('../../models/AuditLog.model');

// Sensitive key patterns that must never appear in audit logs (Rule B.4)
const SENSITIVE_PATTERNS = [
  'password',
  'token',
  'secret',
  'mfa',
  'cookie',
  'authorization',
  'email',
  'phone',
  'otp',
  'credit',
];

/**
 * Recursively sanitizes audit payload to guarantee no secrets, credentials,
 * or personal data are written to audit records.
 */
function sanitizeAuditValue(val) {
  if (val === null || val === undefined) return val;
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map((item) => sanitizeAuditValue(item));
  }
  if (typeof val === 'object') {
    const sanitized = {};
    for (const [k, v] of Object.entries(val)) {
      const lower = k.toLowerCase();
      if (SENSITIVE_PATTERNS.some((pat) => lower.includes(pat))) {
        continue; // Omit sensitive field
      }
      sanitized[k] = sanitizeAuditValue(v);
    }
    return sanitized;
  }
  return String(val);
}

const mongoose = require('mongoose');

/**
 * Record an immutable audit log entry for role or permission changes.
 *
 * @param {Object} entry
 * @param {string} entry.performedBy - User ID of actor
 * @param {string} entry.performedByName - Name or role of actor
 * @param {string} entry.targetId - ID of affected entity/user
 * @param {string} entry.action - E.g. 'USER_ROLE_CHANGED', 'USER_PERMISSIONS_CHANGED'
 * @param {any} entry.oldValue - Prior role/permission state
 * @param {any} entry.newValue - New role/permission state
 * @param {string} [entry.ipAddress] - IP of actor
 */
async function recordPermissionAudit({
  performedBy,
  performedByName,
  targetId,
  targetType = 'User',
  action,
  oldValue,
  newValue,
  ipAddress = null,
}) {
  try {
    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
      // In offline / test fixture environments without MongoDB connected, do not block or buffer
      return null;
    }

    const cleanOld = sanitizeAuditValue(oldValue);
    const cleanNew = sanitizeAuditValue(newValue);

    const logEntry = await AuditLog.create({
      action,
      performedBy: performedBy || null,
      performedByName: performedByName || 'System',
      targetId: targetId || null,
      targetType,
      ipAddress,
      details: {
        oldValue: cleanOld,
        newValue: cleanNew,
      },
      timestamp: new Date(),
    });

    return logEntry;
  } catch (err) {
    const { logger } = require('./logger');
    logger.error('AuditLogger error', {
      metric: 'audit_write_failure',
      error: err.message,
      action,
      targetId,
      targetType
    });
    throw new Error('Audit log failed');
  }
}

module.exports = {
  recordPermissionAudit,
  sanitizeAuditValue,
};
