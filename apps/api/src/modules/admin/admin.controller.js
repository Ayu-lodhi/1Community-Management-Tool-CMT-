const adminService = require('./admin.service');

exports.getUsers = async (req, res) => {
  try {
    const users = await adminService.getAllUsers();
    res.status(200).json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.addUser = async (req, res) => {
  try {
    if ((req.body.role === 'SUPER_ADMIN' || req.body.role === 'ADMIN') && req.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Only Super Admins can create Super Admin or Admin accounts',
      });
    }
    const { user } = await adminService.createUser(req.body, req.user?.role);
    res.status(201).json({
      success: true,
      message: 'User created. Credentials sent via email.',
      data: user,
    });
  } catch (error) {
    const isExpected =
      error.message === 'Email already exists' ||
      error.message?.includes('Super Admin') ||
      error.statusCode === 400 ||
      error.statusCode === 403;
    const safeMessage = isExpected ? error.message : 'User could not be created';
    res.status(error.statusCode || error.status || 400).json({ success: false, message: safeMessage });
  }
};

exports.bulkImportUsers = async (req, res) => {
  try {
    const rows = req.body?.rows || [];
    if (req.user?.role !== 'SUPER_ADMIN' && rows.some((r) => r.role === 'SUPER_ADMIN' || r.role === 'ADMIN')) {
      return res.status(403).json({
        success: false,
        message: 'Only Super Admins can create Super Admin or Admin accounts',
      });
    }

    const report = await adminService.bulkCreateUsers(rows, req.user?.role);
    res.status(200).json({
      success: true,
      message: `Bulk import completed: ${report.succeeded} created, ${report.failed} failed`,
      ...report,
    });
  } catch (error) {
    const isExpected = error.statusCode === 400 || error.statusCode === 403;
    res.status(error.statusCode || 500).json({
      success: false,
      message: isExpected ? error.message : 'Bulk import failed',
    });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const user = await adminService.updateUser(req.params.id, req.body);
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// REVOKE — deactivate + kill sessions
exports.revokeUser = async (req, res) => {
  try {
    const { reason, notes } = req.body;
    if (!reason || reason.trim() === '') {
      return res.status(400).json({ success: false, message: 'Reason is required' });
    }
    const result = await adminService.revokeUser(req.params.id, reason, notes, req.user.sub);
    res.status(200).json({
      success: true,
      message: `${result.name}'s access has been revoked.`,
      data: result,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    await adminService.deleteUser(req.params.id, req.user.sub);
    res.status(200).json({ success: true, message: 'User deleted' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// RESET PASSWORD — sends a one-time reset link to user's email
exports.resetPassword = async (req, res) => {
  try {
    const { user, emailSent } = await adminService.resetPassword(req.params.id);
    res.status(200).json({
      success: true,
      message: emailSent
        ? `Password reset link emailed to ${user.email}. Link expires in 1 hour.`
        : 'Reset link generated but email delivery failed. Please retry.',
      emailSent,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// PUBLIC: Verify one-time reset token (pre-flight before showing form)
exports.verifyResetToken = async (req, res) => {
  try {
    const { token, id } = req.query;
    if (!token || !id) return res.status(400).json({ success: false, message: 'Missing token or id' });
    const info = await adminService.verifyResetToken(id, token);
    res.status(200).json({ success: true, data: info });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// PUBLIC: Complete password reset via one-time link
exports.completePasswordReset = async (req, res) => {
  try {
    const { token, id, newPassword } = req.body;
    if (!token || !id) return res.status(400).json({ success: false, message: 'Missing token or id' });
    await adminService.completePasswordReset(id, token, newPassword);
    res.status(200).json({ success: true, message: 'Password reset successful. You can now log in.' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.setPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    const user = await adminService.setPassword(req.params.id, newPassword, req.user.sub);
    res.status(200).json({
      success: true,
      message: 'Password updated successfully.',
      data: user,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// REACTIVATE — Super Admin only
exports.reactivateUser = async (req, res) => {
  try {
    const result = await adminService.reactivateUser(req.params.id, req.user.sub);
    const responseBody = {
      success: true,
      message: `${result.name}'s access has been reactivated. New credentials emailed.`,
      data: { userId: result.userId, name: result.name, email: result.email },
    };
    // C5: Only expose tempPassword if it was returned (email failed)
    if (result.tempPassword) responseBody.tempPassword = result.tempPassword;
    res.status(200).json(responseBody);
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.changeEmail = async (req, res) => {
  try {
    const { newEmail } = req.body;
    const user = await adminService.changeEmail(req.params.id, newEmail, req.user.sub);
    res.status(200).json({
      success: true,
      message: 'Email updated successfully.',
      data: user,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.resetUserSession = async (req, res) => {
  try {
    const user = await adminService.resetUserSession(req.params.id);
    res.status(200).json({
      success: true,
      message: `Active session cleared for ${user.name}.`,
      data: user,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    if (!role) {
      return res.status(400).json({ success: false, message: 'Role is required' });
    }
    const result = await adminService.updateUserRole(
      req.params.id,
      role,
      req.user,
      req.ip || req.headers['x-forwarded-for']
    );
    res.status(200).json({ success: true, message: 'User role updated', data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateUserPermissions = async (req, res) => {
  try {
    const { customGrants } = req.body;
    if (!Array.isArray(customGrants)) {
      return res.status(400).json({ success: false, message: 'customGrants array is required' });
    }
    const result = await adminService.updateUserPermissions(
      req.params.id,
      customGrants,
      req.user,
      req.ip || req.headers['x-forwarded-for']
    );
    res.status(200).json({ success: true, message: 'User permissions updated', data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};