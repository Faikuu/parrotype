import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { copyText } from '@/features/test/copySummary';
import { useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';
import { contrastWarnings, type ContrastWarning } from './contrast';
import { decodeThemeCode, encodeThemeCode, TOKEN_KEYS } from './themeCode';
import { resolveTheme, type ThemeTokens } from './themes';

/** Field order in the editor, from the page background to the error colours. */
const FIELDS: readonly (keyof ThemeTokens)[] = TOKEN_KEYS;

/** Opened from the command line (Theme → Customise theme). Mounted once in Layout. */
export function ThemeEditor() {
  const open = useUi((s) => s.themeEditorOpen);
  if (!open) return null;
  return <ThemeEditorForm />;
}

function ThemeEditorForm() {
  const { t } = useTranslation();
  const saved = useSettings(useShallow((s) => ({ theme: s.theme, customTheme: s.customTheme })));
  const setMany = useSettings((s) => s.setMany);
  const setDraft = useUi((s) => s.setThemeDraft);
  const closeEditor = useUi((s) => s.closeThemeEditor);
  const idPrefix = useId();

  // Start from whatever is active right now, so the first edit changes one colour and nothing else.
  const [tokens, setTokens] = useState<ThemeTokens>(() => ({ ...resolveTheme(saved.theme, saved.customTheme).tokens }));
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean | null>(null);
  const [importText, setImportText] = useState('');
  const [importFailed, setImportFailed] = useState(false);
  const [imported, setImported] = useState(false);
  const exportRef = useRef<HTMLButtonElement>(null);

  // Live preview: the page shows the draft while the editor is open.
  useEffect(() => {
    setDraft(tokens);
  }, [tokens, setDraft]);

  // Closing the editor by any route (Save, Cancel, Esc, unmount) drops the draft, so the saved theme comes back.
  useEffect(() => () => setDraft(null), [setDraft]);

  // Escape is handled by the dialog, but focus can leave it (the clipboard fallback removes a textarea that had
  // focus). The dialog marks an Escape it handled with preventDefault, so this only catches the rest.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) closeEditor();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closeEditor]);

  const warnings = useMemo(() => contrastWarnings(tokens), [tokens]);

  function setField(key: keyof ThemeTokens, value: string) {
    setTokens((prev) => ({ ...prev, [key]: value.toLowerCase() }));
    setImported(false);
  }

  function save() {
    setMany({ customTheme: tokens, theme: 'custom' });
    setDraft(null);
    closeEditor();
  }

  async function exportCode() {
    const text = encodeThemeCode(tokens);
    setCode(text);
    setCopied(await copyText(text));
    // The copy fallback moves focus; put it back on the button that started the export.
    exportRef.current?.focus();
  }

  function importCode() {
    const parsed = decodeThemeCode(importText);
    if (!parsed) {
      setImportFailed(true);
      setImported(false);
      return;
    }
    setImportFailed(false);
    setTokens(parsed);
    setImported(true);
  }

  return (
    <Modal open onClose={closeEditor} title={t('themeEditor:title')}>
      <div className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 text-[0.9rem] text-sub">{t('themeEditor:colours')}</legend>
          {FIELDS.map((key, i) => {
            const id = `${idPrefix}-${key}`;
            return (
              <div key={key} className="flex items-center justify-between gap-4">
                <label htmlFor={id} className="text-[0.95rem]">
                  {t(`themeEditor:fields.${key}`)}
                </label>
                <div className="flex items-center gap-3">
                  <span className="tabular text-[0.85rem] text-sub" aria-hidden="true">
                    {tokens[key]}
                  </span>
                  <input
                    id={id}
                    type="color"
                    value={tokens[key]}
                    data-autofocus={i === 0 ? '' : undefined}
                    onChange={(e) => setField(key, e.target.value)}
                    className="size-9 cursor-pointer rounded-[6px] border-0 bg-transparent p-0"
                  />
                </div>
              </div>
            );
          })}
        </fieldset>

        <ContrastNotes warnings={warnings} />

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save}>{t('themeEditor:save')}</Button>
          <Button variant="ghost" onClick={closeEditor}>
            {t('common:cancel')}
          </Button>
          <Button ref={exportRef} variant="ghost" onClick={() => void exportCode()}>
            {t('themeEditor:export')}
          </Button>
          {copied !== null && (
            <span role="status" className="text-[0.9rem] text-sub">
              {copied ? t('themeEditor:copied') : t('themeEditor:copyFailed')}
            </span>
          )}
        </div>
        {code !== null && (
          <input
            readOnly
            aria-label={t('themeEditor:exportedCode')}
            value={code}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-[6px] bg-bg px-3 py-2 text-[0.85rem] text-text outline-none [font-family:var(--font-test)]"
          />
        )}

        <ImportForm
          value={importText}
          onChange={(v) => {
            setImportText(v);
            if (importFailed) setImportFailed(false);
          }}
          onImport={importCode}
          failed={importFailed}
          imported={imported}
        />
      </div>
    </Modal>
  );
}

function ContrastNotes({ warnings }: { warnings: readonly ContrastWarning[] }) {
  const { t } = useTranslation();
  if (warnings.length === 0) return null;
  return (
    <div role="status" className="flex flex-col gap-1 text-[0.9rem] text-error">
      {warnings.map((w) => (
        <p key={w.pair} className="m-0">
          {t(w.pair === 'text' ? 'themeEditor:contrastText' : 'themeEditor:contrastSub', {
            ratio: w.ratio.toFixed(1),
            min: w.min,
          })}
        </p>
      ))}
    </div>
  );
}

function ImportForm({
  value,
  onChange,
  onImport,
  failed,
  imported,
}: {
  value: string;
  onChange: (v: string) => void;
  onImport: () => void;
  failed: boolean;
  imported: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onImport();
      }}
    >
      <label htmlFor={id} className="text-[0.9rem] text-sub">
        {t('themeEditor:importLabel')}
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id={id}
          type="text"
          value={value}
          autoComplete="off"
          spellCheck={false}
          placeholder={t('themeEditor:importPlaceholder')}
          aria-invalid={failed ? true : undefined}
          aria-describedby={failed ? errorId : undefined}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 rounded-[6px] bg-bg px-3 py-2 text-[0.9rem] text-text outline-none placeholder:text-sub [font-family:var(--font-test)]"
        />
        <Button type="submit" variant="ghost" disabled={value.trim() === ''}>
          {t('themeEditor:import')}
        </Button>
      </div>
      {failed && (
        <p id={errorId} role="alert" className="m-0 text-[0.9rem] text-error">
          {t('themeEditor:importInvalid')}
        </p>
      )}
      {imported && !failed && (
        <p role="status" className="m-0 text-[0.9rem] text-sub">
          {t('themeEditor:imported')}
        </p>
      )}
    </form>
  );
}
