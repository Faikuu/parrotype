import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { applyE2eEnv } from './e2e.env';
import { makeAdministrator } from './e2e.helpers';

applyE2eEnv();

// Five admins acting at once on the same row: the conditional writes must let exactly one through.
// Route throttles are per IP and allow 100 a minute, so the five requests per step fit.
const PASSWORD = 'concurrency-password-1';
const CONTENDERS = 5;

const cookieFrom = (res: request.Response): string => {
  const header = res.headers['set-cookie'];
  const first = Array.isArray(header) ? header[0] : header;
  return String(first).split(';')[0];
};

describe('concurrent moderation writes (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let prisma: PrismaService;
  let admin: string;
  let targetId: number;
  let reporterId: number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
    configureApp(app);
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);

    const reg = async (name: string) =>
      request(server).post('/api/auth/register').send({ name, email: `${name}@example.com`, password: PASSWORD }).expect(201);
    admin = cookieFrom(await reg('cc_admin'));
    await reg('cc_target');
    await reg('cc_reporter');
    await makeAdministrator(prisma, 'cc_admin');
    targetId = (await prisma.user.findUniqueOrThrow({ where: { nameLower: 'cc_target' } })).id;
    reporterId = (await prisma.user.findUniqueOrThrow({ where: { nameLower: 'cc_reporter' } })).id;
  });

  afterAll(async () => {
    await app.close();
  });

  const statuses = (responses: request.Response[]): number[] => responses.map((r) => r.status).sort();

  it('five simultaneous resolves of one open report: one 200, four 409, one audit row', async () => {
    const report = await prisma.report.create({ data: { reporterId, targetId, reason: 'other' } });

    const responses = await Promise.all(
      Array.from({ length: CONTENDERS }, () =>
        request(server).post(`/api/admin/reports/${report.id}/resolve`).set('Cookie', admin),
      ),
    );

    expect(statuses(responses)).toEqual([200, 409, 409, 409, 409]);
    const losers = responses.filter((r) => r.status === 409).map((r) => r.body.message);
    expect(new Set(losers)).toEqual(new Set(['Report is already resolved']));
    const audit = await prisma.adminAction.findMany({ where: { action: 'resolve_report', target: `report:${report.id}` } });
    expect(audit).toHaveLength(1);
    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).status).toBe('resolved');
  });

  it('five simultaneous bans of one user: one 200, four 409, one ban row', async () => {
    const responses = await Promise.all(
      Array.from({ length: CONTENDERS }, () =>
        request(server).post(`/api/admin/users/${targetId}/ban`).set('Cookie', admin).send({ reason: 'race' }),
      ),
    );

    expect(statuses(responses)).toEqual([200, 409, 409, 409, 409]);
    const audit = await prisma.adminAction.findMany({ where: { action: 'ban', target: `user:${targetId}` } });
    expect(audit).toHaveLength(1);
  });

  it('five simultaneous unbans of that user: one 200, four 409, one unban row', async () => {
    const responses = await Promise.all(
      Array.from({ length: CONTENDERS }, () =>
        request(server).post(`/api/admin/users/${targetId}/unban`).set('Cookie', admin),
      ),
    );

    expect(statuses(responses)).toEqual([200, 409, 409, 409, 409]);
    const audit = await prisma.adminAction.findMany({ where: { action: 'unban', target: `user:${targetId}` } });
    expect(audit).toHaveLength(1);
  });
});
