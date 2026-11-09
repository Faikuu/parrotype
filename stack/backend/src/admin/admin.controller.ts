import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AdminService, type AdminAuditEntry, type AdminReport, type AdminUserState } from './admin.service';
import { banInputSchema, reportsQuerySchema, type BanInput, type ReportsQuery } from './admin.schemas';

/** Every route needs an admin session: no session is 401, a non-admin is 403. */
@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('reports')
  reports(@Query(new ZodValidationPipe(reportsQuerySchema)) query: ReportsQuery): Promise<AdminReport[]> {
    return this.admin.listReports(query.status);
  }

  @Post('reports/:id/resolve')
  @HttpCode(200)
  resolve(@CurrentUser() me: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.admin.decideReport(me, id, 'resolve');
  }

  @Post('reports/:id/dismiss')
  @HttpCode(200)
  dismiss(@CurrentUser() me: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.admin.decideReport(me, id, 'dismiss');
  }

  @Post('users/:name/ban')
  @HttpCode(200)
  ban(
    @CurrentUser() me: AuthUser,
    @Param('name') name: string,
    @Body(new ZodValidationPipe(banInputSchema)) body: BanInput,
  ): Promise<AdminUserState> {
    return this.admin.ban(me, name, body.reason);
  }

  @Post('users/:name/unban')
  @HttpCode(200)
  unban(@CurrentUser() me: AuthUser, @Param('name') name: string): Promise<AdminUserState> {
    return this.admin.unban(me, name);
  }

  @Delete('results/:id')
  @HttpCode(200)
  deleteResult(@CurrentUser() me: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.admin.deleteResult(me, id);
  }

  @Get('actions')
  actions(): Promise<AdminAuditEntry[]> {
    return this.admin.listActions();
  }
}
