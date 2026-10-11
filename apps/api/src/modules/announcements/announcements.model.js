const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true, maxlength: 200 },
  message: { type: String, required: true, maxlength: 2000 },

  // Who created it
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdByName: { type: String, default: '' },
  createdByRole: { type: String, default: '' },

  // Target audience
  target: {
    type: String,
    enum: ['ALL', 'TEAM', 'EVENT'],
    default: 'ALL',
  },
  targetTeamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
  targetTeamName: { type: String, default: '' },
  targetEventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', default: null },
  targetEventTitle: { type: String, default: '' },

  // Audience snapshot (for display)
  recipientCount: { type: Number, default: 0 },

  isActive: { type: Boolean, default: true },
  expiresAt: { type: Date, default: null },

  createdAt: { type: Date, default: Date.now },
});

announcementSchema.index({ createdAt: -1 });
announcementSchema.index({ target: 1, targetTeamId: 1 });
announcementSchema.index({ target: 1, targetEventId: 1 });

module.exports = mongoose.model('Announcement', announcementSchema);
