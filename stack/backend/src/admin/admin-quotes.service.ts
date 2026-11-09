import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../auth/jwt-auth.guard';
import { pageArgs, toPage, type Page } from '../common/pagination';
import { prismaCode } from '../common/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import type { QuoteCreateInput, QuoteUpdateInput, QuotesQuery } from './admin.schemas';
import { keepsQuoteInLanguage, LAST_QUOTE } from './quote-rules';

export interface AdminQuote {
  id: number;
  language: string;
  text: string;
  source: string;
  length: number;
}

const QUOTE_SELECT = { id: true, language: true, text: true, source: true, length: true } satisfies Prisma.QuoteSelect;
const NOT_FOUND_QUOTE = 'No quote with that id';
/** Attempts for a serializable write that lost to a concurrent one. */
const SERIALIZABLE_ATTEMPTS = 3;

/**
 * Quote management. The length is computed here, from the trimmed text. A write that would leave a language
 * with no quotes is refused, and every write commits with its AdminAction row.
 */
@Injectable()
export class AdminQuotesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: QuotesQuery): Promise<Page<AdminQuote>> {
    const where: Prisma.QuoteWhereInput = {
      ...(query.language ? { language: query.language } : {}),
      ...(query.q ? { OR: [{ text: { contains: query.q } }, { source: { contains: query.q } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.quote.findMany({ where, orderBy: { id: 'asc' }, ...pageArgs(query), select: QUOTE_SELECT }),
      this.prisma.quote.count({ where }),
    ]);
    return toPage(items, total, query);
  }

  async create(admin: AuthUser, input: QuoteCreateInput): Promise<AdminQuote> {
    return this.prisma.writeTx(async (tx) => {
      const quote = await tx.quote.create({
        data: { language: input.language, text: input.text, source: input.source, length: input.text.length },
        select: QUOTE_SELECT,
      });
      await tx.adminAction.create({
        data: {
          adminId: admin.id,
          action: 'quote_create',
          target: `quote:${quote.id}`,
          note: JSON.stringify({ language: quote.language, length: quote.length }),
        },
      });
      return quote;
    });
  }

  async update(admin: AuthUser, id: number, input: QuoteUpdateInput): Promise<AdminQuote> {
    return this.serializable(async (tx) => {
      const current = await tx.quote.findUnique({ where: { id }, select: { id: true, language: true } });
      if (!current) throw new NotFoundException(NOT_FOUND_QUOTE);
      if (input.language !== undefined && input.language !== current.language) {
        await this.assertNotLast(tx, id, current.language);
      }
      const data: Prisma.QuoteUpdateInput = {
        ...(input.language !== undefined ? { language: input.language } : {}),
        ...(input.text !== undefined ? { text: input.text, length: input.text.length } : {}),
        ...(input.source !== undefined ? { source: input.source } : {}),
      };
      const updated = await tx.quote.update({ where: { id }, data, select: QUOTE_SELECT });
      await tx.adminAction.create({
        data: {
          adminId: admin.id,
          action: 'quote_update',
          target: `quote:${id}`,
          note: JSON.stringify({ changed: Object.keys(input) }),
        },
      });
      return updated;
    });
  }

  async remove(admin: AuthUser, id: number): Promise<{ ok: true }> {
    await this.serializable(async (tx) => {
      const current = await tx.quote.findUnique({ where: { id }, select: { id: true, language: true } });
      if (!current) throw new NotFoundException(NOT_FOUND_QUOTE);
      await this.assertNotLast(tx, id, current.language);
      try {
        await tx.quote.delete({ where: { id } });
      } catch (err) {
        if (prismaCode(err) === 'P2025') throw new NotFoundException(NOT_FOUND_QUOTE);
        throw err;
      }
      await tx.adminAction.create({
        data: {
          adminId: admin.id,
          action: 'quote_delete',
          target: `quote:${id}`,
          note: JSON.stringify({ language: current.language }),
        },
      });
    });
    return { ok: true };
  }

  /** Refuses the write when no other quote would remain in the language. */
  private async assertNotLast(tx: Prisma.TransactionClient, id: number, language: string): Promise<void> {
    const others = await tx.quote.count({ where: { language, id: { not: id } } });
    if (!keepsQuoteInLanguage(others)) throw new BadRequestException(LAST_QUOTE);
  }

  /**
   * A write that reads before it writes (the guard counts the other quotes). Serializable, so two writers that
   * both read the same count can't both act: the database aborts one (P2034) and it runs again, seeing the other.
   * SQLite accepts only Serializable, and runs its writers one at a time anyway.
   */
  private async serializable<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.prisma.writeTx(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (err) {
        if (prismaCode(err) !== 'P2034' || attempt >= SERIALIZABLE_ATTEMPTS) throw err;
      }
    }
  }
}
