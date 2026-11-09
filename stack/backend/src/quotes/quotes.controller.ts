import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { languageSchema, type Language } from '../common/domain';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { QuotesService, type QuoteLength } from './quotes.service';

const quoteQuerySchema = z.object({
  language: languageSchema.default('en'),
  length: z.enum(['short', 'medium', 'long', 'any']).default('any'),
});

@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Get('random')
  random(
    @Query(new ZodValidationPipe(quoteQuerySchema))
    query: { language: Language; length: QuoteLength },
  ) {
    return this.quotes.random(query.language, query.length);
  }
}
