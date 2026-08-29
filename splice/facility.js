// Facility upgrades (ROADMAP §3.10). Pure and DOM-free.
//
// An upgrade must expand what you can CREATE, never what you can grind
// (Law 2). So a track's levels carry `grants` — frames, sockets — and the
// systems that care read them. The Surgery Theater asks this module what it
// is allowed to build with; it does not know what a "tier" is.

import { SOCKETS } from '../render/renderer.js';

export function tracks(content) {
  return Object.values(content.facility ?? {});
}

export function facilityLevel(state, trackId) {
  return state.facility?.[trackId] ?? 1;
}

export function levelData(content, trackId, level) {
  const track = content.facility?.[trackId];
  if (!track) return null;
  return track.levels.find((l) => l.level === level) ?? null;
}

// What the current level of a track grants. Falls back to level 1 so a save
// that predates a track still gets the baseline rather than nothing.
export function grantsOf(state, content, trackId) {
  return (
    levelData(content, trackId, facilityLevel(state, trackId))?.grants ??
    levelData(content, trackId, 1)?.grants ??
    {}
  );
}

// What the Surgery Theater may build with right now.
export function theaterGrants(state, content) {
  const g = grantsOf(state, content, 'theater');
  return {
    // No facility data at all (a Node tool with a partial content bundle)
    // means "everything" rather than "nothing" — never lock a player out
    // because a file failed to load.
    frames: g.frames ?? Object.keys(content.frames ?? {}),
    sockets: g.sockets ?? SOCKETS,
  };
}

// The next purchasable level of a track, with why it is or is not available.
export function nextUpgrade(state, content, trackId) {
  const track = content.facility?.[trackId];
  if (!track) return null;
  const next = track.levels.find((l) => l.level === facilityLevel(state, trackId) + 1);
  if (!next) return null;

  const blockers = [];
  const missingNodes = (next.requiresNodes ?? []).filter(
    (n) => !state.campaign.heldNodes.includes(n)
  );
  for (const nodeId of missingNodes) blockers.push({ kind: 'node', nodeId });
  if (state.funds < next.cost) blockers.push({ kind: 'funds', short: Math.ceil(next.cost - state.funds) });

  return { track, level: next, blockers, affordable: !blockers.length };
}

export function buyUpgrade(state, content, trackId) {
  const next = nextUpgrade(state, content, trackId);
  if (!next) return { ok: false, msg: 'That is as good as it gets. For now.' };
  const nodeBlock = next.blockers.find((b) => b.kind === 'node');
  if (nodeBlock) {
    return { ok: false, msg: `The contractor will not deliver into a contested county. Take the objective first.` };
  }
  const fundsBlock = next.blockers.find((b) => b.kind === 'funds');
  if (fundsBlock) {
    return { ok: false, msg: `Short by $${fundsBlock.short}. Science is not free. Science is, in fact, quite expensive.` };
  }

  state.funds -= next.level.cost;
  state.facility ??= {};
  state.facility[trackId] = next.level.level;
  return {
    ok: true,
    level: next.level,
    msg: next.level.unlockLine ?? `${next.track.name} upgraded to level ${next.level.level}.`,
    news: next.level.news ?? null,
  };
}
