import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UserEventsModule } from '../common/user-events.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [AuthModule, UserEventsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
