const express = require('express');
const router = express.Router();
const controller = require('./workforce.controller');
const { protect, restrictTo } = require('../auth/auth.middleware');
const { checkMonthNotLocked, requireTeamLeadOrAdmin } = require('./workforce.middleware');
const { attendanceGenerateLimiter } = require('../../middleware/rateLimit.middleware');

router.use(protect);

// 1. Shift Templates
router.post('/shifts/templates', restrictTo('T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'), requireTeamLeadOrAdmin, controller.createShiftTemplate);
router.get('/shifts/templates', controller.getShiftTemplates);

// 2. Tasks
router.post('/tasks',
  attendanceGenerateLimiter,
  restrictTo('T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'),
  requireTeamLeadOrAdmin,
  controller.createTask
);
router.get('/tasks', controller.getTasks);

// 3. Shift Assignments
router.post('/assignments',
  restrictTo('T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'),
  requireTeamLeadOrAdmin,
  checkMonthNotLocked('date'),
  controller.createAssignment
);
router.get('/assignments/team', restrictTo('T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'), requireTeamLeadOrAdmin, controller.getTeamAssignments);
router.get('/assignments/me', controller.getMyAssignments);
router.delete('/assignments/:id', restrictTo('T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'), controller.deleteAssignment);

// 4. Manual Attendance Register
router.post('/attendance/manual',
  attendanceGenerateLimiter,
  restrictTo('T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'),
  requireTeamLeadOrAdmin,
  checkMonthNotLocked('date'),
  controller.markManualAttendance
);
router.get('/attendance/register', restrictTo('T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'), requireTeamLeadOrAdmin, controller.getAttendanceRegister);

// 5. Day Timesheets
router.post('/timesheets/day', checkMonthNotLocked('date'), controller.submitDayTimesheet);
router.get('/timesheets/day/me', controller.getMyDayTimesheets);
router.get('/timesheets/day/team', restrictTo('T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'), requireTeamLeadOrAdmin, controller.getTeamDayTimesheets);
router.patch('/timesheets/day/:id/review',
  restrictTo('T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'),
  controller.reviewDayTimesheet
);

// 6. Month Lock & Unlock
router.post('/month-lock/lock', restrictTo('ADMIN', 'SUPER_ADMIN'), controller.lockMonth);
router.post('/month-lock/unlock', restrictTo('SUPER_ADMIN'), controller.unlockMonth);

// 7. Formula-safe CSV Export
router.get('/export/monthly-register', restrictTo('T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'), requireTeamLeadOrAdmin, controller.exportMonthlyRegister);

module.exports = router;
