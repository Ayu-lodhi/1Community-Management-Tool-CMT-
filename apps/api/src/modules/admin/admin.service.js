const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { disconnectUserSockets } = require('../../config/socket');
const { invalidateUserPermissions } = require('../../core/cache/permissionCache');
const { recordPermissionAudit } = require('../../core/utils/auditLogger');
const User = require('./admin.model');
const { sendWelcomeEmail, sendPasswordResetLinkEmail, sendProfileUpdatedEmail, sendPasswordChangedEmail, sendEmailChangedEmail } = require('../../services/email.service');
let ROLE_DEFAULT_PERMISSIONS;
try {
  ({ ROLE_DEFAULT_PERMISSIONS } = require('@tbi/shared-constants/permissions'));
} catch (err) {
  console.error('FATAL ERROR: Failed to load @tbi/shared-constants/permissions.', err);
  process.exit(1);
}

const generateDefaultPassword = () => {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let pass = 'TBI@';
  for (let i = 0; i < 6; i++) pass += chars[crypto.randomInt(chars.length)];
  pass += String(10 + crypto.randomInt(90)).padStart(2, '0');
  return pass;
};

const LOGIN_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

exports.getAllUsers = async () => {
  return await User.find().select('-password').sort({ createdAt: -1 });
};

exports.createUser = async (data, callerRole = null) => {
  if ((data.role === 'SUPER_ADMIN' || data.role === 'ADMIN') && callerRole && callerRole !== 'SUPER_ADMIN') {
    const err = new Error('Only Super Admins can create Super Admin or Admin accounts');
    err.statusCode = 403;
    err.status = 403;
    throw err;
  }
  const existing = await User.findOne({ email: data.email.toLowerCase() });
  if (existing) throw new Error('Email already exists');

  const tempPassword = generateDefaultPassword();
  const hashedPassword = await bcrypt.hash(tempPassword, 12);

  const user = await User.create({
    name: data.name,
    email: data.email.toLowerCase(),
    phone: data.phone || '',
    role: data.role || 'T1_VOLUNTEER',
    password: hashedPassword,
    mustChangePassword: true,
    isActive: true,
  });

  // Send welcome email (fire and forget)
  sendWelcomeEmail({
    to: user.email,
    name: user.name,
    role: user.role,
    tempPassword,
    loginUrl: LOGIN_URL,
  }).catch((err) => console.error('Welcome email failed:', err.message));

  const userObj = user.toObject ? user.toObject({ virtuals: false }) : { ...user };
  delete userObj.password;
  return { user: userObj, tempPassword };
};

exports.bulkCreateUsers = async (rows, callerRole = null) => {
  const results = [];
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const line = i + 1;
    try {
      if (row.role === 'SUPER_ADMIN' && callerRole !== 'SUPER_ADMIN') {
        const err = new Error('Only Super Admins can create Super Admin accounts');
        err.statusCode = 403;
        throw err;
      }
      const { user } = await exports.createUser(row, callerRole);
      succeeded++;
      results.push({
        line,
        email: row.email,
        status: 'created',
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
    } catch (error) {
      failed++;
      const isExpected =
        error.message === 'Email already exists' ||
        error.message?.includes('Super Admin') ||
        error.statusCode === 400 ||
        error.statusCode === 403;
      results.push({
        line,
        email: row.email,
        status: 'failed',
        error: isExpected ? error.message : 'User could not be created',
      });
    }
  }

  return {
    total: rows.length,
    succeeded,
    failed,
    results,
  };
};

exports.updateUser = async (id, data) => {
  // C6: Allowlist only safe profile fields — block role, isActive, mustChangePassword, password
  const allowed = ['name', 'phone', 'skills', 'bio', 'availability'];
  const safeData = {};
  allowed.forEach((k) => { if (data[k] !== undefined) safeData[k] = data[k]; });

  const user = await User.findByIdAndUpdate(id, safeData, { new: true }).select('-password');
  if (!user) throw new Error('User not found');

  if (Object.keys(safeData).length > 0) {
    sendProfileUpdatedEmail({
      to: user.email,
      name: user.name,
      updatedFields: Object.keys(safeData),
      byAdmin: true,
    }).catch((err) => console.error('Admin profile update email failed:', err.message));
  }

  await invalidateUserPermissions(id);

  return user;
};

// REVOKE — full implementation
exports.revokeUser = async (id, reason, notes, adminId) => {
  // 1. Find user
  const user = await User.findById(id);
  if (!user) throw new Error('User not found');

  // 2. Prevent revoking Super Admin
  if (user.role === 'SUPER_ADMIN') {
    throw new Error('Cannot revoke a Super Admin account');
  }

  // 3. Prevent self-revoke
  if (user._id.toString() === adminId.toString()) {
    throw new Error('You cannot revoke your own account');
  }

  // 4. Prevent revoking already-inactive
  if (!user.isActive) {
    throw new Error(`${user.name}'s account is already inactive`);
  }

  // 5. Deactivate + reset password to prevent re-login
  user.isActive = false;
  user.activeSessionId = null;
  user.lastActivity = null;
  user.passwordChangeStartedAt = null;
  user.password = await bcrypt.hash(generateDefaultPassword(), 12);
  user.mustChangePassword = true;
  await user.save();
  disconnectUserSockets(user._id);
  await invalidateUserPermissions(user._id);
  await recordPermissionAudit({
    performedBy: adminId,
    targetId: user._id,
    targetType: 'User',
    action: 'USER_ROLE_REVOKED',
    oldValue: { isActive: true, role: user.role, reason },
    newValue: { isActive: false, role: user.role },
  });

  return {
    userId: user._id,
    name: user.name,
    email: user.email,
    reason,
    notes,
    revokedAt: new Date(),
  };
};

// REACTIVATE — restore revoked access with new temp password
exports.reactivateUser = async (id, adminId) => {
  const user = await User.findById(id);
  if (!user) throw new Error('User not found');

  if (user.role === 'SUPER_ADMIN') {
    throw new Error('Cannot reactivate via this action');
  }

  if (user.isActive) {
    throw new Error(`${user.name}'s account is already active`);
  }

  // Generate new temp password (old one was reset at revoke time)
  const tempPassword = generateDefaultPassword();
  user.passwordChangeStartedAt = null;
  user.password = await bcrypt.hash(tempPassword, 12);
  user.isActive = true;
  user.mustChangePassword = true;  // Force password change on next login
  await user.save();
  await invalidateUserPermissions(user._id);
  await recordPermissionAudit({
    performedBy: adminId,
    targetId: user._id,
    targetType: 'User',
    action: 'USER_ROLE_REACTIVATED',
    oldValue: { isActive: false, role: user.role },
    newValue: { isActive: true, role: user.role },
  });

  // Send welcome email with new credentials
  sendWelcomeEmail({
    to: user.email,
    name: user.name,
    role: user.role,
    tempPassword,
    loginUrl: LOGIN_URL,
  }).catch((err) => console.error('Reactivate email failed:', err.message));

  return {
    userId: user._id,
    name: user.name,
    email: user.email,
    tempPassword,
    reactivatedAt: new Date(),
  };
};

// C7: deleteUser — guard against Super Admin and self-delete
exports.deleteUser = async (id, adminId) => {
  const user = await User.findById(id);
  if (!user) throw new Error('User not found');
  if (user.role === 'SUPER_ADMIN') throw new Error('Cannot delete a Super Admin account');
  if (id.toString() === adminId?.toString()) throw new Error('You cannot delete your own account');
  await User.findByIdAndDelete(id);
  await invalidateUserPermissions(id);
  return user;
};

// RESET PASSWORD — generates a ONE-TIME reset link and emails it to the user.
exports.resetPassword = async (id) => {
  const user = await User.findById(id).select('+passwordResetToken +passwordResetExpiry');
  if (!user) throw new Error('User not found');
  if (user.role === 'SUPER_ADMIN') throw new Error('Cannot reset Super Admin password this way');

  // Generate a cryptographically secure one-time token
  const rawToken = crypto.randomBytes(32).toString('hex');
  // Store a SHA-256 hash (never store raw tokens in DB)
  user.passwordResetToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  // Token expires in 1 hour
  user.passwordResetExpiry = new Date(Date.now() + 60 * 60 * 1000);
  await user.save();

  const resetUrl = `${LOGIN_URL}/reset-password?token=${rawToken}&id=${String(user._id)}`;

  // Email the link
  let emailSent = false;
  try {
    const result = await sendPasswordResetLinkEmail({
      to: user.email,
      name: user.name,
      resetUrl,
    });
    emailSent = result.success;
  } catch (err) {
    console.error('Reset link email failed:', err.message);
  }

  return { user: user.toObject({ virtuals: false }), emailSent };
};

// VERIFY TOKEN — check a one-time reset link token
exports.verifyResetToken = async (id, rawToken) => {
  const user = await User.findById(id).select('+passwordResetToken +passwordResetExpiry');
  if (!user) throw new Error('Invalid or expired reset link');
  if (!user.passwordResetToken || !user.passwordResetExpiry) throw new Error('Invalid or expired reset link');
  if (new Date() > user.passwordResetExpiry) throw new Error('This reset link has expired. Please ask an admin to send a new one.');

  const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const valid = crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.passwordResetToken, 'hex'));
  if (!valid) throw new Error('Invalid or expired reset link');

  return { name: user.name, email: user.email };
};

// COMPLETE RESET — set new password and consume the token
exports.completePasswordReset = async (id, rawToken, newPassword) => {
  if (typeof newPassword !== 'string' || newPassword.length < 8) throw new Error('Password must be at least 8 characters');
  if (Buffer.byteLength(newPassword, 'utf8') > 72) throw new Error('Password must not exceed 72 UTF-8 bytes');
  if (!/[A-Z]/.test(newPassword)) throw new Error('Password must contain an uppercase letter');
  if (!/[a-z]/.test(newPassword)) throw new Error('Password must contain a lowercase letter');
  if (!/[0-9]/.test(newPassword)) throw new Error('Password must contain a number');
  if (!/[^A-Za-z0-9]/.test(newPassword)) throw new Error('Password must contain a special character');

  const user = await User.findById(id).select('+passwordResetToken +passwordResetExpiry');
  if (!user) throw new Error('Invalid or expired reset link');
  if (!user.passwordResetToken || !user.passwordResetExpiry) throw new Error('Invalid or expired reset link');
  if (new Date() > user.passwordResetExpiry) throw new Error('This reset link has expired. Please ask an admin to send a new one.');

  const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const valid = crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.passwordResetToken, 'hex'));
  if (!valid) throw new Error('Invalid or expired reset link');

  // Consume the token immediately (one-time use)
  user.passwordResetToken = null;
  user.passwordResetExpiry = null;
  user.password = await bcrypt.hash(newPassword, 12);
  user.mustChangePassword = false;
  user.passwordChangeStartedAt = null;
  await user.save();

  return { user: user.toObject({ virtuals: false }) };
};

// H6: setPassword — apply same complexity rules as changePassword, require adminId for audit
exports.setPassword = async (id, newPassword, adminId) => {
  const user = await User.findById(id);
  if (!user) throw new Error('User not found');
  if (user.role === 'SUPER_ADMIN') throw new Error('Cannot set Super Admin password this way');
  if (typeof newPassword !== 'string' || newPassword.length < 8) throw new Error('Password must be at least 8 characters');
  // bcrypt only uses the first 72 UTF-8 bytes of a password.
  if (Buffer.byteLength(newPassword, 'utf8') > 72) {
    throw new Error('Password must not exceed 72 UTF-8 bytes');
  }
  if (!/[A-Z]/.test(newPassword)) throw new Error('Password must contain an uppercase letter');
  if (!/[a-z]/.test(newPassword)) throw new Error('Password must contain a lowercase letter');
  if (!/[0-9]/.test(newPassword)) throw new Error('Password must contain a number');
  if (!/[^A-Za-z0-9]/.test(newPassword)) throw new Error('Password must contain a special character');

  user.passwordChangeStartedAt = null;
  user.password = await bcrypt.hash(newPassword, 12);
  user.mustChangePassword = false;
  await user.save();

  sendPasswordChangedEmail({
    to: user.email,
    name: user.name,
    byAdmin: true,
  }).catch((err) => console.error('Admin set-password email failed:', err.message));

  return { user: user.toObject({ virtuals: false }) };
};

exports.changeEmail = async (id, newEmail, adminId) => {
  if (typeof newEmail !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) {
    throw new Error('Please enter a valid email address');
  }
  const cleanEmail = newEmail.trim().toLowerCase();

  const user = await User.findById(id);
  if (!user) throw new Error('User not found');
  if (user.email.toLowerCase() === cleanEmail) {
    throw new Error('New email must be different from current email');
  }

  const existing = await User.findOne({ email: cleanEmail });
  if (existing && String(existing._id) !== String(user._id)) {
    throw new Error('This email address is already in use by another account');
  }

  const oldEmail = user.email;
  user.email = cleanEmail;
  await user.save();

  sendEmailChangedEmail({
    oldEmail,
    newEmail: cleanEmail,
    name: user.name,
    byAdmin: true,
  }).catch((err) => console.error('Admin change email notification failed:', err.message));

  return user.toObject({ virtuals: false });
};

exports.resetUserSession = async (id) => {
  const user = await User.findByIdAndUpdate(
    id,
    {
      $set: {
        activeSessionId: null,
        lastActivity: null,
      },
    },
    { new: true }
  ).select('-password');
  if (!user) throw new Error('User not found');
  return user.toObject({ virtuals: false });
};

// ROLE UPDATE — with audit log & immediate permission cache invalidation
exports.updateUserRole = async (targetUserId, newRole, adminUser, ipAddress = null) => {
  const VALID_ROLES = ['SUPER_ADMIN', 'ADMIN', 'T3_EXECUTIVE', 'T2_ASSOCIATE', 'T1_VOLUNTEER'];
  if (!VALID_ROLES.includes(newRole)) throw new Error('Invalid role specified');

  const user = await User.findById(targetUserId);
  if (!user) throw new Error('User not found');
  if (user.role === 'SUPER_ADMIN' && adminUser.sub !== user._id.toString()) {
    throw new Error('Only the account holder can modify Super Admin role');
  }

  const oldRole = user.role;
  user.role = newRole;
  await user.save();

  await invalidateUserPermissions(user._id);

  await recordPermissionAudit({
    performedBy: adminUser.sub,
    performedByName: adminUser.name || adminUser.email,
    targetId: user._id,
    targetType: 'User',
    action: 'USER_ROLE_CHANGED',
    oldValue: { role: oldRole },
    newValue: { role: newRole },
    ipAddress,
  });

  return { userId: user._id, oldRole, newRole };
};

// PERMISSIONS (ACCESS_GRANT overrides) UPDATE — with audit log & immediate permission cache invalidation
exports.updateUserPermissions = async (targetUserId, customGrants, adminUser, ipAddress = null) => {
  const user = await User.findById(targetUserId);
  if (!user) throw new Error('User not found');

  if (adminUser?.role !== 'SUPER_ADMIN') {
    const err = new Error('Forbidden');
    err.statusCode = 403;
    throw err;
  }

  if (user.role === 'SUPER_ADMIN') throw new Error('Cannot change permissions of a Super Admin');
  if (user.role !== 'ADMIN') throw new Error('Permissions can only be managed for ADMIN accounts');

  const adminDefaults = ROLE_DEFAULT_PERMISSIONS['ADMIN'] || [];

  let newGrants;
  if (customGrants === null || customGrants === undefined) {
    newGrants = undefined;
  } else {
    if (!Array.isArray(customGrants)) throw new Error('customGrants must be an array of permissions or null to reset');
    for (const grant of customGrants) {
      if (!adminDefaults.includes(grant)) {
        throw new Error(`Invalid permission: ${grant}. Must be a subset of default Admin permissions.`);
      }
    }
    newGrants = customGrants;
  }

  const oldGrants = user.customGrants;
  user.customGrants = newGrants;
  await user.save();

  await invalidateUserPermissions(user._id);
  await recordPermissionAudit({
    performedBy: adminUser.sub,
    performedByName: adminUser.name || adminUser.email,
    targetId: user._id,
    targetType: 'User',
    action: 'USER_PERMISSIONS_CHANGED',
    oldValue: { customGrants: oldGrants },
    newValue: { customGrants: newGrants },
    ipAddress,
  });

  return { userId: user._id, customGrants: newGrants };
};
