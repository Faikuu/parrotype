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
