const mongoose = require('mongoose');

const performanceItemSchema = new mongoose.Schema(
  {
    factorName: {
      type: String,
      required: true,
      trim: true,
    },
    benchmarkScore: {
      type: Number,
      required: true,
      min: 1,
    },
    weight: {
      type: Number,
      required: true,
      min: 1,
    },
    obtainedScore: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const hrPerformanceReviewSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    employeeName: {
      type: String,
      required: true,
      trim: true,
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: true,
      index: true,
    },
    reviewerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reviewerName: {
      type: String,
      required: true,
      trim: true,
    },
    fromDate: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    toDate: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    items: [performanceItemSchema],
    maxWeightedScore: {
      type: Number,
      required: true,
      min: 1,
    },
    obtainedWeightedScore: {
      type: Number,
      required: true,
      min: 0,
    },
    netScorePercentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    notes: {
      type: String,
      default: '',
      maxlength: 2000,
    },
  },
  { timestamps: true }
);

hrPerformanceReviewSchema.index({ employeeId: 1, fromDate: 1, toDate: 1 }, { unique: true });
hrPerformanceReviewSchema.index({ teamId: 1, toDate: -1 });

module.exports = mongoose.model(
  'HrPerformanceReview',
  hrPerformanceReviewSchema,
  'hr_performancereviews'
);
