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
import { CONTENT_FILES } from '../data/loader.js';
import { seedTemperament } from '../splice/temperament.js';
import { rushable, rush } from '../splice/rush.js';
import { activeRaid, raidEncounter } from '../campaign/taskforce.js';
import { gauntletState, gauntletEncounter } from '../campaign/gauntlet.js';
import { treatInjury, treatmentCost } from '../splice/scars.js';
import { analyze } from '../splice/physiology.js';
import { createBattle, step, playerActions, playerActive } from '../battle/engine.js';
import { movesFromTokens } from '../battle/statblock.js';
import { knownMoves } from '../battle/moves.js';
import { rivalEncounter, rivalList, rivalStatus } from '../campaign/rivals.js';
import { rescueEncounterFor } from '../campaign/map.js';
import { mulberry32, hashString, pick, rngStream } from '../util/rng.js';
import { chooseMoveIndex, choosePlayerAction } from '../battle/ai.js';
import { pilotAction, autoResolve, canSend, replayCost } from '../battle/autoplay.js';
import { forecast, bandFor } from '../battle/forecast.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

// R85: built from the list the GAME loads. This used to be its own
// hand-written map and had drifted — `breakout` was never in it, so the
// harness scored a world where escapees do not exist. Six copies of one
// list, and the failure mode of missing a file is silence.
export function loadSimContent() {
  return indexContent(Object.fromEntries(CONTENT_FILES.map((n) => [n, readJSON(`data/${n}.json`)])));
}

// A lab-perfect chimera: settled, fully bonded, uniform grade — so the sim
// measures the BUILD, not husbandry or obedience noise.
// R30 gave chimeras four move slots, which put a question to the harness:
// whose moveset is it measuring? `defaultPick` is a SUGGESTION the player
// retrains — gating the ladder on it would measure my picker, not the
// content. So the bench fields the archetype's best four, attack-led, which
// is what a player who has tuned their creature actually brings. A8's 25%
// floor and R26's region margins are statements about the CONTENT, and this
// keeps them that way.
export function benchMoveset(known) {
  const attacks = known.filter((m) => m.power > 0).sort((a, b) => b.power - a.power);
  const utils = known.filter((m) => m.power === 0);
  const picked = [];
  const seenTag = new Set();
  // Tag answers first — a Gas build without its Gas move is a worse generic
  // build, and the tag chart is what the regions are built around.
  for (const m of attacks) {
    const tag = (m.tags ?? []).join(',');
    if (seenTag.has(tag)) continue;
    seenTag.add(tag);
    picked.push(m);
  }
  for (const m of [...attacks, ...utils]) {
    if (picked.length >= 4) break;
    if (!picked.includes(m)) picked.push(m);
  }
  return picked.slice(0, 4).map((m) => m.source);
}

export function makeSimChimera(frame, partIds, grade, content) {
  const tokens = {};
  // Socket ids, not slot types: a Tier II build carries two organs, so the
  // second one lands in `organ2` instead of overwriting the first.
  const used = new Set();
  for (const pid of partIds) {
    const part = content.parts[pid];
    if (!part) continue; // R72: a retired id measures as the build without it
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
  chimera.moveset = benchMoveset(
    knownMoves(chimera, content, () => movesFromTokens(Object.values(tokens), report, content))
  );
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
//
// R88 moved it into battle/autoplay.js and this imports it. It is the SAME
// policy the game now flies when a player sends a fight instead of watching
// it, which is the point: the yardstick and the game must not be two
// different pilots, or the harness is measuring a game nobody plays.

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
    // R72 - a combo outlives its own halves: combos.json names part ids, and
    // a part retired from parts.json leaves the combo pointing at nothing.
    // The build it describes cannot be assembled, so the yardstick skips it
    // rather than throwing on `content.parts[p].slot` on the way to measuring
    // it. This is the sim's DEFAULT path (runSim falls back to sampleBuilds),
    // so unguarded it took the whole harness down, not one row of the table.
    if (combo.parts.some((p) => !content.parts[p])) continue;
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
  const chimera = makeSimChimera(arch.frame, partsOnFrame(content, arch.frame, arch.partIds), grade, content);
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
  const chimera = makeSimChimera(arch.frame, partsOnFrame(content, arch.frame, arch.partIds), grade, content);
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
import { pairingForecast, expressedTraits, incubatorSlots, BREEDING, canBreed, breedPair, hatchEgg, variantsOf } from '../ranch/breeding.js';

const BREEDING_MUTATION = BREEDING.mutationChance;
import {
  incubatorGrants, extractorGrants, scannerGrants, infirmaryGrants,
  nextUpgrade, buyUpgrade,
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
    anatomy: 'ground',
    name: 'Boots on the Ground',
    frame: 'M',
    partIds: ['rhino_head', 'gorilla_forelimbs', 'rhino_hindlimbs', 'bear_tail', 'pangolin_hide', 'bear_organ'],
  },
  wings: {
    anatomy: 'air',
    name: 'Wings',
    frame: 'M',
    partIds: ['eagle_head', 'eagle_forelimbs', 'eagle_hindlimbs', 'eagle_tail', 'bat_hide', 'bear_organ'],
  },
  gills: {
    anatomy: 'water',
    name: 'Gills',
    frame: 'M',
    partIds: ['shark_head', 'shark_forelimbs', 'shark_hindlimbs', 'shark_tail', 'tortoise_hide', 'bear_organ'],
  },
  fumes: {
    anatomy: 'gas',
    name: 'Fumigation',
    frame: 'M',
    // Same discipline as `noise` below, and for the same reason: one water
    // limb and one ground limb, so the affinities tie and the build is
    // Unclassed. It used to be Unclassed by ACCIDENT — two octopus tentacles
    // and a cobra head, none of which were in any affinity table. R32 put
    // tentacles in one (an octopus voting for nothing was a bug), and the
    // Gas axis silently became a second Water build: it rode the same
    // triangle advantage as `gills` and jumped from 72% to 94% in Kestrel,
    // closing that region's identity margin to 6pp. An archetype that
    // isolates one axis must not carry a class advantage as well.
    //
    // The tie comes from a WING rather than a leg on purpose. A ground limb
    // votes Ground and therefore swings a Ground-tagged move, which is a
    // fifth attack tag competing for four move slots — and the one it pushed
    // out was the Gas answer this archetype exists to measure. Scale Storm
    // is a Gas attack whose anatomy votes Air, so it buys the tie and feeds
    // the axis with the same part.
    partIds: ['cobra_head', 'moth_forelimbs', 'octopus_hindlimbs', 'scorpion_tail', 'skunk_hide', 'skunk_organ'],
  },
  //   noise  — armour-piercing. Sonic ignores Armor outright, which is the
  //            only thing that answers a region built entirely out of
  //            plating. Its organ is enemy tech, salvaged from the region
  //            before the one that demands it.
  // A9. Five archetypes all fielded on the M frame, which is exactly why
  // the audit found the frame was never a decision: nothing in the bench
  // ever asked the question. `kite` is the build the Kite chassis exists
  // for — five parts, one wing pair, light enough to be genuinely airborne
  // at plain standard grade, which makes every Ground-tagged enemy move
  // swing under it.
  kite: {
    anatomy: 'air',
    name: 'Kite',
    frame: 'A',
    // Deliberately the SAME loadout as `wings`, minus the hindlimb the
    // chassis has nowhere to bolt. The two archetypes then differ by
    // exactly one thing — the frame — which is the question A9 exists to
    // ask. Giving the Kite better parts would have measured the parts.
    partIds: ['eagle_head', 'eagle_forelimbs', 'eagle_tail', 'bat_hide', 'bear_organ'],
  },
  noise: {
    anatomy: 'sonic',
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
    makeSimChimera(ARCHETYPES[key].frame, partsOnFrame(content, ARCHETYPES[key].frame, ARCHETYPES[key].partIds), grade, content)
  );
}

// The encounters a region actually fields, in node order.
export function regionEncounterIds(region) {
  return region.nodes.map((n) => n.encounter);
}

// A8. The conditions a player actually arrives at a node with. `benchGrade`
// and `benchTeam` are declared per strip and overridable per node, because a
// strip is not reached all at once — Greenfield's Guard Post sits behind
// Threat Gen 2 and is 4% at the strip's `standard` grade against 48% at
// `prime`, which is what a player brings to it.
export function nodeConditions(region, node) {
  return {
    grade: node.benchGrade ?? region.benchGrade ?? 'prime',
    team: node.benchTeam ?? region.benchTeam ?? 3,
  };
}

// Is this node climbable AT ALL under those conditions? Best of the
// archetypes rather than the average: the question is whether some build a
// player could reasonably field gets through, not whether every one does.
// A frame may declare which slot types its geometry supports (A9). Fielding
// an archetype on a chassis that has nowhere to bolt one of its parts is not
// a legal build, so the harness drops it rather than measuring a creature
// the Theater would refuse.
export function partsOnFrame(content, frame, partIds) {
  const slots = content.frames[frame]?.slots;
  return slots ? partIds.filter((id) => slots.includes(content.parts[id].slot)) : partIds;
}

export function nodeClimbability(content, region, node, { seedsPer = 24 } = {}) {
  const { grade, team } = nodeConditions(region, node);
  let best = 0, who = null;
  for (const [key, arch] of Object.entries(ARCHETYPES)) {
    let wins = 0;
    for (let s = 0; s < seedsPer; s++) {
      const chimera = makeSimChimera(arch.frame, partsOnFrame(content, arch.frame, arch.partIds), grade, content);
      const r = scriptedBattle(chimera, content.encounters[node.encounter], content,
        hashString(`climb${region.id}${node.id}${key}${s}`), team);
      if (r.outcome === 'win') wins++;
    }
    if (wins / seedsPer > best) { best = wins / seedsPer; who = key; }
  }
  return { best, who, grade, team };
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
      const chimera = makeSimChimera(arch.frame, partsOnFrame(content, arch.frame, arch.partIds), grade, content);
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
    const chimera = makeSimChimera(build.frame, partsOnFrame(content, build.frame, build.partIds), grade, content);
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


// --- R103: does playing the fight well change the fight? -------------------
//
// The yardstick had a hole in the shape of the player. Every table above
// measures a BUILD, flown by one fixed pilot at skill 0.8, so a change that
// made the arena deeper or shallower moved nothing here and nothing anywhere
// else — the sixth audit had to write a throwaway probe to find out that
// pressing the first button was worth 2.5 points less than playing well.
//
// The same builds, the same encounters, under pilots that differ ONLY in how
// they choose. The gap between them is what a decision is worth.
//
// BUCKETED BY THE BRIEFING'S OWN VERDICT, which is the half that makes the
// number mean anything. Measured over the uniform grid, 72-81% of pairings
// are called walkover or not-survivable before a move is pressed — a day-one
// build against the Compliance Spire cannot be saved by any pilot, and a
// walkover cannot be lost by one. Averaging those in reports a skill spread
// of about three points and hides a real one of fifteen. The LIVE bands
// (favoured, even, losing) are the fights a player can actually influence,
// and they are where this number lives.
export const PILOTS = {
  // The ceiling: the same policy the opposition plays, flown perfectly.
  'skill 1.0': (content) => (battle, actions) => skilledAction(battle, actions, content, 1),
  // What the briefing PROMISES. If this one falls, the forecast starts lying
  // to the player in the optimistic direction, which is the one direction it
  // must never lie in — so it is a floor, not a target.
  'skill 0.8': (content) => (battle, actions) => skilledAction(battle, actions, content, 0.8),
  'skill 0.5': (content) => (battle, actions) => skilledAction(battle, actions, content, 0.5),
  // The three ways a person actually plays when they are not thinking.
  strongest: (content) => (battle, actions) => {
    const me = playerActive(battle);
    const moves = actions.filter((a) => a.type === 'move')
      .sort((x, y) => me.moves[y.index].power - me.moves[x.index].power);
    return moves[0] ?? actions.find((a) => a.type === 'rest') ?? actions[0];
  },
  first: () => (battle, actions) =>
    actions.find((a) => a.type === 'move') ?? actions.find((a) => a.type === 'rest') ?? actions[0],
  random: () => (battle, actions) => {
    const pool = actions.filter((a) => a.type === 'move' || a.type === 'rest');
    return pool[Math.floor(rngStream(battle.seed, 'agency', battle.rollCount++)() * pool.length)] ?? actions[0];
  },
};

// R103 — the skilled pilots read the WHOLE action space (brace and the
// counter-switch included), because that is what a player who is paying
// attention has in front of them. The unskilled ones below still only press
// buttons, which is the entire point of the comparison: the gap between them
// is what paying attention is worth.
function skilledAction(battle, actions, content, skill) {
  return choosePlayerAction(battle, actions, content, skill,
    () => rngStream(battle.seed, 'agency', battle.rollCount++)()) ?? actions[0];
}

function flyBattle(team, encounter, content, seed, pilot) {
  const battle = createBattle(team, encounter, content, seed, 1);
  let guard = 0;
  while (!battle.over && guard++ < 300) {
    const actions = playerActions(battle);
    if (!actions.length) break;
    const release = actions.find((a) => a.type === 'release');
    const action = release ?? (battle.pendingReplace ? actions[0] : pilot(battle, actions));
    if (!action) break;
    step(battle, action, content);
  }
  return battle.outcome === 'win';
}

export const LIVE_BANDS = ['favoured', 'even', 'losing'];

// `runs` is the forecast's sample for BANDING a pairing — it decides which
// bucket the row lands in, not the win rate reported, so it is cheap on
// purpose. The win rates come from the pilots actually flying the fight.
// MIXED TEAMS, not three copies of one animal.
//
// The first version of this fielded `[c, {...c}, {...c}]` — the yardstick's
// own habit, and correct for pricing a BUILD. It is wrong for pricing a
// DECISION: three clones share one class, so the counter-switch this phase
// shipped could never once fire in the fixture that was supposed to measure
// it. A gate can be perfectly general and still stand where the new code
// cannot be reached (R85, R86, R87, and now here).
//
// So a team is three DIFFERENT builds, spread across classes where the pool
// allows, which is also the team the game actually hands a player (R41's
// stable of three, A1's three bodies).
function mixedTeams(chimeras, count, content) {
  const byClass = new Map();
  for (const c of chimeras) {
    // The class is ANATOMY, computed by `analyze` on the way into a
    // combatant — it is not a field on the chimera record, and reading it as
    // one put all 68 builds in a single bucket and quietly rebuilt the
    // clone teams this function exists to replace.
    const key = analyze(c.frame, Object.values(c.tokens), content).creatureClass ?? 'none';
    if (!byClass.has(key)) byClass.set(key, []);
    byClass.get(key).push(c);
  }
  const classes = [...byClass.keys()];
  const teams = [];
  for (let i = 0; i < count; i++) {
    const team = [];
    for (let slot = 0; slot < 3; slot++) {
      const pool = byClass.get(classes[(i + slot) % classes.length]) ?? chimeras;
      const pick = pool[(i + slot * 7) % pool.length];
      team.push({ ...pick, id: `${pick.id}#${slot}` });
    }
    teams.push(team);
  }
  return teams;
}

export function agencyTable(content, { grade = 'standard', builds = 40, seeds = 3, bandRuns = 16 } = {}) {
  const pilots = Object.fromEntries(Object.entries(PILOTS).map(([k, make]) => [k, make(content)]));
  const chimeras = sampleBuilds(content, builds, 2026)
    .map((b) => makeSimChimera(b.frame, b.partIds, grade, content));
  const teams = mixedTeams(chimeras, builds, content);
  const encounterIds = Object.keys(content.encounters);
  const bands = {};
  const seedList = Array.from({ length: seeds }, (_, i) => i + 1);
  for (const encId of encounterIds) {
    const encounter = content.encounters[encId];
    for (const team of teams) {
      const band = bandFor(forecast(team, encounter, content, 1, 0, { runs: bandRuns }).winRate).id;
      const bucket = (bands[band] ??= { pairings: 0, fights: 0, wins: {} });
      bucket.pairings++;
      for (const seed of seedList) {
        bucket.fights++;
        for (const [name, pilot] of Object.entries(pilots)) {
          bucket.wins[name] = (bucket.wins[name] ?? 0) + (flyBattle(team, encounter, content, seed, pilot) ? 1 : 0);
        }
      }
    }
  }
  const live = { pairings: 0, fights: 0, wins: {} };
  for (const band of LIVE_BANDS) {
    const b = bands[band];
    if (!b) continue;
    live.pairings += b.pairings;
    live.fights += b.fights;
    for (const [k, v] of Object.entries(b.wins)) live.wins[k] = (live.wins[k] ?? 0) + v;
  }
  const rate = (bucket, name) => (bucket.fights ? bucket.wins[name] / bucket.fights : 0);
  return {
    grade,
    bands,
    live,
    pairings: Object.values(bands).reduce((n, b) => n + b.pairings, 0),
    rate,
    // The headline: what a decision is worth where a decision can matter.
    spread: rate(live, 'skill 1.0') - rate(live, 'first'),
    spreadVsRandom: rate(live, 'skill 1.0') - rate(live, 'random'),
    forecastRate: rate(live, 'skill 0.8'),
  };
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
  // R103 — the agency table, on request. It flies six pilots over the whole
  // grid, which is six times the work of the balance table, so it is a flag
  // rather than part of every run.
  if (args.agency) {
    const grades = String(args.agency === true ? 'standard,prime,apex' : args.agency).split(',');
    console.log('agency: what a decision is worth, by the briefing\'s own verdict\n');
    for (const grade of grades) {
      const a = agencyTable(content, { grade, builds: opts.builds, seeds: opts.seedsPer });
      console.log(`grade ${grade} — ${a.pairings} pairings`);
      console.log('  band        pairings  share   ' + Object.keys(PILOTS).map((k) => k.padStart(9)).join(' '));
      for (const band of ['walkover', 'favoured', 'even', 'losing', 'hopeless']) {
        const b = a.bands[band];
        if (!b) continue;
        const cells = Object.keys(PILOTS).map((k) => pct(a.rate(b, k)).padStart(9)).join(' ');
        console.log(`  ${band.padEnd(11)} ${String(b.pairings).padStart(8)}  ${pct(b.pairings / a.pairings).padStart(5)}   ${cells}`);
      }
      const cells = Object.keys(PILOTS).map((k) => `${(100 * a.rate(a.live, k)).toFixed(1)}%`.padStart(9)).join(' ');
      console.log(`  ${'LIVE'.padEnd(11)} ${String(a.live.pairings).padStart(8)}  ${pct(a.live.pairings / a.pairings).padStart(5)}   ${cells}`);
      console.log(`  → a decision is worth ${(a.spread * 100).toFixed(1)}pp over the first button, ${(a.spreadVsRandom * 100).toFixed(1)}pp over mashing`
        + `; the forecast's own pilot wins ${pct(a.forecastRate)} of live fights\n`);
    }
    console.log(`agency in ${Date.now() - t0}ms`);
    return;
  }
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

// --- R56: the playthrough, walked ----------------------------------------
//
// Every measurement this project owns is a SLICE. runSim benches a build,
// ladderBench a ladder, regionBench a strip, facilityPayback a track. All of
// them answer "is this thing balanced" and none of them answers "what is it
// like to play this from an empty ranch". R41's trajectory math — L8 at
// dominion, L10 on a realistic diet — is an assumption the entire late game
// rests on, and it has never been walked end to end.
//
// The walker does not invent a policy. It reads `agendaShape`, which is the
// game's OWN answer to what a player can do right now, and does everything
// productive it offers. Two consequences worth stating: the curve it reports
// is the game's designed pace rather than my idea of one, and a tick where
// the agenda offers no productive action IS the stall this phase is looking
// for — measured with the same code the Ranch screen renders from.
//
// It is a diligent player, not an optimal one: it takes what is in front of
// it in a fixed order and never plans. A real player will be slower, so
// every day count here is a FLOOR.
import { agendaShape } from '../ranch/agenda.js';
import { newGameState } from '../save/save.js';
import { ensureRanchSeeded } from '../ranch/ranch.js';
import { tickWorld } from '../campaign/world.js';
import { resolveBattle, incomePerDay, salvageUnit } from '../campaign/campaign.js';
import { careAction, careStatus, buyMailOrder, buyPenUpgrade, catalogFor, isNewToDex, ageStage, upkeepPerDay, penUpgradeCost } from '../ranch/ranch.js';
import { extractAnimal, extractChimera, avgStars } from '../splice/extract.js';
import { salvagePreview } from '../splice/extract.js';
import { vaultPressure, surplusParts, renderDown } from '../splice/vault.js';
import { stableRoom } from '../splice/facility.js';
import { spliceChimera, validateSplice, trainChimera, TRAINING, setMoveset, moveTrainingReady } from '../splice/theater.js';
import { MOVE_SLOTS } from '../battle/moves.js';
import { feralStatus } from '../splice/feral.js';
import { activeVat, vatPlan, startVat } from '../splice/chaos.js';
import { activeResequence, resequencePlan, startResequence } from '../splice/resequencer.js';
import { startOperation, operationList, opReady, laneFree } from '../campaign/operations.js';
import { startSpar, canSpar, sparEncounter, sparPartners } from '../campaign/sparring.js';
import { levelOf } from '../battle/veterancy.js';
import { regionStates } from '../campaign/campaign.js';
import { regionOfNode } from '../campaign/map.js';
import { contestEncounter } from '../campaign/contest.js';
import { looseSpecimens, breakoutEncounter } from '../campaign/breakout.js';
import { rehabPlan, startRehab, rehabSession, sessionReadyAt } from '../campaign/rehab.js';

const WALK_HOUR = 3600000;
const WALK_DAY = 24 * WALK_HOUR;

// Fill a frame from whatever is in the vault, best grade first. Deliberately
// unclever: the point is to measure the pace of the loop, not to find the
// strongest build the vault allows.
// `wanted` is the class the map says answers the strip in front of the
// player (R37's `demand` line). A player who reads it dresses the frame in
// that anatomy first and fills the rest by grade; the first walker ignored
// it and took a mixed-class roster to the Aerodrome 33 times.
const GRADE_ORDER = ['standard', 'prime', 'apex', 'prismatic'];

export function bestSplice(state, content, wanted = null, wall = null) {
  const owned = state.inventory.parts;
  if (!owned.length) return null;
  // R92 — A PLAYER WHO OWNS BOTH HALVES OF A COMBO BUILDS WITH THEM.
  //
  // This ranked by grade and by the class the map asks for, and nothing
  // else, so across 180 days and every splice it ever made the walk
  // discovered ZERO of the 27 combos. R16 and R17 were whole milestones
  // spent pricing combos against the moves of the parts that unlock them,
  // and the yardstick had never once seen one — every claim either of them
  // makes rests on a bench run, not on a campaign.
  //
  // The bias is what the Splice-Dex tells the player to do: if you already
  // own the two parts a combo needs, put them in the same creature. Weighed
  // above class and grade because a combo IS the reward for collecting the
  // pair, and a build that ignores one it could have is not what a player
  // who read the screen would make.
  // R93b — ONE COMBO AT A TIME, AND AN UNDISCOVERED ONE.
  //
  // R92 boosted every part of every completable combo equally, and the
  // greedy fill below then took whichever ranked highest — the SAME pair
  // every time. Measured across seven seeds: 28 of the 51 combos a campaign
  // could actually assemble, 55%, with the misses being pairs it owned all
  // along and kept passing over for the one it had already found.
  //
  // The fix is narrower than "pick a target": it is to stop boosting the
  // ones already FOUND. R92 weighed every completable pair including the
  // combos this campaign had discovered years ago, so the highest-ranked
  // parts stayed the same and the walker rebuilt the same creature. Aiming
  // at a single target instead was worse (62%, and one seed fell from 89% to
  // 22%) because a six-socket frame can carry SEVERAL pairs at once, and
  // naming one throws the others away.
  //
  // So: every pair it could complete and has not yet seen, all boosted, and
  // the greedy fill below is free to land two or three of them on one
  // creature — which is what a player reading the Splice-Dex does.
  const ownedIds = new Set(owned.map((t) => t.partId));
  const found = new Set(state.discoveredCombos ?? []);
  const completable = new Set();
  for (const combo of Object.values(content.combos ?? {})) {
    const need = combo.parts ?? [];
    if (!need.length || found.has(combo.id)) continue;
    if (need.every((pid) => ownedIds.has(pid))) for (const pid of need) completable.add(pid);
  }
  const rank = (t) => (completable.has(t.partId) ? 30 : 0)
    + (wanted && content.parts[t.partId]?.classAffinity === wanted ? 10 : 0)
    + GRADE_ORDER.indexOf(t.grade);
  // R141 — THE FRAME IS A CHOICE, AND THE WALK NEVER MADE IT.
  //
  // Six campaigns, 64 surviving chimeras: M x 57, S x 4, L x 3, A x 0. Two
  // reasons, and this loop was both of them.
  //
  // It filled `slots` from the whole vault WITHOUT asking which sockets the
  // chassis actually has, so a hindlimb part landed in `slots.hindlimbs` and
  // `validateSplice` then refused the Kite outright — "The Kite Frame has no
  // hindlimbs to bolt that to" — for owning a leg. And it RETURNED on the
  // first frame that validated, in the fixed order M, S, L, A, so A was
  // unreachable the moment M worked. Neither is balance: a campaign could
  // not build a Kite if it wanted to.
  //
  // So every frame is filled from its own socket list, scored, and the best
  // one wins. Ties go to the earlier frame, which keeps M, S, L exactly where
  // they were whenever nothing distinguishes them.
  //
  // TWO FILLS PER FRAME, judged by the same score. The first is the vault's
  // best by rank, unchanged. The second prefers a part that makes LIFT,
  // because a player who reads "their Ground attacks miss it entirely" on
  // the briefing does not reshuffle their grades — they go and bolt wings
  // on, and the greedy fill above has no way to arrive at that. It matters
  // for exactly one frame: of the 40 bodies the catalogue can build with
  // eagle wings, EIGHT fly on the Kite and on nothing else at prime (nine at
  // standard), and every one is a heavy animal — bear, tiger, gorilla,
  // crocodile. Everything light enough to fly on a Scamper already does,
  // with a sixth socket the Kite does not have.
  const liftFirst = (t) => rank(t) + ((content.parts[t.partId]?.phys?.lift ?? 0) > 0 ? 50 : 0);
  let best = null;
  for (const frameId of ['M', 'S', 'L', 'A']) {
    const frame = content.frames[frameId];
    if (!frame) continue;
    const chassis = frame.slots ?? CHASSIS_SLOTS;
    for (const order of [rank, liftFirst]) {
      const used = new Set();
      const slots = {};
      for (const token of [...owned].sort((a, b) => order(b) - order(a))) {
        const part = content.parts[token.partId];
        if (!part || used.has(token.id) || slots[part.slot]) continue;
        if (!chassis.includes(part.slot)) continue;
        slots[part.slot] = token.id;
        used.add(token.id);
      }
      if (!slots.head) continue;
      if (validateSplice(state, frameId, slots, content).length !== 0) continue;
      // R91 — the plan carries its own score, on the SAME yardstick the
      // roster is ranked by (`quality`), so "is this worth dismantling
      // something for" is a comparison rather than a guess. A fresh splice
      // is level 1, hence the bare grade sum.
      const byId = new Map(owned.map((t) => [t.id, t]));
      const blank = blankedAgainst(state, content, frameId, slots, wall);
      const score = 10 + Object.values(slots)
        .reduce((n, id) => n + GRADE_ORDER.indexOf(byId.get(id)?.grade ?? 'standard'), 0)
        + blank + grindAgainst(content, frameId, wall);
      if (!best || score > best.score) best = { frameId, slots, score, blank };
    }
  }
  return best;
}
const CHASSIS_SLOTS = ['head', 'forelimbs', 'hindlimbs', 'tail', 'hide', 'organ'];

// R146 — EVERY HERITABLE TRAIT THE CAMPAIGN CAN SEE, in one place.
//
// This scan was written inline inside the walk's report to count traits, and
// R146 needed the same three lists to answer WHEN the first one showed. Two
// copies of a scan is how the shard table came to hold `regions` twice, so
// it is one function with two callers: the report asks for `.size`, the tick
// asks whether there is anything at all.
//
// Stock, stable and vault, because a trait is stamped into a part at
// extraction and rides it into whatever wears it — so a trait can be present
// in the vault with no animal left carrying it.
function traitsOn(state) {
  const seen = new Set();
  for (const a of state.ranch.stock) for (const t of a.traits ?? []) seen.add(t);
  for (const c of state.chimeras) {
    for (const tk of Object.values(c.tokens ?? {})) for (const t of tk.traits ?? []) seen.add(t);
  }
  for (const tk of state.inventory.parts) for (const t of tk.traits ?? []) seen.add(t);
  return seen;
}
// The tick wants the first one only, and stops as soon as it has it.
function firstTraitOn(state) {
  for (const a of state.ranch.stock) for (const t of a.traits ?? []) return t;
  for (const c of state.chimeras) {
    for (const tk of Object.values(c.tokens ?? {})) for (const t of tk.traits ?? []) return t;
  }
  for (const tk of state.inventory.parts) for (const t of tk.traits ?? []) return t;
  return null;
}

// R141 — WHAT THE FRAME BUYS AGAINST THE WALL IN FRONT.
//
// The grade sum above is blind to the matchup layer the BRIEFING has shown
// the player since R35: the chart rules that fire between a build's tags and
// the opposition's. A Kite gives up a socket — five, no hindlimbs, which
// costs a bear build 17 of its 127 HP and one of its four moves — and takes
// back whatever `Ground misses Airborne` is worth against this particular
// wall. Same parts on both frames, prime, team of three: the eight bodies
// that fly on the Kite and on nothing else are worth +13.9pp there over a
// Scamper against the ten encounters that swing low, and -1.3pp against the
// seven that shoot. That is exactly the trade a player reading the
// opposition line makes, so the walker reads the same line.
//
// The weight is measured, not chosen. A socket is worth about 12.5pp — a
// prime bear on a Trotter wins 59.6% of the table and 47.1% with its
// hindlimb bay taken away. A full blank is worth about 20pp: the 13.9pp
// above was bought against a wall that is roughly 70% Ground, not 100%. So
// a full blank buys back 1.6 sockets, and a socket is the three grade steps
// the sum above already counts in.
//
// Derived from `content.tagChart`, never from the word "Ground", so a new
// chart row moves the walker with no edit here.
const BLANK_WORTH = Math.round(1.6 * (GRADE_ORDER.length - 1));
function blankedAgainst(state, content, frameId, slots, wall) {
  if (!wall) return 0;
  const tokens = Object.values(slots)
    .map((id) => state.inventory.parts.find((t) => t.id === id)).filter(Boolean);
  const report = analyze(frameId, tokens, content, tokens.length);
  const mine = new Set(['Organic', ...(report.tags ?? [])]);
  const dead = new Set((content.tagChart ?? [])
    .filter((r) => r.mult === 0 && mine.has(r.defender)).map((r) => r.attack));
  if (!dead.size) return 0;
  let blanked = 0, thrown = 0;
  for (const uid of wall.waves ?? []) {
    for (const move of (content.enemies[uid]?.moves ?? [])) {
      const power = move.power ?? 0;
      if (!power) continue;
      thrown += power;
      if ((move.tags ?? []).some((t) => dead.has(t))) blanked += power;
    }
  }
  return thrown ? Math.round(blanked / thrown * BLANK_WORTH) : 0;
}

// R148 — WHAT MASS BUYS AGAINST THE WALL IN FRONT.
//
// The grade sum ties the three six-bay chassis on almost every plan — with
// the Rumbler unlocked it tied the winner in 250 of 321 splice decisions —
// and a tie goes to whichever frame the loop reaches first, which is why six
// campaigns spliced 79 Trotters and no Rumblers at all.
//
// A tie-break is not a reason, though, so this is the reason: bulk is worth a
// frame against a LONG fight and costs you in a short one (+2.3pp and -0.0pp
// after R148's repricing). What predicts how long a fight runs is not how
// hard the wall swings — that correlates at r = +0.08 — but how many typical
// hits it takes to clear: total health over the size of an average move,
// r = +0.57 across the 26 encounters, the best of nine things measured.
//
// Both halves are read off the table rather than named, so an encounter added
// to enemies.json moves this with no edit here. Worth at most two grade steps
// — enough to break a tie the grade sum leaves, and never enough to outrank a
// real difference in the parts on offer.
const GRIND_WORTH = 2;
function grindAgainst(content, frameId, wall) {
  if (!wall) return 0;
  const hitsToClear = (enc) => {
    let hp = 0; let power = 0; let moves = 0;
    for (const uid of enc.waves ?? []) {
      const unit = content.enemies[uid];
      if (!unit) continue;
      hp += unit.hp ?? 0;
      for (const move of (unit.moves ?? [])) { const p = move.power ?? 0; if (p) { power += p; moves++; } }
    }
    return moves && power ? hp / (power / moves) : 0;
  };
  const across = Object.values(content.encounters).map(hitsToClear);
  const low = Math.min(...across);
  const high = Math.max(...across);
  if (!(high > low)) return 0;
  const grind = Math.min(1, Math.max(0, (hitsToClear(wall) - low) / (high - low)));
  const heaviest = Math.max(...Object.values(content.frames).map((f) => f.phys?.mass ?? 0));
  if (!heaviest) return 0;
  const bulk = (content.frames[frameId]?.phys?.mass ?? 0) / heaviest;
  return Math.round(grind * bulk * GRIND_WORTH);
}

// R92 — how many stalls the opportunistic creators leave alone. A quarter of
// a twelve-stable, which is what it takes for the Surgery Theater to get a
// turn at all on a 180-day campaign.
const THEATER_STALLS = 3;

// R92 — THE HERD THE WALKER WORKS, which is not the paddock it could fill.
//
// R120 measured this and wrote the rule into smoke: an uncapped walker fills
// every pen it can buy, 41 animals, and the upkeep took R86's rushes to
// zero. Its fix was a buying policy. Teaching the walker to run the
// Resequencer re-opened the same hole from the other side — a decant needs
// only pen ROOM, so the herd refilled to 39 against a bound of 20 and the
// walker bought pens to keep up.
//
// So the number belongs in one place rather than in each thing that can add
// an animal. Twenty is a working stable: enough to breed and graduate from,
// few enough that every earlier phase's numbers stay comparable.
const WORKING_HERD = 20;

// One tick of a diligent player. Three rules, stated because a walker's
// policy is half of every number it reports:
//
//  1. CARE FIRST. It is nearly free and condition decays without it.
//  2. KEEP A RESERVE. Doing nothing nets +22/day (a $40 stipend against $18
//     of upkeep), so the passive economy is solvent — but the first policy
//     spent to $3 training six chimeras and then could not buy an animal or
//     feed the ones it had. Discretionary spending stops at fourteen days of
//     upkeep in hand. Fourteen because that is comfortably longer than any
//     timer the game asks a player to wait out.
//  3. DO NOT THROW CREATURES AT A WALL. The first policy assaulted every
//     tick and went 140-1191, which measures the walker rather than the
//     game. One assault a day, and a node that has already beaten this exact
//     roster is not tried again until the roster changes.
const WALK_RESERVE_DAYS = 14;

// R63 rewrote the fighting half of this policy, because the first version
// was measuring the walker rather than the game in four separate ways, and
// the audit filed the result as a design finding:
//
//   - it called startSpar() and never fought the spar, so every charge was
//     burned for zero xp and the ladder R43 built out of the wall was never
//     climbed;
//   - it never ran a rescue raid, so every capture-on-loss was a dissection,
//     and with a loss a day the veterans drained out faster than they
//     levelled — xp at day 180 read [168, 19, 0, 0, 0, 0];
//   - it resolved defences through resolveContest() directly, skipping
//     finishBattle: no xp, no injuries, no capture on a lost defence;
//   - its "do not retry a node that beat this roster" rule keyed on total xp,
//     which changes after every fight, so it retried guard_post 93 times.
//
// A player who reads the Pens sends the best three, spars when the ring is
// charged, rescues a captured creature, waits for the Infirmary when the
// window allows, and tries the next node when one keeps winning. None of
// that is optimal play; all of it is the game's own instructions.
function walkAct(state, content, now, open, opts = {}) {
  const has = (id) => open.some((i) => i.id === id);
  const lvl = (c) => levelOf(c.xp ?? 0, content);
  // What a player reads off the Pens: level first, then the grades on the
  // card. The A-team is the best three whether or not they are fit.
  const quality = (c) => lvl(c) * 10 + Object.values(c.tokens ?? {}).reduce((n, t) => n + GRADE_ORDER.indexOf(t.grade), 0);
  const isFit = (c) => !c.injury || c.injury.until <= now;
  const fitAll = () => state.chimeras.filter(isFit).sort((x, y) => quality(y) - quality(x));
  const fitTeam = () => fitAll().slice(0, 3);
  const fullTeam = () => Math.min(3, state.chimeras.length);
  const aTeamFit = () => [...state.chimeras].sort((x, y) => quality(y) - quality(x)).slice(0, 3).every(isFit);
  const stepMs = (opts.stepHours ?? 2) * WALK_HOUR;
  const log = (entry) => (state.__walkLog ??= []).push({ day: +((now - (opts.t0 ?? 0)) / WALK_DAY).toFixed(2), ...entry });
  // R120 — EVERY VERB, not only the ones with an opponent. `log` was called
  // from exactly one place, the `fight` helper below, so across 90 days the
  // walk's own record held 502 entries and every one was a battle. Care,
  // graduation, splicing, training, buying, rushing and treating — most of
  // what a player actually does when they open the app — left no trace at
  // all, which meant the harness could answer "how many fights" and could
  // not answer "how much is there to do". Every branch reports through this.
  const did = (kind, detail = {}) => { acted++; log({ kind, ...detail }); return true; };
  // One fight, through the same door the War Room uses.
  const fight = (team, enc, context, seedKey) => {
    const battle = createBattle(team, enc, content, hashString(seedKey), now, context);
    // R88 — ask the briefing's own question BEFORE the fight is flown, so
    // the walk can price what a campaign costs the eye and how much of that
    // the player never needed to sit through. Sampling is a knob because
    // this is 12 extra battles per fight: `sendable` walks want it, every
    // other walk in the suite does not and should not pay for it.
    let fc = null;
    if (opts.priceBeats) {
      try { fc = forecast(team, enc, content, hashString(seedKey), now, { runs: 12 }); } catch { fc = null; }
    }
    walkAutoplay(battle, content);
    const before = state.chimeras.length;
    state.battle = battle;
    resolveBattle(state, battle, content, now);
    state.battle = null;
    log({ kind: context.kind, node: context.nodeId ?? null, outcome: battle.outcome, escalation: enc.escalation,
      // What the arena would have spent replaying this, and whether the
      // player would have been offered the chance not to.
      beats: (battle.__beats ?? []).length,
      ms: replayCost(battle.__beats),
      sendable: fc ? canSend(fc, context) : undefined,
      // R83 — what the Containment Cannon actually bagged. Counting BAYS
      // instead proves nothing: a held defence impounds the wreckage too, so
      // a walker that never fires the cannon still fills them. Break 46 of
      // the battery was written against the bay count, missed, and is why
      // this number exists.
      bagged: (battle.captured ?? []).length,
      team: team.map((c) => c.xp ?? 0), grades: team.map((c) => Object.values(c.tokens).map((t) => t.grade[0]).join('')),
      fit: team.length, held: state.campaign.heldNodes.length, lost: state.chimeras.length < before });
    return battle;
  };
  const reserve = upkeepPerDay(state, content) * WALK_RESERVE_DAYS;
  const canSpend = (cost) => state.funds - cost >= reserve;
  let acted = 0;

  if (has('care')) {
    for (const animal of [...state.ranch.stock]) {
      const status = careStatus(animal, now);
      for (const kind of ['feed', 'groom', 'exercise', 'enrich']) {
        if (status[kind]?.ready && careAction(state, animal.id, kind, content, now).ok) did('care', { who: animal.id, act: kind });
      }
    }
  }
  // …and buy out of the Infirmary on the same terms. R83's rule: a system
  // the walker never uses is one the yardstick cannot see, and until R86
  // measured it nobody had asked whether the walker treats. It did not — the
  // one paid skip the game had shipped had never once been exercised here.
  if (has('treat')) {
    // The A-team only: a player pays to patch the creatures that fight and
    // lets the bench heal on its own, and a walker that treated everything
    // spent a third of a campaign's rushes on animals it never fielded.
    const aTeam = new Set([...state.chimeras].sort((x, y) => quality(y) - quality(x)).slice(0, 3).map((c) => c.id));
    for (const c of state.chimeras) {
      if (!aTeam.has(c.id) || !c.injury || c.injury.until <= now) continue;
      if (!canSpend(treatmentCost(c, content, now, state))) continue;
      if (treatInjury(state, c.id, content, now).ok) {
        did('treat', { who: c.id });
        state.__walkTreated = (state.__walkTreated ?? 0) + 1;
      }
    }
  }
  // Graduate adults, never below a breeding pair — a walker that empties its
  // own ranch measures a mistake rather than the game.
  // Graduate at Prime — the ranch card says so ("Graduation forecast", with
  // the headroom still ahead of the animal) and Prime is 14–36h from birth.
  // Adults go early only while the stable is still being bootstrapped.
  if (has('graduate') && state.ranch.stock.length > 2) {
    // R92 — OVER THE WORKING HERD, ANYTHING GROWN GOES. A job's livestock
    // arrives whether or not there is room (operations.js, deliberately: a
    // reward that evaporates is worse than no reward), so loot accumulates
    // in a pen the walker will not expand — measured, the herd reached 68
    // against a working size of 20 while every animal in it waited to ripen.
    // A player with too many animals graduates the surplus rather than
    // feeding it; below the working size they wait for Prime, which is what
    // the Ranch card's forecast is for.
    const over = state.ranch.stock.length > WORKING_HERD;
    const ripe = (a) => ['prime', 'elder'].includes(ageStage(a, content, now))
      || (over && ageStage(a, content, now) !== 'juvenile')
      || (state.chimeras.length < 3 && ageStage(a, content, now) !== 'juvenile');
    const donor = state.ranch.stock.find(ripe);
    if (donor && extractAnimal(state, donor.id, content, now).ok) did('graduate', { species: donor.species });
  }
  // R120 — THE RANCH LOOP, which this walker had never once run. `breed`
  // has been on the agenda since M6 and the walk had no branch for it, so
  // the pairing, the incubator, the inheritance and the whole variant ladder
  // were unmeasured — and `hatch` could not appear on the agenda because no
  // egg ever existed to ripen. R83's rule, found again in the harness rather
  // than the game.
  //
  // Hatch FIRST: an egg that has finished is a free animal, and leaving it in
  // the incubator blocks the slot that makes the next one.
  for (const egg of [...(state.ranch.eggs ?? [])]) {
    if (now < egg.hatchAt) continue;
    if (state.ranch.stock.length >= state.ranch.penCapacity) break;
    if (hatchEgg(state, egg.id, content, now).ok) did('hatch', { species: egg.species });
  }
  // …then pair, if a slot is free and the pens have room for what comes out.
  // Deliberately NOT while the pens are full: a player does not start a clock
  // whose payout has nowhere to go, and an egg that cannot hatch is the one
  // way this loop could quietly stall the ranch it is meant to feed.
  // …and A HERD, NOT A HOARD. Eggs cost nothing but time, so a walker that
  // breeds whenever a pen is free breeds unboundedly: measured, the ranch
  // went from 13 animals to 41, the care it owed went with it, and the
  // upkeep on all of them ate the cash that used to pay for rushes — R86's
  // assertion that the walk hurries a clock at least once went from 10
  // rushes to 0. That is the "stable, not a warehouse" rule R25 and R44
  // already apply to chimeras, arriving late on the ranch side. The cap is
  // one above the equilibrium the walker settled at before it could breed,
  // so breeding SUPPLEMENTS the catalog rather than replacing it and every
  // number the earlier phases measured stays comparable.
  //
  // R95 — AND IT WAS FOUR BELOW THE HERD THE BUYER FILLS. `WORKING_HERD` is
  // 20 and this was 14, so the moment the catalog rule topped the pens up
  // the breeding rule was locked out for the rest of the campaign: measured,
  // the walk laid between SIX and thirty-two eggs in 180 days with twelve
  // incubator bays standing empty, and the six variant lines — 34 of the 244
  // parts, and the only door those parts come through — were rolled for
  // almost never. Two rules of the same walker disagreeing about how many
  // animals a ranch holds is not a difficulty setting, it is a bug, and it
  // was invisible until something wanted the eggs.
  const HERD_CAP = 14;
  // R95 — and the room a LINE gets, which is the exception the flat cap
  // could not express. Uncapping breeding outright turned the ranch into an
  // egg factory: 118 to 447 hatches in 180 days, upkeep doubled, funds
  // halved and one seed lost five nodes to it. Breeding for its own sake
  // stays at fourteen. Breeding a line that still owes the Splice-Dex a
  // variant gets the whole working herd, because that is the one thing in
  // the game those 34 parts can come from and it needs eggs to find it.
  const wantsVariant = (a) => {
    const held = new Set(state.dex.parts ?? []);
    return variantsOf(a.species, content).some((v) => Object.values(content.parts)
      .some((p) => p.species === v.id && !held.has(p.id)));
  };
  const chasing = state.ranch.stock.some(wantsVariant);
  // R95 — AND THE SHOPPING LIST OUTRANKS THE INCUBATOR. `breed` runs before
  // `buy` in this function, so a breeding herd that fills the pens starves
  // the catalog for the rest of the campaign: one seed finished holding two
  // variant lines and never bought a jellyfish or a pufferfish, twelve parts
  // it could have had for $250. An animal you have never held is six parts
  // for certain; an egg is a one-in-eight chance at six. Keep two pens for
  // the certain one while the catalog still has something new in it.
  const shopping = catalogFor(state, content)
    .some((sp) => isNewToDex(state, content, sp.id) && canSpend(sp.mailOrderPrice));
  const herdRoom = Math.min(state.ranch.penCapacity, chasing ? WORKING_HERD : HERD_CAP)
    - (shopping ? 2 : 0);
  if (has('breed') && (state.ranch.eggs ?? []).length < incubatorSlots(state, content)
      && state.ranch.stock.length + (state.ranch.eggs ?? []).length < herdRoom) {
    const stock = state.ranch.stock;
    // R95 — BREED THE LINE THAT HAS SOMEWHERE TO GO.
    //
    // Six species carry a variant and 34 of the 244 parts are on one, and
    // they arrive by exactly one door: a mutation in the Incubator, at
    // `mutationChance` × `variantShare` — about one egg in forty-two, and
    // only when the parents' stock has a variant to become. The walk laid 75
    // eggs off whichever two animals happened to sit at the front of the
    // pens, so five of the six lines were never even rolled for.
    //
    // A player working the Splice-Dex pairs the ram with the ram. Ordering
    // the candidates instead of taking the first legal one costs nothing and
    // is what the screen's own Breeding Pen is for.
    const pairs = [];
    for (let i = 0; i < stock.length; i++) {
      for (let j = i + 1; j < stock.length; j++) pairs.push([stock[i], stock[j]]);
    }
    pairs.sort((x, y) => (wantsVariant(y[0]) ? 1 : 0) - (wantsVariant(x[0]) ? 1 : 0));
    let paired = false;
    for (const [a, b] of pairs) {
      if (paired) break;
      if (!canBreed(a, b, state, content, now).ok) continue;
      if (breedPair(state, a.id, b.id, content, now).ok) paired = did('breed', { species: a.species });
    }
  }
  // A stable, not a warehouse: R25 prices upkeep per chimera, and the first
  // rewrite spliced everything the vault could dress — nineteen creatures on
  // five nodes of income, and $26 in the bank by day 180. Nine is what R44
  // sized the Pens screen for.
  const frontNode = () => regionStates(state, content).flatMap((r) => r.nodes).find((n) => n.status === 'available');
  const demanded = () => { const f = frontNode(); return f ? (f.node.answer ?? regionOfNode(content, f.node.id)?.answer ?? null) : null; };
  // R141 — the same node, read for its MOVES rather than its class. The map's
  // `answer` names a class; what decides whether a frame is worth its sockets
  // is what the wall actually swings, which is the encounter.
  const walling = () => { const f = frontNode(); return f ? (content.encounters[f.node.encounter] ?? null) : null; };
  if (has('splice')) {
    const wanted = demanded();
    const plan = bestSplice(state, content, wanted, walling());
    // Coherent, or not at all: with a class demanded, a build counts only
    // if most of its class-bearing sockets (head, limbs, tail — hides and
    // organs carry none) answer it. The first walker took two water parts
    // and four leftovers to the Aerodrome, which the bench beats only with
    // a water build. While the stable is below three, anything goes.
    const classSockets = plan ? Object.values(plan.slots)
      .map((id) => content.parts[state.inventory.parts.find((t) => t.id === id)?.partId]?.classAffinity)
      .filter(Boolean) : [];
    const answers = classSockets.filter((c) => c === wanted).length;
    // R92 — A PLAN THAT FINDS A COMBO IS COHERENT WHATEVER ITS CLASS.
    //
    // R83's rule is that a build must answer the class the map asks for, or
    // most of its class-bearing sockets must, and it is right for a creature
    // you intend to fight with. It also vetoed nearly every plan: seven
    // splices in 180 days, and not one of the 27 combos ever discovered.
    //
    // A player chasing a combo is not building a counter, they are building
    // the thing the Splice-Dex is pointing at — and discovering it is the
    // whole reward for having collected the pair (A6). So a plan that
    // completes a combo this campaign has not seen yet passes on its own
    // merit; everything else still has to answer the map.
    const planPids = plan ? Object.values(plan.slots)
      .map((id) => state.inventory.parts.find((t) => t.id === id)?.partId).filter(Boolean) : [];
    const findsCombo = Object.values(content.combos ?? {}).some((k) =>
      (k.parts ?? []).length && k.parts.every((pid) => planPids.includes(pid))
      && !(state.discoveredCombos ?? []).includes(k.id));
    // R141 — AND SO IS A PLAN THAT BLANKS THE WALL.
    //
    // R83's rule reads one of the briefing's two matchup layers. A build
    // whose tags make the opposition's attacks do nothing is answering the
    // OTHER one, and it will almost never answer the class as well: the
    // eight bodies that fly on the Kite and on nothing else are a bear, a
    // tiger, a gorilla, a crocodile — Ground and Water anatomy wearing one
    // pair of Air wings, so `answers` counts one socket and vetoes the
    // creature. Same argument as R92's combo clause, one layer over.
    //
    // The bar is a whole socket's worth of blanking, not any at all: below
    // that the chart did not decide the frame, and a build that merely
    // happens to fly should still have to answer the map.
    const blanksTheWall = (plan?.blank ?? 0) >= GRADE_ORDER.length - 1;
    const coherent = findsCombo || blanksTheWall || !wanted || state.chimeras.length < 3 || answers >= 3;
    if (plan && coherent) {
      // R91 — THE CAP IS THE GAME'S NOW, NOT THE WALKER'S. `stableCap ?? 9`
      // was a hand-typed copy of a rule that did not exist anywhere else,
      // and the moment the Theater started selling stalls the two disagreed:
      // the walker dismantled toward nine while the game allowed twelve, so
      // it churned against its own constant. R61's rule — derive the
      // predicate, never re-type it — and the option survives only so a
      // caller can ask for a SMALLER stable than the facility grants.
      const room = stableRoom(state, content);
      const cap = Math.min(room.cap, opts.stableCap ?? room.cap);
      // NOT `!room.free`. A stall RESERVED by a running Wing programme
      // stops a new creature being made; it is not a reason to take an
      // existing one apart. Reading it as one produced the whole remaining
      // churn: every enrolment reserved a stall, the roster read as full,
      // the walker dismantled its weakest to make room that was never
      // needed, and 142 enrolments turned into 269 dismantles.
      const full = state.chimeras.length >= cap;
      // R91 — REPLACING PAYS A PRICE THE WALKER NEVER COUNTED.
      //
      // The old policy swapped on ANY improvement, which is why a campaign
      // built 1,834 creatures to keep nine: with a bottomless vault and a
      // free table, "slightly better" cost nothing. Capping the vault and
      // occupying the table slowed it to one swap per table cycle and no
      // further, because the comparison was still wrong — it read "is this
      // build better than that creature" when the real question is "is it
      // better by MORE THAN WHAT TAKING THAT CREATURE APART DESTROYS".
      //
      // R13 priced that in the game and the harness ignored it: a dismantle
      // returns a SUBSET of the parts, each one grade worse. So the margin
      // is not a tuning constant — it is `salvagePreview`, the same function
      // the Pens' own confirmation dialog shows the player, counted in the
      // units `quality` is already measured in. A build has to beat what it
      // replaces by more than the grades that replacing burns.
      const ranked = [...state.chimeras].sort((x, y) => quality(y) - quality(x));
      // R95 — AND NOT ONE THAT ARRIVED THIS MORNING.
      //
      // R91 wrote the argument for the Reorientation Wing: "nobody pays a
      // fee, waits out a programme and attends its sessions in order to
      // render the result down the same evening." The chaos vat is the same
      // sentence with a different door, and it never got the rule. Measured
      // once this milestone opened the catalogue: 119 gestations in 180
      // days, every decant scrapped within hours, 200 creatures built to
      // keep ten and a median chimera life of THIRTY-SIX HOURS — against 23
      // built and a median of 91 days with the vat switched off. The vat was
      // not a system being exercised, it was a conveyor belt, and it is
      // self-limiting the moment its output is allowed to occupy a stall.
      //
      // Two days is the floor: a decant settles, fights once, and gets to be
      // judged on that rather than on the scoreboard the minute it is out of
      // the tank.
      const KEEP_DAYS = 2;
      const weakest = ranked.slice(3)
        .filter((c) => isFit(c) && now - (c.createdAt ?? 0) >= KEEP_DAYS * WALK_DAY).pop();
      if (full && weakest) {
        const sockets = Object.values(weakest.tokens ?? {}).length;
        const back = salvagePreview(state, weakest, content).tokens.length;
        // One grade off everything recovered, plus everything not recovered
        // at all — both measured in GRADE_ORDER steps, which is what
        // `quality` sums.
        const burned = back + (sockets - back) * (GRADE_ORDER.length - 1);
        if (plan.score > quality(weakest) + burned) {
          extractChimera(state, weakest.id, content, now);
        }
      }
      if (state.chimeras.length < cap) {
        const before = state.chimeras.length;
        const again = bestSplice(state, content, wanted, walling()) ?? plan; // the vault just changed
        spliceChimera(state, again.frameId, again.slots, content, now);
        if (state.chimeras.length > before) did('splice', { frame: again.frameId });
      }
    }
  }
  if (has('job')) {
    // Both calls were mis-argued when the walker was written: `content`
    // landed in opReady's `now`, so the comparison was against an object and
    // every job read as on cooldown — the walker has never run one. laneFree
    // was never reached to throw.
    const op = operationList(content).find((o) => opReady(state, o.id, now) && laneFree(state, content, now, o, null));
    if (op && startOperation(state, op.id, null, content, now).ok) did('job', { op: op.id });
  }
  // The ring. The hardest garrison you hold pays the most xp per charge.
  // Rationed: the bucket refills three charges every half hour, so a walker
  // ticking every two hours could spar 36 times a day, which is a diet
  // nobody is on. `sparsPerDay` is the realistic one.
  const sparBudget = opts.sparsPerDay ?? 3;
  state.__walkSparDay ??= { day: -1, n: 0 };
  const today = Math.floor((now - (opts.t0 ?? 0)) / WALK_DAY);
  if (state.__walkSparDay.day !== today) state.__walkSparDay = { day: today, n: 0 };
  while (has('spar') && canSpar(state, content, now).ok && fitTeam().length && state.__walkSparDay.n < sparBudget) {
    state.__walkSparDay.n++;
    const partner = sparPartners(state, content)
      .sort((a, b) => (content.encounters[b.encounter]?.tier ?? 0) - (content.encounters[a.encounter]?.tier ?? 0))[0];
    const offer = partner && sparEncounter(state, content, partner.id, now);
    if (!offer?.ok) break;
    startSpar(state, now, content);
    fight(fitTeam(), offer.encounter, { kind: 'sparring', nodeId: partner.id }, `spar#${partner.id}#${now}`);
    acted++;
  }

  // Rescue before anything else: the clock on a captive is the shortest
  // one in the game, and a lost veteran is the one thing money cannot buy.
  for (const cap of has('rescue') ? [...(state.campaign.captives ?? [])] : []) {
    const team = fitTeam();
    const lastChance = cap.deadline - now <= stepMs;
    if (!team.length || (team.length < fullTeam() && !lastChance)) continue;
    const enc = content.encounters[rescueEncounterFor(state, content, cap.id)];
    if (!enc) break;
    fight(team, enc, { kind: 'rescue', captiveId: cap.id }, `rescue#${cap.id}#${now}`);
    acted++;
  }

  // Defend, with a full team if the window allows waiting for one. The
  // window is R9's whole promise — you are never made to fight before you
  // have seen it — and a player uses it to let the Infirmary finish.
  for (const contest of has('defend') ? [...(state.campaign.contested ?? [])] : []) {
    const enc = contestEncounter(state, content, contest);
    const team = fitTeam();
    const lastChance = contest.deadline - now <= stepMs;
    if (!enc || !team.length || (!aTeamFit() && !lastChance)) continue;
    const battle = fight(team, enc, { kind: 'defend', nodeId: contest.nodeId, waveIds: enc.waves },
      `defend#${contest.nodeId}#${now}`);
    state.__walkDefences = (state.__walkDefences ?? 0) + 1;
    if (battle.outcome === 'win') state.__walkHeld = (state.__walkHeld ?? 0) + 1;
    acted++;
  }

  // R87 — the Compliance Task Force. FIRST, above everything: it is the only
  // clock in the game that bills you a quarter of the bank for ignoring it,
  // and a player who has one at the gate does nothing else until it is
  // answered. Same window logic the defence uses — wait for a full team
  // unless this is the last chance.
  {
    const raid = has('raid') ? activeRaid(state) : null;
    const enc = raid ? raidEncounter(state, content, raid) : null;
    const team = fitTeam();
    const lastChance = raid && raid.deadline - now <= stepMs;
    if (enc && team.length && (aTeamFit() || lastChance)) {
      const battle = fight(team, enc, { kind: 'raid', raidId: raid.id, waveIds: enc.waves }, `raid#${raid.id}`);
      state.__walkRaids = (state.__walkRaids ?? 0) + 1;
      if (battle.outcome === 'win') state.__walkRaidsHeld = (state.__walkRaidsHeld ?? 0) + 1;
      acted++;
    }
  }

  // R87 — the Gauntlet. Shipped in R42, opened at dominion, and fought ZERO
  // times in 180 days by every walk this harness has ever run: the four
  // exhibitions are the hardest content in the game and the yardstick had
  // never seen one. Paced like the rival ladder — an A-team, one at a time,
  // and only after the county is yours, which is when they open.
  // Paced. The first cut retried whichever exhibition was open on every tick
  // it could field a team, and seed 31337 entered the same fight ONE HUNDRED
  // AND EIGHTY-TWO times and lost 98% of them — which is not a player, it is
  // a loop. A stage stays open until it is beaten, so the pacing has to come
  // from the walker: one attempt every five days, the same shape as the
  // rival ladder's one-a-week.
  if (has('gauntlet') && aTeamFit() && now - (state.__walkLastGauntlet ?? -5 * WALK_DAY) >= 5 * WALK_DAY) {
    const open = gauntletState(state, content).find((r) => r.status === 'open');
    const res = open ? gauntletEncounter(state, content, open.stage.id) : null;
    const team = fitTeam();
    if (res?.ok && team.length >= fullTeam()) {
      const battle = fight(team, res.encounter, { kind: 'gauntlet', stageId: open.stage.id, waveIds: res.encounter.waves },
        `gauntlet#${open.stage.id}`);
      state.__walkLastGauntlet = now;
      state.__walkGauntlets = (state.__walkGauntlets ?? 0) + 1;
      if (battle.outcome === 'win') state.__walkGauntletsWon = (state.__walkGauntletsWon ?? 0) + 1;
      acted++;
    }
  }

  // R83 — challenge a rival. The walk has never done this. `campaignWalk`
  // claims to measure the honest 180-day campaign, and across 16 seeds and
  // 2,880 simulated days it fought 735 assaults, 590 defences, 2,235 spars,
  // 368 rescues and ZERO duels — so the rival ladder, the game's second axis
  // of difficulty and its only source of apex-graded anatomy, was not on the
  // yardstick at all, and neither was anything downstream of a duel.
  //
  // Paced like a player: one duel a week at most, only with a fit A-team,
  // and only the rivals the ladder has actually opened. Lowest defeat count
  // first, which is how a player climbs it.
  if (has('assault') && now - (state.__walkLastDuel ?? -7 * WALK_DAY) >= 7 * WALK_DAY) {
    const open2 = rivalStatus(state, content).filter((r) => r.status !== 'locked');
    const nextUp = open2.sort((a, b) => a.record.defeats - b.record.defeats)[0];
    const team = fitTeam();
    if (nextUp && team.length >= fullTeam() && aTeamFit()) {
      fight(team, rivalEncounter(state, nextUp.rival, content),
        { kind: 'rival', rivalId: nextUp.rival.id, waveIds: [] }, `duel#${nextUp.rival.id}#${now}`);
      state.__walkLastDuel = now;
      acted++;
    }
  }

  // R83 — hunt a loose specimen (R82's board). One per visit, and only with
  // a healthy A-team, because that is how a player treats an opportunity
  // with no clock on it: it waits, so you go when you are ready. Measuring
  // it matters because an escapee is real income and the only route onto the
  // roster that does not go through the Theater.
  for (const esc of has('assault') ? [...looseSpecimens(state)].slice(0, 1) : []) {
    const enc = breakoutEncounter(state, content, esc.id);
    const team = fitTeam();
    if (!enc || team.length < fullTeam() || !aTeamFit()) continue;
    fight(team, enc, { kind: 'breakout', breakoutId: esc.id, rivalId: esc.rivalId,
      looseUnitId: esc.unit.id, waveIds: [] }, `loose#${esc.id}#${now}`);
    acted++;
  }

  if (has('assault') && now - (state.__walkLastAssault ?? -WALK_DAY) >= WALK_DAY) {
    const team = fitTeam();
    const refused = state.__walkRefused ?? (state.__walkRefused = {});
    // The roster as a player would describe it: who, and how seasoned. Raw
    // xp changes after every fight and made the refusal rule a no-op.
    const roster = state.chimeras.map((c) => `${c.id}L${lvl(c)}`).sort().join(',');
    // The WHOLE map. campaign.js's nodeStates() defaults its region argument
    // to the first strip, so the R56 walker only ever saw Greenfield — and
    // reported "3–5 of 21 nodes held" for 180 days as if that were pacing.
    const target = regionStates(state, content).flatMap((r) => r.nodes)
      .find((n) => n.status === 'available' && refused[n.node.id] !== roster);
    const enc = target && content.encounters[target.node.encounter];
    if (enc && team.length >= fullTeam() && aTeamFit()) {
      const battle = fight(team, enc, { kind: 'assault', nodeId: target.node.id }, `walk#${target.node.id}#${now}`);
      state.__walkLastAssault = now;
      if (battle.outcome !== 'win') refused[target.node.id] = roster;
      acted++;
    }
  }

  // R83 — buy the lab. The walker has never bought a single upgrade in 180
  // days, so R25's $24,000 of facility depth — six tracks, every one gated
  // on money AND territory — was measured by `facilityPayback` in isolation
  // and by the campaign not at all. It also meant the Reorientation Wing was
  // never built, so no captive could ever reach the roster and `rehabbed`
  // was structurally 0 on every seed.
  //
  // Cheapest affordable upgrade first, above the reserve, one per visit.
  // That is what the Ranch screen's own card offers and roughly what a
  // player does: take the next thing you can afford rather than saving for
  // a specific tier.
  if (has('facility')) {
    const offers = Object.keys(content.facility ?? {})
      .map((id) => ({ id, next: nextUpgrade(state, content, id) }))
      .filter((o) => o.next?.affordable)
      .sort((a, b) => a.next.level.cost - b.next.level.cost);
    const pick2 = offers.find((o) => canSpend(o.next.level.cost));
    if (pick2 && buyUpgrade(state, content, pick2.id).ok) did('facility', { track: pick2.id });
  }

  // R83 — and then use it. A bay holding something with a genome is a
  // creature the Theater could not have built; leaving it there is the one
  // half of R8 the harness could never see. Enrol when the Wing exists and
  // the fee clears the reserve, then take every session the clock offers —
  // skipping them is what graduates a wary specimen, and a walker that
  // never attends is measuring the worst case as if it were the only one.
  for (const entry of [...(state.campaign.containment ?? [])]) {
    if (entry.rehab) {
      if (now >= sessionReadyAt(entry, content)) {
        if (rehabSession(state, entry.id, content, now).ok) did('rehab-session', { who: entry.id });
      }
      continue;
    }
    // R95 — SALVAGE IS THE ONLY DOOR ENEMY TECH COMES THROUGH.
    //
    // The eight `salvage` parts are carried by 23 of the 42 enemies and by
    // nothing else: no catalog, no egg, no vat. Rehab and salvage are the
    // two futures §3.6 offers and picking one is the point, so a walker that
    // always enrols is a walker for which those eight parts do not exist —
    // which is exactly what seven campaigns measured, eight parts unreached
    // on every seed. A player dismantles the ones carrying something they
    // have never seen and reorients the rest.
    const bayUnit = entry.unit ?? content.enemies[entry.unitId];
    const carriesNew = (bayUnit?.salvage ?? []).some((pid) => content.parts[pid]
      && !(state.dex.parts ?? []).includes(pid));
    if (carriesNew) {
      if (salvageUnit(state, entry.id, content, now).ok) did('salvage', { unit: entry.unitId });
      continue;
    }
    const plan = rehabPlan(state, entry, content);
    if (!plan.possible || !plan.enabled || !canSpend(plan.fee)) continue;
    // R91 — ENROL SOMETHING YOU MEAN TO KEEP. This loop used to enrol every
    // bay it could afford, and R83's own note already said what happened
    // next: a graduate carries its old lab's grades, so the walker
    // dismantled it as soon as the Theater built better. Measured after the
    // vault and the table were capped, that single loop was the whole of the
    // remaining churn — 141 of 278 creatures in 180 days were Wing graduates
    // scrapped one table-cycle after they walked out, median life ten hours.
    //
    // Nobody pays a fee, waits out a programme and attends its sessions in
    // order to render the result down the same evening. Requiring a stall
    // that will still be worth giving it is not the walker being tuned to
    // please a gate; it is the walker stopping doing something no player
    // would do.
    const roster = [...state.chimeras].sort((x, y) => quality(y) - quality(x));
    const displaced = roster.slice(3).filter(isFit).pop();
    // R92 — THE THEATER KEEPS A QUARTER OF THE STABLE. Measured: the Wing and the vat
    // took every free stall the moment one opened (22 graduates and 27
    // decants against SEVEN splices in 180 days), so the Surgery Theater —
    // the system this whole game is named for — was the one thing a
    // campaign never got round to. Both of these are opportunistic; a
    // splice is the primary way a player makes a creature.
    //
    // "Leave one free" was not enough and the instrument said why: across a
    // 180-day walk the stable was FULL on 2,013 of the 2,063 steps where a
    // splice was otherwise ready, so the Theater got a stall fifty times and
    // used it seven. Once R91's replacement margin is in force a full stable
    // stays full — nothing in it is bad enough to be worth the grades a
    // dismantle burns — so the reservation has to be a standing one rather
    // than a single space that closes the moment anything fills it.
    // R129 — EXCEPT WHEN IT IS CARRYING SOMETHING YOU CANNOT BUILD. The rule
    // above is right about every specimen it was written for: a Wing graduate
    // arrives at its old lab's grades, so the Theater outbuilds it and
    // enrolling one costs a stall for a creature you will scrap. Measured
    // across a 180-day walk under exactly that rule: 1,035 bagged, 40 bays
    // full, 13 programmes ever started, ONE kept.
    //
    // A released specimen carrying a mutation trait is the one body that
    // breaks the comparison — the trait is not on the Theater's shelf at any
    // grade, and it rides out through the graduate's tokens into the Vault.
    // That is Law 2 in one creature, and no player would leave it in the bay.
    const bayTraits = (bayUnit?.traits ?? []).filter((tr) => content.traits?.[tr]);
    const carriesGene = bayTraits.some((tr) => !(state.dex.traits ?? []).includes(tr));
    const keeps = carriesGene
      || !displaced || stableRoom(state, content).free > THEATER_STALLS;
    if (!keeps) continue;
    if (startRehab(state, entry.id, content, now).ok) did('rehab-start', { who: entry.id });
  }

  // --- discretionary, and only above the reserve.
  if (has('train')) {
    // The three that actually fight. Training the whole stable is how the
    // first policy went broke.
    // R138 — LEAST EXPERIENCED FIRST, which is the other half of why the
    // middle of the level curve was empty. This sorted DESCENDING: every
    // training session went to the three creatures that had already fought
    // the most, so the bench was never worked with in any verb at all.
    // R92's note eleven lines below already saw the shape of it — "nine of
    // which the A-team policy never touches" — and fixed only the feral case.
    //
    // A player trains the creature that is NOT ready yet; the one that is
    // ready is out fighting. Ascending is that sentence. (The moveset branch
    // further down stays DESCENDING on purpose: your best moves go on the
    // creatures that actually field them.)
    for (const c of [...state.chimeras].sort((x, y) => (x.xp ?? 0) - (y.xp ?? 0)).slice(0, 3)) {
      if (!canSpend(TRAINING.cost)) break;
      if (trainChimera(state, c.id, now, content).ok) did('train', { who: c.id });
    }
    // R92 — AND WHOEVER IS DRIFTING. R85's rule is that a creature only goes
    // feral on somebody who is NOT playing, and the walker was the proof: it
    // trained, sparred and fought constantly, so nothing it owned ever
    // drifted. That held while the stable was three fighters and a few
    // spares. With the Theater given room again a campaign carries twelve,
    // nine of which the A-team policy never touches — and one went feral,
    // which is R85's mechanic firing on a player who IS playing.
    //
    // The Pens paints a warning on exactly this creature. A player who reads
    // it works with that one, and working with a creature is what stops it
    // drifting; the walker does the same rather than letting the alert sit
    // there for 180 days.
    for (const c of state.chimeras) {
      if (!canSpend(TRAINING.cost)) break;
      if (!feralStatus(c, content, now).atRisk) continue;
      if (trainChimera(state, c.id, now, content).ok) did('train', { who: c.id, why: 'drifting' });
    }
  }
  // R95 — the paddock has to hold the herd AND the eggs it is sitting on.
  // Capped at `WORKING_HERD` this bought exactly enough room for the animals
  // and none for the drawers, so a full herd meant no incubation at all.
  if (has('pens') && state.ranch.stock.length + (state.ranch.eggs ?? []).length >= state.ranch.penCapacity
      && state.ranch.penCapacity < WORKING_HERD + incubatorSlots(state, content)
      && canSpend(penUpgradeCost(state))) {
    if (buyPenUpgrade(state).ok) did('pens');
  }
  // R92 — THE RESEQUENCER. R31 built it so an extraction is not forever, and
  // in 180 days the walk had never run one: every balance claim about what a
  // vial is worth rested on nothing. A player runs it when they have a good
  // vial, a pen to put the animal in, and the tank standing idle — the same
  // three conditions the Vault screen's own button checks.
  if (has('graduate') && !activeResequence(state) && state.ranch.stock.length < WORKING_HERD) {
    // The best sample on the rack, because a vial is spent whether or not it
    // takes and nobody burns their worst one first.
    // R92 — ONLY A VIAL WORTH GROWING BACK. Run on "the tank is idle and a
    // pen is free" it fired 296 times in 180 days, which is not a player
    // choosing to rebuild a donor, it is a conveyor: the herd filled, every
    // animal in it queued to ripen, and graduation stalled because R91's
    // vault was full of what the last batch yielded. Three shipped systems
    // deadlocking each other, and only visible once the walk ran all three.
    //
    // A player rebuilds a donor BETTER than what they are already raising.
    // The herd's own best is the yardstick, so this throttles itself as the
    // ranch improves and needs no number of its own.
    const herdBest = state.ranch.stock.reduce((m, a) => Math.max(m, avgStars(a)), 0);
    const best = [...state.inventory.vials]
      .filter((v) => (v.stars ?? 0) > herdBest)
      .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))[0];
    const plan = best ? resequencePlan(state, best.id, content, now) : null;
    if (plan?.ok && canSpend(plan.fee ?? 0) && startResequence(state, best.id, content, now).ok) {
      did('resequence', { species: best.species, stars: best.stars });
    }
  }

  // R92 — THE CHAOS VAT, and the one agenda row with nothing behind it.
  //
  // R12 priced it in GRADES rather than money: both parents drop one on
  // every part, so a line bred against itself slides down the ladder. That
  // is the whole design and the walk had never paid it once, which means the
  // decay R12 describes has never been observed on a campaign.
  //
  // Never the A-team. A player does not put their two best fighters through
  // a process that costs them both a grade on everything, and the walker
  // ranking every creature by `quality` already knows which three those are.
  if (has('vat') && !activeVat(state) && stableRoom(state, content).free > THEATER_STALLS) {
    const ranked = [...state.chimeras].sort((x, y) => quality(y) - quality(x)).slice(3);
    let ran = false;
    for (const a of ranked) {
      for (const b of ranked) {
        if (ran || a === b) continue;
        const plan = vatPlan(state, a.id, b.id, content, now);
        if (!plan?.ok || !canSpend(plan.fee ?? 0)) continue;
        if (startVat(state, a.id, b.id, content, now).ok) { did('vat', { sire: a.id, dam: b.id }); ran = true; }
      }
    }
  }

  // R92 — FOUR SLOTS, AND YOU RETRAIN TO CHANGE THEM. R30's whole point is
  // that a combo you just discovered has to be worth more than what it
  // displaces, and the walk pressed whatever the default pick handed it for
  // 180 days. Now the three that actually fight carry their four best moves,
  // which is what a player does the moment a splice teaches one something.
  if (has('train')) {
    for (const c of [...state.chimeras].sort((x, y) => (y.xp ?? 0) - (x.xp ?? 0)).slice(0, 3)) {
      const ready = moveTrainingReady(c, now, content);
      if (!ready.ready || !canSpend(ready.cost)) continue;
      // `knownMoves` takes the genome reader as an argument rather than
      // importing one, so the caller decides where a creature's anatomy
      // comes from — the same shape the bench builder above uses.
      const tokens = Object.values(c.tokens ?? {});
      const report = analyze(c.frame, tokens, content);
      const known = knownMoves(c, content, () => movesFromTokens(tokens, report, content));
      if (known.length <= MOVE_SLOTS) continue;
      // Strongest four it knows: power per stamina, which is the yardstick
      // R16 priced every combo against.
      const pick = [...known]
        .sort((x, y) => (y.power ?? 0) / Math.max(1, y.cost ?? 1) - (x.power ?? 0) / Math.max(1, x.cost ?? 1))
        .slice(0, MOVE_SLOTS).map((m) => m.id);
      // Only when it actually CHANGES something. `setMoveset` charges for
      // learning and not for reordering, so a pick identical to what the
      // creature already carries is free — and the walker fired it every
      // step for nothing, 6,123 times in 180 days, because a free action
      // never trips its own cooldown. A player retrains when a splice has
      // taught their creature something better.
      const current = (c.moveset ?? []).join('|');
      if (pick.join('|') === current) continue;
      if (setMoveset(state, c.id, pick, known, now, content).ok) did('moveset', { who: c.id });
    }
  }

  // R91 — A PLAYER WITH A FULL VAULT RENDERS SOMETHING DOWN. Without this
  // the walker sat at 258 of 260 parts, could not graduate an animal because
  // the yield would not fit, and stopped playing half the game; the gate
  // read a five-figure median chimera life and called it success. Only the
  // surplus goes: duplicate anatomy at the bottom grade, carrying no traits,
  // never the last token of anything. Which is what the Vault screen's own
  // button does, on the same rule.
  {
    const pressure = vaultPressure(state, content);
    if (pressure.tight) {
      const going = surplusParts(state, content, Math.max(8, Math.ceil(pressure.capacity.parts * 0.15)));
      if (going.length) {
        const r = renderDown(state, content, going.map((t) => t.id));
        if (r.ok) did('render', { n: r.count, paid: r.paid });
      }
    }
  }
  // R95 — AND THE HERD BENDS FOR ANATOMY IT HAS NEVER HELD.
  //
  // `WORKING_HERD` is the equilibrium a fighting ranch settles at, and it
  // was also the shopping limit, so the pens only emptied when something was
  // extracted: cut the chimera churn and the catalogue stops being read at
  // all. Measured, the two-day tenure below took part reach from 234 back to
  // 231 without a single rule about buying changing. A pen for a species you
  // have never held is not the same purchase as a twenty-first goat, and the
  // paddock has room for it — `penMaxCapacity` is 40.
  const shoppingNew = catalogFor(state, content)
    .some((sp) => isNewToDex(state, content, sp.id) && canSpend(sp.mailOrderPrice));
  const herdLimit = Math.min(state.ranch.penCapacity, WORKING_HERD + (shoppingNew ? 6 : 0));
  if (has('buy') && state.ranch.stock.length < herdLimit) {
    // The map says which class answers the strip in front of you (`demand`,
    // R37). A player who reads it buys that; the cheapest of those, or the
    // cheapest of anything when the catalog has none yet.
    const wanted = demanded();
    const affordable = catalogFor(state, content)
      .filter((sp) => canSpend(sp.mailOrderPrice))
      .sort((a, b) => a.mailOrderPrice - b.mailOrderPrice);
    // The best answer you can afford, not the cheapest: a frog and a shark
    // are both Water, and the map's demand line is asking for the shark.
    const answers = affordable.filter((sp) => wanted && (sp.class ?? sp.creatureClass) === wanted);
    // R95 — AND A SPECIES YOU HAVE NEVER HELD BEATS A SECOND OF ONE YOU HAVE.
    //
    // The rule above is a good player's rule and it has a floor: 41 species
    // share four classes, so once the best affordable Ground animal is in
    // the pens, every other Ground animal is dominated and the walker stops
    // buying. Measured over seven 180-day campaigns it bought TWELVE species
    // while holding 22 of 23 nodes with a median $249,000 in the bank, and
    // reached a median 118 of 244 parts.
    //
    // This is not the walker being tuned to please a gate. It is the walker
    // doing what the Splice-Dex has asked for since R21 and the catalog now
    // says out loud on every row: new anatomy is the thing a collector is
    // buying, and the demand line is still honoured first among equals.
    // THESE FOUR LISTS ARE AN ORDER, NOT A FILTER, and break 160 is why the
    // distinction is written down. `fresh` (never held anything of it) is a
    // SUBSET of `incomplete` (owes the Dex at least one part), so deleting
    // the never-held branch does not stop the walker collecting — it changes
    // which collectible it reaches for, and the break aimed at it came back
    // MISSED. Measured over seven campaigns, the order is worth three parts
    // of reach: never-held-dearest first lands at 233 of 244, one flat rule
    // sorted by parts-owed at 231 cheapest-first and 229 dearest-first. A
    // six-part stranger beats a one-part straggler, and among strangers the
    // expensive animal is the one behind the late node.
    const fresh = affordable.filter((sp) => isNewToDex(state, content, sp.id));
    const freshAnswers = fresh.filter((sp) => wanted && (sp.class ?? sp.creatureClass) === wanted);
    // R95 — AND A COLLECTOR STILL NEEDS TWO OF SOMETHING.
    //
    // Buying one of everything is exactly the wrong herd for the Incubator:
    // `canBreed` wants two ADULTS OF ONE SPECIES, so a pen with one of each
    // has no legal pairing at all and the six variant lines are never rolled
    // for. Measured with the collector rule alone, five of seven seeds bred
    // on a variant line zero to four times in 180 days.
    //
    // So when a line still owes the Dex a variant and the pens hold only one
    // of it, buy the mate. It is the cheapest thing on this list to want and
    // the only way those 34 parts exist.
    const heldOf = (id) => state.ranch.stock.filter((a) => a.species === id).length;
    const mates = affordable.filter((sp) => heldOf(sp.id) === 1
      && variantsOf(sp.id, content).some((v) => Object.values(content.parts)
        .some((p) => p.species === v.id && !(state.dex.parts ?? []).includes(p.id))));
    // R95 — one extraction is not six parts. An Extractor run yields a
    // SUBSET of the donor's anatomy, so a species bought once and rendered
    // once leaves a socket or two on the shelf forever: measured, five of
    // seven campaigns finished one part short on mantis, scorpion,
    // rhino_beetle or armadillo — species they owned. Buying a second one is
    // what a player does about it, and it is the cheapest part in the game.
    const dexHas = new Set(state.dex.parts ?? []);
    const incomplete = affordable.filter((sp) => Object.values(content.parts)
      .some((p) => p.species === sp.id && !dexHas.has(p.id)));
    const best = (list) => list[list.length - 1];
    const pickSp = freshAnswers.length ? best(freshAnswers)
      : fresh.length ? best(fresh)
      : mates.length ? mates[0]
      : incomplete.length ? incomplete[0]
      : answers.length ? best(answers)
      : affordable[0];
    if (pickSp && buyMailOrder(state, pickSp.id, content, now).ok) did('buy', { species: pickSp.id });
  }
  // R91 — MOVED TO THE END, and it had to be. This sweep used to run first,
  // before anything in this function had started a clock, so the only thing
  // it could ever find was a clock left over from a previous step. That was
  // invisible while the walker spliced a creature every two hours and always
  // had one settling; with the stable capped it splices twelve times in six
  // months, incubation is 22-56 MINUTES against a two-hour step, and the
  // sweep went from 1,665 rushes to zero — not because rushing broke but
  // because the walker was looking before it had made anything to look at.
  // R86's gate caught it, which is what R86's gate is for.
  // R86 — pay to hurry what is sealed, the way a player with money in the
  // bank does. Reserve-gated like every other purchase here, soonest clock
  // first. Never the cooldowns: `rush` refuses those, and a walker that could
  // buy bond would be measuring a different game from the one that ships.
  for (const q of rushable(state, content, now)) {
    if (!canSpend(q.price)) break;
    const res = rush(state, q.kind, q.id, content, now);
    if (!res.ok) continue;
    did('rush', { clock: q.kind, cost: res.cost });
    state.__walkRushes = (state.__walkRushes ?? 0) + 1;
    state.__walkRushSpent = (state.__walkRushSpent ?? 0) + res.cost;
  }
  return acted;
}

// The same pilot the bench flies: the game's own move scorer, so the walk
// and the region bench disagree about a fight only when the ROSTER differs,
// never because one of them presses the biggest number every turn.
// R83 — the walker fires the Containment Cannon; the BENCH pilot does not.
//
// This is deliberately not a change to `pilotAction`. That function is what
// `scriptedBattle`, `runSim`, `regionBench` and the all-grade [OP] gate play
// with, and a bench that bagged its opponent would re-baseline every balance
// number in the suite to measure something those benches are not asking
// about. The walk is asking a different question — what a campaign actually
// produces — and capture is half the answer: it is the only route onto the
// roster that does not go through the Surgery Theater, and until now the
// walk had never taken it.
//
// The rule is the one the screen teaches: soften below the threshold, then
// fire. `playerActions` only offers `capture` when the cannon is charged and
// the target is both capturable and weak enough, so asking for it is the
// whole policy.
// R88 — the walker flies `autoResolve`, which IS this loop, moved into
// battle/autoplay.js so the game could press it too. The walker is the
// balance model; a sent fight has to be flown by the same thing the model
// flies or the model is measuring a different game. It returns the beats
// so the walk can price what a campaign costs the eye.
function walkAutoplay(battle, content) {
  battle.__beats = autoResolve(battle, content);
  return battle;
}

// Walk one seeded save from an empty ranch as far as it gets, and report the
// curve rather than a verdict — the numbers are the deliverable.
// `away` closes the app for a stretch: { from: day, days: n } skips every
// tick inside the window, so the return tick sees the whole gap at once —
// which is exactly what a save does when the player comes back after a
// holiday. `snapshotDays` records the state as the player would SEE it on
// those days: after the tick, before they do anything.
// `tick` is the world-advancing function; the game's own (campaign/world.js)
// by default. A harness knob only: it exists so an experiment can ask which
// passive system moves a result, by ticking without it.
export function campaignWalk(content, { seed = 2026, days = 180, stepHours = 2, sparsPerDay = 3, stableCap = 9, away = null, snapshotDays = [], markDay = null, tick = tickWorld, stopAtDominion = true, priceBeats = false } = {}) {
  const t0 = Date.UTC(2026, 0, 1);
  const state = { ...newGameState(), seed };
  ensureRanchSeeded(state, content, t0);
  state.lastTickAt = t0;

  const at = {};
  const mark = (key, now) => { if (at[key] === undefined) at[key] = +((now - t0) / WALK_DAY).toFixed(2); };
  // R146 — see the observation block below. `noteFirst` writes into the same
  // `__walkLog` the action logger uses and stamps the day the same way
  // `mark` does, so an observation and a verb are one kind of record and the
  // pacing table does not need to know which is which.
  const noteFirst = (kind, id, now) =>
    (state.__walkLog ??= []).push({ day: +((now - t0) / WALK_DAY).toFixed(2), kind, id });
  let sawCombo = false;
  let sawTrait = false;
  let stall = 0;
  let longestStall = 0;
  let stallStartedAt = null;
  let worstStallDay = null;
  let minFunds = Infinity;
  let broke = 0;

  const snapshots = {};
  const snap = (day) => ({
    day,
    funds: Math.round(state.funds),
    nodes: state.campaign.heldNodes.length,
    contested: (state.campaign.contested ?? []).length,
    contestCount: state.campaign.contestCount ?? 0,
    income: Math.round(state.__walkIncome ?? 0),
    // The daily rates at this moment: what a month of full pay would be.
    incomeRate: Math.round(incomePerDay(state, content)),
    upkeepRate: Math.round(upkeepPerDay(state, content)),
    captives: (state.campaign.captives ?? []).length,
    dissections: (state.directorStats?.dissections ?? []).length,
    chimeras: state.chimeras.length,
    stock: state.ranch.stock.length,
    condition: state.ranch.stock.length ? +(state.ranch.stock.reduce((n, a) => n + a.condition, 0) / state.ranch.stock.length).toFixed(1) : null,
    injured: state.chimeras.filter((c) => c.injury && c.injury.until > t0 + day * WALK_DAY).length,
    notoriety: state.campaign.notoriety,
    news: [...(state.news ?? [])],
  });
  const awayStart = away ? away.from * 24 : Infinity;
  const awayEnd = away ? (away.from + away.days) * 24 : -Infinity;

  // R85 — the harness's view of the top of the instability scale. Counted
  // here rather than inferred from the log, because what matters is a
  // property of the WHOLE run: an engaged player must never lose a creature
  // to neglect, and a mechanic that fires on somebody who is playing is a
  // punishment rather than a stake. The walker trains, spars and fights
  // constantly, so it is exactly the player this must not touch.
  const feralSeen = new Set();
  const feralBays = new Set();
  // R87 — every specimen the Wing has EVER graduated, by id, not the ones
  // still standing at the end. A rehabilitated creature carries its old
  // lab's grades, so the walker's stable cap dismantles it as soon as the
  // Theater builds better — which means a survivor count measures how long
  // the walk ran, not whether the capture chain works. R83 asserted on the
  // survivors and R87 moved dominion later, so the same working chain
  // started reporting zero.
  const rehabEver = new Set();

  // R91 — id -> createdAt for everything standing, and a day count for
  // everything that has left. A creature still alive at the end contributes
  // its age, not nothing: dropping the survivors would measure only the
  // churn and report a median far below what a player experiences.
  const alive = new Map();
  const lives = [];

  for (let h = 0; h <= days * 24; h += stepHours) {
    if (h > awayStart && h < awayEnd) continue; // the app is closed
    const now = t0 + h * WALK_HOUR;
    // Income the world is about to pay for this gap, at the holdings it
    // pays on — the ledger the R64 gate compares a month away against.
    state.__walkIncome = (state.__walkIncome ?? 0) + incomePerDay(state, content) * ((now - (state.lastTickAt ?? now)) / WALK_DAY);
    // R143 — and the other side of the ledger, integrated from the game's own
    // rate the same way. A snapshot of end-of-run FUNDS cannot answer whether
    // money has anywhere to go: the walker refuses to spend below
    // WALK_RESERVE_DAYS of upkeep, so raising the running costs raises the
    // cash it sits on and a balance-sheet rule would score the fix as a
    // regression. What is actually being asked is what share of everything
    // ever earned the empire spends on existing, and that is cumulative.
    state.__walkUpkeep = (state.__walkUpkeep ?? 0) + upkeepPerDay(state, content) * ((now - (state.lastTickAt ?? now)) / WALK_DAY);
    tick(state, content, now);
    for (const c of state.chimeras) if (c.agitatedAt) feralSeen.add(c.id);
    for (const c of state.chimeras) if (c.rehabilitated) rehabEver.add(c.id);
    for (const b of state.campaign.containment ?? []) if (b.feral) feralBays.add(b.id);
    if (snapshotDays.includes(h / 24)) snapshots[h / 24] = snap(h / 24);

    minFunds = Math.min(minFunds, Math.round(state.funds));
    if (state.funds <= 0) broke += stepHours;
    if (state.inventory.parts.length) mark('firstParts', now);
    if (state.chimeras.length) mark('firstChimera', now);
    if (state.campaign.heldNodes.length) mark('firstNode', now);
    // R146 — WAS `firstRegion`, WHICH IT NEVER WAS. This marks the fifth
    // NODE, not the first region; the name has been wrong since it was
    // written and nothing read it, so nothing noticed. Renamed rather than
    // deleted because "how long to a fifth node" is a real pacing question —
    // it is just not the question the old name asked.
    if (state.campaign.heldNodes.length >= 5) mark('fifthNode', now);
    if (state.dominionAt) mark('dominion', now);
    // R146 — THE TWO SYSTEMS NOBODY COULD PLACE IN TIME.
    //
    // `tools/coverage.js` names eight systems and proves each one RAN by a
    // count. Six of them are verbs the walk logs, so the day each was first
    // used falls out of the log for free. Combos and traits are the other
    // two: both are counted at the end by scanning the finished state, which
    // says whether they happened and can never say when. They were the only
    // shipped systems with no moment at all.
    //
    // Logged here rather than at the splice, because a combo is DISCOVERED
    // by the engine as a consequence of a build and a trait is EXPRESSED by
    // breeding — neither is an action the walker takes, so neither has a
    // call site to hang it on. This block is already the walk's once-a-tick
    // look at its own state, which is exactly what an observation is.
    //
    // Both guard on a flag before scanning: `traits` walks the stock, the
    // stable and the vault, and that is real work to repeat every tick of a
    // 180-day campaign for an answer that cannot change back.
    if (!sawCombo && (state.discoveredCombos ?? []).length) {
      sawCombo = true;
      noteFirst('combo', state.discoveredCombos[0], now);
    }
    if (!sawTrait) {
      const t = firstTraitOn(state);
      if (t) { sawTrait = true; noteFirst('trait', t, now); }
    }

    const shape = agendaShape(state, content, now);
    if (shape.productive === 0) {
      if (stall === 0) stallStartedAt = +((now - t0) / WALK_DAY).toFixed(2);
      stall += stepHours;
      if (stall > longestStall) { longestStall = stall; worstStallDay = stallStartedAt; }
    } else {
      stall = 0;
    }
    walkAct(state, content, now, shape.open, { t0, stepHours, sparsPerDay, stableCap, priceBeats });
    // R91 — HOW LONG DOES A CHIMERA LIVE? The criterion asks for a median
    // and nothing in the tree could produce one: `chimeras` reports how many
    // are standing at the end, which on a walk with a stable cap is just the
    // cap. A creature leaves by exactly two doors — dismantled in
    // `extractChimera`, taken in `finishBattle` — and both are engine calls
    // the walk makes rather than events it raises, so the honest instrument
    // is to diff the roster after each step. Resolution is one step; the
    // baseline it has to distinguish is hours against days.
    for (const [id, born] of alive) {
      if (!state.chimeras.some((c) => c.id === id)) {
        lives.push((now - born) / WALK_DAY);
        alive.delete(id);
      }
    }
    for (const c of state.chimeras) if (!alive.has(c.id)) alive.set(c.id, c.createdAt ?? now);
    // The state as the player LEFT it: after the day's actions, so a month
    // away is measured from what was actually in the bank when the app closed.
    if (markDay != null && h === markDay * 24) snapshots.left = snap(markDay);
    // Claimed inside the act, so mark it here too — the R56 loop broke out
    // before the next tick's mark() could see it, and `at.dominion` read
    // undefined on a walk that had just won the map.
    //
    // R83 — stopping there is right for "how long does the campaign take"
    // and wrong for anything measured across a WINDOW. The away comparison
    // leaves on day 10 and returns on day 40, and R83's walker (which now
    // fights the rival ladder for xp and apex parts) takes the county on
    // day 24-39 instead of day 28-48 — so six of sixteen seeds finished
    // inside the window and were skipped, taking the sample from fifteen
    // comparable seeds to nine. A gate that passes because it measured less
    // is R17's lesson, not a result. Post-dominion play is real (R9's
    // counter-offensives keep arriving, R40 says so out loud), so the away
    // walk simply keeps going.
    if (state.dominionAt) {
      mark('dominion', now);
      if (stopAtDominion) break;
    }
  }

  // R120 — what the walk actually DID, by verb. The log was fights-only, so
  // this tally could not exist; it is how smoke asserts that a sitting is
  // countable and that the ranch loop ran, without walking the campaign a
  // second time to find out.
  const verbs = {};
  for (const e of state.__walkLog ?? []) verbs[e.kind] = (verbs[e.kind] ?? 0) + 1;

  return {
    seed,
    at,
    // R89 — the save the walk ends on, which is the only honest fixture for
    // "the day-180 screen". Every height this project has quoted at scale
    // was measured on one, and nothing in the tree could produce one: the
    // walk built the state, reported summaries of it, and dropped it. The
    // `__walk*` scratch fields are stripped because a real save has none,
    // and a fixture carrying them measures a screen no player will see.
    save: Object.fromEntries(Object.entries(state).filter(([k]) => !k.startsWith('__'))),
    verbs,
    actions: (state.__walkLog ?? []).length,
    reachedDominion: state.dominionAt != null,
    nodes: state.campaign.heldNodes.length,
    chimeras: state.chimeras.length,
    // R91 — the survivors are folded in at their current age, so this is the
    // life of every chimera the campaign ever made, not only the discarded
    // ones. `chimerasMade` is the churn the save pays for: 1,834 creatures
    // built to keep nine.
    chimerasMade: state.chimeraCount ?? 0,
    chimeraLives: [...lives, ...state.chimeras.map((c) => (state.lastTickAt - (c.createdAt ?? state.lastTickAt)) / WALK_DAY)]
      .sort((a, b) => a - b),
    stock: state.ranch.stock.length,
    parts: state.inventory.parts.length,
    funds: Math.round(state.funds),
    // R143 — the campaign's whole ledger, integrated from the rates the War
    // Room itself prints. `upkeepShare` is what running the place cost as a
    // fraction of everything territory ever paid.
    grossEarned: Math.round(state.__walkIncome ?? 0),
    upkeepPaid: Math.round(state.__walkUpkeep ?? 0),
    upkeepShare: (state.__walkIncome ?? 0) > 0 ? (state.__walkUpkeep ?? 0) / state.__walkIncome : 0,
    minFunds,
    // Hours the agenda offered nothing but ways to spend money. A4's measure,
    // read over a whole campaign instead of one save.
    longestStallHours: longestStall,
    worstStallDay,
    brokeHours: broke,
    warRecord: { ...state.warRecord },
    defences: state.__walkDefences ?? 0,
    defencesHeld: state.__walkHeld ?? 0,
    contests: state.campaign.contestCount ?? 0,
    snapshots,
    xp: state.chimeras.map((c) => c.xp ?? 0).sort((a, b) => b - a),
    levels: state.chimeras.map((c) => levelOf(c.xp ?? 0, content)).sort((a, b) => b - a),
    roster: state.chimeras.map((c) => ({
      name: c.name, frame: c.frame, level: levelOf(c.xp ?? 0, content),
      grades: Object.values(c.tokens).map((t) => t.grade[0]).join(''),
      classes: Object.values(c.tokens).map((t) => (content.parts[t.partId]?.classAffinity ?? '?')[0]).join(''),
    })),
    // R83 — what a 180-day campaign actually earns, reported rather than
    // inferred. Before this milestone the walk fought 735 assaults, 590
    // defences, 2,235 spars and 368 rescues across sixteen seeds and ZERO
    // duels, so half the campaign was invisible to the yardstick and there
    // was no number that said so.
    fights: (state.__walkLog ?? []).reduce((tally, e) => {
      tally[e.kind] = (tally[e.kind] ?? 0) + 1;
      return tally;
    }, {}),
    // R141 — WHICH CHASSIS A CAMPAIGN ACTUALLY BUILDS ON.
    //
    // Six campaigns and 64 surviving chimeras were the evidence that the
    // Kite had never been worn, and reading it took a bespoke script every
    // time because the walk reported how many creatures it made and never
    // what it made them on. Counted over every splice, not the survivors, so
    // a frame that gets built and later dismantled still shows.
    framesBuilt: (state.__walkLog ?? []).reduce((tally, e) => {
      if (e.kind === 'splice' && e.frame) tally[e.frame] = (tally[e.frame] ?? 0) + 1;
      return tally;
    }, {}),
    duels: (state.__walkLog ?? []).filter((e) => e.kind === 'rival').length,
    breakouts: (state.__walkLog ?? []).filter((e) => e.kind === 'breakout').length,
    // The two halves of R8 the harness could never see: how many specimens
    // were bagged, and how many of those were talked round rather than
    // taken apart.
    bays: (state.campaign.containment ?? []).length,
    bagged: (state.__walkLog ?? []).reduce((n, e) => n + (e.bagged ?? 0), 0),
    rehabbed: state.chimeras.filter((c) => c.rehabilitated).length,
    rehabbedEver: rehabEver.size,
    // R85: how many of the walker's creatures ever paced their pen, and how
    // many it actually lost to it. Both should be zero for a walker that
    // plays every day; the away-runs are where the mechanic is supposed to
    // bite.
    feral: { agitated: feralSeen.size, lost: feralBays.size },
    // R86: how often the walker paid to hurry a clock, what it spent, and how
    // often it bought out of the Infirmary — the yardstick's view of the one
    // purchase that buys time rather than things.
    // R87 — the second act, on the yardstick for the first time: raids
    // answered and held, exhibitions entered and won, and what the State
    // took from the ones that were not answered.
    raids: state.__walkRaids ?? 0,
    raidsHeld: state.__walkRaidsHeld ?? 0,
    raidsMissed: (state.campaign.raidCount ?? 0) - (state.__walkRaidsHeld ?? 0),
    levied: Math.round(state.campaign.leviedTotal ?? 0),
    gauntlets: state.__walkGauntlets ?? 0,
    gauntletsWon: state.__walkGauntletsWon ?? 0,
    notoriety: Math.round(state.campaign.notoriety ?? 0),
    rushes: state.__walkRushes ?? 0,
    // R92 — THE NUMBERS THAT SAY A SYSTEM RAN AT ALL.
    //
    // Every balance claim this project states comes out of this walk, so a
    // system it never touches is a system whose balance has never been
    // measured — and until `tools/coverage.js` there was nothing that said
    // which those were. Four of the eight R92 named had quietly been closed
    // by other milestones and nobody noticed; the other four had not, and
    // nobody noticed that either. A number is what makes either noticeable.
    //
    // `eggs` and `traitsSeen` are the ones the walk was already doing and
    // simply never reported: R120 taught it to breed in the milestone before
    // last, and R92's entry still reads "0 eggs".
    combosFound: (state.discoveredCombos ?? []).length,
    vats: verbs.vat ?? 0,
    resequences: verbs.resequence ?? 0,
    movesetTrains: verbs.moveset ?? 0,
    eggs: verbs.hatch ?? 0,
    traitsSeen: traitsOn(state).size,
    // R146 — EVERY FIRST USE, DERIVED FROM THE LOG THE WALK ALREADY KEEPS.
    //
    // `at` above is five hand-written marks, four of which are the same on
    // every seed. This is the same question asked of the record instead of
    // of a list somebody remembered to extend: one entry per verb the walk
    // performed, keyed by kind, valued by the day it first happened. A
    // system added later is timed without anybody touching this file.
    firstUse: (state.__walkLog ?? []).reduce((first, e) => {
      if (first[e.kind] === undefined) first[e.kind] = e.day;
      return first;
    }, {}),
    rushSpent: Math.round(state.__walkRushSpent ?? 0),
    treated: state.__walkTreated ?? 0,
    facility: { ...state.facility },
    captured: (state.__walkLog ?? []).filter((e) => e.lost).length,
    rescues: (state.__walkLog ?? []).filter((e) => e.kind === 'rescue').length,
    rescued: (state.__walkLog ?? []).filter((e) => e.kind === 'rescue' && e.outcome === 'win').length,
    spars: (state.__walkLog ?? []).filter((e) => e.kind === 'sparring').length,
    // Every fight the walker picked, in order — the treadmill is only
    // visible in the sequence, never in the totals.
    log: state.__walkLog ?? [],
  };
}
