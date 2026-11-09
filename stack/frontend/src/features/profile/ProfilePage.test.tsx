import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import '@/i18n';
import ProfilePage from './ProfilePage';

const PROFILE = {
  name: 'kea',
  createdAt: '2026-10-01T10:00:00Z',
  totalTests: 42,
  totalTimeMs: 3_900_000,
  bests: [
    { mode: 'time', mode2: '60', language: 'en', wpm: 120, accuracy: 98.5, createdAt: '2026-11-01T10:00:00Z' },
    { mode: 'daily', mode2: '2026-11-07', language: 'de', wpm: 88, accuracy: 95, createdAt: '2026-11-07T12:00:00Z' },
  ],
  recent: [
    { mode: 'words', mode2: '25', language: 'pl', wpm: 99, accuracy: 97, createdAt: '2026-11-06T10:00:00Z' },
  ],
  streak: { current: 2, longest: 5 },
  achievements: [
    { id: 'first_test', unlockedAt: '2026-10-01T10:00:00Z' },
    { id: 'wpm_100', unlockedAt: '2026-11-01T10:00:00Z' },
  ],
  activity: [{ date: '2026-11-06', tests: 1 }],
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function renderProfile(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/u/:name" element={<ProfilePage />} />
          <Route path="/leaderboard" element={<p>leaderboard page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ProfilePage', () => {
  it('renders the name, totals, bests and recent results', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async (input) =>
      String(input).endsWith('/auth/me') ? json({ message: 'Unauthorized' }, 401) : json(PROFILE),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderProfile('/u/kea');

    expect(await screen.findByRole('heading', { level: 1, name: 'kea' })).toBeInTheDocument();
    expect(document.title).toBe('kea on ParroType');
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('1h 5m')).toBeInTheDocument();

    const [bestsTable, recentTable] = screen.getAllByRole('table');
    // Time (4 fixed options) + words (4) + quote + pangram + daily (1 result) + zen + custom. Weak is hidden.
    const rows = within(bestsTable!).getAllByRole('row').slice(1);
    const timeRow = rows.find((r) => within(r).queryByText('60 seconds'));
    expect(within(timeRow!).getByText('120')).toBeInTheDocument();
    const dailyRow = rows.find((r) => within(r).queryByText('Daily'));
    expect(dailyRow).toBeDefined();
    // Column 1 is the option: the daily date, not the time of the result.
    expect(within(dailyRow!).getAllByRole('cell')[1]).toHaveTextContent('Nov 7, 2026');
    expect(within(dailyRow!).getByText('Deutsch')).toBeInTheDocument();
    expect(within(bestsTable!).queryByText('Weak keys')).not.toBeInTheDocument();

    expect(within(recentTable!).getByText('Words, 25 words, Polski')).toBeInTheDocument();

    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/users/kea'))).toBe(true);
  });

  it('shows the not-found state with a link to the leaderboard for an unknown user', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ statusCode: 404, message: 'No user with that name', error: 'Not Found' }, 404)),
    );
    renderProfile('/u/nobody');

    expect(await screen.findByRole('heading', { name: 'No user with that name.' })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Go to the leaderboard' });
    expect(link).toHaveAttribute('href', '/leaderboard');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows an error with a retry button when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ statusCode: 500, message: 'boom' }, 500)));
    renderProfile('/u/kea');
    // The query retries once on a server error, so allow for that delay.
    expect(await screen.findByRole('alert', {}, { timeout: 3000 })).toHaveTextContent("Couldn't load this profile.");
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
  it('shows the streak, the unlocked achievements only and the activity calendar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(PROFILE)));
    renderProfile('/u/kea');

    expect(await screen.findByText('Current streak 2 days, longest 5')).toBeInTheDocument();
    expect(screen.getByText('Speed parrot')).toBeInTheDocument();
    expect(screen.getByText('First words')).toBeInTheDocument();
    expect(screen.queryByText('Supersonic')).not.toBeInTheDocument();
    expect(screen.getByText('Unlocked Nov 1, 2026')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Tests per day over the last year' })).toBeInTheDocument();
  });

  it('shows the empty achievements state when nothing is unlocked', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ ...PROFILE, achievements: [], activity: [] })));
    renderProfile('/u/kea');

    expect(await screen.findByText('No achievements yet.')).toBeInTheDocument();
  });
});
