const express = require('express');
const router = express.Router();
const controller = require('./notifications.controller');
const { protect } = require('../auth/auth.middleware');

router.use(protect);

router.get('/', controller.getMyNotifications);
router.patch('/read-all', controller.markAllRead);
router.patch('/read-type/:type', controller.markTypeRead);
router.patch('/:id/read', controller.markAsRead);

module.exports = router;
