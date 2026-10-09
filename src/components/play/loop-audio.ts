/**
 * Seamless looping for music and ambience. A plain <audio loop> leaves a gap or click at the
 * loop point (MP3 padding, and generated tracks rarely end where they start), so looping tracks
 * play through the Web Audio API instead: leading and trailing silence is trimmed, and each pass
 * crossfades into the next with an equal-power curve. Falls back to <audio> if the file can't be
 * decoded (for example a cross-origin link).
 */

export interface Voice {
  setVolume(v: number, seconds?: number): void;
  stop(fadeSeconds?: number): void;
  pause(): void;
  resume(): void;
  readonly paused: boolean;
}

let sharedCtx: AudioContext | null = null;
export function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  sharedCtx ??= new Ctor();
  if (sharedCtx.state === "suspended") void sharedCtx.resume();
  return sharedCtx;
}

// A few decoded tracks stay cached so switching back and forth is instant.
const cache = new Map<string, Promise<AudioBuffer>>();
function decode(ctx: AudioContext, src: string) {
  let p = cache.get(src);
  if (!p) {
    p = fetch(src)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((b) => ctx.decodeAudioData(b));
    p.catch(() => cache.delete(src));
    cache.set(src, p);
    if (cache.size > 6) cache.delete(cache.keys().next().value!);
  }
  return p;
}

/** Where the sound actually starts and ends (ignoring near-silence at either end), in seconds. */
export function audibleRange(buffer: AudioBuffer, threshold = 0.002): { start: number; end: number } {
  const chans = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const loud = (i: number) => chans.some((c) => Math.abs(c[i]!) > threshold);
  const n = buffer.length;
  const maxTrim = Math.min(n, Math.floor(buffer.sampleRate * 3));
  let a = 0;
  while (a < maxTrim && !loud(a)) a++;
  let b = n - 1;
  while (b > n - maxTrim && b > a && !loud(b)) b--;
  if (b - a < buffer.sampleRate) return { start: 0, end: buffer.duration };
  return { start: a / buffer.sampleRate, end: (b + 1) / buffer.sampleRate };
}

function equalPower(steps: number, rising: boolean) {
  const c = new Float32Array(steps);
  for (let i = 0; i < steps; i++) {
    const x = i / (steps - 1);
    c[i] = rising ? Math.sin((x * Math.PI) / 2) : Math.cos((x * Math.PI) / 2);
  }
  return c;
}

class LoopVoice implements Voice {
  private out: GainNode;
  private sources = new Set<AudioBufferSourceNode>();
  private next = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private range: { start: number; end: number };
  private xf: number;
  private volume = 0;
  paused = false;

  constructor(
    private ctx: AudioContext,
    private buffer: AudioBuffer,
    private loop: boolean,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(ctx.destination);
    this.range = audibleRange(buffer);
    const len = this.range.end - this.range.start;
    this.xf = loop ? Math.min(3, Math.max(0.4, len / 8)) : 0;
    this.begin();
  }

  private begin() {
    this.next = this.ctx.currentTime + 0.05;
    this.schedule();
    // Schedule well ahead: background tabs throttle timers to as little as once a minute.
    if (this.loop) this.timer = setInterval(() => this.schedule(), 1000);
  }

  private schedule() {
    const len = this.range.end - this.range.start;
    const horizon = this.loop ? this.ctx.currentTime + 90 : this.next + 1;
    while (this.next < horizon) {
      const t = this.next;
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffer;
      const g = this.ctx.createGain();
      src.connect(g).connect(this.out);
      if (this.loop) {
        g.gain.setValueCurveAtTime(equalPower(64, true), t, this.xf);
        g.gain.setValueCurveAtTime(equalPower(64, false), t + len - this.xf, this.xf);
      }
      src.start(t, this.range.start, len);
      src.stop(t + len + 0.05);
      src.onended = () => this.sources.delete(src);
      this.sources.add(src);
      if (!this.loop) {
        this.next = Number.POSITIVE_INFINITY;
        break;
      }
      this.next = t + len - this.xf;
    }
  }

  private halt() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources.clear();
  }

  setVolume(v: number, seconds = 0.15) {
    this.volume = v;
    if (this.paused) return;
    const now = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(this.out.gain.value, now);
    this.out.gain.linearRampToValueAtTime(v, now + seconds);
  }

  stop(fadeSeconds = 0.6) {
    const now = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(this.out.gain.value, now);
    this.out.gain.linearRampToValueAtTime(0, now + fadeSeconds);
    setTimeout(() => {
      this.halt();
      this.out.disconnect();
    }, fadeSeconds * 1000 + 50);
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    const now = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(this.out.gain.value, now);
    this.out.gain.linearRampToValueAtTime(0, now + 0.3);
    setTimeout(() => this.halt(), 350);
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.begin();
    this.setVolume(this.volume, 0.6);
  }
}

class ElementVoice implements Voice {
  private el: HTMLAudioElement;
  private volume = 0;
  constructor(src: string, loop: boolean) {
    this.el = new Audio(src);
    this.el.loop = loop;
    this.el.volume = 0;
    void this.el.play().catch(() => undefined);
  }
  get paused() {
    return this.el.paused;
  }
  setVolume(v: number, seconds = 0.15) {
    this.volume = v;
    const from = this.el.volume;
    const start = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / (seconds * 1000));
      this.el.volume = Math.max(0, Math.min(1, from + (v - from) * k));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  stop(fadeSeconds = 0.6) {
    this.setVolume(0, fadeSeconds);
    setTimeout(() => this.el.pause(), fadeSeconds * 1000 + 50);
  }
  pause() {
    this.el.pause();
  }
  resume() {
    void this.el.play().catch(() => undefined);
    this.setVolume(this.volume, 0.4);
  }
}

/** Start a track at silence; call setVolume to fade it in. */
export async function startVoice(src: string, loop: boolean): Promise<Voice> {
  const ctx = audioContext();
  if (ctx) {
    try {
      const buffer = await decode(ctx, src);
      return new LoopVoice(ctx, buffer, loop);
    } catch {
      /* fall back to a plain element */
    }
  }
  return new ElementVoice(src, loop);
}
