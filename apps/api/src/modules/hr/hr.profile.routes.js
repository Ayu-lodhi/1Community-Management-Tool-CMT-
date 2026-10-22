'use strict';

const express = require('express');
const { protect, restrictTo, requireAdminPermission } = require('../auth/auth.middleware');
const { validate } = require('../../middleware/validate.middleware');
const { hrProfileSchema } = require('./hr.profile.validator');
const { getProfile, updateProfile } = require('./hr.profile.controller');
const { requireHrRole, hrWriteLimiter } = require('./hr.middleware');

const router = express.Router();

router.use(protect);
router.use(requireHrRole);

// GET /api/v1/hr/profiles/:userId
router.get(
  '/profiles/:userId',
  requireAdminPermission('hr:masters_manage'),
  getProfile
);

// PUT /api/v1/hr/profiles/:userId — Restricted to ADMIN and SUPER_ADMIN
router.put(
  '/profiles/:userId',
  restrictTo('ADMIN', 'SUPER_ADMIN'),
  requireAdminPermission('hr:masters_manage'),
  hrWriteLimiter,
  validate(hrProfileSchema),
  updateProfile
);

module.exports = router;
