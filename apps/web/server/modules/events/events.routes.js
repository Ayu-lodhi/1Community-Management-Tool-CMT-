const express = require('express');
const router = express.Router();
const controller = require('./events.controller');
const { protect, restrictTo } = require('../auth/auth.middleware');
const { validate, schemas } = require('../../middleware/validate.middleware');
const { auditLog } = require('../../middleware/audit.middleware');

router.use(protect);

router.get('/', controller.getAll);
router.get('/me', controller.getMyEvents);
router.get('/:id', controller.getOne);

router.post(
  '/',
  restrictTo('ADMIN', 'SUPER_ADMIN'),
  validate(schemas.createEvent),
  auditLog('EVENT_CREATED'),
  controller.create
);

router.patch('/:id', restrictTo('ADMIN', 'SUPER_ADMIN'), controller.update);
router.delete('/:id', restrictTo('ADMIN', 'SUPER_ADMIN'), controller.remove);

router.post(
  '/:id/members',
  restrictTo('ADMIN', 'SUPER_ADMIN', 'T3_EXECUTIVE'),
  auditLog('EVENT_MEMBER_ADDED'),
  controller.addMember
);

router.delete(
  '/:id/members/:userId',
  restrictTo('ADMIN', 'SUPER_ADMIN', 'T3_EXECUTIVE'),
  controller.removeMember
);

module.exports = router;
