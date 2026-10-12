const BaseService = require('../../core/BaseService');
const eventRepository = require('./events.repository');
const User = require('../admin/admin.model');
const { notifyAll, notify } = require('../notifications/notifications.service');

// INHERITANCE — extends BaseService
class EventService extends BaseService {
  constructor() {
    super(eventRepository);
  }

  // ABSTRACTION — must implement validate (from BaseService)
  validate(data) {
    if (!data.title || data.title.length < 3) {
      throw new Error('Title must be at least 3 characters');
    }
    if (!data.date) throw new Error('Date is required');
    if (!data.location) throw new Error('Location is required');
    return true;
  }

  // POLYMORPHISM — override create with custom logic
  async create(data, requester) {
    this.validate(data);

    const creatorId = requester?.sub || requester || null;

    // Clean empty strings
    const headId = this._cleanId(data.headId);

    // Validate + fetch head
    let headName = '';
    let headEmail = '';
    if (headId) {
      const head = await User.findById(headId).select('name email role');
      if (!head) throw new Error('Event head not found');
      if (!['T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'].includes(head.role)) {
        throw new Error('Event head must be T3 Executive or higher');
      }
      headName = head.name;
      headEmail = head.email;
    }

    // Build initial members list
    const members = [];
    if (headId) members.push(headId);

    if (Array.isArray(data.memberIds)) {
      for (const raw of data.memberIds) {
        const id = this._cleanId(raw);
        if (id && !members.includes(id)) {
          const exists = await User.findById(id);
          if (exists) members.push(id);
        }
      }
    }

    const event = await this.repository.create({
      title: data.title,
      date: data.date,
      location: data.location,
      description: data.description || '',
      status: 'published',
      headId,
      headName,
      headEmail,
      members,
      memberCount: members.length,
      teams: 0,
      applicants: 0,
      createdBy: creatorId,
    });

    // Fire notifications (fire and forget)
    this._dispatchCreationNotifications(event, headId, members, creatorId);

    return event;
  }

  // Add member to existing event
  async addMember(eventId, userId, requester) {
    const event = await this.repository.findById(eventId);

    // Permission check
    const requesterId = requester?.sub || requester?.id || requester?.toString();
    const headIdStr = event.headId?._id ? event.headId._id.toString() : event.headId?.toString();
    const isHead = headIdStr && headIdStr === requesterId;
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(requester?.role);
    if (!isHead && !isAdmin) throw new Error('Only Event Head or Admin can add members');

    const user = await User.findById(userId).select('name role');
    if (!user) throw new Error('User not found');

    // T3 head can only add T1/T2
    if (!isAdmin && user.role === 'T3_EXECUTIVE') {
      throw new Error('Only Admin can add T3. You can add T2 or T1.');
    }

    if (event.members.some((m) => (m._id ? m._id.toString() : m.toString()) === userId)) {
      throw new Error(`${user.name} is already in this event`);
    }

    event.members.push(userId);
    event.memberCount = event.members.length;
    await event.save();

    await notify(userId, 'system', 'Added to Event', `You've been added to "${event.title}".`);

    return await this.repository.findById(eventId);
  }

  // Remove member
  async removeMember(eventId, userId, requester) {
    const event = await this.repository.findById(eventId);
    const requesterId = requester?.sub || requester?.id || requester?.toString();
    const headIdStr = event.headId?._id ? event.headId._id.toString() : event.headId?.toString();
    const isHead = headIdStr && headIdStr === requesterId;
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(requester?.role);
    if (!isHead && !isAdmin) throw new Error('Insufficient permissions');

    if (headIdStr && headIdStr === userId) {
      throw new Error('Cannot remove the Event Head');
    }

    event.members = event.members.filter((m) => (m._id ? m._id.toString() : m.toString()) !== userId);
    event.memberCount = event.members.length;
    await event.save();

    return await this.repository.findById(eventId);
  }

  // Get events where user is head or member
  async getMyEvents(userId) {
    return await this.repository.findAll({
      $or: [{ headId: userId }, { members: userId }],
    });
  }

  // Backward compatibility aliases
  async getAllEvents(filter, options) { return this.getAll(filter, options); }
  async getEventById(id) { return this.getById(id); }
  async createEvent(data, requester) { return this.create(data, requester); }
  async updateEvent(id, data) { return this.update(id, data); }
  async deleteEvent(id) { return this.delete(id); }

  // PRIVATE helpers (encapsulation)
  _cleanId(id) {
    if (!id || typeof id !== 'string') return null;
    const trimmed = id.trim();
    return trimmed === '' ? null : trimmed;
  }

  async _dispatchCreationNotifications(event, headId, members, creatorId) {
    try {
      await notifyAll(
        creatorId,
        'system',
        'New Event Published',
        `${event.title} — ${event.date} at ${event.location}`,
        User
      );

      if (headId) {
        await notify(headId, 'system', 'You are the Event Head', `You lead "${event.title}".`);
      }

      for (const m of members) {
        if (m !== headId) {
          await notify(m, 'system', 'Added to Event', `You've been added to "${event.title}".`);
        }
      }
    } catch (err) {
      console.error('Notification dispatch failed:', err.message);
    }
  }
}

module.exports = new EventService();
