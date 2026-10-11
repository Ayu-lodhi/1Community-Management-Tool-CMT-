const Attendance = require('./attendance.model');
const Team = require('../teams/teams.model');
const User = require('../admin/admin.model');
const { assertTeamAttendanceAccess } = require('./attendance.permissions');
const { ValidationError, NotFoundError } = require('../../core/errors/typedErrors');

// Bound history generation to the module's 30-day reporting window.
const MAX_TEAM_HISTORY_DAYS = 30;

const getReadableTeam = async (teamId, requester) => {
  // A single ID keeps the authorized team and the attendance query identical.
  if (typeof teamId !== 'string' || !/^[a-f\d]{24}$/i.test(teamId)) {
    throw new ValidationError('Invalid teamId');
  }
  const team = await Team.findById(teamId);
  if (!team) throw new NotFoundError('Team not found');
  assertTeamAttendanceAccess(team, requester);
  return team;
};

const today = () => new Date().toISOString().split('T')[0];

const isLate = (cutoffHour = 9, cutoffMinute = 15) => {
  const now = new Date();
  const cutoff = new Date();
  cutoff.setHours(cutoffHour, cutoffMinute, 0, 0);
  return now > cutoff;
};

class AttendanceService {

  // T3 marks attendance for a team member
  async markAttendance(data, marker) {
    const {
      studentId,
      teamId,
      date,
      status,
      notes,
      shiftLabel,
    } = data;

    if (!studentId || !teamId) {
      const err = new Error('studentId and teamId are required');
      err.statusCode = 400;
      throw err;
    }
    if (!['present', 'late', 'absent', 'on_leave', 'half_day'].includes(status)) {
      const err = new Error('Invalid status');
      err.statusCode = 400;
      throw err;
    }

    const targetDate = date || today();

    // Verify team + marker is lead or admin
    const team = await Team.findById(teamId);
    if (!team) {
      const err = new Error('Team not found');
      err.statusCode = 404;
      throw err;
    }

    const isLead = team.leadId && team.leadId.toString() === marker.sub;
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(marker.role);
    if (!isLead && !isAdmin) {
      const err = new Error('Only the team lead or admin can mark attendance');
      err.statusCode = 403;
      throw err;
    }

    const student = await User.findById(studentId).select('name email');
    if (!student) {
      const err = new Error('Student not found');
      err.statusCode = 404;
      throw err;
    }

    // All markers, including admins, may only mark members or the team lead.
    const targetId = student._id.toString();
    const isMember =
      team.members.some((m) => m.toString() === targetId) ||
      (team.leadId && team.leadId.toString() === targetId);
    if (!isMember) {
      const err = new Error('Student is not a member of this team');
      err.statusCode = 400;
      throw err;
    }

    // Upsert — one record per student per team per day
    let record;
    try {
      record = await Attendance.findOneAndUpdate(
        { studentId, teamId, date: targetDate },
        {
          studentId,
          studentName: student.name,
          studentEmail: student.email,
          teamId,
          teamName: team.name,
          eventId: team.eventId || null,
          eventTitle: team.eventTitle || '',
          date: targetDate,
          shiftLabel: shiftLabel || 'Full Day',
          status,
          method: 'manual',
          markedBy: marker.sub,
          markedByName: marker.name || '',
          notes: notes || '',
          checkInTime: status === 'absent' ? null : new Date(),
          checkOutTime: null,
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
    } catch (err) {
      // Duplicate key from stale index — fall back to plain update
      if (err.code === 11000) {
        record = await Attendance.findOneAndUpdate(
          { studentId, teamId, date: targetDate },
          {
            status,
            notes: notes || '',
            markedBy: marker.sub,
            markedByName: marker.name || '',
            method: 'manual',
          },
          { new: true }
        );
      } else {
        throw err;
      }
    }

    return record;
  }

  // T1/T2 self check-in
  async selfCheckIn(user, data) {
    const { teamId } = data;
    if (!teamId) {
      const err = new Error('teamId is required');
      err.statusCode = 400;
      throw err;
    }

    const team = await Team.findById(teamId);
    if (!team) {
      const err = new Error('Team not found');
      err.statusCode = 404;
      throw err;
    }

    // Confirm user is a team member
    const isMember =
      team.members.some((m) => m.toString() === user.sub) ||
      (team.leadId && team.leadId.toString() === user.sub);
    if (!isMember) {
      const err = new Error('You are not a member of this team');
      err.statusCode = 403;
      throw err;
    }

    const targetDate = today();

    // Already checked in?
    const existing = await Attendance.findOne({
      studentId: user.sub,
      teamId,
      date: targetDate,
    });

    if (existing && existing.checkInTime) {
      const err = new Error('Already checked in today');
      err.statusCode = 409;
      throw err;
    }

    const userDoc = await User.findById(user.sub).select('name email');
    const status = isLate() ? 'late' : 'present';

    const record = await Attendance.findOneAndUpdate(
      { studentId: user.sub, teamId, date: targetDate },
      {
        studentId: user.sub,
        studentName: userDoc.name,
        studentEmail: userDoc.email,
        teamId,
        teamName: team.name,
        eventId: team.eventId || null,
        eventTitle: team.eventTitle || '',
        date: targetDate,
        checkInTime: new Date(),
        status,
        method: 'self',
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return record;
  }

  // T1/T2 self check-out
  async selfCheckOut(user, data) {
    const { teamId } = data;
    if (!teamId) {
      const err = new Error('teamId is required');
      err.statusCode = 400;
      throw err;
    }

    const targetDate = today();

    const record = await Attendance.findOne({
      studentId: user.sub,
      teamId,
      date: targetDate,
    });

    if (!record) {
      const err = new Error('You have not checked in today');
      err.statusCode = 400;
      throw err;
    }
    if (!record.checkInTime) {
      const err = new Error('No check-in found');
      err.statusCode = 400;
      throw err;
    }
    if (record.checkOutTime) {
      const err = new Error('Already checked out');
      err.statusCode = 409;
      throw err;
    }

    record.checkOutTime = new Date();
    record.durationMinutes = Math.round((record.checkOutTime - record.checkInTime) / 60000);
    await record.save();

    return record;
  }

  // Get today's attendance for a team
  async getTeamAttendance(teamId, date, requester) {
    const targetDate = date || today();
    const team = await getReadableTeam(teamId, requester);
    await team.populate('members', 'name email role');

    const existing = await Attendance.find({ teamId, date: targetDate });

    // Build full roster — even members without records show as "not marked"
    const roster = team.members.map((m) => {
      const record = existing.find((r) => r.studentId.toString() === m._id.toString());
      return {
        studentId: m._id,
        studentName: m.name,
        studentEmail: m.email,
        role: m.role,
        status: record?.status || 'not_marked',
        checkInTime: record?.checkInTime || null,
        checkOutTime: record?.checkOutTime || null,
        durationMinutes: record?.durationMinutes || 0,
        method: record?.method || null,
        notes: record?.notes || '',
        recordId: record?._id || null,
      };
    });

    return {
      team: {
        _id: team._id,
        name: team.name,
        eventTitle: team.eventTitle || '',
        memberCount: team.members.length,
      },
      date: targetDate,
      roster,
    };
  }

  // Team attendance stats (percentage, breakdown)
  async getTeamAttendanceStats(teamId, date, requester) {
    const targetDate = date || today();
    const team = await getReadableTeam(teamId, requester);
    await team.populate('members', 'name');

    const total = team.members.length;
    const records = await Attendance.find({ teamId, date: targetDate });

    const present = records.filter((r) => r.status === 'present').length;
    const late = records.filter((r) => r.status === 'late').length;
    const absent = records.filter((r) => r.status === 'absent').length;
    const onLeave = records.filter((r) => r.status === 'on_leave').length;
    const halfDay = records.filter((r) => r.status === 'half_day').length;
    const notMarked = total - records.length;
    const attended = present + late + halfDay;
    const percentage = total > 0 ? Math.round((attended / total) * 100) : 0;

    return {
      teamName: team.name,
      date: targetDate,
      totalMembers: total,
      present,
      late,
      absent,
      onLeave,
      halfDay,
      notMarked,
      attended,
      percentage,
    };
  }

  // Historical attendance percentage for a team (last N days)
  async getTeamAttendanceHistory(teamId, days = 7, requester) {
    if (typeof days === 'string') {
      days = /^\d+$/.test(days) ? Number(days) : NaN;
    }
    if (!Number.isInteger(days) || days < 1 || days > MAX_TEAM_HISTORY_DAYS) {
      throw new ValidationError(`days must be an integer between 1 and ${MAX_TEAM_HISTORY_DAYS}`);
    }

    const team = await getReadableTeam(teamId, requester);
    await team.populate('members', 'name');

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (days - 1));
    const startKey = startDate.toISOString().split('T')[0];

    const records = await Attendance.find({
      teamId,
      date: { $gte: startKey },
    });

    // Group by date
    const byDate = {};
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (days - 1 - i));
      const key = d.toISOString().split('T')[0];
      byDate[key] = { date: key, present: 0, late: 0, absent: 0, onLeave: 0, halfDay: 0 };
    }

    records.forEach((r) => {
      if (byDate[r.date]) {
        if (r.status === 'present') byDate[r.date].present++;
        else if (r.status === 'late') byDate[r.date].late++;
        else if (r.status === 'absent') byDate[r.date].absent++;
        else if (r.status === 'on_leave') byDate[r.date].onLeave++;
        else if (r.status === 'half_day') byDate[r.date].halfDay++;
      }
    });

    const totalMembers = team.members.length;
    const history = Object.values(byDate).map((d) => {
      const attended = d.present + d.late;
      const percentage = totalMembers > 0 ? Math.round((attended / totalMembers) * 100) : 0;
      return { ...d, totalMembers, attended, percentage };
    });

    // Overall stats
    const totalExpected = totalMembers * days;
    const totalAttended = history.reduce((sum, d) => sum + d.attended, 0);
    const overallPercentage = totalExpected > 0 ? Math.round((totalAttended / totalExpected) * 100) : 0;

    return {
      teamName: team.name,
      days,
      totalMembers,
      overallPercentage,
      history,
    };
  }

  // Personal attendance stats for T1/T2
  async getMyAttendanceStats(userId, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (days - 1));
    const startKey = startDate.toISOString().split('T')[0];

    const records = await Attendance.find({
      studentId: userId,
      date: { $gte: startKey },
    }).sort({ date: -1 });

    const total = records.length;
    const present = records.filter((r) => r.status === 'present').length;
    const late = records.filter((r) => r.status === 'late').length;
    const absent = records.filter((r) => r.status === 'absent').length;
    const attended = present + late;
    const percentage = total > 0 ? Math.round((attended / total) * 100) : 0;
    const totalMinutes = records.reduce((sum, r) => sum + (r.durationMinutes || 0), 0);
    const totalHours = Math.round((totalMinutes / 60) * 10) / 10;

    return {
      total,
      present,
      late,
      absent,
      attended,
      percentage,
      totalHours,
      recentRecords: records.slice(0, 10),
    };
  }

  // Get my attendance history
  async getMyAttendance(userId, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (days - 1));
    const startKey = startDate.toISOString().split('T')[0];

    return await Attendance.find({
      studentId: userId,
      date: { $gte: startKey },
    }).sort({ date: -1 });
  }

  // Today's status for logged-in user
  async getTodayStatus(userId, teamId) {
    const targetDate = today();
    const query = { studentId: userId, date: targetDate };
    if (teamId) query.teamId = teamId;
    return await Attendance.findOne(query);
  }

  // Download attendance sheet as CSV
  async getAttendanceSheet(teamId, fromDate, toDate, requester) {
    const team = await getReadableTeam(teamId, requester);
    await team.populate('members', 'name email');

    const query = { teamId };
    if (fromDate && toDate) {
      query.date = { $gte: fromDate, $lte: toDate };
    } else {
      // Default: last 30 days
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 29);
      query.date = {
        $gte: start.toISOString().split('T')[0],
        $lte: end.toISOString().split('T')[0],
      };
    }

    const records = await Attendance.find(query).sort({ date: 1 });

    // Build CSV rows
    const FORMULA_STARTERS = new Set(['=', '+', '-', '@', '\t']);
    // csvCell: RFC 4180 quoting + formula-injection prefix at export time only
    const csvCell = (val) => {
      const s = val === null || val === undefined ? '' : String(val);
      const escaped = s.replace(/"/g, '""'); // RFC 4180: double every double-quote
      const safe = FORMULA_STARTERS.has(escaped.charAt(0)) ? "'" + escaped : escaped;
      return `"${safe}"`;
    };

    const rows = [];
    rows.push(['Date', 'Student Name', 'Email', 'Team', 'Status', 'Check In', 'Check Out', 'Duration (min)', 'Method', 'Marked By', 'Notes']
      .map(csvCell).join(','));

    records.forEach((r) => {
      const checkIn = r.checkInTime ? new Date(r.checkInTime).toLocaleTimeString() : '';
      const checkOut = r.checkOutTime ? new Date(r.checkOutTime).toLocaleTimeString() : '';
      rows.push([
        r.date,
        r.studentName,
        r.studentEmail,
        r.teamName,
        r.status,
        checkIn,
        checkOut,
        r.durationMinutes || 0,
        r.method,
        r.markedByName || '',
        r.notes || '',
      ].map(csvCell).join(','));
    });

    return {
      teamName: team.name,
      filename: `${team.name.replace(/\s+/g, '_')}_attendance_${fromDate || 'last30'}_${toDate || today()}.csv`,
      csv: rows.join('\n'),
      recordCount: records.length,
    };
  }
}

module.exports = new AttendanceService();
