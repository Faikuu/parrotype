import type { Language } from '@/lib/engine/types';

/** Wire types for the races protocol (docs/SPEC-2.2.md). Parsed by hand: no runtime schema library. */

export const ROOM_STATUSES = ['lobby', 'countdown', 'racing', 'finished'] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

export interface RacePlayer {
  id: string;
  name: string;
  isGuest: boolean;
  /** 0..1 of the quote typed, as the server knows it. */
  progress: number;
  wpm: number;
  finished: boolean;
  place: number | null;
  accuracy: number | null;
  connected: boolean;
}

export interface RaceRoom {
  id: string;
  language: Language;
  status: RoomStatus;
  hostId: string;
  /** Null in the lobby (no peeking) and until the countdown starts. */
  text: string | null;
  source: string | null;
  /** Epoch ms when typing may begin. */
  startsAt: number | null;
  players: RacePlayer[];
}

/** A seat token: 32 lowercase hex chars. The server gives one on join; sending it back reclaims the seat. */
export const RACE_TOKEN_PATTERN = /^[0-9a-f]{32}$/;

export type ServerMessage =
  | { type: 'joined'; you: string; token: string | null }
  | { type: 'room'; room: RaceRoom }
  | { type: 'error'; message: string };

/** The server rejects a finish or progress above this wpm (MAX_WPM on the backend). */
export const MAX_REPORTED_WPM = 350;

export type RaceErrorCode =
  | 'full'
  | 'notFound'
  | 'expired'
  | 'closed'
  | 'started'
  | 'connection'
  | 'tooMany'
  | 'rejected';

/** The server's text for a late join (the race is in countdown or racing). */
export const RACE_STARTED_MESSAGE = 'This race has already started';

export interface RaceErrorInfo {
  code: RaceErrorCode;
  /** The server's message, or the client's own for connection failures. */
  message: string;
  /** Fatal errors end the session: the page shows the error instead of the race. */
  fatal: boolean;
  /** Non-fatal errors that stop automatic reconnects: the user can try again. */
  retryable?: boolean;
}

const LANGUAGES: readonly Language[] = ['en', 'pl', 'de', 'es'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function isNullableNumber(v: unknown): v is number | null {
  return v === null || isNumber(v);
}
function isNullableString(v: unknown): v is string | null {
  return v === null || typeof v === 'string';
}

function isPlayer(v: unknown): v is RacePlayer {
  return (
    isRecord(v) &&
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.isGuest === 'boolean' &&
    isNumber(v.progress) &&
    isNumber(v.wpm) &&
    typeof v.finished === 'boolean' &&
    isNullableNumber(v.place) &&
    isNullableNumber(v.accuracy) &&
    typeof v.connected === 'boolean'
  );
}

export function isRaceRoom(v: unknown): v is RaceRoom {
  return (
    isRecord(v) &&
    typeof v.id === 'string' &&
    (LANGUAGES as readonly unknown[]).includes(v.language) &&
    (ROOM_STATUSES as readonly unknown[]).includes(v.status) &&
    typeof v.hostId === 'string' &&
    isNullableString(v.text) &&
    isNullableString(v.source) &&
    isNullableNumber(v.startsAt) &&
    Array.isArray(v.players) &&
    v.players.every(isPlayer)
  );
}

/** Returns the message, or null for anything that is not a known server message. */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (!isRecord(raw)) return null;
  switch (raw.type) {
    case 'joined':
      return typeof raw.you === 'string'
        ? {
            type: 'joined',
            you: raw.you,
            token: typeof raw.token === 'string' && RACE_TOKEN_PATTERN.test(raw.token) ? raw.token : null,
          }
        : null;
    case 'room':
      return isRaceRoom(raw.room) ? { type: 'room', room: raw.room } : null;
    case 'error':
      return typeof raw.message === 'string' ? { type: 'error', message: raw.message } : null;
    default:
      return null;
  }
}

const KNOWN_ERRORS: Record<string, RaceErrorCode> = {
  'This race is full': 'full',
  'Race not found': 'notFound',
  'This race has expired': 'expired',
  'This race was closed by a moderator': 'closed',
};

/**
 * Classifies an error reply. A known message always ends the session. Any other error ends it too
 * when it came before the join succeeded (a rejected nickname, for example); later errors are
 * shown and the race goes on.
 */
export function classifyServerError(message: string, joined: boolean): RaceErrorInfo {
  if (message === RACE_STARTED_MESSAGE) return { code: 'started', message, fatal: false, retryable: true };
  const known = Object.prototype.hasOwnProperty.call(KNOWN_ERRORS, message) ? KNOWN_ERRORS[message] : undefined;
  if (known) return { code: known, message, fatal: true };
  return { code: 'rejected', message, fatal: !joined };
}
