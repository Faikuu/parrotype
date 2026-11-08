import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { QuotesService, type QuoteLength } from './quotes.service';

const quoteQuerySchema = z.object({
  language: z.enum(['en', 'pl']).default('en'),
  length: z.enum(['short', 'medium', 'long', 'any']).default('any'),
});

@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Get('random')
  random(
    @Query(new ZodValidationPipe(quoteQuerySchema))
    query: { language: 'en' | 'pl'; length: QuoteLength },
  ) {
    return this.quotes.random(query.language, query.length);
  }
}
