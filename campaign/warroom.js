// R60 — the War Room's decisions, DOM-free.
//
// `campaign/ui.js` was 1,139 lines, the largest module in the repo. Almost
// none of that was untested LOGIC in the usual sense: the systems behind
// the screen were already leaf modules — campaign.js, operations.js,
// contest.js, rehab.js, rivals.js, sparring.js, gauntlet.js, monologue.js.
// What lived in the screen was the layer between them and the markup: which
// strip opens by default, which tab earns a badge, what a job row says when
// it cannot be run, how much money a counter-offensive is costing you.
//
// Those are decisions, and every one of them was written inside a template
// literal, where the only way to test it is to render the screen and read
// the HTML back. This is that layer, extracted the way R36 split
// `dexentry.js` out of `dex-ui.js`: functions over state, returning data.
//
// One of them was already wrong. See `contestAlerts`.

import { isSettled } from '../splice/theater.js';
import { territoryUpkeepPerDay, facilityUpkeepPerDay } from '../splice/facility.js';
import { combatantFromChimera } from '../battle/engine.js';
import { forecast } from '../battle/forecast.js';
import { STABLE } from '../ranch/onboarding.js';
import { isInjured, obediencePercent, obedienceIgnoreChance } from '../battle/statblock.js';
import { canSpar, sparEncounter } from './sparring.js';
import { gauntletEncounter } from './gauntlet.js';
import { raidEncounter, activeRaid } from './taskforce.js';
import { breakoutEncounter } from './breakout.js';
import { rivalEncounter } from './rivals.js';
import { directEncounter } from './director.js';
import { contestOn, contestEncounter, contestRemainingMs, defencesOf } from './contest.js';
import {
  activeOp, activeOps, jobSlots, freeCrew, laneFree, soloOps, crewedOps,
  opOdds, opReady, opCooldownEndsAt, opRemainingMs, heatNow,
} from './operations.js';
import {
  regionStates, threatGen, nextThreatRung, incomePerDay, incomeSuspended,
  regionBonusPerDay, regionComplete, nodeById, regionOfNode,
} from './campaign.js';
import { upkeepPerDay, stockUpkeepPerDay, chimeraUpkeepPerDay, TUNING } from '../ranch/ranch.js';
import { liveWaves } from '../battle/engine.js';
import { rivalOf } from '../data/catalog.js';

// --- What are we about to fight? -----------------------------------------
//
// Static encounters live in enemies.json; a rival duel is generated from
// the world seed and their record, so it is identical every time it is
// resolved — briefing preview and battle always face the same team.
//
// This is the single most consequential function on the screen: it is
// called once to draw the briefing and again to build the battle, and if
// the two calls disagree the player commits a team against one fight and
// walks into another.
export function warTargetEncounter(state, target, content, now) {
  if (!target) return null;
  if (target.kind === 'rival') {
    const rival = rivalOf(content, target.rivalId);
    return rival ? withLiveWaves(rivalEncounter(state, rival, content), content) : null;
  }
  // R41: a spar is a derived rematch at reduced scale, and the director
  // does NOT get a look at it — a drill that adapts to you is a second
  // front, and the ring exists to not be one.
  if (target.kind === 'sparring') {
    return withLiveWaves(sparEncounter(state, content, target.nodeId, now).encounter, content);
  }
  // R82: a loose specimen. One rival chimera, standing on its own, and the
  // director does not rewrite it either — nobody is directing it, which is
  // rather the point.
  if (target.kind === 'breakout') {
    return withLiveWaves(breakoutEncounter(state, content, target.breakoutId), content);
  }
  // R42: a Gauntlet stage. The director does not rewrite it — this IS the
  // coalition's answer.
  if (target.kind === 'gauntlet') {
    return withLiveWaves(gauntletEncounter(state, content, target.stageId).encounter, content);
  }
  // R87: the Compliance Task Force at the gate. Built fresh from the live
  // raid, like a defence, so the briefing and the battle always agree — and
  // the director does NOT rewrite it: this is procurement, and procurement
  // does not improvise.
  if (target.kind === 'raid') {
    return withLiveWaves(raidEncounter(state, content, activeRaid(state)), content);
  }
  // A defence is the node's own encounter, escalated — built fresh from
  // the live contest so the briefing and the battle always agree.
  const base =
    target.kind === 'defend'
      ? contestEncounter(state, content, contestOn(state, target.nodeId))
      : content.encounters[target.encounterId];
  // The AI director gets a look at every human encounter before you do.
  return base ? withLiveWaves(directEncounter(state, base, content), content) : null;
}

// R79 — one funnel, one filter.
//
// Every human-launched fight comes through `warTargetEncounter`, which is
// exactly why it is the place to drop a wave the build no longer has: a
// retired unit is then absent from the BRIEFING as well as the battle, so
// the two still agree, which is this function's whole job. The engine keeps
// its own stand-in for the queue inside a save — but a live encounter
// assembled today should never need it.
//
// An encounter left with no opposition at all is not a fight. Returning
// null here is what every launcher already handles: the target simply is
// not offered.
function withLiveWaves(encounter, content) {
  if (!encounter) return null;
  const waves = liveWaves(encounter.waves, content);
  if (!waves.length) return null;
  return waves.length === (encounter.waves?.length ?? 0) ? encounter : { ...encounter, waves };
}

// --- Sub-navigation -------------------------------------------------------

export const WAR_TABS = [
  { id: 'map', icon: 'map', label: 'Map' },
  { id: 'jobs', icon: 'briefcase', label: 'Jobs' },
  { id: 'labs', icon: 'petri-dish', label: 'Labs' },
  { id: 'bays', icon: 'chain', label: 'Bays' },
  { id: 'wire', icon: 'satellite', label: 'Wire' },
];

// A badge is a promise that something is waiting, so only two things earn
// one: a job report nobody has read, and a bay with something in it.
// Everything else would be decoration, and a decoration on a tab teaches
// players to ignore the badges that matter.
export function tabBadge(state, id) {
  if (id === 'jobs') {
    if (state.campaign.opReport) return { text: '!', kind: 'alert' };
    if (activeOp(state)) return { text: '⏳', kind: 'busy' };
    return null;
  }
  if (id === 'bays') {
    const n = state.campaign.containment?.length ?? 0;
    return n ? { text: String(n), kind: 'count' } : null;
  }
  // R82: a loose specimen is something waiting, which is the bar a badge has
  // to clear. It is a count rather than an alert because nothing is lost by
  // leaving it — that is the whole difference between an escapee and a
  // counter-offensive, and the badge should not lie about which one this is.
  if (id === 'labs') {
    const n = state.campaign.loose?.length ?? 0;
    return n ? { text: String(n), kind: 'count' } : null;
  }
  return null;
}

// --- The map --------------------------------------------------------------

// The strip you are actually fighting in: the first open one you have not
// finished. It starts unfolded and everything else starts shut, because
// five strips at four nodes each is a long column to scroll past to reach
// the news. A player's own fold choice always overrides this guess.
export function frontierRegionId(state, content, map = regionStates(state, content)) {
  return map.find((r) => r.open && r.held < r.region.nodes.length)?.region.id ?? null;
}

// R43 made the ring hold charges and R49 made the map read `canSpar` rather
// than the bucket alone. The VERDICT is shared with the agenda and the
// Pens; the wording is not, because this is a chip in a node row and the
// Pens has a whole line.
export function sparVerdict(state, content, now) {
  const gate = canSpar(state, content, now);
  return {
    ...gate,
    kind: gate.ok ? 'charges' : gate.reason === 'nobody-fit' ? 'nobody-fit' : 'cooling',
  };
}

// The econ row. Territory is gross; what the lab banks is territory plus
// the stipend minus what the stable eats, and since R25 the stable eats
// plenty.
export function econRow(state, content) {
  const income = incomePerDay(state, content);
  const upkeep = upkeepPerDay(state, content);
  return {
    // R143 — where the bill goes. A cost the player cannot see is a cost they
    // cannot act on, and the point of a garrison is weighing it against what
    // the node pays.
    upkeepParts: {
      stock: Math.round(stockUpkeepPerDay(state, content)),
      chimeras: Math.round(chimeraUpkeepPerDay(state, content)),
      territory: Math.round(territoryUpkeepPerDay(state, content)),
      facility: Math.round(facilityUpkeepPerDay(state, content)),
    },
    notoriety: state.campaign.notoriety,
    gen: threatGen(state, content),
    nextRung: nextThreatRung(state, content),
    income,
    bonus: regionBonusPerDay(state, content),
    suspended: incomeSuspended(state, content),
    upkeep,
    net: Math.round(TUNING.stipendPerDay + income - upkeep),
    record: state.warRecord,
  };
}

// A9: the strip bonus needs saying on the strip, not only in the econ row —
// "one node left" is a different sentence when finishing it pays a standing
// bonus, and a contest that suspends one is worth answering for more than
// the node it took.
export function stripState(state, content, region, contestedHere) {
  if (!region.completionBonus) return null;
  if (regionComplete(state, content, region)) return 'paying';
  return contestedHere ? 'suspended' : 'available';
}

// --- What a counter-offensive is actually costing -------------------------
//
// THE BUG THIS PHASE FOUND. Each alert used to compute its own strip bonus
// inline — "is every node in my strip held?" — and if it was, claimed the
// WHOLE bonus was at risk from this one contest. With two contests open in
// the same completed strip, both alerts claimed the same $180, so the
// alerts added up to $570/day while the econ row on the same screen said
// $390. Three contests: $855 against $495.
//
// It was unreachable only because `contestation.maxConcurrent` ships as 1.
// That value lives in data/regions.json, and CLAUDE.md promises content
// changes never require engine edits — so raising it to 2, the single most
// obvious knob in the file, made the War Room start lying about money.
//
// The strip bonus is a property of the STRIP, not of any one contest, so it
// is attributed once: to the first contest listed in that strip. The others
// say the strip is already counted rather than counting it again. The total
// across the alerts now equals `incomeSuspended`, which is what the econ row
// prints — one number, two places, by construction.
export function contestAlerts(state, content, now) {
  // strip id -> the node whose alert is carrying that strip's bonus.
  const claimedStrips = new Map();
  return (state.campaign.contested ?? []).map((contest) => {
    const node = nodeById(content, contest.nodeId);
    if (!node) return null;
    const strip = regionOfNode(content, contest.nodeId);
    // "Complete but for the contests" — held end to end, which is the state
    // in which the bonus is being paid until a counter-offensive suspends
    // it. `regionComplete` is the wrong predicate here on purpose: it also
    // requires no contest, and there is one, or we would not be drawing an
    // alert about it.
    const stripHeld = Boolean(strip?.completionBonus)
      && strip.nodes.every((n) => state.campaign.heldNodes.includes(n.id));
    const first = stripHeld && !claimedStrips.has(strip.id);
    if (first) claimedStrips.set(strip.id, node.name);
    return {
      nodeId: contest.nodeId,
      name: node.name,
      remainingMs: contestRemainingMs(contest, now),
      defences: defencesOf(state, contest.nodeId),
      nodeIncome: node.incomePerDay,
      // Counted once per strip, by the first alert that mentions it.
      bonusAtRisk: first ? strip.completionBonus : 0,
      // The others still need to SAY the strip is down — they just must not
      // add it to their own total a second time, and they name the alert
      // that is carrying it so the player can find the money.
      stripAlsoDown: stripHeld && !first,
      stripCountedOn: stripHeld && !first ? claimedStrips.get(strip.id) : null,
      stripName: stripHeld ? strip.name : null,
    };
  }).filter(Boolean);
}

// --- Jobs -----------------------------------------------------------------

export function heatBand(heat) {
  if (heat > 55) return 'awake';
  if (heat > 20) return 'noticed';
  return 'quiet';
}

// Count the lanes separately or the arithmetic lies: a solo job with no
// stable read as "1/0 crews out", and the board offered "-1 of 0 crews
// free". Crews are creatures; you are not one of them.
export function jobsModel(state, content, now) {
  const runs = activeOps(state);
  const slots = jobSlots(state, content, now);
  const free = freeCrew(state, now);
  return {
    runs: runs.map((run) => ({
      run,
      op: content.operations[run.opId],
      who: state.chimeras.find((c) => c.id === run.chimeraId) ?? null,
      remainingMs: opRemainingMs(state, now, run.opId),
    })),
    slots,
    crewsOut: crewedOps(state, content).length,
    youOut: soloOps(state, content).length > 0,
    heat: Math.round(heatNow(state, content, now)),
    report: state.campaign.opReport,
  };
}

// One row of the job board. Three lanes (operations.js): carried by a
// creature, done by you, or paperwork. Saying WHICH lane is full is the
// honest reason; a greyed-out button with no explanation is the thing R29
// was about.
export function jobRow(state, content, op, now, runs = activeOps(state), free = freeCrew(state, now)) {
  const out = runs.some((r) => r.opId === op.id);
  const cooling = !opReady(state, op.id, now);
  const crew = op.crew === 'none' ? null : free[0] ?? null;
  const noSlot = laneFree(state, content, now, op, crew) || laneFree(state, content, now, op, null)
    ? null
    : crew ? 'no crew free' : 'you are out';
  return {
    op,
    out,
    cooling,
    ready: !cooling && !out,
    odds: opOdds(state, op, crew, content, now),
    noSlot,
    cooldownEndsAt: opCooldownEndsAt(state, op.id),
  };
}

// --- The briefing ---------------------------------------------------------

// What are we walking into? The class triangle only matters if the player
// can see the matchup before they commit a team, and R35 added the other
// layer — the tag chart, live in 96% of the encounters.
export function foeRead(encounter, content) {
  const units = encounter.waves.flat()
    .map((u) => (typeof u === 'string' ? content.enemies[u] : u))
    .filter(Boolean);
  return {
    units,
    classes: new Set(units.map((u) => u.class).filter(Boolean)),
    tags: new Set(units.flatMap((u) => u.tags ?? [])),
    attackTags: new Set(units
      .flatMap((u) => (u.moves ?? []).filter((m) => (m.power ?? 0) > 0).flatMap((m) => m.tags ?? []))),
  };
}

// A7: obedience as a DECISION rather than a percentage. Who on this team
// can actually ignore an order, and what is the worst of them — the two
// facts the briefing needs before it decides whether to pay for the extra
// 32 forecast replays.
export function obedienceRead(picked, now) {
  const disobedient = picked.filter((c) => obedienceIgnoreChance(c, now) > 0);
  return {
    disobedient,
    worst: disobedient.length ? Math.min(...disobedient.map((c) => obediencePercent(c, now))) : 100,
  };
}

// R37: on a losing verdict the briefing says why, and "bring more
// creatures" must not be offered to a player who has already filled the
// team or has nobody fit left on the bench.
export function canBringMore(state, team, now, cap) {
  return team.length < cap
    && state.chimeras.some((c) => !team.includes(c.id) && !isInjured(c, now) && isSettled(c, now));
}

// The team as the launch button will read it: picked, minus anyone the
// Infirmary has taken since they were picked.
export function fitTeam(state, team, now) {
  return team.map((id) => state.chimeras.find((c) => c.id === id)).filter((c) => c && !isInjured(c, now));
}

// --- Who should I send? (R123) --------------------------------------------
//
// Asked for directly, and the obvious answers are wrong twice over. Both
// were measured before any of this was written.
//
// RANKING BY A SOLO FORECAST RANKS NOBODY. One creature against a
// multi-wave encounter is 0% for the structural reason forecast.js
// documents at length — "Bodies, not numbers" — so every creature ties and
// a stable sort hands the roster back in the order it was already in.
//
// AND RAW STRENGTH IS THE WRONG SIGNAL. On a class-mixed roster of nine,
// across the 13 of 14 encounters where the pick changes the outcome (mean
// spread 76 points), picking the three biggest creatures lands 17.3pp off
// the best team — indistinguishable from not choosing at all — while
// picking by the CLASS TRIANGLE lands 8.7pp off. The triangle is the thing
// the game is about, and it is the thing that carries this.
//
// A short forecast run closes the rest. Score every legal team by the
// triangle, forecast only the best few, take the winner: measured at
// 2.9pp off brute force for eight forecasts, where the briefing already
// pays for one and brute force over nine creatures would cost 84.
export const TEAM_SIZE = STABLE;

// A creature's worth against THIS opposition. The triangle first, at a
// weight nothing else can outvote, then bulk to break ties — that ordering
// is the measured finding rather than a preference.
function memberScore(chimera, foeClasses, content, now) {
  const u = combatantFromChimera(chimera, content, now);
  const power = Math.max(...(u.moves ?? []).map((m) => m.power ?? 0), 0);
  let edge = 0;
  for (const fc of foeClasses) {
    if (content.classes?.[u.creatureClass]?.beats === fc) edge += 1;
    if (content.classes?.[fc]?.beats === u.creatureClass) edge -= 1;
  }
  // R148 — AND STAMINA, BECAUSE HP STOPPED BEING WHAT SEPARATES A CHASSIS.
  //
  // This shortlist is what the forecast budget gets spent on, so anything it
  // cannot see is a team the briefing will never suggest. It read health,
  // reach and armour, which was a fair proxy while the frames were a
  // staircase — bigger chassis, more hp, better creature. R148 repriced them
  // into a trade and that proxy stopped working: measured over every whole
  // animal in the catalogue, maxHp now reads 109 / 111 / 109 across Scamper,
  // Trotter and Rumbler, three numbers that say nothing, while stamina reads
  // 55 / 61 / 65 and is where the Rumbler's long-fight edge actually lives.
  //
  // The gate caught it before a player could: the suggestion landed 7.5pp off
  // the best team on its worst roster, against a bar of 5. The weights are
  // the measured worth of a point relative to a point of health — stamina
  // 1.07, regen 2.1 — rounded to 1 and 2.
  return {
    edge,
    score: edge * 1000 + (u.maxHp ?? 0) + (u.stamina ?? 0) + (u.regen ?? 0) * 2
      + power * 4 + (u.armor ?? 0) * 3,
    cls: u.creatureClass,
  };
}

const teamsOf = (list, size) => {
  const out = [];
  const walk = (start, acc) => {
    if (acc.length === size) { out.push([...acc]); return; }
    for (let i = start; i < list.length; i++) { acc.push(list[i]); walk(i + 1, acc); acc.pop(); }
  };
  walk(0, []);
  return out;
};

// `budget` is the number of forecasts this is allowed to spend, and it is
// REPORTED back rather than assumed: a gate that trusts the caller's number
// is not measuring the code.
//
// TWELVE, measured. Eight was the first answer and it held on the roster it
// was tuned against — 3.0pp and 1.8pp off the best team on two rosters, then
// 9.5pp on a third. Twelve takes the worst roster to 4.2pp and the mean to
// 3.3; sixteen and twenty-four buy nothing more on the worst case, because
// past that the limit is the shortlist's ordering rather than its length.
// Twelve forecasts at 12 runs is about 45ms, against the one the briefing
// already pays for.
export function suggestTeam(state, encounter, content, now, { budget = 12 } = {}) {
  const fit = (state.chimeras ?? []).filter((c) => !isInjured(c, now) && isSettled(c, now));
  if (fit.length < TEAM_SIZE) return { team: fit.slice(0, TEAM_SIZE), forecasts: 0, winRate: null, why: fit.length ? 'Everyone else is in the Infirmary or still settling.' : 'Nobody is fit to send.' };

  const { classes: foeClasses } = foeRead(encounter, content);
  const scores = new Map(fit.map((c) => [c.id, memberScore(c, [...foeClasses], content, now)]));
  const ranked = teamsOf(fit, TEAM_SIZE)
    .map((t) => ({ t, s: t.reduce((n, c) => n + scores.get(c.id).score, 0) }))
    .sort((a, b) => b.s - a.s);

  // Seeded like everything else here: the same briefing asked twice gets
  // the same answer, so a suggestion is a fact about the matchup rather
  // than a thing that moves when you look at it.
  const seed = state.seed ?? 1;
  let best = null;
  let spent = 0;
  for (const cand of ranked.slice(0, budget)) {
    const wr = forecast(cand.t, encounter, content, seed, now, { runs: 12 }).winRate;
    spent += 1;
    if (!best || wr > best.wr) best = { team: cand.t, wr };
  }

  const list = (xs) => (xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
  const nameOf = (k) => content.classes?.[k]?.name ?? k;
  const withEdge = best.team.filter((c) => scores.get(c.id).edge > 0);
  // Only the foe classes this team actually BEATS. Naming every class the
  // opposition fields would claim an edge over the ones they are level or
  // behind on, which is the briefing overselling a pick — A1's rule.
  const beatenNames = [...new Set(withEdge.flatMap((c) => [...foeClasses]
    .filter((fc) => content.classes?.[scores.get(c.id).cls]?.beats === fc)))].map(nameOf);
  const why = withEdge.length
    ? `${list(withEdge.map((c) => c.name))} bring ${
      list([...new Set(withEdge.map((c) => nameOf(scores.get(c.id).cls)))])
    } against their ${list(beatenNames)}.`
    : `Nobody here has the triangle against ${list([...foeClasses].map(nameOf))}, so this is the sturdiest three you have.`;

  return { team: best.team, forecasts: spent, winRate: best.wr, why };
}

// --- After the fight ------------------------------------------------------

export function aftermathText(detail) {
  const bits = [];
  if (detail.rival && detail.outcome === 'win') bits.push(`${detail.rival} defeated.`);
  else if (detail.rival && detail.outcome === 'loss') bits.push(`${detail.rival} wins this round.`);
  if (detail.outcome === 'win') bits.push(`Victory!${detail.reward ? ` Confiscated budget: $${detail.reward}.` : ''}`);
  else if (detail.outcome === 'fled') bits.push('Tactical scamper executed flawlessly.');
  else bits.push('Defeat.');
  if (detail.defended === true) bits.push(`${detail.node} holds.${detail.wreckage ? ` A ${detail.wreckage} was left behind and is now in Containment.` : ''}`);
  else if (detail.defended === false) bits.push(`${detail.node} is theirs again. It can be retaken.`);
  if (detail.freed) bits.push(`${detail.freed} is home safe (and slightly dramatic about it).`);
  if (detail.capturedChimera) bits.push(`${detail.capturedChimera} was CAPTURED — a rescue window is open in the War Room.`);
  if (detail.salvageUnits.length) bits.push(`Impounded: ${detail.salvageUnits.length} unit(s) for Containment.`);
  // R41: what the fight paid in experience — the number that stays on the
  // creature. Level-ups get their own sentence; a rank earned is news.
  if (detail.xp?.length) {
    bits.push(`+${detail.xp[0].gained} xp each.`);
    const ranked = detail.xp.filter((r) => r.leveled);
    if (ranked.length) bits.push(ranked.map((r) => `${r.name} reaches Level ${r.level}!`).join(' '));
  }
  const treatable = detail.injuries.filter((i) => i.chimera !== detail.capturedChimera);
  if (treatable.length) bits.push(treatable.map((i) => `${i.chimera} → Infirmary (${i.injury.name}).`).join(' '));
  return bits.join(' ');
}

