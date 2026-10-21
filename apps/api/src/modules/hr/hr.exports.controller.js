'use strict';

const HrIncident = require('./hr.incidents.model');
const HrReview = require('./hr.reviews.model');
const Attendance = require('../attendance/attendance.model');
const Team = require('../teams/teams.model');
const User = require('../admin/admin.model');
const { generateSanitizedCsv } = require('./hr.calculations');
const { recordHrAudit } = require('./hr.middleware');

// Helper to determine allowed team and member IDs for T3
async function resolveT3Scope(callerIdStr, queryTeamId, queryEmployeeId) {
  const ledTeams = await Team.find({ leadId: callerIdStr }).select('_id members').lean();
  if (!ledTeams || ledTeams.length === 0) {
    return { ledTeamIds: [], ledMemberIds: [] };
  }

  const allLedTeamIds = new Set(ledTeams.map((t) => t._id.toString()));
  const allLedMemberIds = new Set();
  for (const t of ledTeams) {
    for (const m of (t.members || [])) {
      if (m.toString() !== callerIdStr) allLedMemberIds.add(m.toString());
    }
  }

  if (queryTeamId && !allLedTeamIds.has(queryTeamId.toString())) {
    const err = new Error('Access denied: You do not lead this team.');
    err.statusCode = 403;
    throw err;
  }

  if (queryEmployeeId && !allLedMemberIds.has(queryEmployeeId.toString())) {
    const err = new Error('Access denied: Employee is not in your led teams.');
    err.statusCode = 403;
    throw err;
  }

  const effectiveTeamIds = queryTeamId ? [queryTeamId] : Array.from(allLedTeamIds);
  const effectiveMemberIds = queryEmployeeId ? [queryEmployeeId] : Array.from(allLedMemberIds);

  return { effectiveTeamIds, effectiveMemberIds };
}

// ── EXPORT INCIDENTS ───────────────────────────────────────────────────────
async function exportIncidentsCsv(req, res, next) {
  try {
    const caller = req.user;
    const callerIdStr = (caller.sub || caller._id || caller.id)?.toString();
    const filter = { isDeleted: { $ne: true } };

    if (caller.role === 'T3_EXECUTIVE') {
      const { effectiveTeamIds, effectiveMemberIds } = await resolveT3Scope(
        callerIdStr,
        req.query.teamId,
        req.query.employeeId
      );
      if (effectiveTeamIds.length === 0 || effectiveMemberIds.length === 0) {
        const emptyCsv = generateSanitizedCsv({
          headers: ['Incident ID', 'Date', 'Employee Name', 'Feedback Type', 'Severity', 'Title', 'Narrative', 'Logged By', 'Resolved', 'Resolution Notes'],
          rows: [],
        });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="incidents.csv"');
        return res.send(emptyCsv);
      }
      filter.teamId = { $in: effectiveTeamIds };
      filter.employeeId = { $in: effectiveMemberIds };
    } else {
      if (req.query.teamId) filter.teamId = req.query.teamId;
      if (req.query.employeeId) filter.employeeId = req.query.employeeId;
    }

    if (req.query.feedbackType) filter.feedbackType = req.query.feedbackType;
    if (req.query.isResolved !== undefined) filter.isResolved = req.query.isResolved === 'true';
    if (req.query.fromDate && req.query.toDate) {
      filter.date = { $gte: req.query.fromDate, $lte: req.query.toDate };
    }

    const incidents = await HrIncident.find(filter).sort({ date: -1 }).lean();

    const headers = [
      'Incident ID',
      'Date',
      'Employee Name',
      'Feedback Type',
      'Severity',
      'Title',
      'Narrative',
      'Logged By',
      'Resolved',
      'Resolution Notes',
    ];

    const rows = incidents.map((item) => [
      item._id ? String(item._id) : '',
      item.date || '',
      item.employeeName || '',
      item.feedbackType || '',
      item.severity || '',
      item.title || '',
      item.narrative || '',
      item.loggedByName || '',
      item.isResolved ? 'YES' : 'NO',
      item.resolutionNotes || '',
    ]);

    const csv = generateSanitizedCsv({ headers, rows });

    await recordHrAudit({
      performedBy: callerIdStr,
      performedByName: caller.name || caller.role,
      action: 'HR_EXPORT_INCIDENTS',
      targetId: null,
      targetType: 'Export',
      details: { recordCount: incidents.length },
      ipAddress: req.ip,
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="incidents.csv"');
    res.send(csv);
  } catch (err) {
    next(err);
  }
}

// ── EXPORT REVIEWS ─────────────────────────────────────────────────────────
async function exportReviewsCsv(req, res, next) {
  try {
    const caller = req.user;
    const callerIdStr = (caller.sub || caller._id || caller.id)?.toString();
    const filter = {};

    if (caller.role === 'T3_EXECUTIVE') {
      const { effectiveTeamIds, effectiveMemberIds } = await resolveT3Scope(
        callerIdStr,
        req.query.teamId,
        req.query.employeeId
      );
      if (effectiveTeamIds.length === 0 || effectiveMemberIds.length === 0) {
        const emptyCsv = generateSanitizedCsv({
          headers: ['Review ID', 'Employee Name', 'Period', 'Max Weighted Score', 'Obtained Weighted Score', 'Net Score (%)', 'Reviewer', 'Notes'],
          rows: [],
        });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="performance_reviews.csv"');
        return res.send(emptyCsv);
      }
      filter.teamId = { $in: effectiveTeamIds };
      filter.employeeId = { $in: effectiveMemberIds };
    } else {
      if (req.query.teamId) filter.teamId = req.query.teamId;
      if (req.query.employeeId) filter.employeeId = req.query.employeeId;
    }

    if (req.query.period) filter.period = req.query.period;

    const reviews = await HrReview.find(filter).sort({ period: -1 }).lean();

    const headers = [
      'Review ID',
      'Employee Name',
      'Period',
      'Max Weighted Score',
      'Obtained Weighted Score',
      'Net Score (%)',
      'Reviewer',
      'Notes',
    ];

    const rows = reviews.map((rev) => [
      rev._id ? String(rev._id) : '',
      rev.employeeName || '',
      rev.period || '',
      rev.maxWeightedScore ?? 0,
      rev.obtainedWeightedScore ?? 0,
      `${(rev.netScorePercentage ?? 0).toFixed(2)}%`,
      rev.reviewerName || '',
      rev.notes || '',
    ]);

    const csv = generateSanitizedCsv({ headers, rows });

    await recordHrAudit({
      performedBy: callerIdStr,
      performedByName: caller.name || caller.role,
      action: 'HR_EXPORT_REVIEWS',
      targetId: null,
      targetType: 'Export',
      details: { recordCount: reviews.length },
      ipAddress: req.ip,
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="performance_reviews.csv"');
    res.send(csv);
  } catch (err) {
    next(err);
  }
}

// ── EXPORT ATTENDANCE EXCEPTIONS ───────────────────────────────────────────
async function exportExceptionsCsv(req, res, next) {
  try {
    const caller = req.user;
    const callerIdStr = (caller.sub || caller._id || caller.id)?.toString();
    const { month } = req.query;

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ success: false, message: 'Valid month query parameter (YYYY-MM) is required.' });
    }

    let targetMembers = [];

    if (caller.role === 'T3_EXECUTIVE') {
      const { effectiveMemberIds } = await resolveT3Scope(
        callerIdStr,
        req.query.teamId,
        req.query.employeeId
      );
      if (effectiveMemberIds.length === 0) {
        const emptyCsv = generateSanitizedCsv({
          headers: ['Employee ID', 'Employee Name', 'Month', 'Late Count', 'Absent Count', 'On Leave Count'],
          rows: [],
        });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="attendance_exceptions.csv"');
        return res.send(emptyCsv);
      }
      const users = await User.find({ _id: { $in: effectiveMemberIds } }).select('_id name').lean();
      targetMembers = users.map((u) => ({ id: u._id.toString(), name: u.name }));
    } else {
      if (req.query.employeeId) {
        const u = await User.findById(req.query.employeeId).select('_id name').lean();
        if (u) targetMembers = [{ id: u._id.toString(), name: u.name }];
      } else if (req.query.teamId) {
        const team = await Team.findById(req.query.teamId).select('members').lean();
        if (team && team.members?.length > 0) {
          const users = await User.find({ _id: { $in: team.members } }).select('_id name').lean();
          targetMembers = users.map((u) => ({ id: u._id.toString(), name: u.name }));
        }
      } else {
        const users = await User.find({ isActive: true }).select('_id name').lean();
        targetMembers = users.map((u) => ({ id: u._id.toString(), name: u.name }));
      }
    }

    const targetUserIds = targetMembers.map((m) => m.id);

    const records = await Attendance.find({
      user: { $in: targetUserIds },
      date: { $gte: `${month}-01`, $lte: `${month}-31` },
      status: { $in: ['late', 'absent', 'on_leave'] },
    }).select('user studentId status date').lean();

    const countsMap = new Map();
    for (const m of targetMembers) {
      countsMap.set(m.id, {
        employeeId: m.id,
        employeeName: m.name,
        month,
        lateCount: 0,
        absentCount: 0,
        onLeaveCount: 0,
      });
    }

    for (const r of records) {
      const uId = (r.user || r.studentId)?.toString();
      const entry = countsMap.get(uId);
      if (entry) {
        if (r.status === 'late') entry.lateCount++;
        else if (r.status === 'absent') entry.absentCount++;
        else if (r.status === 'on_leave') entry.onLeaveCount++;
      }
    }

    const headers = [
      'Employee ID',
      'Employee Name',
      'Month',
      'Late Count',
      'Absent Count',
      'On Leave Count',
    ];

    const rows = Array.from(countsMap.values()).map((c) => [
      c.employeeId,
      c.employeeName,
      c.month,
      c.lateCount,
      c.absentCount,
      c.onLeaveCount,
    ]);

    const csv = generateSanitizedCsv({ headers, rows });

    await recordHrAudit({
      performedBy: callerIdStr,
      performedByName: caller.name || caller.role,
      action: 'HR_EXPORT_EXCEPTIONS',
      targetId: null,
      targetType: 'Export',
      details: { recordCount: rows.length, month },
      ipAddress: req.ip,
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="attendance_exceptions.csv"');
    res.send(csv);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  exportIncidentsCsv,
  exportReviewsCsv,
  exportExceptionsCsv,
};
