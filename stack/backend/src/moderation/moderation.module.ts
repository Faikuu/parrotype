import { Module } from '@nestjs/common';
import { REPORTS_CLOCK, ReportsService } from './reports.service';

@Module({
  providers: [ReportsService, { provide: REPORTS_CLOCK, useValue: () => Date.now() }],
  exports: [ReportsService],
})
export class ModerationModule {}
