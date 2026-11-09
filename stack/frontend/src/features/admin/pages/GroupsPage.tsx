import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { formatDate, formatNumber } from '@/features/account/format';
import { adminApi } from '@/lib/api';
import type { AdminGroup } from '@/lib/api/types';
import { DataTable, type Column } from '../components/DataTable';
import { pageNumber, useUrlState } from '../useUrlState';
import { TextInput } from '../components/TextInput';
import { Notice } from '../components/Notice';
import { Tip } from '../components/Tip';
import { useToast } from '../components/useToast';
import { errorText } from '../errors';
import { usePermissions } from '../usePermissions';

const PAGE_SIZE = 25;
const DEFAULTS = { page: '1' } as const;
const NAME_MIN = 2;
const NAME_MAX = 40;
const DESCRIPTION_MAX = 200;

export default function GroupsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const { can } = usePermissions();
  const [creating, setCreating] = useState(false);
  const { values, update } = useUrlState<keyof typeof DEFAULTS>(DEFAULTS);
  const page = pageNumber(values.page);
  const query = useQuery({
    queryKey: ['admin', 'groups', 'page', page],
    queryFn: ({ signal }) => adminApi.groups({ page, pageSize: PAGE_SIZE }, signal),
    placeholderData: (prev) => prev,
  });

  const columns: Column<AdminGroup>[] = [
    {
      id: 'name',
      header: t('admin:groups.cols.name'),
      cell: (g) => (
        <span className="flex flex-wrap items-baseline gap-x-2">
          <Link to={`/admin/groups/${g.id}`} className="text-main underline-offset-4 hover:underline">
            {g.name}
          </Link>
          {g.system && <span className="text-[0.85rem] text-sub">{t('admin:groups.system')}</span>}
        </span>
      ),
    },
    { id: 'description', header: t('admin:groups.cols.description'), cell: (g) => <span className="text-sub">{g.description}</span> },
    {
      id: 'members',
      header: t('admin:groups.cols.members'),
      align: 'end',
      cell: (g) => formatNumber(g.memberCount, lang),
    },
    {
      id: 'permissions',
      header: t('admin:groups.cols.permissions'),
      align: 'end',
      cell: (g) => (g.system ? t('admin:groups.all') : formatNumber(g.permissions.length, lang)),
    },
    {
      id: 'updated',
      header: t('admin:groups.cols.updated'),
      cell: (g) => <span className="whitespace-nowrap text-sub">{formatDate(g.updatedAt, lang)}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[1.6rem] font-semibold text-text">{t('admin:groups.title')}</h1>
        <Tip reason={can('groups.manage') ? null : t('admin:perm.noPermission')}>
          <Button disabled={!can('groups.manage')} onClick={() => setCreating(true)}>
            {t('admin:groups.new')}
          </Button>
        </Tip>
      </div>

      {query.isError ? (
        <Notice>{t('admin:errors.load')}</Notice>
      ) : (
        <DataTable
          caption={t('admin:groups.title')}
          columns={columns}
          rows={query.data?.items ?? []}
          rowKey={(g) => g.id}
          loading={query.isPending}
          empty={t('admin:groups.empty')}
          pagination={
            query.data
              ? { page, pageSize: PAGE_SIZE, total: query.data.total, onPageChange: (p) => update({ page: String(p) }) }
              : undefined
          }
          minWidth="min-w-[640px]"
        />
      )}

      <CreateGroupDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function CreateGroupDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal open={open} onClose={onClose} title={t('admin:groups.createTitle')}>
      <CreateGroupForm onClose={onClose} />
    </Modal>
  );
}

function CreateGroupForm({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const trimmed = name.trim();
  const valid = trimmed.length >= NAME_MIN && trimmed.length <= NAME_MAX;

  const mutation = useMutation({
    mutationFn: () => adminApi.createGroup({ name: trimmed, description: description.trim() }),
    onSuccess: (group) => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      toast(t('admin:toast.groupCreated'));
      onClose();
      navigate(`/admin/groups/${group.id}`);
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || mutation.isPending) return;
    mutation.mutate();
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <TextInput id="group-name" label={t('admin:groups.form.name')} hint={t('admin:groups.form.nameHint', { min: NAME_MIN, max: NAME_MAX })} value={name} onChange={setName} autoFocus />
      <TextInput id="group-description" label={t('admin:groups.form.description')} hint={t('admin:groups.form.descriptionHint', { max: DESCRIPTION_MAX })} value={description} onChange={setDescription} maxLength={DESCRIPTION_MAX} />
      {mutation.error && <Notice>{errorText(mutation.error, t)}</Notice>}
      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          {t('common:cancel')}
        </Button>
        <Button type="submit" disabled={!valid || mutation.isPending}>
          {mutation.isPending ? t('admin:actions.working') : t('admin:groups.form.create')}
        </Button>
      </div>
    </form>
  );
}
