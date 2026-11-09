import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../auth/jwt-auth.guard';
import { pageArgs, toPage, type Page } from '../common/pagination';
import { prismaCode } from '../common/prisma-errors';
import { eventEditProblem, eventState, eventWindowProblem, hasStarted, type EventState } from '../events/event-rules';
import type { EventCreateInput, EventsAdminQuery, EventUpdateInput } from '../events/event.schemas';
import { PrismaService } from '../prisma/prisma.service';

export interface AdminEvent {
  id: number;
  slug: string;
  title: string;
  description: string;
  language: string;
  text: string;
  startsAt: string;
  endsAt: string;
  state: EventState;
  createdAt: string;
}

const EVENT_SELECT = {
  id: true,
  slug: true,
  title: true,
  description: true,
  language: true,
  text: true,
  startsAt: true,
  endsAt: true,
  createdAt: true,
} satisfies Prisma.EventSelect;

type EventRow = Prisma.EventGetPayload<{ select: typeof EVENT_SELECT }>;

function toAdminEvent(row: EventRow, now: Date): AdminEvent {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    language: row.language,
    text: row.text,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    state: eventState(row.startsAt, row.endsAt, now),
    createdAt: row.createdAt.toISOString(),
  };
}

const NOT_FOUND = 'No event with that id';
const SLUG_TAKEN = 'An event with that slug already exists';

/**
 * Typing events, managed by events.manage. The window and the started-event rules are in event-rules.ts;
 * here they are applied to the stored values, inside the write's transaction.
 */
@Injectable()
export class AdminEventsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: EventsAdminQuery, now: Date = new Date()): Promise<Page<AdminEvent>> {
    const [rows, total] = await Promise.all([
      this.prisma.event.findMany({
        orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(query),
        select: EVENT_SELECT,
      }),
      this.prisma.event.count(),
    ]);
    return toPage(rows.map((row) => toAdminEvent(row, now)), total, query);
  }

  async create(admin: AuthUser, input: EventCreateInput, now: Date = new Date()): Promise<AdminEvent> {
    const problem = eventWindowProblem(input.startsAt, input.endsAt);
    if (problem) throw new BadRequestException(problem);
    return this.prisma.writeTx(async (tx) => {
      let row: EventRow;
      try {
        row = await tx.event.create({
          data: {
            slug: input.slug,
            title: input.title,
            description: input.description,
            language: input.language,
            text: input.text,
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            createdBy: admin.id,
          },
          select: EVENT_SELECT,
        });
      } catch (err) {
        // The unique slug. Thrown from inside the transaction, so it rolls back and nothing is audited.
        if (prismaCode(err) === 'P2002') throw new ConflictException(SLUG_TAKEN);
        throw err;
      }
      await tx.adminAction.create({
        data: {
          adminId: admin.id,
          action: 'event_create',
          target: `event:${row.id}`,
          note: JSON.stringify({ slug: row.slug, language: row.language }),
        },
      });
      return toAdminEvent(row, now);
    });
  }

  async update(admin: AuthUser, id: number, input: EventUpdateInput, now: Date = new Date()): Promise<AdminEvent> {
    return this.prisma.writeTx(async (tx) => {
      const current = await tx.event.findUnique({ where: { id }, select: EVENT_SELECT });
      if (!current) throw new NotFoundException(NOT_FOUND);
      const problem = eventEditProblem(current, input, now);
      if (problem) throw new BadRequestException(problem);

      const data: Prisma.EventUpdateInput = {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.language !== undefined ? { language: input.language } : {}),
        ...(input.text !== undefined ? { text: input.text } : {}),
        ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
        ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
      };
      const row = await tx.event.update({ where: { id }, data, select: EVENT_SELECT });
      await tx.adminAction.create({
        data: {
          adminId: admin.id,
          action: 'event_update',
          target: `event:${id}`,
          note: JSON.stringify({ changed: Object.keys(input), started: hasStarted(current.startsAt, now) }),
        },
      });
      return toAdminEvent(row, now);
    });
  }

  /** Results of the event keep their rows: their eventId is set to null (SetNull). */
  async remove(admin: AuthUser, id: number): Promise<{ ok: true }> {
    await this.prisma.writeTx(async (tx) => {
      const current = await tx.event.findUnique({ where: { id }, select: { id: true, slug: true } });
      if (!current) throw new NotFoundException(NOT_FOUND);
      await tx.event.delete({ where: { id } });
      await tx.adminAction.create({
        data: { adminId: admin.id, action: 'event_delete', target: `event:${id}`, note: JSON.stringify({ slug: current.slug }) },
      });
    });
    return { ok: true };
  }
}
