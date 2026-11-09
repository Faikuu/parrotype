import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { formatDateTime } from '@/features/account/format';
import type { Tr } from '@/features/account/labels';
import { adminApi, type AuditListParams } from '@/lib/api';
import type { AdminAuditEntry } from '@/lib/api/types';
import { DataTable, type Column } from '../components/DataTable';
import { SearchInput } from '../components/SearchInput';
import { SelectField, Toolbar } from '../components/Toolbar';
import { pageNumber, useUrlState } from '../useUrlState';

const PAGE_SIZE = 25;
/** Every action the server writes to the audit log (docs/SPEC-2.4.md, plus the older ones). */
const AUDIT_ACTIONS = [
  'ban',
  'unban',
  'delete_result',
  'resolve_report',
  'dismiss_report',
  'grant_admin',
  'revoke_admin',
  'group_create',
  'group_update',
  'group_delete',
  'group_permissions',
  'group_member_add',
  'group_member_remove',
  'user_groups',
  'user_rename',
  'user_revoke_sessions',
  'user_delete',
  'quote_create',
  'quote_update',
  'quote_delete',
  'race_close',
] as const;
const DEFAULTS = { action: '', admin: '', target: '', page: '1' } as const;
type Key = keyof typeof DEFAULTS;

export default function AuditPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const { values, update } = useUrlState<Key>(DEFAULTS);
  const page = pageNumber(values.page);

  const params: AuditListParams = {
    action: values.action || undefined,
    admin: values.admin || undefined,
    target: values.target || undefined,
    page,
    pageSize: PAGE_SIZE,
  };
  const query = useQuery({
    queryKey: ['admin', 'actions', params],
    queryFn: ({ signal }) => adminApi.actions(params, signal),
    placeholderData: (prev) => prev,
  });

  const columns: Column<AdminAuditEntry>[] = [
    {
      id: 'when',
      header: t('admin:audit.cols.when'),
      cell: (e) => (
        <time dateTime={e.createdAt} className="whitespace-nowrap text-sub">
          {formatDateTime(e.createdAt, lang)}
        </time>
      ),
    },
    { id: 'admin', header: t('admin:audit.cols.admin'), cell: (e) => <span className="text-text">{e.adminName ?? t('admin:audit.commandLine')}</span> },
    { id: 'action', header: t('admin:audit.cols.action'), cell: (e) => <span className="text-text">{actionLabel(e.action, t)}</span> },
    { id: 'target', header: t('admin:audit.cols.target'), cell: (e) => <code className="break-all text-sub">{e.target}</code> },
    {
      id: 'note',
      header: t('admin:audit.cols.note'),
      cell: (e) => (e.note ? <code className="break-all text-[0.8rem] text-sub">{e.note}</code> : null),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[1.6rem] font-semibold text-text">{t('admin:audit.title')}</h1>

      <Toolbar label={t('admin:audit.filters')}>
        <SelectField id="audit-action" label={t('admin:audit.actionFilter')} value={values.action} onChange={(action) => update({ action })}>
          <option value="">{t('admin:audit.allActions')}</option>
          {AUDIT_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {actionLabel(a, t)}
            </option>
          ))}
        </SelectField>
        <SearchInput value={values.admin} label={t('admin:audit.adminFilter')} placeholder={t('admin:audit.adminPlaceholder')} onCommit={(admin) => update({ admin })} />
        <SearchInput value={values.target} label={t('admin:audit.targetFilter')} placeholder={t('admin:audit.targetPlaceholder')} onCommit={(target) => update({ target })} />
      </Toolbar>

      {query.isError ? (
        <p role="alert" className="text-error">
          {t('admin:errors.load')}
        </p>
      ) : (
        <DataTable
          caption={t('admin:audit.title')}
          columns={columns}
          rows={query.data?.items ?? []}
          rowKey={(e) => e.id}
          loading={query.isPending}
          empty={t('admin:audit.empty')}
          pagination={query.data ? { page, pageSize: PAGE_SIZE, total: query.data.total, onPageChange: (p) => update({ page: String(p) }) } : undefined}
          minWidth="min-w-[860px]"
        />
      )}
    </div>
  );
}

function actionLabel(action: string, t: Tr): string {
  return t(`admin:audit.actions.${action}`, { defaultValue: action });
}
