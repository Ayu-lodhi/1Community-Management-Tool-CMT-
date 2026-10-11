/**
 * Single source of truth for platform roles.
 * Never hardcode these strings in business logic.
 */
export const ROLES = Object.freeze({
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  T3_EXECUTIVE: 'T3_EXECUTIVE',
  T2_ASSOCIATE: 'T2_ASSOCIATE',
  T1_VOLUNTEER: 'T1_VOLUNTEER'
});

export const ALL_ROLES = Object.freeze(Object.values(ROLES));

export const PRIVILEGED_ROLES = Object.freeze([
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN
]);
