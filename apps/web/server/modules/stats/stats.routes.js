const express = require('express');
const router = express.Router();
const controller = require('./stats.controller');
const { protect, restrictTo } = require('../auth/auth.middleware');

router.use(protect);

// Admin
router.get('/admin', restrictTo('ADMIN', 'SUPER_ADMIN'), controller.getAdminStats);
router.get('/users-by-tier', restrictTo('ADMIN', 'SUPER_ADMIN'), controller.getUsersByTier);
router.get('/applications-trend', restrictTo('ADMIN', 'SUPER_ADMIN'), controller.getApplicationsTrend);
router.get('/monthly-applications', restrictTo('ADMIN', 'SUPER_ADMIN'), controller.getMonthlyApplications);
router.get('/attendance', restrictTo('ADMIN', 'SUPER_ADMIN', 'T3_EXECUTIVE'), controller.getAttendanceStats);
router.get('/top-performers', controller.getTopPerformers);

// Role-specific
router.get('/t3', restrictTo('T3_EXECUTIVE'), controller.getT3Stats);
router.get('/t2', restrictTo('T2_ASSOCIATE'), controller.getT2Stats);
router.get('/t1', restrictTo('T1_VOLUNTEER'), controller.getT1Stats);

// Super Admin
router.get('/super-admin', restrictTo('SUPER_ADMIN'), controller.getSuperAdminStats);

module.exports = router;
