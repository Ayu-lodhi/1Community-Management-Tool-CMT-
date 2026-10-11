const mongoose = require('mongoose');

const certificateSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  studentName: { type: String, required: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
  eventTitle: { type: String, required: true },
  role: { type: String, default: 'Volunteer' },
  issuedAt: { type: Date, default: Date.now },
  certificateId: { type: String, unique: true },
});

certificateSchema.index({ studentId: 1, issuedAt: -1 });
certificateSchema.index({ eventId: 1 });

module.exports = mongoose.model('Certificate', certificateSchema);
