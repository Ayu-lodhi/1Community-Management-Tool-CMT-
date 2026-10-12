const ChatRoom = require('./chatRoom.model');
const Message = require('./chat.model');
const User = require('../admin/admin.model');
const Team = require('../teams/teams.model');
let PRIVILEGED_ROLES = ['SUPER_ADMIN', 'ADMIN'];
import('../../../../../packages/shared-constants/roles.js')
  .then((m) => {
    if (m?.PRIVILEGED_ROLES) PRIVILEGED_ROLES = m.PRIVILEGED_ROLES;
  })
  .catch(() => {});
const { AuthorizationError, ValidationError } = require('../../core/errors/typedErrors');
const { notify } = require('../notifications/notifications.service');

class ChatService {

  // Legacy rooms may carry an untrusted team binding, creator and membership.
  // Team authority always comes from the current team/account records.
  async hasTeamAccess(room, userId, manage = false) {
    if (!room.teamId) return true;
    const team = await Team.findById(room.teamId);
    if (!team) return false;
    if (team.leadId?.toString() === userId) return true;
    if (!manage && team.members.some((id) => id.toString() === userId)) return true;
    return Boolean(await User.exists({
      _id: userId, isActive: true, role: { $in: PRIVILEGED_ROLES },
    }));
  }

  async requireRoomManager(room, requester) {
    const allowed = room.teamId
      ? await this.hasTeamAccess(room, requester.sub, true)
      : room.createdBy.toString() === requester.sub || PRIVILEGED_ROLES.includes(requester.role);
    if (!allowed) throw new AuthorizationError('Only the room manager or Admin can manage this room');
  }

  // Socket access follows the HTTP account and room-membership checks.
  async canAccessRoom(roomId, userId) {
    if (typeof roomId !== 'string' || !/^[a-f\d]{24}$/i.test(roomId) ||
        typeof userId !== 'string' || !/^[a-f\d]{24}$/i.test(userId)) return false;

    if (!await User.exists({ _id: userId, isActive: true })) return false;
    if (!await ChatRoom.exists({ _id: roomId, members: userId })) return false;
    const room = await ChatRoom.findById(roomId);
    return Boolean(room && await this.hasTeamAccess(room, userId));
  }

  // List rooms where current user is a member
  async getMyRooms(userId) {
    const rooms = await ChatRoom.find({ members: userId, isArchived: false })
      .populate('createdBy', 'name')
      .sort({ lastMessageAt: -1 });
    const allowed = await Promise.all(rooms.map((room) => this.hasTeamAccess(room, userId)));
    return rooms.filter((room, index) => allowed[index]);
  }

  // Get single room
  async getRoomById(roomId, userId) {
    const room = await ChatRoom.findById(roomId)
      .populate('members', 'name email role')
      .populate('createdBy', 'name');
    if (!room) throw new Error('Room not found');

    const isMember = room.members.some((m) => m._id.toString() === userId);
    if (!isMember || !await this.hasTeamAccess(room, userId)) {
      throw new AuthorizationError('You are not a member of this room');
    }

    return room;
  }

  // Create a new chat room
  async createRoom(data, requester) {
    const { name, description, teamName, eventId, eventTitle, memberIds } = data;
    if (data.teamId != null) {
      throw new ValidationError('Use the team chat endpoint to create a team room');
    }

    if (!name || name.trim().length < 2) {
      throw new Error('Room name must be at least 2 characters');
    }

    // Ensure creator is in members list
    const members = new Set([requester.sub]);
    if (Array.isArray(memberIds)) {
      for (const id of memberIds) {
        if (id && id.trim() !== '') members.add(id);
      }
    }

    // Validate each member exists
    const memberList = Array.from(members);
    const existing = await User.find({ _id: { $in: memberList } }).select('_id name');
    if (existing.length !== memberList.length) {
      throw new Error('One or more members do not exist');
    }

    const room = await ChatRoom.create({
      name: name.trim(),
      description: description || '',
      teamId: null,
      teamName: teamName || '',
      eventId: eventId || null,
      eventTitle: eventTitle || '',
      createdBy: requester.sub,
      createdByName: requester.name || 'User',
      members: memberList,
      memberCount: memberList.length,
    });

    // Notify each new member except creator
    for (const m of memberList) {
      if (m !== requester.sub) {
        await notify(m, 'chat', 'Added to Chat Room', `You've been added to "${room.name}".`);
      }
    }

    return await ChatRoom.findById(room._id)
      .populate('members', 'name email role')
      .populate('createdBy', 'name');
  }

  // Add member to existing room
  async addMember(roomId, userId, requester) {
    const room = await ChatRoom.findById(roomId);
    if (!room) throw new Error('Room not found');

    await this.requireRoomManager(room, requester);

    const user = await User.findById(userId).select('name');
    if (!user) throw new Error('User not found');
    if (!await this.hasTeamAccess(room, user._id.toString())) {
      throw new AuthorizationError('Only team members can be added to a team room');
    }

    if (room.members.some((m) => m.toString() === userId)) {
      throw new Error(`${user.name} is already in this room`);
    }

    room.members.push(userId);
    room.memberCount = room.members.length;
    await room.save();

    await notify(userId, 'chat', 'Added to Chat Room', `You've been added to "${room.name}".`);

    return await ChatRoom.findById(roomId)
      .populate('members', 'name email role')
      .populate('createdBy', 'name');
  }

  // Get messages for a room
  async getMessages(roomId, userId) {
    const room = await ChatRoom.findById(roomId);
    if (!room) throw new Error('Room not found');

    const isMember = room.members.some((m) => m.toString() === userId);
    if (!isMember || !await this.hasTeamAccess(room, userId)) {
      throw new AuthorizationError('You are not a member of this room');
    }

    return await Message.find({ roomId }).sort({ createdAt: 1 }).limit(200);
  }

  // Send message
  async sendMessage(roomId, text, user, options = {}) {
    const room = await ChatRoom.findById(roomId);
    if (!room) throw new Error('Room not found');

    const isMember = room.members.some((m) => m.toString() === user.sub);
    if (!isMember || !await this.hasTeamAccess(room, user.sub)) {
      throw new AuthorizationError('You are not a member of this room');
    }

    if (!text || text.trim().length === 0) throw new Error('Message cannot be empty');

    const message = await Message.create({
      roomId,
      roomName: room.name,
      senderId: user.sub,
      senderName: user.name || 'User',
      text: text.trim(),
      qrCode: options.qrCode || null,
      actionUrl: options.actionUrl || null,
    });

    room.lastMessageAt = new Date();
    await room.save();

    return message;
  }

  // Archive room
  async archiveRoom(roomId, requester) {
    const room = await ChatRoom.findById(roomId);
    if (!room) throw new Error('Room not found');

    await this.requireRoomManager(room, requester);

    room.isArchived = true;
    await room.save();
    return room;
  }

  // Create or get chat room for a specific team
  async createOrGetTeamRoom(teamId, requester) {
    const team = await Team.findById(teamId);
    if (!team) throw new Error('Team not found');

    // Permission: requester must be team lead OR admin
    const isLead = team.leadId && team.leadId.toString() === requester.sub;
    const isAdmin = PRIVILEGED_ROLES.includes(requester.role);
    if (!isLead && !isAdmin) throw new Error('Only the Team Lead or Admin can manage the team chat');

    // Build default members list from team
    const memberList = new Set(team.members.map((m) => m.toString()));
    if (team.leadId) memberList.add(team.leadId.toString());
    memberList.add(requester.sub); // ensure requester is in

    // Look for existing room for this team
    let room = await ChatRoom.findOne({ teamId });

    if (room) {
      // Replace untrusted legacy ownership/membership before exposing team chat.
      const added = [...memberList].filter((id) => !room.members.some((m) => m.toString() === id));
      room = await ChatRoom.findByIdAndUpdate(room._id, { $set: {
        members: [...memberList],
        memberCount: memberList.size,
        createdBy: requester.sub,
        createdByName: requester.name || 'User',
      } }, { new: true });
      if (!room) throw new Error('Room not found');
      for (const id of added) {
        await notify(id, 'chat', 'Added to Chat Room', `You've been added to "${room.name}".`);
      }
      return await ChatRoom.findById(room._id)
        .populate('members', 'name email role')
        .populate('createdBy', 'name');
    }

    // Create new room
    const roomName = `${team.name}${team.eventTitle ? ` — ${team.eventTitle}` : ''}`;
    room = await ChatRoom.create({
      name: roomName,
      description: `Team chat for ${team.name}`,
      teamId: team._id,
      teamName: team.name,
      eventId: team.eventId || null,
      eventTitle: team.eventTitle || '',
      createdBy: requester.sub,
      createdByName: requester.name || 'User',
      members: Array.from(memberList),
      memberCount: memberList.size,
    });

    // Notify all members except creator
    for (const id of Array.from(memberList)) {
      if (id !== requester.sub) {
        await notify(id, 'chat', 'Team Chat Created', `You've been added to "${room.name}".`);
      }
    }

    return await ChatRoom.findById(room._id)
      .populate('members', 'name email role')
      .populate('createdBy', 'name');
  }

  // Delete room + all its messages
  async deleteRoom(roomId, requester) {
    const room = await ChatRoom.findById(roomId);
    if (!room) throw new Error('Room not found');

    await this.requireRoomManager(room, requester);

    // Delete all messages
    await Message.deleteMany({ roomId });

    // Delete the room
    await ChatRoom.findByIdAndDelete(roomId);

    // Only notify the creator (not all members) — T1/T2 shouldn't get this
    if (room.createdBy.toString() !== requester.sub) {
      await notify(
        room.createdBy,
        'chat',
        'Chat Room Deleted',
        `Your room "${room.name}" has been deleted by an administrator.`
      );
    }

    return { deletedRoomId: roomId, deletedMessages: true };
  }

  // Delete a single message
  async deleteMessage(messageId, requester) {
    const message = await Message.findById(messageId);
    if (!message) throw new Error('Message not found');

    // Only sender or admin can delete
    const isSender = message.senderId.toString() === requester.sub;
    const isAdmin = PRIVILEGED_ROLES.includes(requester.role);
    if (!isSender && !isAdmin) throw new Error('You can only delete your own messages');

    await Message.findByIdAndDelete(messageId);
    return message;
  }
}

module.exports = new ChatService();
