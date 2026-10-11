const Team = require('./teams.model');
const User = require('../admin/admin.model');
const Event = require('../events/events.model');
const { notify } = require('../notifications/notifications.service');
const { AuthorizationError, ValidationError } = require('../../core/errors/typedErrors');
const { canReadTeamContacts } = require('./teams.permissions');
const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  T3_EXECUTIVE: 'T3_EXECUTIVE',
  T2_ASSOCIATE: 'T2_ASSOCIATE',
  T1_VOLUNTEER: 'T1_VOLUNTEER'
};
const PRIVILEGED_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN];

const requireMembershipManager = (team, requester) => {
  const isAdmin = !!requester?.sub && PRIVILEGED_ROLES.includes(requester.role);
  const isLead = !!requester?.sub && team.leadId?.toString() === requester.sub;
  if (!isAdmin && !isLead) {
    throw new AuthorizationError('Only the team lead or admin can manage members');
  }
  return isAdmin;
};


const metadataFields = [
  '_id', 'name', 'eventId', 'eventTitle', 'description', 'memberCount', 'chatActive', 'createdAt',
];

const projectTeamsForRequester = async (teams, requester) => {
  // Check current membership before resolving any contact references.
  const authorized = new Set(teams.filter(team => canReadTeamContacts(team, requester)));
  if (authorized.size) {
    await Team.populate([...authorized], [
      { path: 'members', select: 'name email role' },
      { path: 'leadId', select: 'name email role' },
    ]);
  }
  // An allowlist also excludes cached leadName, raw user IDs and chatRoomId.
  return teams.map(team => authorized.has(team) ? team :
    Object.fromEntries(metadataFields.map(field => [field, team[field]])));
};

exports.getAllTeams = async (requester) => {
  const teams = await Team.find().sort({ createdAt: -1 }).lean();
  return projectTeamsForRequester(teams, requester);
};

exports.getTeamById = async (id, requester) => {
  const team = await Team.findById(id).lean();
  if (!team) throw new Error('Team not found');
  const [result] = await projectTeamsForRequester([team], requester);
  return result;
};

exports.getMyTeams = async (userId) => {
  const teams = await Team.find({
    $or: [{ leadId: userId }, { members: userId }],
  })
    .populate('members', 'name email role')
    .populate('leadId', 'name email role')
    .sort({ createdAt: -1 })
    .lean();

  return teams;
};

exports.createTeam = async (data) => {
  const { name, eventId, eventTitle, leadId, description } = data;
  if (!name) throw new Error('Team name is required');

  const team = await Team.create({
    name,
    eventId: eventId || null,
    eventTitle: eventTitle || '',
    leadId: leadId || null,
    description: description || '',
    chatRoomId: `team-${Date.now()}`,
    members: leadId ? [leadId] : [],
    memberCount: leadId ? 1 : 0,
  });

  if (leadId) {
    const lead = await User.findById(leadId).select('name');
    if (lead) {
      team.leadName = lead.name;
      await User.findByIdAndUpdate(leadId, { teamId: team._id });
      await team.save();
    }
  }

  return await Team.findById(team._id)
    .populate('members', 'name email role')
    .populate('leadId', 'name email role');
};

exports.addMember = async (teamId, userId, requester) => {
  const team = await Team.findById(teamId);
  if (!team) throw new Error('Team not found');
  const isAdmin = requireMembershipManager(team, requester);

  const user = await User.findById(userId).select('name email role');
  if (!user) throw new Error('User not found');
  userId = user._id.toString();

  if (team.members.some((m) => m.toString() === userId)) {
    throw new Error(`${user.name} is already in this team`);
  }

  const event = team.eventId ? await Event.findById(team.eventId) : null;
  const addToEvent = event && !event.members.some((m) => m.toString() === userId);
  if (addToEvent && !isAdmin && user.role === ROLES.T3_EXECUTIVE) {
    throw new AuthorizationError('Only Admin can add T3. You can add T2 or T1.');
  }

  team.members.push(userId);
  team.memberCount = team.members.length;
  await team.save();

  await User.findByIdAndUpdate(userId, { teamId: team._id });

  // If team belongs to an event, also add to event.members
  if (addToEvent) {
    event.members.push(userId);
    event.memberCount = event.members.length;
    await event.save();
  }

  await notify(userId, 'system', 'Added to Team', `You've been added to "${team.name}".`);


  return await Team.findById(teamId)
    .populate('members', 'name email role')
    .populate('leadId', 'name email role');
};

// REMOVE MEMBER — with cascade to event
exports.removeMember = async (teamId, userId, requester) => {
  const team = await Team.findById(teamId);
  if (!team) throw new Error('Team not found');
  requireMembershipManager(team, requester);

  const user = await User.findById(userId).select('name');
  userId = user?._id.toString() || userId.toLowerCase();
  if (!team.members.some((m) => m.toString() === userId)) {
    throw new ValidationError('User is not a member of this team');
  }
  if (team.leadId?.toString() === userId) {
    throw new ValidationError('Cannot remove the Team Lead');
  }

  // Validate the entire cascade before any write or notification.
  let eventToRemoveFrom = null;
  if (team.eventId) {
    const otherTeams = await Team.find({
      eventId: team.eventId,
      _id: { $ne: teamId },
      members: userId,
    });

    if (otherTeams.length === 0) {
      eventToRemoveFrom = await Event.findById(team.eventId);
      if (eventToRemoveFrom?.headId?.toString() === userId) {
        throw new ValidationError('Cannot remove the Event Head');
      }
    }
  }

  team.members = team.members.filter((m) => m.toString() !== userId);
  team.memberCount = team.members.length;
  await team.save();

  if (eventToRemoveFrom) {
    const event = eventToRemoveFrom;
    event.members = event.members.filter((m) => m.toString() !== userId);
    event.memberCount = event.members.length;
    await event.save();

    await notify(userId, 'system', 'Removed from Event', `You've been removed from "${event.title}" along with team "${team.name}".`);
  } else if (team.eventId) {
    // The event roster is unchanged — only notify about team removal.
    await notify(userId, 'system', 'Removed from Team', `You've been removed from team "${team.name}".`);
  }

  return await Team.findById(teamId)
    .populate('members', 'name email role')
    .populate('leadId', 'name email role');
};

exports.deleteTeam = async (id) => {
  const team = await Team.findById(id);
  if (!team) throw new Error('Team not found');

  // Cascade: Remove all team members from event if they're not in other teams
  if (team.eventId) {
    const event = await Event.findById(team.eventId);
    if (event) {
      for (const memberId of team.members) {
        const otherTeams = await Team.find({
          eventId: team.eventId,
          _id: { $ne: id },
          members: memberId,
        });
        if (otherTeams.length === 0) {
          event.members = event.members.filter((m) => m.toString() !== memberId);
        }
      }
      event.memberCount = event.members.length;
      await event.save();
    }
  }

  await Team.findByIdAndDelete(id);
  return team;
};

// Get all unique members from teams where user is lead or member
exports.getMyTeamMembers = async (userId) => {
  const Team = require('./teams.model');
  const User = require('../admin/admin.model');

  // Find all teams where user is lead OR member
  const teams = await Team.find({
    $or: [{ leadId: userId }, { members: userId }],
  }).select('members leadId');

  // Collect unique member IDs
  const memberIds = new Set();
  for (const team of teams) {
    if (team.leadId) memberIds.add(team.leadId.toString());
    for (const m of team.members) memberIds.add(m.toString());
  }

  // Remove self
  memberIds.delete(userId.toString());

  if (memberIds.size === 0) return [];

  // Fetch user details
  const users = await User.find({ _id: { $in: Array.from(memberIds) }, isActive: true })
    .select('name email role')
    .sort({ name: 1 });

  return users;
};

// Get all unique members from events where user is head or member
exports.getMyEventMembers = async (userId) => {
  const Event = require('../events/events.model');
  const User = require('../admin/admin.model');

  const events = await Event.find({
    $or: [{ headId: userId }, { members: userId }],
  }).select('members headId');

  const memberIds = new Set();
  for (const ev of events) {
    if (ev.headId) memberIds.add(ev.headId.toString());
    for (const m of ev.members) memberIds.add(m.toString());
  }

  memberIds.delete(userId.toString());

  if (memberIds.size === 0) return [];

  return await User.find({ _id: { $in: Array.from(memberIds) }, isActive: true })
    .select('name email role')
    .sort({ name: 1 });
};

// Get team members from a specific team
exports.getTeamMembers = async (teamId, userId) => {
  const Team = require('./teams.model');
  const User = require('../admin/admin.model');

  const team = await Team.findById(teamId).select('members leadId');
  if (!team) throw new Error('Team not found');

  // Check if requester is a member
  const isMember = team.members.some((m) => m.toString() === userId) ||
    (team.leadId && team.leadId.toString() === userId);
  if (!isMember) throw new Error('You are not a member of this team');

  const memberIds = new Set(team.members.map((m) => m.toString()));
  if (team.leadId) memberIds.add(team.leadId.toString());
  memberIds.delete(userId.toString());

  if (memberIds.size === 0) return [];

  return await User.find({ _id: { $in: Array.from(memberIds) }, isActive: true })
    .select('name email role')
    .sort({ name: 1 });
};

