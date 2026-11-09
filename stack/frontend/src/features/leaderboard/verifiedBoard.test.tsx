import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import '@/i18n';
import LeaderboardPage from './LeaderboardPage';

const ROWS = [
  { rank: 1, name: 'kea', wpm: 120, rawWpm: 130, accuracy: 98, createdAt: '2026-11-01T10:00:00Z', verified: true, resultId: 42 },
  { rank: 2, name: 'macaw', wpm: 110, rawWpm: 118, accuracy: 96, createdAt: '2026-11-02T10:00:00Z', verified: false, resultId: 43 },
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{`${loc.pathname}${loc.search}`}</p>;
}

function renderBoard(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const u = String(input);
    if (u.includes('/auth/me')) return json({ message: 'nope' }, 401);
    if (u.includes('/leaderboard')) return json(ROWS);
    return json({}, 500);
  });
  vi.stubGlobal('fetch', fetchMock);
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/leaderboard" element={<><LeaderboardPage /><Where /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LeaderboardPage: verified results', () => {
  it('marks verified entries with a check and links them to their replay', async () => {
    renderBoard('/leaderboard');
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);

    const check = within(rows[0]!).getByRole('img', { name: 'Verified by keystroke replay' });
    expect(check).toBeInTheDocument();
    expect(within(rows[0]!).getByRole('img', { name: 'Verified by keystroke replay' }).querySelector('title')).toHaveTextContent(
      'Verified by keystroke replay',
    );
    expect(within(rows[1]!).queryByRole('img', { name: 'Verified by keystroke replay' })).toBeNull();

    const watch = within(rows[0]!).getByRole('link', { name: 'Watch' });
    expect(watch).toHaveAttribute('href', '/replay/42');
    expect(within(rows[1]!).queryByRole('link', { name: 'Watch' })).toBeNull();
  });

  it('lists unverified results only from the Include unverified toggle, and keeps it in the URL', async () => {
    const user = userEvent.setup();
    const fetchMock = renderBoard('/leaderboard');
    await screen.findByRole('table');
    const boardCalls = () => fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.includes('/leaderboard'));

    // Verified only by default: the request does not mention verification, and the server lists verified results.
    expect(boardCalls().every((u) => !u.includes('verified='))).toBe(true);

    const toggle = screen.getByRole('button', { name: 'Include unverified' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Include unverified' })).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByTestId('where')).toHaveTextContent('verified=false');
    await waitFor(() => expect(boardCalls().some((u) => u.includes('verified=false'))).toBe(true));
  });

  it('reads the include-unverified filter from the URL', async () => {
    const fetchMock = renderBoard('/leaderboard?verified=false');
    await screen.findByRole('table');
    const calls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calls.find((u) => u.includes('/leaderboard'))).toContain('verified=false');
    expect(screen.getByRole('button', { name: 'Include unverified' })).toHaveAttribute('aria-pressed', 'true');
  });
});
