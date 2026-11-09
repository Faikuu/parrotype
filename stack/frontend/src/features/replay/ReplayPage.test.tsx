import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import '@/i18n';
import ReplayPage from './ReplayPage';
import { configFromResult } from './replayConfig';

const DTO = {
  result: {
    id: 42,
    name: 'kea',
    mode: 'words',
    mode2: '10',
    language: 'en',
    wpm: 87.4,
    rawWpm: 92,
    accuracy: 96.2,
    consistency: 88,
    durationMs: 9100,
    createdAt: '2026-11-08T10:00:00Z',
  },
  replay: {
    v: 1 as const,
    words: ['ok', 'go'],
    events: [
      { t: 0, k: 'c' as const, ch: 'o' },
      { t: 120, k: 'c' as const, ch: 'k' },
      { t: 300, k: 's' as const },
      { t: 450, k: 'c' as const, ch: 'g' },
      { t: 600, k: 'c' as const, ch: 'o' },
    ],
  },
};

function renderAt(url: string, fetchImpl: () => Response): string[] {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const requested: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    requested.push(String(input));
    return fetchImpl();
  });
  vi.stubGlobal('fetch', fetchMock);
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/replay/:resultId" element={<ReplayPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return requested;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ReplayPage', () => {
  it('shows the summary and the player for a verified result', async () => {
    const requested = renderAt(
      '/replay/42',
      () => new Response(JSON.stringify(DTO), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    const name = await screen.findByRole('link', { name: 'kea' });
    expect(name).toHaveAttribute('href', '/u/kea');
    expect(screen.getByText('87')).toBeInTheDocument();
    expect(screen.getByText('96%')).toBeInTheDocument();
    expect(screen.getByText('words 10 en')).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Replay position' })).toBeInTheDocument();
    expect(requested[0]).toContain('/results/42/replay');
  });

  it('shows the not-found state for a result that has no replay (404)', async () => {
    renderAt(
      '/replay/7',
      () => new Response(JSON.stringify({ statusCode: 404, message: 'Replay not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } }),
    );
    expect(await screen.findByText("This replay isn't available. The test may not be verified, or its owner may be banned.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the leaderboard' })).toHaveAttribute('href', '/leaderboard');
  });

  it('does not ask the server for a result id that is not a number', async () => {
    const requested = renderAt('/replay/abc', () => new Response('{}', { status: 200 }));
    expect(await screen.findByText("This replay isn't available. The test may not be verified, or its owner may be banned.")).toBeInTheDocument();
    expect(requested).toHaveLength(0);
  });

  it('builds the config a result was typed with from its mode and mode2', () => {
    expect(configFromResult({ mode: 'time', mode2: '30', language: 'pl' })).toMatchObject({ mode: 'time', time: 30, language: 'pl' });
    expect(configFromResult({ mode: 'code', mode2: 'rs', language: 'en' })).toMatchObject({ mode: 'code', codeLanguage: 'rs' });
    expect(configFromResult({ mode: 'pangram', mode2: '3', language: 'xx' })).toMatchObject({ mode: 'pangram', pangramCount: 3, language: 'en' });
  });
});
