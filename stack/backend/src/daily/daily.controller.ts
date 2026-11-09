import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { utcDate } from '../common/dates';
import { languageSchema, type Language } from '../common/domain';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { LeaderboardService, type LeaderboardEntry } from '../leaderboard/leaderboard.service';

const dailyQuerySchema = z.object({
  language: languageSchema.default('en'),
});

export interface DailyBoard {
  date: string;
  language: Language;
  entries: LeaderboardEntry[];
}

@Controller('daily')
export class DailyController {
  constructor(private readonly leaderboard: LeaderboardService) {}

  /** Today's UTC daily board: the same text for everyone, ranked on its own leaderboard. */
  @Get()
  async board(
    @Query(new ZodValidationPipe(dailyQuerySchema)) query: z.infer<typeof dailyQuerySchema>,
  ): Promise<DailyBoard> {
    const date = utcDate(0);
    const entries = await this.leaderboard.top({
      mode: 'daily',
      mode2: date,
      language: query.language,
      // Verified results only: an unverified retry must not take a place on the board.
      verified: true,
    });
    return { date, language: query.language, entries };
  }
}
