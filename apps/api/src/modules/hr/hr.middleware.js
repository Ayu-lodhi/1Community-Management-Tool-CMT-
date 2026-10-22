'use strict';

const mongoose = require('mongoose');
const AuditLog = require('../../models/AuditLog.model');
const { sanitizeAuditValue } = require('../../core/utils/auditLogger');
const { logger } = require('../../core/utils/logger');
const { requireAdminPermission } = require('../auth/auth.middleware');

// ── In-memory rate limiter for HR writes ────────────────────────────────────
const inMemoryHrWriteRequests = new Map();
const HR_WRITE_WINDOW_MS = 60 * 1000;
const HR_WRITE_MAX_REQUESTS = 60;

setInterval(() => {
  const now = Date.now();
  for (const [key, record] of inMemoryHrWriteRequests.entries()) {
    if (now > record.resetTime) {
      inMemoryHrWriteRequests.delete(key);
    }
  }
}, 60000).unref();

function hrWriteLimiter(req, res, next) {
  const identifier = req.user?.sub || req.user?._id || req.ip || 'anonymous';
  const now = Date.now();
  const record = inMemoryHrWriteRequests.get(identifier) || { count: 0, resetTime: now + HR_WRITE_WINDOW_MS };

  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + HR_WRITE_WINDOW_MS;
  } else {
    record.count++;
  }

  inMemoryHrWriteRequests.set(identifier, record);

  if (typeof res.setHeader === 'function') {
    res.setHeader('X-RateLimit-Limit', HR_WRITE_MAX_REQUESTS);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, HR_WRITE_MAX_REQUESTS - record.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));
  }

  if (record.count > HR_WRITE_MAX_REQUESTS) {
    return res.status(429).json({ success: false, message: 'Too many requests, please try again later.' });
  }

  next();
}

// ── Audit Logging Helper for HR operations ─────────────────────────────────
async function recordHrAudit({ performedBy, performedByName, action, targetId, targetType = 'HR', details = {}, ipAddress = null }) {
  try {
    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
      return null;
    }
    const cleanDetails = sanitizeAuditValue(details);
    const log = await AuditLog.create({
      action,
      performedBy: performedBy || null,
      performedByName: performedByName || 'System',
      targetId: targetId ? String(targetId) : null,
      targetType,
      ipAddress,
      details: cleanDetails,
      timestamp: new Date(),
    });
    return log;
  } catch (err) {
    logger.error('HR Audit write failed', {
      error: err.message,
      action,
    });
    return null;
  }
}

// ── HR Role Gate: only T3_EXECUTIVE, ADMIN, and SUPER_ADMIN ────────────────
function requireHrRole(req, res, next) {
  const role = req.user?.role;
  if (!['T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'].includes(role)) {
    return res.status(403).json({ success: false, message: 'Access denied: HR module restricted to authorized personnel.' });
  }
  next();
}

module.exports = {
  hrWriteLimiter,
  recordHrAudit,
  requireHrRole,
};
