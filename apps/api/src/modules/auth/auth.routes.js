const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { protect, protectPasswordChange } = require('./auth.middleware');
const verifyCaptcha = require('../../middleware/verifyCaptcha');
const { createUserLimiter, changePasswordLimiter } = require('../../middleware/rateLimit.middleware');
const { auditLog } = require('../../middleware/audit.middleware');

router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.get('/captcha', createUserLimiter, authController.getCaptcha);
router.post('/login', verifyCaptcha, authController.login);
router.post('/forgot-password', createUserLimiter, authController.forgotPassword);
router.post('/mfa/verify', createUserLimiter, authController.verifyMfa);
router.get('/me', protect, authController.getMe);
router.get('/profile', protect, authController.getProfile);
router.patch('/profile', protect, authController.updateProfile);
router.post('/change-email', protect, createUserLimiter, authController.changeEmail);
router.post('/change-password', protectPasswordChange, changePasswordLimiter, auditLog('PASSWORD_CHANGED'), authController.changePassword);
router.post('/logout', protect, authController.logout);

module.exports = router;
