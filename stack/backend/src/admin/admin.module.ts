import { Module } from '@nestjs/common';
import { UserEventsModule } from '../common/user-events.module';
import { RacesModule } from '../races/races.module';
import { AdminController } from './admin.controller';
import { AdminGroupsController } from './admin-groups.controller';
import { AdminGroupsService } from './admin-groups.service';
import { AdminQuotesController } from './admin-quotes.controller';
import { AdminQuotesService } from './admin-quotes.service';
import { AdminRacesController } from './admin-races.controller';
import { AdminService } from './admin.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

/** Permissions (guard and service) are global: see PermissionsModule. RacesModule exports the live room service. */
@Module({
  imports: [UserEventsModule, RacesModule],
  controllers: [AdminController, AdminUsersController, AdminGroupsController, AdminQuotesController, AdminRacesController],
  providers: [AdminService, AdminUsersService, AdminGroupsService, AdminQuotesService],
})
export class AdminModule {}
