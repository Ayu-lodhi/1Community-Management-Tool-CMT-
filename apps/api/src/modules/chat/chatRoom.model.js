const mongoose = require('mongoose');

const chatRoomSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
  teamName: { type: String, default: '' },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', default: null },
  eventTitle: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdByName: { type: String, default: '' },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  memberCount: { type: Number, default: 0 },
  isArchived: { type: Boolean, default: false },
  lastMessageAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('ChatRoom', chatRoomSchema);
