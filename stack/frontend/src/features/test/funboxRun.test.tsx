import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRng } from '@/lib/text/rng';
import { DEFAULT_SETTINGS, useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';
import { reverseWord } from './funbox';
import { useTypingTest } from './useTypingTest';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

/** A run's words, with Math.random seeded, so two runs draw the same words. */
function wordsWith(funbox: Array<'reverse' | 'mirror' | 'caps' | 'memory'>, seed: number): { words: string[]; submitted: number } {
  const spy = vi.spyOn(Math, 'random').mockImplementation(createRng(seed));
  const submitted = { count: 0 };
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).endsWith('/results') && init?.method === 'POST') submitted.count += 1;
    return new Response(JSON.stringify({ message: 'x' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  useSettings.setState({ ...DEFAULT_SETTINGS, focusMode: false, mode: 'words', words: 10, funbox });
  const { result, unmount } = renderHook(() => useTypingTest(), { wrapper });
  const words = [...result.current.state.words];
  unmount();
  spy.mockRestore();
  return { words, submitted: submitted.count };
}

beforeEach(() => {
  useUi.setState({ commandLineOpen: false, customTextOpen: false, isTyping: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('funbox runs', () => {
  it('reverse types each word backwards (the same words, drawn the same way)', () => {
    const plain = wordsWith([], 99);
    const reversed = wordsWith(['reverse'], 99);
    expect(reversed.words).toEqual(plain.words.map(reverseWord));
  });

  it('mirror leaves the words as they are', () => {
    const plain = wordsWith([], 5);
    const mirrored = wordsWith(['mirror'], 5);
    expect(mirrored.words).toEqual(plain.words);
  });

  it('a funboxed test is not submitted, and says so', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date('2026-11-09T12:00:00Z'));
    const posts: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).endsWith('/results') && init?.method === 'POST') posts.push(String(init.body));
        if (String(url).endsWith('/auth/me')) {
          return new Response(JSON.stringify({ user: { id: 1, name: 'me', email: 'me@example.com', permissions: [], createdAt: '2026-01-01T00:00:00Z' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ message: 'x' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }),
    );
    useSettings.setState({ ...DEFAULT_SETTINGS, focusMode: false, mode: 'time', time: 15, funbox: ['caps'] });
    const { result } = renderHook(() => useTypingTest(), { wrapper });
    act(() => result.current.typeText('x'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_500);
    });
    expect(result.current.state.status).toBe('finished');
    for (let i = 0; i < 20 && result.current.saveState.status === 'idle'; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20);
      });
    }
    expect(result.current.saveState).toEqual({ status: 'skipped', reason: 'funbox' });
    expect(posts).toHaveLength(0);
    expect(result.current.result?.isPersonalBest).toBe(false);
    vi.useRealTimers();
  });
});
