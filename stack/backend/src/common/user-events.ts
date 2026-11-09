import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';

/**
 * In-process account events. The admin service emits after a suspension commits; the races gateway
 * listens and closes that user's sockets. Nothing here is persisted, and it only reaches this process.
 *
 * Events:
 * - 'banned' (userId: number): the user was suspended by an admin.
 */
@Injectable()
export class UserEvents extends EventEmitter {
  banned(userId: number): void {
    this.emit('banned', userId);
  }
}
