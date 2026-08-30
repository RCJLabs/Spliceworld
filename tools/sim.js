// M4.5 — Balance harness. Headless Monte Carlo over chimera builds vs. the
// enemy roster, using the exact battle engine the browser runs (that's why
// battle/ is DOM-free). Outputs win-rate tables and flags degenerate
// builds. Run:
//   node tools/sim.js [--builds=40] [--seeds=3] [--grade=standard] [--team=1] [--plant]
//
// --plant injects a deliberately broken combo (Injection: power 500, cost 0)
// and proves the harness catches it — the milestone's acceptance test.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { indexContent } from '../render/renderer.js';
import { seedTemperament } from '../splice/temperament.js';
import { analyze } from '../splice/physiology.js';
import { createBattle, step, playerActions, playerActive } from '../battle/engine.js';
import { rivalEncounter, rivalList } from '../campaign/rivals.js';
import { mulberry32, hashString, pick, rngStream } from '../util/rng.js';
import { chooseMoveIndex } from '../battle/ai.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

export function loadSimContent() {
  return indexContent({
    frames: readJSON('data/frames.json'),
    parts: readJSON('data/parts.json'),
    species: readJSON('data/species.json'),
    combos: readJSON('data/combos.json'),
    enemies: readJSON('data/enemies.json'),
    keywords: readJSON('data/keywords.json'),
    classes: readJSON('data/classes.json'),
    // The harness was blind to both of these: traits never reached
    // physiology or movesFromTokens here, so a gene could not be measured
    // at all, and campaignMeta fell back to its empty default.
    traits: readJSON('data/traits.json'),
    regions: readJSON('data/regions.json'),
    rivals: readJSON('data/rivals.json'),
    director: readJSON('data/director.json'),
    facility: readJSON('data/facility.json'),
  philosophies: readJSON('data/philosophies.json'),
  operations: readJSON('data/operations.json'),
  chaos: readJSON('data/chaos.json'),
  temperament: readJSON('data/temperament.json'),
  scars: readJSON('data/scars.json'),
  guides: readJSON('data/guides.json'),
  });
}

// A lab-perfect chimera: settled, fully bonded, uniform grade — so the sim
// measures the BUILD, not husbandry or obedience noise.
export function makeSimChimera(frame, partIds, grade, content) {
  const tokens = {};
  // Socket ids, not slot types: a Tier II build carries two organs, so the
  // second one lands in `organ2` instead of overwriting the first.
  const used = new Set();
  for (const pid of partIds) {
    const part = content.parts[pid];
    let socketId = part.slot;
    let n = 2;
    while (used.has(socketId)) socketId = `${part.slot}${n++}`;
    used.add(socketId);
    tokens[socketId] = {
      id: `sim-${pid}`,
      partId: pid,
      grade,
      donor: { name: 'Simulacrum', species: part.species, stars: 3, extractedAt: 0 },
    };
  }
  const report = analyze(frame, Object.values(tokens), content, Object.keys(tokens).length);
  const chimera = {
    id: `sim-${frame}-${partIds.join('+')}`,
    name: 'Simulacrum',
    frame,
    tokens,
    createdAt: 0,
    settleUntil: 0, // settled
    instability: report.instability,
    bond: 100, // fully bonded — obedience is not under test here
    // Settled chimeras have opinions (§3.5), and the harness has to measure
    // the game the player actually plays — a null temperament would make
    // every perk invisible to the balance pass.
    temperament: null, // replaced below, once the id exists
    injury: null,
  };
  chimera.temperament = seedTemperament(chimera, content, 0x5EED);
  return chimera;
}

// The pilot plays the same policy the opposition does (R22), at a fixed
// skill so it stays a yardstick rather than a variable.
//
// It used to be greedy on raw power, and that quietly decided what the
// harness could measure: a 20-power Multi-Hit or a defensive move was never
// pressed, so it was never priced, so no build that depended on one could be
// evaluated. A yardstick that cannot hold half the toolbox is measuring the
// toolbox, not the builds.
const PILOT_SKILL = 0.8;

function pilotAction(battle, content) {
  const actions = playerActions(battle);
  if (!actions.length) return null;
  const release = actions.find((a) => a.type === 'release');
  if (release) return release;
  const me = playerActive(battle);
  const idx = chooseMoveIndex(battle, me, battle.enemy.active, content, PILOT_SKILL, () => rngStream(battle.seed, 'pilot', battle.rollCount++)());
  if (idx >= 0) {
    const move = actions.find((a) => a.type === 'move' && a.index === idx);
    if (move) return move;
  }
  return actions.find((a) => a.type === 'rest') ?? actions[0];
}

// `encounter` is an id from enemies.json or a generated encounter object
// (rival duels are built at runtime, so they never live in a table).
// A team of three DIFFERENT chimeras, for the one question a cloned team
// cannot answer: whether a strip demands a stable rather than a build.
export function scriptedStableBattle(chimeras, encounter, content, seed) {
  const enc = typeof encounter === 'string' ? content.encounters[encounter] : encounter;
  const battle = createBattle(chimeras, enc, content, seed, 1);
  let guard = 0;
  while (!battle.over && guard++ < 300) {
    const action = pilotAction(battle, content);
    if (!action) break;
    step(battle, action, content);
  }
  return { outcome: battle.outcome ?? 'stall', turns: battle.turn };
}

export function scriptedBattle(chimera, encounter, content, seed, teamSize = 1) {
  const enc = typeof encounter === 'string' ? content.encounters[encounter] : encounter;
  // The game hands the player a team of three, so tuning ENCOUNTERS against a
  // lone chimera measures the wrong thing. teamSize fields N copies of the
  // same build: still a controlled yardstick for comparing builds, but now at
  // the scale the difficulty curve is actually supposed to answer.
  const team = Array.from({ length: teamSize }, (_, i) =>
    i === 0 ? chimera : { ...chimera, id: `${chimera.id}#${i}`, name: `${chimera.name} ${i + 1}` }
  );
  const battle = createBattle(team, enc, content, seed, 1);
  let guard = 0;
  while (!battle.over && guard++ < 300) {
    const action = pilotAction(battle, content);
    if (!action) break;
    step(battle, action, content);
  }
  return { outcome: battle.outcome ?? 'stall', turns: battle.turn };
}

export function buildLabel(frame, partIds, grade) {
  return `${frame} · ${partIds.map((p) => p.replace('_', ':')).join(' + ')} [${grade}]`;
}

// Build pool: every purebred, every combo pairing (fleshed out with a body),
// then seeded random mixes. Heads are mandatory (engine rule).
export function sampleBuilds(content, n, seed) {
  const rng = mulberry32(hashString(`sim:${seed}`));
  const bySlot = {};
  for (const part of Object.values(content.parts)) (bySlot[part.slot] ??= []).push(part.id);
  const frames = Object.keys(content.frames);
  const builds = [];
  const seen = new Set();
  const push = (frame, partIds) => {
    const key = frame + '|' + [...partIds].sort().join(',');
    if (seen.has(key)) return;
    seen.add(key);
    builds.push({ frame, partIds: [...partIds] });
  };

  for (const sp of Object.keys(content.species)) {
    // One part per socket. Every natural species carries exactly one of
    // each, so this used to be a no-op — but 'salvage' is a catch-all for
    // enemy tech and R26 grew it to three organs and two hides. Taken
    // whole it built an eight-socket chimera the game cannot assemble, and
    // that impossible build promptly flagged as the most degenerate thing
    // in the pool. A yardstick has to measure builds a player could hold.
    const owned = Object.values(content.parts).filter((p) => p.species === sp);
    const bySocket = {};
    for (const part of owned) bySocket[part.slot] ??= part.id;
    const partIds = Object.values(bySocket);
    // A species with fewer than four sockets filled is a stub, not a
    // purebred; it flagged TRASH in every report — noise, not a hole.
    if (partIds.length < 4) continue;
    push(content.species[sp].frame, partIds);
  }
  for (const combo of Object.values(content.combos)) {
    const partIds = new Set(combo.parts);
    if (![...partIds].some((p) => content.parts[p].slot === 'head')) partIds.add(pick(rng, bySlot.head));
    const filled = new Set([...partIds].map((p) => content.parts[p].slot));
    for (const slot of ['hindlimbs', 'organ']) {
      if (!filled.has(slot)) partIds.add(pick(rng, bySlot[slot]));
    }
    push(pick(rng, frames), [...partIds]);
  }
  while (builds.length < n) {
    const partIds = [pick(rng, bySlot.head)];
    const filled = new Set(['head']);
    for (const slot of ['forelimbs', 'hindlimbs', 'tail', 'hide', 'organ']) {
      if (rng() < 0.7) {
        partIds.push(pick(rng, bySlot[slot]));
        filled.add(slot);
      }
    }
    push(pick(rng, frames), partIds);
  }
  return builds;
}

// Every build in the pool, given the second organ bay Theater Tier II buys.
// The point of the comparison is what the UPGRADE is worth, so the second
// organ is added to the build rather than replacing anything.
export function withSecondOrgan(builds, content, seed = 7) {
  const rng = mulberry32(hashString(`organ2:${seed}`));
  const organs = Object.values(content.parts).filter((p) => p.slot === 'organ').map((p) => p.id);
  return builds.map((b) => {
    const already = b.partIds.filter((id) => content.parts[id].slot === 'organ');
    if (already.length >= 2) return b;
    let extra = pick(rng, organs);
    for (let i = 0; i < 8 && already.includes(extra); i++) extra = pick(rng, organs);
    if (already.includes(extra)) return b;
    return { ...b, partIds: [...b.partIds, extra] };
  });
}

// --- The ladder bench (A1) ---------------------------------------------
//
// Every gate in this suite has fought at `teamSize 3` since M4.5, on the
// correct reasoning that tuning against a lone chimera measures the wrong
// game. That was true and it quietly became the reason nobody ever looked
// at what a SOLO player faces — which is where the audit found the second
// node of the campaign sitting at a flat 0%.
//
// The cause is structural, not numeric: combat is one active per side over
// a queue, so three enemy bodies means grinding three health bars down with
// one of your own. patrol_2 at tier-1 stats and three waves is still 0%;
// the same encounter at full tier-2 stats and two waves is 28%. No stat
// pass moves that. So this bench measures the ladder at the team sizes a
// player can actually field, and the fix it guards is INFORMATIONAL — the
// game has to say so, and must never strand the player who finds out late.

// The build a new player actually has: their starter herd, graduated.
export const STARTER_BUILD = {
  frame: 'M',
  partIds: ['goat_head', 'goat_forelimbs', 'goat_hindlimbs', 'goat_tail', 'goat_hide', 'goat_organ'],
};

// Win rate for `size` copies of a plain starter chimera against one node.
export function ladderRate(content, encounterId, size, { grade = 'standard', seedsPer = 24, seed = 0 } = {}) {
  const enc = content.encounters[encounterId];
  let wins = 0;
  for (let i = 0; i < seedsPer; i++) {
    const c = makeSimChimera(STARTER_BUILD.frame, STARTER_BUILD.partIds, grade, content);
    if (scriptedBattle(c, enc, content, hashString(`ladder${encounterId}${size}${i}${seed}`), size).outcome === 'win') wins++;
  }
  return wins / seedsPer;
}

// The whole first region, at every team size the game will let you field.
export function ladderBench(content, { region = null, grade = 'standard', seedsPer = 24 } = {}) {
  const strip = region ?? Object.values(content.regions)[0];
  return strip.nodes.map((node) => ({
    node,
    bySize: [1, 2, 3].map((size) => ladderRate(content, node.encounter, size, { grade, seedsPer })),
  }));
}

// --- The rival bench (R27) ---------------------------------------------
//
// R27's criterion is "a rival you have beaten twice fields something built
// to answer your ACTUAL STABLE". The trap in measuring that is obvious once
// you look for it: a rival at two defeats is also stronger and better
// graded, so "the rematch is harder" proves nothing at all.
//
// So the instrument holds the escalation fixed and varies only the file.
// Two copies of the same rival, both beaten exactly twice, both at the same
// power and grade — one has spent those duels watching archetype A, the
// other watching archetype B. Then A fights both. If the counter is real, A
// does measurably worse against the rival that studied A.

import { rivalDossier, rivalTeam, scoutStable, rivalRecord } from '../campaign/rivals.js';

// A rival who has fought `archetype` `fights` times and lost `defeats` of
// them. Everything else about the save is identical.
export function scoutedBy(content, rivalId, archetypeKey, { defeats = 2, fights = 2, grade = 'apex', seed = 2026 } = {}) {
  const arch = ARCHETYPES[archetypeKey];
  const state = {
    seed,
    chimeras: [],
    campaign: { heldNodes: [], notoriety: 999, rivals: {} },
  };
  const chimera = makeSimChimera(arch.frame, arch.partIds, grade, content);
  for (let i = 0; i < fights; i++) scoutStable(state, rivalId, [chimera], content);
  // `fights: 0` is the "they have never met you" case, so the record may not
  // exist yet — that is a legitimate state, not a missing setup step.
  const record = (state.campaign.rivals[rivalId] ??= { defeats: 0, losses: 0, lastMetAt: null });
  record.defeats = defeats;
  return state;
}

// Win rate of one archetype against one rival's current team.
export function fightRival(content, state, rivalId, archetypeKey, { grade = 'apex', seedsPer = 12, teamSize = 3 } = {}) {
  const arch = ARCHETYPES[archetypeKey];
  const chimera = makeSimChimera(arch.frame, arch.partIds, grade, content);
  const encounter = rivalEncounter(state, content.rivals[rivalId], content);
  let wins = 0;
  for (let i = 0; i < seedsPer; i++) {
    const r = scriptedBattle(chimera, encounter, content, hashString(`rv${rivalId}${archetypeKey}${i}`), teamSize);
    if (r.outcome === 'win') wins++;
  }
  return wins / seedsPer;
}

// The whole table: for each rival, how much worse each archetype does
// against the version of that rival which studied IT, versus the version
// that studied somebody else.
export function rivalCounterBench(content, { grade = 'apex', seedsPer = 12, others = null } = {}) {
  const keys = Object.keys(ARCHETYPES);
  const rows = [];
  for (const rival of Object.values(content.rivals)) {
    for (const mine of keys) {
      const studiedMe = scoutedBy(content, rival.id, mine, { grade });
      const versus = (others ?? keys.filter((k) => k !== mine));
      const againstMe = fightRival(content, studiedMe, rival.id, mine, { grade, seedsPer });
      // The same rival, same defeats, studying somebody else entirely.
      const elsewhere = versus.map((other) => {
        const studiedThem = scoutedBy(content, rival.id, other, { grade });
        return fightRival(content, studiedThem, rival.id, mine, { grade, seedsPer });
      });
      const naive = elsewhere.reduce((a, b) => a + b, 0) / (elsewhere.length || 1);
      rows.push({
        rival: rival.id,
        archetype: mine,
        againstMe,
        naive,
        penalty: naive - againstMe,
        dossier: rivalDossier(studiedMe, rival, content),
      });
    }
  }
  return rows;
}

// --- The facility bench (R25) ------------------------------------------
//
// R25's criterion is "money has a second sink that changes the loop, AND
// each track pays back measurably". The first half is arithmetic; the
// second is a claim, so here is the instrument that settles it. Every
// number below runs the game's own code — the real breeding rule, the real
// grade thresholds, the real incubation clock — against the same content
// the browser loads.

import { gradeFor, GRADE_INDEX } from '../splice/extract.js';
import { pairingForecast, expressedTraits, incubatorSlots, BREEDING } from '../ranch/breeding.js';

const BREEDING_MUTATION = BREEDING.mutationChance;
import {
  incubatorGrants, extractorGrants, scannerGrants, infirmaryGrants,
} from '../splice/facility.js';

const HOUR_MS = 3600000;

// A bare state good enough for the pure readers. `facility` is the only
// field any of them consults.
export function labAt(levels = {}) {
  return { seed: 2026, funds: 1e9, facility: { ...levels }, ranch: { stock: [], eggs: [] }, chimeras: [], campaign: { heldNodes: [], notoriety: 0 } };
}

// Eggs per real-world day: bays divided by how long a bay is occupied.
// Both halves of the track move it, which is the point of buying it.
export function incubatorThroughput(state, content) {
  const g = incubatorGrants(state, content);
  const slots = incubatorSlots(state, content);
  const species = Object.values(content.species).filter((sp) => sp.incubationMinutes);
  const meanHours = species.reduce((sum, sp) => sum + sp.incubationMinutes / 60, 0) / species.length;
  const occupied = meanHours * g.hourScale;
  return {
    slots,
    hoursPerEgg: occupied,
    eggsPerDay: (slots * 24) / occupied,
    // The number that actually changes the loop. Bays are not the
    // bottleneck — pen capacity is — so what the track has to be worth is
    // how often an egg comes out carrying something nobody bred for.
    mutationsPer100: 100 * BREEDING_MUTATION * (1 + g.mutationBonus),
  };
}

// What share of a representative donor population grades prime or better.
// The animals are held fixed across levels, so the only thing moving is
// the draw.
export function extractorYield(state, content, { donors = 240, seed = 7 } = {}) {
  const rng = mulberry32(hashString(`extractor:${seed}`));
  const speciesIds = Object.values(content.species).filter((sp) => sp.mailOrderPrice).map((sp) => sp.id);
  const counts = { standard: 0, prime: 0, apex: 0, prismatic: 0 };
  for (let i = 0; i < donors; i++) {
    const sp = pick(rng, speciesIds);
    const animal = {
      species: sp,
      condition: 55 + rng() * 45,
      birthAt: -1e9, // long since prime
      potential: Object.fromEntries(['hp', 'power', 'armor', 'speed', 'stamina'].map((k) => [k, 1 + Math.floor(rng() * 5)])),
    };
    counts[gradeFor(animal, content, 0, state).id]++;
  }
  const better = (id) => Object.entries(counts)
    .filter(([g]) => GRADE_INDEX[g] >= GRADE_INDEX[id])
    .reduce((sum, [, n]) => sum + n, 0) / donors;
  return { counts, primePlus: better('prime'), apexPlus: better('apex') };
}

// How many pairings it takes to breed an animal that EXPRESSES a chosen
// recessive, picking blind versus picking with the Gene Scanner's numbers.
// Both runs use the same inheritance rule the game breeds by; the only
// difference is whether the breeder can see what the parents carry.
export function generationsToFix(content, { traitId, informed, seed = 11, herd = 8, cap = 400 } = {}) {
  const trait = content.traits[traitId];
  const rng = mulberry32(hashString(`fix:${traitId}:${informed}:${seed}`));
  const pool = [];
  for (let i = 0; i < herd; i++) {
    // A founding herd carrying the gene at its wild rate, both sexes.
    let alleles = 0;
    if (rng() < (trait.wildChance ?? 0.1)) alleles++;
    if (alleles && rng() < (trait.wildChance ?? 0.1)) alleles++;
    pool.push({ id: `f${i}`, sex: i % 2 ? 'M' : 'F', genotype: alleles ? { [traitId]: alleles } : {} });
  }
  // Seed one carrier, or a blind run can be unwinnable through no fault of
  // the strategy — the question is how fast you get there, not whether the
  // founding roll was kind.
  if (!pool.some((a) => (a.genotype[traitId] ?? 0) > 0)) pool[0].genotype[traitId] = 1;

  for (let n = 0; n < cap; n++) {
    if (pool.some((a) => expressedTraits(a.genotype, content).includes(traitId))) return n;
    const males = pool.filter((a) => a.sex === 'M');
    const females = pool.filter((a) => a.sex === 'F');
    if (!males.length || !females.length) return cap;
    let sire = pick(rng, males);
    let dam = pick(rng, females);
    if (informed) {
      // The Suite's own numbers, used the way a breeder would use them.
      let best = -1;
      for (const m of males) for (const f of females) {
        const row = pairingForecast(m, f, content).find((r) => r.trait.id === traitId);
        const score = row ? row.express * 2 + row.carrier : 0;
        if (score > best) { best = score; sire = m; dam = f; }
      }
    }
    // The engine's rule: each parent passes one allele with probability
    // alleles/2 (ranch/breeding.js, breedPair).
    let alleles = 0;
    for (const parent of [sire, dam]) {
      const has = parent.genotype?.[traitId] ?? 0;
      if (has > 0 && rng() < has / 2) alleles++;
    }
    const child = { id: `c${n}`, sex: rng() < 0.5 ? 'M' : 'F', genotype: alleles ? { [traitId]: alleles } : {} };
    pool.push(child);
    if (pool.length > herd + 6) pool.splice(0, 1); // a working herd, not a museum
  }
  return cap;
}

// Downtime and scarring, the two things the Infirmary sells against.
export function infirmaryPayback(state, content) {
  const g = infirmaryGrants(state, content);
  const meanBattleHours = 3 * g.healScale; // engine: (2 + rng()*2) * healScale
  const scarTuning = { scarChance: 0.34, ...(content.scarMeta ?? {}) };
  return {
    meanDowntimeHours: meanBattleHours,
    scarChance: scarTuning.scarChance * g.scarChanceScale,
    treatScale: g.treatScale,
  };
}

// One table: what every level of every track is actually worth.
export function facilityPayback(content) {
  const at = (track, level) => labAt({ [track]: level });
  const rows = { incubator: [], extractor: [], scanner: [], infirmary: [] };
  for (const level of [1, 2, 3]) {
    rows.incubator.push({ level, ...incubatorThroughput(at('incubator', level), content) });
    rows.extractor.push({ level, ...extractorYield(at('extractor', level), content) });
    rows.infirmary.push({ level, ...infirmaryPayback(at('infirmary', level), content) });
  }
  // The Scanner sells information, so its payback is measured as search
  // speed: how many pairings a breeder needs to fix a recessive when they
  // can see what the herd carries, against when they cannot.
  const recessives = Object.values(content.traits).filter((t) => !t.dominant && t.wildChance);
  for (const trait of recessives.slice(0, 3)) {
    const runs = [0, 1, 2, 3, 4, 5, 6, 7];
    const mean = (informed) =>
      runs.reduce((sum, seed) => sum + generationsToFix(content, { traitId: trait.id, informed, seed }), 0) / runs.length;
    rows.scanner.push({ trait: trait.id, blind: mean(false), informed: mean(true) });
  }
  return rows;
}

// --- The region bench (R26) --------------------------------------------
//
// R26's acceptance criterion is not "there are more fights", it is "taking
// Greenfield opens a region whose fights need DIFFERENT ANATOMY than the
// one that won the first". That is a measurement, not an opinion, so here
// is the instrument.
//
// Four archetypes, each a legal build out of parts the player can actually
// obtain, each committing to one axis of the combat model:
//
//   boots  — Ground class, blunt. Its head move is Ground-tagged, so it
//            swings through anything Airborne and hits nothing.
//   wings  — Air class, Airborne moves. Beats Ground, loses to Water.
//   gills  — Water class, and tagged Aquatic, which is a liability of its
//            own: Electric doubles on anything wet.
//   fumes  — unclassed on purpose, playing tags instead: Gas is ×1.5 on
//            Organic and ×0 on a Vehicle, Venom is halved on one.
//   noise  — armour-piercing, giving up the class triangle for Sonic.
//
// A region that all four clear equally is a region that asked for nothing.
export const ARCHETYPES = {
  boots: {
    name: 'Boots on the Ground',
    frame: 'M',
    partIds: ['rhino_head', 'gorilla_forelimbs', 'rhino_hindlimbs', 'bear_tail', 'pangolin_hide', 'bear_organ'],
  },
  wings: {
    name: 'Wings',
    frame: 'M',
    partIds: ['eagle_head', 'eagle_forelimbs', 'eagle_hindlimbs', 'eagle_tail', 'bat_hide', 'bear_organ'],
  },
  gills: {
    name: 'Gills',
    frame: 'M',
    partIds: ['shark_head', 'shark_forelimbs', 'shark_hindlimbs', 'shark_tail', 'tortoise_hide', 'bear_organ'],
  },
  fumes: {
    name: 'Fumigation',
    frame: 'M',
    partIds: ['cobra_head', 'octopus_forelimbs', 'octopus_hindlimbs', 'scorpion_tail', 'skunk_hide', 'skunk_organ'],
  },
  //   noise  — armour-piercing. Sonic ignores Armor outright, which is the
  //            only thing that answers a region built entirely out of
  //            plating. Its organ is enemy tech, salvaged from the region
  //            before the one that demands it.
  noise: {
    name: 'Dead Reckoning',
    frame: 'M',
    // One ground limb and one water limb, so the affinities tie and the
    // build comes out Unclassed. That is deliberate: an archetype meant to
    // isolate the armour-piercing axis must not also be carrying a class
    // advantage, or the bench cannot tell which of the two it measured.
    partIds: ['wolf_head', 'gorilla_forelimbs', 'frog_hindlimbs', 'wolf_tail', 'pangolin_hide', 'foghorn_array'],
  },
};

// One of each class plus the armour-piercer, which is what a player who has
// been through four regions actually keeps in the pens.
export function stableFor(grade, content) {
  return ['boots', 'wings', 'gills'].map((key) =>
    makeSimChimera(ARCHETYPES[key].frame, ARCHETYPES[key].partIds, grade, content)
  );
}

// The encounters a region actually fields, in node order.
export function regionEncounterIds(region) {
  return region.nodes.map((n) => n.encounter);
}

// Win rate per (region, archetype). teamSize 3 because that is the team the
// game hands the player, and a region is scored across all of its nodes —
// a strip you can half-clear is still a strip that asked you a question.
export function regionBench(content, { seedsPer = 4, grade = 'prime', teamSize = 3, seed = 2026, only = null, stable: withStable = true } = {}) {
  const regions = Object.values(content.regions ?? {}).filter((r) => !only || only.includes(r.id));
  const rows = [];
  for (const region of regions) {
    const encounters = regionEncounterIds(region);
    const byArchetype = {};
    for (const [key, arch] of Object.entries(ARCHETYPES)) {
      const chimera = makeSimChimera(arch.frame, arch.partIds, grade, content);
      let wins = 0;
      let games = 0;
      const perEncounter = {};
      for (const encId of encounters) {
        let encWins = 0;
        for (let s = 0; s < seedsPer; s++) {
          const r = scriptedBattle(chimera, content.encounters[encId], content, hashString(`r${region.id}${key}${encId}${s}${seed}`), teamSize);
          games++;
          if (r.outcome === 'win') { wins++; encWins++; }
        }
        perEncounter[encId] = encWins / seedsPer;
      }
      byArchetype[key] = { winRate: wins / games, perEncounter };
    }
    // …and the same strip fought by a STABLE: three different chimeras
    // instead of three of one. Every earlier region has an anatomy that
    // answers it, so specialising should beat hedging there; the Compliance
    // Spire fields all three classes on one ladder, and is the one place
    // that should reward bringing a bench.
    let sWins = 0;
    let sGames = 0;
    if (withStable) {
      const stable = stableFor(grade, content);
      for (const encId of encounters) {
        for (let s = 0; s < seedsPer; s++) {
          const r = scriptedStableBattle(stable, content.encounters[encId], content, hashString(`s${region.id}${encId}${s}${seed}`));
          sGames++;
          if (r.outcome === 'win') sWins++;
        }
      }
    }
    const champion = Object.entries(byArchetype).sort((a, b) => b[1].winRate - a[1].winRate)[0][0];
    rows.push({ region, byArchetype, champion, stableWinRate: sGames ? sWins / sGames : null });
  }
  return rows;
}

// Rival duels at their first-meeting tier. A rival with counterBias reads
// the player's stable, so the harness gives it an empty one — we measure
// the published matchup, not a build-specific counter.
export function rivalEncounters(content, seed = 2026, defeats = 0) {
  if (!content.rivals) return [];
  const state = {
    seed,
    chimeras: [],
    campaign: { heldNodes: [], notoriety: 0, rivals: {} },
  };
  return rivalList(content).map((rival) => {
    state.campaign.rivals[rival.id] = { defeats, losses: 0, lastMetAt: null };
    return rivalEncounter(state, rival, content);
  });
}

export function runSim(content, { builds = 40, seedsPer = 3, grade = 'standard', seed = 2026, teamSize = 1, pool: givenPool = null } = {}) {
  const pool = givenPool ?? sampleBuilds(content, builds, seed);
  const encounters = [
    ...Object.values(content.encounters),
    ...rivalEncounters(content, seed),
  ];
  const encounterIds = encounters.map((e) => e.id);
  const byId = Object.fromEntries(encounters.map((e) => [e.id, e]));
  const rows = [];

  for (const [i, build] of pool.entries()) {
    const chimera = makeSimChimera(build.frame, build.partIds, grade, content);
    const perEncounter = {};
    let wins = 0;
    let games = 0;
    let turnsInWins = 0;
    for (const enc of encounterIds) {
      let encWins = 0;
      for (let s = 0; s < seedsPer; s++) {
        const r = scriptedBattle(chimera, byId[enc], content, hashString(`b${i}e${enc}s${s}`), teamSize);
        games++;
        if (r.outcome === 'win') {
          wins++;
          encWins++;
          turnsInWins += r.turns;
        }
      }
      perEncounter[enc] = encWins / seedsPer;
    }
    rows.push({
      label: buildLabel(build.frame, build.partIds, grade),
      partIds: build.partIds,
      winRate: wins / games,
      avgWinTurns: wins ? turnsInWins / wins : null,
      perEncounter,
    });
  }
  rows.sort((a, b) => b.winRate - a.winRate);

  // Degeneracy is relative: as the roster and encounter set grow, a fixed
  // "wins 85%" bar stops catching glass cannons that one-shot everything but
  // still lose to an alpha strike. Flag absolute monsters AND peer outliers.
  const median = (xs) => {
    const v = xs.filter((x) => x != null).sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)] : null;
  };
  const medWin = median(rows.map((r) => r.winRate)) ?? 0;
  const medTurns = median(rows.map((r) => r.avgWinTurns)) ?? 99;

  const flags = [];
  for (const row of rows) {
    const turns = row.avgWinTurns ?? 99;
    const monster = row.winRate >= 0.85 && turns <= 5;
    const oneShot = row.winRate > 0 && turns <= 2.5;
    const outlier = row.winRate >= medWin + 0.3 && turns <= medTurns - 1.0;
    if (monster || oneShot || outlier) {
      const why = monster
        ? `wins ${pct(row.winRate)} in ~${turns.toFixed(1)} turns — nerf something`
        : oneShot
          ? `deletes encounters in ~${turns.toFixed(1)} turns — check its damage numbers`
          : `${pct(row.winRate)} vs peer median ${pct(medWin)} and ${turns.toFixed(1)} vs ${medTurns.toFixed(1)} turns — outlier`;
      flags.push({ kind: 'OP', label: row.label, partIds: row.partIds, why });
    } else if (row.winRate === 0) {
      flags.push({ kind: 'TRASH', label: row.label, partIds: row.partIds, why: 'cannot win anything — dead content or a hole in the curve' });
    }
  }
  return { rows, flags, encounterIds, medWin, medTurns };
}

// The planted defect for the acceptance test: a combo move with absurd
// numbers, exactly the kind of data typo the harness exists to catch.
export function plantBrokenCombo(content) {
  const mutated = structuredClone(content);
  mutated.combos.injection.move = { power: 500, cost: 0, acc: 100, tags: [], keywords: {} };
  return mutated;
}

const pct = (x) => `${Math.round(x * 100)}%`;

function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=');
      return [k, v ?? true];
    })
  );
  let content = loadSimContent();
  if (args.plant) {
    console.log('⚠ planting a broken Injection combo (power 500, cost 0)…\n');
    content = plantBrokenCombo(content);
  }
  const opts = {
    builds: Number(args.builds ?? 40),
    seedsPer: Number(args.seeds ?? 3),
    grade: args.grade ?? 'standard',
    // The balance pass established a team of three as the honest yardstick for
            // ENCOUNTER difficulty; solo (--team=1) stays available for comparing builds.
    teamSize: Number(args.team ?? 3),
  };
  const t0 = Date.now();
  const { rows, flags, encounterIds } = runSim(content, opts);

  const short = (e) => (e.startsWith('rival_') ? '@' + e.slice(6) : e).slice(0, 9);
  const encHeads = encounterIds.map((e) => short(e).padStart(9)).join(' ');
  console.log(`win-rate table (${rows.length} builds × ${encounterIds.length} encounters × ${opts.seedsPer} seeds, grade=${opts.grade}, team of ${opts.teamSize})\n`);
  console.log(`  win%  turns ${encHeads}  build`);
  for (const row of rows) {
    const enc = encounterIds.map((e) => pct(row.perEncounter[e]).padStart(9)).join(' ');
    console.log(
      `${pct(row.winRate).padStart(6)} ${row.avgWinTurns ? row.avgWinTurns.toFixed(1).padStart(6) : '     —'} ${enc}  ${row.label}`
    );
  }
  console.log(`\n${flags.length ? 'FLAGS:' : 'no degenerate builds flagged.'}`);
  for (const f of flags) console.log(`  [${f.kind}] ${f.label} — ${f.why}`);
  console.log(`\n${rows.length * encounterIds.length * opts.seedsPer} battles in ${Date.now() - t0}ms`);

  if (args.plant) {
    const caught = flags.some(
      (f) => f.kind === 'OP' && f.partIds.includes('cobra_head') && f.partIds.includes('cobra_organ')
    );
    console.log(caught ? '\nPLANT CAUGHT ✓ — the harness flagged the broken combo.' : '\nPLANT MISSED ✗');
    process.exitCode = caught ? 0 : 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
