import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  Put,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { UserService } from '../user/user.service';
import { ModelService } from '../model/model.service';
import { User as UserModel, Model as ModelModel, Model } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';

@Controller('/model')
export class ModelController {
  constructor(
    private readonly modelService: ModelService,
  ) {}

  @Get('/random/:langId')
  async getModelById(@Param('langId') langId: string): Promise<Model | null> {
    if (!langId) {
      throw new Error('langId is required');
    }
    const model = (await this.modelService.randomModel(
      { where: { langId: Number(langId) } }
    ));
    
    return model
  }
}