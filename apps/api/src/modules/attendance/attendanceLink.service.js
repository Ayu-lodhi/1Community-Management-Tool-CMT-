const crypto = require('crypto');
const QRCode = require('qrcode');
const mongoose = require('mongoose');
const AttendanceLink = require('./attendanceLink.model');
const Attendance = require('./attendance.model');
const User = require('../admin/admin.model');
const AuditLog = require('../../models/AuditLog.model');
const { logger } = require('../../core/utils/logger');

async function recordAttendanceAudit({ action, performedBy, performedByName, token, team, details = {}, ipAddress = null }) {
  const tokenPrefix = token ? `${String(token).slice(0, 8)}...` : null;
  const auditData = {
    action,
    performedBy: performedBy || null,
    performedByName: performedByName || 'Unknown',
    targetType: 'Attendance',
    ipAddress,
    tokenPrefix,
    team: team || 'T3',
    ...details,
    timestamp: new Date().toISOString(),
  };

  // Structured console log for monitoring / SIEM (contains only prefix, NEVER full token or QR data)
  logger.info(`[AUDIT] attendance_${action.toLowerCase()}`, auditData);

  try {
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      await AuditLog.create({
        action,
        performedBy: performedBy || null,
        performedByName: performedByName || '',
        targetType: 'Attendance',
        ipAddress,
        details: {
          tokenPrefix,
          team: team || 'T3',
          ...details,
        },
        timestamp: new Date(),
      });
    }
  } catch (err) {
    logger.error('AuditLog error', { metric: 'attendance_audit_failure', error: err.message, action });
    throw new Error('Attendance audit logging failed');
  }
}

/**
 * Returns today's date in Asia/Kolkata timezone in YYYY-MM-DD format
 */
const getTodayKolkata = () => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
};

class AttendanceLinkService {
  /**
   * 1. Generate link and QR code for T3
   */
  async generateLink({ minutes = 10 }, user) {
    let validMinutes = parseInt(minutes, 10);
    if (isNaN(validMinutes) || validMinutes < 1) validMinutes = 10;
    if (validMinutes > 120) validMinutes = 120; // Max 120 minutes

    const token = crypto.randomBytes(32).toString('hex');
    const startsAt = new Date();
    const expiresAt = new Date(startsAt.getTime() + validMinutes * 60 * 1000);
    const date = getTodayKolkata();

    const baseUrl = process.env.BASE_URL || process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
    const url = `${cleanBaseUrl}/attend/${token}`;

    const qrCode = await QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 320,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });

    const link = await AttendanceLink.create({
      token,
      team: 'T3',
      createdBy: user.sub || user._id,
      startsAt,
      expiresAt,
      date,
      active: true,
    });

    await recordAttendanceAudit({
      action: 'ATTENDANCE_SESSION_GENERATE',
      performedBy: user.sub || user._id,
      performedByName: user.name || user.email || 'T3 Member',
      token: link.token,
      team: link.team,
      details: {
        validMinutes,
        startsAt: link.startsAt,
        expiresAt: link.expiresAt,
      },
    });

    return {
      token: link.token,
      url,
      qrCode,
      startsAt: link.startsAt,
      expiresAt: link.expiresAt,
      validMinutes,
      date: link.date,
      team: link.team,
      active: link.active,
    };
  }

  /**
   * Get link metadata (Read-only for attendee UI pre-check)
   */
  async getLinkInfo(token, user) {
    const link = await AttendanceLink.findOne({ token }).populate('createdBy', 'name email');
    if (!link) {
      const err = new Error('Invalid attendance link');
      err.statusCode = 404;
      throw err;
    }

    const now = new Date();
    let status = 'active';
    if (now < link.startsAt) {
      status = 'not_started';
    } else if (!link.active || now > link.expiresAt) {
      status = 'expired';
    }

    const role = user?.role || '';
    const isTeamMember =
      (link.team === 'T3' && (role === 'T3_EXECUTIVE' || role === 'T3')) ||
      (user?.team && user.team.toUpperCase() === link.team.toUpperCase());

    const todayDate = link.date;
    const existing = await Attendance.findOne({
      user: user?.sub || user?._id,
      date: todayDate,
    });

    return {
      token: link.token,
      team: link.team,
      date: link.date,
      startsAt: link.startsAt,
      expiresAt: link.expiresAt,
      active: link.active,
      status,
      isTeamMember,
      alreadyMarked: !!existing,
      markedAt: existing?.markedAt || null,
      createdByName: link.createdBy?.name || 'T3 Member',
    };
  }

  /**
   * 2. Mark attendance (Strictly on POST request)
   */
  async markAttendance(token, user) {
    const link = await AttendanceLink.findOne({ token });
    if (!link) {
      const err = new Error('Invalid attendance link');
      err.statusCode = 404;
      throw err;
    }

    const now = new Date();

    // 1. Not started yet check
    if (now < link.startsAt) {
      const err = new Error('Attendance window has not started yet');
      err.statusCode = 425;
      throw err;
    }

    // 2. Expired or deactivated check
    if (!link.active || now > link.expiresAt) {
      const err = new Error('Attendance link has expired or has been deactivated');
      err.statusCode = 410;
      throw err;
    }

    // 3. Team check
    const role = user?.role || '';
    const isTeamMember =
      (link.team === 'T3' && (role === 'T3_EXECUTIVE' || role === 'T3')) ||
      (user?.team && user.team.toUpperCase() === link.team.toUpperCase());

    if (!isTeamMember) {
      const err = new Error(`Access denied. You do not belong to the required team (${link.team}) for this attendance link.`);
      err.statusCode = 403;
      throw err;
    }

    // 4. Already marked today check
    const todayDate = link.date || getTodayKolkata();
    const existing = await Attendance.findOne({
      user: user.sub || user._id,
      date: todayDate,
    });

    if (existing) {
      const err = new Error('Attendance already marked for today');
      err.statusCode = 409;
      throw err;
    }

    // 5. Save attendance record
    try {
      const attendance = new Attendance({
        user: user.sub || user._id,
        studentId: user.sub || user._id,
        studentName: user.name || '',
        studentEmail: user.email || '',
        team: link.team,
        date: todayDate,
        markedAt: now,
        checkInTime: now,
        linkId: link._id,
        status: 'present',
        method: 'link',
      });
      await attendance.save();
      return attendance;
    } catch (saveErr) {
      // MongoDB duplicate key error code 11000
      if (saveErr.code === 11000) {
        const err = new Error('Attendance already marked for today');
        err.statusCode = 409;
        throw err;
      }
      throw saveErr;
    }
  }

  /**
   * 3. Deactivate link early
   */
  async deactivateLink(token, user) {
    const link = await AttendanceLink.findOne({ token });
    if (!link) {
      const err = new Error('Invalid attendance link');
      err.statusCode = 404;
      throw err;
    }

    const userId = (user?.sub || user?._id || '').toString();
    const isOwner = link.createdBy && link.createdBy.toString() === userId;
    const isAdmin = user && ['ADMIN', 'SUPER_ADMIN'].includes(user.role);

    if (!isOwner && !isAdmin) {
      await recordAttendanceAudit({
        action: 'ATTENDANCE_SESSION_DEACTIVATE_REJECTED',
        performedBy: user?.sub || user?._id,
        performedByName: user?.name || user?.email || '',
        token: link.token,
        team: link.team,
        details: { reason: 'Unauthorized caller' },
      });
      const err = new Error('Access denied. Only the link creator or an admin can deactivate this link.');
      err.statusCode = 403;
      throw err;
    }

    link.active = false;
    await link.save();

    await recordAttendanceAudit({
      action: 'ATTENDANCE_SESSION_DEACTIVATE',
      performedBy: user?.sub || user?._id,
      performedByName: user?.name || user?.email || '',
      token: link.token,
      team: link.team,
    });

    return link;
  }

  /**
   * 4. T3 attendance panel (today)
   */
  async getT3TodayPanel() {
    const todayDate = getTodayKolkata();

    // Fetch all active T3 team users
    const allT3Users = await User.find({
      role: { $in: ['T3_EXECUTIVE', 'T3'] },
      isActive: true,
    }).select('_id name email role');

    // Fetch all attendance records for date and team T3
    const attendanceList = await Attendance.find({
      date: todayDate,
      team: 'T3',
    })
      .populate('user', 'name email')
      .sort({ markedAt: 1, checkInTime: 1 });

    const presentMembers = attendanceList.map((rec) => {
      const u = rec.user || {};
      return {
        id: rec._id,
        userId: u._id || rec.studentId,
        name: u.name || rec.studentName || 'T3 Member',
        email: u.email || rec.studentEmail || '',
        markedAt: rec.markedAt || rec.checkInTime || rec.createdAt,
        method: rec.method || 'link',
      };
    });

    const presentUserIds = new Set(presentMembers.map((p) => String(p.userId)));

    const absentMembers = allT3Users
      .filter((u) => !presentUserIds.has(String(u._id)))
      .map((u) => ({
        userId: u._id,
        name: u.name,
        email: u.email,
      }));

    return {
      date: todayDate,
      timeZone: 'Asia/Kolkata',
      presentCount: presentMembers.length,
      absentCount: absentMembers.length,
      totalCount: allT3Users.length,
      presentMembers,
      absentMembers,
    };
  }

  /**
   * 5. Share active link & QR code directly to a team's chat room
   */
  async shareLinkToTeamChat(token, { teamId, customNote } = {}, user) {
    const link = await AttendanceLink.findOne({ token });
    if (!link) {
      const err = new Error('Invalid attendance link');
      err.statusCode = 404;
      throw err;
    }

    if (!link.active || new Date() > new Date(link.expiresAt)) {
      const err = new Error('Attendance session link is expired or inactive');
      err.statusCode = 400;
      throw err;
    }

    const Team = require('../teams/teams.model');
    const ChatRoom = require('../chat/chatRoom.model');
    const Message = require('../chat/chat.model');
    const { emitToRoom } = require('../../config/socket');
    const { notify } = require('../notifications/notifications.service');

    let team;
    if (teamId) {
      team = await Team.findById(teamId);
    } else {
      team = await Team.findOne({
        $or: [{ leadId: user.sub || user._id }, { members: user.sub || user._id }],
      });
    }

    if (!team) {
      const err = new Error('Target team not found');
      err.statusCode = 404;
      throw err;
    }

    const callerId = (user.sub || user._id || '').toString();
    const isLead = team.leadId && team.leadId.toString() === callerId;
    const isMember = Array.isArray(team.members) && team.members.some((m) => m.toString() === callerId);
    const isAdmin = user && ['ADMIN', 'SUPER_ADMIN'].includes(user.role);

    if (!isLead && !isMember && !isAdmin) {
      await recordAttendanceAudit({
        action: 'ATTENDANCE_SESSION_SHARE_CHAT_REJECTED',
        performedBy: user?.sub || user?._id,
        performedByName: user?.name || user?.email || '',
        token: link.token,
        team: team.name,
        details: { targetTeamId: team._id, reason: 'Caller neither leads nor belongs to target team' },
      });
      const err = new Error('Access denied. You are not a member or lead of this team.');
      err.statusCode = 403;
      throw err;
    }

    let room = await ChatRoom.findOne({ teamId: team._id });
    if (!room) {
      const memberList = new Set((team.members || []).map((m) => m.toString()));
      if (team.leadId) memberList.add(team.leadId.toString());
      memberList.add((user.sub || user._id).toString());

      const roomName = `${team.name}${team.eventTitle ? ` — ${team.eventTitle}` : ''}`;
      room = await ChatRoom.create({
        name: roomName,
        description: `Team chat for ${team.name}`,
        teamId: team._id,
        teamName: team.name,
        eventId: team.eventId || null,
        eventTitle: team.eventTitle || '',
        createdBy: user.sub || user._id,
        createdByName: user.name || 'User',
        members: Array.from(memberList),
        memberCount: memberList.size,
      });
    } else {
      const senderId = (user.sub || user._id).toString();
      if (!room.members.some((m) => m.toString() === senderId)) {
        room.members.push(user.sub || user._id);
        room.memberCount = room.members.length;
        await room.save();
      }
    }

    const baseUrl = process.env.BASE_URL || process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
    const url = `${cleanBaseUrl}/attend/${link.token}`;

    const qrCode = await QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 320,
      color: { dark: '#0f172a', light: '#ffffff' },
    });

    const expiryTime = new Date(link.expiresAt).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Kolkata',
    });

    const text = customNote?.trim()
      ? `${customNote.trim()}\n\n⏱ Expires at ${expiryTime} (Asia/Kolkata)`
      : `📢 Attendance Session Active!\n\nValidity expires at ${expiryTime} (Asia/Kolkata).\nPlease scan the QR code or click "Mark Attendance" below to register your attendance.`;

    const message = await Message.create({
      roomId: room._id,
      roomName: room.name,
      senderId: user.sub || user._id,
      senderName: user.name || 'T3 Executive',
      text,
      qrCode,
      actionUrl: url,
    });

    room.lastMessageAt = new Date();
    await room.save();

    try {
      if (typeof emitToRoom === 'function') {
        await emitToRoom(`chat:${room._id}`, 'chat:new_message', {
          _id: message._id,
          roomId: message.roomId,
          roomName: message.roomName,
          senderId: message.senderId,
          senderName: message.senderName,
          text: message.text,
          qrCode: message.qrCode,
          actionUrl: message.actionUrl,
          createdAt: message.createdAt,
        });
      }
    } catch (e) {
      logger.error('Socket emit error', { error: e.message });
    }

    if (Array.isArray(room.members)) {
      const senderDisplayName = user.name || 'T3 Executive';
      for (const memberId of room.members) {
        if (memberId && memberId.toString() !== (user.sub || user._id).toString()) {
          notify(
            memberId.toString(),
            'chat',
            `Attendance Session Active in ${room.name}`,
            `${senderDisplayName} shared attendance QR & link. Expires at ${expiryTime}.`,
            '/chat'
          ).catch((e) => logger.error('Chat notification failed', { error: e.message }));
        }
      }
    }

    await recordAttendanceAudit({
      action: 'ATTENDANCE_SESSION_SHARE_CHAT',
      performedBy: user.sub || user._id,
      performedByName: user.name || user.email || '',
      token: link.token,
      team: team.name,
      details: {
        targetTeamId: team._id,
        roomId: room._id,
      },
    });

    return {
      messageId: message._id,
      roomId: room._id,
      roomName: room.name,
      teamId: team._id,
      teamName: team.name,
      expiresAt: link.expiresAt,
    };
  }
}

const serviceInstance = new AttendanceLinkService();
serviceInstance.recordAttendanceAudit = recordAttendanceAudit;
module.exports = serviceInstance;
