import { Injectable } from '@nestjs/common';
import type { Result } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildInsights, type InsightRow, type Insights } from './insights';
import { EXPORT_BATCH_SIZE, exportChunks, type ExportFormat } from './export';
import type { ResultInput } from './results.schemas';

/** Insights read at most this many of the user's most recent results. */
export const INSIGHTS_ROW_CAP = 20_000;

export interface ResultDto {
  id: number;
  mode: string;
  mode2: string;
  language: string;
  wpm: number;
  rawWpm: number;
  accuracy: number;
  consistency: number;
  durationMs: number;
  charStats: { correct: number; incorrect: number; extra: number; missed: number };
  punctuation: boolean;
  numbers: boolean;
  createdAt: string;
}

export interface Summary {
  totalTests: number;
  totalTimeMs: number;
  averageWpm: number;
  averageAccuracy: number;
  bests: Array<{
    mode: string;
    mode2: string;
    language: string;
    wpm: number;
    accuracy: number;
    createdAt: string;
  }>;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const mean = (xs: number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

export function toResultDto(r: Result): ResultDto {
  return {
    id: r.id,
    mode: r.mode,
    mode2: r.mode2,
    language: r.language,
    wpm: r.wpm,
    rawWpm: r.rawWpm,
    accuracy: r.accuracy,
    consistency: r.consistency,
    durationMs: r.durationMs,
    charStats: {
      correct: r.correctChars,
      incorrect: r.incorrectChars,
      extra: r.extraChars,
      missed: r.missedChars,
    },
    punctuation: r.punctuation,
    numbers: r.numbers,
    createdAt: r.createdAt.toISOString(),
  };
}

type BestCandidate = Pick<Result, 'mode' | 'mode2' | 'language' | 'wpm' | 'accuracy' | 'createdAt' | 'id'>;

/** Best result per (mode, mode2, language): highest wpm, earliest on a tie. */
export function computeBests(rows: BestCandidate[]): Summary['bests'] {
  const best = new Map<string, BestCandidate>();
  for (const row of rows) {
    const key = JSON.stringify([row.mode, row.mode2, row.language]);
    const cur = best.get(key);
    if (!cur || row.wpm > cur.wpm || (row.wpm === cur.wpm && row.createdAt < cur.createdAt)) {
      best.set(key, row);
    }
  }
  return [...best.values()]
    .sort((a, b) => b.wpm - a.wpm)
    .map((r) => ({
      mode: r.mode,
      mode2: r.mode2,
      language: r.language,
      wpm: r.wpm,
      accuracy: r.accuracy,
      createdAt: r.createdAt.toISOString(),
    }));
}

/**
 * Best result per (mode, mode2, language) for one user, optionally limited to some modes.
 * Two queries: groupBy for each combination's best wpm, then the rows at those values.
 */
export async function bestsForUser(
  prisma: PrismaService,
  userId: number,
  modes?: readonly string[],
): Promise<Summary['bests']> {
  const where = modes ? { userId, mode: { in: [...modes] } } : { userId };
  const bestGroups = await prisma.result.groupBy({
    by: ['mode', 'mode2', 'language'],
    where,
    _max: { wpm: true },
  });

  // The rows at each combination's best wpm. computeBests then keeps the earliest of them.
  const bestWhere = bestGroups.flatMap((g) =>
    g._max.wpm === null
      ? []
      : [{ mode: g.mode, mode2: g.mode2, language: g.language, wpm: g._max.wpm }],
  );
  if (bestWhere.length === 0) return [];
  const bestRows = await prisma.result.findMany({
    where: { userId, OR: bestWhere },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, mode: true, mode2: true, language: true, wpm: true, accuracy: true, createdAt: true },
  });
  return computeBests(bestRows);
}

/**
 * The user's most recent INSIGHTS_ROW_CAP results, oldest first. Ordered newest first so that
 * take returns the recent end, then reversed. Only the columns the insights use are read.
 */
export async function loadInsightRows(prisma: PrismaService, userId: number): Promise<InsightRow[]> {
  const rows = await prisma.result.findMany({
    where: { userId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: INSIGHTS_ROW_CAP,
    select: {
      createdAt: true,
      mode: true,
      mode2: true,
      language: true,
      wpm: true,
      accuracy: true,
      correctChars: true,
      durationMs: true,
    },
  });
  return rows.reverse();
}

@Injectable()
export class ResultsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: number, input: ResultInput): Promise<ResultDto> {
    const row = await this.prisma.result.create({
      data: {
        userId,
        mode: input.mode,
        mode2: input.mode2,
        language: input.language,
        wpm: input.wpm,
        rawWpm: input.rawWpm,
        accuracy: input.accuracy,
        consistency: input.consistency,
        durationMs: input.durationMs,
        correctChars: input.charStats.correct,
        incorrectChars: input.charStats.incorrect,
        extraChars: input.charStats.extra,
        missedChars: input.charStats.missed,
        punctuation: input.punctuation,
        numbers: input.numbers,
      },
    });
    return toResultDto(row);
  }

  async listMine(userId: number, limit: number): Promise<ResultDto[]> {
    const rows = await this.prisma.result.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return rows.map(toResultDto);
  }

  async summary(userId: number): Promise<Summary> {
    const [totals, recent, bests] = await Promise.all([
      this.prisma.result.aggregate({
        where: { userId },
        _count: { _all: true },
        _sum: { durationMs: true },
      }),
      this.prisma.result.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 10,
        select: { wpm: true, accuracy: true },
      }),
      bestsForUser(this.prisma, userId),
    ]);

    return {
      totalTests: totals._count._all,
      totalTimeMs: totals._sum.durationMs ?? 0,
      averageWpm: round2(mean(recent.map((r) => r.wpm))),
      averageAccuracy: round2(mean(recent.map((r) => r.accuracy))),
      bests,
    };
  }

  async insights(userId: number, now: Date = new Date()): Promise<Insights> {
    return buildInsights(await loadInsightRows(this.prisma, userId), now);
  }

  /** The user's whole history, in id order, in batches of EXPORT_BATCH_SIZE. */
  exportStream(userId: number, format: ExportFormat): AsyncGenerator<string> {
    return exportChunks(
      format,
      (afterId) =>
        this.prisma.result.findMany({
          where: { userId, id: { gt: afterId } },
          orderBy: { id: 'asc' },
          take: EXPORT_BATCH_SIZE,
          select: {
            id: true,
            createdAt: true,
            mode: true,
            mode2: true,
            language: true,
            wpm: true,
            rawWpm: true,
            accuracy: true,
            consistency: true,
            durationMs: true,
            correctChars: true,
            incorrectChars: true,
            extraChars: true,
            missedChars: true,
            punctuation: true,
            numbers: true,
          },
        }),
      EXPORT_BATCH_SIZE,
    );
  }
}
