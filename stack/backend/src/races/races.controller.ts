import { Body, Controller, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { getEnv } from '../config/env';
import type { Language } from '../common/domain';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { createRoomSchema } from './races.protocol';
import { clientIp } from './socket-limits';
import { RoomService } from './room.service';

const CREATE_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@Controller('races')
export class RacesController {
  constructor(private readonly rooms: RoomService) {}

  /**
   * Creates a lobby. Auth is optional. Returns the room id; the client then opens the socket and joins.
   * A client IP may hold at most 20 open rooms (429 beyond that).
   */
  @Post()
  @Throttle(CREATE_THROTTLE)
  async create(
    @Body(new ZodValidationPipe(createRoomSchema)) body: { language: Language },
    @Req() req: Request,
  ): Promise<{ id: string }> {
    const ip = clientIp(req.headers, req.socket.remoteAddress, getEnv().trustProxy);
    return { id: await this.rooms.create(body.language, ip) };
  }
}
