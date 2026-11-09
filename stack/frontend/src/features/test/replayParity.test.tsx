/**
 * Frontend/backend parity: a test typed through the real hook at a human pace (with typos and backspaces) must
 * come out verified. The submit request is answered by the backend's own verifier (replay-verify.ts, imported
 * only here), so a payload the server would reject fails this test.
 */
import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRng } from '@/lib/text/rng';
import { DEFAULT_SETTINGS, useSettings, type SettingsData } from '@/store/settings';
import { useUi } from '@/store/ui';
import { nextCharOf } from './nextChar';
import { useTypingTest, type TypingTest } from './useTypingTest';

type Body = { mode: string; mode2: string; language: string; replay?: BackendReplay } & Record<string, unknown>;
type BackendReplay = { v: 1; words: string[]; events: Array<{ t: number; k: string; ch?: string }>; code?: { breaks: boolean[]; indent: number[] } };
interface BackendVerify {
  matchReplay: (input: Record<string, unknown>, replay: BackendReplay) => { matched: boolean; fields: string[] };
}

/**
 * The backend's replay-verify module. It is loaded at run time, not imported: the frontend program must not
 * type-check the backend's sources (they are built with other settings), and the module needs only the engine.
 */
const BACKEND_VERIFY = '../../../../backend/src/results/replay-verify';
let backendVerify: BackendVerify;
beforeAll(async () => {
  backendVerify = (await import(/* @vite-ignore */ BACKEND_VERIFY)) as BackendVerify;
});

const USER = { id: 1, name: 'typist', email: 't@example.com', permissions: [], createdAt: '2026-01-01T00:00:00Z' };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

interface Server {
  bodies: Body[];
  /** Answers the submit like the backend: 400 when the replay does not reproduce the stats. */
  fetch: ReturnType<typeof vi.fn>;
}

/** The API stub: the signed-in user, and POST /results verified by the backend's matchReplay. */
function serverWith(tamper?: (body: Body) => void): Server {
  const bodies: Body[] = [];
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith('/auth/me')) return json(200, { user: USER });
    if (u.endsWith('/results') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as Body;
      if (tamper) tamper(body);
      bodies.push(body);
      if (!body.replay) return json(201, { id: 1, verified: false });
      // The server's own check: the same function the backend runs on submit.
      const verdict = backendVerify.matchReplay(body, body.replay!);
      if (!verdict.matched) return json(400, { statusCode: 400, message: "The result doesn't match its keystrokes" });
      return json(201, { id: 1, verified: true, mode: body.mode, mode2: body.mode2, createdAt: new Date().toISOString() });
    }
    return json(404, { statusCode: 404, message: 'Not Found' });
  });
  return { bodies, fetch };
}

/** A key event as the test input's onKeyDown reads it (Backspace goes through the hook's key handler). */
function keyEvent(key: string) {
  return {
    key,
    keyCode: key === 'Backspace' ? 8 : 0,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    nativeEvent: { code: key, isComposing: false, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false },
    preventDefault: () => undefined,
  } as unknown as Parameters<TypingTest['onKeyDown']>[0];
}

interface TypeOptions {
  seed: number;
  /** Chance of a wrong letter before each correct one (corrected with backspace unless stopOnError is 'letter'). */
  typoRate: number;
}

/**
 * Types the test the way a person would: a key every 90 to 240 ms, with typos corrected by backspace. Runs until the
 * test has finished (its own rules: the last word, or the timer). The timers are fake, so the ticks run on time too.
 */
async function typeUntilFinished(result: { current: TypingTest }, { seed, typoRate }: TypeOptions) {
  const rng = createRng(seed);
  const pause = async () => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(90 + Math.floor(rng() * 150));
    });
  };
  const type = (ch: string) => act(() => result.current.typeText(ch));
  const stopOnError = useSettings.getState().stopOnError;

  for (let guard = 0; guard < 20_000 && result.current.state.status !== 'finished'; guard++) {
    const s = result.current.state;
    const word = s.words[s.current] ?? '';
    const typed = s.typed[s.current] ?? '';
    const atLineEnd = s.config.mode === 'code' && s.code?.breaks[s.current] === true && typed.length === word.length;
    const next = atLineEnd ? '\n' : nextCharOf(s);
    if (next === null) {
      await pause();
      continue;
    }
    if (next !== ' ' && next !== '\n' && rng() < typoRate) {
      const wrong = next === 'q' ? 'w' : 'q';
      await type(wrong);
      await pause();
      if (stopOnError !== 'letter') {
        act(() => {
          result.current.onKeyDown(keyEvent('Backspace'));
        });
        await pause();
      }
    }
    await type(next);
    await pause();
  }
  // Let the save settle: the auth query, then the submit request and its response.
  for (let i = 0; i < 200 && (result.current.saveState.status === 'idle' || result.current.saveState.status === 'saving'); i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date('2026-11-09T12:00:00Z'));
  useUi.setState({ commandLineOpen: false, customTextOpen: false, isTyping: false });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function setup(settings: Partial<SettingsData>, server: Server) {
  vi.stubGlobal('fetch', server.fetch);
  useSettings.setState({ ...DEFAULT_SETTINGS, focusMode: false, ...settings });
  return renderHook(() => useTypingTest(), { wrapper });
}

describe('frontend payload and backend verification agree', () => {
  it('verifies a words-10 test typed with typos', async () => {
    const server = serverWith();
    const { result } = setup({ mode: 'words', words: 10, stopOnError: 'off' }, server);
    await typeUntilFinished(result, { seed: 11, typoRate: 0.06 });

    expect(result.current.state.status).toBe('finished');
    expect(result.current.saveState).toEqual({ status: 'saved', verified: true });
    const body = server.bodies[0]!;
    expect(body.mode).toBe('words');
    expect(body.mode2).toBe('10');
    expect(body.replay?.v).toBe(1);
    expect(body.replay?.words.length).toBe(10);
    expect(body.replay?.events.length).toBeGreaterThan(40);
    expect(body.replay?.events[0]).toMatchObject({ t: 0, k: 'c' });
  });

  it('verifies a time-15 test, with the words it appended while typing', async () => {
    const server = serverWith();
    const { result } = setup({ mode: 'time', time: 15, stopOnError: 'off' }, server);
    await typeUntilFinished(result, { seed: 23, typoRate: 0.05 });

    expect(result.current.state.status).toBe('finished');
    expect(result.current.result?.durationMs).toBe(15_000);
    expect(result.current.saveState).toEqual({ status: 'saved', verified: true });
    const body = server.bodies[0]!;
    expect(body.mode2).toBe('15');
    // The server replays the whole word list: it must include the words appended during the test.
    expect(body.replay!.words.length).toBeGreaterThan(40);
  });

  it('verifies a code test, with its line breaks and indentation', async () => {
    const server = serverWith();
    const { result } = setup({ mode: 'code', codeLanguage: 'py', language: 'pl' }, server);
    await typeUntilFinished(result, { seed: 37, typoRate: 0.04 });

    expect(result.current.state.status).toBe('finished');
    expect(result.current.saveState).toEqual({ status: 'saved', verified: true });
    const body = server.bodies[0]!;
    expect(body.mode).toBe('code');
    expect(body.mode2).toBe('py');
    expect(body.language).toBe('en');
    expect(body.replay?.code?.breaks.length).toBe(body.replay?.words.length);
    expect(body.replay?.code?.indent.length).toBe(body.replay?.words.length);
  });

  it('verifies a words test with stop on error set to letter (wrong letters are not inserted)', async () => {
    const server = serverWith();
    const { result } = setup({ mode: 'words', words: 10, stopOnError: 'letter' }, server);
    await typeUntilFinished(result, { seed: 41, typoRate: 0.08 });

    expect(result.current.state.status).toBe('finished');
    expect(result.current.saveState).toEqual({ status: 'saved', verified: true });
  });

  it('reports a rejected result when the replay does not match its stats', async () => {
    // A replay whose keystrokes are shifted in time no longer reproduces the stats: the server answers 400.
    const server = serverWith((body) => {
      if (body.replay) body.replay.events = body.replay.events.slice(3);
    });
    const { result } = setup({ mode: 'words', words: 10, stopOnError: 'off' }, server);
    await typeUntilFinished(result, { seed: 53, typoRate: 0.02 });

    expect(result.current.saveState).toEqual({ status: 'rejected', message: "The result doesn't match its keystrokes" });
  });
});
