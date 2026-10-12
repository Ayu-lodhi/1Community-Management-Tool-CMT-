// apps/api/src/modules/profile/profile.routes.js
// Express router for user profile endpoints.

const express = require('express');
const router = express.Router();

const { protect, restrictTo } = require('../auth/auth.middleware');
const { createUserLimiter } = require('../../middleware/rateLimit.middleware');
const profileController = require('./profile.controller');

// All profile endpoints require valid authentication
router.use(protect);

// 1. Current user own profile endpoints
router.get('/me', profileController.getMyProfile);
router.patch('/me', profileController.updateMyProfile);
router.post('/me/avatar', express.json({ limit: '10mb' }), createUserLimiter, profileController.uploadAvatar);
router.get('/me/completion', profileController.getMyCompletion);
router.get('/me/progress', profileController.getMyProgress);

// 2. T3 Executive team list (restricted to T3_EXECUTIVE)
router.get('/team', restrictTo('T3_EXECUTIVE'), profileController.getTeamProfiles);

// 3. Admin tier update (restricted to ADMIN, SUPER_ADMIN and rate-limited)
router.patch('/admin/tier/:userId', restrictTo('ADMIN', 'SUPER_ADMIN'), createUserLimiter, profileController.updateUserTier);

// 4. View profile by ID (access controlled per viewer scope)
router.get('/:userId', profileController.getUserProfile);

module.exports = router;
