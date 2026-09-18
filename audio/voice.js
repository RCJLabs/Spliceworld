// R111 — A CREATURE'S VOICE, DERIVED FROM ITS GENOME.
//
// `audio/sfx.js` holds sixteen stingers and NOT ONE of them depends on the
// creature: a goat-headed tank and a moth-winged kite land the same `hit`.
// R96 gave the creatures motion; every splice looks unique and sounds generic.
//
// So the voice is a function of the anatomy, the same way the class and the
// tags already are:
//
//     mass          -> pitch       heavier is lower
//     head's tag    -> waveform    Aquatic sings, Armored buzzes
//     organ         -> modulation  what wobbles the note
//     temperament   -> contour     Skittish rises, Bullish falls
//
// SEEDED ON THE CREATURE, so the same animal always sounds the same. That is
// the whole difference between a voice and a noise: a player learns which of
// their chimeras just went down without looking at the screen.
//
// LAZY ON PURPOSE. `audio/sfx.js` is eager because main.js needs the mute
// state on the first frame; nothing plays a VOICE until a creature is on a
// screen, so this module stays out of the boot graph and MODULE_CAP stays at
// the fifty R174 argued for.
//
// Every number is in `data/voice.json` — adding a species must never mean
// editing this file, and a species with a new tag gets a waveform for free.

import { hashString } from '../util/rng.js';
import { analyze } from '../splice/physiology.js';

const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

// 0..1 across the measured mass range, so the curve moves with the roster
// rather than with a number somebody typed once.
const across = (n, lo, hi) => (hi === lo ? 0.5 : clamp((n - lo) / (hi - lo), 0, 1));

// The head decides the family, because the head is what a player says the
// creature IS — "the shark-headed one". First tag wins for determinism; a
// tagless head (7 of 41 today) takes the fallback rather than nothing.
function waveFor(chimera, content, tuning) {
  const headId = chimera?.tokens?.head?.partId;
  const tags = content?.parts?.[headId]?.tags ?? [];
  for (const tag of tags) {
    const wave = tuning.wave?.byTag?.[tag];
    if (wave) return wave;
  }
  return tuning.wave?.fallback ?? 'triangle';
}

// The organ is the thing bolted inside, so it is what wobbles the note. Read
// off the part's own draw where it has one — an organ that costs more to run
// wobbles harder — and off its id otherwise, so every organ differs.
function modFor(chimera, content, tuning) {
  const organ = chimera?.tokens?.organ?.partId ?? chimera?.tokens?.organ2?.partId;
  const { low = 0, high = 22 } = tuning.mod ?? {};
  if (!organ) return low;
  const draw = content?.parts?.[organ]?.phys?.draw;
  const n = Number.isFinite(draw) ? across(draw, 0, 8) : (hashString(organ) % 1000) / 1000;
  return Math.round((low + n * (high - low)) * 100) / 100;
}

// R13 put two axes on every settled chimera and this is the first thing to
// read BOTH. Skittish rises (a question); Bullish falls (a statement). A
// creature that is neither holds its note, which is most of them.
function contourFor(chimera, tuning) {
  const c = tuning.contour ?? {};
  const t = chimera?.temperament;
  if (!t) return c.level ?? 1;
  if ((t.nerve ?? 50) < (c.nerveMid ?? 50)) return c.rise ?? 1.42;
  if ((t.temper ?? 0) > (c.temperMid ?? 0)) return c.fall ?? 0.72;
  return c.level ?? 1;
}

// THE SPEC, not the sound. A plain object so this stays DOM-free and the gate
// can compare two creatures without a browser — the same rule the battle
// engine follows for the same reason.
export function voiceSpec(chimera, content, kind = 'tap') {
  const tuning = content?.voice ?? {};
  const p = tuning.pitch ?? {};
  const mass = analyze(chimera?.frame, Object.values(chimera?.tokens ?? {}), content)?.mass ?? 0;

  // Heavier is LOWER, which is why the range is walked backwards.
  const heavy = across(mass, p.massLow ?? 60, p.massHigh ?? 280);
  const base = (p.high ?? 512) - heavy * ((p.high ?? 512) - (p.low ?? 96));

  // Seeded on the creature so it never drifts, and small enough that two
  // creatures of one mass are told apart by it rather than confused by it.
  const spread = p.jitter ?? 14;
  const jitter = spread ? ((hashString(String(chimera?.id ?? '')) % (spread * 2)) - spread) : 0;

  return {
    wave: waveFor(chimera, content, tuning),
    pitch: Math.round(clamp(base + jitter, 40, 2000)),
    mod: modFor(chimera, content, tuning),
    contour: contourFor(chimera, tuning),
    dur: tuning.dur?.[kind] ?? tuning.dur?.tap ?? 0.11,
  };
}

// What the synth plays: the spec as the `voice()` shapes `audio/sfx.js`
// already understands, so there is one oscillator path and not two.
export function voiceTone(spec, vol = 0.08) {
  return {
    type: spec.wave,
    from: spec.pitch,
    to: Math.round(spec.pitch * spec.contour),
    dur: spec.dur,
    vol,
    mod: spec.mod,
  };
}
