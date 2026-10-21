const express = require('express');
const router = express.Router();

// Mount HR sub-routers
router.use('/', require('./hr.masters.routes'));
router.use('/', require('./hr.profile.routes'));
router.use('/', require('./hr.incidents.routes'));
router.use('/', require('./hr.reviews.routes'));
router.use('/', require('./hr.exceptions.routes'));
router.use('/', require('./hr.exports.routes'));

module.exports = router;
