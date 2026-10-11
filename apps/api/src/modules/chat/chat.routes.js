const express = require('express');
const router = express.Router();
const controller = require('./chat.controller');
const { protect, restrictTo } = require('../auth/auth.middleware');

router.use(protect);

// Room management
router.get('/rooms', controller.getMyRooms);
router.post('/rooms', restrictTo('T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'), controller.createRoom);
router.post('/rooms/team/:teamId', restrictTo('T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'), controller.createOrGetTeamRoom);
router.get('/rooms/:id', controller.getRoom);
router.post('/rooms/:id/members', restrictTo('T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'), controller.addMember);
router.patch('/rooms/:id/archive', restrictTo('T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'), controller.archiveRoom);
router.delete('/rooms/:id', restrictTo('T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'), controller.deleteRoom);

// Messages
router.get('/rooms/:id/messages', controller.getMessages);
router.post('/rooms/:id/messages', controller.sendMessage);
router.delete('/messages/:id', controller.deleteMessage);

module.exports = router;
