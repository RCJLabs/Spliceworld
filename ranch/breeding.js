// Breeding & incubation (M6). Pure functions over state, fully seeded —
// an egg's genetics are decided at conception (rngStream by egg counter),
// so identical saves produce identical dynasties. Transparent inheritance
// per ROADMAP §3.2: stat potential = parent average ± variance; trait
// alleles pass Mendel-style; rare mutations spike stats or introduce
// mutation-only trait genes.

import { rngStream, pick } from '../util/rng.js';
import { STATS, AGE_STAGES, TUNING, ageStage } from './ranch.js';
import { avgStars } from '../splice/extract.js';

export const BREEDING = {
  incubatorSlots: 3,
  mutationChance: 0.08,
  // variance on each stat: mid-weighted with a gentle upward drift so
  // selective breeding feels like progress, not a coin flip.
  varianceTable: [
    [0.2, -1],
    [0.7, 0],
    [1.01, 1],
  ],
};

export function expressedTraits(genotype, content) {
  const out = [];
  for (const trait of Object.values(content.traits)) {
    const alleles = genotype?.[trait.id] ?? 0;
    if (trait.dominant ? alleles >= 1 : alleles >= 2) out.push(trait.id);
  }
  return out;
}

export function canBreed(sire, dam, state, content, now) {
  if (!sire || !dam) return { ok: false, msg: 'Two consenting adults required.' };
  if (sire.id === dam.id) return { ok: false, msg: 'Biology says no.' };
  if (sire.species !== dam.species) return { ok: false, msg: 'Cross-species romance is what the Surgery Theater is for.' };
  if (sire.sex === dam.sex) return { ok: false, msg: 'This pairing will produce excellent friendship and zero eggs.' };
  for (const a of [sire, dam]) {
    if (ageStage(a, content, now) === 'juvenile') return { ok: false, msg: `${a.name} is too young. Come back after adulthood.` };
  }
  if (state.ranch.eggs.length >= BREEDING.incubatorSlots) {
    return { ok: false, msg: 'The incubator is full. Hatch something first.' };
  }
  return { ok: true };
}

function rollVariance(rng) {
  const r = rng();
  for (const [max, v] of BREEDING.varianceTable) if (r < max) return v;
  return 0;
}

export function breedPair(state, sireId, damId, content, now) {
  const sire = state.ranch.stock.find((a) => a.id === sireId);
  const dam = state.ranch.stock.find((a) => a.id === damId);
  const check = canBreed(sire, dam, state, content, now);
  if (!check.ok) return check;

  const n = state.ranch.eggCount++;
  const rng = rngStream(state.seed, 'egg', n);

  // Stat potential: parent average ± variance, clamped to 1–5 stars.
  const potential = {};
  for (const stat of STATS) {
    const base = (sire.potential[stat] + dam.potential[stat]) / 2;
    const rounded = Math.floor(base) + (rng() < base % 1 ? 1 : 0);
    potential[stat] = Math.max(1, Math.min(5, rounded + rollVariance(rng)));
  }

  // Trait alleles: each parent passes one with probability alleles/2.
  const genotype = {};
  for (const trait of Object.values(content.traits)) {
    let alleles = 0;
    for (const parent of [sire, dam]) {
      const parentAlleles = parent.genotype?.[trait.id] ?? 0;
      if (parentAlleles > 0 && rng() < parentAlleles / 2) alleles++;
    }
    if (alleles > 0) genotype[trait.id] = alleles;
  }

  // Mutations (rare): a stat spike, or a novel mutation-only trait gene.
  // (Variant species are the third kind — post-v0.1 per ROADMAP.)
  let mutationNote = null;
  if (rng() < BREEDING.mutationChance) {
    const mutable = Object.values(content.traits).filter((t) => t.mutationOnly);
    if (rng() < 0.5 && mutable.length) {
      const trait = pick(rng, mutable);
      genotype[trait.id] = Math.min(2, (genotype[trait.id] ?? 0) + 1);
      mutationNote = `Mutation: a ${trait.name} gene appeared from nowhere. The lab denies responsibility.`;
    } else {
      const stat = pick(rng, STATS);
      potential[stat] = Math.min(5, potential[stat] + 1);
      mutationNote = `Mutation: a spontaneous ${stat.toUpperCase()} surge. Nobody planned this.`;
    }
  }

  const egg = {
    id: `e${n}`,
    species: sire.species,
    sex: rng() < 0.5 ? 'F' : 'M',
    laidAt: now,
    hatchAt: now + content.species[sire.species].incubationMinutes * 60000,
    potential,
    genotype,
    mutationNote,
    // Labels follow actual sex, not argument order.
    parents: (([father, mother]) => ({
      sire: { name: father.name, stars: Math.round(avgStars(father) * 10) / 10 },
      dam: { name: mother.name, stars: Math.round(avgStars(mother) * 10) / 10 },
    }))(sire.sex === 'M' ? [sire, dam] : [dam, sire]),
  };
  state.ranch.eggs.push(egg);
  return { ok: true, egg, msg: `${sire.name} and ${dam.name} have produced an egg. It is already scheming.` };
}

export function hatchEgg(state, eggId, content, now) {
  const egg = state.ranch.eggs.find((e) => e.id === eggId);
  if (!egg) return { ok: false, msg: 'No such egg.' };
  if (now < egg.hatchAt) return { ok: false, msg: 'Still incubating. No peeking.' };
  if (state.ranch.stock.length >= state.ranch.penCapacity) {
    return { ok: false, msg: 'Pens are full — the hatchling refuses to be born homeless.' };
  }
  state.ranch.eggs = state.ranch.eggs.filter((e) => e !== egg);
  const n = state.ranch.animalCount++;
  const rng = rngStream(state.seed, 'hatch', n);
  const traits = expressedTraits(egg.genotype, content);
  const hatchling = {
    id: `a${n}`,
    species: egg.species,
    name: pick(rng, HATCHLING_NAMES),
    sex: egg.sex,
    birthAt: now,
    condition: TUNING.startCondition,
    potential: egg.potential,
    genotype: egg.genotype,
    traits,
    parents: egg.parents,
    lastCare: { feed: 0, groom: 0, exercise: 0, enrich: 0 },
  };
  state.ranch.stock.push(hatchling);
  const notes = [
    `${hatchling.name} has hatched! Lineage: ${egg.parents.sire.name} ★${egg.parents.sire.stars} × ${egg.parents.dam.name} ★${egg.parents.dam.stars}.`,
  ];
  if (egg.mutationNote) notes.push(egg.mutationNote);
  if (traits.length) notes.push(`Expressed traits: ${traits.map((t) => content.traits[t].name).join(', ')}.`);
  return { ok: true, hatchling, msg: notes.join(' ') };
}

const HATCHLING_NAMES = [
  'Eggbert', 'Shelley', 'Yolko', 'Benedict', 'Omeletta', 'Peep',
  'Cluckles', 'Ovum Lad', 'Sunny', 'Scramble', 'Hatch Adams', 'Poach',
];
