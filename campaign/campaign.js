// Campaign shell (M5). Pure functions over state: region nodes, notoriety
// and Threat Generations, income ticks, capture-on-loss → dissection
// countdown → rescue raids, Containment salvage, and the news feed. All
// timers are timestamps; tickCampaign computes elapsed effects on load.

import { rngStream, pick, randInt } from '../util/rng.js';
import { pushNews, emitNews, newsFor } from './wire.js';
import { recordGauntletWin, gauntletComplete } from './gauntlet.js';
import { GRADES } from '../splice/extract.js';
import { infirmaryGrants } from '../splice/facility.js';
import { finishBattle, applyInjury } from '../battle/engine.js';
import { recordRivalResult, scoutStable } from './rivals.js';
import { directorNews } from './director.js';
import { tickRehab, findBay } from './rehab.js';
import { tickContests, resolveContest, isContested } from './contest.js';
import { playerLine, rivalLine } from './monologue.js';
import { tickOperations } from './operations.js';
import {
  regionList, allNodes, nodeById, regionOfNode,
  threatGen as mapThreatGen, threatLadder, threatRung, nextThreatRung,
  regionBlockers, regionOpen, nodeStates as mapNodeStates, regionStates as mapRegionStates,
} from './map.js';

const DAY = 86400000;
const HOUR = 3600000;

// R62: the wire moved to campaign/wire.js, which owns both the buffer and
// the copy. Re-exported because main.js pushes the lines that other systems
// hand it (a job report, a rehab graduation) and should not have to know
// which module holds the buffer.
export { pushNews, emitNews };

// Map lookups live in map.js so contest.js can share them without the two
// modules importing each other; re-exported here because the War Room has
// always reached for the campaign module.
export { regionList, allNodes, nodeById, regionOfNode };

// Kept for the handful of callers that just want somewhere to start.
export function regionOf(content) {
  return regionList(content)[0];
}

// Gating and the Threat ladder live in map.js so contest.js and the AI
// director can share them without importing this module; re-exported here
// because the War Room has always reached for the campaign module. The two
// wrappers thread the contest list through, which map.js deliberately does
// not know about.
export { threatLadder, threatRung, nextThreatRung, regionBlockers, regionOpen };
export const threatGen = mapThreatGen;

const contestedIds = (state) => (state.campaign.contested ?? []).map((c) => c.nodeId);

export function nodeStates(state, content, region = regionOf(content)) {
  return mapNodeStates(state, content, region, contestedIds(state));
}

export function regionStates(state, content) {
  return mapRegionStates(state, content, contestedIds(state));
}

// A9: holding an entire strip pays a standing bonus on top of its nodes —
// worth about the region's best single node, so clearing the last cheap
// outpost in a region is worth more than its own line on the ledger says.
// A region only counts while every node is held AND none is contested,
// which is what makes defending the cheapest node in a completed strip as
// urgent as defending the richest.
export function regionComplete(state, content, region) {
  return region.nodes.every(
    (n) => state.campaign.heldNodes.includes(n.id) && !isContested(state, n.id)
  );
}

// --- R40: the campaign has an end, and never said so --------------------
//
// Taking The Boardroom — the last node of the last region, past Director
// Prime — ran the same three lines as taking the Old Barn Perimeter:
// "seized", the player's conquest bark, and on to the next thing. Nothing
// anywhere read "every node held". Twenty-one nodes, twenty-four
// encounters, five regions and three rival labs, and the run terminated in
// silence.
//
// This is deliberately NOT a win state that ends anything. ROADMAP §8's
// fifth risk is endless mode going stale, and its mitigation is the
// director, variants and R9's counter-offensives — all of which keep
// running. What was missing is the moment the arc closes, said once.
//
// Derived from the roster, never from a count typed here: add a sixth
// region and dominion simply moves further away.
export function dominion(state, content) {
  // allNodes returns { node, region } pairs, not bare nodes.
  const nodes = allNodes(content).map((e) => e.node);
  const held = nodes.filter((n) => state.campaign.heldNodes.includes(n.id));
  const rivals = Object.values(content.rivals ?? {});
  const beaten = rivals.filter((r) => (state.campaign.rivals?.[r.id]?.defeats ?? 0) > 0);
  return {
    nodesHeld: held.length,
    nodesTotal: nodes.length,
    rivalsBeaten: beaten.length,
    rivalsTotal: rivals.length,
    // The MAP is the campaign; the rival ladder runs beside it (R27) and is
    // reported rather than required. Contested nodes still count as held —
    // losing one to a counter-offensive must not retract something the
    // player was already told, and R9 puts it back on the map to retake.
    complete: nodes.length > 0 && held.length === nodes.length,
    // Reported separately so the screen can say "and every rival too"
    // without the two being welded into one condition.
    rivalsAllBeaten: rivals.length > 0 && beaten.length === rivals.length,
  };
}

// The moment, fired exactly once. `dominionAt` is the only thing that makes
// it once rather than every render, which is what SAVE_VERSION 30 buys.
export function claimDominion(state, content, now) {
  if (state.dominionAt) return null;
  const d = dominion(state, content);
  if (!d.complete) return null;
  state.dominionAt = now;
  return d;
}

// What the standing banner says. DOM-free and here rather than in the view,
// so it can be asserted directly — `renderWarRoomScreen` touches
// document.body and cannot run headless, and a gate that greps the view's
// source for a template literal tests the spelling of the code rather than
// what the player reads.
//
// Null until the moment has actually been claimed, which is what keeps the
// banner off the map for everyone who has not finished.
export function dominionBanner(state, content) {
  if (!state.dominionAt) return null;
  const d = dominion(state, content);
  const lost = d.nodesTotal - d.nodesHeld;
  const openLabs = d.rivalsTotal - d.rivalsBeaten;
  return {
    title: 'The County Is Yours',
    body: `All ${d.nodesTotal} nodes held${
      d.rivalsAllBeaten ? `, all ${d.rivalsTotal} rival labs beaten` : ''
    }. The paperwork alone will outlive everyone involved.`,
    // Honest about the live map without retracting what was earned: R9 will
    // take nodes back, and the banner says so rather than quietly lying.
    note: (lost > 0
      ? `${lost} back in coalition hands. Take ${lost === 1 ? 'it' : 'them'} again.`
      : 'They keep coming for it. That is the arrangement.')
      + (openLabs > 0
        ? ` · ${openLabs} rival lab${openLabs === 1 ? '' : 's'} still open for business.`
        : ''),
  };
}

// …and the announcement, so the two callers cannot drift.
//
// There ARE two callers, and the browser is what proved it: firing this only
// where a node is taken means a player who already holds all twenty-one —
// anyone migrating in from v29 having finished the map — has no node left to
// take and would never be told. The smoke gate for that case called
// claimDominion directly and passed while the game itself never reached it,
// which is a gate testing a function rather than the path a player walks.
export function announceDominion(state, content, now) {
  const won = claimDominion(state, content, now);
  if (!won) return null;
  emitNews(state, content, 'dominion', {
    nodes: won.nodesTotal,
    rivals: won.rivalsAllBeaten ? ` All ${won.rivalsTotal} rival labs beaten.` : '',
  });
  const boast = playerLine(state, content, 'dominion', { nodes: won.nodesTotal });
  if (boast) pushNews(state, boast);
  // Said in the same breath, because R9 means this is a milestone and not an
  // ending: the coalition keeps coming for what you hold.
  emitNews(state, content, 'dominion_continues');
  return won;
}

// [{ region, bonus }] for every strip currently paying its completion
// bonus. Data-driven: a region with no `completionBonus` simply pays none,
// so adding a sixth region needs no engine edit.
export function completedRegions(state, content) {
  return regionList(content)
    .filter((r) => r.completionBonus && regionComplete(state, content, r))
    .map((r) => ({ region: r, bonus: r.completionBonus }));
}

export function regionBonusPerDay(state, content) {
  return completedRegions(state, content).reduce((sum, r) => sum + r.bonus, 0);
}

// What territory actually pays. A contested node is suspended, which is
// the sting that makes a counter-offensive worth answering before the
// window closes — the node itself is recoverable, the lost days are not.
export function incomePerDay(state, content) {
  const nodes = allNodes(content)
    .map((e) => e.node)
    .filter((n) => state.campaign.heldNodes.includes(n.id) && !isContested(state, n.id))
    .reduce((sum, n) => sum + n.incomePerDay, 0);
  return nodes + regionBonusPerDay(state, content);
}

// What it would pay with the line held — for a War Room that can show the
// player what the convoy is costing them. A contest inside a completed
// strip suspends the strip's bonus too, so that has to be counted here or
// the "suspended" figure understates what the convoy is actually taking.
export function incomeSuspended(state, content) {
  const nodes = allNodes(content)
    .map((e) => e.node)
    .filter((n) => isContested(state, n.id))
    .reduce((sum, n) => sum + n.incomePerDay, 0);
  const bonusLost = regionList(content)
    .filter((r) => r.completionBonus)
    .filter((r) => r.nodes.every((n) => state.campaign.heldNodes.includes(n.id)))
    .filter((r) => !regionComplete(state, content, r))
    .reduce((sum, r) => sum + r.completionBonus, 0);
  return nodes + bonusLost;
}

// Elapsed campaign effects: held-node income and dissection deadlines.
// `since` is the one elapsed clock (`state.lastTickAt`), passed in so this
// runs BEFORE the ranch charges upkeep and the two land in one clamp — see
// campaign/world.js. Nothing here advances a clock any more.
export function tickCampaign(state, content, now, since = state.lastTickAt ?? now) {
  // Rehabilitation graduates on its own clock, checked every tick rather
  // than only when time has visibly passed — a programme can finish while
  // the tab is open (an enrichment session can take the last hour off it).
  // A job that finished while the player was away is reported when they
  // come back, not silently banked.
  // Several jobs can be in flight at once (A4), so several can finish while
  // the player is away. The report card shows one at a time; the rest are
  // summarised into the wire, because a reward they earned and cannot see is
  // a reward they will assume is broken.
  // R40. Anyone who arrives already holding the map — a v29 save that
  // finished the campaign before there was anything to say about it — has no
  // node left to take, so the capture path can never fire for them. A no-op
  // on every other tick.
  announceDominion(state, content, now);

  const job = tickOperations(state, content, now);
  for (const line of job.news) pushNews(state, line);
  if (job.results.length) {
    state.campaign.opReport = job.results[0];
    for (const res of job.results) {
      if (!res.success) continue;
      const boast = playerLine(state, content, 'capture', { creature: res.animal?.name ?? 'the prize' });
      if (res.animal && boast) pushNews(state, boast);
    }
    for (const extra of job.results.slice(1)) {
      pushNews(state, extra.success
        ? `${extra.name} also paid out: $${extra.funds}${extra.animal ? `, and ${extra.animal.name} came back in the van` : ''}.`
        : `${extra.name} came to nothing, which happens.`);
    }
  }

  const rehabbed = tickRehab(state, content, now);
  for (const line of rehabbed.news) pushNews(state, line);
  for (const chimera of rehabbed.graduates) {
    // Two beats, in the order that reads best: you say what you did, and
    // then the lab you took it from says what they think of that.
    const mine = playerLine(state, content, 'graduation', { creature: chimera.name });
    if (mine) pushNews(state, mine);
    const theirs = rivalLine(content, chimera.rehabilitated?.rivalId, 'defection', { creature: chimera.name });
    if (theirs) pushNews(state, theirs);
  }

  // Counter-offensives resolve before income is paid, so a node lost
  // during a long absence does not also pay for the days it was gone.
  // (Income over a long gap is still charged at the CURRENT holdings —
  // the model has always been that simple, and a contest opening
  // mid-absence starts its window now, not then.)
  const contests = tickContests(state, content, now, threatGen(state, content));
  for (const line of contests.news) pushNews(state, line);

  const dt = Math.max(0, now - since);
  if (dt === 0) return;

  // Income over the gap at CURRENT holdings — contested nodes pay nothing.
  // Two R64 corrections on top, both about a convoy the player never saw
  // arrive: a node whose convoy is still waiting paid until it ARRIVED, not
  // for none of the gap; and every convoy that came and went unseen took its
  // node's revenue for the window it sat there.
  state.funds += incomePerDay(state, content) * (dt / DAY);
  const rate = (id) => nodeById(content, id)?.incomePerDay ?? 0;
  for (const contest of state.campaign.contested ?? []) {
    if (contest.startedAt !== now || contest.scheduledAt == null) continue;
    const paidUntil = Math.min(Math.max(contest.scheduledAt, since), now);
    const days = (paidUntil - since) / DAY;
    state.funds += rate(contest.nodeId) * days;
    // R65: and the strip bonus it suspended. A contest inside a completed
    // region stops the region's completionBonus as well as the node's own
    // income (see incomeSuspended), and the line above only put the node
    // back — so a convoy arriving in the last two hours of a month away
    // retroactively withheld thirty days of the strip bonus. Measured at
    // $4,500 of Greenfield's $150/day on a thirty-day absence.
    const strip = regionOfNode(content, contest.nodeId);
    const wholeStripHeld = strip?.completionBonus
      && strip.nodes.every((n) => state.campaign.heldNodes.includes(n.id));
    // Only the contest that actually suspended it pays it back: with a
    // second convoy in the same strip the bonus was already down.
    const alsoDown = (state.campaign.contested ?? []).some((c) => c !== contest
      && regionOfNode(content, c.nodeId)?.id === strip?.id
      && (c.scheduledAt ?? c.startedAt) <= contest.scheduledAt);
    if (wholeStripHeld && !alsoDown) state.funds += strip.completionBonus * days;
  }
  for (const m of contests.missed) {
    const from = Math.max(m.arrivedAt, since);
    const to = Math.min(m.leftAt, now);
    if (to > from) state.funds -= rate(m.nodeId) * ((to - from) / DAY);
  }
  state.funds = Math.max(0, state.funds);

  for (const captive of [...state.campaign.captives]) {
    if (now < captive.deadline) continue;
    // The rescue window closed: the creature is lost, and the enemy
    // completed its "unauthorized peer review" — the AI director stub
    // records it so Gen 4+ can bias counters against these parts.
    state.campaign.captives = state.campaign.captives.filter((c) => c !== captive);
    state.directorStats.dissections ??= [];
    state.directorStats.dissections.push({
      chimera: captive.chimera.name,
      partIds: Object.values(captive.chimera.tokens).map((t) => t.partId),
      at: captive.deadline,
    });
    pushNews(
      state,
      rivalLine(content, captive.captor, 'dissectionDone', { creature: captive.chimera.name })
        ?? newsFor(state, content, 'dissection_done', { creature: captive.chimera.name })
    );
  }
}

// --- Battle aftermath, campaign-aware --------------------------------

// Wraps engine.finishBattle: conquest, notoriety, capture-on-loss,
// containment intake, rescue resolution, news. UI calls THIS.
export function resolveBattle(state, battle, content, now) {
  const context = battle.context ?? {};
  // Splice-Dex: every unit that took the field is now a known quantity.
  const seen = [
    ...(context.waveIds ?? content.encounters[battle.encounterId]?.waves ?? []),
    battle.enemy.active?.refId,
    ...(battle.captured ?? []),
  ];
  for (const unitId of seen) {
    // Generated rival chimeras aren't roster units — they have no Dex page.
    if (typeof unitId !== 'string') continue;
    if (unitId && !state.dex.enemies.includes(unitId)) state.dex.enemies.push(unitId);
  }
  const result = finishBattle(state, battle, content, now);

  // R51: and every unit that took the field in a battle you WON is now a
  // unit you have beaten. Same ids, gated on the outcome — the guide has
  // logged sightings since R21 and never once recorded who won.
  //
  // A spar does not count. R41 already ruled that a drill has no stakes
  // (the cannon does not fire on one), and the ring only ever fields a
  // garrison from a node you took — so the units in it are ones you beat
  // for real on the way in. Counting the drill would add nothing true.
  if (result.outcome === 'win' && context.kind !== 'sparring') {
    state.dex.beaten ??= [];
    for (const unitId of seen) {
      if (typeof unitId !== 'string') continue;
      if (!state.dex.beaten.includes(unitId)) state.dex.beaten.push(unitId);
    }
  }
  const detail = { ...result, capturedChimera: null, freed: null, salvageUnits: battle.captured ?? [] };

  // The AI director announces itself in the wire the first time a given
  // counter-rule reaches the field. The player should learn that the world
  // is adapting from the news, not from a spreadsheet.
  const directedLine = directorNews(state, context.directed);
  if (directedLine) pushNews(state, directedLine);

  // R41: a spar ends here. Nobody impounds a sparring partner — the cannon
  // does not fire on a drill (a 0.75-scale garrison with no stakes would be
  // a free capture farm) — and a loss costs an Infirmary timer (finishBattle
  // already opened one) and nothing else: capture is the stake of a real
  // front, and the ring exists precisely so a walled player can fight
  // without betting a creature on it.
  if (context.kind === 'sparring') {
    detail.salvageUnits = [];
    if (result.outcome === 'win') emitNews(state, content, 'spar_done');
    return detail;
  }

  // Containment cannon prizes ride home regardless of outcome. A captured
  // rival chimera has no enemies.json entry, so its generated record rides
  // along in the bay — salvage reads whichever exists.
  for (const unitId of detail.salvageUnits) {
    const generated = battle.units?.[unitId] ?? null;
    const unit = generated ?? content.enemies[unitId];
    if (!unit) continue;
    state.campaign.containment.push({
      id: `bay-${state.campaign.containment.length}-${now}`,
      unitId,
      unit: generated,
      rivalId: context.rivalId ?? null,
      capturedAt: now,
      rehab: null,
    });
    // Every philosophy authors a `capture` line, so there is no fallback to
    // reach: the one that used to sit behind this `??` was dead copy.
    pushNews(
      state,
      playerLine(state, content, 'capture', { creature: unit.name })
    );
  }

  if (context.kind === 'rescue') {
    const captive = state.campaign.captives.find((c) => c.id === context.captiveId);
    if (captive && result.outcome === 'win') {
      state.campaign.captives = state.campaign.captives.filter((c) => c !== captive);
      const chimera = captive.chimera;
      const rng = rngStream(state.seed, 'rescue', state.warRecord.wins);
      applyInjury(chimera, { name: 'Dramatic Rescue Whiplash', until: now + Math.round((1 + rng()) * HOUR) });
      chimera.bond = Math.min(100, chimera.bond + 10); // "you came back for me!"
      state.chimeras.push(chimera);
      detail.freed = chimera.name;
      emitNews(state, content, 'rescued', { creature: chimera.name });
    }
    return detail;
  }

  // Rival duels: the lab keeps score, and the loser iterates.
  if (context.kind === 'rival' && context.rivalId) {
    // They saw what you brought — and only what you brought (R27). A rival
    // is one person in one building, not the AI director; their file is
    // written by the duels they were actually present for, including the
    // ones they won, because losing to a stable is the best possible reason
    // to study it.
    const deployed = battle.player.team
      .map((c) => state.chimeras.find((ch) => ch.id === c.refId))
      .filter(Boolean);
    scoutStable(state, context.rivalId, deployed, content);
    const line = recordRivalResult(state, context.rivalId, result.outcome, content);
    if (result.outcome !== 'fled') pushNews(state, line);
    detail.rival = content.rivals[context.rivalId]?.name ?? null;
  }

  // R42: a Gauntlet stage. No node, no income, no notoriety — the win is
  // recorded, announced, and the card advances. The containment loop above
  // has already run, so a boss the cannon bagged is in a bay AND beaten.
  if (context.kind === 'gauntlet' && result.outcome === 'win') {
    const stage = recordGauntletWin(state, content, battle.encounterId);
    if (stage) {
      pushNews(state, stage.news);
      const boast = playerLine(state, content, 'gauntlet', { creature: content.enemies[stage.unitId]?.name ?? stage.name });
      if (boast) pushNews(state, boast);
      if (gauntletComplete(state, content)) {
        emitNews(state, content, 'gauntlet_cleared');
      }
    }
  }

  if (context.kind === 'assault' && result.outcome === 'win' && context.nodeId) {
    const node = nodeById(content, context.nodeId);
    if (node && !state.campaign.heldNodes.includes(node.id)) {
      const genBefore = threatGen(state, content);
      state.campaign.heldNodes.push(node.id);
      state.campaign.notoriety += node.notoriety;
      emitNews(state, content, 'node_seized', { node: node.name, income: node.incomePerDay });
      const claim = playerLine(state, content, 'conquest', { node: node.name });
      if (claim) pushNews(state, claim);
      // R40. The twenty-first node is not the first one.
      announceDominion(state, content, now);
      const genNow = threatGen(state, content);
      if (genNow > genBefore) {
        // R62: the rung's own line, from regions.json. This used to print a
        // hardcoded Generation 2 sentence whatever rung you had reached.
        const rung = (content.campaignMeta?.threatGens ?? []).find((r) => r.gen === genNow);
        if (rung?.announce) emitNews(state, content, 'threat_rung', { announce: rung.announce });
      }
    }
  }

  // A counter-offensive fought to a conclusion. Holding the line has to
  // expand what you can CREATE rather than just what you own (Law 2), so
  // the wreckage goes to Containment: enemy tech, salvage, new parts.
  if (context.kind === 'defend' && context.nodeId) {
    const node = nodeById(content, context.nodeId);
    const { news, held } = resolveContest(state, content, context.nodeId, result.outcome, now);
    if (news) pushNews(state, news);
    detail.defended = held;
    detail.node = node?.name ?? null;
    if (held) {
      // A garrison of people leaves nothing behind to impound — they
      // walk off, loudly, and that is fine. A vehicle does; and a
      // commander's second stage is the thing you actually beat, so
      // follow the transform to find it.
      const wreckable = [];
      for (const id of context.waveIds ?? []) {
        let unit = content.enemies[id];
        for (let hops = 0; unit && hops < 4; hops++) {
          if (unit.salvage?.length) { wreckable.push(unit.id); break; }
          unit = content.enemies[unit.transformInto];
        }
      }
      if (wreckable.length) {
        const rng = rngStream(state.seed, 'wreckage', state.campaign.contestCount ?? 0);
        const unitId = pick(rng, wreckable);
        state.campaign.containment.push({
          id: `bay-${state.campaign.containment.length}-${now}`,
          unitId,
          unit: null,
          capturedAt: now,
          rehab: null,
        });
        detail.wreckage = content.enemies[unitId].name;
        emitNews(state, content, 'salvaged',
          { node: node?.name ?? 'the line', unit: content.enemies[unitId].name });
      }
    }
  }

  // Capture-on-loss: one downed chimera is taken. Dissection countdown
  // starts — real-world 9–18h, always with a rescue window (house rule).
  //
  // A2: never your LAST one. The house rule has always been that a captured
  // creature gets a rescue window, and a rescue raid needs a team — so
  // taking the only chimera on the roster leaves a nine-hour countdown the
  // player has no way to enter. Vault empty too, because those parts went
  // into the creature that just got taken. That is not a setback, it is the
  // run ending quietly while a timer runs down.
  //
  // So the last one comes home instead: hurt, out for a while, and still
  // yours. Everything downstream of a capture — the dissection clock, the
  // rival taunt, the director's notes — only ever fires on a roster that
  // can still answer it.
  if (result.outcome === 'loss' && state.chimeras.length > 1) {
    const downedIds = battle.player.team.filter((c) => c.hp <= 0).map((c) => c.refId);
    const candidates = state.chimeras.filter((c) => downedIds.includes(c.id));
    if (candidates.length) {
      const rng = rngStream(state.seed, 'capture', state.warRecord.losses);
      const taken = pick(rng, candidates);
      state.chimeras = state.chimeras.filter((c) => c !== taken);
      const hours = randInt(rng, 9, 18);
      const captive = {
        id: `cap-${taken.id}-${now}`,
        chimera: taken,
        capturedAt: now,
        deadline: now + hours * HOUR,
        // Losing to a rival is personal. Remember which one, so the taunt
        // in the wire has an author and the countdown has a villain.
        captor: context.rivalId ?? null,
      };
      state.campaign.captives.push(captive);
      detail.capturedChimera = taken.name;
      emitNews(state, content, 'chimera_captured', { creature: taken.name, hours });
      const taunt = rivalLine(content, captive.captor, 'dissectionTaunt', { creature: taken.name });
      if (taunt) pushNews(state, taunt);
    }
  } else if (result.outcome === 'loss' && state.chimeras.length === 1) {
    // The last one on the roster. It drags itself home rather than being
    // taken, and the Infirmary timer is the whole of the punishment.
    const only = state.chimeras[0];
    const downed = battle.player.team.some((c) => c.refId === only.id && c.hp <= 0);
    if (downed) {
      // finishBattle has already opened an Infirmary timer on anything that
      // went down, which is the right mechanic and the whole of the
      // punishment here — this branch only has to make sure the creature
      // was not ALSO taken, and to say why.
      applyInjury(only, {
        name: 'Dragged Itself Home',
        until: now + Math.round(3 * infirmaryGrants(state, content).healScale * HOUR),
      });
      detail.lastStand = only.name;
      emitNews(state, content, 'last_stand', { creature: only.name });
    }
  }

  return detail;
}

// --- Containment salvage ----------------------------------------------

// Dismantle a captured unit into enemy-tech part tokens (one grade spread,
// seeded). Enemy tech is otherwise unobtainable (ROADMAP §3.6).
// `ref` is a bay index or a bay id — the War Room passes ids now that a
// bay can sit in the Reorientation Wing while the list around it changes.
export function salvageUnit(state, ref, content, now) {
  const entry = findBay(state, ref);
  if (!entry) return { ok: false, msg: 'Nothing in that bay.' };
  const unit = entry.unit ?? content.enemies[entry.unitId];
  if (!unit) return { ok: false, msg: 'That bay is empty and slightly damp.' };
  // Rehab and salvage are the two futures §3.6 offers, and picking one is
  // the point — you cannot quietly do both.
  if (entry.rehab) {
    return { ok: false, msg: `${unit.name} is in the Reorientation Wing. End the programme first if you would rather have the parts.` };
  }
  state.campaign.containment = state.campaign.containment.filter((b) => b !== entry);
  const rng = rngStream(state.seed, 'salvage', state.inventory.tokenCount);
  const tokens = [];
  for (const [i, partId] of (unit.salvage ?? []).entries()) {
    const part = content.parts[partId];
    if (!part) continue; // retired part id — the rest of the bay still salvages
    // A rival's chimera hands over the grades they actually raised; a
    // vehicle's scrap rolls for it.
    const grade = unit.salvageGrades?.[i] ?? pick(rng, ['standard', 'standard', 'prime']);
    const token = {
      id: `t${state.inventory.tokenCount++}`,
      partId,
      grade,
      donor: { name: unit.name, species: part.species, stars: 3, extractedAt: now },
    };
    state.inventory.parts.push(token);
    tokens.push(token);
    if (!state.dex.parts.includes(partId)) state.dex.parts.push(partId);
  }
  emitNews(state, content, 'dismantled', { unit: unit.name });
  return {
    ok: true,
    tokens,
    msg: `Salvaged: ${tokens.map((t) => `${content.parts[t.partId].name} (${GRADES.find((g) => g.id === t.grade).name})`).join(', ')}.`,
  };
}
