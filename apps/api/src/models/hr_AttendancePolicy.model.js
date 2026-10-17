const mongoose = require('mongoose');

const hrAttendancePolicySchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: 'GLOBAL',
      immutable: true,
    },
    lateComingThreshold: {
      type: Number,
      required: true,
      default: 3,
      min: 1,
    },
    lateComingPenaltyDays: {
      type: Number,
      required: true,
      default: 0.5,
      min: 0,
    },
    earlyGoingThreshold: {
      type: Number,
      required: true,
      default: 3,
      min: 1,
    },
    earlyGoingPenaltyDays: {
      type: Number,
      required: true,
      default: 0.5,
      min: 0,
    },
    gracePeriodMinutes: {
      type: Number,
      required: true,
      default: 15,
      min: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  'HrAttendancePolicy',
  hrAttendancePolicySchema,
  'hr_attendancepolicies'
);
