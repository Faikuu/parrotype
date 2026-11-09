import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { applyE2eEnv } from './e2e.env';

applyE2eEnv();

const cookieFrom = (res: request.Response): string => {
  const header = res.headers['set-cookie'];
  const first = Array.isArray(header) ? header[0] : header;
  return String(first).split(';')[0];
};

const OLD_PASSWORD = 'old-password-1';
const NEW_PASSWORD = 'new-password-2';

describe('public profile and account settings (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves a public profile by name without an email', async () => {
    const server = app.getHttpServer();
    const reg = await request(server)
      .post('/api/auth/register')
      .send({ name: 'Acct_User', email: 'acct@example.com', password: OLD_PASSWORD })
      .expect(201);
    const cookie = cookieFrom(reg);
    await request(server)
      .post('/api/results')
      .set('Cookie', cookie)
      .send({
        mode: 'words',
        mode2: '25',
        language: 'en',
        wpm: 80,
        rawWpm: 85,
        accuracy: 97.5,
        consistency: 90,
        durationMs: 60_000,
        charStats: { correct: 400, incorrect: 10, extra: 0, missed: 0 },
        punctuation: false,
        numbers: false,
      })
      .expect(201);

    // The lookup is case-insensitive: the name is typed in upper case here.
    const profile = await request(server).get('/api/users/ACCT_USER').expect(200);
    expect(profile.body).not.toHaveProperty('email');
    expect(JSON.stringify(profile.body)).not.toContain('acct@example.com');
    expect(profile.body).toMatchObject({
      name: 'Acct_User',
      totalTests: 1,
      totalTimeMs: 60_000,
      bests: [expect.objectContaining({ mode: 'words', mode2: '25', wpm: 80 })],
      recent: [expect.objectContaining({ mode: 'words', wpm: 80 })],
    });

    await request(server).get('/api/users/nobody_here').expect(404);
    const invalid = await request(server).get('/api/users/ab').expect(404);
    expect(invalid.body.message).toBe('No user with that name');
  });

  it('changes the password: the old session ends, the new cookie works', async () => {
    const server = app.getHttpServer();
    const login = await request(server)
      .post('/api/auth/login')
      .send({ email: 'acct@example.com', password: OLD_PASSWORD })
      .expect(200);
    const oldCookie = cookieFrom(login);

    const wrong = await request(server)
      .patch('/api/auth/password')
      .set('Cookie', oldCookie)
      .send({ currentPassword: 'not-the-password', newPassword: NEW_PASSWORD })
      .expect(401);
    expect(wrong.body.message).toBe('Current password is incorrect');

    await request(server)
      .patch('/api/auth/password')
      .set('Cookie', oldCookie)
      .send({ currentPassword: OLD_PASSWORD, newPassword: 'short' })
      .expect(400);

    const same = await request(server)
      .patch('/api/auth/password')
      .set('Cookie', oldCookie)
      .send({ currentPassword: OLD_PASSWORD, newPassword: OLD_PASSWORD })
      .expect(400);
    expect(same.body.message).toBe('New password must be different from the current one');

    const changed = await request(server)
      .patch('/api/auth/password')
      .set('Cookie', oldCookie)
      .send({ currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD })
      .expect(200);
    expect(changed.body).toEqual({ ok: true });
    const newCookie = cookieFrom(changed);
    expect(newCookie).toMatch(/^pt_session=/);
    expect(newCookie).not.toBe(oldCookie);

    await request(server).get('/api/auth/me').set('Cookie', oldCookie).expect(401);
    const me = await request(server).get('/api/auth/me').set('Cookie', newCookie).expect(200);
    expect(me.body.user.name).toBe('Acct_User');

    await request(server)
      .post('/api/auth/login')
      .send({ email: 'acct@example.com', password: OLD_PASSWORD })
      .expect(401);
    await request(server)
      .post('/api/auth/login')
      .send({ email: 'acct@example.com', password: NEW_PASSWORD })
      .expect(200);
  });

  it('deletes the account with the password, cascading its results and clearing the cookie', async () => {
    const server = app.getHttpServer();
    const login = await request(server)
      .post('/api/auth/login')
      .send({ email: 'acct@example.com', password: NEW_PASSWORD })
      .expect(200);
    const cookie = cookieFrom(login);
    const prisma = app.get(PrismaService);
    const { id } = await prisma.user.findUniqueOrThrow({ where: { nameLower: 'acct_user' }, select: { id: true } });

    await request(server).delete('/api/auth/account').expect(401);
    await request(server)
      .delete('/api/auth/account')
      .set('Cookie', cookie)
      .send({ password: 'not-the-password' })
      .expect(401);

    const deleted = await request(server)
      .delete('/api/auth/account')
      .set('Cookie', cookie)
      .send({ password: NEW_PASSWORD })
      .expect(200);
    expect(deleted.body).toEqual({ ok: true });
    expect(String(deleted.headers['set-cookie']?.[0] ?? '')).toMatch(/^pt_session=;/);

    await request(server)
      .post('/api/auth/login')
      .send({ email: 'acct@example.com', password: NEW_PASSWORD })
      .expect(401);
    await request(server).get('/api/users/acct_user').expect(404);
    expect(await prisma.result.count({ where: { userId: id } })).toBe(0);
    await request(server).get('/api/auth/me').set('Cookie', cookie).expect(401);
  });
});
