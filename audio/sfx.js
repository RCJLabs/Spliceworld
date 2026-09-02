// Audio stingers (M7). Hand-rolled WebAudio synth instead of vendoring
// ZzFX: same few-bytes-of-joy goal, zero third-party code, no build step.
// Every call is safe to fail silently — audio must never break the game.
// The AudioContext is created lazily on the first user gesture (autoplay
// policy) by calling initAudio() from a pointerdown handler.

let ctx = null;
let muted = false;

export function initAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch { /* no audio hardware / blocked — the kazoo remains imaginary */ }
}

export function setMuted(m) {
  muted = m;
}

// One voice: type, frequency glide, duration, volume envelope.
function voice({ type = 'square', from = 440, to = from, at = 0, dur = 0.15, vol = 0.12 }) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const t0 = ctx.currentTime + at;
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
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

// R59 — the game was scored for its fights and silent everywhere else.
// Fifteen call sites, NINE of them in battle/ui.js: taking a node, a
// counter-offensive landing on one you hold, a job coming back and a
// resequenced donor decanting all happened without a sound.
//
// The mapper lives here rather than being sprinkled across four screens,
// because "what deserves a sound" is one decision and four copies of it
// drift. It reads a snapshot of scalars, so it is DOM-free and the suite can
// assert every cue without a browser or an AudioContext.
//
// The rule these four share: a sound marks a change in your POSITION —
// something arrived, completed, or was taken from you. Navigation and taps
// are not events; the game already has one `click` and does not need more.
export function watchSignals(state) {
  return {
    nodes: state?.campaign?.heldNodes?.length ?? 0,
    contested: state?.campaign?.contested?.length ?? 0,
    report: state?.campaign?.opReport ? 1 : 0,
    stock: state?.ranch?.stock?.length ?? 0,
    resequencing: state?.resequencer ? 1 : 0,
  };
}

export function cuesFor(before, after) {
  if (!before || !after) return [];
  const cues = [];
  // The alarm comes first because it is the only one with a deadline: a
  // contested node is lost if it is not defended in its window.
  if (after.contested > before.contested) cues.push('alarm');
  if (after.nodes > before.nodes) cues.push('conquest');
  if (after.report > before.report) cues.push('report');
  // A run that ended WITH an animal arriving decanted; one that ended
  // without is an abort, which the player did on purpose and already saw.
  if (before.resequencing && !after.resequencing && after.stock > before.stock) cues.push('decant');
  return cues;
}

export function play(name) {
  if (muted || !ctx || !STINGERS[name]) return;
  try {
    if (ctx.state === 'suspended') ctx.resume();
    for (const v of STINGERS[name]) voice(v);
  } catch { /* stay silent, stay alive */ }
}
