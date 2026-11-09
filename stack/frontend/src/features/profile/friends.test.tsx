import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import '@/i18n';
import ProfilePage from './ProfilePage';

const PROFILE = {
  name: 'kea',
  createdAt: '2026-10-01T10:00:00Z',
  totalTests: 3,
  totalTimeMs: 60_000,
  bests: [],
  recent: [],
  streak: { current: 0, longest: 0 },
  achievements: [],
  activity: [],
  followers: 10,
  following: 2,
  isFollowing: false,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

type Handler = (method: string, url: string) => Response | Promise<Response>;

/** Routes fetch by method and path. `me` is the signed-in user, or null for anonymous. */
function mockApi(me: { name: string; role?: string } | null, handler: Handler) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.endsWith('/auth/me')) {
      return me
        ? json({ user: { id: 2, name: me.name, email: 'x@example.com', permissions: me.role === 'admin' ? ['admin.access'] : [], createdAt: '2026-10-01T10:00:00Z' } })
        : json({ message: 'Unauthorized' }, 401);
    }
    return handler(method, url);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function renderProfile(name = 'kea') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/u/${name}`]}>
        <Routes>
          <Route path="/u/:name" element={<ProfilePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('follow button', () => {
  it('flips and counts at once, then stays on the server state', async () => {
    let resolveFollow!: (res: Response) => void;
    mockApi({ name: 'macaw' }, (method) => {
      if (method === 'PUT') return new Promise<Response>((r) => (resolveFollow = r));
      return json(PROFILE);
    });
    const user = userEvent.setup();
    renderProfile();

    await user.click(await screen.findByRole('button', { name: 'Follow' }));
    // Shown before the request finishes.
    expect(screen.getByRole('button', { name: 'Unfollow' })).toBeInTheDocument();
    expect(screen.getByText('11 followers')).toBeInTheDocument();

    resolveFollow(json({ following: true }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Unfollow' })).toBeEnabled());
    expect(screen.getByText('11 followers')).toBeInTheDocument();
  });

  it('rolls back and shows the error when the request fails', async () => {
    mockApi({ name: 'macaw' }, (method) => {
      if (method === 'PUT') return json({ statusCode: 500, message: 'boom' }, 500);
      return json(PROFILE);
    });
    const user = userEvent.setup();
    renderProfile();

    await user.click(await screen.findByRole('button', { name: 'Follow' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't update your follow. Try again.");
    expect(screen.getByRole('button', { name: 'Follow' })).toBeInTheDocument();
    expect(screen.getByText('10 followers')).toBeInTheDocument();
  });

  it('unfollows with a DELETE and drops the count', async () => {
    const seen: string[] = [];
    mockApi({ name: 'macaw' }, (method, url) => {
      if (method === 'DELETE') {
        seen.push(`${method} ${url}`);
        return json({ following: false });
      }
      return json({ ...PROFILE, isFollowing: true, followers: 10 });
    });
    const user = userEvent.setup();
    renderProfile();

    await user.click(await screen.findByRole('button', { name: 'Unfollow' }));
    expect(screen.getByRole('button', { name: 'Follow' })).toBeInTheDocument();
    expect(screen.getByText('9 followers')).toBeInTheDocument();
    await waitFor(() => expect(seen).toEqual(['DELETE /api/users/kea/follow']));
  });

  it('is hidden on your own profile', async () => {
    mockApi({ name: 'kea' }, () => json(PROFILE));
    renderProfile();
    await screen.findByRole('heading', { level: 1, name: 'kea' });
    expect(screen.queryByRole('button', { name: 'Follow' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Report' })).not.toBeInTheDocument();
  });

  it('is replaced by a log-in link when signed out', async () => {
    mockApi(null, () => json(PROFILE));
    renderProfile();
    const link = await screen.findByRole('link', { name: 'Log in to follow' });
    expect(link).toHaveAttribute('href', '/login?next=%2Fu%2Fkea');
    expect(screen.queryByRole('button', { name: 'Follow' })).not.toBeInTheDocument();
  });
});

describe('report dialog', () => {
  it('shows the duplicate message on 409', async () => {
    const posts: unknown[] = [];
    mockApi({ name: 'macaw' }, (method, url) => {
      if (method === 'POST' && url.endsWith('/users/kea/report')) {
        return json({ statusCode: 409, message: 'You have already reported this user' }, 409);
      }
      return json(PROFILE);
    });
    const user = userEvent.setup();
    renderProfile();

    await user.click(await screen.findByRole('button', { name: 'Report' }));
    const dialog = screen.getByRole('dialog');
    const submit = within(dialog).getByRole('button', { name: 'Send report' });
    expect(submit).toBeDisabled();

    await user.click(within(dialog).getByRole('radio', { name: 'Cheating' }));
    await user.type(within(dialog).getByRole('textbox'), 'Too fast');
    expect(submit).toBeEnabled();
    await user.click(submit);

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('You have already reported this user');
    expect(posts).toEqual([]);
  });

  it('sends the reason and details, then thanks the reporter', async () => {
    let body: unknown = null;
    mockApi({ name: 'macaw' }, (method, url) => {
      if (method === 'POST' && url.endsWith('/users/kea/report')) {
        return json({ ok: true }, 201);
      }
      return json(PROFILE);
    });
    const fn = vi.mocked(fetch);
    const user = userEvent.setup();
    renderProfile();

    await user.click(await screen.findByRole('button', { name: 'Report' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('radio', { name: 'Something else' }));
    await user.type(within(dialog).getByRole('textbox'), 'Odd');
    await user.click(within(dialog).getByRole('button', { name: 'Send report' }));

    expect(await within(dialog).findByText('Thanks. A moderator will look at it.')).toBeInTheDocument();
    const post = fn.mock.calls.find(([, init]) => init?.method === 'POST');
    body = JSON.parse(String(post?.[1]?.body));
    expect(body).toEqual({ reason: 'other', details: 'Odd' });
  });
});
