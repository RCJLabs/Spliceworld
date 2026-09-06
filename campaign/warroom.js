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
import { upkeepPerDay, TUNING } from '../ranch/ranch.js';
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

