import {
  RACE_TOKEN_PATTERN,
  classifyServerError,
  parseServerMessage,
  type RaceErrorInfo,
  type RaceRoom,
} from './protocol';

const API_BASE: string = import.meta.env.VITE_API_URL ?? '/api';
const WS_OPEN = 1;
const WS_POLICY_VIOLATION = 1008;
/** The server caps connections per IP and closes the extra ones with this code. */
const WS_TOO_MANY_CONNECTIONS = 1013;
const COULDNT_CONNECT = "Couldn't connect to the race server";
const TOO_MANY_CONNECTIONS =
  'Too many open connections from your network. Close other race tabs and try again.';
const TOKEN_KEY_PREFIX = 'parrotype:race-token:';

/** Waits before each reconnect attempt: 1s, 2s, 4s, then 8s and 10s (capped). */
export const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 10000];
/** Automatic reconnects allowed in one drop sequence, before the client waits for the user. */
export const MAX_RECONNECT_ATTEMPTS = 8;
/** A joined socket must stay open this long before the reconnect count starts over. */
export const STABLE_CONNECTION_MS = 5000;
/** Progress is sent at most this often (plus a final value before finish). */
export const PROGRESS_INTERVAL_MS = 200;

export type ConnectionState = 'idle' | 'connecting' | 'joined' | 'reconnecting' | 'failed' | 'closed';

export interface JoinRequest {
  room: string;
  /** Guest nickname. Omit for a signed-in user: the server takes the name from the session cookie. */
  name?: string;
}

function tokenKey(room: string): string {
  return `${TOKEN_KEY_PREFIX}${room}`;
}

/** The seat token saved for this room in this tab, or null. Storage can be blocked, so this never throws. */
export function readRaceToken(room: string): string | null {
  try {
    const value = sessionStorage.getItem(tokenKey(room));
    return value !== null && RACE_TOKEN_PATTERN.test(value) ? value : null;
  } catch {
    return null;
  }
}

function writeRaceToken(room: string, token: string): void {
  try {
    sessionStorage.setItem(tokenKey(room), token);
  } catch {
    // The in-memory copy still covers reconnects in this session.
  }
}

export interface FinishPayload {
  /** Correct chars typed. Sent as a progress message first, so the server sees text.length. */
  chars: number;
  wpm: number;
  accuracy: number;
  durationMs: number;
}

export interface RaceClientListener {
  onConnection?: (state: ConnectionState) => void;
  onJoined?: (you: string) => void;
  onRoom?: (room: RaceRoom) => void;
  onError?: (error: RaceErrorInfo) => void;
}

/** The websocket URL: the same origin as the page, or the API's origin when VITE_API_URL is absolute. */
export function raceSocketUrl(base: string = API_BASE, loc: Pick<Location, 'protocol' | 'host'> = window.location): string {
  if (/^https?:\/\//i.test(base)) {
    const url = new URL(base);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/races/ws`;
    url.search = '';
    url.hash = '';
    return url.toString();
  }
  const scheme = loc.protocol === 'https:' ? 'wss' : 'ws';
  const path = base.startsWith('/') ? base : `/${base}`;
  return `${scheme}://${loc.host}${path.replace(/\/+$/, '')}/races/ws`;
}

/**
 * One race session over a websocket. Joins on every (re)connect, reconnects with backoff after a
 * drop, and stops for good after a fatal error or close(). Callbacks are the only output.
 */
export class RaceClient {
  private socket: WebSocket | null = null;
  private join: JoinRequest | null = null;
  private joined = false;
  private attempts = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stableTimer: ReturnType<typeof setTimeout> | null = null;
  /** Set when the client stopped reconnecting and waits for retry() (late join, or reconnects used up). */
  private paused = false;
  private stopped = false;
  /** The seat token from the last joined message for this room. */
  private token: string | null = null;
  private connection: ConnectionState = 'idle';
  /** A finish that happened while the socket was down. Sent once the join succeeds again. */
  private pendingFinish: FinishPayload | null = null;

  constructor(
    private readonly url: string,
    private readonly listener: RaceClientListener,
  ) {}

  /** Opens the socket and joins the room. Calling it again while open does nothing. */
  connect(join: JoinRequest): void {
    if (this.stopped || this.socket) return;
    this.join = join;
    this.open();
  }

  start(): boolean {
    return this.send({ type: 'start' });
  }

  progress(chars: number, wpm: number): boolean {
    return this.send({ type: 'progress', chars, wpm });
  }

  finish(payload: FinishPayload): void {
    if (this.stopped) return;
    if (this.joined) {
      this.sendFinish(payload);
    } else {
      this.pendingFinish = payload;
    }
  }

  /** Tries again after the client stopped reconnecting (see RaceErrorInfo.retryable). Sends join anew. */
  retry(): void {
    if (this.stopped || !this.paused) return;
    this.paused = false;
    this.attempts = 0;
    this.clearRetry();
    this.open();
  }

  /** Leaves the room but keeps the socket open. */
  leave(): void {
    if (this.joined) this.send({ type: 'leave' });
    this.clearStable();
    this.join = null;
    this.joined = false;
  }

  /** Leaves the room, closes the socket and stops. No reconnects after this. */
  close(): void {
    if (this.stopped) return;
    if (this.joined) this.send({ type: 'leave' });
    this.stopped = true;
    this.clearRetry();
    this.clearStable();
    const socket = this.socket;
    this.socket = null;
    this.joined = false;
    socket?.close(1000, 'leaving');
    this.setConnection('closed');
  }

  private open(): void {
    this.clearRetry();
    this.joined = false;
    this.setConnection('connecting');
    let socket: WebSocket;
    try {
      socket = new WebSocket(this.url);
    } catch {
      this.handleDrop(1006);
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket || !this.join) return;
      const { room, name } = this.join;
      const token = this.token ?? readRaceToken(room);
      this.sendRaw({
        type: 'join',
        room,
        ...(name !== undefined ? { name } : {}),
        ...(token !== null ? { token } : {}),
      });
    };
    socket.onmessage = (event: MessageEvent) => {
      if (this.socket !== socket) return;
      this.onMessage(event.data);
    };
    socket.onclose = (event: CloseEvent) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.handleDrop(event.code);
    };
    socket.onerror = () => {
      // The close event follows and carries the handling.
    };
  }

  private onMessage(data: unknown): void {
    if (typeof data !== 'string') return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    const msg = parseServerMessage(parsed);
    if (!msg) return;
    switch (msg.type) {
      case 'joined':
        this.joined = true;
        if (msg.token !== null && this.join) {
          this.token = msg.token;
          writeRaceToken(this.join.room, msg.token);
        }
        this.scheduleStableReset();
        this.setConnection('joined');
        this.listener.onJoined?.(msg.you);
        if (this.pendingFinish) {
          const payload = this.pendingFinish;
          this.pendingFinish = null;
          this.sendFinish(payload);
        }
        return;
      case 'room':
        this.listener.onRoom?.(msg.room);
        return;
      case 'error': {
        const info = classifyServerError(msg.message, this.joined);
        if (info.retryable) {
          this.pause(info);
          return;
        }
        this.listener.onError?.(info);
        if (info.fatal) this.fail(info);
        return;
      }
    }
  }

  private handleDrop(code: number): void {
    this.clearStable();
    if (this.stopped || this.paused) return;
    // The server closes with 1008 for a disallowed origin: retrying can't help.
    if (code === WS_POLICY_VIOLATION) {
      this.fail({ code: 'connection', message: COULDNT_CONNECT, fatal: true });
      return;
    }
    // Too many connections from this IP: retrying now would only add to them.
    if (code === WS_TOO_MANY_CONNECTIONS) {
      this.fail({ code: 'tooMany', message: TOO_MANY_CONNECTIONS, fatal: true });
      return;
    }
    this.joined = false;
    this.attempts += 1;
    if (this.attempts > MAX_RECONNECT_ATTEMPTS) {
      this.pause({ code: 'connection', message: COULDNT_CONNECT, fatal: false, retryable: true });
      return;
    }
    this.setConnection('reconnecting');
    const delay = RECONNECT_DELAYS_MS[Math.min(this.attempts - 1, RECONNECT_DELAYS_MS.length - 1)];
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.stopped) this.open();
    }, delay);
  }

  private fail(info: RaceErrorInfo): void {
    if (this.stopped) return;
    this.stopped = true;
    this.clearRetry();
    this.clearStable();
    this.joined = false;
    this.pendingFinish = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close(1000, 'done');
    this.setConnection('failed');
    this.listener.onError?.(info);
  }

  /** Stops automatic reconnects and reports the error. The socket is closed; retry() opens a new one. */
  private pause(info: RaceErrorInfo): void {
    if (this.stopped) return;
    this.paused = true;
    this.clearRetry();
    this.clearStable();
    this.joined = false;
    const socket = this.socket;
    this.socket = null;
    socket?.close(1000, 'paused');
    this.setConnection('failed');
    this.listener.onError?.(info);
  }

  /** The reconnect count starts over only once the socket has stayed joined for STABLE_CONNECTION_MS. */
  private scheduleStableReset(): void {
    this.clearStable();
    this.stableTimer = setTimeout(() => {
      this.stableTimer = null;
      this.attempts = 0;
    }, STABLE_CONNECTION_MS);
  }

  private clearStable(): void {
    if (this.stableTimer !== null) clearTimeout(this.stableTimer);
    this.stableTimer = null;
  }

  private sendFinish(payload: FinishPayload): void {
    this.sendRaw({ type: 'progress', chars: payload.chars, wpm: payload.wpm });
    this.sendRaw({ type: 'finish', wpm: payload.wpm, accuracy: payload.accuracy, durationMs: payload.durationMs });
  }

  private send(msg: object): boolean {
    if (!this.joined) return false;
    return this.sendRaw(msg);
  }

  private sendRaw(msg: object): boolean {
    const socket = this.socket;
    if (!socket || socket.readyState !== WS_OPEN) return false;
    socket.send(JSON.stringify(msg));
    return true;
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private setConnection(state: ConnectionState): void {
    if (this.connection === state) return;
    this.connection = state;
    this.listener.onConnection?.(state);
  }
}

/**
 * Sends progress at most once per interval. A value that arrives inside the window is sent when the
 * window ends (the latest one wins), so the last value is never lost. flush() sends it now.
 */
export class ProgressThrottle {
  private lastSentAt = Number.NEGATIVE_INFINITY;
  private pending: { chars: number; wpm: number } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly send: (chars: number, wpm: number) => void,
    private readonly intervalMs = PROGRESS_INTERVAL_MS,
    private readonly now: () => number = () => Date.now(),
  ) {}

  push(chars: number, wpm: number): void {
    this.pending = { chars, wpm };
    const wait = this.lastSentAt + this.intervalMs - this.now();
    if (wait <= 0) {
      this.emit();
    } else if (this.timer === null) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.emit();
      }, wait);
    }
  }

  /** Sends the pending value now, if there is one. */
  flush(): void {
    this.clearTimer();
    this.emit();
  }

  /** Drops the pending value and any scheduled send. */
  cancel(): void {
    this.clearTimer();
    this.pending = null;
  }

  private emit(): void {
    const value = this.pending;
    if (!value) return;
    this.pending = null;
    this.lastSentAt = this.now();
    this.send(value.chars, value.wpm);
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
