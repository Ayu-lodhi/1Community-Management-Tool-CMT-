'use strict';

const express = require('express');
const { protect, requireAdminPermission } = require('../auth/auth.middleware');
const { validate } = require('../../middleware/validate.middleware');
const { checkMonthNotLocked } = require('../workforce/workforce.middleware');
const { submitReviewSchema } = require('./hr.reviews.validator');
const {
  submitReview,
  listReviews,
  getEmployeeReviewHistory,
} = require('./hr.reviews.controller');
const { requireHrRole, hrWriteLimiter } = require('./hr.middleware');

const router = express.Router();

router.use(protect);
router.use(requireHrRole);

// GET /api/v1/hr/reviews
router.get(
  '/reviews',
  requireAdminPermission('hr:reviews_manage'),
  listReviews
);

// POST /api/v1/hr/reviews (Month-locked against finalized months)
router.post(
  '/reviews',
  requireAdminPermission('hr:reviews_manage'),
  hrWriteLimiter,
  checkMonthNotLocked((req) => (req.body?.period ? `${req.body.period}-01` : null)),
  validate(submitReviewSchema),
  submitReview
);

// GET /api/v1/hr/reviews/employee/:employeeId
router.get(
  '/reviews/employee/:employeeId',
  requireAdminPermission('hr:reviews_manage'),
  getEmployeeReviewHistory
);

module.exports = router;
