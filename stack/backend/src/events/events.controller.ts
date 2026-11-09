import { Controller, Get, Param } from '@nestjs/common';
import type { LeaderboardEntry } from '../leaderboard/leaderboard.service';
import { type EventDetail, type EventListing, EventsService } from './events.service';

/** Public. */
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  list(): Promise<EventListing> {
    return this.events.list();
  }

  @Get(':slug')
  detail(@Param('slug') slug: string): Promise<EventDetail> {
    return this.events.detail(slug);
  }

  @Get(':slug/leaderboard')
  leaderboard(@Param('slug') slug: string): Promise<LeaderboardEntry[]> {
    return this.events.leaderboard(slug);
  }
}
