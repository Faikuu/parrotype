import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { utcDate } from '../src/common/dates';
import { applyE2eEnv } from './e2e.env';

applyE2eEnv();

const cookieFrom = (res: request.Response): string => {
  const header = res.headers['set-cookie'];
  const first = Array.isArray(header) ? header[0] : header;
  return String(first).split(';')[0];
};

const EMAIL = 'insight@example.com';

/** A valid result: rawWpm is 5 above wpm, and charStats match rawWpm over durationMs. */
const result = (mode: string, mode2: string, wpm: number, durationMs: number) => {
  const rawWpm = wpm + 5;
  const correct = Math.round((rawWpm * 5 * durationMs) / 60_000);
  return {
    mode,
    mode2,
    language: 'en',
    wpm,
    rawWpm,
    accuracy: 97.5,
    consistency: 90,
    durationMs,
    charStats: { correct, incorrect: 0, extra: 0, missed: 0 },
    punctuation: false,
    numbers: false,
  };
};

const EXPORT_HEADER =
  'createdAt,mode,mode2,language,wpm,rawWpm,accuracy,consistency,durationMs,correct,incorrect,extra,missed,punctuation,numbers';

describe('insights, achievements and export (e2e)', () => {
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

  it('reports insights, a public profile and exports for a user with results', async () => {
    const server = app.getHttpServer();
    const reg = await request(server)
      .post('/api/auth/register')
      .send({ name: 'insight_user', email: EMAIL, password: 'a-good-password' })
      .expect(201);
    const cookie = cookieFrom(reg);

    await request(server).post('/api/results').set('Cookie', cookie).send(result('time', '30', 80, 30_000)).expect(201);
    await request(server).post('/api/results').set('Cookie', cookie).send(result('words', '25', 60, 30_000)).expect(201);
    await request(server).post('/api/results').set('Cookie', cookie).send(result('pangram', '1', 90, 30_000)).expect(201);

    // Insights: today's streak, the histogram and the achievements unlocked by the first results.
    const insights = await request(server).get('/api/results/me/insights').set('Cookie', cookie).expect(200);
    expect(insights.body.streak).toEqual({ current: 1, longest: 1 });
    expect(insights.body.activity).toEqual([{ date: utcDate(0), tests: 3 }]);
    expect(insights.body.histogram).toEqual([
      { from: 60, count: 1 },
      { from: 80, count: 1 },
      { from: 90, count: 1 },
    ]);
    expect(insights.body.byHour).toHaveLength(24);
    const ids = insights.body.achievements.map((a: { id: string }) => a.id).sort();
    expect(ids).toEqual(['first_test', 'wpm_60', 'wpm_80']);
    for (const a of insights.body.achievements as Array<{ unlockedAt: string }>) {
      expect(a.unlockedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }

    // The insights need a login.
    await request(server).get('/api/results/me/insights').expect(401);

    // The public profile carries streak, achievements and activity, and never the email.
    const profile = await request(server).get('/api/users/INSIGHT_USER').expect(200);
    expect(profile.body.streak).toEqual({ current: 1, longest: 1 });
    expect(profile.body.achievements.map((a: { id: string }) => a.id)).toContain('first_test');
    expect(profile.body.activity).toEqual([{ date: utcDate(0), tests: 3 }]);
    expect(profile.body).not.toHaveProperty('email');
    expect(JSON.stringify(profile.body)).not.toContain(EMAIL);

    // CSV: attachment header, the header row, then one row per result.
    const csv = await request(server)
      .get('/api/results/me/export?format=csv')
      .set('Cookie', cookie)
      .expect(200);
    expect(csv.headers['content-type']).toMatch(/^text\/csv/);
    expect(csv.headers['content-disposition']).toBe('attachment; filename="parrotype-results.csv"');
    const lines = csv.text.split('\r\n');
    expect(lines[lines.length - 1]).toBe('');
    expect(lines[0]).toBe(EXPORT_HEADER);
    expect(lines).toHaveLength(1 + 3 + 1);
    expect(lines[1]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z,time,30,en,80,85,97.5,90,30000,/);

    // JSON: parses to the same rows, with the same field names.
    const json = await request(server)
      .get('/api/results/me/export?format=json')
      .set('Cookie', cookie)
      .expect(200);
    expect(json.headers['content-type']).toMatch(/^application\/json/);
    expect(json.headers['content-disposition']).toBe('attachment; filename="parrotype-results.json"');
    expect(json.body).toHaveLength(3);
    expect(Object.keys(json.body[0])).toEqual(EXPORT_HEADER.split(','));
    expect(json.body.map((r: { mode: string }) => r.mode)).toEqual(['time', 'words', 'pangram']);

    // An unknown format is a 400, and the export needs a login.
    await request(server).get('/api/results/me/export?format=xml').set('Cookie', cookie).expect(400);
    await request(server).get('/api/results/me/export').expect(401);
  });

  it('reports empty insights for a user with no results', async () => {
    const server = app.getHttpServer();
    const reg = await request(server)
      .post('/api/auth/register')
      .send({ name: 'insight_empty', email: 'empty@example.com', password: 'a-good-password' })
      .expect(201);

    const insights = await request(server)
      .get('/api/results/me/insights')
      .set('Cookie', cookieFrom(reg))
      .expect(200);
    expect(insights.body).toEqual({
      streak: { current: 0, longest: 0 },
      activity: [],
      histogram: [],
      byHour: expect.any(Array),
      achievements: [],
    });
    expect(insights.body.byHour).toHaveLength(24);
  });
});
