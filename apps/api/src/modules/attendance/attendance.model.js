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
  method: {
    type: String,
    enum: ['qr', 'manual', 'self', 'link'],
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

// Unique compound index on { user: 1, date: 1 } so a user can mark only once per day
attendanceSchema.index({ user: 1, date: 1 }, { unique: true });
attendanceSchema.index({ studentId: 1, teamId: 1, date: 1 }, { sparse: true });
attendanceSchema.index({ teamId: 1, date: 1 });
attendanceSchema.index({ team: 1, date: 1 });
attendanceSchema.index({ studentId: 1, date: -1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
