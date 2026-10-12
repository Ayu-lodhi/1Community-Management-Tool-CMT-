const Announcement = require('./announcements.model');
const User = require('../admin/admin.model');
const Team = require('../teams/teams.model');
const Event = require('../events/events.model');
const { notify } = require('../notifications/notifications.service');

class AnnouncementService {

  // Create + broadcast announcement
  async create(data, requester) {
    const { title, message, target, targetTeamId, targetEventId } = data;

    if (!title || title.trim().length < 3) throw new Error('Title must be at least 3 characters');
    if (!message || message.trim().length < 5) throw new Error('Message must be at least 5 characters');

    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(requester.role);
    const isT3 = requester.role === 'T3_EXECUTIVE';
    const isT2 = requester.role === 'T2_ASSOCIATE';

    if (!isAdmin && !isT3 && !isT2) {
      throw new Error('You do not have permission to create announcements');
    }

    let announcementTarget = target || 'ALL';
    let teamName = '';
    let eventTitle = '';
    let recipientIds = [];

    // TARGET: ALL USERS (Admin/SA only)
    if (announcementTarget === 'ALL') {
      if (!isAdmin) throw new Error('Only Admins can broadcast to everyone');
      const users = await User.find({ _id: { $ne: requester.sub }, isActive: true }).select('_id');
      recipientIds = users.map((u) => u._id.toString());
    }

    // TARGET: TEAM (T3/T2/Admin)
    else if (announcementTarget === 'TEAM') {
      if (!targetTeamId) throw new Error('Please select a team');

      const team = await Team.findById(targetTeamId);
      if (!team) throw new Error('Team not found');

      // If T3/T2, they must be a member of the team
      if (isT3 || isT2) {
        const isMember =
          team.members.some((m) => m.toString() === requester.sub) ||
          (team.leadId && team.leadId.toString() === requester.sub);
        if (!isMember) throw new Error('You can only announce to your own teams');
      }

      teamName = team.name;
      const memberIds = [...team.members.map((m) => m.toString())];
      if (team.leadId) memberIds.push(team.leadId.toString());
      recipientIds = memberIds.filter((id) => id !== requester.sub);
    }

    // TARGET: EVENT (Admin/SA only)
    else if (announcementTarget === 'EVENT') {
      if (!isAdmin) throw new Error('Only Admins can broadcast to events');
      if (!targetEventId) throw new Error('Please select an event');

      const event = await Event.findById(targetEventId);
      if (!event) throw new Error('Event not found');

      eventTitle = event.title;
      recipientIds = event.members.map((m) => m.toString()).filter((id) => id !== requester.sub);
    }

    const announcement = await Announcement.create({
      title: title.trim(),
      message: message.trim(),
      createdBy: requester.sub,
      createdByName: requester.name || 'User',
      createdByRole: requester.role,
      target: announcementTarget,
      targetTeamId: targetTeamId || null,
      targetTeamName: teamName,
      targetEventId: targetEventId || null,
      targetEventTitle: eventTitle,
      recipientCount: recipientIds.length,
    });

    // Send real-time notifications
    for (const userId of recipientIds) {
      await notify(userId, 'announcement', `Announcement: ${title}`, message);
    }

    return announcement;
  }

  // List announcements for a user
  async getMyAnnouncements(user) {
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(user.role);
    const isT3 = user.role === 'T3_EXECUTIVE';
    const isT2 = user.role === 'T2_ASSOCIATE';

    // Admin sees all
    if (isAdmin) {
      return await Announcement.find().sort({ createdAt: -1 }).limit(100);
    }

    const filters = [];

    // Everyone sees ALL-type announcements
    filters.push({ target: 'ALL' });

    // T3/T2 also see their team announcements
    if (isT3 || isT2) {
      const teams = await Team.find({
        $or: [{ members: user.sub }, { leadId: user.sub }],
      }).select('_id');
      const teamIds = teams.map((t) => t._id);
      if (teamIds.length > 0) {
        filters.push({ target: 'TEAM', targetTeamId: { $in: teamIds } });
      }
    }

    return await Announcement.find({
      isActive: true,
      $or: filters,
    })
      .sort({ createdAt: -1 })
      .limit(50);
  }

  async delete(id, requester) {
    const ann = await Announcement.findById(id);
    if (!ann) throw new Error('Announcement not found');

    const isCreator = ann.createdBy.toString() === requester.sub;
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(requester.role);
    if (!isCreator && !isAdmin) throw new Error('Only the creator or an Admin can delete this');

    await Announcement.findByIdAndDelete(id);
    return { success: true };
  }
}

module.exports = new AnnouncementService();
