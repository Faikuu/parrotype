import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { languageLabel } from '@/features/account/labels';
import { adminApi, type QuoteInput, type QuoteListParams } from '@/lib/api';
import type { AdminQuote } from '@/lib/api/types';
import { ActionConfirm } from '../components/ActionConfirm';
import { DataTable, type Column } from '../components/DataTable';
import { Notice } from '../components/Notice';
import { SearchInput } from '../components/SearchInput';
import { SelectField, Toolbar } from '../components/Toolbar';
import { Tip } from '../components/Tip';
import { useToast } from '../components/useToast';
import { errorText } from '../errors';
import { pageNumber, useUrlState } from '../useUrlState';
import { usePermissions } from '../usePermissions';

const PAGE_SIZE = 25;
const LANGUAGES = ['en', 'pl', 'de', 'es'] as const;
const TEXT_MIN = 10;
const TEXT_MAX = 600;
const SOURCE_MIN = 2;
const SOURCE_MAX = 120;
const DEFAULTS = { language: '', q: '', page: '1' } as const;
type Key = keyof typeof DEFAULTS;

export default function QuotesPage() {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const qc = useQueryClient();
  const { values, update } = useUrlState<Key>(DEFAULTS);
  const page = pageNumber(values.page);
  const [editing, setEditing] = useState<AdminQuote | 'new' | null>(null);

  const params: QuoteListParams = {
    language: values.language || undefined,
    q: values.q || undefined,
    page,
    pageSize: PAGE_SIZE,
  };
  const query = useQuery({
    queryKey: ['admin', 'quotes', params],
    queryFn: ({ signal }) => adminApi.quotes(params, signal),
    placeholderData: (prev) => prev,
  });

  const canManage = can('quotes.manage');
  const manageReason = canManage ? null : t('admin:perm.noPermission');
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin'] });

  const columns: Column<AdminQuote>[] = [
    { id: 'text', header: t('admin:quotes.cols.text'), cell: (q) => <span className="line-clamp-2 block max-w-[420px] text-text">{q.text}</span> },
    { id: 'source', header: t('admin:quotes.cols.source'), cell: (q) => <span className="text-sub">{q.source}</span> },
    { id: 'language', header: t('admin:quotes.cols.language'), cell: (q) => <span className="text-sub">{languageLabel(q.language)}</span> },
    { id: 'length', header: t('admin:quotes.cols.length'), align: 'end', cell: (q) => q.length },
    {
      id: 'actions',
      header: t('admin:quotes.cols.actions'),
      cell: (q) => (
        <div className="flex items-center justify-end gap-1">
          <Tip reason={manageReason}>
            <Button variant="ghost" className="px-2.5 py-1 text-[0.85rem]" disabled={manageReason !== null} onClick={() => setEditing(q)}>
              {t('admin:quotes.edit')}
            </Button>
          </Tip>
          <ActionConfirm
            label={t('admin:quotes.delete.label')}
            title={t('admin:quotes.delete.title')}
            body={t('admin:quotes.delete.body')}
            confirmLabel={t('admin:quotes.delete.confirm')}
            danger
            disabledReason={manageReason}
            run={() => adminApi.deleteQuote(q.id)}
            onDone={() => void refresh()}
            done={t('admin:toast.quoteDeleted')}
            className="px-2.5 py-1 text-[0.85rem]"
          />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[1.6rem] font-semibold text-text">{t('admin:quotes.title')}</h1>
        <Tip reason={manageReason}>
          <Button disabled={manageReason !== null} onClick={() => setEditing('new')}>
            {t('admin:quotes.new')}
          </Button>
        </Tip>
      </div>

      <Toolbar label={t('admin:quotes.filters')}>
        <SearchInput value={values.q} label={t('admin:quotes.search')} placeholder={t('admin:quotes.searchPlaceholder')} onCommit={(q) => update({ q })} />
        <SelectField id="quotes-language" label={t('admin:quotes.languageFilter')} value={values.language} onChange={(language) => update({ language })}>
          <option value="">{t('admin:quotes.anyLanguage')}</option>
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {languageLabel(l)}
            </option>
          ))}
        </SelectField>
      </Toolbar>

      {query.isError ? (
        <Notice>{t('admin:errors.load')}</Notice>
      ) : (
        <DataTable
          caption={t('admin:quotes.title')}
          columns={columns}
          rows={query.data?.items ?? []}
          rowKey={(q) => q.id}
          loading={query.isPending}
          empty={t('admin:quotes.empty')}
          pagination={query.data ? { page, pageSize: PAGE_SIZE, total: query.data.total, onPageChange: (p) => update({ page: String(p) }) } : undefined}
          minWidth="min-w-[760px]"
        />
      )}

      <QuoteDialog
        target={editing}
        onClose={() => setEditing(null)}
        onDone={() => {
          setEditing(null);
          void refresh();
        }}
      />
    </div>
  );
}

function QuoteDialog({ target, onClose, onDone }: { target: AdminQuote | 'new' | null; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const title = target === 'new' ? t('admin:quotes.form.createTitle') : t('admin:quotes.form.editTitle');
  return (
    <Modal open={target !== null} onClose={onClose} title={title}>
      {target !== null && <QuoteForm key={target === 'new' ? 'new' : target.id} target={target} onClose={onClose} onDone={onDone} />}
    </Modal>
  );
}

function QuoteForm({ target, onClose, onDone }: { target: AdminQuote | 'new'; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const existing = target === 'new' ? null : target;
  const [language, setLanguage] = useState<string>(existing?.language ?? 'en');
  const [text, setText] = useState(existing?.text ?? '');
  const [source, setSource] = useState(existing?.source ?? '');
  const textLength = text.trim().length;
  const sourceLength = source.trim().length;
  const valid = textLength >= TEXT_MIN && textLength <= TEXT_MAX && sourceLength >= SOURCE_MIN && sourceLength <= SOURCE_MAX;

  const mutation = useMutation({
    mutationFn: (input: QuoteInput) => (existing ? adminApi.updateQuote(existing.id, input) : adminApi.createQuote(input)),
    onSuccess: () => {
      toast(t(existing ? 'admin:toast.quoteUpdated' : 'admin:toast.quoteCreated'));
      onDone();
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || mutation.isPending) return;
    mutation.mutate({ language, text: text.trim(), source: source.trim() });
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <SelectField id="quote-language" label={t('admin:quotes.form.language')} value={language} onChange={setLanguage} className="bg-bg">
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {languageLabel(l)}
            </option>
          ))}
        </SelectField>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="quote-source" className="text-[0.9rem] text-sub">
            {t('admin:quotes.form.source')}
          </label>
          <input
            id="quote-source"
            value={source}
            maxLength={SOURCE_MAX}
            onChange={(e) => setSource(e.target.value)}
            className="h-10 rounded-[6px] bg-bg px-3 text-text outline-none"
          />
          <p className="tabular text-[0.85rem] text-sub">{t('admin:quotes.form.counter', { n: sourceLength, max: SOURCE_MAX })}</p>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="quote-text" className="text-[0.9rem] text-sub">
          {t('admin:quotes.form.text')}
        </label>
        <textarea
          id="quote-text"
          rows={5}
          value={text}
          maxLength={TEXT_MAX}
          aria-describedby="quote-text-hint"
          onChange={(e) => setText(e.target.value)}
          className="rounded-[6px] bg-bg px-3 py-2.5 text-text outline-none"
        />
        <p id="quote-text-hint" className="flex flex-wrap justify-between gap-2 text-[0.85rem] text-sub">
          <span>{t('admin:quotes.form.textHint', { min: TEXT_MIN, max: TEXT_MAX })}</span>
          <span className="tabular">{t('admin:quotes.form.counter', { n: textLength, max: TEXT_MAX })}</span>
        </p>
      </div>
      {mutation.error && <Notice>{errorText(mutation.error, t)}</Notice>}
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          {t('common:cancel')}
        </Button>
        <Button type="submit" disabled={!valid || mutation.isPending}>
          {mutation.isPending ? t('admin:actions.working') : existing ? t('admin:quotes.form.save') : t('admin:quotes.form.create')}
        </Button>
      </div>
    </form>
  );
}
