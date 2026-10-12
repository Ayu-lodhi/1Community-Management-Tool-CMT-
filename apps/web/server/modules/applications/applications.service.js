const Application = require('./applications.model');
const Team = require('../teams/teams.model');
const User = require('../admin/admin.model');
const { notify } = require('../notifications/notifications.service');
const { ValidationError } = require('../../core/errors/typedErrors');

class ApplicationService {

  // Student/member applies for leave, half-day, or team
  async create(data, user) {
    let { teamId, role, notes, requestType, targetDate, reason } = data;
    requestType = requestType || (targetDate ? 'leave' : 'event');
    targetDate = targetDate || new Date().toISOString().split('T')[0];
    reason = reason || notes || '';

    if (!teamId) {
      const userTeam = await Team.findOne({
        $or: [{ members: user.sub }, { leadId: user.sub }],
      });
      if (userTeam) {
        teamId = userTeam._id;
      } else {
        throw new Error('Team is required');
      }
    }

    const team = await Team.findById(teamId);
    if (!team) throw new Error('Team not found');

    // Check existing application
    if (['leave', 'half_day'].includes(requestType)) {
      const existing = await Application.findOne({
        studentId: user.sub,
        targetDate,
        status: { $in: ['pending', 'approved'] },
      });
      if (existing) {
        throw new Error(`You already have a ${existing.status} request for ${targetDate}`);
      }
    } else {
      const existing = await Application.findOne({
        studentId: user.sub,
        teamId,
        requestType: { $in: ['event', 'team_join'] },
      });
      if (existing) throw new Error('You have already applied to this team');
    }

    const userDoc = await User.findById(user.sub).select('name email role');

    const app = await Application.create({
      studentId: user.sub,
      studentName: userDoc ? userDoc.name : (user.name || 'Unknown'),
      studentEmail: userDoc ? userDoc.email : (user.email || ''),
      teamId,
      teamName: team.name,
      eventId: team.eventId || null,
      eventTitle: team.eventTitle || '',
      role: role || (userDoc?.role === 'T3_EXECUTIVE' ? 'Team Lead' : 'Team Member'),
      requestType,
      targetDate,
      reason,
      notes: notes || reason || '',
      status: 'pending',
      appliedAt: new Date(),
    });

    // Notify team lead or admin
    const reqTypeName = requestType === 'half_day' ? 'Half Day' : (requestType === 'leave' ? 'Leave' : 'Application');
    const memberName = userDoc ? userDoc.name : (user.name || 'A team member');

    if (['leave', 'half_day'].includes(requestType)) {
      if (team.leadId && team.leadId.toString() !== user.sub) {
        await notify(
          team.leadId,
          'application',
          `New ${reqTypeName} Request`,
          `${memberName} requested ${reqTypeName} for ${targetDate}.${reason ? ` Reason: "${reason}"` : ''}`
        );
      } else if (team.leadId && team.leadId.toString() === user.sub) {
        // T3 raising request for themselves -> notify admins if available
        try {
          const admins = await User.find({ role: { $in: ['ADMIN', 'SUPER_ADMIN'] }, isActive: true }).select('_id');
          if (Array.isArray(admins)) {
            for (const admin of admins) {
              await notify(
                admin._id,
                'application',
                `New ${reqTypeName} Request`,
                `${memberName} requested ${reqTypeName} for ${targetDate}.${reason ? ` Reason: "${reason}"` : ''}`
              );
            }
          }
        } catch (_) {}
      }
    } else if (team.leadId) {
      await notify(
        team.leadId,
        'application',
        'New Application',
        `${memberName} applied to your team "${team.name}".`
      );
    }

    return app;
  }

  // Alias for backward compatibility
  async createApplication(data, user) {
    return this.create(data, user);
  }

  // T3/Admin lists applications
  async getAll(filters = {}, requester = {}) {
    const query = {};

    for (const field of ['teamId', 'eventId']) {
      if (filters?.[field] !== undefined) {
        if (typeof filters[field] !== 'string' || !/^[a-f\d]{24}$/i.test(filters[field])) {
          throw new ValidationError(`Invalid ${field}`);
        }
        query[field] = filters[field];
      }
    }
    if (filters?.status !== undefined) {
      if (!['pending', 'approved', 'rejected', 'denied', 'waitlisted'].includes(filters.status)) {
        throw new ValidationError('Invalid status');
      }
      query.status = filters.status === 'denied' ? 'rejected' : filters.status;
    }
    if (filters?.requestType !== undefined) {
      query.requestType = filters.requestType;
    }

    // T3 only sees applications for their teams
    if (requester && requester.role === 'T3_EXECUTIVE') {
      const teams = await Team.find({ leadId: requester.sub }).select('_id');
      const teamIds = teams.map((t) => t._id);
      // Keep authorization independent of client filters, including teamId.
      query.$and = [{ teamId: { $in: teamIds } }];
    }

    return await Application.find(query).sort({ appliedAt: -1 }).limit(200);
  }

  // Alias for backward compatibility
  async getAllApplications(filters, requester) {
    return this.getAll(filters, requester);
  }

  // Student's own applications
  async getMine(userId) {
    return await Application.find({ studentId: userId }).sort({ appliedAt: -1 });
  }

  // Alias for backward compatibility
  async getMyApplications(userId) {
    return this.getMine(userId);
  }

  // Update status
  async updateStatus(id, status, requester, rejectionReason) {
    const valid = ['approved', 'rejected', 'denied', 'waitlisted', 'pending'];
    if (!valid.includes(status)) throw new Error('Invalid status');

    const normalizedStatus = status === 'denied' ? 'rejected' : status;

    const app = await Application.findById(id);
    if (!app) throw new Error('Application not found');

    const requesterRole = typeof requester === 'object' && requester ? requester.role : null;
    const requesterSub = typeof requester === 'object' && requester ? requester.sub : requester;

    // Permission check: T3 must be lead of the team
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(requesterRole);
    if (!isAdmin && requesterRole === 'T3_EXECUTIVE') {
      const team = await Team.findById(app.teamId);
      if (!team || team.leadId?.toString() !== requesterSub) {
        throw new Error('Not authorized to update this application');
      }
    }

    const reviewerDoc = await User.findById(requesterSub).select('name');
    const reviewerName = reviewerDoc ? reviewerDoc.name : 'Team Lead';

    app.status = normalizedStatus;
    app.reviewedBy = requesterSub;
    app.reviewedByName = reviewerName;
    app.reviewedAt = new Date();
    if (normalizedStatus === 'rejected') {
      app.rejectionReason = rejectionReason || 'Request not approved';
    }

    await app.save();

    // On approval for leave/half_day -> auto mark attendance!
    if (normalizedStatus === 'approved' && ['leave', 'half_day'].includes(app.requestType)) {
      const Attendance = require('../attendance/attendance.model');
      const targetDate = app.targetDate || new Date().toISOString().split('T')[0];
      const attStatus = app.requestType === 'half_day' ? 'half_day' : 'on_leave';
      const shiftLabel = app.requestType === 'half_day' ? 'Half Day' : 'Leave';
      const notes = app.reason
        ? `Approved ${shiftLabel}: ${app.reason}`
        : `Approved ${shiftLabel} by ${reviewerName}`;

      try {
        await Attendance.findOneAndUpdate(
          { studentId: app.studentId, teamId: app.teamId, date: targetDate },
          {
            studentId: app.studentId,
            studentName: app.studentName,
            studentEmail: app.studentEmail,
            teamId: app.teamId,
            teamName: app.teamName || '',
            date: targetDate,
            shiftLabel,
            status: attStatus,
            method: 'manual',
            markedBy: requesterSub,
            markedByName: reviewerName,
            notes,
            durationMinutes: app.requestType === 'half_day' ? 240 : 0,
            checkInTime: null,
            checkOutTime: null,
          },
          { new: true, upsert: true, setDefaultsOnInsert: true }
        );
      } catch (attErr) {
        console.error('Failed to auto-update attendance on approval:', attErr.message);
      }
    }

    // On approval for team membership
    if (normalizedStatus === 'approved' && (!app.requestType || ['event', 'team_join'].includes(app.requestType))) {
      const team = await Team.findById(app.teamId);
      if (team) {
        // Add to team members if not already
        if (!team.members.some((m) => m.toString() === app.studentId.toString())) {
          team.members.push(app.studentId);
          team.memberCount = team.members.length;
          await team.save();
        }

        // Add to event members
        if (team.eventId) {
          const Event = require('../events/events.model');
          const event = await Event.findById(team.eventId);
          if (event && !event.members.some((m) => m.toString() === app.studentId.toString())) {
            event.members.push(app.studentId);
            event.memberCount = event.members.length;
            await event.save();
          }
        }

        // Add to team chat room
        const ChatRoom = require('../chat/chatRoom.model');
        const chatRoom = await ChatRoom.findOne({ teamId: team._id });
        if (chatRoom && !chatRoom.members.some((m) => m.toString() === app.studentId.toString())) {
          chatRoom.members.push(app.studentId);
          chatRoom.memberCount = chatRoom.members.length;
          await chatRoom.save();
        }
      }
    }

    // Notify student
    const typeLabel = app.requestType === 'half_day' ? 'Half Day' : (app.requestType === 'leave' ? 'Leave' : 'Application');
    const title = normalizedStatus === 'approved'
      ? `${typeLabel} Request Approved`
      : normalizedStatus === 'rejected'
      ? `${typeLabel} Request Denied`
      : 'You are on the Waitlist';

    const message = normalizedStatus === 'approved'
      ? `Your ${typeLabel.toLowerCase()} request for ${app.targetDate || 'the team'} has been approved by ${reviewerName}.`
      : normalizedStatus === 'rejected'
      ? `Your ${typeLabel.toLowerCase()} request for ${app.targetDate || 'the team'} was denied. Reason: ${app.rejectionReason || 'No reason provided'}`
      : `You've been waitlisted for "${app.teamName || app.eventTitle || 'the team'}".`;

    await notify(app.studentId, 'application', title, message);

    return app;
  }
}

module.exports = new ApplicationService();
