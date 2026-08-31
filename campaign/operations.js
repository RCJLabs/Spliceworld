// Operations — the Jobs board (non-combat missions). Pure and DOM-free.
//
// WHY THIS EXISTS. Before it, every route to money and to new fauna ran
// through winning battles: held nodes paid the income, battles paid the
// purses, and `unlocksFauna` gated the Mail-Order catalog behind conquest.
// A player who kept losing therefore had $22/day, a catalog containing
// exactly two species — Goat and Ram — and no path at all to Water or Air
// anatomy, which is precisely what the class triangle says you need in
// order to stop losing. That is a spiral with no floor.
//
// So four rules, and all four are load-bearing:
//
//   1. Something is ALWAYS runnable. The floor jobs need no territory, no
//      notoriety, no chimera and no particular anatomy.
//   2. Failure costs time and a bruise, never a creature. You cannot
//      punish a losing player for trying to stop losing.
//   3. `demands` improve the odds; they never gate the job. Requiring
//      Aquatic anatomy before you may rob the aquarium that would GIVE
//      you Aquatic anatomy is the same circle in a smaller hat.
//   4. A job needs a CREW, so the board runs as wide as your stable does
//      (A4). It used to be one job at a time, full stop, which meant a
//      session was: check timers, launch the one job, fight once, wait —
//      and if the fight was lost, there was nothing left but four different
//      ways to spend money. Slots now scale with the creatures who are fit
//      to work, floored at one so the crewless paperwork job is ALWAYS
//      runnable (rule 1) and capped so a large stable does not turn the
//      board into an idle-game payout tap. Growing a stable was already the
//      answer to A1's solo cliff; this makes it the answer to the empty
//      evening as well.
//   5. Heat is the price, and it is a MECHANIC rather than a nerf. Every
//      job leaves the county twitchy; heat decays in real time and, while
//      it lasts, subtracts from the odds of everything. Trimming payouts
//      to cap the ceiling would have punished exactly the broke player
//      this board exists for. Heat only ever bites the player running
//      jobs back to back — check in once a day and you will never see it.
//
// Conquest stays the better deal: it puts a species in the catalog to buy
// instantly and repeatedly, where a job hands you one animal, sometimes,
// on a timer, with the authorities taking an interest.

import { rngStream, pick } from '../util/rng.js';
import { analyze } from '../splice/physiology.js';
import { isSettled } from '../splice/theater.js';
import { createAnimal } from '../ranch/ranch.js';
import { infirmaryGrants } from '../splice/facility.js';

const HOUR = 3600000;

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
export function startOperation(state, opId, chimeraId, content, now) {
  const t = opTuning(content);
  const op = content.operations?.[opId];
  if (!op) return { ok: false, msg: 'No such job.' };
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

// Pull out before the clock runs down. The job is off, the cooldown still
// applies, and nothing is gained — but nothing is lost either.
export function abortOperation(state, content, opId = null) {
  const run = opId ? activeOps(state).find((r) => r.opId === opId) : activeOp(state);
  if (!run) return { ok: false, msg: 'Nothing is running.' };
  const op = content.operations?.[run.opId];
  state.campaign.operations = activeOps(state).filter((r) => r !== run);
  state.campaign.opCooldowns ??= {};
  state.campaign.opCooldowns[run.opId] = run.startedAt + Math.round((op?.cooldownHours ?? 6) * HOUR);
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
  for (const run of activeOps(state).filter((r) => now >= r.until).sort((a, b) => a.until - b.until)) {
    const one = resolveOperation(state, content, now, run);
    news.push(...one.news);
    if (one.result) results.push(one.result);
  }
  return { news, results, result: results[results.length - 1] ?? null };
}

function resolveOperation(state, content, now, run) {
  const op = content.operations?.[run.opId];
  state.campaign.operations = activeOps(state).filter((r) => r !== run);
  state.campaign.opCooldowns ??= {};
  state.campaign.opCooldowns[run.opId] = now + Math.round((op?.cooldownHours ?? 6) * HOUR);
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
    if (op.news) news.push(op.news);
    if (species && content.species[species]) {
      // The animal ALWAYS arrives, even into a barn that is already full.
      // A reward the player earned and cannot see is a reward they will
      // assume is broken, and the cap has its own teeth anyway: upkeep is
      // per head, and the catalog still refuses to sell you an eleventh
      // goat for a four-goat barn.
      const animal = createAnimal(state, species, content, now);
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
      chimera.injury = { name: 'Undignified Exit', until: now + Math.round(hours * infirmaryGrants(state, content).healScale * HOUR) };
      result.injured = chimera.name;
    }
  }
  return { news, result };
}
