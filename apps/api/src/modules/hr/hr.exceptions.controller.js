'use strict';

const Attendance = require('../attendance/attendance.model');
const Team = require('../teams/teams.model');
const User = require('../admin/admin.model');

// ── GET ATTENDANCE EXCEPTION SUMMARY ───────────────────────────────────────
// Read-only counts (late, absent, on leave) per person and month.
// DocumentDB 5.0 safe: clean find query without $lookup, $facet, or $merge.
async function getAttendanceExceptions(req, res, next) {
  try {
    const caller = req.user;
    const callerIdStr = (caller.sub || caller._id || caller.id)?.toString();
    const { month } = req.query;

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ success: false, message: 'Valid month query parameter (YYYY-MM) is required.' });
    }

    let targetMembers = []; // [{ id, name }]

    if (caller.role === 'T3_EXECUTIVE') {
      const ledTeams = await Team.find({ leadId: callerIdStr }).select('_id members').lean();
      if (!ledTeams || ledTeams.length === 0) {
        return res.json({ success: true, data: [] });
      }

      const ledTeamIds = new Set(ledTeams.map((t) => t._id.toString()));
      const memberIdSet = new Set();

      if (req.query.teamId) {
        if (!ledTeamIds.has(req.query.teamId.toString())) {
          return res.status(403).json({ success: false, message: 'Access denied: You do not lead this team.' });
        }
        const targetTeam = ledTeams.find((t) => t._id.toString() === req.query.teamId.toString());
        for (const m of (targetTeam.members || [])) {
          if (m.toString() !== callerIdStr) memberIdSet.add(m.toString());
        }
      } else {
        for (const t of ledTeams) {
          for (const m of (t.members || [])) {
            if (m.toString() !== callerIdStr) memberIdSet.add(m.toString());
          }
        }
      }

      if (req.query.employeeId) {
        if (!memberIdSet.has(req.query.employeeId.toString())) {
          return res.status(403).json({ success: false, message: 'Access denied: Employee is not in your led teams.' });
        }
        memberIdSet.clear();
        memberIdSet.add(req.query.employeeId.toString());
      }

      const memberIds = Array.from(memberIdSet);
      if (memberIds.length === 0) return res.json({ success: true, data: [] });

      const users = await User.find({ _id: { $in: memberIds } }).select('_id name').lean();
      targetMembers = users.map((u) => ({ id: u._id.toString(), name: u.name }));
    } else {
      // ADMIN / SUPER_ADMIN
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
        // All active users
        const users = await User.find({ isActive: true }).select('_id name').lean();
        targetMembers = users.map((u) => ({ id: u._id.toString(), name: u.name }));
      }
    }

    if (targetMembers.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const targetUserIds = targetMembers.map((m) => m.id);

    // Query attendance records for the month:
    // Model lines apps/api/src/modules/attendance/attendance.model.js:5,11
    // Both 'user' and 'studentId' reference User._id; we check user in targetUserIds.
    const records = await Attendance.find({
      user: { $in: targetUserIds },
      date: { $gte: `${month}-01`, $lte: `${month}-31` },
      status: { $in: ['late', 'absent', 'on_leave'] },
    }).select('user studentId status date').lean();

    // In-memory tally per person
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

    const result = Array.from(countsMap.values());
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAttendanceExceptions,
};
