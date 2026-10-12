import { PRIVILEGED_ROLES } from '@tbi/shared-constants';
import { AuthorizationError } from '../errors/typedErrors.js';

/**
 * Red-Zone File: Mandatory MFA Middleware
 * Enforces TOTP verification for ADMIN and SUPER_ADMIN roles.
 */
export function requireMfa(req, res, next) {
  if (!req.user) {
    return next(new AuthorizationError('Authentication required'));
  }

  const isPrivileged = PRIVILEGED_ROLES.includes(req.user.role);

  if (isPrivileged && !req.user.isMfaVerified) {
    return next(new AuthorizationError('MFA verification required for privileged operations'));
  }

  next();
}
