import { Module } from '@nestjs/common';
import { UserEventsModule } from '../common/user-events.module';
import { AdminController } from './admin.controller';
import { AdminGroupsController } from './admin-groups.controller';
import { AdminGroupsService } from './admin-groups.service';
import { AdminService } from './admin.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

/** Permissions (guard and service) are global: see PermissionsModule. */
@Module({
  imports: [UserEventsModule],
  controllers: [AdminController, AdminUsersController, AdminGroupsController],
  providers: [AdminService, AdminUsersService, AdminGroupsService],
})
export class AdminModule {}
