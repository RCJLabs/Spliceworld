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
import { fitToFight } from '../battle/statblock.js';

const MINUTE = 60000;

// The nodes a player can spar against: held, with a real encounter behind
// them. Contested nodes still count — the garrison drilling you is the same
// garrison defending you.
export function sparPartners(state, content) {
  return regionList(content)
    .flatMap((r) => r.nodes)
    .filter((n) => state.campaign.heldNodes.includes(n.id));
}

// R43 — the ring holds CHARGES, not a single cooldown.
//
// One spar per 45 minutes was too slow to be the ladder the ring was built
// to be: a player who sat down for an evening got one drill and went back
// to losing the same assault. Three charges, one back every ten minutes —
// a sustained three per half hour, and someone returning after a break
// finds all three waiting and can spend them back to back.
//
// Derived from ONE timestamp, because timers here are timestamps and
// nothing runs in the background (house rule). `sparRefillAt` is the moment
// the bucket would next stand completely full; everything else is read off
// it, so a reload, a closed tab and a week away all compute the same
// answer. A refill time in the past simply means full.
export function sparCharges(state, now, content) {
  const t = trainingTuning(content);
  const max = Math.max(1, t.sparCharges);
  const regen = Math.max(1, t.sparRegenMinutes) * MINUTE;
  const refillAt = state.sparRefillAt ?? 0;
  const outstanding = Math.max(0, Math.ceil((refillAt - now) / regen));
  const charges = Math.max(0, max - Math.min(max, outstanding));
  return {
    charges,
    max,
    ready: charges > 0,
    full: charges >= max,
    // Time to the next charge, and to a full bucket. Both are for the
    // button: a player staring at an empty ring wants the short number.
    msToNext: charges >= max ? 0 : Math.max(0, refillAt - now - (outstanding - 1) * regen),
    msToFull: Math.max(0, refillAt - now),
  };
}

// Kept as the old name for every caller that only asks "can I?".
export function sparReady(state, now, content) {
  const c = sparCharges(state, now, content);
  return { ready: c.ready, readyAt: now + c.msToNext, msRemaining: c.msToNext, charges: c.charges, max: c.max };
}

// A derived encounter, seeded off the save so a reload offers the same
// spar. `scaleOverride` is the same dial contestation escalates with,
// pointed the other way.
// R48 — "can I spar right now" as ONE answer, because three screens were
// about to grow three opinions of it. The bucket is only half the question:
// a full ring is no use with no garrison to spar and nobody fit to send,
// and browser QA caught the Pens cheerfully reporting "3/3 — spend them"
// while the only chimera was in the Infirmary and the agenda, correctly,
// said nothing. A readout that tells you to do something you cannot do is
// worse than no readout.
export function canSpar(state, content, now) {
  const charges = sparCharges(state, now, content);
  const partners = sparPartners(state, content);
  const fit = fitToFight(state, now);
  const reason = !partners.length
    ? 'no-garrison'
    : !fit.length
      ? 'nobody-fit'
      : !charges.ready
        ? 'no-charge'
        : null;
  return { ...charges, partners: partners.length, fit: fit.length, ok: reason === null, reason };
}

export function sparEncounter(state, content, nodeId, now) {
  const node = sparPartners(state, content).find((n) => n.id === nodeId);
  if (!node) return { ok: false, msg: 'You can only spar a garrison you own.' };
  const gate = sparReady(state, now, content);
  if (!gate.ready) return { ok: false, msg: 'The ring is being re-chalked. Another sparring partner warms up shortly.' };
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
// Spend one. From a full bucket the clock starts now; from a partly-spent
// one it pushes the existing refill later, which is what keeps the regen
// steady rather than restarting it on every spar.
export function startSpar(state, now, content) {
  const t = trainingTuning(content);
  const regen = Math.max(1, t.sparRegenMinutes) * MINUTE;
  state.sparCount = (state.sparCount ?? 0) + 1;
  const refillAt = state.sparRefillAt ?? 0;
  state.sparRefillAt = Math.max(refillAt, now) + regen;
}
