import { Module } from '@nestjs/common';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [LeaderboardModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
