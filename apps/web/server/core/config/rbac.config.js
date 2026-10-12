import { ROLE_DEFAULT_PERMISSIONS, PERMISSIONS } from '@tbi/shared-constants';

export const rbacConfig = Object.freeze({
  defaultGrants: ROLE_DEFAULT_PERMISSIONS,
  allPermissions: PERMISSIONS
});
