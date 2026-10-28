const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
  dueDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/, default: null },
  status: { type: String, enum: ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'], default: 'OPEN', index: true },
  priority: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], default: 'MEDIUM' },
  source: { type: String, enum: ['standard', 'assign_modal'], default: 'standard' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

taskSchema.index({ teamId: 1, status: 1 });

module.exports = mongoose.model('Task', taskSchema);
