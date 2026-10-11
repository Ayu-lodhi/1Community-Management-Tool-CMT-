import { ROLES } from './roles.js';

/**
 * Display-label mappings ONLY.
 * WARNING: Never use tiers for auth, routing, or RBAC decisions.
 * The single source of truth for authorization is the ROLES and PERMISSIONS system.
 */
export const TIER_DISPLAY_LABELS = Object.freeze({
  [ROLES.SUPER_ADMIN]: 'Super Administrator',
  [ROLES.ADMIN]: 'Platform Administrator',
  [ROLES.T3_EXECUTIVE]: 'Tier 3 - Executive Team Lead',
  [ROLES.T2_ASSOCIATE]: 'Tier 2 - Associate Coordinator',
  [ROLES.T1_VOLUNTEER]: 'Tier 1 - Event Volunteer'
});

export const TIER_BADGES = Object.freeze({
  [ROLES.SUPER_ADMIN]: { label: 'Super Admin', color: 'purple' },
  [ROLES.ADMIN]: { label: 'Admin', color: 'blue' },
  [ROLES.T3_EXECUTIVE]: { label: 'T3 Executive', color: 'emerald' },
  [ROLES.T2_ASSOCIATE]: { label: 'T2 Associate', color: 'amber' },
  [ROLES.T1_VOLUNTEER]: { label: 'T1 Volunteer', color: 'sky' }
});
