const mongoose = require('mongoose');

const attendanceLinkSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true, index: true },
  team: { type: String, required: true, default: 'T3' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  startsAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  date: { type: String, required: true }, // YYYY-MM-DD in Asia/Kolkata
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

// Explicitly do NOT add a TTL index. Keep old links for historical records.

module.exports = mongoose.model('AttendanceLink', attendanceLinkSchema);
