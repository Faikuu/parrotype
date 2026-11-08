import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { getEnv } from './config/env';

/** Applies the global HTTP setup. Shared by main.ts and the e2e test so both match. */
export function configureApp(app: INestApplication): void {
  const env = getEnv();
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.use(express.json({ limit: '50kb' }));
  app.enableCors({ origin: env.corsOrigins, credentials: true });
}
