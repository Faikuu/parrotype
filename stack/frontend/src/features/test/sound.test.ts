import { playKeySound, resetSoundForTests } from './sound';

afterEach(() => {
  resetSoundForTests();
  vi.unstubAllGlobals();
});

describe('playKeySound', () => {
  it('does not throw when AudioContext is missing (jsdom)', () => {
    expect(typeof window.AudioContext).toBe('undefined');
    expect(() => playKeySound({ profile: 'click', volume: 0.5, kind: 'key' })).not.toThrow();
    expect(() => playKeySound({ profile: 'typewriter', volume: 1, kind: 'space', error: true })).not.toThrow();
  });

  it('does nothing for the off profile or zero volume', () => {
    const ctor = vi.fn();
    vi.stubGlobal('AudioContext', ctor);
    playKeySound({ profile: 'off', volume: 1, kind: 'key' });
    playKeySound({ profile: 'soft', volume: 0, kind: 'key' });
    expect(ctor).not.toHaveBeenCalled();
  });

  it('creates the context lazily, on the first sound that plays', () => {
    const ctor = vi.fn(function FakeAudio() {
      return fakeContext();
    });
    vi.stubGlobal('AudioContext', ctor);
    expect(ctor).not.toHaveBeenCalled();
    playKeySound({ profile: 'soft', volume: 0.5, kind: 'key' });
    playKeySound({ profile: 'soft', volume: 0.5, kind: 'key' });
    expect(ctor).toHaveBeenCalledTimes(1);
  });

  it('swallows errors from the audio graph', () => {
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function Broken() {
        throw new Error('blocked');
      }),
    );
    expect(() => playKeySound({ profile: 'click', volume: 0.5, kind: 'key' })).not.toThrow();
  });
});

/** A Web Audio node that records its connections and disconnects. */
class RecordingNode {
  connections: unknown[] = [];
  disconnects = 0;
  onended: (() => void) | null = null;
  type = '';
  buffer: unknown = null;
  gain = { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
  frequency = { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
  Q = { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
  start = vi.fn();
  stop = vi.fn();
  connect(dest: unknown): unknown {
    this.connections.push(dest);
    return dest;
  }
  disconnect(): void {
    this.disconnects += 1;
    this.connections = [];
  }
}

/** A context that keeps every gain node and source it creates, so tests can end sources by hand. */
function recordingContext() {
  const gains: RecordingNode[] = [];
  const sources: RecordingNode[] = [];
  const destination = new RecordingNode();
  const ctx = {
    state: 'running',
    sampleRate: 8000,
    currentTime: 0,
    destination,
    resume: vi.fn(async () => undefined),
    createGain: () => {
      const node = new RecordingNode();
      gains.push(node);
      return node;
    },
    createBiquadFilter: () => new RecordingNode(),
    createBuffer: (_c: number, length: number) => ({ getChannelData: () => new Float32Array(length), sampleRate: 8000 }),
    createBufferSource: () => {
      const node = new RecordingNode();
      sources.push(node);
      return node;
    },
    createOscillator: () => {
      const node = new RecordingNode();
      sources.push(node);
      return node;
    },
  };
  return { ctx, gains, sources, destination };
}

describe('playKeySound output node', () => {
  it('disconnects the keystroke output once its only source ends', () => {
    const { ctx, gains, sources, destination } = recordingContext();
    vi.stubGlobal('AudioContext', vi.fn(function Fake() { return ctx; }));
    playKeySound({ profile: 'click', volume: 0.5, kind: 'key' });

    const out = gains[0]!;
    expect(out.connections).toContain(destination);
    expect(out.disconnects).toBe(0);
    sources[0]!.onended?.();
    expect(out.disconnects).toBe(1);
  });

  it('waits for the last of several sources before disconnecting', () => {
    const { ctx, gains, sources } = recordingContext();
    vi.stubGlobal('AudioContext', vi.fn(function Fake() { return ctx; }));
    playKeySound({ profile: 'typewriter', volume: 0.5, kind: 'key' });

    expect(sources).toHaveLength(2);
    const out = gains[0]!;
    sources[0]!.onended?.();
    expect(out.disconnects).toBe(0);
    sources[1]!.onended?.();
    expect(out.disconnects).toBe(1);
  });

  it('gives each keystroke its own output node, disconnected separately', () => {
    const { ctx, gains, sources, destination } = recordingContext();
    vi.stubGlobal('AudioContext', vi.fn(function Fake() { return ctx; }));
    playKeySound({ profile: 'soft', volume: 0.5, kind: 'key' });
    playKeySound({ profile: 'soft', volume: 0.5, kind: 'space' });

    // The output nodes are the gains wired to the destination (the others are envelopes).
    const outs = gains.filter((g) => g.connections.includes(destination));
    expect(outs).toHaveLength(2);
    expect(outs[0]).not.toBe(outs[1]);
    sources[1]!.onended?.();
    expect(outs[1]!.disconnects).toBe(1);
    expect(outs[0]!.disconnects).toBe(0);
  });
});

/** Just enough of the Web Audio graph for the synthesis code to run. */
function fakeContext() {
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  const node = () => ({ connect: vi.fn(function connect(this: unknown) { return this; }), disconnect: vi.fn() });
  return {
    state: 'running',
    sampleRate: 8000,
    currentTime: 0,
    destination: node(),
    resume: vi.fn(async () => undefined),
    createGain: () => ({ ...node(), gain: param() }),
    createBiquadFilter: () => ({ ...node(), type: '', frequency: param(), Q: param() }),
    createBuffer: (_c: number, length: number) => ({ getChannelData: () => new Float32Array(length), sampleRate: 8000 }),
    createBufferSource: () => ({ ...node(), buffer: null, start: vi.fn(), stop: vi.fn() }),
    createOscillator: () => ({ ...node(), type: '', frequency: param(), start: vi.fn(), stop: vi.fn() }),
  };
}
