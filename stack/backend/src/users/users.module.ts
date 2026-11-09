import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ModerationModule } from '../moderation/moderation.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FollowsService } from './follows.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule, ModerationModule, NotificationsModule],
  controllers: [UsersController],
  providers: [UsersService, FollowsService],
})
export class UsersModule {}
