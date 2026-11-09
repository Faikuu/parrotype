import { Body, Controller, Get, Logger, Param, ParseIntPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard, type AuthUser } from '../auth/jwt-auth.guard';
import type { ExportFormat } from './export';
import {
  exportQuerySchema,
  resultInputSchema,
  resultsListQuerySchema,
  type ExportQuery,
  type ResultInput,
  type ResultsListQuery,
} from './results.schemas';
import { ResultsService } from './results.service';

const EXPORT_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

const CONTENT_TYPE: Record<ExportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  json: 'application/json; charset=utf-8',
};

/** Resolves when the socket can take more data, or when it closes. */
function waitForDrain(res: Response): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => {
      res.off('drain', done);
      res.off('close', done);
      resolve();
    };
    res.once('drain', done);
    res.once('close', done);
  });
}

/** Public replay of a verified result. Kept apart from ResultsController, which requires a session on every route. */
@Controller('results')
export class ResultReplayController {
  constructor(private readonly results: ResultsService) {}

  @Get(':id/replay')
  replay(@Param('id', ParseIntPipe) id: number) {
    return this.results.replayOf(id);
  }
}

@Controller('results')
@UseGuards(JwtAuthGuard)
export class ResultsController {
  private readonly logger = new Logger(ResultsController.name);

  constructor(private readonly results: ResultsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(resultInputSchema)) body: ResultInput,
  ) {
    return this.results.create(user.id, body);
  }

  @Get('me')
  listMine(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(resultsListQuerySchema)) query: ResultsListQuery,
  ) {
    return this.results.listMine(user.id, query.limit);
  }

  @Get('me/summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.results.summary(user.id);
  }

  @Get('me/insights')
  insights(@CurrentUser() user: AuthUser) {
    return this.results.insights(user.id);
  }

  @Get('me/export')
  @Throttle(EXPORT_THROTTLE)
  async exportMine(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(exportQuerySchema)) query: ExportQuery,
    @Res() res: Response,
  ): Promise<void> {
    const chunks = this.results.exportStream(user.id, query.format)[Symbol.asyncIterator]();
    // The first batch is read before any header is set, so a database error still gets a normal error response.
    let next = await chunks.next();

    res.setHeader('Content-Type', CONTENT_TYPE[query.format]);
    res.setHeader('Content-Disposition', `attachment; filename="parrotype-results.${query.format}"`);
    res.setHeader('Cache-Control', 'no-store');
    try {
      while (!next.done) {
        if (res.destroyed) {
          await chunks.return(undefined);
          return;
        }
        if (!res.write(next.value)) await waitForDrain(res);
        next = await chunks.next();
      }
      res.end();
    } catch (err) {
      this.logger.error(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
      res.destroy();
    }
  }
}
