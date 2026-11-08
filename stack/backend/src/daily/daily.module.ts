import { Module } from '@nestjs/common';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { DailyController } from './daily.controller';

@Module({
  imports: [LeaderboardModule],
  controllers: [DailyController],
})
export class DailyModule {}
