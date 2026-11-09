import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { AuthModule } from './auth/auth.module';
import { DailyModule } from './daily/daily.module';
import { EventsModule } from './events/events.module';
import { HealthController } from './health/health.controller';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PermissionsModule } from './permissions/permissions.module';
import { PrismaModule } from './prisma/prisma.module';
import { RacesModule } from './races/races.module';
import { QuotesModule } from './quotes/quotes.module';
import { ResultsModule } from './results/results.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
    }),
    PrismaModule,
    PermissionsModule,
    AuthModule,
    ResultsModule,
    QuotesModule,
    LeaderboardModule,
    DailyModule,
    UsersModule,
    AdminModule,
    RacesModule,
    NotificationsModule,
    AnnouncementsModule,
    EventsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
