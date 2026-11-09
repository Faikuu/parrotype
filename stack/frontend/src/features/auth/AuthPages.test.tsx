import { StrictMode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import '@/i18n';
import ForgotPasswordPage from './ForgotPasswordPage';
import ResetPasswordPage from './ResetPasswordPage';
import VerifyEmailPage from './VerifyEmailPage';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function bodyOf(fn: ReturnType<typeof vi.fn>, suffix: string): unknown[] {
  return fn.mock.calls
    .filter(([input]) => String(input).endsWith(suffix))
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)) as unknown);
}

function renderAt(url: string, strict = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/login" element={<p>login page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ForgotPasswordPage', () => {
  it('validates the email without calling the server', async () => {
    const fetchMock = vi.fn(async () => json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/forgot-password');

    await userEvent.type(await screen.findByLabelText('Email'), 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(bodyOf(fetchMock, '/auth/password/forgot')).toEqual([]);
  });

  it('shows the neutral message whether or not the account exists', async () => {
    const fetchMock = vi.fn(async () => json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/forgot-password');

    await userEvent.type(await screen.findByLabelText('Email'), 'nobody@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      "If an account uses that email, we've sent a link.",
    );
    expect(bodyOf(fetchMock, '/auth/password/forgot')).toEqual([{ email: 'nobody@example.com' }]);
  });

  it('shows a rate limit message on 429', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ message: 'Too many' }, 429)));
    renderAt('/forgot-password');

    await userEvent.type(await screen.findByLabelText('Email'), 'kea@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests. Try again in a few minutes.');
  });
});

describe('ResetPasswordPage', () => {
  it('says the link is invalid when there is no token', async () => {
    vi.stubGlobal('fetch', vi.fn());
    renderAt('/reset-password');

    expect(await screen.findByText('This link is invalid or has expired.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute('href', '/forgot-password');
  });

  it('checks the password rules and that the two entries match, without calling the server', async () => {
    const fetchMock = vi.fn(async () => json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/reset-password?token=tok-1');

    await userEvent.type(await screen.findByLabelText('New password'), 'short');
    await userEvent.type(screen.getByLabelText('Repeat new password'), 'different');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText('Use at least 8 characters.')).toBeInTheDocument();
    expect(screen.getByText("Passwords don't match.")).toBeInTheDocument();
    expect(bodyOf(fetchMock, '/auth/password/reset')).toEqual([]);
  });

  it('sends the token and the new password, then shows the success state with a login link', async () => {
    const fetchMock = vi.fn(async () => json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/reset-password?token=tok-1');

    await userEvent.type(await screen.findByLabelText('New password'), 'correct-horse-9');
    await userEvent.type(screen.getByLabelText('Repeat new password'), 'correct-horse-9');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Password changed. Log in with your new password.');
    expect(bodyOf(fetchMock, '/auth/password/reset')).toEqual([
      { token: 'tok-1', newPassword: 'correct-horse-9' },
    ]);
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
  });

  it('offers a new link when the server says the token is invalid', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ message: 'Invalid or expired link' }, 400)));
    renderAt('/reset-password?token=stale');

    await userEvent.type(await screen.findByLabelText('New password'), 'correct-horse-9');
    await userEvent.type(screen.getByLabelText('Repeat new password'), 'correct-horse-9');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText('This link is invalid or has expired.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Request a new link' })).toBeInTheDocument();
  });
});

describe('VerifyEmailPage', () => {
  it('shows success after verifying', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ ok: true })));
    renderAt('/verify-email?token=good');

    expect(await screen.findByText('Your email is verified.')).toBeInTheDocument();
  });

  it('shows the invalid state for an expired or used link', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ message: 'Invalid or expired link' }, 400)));
    renderAt('/verify-email?token=used');

    expect(await screen.findByRole('alert')).toHaveTextContent('This link is invalid or has expired.');
    expect(screen.queryByText('Your email is verified.')).not.toBeInTheDocument();
  });

  it('makes a single verify call under StrictMode, which runs effects twice', async () => {
    const fetchMock = vi.fn(async () => json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    renderAt('/verify-email?token=once', true);

    expect(await screen.findByText('Your email is verified.')).toBeInTheDocument();
    await waitFor(() => expect(bodyOf(fetchMock, '/auth/email/verify')).toHaveLength(1));
    expect(bodyOf(fetchMock, '/auth/email/verify')).toEqual([{ token: 'once' }]);
  });
});
