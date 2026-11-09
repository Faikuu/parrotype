import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockSocket } from './mockSocket';
import {
  MAX_RECONNECT_ATTEMPTS,
  ProgressThrottle,
  RaceClient,
  STABLE_CONNECTION_MS,
  raceSocketUrl,
  readRaceToken,
} from './raceClient';
import type { RaceRoom } from './protocol';

const TOKEN = '0123456789abcdef0123456789abcdef';
const TOKEN_KEY = 'parrotype:race-token:abc12345';
const TOO_MANY_MESSAGE = 'Too many open connections from your network. Close other race tabs and try again.';
const STARTED_MESSAGE = 'This race has already started';

function player(id: string, name: string, over: Partial<RaceRoom['players'][number]> = {}) {
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

/** The first error a listener received. */
function firstError(listener: ReturnType<typeof makeListener>) {
  const call = listener.onError.mock.calls[0];
  if (!call) throw new Error('no error reported');
  return call[0];
}

/** The i-th socket the client opened (throws if there isn't one). */
function sock(i: number): MockSocket {
  const s = MockSocket.instances[i];
  if (!s) throw new Error(`no socket ${i}`);
  return s;
}

function makeListener() {
  return {
    onConnection: vi.fn(),
    onJoined: vi.fn(),
    onRoom: vi.fn(),
    onError: vi.fn(),
  };
}

beforeEach(() => {
  MockSocket.reset();
  sessionStorage.clear();
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', MockSocket);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('RaceClient', () => {
  it('joins on open, then reports joined and room messages', () => {
    const listener = makeListener();
    const client = new RaceClient('ws://host/api/races/ws', listener);
    client.connect({ room: 'abc12345', name: 'Ann' });
    const socket = sock(0);
    expect(socket.url).toBe('ws://host/api/races/ws');
    expect(socket.sent).toHaveLength(0);

    socket.open();
    expect(socket.sentMessages()).toEqual([{ type: 'join', room: 'abc12345', name: 'Ann' }]);

    socket.receive({ type: 'joined', you: 'p1' });
    socket.receive({ type: 'room', room: room() });
    expect(listener.onJoined).toHaveBeenCalledWith('p1');
    expect(listener.onRoom).toHaveBeenCalledWith(room());
    expect(listener.onConnection).toHaveBeenLastCalledWith('joined');
  });

  it('leaves out the name for a signed-in user', () => {
    const client = new RaceClient('ws://host/api/races/ws', makeListener());
    client.connect({ room: 'abc12345' });
    sock(0).open();
    expect(sock(0).sentMessages()).toEqual([{ type: 'join', room: 'abc12345' }]);
  });

  it('ignores malformed frames and malformed room payloads', () => {
    const listener = makeListener();
    const client = new RaceClient('ws://host/api/races/ws', listener);
    client.connect({ room: 'abc12345' });
    const socket = sock(0);
    socket.open();
    socket.receiveRaw('not json');
    socket.receive({ type: 'room', room: { id: 'x', status: 'nope' } });
    socket.receive({ type: 'mystery' });
    expect(listener.onRoom).not.toHaveBeenCalled();
    expect(listener.onError).not.toHaveBeenCalled();
    expect(listener.onJoined).not.toHaveBeenCalled();
  });

  it('reconnects with 1s, 2s, 4s, 8s, then 10s, and rejoins each time', () => {
    const client = new RaceClient('ws://host/api/races/ws', makeListener());
    client.connect({ room: 'abc12345', name: 'Ann' });
    sock(0).open();

    const expected = [1000, 2000, 4000, 8000, 10000];
    let drops = 0;
    for (const delay of expected) {
      const socket = sock(MockSocket.instances.length - 1);
      socket.drop(1006);
      drops++;
      vi.advanceTimersByTime(delay - 1);
      expect(MockSocket.instances).toHaveLength(drops);
      vi.advanceTimersByTime(1);
      expect(MockSocket.instances).toHaveLength(drops + 1);
      sock(drops).open();
      expect(sock(drops).sentMessages()).toEqual([{ type: 'join', room: 'abc12345', name: 'Ann' }]);
    }
  });

  it('restarts the backoff only after the joined socket has stayed open for 5s', () => {
    const client = new RaceClient('ws://host/api/races/ws', makeListener());
    client.connect({ room: 'abc12345' });
    sock(0).open();
    sock(0).drop(); // never joined: 1s
    vi.advanceTimersByTime(1000);

    // Accepted and joined, then dropped after 4.999s: the count is not reset, so the next wait is 2s.
    sock(1).open();
    sock(1).receive({ type: 'joined', you: 'p1' });
    vi.advanceTimersByTime(STABLE_CONNECTION_MS - 1);
    sock(1).drop();
    vi.advanceTimersByTime(1999);
    expect(MockSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(MockSocket.instances).toHaveLength(3);

    // Joined and stable for 5s: the count starts over, so the next wait is 1s again.
    sock(2).open();
    sock(2).receive({ type: 'joined', you: 'p1' });
    vi.advanceTimersByTime(STABLE_CONNECTION_MS);
    sock(2).drop();
    vi.advanceTimersByTime(999);
    expect(MockSocket.instances).toHaveLength(3);
    vi.advanceTimersByTime(1);
    expect(MockSocket.instances).toHaveLength(4);
  });

  it('does not reset the count when the server accepts and then drops again and again', () => {
    const listener = makeListener();
    const client = new RaceClient('ws://host/api/races/ws', listener);
    client.connect({ room: 'abc12345' });
    for (let i = 0; i <= MAX_RECONNECT_ATTEMPTS; i++) {
      const socket = sock(MockSocket.instances.length - 1);
      socket.open();
      socket.receive({ type: 'joined', you: 'p1' });
      socket.drop();
      vi.advanceTimersByTime(10_000);
    }
    expect(listener.onError).toHaveBeenLastCalledWith({
      code: 'connection',
      message: "Couldn't connect to the race server",
      fatal: false,
      retryable: true,
    });
    expect(MockSocket.instances).toHaveLength(MAX_RECONNECT_ATTEMPTS + 1);
  });

  it('stops for good after a fatal error such as a full room', () => {
    const listener = makeListener();
    const client = new RaceClient('ws://host/api/races/ws', listener);
    client.connect({ room: 'abc12345', name: 'Ann' });
    const socket = sock(0);
    socket.open();
    socket.receive({ type: 'error', message: 'This race is full' });

    expect(listener.onError).toHaveBeenCalledWith({ code: 'full', message: 'This race is full', fatal: true });
    expect(listener.onConnection).toHaveBeenLastCalledWith('failed');
    socket.drop();
    vi.advanceTimersByTime(60_000);
    expect(MockSocket.instances).toHaveLength(1);
  });

  it('treats "Race not found" and "This race has expired" as fatal too', () => {
    for (const message of ['Race not found', 'This race has expired']) {
      MockSocket.reset();
      const listener = makeListener();
      const client = new RaceClient('ws://host/api/races/ws', listener);
      client.connect({ room: 'abc12345' });
      sock(0).open();
      sock(0).receive({ type: 'error', message });
      expect(firstError(listener).fatal).toBe(true);
      client.close();
    }
  });

  it('treats an error before the join as fatal, and a later error as a notice', () => {
    const listener = makeListener();
    const client = new RaceClient('ws://host/api/races/ws', listener);
    client.connect({ room: 'abc12345', name: 'x' });
    const socket = sock(0);
    socket.open();
    socket.receive({ type: 'error', message: 'Pick a nickname of 2 to 20 letters' });
    expect(firstError(listener).fatal).toBe(true);

    MockSocket.reset();
    const listener2 = makeListener();
    const client2 = new RaceClient('ws://host/api/races/ws', listener2);
    client2.connect({ room: 'abc12345' });
    const socket2 = sock(0);
    socket2.open();
    socket2.receive({ type: 'joined', you: 'p1' });
    socket2.receive({ type: 'error', message: 'Finish rejected: not every character is typed' });
    expect(firstError(listener2).fatal).toBe(false);
    expect(client2.progress(3, 40)).toBe(true);
  });

  it('stops after 8 automatic reconnects with a retryable connection error, and retry() connects again', () => {
    const listener = makeListener();
    const client = new RaceClient('ws://host/api/races/ws', listener);
    client.connect({ room: 'abc12345', name: 'Ann' });
    for (let i = 0; i <= MAX_RECONNECT_ATTEMPTS; i++) {
      sock(MockSocket.instances.length - 1).drop(1006);
      vi.advanceTimersByTime(10_000);
    }
    expect(listener.onError).toHaveBeenLastCalledWith({
      code: 'connection',
      message: "Couldn't connect to the race server",
      fatal: false,
      retryable: true,
    });
    expect(listener.onConnection).toHaveBeenLastCalledWith('failed');
    expect(MockSocket.instances).toHaveLength(MAX_RECONNECT_ATTEMPTS + 1);

    client.retry();
    expect(MockSocket.instances).toHaveLength(MAX_RECONNECT_ATTEMPTS + 2);
    sock(MockSocket.instances.length - 1).open();
    expect(sock(MockSocket.instances.length - 1).sentMessages()).toEqual([
      { type: 'join', room: 'abc12345', name: 'Ann' },
    ]);
  });

  it('does not retry a 1008 close (the origin was refused)', () => {
    const listener = makeListener();
    const client = new RaceClient('ws://host/api/races/ws', listener);
    client.connect({ room: 'abc12345' });
    sock(0).drop(1008);
    vi.advanceTimersByTime(60_000);
    expect(MockSocket.instances).toHaveLength(1);
    expect(firstError(listener)).toMatchObject({ code: 'connection', fatal: true });
  });

  it('treats a 1013 close (too many connections) as fatal, with no retry', () => {
    const listener = makeListener();
    const client = new RaceClient('ws://host/api/races/ws', listener);
    client.connect({ room: 'abc12345', name: 'Ann' });
    sock(0).drop(1013);
    expect(listener.onError).toHaveBeenCalledWith({ code: 'tooMany', message: TOO_MANY_MESSAGE, fatal: true });
    expect(listener.onConnection).toHaveBeenLastCalledWith('failed');
    vi.advanceTimersByTime(60_000);
    expect(MockSocket.instances).toHaveLength(1);
    client.retry();
    expect(MockSocket.instances).toHaveLength(1);
  });

  it('pauses on a late join with no automatic retry, and retry() sends join again', () => {
    const listener = makeListener();
    const client = new RaceClient('ws://host/api/races/ws', listener);
    client.connect({ room: 'abc12345', name: 'Ann' });
    sock(0).open();
    sock(0).receive({ type: 'error', message: STARTED_MESSAGE });

    expect(listener.onError).toHaveBeenCalledWith({
      code: 'started',
      message: STARTED_MESSAGE,
      fatal: false,
      retryable: true,
    });
    expect(listener.onConnection).toHaveBeenLastCalledWith('failed');
    vi.advanceTimersByTime(60_000);
    expect(MockSocket.instances).toHaveLength(1);

    client.retry();
    expect(MockSocket.instances).toHaveLength(2);
    sock(1).open();
    expect(sock(1).sentMessages()).toEqual([{ type: 'join', room: 'abc12345', name: 'Ann' }]);
    sock(1).receive({ type: 'joined', you: 'p1', token: TOKEN });
    expect(listener.onJoined).toHaveBeenLastCalledWith('p1');
    expect(client.start()).toBe(true);
  });

  it('sends a finish that happened while the socket was down once the join succeeds again', () => {
    const client = new RaceClient('ws://host/api/races/ws', makeListener());
    client.connect({ room: 'abc12345', name: 'Ann' });
    sock(0).open();
    sock(0).receive({ type: 'joined', you: 'p1' });
    sock(0).drop();

    client.finish({ chars: 12, wpm: 60, accuracy: 97, durationMs: 9000 });
    expect(MockSocket.instances).toHaveLength(1);

    vi.advanceTimersByTime(1000);
    const socket = sock(1);
    socket.open();
    socket.receive({ type: 'joined', you: 'p1' });
    expect(socket.sentMessages().slice(1)).toEqual([
      { type: 'progress', chars: 12, wpm: 60 },
      { type: 'finish', wpm: 60, accuracy: 97, durationMs: 9000 },
    ]);
  });

  it('sends the final progress before the finish', () => {
    const client = new RaceClient('ws://host/api/races/ws', makeListener());
    client.connect({ room: 'abc12345', name: 'Ann' });
    const socket = sock(0);
    socket.open();
    socket.receive({ type: 'joined', you: 'p1' });
    client.finish({ chars: 10, wpm: 50, accuracy: 98, durationMs: 12000 });
    expect(socket.sentMessages().slice(1)).toEqual([
      { type: 'progress', chars: 10, wpm: 50 },
      { type: 'finish', wpm: 50, accuracy: 98, durationMs: 12000 },
    ]);
  });

  it('does not send start or progress before the join', () => {
    const client = new RaceClient('ws://host/api/races/ws', makeListener());
    client.connect({ room: 'abc12345', name: 'Ann' });
    const socket = sock(0);
    socket.open();
    expect(client.start()).toBe(false);
    expect(client.progress(1, 10)).toBe(false);
    socket.receive({ type: 'joined', you: 'p1' });
    expect(client.start()).toBe(true);
    expect(socket.sentMessages().at(-1)).toEqual({ type: 'start' });
  });

  it('leaves the room and closes without reconnecting on close()', () => {
    const client = new RaceClient('ws://host/api/races/ws', makeListener());
    client.connect({ room: 'abc12345', name: 'Ann' });
    const socket = sock(0);
    socket.open();
    socket.receive({ type: 'joined', you: 'p1' });
    client.close();
    expect(socket.sentMessages().at(-1)).toEqual({ type: 'leave' });
    expect(socket.readyState).toBe(MockSocket.CLOSED);
    vi.advanceTimersByTime(60_000);
    expect(MockSocket.instances).toHaveLength(1);
  });
});

describe('join token', () => {
  it('stores the token from joined and sends it on every rejoin', () => {
    const client = new RaceClient('ws://host/api/races/ws', makeListener());
    client.connect({ room: 'abc12345', name: 'Ann' });
    sock(0).open();
    expect(sock(0).sentMessages()).toEqual([{ type: 'join', room: 'abc12345', name: 'Ann' }]);

    sock(0).receive({ type: 'joined', you: 'p1', token: TOKEN });
    expect(sessionStorage.getItem(TOKEN_KEY)).toBe(TOKEN);

    sock(0).drop();
    vi.advanceTimersByTime(1000);
    sock(1).open();
    expect(sock(1).sentMessages()).toEqual([{ type: 'join', room: 'abc12345', name: 'Ann', token: TOKEN }]);
  });

  it('sends the saved token when a new client joins the same room, but not for another room', () => {
    sessionStorage.setItem(TOKEN_KEY, TOKEN);
    const client = new RaceClient('ws://host/api/races/ws', makeListener());
    client.connect({ room: 'abc12345' });
    sock(0).open();
    expect(sock(0).sentMessages()).toEqual([{ type: 'join', room: 'abc12345', token: TOKEN }]);
    client.close();

    const other = new RaceClient('ws://host/api/races/ws', makeListener());
    other.connect({ room: 'zzzzzzzz' });
    sock(1).open();
    expect(sock(1).sentMessages()).toEqual([{ type: 'join', room: 'zzzzzzzz' }]);
  });

  it('ignores a saved value that is not a token', () => {
    sessionStorage.setItem(TOKEN_KEY, 'not-a-token');
    expect(readRaceToken('abc12345')).toBeNull();
    const client = new RaceClient('ws://host/api/races/ws', makeListener());
    client.connect({ room: 'abc12345' });
    sock(0).open();
    expect(sock(0).sentMessages()).toEqual([{ type: 'join', room: 'abc12345' }]);
  });

  it('keeps the token for reconnects when session storage is blocked', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    try {
      const client = new RaceClient('ws://host/api/races/ws', makeListener());
      client.connect({ room: 'abc12345', name: 'Ann' });
      sock(0).open();
      sock(0).receive({ type: 'joined', you: 'p1', token: TOKEN });
      sock(0).drop();
      vi.advanceTimersByTime(1000);
      sock(1).open();
      expect(sock(1).sentMessages()).toEqual([{ type: 'join', room: 'abc12345', name: 'Ann', token: TOKEN }]);
    } finally {
      setItem.mockRestore();
      getItem.mockRestore();
    }
  });
});

describe('raceSocketUrl', () => {
  it('uses the page origin for a relative API base', () => {
    expect(raceSocketUrl('/api', { protocol: 'http:', host: 'localhost:5185' })).toBe(
      'ws://localhost:5185/api/races/ws',
    );
    expect(raceSocketUrl('/api', { protocol: 'https:', host: 'parrotype.app' })).toBe(
      'wss://parrotype.app/api/races/ws',
    );
  });

  it('derives the websocket from an absolute API URL', () => {
    expect(raceSocketUrl('https://api.example.com/api/', { protocol: 'http:', host: 'x' })).toBe(
      'wss://api.example.com/api/races/ws',
    );
    expect(raceSocketUrl('http://localhost:3000/api', { protocol: 'https:', host: 'x' })).toBe(
      'ws://localhost:3000/api/races/ws',
    );
  });
});

describe('ProgressThrottle', () => {
  it('sends at most once per 200ms and keeps the latest value for the trailing send', () => {
    const sent: Array<[number, number]> = [];
    const at: number[] = [];
    const throttle = new ProgressThrottle((c, w) => {
      sent.push([c, w]);
      at.push(Date.now());
    });

    throttle.push(1, 10);
    throttle.push(2, 11);
    throttle.push(3, 12);
    expect(sent).toEqual([[1, 10]]);

    vi.advanceTimersByTime(199);
    expect(sent).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sent).toEqual([
      [1, 10],
      [3, 12],
    ]);

    throttle.push(4, 13);
    vi.advanceTimersByTime(199);
    expect(sent).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sent).toHaveLength(3);

    for (let i = 1; i < at.length; i++) expect((at[i] ?? 0) - (at[i - 1] ?? 0)).toBeGreaterThanOrEqual(200);
  });

  it('flush sends the pending value at once, and cancel drops it', () => {
    const send = vi.fn();
    const throttle = new ProgressThrottle(send);
    throttle.push(1, 1);
    throttle.push(2, 2);
    throttle.flush();
    expect(send).toHaveBeenLastCalledWith(2, 2);
    expect(send).toHaveBeenCalledTimes(2);

    throttle.push(9, 9);
    throttle.cancel();
    vi.advanceTimersByTime(1000);
    throttle.flush();
    expect(send).toHaveBeenCalledTimes(2);
  });
});
