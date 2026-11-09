import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Language } from '../common/domain';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { createRoomSchema } from './races.protocol';
import { RoomService } from './room.service';

const CREATE_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@Controller('races')
export class RacesController {
  constructor(private readonly rooms: RoomService) {}

  /** Creates a lobby. Auth is optional. Returns the room id; the client then opens the socket and joins. */
  @Post()
  @Throttle(CREATE_THROTTLE)
  async create(
    @Body(new ZodValidationPipe(createRoomSchema)) body: { language: Language },
  ): Promise<{ id: string }> {
    return { id: await this.rooms.create(body.language) };
  }
}
