const mongoose = require('mongoose');

const dailyAttendanceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  userName: { type: String, required: true },
  userEmail: { type: String, required: true },
  userRole: { type: String, required: true },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
  shiftAssignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShiftAssignment', default: null },
  shiftStart: { type: String, default: '09:00' },
  shiftEnd: { type: String, default: '17:00' },
  status: {
    type: String,
    enum: ['PRESENT', 'LATE', 'HALF_DAY', 'ABSENT', 'ON_LEAVE', 'WEEKLY_OFF', 'HOLIDAY'],
    required: true,
    index: true,
  },
  originalStatus: { type: String, default: null },
  markedMethod: { type: String, enum: ['qr_scan', 'manual_lead', 'manual_admin', 'system_auto'], default: 'system_auto' },
  isUnassigned: { type: Boolean, default: false },
  manualEntry: {
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    markedByName: { type: String, default: '' },
    markedAt: { type: Date, default: null },
    reason: { type: String, maxlength: 500, default: '' },
  },
  rawPunchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Attendance', default: null },
  regularization: {
    status: { type: String, enum: ['NONE', 'PENDING', 'APPROVED', 'REJECTED'], default: 'NONE', index: true },
    targetStatus: { type: String, enum: ['PRESENT', 'HALF_DAY'], default: 'PRESENT' },
    reason: { type: String, maxlength: 500, default: '' },
    requestedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedByName: { type: String, default: '' },
    reviewedAt: { type: Date, default: null },
    reviewComment: { type: String, maxlength: 500, default: '' },
  },
}, { timestamps: true });

dailyAttendanceSchema.index({ userId: 1, date: 1 }, { unique: true });
dailyAttendanceSchema.index({ teamId: 1, date: 1 });
dailyAttendanceSchema.index({ teamId: 1, date: 1, status: 1 });

module.exports = mongoose.model('DailyAttendance', dailyAttendanceSchema);
