import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RACE_OPTIONS, raceCountdownMs } from './races.config';
import { RacesController } from './races.controller';
import { RacesGateway } from './races.gateway';
import { RoomService } from './room.service';

@Module({
  imports: [AuthModule],
  controllers: [RacesController],
  providers: [
    RoomService,
    RacesGateway,
    {
      provide: RACE_OPTIONS,
      useFactory: () => ({ clock: () => Date.now(), countdownMs: raceCountdownMs() }),
    },
  ],
})
export class RacesModule {}
