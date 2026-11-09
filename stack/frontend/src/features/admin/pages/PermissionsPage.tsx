import { Fragment, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/Button';
import { cn } from '@/components/cn';
import { adminApi } from '@/lib/api';
import type { AdminGroup } from '@/lib/api/types';
import { Notice } from '../components/Notice';
import { PermissionCell } from '../components/PermissionCell';
import { Tip } from '../components/Tip';
import { useToast } from '../components/useToast';
import { ALL_PERMISSIONS, descKey, type PermissionKey } from '../catalog';
import { errorText } from '../errors';
import { cellReasonText } from '../reasonText';
import { cellState, closeOver, diffCount, permissionsByArea, sortedKeys, withToggled } from '../permissionModel';
import { usePermissions } from '../usePermissions';

type Draft = Set<PermissionKey>;

/**
 * The full matrix: groups across, permissions down, grouped by area. Each group's changes are kept
 * until saved. Saving sends one PUT per changed group, and a failed group keeps its changes and its
 * error, so one failure doesn't lose the others.
 */
export default function PermissionsPage() {
  const { t } = useTranslation();
  const { held, can } = usePermissions();
  const qc = useQueryClient();
  const toast = useToast();
  const [edits, setEdits] = useState<Record<number, Draft>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  const groupsQuery = useQuery({
    queryKey: ['admin', 'groups', 'all'],
    queryFn: ({ signal }) => adminApi.allGroups(signal),
  });

  if (groupsQuery.isError) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-[1.6rem] font-semibold text-text">{t('admin:permissions.title')}</h1>
        <Notice>{t('admin:errors.load')}</Notice>
      </div>
    );
  }
  if (groupsQuery.isPending) return <p className="text-sub">{t('common:loading')}</p>;

  const groups = groupsQuery.data;
  const canEdit = can('groups.manage');
  const saved = (g: AdminGroup) => closeOver(g.permissions);
  const draftOf = (g: AdminGroup): Draft => edits[g.id] ?? saved(g);
  const changedIn = (g: AdminGroup) => diffCount(saved(g), draftOf(g));
  const dirtyGroups = groups.filter((g) => changedIn(g) > 0);
  const total = dirtyGroups.reduce((sum, g) => sum + changedIn(g), 0);

  function toggle(g: AdminGroup, key: PermissionKey, on: boolean) {
    setEdits((prev) => ({ ...prev, [g.id]: withToggled(prev[g.id] ?? saved(g), key, on) }));
    setErrors((prev) => omit(prev, g.id));
  }

  function discard() {
    setEdits({});
    setErrors({});
  }

  async function save() {
    setSaving(true);
    const targets = dirtyGroups;
    const outcomes = await Promise.allSettled(
      targets.map((g) => adminApi.setGroupPermissions(g.id, sortedKeys(draftOf(g)))),
    );
    const nextEdits: Record<number, Draft> = { ...edits };
    const nextErrors: Record<number, string> = {};
    outcomes.forEach((outcome, i) => {
      const g = targets[i];
      if (!g) return;
      if (outcome.status === 'fulfilled') {
        delete nextEdits[g.id];
        const confirmed = outcome.value.permissions;
        qc.setQueryData<AdminGroup[]>(['admin', 'groups', 'all'], (list) =>
          list?.map((x) => (x.id === g.id ? { ...x, permissions: confirmed } : x)),
        );
      } else {
        nextErrors[g.id] = errorText(outcome.reason, t);
      }
    });
    setEdits(nextEdits);
    setErrors(nextErrors);
    setSaving(false);
    void qc.invalidateQueries({ queryKey: ['admin', 'groups'] });
    if (Object.keys(nextErrors).length === 0) toast(t('admin:permissions.saved'));
  }

  const areas = permissionsByArea(ALL_PERMISSIONS);
  const columnCount = groups.length + 1;

  return (
    <div className="flex flex-col gap-6 pb-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-[1.6rem] font-semibold text-text">{t('admin:permissions.title')}</h1>
        <p className="text-[0.95rem] text-sub">{canEdit ? t('admin:permissions.intro') : t('admin:permissions.readOnly')}</p>
      </div>

      {Object.keys(errors).length > 0 && (
        <ul role="alert" className="flex flex-col gap-1">
          {groups
            .filter((g) => errors[g.id])
            .map((g) => (
              <li key={g.id} className="text-error">
                {t('admin:permissions.groupError', { group: g.name, message: errors[g.id] ?? '' })}
              </li>
            ))}
        </ul>
      )}

      <div className="max-h-[70vh] overflow-auto rounded-[10px] bg-surface">
        <table className="w-full border-separate border-spacing-0 text-left">
          <caption className="sr-only">{t('admin:permissions.title')}</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 top-0 z-20 min-w-[16rem] border-b border-bg bg-surface px-4 py-3 font-normal text-sub">
                {t('admin:permissions.permission')}
              </th>
              {groups.map((g) => (
                <th key={g.id} scope="col" className="sticky top-0 z-10 border-b border-bg bg-surface px-2 py-3 text-center font-normal text-text">
                  <Link to={`/admin/groups/${g.id}`} className="whitespace-nowrap text-text underline-offset-4 hover:underline">
                    {g.name}
                  </Link>
                  {g.system && <span className="block text-[0.8rem] text-sub">{t('admin:groups.system')}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {areas.map(({ area, keys }) => (
              <Fragment key={area}>
                <tr>
                  <th
                    scope="rowgroup"
                    colSpan={columnCount}
                    className="sticky left-0 border-b border-bg bg-bg px-4 pb-1.5 pt-5 text-left text-[0.9rem] font-medium text-main"
                  >
                    {t(`admin:perm.areas.${area}`)}
                  </th>
                </tr>
                {keys.map((key) => {
                  const desc = t(`admin:perm.desc.${descKey(key)}`);
                  return (
                    <tr key={key} className="group">
                      <th scope="row" className="sticky left-0 z-[5] border-b border-bg bg-surface px-4 py-1.5 text-left font-normal">
                        <span className="block text-text">{desc}</span>
                        <code className="text-[0.8rem] text-sub">{key}</code>
                      </th>
                      {groups.map((g) => {
                        const draft = draftOf(g);
                        const state = cellState({ draft, held, system: g.system, key });
                        const reason = state.reason ? cellReasonText(state.reason, t) : null;
                        const dirty = (draft.has(key)) !== saved(g).has(key);
                        return (
                          <td
                            key={g.id}
                            className={cn(
                              'border-b border-bg p-0 text-center transition-colors group-hover:bg-bg/40',
                              dirty && 'outline outline-2 -outline-offset-2 outline-caret',
                            )}
                          >
                            <PermissionCell
                              state={state}
                              label={t('admin:permissions.cellLabel', { group: g.name, permission: desc })}
                              reason={reason}
                              onToggle={(on) => canEdit && toggle(g, key, on)}
                              className="justify-center p-2 min-w-[3rem]"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {total > 0 && (
        <div className="sticky bottom-0 z-30 flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-surface p-3 md:px-5">
          <span className="text-[0.95rem] text-text" aria-live="polite">
            {t('admin:permissions.unsaved', { count: total })}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" disabled={saving} onClick={discard}>
              {t('admin:actions.discard')}
            </Button>
            <Tip reason={canEdit ? null : t('admin:perm.noPermission')}>
              <Button disabled={saving || !canEdit} onClick={() => void save()}>
                {saving ? t('admin:actions.working') : t('admin:permissions.save', { n: total })}
              </Button>
            </Tip>
          </div>
        </div>
      )}
    </div>
  );
}

function omit<V>(record: Record<number, V>, key: number): Record<number, V> {
  const next = { ...record };
  delete next[key];
  return next;
}
