const authService = require('./auth.service');

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    const result = await authService.login(email, password);

    let message = 'Login successful';
    if (result.mfaRequired) {
      message = 'MFA verification required';
    } else if (result.mustChangePassword) {
      message = 'Password replacement required';
    }

    res.status(200).json({
      success: true,
      message,
      data: result,
    });
  } catch (error) {
    res.status(error.statusCode || 401).json({
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
