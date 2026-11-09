import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import '@/i18n';
import { installApi, writes, type Responder } from '@/features/admin/testHarness';
import { NotificationBell } from './NotificationBell';
import { UNREAD_POLL_MS } from './useNotifications';

const ITEMS = [
  { id: 9, kind: 'follow', data: { by: 'mira' }, readAt: null, createdAt: '2026-11-08T10:00:00Z' },
  { id: 8, kind: 'pb_beaten', data: { by: 'tom', mode: 'time', mode2: '60', language: 'en', wpm: 92 }, readAt: '2026-11-08T09:00:00Z', createdAt: '2026-11-08T09:30:00Z' },
];

function renderBell(responders: Responder[] = []) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const fetchMock = installApi({ id: 2, name: 'kea', permissions: [] }, [
    (req) => (req.path === '/notifications/unread-count' ? { body: { count: unread } } : undefined),
    (req) => {
      if (req.path !== '/notifications/read') return undefined;
      const updated = unread;
      unread = 0; // the server marks them read, so the next count is 0
      return { body: { updated } };
    },
    (req) => (req.path === '/notifications' ? { body: { items: ITEMS, total: 2, page: 1, pageSize: 10 } } : undefined),
    ...responders,
  ]);
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="*" element={<NotificationBell />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return fetchMock;
}

let unread = 0;

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}

function countCalls(fn: { mock: { calls: unknown[][] } }, path: string) {
  return fn.mock.calls.filter(([input]) => String(input).replace(/\?.*$/, '').endsWith(path)).length;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setVisibility('visible');
});

describe('NotificationBell badge', () => {
  it('shows the unread count, capped at 9+', async () => {
    unread = 3;
    renderBell();
    expect(await screen.findByText('3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notifications, 3 unread' })).toBeInTheDocument();
  });

  it('shows 9+ from ten unread', async () => {
    unread = 12;
    renderBell();
    expect(await screen.findByText('9+')).toBeInTheDocument();
  });

  it('shows no badge when nothing is unread', async () => {
    unread = 0;
    renderBell();
    const button = await screen.findByRole('button', { name: 'Notifications' });
    expect(button.querySelector('[aria-hidden="true"].bg-caret')).toBeNull();
  });
});

describe('NotificationBell polling', () => {
  it('polls the unread count every 60s while the tab is visible, and on focus', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    unread = 1;
    setVisibility('visible');
    const fetchMock = renderBell();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const start = countCalls(fetchMock, '/notifications/unread-count');
    expect(start).toBeGreaterThanOrEqual(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(UNREAD_POLL_MS);
    });
    expect(countCalls(fetchMock, '/notifications/unread-count')).toBe(start + 1);

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(countCalls(fetchMock, '/notifications/unread-count')).toBe(start + 2);
  });

  it('does not poll while the document is hidden', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    unread = 1;
    setVisibility('hidden');
    const fetchMock = renderBell();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const start = countCalls(fetchMock, '/notifications/unread-count');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UNREAD_POLL_MS * 3);
    });
    expect(countCalls(fetchMock, '/notifications/unread-count')).toBe(start);

    // Back in view: the next tick refreshes again.
    setVisibility('visible');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UNREAD_POLL_MS);
    });
    expect(countCalls(fetchMock, '/notifications/unread-count')).toBe(start + 1);
  });
});

describe('NotificationBell panel', () => {
  it('opens with aria-expanded, lists the latest items with unread dots, and links to the full page', async () => {
    unread = 1;
    renderBell();
    const button = await screen.findByRole('button', { name: 'Notifications, 1 unread' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const panel = await screen.findByRole('region', { name: 'Recent notifications' });
    expect(button.getAttribute('aria-controls')).toBe(panel.id);
    expect(within(panel).getByText('Unread:', { exact: false })).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'See all notifications' })).toHaveAttribute('href', '/notifications');
  });

  it('closes on Escape and returns focus to the button', async () => {
    unread = 1;
    renderBell();
    const button = await screen.findByRole('button', { name: 'Notifications, 1 unread' });
    await userEvent.click(button);
    await screen.findByRole('region', { name: 'Recent notifications' });
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: 'Recent notifications' })).toBeNull();
    expect(button).toHaveFocus();
  });

  it('closes on a click outside', async () => {
    unread = 1;
    renderBell();
    const button = await screen.findByRole('button', { name: 'Notifications, 1 unread' });
    await userEvent.click(button);
    await screen.findByRole('region', { name: 'Recent notifications' });
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('region', { name: 'Recent notifications' })).toBeNull();
  });

  it('marks everything read from the panel and clears the badge', async () => {
    unread = 2;
    const fetchMock = renderBell();
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications, 2 unread' }));
    const panel = await screen.findByRole('region', { name: 'Recent notifications' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Mark all as read' }));

    expect(await screen.findByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    expect(writes(fetchMock)).toEqual([{ method: 'POST', path: '/notifications/read', body: {} }]);
  });
});
