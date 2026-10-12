// apps/api/src/modules/profile/profile.service.js
// Profile business logic: retrieval, validation, updates, tier management, and progress calculation.

const Profile = require('./profile.model');
const User = require('../admin/admin.model');
const Team = require('../teams/teams.model');
const { validateLinkedInUrl } = require('./profile.linkedin');
const { calculateCompletion } = require('./profile.completion');
const { calculateProgressScore } = require('./profile.progress');
const { canChangeTier } = require('./profile.access');
let disconnectUserSockets = () => {};
try {
  const socketConfig = require('../../config/socket');
  if (socketConfig.disconnectUserSockets) disconnectUserSockets = socketConfig.disconnectUserSockets;
} catch (_) {}

let invalidateUserPermissions = () => Promise.resolve();
try {
  const permCache = require('../../core/cache/permissionCache');
  if (permCache.invalidateUserPermissions) invalidateUserPermissions = permCache.invalidateUserPermissions;
} catch (_) {
  try {
    const cacheInv = require('../../core/cache/cacheInvalidator');
    if (cacheInv.invalidateUserPermissions) invalidateUserPermissions = cacheInv.invalidateUserPermissions;
  } catch (_) {}
}

let recordPermissionAudit = () => Promise.resolve();
try {
  const auditUtil = require('../../core/utils/auditLogger');
  if (auditUtil.recordPermissionAudit) recordPermissionAudit = auditUtil.recordPermissionAudit;
} catch (_) {}

// Allow-list for self-service profile edits
const EDITABLE_FIELDS = [
  'headline',
  'university',
  'city',
  'gender',
  'birthday',
  'skills',
  'education',
  'projects',
  'bio',
  'linkedinUrl',
  'mobile',
];

/**
 * Get or create profile for a given user.
 */
async function getOrCreateProfile(userId) {
  if (!userId) {
    const err = new Error('User ID is required to retrieve or create profile');
    err.statusCode = 400;
    throw err;
  }
  let profile = await Profile.findOne({ userId });
  const user = await User.findById(userId).select('-password');

  if (!profile) {
    profile = await Profile.create({
      userId,
      mobile: user?.phone || '',
      emailVerified: true, // User email was verified at registration/login
      completionPercent: 0,
      progressScore: 0,
    });
  }

  // Calculate live completion
  const completion = calculateCompletion(profile.toObject(), user ? user.toObject() : {});
  if (profile.completionPercent !== completion.percent) {
    profile.completionPercent = completion.percent;
    await profile.save();
  }

  return { profile, user, completion };
}

/**
 * Update current user's profile with strict allow-list and mass-assignment protection.
 */
async function updateMyProfile(userId, rawData = {}) {
  const { profile, user } = await getOrCreateProfile(userId);

  // Apply only allow-listed fields
  for (const field of EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(rawData, field)) {
      let val = rawData[field];

      if (field === 'linkedinUrl') {
        const validated = validateLinkedInUrl(val);
        if (!validated.valid) {
          const err = new Error(validated.reason || 'Invalid LinkedIn URL');
          err.statusCode = 400;
          throw err;
        }
        profile.linkedinUrl = validated.normalized || '';
        continue;
      }

      if (field === 'skills') {
        if (Array.isArray(val)) {
          profile.skills = val.map((s) => String(s).trim()).filter(Boolean).slice(0, 30);
        }
        continue;
      }

      if (field === 'gender') {
        const v = String(val || '').toLowerCase().trim();
        if (v === 'male') profile.gender = 'male';
        else if (v === 'female') profile.gender = 'female';
        else if (v === 'other' || v === 'non-binary') profile.gender = 'other';
        else if (v === 'prefer not to say' || v === 'prefer_not_to_say') profile.gender = 'prefer_not_to_say';
        else if (!v) profile.gender = '';
        else profile.gender = v;
        continue;
      }

      if (field === 'education' && Array.isArray(val)) {
        profile.education = val.slice(0, 10).map((edu) => {
          const fieldVal = String(edu.fieldOfStudy || edu.field || '').trim().slice(0, 200);
          return {
            institution: String(edu.institution || '').trim().slice(0, 200),
            degree: String(edu.degree || '').trim().slice(0, 200),
            field: fieldVal,
            fieldOfStudy: fieldVal,
            startYear: edu.startYear ? (Number(edu.startYear) || null) : null,
            endYear: edu.endYear ? (Number(edu.endYear) || null) : null,
            current: !!edu.current,
            grade: String(edu.grade || '').trim().slice(0, 50),
          };
        });
        continue;
      }

      if (field === 'projects' && Array.isArray(val)) {
        profile.projects = val.slice(0, 15).map((p) => ({
          title: String(p.title || '').trim().slice(0, 200),
          description: String(p.description || '').trim().slice(0, 2000),
          url: String(p.url || '').trim().slice(0, 500),
          technologies: Array.isArray(p.technologies)
            ? p.technologies.map((t) => String(t).trim().slice(0, 50)).filter(Boolean).slice(0, 20)
            : [],
        }));
        continue;
      }

      if (field === 'birthday') {
        if (val) {
          const d = new Date(val);
          if (isNaN(d.getTime())) {
            const err = new Error('Invalid birthday date');
            err.statusCode = 400;
            throw err;
          }
          if (d >= new Date()) {
            const err = new Error('Birthday must be a date in the past');
            err.statusCode = 400;
            throw err;
          }
          profile.birthday = d;
        } else {
          profile.birthday = null;
        }
        continue;
      }

      if (typeof val === 'string') {
        profile[field] = val.trim();
      }
    }
  }

  // Recalculate completion
  const completion = calculateCompletion(profile.toObject(), user ? user.toObject() : {});
  profile.completionPercent = completion.percent;
  await profile.save();

  return { profile, completion };
}

/**
 * Get IDs of all members belonging to teams led by the given T3 executive.
 */
async function getLedTeamMemberIds(t3UserId) {
  const teams = await Team.find({ leadId: t3UserId }).select('members');
  const memberSet = new Set();
  teams.forEach((t) => {
    (t.members || []).forEach((m) => memberSet.add(m.toString()));
  });
  return Array.from(memberSet);
}

/**
 * Change a user's tier (T1, T2, T3) with authorization check and audit logging.
 */
async function changeUserTier(caller, targetUserId, newTier, reason = '') {
  const targetUser = await User.findById(targetUserId);
  if (!targetUser) {
    const err = new Error('Target user not found');
    err.statusCode = 404;
    throw err;
  }

  const authCheck = canChangeTier(caller, targetUser, newTier);
  if (!authCheck.allowed) {
    const err = new Error(authCheck.reason || 'Forbidden');
    err.statusCode = authCheck.statusCode || 403;
    throw err;
  }

  const oldTier = targetUser.tier || 'T1';
  targetUser.tier = newTier;
  await targetUser.save();

  // Invalidate permissions and disconnect active sockets to enforce immediate effect
  disconnectUserSockets(targetUser._id);
  invalidateUserPermissions(targetUser._id).catch(() => {});

  // Record audit log entry
  recordPermissionAudit({
    performedBy: caller._id,
    targetId: targetUser._id,
    targetType: 'User',
    action: 'USER_TIER_CHANGED',
    oldValue: { tier: oldTier },
    newValue: { tier: newTier, reason },
  }).catch(() => {});

  return {
    userId: targetUser._id,
    name: targetUser.name,
    email: targetUser.email,
    oldTier,
    newTier,
    updatedAt: new Date(),
  };
}

/**
 * Calculate user progress metrics from real system activity.
 */
async function getUserProgress(userId) {
  let attendanceRatio = 0;
  let eventsRatio = 0;
  let teamParticipationRatio = 0;
  let certificatesCount = 0;
  let averageRating = 0;

  try {
    const Attendance = require('../attendance/attendance.model');
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const attendedCount = await Attendance.countDocuments({
      studentId: userId,
      status: 'PRESENT',
      createdAt: { $gte: ninetyDaysAgo },
    });
    // Target: 20 attendances in 90 days = 100%
    attendanceRatio = Math.min(1, attendedCount / 20);
  } catch {}

  try {
    const Event = require('../events/events.model');
    const memberEventsCount = await Event.countDocuments({
      'members.userId': userId,
    });
    // Target: 5 events = 100%
    eventsRatio = Math.min(1, memberEventsCount / 5);
  } catch {}

  try {
    const teamsCount = await Team.countDocuments({
      $or: [{ members: userId }, { leadId: userId }],
    });
    // 1 active team = 100%
    teamParticipationRatio = teamsCount > 0 ? 1 : 0;
  } catch {}

  try {
    const Certificate = require('../certificates/certificates.model');
    certificatesCount = await Certificate.countDocuments({ studentId: userId });
  } catch {}

  try {
    const Review = require('../reviews/reviews.model');
    const reviews = await Review.find({ studentId: userId }).select('rating');
    if (reviews.length > 0) {
      const sum = reviews.reduce((acc, r) => acc + (r.rating || 0), 0);
      averageRating = sum / reviews.length;
    }
  } catch {}

  return calculateProgressScore({
    attendanceRatio,
    eventsRatio,
    teamParticipationRatio,
    certificatesCount,
    averageRating,
  });
}

module.exports = {
  getOrCreateProfile,
  updateMyProfile,
  getLedTeamMemberIds,
  changeUserTier,
  getUserProgress,
};
