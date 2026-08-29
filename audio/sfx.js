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
  capture: [
    { type: 'sine', from: 80, to: 40, dur: 0.3, vol: 0.16 },
    { type: 'triangle', from: 1200, to: 2000, at: 0.28, dur: 0.1, vol: 0.07 },
  ],
};

export function play(name) {
  if (muted || !ctx || !STINGERS[name]) return;
  try {
    if (ctx.state === 'suspended') ctx.resume();
    for (const v of STINGERS[name]) voice(v);
  } catch { /* stay silent, stay alive */ }
}
