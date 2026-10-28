'use strict';

const express = require('express');
const { protect, requireAdminPermission } = require('../auth/auth.middleware');
const { requireHrRole, hrWriteLimiter } = require('./hr.middleware');
const {
  exportIncidentsCsv,
  exportReviewsCsv,
  exportExceptionsCsv,
} = require('./hr.exports.controller');

const router = express.Router();

router.use(protect);
router.use(requireHrRole);

// GET /api/v1/hr/export/incidents
router.get(
  '/export/incidents',
  requireAdminPermission('hr:export'),
  hrWriteLimiter,
  exportIncidentsCsv
);

// GET /api/v1/hr/export/reviews
router.get(
  '/export/reviews',
  requireAdminPermission('hr:export'),
  hrWriteLimiter,
  exportReviewsCsv
);

// GET /api/v1/hr/export/attendance-exceptions
router.get(
  '/export/attendance-exceptions',
  requireAdminPermission('hr:export'),
  hrWriteLimiter,
  exportExceptionsCsv
);

module.exports = router;
