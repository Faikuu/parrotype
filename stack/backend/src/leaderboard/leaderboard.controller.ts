import { Controller, Get, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { leaderboardQuerySchema, type LeaderboardQuery } from '../results/results.schemas';
import { LeaderboardService } from './leaderboard.service';

@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboard: LeaderboardService) {}

  /** `scope=following` needs a session; anonymous requests get 401. */
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  top(@Query(new ZodValidationPipe(leaderboardQuerySchema)) query: LeaderboardQuery, @Req() req: Request) {
    if (query.scope === 'following' && !req.user) throw new UnauthorizedException('Sign in to see your friends');
    return this.leaderboard.top(query, req.user?.id);
  }
}
