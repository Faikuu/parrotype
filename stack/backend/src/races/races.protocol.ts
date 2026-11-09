import { z } from 'zod';
import { languageSchema, type Language } from '../common/domain';

/** Limits from SPEC-2.2. Kept here so the service, the gateway and the tests agree. */
export const MAX_PLAYERS = 8;
export const MAX_ROOMS = 500;
export const ROOM_IDLE_TTL_MS = 30 * 60_000;
export const SWEEP_INTERVAL_MS = 60_000;
/** The race ends this long after the start, whatever the progress. */
export const RACE_LIMIT_MS = 3 * 60_000;
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
export const GUEST_NAME_REGEX = /^[a-zA-Z0-9_ ]{2,20}$/;
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
});
const startMessage = z.object({ type: z.literal('start') });
const progressMessage = z.object({
  type: z.literal('progress'),
  chars: z.number().int().min(0).max(100_000),
  wpm: z.number().min(0).max(100_000),
});
const finishMessage = z.object({
  type: z.literal('finish'),
  wpm: z.number().min(0).max(100_000),
  accuracy: z.number().min(0).max(100),
  durationMs: z.number().int().min(0).max(RACE_LIMIT_MS),
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
  | { type: 'joined'; you: string }
  | { type: 'room'; room: RoomView }
  | { type: 'error'; message: string };

/** Thrown by RoomService for rule violations. The message goes to the client as-is. */
export class RaceError extends Error {}

export const createRoomSchema = z.object({ language: languageSchema });
