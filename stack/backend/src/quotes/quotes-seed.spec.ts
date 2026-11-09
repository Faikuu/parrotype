import { QUOTES } from '../../prisma/seed';

/** Same buckets as the API filter: short < 100, medium 100-250, long > 250. */
function bucket(length: number): 'short' | 'medium' | 'long' {
  if (length < 100) return 'short';
  if (length <= 250) return 'medium';
  return 'long';
}

describe('seed quotes', () => {
  const languages = ['en', 'pl', 'de', 'es'] as const;

  it.each(languages)('has at least one short, medium and long quote for %s', (language) => {
    const buckets = new Set(
      QUOTES.filter((q) => q.language === language).map((q) => bucket(q.text.length)),
    );
    expect(buckets).toEqual(new Set(['short', 'medium', 'long']));
  });

  it('only uses the four supported languages', () => {
    for (const q of QUOTES) expect(languages).toContain(q.language);
  });

  it('has no duplicate texts', () => {
    const texts = QUOTES.map((q) => q.text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('has a source for every quote', () => {
    for (const q of QUOTES) expect(q.source.trim().length).toBeGreaterThan(0);
  });
});
