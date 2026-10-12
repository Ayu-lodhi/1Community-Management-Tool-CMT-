// apps/api/src/modules/profile/profile.controller.js
// Express controllers for profile endpoints.

const mongoose = require('mongoose');
const User = require('../admin/admin.model');
const profileService = require('./profile.service');
const { canViewProfile, sanitizeProfileForViewer } = require('./profile.access');

// Helper to validate MongoDB ObjectId
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// Helper to extract caller's user ID from JWT payload
const getAuthUserId = (req) => req.user?.sub || req.user?._id || req.user?.id;

// Resolve default tier based on role (SUPER_ADMIN, ADMIN, T3_EXECUTIVE default to T3)
const resolveTier = (role, tier) => {
  if (role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'T3_EXECUTIVE') {
    return tier && tier !== 'T1' ? tier : 'T3';
  }
  return tier || 'T1';
};

/**
 * GET /profile/me
 */
exports.getMyProfile = async (req, res, next) => {
  try {
    const callerId = getAuthUserId(req);
    if (!callerId) {
      return res.status(401).json({ success: false, message: 'Authentication required: User ID missing' });
    }
    const { profile, user, completion } = await profileService.getOrCreateProfile(callerId);
    const progress = await profileService.getUserProgress(callerId);

    return res.status(200).json({
      success: true,
      data: {
        user: {
          id: user?._id || callerId,
          name: user?.name || '',
          email: user?.email || '',
          role: user?.role || 'T1_VOLUNTEER',
          tier: resolveTier(user?.role, user?.tier),
        },
        profile,
        completion,
        progress,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /profile/me
 */
exports.updateMyProfile = async (req, res, next) => {
  try {
    const callerId = getAuthUserId(req);
    if (!callerId) {
      return res.status(401).json({ success: false, message: 'Authentication required: User ID missing' });
    }
    const { profile, completion } = await profileService.updateMyProfile(callerId, req.body);
    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        profile,
        completion,
      },
    });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    next(err);
  }
};

/**
 * GET /profile/me/completion
 */
exports.getMyCompletion = async (req, res, next) => {
  try {
    const callerId = getAuthUserId(req);
    const { completion } = await profileService.getOrCreateProfile(callerId);
    return res.status(200).json({
      success: true,
      data: completion,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /profile/me/progress
 */
exports.getMyProgress = async (req, res, next) => {
  try {
    const callerId = getAuthUserId(req);
    const progress = await profileService.getUserProgress(callerId);
    return res.status(200).json({
      success: true,
      data: progress,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /profile/team (T3 Executive's team list)
 */
exports.getTeamProfiles = async (req, res, next) => {
  try {
    if (req.user.role !== 'T3_EXECUTIVE') {
      return res.status(403).json({ success: false, message: 'Forbidden: T3 executive access only' });
    }

    const callerId = getAuthUserId(req);
    const memberIds = await profileService.getLedTeamMemberIds(callerId);
    const members = await User.find({ _id: { $in: memberIds } }).select('name email role tier phone');

    const results = [];
    for (const m of members) {
      const { profile } = await profileService.getOrCreateProfile(m._id);
      const sanitized = sanitizeProfileForViewer(profile, 't3_team');
      results.push({
        user: {
          id: m._id,
          name: m.name,
          role: m.role,
          tier: resolveTier(m.role, m.tier),
        },
        profile: sanitized,
      });
    }

    return res.status(200).json({
      success: true,
      data: results,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /profile/:userId
 */
exports.getUserProfile = async (req, res, next) => {
  try {
    const { userId } = req.params;

    if (!isValidObjectId(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID format' });
    }

    const targetUser = await User.findById(userId).select('-password');
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const callerId = getAuthUserId(req);
    let t3MemberIds = [];
    if (req.user.role === 'T3_EXECUTIVE') {
      t3MemberIds = await profileService.getLedTeamMemberIds(callerId);
    }

    const authCheck = canViewProfile(req.user, targetUser, t3MemberIds);
    if (!authCheck.allowed) {
      return res.status(403).json({ success: false, message: authCheck.reason || 'Forbidden' });
    }

    const { profile, completion } = await profileService.getOrCreateProfile(targetUser._id);
    const progress = await profileService.getUserProgress(targetUser._id);
    const sanitized = sanitizeProfileForViewer(profile, authCheck.scope);

    // Build user view object respecting scope
    const userView = {
      id: targetUser._id,
      name: targetUser.name,
      role: targetUser.role,
      tier: resolveTier(targetUser.role, targetUser.tier),
    };
    if (authCheck.scope === 'owner' || authCheck.scope === 'admin') {
      userView.email = targetUser.email;
      userView.phone = targetUser.phone;
    }

    return res.status(200).json({
      success: true,
      data: {
        user: userView,
        profile: sanitized,
        completion,
        progress,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /profile/admin/tier/:userId
 */
exports.updateUserTier = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { tier, reason } = req.body;

    if (!isValidObjectId(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID format' });
    }

    const result = await profileService.changeUserTier(req.user, userId, tier, reason);
    return res.status(200).json({
      success: true,
      message: 'User tier updated successfully',
      data: result,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    next(err);
  }
};

/**
 * POST /profile/me/avatar
 */
exports.uploadAvatar = async (req, res, next) => {
  try {
    const { avatarUrl } = req.body;
    if (!avatarUrl || typeof avatarUrl !== 'string') {
      return res.status(400).json({ success: false, message: 'Image data or URL is required' });
    }

    const trimmed = avatarUrl.trim();
    const isHttp = /^https?:\/\//i.test(trimmed);
    const isDataUrl = /^data:image\/(jpeg|png|webp);base64,/i.test(trimmed);

    if (!isHttp && !isDataUrl) {
      return res.status(400).json({
        success: false,
        message: 'Invalid image format. Must be JPEG, PNG, or WebP.',
      });
    }

    const callerId = getAuthUserId(req);
    const { profile, user } = await profileService.getOrCreateProfile(callerId);
    profile.avatarUrl = trimmed;
    profile.avatarKey = `avatars/${callerId}-${Date.now()}`;
    await profile.save();

    const { calculateCompletion } = require('./profile.completion');
    const completion = calculateCompletion(profile.toObject(), user ? user.toObject() : {});
    profile.completionPercent = completion.percent;
    await profile.save();

    return res.status(200).json({
      success: true,
      message: 'Avatar updated successfully',
      data: { avatarUrl: profile.avatarUrl, completion },
    });
  } catch (err) {
    next(err);
  }
};
