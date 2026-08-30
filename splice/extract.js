// The Extractor (M2). Pure functions — no DOM, no clocks of its own.
// Grade = Genetics × Age stage × Condition at extraction (ROADMAP §3.3).
// This is where husbandry gets mechanical teeth (Law 3): the same animal
// extracted as a neglected Juvenile or a pampered Prime yields different
// tiers of the exact same parts.

import { ageStage } from '../ranch/ranch.js';
import { STATS } from '../ranch/ranch.js';
import { rngStream } from '../util/rng.js';
import { extractorGrants } from './facility.js';

// Stat multipliers feed the battle engine in M4; Apex/Prismatic ability
// upgrades land with the keyword resolver, also M4.
// Balance pass: the ladder used to be 1 / 1.25 / 1.5 / 2.0, which made
// Prismatic a leap rather than a step — every encounter went from a wall to
// a formality in one husbandry tier. Even steps now, and the difficulty
// curve (enemies.json tierScale) answers each one.
export const GRADES = [
  { id: 'standard', name: 'Standard', mult: 1 },
  { id: 'prime', name: 'Prime', mult: 1.2 },
  { id: 'apex', name: 'Apex', mult: 1.4 },
  { id: 'prismatic', name: 'Prismatic', mult: 1.65 },
];
export const GRADE_INDEX = Object.fromEntries(GRADES.map((g, i) => [g.id, i]));

// Peak is Prime — Elders still beat Adults' ceiling but are past their best.
const AGE_FACTOR = { juvenile: 0.35, adult: 0.75, prime: 1, elder: 0.8 };

const THRESHOLDS = [
  ['prismatic', 0.75],
  ['apex', 0.55],
  ['prime', 0.35],
];

export function avgStars(animal) {
  const sum = STATS.reduce((s, stat) => s + animal.potential[stat], 0);
  return sum / STATS.length;
}

// The three things a donor brings to the table: what it inherited, how far
// along it is, and how well it has been kept. `state` is optional — a
// caller with no save (the balance harness, a preview built from raw data)
// gets the animal's own score, which is what the game did before R25.
export function gradeScore(animal, content, now, state = null) {
  const genetics = avgStars(animal) / 5;
  const age = AGE_FACTOR[ageStage(animal, content, now)];
  const condition = animal.condition / 100;
  // The Extractor track buys a cleaner draw: the same animal grades a
  // little better than it strictly earned. It is a thumb on the scale, not
  // a replacement for husbandry — the score still has to get there.
  const bonus = state ? extractorGrants(state, content).gradeBonus : 0;
  return genetics * age * condition * (1 + bonus);
}

export function gradeFor(animal, content, now, state = null) {
  const score = gradeScore(animal, content, now, state);
  for (const [id, min] of THRESHOLDS) {
    if (score >= min) return GRADES[GRADE_INDEX[id]];
  }
  return GRADES[0];
}

// Graduate a stock animal into a DNA vial + one token per species part.
// Permanent by design: the donor leaves the herd and lives on as lineage.
export function extractAnimal(state, animalId, content, now) {
  const idx = state.ranch.stock.findIndex((a) => a.id === animalId);
  if (idx === -1) return { ok: false, msg: 'No such animal.' };
  const animal = state.ranch.stock[idx];
  const species = content.species[animal.species];
  const grade = gradeFor(animal, content, now, state);
  const stars = Math.round(avgStars(animal) * 10) / 10;

  state.ranch.stock.splice(idx, 1);
  const inv = state.inventory;

  const vial = {
    id: `v${inv.tokenCount++}`,
    species: animal.species,
    donorName: animal.name,
    stars,
    extractedAt: now,
  };
  inv.vials.push(vial);

  const tokens = [];
  for (const part of Object.values(content.parts)) {
    if (part.species !== animal.species) continue;
    // Expressed heritable traits stamp into matching parts (M6): breeding
    // compounds into combat the same way husbandry does.
    const stamped = (animal.traits ?? []).filter((t) =>
      (content.traits?.[t]?.slots ?? []).includes(part.slot)
    );
    tokens.push({
      id: `t${inv.tokenCount++}`,
      partId: part.id,
      grade: grade.id,
      traits: stamped,
      donor: { name: animal.name, species: animal.species, stars, extractedAt: now },
    });
  }
  inv.parts.push(...tokens);
  for (const token of tokens) {
    if (!state.dex.parts.includes(token.partId)) state.dex.parts.push(token.partId);
  }

  return {
    ok: true,
    grade,
    stars,
    vial,
    tokens,
    donorName: animal.name,
    msg: `${animal.name} has ascended to ${grade.name}-grade essence (pending assembly).`,
  };
}

// --- Chimera salvage (ROADMAP §3.3) --------------------------------------
//
// "Chimeras (yours or captured) can also be extracted — returns a SUBSET of
// parts, one grade degraded. Salvage, not free recycling."
//
// This is the Surgery Theater's missing undo. Splicing consumes vault
// tokens permanently, so until now a chimera was a one-way sink: a build
// you regretted, a chaos-vat reject, or a rehabilitated creature carrying
// anatomy you wanted elsewhere all just sat there. Now they come apart.
//
// The two costs are what stop it being free recycling: you get back only
// some of what went in, and what comes back is a grade poorer. Which parts
// survive is seeded on the chimera itself, so the preview a player is
// shown before they commit is exactly what they will get, and reloading
// cannot reroll it.
export const CHIMERA_SALVAGE = { keepMin: 0.5, keepMax: 0.8 };

// What dismantling this chimera would actually return. Deterministic, so
// the confirmation and the outcome can never disagree (Law 4).
export function salvagePreview(state, chimera, content) {
  const sockets = Object.keys(chimera?.tokens ?? {});
  if (!sockets.length) return { keep: [], lose: [], tokens: [] };
  const rng = rngStream(state.seed, `dismantle:${chimera.id}`, 0);
  const span = CHIMERA_SALVAGE.keepMax - CHIMERA_SALVAGE.keepMin;
  const keepCount = Math.max(1, Math.round(sockets.length * (CHIMERA_SALVAGE.keepMin + rng() * span)));

  // Shuffle by seeded key rather than sorting on rng() directly: a
  // comparator that calls the stream is not a stable ordering.
  const ordered = sockets
    .map((socketId) => ({ socketId, key: rng() }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.socketId);
  const keep = ordered.slice(0, keepCount);
  const lose = ordered.slice(keepCount);

  const tokens = keep.map((socketId) => {
    const token = chimera.tokens[socketId];
    return {
      socketId,
      partId: token.partId,
      grade: GRADES[Math.max(0, GRADE_INDEX[token.grade] - 1)].id,
      wasGrade: token.grade,
      traits: token.traits ?? [],
      donor: token.donor,
    };
  });
  return { keep, lose, tokens };
}

export function extractChimera(state, chimeraId, content, now) {
  const idx = state.chimeras.findIndex((c) => c.id === chimeraId);
  if (idx === -1) return { ok: false, msg: 'No such chimera.' };
  if (state.battle) return { ok: false, msg: 'Not while a battle is in progress. Finish the fight.' };
  if ((state.vat?.parents ?? []).includes(chimeraId)) {
    return { ok: false, msg: 'That one is in the vat. One indignity at a time.' };
  }
  const chimera = state.chimeras[idx];
  const preview = salvagePreview(state, chimera, content);
  if (!preview.tokens.length) return { ok: false, msg: 'There is nothing in there to recover.' };

  state.chimeras.splice(idx, 1);
  const inv = state.inventory;
  const tokens = preview.tokens.map((spec) => ({
    id: `t${inv.tokenCount++}`,
    partId: spec.partId,
    grade: spec.grade,
    traits: spec.traits,
    // The lineage survives the creature: a part recovered from Chompers
    // still remembers the goat Chompers was built out of.
    donor: spec.donor ?? { name: chimera.name, species: content.parts[spec.partId].species, stars: 3, extractedAt: now },
  }));
  inv.parts.push(...tokens);
  for (const token of tokens) {
    if (!state.dex.parts.includes(token.partId)) state.dex.parts.push(token.partId);
  }

  const lostNames = preview.lose
    .map((socketId) => content.parts[chimera.tokens[socketId].partId]?.name)
    .filter(Boolean);
  return {
    ok: true,
    tokens,
    lost: lostNames,
    name: chimera.name,
    msg:
      `${chimera.name} has been honourably disassembled. ` +
      `${tokens.length} part${tokens.length === 1 ? '' : 's'} back in the vault, one grade the worse for it` +
      `${lostNames.length ? `; ${lostNames.join(', ')} did not survive the paperwork.` : '.'}`,
  };
}
