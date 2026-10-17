const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

process.env.NODE_ENV = 'test';

const HrPerformanceFactor = require('../models/hr_PerformanceFactor.model');
const HrPerformanceReview = require('../models/hr_PerformanceReview.model');
const HrIncidentReport = require('../models/hr_IncidentReport.model');
const HrAttendancePolicy = require('../models/hr_AttendancePolicy.model');

test('HR Mongoose Models & DocumentDB 5.0 Compliance (Phase 1 Integration)', async (t) => {
  await t.test('HrPerformanceFactor: validates required fields, defaults, and number ranges', () => {
    const valid = new HrPerformanceFactor({
      name: 'Code Review Rigor',
      benchmarkScore: 10,
      weight: 3,
      description: 'Thoroughness and technical accuracy in peer code reviews',
    });
    assert.equal(valid.validateSync(), undefined);

    const invalid = new HrPerformanceFactor({
      name: '',
      benchmarkScore: 0, // min is 1
      weight: -1, // min is 1
    });
    const err = invalid.validateSync();
    assert.ok(err);
    assert.ok(err.errors.name);
    assert.ok(err.errors.benchmarkScore);
    assert.ok(err.errors.weight);
  });

  await t.test('HrPerformanceReview: validates item schema, score constraints, and date format', () => {
    const valid = new HrPerformanceReview({
      employeeId: new mongoose.Types.ObjectId(),
      employeeName: 'Aarav Sharma',
      teamId: new mongoose.Types.ObjectId(),
      reviewerId: new mongoose.Types.ObjectId(),
      reviewerName: 'T3 Lead Ananya',
      fromDate: '2026-09-01',
      toDate: '2026-09-30',
      items: [
        { factorName: 'Execution Speed', benchmarkScore: 10, weight: 2, obtainedScore: 9 },
        { factorName: 'System Stability', benchmarkScore: 10, weight: 3, obtainedScore: 10 },
      ],
      maxWeightedScore: 50,
      obtainedWeightedScore: 48,
      netScorePercentage: 96.0,
      notes: 'Exceptional sprint contribution',
    });
    assert.equal(valid.validateSync(), undefined);

    const invalid = new HrPerformanceReview({
      employeeId: new mongoose.Types.ObjectId(),
      employeeName: 'Aarav Sharma',
      teamId: new mongoose.Types.ObjectId(),
      reviewerId: new mongoose.Types.ObjectId(),
      reviewerName: 'Lead',
      fromDate: '01-09-2026', // Bad format (must be YYYY-MM-DD)
      toDate: '30-09-2026',
      maxWeightedScore: 0,
      obtainedWeightedScore: -5,
      netScorePercentage: 150, // Max 100
    });
    const err = invalid.validateSync();
    assert.ok(err);
    assert.ok(err.errors.fromDate);
    assert.ok(err.errors.toDate);
    assert.ok(err.errors.maxWeightedScore);
    assert.ok(err.errors.obtainedWeightedScore);
    assert.ok(err.errors.netScorePercentage);
  });

  await t.test('HrIncidentReport: validates feedback enum, severity, and text constraints', () => {
    const valid = new HrIncidentReport({
      employeeId: new mongoose.Types.ObjectId(),
      employeeName: 'Priya Iyer',
      teamId: new mongoose.Types.ObjectId(),
      loggedBy: new mongoose.Types.ObjectId(),
      loggedByName: 'T3 Lead Vikram',
      date: '2026-10-17',
      feedbackType: 'POSITIVE',
      title: 'Resolved critical Redis reconnection loop',
      narrative: 'Diagnosed exponential backoff failure in worker queue and deployed fix.',
      severity: 'LOW',
    });
    assert.equal(valid.validateSync(), undefined);

    const invalid = new HrIncidentReport({
      employeeId: new mongoose.Types.ObjectId(),
      employeeName: 'Priya Iyer',
      teamId: new mongoose.Types.ObjectId(),
      loggedBy: new mongoose.Types.ObjectId(),
      loggedByName: 'Lead',
      date: '2026-10-17',
      feedbackType: 'INVALID_TYPE', // Enum error
      title: 'A'.repeat(201), // Max 200
      narrative: 'Short note',
    });
    const err = invalid.validateSync();
    assert.ok(err);
    assert.ok(err.errors.feedbackType);
    assert.ok(err.errors.title);
  });

  await t.test('HrAttendancePolicy: validates singleton key and default values', () => {
    const policy = new HrAttendancePolicy({
      lateComingThreshold: 4,
      lateComingPenaltyDays: 1.0,
      earlyGoingThreshold: 2,
      earlyGoingPenaltyDays: 0.5,
      gracePeriodMinutes: 20,
    });
    assert.equal(policy.validateSync(), undefined);
    assert.equal(policy.key, 'GLOBAL');
  });

  await t.test('DocumentDB 5.0 compatibility: ensures no text indexes exist on HR models', () => {
    const models = [
      HrPerformanceFactor,
      HrPerformanceReview,
      HrIncidentReport,
      HrAttendancePolicy,
    ];

    for (const model of models) {
      const indexes = model.schema.indexes();
      for (const [indexFields] of indexes) {
        for (const [field, indexType] of Object.entries(indexFields)) {
          assert.notEqual(
            indexType,
            'text',
            `Model ${model.modelName} has prohibited text index on field '${field}' (incompatible with DocumentDB 5.0)`
          );
        }
      }
    }
  });

  await t.test('Permissions & Grants: verifies HR permissions are registered in shared constants', async () => {
    const { PERMISSIONS, ROLE_DEFAULT_PERMISSIONS } = await import('@tbi/shared-constants');

    const expectedKeys = [
      'HR_MASTERS_MANAGE',
      'HR_REVIEW_SUBMIT',
      'HR_REVIEW_READ',
      'HR_REVIEW_READ_OWN',
      'HR_INCIDENT_CREATE',
      'HR_INCIDENT_READ',
      'HR_INCIDENT_READ_OWN',
      'HR_INCIDENT_RESOLVE',
      'HR_EXPORT',
    ];

    for (const key of expectedKeys) {
      assert.ok(PERMISSIONS[key], `PERMISSIONS.${key} must be defined`);
    }

    // Admin must have all HR permissions
    for (const key of expectedKeys) {
      assert.ok(
        ROLE_DEFAULT_PERMISSIONS.ADMIN.includes(PERMISSIONS[key]),
        `ADMIN must have permission ${key}`
      );
    }

    // T3 Executive must have review submit, read, incidents, export
    assert.ok(ROLE_DEFAULT_PERMISSIONS.T3_EXECUTIVE.includes(PERMISSIONS.HR_REVIEW_SUBMIT));
    assert.ok(ROLE_DEFAULT_PERMISSIONS.T3_EXECUTIVE.includes(PERMISSIONS.HR_INCIDENT_CREATE));
    assert.ok(ROLE_DEFAULT_PERMISSIONS.T3_EXECUTIVE.includes(PERMISSIONS.HR_EXPORT));

    // T1 / T2 must have read_own only
    assert.ok(ROLE_DEFAULT_PERMISSIONS.T1_VOLUNTEER.includes(PERMISSIONS.HR_REVIEW_READ_OWN));
    assert.ok(ROLE_DEFAULT_PERMISSIONS.T1_VOLUNTEER.includes(PERMISSIONS.HR_INCIDENT_READ_OWN));
    assert.equal(ROLE_DEFAULT_PERMISSIONS.T1_VOLUNTEER.includes(PERMISSIONS.HR_REVIEW_SUBMIT), false);
  });
});
