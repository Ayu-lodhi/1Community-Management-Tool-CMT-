'use strict';

const HrReview = require('./hr.reviews.model');
const User = require('../admin/admin.model');
const Team = require('../teams/teams.model');
const { isLeadOfPerson } = require('./hr.permissions');
const { calculatePerformanceScore } = require('./hr.calculations');
const { recordHrAudit } = require('./hr.middleware');

// ── SUBMIT REVIEW ──────────────────────────────────────────────────────────
async function submitReview(req, res, next) {
  try {
    const caller = req.user;
    const callerIdStr = (caller.sub || caller._id || caller.id)?.toString();
    const { employeeId, period, items, notes } = req.body;

    // Rule: Nobody reports on or reviews themselves
    if (callerIdStr === employeeId?.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied: You cannot submit a performance review for yourself.' });
    }

    // Verify employee exists
    const employee = await User.findById(employeeId).select('_id name');
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    let resolvedTeamId;

    if (caller.role === 'T3_EXECUTIVE') {
      // Derive team from DB, ignoring body
      const team = await Team.findOne({ leadId: callerIdStr, members: employeeId }).lean();
      if (!team) {
        return res.status(403).json({ success: false, message: 'Access denied: Member is not in any team you lead.' });
      }
      resolvedTeamId = team._id;
    } else {
      // ADMIN / SUPER_ADMIN
      if (req.body.teamId) {
        const team = await Team.findById(req.body.teamId).lean();
        resolvedTeamId = team ? team._id : null;
      }
      if (!resolvedTeamId) {
        const anyTeam = await Team.findOne({ members: employeeId }).lean();
        if (anyTeam) resolvedTeamId = anyTeam._id;
      }
      if (!resolvedTeamId) {
        return res.status(400).json({ success: false, message: 'Team could not be determined for this employee.' });
      }
    }

    // Calculate clean-room weighted performance score
    const { maxWeightedScore, obtainedWeightedScore, netScorePercentage } = calculatePerformanceScore(items);

    const review = await HrReview.findOneAndUpdate(
      { employeeId, period },
      {
        $set: {
          employeeName: employee.name,
          teamId: resolvedTeamId,
          reviewerId: callerIdStr,
          reviewerName: caller.name || caller.role,
          items,
          maxWeightedScore,
          obtainedWeightedScore,
          netScorePercentage,
          notes: notes || '',
        },
      },
      { upsert: true, new: true, runValidators: true }
    );

    await recordHrAudit({
      performedBy: callerIdStr,
      performedByName: caller.name || caller.role,
      action: 'HR_REVIEW_SUBMIT',
      targetId: review._id,
      targetType: 'HrReview',
      details: {
        employeeId,
        teamId: resolvedTeamId,
        period,
        netScorePercentage,
      },
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, data: review });
  } catch (err) {
    next(err);
  }
}

// ── LIST REVIEWS ───────────────────────────────────────────────────────────
async function listReviews(req, res, next) {
  try {
    const caller = req.user;
    const callerIdStr = (caller.sub || caller._id || caller.id)?.toString();
    const filter = {};

    if (caller.role === 'T3_EXECUTIVE') {
      const ledTeams = await Team.find({ leadId: callerIdStr }).select('_id members').lean();
      if (!ledTeams || ledTeams.length === 0) {
        return res.json({ success: true, data: [] });
      }

      const ledTeamIds = new Set(ledTeams.map((t) => t._id.toString()));
      const ledMemberIds = new Set();
      for (const t of ledTeams) {
        for (const m of (t.members || [])) {
          if (m.toString() !== callerIdStr) {
            ledMemberIds.add(m.toString());
          }
        }
      }

      if (req.query.teamId) {
        if (!ledTeamIds.has(req.query.teamId.toString())) {
          return res.status(403).json({ success: false, message: 'Access denied: You do not lead this team.' });
        }
        filter.teamId = req.query.teamId;
      } else {
        filter.teamId = { $in: Array.from(ledTeamIds) };
      }

      if (req.query.employeeId) {
        if (!ledMemberIds.has(req.query.employeeId.toString())) {
          return res.status(403).json({ success: false, message: 'Access denied: Employee is not in your led teams.' });
        }
        filter.employeeId = req.query.employeeId;
      } else {
        filter.employeeId = { $in: Array.from(ledMemberIds) };
      }
    } else {
      if (req.query.teamId) filter.teamId = req.query.teamId;
      if (req.query.employeeId) filter.employeeId = req.query.employeeId;
    }

    if (req.query.period) filter.period = req.query.period;

    const reviews = await HrReview.find(filter)
      .sort({ period: -1, netScorePercentage: -1 })
      .lean();

    res.json({ success: true, data: reviews });
  } catch (err) {
    next(err);
  }
}

// ── EMPLOYEE REVIEW HISTORY ────────────────────────────────────────────────
async function getEmployeeReviewHistory(req, res, next) {
  try {
    const caller = req.user;
    const callerIdStr = (caller.sub || caller._id || caller.id)?.toString();
    const { employeeId } = req.params;

    // Self check
    if (callerIdStr === employeeId?.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied: Cannot view performance history for yourself.' });
    }

    if (caller.role === 'T3_EXECUTIVE') {
      const isLead = await isLeadOfPerson(callerIdStr, employeeId);
      if (!isLead) {
        return res.status(403).json({ success: false, message: 'Access denied: You do not lead this member.' });
      }
    }

    const reviews = await HrReview.find({ employeeId })
      .sort({ period: -1 })
      .lean();

    res.json({ success: true, data: reviews });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  submitReview,
  listReviews,
  getEmployeeReviewHistory,
};
