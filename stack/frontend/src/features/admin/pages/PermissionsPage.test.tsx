import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import '@/i18n';
import PermissionsPage from './PermissionsPage';
import { GROUPS, groupsPage, installApi, writes } from '../testHarness';

/** Holds everything except the users/groups write permissions and the races/quotes managers. */
const ACTOR = [
  'admin.access',
  'groups.read',
  'groups.manage',
  'users.read',
  'users.ban',
  'users.groups',
  'reports.read',
  'reports.resolve',
  'results.read',
  'results.delete',
  'audit.read',
  'quotes.read',
  'races.read',
];

function renderMatrix() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/admin/permissions']}>
        <Routes>
          <Route path="/admin/permissions" element={<PermissionsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/**
 * The group list plus a permissions PUT. The list is a copy the PUT updates, as the server would, so a
 * refetch after a save shows what was saved. `failing` names groups whose PUT is refused with a message.
 */
function responders(failing: Record<number, string> = {}) {
  const store = structuredClone(GROUPS);
  return [
    (req: { method: string; path: string }) =>
      req.method === 'GET' && req.path === '/admin/groups' ? { body: groupsPage(store) } : undefined,
    (req: { method: string; path: string; body: unknown }) => {
      const match = /^\/admin\/groups\/(\d+)\/permissions$/.exec(req.path);
      if (req.method !== 'PUT' || !match) return undefined;
      const id = Number(match[1]);
      if (failing[id]) return { status: 400, body: { message: failing[id] } };
      const permissions = (req.body as { permissions: string[] }).permissions;
      const group = store.find((g) => g.id === id);
      if (group) group.permissions = permissions;
      return { body: group };
    },
  ];
}

const box = (name: string) => screen.getByRole('checkbox', { name });
const cellLabel = (name: string) => box(name).closest('label') as HTMLElement;

describe('Permissions matrix', () => {
  it('tracks dirty cells and sends one PUT per changed group', async () => {
    const user = userEvent.setup();
    const fetchMock = installApi({ permissions: ACTOR }, responders());
    renderMatrix();

    await user.click(await screen.findByRole('checkbox', { name: 'Viewers: View quotes in the admin panel' }));
    await user.click(box('Moderators: View the audit log'));

    expect(screen.getByText('2 unsaved changes')).toBeInTheDocument();
    const save = screen.getByRole('button', { name: 'Save changes (2)' });
    expect(box('Viewers: View quotes in the admin panel')).toBeChecked();
    expect(box('Moderators: View the audit log')).not.toBeChecked();

    await user.click(save);

    await waitFor(() => expect(writes(fetchMock)).toHaveLength(2));
    const sent = writes(fetchMock);
    expect(sent.map((w) => w.path).sort()).toEqual(['/admin/groups/2/permissions', '/admin/groups/3/permissions']);
    expect(sent.find((w) => w.path === '/admin/groups/3/permissions')?.body).toEqual({
      permissions: ['admin.access', 'audit.read', 'quotes.read'],
    });
    expect(sent.find((w) => w.path === '/admin/groups/2/permissions')?.body).not.toEqual({
      permissions: expect.arrayContaining(['audit.read']),
    });
    await waitFor(() => expect(screen.queryByRole('button', { name: /Save changes/ })).toBeNull());
  });

  it('outlines a changed cell and clears every change on discard', async () => {
    const user = userEvent.setup();
    const fetchMock = installApi({ permissions: ACTOR }, responders());
    renderMatrix();
    await user.click(await screen.findByRole('checkbox', { name: 'Viewers: View quotes in the admin panel' }));

    const cell = cellLabel('Viewers: View quotes in the admin panel').closest('td');
    expect(cell).toHaveClass('outline-caret');

    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(box('Viewers: View quotes in the admin panel')).not.toBeChecked();
    expect(screen.queryByRole('button', { name: /Save changes/ })).toBeNull();
    expect(writes(fetchMock)).toEqual([]);
  });

  it('locks cells with the reason as the tooltip', async () => {
    installApi({ permissions: ACTOR }, responders());
    renderMatrix();
    await screen.findByRole('checkbox', { name: 'Viewers: View quotes in the admin panel' });

    // The system group is locked and shows every permission as held.
    const adminQuotes = box('Administrators: View quotes in the admin panel');
    expect(adminQuotes).toBeChecked();
    expect(adminQuotes).toBeDisabled();
    expect(cellLabel('Administrators: View quotes in the admin panel')).toHaveAttribute(
      'title',
      'The Administrators group always has every permission',
    );

    // The actor has no races.manage, so it cannot be ticked.
    expect(box('Moderators: Close race rooms')).toBeDisabled();
    expect(cellLabel('Moderators: Close race rooms')).toHaveAttribute('title', "You don't have this permission");

    // A read that a checked write needs cannot be turned off.
    expect(box('Moderators: List and view users, including email')).toBeDisabled();
    expect(cellLabel('Moderators: List and view users, including email')).toHaveAttribute('title', 'Included with users.ban');
  });

  it('shows a read-only matrix to a user who cannot manage groups', async () => {
    installApi({ permissions: ACTOR.filter((p) => p !== 'groups.manage') }, responders());
    renderMatrix();
    expect(await screen.findByText("You can see the matrix but can't change it.")).toBeInTheDocument();
    expect(box('Viewers: View quotes in the admin panel')).toBeDisabled();
    expect(cellLabel('Viewers: View quotes in the admin panel')).toHaveAttribute('title', "You don't have this permission");
  });

  it('reports a failed group with its message and keeps only that group\'s changes', async () => {
    const user = userEvent.setup();
    installApi({ permissions: ACTOR }, responders({ 2: 'Moderators is managed by the owner' }));
    renderMatrix();

    await user.click(await screen.findByRole('checkbox', { name: 'Viewers: View quotes in the admin panel' }));
    await user.click(box('Moderators: View the audit log'));
    await user.click(screen.getByRole('button', { name: 'Save changes (2)' }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Moderators: Moderators is managed by the owner')).toBeInTheDocument();
    // Viewers saved, so only Moderators' change is left.
    expect(screen.getByRole('button', { name: 'Save changes (1)' })).toBeInTheDocument();
    expect(box('Viewers: View quotes in the admin panel')).toBeChecked();
  });
});
