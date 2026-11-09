import { useTranslation } from 'react-i18next';
import { descKey } from '../catalog';

/** A permission key with its description as the tooltip. */
export function PermissionBadge({ permission }: { permission: string }) {
  const { t } = useTranslation();
  const description = t(`admin:perm.desc.${descKey(permission)}`, { defaultValue: permission });
  return (
    <code title={description} className="inline-block rounded-[6px] bg-surface px-2 py-0.5 text-[0.85rem] text-text">
      {permission}
    </code>
  );
}
