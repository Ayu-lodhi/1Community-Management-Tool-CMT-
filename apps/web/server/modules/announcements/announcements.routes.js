const express = require('express');
const router = express.Router();
const controller = require('./announcements.controller');
const { protect, restrictTo } = require('../auth/auth.middleware');

router.use(protect);

router.get('/', controller.getMine);

// Only Admin/SA/T3/T2 can create
router.post(
  '/',
  restrictTo('ADMIN', 'SUPER_ADMIN', 'T3_EXECUTIVE', 'T2_ASSOCIATE'),
  controller.create
);

router.delete(
  '/:id',
  restrictTo('ADMIN', 'SUPER_ADMIN', 'T3_EXECUTIVE', 'T2_ASSOCIATE'),
  controller.delete
);

module.exports = router;
