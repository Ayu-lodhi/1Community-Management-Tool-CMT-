const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../admin/admin.model');

const repository = require('./auth.repository');
const tokens = require('./auth.tokens');
const mfa = require('./mfa.service');
const { sendProfileUpdatedEmail, sendPasswordChangedEmail, sendEmailChangedEmail } = require('../../services/email.service');

const getSessionTimeoutMs = () => {
  const minutes = parseInt(process.env.SESSION_TIMEOUT_MINUTES, 10);
  return (isNaN(minutes) || minutes <= 0 ? 30 : minutes) * 60 * 1000;
};

const ensureDbConnected = async () => {
  const mongoose = require('mongoose');
  if (mongoose.connection?.readyState === 1) return;

  if (mongoose.connection?.readyState === 0 || mongoose.connection?.readyState === 3) {
    const uri = process.env.MONGODB_URI;
    if (uri) {
      try {
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
      } catch (_) {}
    }
  }

  if (mongoose.connection?.readyState === 2) {
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 4000);
      mongoose.connection.once('open', () => {
        clearTimeout(timer);
        resolve();
      });
      mongoose.connection.once('error', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  if (mongoose.connection?.readyState !== 1) {
    const error = new Error('Service temporarily unavailable');
    error.statusCode = 503;
    throw error;
  }
};

const acquireSession = async (userId) => {
  const sessionId = crypto.randomBytes(32).toString('hex');
  await ensureDbConnected();
  // Terminate any previous socket connections or permission cache for immediate single-session enforcement
  try {
    const { disconnectUserSockets } = require('../../config/socket');
    if (disconnectUserSockets) disconnectUserSockets(userId);
  } catch (_) {}

  // Auto-override: Atomically overwrite activeSessionId with the new session,
  // terminating any previous active session and establishing this login as the active one.
  let updatedUser;
  try {
    updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          activeSessionId: sessionId,
          lastActivity: new Date(),
        },
      },
      { new: true }
    );
  } catch (err) {
    const error = new Error('Service temporarily unavailable');
    error.statusCode = 503;
    throw error;
  }

  if (!updatedUser) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  return { updatedUser, sessionId };
};

exports.login = async (email, password) => {
  if (typeof email !== 'string' || typeof password !== 'string') throw new Error('Invalid credentials');
  await ensureDbConnected();
  let user = await repository.findByEmail(email);
  if (!user) throw new Error('Invalid credentials');
  if (!user.isActive) throw new Error('Account is deactivated');

  if (!user.password || !user.password.startsWith('$2')) {
    throw new Error('Invalid credentials');
  }
  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) throw new Error('Invalid credentials');

  const requiresMfa = await tokens.requiresMfa(user.role);
  if (requiresMfa && !user.mfa) throw new Error('MFA enrollment required; contact your system operator');
  if (user.mustChangePassword) {
    if (user.passwordChangeStartedAt) throw new Error('Temporary password already used; ask an administrator to reset it');
    user = await repository.consumeTemporaryPassword(user);
    if (!user) throw new Error('Credentials changed or temporary password already used; ask an administrator to reset it');
  }

  if (requiresMfa) {
    return { mfaRequired: true, challengeToken: tokens.sign(user, 'mfa', '5m') };
  }

  const { updatedUser, sessionId } = await acquireSession(user._id);
  return issueSession(updatedUser, false, sessionId);
};

exports.verifyMfa = async (challengeToken, code) => {
  const challenge = tokens.verify(challengeToken, 'mfa');
  await ensureDbConnected();
  const user = await repository.findById(challenge.sub);
  if (!user?.isActive || !user.mfa || !(await tokens.requiresMfa(user.role)) ||
      challenge.authState !== tokens.authState(user)) {
    throw new Error('MFA verification expired; sign in again');
  }
  const verified = await mfa.verify(user, code);
  const { updatedUser, sessionId } = await acquireSession(verified._id);
  return issueSession(updatedUser, true, sessionId);
};

exports.logout = async (userId) => {
  const mongoose = require('mongoose');
  if (mongoose.connection?.readyState === 1 && User && typeof User.findByIdAndUpdate === 'function') {
    await User.findByIdAndUpdate(userId, {
      $set: {
        activeSessionId: null,
        lastActivity: null,
      },
    });
  }
  try {
    const { invalidateUserPermissions } = require('../../core/cache/permissionCache');
    await invalidateUserPermissions(userId);
  } catch (err) {
    // Graceful fallback
  }
  return { success: true };
};

const issueSession = (user, isMfaVerified, sessionId) => {
  if (!user || !sessionId || !user.activeSessionId || user.activeSessionId !== sessionId) {
    const error = new Error('Service temporarily unavailable');
    error.statusCode = 503;
    throw error;
  }
  const sid = sessionId;
  if (user.mustChangePassword) {
    const remaining = Math.floor((new Date(user.passwordChangeStartedAt).getTime() + 300000 - Date.now()) / 1000);
    if (!user.passwordChangeStartedAt || remaining <= 0) throw new Error('Password replacement expired; ask an administrator to reset it');
    return {
      mustChangePassword: true,
      passwordChangeToken: tokens.sign(user, 'password-change', remaining, { isMfaVerified, sid }),
    };
  }
  const accessToken = tokens.sign(user, 'access', process.env.JWT_ACCESS_EXPIRY || '15m', {
    role: user.role, isMfaVerified, sid,
  });
  const refreshToken = tokens.sign(user, 'refresh', process.env.JWT_REFRESH_EXPIRY || '7d', { sid });

  return {
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    },
    accessToken,
    refreshToken,
  };
};

exports.getUserById = async (id) => {
  const user = await User.findById(id).select('-password');
  if (!user) throw new Error('User not found');
  return user;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const checkAdminDailyLimit = (user, lastUpdateField, actionName) => {
  if (user.role === 'ADMIN' && user[lastUpdateField]) {
    const elapsed = Date.now() - new Date(user[lastUpdateField]).getTime();
    if (elapsed < ONE_DAY_MS) {
      const hoursLeft = Math.ceil((ONE_DAY_MS - elapsed) / (60 * 60 * 1000));
      throw new Error(`Admins can only ${actionName} once per day. Please try again in ${hoursLeft} hour${hoursLeft === 1 ? '' : 's'}.`);
    }
  }
};

exports.updateProfile = async (userId, data) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  checkAdminDailyLimit(user, 'lastProfileUpdatedAt', 'update their profile details');

  const allowed = ['name', 'phone', 'skills', 'bio', 'availability'];
  const changes = [];
  allowed.forEach((k) => {
    if (data[k] !== undefined && data[k] !== user[k]) {
      changes.push(k);
      user[k] = data[k];
    }
  });

  if (changes.length > 0) {
    user.lastProfileUpdatedAt = new Date();
    await user.save();
    sendProfileUpdatedEmail({
      to: user.email,
      name: user.name,
      updatedFields: changes,
    }).catch((err) => console.error('Profile update email failed:', err.message));
  }

  return user.toObject({ virtuals: false });
};

exports.changePassword = async (credential, oldPassword, newPassword) => {
  const user = await repository.findById(credential.sub);
  if (!user?.isActive || credential.authState !== tokens.authState(user)) {
    throw new Error('Credentials changed; sign in again');
  }

  if (!user.mustChangePassword) {
    checkAdminDailyLimit(user, 'lastPasswordUpdatedAt', 'change their password');
  }

  if (!user.password || !user.password.startsWith('$2')) {
    throw new Error('Current password is invalid — contact support');
  }
  if (user.mustChangePassword) {
    if (credential.purpose !== 'password-change' || !user.passwordChangeStartedAt) {
      throw new Error('Password replacement required');
    }
  } else {
    if (credential.purpose !== 'access' || typeof oldPassword !== 'string' ||
        !(await bcrypt.compare(oldPassword, user.password))) throw new Error('Current password is incorrect');
  }

  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
  // bcrypt only uses the first 72 UTF-8 bytes of a password.
  if (Buffer.byteLength(newPassword, 'utf8') > 72) {
    throw new Error('Password must not exceed 72 UTF-8 bytes');
  }
  if (!/[A-Z]/.test(newPassword)) throw new Error('Password must contain an uppercase letter');
  if (!/[a-z]/.test(newPassword)) throw new Error('Password must contain a lowercase letter');
  if (!/[0-9]/.test(newPassword)) throw new Error('Password must contain a number');
  if (!/[^A-Za-z0-9]/.test(newPassword)) throw new Error('Password must contain a special character');

  if (await bcrypt.compare(newPassword, user.password)) throw new Error('New password must differ from the current password');
  const updated = await repository.replacePassword(user, await bcrypt.hash(newPassword, 12));
  if (!updated) throw new Error('Credentials changed; sign in again');

  const mongoose = require('mongoose');
  if (user.mustChangePassword && mongoose.connection?.readyState === 1 && User && typeof User.updateOne === 'function') {
    try {
      await User.updateOne({ _id: user._id }, { $set: { activeSessionId: null, lastActivity: null } });
    } catch (_) {}
  }

  sendPasswordChangedEmail({
    to: user.email,
    name: user.name,
  }).catch((err) => console.error('Password changed email failed:', err.message));

  return { success: true };
};

exports.changeEmail = async (credential, newEmail, currentPassword) => {
  if (typeof newEmail !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) {
    throw new Error('Please enter a valid email address');
  }
  const cleanEmail = newEmail.trim().toLowerCase();

  const user = await repository.findById(credential.sub);
  if (!user?.isActive) throw new Error('Account not found or inactive');

  checkAdminDailyLimit(user, 'lastEmailUpdatedAt', 'change their email address');

  if (user.email.toLowerCase() === cleanEmail) {
    throw new Error('New email must be different from current email');
  }

  if (typeof currentPassword !== 'string' || !user.password || !user.password.startsWith('$2') ||
      !(await bcrypt.compare(currentPassword, user.password))) {
    throw new Error('Current password is incorrect');
  }

  const existing = await repository.findByEmail(cleanEmail);
  if (existing && String(existing._id) !== String(user._id)) {
    throw new Error('This email address is already in use by another account');
  }

  const oldEmail = user.email;
  user.email = cleanEmail;
  user.lastEmailUpdatedAt = new Date();
  await user.save();

  sendEmailChangedEmail({
    oldEmail,
    newEmail: cleanEmail,
    name: user.name,
    byAdmin: false,
  }).catch((err) => console.error('Change email notification failed:', err.message));

  return {
    email: user.email,
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  };
};