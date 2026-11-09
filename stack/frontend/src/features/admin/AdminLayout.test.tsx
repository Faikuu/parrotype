import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import '@/i18n';
import AdminLayout from './AdminLayout';
import { CATALOG_KEYS, installApi } from './testHarness';
import { RequirePermission } from './components/RequirePermission';

function renderAdmin(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<p>dashboard page</p>} />
            <Route path="/admin/users" element={<RequirePermission perm="users.read"><p>users page</p></RequirePermission>} />
            <Route path="/admin/reports" element={<RequirePermission perm="reports.read"><p>reports page</p></RequirePermission>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The sidebar links, by their visible names. */
function sidebarLinks(): string[] {
  const nav = screen.getByRole('navigation', { name: 'Admin sections' });
  return within(nav)
    .getAllByRole('link')
    .map((a) => a.textContent ?? '');
}

describe('AdminLayout navigation', () => {
  it('shows only the sections the user can open', () => {
    installApi({ permissions: ['users.read'] });
    renderAdmin('/admin');
    return screen.findByRole('navigation', { name: 'Admin sections' }).then(() => {
      expect(sidebarLinks()).toEqual(['Dashboard', 'Users']);
    });
  });

  it('shows the reports section alone for a reports-only user', async () => {
    installApi({ permissions: ['reports.read'] });
    renderAdmin('/admin');
    await screen.findByRole('navigation', { name: 'Admin sections' });
    expect(sidebarLinks()).toEqual(['Dashboard', 'Reports']);
  });

  it('shows every section to a user with the whole catalog', async () => {
    installApi({ permissions: CATALOG_KEYS });
    renderAdmin('/admin');
    await screen.findByRole('navigation', { name: 'Admin sections' });
    expect(sidebarLinks()).toEqual([
      'Dashboard',
      'Users',
      'Groups',
      'Permissions',
      'Reports',
      'Results',
      'Quotes',
      'Races',
      'Audit log',
    ]);
  });

  it('offers the same sections in the mobile select', async () => {
    installApi({ permissions: ['users.read', 'audit.read'] });
    renderAdmin('/admin');
    const select = await screen.findByRole('combobox', { name: 'Admin section' });
    const options = within(select).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Dashboard', 'Users', 'Audit log']);
  });

  it('shows NotFound to a signed-in user with no permissions', async () => {
    installApi({ permissions: [] });
    renderAdmin('/admin');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Admin sections' })).toBeNull();
  });

  it('shows NotFound to an anonymous visitor', async () => {
    installApi(null);
    renderAdmin('/admin');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('shows NotFound for a section the user cannot open, even by its address', async () => {
    installApi({ permissions: ['reports.read'] });
    renderAdmin('/admin/users');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.queryByText('users page')).toBeNull();
  });

  it('opens a section the user can open', async () => {
    installApi({ permissions: ['reports.read'] });
    renderAdmin('/admin/reports');
    expect(await screen.findByText('reports page')).toBeInTheDocument();
  });
});
