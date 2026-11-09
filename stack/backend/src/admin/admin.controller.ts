import { Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/jwt-auth.guard';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { Page } from '../common/pagination';
import { CATALOG, type CatalogEntry, type Permission } from '../permissions/catalog';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/permissions.decorator';
import { AdminService, type AdminAuditEntry, type AdminReport } from './admin.service';
import { reportsQuerySchema, type ReportsQuery } from './admin.schemas';

/** Every route needs a session (401) and the permission named on it (403). Routes without one need admin.access. */
@Controller('admin')
@UseGuards(PermissionsGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  /** The catalog, and the permissions the caller holds (`mine`, sorted). */
  @Get('permissions')
  @RequirePermissions('admin.access')
  permissions(@Req() req: Request): { catalog: CatalogEntry[]; mine: Permission[] } {
    return { catalog: [...CATALOG], mine: [...(req.permissions ?? [])].sort() };
  }

  @Get('reports')
  @RequirePermissions('reports.read')
  reports(@Query(new ZodValidationPipe(reportsQuerySchema)) query: ReportsQuery): Promise<Page<AdminReport>> {
    return this.admin.listReports(query);
  }

  @Post('reports/:id/resolve')
  @HttpCode(200)
  @RequirePermissions('reports.resolve')
  resolve(@CurrentUser() me: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.admin.decideReport(me, id, 'resolve');
  }

  @Post('reports/:id/dismiss')
  @HttpCode(200)
  @RequirePermissions('reports.resolve')
  dismiss(@CurrentUser() me: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.admin.decideReport(me, id, 'dismiss');
  }

  @Delete('results/:id')
  @HttpCode(200)
  @RequirePermissions('results.delete')
  deleteResult(@CurrentUser() me: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.admin.deleteResult(me, id);
  }

  @Get('actions')
  @RequirePermissions('audit.read')
  actions(): Promise<AdminAuditEntry[]> {
    return this.admin.listActions();
  }
}
