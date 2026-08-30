// Temperament (ROADMAP §3.5). Pure and DOM-free.
//
// "Chimeras have bond … and temperament on two axes (Brave–Skittish,
// Fierce–Gentle), seeded by dominant donor species + drifted by how you
// raise them. Temperament = passive battle perks … Never removes player
// control."
//
// Every chimera has carried `temperament: null` since M3 with a comment
// saying "seeded on settling — later milestone". This is that milestone.
//
// Two rules the whole module is built around:
//
//   1. It is SEEDED BY THE ANATOMY, not rolled from nothing. The dominant
//      donor species — whichever contributed the most parts — supplies
//      the bias, so a bear-heavy build is fierce because it is mostly
//      bear. That keeps temperament inside the same promise as class and
//      tags: what you built decides what you get.
//   2. Perks are PASSIVE STAT EFFECTS ONLY. §3.5's "never removes player
//      control" rules out anything that takes a turn away — obedience
//      already occupies that space and is the only thing allowed to.

import { rngStream } from '../util/rng.js';
import { isSettled } from './theater.js';

const DEFAULTS = {
  spread: 22,
  expressAt: 30,
  driftCap: 100,
  lastStandAt: 0.3,
  critChanceAt100: 0.35,
  critMult: 1.5,
  evasionAt100: 0.3,
  fiercePowerAt100: 0.18,
  fierceGuardAt100: 0.5,
  gentleRegenAt100: 0.6,
  driftPerWin: 5,
  driftPerKO: -7,
  driftTrainNerve: 4,
  driftTrainTemper: -3,
};

export function tempTuning(content) {
  // Tolerates a missing bundle: trainChimera is called from places that
  // do not always have content to hand, and a drift is never worth a crash.
  return { ...DEFAULTS, ...(content?.temperamentMeta ?? {}) };
}

const clampAxis = (n, t) => Math.max(-t.driftCap, Math.min(t.driftCap, Math.round(n)));

// Whichever species put the most parts in. Ties break on the head, because
// the head is the part every chimera has and the one the player picked
// first.
export function dominantSpecies(chimera, content) {
  const counts = {};
  for (const token of Object.values(chimera?.tokens ?? {})) {
    const species = content.parts[token.partId]?.species;
    if (species) counts[species] = (counts[species] ?? 0) + 1;
  }
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return null;
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) {
    const headSpecies = content.parts[chimera.tokens.head?.partId]?.species;
    if (headSpecies && counts[headSpecies] === ranked[0][1]) return headSpecies;
  }
  return ranked[0][0];
}

export function biasFor(speciesId, content) {
  const species = content?.species?.[speciesId];
  if (!species) return { nerve: 0, temper: 0 };
  return (
    content?.temperamentBySpecies?.[speciesId] ??
    content?.temperamentByRole?.[species.role] ?? { nerve: 0, temper: 0 }
  );
}

// Settling is when a chimera stops being an assembly and starts being a
// creature, so it is when it acquires opinions. Seeded on the chimera, so
// the same save always produces the same animal.
export function seedTemperament(chimera, content, worldSeed) {
  const t = tempTuning(content);
  const speciesId = dominantSpecies(chimera, content);
  const bias = biasFor(speciesId, content);
  const rng = rngStream(worldSeed, `temperament:${chimera.id}`, 0);
  return {
    nerve: clampAxis(bias.nerve + (rng() * 2 - 1) * t.spread, t),
    temper: clampAxis(bias.temper + (rng() * 2 - 1) * t.spread, t),
    from: speciesId,
  };
}

// Called on every tick. A chimera that has finished settling and has no
// temperament yet gets one — the same shape as ensureRanchSeeded, and for
// the same reason: migrations cannot reach content data.
export function ensureTemperaments(state, content, now) {
  const seeded = [];
  for (const chimera of state.chimeras ?? []) {
    if (chimera.temperament || !isSettled(chimera, now)) continue;
    chimera.temperament = seedTemperament(chimera, content, state.seed);
    seeded.push(chimera);
  }
  return seeded;
}

// How the two axes read right now.
export function describe(chimera, content) {
  const t = tempTuning(content);
  const labels = content?.temperamentLabels;
  const temperament = chimera?.temperament;
  if (!temperament || !labels) return null;
  const band = (axis, value) =>
    labels[axis][value >= t.expressAt ? 'high' : value <= -t.expressAt ? 'low' : 'mid'];
  const nerve = band('nerve', temperament.nerve);
  const temper = band('temper', temperament.temper);
  return {
    nerve,
    temper,
    nerveValue: temperament.nerve,
    temperValue: temperament.temper,
    label: `${nerve.name} · ${temper.name}`,
    perks: [nerve, temper].filter((b) => b.id !== 'steady' && b.id !== 'even').map((b) => `${b.name}: ${b.perk}`),
  };
}

// The passive effects, as plain numbers for the battle engine. Expressed
// only past `expressAt`, and scaled by how far past — a barely-fierce
// creature is barely fiercer.
export function perksOf(chimera, content) {
  const t = tempTuning(content);
  const temperament = chimera?.temperament;
  const none = { critChance: 0, critMult: t.critMult, lastStandAt: t.lastStandAt, evasion: 0, power: 0, guardLoss: 0, regen: 0 };
  if (!temperament) return none;
  // 0 at the threshold, 1 at the extreme, so crossing into Brave does not
  // hand out a full perk for one point of nerve.
  const past = (v) => Math.max(0, (Math.abs(v) - t.expressAt) / (t.driftCap - t.expressAt));
  const brave = temperament.nerve >= t.expressAt ? past(temperament.nerve) : 0;
  const skittish = temperament.nerve <= -t.expressAt ? past(temperament.nerve) : 0;
  const fierce = temperament.temper >= t.expressAt ? past(temperament.temper) : 0;
  const gentle = temperament.temper <= -t.expressAt ? past(temperament.temper) : 0;
  return {
    critChance: brave * t.critChanceAt100,
    critMult: t.critMult,
    lastStandAt: t.lastStandAt,
    evasion: skittish * t.evasionAt100,
    power: fierce * t.fiercePowerAt100,
    guardLoss: fierce * t.fierceGuardAt100,
    regen: gentle * t.gentleRegenAt100,
  };
}

// --- Drift: how you raise them -------------------------------------------
// Every existing verb now has a consequence for who the creature becomes.

export function drift(chimera, content, { nerve = 0, temper = 0 }) {
  if (!chimera?.temperament) return null;
  const t = tempTuning(content);
  chimera.temperament.nerve = clampAxis(chimera.temperament.nerve + nerve, t);
  chimera.temperament.temper = clampAxis(chimera.temperament.temper + temper, t);
  return chimera.temperament;
}

// Training builds trust: braver, and gentler with it.
export function driftFromTraining(chimera, content) {
  const t = tempTuning(content);
  return drift(chimera, content, { nerve: t.driftTrainNerve, temper: t.driftTrainTemper });
}

// Winning makes them fiercer; being knocked out makes them warier. Applied
// per battle by the aftermath, so a career shapes a creature.
export function driftFromBattle(chimera, content, { won, knockedOut }) {
  const t = tempTuning(content);
  return drift(chimera, content, {
    nerve: knockedOut ? t.driftPerKO : 0,
    temper: won ? t.driftPerWin : 0,
  });
}
