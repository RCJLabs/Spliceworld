// R87 — THE COMPLIANCE TASK FORCE, and a ceiling on notoriety.
//
// Measured before building, over six 180-day walks: the county falls on
// median day 35, every facility track is maxed by median day 28 — BEFORE
// dominion, so from day 29 there is nothing left to buy, ever — and the
// remaining 145 days are 5.1 fights a day won 97% of the time, 96% of them
// at a flat 100%. Funds reach a median $864k at +$5,128 a day. Notoriety
// reaches ~3,975 against a threat ladder whose top rung is 600: for 150
// days it was a number that only went up and nothing read.
//
// §8 risk 5 named the director, variants and contestation as the content
// engines for endless mode. Measured, they produce a SCHEDULE and not a
// second act: every one of those fights is a formality.
//
// THE ANSWER WAS ALREADY WRITTEN, IN THE LADDER'S OWN LAST LINE. Threat
// Generation 4 announces "they have stopped sending police and started
// sending procurement." So procurement is what arrives. Notoriety is capped
// at that top rung — you cannot be more wanted than maximally wanted — and
// past it the State comes for the RANCH rather than for a node.
//
// WHY THE RANCH. Every existing threat costs a node, a purse or an
// opportunity, and by dominion the player holds every node and has more
// money than they can spend, so none of them is a stake. The barn is the
// one thing the endgame player still cares about, and it has never once
// been in danger.
//
// R9'S TWO RULES, UNCHANGED, BECAUSE THEY ARE WHY CONTESTATION IS FAIR:
//
//   1. The next raid is a SCHEDULED TIMESTAMP, never a per-tick roll. A
//      player who opens the app ten times an evening must not be raided ten
//      times as often; the frequency has to measure the world, not their
//      habits.
//   2. The window opens WHEN YOU SEE IT. Come back from a fortnight away
//      and the vans are at the gate now, with the full window ahead of you.
//      This is R9's own exemption in the R65 sweep, for R9's own reason: a
//      levy you were never given the chance to answer is not a stake, it is
//      a punishment for having a life. R85 took the same exemption for the
//      same reason, with a creature instead of a node.
//
// WHAT IT COSTS is money and livestock, and never a creature. A Compliance
// Levy takes a FRACTION of the slush fund — a fraction rather than a figure
// precisely so it scales with the runaway economy it exists to drain — and
// a bounded number of animals go off for inspection. Both are recoverable:
// the catalog sells animals and the world pays income. Zero death language
// throughout; this is procurement, not a raid, and everyone is very polite
// about it.
//
// Beating one buys quiet. Notoriety drops below the cap and the schedule
// resets, so raids are a rhythm the player manages rather than a tax they
// pay — which is the difference between a second act and a treadmill with
// a bill attached.
//
// DOM-free, like every other campaign system, so the walker fights raids
// through the same functions the War Room does.

import { rngStream } from '../util/rng.js';

const HOUR = 3600000;

const DEFAULTS = {
  notorietyCap: 600,
  minHeld: 12,
  firstDelayHours: 18,
  cooldownHours: 33,
  cooldownPerRaidHours: 3,
  cooldownMaxHours: 96,
  jitter: 0.2,
  windowHours: 21,
  escalation: 0.15,
  escalationPerRaid: 0.1,
  escalationMax: 2.5,
  fineFraction: 0.25,
  stockTaken: 2,
  notorietyRelief: 140,
  rewardScale: 2.4,
  pool: [],
  blurb: 'They are not here for the county. They are here for the barn.',
  intel: 'Compliance Task Force at {pct}% strength.',
};

export function taskforceTuning(content) {
  return { ...DEFAULTS, ...(content.taskforceMeta ?? {}) };
}

export function taskforceLines(content) {
  return content.taskforceLines ?? {};
}

export function activeRaid(state) {
  return state.campaign?.raid ?? null;
}

export function raidRemainingMs(raid, now) {
  return raid ? Math.max(0, (raid.deadline ?? 0) - now) : 0;
}

// You cannot be more wanted than maximally wanted. The cap is enforced HERE,
// in the tick that owns the world, rather than at the three places notoriety
// is added (a conquest, a job's heat, a held defence) — one rule in one
// place, and a gate can assert it after any tick rather than having to know
// every writer.
export function capNotoriety(state, content) {
  const t = taskforceTuning(content);
  const cam = state.campaign ?? {};
  const before = cam.notoriety ?? 0;
  if (before <= t.notorietyCap) return false;
  cam.notoriety = t.notorietyCap;
  // Said once, on the tick that first pins it, rather than on every tick
  // after — R75's lesson about the resequencer's full-pen line, which
  // flushed the whole wire every six minutes.
  if (cam.notorietyCapped) return false;
  cam.notorietyCapped = true;
  return true;
}

// Who they come for. Dominion is provocation enough on its own — you have
// taken the whole county and they can read a map — so past it the schedule
// runs regardless of notoriety. Before it, the ceiling is the trigger, and
// `minHeld` keeps a floundering player who has been running jobs for heat
// out of range entirely.
export function taskforceEligible(state, content) {
  const t = taskforceTuning(content);
  const cam = state.campaign ?? {};
  if (!(t.pool ?? []).some((id) => content.encounters?.[id])) return false;
  if (state.dominionAt) return true;
  return (cam.notoriety ?? 0) >= t.notorietyCap && (cam.heldNodes ?? []).length >= t.minHeld;
}

export function escalationOf(state, content) {
  const t = taskforceTuning(content);
  const raids = state.campaign?.raidCount ?? 0;
  const raw = 1 + t.escalation + raids * t.escalationPerRaid;
  return t.escalationMax ? Math.min(t.escalationMax, raw) : raw;
}

// The fight itself, derived from the coalition's top shelf rather than from
// new encounter data — the same trick R9 used, for the same reason: a rung
// on this ladder is a data edit in taskforce.json, not an engine edit.
export function raidEncounter(state, content, raid) {
  if (!raid) return null;
  const t = taskforceTuning(content);
  const base = content.encounters?.[raid.encounterId];
  if (!base) return null;
  const escalation = raid.escalation ?? escalationOf(state, content);
  const authored = base.tier == null ? 1 : content.tierScale?.[base.tier] ?? 1;
  return {
    ...base,
    id: `raid_${raid.id}`,
    baseId: base.id,
    name: 'Defend the ranch',
    blurb: t.blurb,
    scaleOverride: Number((authored * escalation).toFixed(4)),
    escalation,
    intel: (t.intel ?? '').replace('{pct}', String(Math.round(escalation * 100))),
    reward: Math.round((base.reward ?? 0) * t.rewardScale),
    raidOf: raid.id,
  };
}

// What a missed or lost raid actually takes, computed before it is taken so
// the card can say it and the wire can report it.
export function levyOf(state, content) {
  const t = taskforceTuning(content);
  const funds = Math.max(0, state.funds ?? 0);
  return {
    fine: Math.round(funds * t.fineFraction),
    stock: Math.min(t.stockTaken, (state.ranch?.stock ?? []).length),
  };
}

// Applied when the window closes unanswered, and when a raid is fought and
// lost. Never touches `chimeras`: the State requisitions livestock and
// money, and a creature you built is not either of those.
function levy(state, content, raid) {
  const lines = taskforceLines(content);
  const { fine, stock } = levyOf(state, content);
  state.funds = Math.max(0, (state.funds ?? 0) - fine);
  const taken = [];
  for (let i = 0; i < stock; i++) {
    const animal = (state.ranch?.stock ?? [])[0];
    if (!animal) break;
    state.ranch.stock = state.ranch.stock.filter((a) => a !== animal);
    taken.push(animal.name);
  }
  state.campaign.raid = null;
  state.campaign.raidCount = (state.campaign.raidCount ?? 0) + 1;
  state.campaign.leviedTotal = (state.campaign.leviedTotal ?? 0) + fine;
  const key = taken.length ? 'levied' : 'levied_nostock';
  const line = (lines[key] ?? '')
    .replace('{price}', String(fine))
    .replace('{stock}', taken.join(' and '));
  void raid;
  return { fine, taken, news: line ? [line] : [] };
}

// Elapsed raids, computed on load like every other timer. Returns the news
// rather than pushing it, so this module never imports the wire.
export function tickTaskforce(state, content, now) {
  const t = taskforceTuning(content);
  const cam = state.campaign ??= {};
  const lines = taskforceLines(content);
  const news = [];
  const levied = [];

  if (capNotoriety(state, content) && lines.capped) news.push(lines.capped);

  if (!taskforceEligible(state, content)) {
    // Not in range: no schedule runs, and any raid already on the board is
    // stood down rather than left to expire on somebody who has just lost
    // the county back.
    if (cam.raid) cam.raid = null;
    cam.nextRaidAt = null;
    return { news, levied };
  }

  // Arm the schedule the first time they are in range. R9's rule: a
  // timestamp, decided once, from a seeded stream — not a roll per tick.
  if (cam.nextRaidAt == null) {
    const rng = rngStream(state.seed, 'raid', cam.raidCount ?? 0);
    const jitter = 1 + (rng() * 2 - 1) * t.jitter;
    cam.nextRaidAt = now + Math.round(t.firstDelayHours * jitter * HOUR);
    return { news, levied };
  }

  // A raid already at the gate: it either times out, or it waits.
  if (cam.raid) {
    if (now >= cam.raid.deadline) {
      const res = levy(state, content, cam.raid);
      levied.push(res);
      news.push(...res.news);
      const rng = rngStream(state.seed, 'raid', cam.raidCount ?? 0);
      const jitter = 1 + (rng() * 2 - 1) * t.jitter;
      const cool = Math.min(t.cooldownMaxHours, t.cooldownHours + (cam.raidCount ?? 0) * t.cooldownPerRaidHours);
      cam.nextRaidAt = now + Math.round(cool * jitter * HOUR);
    }
    return { news, levied };
  }

  if (now < cam.nextRaidAt) return { news, levied };

  // They arrive. THE WINDOW OPENS NOW, not at `nextRaidAt` — R9's exemption,
  // and the reason a fortnight away cannot cost a levy.
  const n = cam.raidCount ?? 0;
  const rng = rngStream(state.seed, 'raid-pick', n);
  const pool = (t.pool ?? []).filter((id) => content.encounters?.[id]);
  const encounterId = pool[Math.floor(rng() * pool.length)] ?? pool[0];
  cam.raid = {
    id: `raid-${n}`,
    encounterId,
    scheduledAt: cam.nextRaidAt,
    startedAt: now,
    deadline: now + Math.round(t.windowHours * HOUR),
    escalation: escalationOf(state, content),
  };
  if (lines.incoming) news.push(lines.incoming);
  return { news, levied };
}

// Called from resolveBattle. A win clears the board and buys quiet; a loss
// is the same levy the window closing would have taken, because losing on
// purpose must not be cheaper than turning up.
export function resolveRaid(state, content, raidId, outcome, now) {
  const t = taskforceTuning(content);
  const cam = state.campaign ??= {};
  const raid = cam.raid;
  if (!raid || raid.id !== raidId) return null;
  const lines = taskforceLines(content);

  if (outcome !== 'win') {
    const res = levy(state, content, raid);
    const rng = rngStream(state.seed, 'raid', cam.raidCount ?? 0);
    const jitter = 1 + (rng() * 2 - 1) * t.jitter;
    const cool = Math.min(t.cooldownMaxHours, t.cooldownHours + (cam.raidCount ?? 0) * t.cooldownPerRaidHours);
    cam.nextRaidAt = now + Math.round(cool * jitter * HOUR);
    return { outcome: 'lost', ...res };
  }

  cam.raid = null;
  cam.raidCount = (cam.raidCount ?? 0) + 1;
  cam.raidsHeld = (cam.raidsHeld ?? 0) + 1;
  // The spend notoriety never had. Beating them buys quiet, which is what
  // makes this a rhythm rather than a tax — and it drops you out of range
  // entirely before dominion.
  cam.notoriety = Math.max(0, (cam.notoriety ?? 0) - t.notorietyRelief);
  if (cam.notoriety < t.notorietyCap) cam.notorietyCapped = false;
  const rng = rngStream(state.seed, 'raid', cam.raidCount);
  const jitter = 1 + (rng() * 2 - 1) * t.jitter;
  const cool = Math.min(t.cooldownMaxHours, t.cooldownHours + cam.raidCount * t.cooldownPerRaidHours);
  // R65: stamped with when the fight ended, not with the tick that notices.
  cam.nextRaidAt = now + Math.round(cool * jitter * HOUR);
  return { outcome: 'held', relief: t.notorietyRelief, news: lines.repelled ? [lines.repelled] : [] };
}
