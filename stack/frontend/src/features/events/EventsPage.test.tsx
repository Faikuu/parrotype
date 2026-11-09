import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import '@/i18n';
import { installApi } from '@/features/admin/testHarness';
import EventsPage from './EventsPage';

const now = Date.now();
const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString();

const LISTING = {
  active: [
    { slug: 'autumn-sprint', title: 'Autumn sprint', description: 'Ten minutes of leaves.', language: 'en', startsAt: iso(-60_000), endsAt: iso(3_600_000), state: 'active' },
  ],
  upcoming: [
    { slug: 'winter-dash', title: 'Winter dash', description: '', language: 'de', startsAt: iso(7_200_000), endsAt: iso(9_000_000), state: 'upcoming' },
  ],
  past: [],
};

function renderPage(listing: unknown) {
  installApi(null, [(req) => (req.path === '/events' ? { body: listing } : undefined)]);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <EventsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EventsPage lists', () => {
  it('shows running, upcoming and past sections, with the running event highlighted', async () => {
    renderPage(LISTING);
    const running = await screen.findByRole('region', { name: 'Running now' });
    expect(within(running).getByRole('link', { name: /Autumn sprint/ })).toHaveAttribute('href', '/events/autumn-sprint');
    expect(within(running).getByRole('link', { name: /Autumn sprint/ }).className).toContain('border-main');
    expect(within(running).getByText('Ends in 1 hour')).toBeInTheDocument();

    const upcoming = screen.getByRole('region', { name: 'Upcoming' });
    expect(within(upcoming).getByRole('link', { name: /Winter dash/ })).toHaveAttribute('href', '/events/winter-dash');
    expect(within(upcoming).getByText(/Language: Deutsch/)).toBeInTheDocument();
    expect(within(upcoming).getByText(/Starts in 2 hours/)).toBeInTheDocument();
  });

  it('shows an empty line for each section with nothing in it', async () => {
    renderPage(LISTING);
    const past = await screen.findByRole('region', { name: 'Past' });
    expect(within(past).getByText('No past events yet.')).toBeInTheDocument();
  });

  it('shows one message when there are no events at all', async () => {
    renderPage({ active: [], upcoming: [], past: [] });
    expect(await screen.findByText('No events yet. Check back soon.')).toBeInTheDocument();
    expect(screen.getByText('No event is running right now.')).toBeInTheDocument();
  });
});
