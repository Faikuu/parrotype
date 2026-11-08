import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { dailyWords } from '@/lib/text/daily';
import { useKeyStats } from '@/store/keyStats';
import { useLocalBests } from '@/store/localBests';
import { DEFAULT_SETTINGS, useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';
import { mode2Of, paceTarget, useTypingTest } from './useTypingTest';
import type { TestConfig } from '@/lib/engine/types';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const USER = { id: 1, name: 'typist', email: 't@example.com', createdAt: '2026-01-01T00:00:00Z' };

function wrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

function baseConfig(over: Partial<TestConfig>): TestConfig {
  return {
    mode: 'words',
    time: 30,
    words: 10,
    quoteLength: 'any',
    pangramCount: 1,
    punctuation: false,
    numbers: false,
    language: 'en',
    customText: '',
    stopOnError: 'off',
    ...over,
  };
}

beforeEach(() => {
  useSettings.setState({ ...DEFAULT_SETTINGS, focusMode: false });
  useUi.setState({ commandLineOpen: false, customTextOpen: false, isTyping: false });
  useLocalBests.setState({ bests: {}, recentWpm: [] });
  useKeyStats.setState({ byLanguage: {} });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('mode2Of', () => {
  it('uses the date the words were generated for in daily mode', () => {
    expect(mode2Of(baseConfig({ mode: 'daily' }), '2026-11-07')).toBe('2026-11-07');
  });

  it('uses weak for weak mode and the existing values for the others', () => {
    expect(mode2Of(baseConfig({ mode: 'weak' }), '')).toBe('weak');
    expect(mode2Of(baseConfig({ mode: 'time', time: 60 }), '')).toBe('60');
    expect(mode2Of(baseConfig({ mode: 'words', words: 25 }), '')).toBe('25');
    expect(mode2Of(baseConfig({ mode: 'pangram', pangramCount: 3 }), '')).toBe('3');
  });
});

describe('paceTarget', () => {
  it('is off unless a pace caret is chosen, and never in zen or custom', () => {
    expect(paceTarget({ caret: 'off', customWpm: 60, mode: 'time', average: 80 })).toBeNull();
    expect(paceTarget({ caret: 'custom', customWpm: 60, mode: 'zen', average: 80 })).toBeNull();
    expect(paceTarget({ caret: 'average', customWpm: 60, mode: 'custom', average: 80 })).toBeNull();
  });

  it('uses the higher of the local and server best for pb', () => {
    expect(paceTarget({ caret: 'pb', customWpm: 60, mode: 'time', localBest: 70, serverBest: 88, average: null })).toBe(88);
    expect(paceTarget({ caret: 'pb', customWpm: 60, mode: 'time', localBest: 70, average: null })).toBe(70);
    expect(paceTarget({ caret: 'pb', customWpm: 60, mode: 'time', average: null })).toBeNull();
  });

  it('uses the average, or the custom speed', () => {
    expect(paceTarget({ caret: 'average', customWpm: 60, mode: 'time', average: 75.5 })).toBe(75.5);
    expect(paceTarget({ caret: 'average', customWpm: 60, mode: 'time', average: null })).toBeNull();
    expect(paceTarget({ caret: 'custom', customWpm: 120, mode: 'words', average: null })).toBe(120);
  });
});

describe('useTypingTest daily and weak', () => {
  it('generates the daily text for the UTC date, and keeps that date when the test runs past midnight', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-07T23:59:50Z'));
    const posts: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).endsWith('/auth/me')) return jsonResponse(200, { user: USER });
        if (String(url).endsWith('/results') && init?.method === 'POST') {
          posts.push(JSON.parse(String(init.body)));
          return jsonResponse(201, {});
        }
        return jsonResponse(404, { message: 'Not Found' });
      }),
    );
    useSettings.setState({ mode: 'daily', language: 'en', punctuation: false, numbers: false });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useTypingTest(), { wrapper: wrapper(qc) });

    expect(result.current.runDate).toBe('2026-11-07');
    expect(result.current.state.words).toEqual(dailyWords('2026-11-07', 'en'));

    // Type about half the text, then let the clock pass midnight.
    const text = result.current.state.words.join(' ');
    const half = text.slice(0, Math.floor(text.length / 2));
    act(() => result.current.typeText(half));
    act(() => vi.setSystemTime(new Date('2026-11-08T00:00:10Z')));
    act(() => result.current.typeText(text.slice(half.length)));

    expect(result.current.state.status).toBe('finished');
    expect(result.current.result?.isPersonalBest).toBe(false);
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ mode: 'daily', mode2: '2026-11-07', language: 'en' });
  });

  it('builds weak-key words around the letters the user misses', () => {
    useKeyStats.setState({ byLanguage: { en: { q: { hits: 2, misses: 8 }, e: { hits: 20, misses: 0 } } } });
    useSettings.setState({ mode: 'weak', language: 'en' });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useTypingTest(), { wrapper: wrapper(qc) });

    expect(result.current.state.config.mode).toBe('weak');
    expect(result.current.state.words).toHaveLength(40);
    expect(result.current.state.words.some((w) => w.includes('q'))).toBe(true);
  });

  it('records key stats and the local best when a test finishes, and flags the personal best', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    useSettings.setState({ mode: 'custom', customText: 'ok' });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useTypingTest(), { wrapper: wrapper(qc) });

    act(() => result.current.typeText('o'));
    act(() => vi.setSystemTime(new Date('2026-01-01T00:00:03Z')));
    act(() => result.current.typeText('k'));

    expect(result.current.state.status).toBe('finished');
    // Custom text is not ranked, and nothing was beaten: no personal best, but the stats are kept.
    expect(result.current.result?.isPersonalBest).toBe(false);
    expect(useKeyStats.getState().byLanguage.en?.o).toEqual({ hits: 1, misses: 0 });
    expect(Object.keys(useLocalBests.getState().bests)).toHaveLength(1);
  });
});
