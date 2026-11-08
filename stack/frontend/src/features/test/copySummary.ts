import type { Mode, TestConfig, TestResult } from '@/lib/engine/types';

/** Mode name and value for the summary's first line, e.g. "time 30". Written in English, like the rest of the copied text. */
function modeLabel(cfg: TestConfig, date: string): string {
  const name: Record<Mode, string> = {
    time: 'time',
    words: 'words',
    quote: 'quote',
    zen: 'zen',
    pangram: 'pangram',
    custom: 'custom',
    daily: 'daily',
    weak: 'weak keys',
  };
  switch (cfg.mode) {
    case 'time':
      return `${name.time} ${cfg.time}`;
    case 'words':
      return `${name.words} ${cfg.words}`;
    case 'quote':
      return `${name.quote} ${cfg.quoteLength}`;
    case 'pangram':
      return `${name.pangram} ${cfg.pangramCount}`;
    case 'daily':
      return `${name.daily} ${date}`;
    default:
      return name[cfg.mode];
  }
}

/**
 * Plain-text summary of a result, for pasting:
 *   ParroType · time 30 · en
 *   92 wpm · 97% acc · raw 98 · consistency 81%
 */
export function summaryText(cfg: TestConfig, r: TestResult, date: string): string {
  const first = ['ParroType', modeLabel(cfg, date), cfg.language];
  if (cfg.punctuation) first.push('punctuation');
  if (cfg.numbers) first.push('numbers');
  const second = [
    `${Math.round(r.wpm)} wpm`,
    `${Math.round(r.accuracy)}% acc`,
    `raw ${Math.round(r.rawWpm)}`,
    `consistency ${Math.round(r.consistency)}%`,
  ];
  return `${first.join(' · ')}\n${second.join(' · ')}`;
}

/** Writes with the async clipboard API, or with a hidden textarea when that is missing or refused. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission refused or not a secure context: try the fallback below.
  }
  return fallbackCopy(text);
}

export function fallbackCopy(text: string): boolean {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false;
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '0';
  area.style.left = '-9999px';
  area.style.opacity = '0';
  document.body.appendChild(area);
  let ok = false;
  try {
    area.select();
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  } finally {
    area.remove();
  }
  return ok;
}
