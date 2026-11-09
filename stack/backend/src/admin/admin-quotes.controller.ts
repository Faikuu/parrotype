import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/jwt-auth.guard';
import type { Page } from '../common/pagination';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/permissions.decorator';
import {
  quoteCreateSchema,
  quoteUpdateSchema,
  quotesQuerySchema,
  type QuoteCreateInput,
  type QuoteUpdateInput,
  type QuotesQuery,
} from './admin.schemas';
import { AdminQuotesService, type AdminQuote } from './admin-quotes.service';

@Controller('admin/quotes')
@UseGuards(PermissionsGuard)
export class AdminQuotesController {
  constructor(private readonly quotes: AdminQuotesService) {}

  @Get()
  @RequirePermissions('quotes.read')
  list(@Query(new ZodValidationPipe(quotesQuerySchema)) query: QuotesQuery): Promise<Page<AdminQuote>> {
    return this.quotes.list(query);
  }

  @Post()
  @RequirePermissions('quotes.manage')
  create(
    @CurrentUser() me: AuthUser,
    @Body(new ZodValidationPipe(quoteCreateSchema)) body: QuoteCreateInput,
  ): Promise<AdminQuote> {
    return this.quotes.create(me, body);
  }

  @Patch(':id')
  @RequirePermissions('quotes.manage')
  update(
    @CurrentUser() me: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(quoteUpdateSchema)) body: QuoteUpdateInput,
  ): Promise<AdminQuote> {
    return this.quotes.update(me, id, body);
  }

  @Delete(':id')
  @HttpCode(200)
  @RequirePermissions('quotes.manage')
  remove(@CurrentUser() me: AuthUser, @Param('id', ParseIntPipe) id: number): Promise<{ ok: true }> {
    return this.quotes.remove(me, id);
  }
}
