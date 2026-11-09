import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import '@/i18n';
import UserDetailPage from './UserDetailPage';
import { GROUPS, groupsPage, installApi, writes } from '../testHarness';

const MODERATOR_PERMS = [
  'admin.access',
  'users.read',
  'users.ban',
  'reports.read',
  'reports.resolve',
  'results.read',
  'results.delete',
  'audit.read',
];

/** Can manage users and groups, but not delete users, edit groups or manage quotes. */
const ACTOR = [...MODERATOR_PERMS, 'users.edit', 'users.groups', 'groups.read'];

const USER = {
  id: 5,
  name: 'cuckoo',
  email: 'cuckoo@example.com',
  createdAt: '2026-10-01T10:00:00Z',
  bannedAt: null,
  banReason: null,
  groups: [{ id: 2, name: 'Moderators' }],
  resultCount: 12,
  effectivePermissions: MODERATOR_PERMS,
  heldPermissions: MODERATOR_PERMS,
  stats: { tests: 12, bestWpm: 88.5, lastResultAt: '2026-11-08T10:00:00Z' },
  recentResults: [],
  reportsReceived: [],
  reportsMade: [],
};

function renderUser() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/admin/users/5']}>
        <Routes>
          <Route path="/admin/users/:id" element={<UserDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function api(actor: string[], user: unknown = USER) {
  return installApi({ id: 2, name: 'kea', permissions: actor }, [
    (req) => (req.method === 'GET' && req.path === '/admin/users/5' ? { body: user } : undefined),
    (req) => (req.method === 'GET' && req.path === '/admin/groups' ? { body: groupsPage(GROUPS) } : undefined),
    (req) => (req.method === 'PUT' && req.path === '/admin/users/5/groups' ? { body: USER } : undefined),
  ]);
}

const group = (name: string) => screen.getByRole('checkbox', { name: new RegExp(`^${name}`) });

describe('User detail groups', () => {
  it('enables only the groups the actor can grant, with the reason in the tooltip', async () => {
    api(ACTOR);
    renderUser();
    await screen.findByRole('heading', { name: 'cuckoo' });

    expect(group('Moderators')).toBeChecked();
    expect(group('Moderators')).toBeEnabled();
    expect(group('Viewers')).not.toBeChecked();
    expect(group('Viewers')).toBeEnabled();

    // The actor lacks most of the Administrators permissions, so it can't be granted.
    expect(group('Administrators')).toBeDisabled();
    expect(group('Administrators').closest('label')).toHaveAttribute('title', "You don't hold every permission in this group");
  });

  it('saves the whole group set in one request', async () => {
    const user = userEvent.setup();
    const fetchMock = api(ACTOR);
    renderUser();
    await screen.findByRole('heading', { name: 'cuckoo' });

    const save = screen.getByRole('button', { name: 'Save groups' });
    expect(save).toBeDisabled();

    await user.click(group('Viewers'));
    expect(save).toBeEnabled();
    await user.click(save);

    await waitFor(() => expect(writes(fetchMock)).toHaveLength(1));
    expect(writes(fetchMock)[0]).toEqual({
      method: 'PUT',
      path: '/admin/users/5/groups',
      body: { groupIds: [2, 3] },
    });
  });

  it('locks every group when the user holds a permission the actor does not', async () => {
    api(ACTOR, { ...USER, effectivePermissions: [...MODERATOR_PERMS, 'users.delete'], heldPermissions: [...MODERATOR_PERMS, 'users.delete'] });
    renderUser();
    await screen.findByRole('heading', { name: 'cuckoo' });

    expect(group('Viewers')).toBeDisabled();
    expect(group('Viewers').closest('label')).toHaveAttribute('title', "You can't manage a user with permissions you don't have");
    expect(group('Moderators')).toBeDisabled();
  });

  it('still locks the groups of a suspended user who holds a permission the actor does not', async () => {
    // A suspended user has no effective permissions, but keeps their rank.
    api(ACTOR, { ...USER, bannedAt: '2026-11-01T00:00:00.000Z', effectivePermissions: [], heldPermissions: [...MODERATOR_PERMS, 'users.delete'] });
    renderUser();
    await screen.findByRole('heading', { name: 'cuckoo' });
    expect(group('Viewers')).toBeDisabled();
    expect(group('Moderators')).toBeDisabled();
  });

  it('shows the server message when the save is refused', async () => {
    const user = userEvent.setup();
    installApi({ id: 2, name: 'kea', permissions: ACTOR }, [
      (req) => (req.method === 'GET' && req.path === '/admin/users/5' ? { body: USER } : undefined),
      (req) => (req.method === 'GET' && req.path === '/admin/groups' ? { body: groupsPage(GROUPS) } : undefined),
      (req) => (req.method === 'PUT' ? { status: 403, body: { message: "You can't manage a user with permissions you don't have" } } : undefined),
    ]);
    renderUser();
    await screen.findByRole('heading', { name: 'cuckoo' });
    await user.click(group('Viewers'));
    await user.click(screen.getByRole('button', { name: 'Save groups' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("You can't manage a user with permissions you don't have");
  });

  it('keeps the destructive actions disabled without their permission', async () => {
    api(ACTOR);
    renderUser();
    await screen.findByRole('heading', { name: 'cuckoo' });
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Suspend' })).toBeEnabled();
  });
});

describe('User detail two-factor', () => {
  const TF_USER = { ...USER, emailVerified: false, twoFactorEnabled: true };
  const WITH_SECURITY = [...ACTOR, 'users.security'];

  it('shows the email verified status and whether two-factor is on', async () => {
    api(ACTOR, TF_USER);
    renderUser();

    expect(await screen.findByText('Email not verified')).toBeInTheDocument();
    expect(screen.getByText('On', { exact: true })).toBeInTheDocument();
  });

  it('shows "Turn off two-factor" only to a user with users.security', async () => {
    api(ACTOR, TF_USER);
    renderUser();
    await screen.findByRole('heading', { name: 'cuckoo' });

    expect(screen.queryByRole('button', { name: 'Turn off two-factor' })).not.toBeInTheDocument();
  });

  it('turns two-factor off after confirmation, through the admin reset', async () => {
    const fetchMock = installApi({ id: 2, name: 'kea', permissions: WITH_SECURITY }, [
      (req) => (req.method === 'GET' && req.path === '/admin/users/5' ? { body: TF_USER } : undefined),
      (req) => (req.method === 'GET' && req.path === '/admin/groups' ? { body: groupsPage(GROUPS) } : undefined),
      (req) =>
        req.method === 'POST' && req.path === '/admin/users/5/2fa/reset' ? { body: { ok: true } } : undefined,
    ]);
    renderUser();

    await userEvent.click(await screen.findByRole('button', { name: 'Turn off two-factor' }));
    const dialog = await screen.findByRole('dialog', { name: 'Turn off two-factor for cuckoo?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Turn off' }));

    await waitFor(() =>
      expect(writes(fetchMock)).toEqual([{ method: 'POST', path: '/admin/users/5/2fa/reset', body: undefined }]),
    );
  });

  it('disables the button, with the reason, when two-factor is already off', async () => {
    api(ACTOR.concat('users.security'), { ...TF_USER, twoFactorEnabled: false });
    renderUser();

    const button = await screen.findByRole('button', { name: 'Turn off two-factor' });
    expect(button).toBeDisabled();
    expect(screen.getByText('Off', { exact: true })).toBeInTheDocument();
  });
});
