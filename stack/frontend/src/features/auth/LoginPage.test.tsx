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
          <Route path="/forgot-password" element={<p>forgot page</p>} />
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

const KEA = { id: 2, name: 'kea', email: 'kea@example.com', createdAt: '2026-01-01T00:00:00Z', permissions: [], emailVerified: true, twoFactorEnabled: true };

/** A login that needs the second step, then a verify that answers with the user. */
function twoFactorFetch(verifyStatus = 200) {
  return vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async (input) => {
    const url = String(input);
    if (url.endsWith('/auth/login')) return json({ twoFactorRequired: true, ticket: 'ticket-1' });
    if (url.endsWith('/auth/2fa/verify')) {
      return verifyStatus === 200 ? json({ user: KEA }) : json({ message: 'nope' }, verifyStatus);
    }
    return json({ message: 'nope' }, 401);
  });
}

async function logInWithPassword() {
  await userEvent.type(await screen.findByLabelText('Email'), 'kea@example.com');
  await userEvent.type(screen.getByLabelText('Password'), 'correct-horse');
  await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
}

function verifyBodies(fetchMock: ReturnType<typeof twoFactorFetch>) {
  return fetchMock.mock.calls
    .filter(([input]) => String(input).endsWith('/auth/2fa/verify'))
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)) as unknown);
}

describe('LoginPage two-factor step', () => {
  it('asks for the code after a twoFactorRequired login, then signs in and navigates', async () => {
    const fetchMock = twoFactorFetch();
    vi.stubGlobal('fetch', fetchMock);
    renderLogin('/login?next=/account');

    await logInWithPassword();

    expect(await screen.findByRole('heading', { name: 'Enter your code' })).toBeInTheDocument();
    const code = screen.getByLabelText('Authenticator code');
    expect(code).toHaveAttribute('inputmode', 'numeric');
    expect(code).toHaveAttribute('autocomplete', 'one-time-code');

    await userEvent.type(code, '123 456');
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }));

    expect(await screen.findByText('account page')).toBeInTheDocument();
    expect(verifyBodies(fetchMock)).toEqual([{ ticket: 'ticket-1', code: '123456' }]);
  });

  it('rejects a code that is not six digits without calling the server', async () => {
    const fetchMock = twoFactorFetch();
    vi.stubGlobal('fetch', fetchMock);
    renderLogin();

    await logInWithPassword();
    await userEvent.type(await screen.findByLabelText('Authenticator code'), '12345');
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }));

    expect(await screen.findByText('Enter the 6-digit code from your app.')).toBeInTheDocument();
    expect(verifyBodies(fetchMock)).toEqual([]);
  });

  it('switches to a recovery code field, validates its shape, and sends it normalised', async () => {
    const fetchMock = twoFactorFetch();
    vi.stubGlobal('fetch', fetchMock);
    renderLogin('/login?next=/account');

    await logInWithPassword();
    await userEvent.click(await screen.findByRole('button', { name: 'Use a recovery code' }));

    const recovery = screen.getByLabelText('Recovery code');
    expect(recovery).toHaveAttribute('pattern', '[a-zA-Z2-7]{4}-[a-zA-Z2-7]{4}');
    expect(screen.queryByLabelText('Authenticator code')).not.toBeInTheDocument();

    await userEvent.type(recovery, 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText('Enter a recovery code, like xxxx-xxxx.')).toBeInTheDocument();
    expect(verifyBodies(fetchMock)).toEqual([]);

    await userEvent.clear(recovery);
    await userEvent.type(recovery, 'abcd2345');
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }));

    expect(await screen.findByText('account page')).toBeInTheDocument();
    expect(verifyBodies(fetchMock)).toEqual([{ ticket: 'ticket-1', code: 'abcd-2345' }]);
  });

  it('toggles back from the recovery code field to the authenticator code field', async () => {
    vi.stubGlobal('fetch', twoFactorFetch());
    renderLogin();

    await logInWithPassword();
    await userEvent.click(await screen.findByRole('button', { name: 'Use a recovery code' }));
    await userEvent.click(screen.getByRole('button', { name: 'Use an authenticator code' }));

    expect(screen.getByLabelText('Authenticator code')).toBeInTheDocument();
    expect(screen.queryByLabelText('Recovery code')).not.toBeInTheDocument();
  });

  it('goes back to the password step, keeping the email', async () => {
    vi.stubGlobal('fetch', twoFactorFetch());
    renderLogin();

    await logInWithPassword();
    await userEvent.click(await screen.findByRole('button', { name: 'Back' }));

    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('kea@example.com');
  });

  it('shows a wrong-code message in an alert and stays on the code step', async () => {
    vi.stubGlobal('fetch', twoFactorFetch(401));
    renderLogin();

    await logInWithPassword();
    await userEvent.type(await screen.findByLabelText('Authenticator code'), '654321');
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("That code didn't work.");
    expect(screen.getByLabelText('Authenticator code')).toBeInTheDocument();
  });

  it('links to the forgot password page from the password step', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ message: 'nope' }, 401)));
    renderLogin();

    expect(await screen.findByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password');
  });
});
