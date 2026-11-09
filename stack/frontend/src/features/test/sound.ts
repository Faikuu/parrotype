import type { SoundProfile } from '@/store/settings';

/*
 * Typing sounds, synthesised with Web Audio (no audio files).
 *
 * The AudioContext is created lazily on the first played sound. Sounds are only played from keystrokes,
 * which are user gestures, so browsers allow the context to start. Audio is optional: when there is no
 * AudioContext (jsdom, old browsers) or it throws, the sound is silently skipped.
 */

export type SoundKind = 'key' | 'space' | 'backspace';

export interface KeySoundOptions {
  profile: SoundProfile;
  /** 0–1 */
  volume: number;
  kind: SoundKind;
  /** Wrong letter: a slightly detuned variant of the profile. */
  error?: boolean;
}

type AudioCtor = new () => AudioContext;

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function audioCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & { webkitAudioContext?: AudioCtor; AudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** The shared context, created on first use. Returns null when Web Audio is unavailable. */
function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = audioCtor();
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

/** Half a second of white noise, reused by every noise burst. */
function noiseBuffer(c: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === c.sampleRate) return noise;
  const length = Math.floor(c.sampleRate * 0.5);
  const buffer = c.createBuffer(1, length, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  noise = buffer;
  return buffer;
}

function burst(
  c: AudioContext,
  out: AudioNode,
  t: number,
  opts: { freq: number; q: number; decay: number; peak: number },
): AudioScheduledSourceNode {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = opts.freq;
  filter.Q.value = opts.q;
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(opts.peak, t + 0.002);
  env.gain.exponentialRampToValueAtTime(0.0001, t + opts.decay);
  src.connect(filter).connect(env).connect(out);
  src.start(t);
  src.stop(t + opts.decay + 0.01);
  return src;
}

function blip(
  c: AudioContext,
  out: AudioNode,
  t: number,
  opts: { freq: number; decay: number; peak: number },
): AudioScheduledSourceNode {
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(opts.freq, t);
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(opts.peak, t + 0.003);
  env.gain.exponentialRampToValueAtTime(0.0001, t + opts.decay);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + opts.decay + 0.01);
  return osc;
}

/** Plays one keystroke sound. Does nothing for profile 'off', zero volume, or without Web Audio. */
export function playKeySound({ profile, volume, kind, error = false }: KeySoundOptions): void {
  if (profile === 'off' || !(volume > 0)) return;
  try {
    const c = context();
    if (!c) return;
    if (c.state === 'suspended') void c.resume().catch(() => undefined);

    // Backspace is quieter, so correcting does not feel like typing.
    const level = Math.min(1, volume) * (kind === 'backspace' ? 0.5 : 1) * 0.4;
    const out = c.createGain();
    out.gain.value = level;
    out.connect(c.destination);

    const t = c.currentTime + 0.005;
    const space = kind === 'space';
    const detune = error ? 0.88 : 1;

    const sources: AudioScheduledSourceNode[] = [];
    switch (profile) {
      case 'click':
        sources.push(burst(c, out, t, { freq: (space ? 1300 : 2400) * detune, q: 1.4, decay: 0.022, peak: 0.9 }));
        break;
      case 'soft':
        sources.push(blip(c, out, t, { freq: (space ? 520 : 760) * detune, decay: 0.06, peak: 0.35 }));
        break;
      case 'typewriter':
        sources.push(burst(c, out, t, { freq: (space ? 2400 : 3200) * detune, q: 0.9, decay: 0.035, peak: 0.7 }));
        sources.push(blip(c, out, t, { freq: (space ? 80 : 110) * detune, decay: 0.07, peak: 0.5 }));
        break;
    }

    // Each keystroke makes its own output node. Disconnect it when its last source ends, so the graph
    // does not pile up on the destination.
    if (sources.length === 0) out.disconnect();
    let live = sources.length;
    for (const source of sources) {
      source.onended = () => {
        live -= 1;
        if (live === 0) out.disconnect();
      };
    }
  } catch {
    // Audio is a nicety: never let it break typing.
  }
}

/** Test hook: forget the shared context so a test can start from nothing. */
export function resetSoundForTests(): void {
  ctx = null;
  noise = null;
}
