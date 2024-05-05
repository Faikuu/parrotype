import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt.guard';
import { StatisticsService } from './statistics.service';
import { StatisticSchema } from './statistics.schema';
import { Request } from 'express';

@Controller('stat')
export class StatisticsController {
    constructor(private readonly statisticsService: StatisticsService) { }

    @Get()
    @UseGuards(JwtAuthGuard)
    async getStatistics(@Req() req: Request) {
        const user = req.user as any;
        const statistics = await this.statisticsService.getStatistics(user.id);
        return statistics;
    }

    @Post('/submit')
    @UseGuards(JwtAuthGuard)
    async register(
        @Body() loginModel: any,
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response
    ) {
        const user = req.user as any;
        const body = req.body as any;
        const registerResponse = await this.statisticsService.create(user.id, body as StatisticSchema);
        return registerResponse;
    }
}
