const BaseRepository = require('../../core/BaseRepository');
const Event = require('./events.model');

// INHERITANCE — extends BaseRepository
class EventRepository extends BaseRepository {
  constructor() {
    super(Event);
  }

  // POLYMORPHISM — override default populate behavior
  async findAll(filter = {}, options = {}) {
    return await super.findAll(filter, {
      ...options,
      populate: [
        { path: 'headId', select: 'name email role' },
        { path: 'members', select: 'name email role' },
      ],
    });
  }

  async findById(id) {
    return await super.findById(id, [
      { path: 'headId', select: 'name email role' },
      { path: 'members', select: 'name email role' },
    ]);
  }

  async updateById(id, data) {
    return await super.updateById(id, data, [
      { path: 'headId', select: 'name email role' },
      { path: 'members', select: 'name email role' },
    ]);
  }
}

module.exports = new EventRepository();
