import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import '@/i18n';
import { NotificationItem } from './NotificationItem';
import type { AppNotification } from '@/lib/api/types';

function item(kind: string, data: Record<string, string | number>, readAt: string | null = null): AppNotification {
  return { id: 1, kind, data, readAt, createdAt: '2026-11-08T10:00:00Z' };
}

/** The sentence's text, without the screen-reader "Unread: " prefix. Links split it across elements, so read the paragraph. */
function sentence(container: HTMLElement): string {
  return (container.querySelector('p')?.textContent ?? '').replace(/^Unread: /, '');
}

function renderItem(n: AppNotification) {
  return render(
    <MemoryRouter>
      <ul>
        <NotificationItem item={n} />
      </ul>
    </MemoryRouter>,
  );
}

describe('notification sentences', () => {
  it('a follow names the follower, linked to their profile', () => {
    const { container } = renderItem(item('follow', { by: 'mira' }));
    expect(sentence(container)).toBe('mira follows you.');
    expect(screen.getByRole('link', { name: 'mira' })).toHaveAttribute('href', '/u/mira');
  });

  it('a report outcome names the reported player and never says what was done', () => {
    const { container } = renderItem(item('report_outcome', { target: 'spam_bot' }));
    expect(sentence(container)).toBe('Your report about spam_bot was reviewed.');
    expect(screen.getByRole('link', { name: 'spam_bot' })).toHaveAttribute('href', '/u/spam_bot');
  });

  it('a new best links the player and the leaderboard for that mode', () => {
    const { container } = renderItem(item('pb_beaten', { by: 'tom', mode: 'time', mode2: '60', language: 'en', wpm: 92 }));
    expect(sentence(container)).toBe('tom beat your best in time 60 with 92 wpm.');
    expect(screen.getByRole('link', { name: 'tom' })).toHaveAttribute('href', '/u/tom');
    expect(screen.getByRole('link', { name: 'time 60' })).toHaveAttribute('href', '/leaderboard?mode=time&mode2=60&language=en');
  });

  it('a best in an unranked-for-board mode shows the label without a link', () => {
    const { container } = renderItem(item('pb_beaten', { by: 'tom', mode: 'quote', mode2: 'short', language: 'en', wpm: 80 }));
    expect(sentence(container)).toBe('tom beat your best in quote short with 80 wpm.');
    expect(screen.queryByRole('link', { name: 'quote short' })).toBeNull();
  });

  it('an unknown kind gets a generic line', () => {
    renderItem(item('event_start', { slug: 'x' }));
    expect(screen.getByText('You have a new notification.')).toBeInTheDocument();
  });

  it('marks unread items for screen readers and with a dot', () => {
    const { container } = renderItem(item('follow', { by: 'mira' }));
    expect(screen.getByText('Unread:', { exact: false })).toBeInTheDocument();
    expect(container.querySelector('.bg-main')).not.toBeNull();
  });

  it('read items have no unread marker', () => {
    const { container } = renderItem(item('follow', { by: 'mira' }, '2026-11-08T11:00:00Z'));
    expect(screen.queryByText('Unread:', { exact: false })).toBeNull();
    expect(container.querySelector('.bg-main')).toBeNull();
  });
});
