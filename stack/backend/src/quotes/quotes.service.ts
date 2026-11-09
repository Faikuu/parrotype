import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

export type QuoteLength = 'short' | 'medium' | 'long' | 'any';

export interface QuoteDto {
  id: number;
  language: string;
  text: string;
  source: string;
  length: number;
}

/** short < 100 chars, medium 100-250, long > 250. */
export function lengthFilter(length: QuoteLength): Prisma.QuoteWhereInput {
  switch (length) {
    case 'short':
      return { length: { lt: 100 } };
    case 'medium':
      return { length: { gte: 100, lte: 250 } };
    case 'long':
      return { length: { gt: 250 } };
    case 'any':
      return {};
  }
}

@Injectable()
export class QuotesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Counts the matches, then loads one row at a random offset. Never loads the whole table. */
  async random(language: string, length: QuoteLength): Promise<QuoteDto> {
    const where: Prisma.QuoteWhereInput = { language, ...lengthFilter(length) };
    const total = await this.prisma.quote.count({ where });
    if (total === 0) throw new NotFoundException('No quotes match these filters');

    const quote = await this.prisma.quote.findFirst({
      where,
      orderBy: { id: 'asc' },
      skip: randomInt(total),
      select: { id: true, language: true, text: true, source: true, length: true },
    });
    if (!quote) throw new NotFoundException('No quotes match these filters');
    return quote;
  }
}
