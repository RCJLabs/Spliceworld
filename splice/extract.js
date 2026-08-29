// The Extractor (M2). Pure functions — no DOM, no clocks of its own.
// Grade = Genetics × Age stage × Condition at extraction (ROADMAP §3.3).
// This is where husbandry gets mechanical teeth (Law 3): the same animal
// extracted as a neglected Juvenile or a pampered Prime yields different
// tiers of the exact same parts.

import { ageStage } from '../ranch/ranch.js';
import { STATS } from '../ranch/ranch.js';

// Stat multipliers feed the battle engine in M4; Apex/Prismatic ability
// upgrades land with the keyword resolver, also M4.
export const GRADES = [
  { id: 'standard', name: 'Standard', mult: 1 },
  { id: 'prime', name: 'Prime', mult: 1.25 },
  { id: 'apex', name: 'Apex', mult: 1.5 },
  { id: 'prismatic', name: 'Prismatic', mult: 2 },
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

export function gradeScore(animal, content, now) {
  const genetics = avgStars(animal) / 5;
  const age = AGE_FACTOR[ageStage(animal, content, now)];
  const condition = animal.condition / 100;
  return genetics * age * condition;
}

export function gradeFor(animal, content, now) {
  const score = gradeScore(animal, content, now);
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
  const grade = gradeFor(animal, content, now);
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
    tokens.push({
      id: `t${inv.tokenCount++}`,
      partId: part.id,
      grade: grade.id,
      donor: { name: animal.name, species: animal.species, stars, extractedAt: now },
    });
  }
  inv.parts.push(...tokens);

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
