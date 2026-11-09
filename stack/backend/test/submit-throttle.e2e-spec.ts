import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { applyE2eEnv } from './e2e.env';
import { sessionFor } from './e2e.helpers';

applyE2eEnv();

/**
 * Result submission verifies replays synchronously, so it has its own limit (20 a minute) below the global
 * one. The throttler runs before validation, so invalid bodies count too, which keeps this test cheap.
 */
describe('result submit throttle (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.user.create({
      data: { name: 'st_typist', nameLower: 'st_typist', email: 'st_typist@example.com', passwordHash: 'not-used-here' },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { nameLower: 'st_typist' } });
    await app.close();
  });

  it('allows 20 submissions a minute and refuses the 21st with 429', async () => {
    const cookie = await sessionFor(app, prisma, 'st_typist');
    const server = app.getHttpServer();
    for (let i = 0; i < 20; i++) {
      const res = await request(server).post('/api/results').set('Cookie', cookie).send({});
      expect(res.status).toBe(400);
    }
    await request(server).post('/api/results').set('Cookie', cookie).send({}).expect(429);
  });
});
