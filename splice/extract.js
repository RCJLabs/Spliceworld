// The Extractor (M2). Pure functions — no DOM, no clocks of its own.
// Grade = Genetics × Age stage × Condition at extraction (ROADMAP §3.3).
// This is where husbandry gets mechanical teeth (Law 3): the same animal
// extracted as a neglected Juvenile or a pampered Prime yields different
// tiers of the exact same parts.

import { ageStage } from '../ranch/ranch.js';
import { STATS } from '../ranch/ranch.js';
import { rngStream } from '../util/rng.js';
import { extractorGrants } from './facility.js';
import { speciesOf } from '../data/catalog.js';

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

// R72 - a save outlives the build that wrote it, and GRADES is code rather
// than data, so a token stamped with a grade this build no longer defines
// resolves to GRADE_INDEX[id] === undefined. Every reader of that does
// something worse than nothing: GRADES[undefined].mult throws outright, and
// so does GRADES[Math.max(0, GRADE_INDEX[id] - 1)], because undefined - 1 is
// NaN and Math.max(0, NaN) is NaN rather than 0 - the guard that LOOKS like
// it clamps is the one that crashes. A retired grade degrades to the
// baseline instead: the part keeps its face stats and the player keeps the
// part. Never a crash, and never a token quietly deleted.
export function gradeOf(id) {
  return GRADES[GRADE_INDEX[id]] ?? GRADES[0];
}

export function gradeIndexOf(id) {
  return GRADE_INDEX[id] ?? 0;
}

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
  const species = speciesOf(content, animal.species);
  const grade = gradeFor(animal, content, now, state);
  const stars = Math.round(avgStars(animal) * 10) / 10;

  state.ranch.stock.splice(idx, 1);
  const inv = state.inventory;

  // R31: the vial carries the whole donor, because that is what a vial IS.
  // `potential` and `genotype` used to leave with the animal, which made
  // extraction the one irreversible act in the game — graduate your best
  // recessive carrier and those genes were gone. The Resequencer can grow
  // this donor back now, so the essence has to actually be in here.
  const vial = {
    id: `v${inv.tokenCount++}`,
    species: animal.species,
    donorName: animal.name,
    stars,
    extractedAt: now,
    potential: { ...animal.potential },
    genotype: { ...(animal.genotype ?? {}) },
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
      grade: GRADES[Math.max(0, gradeIndexOf(token.grade) - 1)].id,
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

// --- R38: what is holding this grade down --------------------------------
//
// ROADMAP §3.3 calls the timing tension — extract a Juvenile now, or raise
// it to Prime with good care — "the ranch's central economic decision". Both
// screens that touch it printed ONE WORD: `Graduation forecast: Standard`.
// Three inputs (genetics × age stage × condition), one verdict, and no way
// back from the verdict to the input you could actually change.
//
// Measured over 1,200 starter animals: every single one shows a grade below
// its own best — 68% by two grades, 7% by three. And the lever differs. For
// 39% waiting is enough; for 12% waiting does NOTHING and care is the whole
// answer; 49% need both. A starter herd makes the point on its own — Gordon,
// Alfredo and Agnes all read `Standard`, and their ceilings are Apex, Prime
// and Apex, reached three different ways.
//
// So: say which input is binding, say what the animal is worth once it is
// not, and say when genetics has capped it — because "stop waiting, this is
// as good as it gets" is half of an economic decision and the word alone
// could never carry it.

const HOUR_MS = 3600000;

function gradeForScore(score) {
  for (const [id, min] of THRESHOLDS) {
    if (score >= min) return GRADES[GRADE_INDEX[id]];
  }
  return GRADES[0];
}

// The best age factor still AHEAD of this animal. An elder is past its peak
// and waiting cannot undo that, which is a real state and not a rounding
// error — saying "wait for Prime" to an elder would be the same unfollowable
// advice this function exists to stop.
function reachableAgeFactor(stage) {
  return stage === 'elder' ? AGE_FACTOR.elder : AGE_FACTOR.prime;
}

export function gradeOutlook(animal, content, now, state = null) {
  const stage = ageStage(animal, content, now);
  const genetics = avgStars(animal) / 5;
  const bonus = state ? extractorGrants(state, content).gradeBonus : 0;
  const score = (age, condition) => genetics * age * condition * (1 + bonus);

  const ageNow = AGE_FACTOR[stage];
  const ageBest = reachableAgeFactor(stage);
  const condNow = animal.condition / 100;

  const current = gradeForScore(score(ageNow, condNow));
  const grown = gradeForScore(score(ageBest, condNow));
  const kept = gradeForScore(score(ageNow, 1));
  const best = gradeForScore(score(ageBest, 1));

  const up = (g) => GRADE_INDEX[g.id] > GRADE_INDEX[current.id];
  const ageHelps = up(grown);
  const condHelps = up(kept);
  const anyHelp = up(best);

  const g = speciesOf(content, animal.species).growthHours;
  const msToPrime = stage === 'prime' || stage === 'elder'
    ? 0
    : Math.max(0, animal.birthAt + g.prime * HOUR_MS - now);

  // What reaching the ceiling actually REQUIRES, which is a different and
  // more useful question than which lever moves the grade at all. Agnes the
  // Bear is the case that settles it: care alone lifts her a grade, so a
  // "which lever" answer says `condition` — but her ceiling is two grades up
  // and needs the wait as well. Asking of each lever "is the ceiling still
  // out of reach without it" gets that right.
  const needsAge = GRADE_INDEX[best.id] > GRADE_INDEX[kept.id];
  const needsCondition = GRADE_INDEX[best.id] > GRADE_INDEX[grown.id];

  // The condition that actually buys the ceiling, not a vague "look after
  // it". The card prints `Condition 60` two lines up, so a number is
  // something the player can act on and a word is not.
  const threshold = THRESHOLDS.find(([id]) => id === best.id)?.[1] ?? 0;
  const denom = genetics * ageBest * (1 + bonus);
  const conditionNeeded = denom > 0
    ? Math.min(100, Math.ceil((threshold / denom) * 100))
    : 100;

  return {
    current,
    best,
    grown,
    kept,
    needsAge,
    needsCondition,
    conditionNeeded,
    msToPrime,
    stage,
    // Genetics is the one input husbandry cannot touch. Only worth saying
    // once care and time are DONE — before that it is noise, and the
    // ceiling is already named in the same sentence.
    cappedByGenes: GRADE_INDEX[best.id] < GRADES.length - 1,
    headroom: GRADE_INDEX[best.id] - GRADE_INDEX[current.id],
  };
}

// One sentence, written for the player. Both screens that show a grade read
// THIS — the ceremony and the ranch card — because two copies of an
// explanation is how the two screens end up disagreeing about the same
// animal.
export function outlookLine(outlook, name = 'this one') {
  const { current, best, grown, needsAge, needsCondition, conditionNeeded, msToPrime, stage, headroom } = outlook;
  if (headroom === 0) {
    if (stage === 'elder') {
      return `${current.name} is the best ${name} has left — past its prime, so waiting from here only costs upkeep.`;
    }
    return outlook.cappedByGenes
      ? `${current.name} is the ceiling: time and care are done. Anything better has to be bred, not raised.`
      : `${current.name}. There is nothing above this.`;
  }
  const hours = Math.max(1, Math.round(msToPrime / HOUR_MS));
  const need = [
    needsAge ? `fully grown (${hours}h)` : null,
    needsCondition ? `at condition ${conditionNeeded}+` : null,
  ].filter(Boolean).join(' and ');
  // The intermediate is worth saying only when it beats where they are now
  // AND falls short of the ceiling — otherwise it is the same sentence twice.
  const partway = needsCondition && GRADE_INDEX[grown.id] > GRADE_INDEX[current.id]
    ? ` Waiting alone gets you ${grown.name}.`
    : '';
  return `${best.name} once ${name} is ${need}.${partway}`;
}
