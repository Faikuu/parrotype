import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/Button';
import { cn } from '@/components/cn';
import { formatDateTime, formatNumber } from '@/features/account/format';
import { languageLabel, modeLabel, optionLabel, type Tr } from '@/features/account/labels';
import { adminApi } from '@/lib/api';
import type { AdminReport, AdminResultRow, ReportStatus } from '@/lib/api/types';
import { ActionConfirm } from '../components/ActionConfirm';
import { DataTable, type Column } from '../components/DataTable';
import { Notice } from '../components/Notice';
import { SuspendButton } from '../components/SuspendButton';
import { Tip } from '../components/Tip';
import { useToast } from '../components/useToast';
import { errorText } from '../errors';
import { pageNumber, useUrlState } from '../useUrlState';
import { usePermissions } from '../usePermissions';

const PAGE_SIZE = 25;
const STATUSES: ReportStatus[] = ['open', 'resolved', 'dismissed'];
const DEFAULTS = { status: 'open', page: '1' } as const;
type Key = keyof typeof DEFAULTS;

export default function ReportsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const { can } = usePermissions();
  const qc = useQueryClient();
  const toast = useToast();
  const { values, update } = useUrlState<Key>(DEFAULTS);
  const status = (STATUSES as string[]).includes(values.status) ? (values.status as ReportStatus) : 'open';
  const page = pageNumber(values.page);

  const query = useQuery({
    queryKey: ['admin', 'reports', status, page],
    queryFn: ({ signal }) => adminApi.reports({ status, page, pageSize: PAGE_SIZE }, signal),
    placeholderData: (prev) => prev,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin'] });
  const decide = useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'resolve' | 'dismiss' }) =>
      action === 'resolve' ? adminApi.resolveReport(id) : adminApi.dismissReport(id),
    onSuccess: (_result, vars) => {
      toast(t(vars.action === 'resolve' ? 'admin:toast.reportResolved' : 'admin:toast.reportDismissed'));
      void refresh();
    },
  });

  const tr: Tr = (k, o) => String(t(k, o));

  const columns: Column<AdminReport>[] = [
    {
      id: 'date',
      header: t('admin:reports.cols.date'),
      cell: (r) => (
        <time dateTime={r.createdAt} className="whitespace-nowrap text-sub">
          {formatDateTime(r.createdAt, lang)}
        </time>
      ),
    },
    { id: 'reporter', header: t('admin:reports.cols.reporter'), cell: (r) => <span className="text-text">{r.reporter.name}</span> },
    {
      id: 'target',
      header: t('admin:reports.cols.target'),
      cell: (r) => (
        <div className="flex flex-col gap-1">
          <Link to={`/admin/users/${r.target.id}`} className="text-main underline-offset-4 hover:underline">
            {r.target.name}
          </Link>
          {r.target.bannedAt && (
            <span className="text-[0.85rem] text-error">
              {t('admin:users.status.suspended')}
              {r.target.banReason ? ` · ${t('admin:reports.suspendedReason', { reason: r.target.banReason })}` : ''}
            </span>
          )}
        </div>
      ),
    },
    { id: 'reason', header: t('admin:reports.cols.reason'), cell: (r) => <span className="text-text">{t(`admin:reports.reasons.${r.reason}`)}</span> },
    {
      id: 'details',
      header: t('admin:reports.cols.details'),
      cell: (r) =>
        r.details ? <span className="block max-w-[260px] whitespace-pre-wrap break-words text-sub">{r.details}</span> : <span className="text-sub">{t('admin:reports.noDetails')}</span>,
    },
    {
      id: 'results',
      header: t('admin:reports.cols.results'),
      cell: (r) =>
        r.targetResults.length === 0 ? (
          <span className="text-sub">{t('admin:reports.noResults')}</span>
        ) : (
          <ul className="flex flex-col gap-2">
            {r.targetResults.map((res) => (
              <ReportResult key={res.id} result={res} lang={lang} tr={tr} />
            ))}
          </ul>
        ),
    },
    {
      id: 'actions',
      header: t('admin:reports.cols.actions'),
      cell: (r) => {
        const open = r.status === 'open';
        const suspended = r.target.bannedAt !== null;
        const resolveReason = can('reports.resolve') ? null : t('admin:perm.noPermission');
        const banReason = can('users.ban') ? null : t('admin:perm.noPermission');
        return (
          <div className="flex flex-col items-start gap-2">
            {open && (
              <>
                <Tip reason={resolveReason}>
                  <Button variant="ghost" disabled={resolveReason !== null || decide.isPending} onClick={() => decide.mutate({ id: r.id, action: 'resolve' })}>
                    {t('admin:reports.actions.resolve')}
                  </Button>
                </Tip>
                <Tip reason={resolveReason}>
                  <Button variant="ghost" disabled={resolveReason !== null || decide.isPending} onClick={() => decide.mutate({ id: r.id, action: 'dismiss' })}>
                    {t('admin:reports.actions.dismiss')}
                  </Button>
                </Tip>
              </>
            )}
            {suspended ? (
              <ActionConfirm
                label={t('admin:reports.actions.unban')}
                title={t('admin:userDetail.unsuspend.title', { name: r.target.name })}
                body={t('admin:userDetail.unsuspend.body')}
                confirmLabel={t('admin:userDetail.unsuspend.confirm')}
                disabledReason={banReason}
                run={() => adminApi.unban(r.target.id)}
                onDone={() => void refresh()}
                done={t('admin:toast.unsuspended')}
              />
            ) : (
              <SuspendButton userId={r.target.id} name={r.target.name} disabledReason={banReason} onDone={() => void refresh()} />
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[1.6rem] font-semibold text-text">{t('admin:reports.title')}</h1>

      <div role="group" aria-label={t('admin:reports.statusFilter')} className="flex w-fit flex-wrap gap-1 rounded-[10px] bg-surface p-1">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={status === s}
            onClick={() => update({ status: s })}
            className={cn('rounded-[6px] px-3 py-1 text-[0.95rem] transition-colors', status === s ? 'bg-bg text-main' : 'text-sub hover:text-text')}
          >
            {t(`admin:reports.status.${s}`)}
          </button>
        ))}
      </div>

      {decide.error && <Notice>{errorText(decide.error, t)}</Notice>}

      {query.isError ? (
        <Notice>{t('admin:errors.load')}</Notice>
      ) : (
        <DataTable
          caption={t('admin:reports.title')}
          columns={columns}
          rows={query.data?.items ?? []}
          rowKey={(r) => r.id}
          loading={query.isPending}
          empty={t(`admin:reports.empty.${status}`)}
          pagination={query.data ? { page, pageSize: PAGE_SIZE, total: query.data.total, onPageChange: (p) => update({ page: String(p) }) } : undefined}
          minWidth="min-w-[960px]"
        />
      )}
    </div>
  );
}

function ReportResult({ result, lang, tr }: { result: AdminResultRow; lang: string; tr: Tr }) {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const qc = useQueryClient();
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.9rem]">
      <span className="tabular text-text">{formatNumber(result.wpm, lang)}</span>
      <span className="text-sub">
        {[modeLabel(result.mode, tr), optionLabel(result.mode, result.mode2, tr, lang), languageLabel(result.language)].filter(Boolean).join(', ')}
      </span>
      <ActionConfirm
        label={t('admin:results.delete.label')}
        title={t('admin:results.delete.title')}
        body={t('admin:results.delete.body')}
        confirmLabel={t('admin:results.delete.confirm')}
        danger
        disabledReason={can('results.delete') ? null : t('admin:perm.noPermission')}
        run={() => adminApi.deleteResult(result.id)}
        onDone={() => void qc.invalidateQueries({ queryKey: ['admin'] })}
        done={t('admin:toast.resultDeleted')}
        className="px-2 py-0.5 text-[0.85rem]"
      />
    </li>
  );
}
