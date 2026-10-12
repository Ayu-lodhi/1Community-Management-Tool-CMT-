const Timesheet = require('./timesheets.model');
const Team = require('../teams/teams.model');
const User = require('../admin/admin.model');
const { notify } = require('../notifications/notifications.service');
const { AuthorizationError, ValidationError } = require('../../core/errors/typedErrors');
const PRIVILEGED_ROLES = ['SUPER_ADMIN', 'ADMIN'];

const calcHours = (startTime, endTime, breakMinutes) => {
  if (!startTime || !endTime) return 0;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let minutes = (eh * 60 + em) - (sh * 60 + sm);
  if (minutes < 0) minutes += 24 * 60; // overnight
  minutes -= breakMinutes || 0;
  return Math.max(0, Math.round((minutes / 60) * 100) / 100);
};

class TimesheetService {

  // ⭐ Member submits a timesheet
  async submit(userId, data) {
    const { teamId, date, startTime, endTime, breakMinutes, taskDescription } = data;

    if (!date || !startTime || !endTime) throw new Error('Date, start time, and end time are required');
    if (!taskDescription || taskDescription.trim().length < 10) {
      throw new Error('Task description must be at least 10 characters');
    }

    const userDoc = await User.findById(userId).select('name email role');
    if (!userDoc) throw new Error('User not found');

    let team = null;
    if (teamId) {
      team = await Team.findById(teamId);
      if (!team) throw new Error('Team not found');

      // Verify user is team member
      const isMember =
        team.members.some((m) => m.toString() === userId) ||
        (team.leadId && team.leadId.toString() === userId);
      if (!isMember) throw new Error('You are not a member of this team');
    }

    const totalHours = calcHours(startTime, endTime, breakMinutes || 0);

    let timesheet;
    try {
      timesheet = await Timesheet.create({
        userId,
        userName: userDoc.name,
        userEmail: userDoc.email,
        userRole: userDoc.role,
        teamId: team?._id || null,
        teamName: team?.name || '',
        eventId: team?.eventId || null,
        eventTitle: team?.eventTitle || '',
        date,
        startTime,
        endTime,
        breakMinutes: breakMinutes || 0,
        totalHours,
        taskDescription: taskDescription.trim(),
        status: 'submitted',
      });
    } catch (err) {
      if (err.code === 11000) {
        throw new Error('You already submitted a timesheet for this date and time');
      }
      throw err;
    }

    // Notify team lead
    if (team?.leadId && team.leadId.toString() !== userId) {
      await notify(
        team.leadId,
        'system',
        'New Timesheet Submitted',
        `${userDoc.name} submitted a timesheet for ${date} (${totalHours}h).`
      );
    }

    return timesheet;
  }

  // ⭐ Member views their own timesheets
  async getMyTimesheets(userId, days = 30) {
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    const startKey = start.toISOString().split('T')[0];

    return await Timesheet.find({ userId, date: { $gte: startKey } })
      .sort({ date: -1 })
      .limit(100);
  }

  // ⭐ Personal stats
  async getMyStats(userId, days = 30) {
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    const startKey = start.toISOString().split('T')[0];

    const list = await Timesheet.find({ userId, date: { $gte: startKey } });

    const totalHours = list.reduce((s, t) => s + (t.totalHours || 0), 0);
    const approved = list.filter((t) => t.status === 'approved').length;
    const submitted = list.filter((t) => t.status === 'submitted').length;
    const rejected = list.filter((t) => t.status === 'rejected').length;

    return {
      totalEntries: list.length,
      totalHours: Math.round(totalHours * 100) / 100,
      approved,
      submitted,
      rejected,
      pending: submitted,
    };
  }

  // ⭐ T3 views their team's timesheets
  async getTeamTimesheets(userId, teamId, date) {
    if (typeof teamId !== 'string' || !/^[a-f\d]{24}$/i.test(teamId)) {
      throw new ValidationError('Invalid teamId');
    }
    const team = await Team.findById(teamId);
    if (!team) throw new Error('Team not found');

    const isLead = team.leadId && team.leadId.toString() === userId;
    if (!isLead) throw new Error('Only the team lead can view team timesheets');

    const query = { teamId: team._id };
    if (date) query.date = date;

    return await Timesheet.find(query).sort({ date: -1, userName: 1 }).limit(200);
  }

  // ⭐ T3 sees list of teams they can review
  async getReviewableTeams(userId) {
    return await Team.find({ leadId: userId }).select('name eventTitle members');
  }

  // ⭐ Admin views all
  async getAllTimesheets(filters = {}) {
    const { date, userId, teamId, status } = filters;
    const query = {};
    if (date) query.date = date;
    if (userId) query.userId = userId;
    if (teamId) query.teamId = teamId;
    if (status) query.status = status;

    return await Timesheet.find(query).sort({ date: -1 }).limit(500);
  }

  // ⭐ Admin/T3 updates status
  async updateStatus(id, status, requester, rejectionReason) {
    const ts = await Timesheet.findById(id);
    if (!ts) throw new Error('Timesheet not found');

    if (!['submitted', 'approved', 'rejected'].includes(status)) {
      throw new Error('Invalid status');
    }

    // Permission: admin or team lead
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(requester.role);
    let isTeamLead = false;
    if (ts.teamId) {
      const team = await Team.findById(ts.teamId);
      isTeamLead = team?.leadId && team.leadId.toString() === requester.sub;
    }
    if (!isAdmin && !isTeamLead) throw new Error('Not authorized to update');

    ts.status = status;
    if (status === 'approved') {
      ts.approvedBy = requester.sub;
      ts.approvedByName = requester.name || '';
      ts.approvedAt = new Date();
      ts.rejectionReason = '';
    } else if (status === 'rejected') {
      ts.rejectionReason = rejectionReason || 'No reason provided';
      ts.approvedBy = requester.sub;
      ts.approvedByName = requester.name || '';
    }
    await ts.save();

    // Notify owner
    await notify(
      ts.userId,
      'system',
      status === 'approved' ? 'Timesheet Approved' : 'Timesheet Rejected',
      `Your timesheet for ${ts.date} has been ${status}.`
    );

    return ts;
  }

  // ⭐ Delete (own drafts only)
  async delete(id, userId) {
    const ts = await Timesheet.findById(id);
    if (!ts) throw new Error('Timesheet not found');
    if (ts.userId.toString() !== userId) throw new Error('You can only delete your own');
    if (ts.status === 'approved') throw new Error('Cannot delete an approved timesheet');
    await Timesheet.findByIdAndDelete(id);
    return { success: true };
  }

  // ⭐ Export team CSV
  async exportTeamCSV(teamId, from, to, requester) {
    if (typeof teamId !== 'string' || !teamId) throw new ValidationError('teamId required');
    const team = await Team.findById(teamId);
    if (!team) throw new Error('Team not found');

    const isAdmin = !!requester?.sub && PRIVILEGED_ROLES.includes(requester.role);
    const isLead = !!requester?.sub && team.leadId?.toString() === requester.sub;
    if (!isAdmin && !isLead) {
      throw new AuthorizationError('Only the team lead or admin can export team timesheets');
    }

    const query = { teamId };
    if (from && to) query.date = { $gte: from, $lte: to };
    const FORMULA_STARTERS = new Set(['=', '+', '-', '@', '\t']);
    const csvCell = (val) => {
      const s = val === null || val === undefined ? '' : String(val);
      const escaped = s.replace(/"/g, '""');
      const safe = FORMULA_STARTERS.has(escaped.charAt(0)) ? "'" + escaped : escaped;
      return `"${safe}"`;
    };

    const rows = [['Date', 'Name', 'Email', 'Role', 'Start', 'End', 'Break (min)', 'Total Hours', 'Task', 'Status'].map(csvCell).join(',')];
    list.forEach((t) => {
      rows.push([
        t.date,
        t.userName,
        t.userEmail,
        t.userRole,
        t.startTime,
        t.endTime,
        t.breakMinutes,
        t.totalHours,
        (t.taskDescription || '').replace(/\n/g, ' '),
        t.status,
      ].map(csvCell).join(','));
    });

    return { csv: rows.join('\n'), count: list.length };
  }
}

module.exports = new TimesheetService();
