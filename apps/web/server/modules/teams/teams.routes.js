const express = require('express');
const router = express.Router();
const teamController = require('./teams.controller');
const { protect, restrictTo } = require('../auth/auth.middleware');

router.use(protect);

// List all teams (Admin)
router.get('/', teamController.getTeams);

// T3's own teams
router.get('/me', teamController.getMyTeams);
router.get('/my-teams', teamController.getMyTeams);
router.get('/me/members', teamController.getMyTeamMembers);
router.get('/me/event-members', teamController.getMyEventMembers);

// Team detail + members
router.get('/:id', teamController.getTeam);
router.get('/:id/members', teamController.getTeamMembers);

// Create / delete / manage
router.post('/', restrictTo('ADMIN', 'SUPER_ADMIN'), teamController.createTeam);
router.post('/:id/members', restrictTo('ADMIN', 'SUPER_ADMIN', 'T3_EXECUTIVE'), teamController.addMember);
router.delete('/:id/members/:userId', restrictTo('ADMIN', 'SUPER_ADMIN', 'T3_EXECUTIVE'), teamController.removeMember);
router.delete('/:id', restrictTo('ADMIN', 'SUPER_ADMIN'), teamController.deleteTeam);

module.exports = router;
