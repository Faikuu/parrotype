import { Controller, Get, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { leaderboardQuerySchema, type LeaderboardQuery } from '../results/results.schemas';
import { LeaderboardService } from './leaderboard.service';

@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboard: LeaderboardService) {}

  @Get()
  top(@Query(new ZodValidationPipe(leaderboardQuerySchema)) query: LeaderboardQuery) {
    return this.leaderboard.top(query);
  }
}
