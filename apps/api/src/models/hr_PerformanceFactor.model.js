const mongoose = require('mongoose');

const hrPerformanceFactorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 100,
    },
    benchmarkScore: {
      type: Number,
      required: true,
      default: 10,
      min: 1,
    },
    weight: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    description: {
      type: String,
      default: '',
      maxlength: 500,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

hrPerformanceFactorSchema.index({ isActive: 1, weight: -1 });

module.exports = mongoose.model(
  'HrPerformanceFactor',
  hrPerformanceFactorSchema,
  'hr_performancefactors'
);
