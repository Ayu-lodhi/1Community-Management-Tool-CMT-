const MonthLock = require('../../models/MonthLock.model');
const Team = require('../teams/teams.model');
const { AuthorizationError, ValidationError } = require('../../core/errors/typedErrors');

const checkMonthNotLocked = (getDate) => async (req, res, next) => {
  try {
    const rawDate = typeof getDate === 'function' ? getDate(req) : (req.body?.[getDate] || req.query?.[getDate] || req.body?.date || req.query?.date);
    if (!rawDate || typeof rawDate !== 'string') {
      return next();
    }
    const month = rawDate.slice(0, 7);
    const lock = await MonthLock.findOne({ month, isLocked: true });
    if (lock) {
      return res.status(403).json({
        success: false,
        message: `Month ${month} is finalized and locked against modifications.`,
      });
    }
    next();
  } catch (err) {
    next(err);
  }
};

const requireTeamLeadOrAdmin = async (req, res, next) => {
  try {
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user?.role);
    if (isAdmin) return next();

    const teamId = req.body?.teamId || req.query?.teamId || req.params?.teamId;
    if (!teamId) {
      throw new ValidationError('teamId is required');
    }

    const team = await Team.findById(teamId).select('leadId');
    if (!team) {
      return res.status(404).json({ success: false, message: 'Team not found' });
    }

    const isLead = team.leadId && team.leadId.toString() === req.user?.sub;
    if (!isLead) {
      throw new AuthorizationError('Only the designated team lead or an administrator can perform this action');
    }

    req.team = team;
    next();
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    next(err);
  }
};

module.exports = {
  checkMonthNotLocked,
  requireTeamLeadOrAdmin,
};
