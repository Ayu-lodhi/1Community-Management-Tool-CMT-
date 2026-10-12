const express = require('express');
const router = express.Router();
const controller = require('./reviews.controller');
const { protect, restrictTo } = require('../auth/auth.middleware');

router.use(protect);

router.get('/', controller.getAllReviews);
router.get('/me', controller.getMyReviews);
router.post('/', restrictTo('T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'), controller.createReview);

module.exports = router;
