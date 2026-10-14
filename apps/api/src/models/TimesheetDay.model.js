const mongoose = require('mongoose');

// ponytail: legacy Timesheet collection remains untouched and active at /api/v1/timesheets; retirement/deprecation of old freeform entries to be evaluated in a future cleanup milestone.
const timesheetDaySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  userName: { type: String, required: true },
  userEmail: { type: String, required: true },
  userRole: { type: String, required: true },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
  shiftAssignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShiftAssignment', default: null },
  shiftHours: { type: Number, required: true, default: 8 },
  entries: [{
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
    taskTitle: { type: String, required: true, maxlength: 200 },
    hoursSpent: { type: Number, required: true, min: 0.25, max: 24 },
    note: { type: String, maxlength: 1000, required: true },
  }],
  totalHoursSpent: { type: Number, required: true, min: 0.25, max: 24 },
  isOvertime: { type: Boolean, default: false },
  status: {
    type: String,
    enum: ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'],
    default: 'SUBMITTED',
    index: true,
  },
  review: {
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedByName: { type: String, default: '' },
    reviewedAt: { type: Date, default: null },
    comment: { type: String, maxlength: 500, default: '' },
  },
}, { timestamps: true });

timesheetDaySchema.index({ userId: 1, date: 1 }, { unique: true });
timesheetDaySchema.index({ teamId: 1, date: 1, status: 1 });

module.exports = mongoose.model('TimesheetDay', timesheetDaySchema);
