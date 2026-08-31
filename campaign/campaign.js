// Campaign shell (M5). Pure functions over state: region nodes, notoriety
// and Threat Generations, income ticks, capture-on-loss → dissection
// countdown → rescue raids, Containment salvage, and the news feed. All
// timers are timestamps; tickCampaign computes elapsed effects on load.

import { rngStream, pick, randInt } from '../util/rng.js';
import { GRADES } from '../splice/extract.js';
import { finishBattle } from '../battle/engine.js';
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

export function pushNews(state, line) {
  state.news.push(line);
  if (state.news.length > 12) state.news.splice(0, state.news.length - 12);
}

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
export function tickCampaign(state, content, now) {
  // Rehabilitation graduates on its own clock, checked every tick rather
  // than only when time has visibly passed — a programme can finish while
  // the tab is open (an enrichment session can take the last hour off it).
  // A job that finished while the player was away is reported when they
  // come back, not silently banked.
  // Several jobs can be in flight at once (A4), so several can finish while
  // the player is away. The report card shows one at a time; the rest are
  // summarised into the wire, because a reward they earned and cannot see is
  // a reward they will assume is broken.
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
  for (const line of tickContests(state, content, now, threatGen(state, content))) pushNews(state, line);

  const last = state.campaign.lastTickAt ?? now;
  const dt = Math.max(0, now - last);
  state.campaign.lastTickAt = now;
  if (dt === 0) return;

  state.funds += incomePerDay(state, content) * (dt / DAY);

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
      rivalLine(content, captive.captor, 'dissectionDone', { creature: captive.chimera.name }) ??
        `${captive.chimera.name} has been transferred to an out-of-state research internship (involuntary). The enemy took notes.`
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
  const detail = { ...result, capturedChimera: null, freed: null, salvageUnits: battle.captured ?? [] };

  // The AI director announces itself in the wire the first time a given
  // counter-rule reaches the field. The player should learn that the world
  // is adapting from the news, not from a spreadsheet.
  const directedLine = directorNews(state, context.directed);
  if (directedLine) pushNews(state, directedLine);

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
    pushNews(
      state,
      playerLine(state, content, 'capture', { creature: unit.name }) ??
        `${unit.name} impounded in Containment. Finders keepers is the law here now.`
    );
  }

  if (context.kind === 'rescue') {
    const captive = state.campaign.captives.find((c) => c.id === context.captiveId);
    if (captive && result.outcome === 'win') {
      state.campaign.captives = state.campaign.captives.filter((c) => c !== captive);
      const chimera = captive.chimera;
      const rng = rngStream(state.seed, 'rescue', state.warRecord.wins);
      chimera.injury = { name: 'Dramatic Rescue Whiplash', until: now + Math.round((1 + rng()) * HOUR) };
      chimera.bond = Math.min(100, chimera.bond + 10); // "you came back for me!"
      state.chimeras.push(chimera);
      detail.freed = chimera.name;
      pushNews(state, `${chimera.name} rescued from the impound lot! Bond deepened. Paperwork ignored.`);
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

  if (context.kind === 'assault' && result.outcome === 'win' && context.nodeId) {
    const node = nodeById(content, context.nodeId);
    if (node && !state.campaign.heldNodes.includes(node.id)) {
      const genBefore = threatGen(state, content);
      state.campaign.heldNodes.push(node.id);
      state.campaign.notoriety += node.notoriety;
      pushNews(state, `${node.name} seized. Income +$${node.incomePerDay}/day. Locals adjusting surprisingly well.`);
      const claim = playerLine(state, content, 'conquest', { node: node.name });
      if (claim) pushNews(state, claim);
      if (threatGen(state, content) > genBefore) {
        pushNews(state, `THREAT LEVEL UP: the military is now returning your calls. Threat Generation 2.`);
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
        pushNews(state, `Salvage crews work through the night at ${node?.name ?? 'the line'}. One ${content.enemies[unitId].name} is now, legally speaking, scrap you own.`);
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
      pushNews(state, `${taken.name} CAPTURED! "Unauthorized peer review" scheduled in ${hours}h. Mount a rescue.`);
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
      only.injury ??= {
        name: 'Dragged Itself Home',
        until: now + Math.round(3 * infirmaryGrants(state, content).healScale * HOUR),
      };
      detail.lastStand = only.name;
      pushNews(
        state,
        `${only.name} is the last one on the roster, and the coalition could not quite hold on to it. ` +
          `It limped back through the fence at dawn, furious and filthy. Infirmary.`
      );
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
  pushNews(state, `${unit.name} dismantled with great enthusiasm. Enemy tech acquired.`);
  return {
    ok: true,
    tokens,
    msg: `Salvaged: ${tokens.map((t) => `${content.parts[t.partId].name} (${GRADES.find((g) => g.id === t.grade).name})`).join(', ')}.`,
  };
}
