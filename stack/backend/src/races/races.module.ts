import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RACE_OPTIONS, RACE_SOCKET_LIMITS, raceCountdownMs, raceSocketLimits } from './races.config';
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
    {
      provide: RACE_SOCKET_LIMITS,
      useFactory: () => raceSocketLimits(),
    },
  ],
})
export class RacesModule {}
