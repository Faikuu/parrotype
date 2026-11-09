import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/jwt-auth.guard';
import {
  announcementCreateSchema,
  announcementUpdateSchema,
  announcementsQuerySchema,
  type AnnouncementCreateInput,
  type AnnouncementUpdateInput,
  type AnnouncementsQuery,
} from '../announcements/announcement.schemas';
import type { AnnouncementDto } from '../announcements/announcements.service';
import type { Page } from '../common/pagination';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/permissions.decorator';
import { AdminAnnouncementsService } from './admin-announcements.service';

@Controller('admin/announcements')
@UseGuards(PermissionsGuard)
export class AdminAnnouncementsController {
  constructor(private readonly announcements: AdminAnnouncementsService) {}

  @Get()
  @RequirePermissions('announcements.manage')
  list(@Query(new ZodValidationPipe(announcementsQuerySchema)) query: AnnouncementsQuery): Promise<Page<AnnouncementDto>> {
    return this.announcements.list(query);
  }

  @Post()
  @RequirePermissions('announcements.manage')
  create(
    @CurrentUser() me: AuthUser,
    @Body(new ZodValidationPipe(announcementCreateSchema)) body: AnnouncementCreateInput,
  ): Promise<AnnouncementDto> {
    return this.announcements.create(me, body);
  }

  @Patch(':id')
  @RequirePermissions('announcements.manage')
  update(
    @CurrentUser() me: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(announcementUpdateSchema)) body: AnnouncementUpdateInput,
  ): Promise<AnnouncementDto> {
    return this.announcements.update(me, id, body);
  }

  @Delete(':id')
  @HttpCode(200)
  @RequirePermissions('announcements.manage')
  remove(@CurrentUser() me: AuthUser, @Param('id', ParseIntPipe) id: number): Promise<{ ok: true }> {
    return this.announcements.remove(me, id);
  }
}
