/**
 * Shared Type Definitions (JSDoc format for JS/ESM environment)
 *
 * @typedef {Object} UserSession
 * @property {string} userId
 * @property {string} email
 * @property {string} role
 * @property {string[]} permissions
 * @property {boolean} isMfaVerified
 * @property {boolean} isPasswordChangeRequired
 *
 * @typedef {Object} UserMfa (server only; excluded from user responses)
 * @property {string} secret AES-256-GCM encrypted TOTP secret
 * @property {string} version Random enrollment identifier
 * @property {number} lastStep Last consumed TOTP time step
 * @property {number} attempts Attempts in the current five-minute window
 * @property {Date} windowStartedAt
 *
 * @typedef {Object} UserPasswordState
 * @property {boolean} mustChangePassword
 * @property {Date|null} passwordChangeStartedAt Server only; first temporary login, null before use
 *
 * @typedef {Object} AccessGrant
 * @property {string} permission
 * @property {string} grantedBy
 * @property {Date} grantedAt
 * @property {string} [reason]
 *
 * @typedef {Object} EventShift
 * @property {string} id
 * @property {string} title
 * @property {Date} startTime
 * @property {Date} endTime
 * @property {number} capacity
 * @property {number} filledSlots
 *
 * @typedef {Object} ApplicationOwnership
 * @property {string} teamId Required Team ObjectId for new applications; may be absent on legacy records
 */

export const TypeEnums = Object.freeze({
  CERTIFICATE_TYPES: ['PARTICIPATION', 'EXCELLENCE', 'LEADERSHIP'],
  APPLICATION_STATUS: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'],
  ATTENDANCE_STATUS: ['ABSENT', 'CHECKED_IN', 'EXCUSED'],
  EVENT_STATUS: ['DRAFT', 'PUBLISHED', 'ACTIVE', 'COMPLETED', 'ARCHIVED']
});
