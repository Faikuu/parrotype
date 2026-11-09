import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ResultEvents } from './result-events';
import { ResultReplayController, ResultsController } from './results.controller';
import { ResultsService } from './results.service';

@Module({
  imports: [AuthModule],
  controllers: [ResultsController, ResultReplayController],
  providers: [ResultsService, ResultEvents],
  // ResultEvents is exported so other modules can subscribe to 'saved'.
  exports: [ResultEvents],
})
export class ResultsModule {}
