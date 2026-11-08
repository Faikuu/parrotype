import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import '@/i18n';
import LoginPage from './LoginPage';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function renderLogin(url = '/login') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/account" element={<p>account page</p>} />
          <Route path="/leaderboard" element={<p>leaderboard page</p>} />
          <Route path="/register" element={<p>register page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LoginPage', () => {
  it('shows field errors on submit without calling the API', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async () =>
      json({ message: 'nope' }, 401),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderLogin();

    await userEvent.click(await screen.findByRole('button', { name: 'Log in' }));

    const email = screen.getByLabelText('Email');
    const password = screen.getByLabelText('Password');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
    expect(email).toHaveAccessibleDescription('Enter your email address.');
    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    // only the /auth/me call from useAuth, no login call
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).not.toContain('/api/auth/login');
  });

  it('validates the email on blur', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ message: 'nope' }, 401)));
    renderLogin();
    const email = await screen.findByLabelText('Email');

    await userEvent.type(email, 'not-an-email');
    await userEvent.tab();

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(email).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows the server error in an alert and keeps the user on the page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith('/auth/login')) {
          return json({ statusCode: 401, message: 'Invalid email or password' }, 401);
        }
        return json({ message: 'nope' }, 401);
      }),
    );
    renderLogin();

    await userEvent.type(await screen.findByLabelText('Email'), 'me@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
    expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled();
    expect(screen.queryByText('account page')).not.toBeInTheDocument();
  });

  it('goes to the next path after logging in, and never to an external one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith('/auth/login')) {
          return json({
            user: { id: 1, name: 'kea', email: 'me@example.com', createdAt: '2026-01-01T00:00:00Z' },
          });
        }
        return json({ message: 'nope' }, 401);
      }),
    );
    renderLogin('/login?next=/leaderboard');

    await userEvent.type(await screen.findByLabelText('Email'), 'me@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('leaderboard page')).toBeInTheDocument();
  });

  it('ignores an unsafe next parameter', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).endsWith('/auth/login')
          ? json({ user: { id: 1, name: 'kea', email: 'a@b.co', createdAt: '2026-01-01T00:00:00Z' } })
          : json({ message: 'nope' }, 401),
      ),
    );
    renderLogin('/login?next=//evil.example');

    await userEvent.type(await screen.findByLabelText('Email'), 'me@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => expect(screen.getByText('account page')).toBeInTheDocument());
  });
});
