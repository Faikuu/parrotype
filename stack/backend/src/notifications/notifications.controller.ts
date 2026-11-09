import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard, type AuthUser } from '../auth/jwt-auth.guard';
import type { Page } from '../common/pagination';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import {
  notificationsQuerySchema,
  notificationsReadSchema,
  type NotificationsQuery,
  type NotificationsReadInput,
} from './notifications.schemas';
import { NotificationsService, type NotificationDto } from './notifications.service';

/** The signed-in user's notifications. Every route is for the caller only. */
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() me: AuthUser,
    @Query(new ZodValidationPipe(notificationsQuerySchema)) query: NotificationsQuery,
  ): Promise<Page<NotificationDto>> {
    return this.notifications.list(me.id, query);
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() me: AuthUser): Promise<{ count: number }> {
    return { count: await this.notifications.unreadCount(me.id) };
  }

  @Post('read')
  @HttpCode(200)
  markRead(
    @CurrentUser() me: AuthUser,
    @Body(new ZodValidationPipe(notificationsReadSchema)) body: NotificationsReadInput,
  ): Promise<{ updated: number }> {
    return this.notifications.markRead(me.id, body.ids);
  }
}
