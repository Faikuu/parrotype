import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '@/components/Button';
import { cn } from '@/components/cn';
import { formatNumber } from '@/features/account/format';
import { adminApi } from '@/lib/api';
import type { AdminGroupDetail, AdminUserRow, GroupMember } from '@/lib/api/types';
import { ActionConfirm } from '../components/ActionConfirm';
import { Notice } from '../components/Notice';
import { PermissionCell } from '../components/PermissionCell';
import { SearchInput } from '../components/SearchInput';
import { Tip } from '../components/Tip';
import { TextInput } from '../components/TextInput';
import { useToast } from '../components/useToast';
import { ALL_PERMISSIONS, descKey, type PermissionKey } from '../catalog';
import { errorText } from '../errors';
import { cellReasonText, membershipReasonText } from '../reasonText';
import { cellState, closeOver, diffCount, membershipBlock, permissionsByArea, sortedKeys, withToggled, type MembershipReason } from '../permissionModel';
import { usePermissions } from '../usePermissions';

const NAME_MIN = 2;
const NAME_MAX = 40;
const DESCRIPTION_MAX = 200;
const MEMBER_CAP = 100;

export default function GroupDetailPage() {
  const { t } = useTranslation();
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { can, held } = usePermissions();

  const query = useQuery({
    queryKey: ['admin', 'group', id],
    queryFn: ({ signal }) => adminApi.group(id, signal),
    enabled: Number.isInteger(id) && id > 0,
  });

  if (query.isError) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <Notice>{t('admin:errors.load')}</Notice>
      </div>
    );
  }
  if (query.isPending) return <p className="text-sub">{t('common:loading')}</p>;

  const group = query.data;
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin'] });
  const canManage = can('groups.manage');
  const manageReason = canManage ? null : t('admin:perm.noPermission');

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <BackLink />
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-[1.6rem] font-semibold text-text">{group.name}</h1>
          {group.system && <span className="text-[0.95rem] text-sub">{t('admin:groups.system')}</span>}
        </div>
        <p className="text-[0.95rem] text-sub">
          {t('admin:groupDetail.summary', { count: group.memberCount })}
        </p>
      </div>

      <Section title={t('admin:groupDetail.details')}>
        <DetailsForm key={`${group.id}-${group.name}-${group.description}`} group={group} disabledReason={manageReason} onDone={refresh} />
      </Section>

      <Section title={t('admin:groupDetail.permissions')} hint={group.system ? t('admin:groupDetail.systemNote') : t('admin:groupDetail.permissionsHint')}>
        <PermissionEditor
          key={`${group.id}-${group.permissions.join(',')}`}
          group={group}
          held={held}
          canManage={canManage}
          onDone={refresh}
        />
      </Section>

      <Section title={t('admin:groupDetail.members')}>
        <MembersPanel group={group} held={held} canGrant={can('users.groups')} onDone={refresh} />
      </Section>

      <Section title={t('admin:groupDetail.delete.title')}>
        <div className="flex flex-col gap-2">
          <p className="text-[0.95rem] text-sub">{t('admin:groupDetail.delete.body')}</p>
          <div>
            <ActionConfirm
              label={t('admin:groupDetail.delete.label')}
              title={t('admin:groupDetail.delete.dialogTitle', { name: group.name })}
              body={t('admin:groupDetail.delete.dialogBody')}
              confirmLabel={t('admin:groupDetail.delete.confirm')}
              danger
              disabledReason={group.system ? t('admin:groupDetail.delete.system') : manageReason}
              run={() => adminApi.deleteGroup(group.id)}
              onDone={() => {
                void qc.invalidateQueries({ queryKey: ['admin', 'groups'] });
                navigate('/admin/groups');
              }}
              done={t('admin:toast.groupDeleted')}
            />
          </div>
        </div>
      </Section>
    </div>
  );
}

function BackLink() {
  const { t } = useTranslation();
  return (
    <Link to="/admin/groups" className="w-fit text-[0.95rem] text-sub hover:text-text">
      ← {t('admin:groupDetail.back')}
    </Link>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-[10px] bg-surface p-4 md:p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-[1.05rem] font-medium text-text">{title}</h2>
        {hint && <p className="text-[0.9rem] text-sub">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** Name and description. The system group's name is fixed. */
function DetailsForm({ group, disabledReason, onDone }: { group: AdminGroupDetail; disabledReason: string | null; onDone: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description);
  const trimmed = name.trim();
  const valid = trimmed.length >= NAME_MIN && trimmed.length <= NAME_MAX;
  const dirty = trimmed !== group.name || description.trim() !== group.description;
  const nameLocked = group.system;

  const mutation = useMutation({
    mutationFn: () =>
      adminApi.updateGroup(group.id, {
        ...(nameLocked ? {} : { name: trimmed }),
        description: description.trim(),
      }),
    onSuccess: () => {
      toast(t('admin:toast.groupSaved'));
      onDone();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!dirty || !valid || disabledReason || mutation.isPending) return;
    mutation.mutate();
  }

  const nameReason = disabledReason ?? (nameLocked ? t('admin:groupDetail.nameLocked') : null);
  const error = mutation.error ? errorText(mutation.error, t) : null;

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className={cn(nameReason && 'opacity-80')} title={nameReason ?? undefined}>
          <TextInput id="group-detail-name" label={t('admin:groups.form.name')} hint={t('admin:groups.form.nameHint', { min: NAME_MIN, max: NAME_MAX })} value={name} onChange={setName} />
          {nameLocked && <p className="mt-1 text-[0.85rem] text-sub">{t('admin:groupDetail.nameLocked')}</p>}
        </div>
        <TextInput id="group-detail-description" label={t('admin:groups.form.description')} hint={t('admin:groups.form.descriptionHint', { max: DESCRIPTION_MAX })} value={description} onChange={setDescription} maxLength={DESCRIPTION_MAX} />
      </div>
      {error && <Notice>{error}</Notice>}
      <div className="flex justify-end">
        <Tip reason={disabledReason}>
          <Button type="submit" disabled={!dirty || !valid || disabledReason !== null || mutation.isPending}>
            {mutation.isPending ? t('admin:actions.working') : t('admin:groupDetail.saveDetails')}
          </Button>
        </Tip>
      </div>
    </form>
  );
}

/** The group's permissions as checkboxes, with the same rules as the matrix. */
function PermissionEditor({ group, held, canManage, onDone }: { group: AdminGroupDetail; held: ReadonlySet<string>; canManage: boolean; onDone: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const saved = closeOver(group.permissions);
  const [draft, setDraft] = useState<Set<PermissionKey>>(() => new Set(saved));
  const changed = diffCount(saved, draft);

  const mutation = useMutation({
    mutationFn: () => adminApi.setGroupPermissions(group.id, sortedKeys(draft)),
    onSuccess: () => {
      toast(t('admin:toast.permissionsSaved'));
      onDone();
    },
  });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (changed > 0 && !mutation.isPending && canManage && !group.system) mutation.mutate();
      }}
    >
      {permissionsByArea(ALL_PERMISSIONS).map(({ area, keys }) => (
        <div key={area} className="flex flex-col gap-1">
          <h3 className="text-[0.9rem] font-medium text-main">{t(`admin:perm.areas.${area}`)}</h3>
          <ul className="flex flex-col">
            {keys.map((key) => {
              const desc = t(`admin:perm.desc.${descKey(key)}`);
              const state = cellState({ draft, held, system: group.system, key });
              const reason = state.reason ? cellReasonText(state.reason, t) : null;
              return (
                <li key={key}>
                  <PermissionCell
                    state={state}
                    label={desc}
                    reason={reason}
                    className="items-start gap-2 py-1.5 pr-2"
                    onToggle={(on) => setDraft((prev) => withToggled(prev, key, on))}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="text-[0.95rem] text-text">{desc}</span>
                      <code className="text-[0.8rem] text-sub">{key}</code>
                    </span>
                  </PermissionCell>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {mutation.error && <Notice>{errorText(mutation.error, t)}</Notice>}
      {!group.system && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {changed > 0 && (
            <Button variant="ghost" disabled={mutation.isPending} onClick={() => setDraft(new Set(saved))}>
              {t('admin:actions.discard')}
            </Button>
          )}
          <Tip reason={canManage ? null : t('admin:perm.noPermission')}>
            <Button type="submit" disabled={changed === 0 || mutation.isPending || !canManage}>
              {mutation.isPending ? t('admin:actions.working') : t('admin:groupDetail.savePermissions', { n: changed })}
            </Button>
          </Tip>
        </div>
      )}
    </form>
  );
}

function MembersPanel({ group, held, canGrant, onDone }: { group: AdminGroupDetail; held: ReadonlySet<string>; canGrant: boolean; onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const { can } = usePermissions();
  const [q, setQ] = useState('');
  const search = useQuery({
    queryKey: ['admin', 'userSearch', q],
    queryFn: ({ signal }) => adminApi.users({ q, pageSize: 10 }, signal),
    enabled: q.length > 0 && can('users.read'),
  });
  const memberIds = new Set(group.members.map((m) => m.id));
  const groupRef = { system: group.system, permissions: group.permissions, memberCount: group.memberCount };
  const grantBlock = canGrant ? null : t('admin:perm.noPermission');

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <h3 className="text-[0.95rem] text-text">{t('admin:groupDetail.addMember')}</h3>
        {can('users.read') ? (
          <>
            <SearchInput value={q} onCommit={setQ} label={t('admin:groupDetail.searchUsers')} placeholder={t('admin:groupDetail.searchPlaceholder')} />
            {q && search.data && (
              <ul className="flex flex-col divide-y divide-bg rounded-[6px] bg-bg">
                {search.data.items.length === 0 && <li className="px-3 py-2 text-sub">{t('admin:groupDetail.noMatches')}</li>}
                {search.data.items.map((u: AdminUserRow) => {
                  const isMember = memberIds.has(u.id);
                  const block: MembershipReason | null = isMember
                    ? null
                    : membershipBlock({ held, group: groupRef, isMember: false, target: { targetPerms: [], banned: u.bannedAt !== null } });
                  const reason = isMember
                    ? t('admin:groupDetail.alreadyMember')
                    : grantBlock ?? (block ? membershipReasonText(block, t) : null);
                  return (
                    <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <span className="text-text">{u.name}</span>
                      <AddMemberButton groupId={group.id} user={u} disabledReason={reason} onDone={onDone} />
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        ) : (
          <p className="text-[0.9rem] text-sub">{t('admin:groupDetail.searchNoRead')}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-[0.95rem] text-text">
          {t('admin:groupDetail.memberList', { n: formatNumber(group.memberCount, lang) })}
        </h3>
        {group.memberCount > MEMBER_CAP && (
          <p className="text-[0.85rem] text-sub">{t('admin:groupDetail.capped', { n: MEMBER_CAP })}</p>
        )}
        {group.members.length === 0 ? (
          <p className="text-sub">{t('admin:groupDetail.noMembers')}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-bg">
            {group.members.map((m: GroupMember) => (
              <MemberRow
                key={m.id}
                member={m}
                group={group}
                held={held}
                canGrant={canGrant}
                onDone={onDone}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AddMemberButton({ groupId, user, disabledReason, onDone }: { groupId: number; user: AdminUserRow; disabledReason: string | null; onDone: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: () => adminApi.addMember(groupId, user.id),
    onSuccess: () => {
      toast(t('admin:toast.memberAdded'));
      onDone();
    },
  });
  return (
    <div className="flex flex-col items-end gap-1">
      <Tip reason={disabledReason}>
        <Button variant="ghost" className="px-2.5 py-1 text-[0.9rem]" disabled={disabledReason !== null || mutation.isPending} onClick={() => mutation.mutate()}>
          {t('admin:groupDetail.add')}
        </Button>
      </Tip>
      {mutation.error && <Notice>{errorText(mutation.error, t)}</Notice>}
    </div>
  );
}

function MemberRow({ member, group, held, canGrant, onDone }: { member: GroupMember; group: AdminGroupDetail; held: ReadonlySet<string>; canGrant: boolean; onDone: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const groupRef = { system: group.system, permissions: group.permissions, memberCount: group.memberCount };
  const block = membershipBlock({ held, group: groupRef, isMember: true, target: { targetPerms: [], banned: false } });
  const reason = !canGrant ? t('admin:perm.noPermission') : block ? membershipReasonText(block, t) : null;
  const mutation = useMutation({
    mutationFn: () => adminApi.removeMember(group.id, member.id),
    onSuccess: () => {
      toast(t('admin:toast.memberRemoved'));
      onDone();
    },
  });
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <span className="flex flex-wrap items-baseline gap-2">
        <Link to={`/admin/users/${member.id}`} className="text-main underline-offset-4 hover:underline">
          {member.name}
        </Link>
        {member.bannedAt && <span className="text-[0.85rem] text-error">{t('admin:users.status.suspended')}</span>}
      </span>
      <div className="flex flex-col items-end gap-1">
        <Tip reason={reason}>
          <Button variant="ghost" className="px-2.5 py-1 text-[0.9rem]" disabled={reason !== null || mutation.isPending} onClick={() => mutation.mutate()}>
            {t('admin:groupDetail.remove')}
          </Button>
        </Tip>
        {mutation.error && <Notice>{errorText(mutation.error, t)}</Notice>}
      </div>
    </li>
  );
}
