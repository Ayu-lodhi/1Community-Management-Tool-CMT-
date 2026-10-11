import { AuthorizationError } from '../errors/typedErrors.js';
import { ROLE_DEFAULT_PERMISSIONS } from '@tbi/shared-constants';
import { getCachedPermissions, setCachedPermissions } from '../cache/permissionCache.js';

/**
 * Red-Zone File: Granular Permission-Based RBAC Middleware
 * Evaluates role defaults + per-user ACCESS_GRANT overrides.
 * Caches resolved permissions in Redis with immediate invalidation on change.
 *
 * @param {string|string[]} requiredPermissions - Single permission or array of permissions (requires all)
 */
export function requirePermissions(requiredPermissions) {
  const permissionsList = Array.isArray(requiredPermissions)
    ? requiredPermissions
    : [requiredPermissions];

  return async (req, res, next) => {
    if (!req.user) {
      return next(new AuthorizationError('Unauthenticated access attempt'));
    }

    const userId = req.user.sub || req.user._id?.toString();
    const { role, customGrants = [] } = req.user;

    let effectivePermissions;
    if (userId) {
      const cached = await getCachedPermissions(userId);
      if (cached && Array.isArray(cached)) {
        effectivePermissions = new Set(cached);
      }
    }

    if (!effectivePermissions) {
      // Resolve default permissions for role
      const defaultPerms = ROLE_DEFAULT_PERMISSIONS[role] || [];

      // Effective permissions = default permissions + explicit ACCESS_GRANT overrides
      effectivePermissions = new Set([...defaultPerms, ...customGrants]);

      // Cache resolved permissions in Redis with 5-minute TTL
      if (userId) {
        setCachedPermissions(userId, effectivePermissions).catch(() => {});
      }
    }

    const hasAllRequired = permissionsList.every((perm) => effectivePermissions.has(perm));

    if (!hasAllRequired) {
      return next(
        new AuthorizationError(
          `Forbidden: missing required permission (${permissionsList.filter((p) => !effectivePermissions.has(p)).join(', ')})`
        )
      );
    }

    next();
  };
}
