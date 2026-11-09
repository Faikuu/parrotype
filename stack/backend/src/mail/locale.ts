/** The languages the transactional emails are written in. Anything else gets English. */
export const MAIL_LANGUAGES = ['en', 'pl', 'de', 'es'] as const;
export type MailLanguage = (typeof MAIL_LANGUAGES)[number];

/**
 * Picks the best supported language from an Accept-Language header (e.g. "pl-PL,pl;q=0.9,en;q=0.5").
 * Ties keep the order the header lists them in. Returns 'en' when nothing matches.
 */
export function pickMailLanguage(acceptLanguage: string | undefined | null): MailLanguage {
  if (!acceptLanguage) return 'en';
  const ranked = acceptLanguage
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';');
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const q = qParam ? Number(qParam.slice(2)) : 1;
      return { primary: tag.trim().toLowerCase().split('-')[0], q: Number.isFinite(q) ? q : 0, index };
    })
    .filter((entry) => entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const { primary } of ranked) {
    const match = MAIL_LANGUAGES.find((lang) => lang === primary);
    if (match) return match;
  }
  return 'en';
}
