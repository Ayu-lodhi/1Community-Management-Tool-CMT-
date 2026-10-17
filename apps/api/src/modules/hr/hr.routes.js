const express = require('express');
const router = express.Router();
const hrController = require('./hr.controller');
const { protect, restrictTo, requireAdminPermission } = require('../auth/auth.middleware');

// All HR routes require valid authentication
router.use(protect);

// --- 1. Masters: Performance Factors ---
router.get('/factors', hrController.listFactors);
router.post(
  '/factors',
  restrictTo('ADMIN', 'SUPER_ADMIN'),
  requireAdminPermission('hr:masters_manage'),
  hrController.createFactor
);
router.patch(
  '/factors/:id',
  restrictTo('ADMIN', 'SUPER_ADMIN'),
  requireAdminPermission('hr:masters_manage'),
  hrController.updateFactor
);
router.delete(
  '/factors/:id',
  restrictTo('ADMIN', 'SUPER_ADMIN'),
  requireAdminPermission('hr:masters_manage'),
  hrController.deleteFactor
);

// --- 2. Masters: Attendance Policy ---
router.get('/attendance-policy', hrController.getPolicy);
router.put(
  '/attendance-policy',
  restrictTo('ADMIN', 'SUPER_ADMIN'),
  requireAdminPermission('hr:masters_manage'),
  hrController.updatePolicy
);

// --- 3. Performance Reviews ---
router.post(
  '/reviews',
  restrictTo('T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'),
  hrController.submitReview
);
router.get(
  '/reviews/team/:teamId',
  restrictTo('T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'),
  hrController.getTeamReviews
);
router.get(
  '/reviews/member/:employeeId',
  hrController.getEmployeeReviews
);

// --- 4. Incident Reports & Quick Feedback ---
router.post(
  '/incidents',
  restrictTo('T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'),
  hrController.createIncident
);
router.get(
  '/incidents/team/:teamId',
  restrictTo('T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'),
  hrController.listTeamIncidents
);
router.get(
  '/incidents/member/:employeeId',
  hrController.listEmployeeIncidents
);
router.patch(
  '/incidents/:id/resolve',
  restrictTo('T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'),
  hrController.resolveIncident
);

// --- 5. Attendance Exceptions Summary ---
router.get(
  '/attendance/exceptions/team/:teamId',
  restrictTo('T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'),
  hrController.getTeamAttendanceExceptions
);

// --- 6. Formula-Safe CSV Exports ---
router.get(
  '/export/reviews/:teamId',
  restrictTo('T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'),
  hrController.exportReviews
);
router.get(
  '/export/incidents/:teamId',
  restrictTo('T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'),
  hrController.exportIncidents
);

module.exports = router;
