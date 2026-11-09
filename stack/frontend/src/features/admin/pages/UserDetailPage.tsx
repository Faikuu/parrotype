import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '@/components/Button';
import { cn } from '@/components/cn';
import { formatDate, formatDateTime, formatNumber, relativeTime } from '@/features/account/format';
import { languageLabel, modeLabel, optionLabel, type Tr } from '@/features/account/labels';
import { useAuth } from '@/features/auth/useAuth';
import { adminApi } from '@/lib/api';
import type { AdminGroup, AdminResultRow, AdminUserDetail, AdminUserReportRef } from '@/lib/api/types';
import { ActionConfirm } from '../components/ActionConfirm';
import { Notice } from '../components/Notice';
import { SuspendButton } from '../components/SuspendButton';
import { Tip } from '../components/Tip';
import { useToast } from '../components/useToast';
import type { PermissionKey } from '../catalog';
import { errorText } from '../errors';
import { membershipBlock, diffCount, permissionsByArea, type MembershipReason } from '../permissionModel';
import { usePermissions } from '../usePermissions';

const NAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export default function UserDetailPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const { can, held } = usePermissions();
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const detail = useQuery({
    queryKey: ['admin', 'user', id],
    queryFn: ({ signal }) => adminApi.user(id, signal),
    enabled: Number.isInteger(id) && id > 0,
  });
  const groups = useQuery({
    queryKey: ['admin', 'groups', 'all'],
    queryFn: ({ signal }) => adminApi.allGroups(signal),
    enabled: can('groups.read'),
  });

  if (detail.isError) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <Notice>{t('admin:errors.load')}</Notice>
      </div>
    );
  }
  if (detail.isPending) return <p className="text-sub">{t('common:loading')}</p>;

  const u = detail.data;
  const isSelf = me?.id === u.id;
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin'] });
  // The server refuses to act on a user whose permissions aren't all held by the actor.
  // Rank by held permissions: a suspension doesn't lower who may manage this user.
  const outranks = (u.heldPermissions ?? u.effectivePermissions).some((p) => !held.has(p));
  const manageReason = (perm: PermissionKey): string | null => {
    if (!can(perm)) return t('admin:perm.noPermission');
    if (outranks) return t('admin:perm.cannotActOn');
    return null;
  };
  const selfReason = isSelf ? t('admin:perm.self') : null;

  const tr: Tr = (k, o) => String(t(k, o));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <BackLink />
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-[1.6rem] font-semibold text-text">{u.name}</h1>
          {u.bannedAt && <span className="text-error">{t('admin:users.status.suspended')}</span>}
        </div>
        {u.bannedAt && u.banReason && <p className="text-[0.95rem] text-sub">{t('admin:userDetail.banReason', { reason: u.banReason })}</p>}
      </div>

      <dl className="grid grid-cols-2 gap-x-8 gap-y-4 rounded-[10px] bg-surface p-4 md:grid-cols-4 md:p-5">
        <Fact
          label={t('admin:userDetail.email')}
          value={
            <>
              <span className="block break-all">{u.email}</span>
              <span className="block text-[0.85rem] text-sub">
                {u.emailVerified ? t('admin:userDetail.emailVerified') : t('admin:userDetail.emailNotVerified')}
              </span>
            </>
          }
        />
        <Fact label={t('admin:userDetail.joined')} value={formatDate(u.createdAt, lang)} />
        <Fact label={t('admin:userDetail.tests')} value={formatNumber(u.stats.tests, lang)} />
        <Fact label={t('admin:userDetail.bestWpm')} value={u.stats.bestWpm === null ? t('admin:userDetail.none') : formatNumber(u.stats.bestWpm, lang)} />
        <Fact
          label={t('admin:userDetail.lastResult')}
          value={u.stats.lastResultAt ? relativeTime(u.stats.lastResultAt, lang) : t('admin:userDetail.none')}
        />
        <Fact label={t('admin:userDetail.results')} value={formatNumber(u.resultCount, lang)} />
        <Fact
          label={t('admin:userDetail.twoFactor.label')}
          value={u.twoFactorEnabled ? t('admin:userDetail.twoFactor.on') : t('admin:userDetail.twoFactor.off')}
        />
      </dl>

      <Section title={t('admin:userDetail.account')}>
        <RenameForm user={u} disabledReason={manageReason('users.edit')} selfNote={isSelf} onDone={refresh} />
        <div className="flex flex-wrap gap-2">
          <ActionConfirm
            label={t('admin:userDetail.signOut.label')}
            title={t('admin:userDetail.signOut.title', { name: u.name })}
            body={t('admin:userDetail.signOut.body')}
            confirmLabel={t('admin:userDetail.signOut.confirm')}
            disabledReason={manageReason('users.edit')}
            run={() => adminApi.revokeSessions(u.id)}
            onDone={refresh}
            done={t('admin:toast.signedOut')}
          />
          {can('users.security') && (
            <ActionConfirm
              label={t('admin:userDetail.reset2fa.label')}
              title={t('admin:userDetail.reset2fa.title', { name: u.name })}
              body={t('admin:userDetail.reset2fa.body')}
              confirmLabel={t('admin:userDetail.reset2fa.confirm')}
              disabledReason={manageReason('users.security') ?? (u.twoFactorEnabled ? null : t('admin:userDetail.twoFactor.notOn'))}
              run={() => adminApi.reset2fa(u.id)}
              onDone={refresh}
              done={t('admin:toast.twoFactorReset')}
            />
          )}
          {u.bannedAt ? (
            <ActionConfirm
              label={t('admin:userDetail.unsuspend.label')}
              title={t('admin:userDetail.unsuspend.title', { name: u.name })}
              body={t('admin:userDetail.unsuspend.body')}
              confirmLabel={t('admin:userDetail.unsuspend.confirm')}
              disabledReason={manageReason('users.ban') ?? selfReason}
              run={() => adminApi.unban(u.id)}
              onDone={refresh}
              done={t('admin:toast.unsuspended')}
            />
          ) : (
            <SuspendButton userId={u.id} name={u.name} disabledReason={manageReason('users.ban') ?? selfReason} onDone={refresh} />
          )}
          <ActionConfirm
            label={t('admin:userDetail.delete.label')}
            title={t('admin:userDetail.delete.title', { name: u.name })}
            body={t('admin:userDetail.delete.body')}
            confirmLabel={t('admin:userDetail.delete.confirm')}
            requireText={u.name}
            danger
            disabledReason={manageReason('users.delete') ?? selfReason}
            run={() => adminApi.deleteUser(u.id, u.name)}
            onDone={() => void navigateAway()}
            done={t('admin:toast.deleted')}
          />
        </div>
      </Section>

      <Section title={t('admin:userDetail.groups')} hint={t('admin:userDetail.groupsHelp')}>
        {can('groups.read') && groups.data ? (
          <GroupsEditor
            key={u.groups.map((g) => g.id).join(',')}
            user={u}
            groups={groups.data}
            onDone={refresh}
          />
        ) : can('groups.read') ? (
          <p className="text-sub">{t('common:loading')}</p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sub">{t('admin:userDetail.groupsNoRead')}</p>
            <p className="text-text">{u.groups.map((g) => g.name).join(', ') || t('admin:users.noGroups')}</p>
          </div>
        )}
      </Section>

      <Section title={t('admin:userDetail.permissions')}>
        {u.effectivePermissions.length === 0 ? (
          <p className="text-sub">{t('admin:userDetail.noPermissions')}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {permissionsByArea(u.effectivePermissions as PermissionKey[]).map(({ area, keys }) => (
              <div key={area} className="flex flex-col gap-2">
                <h3 className="text-[0.9rem] text-sub">{t(`admin:perm.areas.${area}`)}</h3>
                <ul className="flex flex-wrap gap-1.5">
                  {keys.map((k) => (
                    <li key={k}>
                      <code className="inline-block rounded-[6px] bg-surface px-2 py-0.5 text-[0.85rem] text-text" title={t(`admin:perm.desc.${k.replace('.', '_')}`)}>
                        {k}
                      </code>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={t('admin:userDetail.recentResults')}>
        <RecentResults results={u.recentResults} lang={lang} tr={tr} onDone={refresh} />
      </Section>

      <div className="grid gap-8 md:grid-cols-2">
        <Section title={t('admin:userDetail.reportsReceived')}>
          <ReportList reports={u.reportsReceived} lang={lang} who="reporter" empty={t('admin:userDetail.noReports')} />
        </Section>
        <Section title={t('admin:userDetail.reportsMade')}>
          <ReportList reports={u.reportsMade} lang={lang} who="target" empty={t('admin:userDetail.noReports')} />
        </Section>
      </div>
    </div>
  );

  async function navigateAway() {
    await qc.invalidateQueries({ queryKey: ['admin'] });
    navigate('/admin/users');
  }
}

function BackLink() {
  const { t } = useTranslation();
  return (
    <Link to="/admin/users" className="w-fit text-[0.95rem] text-sub hover:text-text">
      ← {t('admin:userDetail.back')}
    </Link>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.85rem] text-sub">{label}</dt>
      <dd className="tabular mt-0.5 text-text">{value}</dd>
    </div>
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

function RenameForm({ user, disabledReason, selfNote, onDone }: { user: AdminUserDetail; disabledReason: string | null; selfNote: boolean; onDone: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const fieldId = useId();
  const [name, setName] = useState(user.name);
  const trimmed = name.trim();
  const valid = NAME_RE.test(trimmed);
  const mutation = useMutation({
    mutationFn: () => adminApi.renameUser(user.id, trimmed),
    onSuccess: () => {
      toast(t('admin:toast.renamed'));
      onDone();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || trimmed === user.name || mutation.isPending || disabledReason) return;
    mutation.mutate();
  }

  const error = mutation.error ? errorText(mutation.error, t) : !valid && trimmed !== '' && trimmed !== user.name ? t('admin:userDetail.rename.invalid') : null;

  return (
    <form className="flex flex-col gap-2" onSubmit={submit}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={fieldId} className="text-[0.85rem] text-sub">
            {t('admin:userDetail.rename.label')}
          </label>
          <input
            id={fieldId}
            value={name}
            disabled={disabledReason !== null}
            autoComplete="off"
            aria-describedby={`${fieldId}-hint`}
            onChange={(e) => {
              mutation.reset();
              setName(e.target.value);
            }}
            className="h-9 w-56 rounded-[6px] bg-bg px-3 text-[0.95rem] text-text outline-none disabled:opacity-50"
          />
        </div>
        <Tip reason={disabledReason}>
          <Button type="submit" disabled={disabledReason !== null || !valid || trimmed === user.name || mutation.isPending}>
            {t('admin:userDetail.rename.submit')}
          </Button>
        </Tip>
      </div>
      <p id={`${fieldId}-hint`} className="text-[0.85rem] text-sub">
        {selfNote ? t('admin:userDetail.rename.selfHint') : t('admin:userDetail.rename.hint')}
      </p>
      {error && <Notice>{error}</Notice>}
    </form>
  );
}

/**
 * The user's groups as checkboxes. A box is locked when the actor can't change that membership, and
 * the reason is the tooltip. Saving sends the whole set, which the server applies in one go.
 */
function GroupsEditor({ user, groups, onDone }: { user: AdminUserDetail; groups: AdminGroup[]; onDone: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { held } = usePermissions();
  const [draft, setDraft] = useState<Set<number>>(() => new Set(user.groups.map((g) => g.id)));
  const original = new Set(user.groups.map((g) => g.id));
  const dirty = diffCount(original, draft) > 0;

  const mutation = useMutation({
    mutationFn: () => adminApi.setUserGroups(user.id, [...draft].sort((a, b) => a - b)),
    onSuccess: () => {
      toast(t('admin:toast.groupsSaved'));
      onDone();
    },
  });

  function reasonText(r: MembershipReason): string {
    switch (r.kind) {
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

  const blockFor = (g: AdminGroup): MembershipReason | null => {
    const block = membershipBlock({
      held,
      group: g,
      isMember: draft.has(g.id),
      target: { targetPerms: user.heldPermissions ?? user.effectivePermissions, banned: user.bannedAt !== null },
    });
    return block;
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty && !mutation.isPending) mutation.mutate();
      }}
    >
      <fieldset className="flex flex-col gap-1">
        <legend className="sr-only">{t('admin:userDetail.groups')}</legend>
        {groups.map((g) => {
          const block = blockFor(g);
          const reasonId = `group-reason-${g.id}`;
          const checked = draft.has(g.id);
          return (
            <label
              key={g.id}
              title={block ? reasonText(block) : undefined}
              className={cn('flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-[6px] px-2 py-2 hover:bg-bg/60', block && 'cursor-not-allowed text-sub')}
            >
              <input
                type="checkbox"
                className="translate-y-0.5 accent-main"
                checked={checked}
                disabled={block !== null || mutation.isPending}
                aria-describedby={block ? reasonId : undefined}
                onChange={(e) => {
                  mutation.reset();
                  setDraft((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(g.id);
                    else next.delete(g.id);
                    return next;
                  });
                }}
              />
              <span className="text-text">{g.name}</span>
              {g.system && <span className="text-[0.85rem] text-sub">{t('admin:groups.system')}</span>}
              <span className="tabular text-[0.85rem] text-sub">{t('admin:groups.memberCount', { count: g.memberCount })}</span>
              {block && (
                <span id={reasonId} className="sr-only">
                  {reasonText(block)}
                </span>
              )}
            </label>
          );
        })}
      </fieldset>
      {mutation.error && <Notice>{errorText(mutation.error, t)}</Notice>}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {dirty && (
          <Button variant="ghost" onClick={() => setDraft(new Set(original))}>
            {t('admin:actions.discard')}
          </Button>
        )}
        <Button type="submit" disabled={!dirty || mutation.isPending}>
          {mutation.isPending ? t('admin:actions.working') : t('admin:userDetail.groupsSave')}
        </Button>
      </div>
    </form>
  );
}

function RecentResults({ results, lang, tr, onDone }: { results: AdminResultRow[]; lang: string; tr: Tr; onDone: () => void }) {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const qc = useQueryClient();
  if (results.length === 0) return <p className="text-sub">{t('admin:userDetail.noResults')}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-left">
        <caption className="sr-only">{t('admin:userDetail.recentResults')}</caption>
        <thead>
          <tr className="text-[0.9rem] text-sub">
            <th scope="col" className="border-b border-bg py-2 pr-4 font-normal">{t('admin:results.cols.when')}</th>
            <th scope="col" className="border-b border-bg py-2 pr-4 font-normal">{t('admin:results.cols.test')}</th>
            <th scope="col" className="border-b border-bg py-2 pr-4 text-right font-normal">{t('admin:results.cols.wpm')}</th>
            <th scope="col" className="border-b border-bg py-2 pr-4 text-right font-normal">{t('admin:results.cols.accuracy')}</th>
            <th scope="col" className="border-b border-bg py-2 font-normal"><span className="sr-only">{t('admin:actions.label')}</span></th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.id} className="border-b border-bg">
              <td className="whitespace-nowrap py-2.5 pr-4 text-sub">{formatDateTime(r.createdAt, lang)}</td>
              <td className="py-2.5 pr-4 text-text">
                {[modeLabel(r.mode, tr), optionLabel(r.mode, r.mode2, tr, lang), languageLabel(r.language)].filter(Boolean).join(', ')}
              </td>
              <td className="tabular py-2.5 pr-4 text-right text-text">{formatNumber(r.wpm, lang)}</td>
              <td className="tabular py-2.5 pr-4 text-right text-sub">{formatNumber(r.accuracy, lang, 1)}%</td>
              <td className="py-2.5 text-right">
                <ActionConfirm
                  label={t('admin:results.delete.label')}
                  title={t('admin:results.delete.title')}
                  body={t('admin:results.delete.body')}
                  confirmLabel={t('admin:results.delete.confirm')}
                  danger
                  disabledReason={can('results.delete') ? null : t('admin:perm.noPermission')}
                  run={() => adminApi.deleteResult(r.id)}
                  onDone={() => {
                    void qc.invalidateQueries({ queryKey: ['admin'] });
                    onDone();
                  }}
                  done={t('admin:toast.resultDeleted')}
                  className="px-2 py-1 text-[0.85rem]"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReportList({ reports, lang, who, empty }: { reports: AdminUserReportRef[]; lang: string; who: 'reporter' | 'target'; empty: string }) {
  const { t } = useTranslation();
  if (reports.length === 0) return <p className="text-sub">{empty}</p>;
  return (
    <ul className="flex flex-col divide-y divide-bg">
      {reports.map((r) => {
        const other = who === 'reporter' ? r.reporter : r.target;
        return (
          <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5 text-[0.95rem]">
            <time dateTime={r.createdAt} className="whitespace-nowrap text-sub">{formatDate(r.createdAt, lang)}</time>
            <span className="text-text">{t(`admin:reports.reasons.${r.reason}`)}</span>
            <span className="text-sub">{t(`admin:reports.status.${r.status}`)}</span>
            <Link to={`/admin/users/${other.id}`} className="text-main underline-offset-4 hover:underline">
              {other.name}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
