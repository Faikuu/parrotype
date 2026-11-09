import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import '@/i18n';
import AdminPage from './AdminPage';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const REPORT = {
  id: 3,
  reason: 'cheating',
  details: 'Too fast to be real',
  status: 'open',
  createdAt: '2026-11-08T10:00:00Z',
  resolvedAt: null,
  reporter: { id: 2, name: 'macaw' },
  target: { id: 1, name: 'cuckoo', bannedAt: null, banReason: null },
  targetResults: [
    { id: 9, mode: 'time', mode2: '60', language: 'en', wpm: 200, accuracy: 99, createdAt: '2026-11-07T10:00:00Z' },
  ],
};

/** `role` is the signed-in user's role, or null for anonymous. `reports` answers GET /admin/reports. */
function mock(role: 'user' | 'admin' | null, reports: unknown[] | 'error' = [REPORT]) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.endsWith('/auth/me')) {
      return role
        ? json({ user: { id: 2, name: 'macaw', email: 'm@example.com', role, createdAt: '2026-10-01T10:00:00Z' } })
        : json({ message: 'Unauthorized' }, 401);
    }
    if (url.includes('/admin/reports')) {
      return reports === 'error' ? json({ message: 'boom' }, 500) : json(reports);
    }
    if (url.includes('/admin/actions')) return json([]);
    if (method === 'POST' && url.endsWith('/admin/users/cuckoo/ban')) {
      return json({ id: 1, name: 'cuckoo', bannedAt: '2026-11-09T10:00:00Z', banReason: 'Botting' });
    }
    return json({ message: 'unexpected' }, 500);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

function renderAdmin() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('admin page', () => {
  it('renders the not-found page for a signed-in non-admin', async () => {
    const fn = mock('user');
    renderAdmin();
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(fn.mock.calls.some(([u]) => String(u).includes('/admin/'))).toBe(false);
  });

  it('renders the not-found page for an anonymous visitor', async () => {
    mock(null);
    renderAdmin();
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('lists open reports for an admin', async () => {
    mock('admin');
    renderAdmin();
    expect(await screen.findByRole('heading', { name: 'Admin' })).toBeInTheDocument();
    const row = (await screen.findByRole('link', { name: 'cuckoo' })).closest('tr')!;
    expect(within(row).getByText('macaw')).toBeInTheDocument();
    expect(within(row).getByText('Cheating')).toBeInTheDocument();
    expect(within(row).getByText('Too fast to be real')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Resolve' })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
  });

  it('shows the empty state when there are no open reports', async () => {
    mock('admin', []);
    renderAdmin();
    expect(await screen.findByText('No open reports.')).toBeInTheDocument();
  });

  it('shows an alert when the reports cannot be loaded', async () => {
    mock('admin', 'error');
    renderAdmin();
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load this list.");
  });

  it('sends the ban reason from the modal', async () => {
    const fn = mock('admin');
    const user = userEvent.setup();
    renderAdmin();

    await user.click(await screen.findByRole('button', { name: 'Ban user' }));
    const dialog = screen.getByRole('dialog');
    const submit = within(dialog).getByRole('button', { name: 'Ban user' });
    expect(submit).toBeDisabled();

    await user.type(within(dialog).getByRole('textbox', { name: 'Reason' }), '  Botting  ');
    await user.click(submit);

    await waitFor(() => {
      const post = fn.mock.calls.find(([u, init]) => String(u).endsWith('/admin/users/cuckoo/ban') && init?.method === 'POST');
      expect(post).toBeDefined();
      expect(JSON.parse(String(post?.[1]?.body))).toEqual({ reason: 'Botting' });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
