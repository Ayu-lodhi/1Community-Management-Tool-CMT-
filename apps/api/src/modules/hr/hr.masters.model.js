const mongoose = require('mongoose');

// Department master
const departmentSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, unique: true, trim: true, maxlength: 100 },
    description: { type: String, default: '', maxlength: 500 },
    isActive:    { type: Boolean, default: true, index: true },
  },
  { timestamps: true, collection: 'hr_masters_departments', autoIndex: false }
);

// Post (job title) master
const postSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, unique: true, trim: true, maxlength: 100 },
    description: { type: String, default: '', maxlength: 500 },
    isActive:    { type: Boolean, default: true, index: true },
  },
  { timestamps: true, collection: 'hr_masters_posts', autoIndex: false }
);

// Employee category master
const employeeCategorySchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, unique: true, trim: true, maxlength: 100 },
    description: { type: String, default: '', maxlength: 500 },
    isActive:    { type: Boolean, default: true, index: true },
  },
  { timestamps: true, collection: 'hr_masters_employee_categories', autoIndex: false }
);

// Performance factor master (ported from engine PerformanceFactor.model)
const performanceFactorSchema = new mongoose.Schema(
  {
    name:           { type: String, required: true, unique: true, trim: true, maxlength: 100 },
    benchmarkScore: { type: Number, required: true, default: 10, min: 1 },
    weight:         { type: Number, required: true, default: 1, min: 1 },
    description:    { type: String, default: '', maxlength: 500 },
    isActive:       { type: Boolean, default: true, index: true },
  },
  { timestamps: true, collection: 'hr_masters_performance_factors', autoIndex: false }
);

const Department        = mongoose.model('HrDepartment',        departmentSchema);
const Post              = mongoose.model('HrPost',              postSchema);
const EmployeeCategory  = mongoose.model('HrEmployeeCategory',  employeeCategorySchema);
const PerformanceFactor = mongoose.model('HrPerformanceFactor', performanceFactorSchema);

module.exports = { Department, Post, EmployeeCategory, PerformanceFactor };
