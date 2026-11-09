import { useTranslation } from 'react-i18next';
import { translateKey, type LayoutId } from '@/lib/text/layouts';
import type { KeyStatsMap, Language } from '@/lib/engine/types';

/** The physical letter keys of a QWERTY board, row by row (KeyboardEvent.code). */
const PHYSICAL_ROWS: readonly (readonly string[])[] = [
  ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP'],
  ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL'],
  ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM'],
];
/** Letters outside QWERTY, shown on an extra row for the languages that use them. */
const EXTRA_ROW: Partial<Record<Language, string>> = { pl: 'ąćęłńóśźż', de: 'äöüß', es: 'ñ' };
/** Indent of each QWERTY row, so the rows stagger like a keyboard. */
const INDENT = ['0', '0.9rem', '1.8rem'];

export interface KeyHeatmapProps {
  stats: KeyStatsMap;
  language: Language;
  /** The layout the test was typed in: each key is labelled with the character it types there. */
  layout?: LayoutId;
}

/**
 * Each key tinted from --surface (no misses) to --error by its miss rate. Keys with no data are faded.
 * The keys stay where they are on the board; their legends are the layout's characters at those positions,
 * so with Dvorak selected the QWERTY S key shows 'o'.
 */
export function KeyHeatmap({ stats, language, layout = 'qwerty' }: KeyHeatmapProps) {
  const { t } = useTranslation();
  const rows: string[][] = PHYSICAL_ROWS.map((codes) => codes.map((code) => translateKey(layout, code, false) ?? ''));
  const extra = EXTRA_ROW[language];
  if (extra) rows.push([...extra]);

  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="m-0 text-[0.85rem] font-normal text-sub">{t('results:missedKeys')}</h3>
      <div className="flex flex-col gap-1">
        {rows.map((row, r) => (
          <div key={r} className="flex gap-1" style={{ paddingLeft: INDENT[r] ?? 0 }}>
            {row.map((ch, k) => {
              const stat = stats[ch];
              const hits = Math.round(stat?.hits ?? 0);
              const misses = Math.round(stat?.misses ?? 0);
              const total = (stat?.hits ?? 0) + (stat?.misses ?? 0);
              const rate = total > 0 ? (stat?.misses ?? 0) / total : 0;
              const title = t('results:keyTooltip', {
                key: ch,
                hits: t('results:hitCount', { count: hits }),
                misses: t('results:missCount', { count: misses }),
              });
              return (
                <span
                  key={`${r}-${k}`}
                  title={title}
                  aria-label={title}
                  data-key={ch}
                  className="grid size-8 place-items-center rounded-[6px] text-[0.85rem] text-text"
                  style={{
                    background: `color-mix(in oklab, var(--error) ${(rate * 100).toFixed(1)}%, var(--surface))`,
                    opacity: total > 0 ? 1 : 0.5,
                  }}
                >
                  {ch}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
