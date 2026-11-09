import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { formatDateTime, formatNumber, relativeTime } from '@/features/account/format';
import { languageLabel } from '@/features/account/labels';
import { adminApi } from '@/lib/api';
import type { AdminRace } from '@/lib/api/types';
import { ActionConfirm } from '../components/ActionConfirm';
import { DataTable, type Column } from '../components/DataTable';
import { Notice } from '../components/Notice';
import { usePermissions } from '../usePermissions';

const REFRESH_MS = 5000;

/** Live race rooms. The list refreshes every 5 seconds, and a room can be closed. */
export default function RacesPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const { can } = usePermissions();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['admin', 'races'],
    queryFn: ({ signal }) => adminApi.races(signal),
    refetchInterval: REFRESH_MS,
  });

  const canClose = can('races.manage');
  const closeReason = canClose ? null : t('admin:perm.noPermission');

  const columns: Column<AdminRace>[] = [
    { id: 'room', header: t('admin:races.cols.room'), cell: (r) => <code className="text-[0.85rem] text-sub">{r.id}</code> },
    { id: 'language', header: t('admin:races.cols.language'), cell: (r) => <span className="text-text">{languageLabel(r.language)}</span> },
    { id: 'status', header: t('admin:races.cols.status'), cell: (r) => <span className="text-text">{t(`admin:races.status.${r.status}`, { defaultValue: r.status })}</span> },
    {
      id: 'players',
      header: t('admin:races.cols.players'),
      align: 'end',
      cell: (r) => formatNumber(r.players.length, lang),
    },
    {
      id: 'names',
      header: t('admin:races.cols.names'),
      cell: (r) => (
        <span className="text-sub">
          {r.players.map((p) => (p.connected ? p.name : `${p.name} (${t('admin:races.disconnected')})`)).join(', ') || t('admin:races.nobody')}
        </span>
      ),
    },
    {
      id: 'activity',
      header: t('admin:races.cols.activity'),
      cell: (r) => (
        <time dateTime={r.lastActivity} title={formatDateTime(r.lastActivity, lang)} className="whitespace-nowrap text-sub">
          {relativeTime(r.lastActivity, lang)}
        </time>
      ),
    },
    {
      id: 'close',
      header: t('admin:races.cols.actions'),
      cell: (r) => (
        <ActionConfirm
          label={t('admin:races.close.label')}
          title={t('admin:races.close.title')}
          body={t('admin:races.close.body')}
          confirmLabel={t('admin:races.close.confirm')}
          danger
          disabledReason={closeReason}
          run={() => adminApi.closeRace(r.id)}
          onDone={() => void qc.invalidateQueries({ queryKey: ['admin', 'races'] })}
          done={t('admin:toast.raceClosed')}
          className="px-2.5 py-1 text-[0.85rem]"
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-[1.6rem] font-semibold text-text">{t('admin:races.title')}</h1>
        <p className="text-[0.85rem] text-sub">{t('admin:races.refresh')}</p>
      </div>
      {query.isError ? (
        <Notice>{t('admin:errors.load')}</Notice>
      ) : (
        <DataTable
          caption={t('admin:races.title')}
          columns={columns}
          rows={query.data ?? []}
          rowKey={(r) => r.id}
          loading={query.isPending}
          empty={t('admin:races.empty')}
          minWidth="min-w-[860px]"
        />
      )}
    </div>
  );
}
