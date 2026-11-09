import { z } from 'zod';
import { languageSchema, type Language } from '../common/domain';

/** Limits from SPEC-2.2. Kept here so the service, the gateway and the tests agree. */
export const MAX_PLAYERS = 8;
export const MAX_ROOMS = 500;
export const MAX_ROOMS_PER_IP = 20;
/** A room that never got a joined player expires after this. */
export const UNJOINED_ROOM_TTL_MS = 2 * 60_000;
export const ROOM_IDLE_TTL_MS = 30 * 60_000;
export const SWEEP_INTERVAL_MS = 60_000;
/** The race ends this long after the start, whatever the progress. */
export const RACE_LIMIT_MS = 3 * 60_000;
/** A player who disconnects during a countdown or a race is removed if they haven't come back by then. */
export const DISCONNECT_GRACE_MS = 60_000;
export const MAX_WPM = 350;
export const MAX_QUOTE_LENGTH = 300;
/** At most one room broadcast per room every this many ms. */
export const BROADCAST_INTERVAL_MS = 100;
/** Per connection: messages per one-second window, bytes per message, strikes before close. */
export const MAX_MESSAGES_PER_SECOND = 30;
export const MAX_MESSAGE_BYTES = 4096;
export const MAX_STRIKES = 3;
/** ws refuses frames above this (close 1009). The per-message limit above is the real one. */
export const MAX_FRAME_BYTES = 64 * 1024;
/** Sockets: per client IP (RACE_MAX_SOCKETS_PER_IP overrides), and in total. */
export const MAX_SOCKETS_PER_IP = 10;
export const MAX_SOCKETS_TOTAL = 2000;
/** A socket must send a valid join within this long (RACE_JOIN_TIMEOUT_MS overrides). */
export const JOIN_TIMEOUT_MS = 10_000;
/** The server pings every this often (RACE_HEARTBEAT_MS overrides). A socket with no pong by the next ping is terminated. */
export const HEARTBEAT_MS = 25_000;
export const GUEST_NAME_REGEX = /^[a-zA-Z0-9_ ]{2,20}$/;
/** A seat token: 16 random bytes as hex. It is returned only to the connection that took the seat. */
export const TOKEN_REGEX = /^[0-9a-f]{32}$/;
export const RACES_WS_PATH = '/api/races/ws';
/** Room ids: 8 chars from this alphabet (no i, l, o, u, 0, 1). */
export const ROOM_ID_ALPHABET = 'abcdefghjkmnpqrstvwxyz23456789';
export const ROOM_ID_LENGTH = 8;

export type RoomStatus = 'lobby' | 'countdown' | 'racing' | 'finished';

export interface PlayerView {
  id: string;
  name: string;
  isGuest: boolean;
  progress: number;
  wpm: number;
  finished: boolean;
  place: number | null;
  accuracy: number | null;
  connected: boolean;
}

export interface RoomView {
  id: string;
  language: Language;
  status: RoomStatus;
  hostId: string;
  text: string | null;
  source: string | null;
  startsAt: number | null;
  players: PlayerView[];
}

// Client -> server. Validated with zod; anything else gets an error reply.
const joinMessage = z.object({
  type: z.literal('join'),
  room: z.string().min(1).max(ROOM_ID_LENGTH),
  name: z.string().max(64).optional(),
  token: z.string().regex(TOKEN_REGEX).optional(),
});
const startMessage = z.object({ type: z.literal('start') });
const progressMessage = z.object({
  type: z.literal('progress'),
  chars: z.number().int().min(0).max(100_000),
  wpm: z.number().min(0).max(100_000),
});
// wpm and durationMs are accepted so older clients still validate, but the server ignores them:
// it computes both from its own clock. accuracy is clamped to 0-100 by the server.
const finishMessage = z.object({
  type: z.literal('finish'),
  wpm: z.number().min(0).max(100_000),
  accuracy: z.number(),
  durationMs: z.number().min(0).max(100_000_000),
});
const leaveMessage = z.object({ type: z.literal('leave') });

export const clientMessageSchema = z.discriminatedUnion('type', [
  joinMessage,
  startMessage,
  progressMessage,
  finishMessage,
  leaveMessage,
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type ServerMessage =
  | { type: 'joined'; you: string; token: string }
  | { type: 'room'; room: RoomView }
  | { type: 'error'; message: string };

/** Thrown by RoomService for rule violations. The message goes to the client as-is. */
export class RaceError extends Error {}

export const createRoomSchema = z.object({ language: languageSchema });
