'use strict';

const express = require('express');
const { protect, requireAdminPermission } = require('../auth/auth.middleware');
const { requireHrRole } = require('./hr.middleware');
const { getAttendanceExceptions } = require('./hr.exceptions.controller');

const router = express.Router();

router.use(protect);
router.use(requireHrRole);

// GET /api/v1/hr/attendance-exceptions
router.get(
  '/attendance-exceptions',
  requireAdminPermission('hr:incidents_manage'),
  getAttendanceExceptions
);

module.exports = router;
