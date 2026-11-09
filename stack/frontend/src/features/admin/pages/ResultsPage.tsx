import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { formatDateTime, formatNumber, relativeTime } from '@/features/account/format';
import { languageLabel, modeLabel, optionLabel, type Tr } from '@/features/account/labels';
import { adminApi, type ResultListParams } from '@/lib/api';
import type { AdminResult, SortOrder } from '@/lib/api/types';
import { ActionConfirm } from '../components/ActionConfirm';
import { DataTable, type Column, type TableSort } from '../components/DataTable';
import { SearchInput } from '../components/SearchInput';
import { SelectField, Toolbar } from '../components/Toolbar';
import { pageNumber, useUrlState } from '../useUrlState';
import { usePermissions } from '../usePermissions';

const PAGE_SIZE = 25;
const MODES = ['time', 'words', 'quote', 'zen', 'pangram', 'custom', 'daily', 'weak', 'code'] as const;
const LANGUAGES = ['en', 'pl', 'de', 'es'] as const;
const DEFAULTS = { user: '', mode: '', language: '', suspicious: '', sort: 'created', order: 'desc', page: '1' } as const;
type Key = keyof typeof DEFAULTS;

/** Results across all users, with the suspicious filter (wpm ≥ 180 with consistency under 40, and similar). */
export default function ResultsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const { can } = usePermissions();
  const qc = useQueryClient();
  const { values, update } = useUrlState<Key>(DEFAULTS);
  const page = pageNumber(values.page);
  const tr: Tr = (k, o) => String(t(k, o));

  const params: ResultListParams = {
    user: values.user || undefined,
    mode: values.mode || undefined,
    language: values.language || undefined,
    suspicious: values.suspicious === 'true' ? true : undefined,
    sort: values.sort as ResultListParams['sort'],
    order: values.order as SortOrder,
    page,
    pageSize: PAGE_SIZE,
  };

  const query = useQuery({
    queryKey: ['admin', 'results', params],
    queryFn: ({ signal }) => adminApi.results(params, signal),
    placeholderData: (prev) => prev,
  });

  const columns: Column<AdminResult>[] = [
    {
      id: 'when',
      header: t('admin:results.cols.when'),
      sortKey: 'created',
      defaultOrder: 'desc',
      cell: (r) => (
        <time dateTime={r.createdAt} className="whitespace-nowrap text-sub" title={formatDateTime(r.createdAt, lang)}>
          {relativeTime(r.createdAt, lang)}
        </time>
      ),
    },
    {
      id: 'user',
      header: t('admin:results.cols.user'),
      cell: (r) =>
        can('users.read') ? (
          <Link to={`/admin/users/${r.user.id}`} className="text-main underline-offset-4 hover:underline">
            {r.user.name}
          </Link>
        ) : (
          <span className="text-text">{r.user.name}</span>
        ),
    },
    {
      id: 'test',
      header: t('admin:results.cols.test'),
      cell: (r) => (
        <span className="text-text">
          {[modeLabel(r.mode, tr), optionLabel(r.mode, r.mode2, tr, lang), languageLabel(r.language)].filter(Boolean).join(', ')}
        </span>
      ),
    },
    { id: 'wpm', header: t('admin:results.cols.wpm'), sortKey: 'wpm', defaultOrder: 'desc', align: 'end', cell: (r) => formatNumber(r.wpm, lang, 2) },
    { id: 'raw', header: t('admin:results.cols.raw'), align: 'end', cell: (r) => formatNumber(r.rawWpm, lang, 2) },
    { id: 'accuracy', header: t('admin:results.cols.accuracy'), align: 'end', cell: (r) => `${formatNumber(r.accuracy, lang, 1)}%` },
    { id: 'consistency', header: t('admin:results.cols.consistency'), align: 'end', cell: (r) => `${formatNumber(r.consistency, lang, 1)}%` },
    {
      id: 'delete',
      header: t('admin:results.cols.actions'),
      cell: (r) => (
        <ActionConfirm
          label={t('admin:results.delete.label')}
          title={t('admin:results.delete.title')}
          body={t('admin:results.delete.body')}
          confirmLabel={t('admin:results.delete.confirm')}
          danger
          disabledReason={can('results.delete') ? null : t('admin:perm.noPermission')}
          run={() => adminApi.deleteResult(r.id)}
          onDone={() => void qc.invalidateQueries({ queryKey: ['admin'] })}
          done={t('admin:toast.resultDeleted')}
          className="px-2 py-0.5 text-[0.85rem]"
        />
      ),
    },
  ];

  const sort: TableSort = { key: values.sort, order: values.order === 'asc' ? 'asc' : 'desc' };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[1.6rem] font-semibold text-text">{t('admin:results.title')}</h1>

      <Toolbar label={t('admin:results.filters')}>
        <SearchInput value={values.user} label={t('admin:results.userFilter')} placeholder={t('admin:results.userPlaceholder')} onCommit={(user) => update({ user })} />
        <SelectField id="results-mode" label={t('admin:results.modeFilter')} value={values.mode} onChange={(mode) => update({ mode })}>
          <option value="">{t('admin:results.any')}</option>
          {MODES.map((m) => (
            <option key={m} value={m}>
              {modeLabel(m, tr)}
            </option>
          ))}
        </SelectField>
        <SelectField id="results-language" label={t('admin:results.languageFilter')} value={values.language} onChange={(language) => update({ language })}>
          <option value="">{t('admin:results.any')}</option>
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {languageLabel(l)}
            </option>
          ))}
        </SelectField>
        <label className="flex h-9 items-center gap-2 text-[0.95rem] text-text">
          <input
            type="checkbox"
            className="size-4 accent-main"
            checked={values.suspicious === 'true'}
            onChange={(e) => update({ suspicious: e.target.checked ? 'true' : '' })}
          />
          {t('admin:results.suspiciousOnly')}
        </label>
      </Toolbar>

      {query.isError ? (
        <p role="alert" className="text-error">
          {t('admin:errors.load')}
        </p>
      ) : (
        <DataTable
          caption={t('admin:results.title')}
          columns={columns}
          rows={query.data?.items ?? []}
          rowKey={(r) => r.id}
          loading={query.isPending}
          empty={t('admin:results.empty')}
          sort={sort}
          onSort={(s) => update({ sort: s.key, order: s.order })}
          pagination={query.data ? { page, pageSize: PAGE_SIZE, total: query.data.total, onPageChange: (p) => update({ page: String(p) }) } : undefined}
          minWidth="min-w-[860px]"
        />
      )}
    </div>
  );
}
