import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { formatDateTime } from '@/features/account/format';
import { languageLabel } from '@/features/account/labels';
import { adminApi, type EventCreateInput, type EventUpdateInput } from '@/lib/api';
import type { AdminEvent } from '@/lib/api/types';
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
const LANGUAGES = ['en', 'pl', 'de', 'es'] as const;
const SLUG_RE = /^[a-z0-9-]{3,40}$/;
const TITLE_MAX = 80;
const DESCRIPTION_MAX = 500;
const TEXT_MIN = 20;
const TEXT_MAX = 1000;

/** Whether an event has started: its text, language and start are then locked. */
function eventHasStarted(e: { startsAt: string }, now: number): boolean {
  return now >= Date.parse(e.startsAt);
}

export default function EventsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const { can } = usePermissions();
  const qc = useQueryClient();
  const { values, update } = useUrlState<'page'>({ page: '1' });
  const page = pageNumber(values.page);
  const [editing, setEditing] = useState<AdminEvent | 'new' | null>(null);

  const query = useQuery({
    queryKey: ['admin', 'events', page],
    queryFn: ({ signal }) => adminApi.events({ page, pageSize: PAGE_SIZE }, signal),
    placeholderData: (prev) => prev,
  });

  const canManage = can('events.manage');
  const manageReason = canManage ? null : t('admin:perm.noPermission');
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'events'] });

  const columns: Column<AdminEvent>[] = [
    { id: 'title', header: t('admin:events.cols.title'), cell: (e) => <span className="line-clamp-2 block max-w-[300px] text-text">{e.title}</span> },
    { id: 'slug', header: t('admin:events.cols.slug'), cell: (e) => <span className="font-mono text-sub">{e.slug}</span> },
    { id: 'language', header: t('admin:events.cols.language'), cell: (e) => <span className="text-sub">{languageLabel(e.language)}</span> },
    { id: 'starts', header: t('admin:events.cols.starts'), cell: (e) => <span className="tabular text-sub">{formatDateTime(e.startsAt, lang)}</span> },
    { id: 'ends', header: t('admin:events.cols.ends'), cell: (e) => <span className="tabular text-sub">{formatDateTime(e.endsAt, lang)}</span> },
    { id: 'state', header: t('admin:events.cols.state'), cell: (e) => <span className="text-sub">{t(`admin:events.state.${e.state}`)}</span> },
    {
      id: 'actions',
      header: t('admin:quotes.cols.actions'),
      cell: (e) => (
        <div className="flex items-center justify-end gap-1">
          <Tip reason={manageReason}>
            <Button variant="ghost" className="px-2.5 py-1 text-[0.85rem]" disabled={manageReason !== null} onClick={() => setEditing(e)}>
              {t('admin:events.edit')}
            </Button>
          </Tip>
          <ActionConfirm
            label={t('admin:events.delete.label')}
            title={t('admin:events.delete.title')}
            body={t('admin:events.delete.body')}
            confirmLabel={t('admin:events.delete.confirm')}
            danger
            disabledReason={manageReason}
            run={() => adminApi.deleteEvent(e.id)}
            onDone={() => void refresh()}
            done={t('admin:toast.eventDeleted')}
            className="px-2.5 py-1 text-[0.85rem]"
          />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[1.6rem] font-semibold text-text">{t('admin:events.title')}</h1>
        <Tip reason={manageReason}>
          <Button disabled={manageReason !== null} onClick={() => setEditing('new')}>
            {t('admin:events.new')}
          </Button>
        </Tip>
      </div>

      {query.isError ? (
        <Notice>{t('admin:errors.load')}</Notice>
      ) : (
        <DataTable
          caption={t('admin:events.title')}
          columns={columns}
          rows={query.data?.items ?? []}
          rowKey={(e) => e.id}
          loading={query.isPending}
          empty={t('admin:events.empty')}
          pagination={query.data ? { page, pageSize: PAGE_SIZE, total: query.data.total, onPageChange: (p) => update({ page: String(p) }) } : undefined}
          minWidth="min-w-[860px]"
        />
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? t('admin:events.form.createTitle') : t('admin:events.form.editTitle')}>
        {editing !== null && (
          <EventForm
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

function EventForm({ target, onClose, onDone }: { target: AdminEvent | 'new'; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const existing = target === 'new' ? null : target;
  // Read once, when the form opens: a started event keeps its text, language and start.
  const [now] = useState(() => Date.now());
  const locked = existing !== null && eventHasStarted(existing, now);

  const [slug, setSlug] = useState(existing?.slug ?? '');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [language, setLanguage] = useState<string>(existing?.language ?? 'en');
  const [text, setText] = useState(existing?.text ?? '');
  const [startsAt, setStartsAt] = useState(existing ? toLocalInput(existing.startsAt) : localNow());
  const [endsAt, setEndsAt] = useState(existing ? toLocalInput(existing.endsAt) : '');

  const titleLength = title.trim().length;
  const textLength = text.trim().length;
  const startIso = fromLocalInput(startsAt);
  const endIso = fromLocalInput(endsAt);
  const endBeforeStart = startIso !== null && endIso !== null && Date.parse(endIso) <= Date.parse(startIso);
  const slugOk = existing !== null || SLUG_RE.test(slug);
  const valid =
    slugOk &&
    titleLength >= 1 &&
    titleLength <= TITLE_MAX &&
    description.trim().length <= DESCRIPTION_MAX &&
    (locked || (textLength >= TEXT_MIN && textLength <= TEXT_MAX)) &&
    startIso !== null &&
    endIso !== null &&
    !endBeforeStart;

  const mutation = useMutation({
    mutationFn: (input: { create: EventCreateInput } | { update: EventUpdateInput }) =>
      'create' in input ? adminApi.createEvent(input.create) : adminApi.updateEvent(existing!.id, input.update),
    onSuccess: () => {
      toast(t(existing ? 'admin:toast.eventUpdated' : 'admin:toast.eventCreated'));
      onDone();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || startIso === null || endIso === null || mutation.isPending) return;
    const common = { title: title.trim(), description: description.trim(), endsAt: endIso };
    if (!existing) {
      mutation.mutate({ create: { slug, ...common, language, text: text.trim(), startsAt: startIso } });
      return;
    }
    // Only what changed is sent. A started event's locked fields are left out entirely.
    const patch: EventUpdateInput = {};
    if (title.trim() !== existing.title) patch.title = title.trim();
    if (description.trim() !== existing.description) patch.description = description.trim();
    // Compared as the minute-precision local value the form shows, so an unchanged end is not re-sent.
    if (endsAt !== toLocalInput(existing.endsAt)) patch.endsAt = endIso;
    if (!locked) {
      if (language !== existing.language) patch.language = language;
      if (text.trim() !== existing.text) patch.text = text.trim();
      if (startsAt !== toLocalInput(existing.startsAt)) patch.startsAt = startIso;
    }
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    mutation.mutate({ update: patch });
  }

  return (
    <form className="flex max-h-[62vh] flex-col gap-4" onSubmit={submit}>
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
        {locked && <Notice tone="info">{t('admin:events.form.startedNote')}</Notice>}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="event-slug" className="text-[0.9rem] text-sub">
              {t('admin:events.form.slug')}
            </label>
            <input
              id="event-slug"
              value={slug}
              disabled={existing !== null}
              maxLength={40}
              aria-describedby="event-slug-hint"
              onChange={(e) => setSlug(e.target.value)}
              className="h-10 rounded-[6px] bg-bg px-3 font-mono text-text outline-none disabled:opacity-50"
            />
            <p id="event-slug-hint" className="text-[0.85rem] text-sub">
              {t('admin:events.form.slugHint')}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="event-title" className="text-[0.9rem] text-sub">
              {t('admin:events.form.title')}
            </label>
            <input
              id="event-title"
              value={title}
              maxLength={TITLE_MAX}
              onChange={(e) => setTitle(e.target.value)}
              className="h-10 rounded-[6px] bg-bg px-3 text-text outline-none"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="event-description" className="text-[0.9rem] text-sub">
            {t('admin:events.form.description')}
          </label>
          <textarea
            id="event-description"
            rows={2}
            value={description}
            maxLength={DESCRIPTION_MAX}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded-[6px] bg-bg px-3 py-2.5 text-text outline-none"
          />
          <p className="tabular text-right text-[0.85rem] text-sub">{t('admin:events.counter', { n: description.length, max: DESCRIPTION_MAX })}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="event-language" className="text-[0.9rem] text-sub">
              {t('admin:events.form.language')}
            </label>
            <select
              id="event-language"
              value={language}
              disabled={locked}
              onChange={(e) => setLanguage(e.target.value)}
              className="h-10 rounded-[6px] bg-bg px-3 text-text outline-none disabled:opacity-50"
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {languageLabel(l)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="event-text" className="text-[0.9rem] text-sub">
              {t('admin:events.form.text')}
            </label>
            <textarea
              id="event-text"
              rows={4}
              value={text}
              disabled={locked}
              maxLength={TEXT_MAX}
              aria-describedby="event-text-hint"
              onChange={(e) => setText(e.target.value)}
              className="rounded-[6px] bg-bg px-3 py-2.5 text-text outline-none disabled:opacity-50"
            />
            <p id="event-text-hint" className="flex flex-wrap justify-between gap-2 text-[0.85rem] text-sub">
              <span>{t('admin:events.form.textHint')}</span>
              <span className="tabular">{t('admin:events.counter', { n: textLength, max: TEXT_MAX })}</span>
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="event-starts" className="text-[0.9rem] text-sub">
              {t('admin:events.form.startsAt')}
            </label>
            <input
              id="event-starts"
              type="datetime-local"
              value={startsAt}
              disabled={locked}
              onChange={(e) => setStartsAt(e.target.value)}
              className="h-10 rounded-[6px] bg-bg px-3 text-text outline-none disabled:opacity-50"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="event-ends" className="text-[0.9rem] text-sub">
              {t('admin:events.form.endsAt')}
            </label>
            <input
              id="event-ends"
              type="datetime-local"
              value={endsAt}
              aria-invalid={endBeforeStart}
              onChange={(e) => setEndsAt(e.target.value)}
              className="h-10 rounded-[6px] bg-bg px-3 text-text outline-none"
            />
          </div>
        </div>

      </div>
      <div className="flex shrink-0 flex-col gap-4">
        {endBeforeStart && <Notice>{t('admin:events.form.endsAfter')}</Notice>}
        {mutation.error && <Notice>{errorText(mutation.error, t)}</Notice>}
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            {t('common:cancel')}
          </Button>
          <Button type="submit" disabled={!valid || mutation.isPending}>
            {mutation.isPending ? t('admin:actions.working') : existing ? t('admin:events.form.save') : t('admin:events.form.create')}
          </Button>
        </div>
      </div>
    </form>
  );
}
