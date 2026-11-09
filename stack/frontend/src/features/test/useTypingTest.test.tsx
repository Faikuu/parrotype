import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DEFAULT_SETTINGS, useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';
import { useTypingTest } from './useTypingTest';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(401, { message: 'Unauthorized' })));
  useSettings.setState({ ...DEFAULT_SETTINGS, focusMode: false });
  useUi.setState({ commandLineOpen: false, customTextOpen: false, isTyping: false });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useTypingTest', () => {
  it('finishes a 15 second time test once the time runs out', () => {
    vi.useFakeTimers();
    useSettings.setState({ mode: 'time', time: 15 });
    const { result } = renderHook(() => useTypingTest(), { wrapper });

    act(() => result.current.typeText('t'));
    expect(result.current.state.status).toBe('running');
    expect(useUi.getState().isTyping).toBe(true);

    act(() => {
      vi.advanceTimersByTime(15_500);
    });
    expect(result.current.state.status).toBe('finished');
    expect(result.current.result?.durationMs).toBe(15_000);
    expect(useUi.getState().isTyping).toBe(false);
  });

  it('saves custom text tests like other modes (not skipped)', async () => {
    // Date only: the test duration comes from Date.now, and waitFor still needs real timers.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    useSettings.setState({ mode: 'custom', customText: 'ok' });
    const { result } = renderHook(() => useTypingTest(), { wrapper });

    act(() => result.current.typeText('o'));
    act(() => vi.setSystemTime(new Date('2026-01-01T00:00:03Z')));
    act(() => result.current.typeText('k'));
    expect(result.current.state.status).toBe('finished');

    // Logged out in this test, so the run is not submitted, but it is not skipped either.
    await waitFor(() => expect(result.current.saveState.status).toBe('anonymous'));
  });

  it('falls back to a built-in quote when the quotes API fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).includes('/quotes/')
          ? jsonResponse(404, { message: 'Not Found' })
          : jsonResponse(401, { message: 'Unauthorized' }),
      ),
    );
    useSettings.setState({ mode: 'quote', quoteLength: 'long', language: 'pl' });
    const { result } = renderHook(() => useTypingTest(), { wrapper });

    await waitFor(() => expect(result.current.quote.fallback).toBe(true));
    expect(result.current.quote.loading).toBe(false);
    expect(result.current.state.words.length).toBeGreaterThan(5);
  });
});
