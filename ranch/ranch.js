// Ranch & stock system (M1). Pure functions over gameState — no DOM, no
// Date.now(): callers pass `now` so offline elapsed time, tests, and the
// dev time-warp all flow through the same code path (timestamps, never
// intervals).

import { rngStream, pick, randInt, pickFresh } from '../util/rng.js';
import { upkeepTuning } from '../splice/facility.js';
import { speciesOf } from '../data/catalog.js';

export const STATS = ['hp', 'power', 'armor', 'speed', 'stamina'];
export const AGE_STAGES = ['juvenile', 'adult', 'prime', 'elder'];
export const CARE_ACTIONS = ['feed', 'groom', 'exercise', 'enrich'];

export const TUNING = {
  startCondition: 60,
  careGain: 8, // per action
  careCooldownHours: 15, // "daily-ish" without punishing time zones
  decayPerHour: 0.4, // ≈9.6/day of neglect
  conditionFloor: 25, // soft floor — absence never breaks anything
  conditionMax: 100,
  gleamingAt: 85, // sparkle overlay + label
  scruffyAt: 45, // dirt overlay + label
  stipendPerDay: 40, // placeholder income until region income lands (M5)
  startingFunds: 300,
  penStartCapacity: 4,
  penUpgradeSize: 2,
  penUpgradeBase: 250,
  penUpgradeStep: 150,
};

const STOCK_NAMES = [
  // R41: eighteen names across a ranch the game restocks constantly meant
  // half the pens answered to the same thing. Eighty now, and createAnimal
  // prefers one no animal in the pens is wearing.
  'Bessie', 'Gordon', 'Clementine', 'Waffles', 'Herbert', 'Petunia',
  'Meatball', 'Agnes', 'Rufus', 'Marigold', 'Duncan', 'Prudence',
  'Tater', 'Wilhelmina', 'Bartholomew', 'Pickles', 'Doreen', 'Alfredo',
  'Mabel', 'Reginald', 'Turnip', 'Blossom', 'Cornelius', 'Fern',
  'Stanley', 'Beatrix', 'Dumpling', 'Ainsley', 'Parsnip', 'Gladys',
  'Mortimer', 'Sprout', 'Henrietta', 'Biscuit', 'Ferdinand', 'Nutmeg',
  'Percival', 'Clover', 'Waldo', 'Primrose', 'Chester', 'Dot',
  'Leopold', 'Sausage', 'Miriam', 'Conker', 'Ethel', 'Radish',
  'Humphrey', 'Pearl', 'Bramble', 'Winifred', 'Otis', 'Petal',
  'Norbert', 'Maple', 'Cyril', 'Butters', 'Ramona', 'Pretzel',
  'Ignatius', 'Daisy-Second', 'Grover', 'Pumpkin', 'Enid', 'Scooter',
  'Thaddeus', 'Juniper', 'Boris', 'Marmalade', 'Sylvia', 'Crouton',
  'Archibald', 'Poppy', 'Nigel', 'Toffee', 'Ursula', 'Gherkin',
  'Cuthbert', 'Bonnie',
];

const HOUR = 3600000;
const DAY = 24 * HOUR;

// One allele on a hit, and a second only on a second hit — so a carrier is
// common, an expressing homozygote is not, and a recessive is something you
// have to actually breed for.
function wildGenotype(rng, content) {
  const genotype = {};
  for (const trait of Object.values(content?.traits ?? {})) {
    const chance = trait.wildChance ?? 0;
    if (!chance) continue;
    let alleles = 0;
    if (rng() < chance) alleles++;
    if (alleles && rng() < chance) alleles++;
    if (alleles) genotype[trait.id] = alleles;
  }
  return genotype;
}

export function createAnimal(state, speciesId, content, now) {
  const n = state.ranch.animalCount++;
  const rng = rngStream(state.seed, 'animal', n);
  const potential = {};
  for (const stat of STATS) {
    // 1–5 stars, mid-weighted: 2–4 common, 5 a genuine find.
    potential[stat] = Math.max(1, Math.min(5, randInt(rng, 1, 3) + randInt(rng, 0, 2)));
  }
  return {
    id: `a${n}`,
    species: speciesId,
    name: pickFresh(rng, STOCK_NAMES, state.ranch.stock.map((a) => a.name)),
    sex: rng() < 0.5 ? 'F' : 'M',
    birthAt: now,
    condition: TUNING.startCondition,
    potential, // hidden in UI until the Gene Scanner upgrade exists
    traits: [], // expressed trait ids (from genotype, see breeding.js)
    // R24: ordinary stock carries the ordinary genes. Traits used to enter
    // the pool ONLY through conception mutations, so with a dozen of them
    // each would surface about once in two hundred eggs and the Splice-Dex
    // would read ??? forever. A trait with a `wildChance` circulates instead:
    // you can find a carrier, pair carriers, and breed a recessive up — which
    // is the Mendel machinery finally being worth having. The exotic ones
    // stay `mutationOnly` and keep their thunderclap.
    genotype: wildGenotype(rng, content),
    parents: null, // lineage snapshot; null = "origin: questionable paperwork"
    lastCare: { feed: 0, groom: 0, exercise: 0, enrich: 0 },
  };
}

export function ageStage(animal, content, now) {
  const g = speciesOf(content, animal.species).growthHours;
  const hours = Math.max(0, now - animal.birthAt) / HOUR;
  if (hours >= g.elder) return 'elder';
  if (hours >= g.prime) return 'prime';
  if (hours >= g.adult) return 'adult';
  return 'juvenile';
}

// Time until the next stage, or null at elder. UI countdowns only.
export function nextStage(animal, content, now) {
  const g = speciesOf(content, animal.species).growthHours;
  const stage = ageStage(animal, content, now);
  if (stage === 'elder') return null;
  const nextName = AGE_STAGES[AGE_STAGES.indexOf(stage) + 1];
  return { stage: nextName, msRemaining: animal.birthAt + g[nextName] * HOUR - now };
}

export function conditionTier(condition) {
  if (condition >= TUNING.gleamingAt) return 'gleaming';
  if (condition <= TUNING.scruffyAt) return 'scruffy';
  return 'fine';
}

// Advance all timestamp-driven effects since the last tick. Idempotent for
// dt <= 0 (clock skew, time-warp removed) — never rewind anything.
// `since` defaults to the save's one clock and, when it is left to default,
// this call still advances that clock — so a fixture that ages a ranch with
// one call behaves as it always did. campaign/world.js passes `since`
// explicitly and advances the clock itself, once, after every system.
export function applyElapsed(state, content, now, since = null) {
  const last = since ?? state.lastTickAt ?? now;
  const dt = Math.max(0, now - last);
  if (since == null) state.lastTickAt = now;
  if (dt === 0) return;

  const dtDays = dt / DAY;
  // R65: how long each head was ACTUALLY here inside this window. A creature
  // that arrived during the gap — a job's prize, a decant, a vat child — was
  // stamped with the moment it arrived rather than the moment the player
  // looked, so the ledger can finally read that clock instead of charging a
  // month of upkeep and a month of neglect to something that spent most of
  // the month not existing. Measured: a thirty-day absence billed $5,850 of
  // retroactive upkeep for one animal a job brought home on day one, and
  // decayed it to the condition floor for a month it had not lived through.
  const ownedMs = (arrivedAt) => Math.max(0, now - Math.max(last, arrivedAt ?? last));

  for (const animal of state.ranch.stock) {
    animal.condition = Math.max(
      TUNING.conditionFloor,
      animal.condition - TUNING.decayPerHour * (ownedMs(animal.birthAt) / HOUR)
    );
  }
  let upkeep = 0;
  for (const animal of state.ranch.stock) {
    upkeep += speciesOf(content, animal.species).upkeepPerDay * (ownedMs(animal.birthAt) / DAY);
  }
  for (const chimera of state.chimeras ?? []) {
    upkeep += chimeraUpkeep(chimera, content) * (ownedMs(chimera.createdAt) / DAY);
  }
  state.funds = Math.max(0, state.funds + TUNING.stipendPerDay * dtDays - upkeep);
}

export function careStatus(animal, now) {
  const status = {};
  for (const action of CARE_ACTIONS) {
    const readyAt = animal.lastCare[action] + TUNING.careCooldownHours * HOUR;
    status[action] = { ready: now >= readyAt, msRemaining: Math.max(0, readyAt - now) };
  }
  return status;
}

export function careAction(state, animalId, action, content, now) {
  const animal = state.ranch.stock.find((a) => a.id === animalId);
  if (!animal) return { ok: false, msg: 'No such animal.' };
  if (!CARE_ACTIONS.includes(action)) return { ok: false, msg: 'No such care action.' };
  if (!careStatus(animal, now)[action].ready) {
    return { ok: false, msg: `${animal.name} has had enough ${action} for now.` };
  }
  if (action === 'feed') {
    const cost = speciesOf(content, animal.species).feedCost;
    if (state.funds < cost) return { ok: false, msg: 'Slush fund is empty. Feeding requires funding.' };
    state.funds -= cost;
  }
  animal.lastCare[action] = now;
  animal.condition = Math.min(TUNING.conditionMax, animal.condition + TUNING.careGain);
  return { ok: true, msg: careFlavor(action, animal.name) };
}

function careFlavor(action, name) {
  switch (action) {
    case 'feed': return `${name} ate with alarming enthusiasm.`;
    case 'groom': return `${name} is now 12% shinier.`;
    case 'exercise': return `${name} did several laps. Some were on purpose.`;
    case 'enrich': return `${name} solved the puzzle feeder. The puzzle feeder lost.`;
  }
}

export function penUpgradeCost(state) {
  const bought = (state.ranch.penCapacity - TUNING.penStartCapacity) / TUNING.penUpgradeSize;
  return TUNING.penUpgradeBase + TUNING.penUpgradeStep * bought;
}

export function buyPenUpgrade(state) {
  const cost = penUpgradeCost(state);
  if (state.funds < cost) return { ok: false, msg: 'Insufficient slush fund for pen expansion.' };
  state.funds -= cost;
  state.ranch.penCapacity += TUNING.penUpgradeSize;
  return { ok: true, msg: `Pens expanded to ${state.ranch.penCapacity}. The zoning board was not consulted.` };
}

// The Mail-Order catalog only stocks fauna your conquests have unlocked
// (region nodes list `unlocksFauna`). Species with no price are never sold.
export function faunaUnlocked(state, content) {
  const open = new Set(
    Object.values(content.species)
      .filter((s) => s.mailOrderPrice && !s.synthetic && !isFaunaGated(s.id, content))
      .map((s) => s.id)
  );
  for (const region of Object.values(content.regions)) {
    for (const node of region.nodes) {
      if (!state.campaign.heldNodes.includes(node.id)) continue;
      for (const id of node.unlocksFauna ?? []) open.add(id);
    }
  }
  // Grandfathered stock (save v24): species a save could already buy under
  // an earlier unlocksFauna table. The catalog only ever grows — moving a
  // species to a later region must never repossess it.
  for (const id of state.campaign.faunaGranted ?? []) open.add(id);
  return open;
}

function isFaunaGated(speciesId, content) {
  for (const region of Object.values(content.regions)) {
    for (const node of region.nodes) {
      if ((node.unlocksFauna ?? []).includes(speciesId)) return true;
    }
  }
  return false;
}

export function catalogFor(state, content) {
  const open = faunaUnlocked(state, content);
  return Object.values(content.species)
    .filter((s) => s.mailOrderPrice && open.has(s.id))
    .sort((a, b) => a.mailOrderPrice - b.mailOrderPrice);
}

export function buyMailOrder(state, speciesId, content, now) {
  const species = content.species[speciesId];
  if (!species?.mailOrderPrice) return { ok: false, msg: 'Not in the catalog. Conquest required.' };
  if (!faunaUnlocked(state, content).has(speciesId)) {
    return { ok: false, msg: `${species.name} stock is not in your territory yet. Conquer more of the map.` };
  }
  if (state.ranch.stock.length >= state.ranch.penCapacity) {
    return { ok: false, msg: 'Pens are full. Expand before ordering more residents.' };
  }
  if (state.funds < species.mailOrderPrice) {
    return { ok: false, msg: 'Insufficient slush fund. The catalog does not extend credit. Again.' };
  }
  state.funds -= species.mailOrderPrice;
  const animal = createAnimal(state, speciesId, content, now);
  state.ranch.stock.push(animal);
  return { ok: true, msg: `${animal.name} the ${species.name} has arrived in a suspiciously ventilated crate.` };
}

// R119 — WHICH LAB THIS SAVE WAS FOUNDED IN. The seeder used to hold the
// starter herd as a literal, and the herd it held was the reason the
// Surgery Theater opened with exactly one buildable creature: the only
// graduatable starter was a bear, and a graduation yields six parts of ONE
// species, so every player's first "chimera" was a purebred.
//
// A lab is content now. This resolves the one a save was founded in, and
// falls back to the first authored lab so a caller that never asked (every
// tool fixture written before this, and any save from before v43) seeds
// exactly as it always did rather than not at all.
export function starterLabOf(state, content) {
  const labs = content?.starterLabs ?? [];
  if (!labs.length) return null;
  return labs.find((l) => l.id === state?.starterLab) ?? labs[0];
}

// R119 — IS THIS SAVE WAITING TO BE FOUNDED? True only for a save with no
// herd yet, no lab chosen, on a build that actually ships labs. The APP
// asks this and shows the picker instead of seeding; `ensureRanchSeeded`
// keeps its own fallback so the forty-odd tool fixtures that seed a herd
// without caring which one still get exactly the herd they always got.
//
// A save that already has animals is never waiting: it was founded before
// the choice existed, the v43 migration stamps it, and nothing about it is
// re-rolled. That is the Ascent rule — a new feature never resets a save.
export function needsFounding(state, content) {
  if (state?.ranch?.seeded) return false;
  if (state?.starterLab) return false;
  return (content?.starterLabs?.length ?? 0) > 0;
}

// Found the lab the player picked, then seed it. One door in, so the id can
// never be set without the herd that goes with it, or the other way round.
export function foundLab(state, content, labId, now) {
  const lab = (content?.starterLabs ?? []).find((l) => l.id === labId);
  if (!lab) return { ok: false, msg: 'No such laboratory. Try one that exists.' };
  if (state.ranch.seeded) return { ok: false, msg: 'This laboratory is already founded.' };
  state.starterLab = lab.id;
  ensureRanchSeeded(state, content, now);
  return { ok: true, lab, msg: `${lab.name} is yours. The paperwork is somebody else's problem.` };
}

// One-time starter herd for fresh AND migrated saves (migrations can't
// reach content data, so seeding happens here on boot instead).
export function ensureRanchSeeded(state, content, now) {
  if (state.ranch.seeded) return;
  const lab = starterLabOf(state, content);
  state.ranch.seeded = true;
  state.starterLab = lab?.id ?? state.starterLab ?? null;
  // Pair first, donor last: R106's Path hint reads `stock.slice(0, 2)` as
  // "your other starters" and names them, so the ORDER here is load-bearing
  // prose elsewhere. Two of the pair, one donor, exactly as before.
  // No labs indexed at all means a caller built its content bundle
  // without starters.json; seed what this game seeded before R119 rather
  // than throwing, so an old fixture is old rather than broken.
  const herd = lab ? [lab.pair, lab.pair, lab.donor] : ['goat', 'goat', 'bear'];
  for (const speciesId of herd) {
    state.ranch.stock.push(createAnimal(state, speciesId, content, now));
  }
  // The crate: a handful of parts from a THIRD species, and the whole reason
  // the first splice is a decision. Six parts from the donor plus these is a
  // socket with two answers in it — which is what a chimera is. It is two
  // parts rather than a set: enough to make a socket a question, few enough
  // that it cannot arm a day-one player past the wall the Path exists to
  // explain (A1, R106).
  const grade = content?.starterMeta?.crateGrade ?? 'standard';
  for (const partId of lab?.crate ?? []) {
    const part = content.parts?.[partId];
    if (!part) continue;
    state.inventory.parts.push({
      id: `starter-${partId}`,
      partId,
      grade,
      donor: { name: 'Founding crate', species: part.species, stars: 3, extractedAt: now },
    });
  }
  // The starter pair is always breedable — the first egg is a tutorial
  // moment, not a dice roll.
  state.ranch.stock[0].sex = 'F';
  state.ranch.stock[1].sex = 'M';
  // A4: the bear arrives GROWN. Every starter used to be born the moment the
  // app first opened, which shut the loop the whole game is built around —
  // graduate a donor, splice what comes out — for the first six to twelve
  // hours of a save. That is exactly the window a new player is in when they
  // hit the second node and lose, and in that window their only remaining
  // verbs were four different ways to spend money.
  //
  // Backdating the birth rather than granting a free part keeps every
  // downstream rule honest: it ages normally from here, its condition still
  // decides the grade it graduates at, and caring for it first still pays.
  // The two goats stay newborn, so the husbandry timers are still a thing
  // the player learns — there is simply one door open on day one.
  const grown = state.ranch.stock[2];
  grown.birthAt = now - Math.round(speciesOf(content, grown.species).growthHours.adult * HOUR);
}

// Purebred display genome for a stock animal — all of its species' parts on
// its species' frame. The renderer stays species-blind.
// Variant stock the player already owns counts as discovered — a save that
// predates the Splice-Dex's variant page should not have to re-earn it.
export function ensureDexVariants(state, content) {
  state.dex.variants ??= [];
  for (const animal of state.ranch.stock) {
    if (content.species[animal.species]?.variantOf && !state.dex.variants.includes(animal.species)) {
      state.dex.variants.push(animal.species);
    }
  }
}

export function stockGenome(speciesId, content) {
  const parts = {};
  for (const part of Object.values(content.parts)) {
    if (part.species === speciesId) parts[part.slot] = part.id;
  }
  return { frame: speciesOf(content, speciesId).frame, parts };
}

// What one chimera costs to keep, per real-world day. Every term is read
// off data the genome already carries, so a new part, a new grade or a new
// frame is priced the moment it is authored:
//
//   the CHASSIS it rides (a Rumbler eats more than a terrier),
//   the GRADE of every part bolted to it (a prismatic specimen is a
//     premium animal and is billed like one),
//   the POWER those parts draw (phys.draw was already the number for "how
//     hard is this thing to run"), and
//   its INSTABILITY, because a creature trying to come apart needs
//     watching, and watching costs money.
//
// Chimeras were free to own until R25, which made territory income a score
// rather than a budget: nothing you built ever cost you anything to keep,
// so the only question money asked was how long you were willing to wait.
export function chimeraUpkeep(chimera, content) {
  const t = upkeepTuning(content);
  let cost = t.frameBase[chimera.frame] ?? t.frameFallback;
  // R68: a part may carry a PASSIVE — something true of the creature rather
  // than a button it presses. The goat's Iron Gut was promised in §4.1 as
  // "halves upkeep" and nothing anywhere read it, because upkeep looked only
  // at frame, grade and draw. `upkeepMult` is the general form: any part can
  // carry one, and the ledger multiplies them together, so a 42nd species
  // with a thrifty organ is a data edit.
  let upkeepMult = 1;
  for (const token of Object.values(chimera.tokens ?? {})) {
    cost += t.gradeCost[token.grade] ?? t.gradeCost.standard;
    const part = content.parts[token.partId];
    cost += (part?.phys?.draw ?? 0) * t.drawCost;
    if (typeof part?.passive?.upkeepMult === 'number') upkeepMult *= part.passive.upkeepMult;
  }
  cost += (chimera.instability ?? 0) * t.instabilityCost;
  return Math.max(1, Math.round(cost * upkeepMult));
}

export function stockUpkeepPerDay(state, content) {
  return state.ranch.stock.reduce(
    (sum, a) => sum + speciesOf(content, a.species).upkeepPerDay, 0
  );
}

export function chimeraUpkeepPerDay(state, content) {
  return (state.chimeras ?? []).reduce((sum, c) => sum + chimeraUpkeep(c, content), 0);
}

export function upkeepPerDay(state, content) {
  return stockUpkeepPerDay(state, content) + chimeraUpkeepPerDay(state, content);
}
