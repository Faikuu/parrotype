import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import { cn } from '@/components/cn';
import { absoluteBadgeUrl, badgeUrl, type BadgeMode } from '@/lib/api';
import { BOARD_LANGUAGES, LANGUAGE_NAMES, optionLabel, type BoardLanguage, type Tr } from './labels';

/** The options a badge can show, the same ones the leaderboard offers. */
const OPTIONS: Record<BadgeMode, string[]> = {
  time: ['15', '30', '60', '120'],
  words: ['10', '25', '50', '100'],
};
const MODES: BadgeMode[] = ['time', 'words'];

/**
 * The badge for a signed-in user: a live preview of the SVG and copyable Markdown and HTML. Snippets use
 * absolute URLs built from the current origin, so they work when pasted on another site.
 */
export function BadgeEmbed({ name }: { name: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'en';
  const [mode, setMode] = useState<BadgeMode>('time');
  const [mode2, setMode2] = useState('60');
  const [language, setLanguage] = useState<BoardLanguage>('en');
  const [imageFailed, setImageFailed] = useState(false);
  const tr: Tr = (k, o) => String(t(k, o));

  const origin = window.location.origin;
  const src = badgeUrl(name, mode, mode2, language);
  const imageUrl = absoluteBadgeUrl(name, mode, mode2, language, origin);
  const profileUrl = `${origin}/u/${encodeURIComponent(name)}`;
  const alt = t('account:badge.alt', { name });
  const markdown = `[![ParroType](${imageUrl})](${profileUrl})`;
  const html = `<a href="${profileUrl}"><img src="${imageUrl}" alt="ParroType" /></a>`;

  function pickMode(next: BadgeMode) {
    setMode(next);
    setMode2(OPTIONS[next][OPTIONS[next].length - 2] ?? '60');
    setImageFailed(false);
  }

  return (
    <div className="flex flex-col gap-8">
      <p className="text-[0.9rem] text-sub">{t('account:badge.caption')}</p>

      <div className="flex flex-col gap-4">
        <Group label={t('account:badge.mode')}>
          {MODES.map((m) => (
            <Pill key={m} active={mode === m} onClick={() => pickMode(m)}>
              {t(`account:badge.modes.${m}`)}
            </Pill>
          ))}
        </Group>
        <Group label={t('account:badge.option')}>
          {OPTIONS[mode].map((o) => (
            <Pill
              key={o}
              active={mode2 === o}
              onClick={() => {
                setMode2(o);
                setImageFailed(false);
              }}
            >
              {optionLabel(mode === 'time' ? 'time' : 'words', o, tr, lang)}
            </Pill>
          ))}
        </Group>
        <Group label={t('account:badge.language')}>
          {BOARD_LANGUAGES.map((code) => (
            <Pill
              key={code}
              active={language === code}
              onClick={() => {
                setLanguage(code);
                setImageFailed(false);
              }}
            >
              {LANGUAGE_NAMES[code]}
            </Pill>
          ))}
        </Group>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[0.9rem] text-sub">{t('account:badge.preview')}</p>
        <div className="flex min-h-[40px] items-center rounded-[10px] bg-surface/60 p-4">
          {imageFailed ? (
            <p className="text-sub">{t('account:badge.noResult')}</p>
          ) : (
            <img
              src={src}
              alt={alt}
              width={240}
              height={40}
              onError={() => setImageFailed(true)}
              className="h-10 w-auto"
            />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <Snippet label={t('account:badge.markdown')} value={markdown} copyLabel={t('account:badge.copy')} copiedLabel={t('account:badge.copied')} failedLabel={t('account:badge.copyFailed')} />
        <Snippet label={t('account:badge.html')} value={html} copyLabel={t('account:badge.copy')} copiedLabel={t('account:badge.copied')} failedLabel={t('account:badge.copyFailed')} />
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1 rounded-[10px] bg-surface/60 p-1">
      {children}
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-[6px] px-3 py-1 text-[0.95rem] transition-colors',
        active ? 'text-main' : 'text-sub hover:text-text',
      )}
    >
      {children}
    </button>
  );
}

function Snippet({
  label,
  value,
  copyLabel,
  copiedLabel,
  failedLabel,
}: {
  label: string;
  value: string;
  copyLabel: string;
  copiedLabel: string;
  failedLabel: string;
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState('copied');
    } catch {
      setState('failed');
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[0.9rem] text-sub">{label}</span>
        <Button variant="ghost" className="px-2 py-1 text-[0.9rem]" onClick={() => void copy()}>
          {copyLabel}
        </Button>
      </div>
      <textarea
        readOnly
        aria-label={label}
        rows={2}
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full resize-none rounded-[6px] bg-surface px-3 py-2 font-mono text-[0.85rem] text-text outline-none"
      />
      <p role="status" className="min-h-[1.25rem] text-[0.85rem] text-sub">
        {state === 'copied' ? copiedLabel : state === 'failed' ? <span className="text-error">{failedLabel}</span> : ''}
      </p>
    </div>
  );
}
