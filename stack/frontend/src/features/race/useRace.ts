import { useCallback, useEffect, useRef, useState } from 'react';
import { ProgressThrottle, RaceClient, raceSocketUrl, type ConnectionState, type FinishPayload } from './raceClient';
import type { RaceErrorInfo, RaceRoom, RoomStatus } from './protocol';

/** The room's status, or the connection state while there is no room yet. */
export type RaceStatusLike = RoomStatus | ConnectionState;

export interface UseRace {
  room: RaceRoom | null;
  /** The player id of this connection, once joined. */
  you: string | null;
  connection: ConnectionState;
  /** Set for fatal errors (the page shows them) and for errors the race survives. */
  error: RaceErrorInfo | null;
  /** The room's status, or the connection state while there is no room yet. */
  status: RaceStatusLike;
  start: () => void;
  /** Tries again after the client stopped reconnecting (a late join, or reconnects used up). */
  retry: () => void;
  sendProgress: (chars: number, wpm: number) => void;
  finish: (result: FinishPayload) => void;
}

interface Snapshot {
  key: string | null;
  room: RaceRoom | null;
  you: string | null;
  connection: ConnectionState;
  error: RaceErrorInfo | null;
}

const EMPTY: Snapshot = { key: null, room: null, you: null, connection: 'idle', error: null };

/**
 * A race session for one room. `name` decides how to join: `null` means don't connect yet (for
 * example while the session check runs), `undefined` means a signed-in user (the server reads the
 * name from the cookie), and a string is a guest nickname. The socket is closed, with a leave, on
 * unmount or when the room or name changes.
 */
export function useRace(roomId: string, name: string | null | undefined): UseRace {
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const clientRef = useRef<RaceClient | null>(null);
  const throttleRef = useRef<ProgressThrottle | null>(null);

  useEffect(() => {
    if (name === null) return;
    const key = `${roomId}\u0000${name ?? ''}`;
    let active = true;

    const update = (fn: (s: Snapshot) => Snapshot) => {
      if (!active) return;
      setSnap((prev) => fn(prev.key === key ? prev : { ...EMPTY, key }));
    };

    const client = new RaceClient(raceSocketUrl(), {
      onConnection: (connection) => update((s) => ({ ...s, connection })),
      onJoined: (you) => update((s) => ({ ...s, you, error: s.error?.fatal ? s.error : null })),
      onRoom: (room) => update((s) => ({ ...s, room, error: s.error?.fatal ? s.error : null })),
      onError: (error) => update((s) => ({ ...s, error })),
    });
    const throttle = new ProgressThrottle((chars, wpm) => client.progress(chars, wpm));
    clientRef.current = client;
    throttleRef.current = throttle;
    client.connect({ room: roomId, name: name ?? undefined });

    return () => {
      active = false;
      throttle.cancel();
      client.close();
      clientRef.current = null;
      throttleRef.current = null;
    };
  }, [roomId, name]);

  const sendProgress = useCallback((chars: number, wpm: number) => {
    throttleRef.current?.push(chars, wpm);
  }, []);

  const start = useCallback(() => {
    clientRef.current?.start();
  }, []);

  const retry = useCallback(() => {
    clientRef.current?.retry();
  }, []);

  const finish = useCallback((result: FinishPayload) => {
    // The payload carries the final chars, so the pending throttled value is superseded.
    throttleRef.current?.cancel();
    clientRef.current?.finish(result);
  }, []);

  const key = name === null ? null : `${roomId}\u0000${name ?? ''}`;
  const current = snap.key === key ? snap : EMPTY;
  return {
    room: current.room,
    you: current.you,
    connection: current.connection,
    error: current.error,
    status: current.room?.status ?? current.connection,
    start,
    retry,
    sendProgress,
    finish,
  };
}
