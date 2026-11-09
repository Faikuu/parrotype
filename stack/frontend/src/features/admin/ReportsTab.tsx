import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/Button';
import { cn } from '@/components/cn';
import { Modal } from '@/components/Modal';
import { formatDateTime, formatNumber } from '@/features/account/format';
import { languageLabel, modeLabel, optionLabel, type Tr } from '@/features/account/labels';
import { ApiError, adminApi } from '@/lib/api';
import type { AdminReport, ReportStatus } from '@/lib/api/types';

const STATUSES: ReportStatus[] = ['open', 'resolved', 'dismissed'];
const BAN_REASON_MAX = 200;

export function ReportsTab() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const qc = useQueryClient();
  const [status, setStatus] = useState<ReportStatus>('open');
  const [notice, setNotice] = useState<string | null>(null);
  const [banTarget, setBanTarget] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['admin', 'reports', status],
    queryFn: ({ signal }) => adminApi.reports(status, signal),
  });

  /** Every write refreshes the list and the audit log, and reports its failure in one place. */
  function settle() {
    void qc.invalidateQueries({ queryKey: ['admin'] });
  }
  const onFail = (err: unknown) => setNotice(errorMessage(err, t));
  const onDone = () => setNotice(null);

  const decide = useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'resolve' | 'dismiss' }) =>
      action === 'resolve' ? adminApi.resolveReport(id) : adminApi.dismissReport(id),
    onSuccess: () => {
      onDone();
      settle();
    },
    onError: onFail,
  });

  const unban = useMutation({
    mutationFn: (name: string) => adminApi.unban(name),
    onSuccess: () => {
      onDone();
      settle();
    },
    onError: onFail,
  });

  const removeResult = useMutation({
    mutationFn: (id: number) => adminApi.deleteResult(id),
    onSuccess: () => {
      onDone();
      settle();
    },
    onError: onFail,
  });

  const ban = useMutation({
    mutationFn: ({ name, reason }: { name: string; reason: string }) => adminApi.ban(name, reason),
    onSuccess: () => {
      setBanTarget(null);
      onDone();
      settle();
    },
  });

  const busy = decide.isPending || unban.isPending || removeResult.isPending;

  return (
    <div className="flex flex-col gap-6">
      <div role="group" aria-label={t('admin:filter.label')} className="flex w-fit gap-1 rounded-[10px] bg-surface/60 p-1">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
            className={cn(
              'rounded-[6px] px-3 py-1 text-[0.95rem] transition-colors',
              status === s ? 'text-main' : 'text-sub hover:text-text',
            )}
          >
            {t(`admin:filter.${s}`)}
          </button>
        ))}
      </div>

      {notice && (
        <p role="alert" className="text-error">
          {notice}
        </p>
      )}

      {query.isPending ? (
        <p className="text-sub">{t('common:loading')}</p>
      ) : query.isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-4">
          <p className="text-error">{t('admin:errors.load')}</p>
          <Button variant="ghost" onClick={() => void query.refetch()}>
            {t('admin:retry')}
          </Button>
        </div>
      ) : query.data.length === 0 ? (
        <p className="text-text">{t(`admin:empty.${status}`)}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left">
            <thead>
              <tr className="text-[0.9rem] text-sub">
                <th scope="col" className="py-2 pr-4 font-normal">{t('admin:cols.date')}</th>
                <th scope="col" className="py-2 pr-4 font-normal">{t('admin:cols.reporter')}</th>
                <th scope="col" className="py-2 pr-4 font-normal">{t('admin:cols.target')}</th>
                <th scope="col" className="py-2 pr-4 font-normal">{t('admin:cols.reason')}</th>
                <th scope="col" className="py-2 pr-4 font-normal">{t('admin:cols.details')}</th>
                <th scope="col" className="py-2 pr-4 font-normal">{t('admin:cols.results')}</th>
                <th scope="col" className="py-2 font-normal">{t('admin:cols.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((report) => (
                <ReportRow
                  key={report.id}
                  report={report}
                  lang={lang}
                  busy={busy}
                  onDecide={(action) => decide.mutate({ id: report.id, action })}
                  onBan={() => {
                    ban.reset();
                    setBanTarget(report.target.name);
                  }}
                  onUnban={() => unban.mutate(report.target.name)}
                  onDeleteResult={(id) => removeResult.mutate(id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <BanDialog
        name={banTarget}
        pending={ban.isPending}
        error={ban.error ? errorMessage(ban.error, t) : null}
        onClose={() => setBanTarget(null)}
        onSubmit={(reason) => {
          if (banTarget) ban.mutate({ name: banTarget, reason });
        }}
      />
    </div>
  );
}

interface ReportRowProps {
  report: AdminReport;
  lang: string;
  busy: boolean;
  onDecide: (action: 'resolve' | 'dismiss') => void;
  onBan: () => void;
  onUnban: () => void;
  onDeleteResult: (id: number) => void;
}

function ReportRow({ report, lang, busy, onDecide, onBan, onUnban, onDeleteResult }: ReportRowProps) {
  const { t } = useTranslation();
  const tr: Tr = (k, o) => String(t(k, o));
  const { target } = report;
  const suspended = target.bannedAt !== null;
  const open = report.status === 'open';

  return (
    <tr className="border-t border-surface align-top">
      <td className="py-3 pr-4 whitespace-nowrap text-sub">
        <time dateTime={report.createdAt}>{formatDateTime(report.createdAt, lang)}</time>
      </td>
      <td className="py-3 pr-4 text-text">{report.reporter.name}</td>
      <td className="py-3 pr-4">
        <Link to={`/u/${encodeURIComponent(target.name)}`} className="text-main underline-offset-4 hover:underline">
          {target.name}
        </Link>
        {suspended && (
          <p className="mt-1 text-[0.85rem] text-error">
            {t('admin:suspended')}
            {target.banReason ? ` · ${t('admin:suspendedReason', { reason: target.banReason })}` : ''}
          </p>
        )}
      </td>
      <td className="py-3 pr-4 text-text">{t(`admin:reasons.${report.reason}`)}</td>
      <td className="py-3 pr-4 max-w-[240px] text-sub">
        {report.details ? <span className="whitespace-pre-wrap break-words">{report.details}</span> : t('admin:noDetails')}
      </td>
      <td className="py-3 pr-4">
        {report.targetResults.length === 0 ? (
          <span className="text-sub">{t('admin:noResults')}</span>
        ) : (
          <ul className="flex flex-col gap-2">
            {report.targetResults.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 text-[0.9rem]">
                <span className="tabular text-text">{formatNumber(r.wpm, lang)}</span>
                <span className="text-sub">{resultLabel(r.mode, r.mode2, r.language, tr, lang)}</span>
                <ConfirmButton
                  disabled={busy}
                  label={t('admin:actions.deleteResult')}
                  question={t('admin:actions.confirmDelete')}
                  confirmLabel={t('admin:actions.confirm')}
                  cancelLabel={t('admin:actions.cancel')}
                  onConfirm={() => onDeleteResult(r.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </td>
      <td className="py-3">
        <div className="flex flex-col items-start gap-2">
          {open && (
            <>
              <Button variant="ghost" disabled={busy} onClick={() => onDecide('resolve')}>
                {t('admin:actions.resolve')}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => onDecide('dismiss')}>
                {t('admin:actions.dismiss')}
              </Button>
            </>
          )}
          {suspended ? (
            <Button variant="ghost" disabled={busy} onClick={onUnban}>
              {t('admin:actions.unban')}
            </Button>
          ) : (
            <Button variant="ghost" disabled={busy} onClick={onBan}>
              {t('admin:actions.ban')}
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

/** A destructive button that asks once more before it acts. */
function ConfirmButton({
  label,
  question,
  confirmLabel,
  cancelLabel,
  disabled,
  onConfirm,
}: {
  label: string;
  question: string;
  confirmLabel: string;
  cancelLabel: string;
  disabled: boolean;
  onConfirm: () => void;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button variant="ghost" className="px-2 py-1 text-[0.85rem]" disabled={disabled} onClick={() => setAsking(true)}>
        {label}
      </Button>
    );
  }
  return (
    <span role="group" aria-label={question} className="flex flex-wrap items-center gap-2">
      <span className="text-error">{question}</span>
      <Button
        className="px-2 py-1 text-[0.85rem]"
        disabled={disabled}
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </Button>
      <Button variant="ghost" className="px-2 py-1 text-[0.85rem]" onClick={() => setAsking(false)}>
        {cancelLabel}
      </Button>
    </span>
  );
}

function resultLabel(mode: string, mode2: string, language: string, tr: Tr, lang: string): string {
  return [modeLabel(mode, tr), optionLabel(mode, mode2, tr, lang), languageLabel(language)].filter(Boolean).join(', ');
}

/** Ban asks for a reason (1 to 200 characters) before it sends anything. */
function BanDialog({
  name,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  name: string | null;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal open={name !== null} onClose={onClose} title={t('admin:ban.title', { name: name ?? '' })}>
      <BanForm key={name ?? ''} pending={pending} error={error} onClose={onClose} onSubmit={onSubmit} />
    </Modal>
  );
}

function BanForm({
  pending,
  error,
  onClose,
  onSubmit,
}: {
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const { t } = useTranslation();
  const fieldId = useId();
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (trimmed.length === 0 || pending) return;
        onSubmit(trimmed);
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={fieldId} className="text-[0.9rem] text-sub">
          {t('admin:ban.reason')}
        </label>
        <textarea
          id={fieldId}
          data-autofocus
          rows={3}
          maxLength={BAN_REASON_MAX}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-describedby={`${fieldId}-hint`}
          className="rounded-[6px] bg-surface px-3 py-2.5 text-text outline-none"
        />
        <p id={`${fieldId}-hint`} className="text-[0.85rem] text-sub">
          {t('admin:ban.hint')}
        </p>
      </div>
      {error && (
        <p role="alert" className="text-error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          {t('admin:ban.cancel')}
        </Button>
        <Button type="submit" disabled={trimmed.length === 0 || pending}>
          {pending ? t('admin:ban.submitting') : t('admin:ban.submit')}
        </Button>
      </div>
    </form>
  );
}

/** 409 means the change was already made; 400 carries the server's reason (for example, an admin can't be banned). */
function errorMessage(err: unknown, t: (k: string) => string): string {
  if (err instanceof ApiError && err.status === 409) return t('admin:errors.conflict');
  if (err instanceof ApiError && err.status === 400 && err.message) return err.message;
  return t('admin:errors.action');
}
