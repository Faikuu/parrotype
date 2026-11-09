import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/jwt-auth.guard';
import type { Page } from '../common/pagination';
import {
  eventCreateSchema,
  eventUpdateSchema,
  eventsAdminQuerySchema,
  type EventCreateInput,
  type EventUpdateInput,
  type EventsAdminQuery,
} from '../events/event.schemas';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermissions } from '../permissions/permissions.decorator';
import { AdminEventsService, type AdminEvent } from './admin-events.service';

@Controller('admin/events')
@UseGuards(PermissionsGuard)
export class AdminEventsController {
  constructor(private readonly events: AdminEventsService) {}

  @Get()
  @RequirePermissions('events.manage')
  list(@Query(new ZodValidationPipe(eventsAdminQuerySchema)) query: EventsAdminQuery): Promise<Page<AdminEvent>> {
    return this.events.list(query);
  }

  @Post()
  @RequirePermissions('events.manage')
  create(
    @CurrentUser() me: AuthUser,
    @Body(new ZodValidationPipe(eventCreateSchema)) body: EventCreateInput,
  ): Promise<AdminEvent> {
    return this.events.create(me, body);
  }

  @Patch(':id')
  @RequirePermissions('events.manage')
  update(
    @CurrentUser() me: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(eventUpdateSchema)) body: EventUpdateInput,
  ): Promise<AdminEvent> {
    return this.events.update(me, id, body);
  }

  @Delete(':id')
  @HttpCode(200)
  @RequirePermissions('events.manage')
  remove(@CurrentUser() me: AuthUser, @Param('id', ParseIntPipe) id: number): Promise<{ ok: true }> {
    return this.events.remove(me, id);
  }
}
