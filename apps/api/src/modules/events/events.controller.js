const BaseController = require('../../core/BaseController');
const eventService = require('./events.service');

// INHERITANCE
class EventController extends BaseController {
  constructor() {
    super(eventService);

    // Route compatibility aliases
    this.getEvents = this.getAll;
    this.getEvent = this.getOne;
    this.createEvent = this.create;
    this.updateEvent = this.update;
    this.deleteEvent = this.remove;
  }

  // POLYMORPHISM — extend with custom endpoints

  // GET /events/me — events where user is head or member
  getMyEvents = async (req, res) => {
    try {
      const events = await this.service.getMyEvents(req.user.sub);
      res.json({ success: true, data: events });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  };

  // POST /events/:id/members
  addMember = async (req, res) => {
    try {
      const event = await this.service.addMember(req.params.id, req.body.userId, req.user);
      res.json({ success: true, message: 'Member added', data: event });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  };

  // DELETE /events/:id/members/:userId
  removeMember = async (req, res) => {
    try {
      const event = await this.service.removeMember(req.params.id, req.params.userId, req.user);
      res.json({ success: true, message: 'Member removed', data: event });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  };
}

module.exports = new EventController();
