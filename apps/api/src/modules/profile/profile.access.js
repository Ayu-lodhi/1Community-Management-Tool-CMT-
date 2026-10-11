// apps/api/src/modules/profile/profile.access.js
// Central authorization logic and field-level privacy for profile operations.

const ALLOWED_TIERS = ['T1', 'T2', 'T3'];

/**
 * Determine if caller is allowed to view targetUser's profile.
 *
 * @param {Object} caller - authenticated user object (from req.user)
 * @param {Object} targetUser - target user document/object
 * @param {Array<string>} [t3MemberIds=[]] - array of user IDs belonging to teams led by caller (if T3)
 * @returns {{ allowed: boolean, scope: 'owner'|'admin'|'t3_team'|null, reason?: string }}
 */
function canViewProfile(caller, targetUser, t3MemberIds = []) {
  if (!caller || !targetUser) {
    return { allowed: false, scope: null, reason: 'Unauthenticated or user not found' };
  }

  const callerId = caller._id ? caller._id.toString() : caller.id?.toString();
  const targetId = targetUser._id ? targetUser._id.toString() : targetUser.id?.toString();

  // 1. Owner can always view full profile
  if (callerId === targetId) {
    return { allowed: true, scope: 'owner' };
  }

  // 2. Super Admin & Admin can view any profile
  if (caller.role === 'SUPER_ADMIN' || caller.role === 'ADMIN') {
    return { allowed: true, scope: 'admin' };
  }

  // 3. T3 Executive can view only members of teams they lead
  if (caller.role === 'T3_EXECUTIVE') {
    const isMember = t3MemberIds.some((id) => id.toString() === targetId);
    if (isMember) {
      return { allowed: true, scope: 't3_team' };
    }
    return { allowed: false, scope: null, reason: 'T3 executives can only view members of their own teams' };
  }

  // 4. Normal users (STUDENT, EMPLOYEE, T1, T2) can only view themselves
  return { allowed: false, scope: null, reason: 'Access denied: users may only view their own profile' };
}

/**
 * Sanitize profile data based on viewer scope.
 * - 'owner' and 'admin': full profile details including private contact info.
 * - 't3_team': work/education fields only; phone/mobile, birthday, and email are redacted.
 *
 * @param {Object} profile - raw profile data
 * @param {string} scope - viewer scope ('owner'|'admin'|'t3_team')
 * @returns {Object} sanitized profile
 */
function sanitizeProfileForViewer(profile, scope) {
  if (!profile) return null;
  const data = typeof profile.toObject === 'function' ? profile.toObject() : { ...profile };

  if (scope === 'owner' || scope === 'admin') {
    return data;
  }

  if (scope === 't3_team') {
    // Redact sensitive personal data for team view per PROFILE_AUTH_MATRIX
    delete data.mobile;
    delete data.birthday;
    delete data.email;
    delete data.mobileVerified;
    delete data.emailVerified;
    delete data.gender;
    delete data.completionPercent;
    delete data.completionMissing;
    return data;
  }

  return null;
}

/**
 * Check if caller has permission to change a user's tier.
 *
 * @param {Object} caller - authenticated admin user
 * @param {Object} targetUser - target user to promote/change tier
 * @param {string} newTier - requested tier ('T1', 'T2', 'T3')
 * @returns {{ allowed: boolean, statusCode: number, reason?: string }}
 */
function canChangeTier(caller, targetUser, newTier) {
  if (!caller || !targetUser) {
    return { allowed: false, statusCode: 401, reason: 'Authentication required' };
  }

  // Caller must be Admin or Super Admin
  if (caller.role !== 'ADMIN' && caller.role !== 'SUPER_ADMIN') {
    return { allowed: false, statusCode: 403, reason: 'Only administrators can change user tiers' };
  }

  // Validate tier value
  if (!newTier || typeof newTier !== 'string' || !ALLOWED_TIERS.includes(newTier.trim().toUpperCase())) {
    return { allowed: false, statusCode: 400, reason: `Invalid tier. Allowed tiers: ${ALLOWED_TIERS.join(', ')}` };
  }

  const callerId = caller._id ? caller._id.toString() : caller.id?.toString();
  const targetId = targetUser._id ? targetUser._id.toString() : targetUser.id?.toString();

  // Caller cannot change their own tier
  if (callerId === targetId) {
    return { allowed: false, statusCode: 403, reason: 'Administrators cannot modify their own tier' };
  }

  // Super Admin can change tier for any user
  if (caller.role === 'SUPER_ADMIN') {
    return { allowed: true, statusCode: 200 };
  }

  // Admin rules:
  // Cannot modify Super Admin
  if (targetUser.role === 'SUPER_ADMIN') {
    return { allowed: false, statusCode: 403, reason: 'Admins cannot modify Super Admin tiers' };
  }

  // Cannot modify another Admin
  if (targetUser.role === 'ADMIN') {
    return { allowed: false, statusCode: 403, reason: 'Admins cannot modify other Admins' };
  }

  return { allowed: true, statusCode: 200 };
}

module.exports = {
  ALLOWED_TIERS,
  canViewProfile,
  sanitizeProfileForViewer,
  canChangeTier,
};
