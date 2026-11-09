import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import '@/i18n';
import { installApi, writes, type MockRequest } from '@/features/admin/testHarness';
import EventPage from './EventPage';

const TEXT = 'the quick brown fox';

function detailFor(startsAt: string, endsAt: string, slug = 'autumn-sprint') {
  return (req: MockRequest) => {
    if (req.path !== `/events/${slug}`) return undefined;
    const started = Date.now() >= Date.parse(startsAt);
    return {
      body: {
        slug,
        title: 'Autumn sprint',
        description: 'Ten minutes of leaves.',
        language: 'en',
        startsAt,
        endsAt,
        state: started ? (Date.now() < Date.parse(endsAt) ? 'active' : 'past') : 'upcoming',
        // The text is only served once the event has started.
        text: started ? TEXT : null,
      },
    };
  };
}

const LEADERBOARD = (req: MockRequest) =>
  req.path === '/events/autumn-sprint/leaderboard'
    ? { body: [{ rank: 1, name: 'mira', wpm: 88, rawWpm: 90, accuracy: 99.5, createdAt: '2026-11-08T10:00:00Z', verified: true, resultId: 4 }] }
    : undefined;

function renderEvent(
  user: { id: number; name: string } | null,
  responders: Parameters<typeof installApi>[1] = [],
) {
  const fetchMock = installApi(user ? { id: user.id, name: user.name, permissions: [] } : null, [
    LEADERBOARD,
    ...responders,
    (req) => (req.path === '/results' && req.method === 'POST' ? { body: { id: 77, verified: true } } : undefined),
  ]);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/events/autumn-sprint']}>
        <Routes>
          <Route path="/events/:slug" element={<EventPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return fetchMock;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('EventPage countdown', () => {
  it('counts down to the start, then offers Start once the text is out', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-09T12:00:00Z') });
    const startsAt = new Date('2026-11-09T12:00:05Z').toISOString();
    const endsAt = new Date('2026-11-09T13:00:00Z').toISOString();
    renderEvent({ id: 2, name: 'kea' }, [detailFor(startsAt, endsAt)]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const timer = screen.getByRole('timer');
    expect(timer).toHaveTextContent('Starts in 00:00:05');
    expect(screen.getByText('The text appears when the event starts.')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByRole('timer')).toHaveTextContent('Starts in 00:00:03');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(screen.queryByRole('timer')).toBeNull();
    // The text arrives with a refetch once the start has passed; the button enables when it does.
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled());
  });

  it('shows the window in local time and the leaderboard before the start', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-09T12:00:00Z') });
    renderEvent({ id: 2, name: 'kea' }, [
      detailFor(new Date('2026-11-09T14:00:00Z').toISOString(), new Date('2026-11-09T15:00:00Z').toISOString()),
    ]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole('heading', { name: 'Event leaderboard' })).toBeInTheDocument();
    const board = await vi.waitFor(() => screen.getByRole('table'));
    expect(within(board).getByText('mira')).toBeInTheDocument();
    expect(screen.getByText(/From .* to .* \(your local time\)/)).toBeInTheDocument();
  });
});

describe('EventPage logged out', () => {
  it('asks the visitor to log in to take part, and still shows the board', async () => {
    const startsAt = new Date(Date.now() - 60_000).toISOString();
    const endsAt = new Date(Date.now() + 3_600_000).toISOString();
    renderEvent(null, [detailFor(startsAt, endsAt)]);
    expect(await screen.findByText('Log in to take part.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login?next=%2Fevents%2Fautumn-sprint');
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });
});

describe('EventPage typing', () => {
  it('records the replay and submits it as an event result', async () => {
    const startsAt = new Date(Date.now() - 60_000).toISOString();
    const endsAt = new Date(Date.now() + 3_600_000).toISOString();
    const fetchMock = renderEvent({ id: 2, name: 'kea' }, [detailFor(startsAt, endsAt)]);

    await userEvent.click(await screen.findByRole('button', { name: 'Start' }));
    const input = document.querySelector<HTMLInputElement>('[data-typing-input]');
    expect(input).not.toBeNull();
    await userEvent.type(input!, TEXT);

    expect(await screen.findByText('Verified. Your result is on the board.')).toBeInTheDocument();
    const [submit] = writes(fetchMock).filter((w) => w.path === '/results');
    expect(submit).toBeDefined();
    expect(submit!.method).toBe('POST');
    const body = submit!.body as {
      mode: string;
      mode2: string;
      language: string;
      punctuation: boolean;
      numbers: boolean;
      wpm: number;
      replay: { v: number; words: string[]; events: { t: number; k: string; ch?: string }[] };
    };
    expect(body.mode).toBe('event');
    expect(body.mode2).toBe('autumn-sprint');
    expect(body.language).toBe('en');
    expect(body.punctuation).toBe(false);
    expect(body.numbers).toBe(false);
    expect(body.replay.v).toBe(1);
    expect(body.replay.words).toEqual(['the', 'quick', 'brown', 'fox']);
    // Every typed character is logged as a 'c' event, and the spaces as 's' events.
    expect(body.replay.events.filter((e) => e.k === 'c').map((e) => e.ch).join('')).toBe('thequickbrownfox');
    expect(body.replay.events.filter((e) => e.k === 's')).toHaveLength(3);
    expect(body.replay.events[0]).toMatchObject({ t: 0, k: 'c', ch: 't' });
  });
});
