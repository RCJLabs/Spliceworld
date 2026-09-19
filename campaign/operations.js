// Operations — the Jobs board (non-combat missions). Pure and DOM-free.
//
// WHY IT EXISTS and the five rules it is built on — always something
// runnable, failure never costs a creature, demands improve the odds rather
// than gating, a job needs a crew so the board runs as wide as your stable,
// and heat is the price — are in data/notes/operations.md, beside the data
// they are rules ABOUT. They were duplicated here almost word for word,
// which is 2.3 KB every player downloads to read the same argument twice.

import { rngStream, pick } from '../util/rng.js';
import { pickPooled, fill } from './monologue.js';
import { newsFor } from './wire.js';
import { analyze } from '../splice/physiology.js';
import { isSettled } from '../splice/chimera.js';
import { createAnimal } from '../ranch/ranch.js';
import { infirmaryGrants } from '../splice/facility.js';
import { applyInjury } from '../battle/statblock.js';

const HOUR = 3600000;
const DAY = 24 * HOUR;
// A fortnight away is a fortnight of news, and then it stops. Without a
// ceiling a save opened after a month abroad would push thirty headlines into
// a wire that keeps twelve, which is a digest nobody can read.
const CONTRACT_LINES_MAX = 14;

const DEFAULTS = {
  soloPenalty: 0.18,
  tagBonus: 0.22,
  classBonus: 0.12,
  statBonus: 0.14,
  statPer: 60,
  minChance: 0.15,
  maxChance: 0.95,
  injuryHours: [1.5, 3.75],
  unsettledPenalty: 0.15,
  heatPerJob: 5,
  heatPerNotoriety: 3,
  heatHalfLifeHours: 13.5,
  heatPenalty: 0.35,
  heatMax: 100,
  // A4. One slot per creature fit to work, floored at one and capped here.
  // The cap is the thing that keeps conquest the better deal: past three you
  // are meant to be taking nodes, not running a courier service.
  maxJobs: 3,
};

export function opTuning(content) {
  return { ...DEFAULTS, ...(content.operationMeta ?? {}) };
}

export function operationList(content) {
  return Object.values(content.operations ?? {});
}

// R116 — the board is what you WORK and a contract is what you ARRANGE, and
// which a job is is `contract: true` in the data rather than a rule in here.
// Why the set splits where it does, and the two charge pricings that were
// tried and rejected first: data/notes/operations.md, `operations[]`.
export function boardOps(content) {
  return operationList(content).filter((op) => !op.contract);
}

export function contractList(content) {
  return operationList(content).filter((op) => op.contract);
}

// What a standing arrangement pays an hour. DERIVED from the job's own
// numbers — purse, odds and the cycle it used to run on — so a contract can
// never drift away from the job it replaced, and adding one is still a JSON
// object rather than an engine edit.
//
// `contractRate` is the discount and it is the whole bargain; the note has
// the argument.
export function contractPerHour(op, content) {
  const t = opTuning(content);
  const purse = ((op.funds?.[0] ?? 0) + (op.funds?.[1] ?? 0)) / 2;
  const cycle = Math.max(1, (op.hours ?? 1) + (op.cooldownHours ?? 0));
  return (purse * (op.baseChance ?? 0) / cycle) * (t.contractRate ?? 0.5);
}

// A DAY OF IT, which is the unit every reader wanted and three of them were
// hand-rolling. R174's rule: one home, however many readers.
export function contractPerDay(op, content) {
  return contractPerHour(op, content) * 24;
}

export function activeContract(state) {
  return state.campaign?.contract ?? null;
}

// ONE AT A TIME, which is what makes it a choice rather than a list of
// switches to turn all on. Signing over the top of one is allowed and is not
// a refusal: the old arrangement is settled to this moment first, so no
// player is ever charged for a swap.
export function signContract(state, opId, content, now) {
  const op = content.operations?.[opId];
  if (!op?.contract) return { ok: false, msg: fill(content.copy?.board?.not_contract, {}) };
  const had = activeContract(state);
  if (had?.opId === opId) return { ok: false, msg: fill(content.copy?.board?.already, { op: op.name }) };
  // Settled to this moment first, so a swap never costs a player the hours
  // they had already earned under the old arrangement.
  settleContracts(state, content, now);
  state.campaign.contract = { opId, signedAt: now, paidThrough: now };
  return { ok: true, op, replaced: had?.opId ?? null, msg: fill(content.copy?.board?.signed, { op: op.name }) };
}

export function cancelContract(state, content, now) {
  if (!activeContract(state)) return { ok: false, msg: fill(content.copy?.board?.none, {}) };
  const { paid } = settleContracts(state, content, now);
  state.campaign.contract = null;
  return { ok: true, paid, msg: fill(content.copy?.board?.ended, {}) };
}

// Settled on the elapsed clock like every other timer in this game: nothing
// runs in the background, so the money is computed from `paidThrough` to
// `now` whenever anybody asks. A week away pays a week.
export function settleContracts(state, content, now) {
  const c = activeContract(state);
  if (!c) return { paid: 0, news: [] };
  const op = content.operations?.[c.opId];
  if (!op) { state.campaign.contract = null; return { paid: 0, news: [] }; }
  const hours = Math.max(0, now - (c.paidThrough ?? c.signedAt ?? now)) / HOUR;
  const paid = contractPerHour(op, content) * hours;
  c.paidThrough = now;
  if (paid > 0) state.funds = (state.funds ?? 0) + paid;

  // R116 — ONE LEDGER LINE A DAY, DAY-STAMPED AND NOT TICK-STAMPED, so six
  // visits an hour hear the arrangement once and a week away hears it as the
  // week it was. Why the wire depends on this at all: the note, `operations[]`.
  const news = [];
  const day = Math.floor(now / DAY);
  const last = c.saidOn ?? Math.floor((c.signedAt ?? now) / DAY) - 1;
  for (let d = last + 1; d <= day && news.length < CONTRACT_LINES_MAX; d++) {
    // TWO POOLS, ALTERNATING — a heist is an event and a retainer is a line
    // item, and one pool cannot be both. The ledger line goes through the
    // shared emitter rather than reaching into the pool by hand, because the
    // wire gate scans the SOURCE for emitter calls by name and anything
    // reached another way reads as authored-and-never-said. Do not quote the
    // call shape in a comment here: the scanner counts that as an emitter.
    const headline = d % 2
      ? fill(pickPooled(state, `op:${op.id}`, op.news), { op: op.name })
      : newsFor(state, content, 'op_contract', { op: op.name });
    if (headline) news.push(headline);
  }
  c.saidOn = day;
  return { paid, news };
}

// Every job currently in flight. `operations` is the v27 shape; a save that
// predates it is migrated, so nothing here has to read the old single slot.
export function activeOps(state) {
  return state.campaign.operations ?? [];
}

// The first one, for the call sites that only ever wanted "is anything
// running" — and for the report line, which shows one job at a time.
export function activeOp(state) {
  return activeOps(state)[0] ?? null;
}

// THREE LANES, because "one job at a time" was one rule doing three jobs.
//
//   crewed    — a creature is carried somewhere. One lane per creature fit
//               to work, capped by tuning. Zero is a legal answer: a stable
//               entirely in the Infirmary cannot carry anything anywhere.
//   solo      — you go yourself. Exactly one, always. This is what keeps a
//               player with NO chimeras able to run a job at all, which is
//               rule 1 and predates A4.
//   paperwork — a `crew: 'none'` job. Nobody goes anywhere, so it occupies
//               no lane; the one-run-per-job rule is the only limit it needs.
//
// The floor used to sit on the crewed lane instead, and that was wrong in
// exactly the state this board exists for: lose a fight with a job already
// out and the floor was occupied, so the thing guaranteed to be runnable
// was not runnable.
export function jobSlots(state, content, now) {
  const t = opTuning(content);
  const fit = state.chimeras.filter((c) => !(c.injury && now < c.injury.until)).length;
  return Math.min(t.maxJobs, fit);
}

const laneOf = (run, content) =>
  content.operations?.[run.opId]?.crew === 'none' ? 'paper' : run.chimeraId ? 'crewed' : 'solo';

// The jobs in flight that are actually occupying a creature.
export function crewedOps(state, content) {
  return activeOps(state).filter((r) => laneOf(r, content) === 'crewed');
}

// The one you are personally out doing.
export function soloOps(state, content) {
  return activeOps(state).filter((r) => laneOf(r, content) === 'solo');
}

// Whether `opId` could be launched right now, ignoring cooldowns and odds —
// the lane question only. Shared so the board, the agenda and the launcher
// cannot disagree about who is free.
export function laneFree(state, content, now, op, chimera) {
  if (op.crew === 'none') return true;
  if (chimera) return crewedOps(state, content).length < jobSlots(state, content, now);
  return soloOps(state, content).length < 1;
}

// The creatures who could crew a NEW job right now.
export function freeCrew(state, now) {
  const busy = new Set(activeOps(state).map((r) => r.chimeraId).filter(Boolean));
  return state.chimeras.filter((c) => !busy.has(c.id) && !(c.injury && now < c.injury.until));
}

// How twitchy the county is right now. Stored as a value plus the moment
// it was measured, so it decays on load like every other timer instead of
// needing anything to run in the background.
//
// The decay is EXPONENTIAL on purpose. Linear decay is bang-bang: heat
// either drains to zero or pins at the cap depending on whether your job
// rate happens to sit above or below the drain rate, with no useful middle.
// A half-life gives a smooth equilibrium that scales with how hard you are
// pushing, which is the whole point of the mechanic.
export function heatNow(state, content, now) {
  const t = opTuning(content);
  const heat = state.campaign.heat ?? 0;
  const since = state.campaign.heatAt ?? now;
  const hours = Math.max(0, now - since) / HOUR;
  return Math.max(0, Math.min(t.heatMax, heat * Math.pow(0.5, hours / t.heatHalfLifeHours)));
}

export function addHeat(state, content, now, amount) {
  const t = opTuning(content);
  state.campaign.heat = Math.max(0, Math.min(t.heatMax, heatNow(state, content, now) + amount));
  state.campaign.heatAt = now;
  return state.campaign.heat;
}

// What heat is currently costing you, as a positive number.
export function heatPenalty(state, content, now) {
  const t = opTuning(content);
  return (heatNow(state, content, now) / t.heatMax) * t.heatPenalty;
}

export function opCooldownEndsAt(state, opId) {
  return state.campaign.opCooldowns?.[opId] ?? 0;
}

export function opReady(state, opId, now) {
  return now >= opCooldownEndsAt(state, opId);
}

// R116 — THE BOARD HOLDS CHARGES, and they are the only thing that decides
// how often it can be worked. Deliberately the SAME SHAPE as R43's
// `sparCharges` — one timestamp, everything derived off it, a refill time in
// the past meaning simply full — because a player who has learned the ring
// has already learned this. The metronome it replaces is measured in
// data/notes/operations.md, `tuning`.
export function boardCharges(state, content, now) {
  const t = opTuning(content);
  const max = Math.max(1, t.boardCharges ?? 3);
  const regen = Math.max(1, t.boardRegenHours ?? 8) * HOUR;
  const refillAt = state.campaign?.boardRefillAt ?? 0;
  const outstanding = Math.max(0, Math.ceil((refillAt - now) / regen));
  const charges = Math.max(0, max - Math.min(max, outstanding));
  return {
    charges,
    max,
    ready: charges > 0,
    full: charges >= max,
    msToNext: charges >= max ? 0 : Math.max(0, refillAt - now - (outstanding - 1) * regen),
    msToFull: Math.max(0, refillAt - now),
  };
}

// Spending one. Kept beside the reader so the pair cannot drift, and written
// the way `spendSparCharge` is: `max(refillAt, now)` so a bucket that has
// been full for a week starts its first regen from NOW rather than from
// whenever it last emptied.
function spendBoardCharge(state, content, now) {
  const regen = Math.max(1, opTuning(content).boardRegenHours ?? 8) * HOUR;
  const refillAt = state.campaign.boardRefillAt ?? 0;
  state.campaign.boardRefillAt = Math.max(refillAt, now) + regen;
}

export function opRemainingMs(state, now, opId = null) {
  const run = opId ? activeOps(state).find((r) => r.opId === opId) : activeOp(state);
  return run ? Math.max(0, run.until - now) : 0;
}

// What a creature brings to a job, and the odds it produces. Returned in
// full rather than as a single number, because a player deciding who to
// send should be able to see WHY one candidate is better (Law 4).
export function opOdds(state, op, chimera, content, now) {
  const t = opTuning(content);
  const reasons = [];
  let chance = op.baseChance;

  // The county is still looking for whoever did the last one.
  const cooling = heatPenalty(state, content, now);
  if (cooling > 0.005) {
    chance -= cooling;
    reasons.push({ text: `heat ${Math.round(heatNow(state, content, now))} — everyone is still jumpy`, delta: -cooling });
  }

  if (!chimera) {
    if (op.crew === 'required') {
      return { chance: 0, reasons: [], blocked: 'Somebody has to actually go. Send a chimera.' };
    }
    if (op.crew === 'optional') {
      chance -= t.soloPenalty;
      reasons.push({ text: 'going in person', delta: -t.soloPenalty });
    }
    return { chance: clamp(chance, t), reasons, blocked: null };
  }

  const tokens = Object.values(chimera.tokens);
  const report = analyze(chimera.frame, tokens, content);
  const wanted = op.demands.tags ?? [];
  const matched = wanted.filter((tag) => report.tags.includes(tag));
  if (wanted.length && matched.length) {
    const delta = t.tagBonus * (matched.length / wanted.length);
    chance += delta;
    reasons.push({ text: `${matched.join(' + ')} anatomy`, delta });
  }
  if (op.demands.class && report.creatureClass === op.demands.class) {
    chance += t.classBonus;
    reasons.push({ text: `${op.demands.class} build`, delta: t.classBonus });
  }
  if (op.demands.stat) {
    const value = report.stats[op.demands.stat] ?? 0;
    const delta = Math.min(t.statBonus, (value / t.statPer) * t.statBonus);
    if (delta > 0.01) {
      chance += delta;
      reasons.push({ text: `${op.demands.stat} ${Math.round(value)}`, delta });
    }
  }
  // A creature that has not settled is a liability on a quiet job in
  // exactly the way it is a liability in a fight.
  if (!isSettled(chimera, now)) {
    chance -= t.unsettledPenalty;
    reasons.push({ text: 'unsettled — it has not stopped vibrating', delta: -t.unsettledPenalty });
  }

  return { chance: clamp(chance, t), reasons, blocked: null };
}

const clamp = (n, t) => Math.max(t.minChance, Math.min(t.maxChance, n));

// Launching decides the outcome NOW, seeded, and stores it. Deciding at
// resolution instead would let a reload reroll a bad job, which is the
// one thing a timer-based game must never allow.
// R120 — WHICH JOBS ACTUALLY LAUNCH, asked once. The agenda's row and its
// hint each decided this for themselves and both were wrong the same way:
// `laneFree` alone says yes to a solo job with nobody free to send, so the
// hint counted SEVEN where three start. `opOdds().blocked` is the check
// neither made, and the one `startOperation` consults.
export function runnableOps(state, content, now, crew = null) {
  const running = activeOps(state);
  // R116 — an empty bucket makes the whole board unrunnable, and it says so
  // HERE rather than at each caller. This is the function whose whole job is
  // "the list `startOperation` would accept" (see the note above), and the
  // agenda's row, its hint and the War Room's board all read it. A charge
  // check bolted onto three readers instead is R120's defect verbatim: three
  // places deciding the same thing and disagreeing.
  const bucket = boardCharges(state, content, now);
  if (!bucket.ready) return [];
  return boardOps(content).filter((op) => {
    if (running.some((r) => r.opId === op.id)) return false;
    if (!opReady(state, op.id, now)) return false;
    // Two lanes: go yourself (rider null) or send a creature. Runnable if
    // either opens — requiring a rider counted 1 where 3 launch.
    const riders = [null, crew ?? freeCrew(state, now)[0] ?? null];
    return riders.some((rider) => {
      if (rider && running.some((r) => r.chimeraId === rider.id)) return false;
      if (!laneFree(state, content, now, op, rider)) return false;
      return !opOdds(state, op, rider, content, now).blocked;
    });
  });
}

export function startOperation(state, opId, chimeraId, content, now) {
  const t = opTuning(content);
  const op = content.operations?.[opId];
  if (!op) return { ok: false, msg: 'No such job.' };
  if (op.contract) return { ok: false, msg: fill(content.copy?.board?.not_outing, {}) };
  const running = activeOps(state);
  if (running.some((r) => r.opId === opId)) return { ok: false, msg: 'That job is already under way.' };

  if (!opReady(state, opId, now)) return { ok: false, msg: 'That one needs to go quiet for a while.' };

  const chimera = chimeraId ? state.chimeras.find((c) => c.id === chimeraId) : null;
  if (chimeraId && !chimera) return { ok: false, msg: 'That one is not on the roster.' };
  if (op.crew === 'none' && chimera) return { ok: false, msg: 'This one is paperwork. Nobody needs to be carried anywhere.' };
  if (chimera && running.some((r) => r.chimeraId === chimera.id)) {
    return { ok: false, msg: `${chimera.name} is already out on a job.` };
  }
  if (!laneFree(state, content, now, op, chimera)) {
    return { ok: false, msg: chimera
      ? 'Every crew you have is already out. Bring one home, or grow the stable.'
      : 'You are already out doing something. You are one person.' };
  }
  const odds = opOdds(state, op, chimera, content, now);
  if (odds.blocked) return { ok: false, msg: odds.blocked };
  // R116 — and the board's own pace, checked LAST so a launch that was going
  // to be refused for a better reason still says the better reason.
  const bucket = boardCharges(state, content, now);
  if (!bucket.ready) return { ok: false, msg: fill(content.copy?.board?.no_leads, {}) };

  spendBoardCharge(state, content, now);
  state.campaign.opCount = (state.campaign.opCount ?? 0) + 1;
  const rng = rngStream(state.seed, `op:${opId}`, state.campaign.opCount);
  const success = rng() < odds.chance;
  const funds = success ? Math.round(op.funds[0] + rng() * (op.funds[1] - op.funds[0])) : 0;
  const stock = op.livestock;
  const species = success && stock && rng() < stock.chance ? pick(rng, stock.species) : null;
  const injuryRoll = rng();

  // The flat part is the important half: it means FREQUENCY costs, not
  // just ambition. Four small jobs a day heat the county up as surely as
  // one big one.
  addHeat(state, content, now, t.heatPerJob + (op.notoriety ?? 0) * t.heatPerNotoriety);
  const run = {
    opId,
    chimeraId: chimera?.id ?? null,
    startedAt: now,
    until: now + Math.round(op.hours * HOUR),
    chance: odds.chance,
    // Sealed at launch, opened at resolution.
    outcome: { success, funds, species, injuryRoll },
  };
  state.campaign.operations = [...running, run];
  return {
    ok: true,
    run,
    odds,
    msg: `${op.name} is under way. ${op.hours}h. Do not wait up.`,
  };
}

// R65 — one cooldown rule, in one place: it starts when the crew comes home.
//
// The two paths used to disagree about that moment. A resolved job started
// its cooldown at the TICK, so a job that ended while you were away locked
// for a fresh six hours the moment you looked — the schedule measured your
// habits rather than the job's clock, which is the thing R9 spent a whole
// phase forbidding for counter-offensives. An aborted job started its
// cooldown at `startedAt`, so calling off a six-hour job one minute in
// left it ready sooner than letting it run. Now: `endedAt` is `run.until`
// for a job that finished and `now` for one you called off, because that is
// when the crew is actually back through the door.
function startCooldown(state, content, opId, endedAt) {
  const op = content.operations?.[opId];
  state.campaign.opCooldowns ??= {};
  state.campaign.opCooldowns[opId] = endedAt + Math.round((op?.cooldownHours ?? 6) * HOUR);
}

// Pull out before the clock runs down. The job is off, the cooldown still
// applies, and nothing is gained — but nothing is lost either.
// `now` defaults to the save's own clock rather than the wall clock: this
// module is DOM-free and drives the harness too, and a caller that forgets
// the argument should fall back to the one timestamp the save keeps (R64),
// not to whatever time it happens to be on the machine running the suite.
export function abortOperation(state, content, opId = null, now = state.lastTickAt ?? Date.now()) {
  const run = opId ? activeOps(state).find((r) => r.opId === opId) : activeOp(state);
  if (!run) return { ok: false, msg: 'Nothing is running.' };
  const op = content.operations?.[run.opId];
  state.campaign.operations = activeOps(state).filter((r) => r !== run);
  startCooldown(state, content, run.opId, now);
  return { ok: true, msg: `${op?.name ?? 'The job'} called off. Everyone comes home. Nobody is paid.` };
}

// Elapsed operations, computed on load like every other timer. Returns the
// wire lines rather than pushing them, so this module never has to know
// campaign.js exists.
// Resolves EVERY job whose clock has run out, not just the first — with
// several in flight, a player who is away for a day comes back to all of
// them finished, and quietly dropping the rest would be a reward they earned
// and cannot see. Returns `results` (all of them, oldest first) alongside
// `result` (the newest), because the report card shows one at a time.
export function tickOperations(state, content, now) {
  const news = [];
  const results = [];
  // R116 — the standing arrangement pays first, and it pays on the elapsed
  // clock rather than per tick, so a player who was away for a week is paid
  // for the week rather than for the one tick they came back on.
  news.push(...settleContracts(state, content, now).news);
  for (const run of activeOps(state).filter((r) => now >= r.until).sort((a, b) => a.until - b.until)) {
    const one = resolveOperation(state, content, now, run);
    news.push(...one.news);
    if (one.result) results.push(one.result);
  }
  return { news, results, result: results[results.length - 1] ?? null };
}

// R65 — everything this writes is stamped with `run.until`, the moment the
// job actually ended, never with `now`. `now` is when the player happened to
// look, and a resolver that stamps its output with that hands a week-old
// result a brand-new clock: a fresh cooldown, a fresh bruise, and a newborn
// animal that has been in the van since Tuesday.
function resolveOperation(state, content, now, run) {
  const op = content.operations?.[run.opId];
  const endedAt = run.until;
  state.campaign.operations = activeOps(state).filter((r) => r !== run);
  startCooldown(state, content, run.opId, endedAt);
  if (!op) return { news: [], result: null }; // job retired from the data

  const t = opTuning(content);
  const { success, funds, species, injuryRoll } = run.outcome;
  const news = [];
  const result = {
    opId: run.opId,
    name: op.name,
    success,
    funds: 0,
    animal: null,
    overCapacity: false,
    injured: null,
    msg: success ? op.success : op.failure,
  };

  if (success) {
    state.funds += funds;
    result.funds = funds;
    state.campaign.notoriety += op.notoriety ?? 0;
    // R109 — a job's own headline may be one line or a pool of them. The
    // petting zoo's single sentence ran 274 times in 180 days, 5.8% of
    // everything the world said, because a job the player likes gets run
    // again and again and said the same thing every time.
    const headline = pickPooled(state, `op:${op.id}`, op.news);
    if (headline) news.push(headline);
    if (species && content.species[species]) {
      // The animal ALWAYS arrives, even into a barn that is already full.
      // A reward the player earned and cannot see is a reward they will
      // assume is broken, and the cap has its own teeth anyway: upkeep is
      // per head, and the catalog still refuses to sell you an eleventh
      // goat for a four-goat barn.
      // Born when the van pulled in, so it has grown since — exactly as it
      // would have if the player had been watching the clock.
      const animal = createAnimal(state, species, content, endedAt);
      state.ranch.stock.push(animal);
      result.animal = animal;
      result.overCapacity = state.ranch.stock.length > state.ranch.penCapacity;
    }
  } else {
    // Failure costs time and a bruise. Never the creature — a losing
    // player cannot be punished for trying to stop losing.
    const chimera = state.chimeras.find((c) => c.id === run.chimeraId);
    if (chimera && injuryRoll < 0.5) {
      const hours = t.injuryHours[0] + injuryRoll * 2 * (t.injuryHours[1] - t.injuryHours[0]);
      // From when they limped home, and never shortening a longer one:
      // through `applyInjury`, a bruise picked up on Tuesday cannot heal a
      // battle wound the player is still paying the Infirmary for.
      applyInjury(chimera, {
        name: 'Undignified Exit',
        until: endedAt + Math.round(hours * infirmaryGrants(state, content).healScale * HOUR),
      });
      result.injured = chimera.name;
    }
  }
  return { news, result };
}
