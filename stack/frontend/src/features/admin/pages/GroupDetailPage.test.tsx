import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import '@/i18n';
import GroupDetailPage from './GroupDetailPage';
import { GROUPS, installApi, writes } from '../testHarness';

const DETAIL = {
  ...GROUPS[2],
  members: [{ id: 9, name: 'macaw', bannedAt: null }],
};
const ADMIN_DETAIL = {
  ...GROUPS[0],
  members: [
    { id: 1, name: 'kea', bannedAt: null },
    { id: 2, name: 'lory', bannedAt: null },
  ],
};

const ACTOR = ['admin.access', 'groups.read', 'groups.manage', 'users.read', 'users.groups', 'quotes.read', 'audit.read'];

function renderGroup(id: number) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/admin/groups/${id}`]}>
        <Routes>
          <Route path="/admin/groups/:id" element={<GroupDetailPage />} />
          <Route path="/admin/groups" element={<p>groups list</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function api(actor: string[], detail: unknown = DETAIL) {
  return installApi({ permissions: actor }, [
    (req) => (req.method === 'GET' && /^\/admin\/groups\/\d+$/.test(req.path) ? { body: detail } : undefined),
    (req) => {
      const match = /^\/admin\/groups\/(\d+)\/permissions$/.exec(req.path);
      if (req.method !== 'PUT' || !match) return undefined;
      return { body: { ...DETAIL, permissions: (req.body as { permissions: string[] }).permissions } };
    },
  ]);
}

describe('Group permission editor', () => {
  it('saves only the permissions that changed, with implied reads', async () => {
    const user = userEvent.setup();
    const fetchMock = api(ACTOR);
    renderGroup(3);
    await screen.findByRole('heading', { name: 'Viewers' });

    const save = screen.getByRole('button', { name: 'Save permissions (0)' });
    expect(save).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: 'View quotes in the admin panel' }));
    await user.click(screen.getByRole('button', { name: 'Save permissions (1)' }));

    await waitFor(() => expect(writes(fetchMock)).toHaveLength(1));
    expect(writes(fetchMock)[0]).toEqual({
      method: 'PUT',
      path: '/admin/groups/3/permissions',
      body: { permissions: ['admin.access', 'audit.read', 'quotes.read'] },
    });
  });

  it('locks permissions the actor does not hold', async () => {
    api(ACTOR);
    renderGroup(3);
    await screen.findByRole('heading', { name: 'Viewers' });
    const races = screen.getByRole('checkbox', { name: 'View live race rooms' });
    expect(races).toBeDisabled();
    expect(races.closest('label')).toHaveAttribute('title', "You don't have this permission");
  });

  it('locks the whole system group and shows why', async () => {
    api(ACTOR, ADMIN_DETAIL);
    renderGroup(1);
    await screen.findByRole('heading', { name: 'Administrators' });
    const quotes = screen.getByRole('checkbox', { name: 'View quotes in the admin panel' });
    expect(quotes).toBeChecked();
    expect(quotes).toBeDisabled();
    expect(quotes.closest('label')).toHaveAttribute('title', 'The Administrators group always has every permission');
    expect(screen.getByText('The Administrators group always has every permission, so its boxes are locked.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save permissions/ })).toBeNull();
  });

  it('shows the members and leaves the delete button locked for the system group', async () => {
    api(ACTOR, ADMIN_DETAIL);
    renderGroup(1);
    await screen.findByRole('heading', { name: 'Administrators' });
    expect(screen.getByRole('link', { name: 'kea' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete group' })).toBeDisabled();
  });
});
