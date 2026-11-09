import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard, type AuthUser } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { badgeQuerySchema, type BadgeQuery } from '../results/results.schemas';
import { ReportsService } from '../moderation/reports.service';
import { reportInputSchema, type ReportInput } from '../moderation/report.schemas';
import { BADGE_HEADERS, BADGE_LABEL, NO_RESULT_VALUE, badgeValue, renderBadge } from './badge';
import { FollowsService, type FollowState } from './follows.service';
import { UsersService, type PublicProfile } from './users.service';

const REPORT_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly follows: FollowsService,
    private readonly reports: ReportsService,
  ) {}

  /** Signed-in viewers also get isFollowing. Anonymous viewers get false. */
  @Get(':name')
  @UseGuards(OptionalJwtAuthGuard)
  profile(@Param('name') name: string, @Req() req: Request): Promise<PublicProfile> {
    return this.users.profile(name, req.user?.id);
  }

  @Put(':name/follow')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  follow(@CurrentUser() me: AuthUser, @Param('name') name: string): Promise<FollowState> {
    return this.follows.follow(me.id, name);
  }

  @Delete(':name/follow')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  unfollow(@CurrentUser() me: AuthUser, @Param('name') name: string): Promise<FollowState> {
    return this.follows.unfollow(me.id, name);
  }

  @Post(':name/report')
  @UseGuards(JwtAuthGuard)
  @Throttle(REPORT_THROTTLE)
  async report(
    @CurrentUser() me: AuthUser,
    @Param('name') name: string,
    @Body(new ZodValidationPipe(reportInputSchema)) body: ReportInput,
  ): Promise<{ ok: true }> {
    await this.reports.create(me.id, name, body);
    return { ok: true };
  }

  /**
   * An SVG badge of the user's best wpm. Unknown, suspended, or no matching result gives a 404
   * with a neutral "no result" badge, so an embed still shows something.
   */
  @Get(':name/badge.svg')
  badge(
    @Param('name') name: string,
    @Query(new ZodValidationPipe(badgeQuerySchema)) query: BadgeQuery,
    @Res() res: Response,
  ): Promise<void> {
    return this.sendBadge(name, query, res);
  }

  private async sendBadge(name: string, query: BadgeQuery, res: Response): Promise<void> {
    const wpm = await this.users.badgeWpm(name, query);
    const value = wpm === null ? NO_RESULT_VALUE : badgeValue(wpm, query);
    res.status(wpm === null ? 404 : 200);
    res.set(BADGE_HEADERS);
    res.send(renderBadge({ label: BADGE_LABEL, value }));
  }
}
