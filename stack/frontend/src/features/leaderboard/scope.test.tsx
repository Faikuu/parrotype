import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import '@/i18n';
import LeaderboardPage from './LeaderboardPage';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const ROW = { rank: 1, name: 'kea', wpm: 120, rawWpm: 125, accuracy: 98, createdAt: '2026-11-01T10:00:00Z' };

function mock(me: boolean) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/auth/me')) {
      return me
        ? json({ user: { id: 2, name: 'macaw', email: 'm@example.com', role: 'user', createdAt: '2026-10-01T10:00:00Z' } })
        : json({ message: 'Unauthorized' }, 401);
    }
    if (url.includes('/leaderboard')) return json([ROW]);
    return json({}, 500);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function renderAt(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <LeaderboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const leaderboardUrls = (fn: ReturnType<typeof mock>) =>
  fn.mock.calls.map((c) => String(c[0])).filter((u) => u.includes('/leaderboard'));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('leaderboard scope', () => {
  it('requests the following scope from the URL when signed in', async () => {
    const fn = mock(true);
    renderAt('/leaderboard?scope=following');

    await screen.findByRole('table');
    expect(leaderboardUrls(fn).some((u) => u.includes('scope=following'))).toBe(true);
    expect(screen.getByRole('button', { name: 'Following' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('switches scope on the pill and keeps it in the URL', async () => {
    const fn = mock(true);
    const user = userEvent.setup();
    renderAt('/leaderboard');

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Following' }));
    await waitFor(() => expect(leaderboardUrls(fn).some((u) => u.includes('scope=following'))).toBe(true));
    expect(screen.getByRole('button', { name: 'Following' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Everyone' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Everyone' })).toHaveAttribute('aria-pressed', 'true'));
    expect(leaderboardUrls(fn).at(-1)).not.toContain('scope=');
  });

  it('hides the scope pills when signed out and never asks for following', async () => {
    const fn = mock(false);
    renderAt('/leaderboard?scope=following');

    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: 'Following' })).not.toBeInTheDocument();
    expect(leaderboardUrls(fn).every((u) => !u.includes('scope='))).toBe(true);
  });
});
