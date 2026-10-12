const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  studentName: { type: String, required: true },
  studentEmail: { type: String, required: true },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
  teamName: { type: String, default: '' },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', default: null },
  eventTitle: { type: String, default: '' },
  role: { type: String, default: 'Team Member' },
  requestType: {
    type: String,
    enum: ['leave', 'half_day', 'event', 'team_join'],
    default: 'leave',
  },
  targetDate: { type: String, default: '' }, // YYYY-MM-DD
  reason: { type: String, default: '' }, // Optional member reason
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'denied', 'waitlisted'],
    default: 'pending',
  },
  rejectionReason: { type: String, default: '' }, // Lead denial reason
  appliedAt: { type: Date, default: Date.now },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedByName: { type: String, default: '' },
  reviewedAt: { type: Date, default: null },
});

module.exports = mongoose.models.Application || mongoose.model('Application', applicationSchema);
