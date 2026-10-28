'use strict';

const mongoose = require('mongoose');

const performanceReviewItemSchema = new mongoose.Schema(
  {
    factorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HrPerformanceFactor',
      default: null,
    },
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
      min: 0,
    },
    obtainedScore: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const performanceReviewSchema = new mongoose.Schema(
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
    period: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}$/,
      index: true,
    },
    items: [performanceReviewItemSchema],
    maxWeightedScore: {
      type: Number,
      required: true,
      min: 0,
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
  {
    timestamps: true,
    collection: 'hr_reviews',
    autoIndex: false,
  }
);

// Unique index: one review per person per period
performanceReviewSchema.index({ employeeId: 1, period: 1 }, { unique: true });
performanceReviewSchema.index({ teamId: 1, period: -1 });

const HrReview = mongoose.model('HrReview', performanceReviewSchema);

module.exports = HrReview;
