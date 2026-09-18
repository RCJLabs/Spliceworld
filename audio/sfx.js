// Audio stingers (M7). Hand-rolled WebAudio synth instead of vendoring
// ZzFX: same few-bytes-of-joy goal, zero third-party code, no build step.
// Every call is safe to fail silently — audio must never break the game.
// The AudioContext is created lazily on the first user gesture (autoplay
// policy) by calling initAudio() from a pointerdown handler.

import { mulberry32 } from '../util/rng.js';

let ctx = null;
let muted = false;
// R111 — the whole audio settings surface was `muted` until this milestone.
// `volume` scales every voice, so a player can keep the game and lose the
// loudness; `ambience` and `haptics` gate the two things R111 added, because a
// room tone somebody cannot switch off is worse than no room tone.
let volume = 1;
let ambience = true;
let haptics = true;
let bed = null;

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

// One call from the shell and the settings panel, so a preference cannot be
// applied in one place and forgotten in the other.
//
// It DELEGATES the mute rather than reassigning it, and that is not ceremony:
// the first draft set `muted` here and repeated "muting stops the bed" as its
// own clause, so two places knew what a mute does. `setMuted` stays exported
// because it is still the narrow operation — one preference, one call — and
// R59's gate names it as the path the toggle reaches. The orphan gate caught
// the gap the moment nothing outside this file called it any more.
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
  // R111 — the organ's wobble. A second oscillator on the frequency rather
  // than on the gain, so it reads as a creature's voice catching rather than
  // as a tremolo effect laid over one.
  if (mod > 0) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.setValueAtTime(6, t0);
    depth.gain.setValueAtTime(mod, t0);
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(t0);
    lfo.stop(t0 + dur + 0.02);
  }
  // R111 — every voice passes through the volume the player set. One place,
  // so a stinger added later cannot forget to be quiet.
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

// R111 — AND IT TAKES A TONE AS WELL AS A NAME. A creature's voice is not a
// named stinger: it is built per creature, so the obvious shape was a second
// exported function reaching the oscillator itself. R59's gate refused that
// inside the hour, and rightly — "exactly one function reaches the synth" is
// the rule that stops a new sound arriving with its own path around the mute,
// and a second caller is that bypass whether or not it happens to check.
//
// So `speak` hands its tone HERE rather than growing a door of its own. One
// mute check, one resume, one loop, for every sound this game makes.
export function play(name) {
  const tones = typeof name === 'string' ? STINGERS[name] : name;
  if (muted || !ctx || !tones) return;
  try {
    if (ctx.state === 'suspended') ctx.resume();
    for (const v of tones) voice(v);
  } catch { /* stay silent, stay alive */ }
}

// R111 — THE ROOM, UNDER THE TAPS. The Ranch, Pens, Vault, Theater and Dex
// made no sound at all between one press and the next: sixteen stingers fired
// on events and the rest was silence. A bed is filtered noise at a couple of
// percent — a barn on a windy afternoon, a lab extractor two rooms away — and
// it is the cheapest thing in this file because it is one buffer on a loop.
//
// Under its own toggle, because ambient sound is the setting people turn off
// first and a room tone nobody can stop is worse than no room tone at all.
let noiseBuf = null;
function noise() {
  if (noiseBuf) return noiseBuf;
  const n = Math.floor(ctx.sampleRate * 2);
  noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  // Brownian-ish: a random walk reads warmer than white and costs one add.
  // SEEDED, and not because anything replays it — two seconds of looped hiss
  // is the one place in this repo where nobody could tell. CLAUDE.md's rule
  // has no "unless it does not matter" clause, and a file that keeps one
  // bare `Math.random()` because it seemed harmless is how the next one
  // arrives somewhere that does.
  const rnd = mulberry32(0x5eed);
  let last = 0;
  for (let i = 0; i < n; i++) {
    last = (last + (rnd() * 2 - 1) * 0.08) * 0.985;
    d[i] = last;
  }
  return noiseBuf;
}

export function stopAmbience() {
  if (!bed) return;
  try { bed.src.stop(); } catch { /* already gone */ }
  bed = null;
}

export function startAmbience(screen, content) {
  if (muted || !ambience || !ctx) return;
  const spec = content?.voice?.ambience?.[screen];
  if (!spec) { stopAmbience(); return; }
  if (bed?.screen === screen) return;
  stopAmbience();
  try {
    const src = ctx.createBufferSource();
    const filt = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    src.buffer = noise();
    src.loop = true;
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(spec.cut ?? 500, ctx.currentTime);
    gain.gain.setValueAtTime(Math.max(0.0001, (spec.vol ?? 0.02) * volume), ctx.currentTime);
    src.connect(filt).connect(gain).connect(ctx.destination);
    src.start();
    bed = { screen, src };
  } catch { /* no bed today; the game is unchanged */ }
}

// R111 — HAPTICS, on the three moments that are worth a buzz and no others.
// A KO, a capture and a conquest: each one is a thing the player did or had
// done to them, not a thing they tapped. `navigator.vibrate` is absent on
// desktop and refused inside some iframes, so this never assumes it worked.
export function buzz(kind, content) {
  if (!haptics || muted) return;
  const pattern = content?.voice?.haptics?.[kind];
  if (!pattern) return;
  try { navigator.vibrate?.(pattern); } catch { /* not every device shakes */ }
}

// R111 — AND THE CREATURE ITSELF. The spec comes from `audio/voice.js`, which
// is imported HERE and lazily: nothing has a voice before something is on a
// screen, so the boot graph never sees it.
export async function speak(chimera, content, kind = 'tap') {
  if (muted || !ctx || !chimera) return;
  try {
    const { voiceSpec, voiceTone } = await import('./voice.js');
    play([voiceTone(voiceSpec(chimera, content, kind))]);
  } catch { /* stay silent, stay alive */ }
}
