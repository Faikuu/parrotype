import { INestApplication } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
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
  // POST /api/results carries a replay (up to 256 KB). Registered first: its parser reads the body, so the 50 KB
  // parser below skips that request. Every other route keeps 50 KB.
  app.use('/api/results', express.json({ limit: '256kb' }));
  app.use(express.json({ limit: '50kb' }));
  app.enableCors({ origin: env.corsOrigins, credentials: true });
  // WebSocket gateways (races). Applied here so the e2e tests get the same setup as main.ts.
  app.useWebSocketAdapter(new WsAdapter(app));
  // Behind reverse proxies, req.ip must be the real client, or the throttler sees one client.
  if (env.trustProxy > 0) {
    (app.getHttpAdapter().getInstance() as express.Express).set('trust proxy', env.trustProxy);
  }
}
