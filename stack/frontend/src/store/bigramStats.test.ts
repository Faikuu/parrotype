import { sanitizeBigrams, useBigramStats } from './bigramStats';

beforeEach(() => {
  window.localStorage.clear();
  useBigramStats.setState({ byLanguage: {} });
});

describe('useBigramStats', () => {
  it('folds each test into the running totals, per language', () => {
    useBigramStats.getState().record({ th: { total: 300, count: 3 } }, 'en');
    useBigramStats.getState().record({ th: { total: 100, count: 1 } }, 'en');
    useBigramStats.getState().record({ ąć: { total: 50, count: 1 } }, 'pl');

    const en = useBigramStats.getState().byLanguage.en?.th;
    // Old totals decay (0.9) before the new test is added.
    expect(en?.total).toBeCloseTo(300 * 0.9 + 100);
    expect(en?.count).toBeCloseTo(3 * 0.9 + 1);
    expect(useBigramStats.getState().byLanguage.pl).toEqual({ ąć: { total: 50, count: 1 } });
  });

  it('ignores an empty test', () => {
    useBigramStats.getState().record({}, 'en');
    expect(useBigramStats.getState().byLanguage).toEqual({});
  });

  it('drops invalid stored entries', () => {
    const clean = sanitizeBigrams({
      byLanguage: {
        en: { th: { total: 10, count: 2 }, toolong: { total: 1, count: 1 }, he: { total: 'x', count: 1 }, zz: { total: 1, count: 0 } },
        fr: { th: { total: 1, count: 1 } },
      },
    });
    expect(clean).toEqual({ byLanguage: { en: { th: { total: 10, count: 2 } } } });
    expect(sanitizeBigrams('garbage')).toEqual({ byLanguage: {} });
  });
});
