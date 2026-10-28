const mongoose = require('mongoose');

const shiftAssignmentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
  shiftTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShiftTemplate', required: true },
  shiftName: { type: String, required: true },
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  durationHours: { type: Number, required: true },
  taskIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
  notes: { type: String, maxlength: 500, default: '' },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  repeatRule: { type: String, enum: ['NONE', 'REPEAT_WEEKLY_4W', 'REPEAT_WEEKLY_8W'], default: 'NONE' },
}, { timestamps: true });

// One person can have at most ONE shift assignment per calendar day
shiftAssignmentSchema.index({ userId: 1, date: 1 }, { unique: true });
shiftAssignmentSchema.index({ teamId: 1, date: 1 });

module.exports = mongoose.model('ShiftAssignment', shiftAssignmentSchema);
