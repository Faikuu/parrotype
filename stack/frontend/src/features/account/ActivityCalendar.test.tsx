import { render, screen } from '@testing-library/react';
import '@/i18n';
import { ActivityCalendar } from './ActivityCalendar';

// Today is a Monday, so 365 days fall in the 53-week grid.
const TODAY = '2026-11-09';

describe('ActivityCalendar', () => {
  it('renders one titled cell per day in the grid', () => {
    const { container } = render(
      <ActivityCalendar activity={[{ date: '2026-11-08', tests: 3 }]} today={TODAY} />,
    );
    expect(container.querySelectorAll('[title]')).toHaveLength(365);
    expect(screen.getByTitle('3 tests on Nov 8, 2026')).toBeInTheDocument();
    expect(screen.getByTitle('No tests on Nov 9, 2026')).toBeInTheDocument();
  });

  it('uses the singular for one test', () => {
    render(<ActivityCalendar activity={[{ date: '2026-11-09', tests: 1 }]} today={TODAY} />);
    expect(screen.getByTitle('1 test on Nov 9, 2026')).toBeInTheDocument();
  });

  it('lists the days with tests in a table under a details element', () => {
    const { container } = render(
      <ActivityCalendar
        activity={[
          { date: '2026-11-02', tests: 2 },
          { date: '2026-11-08', tests: 3 },
        ]}
        today={TODAY}
      />,
    );
    const details = container.querySelector('details');
    expect(details).not.toBeNull();
    expect(screen.getByText('Activity as a table')).toBeInTheDocument();
    const rows = container.querySelectorAll('details tbody tr');
    expect(rows).toHaveLength(2);
    // Newest first.
    expect(rows[0]).toHaveTextContent('Nov 8, 2026');
    expect(rows[0]).toHaveTextContent('3');
  });

  it('labels the scroll region', () => {
    render(<ActivityCalendar activity={[]} today={TODAY} />);
    expect(screen.getByRole('region', { name: 'Tests per day over the last year' })).toBeInTheDocument();
  });
});
