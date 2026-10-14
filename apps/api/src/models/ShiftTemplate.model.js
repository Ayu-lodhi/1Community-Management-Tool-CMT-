const mongoose = require('mongoose');

const shiftTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
  startTime: { type: String, required: true, match: /^([01]\d|2[0-3]):([0-5]\d)$/ },
  endTime: { type: String, required: true, match: /^([01]\d|2[0-3]):([0-5]\d)$/ },
  durationHours: { type: Number, required: true, min: 0.5, max: 24 },
  breakMinutes: { type: Number, default: 0, min: 0, max: 240 },
  weekdays: [{ type: Number, min: 0, max: 6 }],
  isActive: { type: Boolean, default: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

shiftTemplateSchema.index({ teamId: 1, isActive: 1 });

module.exports = mongoose.model('ShiftTemplate', shiftTemplateSchema);
