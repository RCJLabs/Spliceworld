// R82 — THE BREAKOUT. DOM-free.
//
// R27 gave the world rival labs that field chimeras built from real parts
// under the player's own physiology, and R8 gave it a Reorientation Wing
// that turns a captured specimen into a member of the roster. Between them
// sat a gap: the ONLY way to meet a rival's chimera was to challenge that
// rival, which is a gated ladder duel you fight three-at-a-time and win
// once. The most interesting anatomy in the game was also the rarest thing
// to stand in front of.
//
// So: a lab that keeps losing to you starts losing other things. An
// escapee is a real rival chimera — `rivalSpecimen` builds it, the same
// generator the ladder uses, from that lab's parts at that lab's grades —
// turned loose in the county on its own.
//
// TWO DELIBERATE DIFFERENCES FROM A COUNTER-OFFENSIVE (contest.js):
//
//   1. NO DEADLINE. A contest is a threat and a threat needs a clock. An
//      escapee is an OPPORTUNITY, and a window that closes while the player
//      is asleep produces fewer fights with rival anatomy, which is the one
//      thing this system exists to produce. So the board is standing: they
//      accumulate, in any order, until you go and get them. `maxLoose` caps
//      it so a fortnight away is a queue, not a wall.
//   2. IT IS NOT ABOUT LAND. No node, no income, no suspension. Winning
//      closes the entry; the Containment Cannon decides whether it goes
//      home in one of your bays or home in its old lab's van.
//
// The capture path is not new either, and that is the point: a bagged
// escapee lands in containment like any other prize and reaches the roster
// through the Wing, at the grades its old lab raised. This module adds a
// SOURCE of specimens, not a second way to own one.

import { rngStream } from '../util/rng.js';
import { rivalList, rivalRecord, rivalSpecimen } from './rivals.js';
import { rivalOf } from '../data/catalog.js';

const HOUR = 3600000;

export function breakoutTuning(content) {
  return content.breakoutMeta ?? {};
}

export function looseSpecimens(state) {
  return state.campaign?.loose ?? [];
}

export function looseById(state, id) {
  return looseSpecimens(state).find((s) => s.id === id) ?? null;
}

// Nothing gets out until a lab has actually been rattled. Reading the
// player's own record rather than a clock keeps the gate honest: the first
// escapee is a consequence of something you did, not of time passing.
export function breakoutEligible(state, content) {
  const t = breakoutTuning(content);
  const beaten = Object.values(state.campaign?.rivals ?? {})
    .reduce((n, r) => n + (r.defeats ?? 0), 0);
  return beaten >= (t.startsAfterDefeats ?? 1);
}

// Which lab loses this one. Weighted by how badly they are losing to you:
// a lab you have beaten four times is a lab whose paperwork has stopped
// being careful. Seeded on the escape's own index, so a reload cannot
// reroll which lab it came from.
function labFor(state, content, n) {
  const rng = rngStream(state.seed, 'breakout:lab', n);
  const pool = rivalList(content).flatMap((rival) => {
    const defeats = rivalRecord(state, rival.id).defeats ?? 0;
    return Array.from({ length: defeats }, () => rival);
  });
  if (!pool.length) return null;
  return pool[Math.floor(rng() * pool.length)];
}

function scheduleNext(state, content, from) {
  const t = breakoutTuning(content);
  const cam = state.campaign;
  const rng = rngStream(state.seed, 'breakout:schedule', cam.breakoutCount ?? 0);
  const jitter = 1 + (rng() * 2 - 1) * (t.jitter ?? 0);
  cam.nextBreakAt = from + Math.round((t.cooldownHours ?? 22) * jitter * HOUR);
}

// The specimen itself. Built by the rival generator, so a loose one is
// indistinguishable from one still on the ladder — it was on the ladder.
// `idSuffix` keeps a rival's escapees distinct from that rival's current
// team AND from each other, which matters because the id is what the Dex,
// the bay and the battle log all key on.
function makeEscapee(state, content, rival, n, now) {
  const t = breakoutTuning(content);
  const rng = rngStream(state.seed, `breakout:${rival.id}`, n);
  const record = rivalRecord(state, rival.id);
  const meta = content.rivalMeta;
  const powerScale = Math.min(
    meta.powerCap,
    rival.powerScale * (1 + (record.defeats ?? 0) * meta.powerPerDefeat)
  );
  const unit = rivalSpecimen(rival, content, {
    rng, meta, defeats: record.defeats ?? 0,
    index: Math.floor(rng() * Math.max(1, rival.frames.length)),
    powerScale, idSuffix: `loose${n}`,
  });
  const sightings = t.sightings ?? [];
  return {
    id: `loose-${n}`,
    rivalId: rival.id,
    unit,
    escapedAt: now,
    sighting: sightings.length ? sightings[Math.floor(rng() * sightings.length)] : 'somewhere in the county',
    reward: Math.round((t.rewardBase ?? 140) + unit.power * (t.rewardPerPower ?? 5)),
  };
}

// The world tick.
//
// ONE CHRONOLOGICAL LOOP, which is R78's lesson paid forward: a month away
// is replayed by walking the timeline forward, not by running one pass for
// arrivals and another for everything else. There is no expiry here to
// interleave with, but the loop shape is what keeps `nextBreakAt` advancing
// from the moment each escape was DUE rather than from the moment the
// player happened to open the app — the exact slip that froze a month of
// counter-offensives on one seed.
export function tickBreakouts(state, content, now, since = now) {
  const cam = state.campaign;
  cam.loose ??= [];
  cam.breakoutCount ??= 0;
  const t = breakoutTuning(content);
  const escaped = [];
  if (!breakoutEligible(state, content)) return { escaped };

  // Arming dates from the START of the gap, not from the moment the player
  // happened to open the app — and then falls THROUGH to the loop below
  // rather than returning.
  //
  // Both halves are R78's lesson. Eligibility lives in the save: beat your
  // first rival, close the app for a month, and this is the tick that arms
  // the clock. Arming it at `now` and returning would mean the month
  // produced nothing at all and the first escape is always five hours after
  // you next look — which is exactly the shape of the month that froze on
  // seed 5150, and it would be invisible for the same reason: the board
  // looks plausible, it is just empty.
  if (cam.nextBreakAt == null) {
    cam.nextBreakAt = since + Math.round((t.firstDelayHours ?? 5) * HOUR);
  }

  let guard = 0;
  while (guard++ < 400) {
    if (now < cam.nextBreakAt) break;
    const due = cam.nextBreakAt;
    // The board is full: the lab is having a bad month but the county can
    // only hold so many loose science projects. The clock still advances
    // from when this one was due, so a player who clears the board does not
    // then wait a fresh cooldown for something that was already overdue.
    if (cam.loose.length >= (t.maxLoose ?? 4)) {
      scheduleNext(state, content, due);
      continue;
    }
    const rival = labFor(state, content, cam.breakoutCount);
    if (!rival) break; // nobody has lost to you yet — nothing to lose
    const escapee = makeEscapee(state, content, rival, cam.breakoutCount, due);
    cam.loose.push(escapee);
    cam.breakoutCount += 1;
    escaped.push({ ...escapee, lab: rival.name });
    scheduleNext(state, content, due);
  }
  return { escaped };
}

// The encounter. One specimen, inline, so nothing has to exist in
// enemies.json for a creature the player's own rival invented this morning.
export function breakoutEncounter(state, content, id) {
  const loose = looseById(state, id);
  if (!loose) return null;
  const t = breakoutTuning(content);
  const rival = rivalOf(content, loose.rivalId);
  return {
    id: `breakout_${loose.id}`,
    breakoutId: loose.id,
    rivalId: loose.rivalId,
    name: `${loose.unit.name} — loose`,
    blurb: `${loose.unit.name} was ${loose.sighting}. ${t.blurb ?? ''}`.trim(),
    intel: (t.intel ?? '').replace('{lab}', rival?.name ?? 'somebody'),
    waves: [loose.unit],
    reward: loose.reward,
    tier: null,
  };
}

// Beating one closes the entry either way. Whether it went home in a bay is
// the Containment Cannon's business, and `resolveBattle`'s containment loop
// has already run by the time this is called.
//
// This says WHAT HAPPENED and hands back the two names the wire will need.
// It deliberately does not name a news event: R20's rule is that every line
// of copy has a caller the suite can SEE, and an event id passed out of here
// as a variable is a caller nothing can verify — the gate caught exactly
// that on the first draft. So the two literals live at the call site.
export function resolveBreakout(state, content, id, outcome, captured = false) {
  const loose = looseById(state, id);
  // Closed if you WON or if you BAGGED IT — not just the first. Cannon
  // prizes ride home regardless of outcome (campaign.js says so and means
  // it), so a specimen can be in one of your bays after a fight you lost.
  // Today that cannot happen, because a breakout is one wave and bagging
  // the only wave ends the fight as a win — but "it cannot happen" is a
  // property of the wave count, not of this function, and the day a
  // breakout fields two specimens the board would offer you a creature
  // already standing in your own containment wing.
  if (!loose || (outcome !== 'win' && !captured)) return { cleared: false, creature: null, lab: null };
  state.campaign.loose = looseSpecimens(state).filter((s) => s !== loose);
  const t = breakoutTuning(content);
  state.campaign.notoriety += t.notoriety ?? 0;
  return {
    cleared: true,
    creature: loose.unit.name,
    lab: rivalOf(content, loose.rivalId)?.name ?? 'its old lab',
  };
}
