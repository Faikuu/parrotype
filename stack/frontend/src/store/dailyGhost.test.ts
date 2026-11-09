import {
  DAILY_GHOST_KEY,
  dailyGhostKey,
  getDailyGhost,
  pruneDailyGhosts,
  readDailyGhosts,
  saveDailyGhost,
  type DailyGhostMap,
} from './dailyGhost';

const run = (word: string) => ({ words: [word], events: [{ t: 0, k: 'c' as const, ch: word[0] }] });

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pruneDailyGhosts', () => {
  it('keeps only the last three dates, across every language', () => {
    const map: DailyGhostMap = {};
    for (const date of ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04']) {
      map[dailyGhostKey(date, 'en')] = run(date);
      map[dailyGhostKey(date, 'pl')] = run(date);
    }
    const kept = Object.keys(pruneDailyGhosts(map));
    expect(kept.sort()).toEqual(
      ['2026-01-02|en', '2026-01-02|pl', '2026-01-03|en', '2026-01-03|pl', '2026-01-04|en', '2026-01-04|pl'],
    );
  });

  it('keeps everything when there are three dates or fewer', () => {
    const map = { [dailyGhostKey('2026-02-01', 'en')]: run('a'), [dailyGhostKey('2026-02-02', 'de')]: run('b') };
    expect(pruneDailyGhosts(map)).toEqual(map);
  });
});

describe('saveDailyGhost and getDailyGhost', () => {
  it('keeps the first attempt of the day, per language', () => {
    expect(saveDailyGhost('2026-03-01', 'en', run('first'))).toBe(true);
    expect(saveDailyGhost('2026-03-01', 'en', run('second'))).toBe(false);
    expect(saveDailyGhost('2026-03-01', 'pl', run('polish'))).toBe(true);

    expect(getDailyGhost('2026-03-01', 'en')?.words).toEqual(['first']);
    expect(getDailyGhost('2026-03-01', 'pl')?.words).toEqual(['polish']);
    expect(getDailyGhost('2026-03-02', 'en')).toBeNull();
  });

  it('prunes to the last three dates when a fourth is saved', () => {
    saveDailyGhost('2026-04-01', 'en', run('a'));
    saveDailyGhost('2026-04-02', 'en', run('b'));
    saveDailyGhost('2026-04-03', 'en', run('c'));
    saveDailyGhost('2026-04-04', 'en', run('d'));

    const stored = readDailyGhosts();
    expect(Object.keys(stored).sort()).toEqual(['2026-04-02|en', '2026-04-03|en', '2026-04-04|en']);
    const raw = JSON.parse(window.localStorage.getItem(DAILY_GHOST_KEY) ?? '{}') as DailyGhostMap;
    expect(Object.keys(raw)).toHaveLength(3);
  });

  it('leaves out corrupt entries when reading', () => {
    window.localStorage.setItem(
      DAILY_GHOST_KEY,
      JSON.stringify({
        '2026-05-01|en': { words: ['ok'], events: [{ t: 0, k: 'c', ch: 'o' }] },
        '2026-05-01|pl': { words: 'nope', events: [] },
        '2026-05-01|de': { words: ['x'], events: [{ t: 'soon', k: 'c' }] },
        'no-separator': { words: [], events: [] },
      }),
    );
    expect(Object.keys(readDailyGhosts())).toEqual(['2026-05-01|en']);
  });

  it('reads nothing from unparseable storage', () => {
    window.localStorage.setItem(DAILY_GHOST_KEY, '{not json');
    expect(readDailyGhosts()).toEqual({});
    expect(getDailyGhost('2026-05-01', 'en')).toBeNull();
  });

  it('works without storage: a blocked localStorage means no daily ghost, and no crash', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(readDailyGhosts()).toEqual({});
    expect(() => saveDailyGhost('2026-06-01', 'en', run('x'))).not.toThrow();
    expect(getDailyGhost('2026-06-01', 'en')).toBeNull();
  });
});
