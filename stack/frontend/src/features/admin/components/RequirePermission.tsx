import type { ReactNode } from 'react';
import { NotFound } from '@/components/NotFound';
import { usePermissions } from '../usePermissions';
import type { PermissionKey } from '../catalog';

/** Renders the page only for users who hold `perm`. Anyone else gets NotFound, as for an unknown address. */
export function RequirePermission({ perm, children }: { perm: PermissionKey; children: ReactNode }) {
  const { can } = usePermissions();
  if (!can(perm)) return <NotFound />;
  return <>{children}</>;
}
