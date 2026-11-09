import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@/i18n';
import { installApi } from '@/features/admin/testHarness';
import { AnnouncementBanner } from './AnnouncementBanner';
import { DISMISSED_KEY } from './dismissed';

const ACTIVE = [
  { id: 1, message: 'Maintenance on Sunday at 02:00 UTC.', level: 'info', startsAt: '2026-11-01T00:00:00Z', endsAt: null, createdAt: '2026-11-01T00:00:00Z' },
  { id: 2, message: 'The leaderboard is reset on Monday.', level: 'warning', startsAt: '2026-11-01T00:00:00Z', endsAt: null, createdAt: '2026-11-02T00:00:00Z' },
];

function renderBanner() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AnnouncementBanner />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  installApi(null, [(req) => (req.path === '/announcements/active' ? { body: ACTIVE } : undefined)]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AnnouncementBanner', () => {
  it('shows each active announcement as a status region, the warning with its label', async () => {
    renderBanner();
    const statuses = await screen.findAllByRole('status');
    expect(statuses).toHaveLength(2);
    expect(statuses[0]).toHaveTextContent('Maintenance on Sunday at 02:00 UTC.');
    expect(within(statuses[1]!).getByText('Warning:', { exact: false })).toBeInTheDocument();
  });

  it('dismisses one announcement by id and remembers it in localStorage', async () => {
    const { unmount } = renderBanner();
    await screen.findAllByRole('status');
    const dismiss = screen.getAllByRole('button', { name: 'Dismiss announcement' });
    await userEvent.click(dismiss[0]!);

    expect(screen.queryByText('Maintenance on Sunday at 02:00 UTC.')).toBeNull();
    expect(screen.getByText('The leaderboard is reset on Monday.')).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(DISMISSED_KEY)!)).toEqual([1]);

    // A fresh visit (a new mount) still hides it.
    unmount();
    renderBanner();
    await screen.findByText('The leaderboard is reset on Monday.');
    expect(screen.queryByText('Maintenance on Sunday at 02:00 UTC.')).toBeNull();
  });

  it('still hides a dismissed banner when localStorage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    renderBanner();
    await screen.findAllByRole('status');
    await userEvent.click(screen.getAllByRole('button', { name: 'Dismiss announcement' })[0]!);
    expect(screen.queryByText('Maintenance on Sunday at 02:00 UTC.')).toBeNull();
  });

  it('renders nothing when there are no announcements', async () => {
    vi.unstubAllGlobals();
    installApi(null, [(req) => (req.path === '/announcements/active' ? { body: [] } : undefined)]);
    const { container } = renderBanner();
    await vi.waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
