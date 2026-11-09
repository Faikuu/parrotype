import { EventEmitter } from 'node:events';
import { Injectable } from '@nestjs/common';

/** Payload of the 'saved' event: sent after a result is written, verified or not. */
export interface ResultSavedEvent {
  resultId: number;
  userId: number;
  mode: string;
  mode2: string;
  language: string;
  wpm: number;
  verified: boolean;
  /** Verified, in a ranked mode, and faster than the user's previous best verified result for the same mode, mode2 and language. */
  isNewBest: boolean;
}

/**
 * Result events for other modules (the social agent's pb_beaten notifications). Inject it and call
 * `on('saved', listener)`. Listeners run synchronously inside the save request, so they must not block.
 * A listener that throws is logged and does not fail the save.
 */
@Injectable()
export class ResultEvents extends EventEmitter {
  override emit(event: 'saved', payload: ResultSavedEvent): boolean {
    return super.emit(event, payload);
  }

  override on(event: 'saved', listener: (payload: ResultSavedEvent) => void): this {
    return super.on(event, listener);
  }
}
