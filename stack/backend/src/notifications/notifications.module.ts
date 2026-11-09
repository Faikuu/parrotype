import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ResultsModule } from '../results/results.module';
import { PbBeatenNotifier } from './pb-beaten.notifier';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/** Notices for follows, report outcomes and beaten bests. Other modules call NotificationsService. */
@Module({
  imports: [AuthModule, ResultsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, PbBeatenNotifier],
  exports: [NotificationsService],
})
export class NotificationsModule {}
