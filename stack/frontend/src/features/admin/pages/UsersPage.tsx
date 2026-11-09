import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { formatDate, formatNumber } from '@/features/account/format';
import { adminApi, type UserListParams } from '@/lib/api';
import type { AdminUserRow } from '@/lib/api/types';
import { DataTable, type Column, type TableSort } from '../components/DataTable';
import { SearchInput } from '../components/SearchInput';
import { SelectField, Toolbar } from '../components/Toolbar';
import { useUrlState, pageNumber } from '../useUrlState';
import { usePermissions } from '../usePermissions';

const PAGE_SIZE = 25;
const DEFAULTS = { q: '', banned: '', group: '', sort: 'created', order: 'desc', page: '1' } as const;
type Key = keyof typeof DEFAULTS;

export default function UsersPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const { can } = usePermissions();
  const { values, update } = useUrlState<Key>(DEFAULTS);
  const page = pageNumber(values.page);

  const params: UserListParams = {
    q: values.q || undefined,
    banned: values.banned === 'true' || values.banned === 'false' ? values.banned : undefined,
    group: values.group ? Number(values.group) : undefined,
    sort: values.sort as UserListParams['sort'],
    order: values.order as UserListParams['order'],
    page,
    pageSize: PAGE_SIZE,
  };

  const users = useQuery({
    queryKey: ['admin', 'users', params],
    queryFn: ({ signal }) => adminApi.users(params, signal),
    placeholderData: (prev) => prev,
  });

  const groups = useQuery({
    queryKey: ['admin', 'groups', 'all'],
    queryFn: ({ signal }) => adminApi.allGroups(signal),
    enabled: can('groups.read'),
  });

  const columns: Column<AdminUserRow>[] = [
    {
      id: 'name',
      header: t('admin:users.cols.name'),
      sortKey: 'name',
      defaultOrder: 'asc',
      cell: (u) => (
        <Link to={`/admin/users/${u.id}`} className="text-main underline-offset-4 hover:underline">
          {u.name}
        </Link>
      ),
    },
    { id: 'email', header: t('admin:users.cols.email'), cell: (u) => <span className="break-all text-sub">{u.email}</span> },
    {
      id: 'joined',
      header: t('admin:users.cols.joined'),
      sortKey: 'created',
      defaultOrder: 'desc',
      cell: (u) => <span className="whitespace-nowrap text-sub">{formatDate(u.createdAt, lang)}</span>,
    },
    {
      id: 'groups',
      header: t('admin:users.cols.groups'),
      cell: (u) =>
        u.groups.length === 0 ? (
          <span className="text-sub">{t('admin:users.noGroups')}</span>
        ) : (
          <span className="text-text">{u.groups.map((g) => g.name).join(', ')}</span>
        ),
    },
    {
      id: 'results',
      header: t('admin:users.cols.results'),
      sortKey: 'results',
      defaultOrder: 'desc',
      align: 'end',
      cell: (u) => formatNumber(u.resultCount, lang),
    },
    {
      id: 'status',
      header: t('admin:users.cols.status'),
      cell: (u) =>
        u.bannedAt ? <span className="text-error">{t('admin:users.status.suspended')}</span> : <span className="text-sub">{t('admin:users.status.active')}</span>,
    },
  ];

  const sort: TableSort = { key: values.sort, order: values.order === 'asc' ? 'asc' : 'desc' };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-[1.6rem] font-semibold text-text">{t('admin:users.title')}</h1>

      <Toolbar label={t('admin:users.filters')}>
        <SearchInput
          value={values.q}
          label={t('admin:users.search')}
          placeholder={t('admin:users.searchPlaceholder')}
          onCommit={(q) => update({ q })}
        />
        <SelectField id="users-banned" label={t('admin:users.statusFilter')} value={values.banned} onChange={(banned) => update({ banned })}>
          <option value="">{t('admin:users.statusAny')}</option>
          <option value="false">{t('admin:users.status.active')}</option>
          <option value="true">{t('admin:users.status.suspended')}</option>
        </SelectField>
        {can('groups.read') && (
          <SelectField id="users-group" label={t('admin:users.groupFilter')} value={values.group} onChange={(group) => update({ group })}>
            <option value="">{t('admin:users.groupAny')}</option>
            {(groups.data ?? []).map((g) => (
              <option key={g.id} value={String(g.id)}>
                {g.name}
              </option>
            ))}
          </SelectField>
        )}
      </Toolbar>

      {users.isError ? (
        <p role="alert" className="text-error">
          {t('admin:errors.load')}
        </p>
      ) : (
        <DataTable
          caption={t('admin:users.title')}
          columns={columns}
          rows={users.data?.items ?? []}
          rowKey={(u) => u.id}
          loading={users.isPending}
          empty={t('admin:users.empty')}
          sort={sort}
          onSort={(s: TableSort) => update({ sort: s.key, order: s.order })}
          pagination={
            users.data
              ? { page, pageSize: PAGE_SIZE, total: users.data.total, onPageChange: (p) => update({ page: String(p) }) }
              : undefined
          }
          minWidth="min-w-[760px]"
        />
      )}
    </div>
  );
}
