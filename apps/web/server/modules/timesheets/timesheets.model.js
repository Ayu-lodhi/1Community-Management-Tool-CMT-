const mongoose = require('mongoose');

const timesheetSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String, required: true },
  userEmail: { type: String, default: '' },
  userRole: { type: String, default: '' },

  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
  teamName: { type: String, default: '' },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', default: null },
  eventTitle: { type: String, default: '' },

  date: { type: String, required: true },         // YYYY-MM-DD
  startTime: { type: String, required: true },    // e.g. "09:00"
  endTime: { type: String, required: true },      // e.g. "17:00"
  totalHours: { type: Number, default: 0 },
  breakMinutes: { type: Number, default: 0 },

  taskDescription: { type: String, required: true, maxlength: 2000 },
  status: {
    type: String,
    enum: ['draft', 'submitted', 'approved', 'rejected'],
    default: 'submitted',
  },

  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedByName: { type: String, default: '' },
  approvedAt: { type: Date, default: null },
  rejectionReason: { type: String, default: '' },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

timesheetSchema.index({ userId: 1, date: -1 });
timesheetSchema.index({ teamId: 1, date: -1 });
timesheetSchema.index({ userId: 1, date: 1, startTime: 1 }, { unique: true });

timesheetSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.models.Timesheet || mongoose.model('Timesheet', timesheetSchema);
