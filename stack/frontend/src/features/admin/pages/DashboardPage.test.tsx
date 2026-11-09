import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import '@/i18n';
import DashboardPage from './DashboardPage';
import { installApi } from '../testHarness';

// Charts need a canvas; the stats are what this test is about.
vi.mock('react-chartjs-2', () => ({ Line: () => null }));

const STATS = {
  users: { total: 1234, new7d: 17, banned: 3 },
  results: { total: 98765, today: 42, last7d: 600 },
  reports: { open: 5 },
  races: { rooms: 2, players: 7 },
  signupsByDay: [{ date: '2026-11-08', count: 4 }],
  resultsByDay: [{ date: '2026-11-08', count: 40 }],
};

describe('Admin dashboard', () => {
  it('renders the stat row', async () => {
    installApi({ permissions: ['admin.access'] }, [
      (req) => (req.method === 'GET' && req.path === '/admin/stats' ? { body: STATS } : undefined),
    ]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('1,234')).toBeInTheDocument();
    expect(screen.getByText('17')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3 suspended')).toBeInTheDocument();
    expect(screen.getByText('7 players')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Signups per day' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Results per day' })).toBeInTheDocument();
  });
});
