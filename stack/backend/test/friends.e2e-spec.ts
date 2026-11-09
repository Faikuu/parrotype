import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { applyE2eEnv } from './e2e.env';

// Config is read lazily (getEnv), so setting it here, before the app is built, is enough.
applyE2eEnv();

// Each file runs against a fresh app, so the throttles start at zero: register and login are 10 a minute,
// the global limit is 100 a minute. The boards used here (words/100/es, words/50/pl) are not used elsewhere.
const PASSWORD = 'friends-password-1';

const cookieFrom = (res: request.Response): string => {
  const header = res.headers['set-cookie'];
  const first = Array.isArray(header) ? header[0] : header;
  return String(first).split(';')[0];
};

/** A words result with the given wpm. rawWpm and charStats agree with the duration, so the server accepts it. */
const wordsResult = (wpm: number, mode2 = '100', language = 'es') => ({
  mode: 'words',
  mode2,
  language,
  wpm,
  rawWpm: wpm + 5,
  accuracy: 98,
  consistency: 90,
  durationMs: 60_000,
  charStats: { correct: Math.round((wpm + 5) * 5), incorrect: 0, extra: 0, missed: 0 },
  punctuation: false,
  numbers: false,
});

/** Reads an SVG body as text. supertest only buffers text/* bodies by default. */
const svgText = (req: request.Test): request.Test =>
  req.buffer(true).parse((res, callback) => {
    let data = '';
    res.setEncoding('utf8');
    res.on('data', (chunk: string) => {
      data += chunk;
    });
    res.on('end', () => callback(null, data));
  });

describe('friends, the following scope, badges and code results (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
    configureApp(app);
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  async function register(name: string): Promise<string> {
    const res = await request(server)
      .post('/api/auth/register')
      .send({ name, email: `${name}@example.com`, password: PASSWORD })
      .expect(201);
    return cookieFrom(res);
  }

  async function submit(cookie: string, body: object): Promise<void> {
    await request(server).post('/api/results').set('Cookie', cookie).send(body).expect(201);
  }

  let alice: string;
  let bob: string;
  let carol: string;

  beforeAll(async () => {
    alice = await register('fr_alice');
    bob = await register('fr_bob');
    carol = await register('fr_carol');
    await submit(alice, wordsResult(70));
    await submit(bob, wordsResult(90));
    await submit(carol, wordsResult(80));
  });

  it('shows the permissions on the session user (none, by default)', async () => {
    const me = await request(server).get('/api/auth/me').set('Cookie', alice).expect(200);
    expect(me.body.user).toMatchObject({ name: 'fr_alice', permissions: [] });
    expect(me.body.user).not.toHaveProperty('role');
  });

  describe('follow and unfollow', () => {
    it('follows idempotently and reports the state', async () => {
      await request(server).put('/api/users/fr_bob/follow').set('Cookie', alice).expect(200, { following: true });
      await request(server).put('/api/users/fr_bob/follow').set('Cookie', alice).expect(200, { following: true });
    });

    it('refuses to follow yourself (400), anonymous callers (401) and unknown names (404)', async () => {
      const self = await request(server).put('/api/users/fr_alice/follow').set('Cookie', alice).expect(400);
      expect(self.body.message).toBe("You can't follow yourself");
      await request(server).put('/api/users/fr_bob/follow').expect(401);
      const unknown = await request(server).put('/api/users/fr_nobody/follow').set('Cookie', alice).expect(404);
      expect(unknown.body.message).toBe('No user with that name');
    });

    it('shows the counts on profiles, and isFollowing only to the signed-in follower', async () => {
      const asAlice = await request(server).get('/api/users/fr_bob').set('Cookie', alice).expect(200);
      expect(asAlice.body).toMatchObject({ name: 'fr_bob', followers: 1, following: 0, isFollowing: true });

      const anon = await request(server).get('/api/users/fr_bob').expect(200);
      expect(anon.body).toMatchObject({ followers: 1, isFollowing: false });

      const own = await request(server).get('/api/users/fr_alice').set('Cookie', alice).expect(200);
      expect(own.body).toMatchObject({ followers: 0, following: 1, isFollowing: false });
    });

    it('scope=following needs a session, and covers the viewer and the people they follow', async () => {
      await request(server).get('/api/leaderboard?mode=words&mode2=100&language=es&scope=following').expect(401);

      const everyone = await request(server).get('/api/leaderboard?mode=words&mode2=100&language=es').expect(200);
      expect(everyone.body.map((e: { name: string }) => e.name)).toEqual(
        expect.arrayContaining(['fr_alice', 'fr_bob', 'fr_carol']),
      );

      const friends = await request(server)
        .get('/api/leaderboard?mode=words&mode2=100&language=es&scope=following')
        .set('Cookie', alice)
        .expect(200);
      expect(friends.body).toEqual([
        expect.objectContaining({ rank: 1, name: 'fr_bob', wpm: 90 }),
        expect.objectContaining({ rank: 2, name: 'fr_alice', wpm: 70 }),
      ]);
    });

    it('unfollows idempotently and drops the person from the following board', async () => {
      await request(server).delete('/api/users/fr_bob/follow').set('Cookie', alice).expect(200, { following: false });
      await request(server).delete('/api/users/fr_bob/follow').set('Cookie', alice).expect(200, { following: false });
      await request(server).delete('/api/users/fr_bob/follow').expect(401);

      const friends = await request(server)
        .get('/api/leaderboard?mode=words&mode2=100&language=es&scope=following')
        .set('Cookie', alice)
        .expect(200);
      expect(friends.body.map((e: { name: string }) => e.name)).toEqual(['fr_alice']);
      const profile = await request(server).get('/api/users/fr_bob').set('Cookie', alice).expect(200);
      expect(profile.body).toMatchObject({ followers: 0, isFollowing: false });
    });
  });

  describe('profile badge', () => {
    it('serves a 404 "no result" svg with the badge headers when there is no matching result', async () => {
      const res = await svgText(request(server).get('/api/users/fr_bob/badge.svg?mode=words&mode2=50&language=pl')).expect(404);
      expect(res.headers['content-type']).toBe('image/svg+xml; charset=utf-8');
      expect(res.body).toContain('no result');
      // A missing result is not cached: it can become a real badge once the user plays.
      expect(res.headers['cache-control']).toBe('no-cache');
      expect(res.body.startsWith('<svg')).toBe(true);
    });

    it('serves the best wpm as an svg with the exact headers, and escapes its text', async () => {
      await submit(bob, wordsResult(77.4, '50', 'pl'));
      const res = await svgText(request(server).get('/api/users/fr_bob/badge.svg?mode=words&mode2=50&language=pl')).expect(200);

      expect(res.headers['content-type']).toBe('image/svg+xml; charset=utf-8');
      expect(res.headers['cache-control']).toBe('public, max-age=600');
      expect(res.headers['content-security-policy']).toBe("default-src 'none'; style-src 'unsafe-inline'");
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
      expect(res.body).toContain('>parrotype</text>');
      expect(res.body).toContain('77 wpm · words 50');
      expect(res.body).not.toMatch(/<script/i);
    });

    it('defaults to time 60 in English, and 404s for an unknown user', async () => {
      // bob has no time 60 result in English: a neutral 404 badge, not an error.
      const none = await svgText(request(server).get('/api/users/fr_bob/badge.svg')).expect(404);
      expect(none.body).toContain('no result');

      const unknown = await svgText(request(server).get('/api/users/fr_nobody/badge.svg?mode=words&mode2=50&language=pl')).expect(404);
      expect(unknown.body).toContain('no result');
    });

    it('refuses an unranked filter with 400, the same rule as the leaderboard', async () => {
      await request(server).get('/api/users/fr_bob/badge.svg?mode=zen&mode2=zen').expect(400);
      await request(server).get('/api/users/fr_bob/badge.svg?mode=words&mode2=60').expect(400);
    });
  });

  describe('code mode results', () => {
    it('saves a code result (mode2 js) and lists it for its owner', async () => {
      await request(server)
        .post('/api/results')
        .set('Cookie', carol)
        .send({ ...wordsResult(60, 'js', 'en'), mode: 'code' })
        .expect(201);
      const mine = await request(server).get('/api/results/me').set('Cookie', carol).expect(200);
      expect(mine.body[0]).toMatchObject({ mode: 'code', mode2: 'js', language: 'en' });
    });

    it('refuses other code languages and other UI languages', async () => {
      await request(server)
        .post('/api/results')
        .set('Cookie', carol)
        .send({ ...wordsResult(60, 'c', 'en'), mode: 'code' })
        .expect(400);
      await request(server)
        .post('/api/results')
        .set('Cookie', carol)
        .send({ ...wordsResult(60, 'py', 'pl'), mode: 'code' })
        .expect(400);
    });

    it('is not ranked: the leaderboard refuses it, and the profile bests leave it out', async () => {
      const board = await request(server).get('/api/leaderboard?mode=code&mode2=js&language=en').expect(400);
      expect(board.body.message).toEqual(['mode: zen, custom, weak and code results are not ranked']);

      // carol's words result counts; the code result is in the total but not in the bests.
      const profile = await request(server).get('/api/users/fr_carol').expect(200);
      expect(profile.body.bests.map((b: { mode: string }) => b.mode)).toEqual(['words']);
      expect(profile.body.totalTests).toBe(2);
    });
  });
});
