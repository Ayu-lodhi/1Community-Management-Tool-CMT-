const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  // Direct user reference required by T3 link attendance
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  team: { type: String, default: 'T3' },
  markedAt: { type: Date, default: Date.now },
  linkId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceLink', default: null },

  // Existing/legacy fields for backwards compatibility across platform
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  studentName: { type: String, default: '' },
  studentEmail: { type: String, default: '' },

  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
  teamName: { type: String, default: '' },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', default: null },
  eventTitle: { type: String, default: '' },

  date: { type: String, required: true },  // YYYY-MM-DD
  shiftLabel: { type: String, default: 'Full Day' },

  checkInTime: { type: Date, default: null },
  checkOutTime: { type: Date, default: null },
  durationMinutes: { type: Number, default: 0 },

  status: {
    type: String,
    enum: ['present', 'late', 'absent', 'on_leave', 'half_day'],
    default: 'present',
  },
  sessionLabel: { type: String, default: '' },
  verification: {
    method: {
      type: String,
      enum: ['link', 'qr_rolling', 'qr_geo', 'qr_rolling_geo', 'manual'],
      default: 'link',
    },
    geoResult: {
      type: String,
      enum: ['verified', 'skipped', 'manual_override'],
      default: 'skipped',
    },
    distanceM: { type: Number, default: null },
    accuracyM: { type: Number, default: null },
  },
  method: {
    type: String,
    enum: ['qr', 'manual', 'self', 'link', 'qr_rolling', 'qr_geo', 'qr_rolling_geo'],
    default: 'link',
  },
  markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  markedByName: { type: String, default: '' },
  notes: { type: String, default: '' },

  createdAt: { type: Date, default: Date.now },
});

// Auto-sync user and studentId before validation
attendanceSchema.pre('validate', function (next) {
  if (this.user && !this.studentId) {
    this.studentId = this.user;
  }
  if (this.studentId && !this.user) {
    this.user = this.studentId;
  }
  if (this.markedAt && !this.checkInTime) {
    this.checkInTime = this.markedAt;
  }
  next();
});

// Compound index on { user: 1, date: 1, linkId: 1 } and sparse { user: 1, linkId: 1 } for multi-session support
attendanceSchema.index({ user: 1, date: 1, linkId: 1 }, { unique: true });
attendanceSchema.index({ user: 1, linkId: 1 }, { unique: true, sparse: true });
attendanceSchema.index({ studentId: 1, teamId: 1, date: 1 }, { sparse: true });
attendanceSchema.index({ teamId: 1, date: 1 });
attendanceSchema.index({ team: 1, date: 1 });
attendanceSchema.index({ studentId: 1, date: -1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
