// Campaign shell (M5). Pure functions over state: region nodes, notoriety
// and Threat Generations, income ticks, capture-on-loss → dissection
// countdown → rescue raids, Containment salvage, and the news feed. All
// timers are timestamps; tickCampaign computes elapsed effects on load.

import { rngStream, pick, randInt } from '../util/rng.js';
import { GRADES } from '../splice/extract.js';
import { finishBattle } from '../battle/engine.js';

const DAY = 86400000;
const HOUR = 3600000;

export function pushNews(state, line) {
  state.news.push(line);
  if (state.news.length > 12) state.news.splice(0, state.news.length - 12);
}

export function regionOf(content) {
  return Object.values(content.regions)[0]; // v0.1: one region strip
}

export function threatGen(state, content) {
  return state.campaign.notoriety >= content.campaignMeta.threatGen2At ? 2 : 1;
}

// Node states: 'held' | 'available' | 'locked'. Nodes unlock in strip
// order; threatGen-gated nodes also need the notoriety to exist.
export function nodeStates(state, content) {
  const region = regionOf(content);
  const gen = threatGen(state, content);
  const out = [];
  let previousTaken = true; // the first node is always reachable
  for (const node of region.nodes) {
    let status;
    if (state.campaign.heldNodes.includes(node.id)) status = 'held';
    else if ((node.threatGen ?? 1) > gen) status = 'locked';
    else status = previousTaken ? 'available' : 'locked';
    out.push({ node, status });
    previousTaken = state.campaign.heldNodes.includes(node.id);
  }
  return out;
}

export function incomePerDay(state, content) {
  const region = regionOf(content);
  return region.nodes
    .filter((n) => state.campaign.heldNodes.includes(n.id))
    .reduce((sum, n) => sum + n.incomePerDay, 0);
}

// Elapsed campaign effects: held-node income and dissection deadlines.
export function tickCampaign(state, content, now) {
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
    pushNews(state, `${captive.chimera.name} has been transferred to an out-of-state research internship (involuntary). The enemy took notes.`);
  }
}

// --- Battle aftermath, campaign-aware --------------------------------

// Wraps engine.finishBattle: conquest, notoriety, capture-on-loss,
// containment intake, rescue resolution, news. UI calls THIS.
export function resolveBattle(state, battle, content, now) {
  const context = battle.context ?? {};
  // Splice-Dex: every unit that took the field is now a known quantity.
  const seen = [
    ...(content.encounters[battle.encounterId]?.waves ?? []),
    battle.enemy.active?.refId,
    ...(battle.captured ?? []),
  ];
  for (const unitId of seen) {
    if (unitId && !state.dex.enemies.includes(unitId)) state.dex.enemies.push(unitId);
  }
  const result = finishBattle(state, battle, content, now);
  const detail = { ...result, capturedChimera: null, freed: null, salvageUnits: battle.captured ?? [] };

  // Containment cannon prizes ride home regardless of outcome.
  for (const unitId of detail.salvageUnits) {
    state.campaign.containment.push({ unitId, capturedAt: now });
    pushNews(state, `${content.enemies[unitId].name} impounded in Containment. Finders keepers is the law here now.`);
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

  if (context.kind === 'assault' && result.outcome === 'win' && context.nodeId) {
    const node = regionOf(content).nodes.find((n) => n.id === context.nodeId);
    if (node && !state.campaign.heldNodes.includes(node.id)) {
      const genBefore = threatGen(state, content);
      state.campaign.heldNodes.push(node.id);
      state.campaign.notoriety += node.notoriety;
      pushNews(state, `${node.name} seized. Income +$${node.incomePerDay}/day. Locals adjusting surprisingly well.`);
      if (threatGen(state, content) > genBefore) {
        pushNews(state, `THREAT LEVEL UP: the military is now returning your calls. Threat Generation 2.`);
      }
    }
  }

  // Capture-on-loss: one downed chimera is taken. Dissection countdown
  // starts — real-world 12–24h, always with a rescue window (house rule).
  if (result.outcome === 'loss' && state.chimeras.length) {
    const downedIds = battle.player.team.filter((c) => c.hp <= 0).map((c) => c.refId);
    const candidates = state.chimeras.filter((c) => downedIds.includes(c.id));
    if (candidates.length) {
      const rng = rngStream(state.seed, 'capture', state.warRecord.losses);
      const taken = pick(rng, candidates);
      state.chimeras = state.chimeras.filter((c) => c !== taken);
      const hours = randInt(rng, 12, 24);
      const captive = {
        id: `cap-${taken.id}-${now}`,
        chimera: taken,
        capturedAt: now,
        deadline: now + hours * HOUR,
      };
      state.campaign.captives.push(captive);
      detail.capturedChimera = taken.name;
      pushNews(state, `${taken.name} CAPTURED! "Unauthorized peer review" scheduled in ${hours}h. Mount a rescue.`);
    }
  }

  return detail;
}

// --- Containment salvage ----------------------------------------------

// Dismantle a captured unit into enemy-tech part tokens (one grade spread,
// seeded). Enemy tech is otherwise unobtainable (ROADMAP §3.6).
export function salvageUnit(state, containmentIndex, content, now) {
  const entry = state.campaign.containment[containmentIndex];
  if (!entry) return { ok: false, msg: 'Nothing in that bay.' };
  const unit = content.enemies[entry.unitId];
  state.campaign.containment.splice(containmentIndex, 1);
  const rng = rngStream(state.seed, 'salvage', state.inventory.tokenCount);
  const tokens = [];
  for (const partId of unit.salvage ?? []) {
    const grade = pick(rng, ['standard', 'standard', 'prime']);
    const token = {
      id: `t${state.inventory.tokenCount++}`,
      partId,
      grade,
      donor: { name: unit.name, species: 'salvage', stars: 3, extractedAt: now },
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
