import { Module } from '@nestjs/common';
import { StatisticsController } from './statistics.controller';
import { StatisticsService } from './statistics.service';
import { PrismaService } from 'src/prisma.service';

@Module({
  controllers: [StatisticsController],
  providers: [StatisticsService, PrismaService]
})
export class StatisticsModule {}
