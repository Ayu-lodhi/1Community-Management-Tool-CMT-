const express = require('express');
const router = express.Router();
const { protect } = require('../auth/auth.middleware');
const { getMyScorecard } = require('./hr.reviews.controller');

// Self-service student scorecard (Accessible to all authenticated roles: T1, T2, T3, Admin, SuperAdmin)
router.get('/my-scorecard', protect, getMyScorecard);

// Mount HR management sub-routers
router.use('/', require('./hr.masters.routes'));
router.use('/', require('./hr.profile.routes'));
router.use('/', require('./hr.incidents.routes'));
router.use('/', require('./hr.reviews.routes'));
router.use('/', require('./hr.exceptions.routes'));
router.use('/', require('./hr.exports.routes'));

module.exports = router;
