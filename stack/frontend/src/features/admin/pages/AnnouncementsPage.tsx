import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { formatDateTime } from '@/features/account/format';
import { adminApi, type AnnouncementInput } from '@/lib/api';
import type { AdminAnnouncement } from '@/lib/api/types';
import { ActionConfirm } from '../components/ActionConfirm';
import { DataTable, type Column } from '../components/DataTable';
import { Notice } from '../components/Notice';
import { Tip } from '../components/Tip';
import { useToast } from '../components/useToast';
import { errorText } from '../errors';
import { fromLocalInput, localNow, toLocalInput } from '../localTime';
import { pageNumber, useUrlState } from '../useUrlState';
import { usePermissions } from '../usePermissions';

const PAGE_SIZE = 25;
const MESSAGE_MAX = 280;

export type AnnouncementStatus = 'active' | 'scheduled' | 'ended';

/** Where an announcement is in time: scheduled before its start, ended at or after its end (no end = never). */
function announcementStatus(a: { startsAt: string; endsAt: string | null }, now: number): AnnouncementStatus {
  if (now < Date.parse(a.startsAt)) return 'scheduled';
  if (a.endsAt !== null && now >= Date.parse(a.endsAt)) return 'ended';
  return 'active';
}

export default function AnnouncementsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const { can } = usePermissions();
  const qc = useQueryClient();
  const { values, update } = useUrlState<'page'>({ page: '1' });
  const page = pageNumber(values.page);
  const [editing, setEditing] = useState<AdminAnnouncement | 'new' | null>(null);

  const query = useQuery({
    queryKey: ['admin', 'announcements', page],
    queryFn: ({ signal }) => adminApi.announcements({ page, pageSize: PAGE_SIZE }, signal),
    placeholderData: (prev) => prev,
  });

  const canManage = can('announcements.manage');
  const manageReason = canManage ? null : t('admin:perm.noPermission');
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'announcements'] });
  const now = Date.now();

  const columns: Column<AdminAnnouncement>[] = [
    {
      id: 'message',
      header: t('admin:announcements.cols.message'),
      cell: (a) => <span className="line-clamp-2 block max-w-[380px] text-text">{a.message}</span>,
    },
    { id: 'level', header: t('admin:announcements.cols.level'), cell: (a) => <span className="text-sub">{levelLabel(a.level, t)}</span> },
    { id: 'starts', header: t('admin:announcements.cols.starts'), cell: (a) => <span className="tabular text-sub">{formatDateTime(a.startsAt, lang)}</span> },
    {
      id: 'ends',
      header: t('admin:announcements.cols.ends'),
      cell: (a) => <span className="tabular text-sub">{a.endsAt ? formatDateTime(a.endsAt, lang) : t('admin:announcements.noEnd')}</span>,
    },
    {
      id: 'status',
      header: t('admin:announcements.cols.status'),
      cell: (a) => <span className="text-sub">{t(`admin:announcements.status.${announcementStatus(a, now)}`)}</span>,
    },
    {
      id: 'actions',
      header: t('admin:quotes.cols.actions'),
      cell: (a) => (
        <div className="flex items-center justify-end gap-1">
          <Tip reason={manageReason}>
            <Button variant="ghost" className="px-2.5 py-1 text-[0.85rem]" disabled={manageReason !== null} onClick={() => setEditing(a)}>
              {t('admin:announcements.edit')}
            </Button>
          </Tip>
          <ActionConfirm
            label={t('admin:announcements.delete.label')}
            title={t('admin:announcements.delete.title')}
            body={t('admin:announcements.delete.body')}
            confirmLabel={t('admin:announcements.delete.confirm')}
            danger
            disabledReason={manageReason}
            run={() => adminApi.deleteAnnouncement(a.id)}
            onDone={() => void refresh()}
            done={t('admin:toast.announcementDeleted')}
            className="px-2.5 py-1 text-[0.85rem]"
          />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[1.6rem] font-semibold text-text">{t('admin:announcements.title')}</h1>
        <Tip reason={manageReason}>
          <Button disabled={manageReason !== null} onClick={() => setEditing('new')}>
            {t('admin:announcements.new')}
          </Button>
        </Tip>
      </div>

      {query.isError ? (
        <Notice>{t('admin:errors.load')}</Notice>
      ) : (
        <DataTable
          caption={t('admin:announcements.title')}
          columns={columns}
          rows={query.data?.items ?? []}
          rowKey={(a) => a.id}
          loading={query.isPending}
          empty={t('admin:announcements.empty')}
          pagination={query.data ? { page, pageSize: PAGE_SIZE, total: query.data.total, onPageChange: (p) => update({ page: String(p) }) } : undefined}
          minWidth="min-w-[760px]"
        />
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? t('admin:announcements.form.createTitle') : t('admin:announcements.form.editTitle')}
      >
        {editing !== null && (
          <AnnouncementForm
            key={editing === 'new' ? 'new' : editing.id}
            target={editing}
            onClose={() => setEditing(null)}
            onDone={() => {
              setEditing(null);
              void refresh();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function levelLabel(level: string, t: (k: string) => string): string {
  return level === 'warning' ? t('admin:announcements.level.warning') : t('admin:announcements.level.info');
}

function AnnouncementForm({ target, onClose, onDone }: { target: AdminAnnouncement | 'new'; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const existing = target === 'new' ? null : target;
  const [message, setMessage] = useState(existing?.message ?? '');
  const [level, setLevel] = useState<'info' | 'warning'>(existing?.level === 'warning' ? 'warning' : 'info');
  const [startsAt, setStartsAt] = useState(existing ? toLocalInput(existing.startsAt) : localNow());
  const [noEnd, setNoEnd] = useState(existing ? existing.endsAt === null : true);
  const [endsAt, setEndsAt] = useState(existing?.endsAt ? toLocalInput(existing.endsAt) : '');

  const trimmed = message.trim();
  const startIso = fromLocalInput(startsAt);
  const endIso = noEnd ? null : fromLocalInput(endsAt);
  const endBeforeStart = !noEnd && startIso !== null && endIso !== null && Date.parse(endIso) <= Date.parse(startIso);
  const endMissing = !noEnd && endIso === null;
  const valid = trimmed.length >= 1 && trimmed.length <= MESSAGE_MAX && startIso !== null && !endBeforeStart && !endMissing;

  const mutation = useMutation({
    mutationFn: (input: AnnouncementInput) =>
      existing ? adminApi.updateAnnouncement(existing.id, input) : adminApi.createAnnouncement(input),
    onSuccess: () => {
      toast(t(existing ? 'admin:toast.announcementUpdated' : 'admin:toast.announcementCreated'));
      onDone();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || startIso === null || mutation.isPending) return;
    mutation.mutate({ message: trimmed, level, startsAt: startIso, endsAt: endIso });
  }

  return (
    <form className="flex max-h-[62vh] flex-col gap-4" onSubmit={submit}>
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="announcement-message" className="text-[0.9rem] text-sub">
            {t('admin:announcements.form.message')}
          </label>
          <textarea
            id="announcement-message"
            rows={3}
            value={message}
            maxLength={MESSAGE_MAX}
            aria-describedby="announcement-message-hint"
            onChange={(e) => setMessage(e.target.value)}
            className="rounded-[6px] bg-bg px-3 py-2.5 text-text outline-none"
          />
          <p id="announcement-message-hint" className="flex flex-wrap justify-between gap-2 text-[0.85rem] text-sub">
            <span>{t('admin:announcements.form.messageHint')}</span>
            <span className="tabular">{t('admin:announcements.counter', { n: message.length, max: MESSAGE_MAX })}</span>
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="announcement-level" className="text-[0.9rem] text-sub">
              {t('admin:announcements.form.level')}
            </label>
            <select
              id="announcement-level"
              value={level}
              onChange={(e) => setLevel(e.target.value === 'warning' ? 'warning' : 'info')}
              className="h-10 rounded-[6px] bg-bg px-3 text-text outline-none"
            >
              <option value="info">{t('admin:announcements.level.info')}</option>
              <option value="warning">{t('admin:announcements.level.warning')}</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="announcement-starts" className="text-[0.9rem] text-sub">
              {t('admin:announcements.form.startsAt')}
            </label>
            <input
              id="announcement-starts"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="h-10 rounded-[6px] bg-bg px-3 text-text outline-none"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="announcement-ends" className="text-[0.9rem] text-sub">
              {t('admin:announcements.form.endsAt')}
            </label>
            <input
              id="announcement-ends"
              type="datetime-local"
              value={endsAt}
              disabled={noEnd}
              aria-invalid={endBeforeStart || endMissing}
              onChange={(e) => setEndsAt(e.target.value)}
              className="h-10 rounded-[6px] bg-bg px-3 text-text outline-none disabled:opacity-50"
            />
          </div>
          <label className="flex items-end gap-2 pb-2 text-[0.95rem] text-text">
            <input type="checkbox" checked={noEnd} onChange={(e) => setNoEnd(e.target.checked)} className="size-4 accent-[var(--main)]" />
            {t('admin:announcements.form.noEnd')}
          </label>
        </div>

      </div>
      <div className="flex shrink-0 flex-col gap-4">
        {endBeforeStart && <Notice>{t('admin:announcements.form.endsAfter')}</Notice>}
        {mutation.error && <Notice>{errorText(mutation.error, t)}</Notice>}
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            {t('common:cancel')}
          </Button>
          <Button type="submit" disabled={!valid || mutation.isPending}>
            {mutation.isPending ? t('admin:actions.working') : existing ? t('admin:announcements.form.save') : t('admin:announcements.form.create')}
          </Button>
        </div>
      </div>
    </form>
  );
}
