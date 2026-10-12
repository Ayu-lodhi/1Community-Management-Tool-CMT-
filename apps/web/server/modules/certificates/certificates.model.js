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

module.exports = mongoose.models.Certificate || mongoose.model('Certificate', certificateSchema);
