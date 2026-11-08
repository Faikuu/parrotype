import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import '@/i18n';
import { ME_QUERY_KEY } from '@/features/auth/useAuth';
import { ChangePasswordForm } from './ChangePassword';
import { DeleteAccountForm } from './DeleteAccount';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function renderWith(ui: React.ReactNode, qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })) {
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/account']}>
        <Routes>
          <Route path="/" element={<p>home page</p>} />
          <Route path="/account" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return qc;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ChangePasswordForm', () => {
  it('blocks a mismatched confirmation without calling the API', async () => {
    const fetchMock = vi.fn(async () => json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    renderWith(<ChangePasswordForm />);

    await userEvent.type(screen.getByLabelText('Current password'), 'old-password');
    await userEvent.type(screen.getByLabelText('New password'), 'new-password-1');
    await userEvent.type(screen.getByLabelText('Repeat new password'), 'new-password-2');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText("Passwords don't match.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a new password under 8 characters', async () => {
    const fetchMock = vi.fn(async () => json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    renderWith(<ChangePasswordForm />);

    await userEvent.type(screen.getByLabelText('Current password'), 'old-password');
    await userEvent.type(screen.getByLabelText('New password'), 'short');
    await userEvent.type(screen.getByLabelText('Repeat new password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText('Use at least 8 characters.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('changes the password and says other devices were signed out', async () => {
    const fetchMock = vi.fn(async () => json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    renderWith(<ChangePasswordForm />);

    await userEvent.type(screen.getByLabelText('Current password'), 'old-password');
    await userEvent.type(screen.getByLabelText('New password'), 'new-password-1');
    await userEvent.type(screen.getByLabelText('Repeat new password'), 'new-password-1');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Password changed. Other devices have been signed out.',
    );
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/auth/password');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({
      currentPassword: 'old-password',
      newPassword: 'new-password-1',
    });
  });

  it('shows a server error, such as a wrong current password, in an alert', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ statusCode: 401, message: 'Current password is incorrect' }, 401)),
    );
    renderWith(<ChangePasswordForm />);

    await userEvent.type(screen.getByLabelText('Current password'), 'wrong-one');
    await userEvent.type(screen.getByLabelText('New password'), 'new-password-1');
    await userEvent.type(screen.getByLabelText('Repeat new password'), 'new-password-1');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Current password is incorrect');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('DeleteAccountForm', () => {
  it('keeps the delete button disabled until the password and the exact username are entered', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ ok: true })));
    renderWith(<DeleteAccountForm name="kea" onLeaving={() => {}} />);

    const button = screen.getByRole('button', { name: 'Delete account' });
    expect(button).toBeDisabled();
    expect(screen.getByText("This deletes your account and all your results. It can't be undone.")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Password'), 'secret-pass');
    expect(button).toBeDisabled();

    const nameField = screen.getByLabelText('Type kea to confirm');
    await userEvent.type(nameField, 'KEA');
    expect(button).toBeDisabled();

    await userEvent.clear(nameField);
    await userEvent.type(nameField, 'kea');
    expect(button).toBeEnabled();
  });

  it('deletes the account, clears the cache, marks the user signed out and goes home', async () => {
    const fetchMock = vi.fn(async () => json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const onLeaving = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(['results', 'mine', 100], []);
    qc.setQueryData(ME_QUERY_KEY, { name: 'kea' });
    renderWith(<DeleteAccountForm name="kea" onLeaving={onLeaving} />, qc);

    await userEvent.type(screen.getByLabelText('Password'), 'secret-pass');
    await userEvent.type(screen.getByLabelText('Type kea to confirm'), 'kea');
    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }));

    expect(await screen.findByText('home page')).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/auth/account');
    expect(init.method).toBe('DELETE');
    expect(JSON.parse(String(init.body))).toEqual({ password: 'secret-pass' });
    expect(onLeaving).toHaveBeenCalledWith(true);
    await waitFor(() => expect(qc.getQueryData(ME_QUERY_KEY)).toBeNull());
    expect(qc.getQueryData(['results', 'mine', 100])).toBeUndefined();
  });
});
