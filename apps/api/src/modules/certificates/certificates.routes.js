const express = require('express');
const router = express.Router();
const controller = require('./certificates.controller');
const { protect, restrictTo } = require('../auth/auth.middleware');

router.use(protect);

router.get('/me', controller.getMyCertificates);
router.get('/', restrictTo('ADMIN', 'SUPER_ADMIN'), controller.getAllCertificates);
router.post('/', restrictTo('ADMIN', 'SUPER_ADMIN'), controller.issueCertificate);

module.exports = router;
