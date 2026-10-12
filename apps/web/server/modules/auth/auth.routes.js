const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { protect, protectPasswordChange } = require('./auth.middleware');
const verifyCaptcha = require('../../middleware/verifyCaptcha');

router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.post('/login', verifyCaptcha, authController.login);
router.post('/mfa/verify', authController.verifyMfa);
router.get('/me', protect, authController.getMe);
router.get('/profile', protect, authController.getProfile);
router.patch('/profile', protect, authController.updateProfile);
router.post('/change-email', protect, authController.changeEmail);
router.post('/change-password', protectPasswordChange, authController.changePassword);
router.post('/logout', protect, authController.logout);

module.exports = router;
