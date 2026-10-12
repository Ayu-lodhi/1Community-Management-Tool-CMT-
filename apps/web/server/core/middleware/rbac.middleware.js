import { AuthorizationError } from '../errors/typedErrors.js';
import { ROLE_DEFAULT_PERMISSIONS } from '@tbi/shared-constants';

/**
 * Red-Zone File: Granular Permission-Based RBAC Middleware
 * Evaluates role defaults + per-user ACCESS_GRANT overrides.
 *
 * @param {string|string[]} requiredPermissions - Single permission or array of permissions (requires all)
 */
export function requirePermissions(requiredPermissions) {
  const permissionsList = Array.isArray(requiredPermissions)
    ? requiredPermissions
    : [requiredPermissions];

  return (req, res, next) => {
    if (!req.user) {
      return next(new AuthorizationError('Unauthenticated access attempt'));
    }

    const { role, customGrants = [] } = req.user;

    // Resolve default permissions for role
    const defaultPerms = ROLE_DEFAULT_PERMISSIONS[role] || [];

    // Effective permissions = default permissions + explicit ACCESS_GRANT overrides
    const effectivePermissions = new Set([...defaultPerms, ...customGrants]);

    const hasAllRequired = permissionsList.every((perm) => effectivePermissions.has(perm));

    if (!hasAllRequired) {
      return next(
        new AuthorizationError(
          `Forbidden: missing required permission (${permissionsList.filter(p => !effectivePermissions.has(p)).join(', ')})`
        )
      );
    }

    next();
  };
}
