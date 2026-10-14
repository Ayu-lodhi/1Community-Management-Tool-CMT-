const ShiftTemplate = require('../../models/ShiftTemplate.model');
const Task = require('../../models/Task.model');
const ShiftAssignment = require('../../models/ShiftAssignment.model');
const DailyAttendance = require('../../models/DailyAttendance.model');
const TimesheetDay = require('../../models/TimesheetDay.model');
const MonthLock = require('../../models/MonthLock.model');
const Team = require('../teams/teams.model');
const User = require('../admin/admin.model');
const AuditLog = require('../../models/AuditLog.model');
const notificationsService = require('../notifications/notifications.service');
const { ValidationError, AuthorizationError } = require('../../core/errors/typedErrors');

const sanitizeCsvCell = (val) => {
  if (val === null || val === undefined) return '""';
  let str = String(val);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }
  return `"${str.replace(/"/g, '""')}"`;
};

class WorkforceService {

  // ====================================================================
  // 1. SHIFT TEMPLATES
  // ====================================================================
  async createShiftTemplate(data, creatorId) {
    const { name, teamId, startTime, endTime, breakMinutes, weekdays } = data;
    if (!name || !teamId || !startTime || !endTime) {
      throw new ValidationError('name, teamId, startTime, and endTime are required');
    }

    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    let minutes = (eh * 60 + em) - (sh * 60 + sm);
    if (minutes < 0) minutes += 1440;
    minutes -= (breakMinutes || 0);
    const durationHours = Math.max(0.5, Math.round((minutes / 60) * 100) / 100);

    return await ShiftTemplate.create({
      name: name.trim(),
      teamId,
      startTime,
      endTime,
      durationHours,
      breakMinutes: breakMinutes || 0,
      weekdays: Array.isArray(weekdays) ? weekdays : [],
      createdBy: creatorId,
    });
  }

  async getShiftTemplates(teamId) {
    return await ShiftTemplate.find({ teamId, isActive: true }).sort({ startTime: 1 }).lean();
  }

  // ====================================================================
  // 2. TASKS
  // ====================================================================
  async createTask(data, creatorId) {
    const { title, description, teamId, dueDate, priority } = data;
    if (!title || !teamId) {
      throw new ValidationError('title and teamId are required');
    }

    return await Task.create({
      title: title.trim(),
      description: (description || '').trim(),
      teamId,
      dueDate: dueDate || null,
      priority: priority || 'MEDIUM',
      createdBy: creatorId,
    });
  }

  async getTasks(teamId, status) {
    const query = { teamId };
    if (status) query.status = status;
    return await Task.find(query).sort({ dueDate: 1, createdAt: -1 }).lean();
  }

  // ====================================================================
  // 3. SHIFT ASSIGNMENTS (CALENDAR)
  // ====================================================================
  async createAssignment(data, assignerId) {
    const { userId, teamId, shiftTemplateId, date, taskIds, notes, repeatWeekly } = data;
    if (!userId || !teamId || !shiftTemplateId || !date) {
      throw new ValidationError('userId, teamId, shiftTemplateId, and date are required');
    }

    const team = await Team.findById(teamId).select('name leadId members');
    if (!team) throw new ValidationError('Team not found');

    const targetUser = await User.findById(userId).select('name role email');
    if (!targetUser) throw new ValidationError('User not found');

    const isMember = team.members.some((m) => m.toString() === userId.toString()) ||
      (team.leadId && team.leadId.toString() === userId.toString());
    if (!isMember) {
      throw new ValidationError('Target user is not a member of this team');
    }

    const template = await ShiftTemplate.findById(shiftTemplateId);
    if (!template || !template.isActive) {
      throw new ValidationError('Active shift template not found');
    }

    // Determine target dates (single date vs repeat-weekly up to 4 weeks)
    const targetDates = [date];
    if (repeatWeekly) {
      const baseDate = new Date(date + 'T00:00:00.000Z');
      for (let w = 1; w <= 3; w++) {
        const nextDate = new Date(baseDate.getTime() + w * 7 * 86400000);
        targetDates.push(nextDate.toISOString().split('T')[0]);
      }
    }

    // Pre-check conflicts across all target dates
    const existingAssignments = await ShiftAssignment.find({
      userId,
      date: { $in: targetDates },
    }).lean();

    if (existingAssignments.length > 0) {
      const conflictDates = existingAssignments.map((a) => a.date).join(', ');
      const err = new Error(`User already has a shift assigned on: ${conflictDates}`);
      err.statusCode = 409;
      throw err;
    }

    const createdAssignments = [];
    for (const d of targetDates) {
      const assignment = await ShiftAssignment.create({
        userId,
        teamId,
        shiftTemplateId: template._id,
        shiftName: template.name,
        date: d,
        startTime: template.startTime,
        endTime: template.endTime,
        durationHours: template.durationHours,
        taskIds: Array.isArray(taskIds) ? taskIds : [],
        notes: (notes || '').trim(),
        assignedBy: assignerId,
        repeatRule: repeatWeekly ? 'REPEAT_WEEKLY_4W' : 'NONE',
      });
      createdAssignments.push(assignment);
    }

    return createdAssignments;
  }

  async getTeamAssignments(teamId, startDate, endDate) {
    const query = { teamId };
    if (startDate && endDate) {
      query.date = { $gte: startDate, $lte: endDate };
    }
    return await ShiftAssignment.find(query).sort({ date: 1, startTime: 1 }).lean();
  }

  async getMyAssignments(userId, startDate, endDate) {
    const query = { userId };
    if (startDate && endDate) {
      query.date = { $gte: startDate, $lte: endDate };
    }
    return await ShiftAssignment.find(query).sort({ date: 1, startTime: 1 }).lean();
  }

  async deleteAssignment(id) {
    const assignment = await ShiftAssignment.findById(id);
    if (!assignment) throw new ValidationError('Shift assignment not found');

    const hasAttendance = await DailyAttendance.exists({ userId: assignment.userId, date: assignment.date });
    if (hasAttendance) {
      const err = new Error('Cannot delete shift assignment: attendance has already been recorded for this date');
      err.statusCode = 400;
      throw err;
    }

    await ShiftAssignment.findByIdAndDelete(id);
    return { success: true };
  }

  // ====================================================================
  // 4. MANUAL ATTENDANCE MARKING (T3 REGISTER)
  // ====================================================================
  async markManualAttendance(data, marker) {
    const { userId, teamId, date, status, reason } = data;
    if (!userId || !teamId || !date || !status) {
      throw new ValidationError('userId, teamId, date, and status are required');
    }

    // No self-marking rule
    if (marker.sub.toString() === userId.toString()) {
      throw new AuthorizationError('Cannot mark own attendance. Self-attendance must be marked via QR check-in or approved by an administrator');
    }

    const team = await Team.findById(teamId).select('name leadId members');
    if (!team) throw new ValidationError('Team not found');

    const isMember = team.members.some((m) => m.toString() === userId.toString()) ||
      (team.leadId && team.leadId.toString() === userId.toString());
    if (!isMember) throw new ValidationError('Target user is not a member of this team');

    const userDoc = await User.findById(userId).select('name email role');
    if (!userDoc) throw new ValidationError('User not found');

    const assignment = await ShiftAssignment.findOne({ userId, date }).lean();

    const existing = await DailyAttendance.findOne({ userId, date });
    const originalStatus = existing ? (existing.originalStatus || existing.status) : status;

    // Audit log if overriding a QR-scanned punch
    if (existing && existing.rawPunchId) {
      await AuditLog.create({
        action: 'ATTENDANCE_OVERWRITE_MANUAL',
        performedBy: marker.sub,
        performedByName: marker.name || marker.email || 'Lead',
        targetId: userId,
        targetType: 'User',
        details: {
          previousStatus: existing.status,
          newStatus: status,
          date,
          teamId,
          reason: reason || 'Manual override by team lead',
        },
        timestamp: new Date(),
      }).catch((e) => console.error('AuditLog error:', e.message));
    }

    const updateFields = {
      userId,
      userName: userDoc.name,
      userEmail: userDoc.email,
      userRole: userDoc.role,
      teamId,
      date,
      shiftAssignmentId: assignment?._id || null,
      shiftStart: assignment?.startTime || '09:00',
      shiftEnd: assignment?.endTime || '17:00',
      status,
      originalStatus,
      markedMethod: marker.role === 'SUPER_ADMIN' || marker.role === 'ADMIN' ? 'manual_admin' : 'manual_lead',
      manualEntry: {
        markedBy: marker.sub,
        markedByName: marker.name || '',
        markedAt: new Date(),
        reason: (reason || '').trim(),
      },
    };

    return await DailyAttendance.findOneAndUpdate(
      { userId, date },
      { $set: updateFields },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  }

  async getAttendanceRegister(teamId, month) {
    if (!teamId || !month) throw new ValidationError('teamId and month (YYYY-MM) are required');
    const start = `${month}-01`;
    const end = `${month}-31`;

    const records = await DailyAttendance.find({
      teamId,
      date: { $gte: start, $lte: end },
    }).sort({ date: 1, userName: 1 }).lean();

    return records;
  }

  // ====================================================================
  // 5. DAY TIMESHEETS
  // ====================================================================
  async submitDayTimesheet(userId, data) {
    const { date, teamId, entries } = data;
    if (!date || !teamId || !Array.isArray(entries) || entries.length === 0) {
      throw new ValidationError('date, teamId, and at least one entry are required');
    }

    // Past 7 days window check
    const diffDays = Math.floor((Date.now() - new Date(date + 'T00:00:00.000Z').getTime()) / (1000 * 3600 * 24));
    if (diffDays > 7) {
      throw new ValidationError('Timesheets cannot be submitted for days older than 7 days');
    }

    const existing = await TimesheetDay.findOne({ userId, date });
    if (existing && existing.status === 'APPROVED') {
      const err = new Error('Timesheet for this date has already been approved and cannot be modified');
      err.statusCode = 400;
      throw err;
    }

    const userDoc = await User.findById(userId).select('name email role');
    if (!userDoc) throw new ValidationError('User not found');

    const assignment = await ShiftAssignment.findOne({ userId, date }).lean();
    const shiftHours = assignment?.durationHours || 8;

    let totalHoursSpent = 0;
    const sanitizedEntries = [];

    for (const item of entries) {
      if (!item.taskTitle || !item.hoursSpent || !item.note) {
        throw new ValidationError('Each entry must include taskTitle, hoursSpent, and a descriptive note');
      }
      if (item.note.trim().length < 10) {
        throw new ValidationError('Task note must be at least 10 characters long');
      }
      const hrs = Math.round(Number(item.hoursSpent) * 100) / 100;
      totalHoursSpent += hrs;
      sanitizedEntries.push({
        taskId: item.taskId || null,
        taskTitle: item.taskTitle.trim(),
        hoursSpent: hrs,
        note: item.note.trim(),
      });
    }

    totalHoursSpent = Math.round(totalHoursSpent * 100) / 100;

    // Soft overtime cap: allow up to shiftHours + 2.0h with isOvertime flag; reject above +2.0h
    if (totalHoursSpent > shiftHours + 2.0) {
      throw new ValidationError(`Total logged hours (${totalHoursSpent}h) exceed the maximum permitted overtime threshold for this shift (${shiftHours + 2.0}h)`);
    }

    const isOvertime = totalHoursSpent > shiftHours;

    const record = await TimesheetDay.findOneAndUpdate(
      { userId, date },
      {
        $set: {
          userId,
          userName: userDoc.name,
          userEmail: userDoc.email,
          userRole: userDoc.role,
          teamId,
          date,
          shiftAssignmentId: assignment?._id || null,
          shiftHours,
          entries: sanitizedEntries,
          totalHoursSpent,
          isOvertime,
          status: 'SUBMITTED',
          review: { reviewedBy: null, reviewedByName: '', reviewedAt: null, comment: '' },
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    // Notify team lead
    const team = await Team.findById(teamId).select('leadId');
    if (team?.leadId && team.leadId.toString() !== userId.toString()) {
      await notificationsService.notify(
        team.leadId,
        'system',
        'Timesheet Submitted',
        `${userDoc.name} submitted a daily timesheet for ${date} (${totalHoursSpent}h).`
      ).catch(() => {});
    }

    return record;
  }

  async getMyDayTimesheets(userId, startDate, endDate) {
    const query = { userId };
    if (startDate && endDate) {
      query.date = { $gte: startDate, $lte: endDate };
    }
    return await TimesheetDay.find(query).sort({ date: -1 }).lean();
  }

  async getTeamDayTimesheets(teamId, date, status) {
    const query = { teamId };
    if (date) query.date = date;
    if (status) query.status = status;
    return await TimesheetDay.find(query).sort({ date: -1, userName: 1 }).lean();
  }

  async reviewDayTimesheet(id, status, comment, reviewer) {
    if (!['APPROVED', 'REJECTED'].includes(status)) {
      throw new ValidationError('Status must be either APPROVED or REJECTED');
    }
    const timesheet = await TimesheetDay.findById(id);
    if (!timesheet) throw new ValidationError('Timesheet not found');

    // No self-approval rule
    if (timesheet.userId.toString() === reviewer.sub.toString()) {
      throw new AuthorizationError('Cannot approve or reject your own timesheet');
    }

    timesheet.status = status;
    timesheet.review = {
      reviewedBy: reviewer.sub,
      reviewedByName: reviewer.name || '',
      reviewedAt: new Date(),
      comment: (comment || '').trim(),
    };

    await timesheet.save();

    await notificationsService.notify(
      timesheet.userId,
      'system',
      `Timesheet ${status}`,
      `Your timesheet for ${timesheet.date} was ${status.toLowerCase()} by ${reviewer.name || 'Lead'}.`
    ).catch(() => {});

    return timesheet;
  }

  // ====================================================================
  // 6. MONTH LOCK & FINALIZATION
  // ====================================================================
  async lockMonth(month, adminUser) {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new ValidationError('month format must be YYYY-MM');

    const lock = await MonthLock.findOneAndUpdate(
      { month },
      {
        $set: {
          month,
          isLocked: true,
          lockedBy: adminUser.sub,
          lockedAt: new Date(),
          unlockedBy: null,
          unlockedAt: null,
          unlockReason: '',
        },
      },
      { new: true, upsert: true }
    );

    await AuditLog.create({
      action: 'MONTH_FINALIZED_LOCK',
      performedBy: adminUser.sub,
      performedByName: adminUser.name || 'Admin',
      details: { month },
      timestamp: new Date(),
    }).catch(() => {});

    return lock;
  }

  async unlockMonth(month, reason, superAdmin) {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new ValidationError('month format must be YYYY-MM');
    if (!reason || reason.trim().length < 15) {
      throw new ValidationError('An unlock audit reason of at least 15 characters is required');
    }

    const lock = await MonthLock.findOneAndUpdate(
      { month },
      {
        $set: {
          isLocked: false,
          unlockedBy: superAdmin.sub,
          unlockedAt: new Date(),
          unlockReason: reason.trim(),
        },
      },
      { new: true }
    );

    if (!lock) throw new ValidationError(`No lock record found for ${month}`);

    await AuditLog.create({
      action: 'MONTH_UNLOCKED_AUDIT',
      performedBy: superAdmin.sub,
      performedByName: superAdmin.name || 'Super Admin',
      details: { month, reason: reason.trim() },
      timestamp: new Date(),
    }).catch(() => {});

    return lock;
  }

  // ====================================================================
  // 7. FORMULA-SAFE CSV EXPORT
  // ====================================================================
  async exportMonthlyRegisterCSV(teamId, month) {
    const records = await this.getAttendanceRegister(teamId, month);
    const headers = ['Date', 'User Name', 'Email', 'Role', 'Status', 'Method', 'Shift Start', 'Shift End', 'Marked By', 'Reason'];

    const rows = [headers.map(sanitizeCsvCell).join(',')];
    for (const r of records) {
      rows.push([
        r.date,
        r.userName,
        r.userEmail,
        r.userRole,
        r.status,
        r.markedMethod,
        r.shiftStart,
        r.shiftEnd,
        r.manualEntry?.markedByName || '',
        r.manualEntry?.reason || '',
      ].map(sanitizeCsvCell).join(','));
    }

    return {
      csv: rows.join('\r\n'),
      filename: `attendance-register-${teamId}-${month}.csv`,
    };
  }
}

module.exports = new WorkforceService();
