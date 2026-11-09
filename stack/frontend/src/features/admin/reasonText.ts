import type { CellReason, MembershipReason } from './permissionModel';

type T = (key: string, options?: Record<string, unknown>) => string;

/** The sentence that explains why a permission cell is locked, for its tooltip and screen readers. */
export function cellReasonText(reason: CellReason, t: T): string {
  switch (reason.kind) {
    case 'system':
      return t('admin:perm.system');
    case 'noPermission':
      return t('admin:perm.noPermission');
    case 'includedBy':
      return t('admin:perm.includedBy', { permission: reason.by });
  }
}

/** The sentence that explains why a user's group membership is locked. */
export function membershipReasonText(reason: MembershipReason, t: T): string {
  switch (reason.kind) {
    case 'noPermission':
      return t('admin:perm.noPermission');
    case 'cannotGrant':
      return t('admin:perm.cannotGrant');
    case 'cannotActOn':
      return t('admin:perm.cannotActOn');
    case 'suspended':
      return t('admin:perm.suspended');
    case 'lastAdmin':
      return t('admin:perm.lastAdmin');
  }
}
