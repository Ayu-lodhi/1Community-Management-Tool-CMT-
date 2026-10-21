'use strict';

const HrProfile = require('./hr.profile.model');
const User = require('../admin/admin.model');
const { isLeadOfPerson } = require('./hr.permissions');
const { recordHrAudit } = require('./hr.middleware');

async function assertProfileAccess(req, targetUserId) {
  const caller = req.user;
  if (!caller) {
    const err = new Error('Unauthenticated');
    err.statusCode = 401;
    throw err;
  }

  // T1 and T2 have no access under any circumstance
  if (!['T3_EXECUTIVE', 'ADMIN', 'SUPER_ADMIN'].includes(caller.role)) {
    const err = new Error('Access denied: Unauthorized role.');
    err.statusCode = 403;
    throw err;
  }

  // Nobody reviews or accesses their own HR profile
  const callerIdStr = (caller.sub || caller._id || caller.id)?.toString();
  const targetIdStr = targetUserId?.toString();
  if (callerIdStr === targetIdStr) {
    const err = new Error('Access denied: Cannot view or modify your own HR profile.');
    err.statusCode = 403;
    throw err;
  }

  // T3 access is strictly derived from database Team.members
  if (caller.role === 'T3_EXECUTIVE') {
    const isLead = await isLeadOfPerson(callerIdStr, targetIdStr);
    if (!isLead) {
      const err = new Error('Access denied: Member is not in any team you lead.');
      err.statusCode = 403;
      throw err;
    }
  }

  return true;
}

// GET /api/v1/hr/profiles/:userId
async function getProfile(req, res, next) {
  try {
    const { userId } = req.params;
    await assertProfileAccess(req, userId);

    const profile = await HrProfile.findOne({ userId })
      .populate('department', 'name description')
      .populate('post', 'name description')
      .populate('category', 'name description')
      .lean();

    if (!profile) {
      return res.json({
        success: true,
        data: {
          userId,
          department: null,
          post: null,
          category: null,
          joiningDate: null,
          notes: '',
        },
      });
    }

    res.json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
}

// PUT /api/v1/hr/profiles/:userId
async function updateProfile(req, res, next) {
  try {
    const { userId } = req.params;
    await assertProfileAccess(req, userId);

    // Verify employee exists in database
    const user = await User.findById(userId).select('_id name role');
    if (!user) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    const { department, post, category, joiningDate, notes } = req.body;
    const updateData = {};
    if (department !== undefined) updateData.department = department || null;
    if (post !== undefined) updateData.post = post || null;
    if (category !== undefined) updateData.category = category || null;
    if (joiningDate !== undefined) updateData.joiningDate = joiningDate || null;
    if (notes !== undefined) updateData.notes = notes || '';

    const profile = await HrProfile.findOneAndUpdate(
      { userId },
      { $set: updateData },
      { upsert: true, new: true, runValidators: true }
    );

    await recordHrAudit({
      performedBy: req.user?.sub || req.user?._id,
      performedByName: req.user?.name || req.user?.role,
      action: 'HR_PROFILE_UPDATE',
      targetId: userId,
      targetType: 'HrProfile',
      details: {
        userId,
        updatedFields: Object.keys(updateData),
      },
      ipAddress: req.ip,
    });

    res.json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getProfile,
  updateProfile,
  assertProfileAccess,
};
