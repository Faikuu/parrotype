import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import { StatisticSchema } from './statistics.schema';

@Injectable()
export class StatisticsService {
    constructor(private prisma: PrismaService) {}

    async getStatistics(userId: string) {
        const correspondingUser = await this.prisma.user.findFirst({
            where: {
                name: userId
            }
        })

        const statistics = await this.prisma.statistics.findMany({
            where: {
                userId: correspondingUser.id,
            },
        }).then(stats => stats.map(stat => {
            const {id, userId, ...rest} = stat;
            return rest;
        }));

        return statistics
    }

    async create(userId: string, data: StatisticSchema) {
        const correspondingUser = await this.prisma.user.findFirst({
            where: {
                name: userId
            }
        })
        if (!correspondingUser) {
            throw new Error('User not found');
        }

        return this.prisma.statistics.create({
            data: {
                userId: correspondingUser.id,
                modelId: data.modelId,
                wpm: data.wpm,
            }
        });
    }
}
