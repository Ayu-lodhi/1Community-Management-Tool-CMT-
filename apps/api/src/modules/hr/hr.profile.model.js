'use strict';

const mongoose = require('mongoose');

const hrProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HrDepartment',
      default: null,
    },
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HrPost',
      default: null,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'HrEmployeeCategory',
      default: null,
    },
    joiningDate: {
      type: String,
      default: null,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    notes: {
      type: String,
      default: '',
      maxlength: 2000,
    },
  },
  {
    timestamps: true,
    collection: 'hr_profiles',
    autoIndex: false,
  }
);

hrProfileSchema.index({ department: 1 });
hrProfileSchema.index({ post: 1 });
hrProfileSchema.index({ category: 1 });

const HrProfile = mongoose.model('HrProfile', hrProfileSchema);

module.exports = HrProfile;
