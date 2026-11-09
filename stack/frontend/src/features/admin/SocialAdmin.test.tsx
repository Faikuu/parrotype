import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import '@/i18n';
import AdminLayout from './AdminLayout';
import EventsPage from './pages/EventsPage';
import { installApi, writes, type MockRequest } from './testHarness';

function renderNav(permissions: string[]) {
  installApi({ permissions }, []);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<p>dashboard page</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function sidebarLinks(): string[] {
  const nav = screen.getByRole('navigation', { name: 'Admin sections' });
  return within(nav)
    .getAllByRole('link')
    .map((a) => a.textContent ?? '');
}

describe('admin nav for the social sections', () => {
  it('shows Announcements only to announcements.manage', async () => {
    renderNav(['announcements.manage']);
    await screen.findByRole('navigation', { name: 'Admin sections' });
    expect(sidebarLinks()).toEqual(['Dashboard', 'Announcements']);
  });

  it('shows Events only to events.manage', async () => {
    renderNav(['events.manage']);
    await screen.findByRole('navigation', { name: 'Admin sections' });
    expect(sidebarLinks()).toEqual(['Dashboard', 'Events']);
  });

  it('hides both from a user without the new permissions', async () => {
    renderNav(['reports.read']);
    await screen.findByRole('navigation', { name: 'Admin sections' });
    expect(sidebarLinks()).toEqual(['Dashboard', 'Reports']);
  });
});

const NOW = Date.now();
const EVENTS = [
  {
    id: 1,
    slug: 'autumn-sprint',
    title: 'Autumn sprint',
    description: 'Ten minutes.',
    language: 'en',
    text: 'the quick brown fox jumps over the lazy dog',
    startsAt: new Date(NOW - 3_600_000).toISOString(),
    endsAt: new Date(NOW + 3_600_000).toISOString(),
    state: 'active',
    createdAt: '2026-11-01T10:00:00Z',
  },
  {
    id: 2,
    slug: 'winter-dash',
    title: 'Winter dash',
    description: '',
    language: 'de',
    text: 'ein kurzer test fuer den winter und die kalte luft',
    startsAt: new Date(NOW + 86_400_000).toISOString(),
    endsAt: new Date(NOW + 90_000_000).toISOString(),
    state: 'upcoming',
    createdAt: '2026-11-02T10:00:00Z',
  },
];

function renderEvents() {
  const fetchMock = installApi({ permissions: ['events.manage'] }, [
    (req: MockRequest) =>
      req.path === '/admin/events' && req.method === 'GET'
        ? { body: { items: EVENTS, total: 2, page: 1, pageSize: 25 } }
        : undefined,
    (req: MockRequest) =>
      req.path.startsWith('/admin/events/') && req.method === 'PATCH' ? { body: EVENTS[0] } : undefined,
  ]);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/admin/events']}>
        <EventsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return fetchMock;
}

/** The table row of an event, found by its title. */
function rowOf(title: string): HTMLElement {
  return screen.getByText(title).closest('tr') as HTMLElement;
}

describe('admin events modal', () => {
  it('locks the text, language and start of a started event, and says why', async () => {
    renderEvents();
    await screen.findByText('Autumn sprint');
    await userEvent.click(within(rowOf('Autumn sprint')).getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit event' });

    expect(within(dialog).getByLabelText('Language')).toBeDisabled();
    expect(within(dialog).getByLabelText('Text')).toBeDisabled();
    expect(within(dialog).getByLabelText('Starts (your local time)')).toBeDisabled();
    expect(within(dialog).getByText(/This event has started/)).toBeInTheDocument();
    // Title and the end stay editable.
    expect(within(dialog).getByLabelText('Title')).toBeEnabled();
    expect(within(dialog).getByLabelText('Ends (your local time)')).toBeEnabled();
  });

  it('leaves the locked fields out of the update', async () => {
    const fetchMock = renderEvents();
    await screen.findByText('Autumn sprint');
    await userEvent.click(within(rowOf('Autumn sprint')).getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit event' });
    const title = within(dialog).getByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Autumn sprint 2');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await vi.waitFor(() => expect(writes(fetchMock)).toHaveLength(1));
    const [call] = writes(fetchMock);
    expect(call).toEqual({ method: 'PATCH', path: '/admin/events/1', body: { title: 'Autumn sprint 2' } });
  });

  it('keeps every field editable for an event that has not started', async () => {
    renderEvents();
    await screen.findByText('Winter dash');
    await userEvent.click(within(rowOf('Winter dash')).getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit event' });
    expect(within(dialog).getByLabelText('Language')).toBeEnabled();
    expect(within(dialog).getByLabelText('Text')).toBeEnabled();
    expect(within(dialog).getByLabelText('Starts (your local time)')).toBeEnabled();
    expect(within(dialog).queryByText(/This event has started/)).toBeNull();
    // The link (slug) cannot change once created.
    expect(within(dialog).getByLabelText('Slug')).toBeDisabled();
  });
});
