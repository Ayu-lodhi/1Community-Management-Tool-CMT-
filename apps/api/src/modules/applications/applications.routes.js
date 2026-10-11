const express = require('express');
const router = express.Router();
const controller = require('./applications.controller');
const { protect, restrictTo } = require('../auth/auth.middleware');

router.use(protect);

// Admin/T3 can see all applications
router.get('/', restrictTo('ADMIN', 'SUPER_ADMIN', 'T3_EXECUTIVE'), controller.getApplications);

// Student's own applications
router.get('/me', controller.getMyApplications);

// Raise approval request (T1/T2/T3/Admin)
router.post('/', restrictTo('T1_VOLUNTEER', 'T2_ASSOCIATE', 'T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'), controller.createApplication);

// Approve/Reject/Waitlist (T3/Admin)
router.patch('/:id/status', restrictTo('T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'), controller.updateStatus);

module.exports = router;
