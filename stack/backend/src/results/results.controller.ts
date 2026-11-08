import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard, type AuthUser } from '../auth/jwt-auth.guard';
import {
  resultInputSchema,
  resultsListQuerySchema,
  type ResultInput,
  type ResultsListQuery,
} from './results.schemas';
import { ResultsService } from './results.service';

@Controller('results')
@UseGuards(JwtAuthGuard)
export class ResultsController {
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
}
