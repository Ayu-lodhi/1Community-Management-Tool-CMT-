const AuditLog = require('../models/AuditLog.model');

// Derive target entity type from action name
const actionToTargetType = (action) => {
  if (action.includes('USER')) return 'User';
  if (action.includes('ACCESS') || action.includes('PASSWORD')) return 'User';
  if (action.includes('EVENT')) return 'Event';
  if (action.includes('TEAM')) return 'Team';
  if (action.includes('APPLICATION')) return 'Application';
  if (action.includes('ATTENDANCE')) return 'Attendance';
  return 'System';
};

const auditLog = (action) => async (req, res, next) => {
  res.on('finish', async () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      try {
        await AuditLog.create({
          action,
          performedBy: req.user?.sub || null,
          performedByName: req.user?.name || req.user?.email || '',
          targetId: req.params?.id || null,
          targetType: actionToTargetType(action),  // H4: dynamic, not hardcoded 'Event'
          ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null,
          details: {
            body: req.body,
            params: req.params,
          },
          timestamp: new Date(),
        });
      } catch (err) {
        console.error('AuditLog error:', err.message);
      }
    }
  });
  next();
};

module.exports = { auditLog };
