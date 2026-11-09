import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import '@/i18n';
import { MockSocket } from './mockSocket';
import RaceRoomPage from './RaceRoomPage';
import type { RaceRoom } from './protocol';

function player(id: string, name: string, over: Record<string, unknown> = {}) {
  return {
    id,
    name,
    isGuest: name.startsWith('guest '),
    progress: 0,
    wpm: 0,
    finished: false,
    place: null,
    accuracy: null,
    connected: true,
    ...over,
  };
}

function room(over: Partial<RaceRoom> = {}): RaceRoom {
  return {
    id: 'abc12345',
    language: 'en',
    status: 'lobby',
    hostId: 'p1',
    text: null,
    source: null,
    startsAt: null,
    players: [player('p1', 'guest Ann')],
    ...over,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** A logged-out visitor (me → 401) unless `user` is given. */
function stubSession(user: { id: number; name: string } | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('/auth/me')) {
        return user
          ? jsonResponse(200, { user: { ...user, email: 'x@example.test', createdAt: '2026-01-01T00:00:00.000Z' } })
          : jsonResponse(401, { message: 'Unauthorized' });
      }
      return jsonResponse(404, { message: 'Not found' });
    }),
  );
}

function renderRoom(path = '/race/abc12345') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/race/:id" element={<RaceRoomPage />} />
          <Route path="/race" element={<p>lobby page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The socket the page opened last. */
function socket(): MockSocket {
  const s = MockSocket.instances[MockSocket.instances.length - 1];
  if (!s) throw new Error('no socket opened yet');
  return s;
}

/** Joins as player `p1` and delivers the room state. */
async function joinWith(state: RaceRoom) {
  await waitFor(() => expect(MockSocket.instances.length).toBeGreaterThan(0));
  act(() => {
    socket().open();
    socket().receive({ type: 'joined', you: 'p1' });
    socket().receive({ type: 'room', room: state });
  });
}

/** Types into the hidden race input, the same way a keyboard would. */
async function typeKeys(text: string) {
  const input = document.querySelector<HTMLInputElement>('[data-typing-input]');
  if (!input) throw new Error('no typing input');
  const user = userEvent.setup();
  await user.click(input);
  await user.keyboard(text);
}

beforeEach(() => {
  MockSocket.reset();
  vi.stubGlobal('WebSocket', MockSocket);
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RaceRoomPage: guests', () => {
  it('asks for a nickname first, validates it, then joins with it and remembers it', async () => {
    stubSession(null);
    renderRoom();
    const field = await screen.findByLabelText('Nickname');
    expect(MockSocket.instances).toHaveLength(0);

    const user = userEvent.setup();
    await user.type(field, 'a');
    await user.click(screen.getByRole('button', { name: 'Join race' }));
    expect(screen.getByText('Use 2 to 20 letters, digits, underscores or spaces.')).toBeInTheDocument();
    expect(MockSocket.instances).toHaveLength(0);

    await user.clear(field);
    await user.type(field, 'Ann');
    await user.click(screen.getByRole('button', { name: 'Join race' }));

    expect(localStorage.getItem('parrotype:nickname')).toBe('Ann');
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    expect(socket().url).toMatch(/\/api\/races\/ws$/);
    act(() => socket().open());
    expect(socket().sentMessages()[0]).toEqual({ type: 'join', room: 'abc12345', name: 'Ann' });
  });

  it('pre-fills the remembered nickname', async () => {
    localStorage.setItem('parrotype:nickname', 'Remembered');
    stubSession(null);
    renderRoom();
    expect(await screen.findByLabelText('Nickname')).toHaveValue('Remembered');
  });
});

describe('RaceRoomPage: signed in', () => {
  it('skips the nickname and joins without a name', async () => {
    stubSession({ id: 1, name: 'alice' });
    renderRoom();
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    expect(screen.queryByLabelText('Nickname')).not.toBeInTheDocument();
    act(() => socket().open());
    expect(socket().sentMessages()[0]).toEqual({ type: 'join', room: 'abc12345' });
  });
});

describe('RaceRoomPage: lobby', () => {
  it('shows the players, the host, the invite button and the host-only start', async () => {
    stubSession({ id: 1, name: 'alice' });
    renderRoom();
    await joinWith(
      room({
        players: [player('p1', 'alice'), player('p2', 'guest Bo')],
      }),
    );
    expect(screen.getByText('Players (2/8)')).toBeInTheDocument();
    const list = screen.getByText('Players (2/8)').nextElementSibling as HTMLElement;
    expect(within(list).getByText('alice')).toBeInTheDocument();
    expect(within(list).getByText('guest Bo')).toBeInTheDocument();
    expect(within(list).getByText('host')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy invite link' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start race' })).toBeInTheDocument();
  });

  it('tells a non-host to wait for the host', async () => {
    stubSession({ id: 1, name: 'alice' });
    renderRoom();
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    act(() => {
      socket().open();
      socket().receive({ type: 'joined', you: 'p2' });
      socket().receive({ type: 'room', room: room({ players: [player('p1', 'alice'), player('p2', 'bob')] }) });
    });
    expect(screen.queryByRole('button', { name: 'Start race' })).not.toBeInTheDocument();
    expect(screen.getByText('Waiting for the host to start')).toBeInTheDocument();
  });

  it('sends start for the host', async () => {
    stubSession({ id: 1, name: 'alice' });
    renderRoom();
    await joinWith(room({ players: [player('p1', 'alice')] }));
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Start race' }));
    expect(socket().sentMessages().at(-1)).toEqual({ type: 'start' });
  });
});

describe('RaceRoomPage: countdown and racing', () => {
  const text = 'ab cd e';

  it('shows the countdown and does not accept typing before startsAt', async () => {
    stubSession({ id: 1, name: 'alice' });
    renderRoom();
    await joinWith(
      room({
        status: 'countdown',
        text,
        source: 'Test source',
        startsAt: Date.now() + 2500,
        players: [player('p1', 'alice')],
      }),
    );
    expect(await screen.findByText('3')).toBeInTheDocument();
    await typeKeys('ab');
    expect(socket().sentMessages().filter((m) => m.type === 'progress')).toHaveLength(0);
  });

  it('lets the racer type once racing starts, sends progress, and finishes with a final progress and finish', async () => {
    stubSession({ id: 1, name: 'alice' });
    renderRoom();
    const startsAt = Date.now() - 100;
    await joinWith(
      room({ status: 'racing', text, source: 'Test source', startsAt, players: [player('p1', 'alice'), player('p2', 'bob', { progress: 0.3 })] }),
    );
    await typeKeys('ab cd e');

    const sent = socket().sentMessages();
    const finish = sent.find((m) => m.type === 'finish');
    expect(finish).toBeDefined();
    expect(finish).toMatchObject({ type: 'finish' });
    const beforeFinish = sent.slice(0, sent.indexOf(finish!));
    expect(beforeFinish.at(-1)).toMatchObject({ type: 'progress', chars: text.length });

    const lanes = screen.getAllByTestId('lane-mark');
    expect(lanes).toHaveLength(2);
    expect(lanes[1]).toHaveAttribute('data-progress', '30.0');
  });

  it('does not finish while an earlier word is wrong, and finishes once it is fixed', async () => {
    stubSession({ id: 1, name: 'alice' });
    renderRoom();
    await joinWith(room({ status: 'racing', text, startsAt: Date.now() - 100, players: [player('p1', 'alice')] }));
    await typeKeys('ax cd e');
    expect(socket().sentMessages().some((m) => m.type === 'finish')).toBe(false);

    const user = userEvent.setup();
    const input = document.querySelector<HTMLInputElement>('[data-typing-input]')!;
    // Backspace back through the last word, into the wrong one, and retype it.
    await user.keyboard('{Backspace>7/}');
    await user.keyboard('b');
    await user.keyboard(' cd e');
    expect(input).toBeInTheDocument();
    expect(socket().sentMessages().some((m) => m.type === 'finish')).toBe(true);
  });

  it('shows the results table with places, and Race again for the host', async () => {
    stubSession({ id: 1, name: 'alice' });
    renderRoom();
    await joinWith(
      room({
        status: 'finished',
        text,
        startsAt: Date.now() - 60_000,
        players: [
          player('p1', 'alice', { place: 2, wpm: 55.4, accuracy: 96.2, finished: true }),
          player('p2', 'guest Bo', { place: 1, wpm: 72, accuracy: 99.1, finished: true }),
          player('p3', 'guest Cy', { progress: 0.5, wpm: 20 }),
        ],
      }),
    );
    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('guest Bo');
    expect(rows[1]).toHaveTextContent('72');
    expect(rows[1]).toHaveTextContent('99%');
    expect(rows[2]).toHaveTextContent('alice');
    expect(rows[3]).toHaveTextContent('Did not finish');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Race again' }));
    expect(socket().sentMessages().at(-1)).toEqual({ type: 'start' });
  });
});

describe('RaceRoomPage: errors', () => {
  it('shows "This race is full" with a link back to the race page', async () => {
    stubSession({ id: 1, name: 'alice' });
    renderRoom();
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    act(() => {
      socket().open();
      socket().receive({ type: 'error', message: 'This race is full' });
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('This race is full');
    expect(screen.getByRole('link', { name: 'Back to race' })).toHaveAttribute('href', '/race');
  });

  it('shows "Race not found"', async () => {
    stubSession({ id: 1, name: 'alice' });
    renderRoom();
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    act(() => {
      socket().open();
      socket().receive({ type: 'error', message: 'Race not found' });
    });
    expect(await screen.findByText('Race not found')).toBeInTheDocument();
  });

  it("shows \"Couldn't connect\" once reconnecting gives up on a refused origin", async () => {
    stubSession({ id: 1, name: 'alice' });
    renderRoom();
    await waitFor(() => expect(MockSocket.instances).toHaveLength(1));
    act(() => socket().drop(1008));
    expect(await screen.findByText("Couldn't connect to the race server")).toBeInTheDocument();
  });
});
