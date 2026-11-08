import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import '@/i18n';
import { parseFilters } from './filters';
import LeaderboardPage from './LeaderboardPage';

const ROWS = [
  { rank: 1, name: 'kea', wpm: 120.5, rawWpm: 130, accuracy: 98.2, createdAt: '2026-11-01T10:00:00Z' },
  { rank: 2, name: 'macaw', wpm: 110, rawWpm: 118, accuracy: 96, createdAt: '2026-11-02T10:00:00Z' },
  { rank: 3, name: 'galah', wpm: 100, rawWpm: 105, accuracy: 95, createdAt: '2026-11-03T10:00:00Z' },
  { rank: 4, name: 'lorikeet', wpm: 90, rawWpm: 95, accuracy: 94, createdAt: '2026-11-04T10:00:00Z' },
];

function renderPage(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <LeaderboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockFetch(handler: (url: string) => Response) {
  const fn = vi.fn(async (input: RequestInfo | URL) => handler(String(input)));
  vi.stubGlobal('fetch', fn);
  return fn;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LeaderboardPage', () => {
  it('renders rows from the API with the default filters', async () => {
    const fetchMock = mockFetch((url) => {
      if (url.includes('/auth/me')) return json({ message: 'nope' }, 401);
      if (url.includes('/leaderboard')) return json(ROWS);
      return json({}, 500);
    });
    renderPage('/leaderboard');

    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(4);
    expect(within(rows[0]!).getByText('kea')).toBeInTheDocument();
    expect(within(rows[3]!).getByText('lorikeet')).toBeInTheDocument();

    const leaderboardCall = fetchMock.mock.calls
      .map((c) => String(c[0]))
      .find((u) => u.includes('/leaderboard'));
    expect(leaderboardCall).toContain('mode=time');
    expect(leaderboardCall).toContain('mode2=60');
    expect(leaderboardCall).toContain('language=en');
  });

  it('reads filters from the URL and falls back for unknown values', () => {
    expect(parseFilters(new URLSearchParams('mode=words&mode2=50&language=pl'))).toEqual({
      mode: 'words',
      mode2: 50,
      language: 'pl',
    });
    expect(parseFilters(new URLSearchParams('mode=words&mode2=60'))).toEqual({
      mode: 'words',
      mode2: 25,
      language: 'en',
    });
    expect(parseFilters(new URLSearchParams('mode=zen&mode2=abc&language=de'))).toEqual({
      mode: 'time',
      mode2: 60,
      language: 'en',
    });
  });

  it('requests the new filter when a pill is pressed', async () => {
    const fetchMock = mockFetch((url) => {
      if (url.includes('/auth/me')) return json({ message: 'nope' }, 401);
      return json(ROWS);
    });
    renderPage('/leaderboard');
    await screen.findByRole('table');

    await userEvent.click(screen.getByRole('button', { name: '120 seconds' }));
    await screen.findByRole('button', { name: '120 seconds', pressed: true });
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('mode2=120'))).toBe(true);
  });

  it('shows the empty state when there are no results', async () => {
    mockFetch((url) => (url.includes('/auth/me') ? json({}, 401) : json([])));
    renderPage('/leaderboard');
    expect(
      await screen.findByText('No results for this mode yet. Be the first.'),
    ).toBeInTheDocument();
  });

  it('shows an error with a retry button when the request fails', async () => {
    mockFetch((url) =>
      url.includes('/auth/me') ? json({}, 401) : json({ statusCode: 500, message: 'boom' }, 500),
    );
    renderPage('/leaderboard');
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load the leaderboard.");
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
