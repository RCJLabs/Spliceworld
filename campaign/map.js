import { rngStream, hashString, pick } from '../util/rng.js';

// The world map, as data lookups and gates. R26 turned one county into
// five, and every system that reached for `Object.values(content.regions)[0]`
// was a system that silently stopped working at the county line —
// contestation picked defence targets from region one, named nodes from
// region one, and built the defending encounter from region one's node list.
//
// This module exists so there is exactly one place that knows how to find a
// node and decide whether you can walk to it. It holds no state and touches
// no DOM, so contest.js, director.js and campaign.js can all use it without
// importing each other.

export function regionList(content) {
  return Object.values(content.regions ?? {});
}

// Every node in authored order, each paired with the region it belongs to.
export function allNodes(content) {
  return regionList(content).flatMap((region) => region.nodes.map((node) => ({ node, region })));
}

export function nodeById(content, nodeId) {
  return allNodes(content).find((e) => e.node.id === nodeId)?.node ?? null;
}

export function regionOfNode(content, nodeId) {
  return allNodes(content).find((e) => e.node.id === nodeId)?.region ?? null;
}

export function nodeName(content, nodeId) {
  return nodeById(content, nodeId)?.name ?? nodeId;
}

// --- Threat Generations -------------------------------------------------

// A data ladder now, not a single threshold. The old shape
// (`threatGen2At: 60`) is still honoured so a save written before R26 reads
// the same world it left.
export function threatLadder(content) {
  const meta = content.campaignMeta ?? {};
  if (meta.threatGens?.length) return [...meta.threatGens].sort((a, b) => a.at - b.at);
  const at = meta.threatGen2At ?? Infinity;
  return [{ gen: 1, at: 0 }, { gen: 2, at }];
}

// R94 — THE RATCHET, and it is one expression with two readers (this file's
// ladder and taskforce.js's trigger), so it lives here rather than being
// spelled twice — R157's break 152.
//
// The high-water mark, and the live meter is PART OF IT: `notorietyPeak` is
// only written by `capNotoriety`, so between a conquest adding heat and the
// next tick the true high-water mark is the number on the meter. Taking the
// max is not a fallback for a missing field, it is the definition.
//
// Why a ratchet at all: the ladder used to read the live meter, so holding a
// Task Force raid — a WIN — dropped notoriety by the relief and could drop
// the whole world a Threat Generation. 82 drops over seven campaigns, 80.1%
// of days spent below the generation already reached, and one seed finishing
// as a "Local Nuisance" having held 40 raids. The military does not stop
// returning your calls because you had a quiet fortnight. See ROADMAP R94.
export function notorietyMark(state) {
  const cam = state.campaign ?? {};
  return Math.max(cam.notorietyPeak ?? 0, cam.notoriety ?? 0);
}

export function threatGen(state, content) {
  const notoriety = notorietyMark(state);
  let gen = 1;
  for (const rung of threatLadder(content)) if (notoriety >= rung.at) gen = Math.max(gen, rung.gen);
  return gen;
}

// The rung you are standing on, for the banner text.
export function threatRung(state, content) {
  const gen = threatGen(state, content);
  return threatLadder(content).find((r) => r.gen === gen) ?? { gen, at: 0 };
}

// The next rung and how far off it is — a ladder whose next step you cannot
// see is just a number that occasionally changes.
export function nextThreatRung(state, content) {
  const gen = threatGen(state, content);
  return threatLadder(content).find((r) => r.gen > gen) ?? null;
}

// --- Gating -------------------------------------------------------------

// Why a region is not open yet, as a list of readable blockers. A region
// with no `requires` block is open from the first evening.
export function regionBlockers(state, content, region) {
  const req = region.requires ?? {};
  const held = state.campaign?.heldNodes ?? [];
  const blockers = [];
  for (const nodeId of req.nodes ?? []) {
    if (held.includes(nodeId)) continue;
    blockers.push({ kind: 'node', nodeId, label: `take ${nodeName(content, nodeId)}` });
  }
  if (req.threatGen && threatGen(state, content) < req.threatGen) {
    blockers.push({ kind: 'threatGen', gen: req.threatGen, label: `needs Threat Gen ${req.threatGen}` });
  }
  // R94 — the mark, not the meter: a door you were notorious enough to open
  // does not close again because you held a raid. Same rule as the ladder
  // two lines up, and for the same reason.
  if (req.notoriety && notorietyMark(state) < req.notoriety) {
    blockers.push({
      kind: 'notoriety',
      need: req.notoriety,
      label: `needs ${req.notoriety} notoriety`,
    });
  }
  return blockers;
}

export function regionOpen(state, content, region) {
  return regionBlockers(state, content, region).length === 0;
}

// Node states: 'held' | 'contested' | 'available' | 'locked'. Nodes unlock
// in strip order within their own region; threatGen-gated nodes also need
// the notoriety to exist; and every node of a region whose entry conditions
// are unmet is locked regardless. `contestedIds` is passed in rather than
// imported so this module stays free of contest.js.
export function nodeStates(state, content, region, contestedIds = []) {
  const gen = threatGen(state, content);
  const open = regionOpen(state, content, region);
  const held = state.campaign?.heldNodes ?? [];
  const out = [];
  let previousTaken = true; // the first node of an open region is reachable
  for (const node of region.nodes) {
    let status;
    if (held.includes(node.id)) {
      // Still held — facility gates and rival unlocks must not blink out
      // while a convoy is on the road — but it reads differently, and it
      // stops paying.
      status = contestedIds.includes(node.id) ? 'contested' : 'held';
    } else if (!open) status = 'locked';
    else if ((node.threatGen ?? 1) > gen) status = 'locked';
    else status = previousTaken ? 'available' : 'locked';
    out.push({ node, status });
    previousTaken = held.includes(node.id);
  }
  return out;
}

// Every region with its entry state and its nodes' states — what the map
// draws, and the one call a caller needs to see the whole world.
export function regionStates(state, content, contestedIds = []) {
  const held = state.campaign?.heldNodes ?? [];
  return regionList(content).map((region) => {
    const blockers = regionBlockers(state, content, region);
    return {
      region,
      open: blockers.length === 0,
      blockers,
      nodes: nodeStates(state, content, region, contestedIds),
      held: region.nodes.filter((n) => held.includes(n.id)).length,
    };
  });
}

// The encounters the campaign can currently put in front of the player:
// every node of an open region, plus every encounter that hangs off no node
// at all (rescue templates, the operations bench, rival duels).
//
// The AI director needs this. Its reach is "the hardest encounters, up to a
// budget", which was a fine definition of *where the world adapts* while
// there was one county; across five it would spend the whole budget
// rewriting the Compliance Spire while the player is still arguing with a
// parking warden in Greenfield. The world adapts where you actually are.
export function reachableEncounterIds(state, content) {
  const onNodes = new Set(allNodes(content).map((e) => e.node.encounter));
  const open = new Set();
  for (const region of regionList(content)) {
    if (!regionOpen(state, content, region)) continue;
    for (const node of region.nodes) open.add(node.encounter);
  }
  return Object.values(content.encounters ?? {})
    .filter((e) => open.has(e.id) || !onNodes.has(e.id))
    .map((e) => e.id);
}

// One rescue raid used to mean one encounter, forever — `air_patrol` and
// `harbor_watch` sat fully authored (their own waves, blurb, reward) and
// never once fielded, because `rescueEncounter` was a single id. Now a
// pool, picked deterministically per captive so a reload during the same
// rescue window faces the same opposition rather than reshuffling it.
export function rescueEncounterFor(state, content, captiveId) {
  const pool = content.campaignMeta?.rescueEncounters ?? [];
  if (!pool.length) return null;
  const rng = rngStream(state.seed, 'rescue-pick', hashString(String(captiveId)));
  return pick(rng, pool);
}
