// R41 — the Sparring Ring. DOM-free.
//
// The player report that queued this phase: nine chimeras, and no
// combination of them could beat the missions in front of them. The
// campaign's ladder had no bottom rung — every fight on the map was at the
// map's own difficulty, so a walled player's only options were to lose the
// same assault again or to go back to the ranch and replace the creatures
// they came with. Veterancy (battle/veterancy.js) gives fighting a payoff
// that sticks to the creature; this gives a walled player somewhere safe to
// go and earn it.
//
// A spar is a REMATCH: the opposition is drawn from a node you already
// hold, scaled down by sparScale, for sparringFraction of the xp. Zero
// purse, zero notoriety, and a loss cannot cost you a creature — nobody
// impounds a sparring partner — but injuries are real, because a training
// accident is still an accident, and a risk-free grind loop is how endless
// mode goes stale (§8, risk 5). One real assault is always worth more than
// one spar; the ring exists so that losing the assault is never the only
// thing left to do.

import { rngStream, pick } from '../util/rng.js';
import { regionList } from './map.js';
import { trainingTuning } from '../battle/veterancy.js';

const HOUR = 3600000;

// The nodes a player can spar against: held, with a real encounter behind
// them. Contested nodes still count — the garrison drilling you is the same
// garrison defending you.
export function sparPartners(state, content) {
  return regionList(content)
    .flatMap((r) => r.nodes)
    .filter((n) => state.campaign.heldNodes.includes(n.id));
}

export function sparReady(state, now, content) {
  const t = trainingTuning(content);
  const readyAt = (state.lastSparAt ?? 0) + t.sparCooldownHours * HOUR;
  return { ready: now >= readyAt, readyAt, msRemaining: Math.max(0, readyAt - now) };
}

// A derived encounter, seeded off the save so a reload offers the same
// spar. `scaleOverride` is the same dial contestation escalates with,
// pointed the other way.
export function sparEncounter(state, content, nodeId, now) {
  const node = sparPartners(state, content).find((n) => n.id === nodeId);
  if (!node) return { ok: false, msg: 'You can only spar a garrison you own.' };
  const gate = sparReady(state, now, content);
  if (!gate.ready) return { ok: false, msg: 'The ring is being re-chalked. Give it a minute.' };
  const t = trainingTuning(content);
  const base = content.encounters[node.encounter];
  if (!base) return { ok: false, msg: 'That garrison has nothing to spar with.' };
  const rng = rngStream(state.seed, 'spar', state.sparCount ?? 0);
  const baseScale = base.tier != null ? (content.tierScale?.[base.tier] ?? 1) : 1;
  return {
    ok: true,
    encounter: {
      ...base,
      id: `spar_${node.id}_${state.sparCount ?? 0}`,
      name: `Sparring — ${node.name}`,
      blurb: pick(rng, content.sparBlurbs ?? ['Full contact, no paperwork.']),
      reward: 0,
      // Below the strength you actually beat there, because the ring is a
      // classroom and not a second front. tier comes off so scaleOverride
      // is the only dial the engine reads.
      tier: null,
      scaleOverride: Math.max(0.4, baseScale * t.sparScale),
    },
  };
}

// Call when the fight is actually launched, not when it is offered.
export function startSpar(state, now) {
  state.sparCount = (state.sparCount ?? 0) + 1;
  state.lastSparAt = now;
}
