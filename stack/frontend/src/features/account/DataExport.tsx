import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { ApiError, resultsApi } from '@/lib/api';
import type { ExportFormat } from '@/lib/api/types';

/** Saves a blob through a temporary object URL and a download link. */
function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking straight away can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DataExport() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(format: ExportFormat) {
    setBusy(format);
    setError(null);
    try {
      const { blob, filename } = await resultsApi.export(format);
      saveBlob(blob, filename ?? `parrotype-results.${format}`);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? t('account:data.tooMany')
          : t('account:data.failed'),
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <h3 className="text-[1rem] font-semibold text-text">{t('account:data.heading')}</h3>
      <p className="mt-1 text-[0.9rem] text-sub">{t('account:data.body')}</p>
      <div className="mt-4 flex flex-wrap gap-3" aria-busy={busy !== null}>
        {(['csv', 'json'] as const).map((format) => (
          <Button
            key={format}
            variant="ghost"
            className="border border-surface text-text hover:text-main"
            disabled={busy !== null}
            onClick={() => void download(format)}
          >
            {busy === format ? t('account:data.busy') : t(`account:data.${format}`)}
          </Button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
