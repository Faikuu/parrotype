import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { getEnv } from './config/env';

async function bootstrap(): Promise<void> {
  // Fail fast on bad configuration, before Nest starts.
  const env = getEnv();
  // The adapter is passed explicitly: Nest's default lookup of platform-express can fail
  // when npm hoists @nestjs/core above this package. bodyParser is off because
  // configureApp installs express.json with a 50kb limit.
  const app = await NestFactory.create(AppModule, new ExpressAdapter(express()), {
    bodyParser: false,
  });
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(env.PORT);
  Logger.log(`ParroType API listening on port ${env.PORT} (/api)`, 'Bootstrap');
}

bootstrap().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
