import { Module } from '@nestjs/common';
import { ModelService } from './model.service';
import { ModelController } from './model.controller';
import { PrismaService } from '../../prisma.service';

@Module({
  controllers: [ModelController],
  providers: [ModelService, PrismaService],
  exports: [ModelService]
})
export class ModuleModule {}