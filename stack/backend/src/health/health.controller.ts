import { Controller, Get } from '@nestjs/common';
import { DatabaseProvider, getEnv } from '../config/env';

@Controller('health')
export class HealthController {
  @Get()
  check(): { ok: true; db: DatabaseProvider } {
    return { ok: true, db: getEnv().DATABASE_PROVIDER };
  }
}
