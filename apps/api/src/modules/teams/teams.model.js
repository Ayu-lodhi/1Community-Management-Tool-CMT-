const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema({
  name: { type: String, required: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', default: null },
  eventTitle: { type: String, default: '' },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  leadName: { type: String, default: '' },
  description: { type: String, default: '' },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  memberCount: { type: Number, default: 0 },
  chatActive: { type: Boolean, default: true },
  chatRoomId: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

teamSchema.index({ leadId: 1 });
teamSchema.index({ members: 1 });
teamSchema.index({ eventId: 1 });
teamSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Team', teamSchema);
