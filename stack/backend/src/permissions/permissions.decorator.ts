import { SetMetadata } from '@nestjs/common';
import type { Permission } from './catalog';

export const REQUIRED_PERMISSIONS = 'required_permissions';

/**
 * The permissions a route needs; the caller must hold all of them. Without this decorator, PermissionsGuard
 * requires admin.access.
 */
export const RequirePermissions = (...keys: Permission[]) => SetMetadata(REQUIRED_PERMISSIONS, keys);
