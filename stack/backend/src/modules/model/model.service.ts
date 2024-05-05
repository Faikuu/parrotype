import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { Model, Prisma } from '@prisma/client';

@Injectable()
export class ModelService {
  constructor(private prisma: PrismaService) {}

  async model(
    modelWhereUniqueInput: Prisma.ModelWhereUniqueInput,
  ): Promise<Model | null> {
    return this.prisma.model.findUnique({
      where: modelWhereUniqueInput,
    });
  }

  async models(params: {
    skip?: number;
    take?: number;
    cursor?: Prisma.ModelWhereUniqueInput;
    where?: Prisma.ModelWhereInput;
    orderBy?: Prisma.ModelOrderByWithRelationInput;
  }): Promise<Model[]> {
    const { skip, take, cursor, where, orderBy } = params;
    return this.prisma.model.findMany({
      skip,
      take,
      cursor,
      where,
      orderBy,
    });
  }

  async randomModel(params: {
    skip?: number;
    take?: number;
    cursor?: Prisma.ModelWhereUniqueInput;
    where?: Prisma.ModelWhereInput;
    orderBy?: Prisma.ModelOrderByWithRelationInput;
  }): Promise<Model> {
    const { skip, take, cursor, where, orderBy } = params;
    const models = await this.prisma.model.findMany({
      skip,
      take,
      cursor,
      where,
      orderBy,
    });
    const randomInt = Math.floor(Math.random() * models.length);
    return models[randomInt];
  }
}