const authService = require('./auth.service');
const captchaService = require('../../services/captcha.service');

exports.getCaptcha = async (req, res) => {
  try {
    const challenge = await captchaService.createCaptchaChallenge();
    res.status(200).json({ success: true, data: challenge });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to generate CAPTCHA challenge' });
  }
};

exports.login = async (req, res) => {
  try {
    const loginIdentifier = req.body.identifier || req.body.email;
    const { password } = req.body;
    if (!loginIdentifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    const result = await authService.login(loginIdentifier, password);

    res.status(200).json({
      success: true,
      message: result.mfaRequired ? 'MFA verification required'
        : result.mustChangePassword ? 'Password replacement required' : 'Login successful',
      data: result,
    });
  } catch (error) {
    res.status(error.statusCode || 401).json({
      success: false,
      message: error.message,
    });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    await authService.forgotPassword(email);
    res.status(200).json({
      success: true,
      message: 'If an account exists with that email, a password reset link has been sent.',
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await authService.getUserById(req.user.sub);
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const user = await authService.getUserById(req.user.sub);
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const updated = await authService.updateProfile(req.user.sub, req.body);
    res.status(200).json({ success: true, message: 'Profile updated successfully', data: updated });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.changeEmail = async (req, res) => {
  try {
    const { newEmail, currentPassword } = req.body;
    const result = await authService.changeEmail(req.user, newEmail, currentPassword);
    res.status(200).json({ success: true, message: 'Email updated successfully', data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    await authService.changePassword(req.user, oldPassword, newPassword);
    res.status(200).json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.verifyMfa = async (req, res) => {
  try {
    const { challengeToken, code } = req.body;
    const result = await authService.verifyMfa(challengeToken, code);
    res.status(200).json({ success: true, message: 'Login successful', data: result });
  } catch (error) {
    res.status(error.statusCode || 401).json({ success: false, message: error.message });
  }
};

exports.logout = async (req, res) => {
  try {
    if (req.user?.sub) {
      await authService.logout(req.user.sub);
    }
    res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
