const express = require('express');
const router = express.Router();
const controller = require('./timesheets.controller');
const { protect, restrictTo } = require('../auth/auth.middleware');

router.use(protect);

// Member self-service (T1/T2/T3)
router.post('/', controller.submit);
router.get('/me', controller.getMine);
router.get('/my-stats', controller.getMyStats);

// T3 team view
router.get('/teams/reviewable', restrictTo('T3_EXECUTIVE'), controller.getReviewableTeams);
router.get('/team', restrictTo('T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'), controller.getTeamTimesheets);
router.get('/team/export', restrictTo('T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'), controller.exportTeamCSV);

// Admin all
router.get('/all', restrictTo('ADMIN', 'SUPER_ADMIN'), controller.getAll);

// Approve/Reject (T3 lead or Admin)
router.patch('/:id/status', restrictTo('T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'), controller.updateStatus);

// Delete own
router.delete('/:id', controller.delete);

module.exports = router;
