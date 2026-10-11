const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  date: { type: String, required: true },
  location: { type: String, required: true },
  description: { type: String, default: '' },
  status: {
    type: String,
    enum: ['draft', 'published', 'closed'],
    default: 'draft',
  },
  // Event Head (T3 Executive)
  headId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  headName: { type: String, default: '' },
  headEmail: { type: String, default: '' },

  // Event Members (added by Event Head or Admin)
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  memberCount: { type: Number, default: 0 },

  teams: { type: Number, default: 0 },
  applicants: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Event', eventSchema);
