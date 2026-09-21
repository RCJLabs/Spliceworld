// Audio stingers (M7). Hand-rolled WebAudio synth instead of vendoring
// ZzFX: same few-bytes-of-joy goal, zero third-party code, no build step.
// Every call is safe to fail silently — audio must never break the game.
// The AudioContext is created lazily on the first user gesture (autoplay
// policy) by calling initAudio() from a pointerdown handler.

let ctx = null;
let muted = false;
// R111 — `muted` was the whole surface until this milestone. See voice.md.
let volume = 1;
let ambience = true;
let haptics = true;

export function initAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch { /* no audio hardware / blocked — the kazoo remains imaginary */ }
}

export function setMuted(m) {
  muted = m;
  if (muted) stopAmbience();
}

// R111 — one call from the shell and the settings panel, so a preference
// cannot be applied in one and forgotten in the other. It DELEGATES the mute
// rather than restating what one does.
export function applyAudioSettings(settings = {}) {
  setMuted(!!settings.muted);
  volume = Number.isFinite(settings.volume) ? Math.min(Math.max(settings.volume, 0), 1) : 1;
  ambience = settings.ambience !== false;
  haptics = settings.haptics !== false;
  if (!ambience) stopAmbience();
}

// One voice: type, frequency glide, duration, volume envelope.
function voice({ type = 'square', from = 440, to = from, at = 0, dur = 0.15, vol = 0.12, mod = 0 }) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const t0 = ctx.currentTime + at;
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
  // R111 — the organ's wobble: on the FREQUENCY, not the gain, so it reads as
  // a voice catching rather than a tremolo laid over one.
  if (mod > 0) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.setValueAtTime(6, t0);
    depth.gain.setValueAtTime(mod, t0);
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(t0);
    lfo.stop(t0 + dur + 0.02);
  }
  // R111 — one place every sound passes through, so a stinger added later
  // cannot forget to be quiet. The floor keeps the ramp below legal.
  const level = Math.max(0.0001, vol * volume);
  gain.gain.setValueAtTime(level, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const STINGERS = {
  click: [{ type: 'triangle', from: 660, to: 550, dur: 0.05, vol: 0.05 }],
  splice: [
    { type: 'sawtooth', from: 120, to: 880, dur: 0.25, vol: 0.1 },
    { type: 'square', from: 880, to: 1320, at: 0.22, dur: 0.12, vol: 0.08 },
  ],
  graduate: [
    // flash, kazoo(ish), poof
    { type: 'square', from: 520, to: 540, dur: 0.12, vol: 0.09 },
    { type: 'square', from: 540, to: 500, at: 0.12, dur: 0.14, vol: 0.09 },
    { type: 'sawtooth', from: 700, to: 90, at: 0.3, dur: 0.35, vol: 0.1 },
  ],
  hatch: [
    { type: 'triangle', from: 900, to: 1400, dur: 0.1, vol: 0.09 },
    { type: 'triangle', from: 1100, to: 1700, at: 0.12, dur: 0.12, vol: 0.09 },
  ],
  win: [
    { type: 'square', from: 523, dur: 0.12, vol: 0.09 },
    { type: 'square', from: 659, at: 0.12, dur: 0.12, vol: 0.09 },
    { type: 'square', from: 784, at: 0.24, dur: 0.12, vol: 0.09 },
    { type: 'square', from: 1046, at: 0.36, dur: 0.28, vol: 0.1 },
  ],
  lose: [
    { type: 'sawtooth', from: 300, to: 110, dur: 0.5, vol: 0.09 },
    { type: 'sawtooth', from: 150, to: 60, at: 0.4, dur: 0.5, vol: 0.08 },
  ],
  // Combat beats (battle overhaul): one voice each, so a long round of
  // playback stays a rhythm section rather than an argument.
  hit: [{ type: 'square', from: 260, to: 90, dur: 0.09, vol: 0.09 }],
  bigHit: [
    { type: 'sawtooth', from: 340, to: 70, dur: 0.16, vol: 0.12 },
    { type: 'square', from: 180, to: 60, at: 0.04, dur: 0.14, vol: 0.07 },
  ],
  weakHit: [{ type: 'triangle', from: 200, to: 140, dur: 0.08, vol: 0.05 }],
  miss: [{ type: 'triangle', from: 520, to: 900, dur: 0.09, vol: 0.05 }],
  buff: [{ type: 'triangle', from: 440, to: 880, dur: 0.12, vol: 0.06 }],
  debuff: [{ type: 'triangle', from: 520, to: 220, dur: 0.14, vol: 0.06 }],
  ko: [
    { type: 'sawtooth', from: 300, to: 60, dur: 0.3, vol: 0.1 },
    { type: 'square', from: 150, to: 50, at: 0.1, dur: 0.25, vol: 0.06 },
  ],
  waveIn: [{ type: 'square', from: 300, to: 620, dur: 0.13, vol: 0.07 }],
  // R59 — the four moments outside the arena.
  alarm: [
    { type: 'sawtooth', from: 520, to: 300, dur: 0.18, vol: 0.10 },
    { type: 'sawtooth', from: 520, to: 300, at: 0.22, dur: 0.18, vol: 0.10 },
  ],
  conquest: [
    { type: 'square', from: 330, to: 494, dur: 0.12, vol: 0.09 },
    { type: 'square', from: 494, to: 660, at: 0.11, dur: 0.16, vol: 0.09 },
    { type: 'triangle', from: 660, to: 990, at: 0.24, dur: 0.22, vol: 0.07 },
  ],
  report: [
    { type: 'triangle', from: 880, to: 1180, dur: 0.09, vol: 0.06 },
    { type: 'triangle', from: 1180, to: 1320, at: 0.10, dur: 0.12, vol: 0.05 },
  ],
  decant: [
    { type: 'sine', from: 180, to: 520, dur: 0.30, vol: 0.09 },
    { type: 'square', from: 700, to: 520, at: 0.30, dur: 0.10, vol: 0.07 },
  ],
  capture: [
    { type: 'sine', from: 80, to: 40, dur: 0.3, vol: 0.16 },
    { type: 'triangle', from: 1200, to: 2000, at: 0.28, dur: 0.1, vol: 0.07 },
  ],
};

// R59 — the mapper lives here rather than across four screens, because "what
// deserves a sound" is one decision and four copies of it drift. A snapshot of
// scalars, so it is DOM-free and the suite asserts every cue without a browser.
//
// R111 — A TONE AS WELL AS A NAME, because a creature's voice is built rather
// than written down. `speak` hands its tone here instead of growing a door of
// its own: R59's "exactly one function reaches the synth" is what stops a new
// sound arriving with its own path around the mute.
export function play(name) {
  const tones = typeof name === 'string' ? STINGERS[name] : name;
  if (muted || !ctx || !tones) return;
  try {
    if (ctx.state === 'suspended') ctx.resume();
    for (const v of tones) voice(v);
  } catch { /* stay silent, stay alive */ }
}

// R111 — the room tone and the buzz are in `audio/room.js`, lazily; that file
// says why. What stays here is the JUDGEMENT of whether a sound is allowed at
// all, so the mute keeps one home.
//
// WRITTEN AS A DIRECT DYNAMIC IMPORT WITH A DESTRUCTURED THEN, THREE TIMES. The
// orphan gate scans for that exact shape; `await import()` into a variable is
// invisible to it, and so is a `room()` helper that returns the promise —
// both were tried, and both had it report a live export dead. No cache here
// either: a repeated dynamic import of one specifier is already one fetch and
// one module instance, so a cache would only have hidden the shape the gate
// reads. `everStarted` exists so a stop never fetches a file to discover
// there is no bed.
let everStarted = false;

export function stopAmbience() {
  if (!everStarted) return;
  import('./room.js').then(({ stopAmbience: stop }) => stop()).catch(() => {});
}

export function startAmbience(screen, content) {
  if (muted || !ambience || !ctx) return Promise.resolve();
  everStarted = true;
  return import('./room.js')
    .then(({ startAmbience: start }) => start(ctx, screen, content, volume))
    .catch(() => { /* no bed today; the game is unchanged */ });
}

export function buzz(kind, content) {
  if (!haptics || muted) return Promise.resolve();
  return import('./room.js')
    .then(({ buzz: fire }) => fire(kind, content))
    .catch(() => { /* not every device shakes */ });
}

// R111 — the creature itself. `audio/voice.js` is lazy for the same reason as
// the room: nothing has a voice before something is on a screen.
export async function speak(chimera, content, kind = 'tap') {
  if (muted || !ctx || !chimera) return;
  try {
    const { voiceSpec, voiceTone } = await import('./voice.js');
    play([voiceTone(voiceSpec(chimera, content, kind))]);
  } catch { /* stay silent, stay alive */ }
}
