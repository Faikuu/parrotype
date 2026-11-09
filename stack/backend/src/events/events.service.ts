import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { LeaderboardService, type LeaderboardEntry } from '../leaderboard/leaderboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { eventState, hasStarted, type EventState } from './event-rules';

/** Most past events the listing returns (the latest ones). */
export const PAST_EVENTS_SIZE = 20;

export interface EventSummary {
  slug: string;
  title: string;
  description: string;
  language: string;
  startsAt: string;
  endsAt: string;
  state: EventState;
}

/** `text` is null until the event starts. */
export interface EventDetail extends EventSummary {
  text: string | null;
}

export interface EventListing {
  upcoming: EventSummary[];
  active: EventSummary[];
  past: EventSummary[];
}

const SUMMARY_SELECT = {
  slug: true,
  title: true,
  description: true,
  language: true,
  startsAt: true,
  endsAt: true,
} satisfies Prisma.EventSelect;

const DETAIL_SELECT = { id: true, ...SUMMARY_SELECT, text: true } satisfies Prisma.EventSelect;

type SummaryRow = Prisma.EventGetPayload<{ select: typeof SUMMARY_SELECT }>;

function toSummary(row: SummaryRow, now: Date): EventSummary {
  return {
    slug: row.slug,
    title: row.title,
    description: row.description,
    language: row.language,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    state: eventState(row.startsAt, row.endsAt, now),
  };
}

const NOT_FOUND = 'No event with that slug';

/** Public event pages. Nothing here exposes the text before the event starts. */
@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly boards: LeaderboardService,
  ) {}

  /** upcoming (soonest first), active (ending soonest first) and the last 20 past events (latest first). */
  async list(now: Date = new Date()): Promise<EventListing> {
    const [upcoming, active, past] = await Promise.all([
      this.prisma.event.findMany({
        where: { startsAt: { gt: now } },
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        select: SUMMARY_SELECT,
      }),
      this.prisma.event.findMany({
        where: { startsAt: { lte: now }, endsAt: { gt: now } },
        orderBy: [{ endsAt: 'asc' }, { id: 'asc' }],
        select: SUMMARY_SELECT,
      }),
      this.prisma.event.findMany({
        where: { endsAt: { lte: now } },
        orderBy: [{ endsAt: 'desc' }, { id: 'desc' }],
        take: PAST_EVENTS_SIZE,
        select: SUMMARY_SELECT,
      }),
    ]);
    return {
      upcoming: upcoming.map((row) => toSummary(row, now)),
      active: active.map((row) => toSummary(row, now)),
      past: past.map((row) => toSummary(row, now)),
    };
  }

  async detail(slug: string, now: Date = new Date()): Promise<EventDetail> {
    const row = await this.prisma.event.findUnique({ where: { slug }, select: DETAIL_SELECT });
    if (!row) throw new NotFoundException(NOT_FOUND);
    return { ...toSummary(row, now), text: hasStarted(row.startsAt, now) ? row.text : null };
  }

  /** The event's board (verified results only, one best per user). Works before the start too. */
  async leaderboard(slug: string): Promise<LeaderboardEntry[]> {
    const event = await this.prisma.event.findUnique({ where: { slug }, select: { id: true } });
    if (!event) throw new NotFoundException(NOT_FOUND);
    return this.boards.eventLeaderboard(event.id);
  }
}
