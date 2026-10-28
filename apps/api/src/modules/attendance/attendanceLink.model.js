const mongoose = require('mongoose');

const attendanceLinkSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true, index: true },
  team: { type: String, required: true, default: 'T3' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  startsAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  date: { type: String, required: true }, // YYYY-MM-DD in Asia/Kolkata
  sessionLabel: { type: String, trim: true, default: '' },
  geo: {
    enabled: { type: Boolean, default: false },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    radiusM: { type: Number, enum: [30, 50, 100], default: 100 },
    maxAccuracyM: { type: Number, default: 100 },
  },
  rolling: {
    enabled: { type: Boolean, default: false },
    stepSeconds: { type: Number, default: 30, min: 15, max: 120 },
  },
  secret: { type: String, select: false, default: null },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

// Explicitly do NOT add a TTL index. Keep old links for historical records.

module.exports = mongoose.model('AttendanceLink', attendanceLinkSchema);
