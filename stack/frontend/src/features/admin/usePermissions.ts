import { useCallback, useMemo } from 'react';
import { useAuth } from '@/features/auth/useAuth';
import type { PermissionKey } from './catalog';

/**
 * The signed-in user's permissions. `can` follows the server's guard: any permission counts as
 * admin.access, and every other key must be held by name.
 */
export function usePermissions() {
  const { user } = useAuth();
  const held = useMemo<ReadonlySet<string>>(() => new Set(user?.permissions ?? []), [user]);
  const can = useCallback(
    (p: PermissionKey) => (p === 'admin.access' ? held.size > 0 : held.has(p)),
    [held],
  );
  return { held, can, hasAny: held.size > 0 };
}
