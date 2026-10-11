const express = require('express');
const router = express.Router();
const controller = require('./preferences.controller');
const { protect } = require('../auth/auth.middleware');

router.use(protect);

router.get('/me', controller.getMyPreferences);
router.get('/', controller.getMyPreferences);
router.patch('/me', controller.updateMyPreferences);
router.patch('/', controller.updateMyPreferences);
router.put('/me', controller.updateMyPreferences);
router.put('/', controller.updateMyPreferences);

module.exports = router;
