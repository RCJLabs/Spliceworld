// Breeding & incubation (M6). Pure functions over state, fully seeded —
// an egg's genetics are decided at conception (rngStream by egg counter),
// so identical saves produce identical dynasties. Transparent inheritance
// per ROADMAP §3.2: stat potential = parent average ± variance; trait
// alleles pass Mendel-style; rare mutations spike stats or introduce
// mutation-only trait genes.

import { rngStream, pick, pickFresh } from '../util/rng.js';
import { STATS, AGE_STAGES, TUNING, ageStage } from './ranch.js';
import { avgStars } from '../splice/extract.js';
import { incubatorGrants } from '../splice/facility.js';
import { speciesOf } from '../data/catalog.js';

export const BREEDING = {
  incubatorSlots: 3,
  mutationChance: 0.08,
  // Of the mutations that fire, this share is a VARIANT SPECIES rather than
  // a stat spike or a trait gene — the rarest branch, and only when the
  // stock has a variant to become (ROADMAP §3.2).
  variantShare: 0.3,
  // Heredity is what turns one lucky egg into a line. A variant parent
  // passes the variant on; two of them almost always do.
  variantFromOne: 0.5,
  variantFromBoth: 0.9,
  // variance on each stat: mid-weighted with a gentle upward drift so
  // selective breeding feels like progress, not a coin flip.
  varianceTable: [
    [0.2, -1],
    [0.7, 0],
    [1.01, 1],
  ],
};

// The stock a species descends from. A variant breeds true with its base —
// an Alpine Ram is still a ram, and keeping them in one gene pool is what
// lets you cross a lucky mutant back into your good line.
// Bay count comes off the Incubator track (R25). BREEDING.incubatorSlots
// stays as the floor a caller with no facility data falls back to, and it is
// the same three drawers the game shipped with — a track can only ever add
// bays, never repossess them.
export function incubatorSlots(state, content) {
  return Math.max(BREEDING.incubatorSlots, incubatorGrants(state, content).slots);
}

export function baseSpecies(speciesId, content) {
  return content.species[speciesId]?.variantOf ?? speciesId;
}

export function variantsOf(speciesId, content) {
  const root = baseSpecies(speciesId, content);
  return Object.values(content.species).filter((s) => s.variantOf === root);
}

export function isVariant(speciesId, content) {
  return !!content.species[speciesId]?.variantOf;
}

export function expressedTraits(genotype, content) {
  const out = [];
  for (const trait of Object.values(content.traits)) {
    const alleles = genotype?.[trait.id] ?? 0;
    if (trait.dominant ? alleles >= 1 : alleles >= 2) out.push(trait.id);
  }
  return out;
}

// What a pairing can actually produce, computed exactly rather than
// simulated — the inheritance rule is "each parent passes one allele with
// probability alleles/2", which is a closed form, so the Gene Scanner's top
// tier can quote real percentages instead of a vibe.
//
// `carrier` is the chance the egg carries the gene at all; `express` is the
// chance it SHOWS it, which for a recessive means inheriting both copies.
// The gap between those two numbers is the whole of Mendel, and it is the
// thing a breeder most needs to see.
export function pairingForecast(sire, dam, content) {
  const out = [];
  for (const trait of Object.values(content?.traits ?? {})) {
    const p = [sire, dam].map((parent) => Math.min(1, (parent?.genotype?.[trait.id] ?? 0) / 2));
    if (!p.some((x) => x > 0)) continue;
    const none = (1 - p[0]) * (1 - p[1]);
    const both = p[0] * p[1];
    const carrier = 1 - none;
    const express = trait.dominant ? carrier : both; // the same rule expressedTraits() applies
    out.push({ trait, carrier, express, homozygous: both });
  }
  out.sort((a, b) => b.express - a.express || b.carrier - a.carrier);
  return out;
}

export function canBreed(sire, dam, state, content, now) {
  if (!sire || !dam) return { ok: false, msg: 'Two consenting adults required.' };
  if (sire.id === dam.id) return { ok: false, msg: 'Biology says no.' };
  if (baseSpecies(sire.species, content) !== baseSpecies(dam.species, content)) {
    return { ok: false, msg: 'Cross-species romance is what the Surgery Theater is for.' };
  }
  if (sire.sex === dam.sex) return { ok: false, msg: 'This pairing will produce excellent friendship and zero eggs.' };
  for (const a of [sire, dam]) {
    if (ageStage(a, content, now) === 'juvenile') return { ok: false, msg: `${a.name} is too young. Come back after adulthood.` };
  }
  if (state.ranch.eggs.length >= incubatorSlots(state, content)) {
    return { ok: false, msg: 'The incubator is full. Hatch something first.' };
  }
  return { ok: true };
}

function rollVariance(rng) {
  const r = rng();
  for (const [max, v] of BREEDING.varianceTable) if (r < max) return v;
  return 0;
}

// One tier of ancestry, flattened. Grandparents arrive as names and stars
// only — deliberately no `sire`/`dam` of their own, which is what caps the
// tree at two generations forever.
function lineageSnapshot(animal) {
  const gp = (side) => (side ? { name: side.name, stars: side.stars } : null);
  return {
    name: animal.name,
    stars: Math.round(avgStars(animal) * 10) / 10,
    sire: gp(animal.parents?.sire),
    dam: gp(animal.parents?.dam),
  };
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

  // Species: heredity first. A variant parent passes its line on; two of
  // them nearly always do. This is what turns one lucky egg into a stable.
  const variantParents = [sire, dam].filter((a) => isVariant(a.species, content));
  let species = baseSpecies(sire.species, content);
  let variantNote = null;
  if (variantParents.length === 2 && variantParents[0].species === variantParents[1].species) {
    if (rng() < BREEDING.variantFromBoth) species = variantParents[0].species;
  } else if (variantParents.length) {
    // Mixed pairing: the variant is on the table, one parent's worth.
    const carrier = pick(rng, variantParents);
    if (rng() < BREEDING.variantFromOne) species = carrier.species;
  }
  if (species !== baseSpecies(sire.species, content)) {
    variantNote = `The line holds: this one is ${speciesOf(content, species).name} stock.`;
  }

  // Mutations (rare): a stat spike, a novel mutation-only trait gene, or —
  // rarest — a VARIANT SPECIES out of ordinary stock (ROADMAP §3.2).
  let mutationNote = null;
  // A better incubator does not just hold more eggs, it holds them STEADIER,
  // and a steady bay is where odd things happen. This is the Incubator
  // track's real payback: bays alone move nothing, because the bottleneck
  // has always been pen capacity, not how many eggs you can queue. What
  // changes the loop is that more of them come out carrying something
  // nobody put there — which is where variants and the mutation-only genes
  // enter the game at all (R24).
  const mutationChance = BREEDING.mutationChance * (1 + incubatorGrants(state, content).mutationBonus);
  if (rng() < mutationChance) {
    const mutable = Object.values(content.traits).filter((t) => t.mutationOnly);
    const candidates = variantsOf(sire.species, content).filter((v) => v.id !== species);
    const roll = rng();
    if (roll < BREEDING.variantShare && candidates.length) {
      const variant = pick(rng, candidates);
      species = variant.id;
      variantNote = null; // the mutation note says it louder
      mutationNote =
        `MUTATION — VARIANT SPECIES: the egg is ${speciesOf(content, variant.id).name}. ` +
        `${speciesOf(content, variant.id).flavor} Nobody at this facility is qualified to explain it.`;
    } else if (rng() < 0.5 && mutable.length) {
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
    species,
    variant: isVariant(species, content) ? species : null,
    variantNote,
    sex: rng() < 0.5 ? 'F' : 'M',
    laidAt: now,
    hatchAt: now + Math.round(speciesOf(content, species).incubationMinutes * 60000 * incubatorGrants(state, content).hourScale),
    potential,
    genotype,
    mutationNote,
    // Labels follow actual sex, not argument order.
    //
    // Two generations, and bounded BY CONSTRUCTION rather than by a rule
    // someone has to remember: the snapshot copies a grandparent's name and
    // stars but never its own `sire`/`dam`, so lineage cannot grow a third
    // tier no matter how many generations a line runs. An unbounded tree in
    // a save that is never reset doubles every time you breed.
    parents: (([father, mother]) => ({
      sire: lineageSnapshot(father),
      dam: lineageSnapshot(mother),
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
    // R75 — twelve names and a bare `pick`, on a ranch that holds up to
    // twenty: collisions were not a risk, they were the expected case. The
    // same helper the stock and the chimeras already use prefers a name
    // nobody on the ranch is wearing before it repeats one.
    name: pickFresh(rng, HATCHLING_NAMES, state.ranch.stock.map((a) => a.name)),
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
  for (const trait of traits) {
    if (!state.dex.traits.includes(trait)) state.dex.traits.push(trait);
  }
  // A variant is a permanent Splice-Dex trophy the first time it appears.
  let firstOfItsKind = false;
  if (isVariant(egg.species, content)) {
    state.dex.variants ??= [];
    if (!state.dex.variants.includes(egg.species)) {
      state.dex.variants.push(egg.species);
      firstOfItsKind = true;
    }
  }

  const notes = [
    `${hatchling.name} has hatched! Lineage: ${egg.parents.sire.name} ★${egg.parents.sire.stars} × ${egg.parents.dam.name} ★${egg.parents.dam.stars}.`,
  ];
  if (egg.variantNote) notes.push(egg.variantNote);
  if (egg.mutationNote) notes.push(egg.mutationNote);
  if (traits.length) notes.push(`Expressed traits: ${traits.map((t) => content.traits[t].name).join(', ')}.`);
  return { ok: true, hatchling, variant: isVariant(egg.species, content) ? egg.species : null, firstOfItsKind, msg: notes.join(' ') };
}

const HATCHLING_NAMES = [
  'Eggbert', 'Shelley', 'Yolko', 'Benedict', 'Omeletta', 'Peep',
  'Cluckles', 'Ovum Lad', 'Sunny', 'Scramble', 'Hatch Adams', 'Poach',
];
