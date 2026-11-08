import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { getEnv } from './config/env';

async function bootstrap(): Promise<void> {
  // Fail fast on bad configuration, before Nest starts.
  const env = getEnv();
  // bodyParser: false, because configureApp installs express.json with a 50kb limit.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(env.PORT);
  Logger.log(`ParroType API listening on port ${env.PORT} (/api)`, 'Bootstrap');
}

bootstrap().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
