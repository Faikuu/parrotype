// Labels shared by the account, profile and leaderboard pages.
// Languages are named in their own language, and the list covers all four.

export const BOARD_LANGUAGES = ['en', 'pl', 'de', 'es'] as const;
export type BoardLanguage = (typeof BOARD_LANGUAGES)[number];

export const LANGUAGE_NAMES: Record<BoardLanguage, string> = {
  en: 'English',
  pl: 'Polski',
  de: 'Deutsch',
  es: 'Español',
};

export type Tr = (k: string, o?: Record<string, unknown>) => string;

const SETTINGS_MODES = ['time', 'words', 'quote', 'zen', 'pangram', 'custom'];
const QUOTE_LENGTHS = ['short', 'medium', 'long', 'any'];
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function languageLabel(code: string): string {
  return LANGUAGE_NAMES[code as BoardLanguage] ?? code;
}

/** Formats a YYYY-MM-DD daily date. It is a UTC calendar date, so it is formatted in UTC too. */
export function formatDayOption(ymd: string, lang: string): string {
  const m = DAY_RE.exec(ymd);
  if (!m) return ymd;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeZone: 'UTC' }).format(d);
}

export function modeLabel(mode: string, t: Tr): string {
  if (SETTINGS_MODES.includes(mode)) return t(`settings:modes.${mode}`);
  if (mode === 'daily' || mode === 'weak') return t(`account:modes.${mode}`);
  return mode;
}

/** The sub-option of a result or best: "30 seconds", "25 words", "Short", a daily date. */
export function optionLabel(mode: string, mode2: string | null, t: Tr, lang: string): string {
  if (!mode2) return '';
  if (mode === 'time') return t('settings:seconds', { count: Number(mode2) });
  if (mode === 'words') return t('settings:wordCount', { count: Number(mode2) });
  if (mode === 'quote') return QUOTE_LENGTHS.includes(mode2) ? t(`settings:quoteLengths.${mode2}`) : mode2;
  if (mode === 'pangram' && Number.isFinite(Number(mode2))) {
    return t('settings:pangrams', { count: Number(mode2) });
  }
  if (mode === 'daily') return formatDayOption(mode2, lang);
  return '';
}
