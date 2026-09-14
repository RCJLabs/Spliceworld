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
import { rivalList, rivalRecord, rivalSpecimen, rivalDossier } from './rivals.js';
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

// R129 — THE LAST LAB FALLS OPEN. Beating the fifth rival was the one rung
// on the ladder with no consequence. Measured before any of this was
// written: the board is not a drip — five 180-day walks already spawn ~190
// escapees and the board is empty on every seed, so `maxLoose` never binds
// and "more often" would have been invisible. The ceilings were elsewhere:
// the lab palettes own 21 of 41 species, and a bagged specimen is not worth
// a stall because a Wing graduate carries its old lab's grades. So this is a
// PHASE — a moment, and something in it worth crossing the county for.
export function releaseTuning(content) {
  return breakoutTuning(content).release ?? {};
}

// Every lab beaten at least once. The same question `campaign.js` asks for
// its banner, asked here rather than imported, because `campaign.js` imports
// this module and the cycle is not worth one predicate.
export function ladderFinished(state, content) {
  const labs = rivalList(content);
  return labs.length > 0
    && labs.every((r) => (rivalRecord(state, r.id).defeats ?? 0) > 0);
}

// The county is open once the release has fired, and it fires exactly once.
export function released(state) {
  return state.campaign?.released ?? null;
}

// After the release the board is leakier and holds more. Before it, R82's
// numbers stand untouched — this cannot make the early game busier.
function pacing(state, content) {
  const t = breakoutTuning(content);
  const r = releaseTuning(content);
  return released(state)
    ? { cooldownHours: r.cooldownHours ?? t.cooldownHours, maxLoose: r.maxLoose ?? t.maxLoose }
    : { cooldownHours: t.cooldownHours ?? 22, maxLoose: t.maxLoose ?? 4 };
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
  cam.nextBreakAt = from + Math.round(pacing(state, content).cooldownHours * jitter * HOUR);
}

// R93 — HOW MANY COME BACK.
//
// Measured before this was written: post-dominion the walk fought 1,624
// escapee hunts across six 180-day campaigns — 3.4x more hunts than defences
// — and won 99.0% of them. One wave, one specimen, every time, for the rest
// of the game. R82's reasons for a standing board with no deadline and no
// land at stake are all still good; none of them was a reason the fight
// itself should be a formality.
//
// KEYED ON THE LAB'S OWN LOSSES, and the first draft got this wrong in a way
// worth keeping: it keyed on DEFEATS — how many times you have beaten that
// rival in a duel — because that is the number already scaling an escapee's
// power. Measured over six 180-day campaigns, defeats top out at 2 to 6. The
// walker duels each rival about five times in half a year, so any rule that
// waits for a third defeat is waiting on something two of six campaigns never
// reach: seeds 2026 and 4242 produced not one pack, and the late game was
// exactly as free as before.
//
// Escapes are the number the late game actually produces — 199 to 398 per
// campaign, across five labs — and they are also what the entry asked for in
// the first place: "a lab that has lost N specimens sends them back
// together". A lab bleeding stock is a lab whose fences are the problem, and
// the fences get worse as the campaign runs, which is where the criterion
// lives.
//
// Data, not code: `maxSize` is the only thing standing between this and a
// twelve-specimen wall, and it belongs where a designer can see it.
export function escapesFrom(state, rivalId) {
  return (state.campaign?.escapesByLab ?? {})[rivalId] ?? 0;
}

// Counts ESCAPES, not bodies — and the first draft counted bodies, on the
// reasoning that a lab which loses three at once has lost three. It compounds:
// a pack of three adds three to the tally that decides the next pack's size,
// so the county goes from pairs to triples to triples-everywhere in about
// thirty days. Measured, that draft took post-dominion hunts to 53.2% won and
// raised the hunt COUNT by a third, because a lost hunt leaves the pack on the
// board to be fought again.
//
// One escape is one event. The escalation stays linear and stays tunable.
function noteEscape(cam, rivalId) {
  cam.escapesByLab ??= {};
  cam.escapesByLab[rivalId] = (cam.escapesByLab[rivalId] ?? 0) + 1;
}

export function packSize(content, escapes) {
  const p = breakoutTuning(content).pack ?? {};
  const after = p.afterEscapes ?? Infinity;
  const per = Math.max(1, p.escapesPerExtra ?? 12);
  const max = Math.max(1, p.maxSize ?? 1);
  if (!(escapes >= after)) return 1;
  return Math.min(max, 2 + Math.floor((escapes - after) / per));
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
  // R129 — after the release, the SAME generator is asked for a wilder
  // specimen rather than a second generator being written beside it. R82's
  // rule is that a loose one is indistinguishable from a duellist because it
  // WAS one; a parallel builder would be two things to keep in step and the
  // first place the two would drift.
  const rel = releaseTuning(content);
  const wild = released(state)
    ? { socketChance: rel.wildSocketChance ?? 0.45, traitChance: rel.traitChance ?? 0.6 }
    : null;
  const unit = rivalSpecimen(rival, content, {
    rng, meta, defeats: record.defeats ?? 0,
    index: Math.floor(rng() * Math.max(1, rival.frames.length)),
    powerScale, idSuffix: `loose${n}`, wild,
  });
  // R93 — THE REST OF THE PACK, through the same generator and R27's own
  // dossier. The entry asked for "the rival's counter-bias (R27's machinery,
  // already built)" and it is genuinely already built: `rivalSpecimen` takes
  // `dossier` and `counter`, and `rivalDossier` computes what this lab has
  // learned about your stable from duels against THEM. Passing it here means
  // a pack is not just more bodies, it is the lab's considered answer — the
  // second one is built for whatever you have been winning with.
  //
  // `index` walks from 1 so the counter lands the way rivalSpecimen already
  // decides it does, rather than this file re-implementing that rule.
  const size = packSize(content, escapesFrom(state, rival.id));
  const dossier = size > 1 ? rivalDossier(state, rival, content) : null;
  const pack = [];
  for (let i = 1; i < size; i++) {
    pack.push(rivalSpecimen(rival, content, {
      rng, meta, defeats: record.defeats ?? 0, index: i, dossier,
      counter: dossier?.counterClass ?? null,
      powerScale, idSuffix: `loose${n}p${i}`, wild,
    }));
  }
  const sightings = t.sightings ?? [];
  const power = unit.power + pack.reduce((sum, u) => sum + u.power, 0);
  return {
    id: `loose-${n}`,
    rivalId: rival.id,
    unit,
    // Always an array, never absent: a field that is sometimes missing is a
    // field every reader has to remember to default, and the save gate reads
    // a new game as the specification for every migrated one.
    pack,
    wild: !!wild,
    traits: unit.traits ?? [],
    escapedAt: now,
    sighting: sightings.length ? sightings[Math.floor(rng() * sightings.length)] : 'somewhere in the county',
    // A pack is worth more than one, and by less than its head count: the
    // extras are the lab's problem, not a jackpot. `rewardPerExtra` prices
    // them in data so the ratio is tunable without an engine edit.
    reward: Math.round((t.rewardBase ?? 140) + power * (t.rewardPerPower ?? 5)
      * (pack.length ? 1 - (1 - (t.pack?.rewardPerExtra ?? 1)) * (pack.length / (pack.length + 1)) : 1)),
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

  // The release fires here rather than at the duel's end because this is the
  // tick that already replays a gap: beat the fifth lab, close the app for a
  // week, and it still happens at the moment it was due. R78's lesson, which
  // the loop below was already written around.
  const rel = releaseTuning(content);
  // A FLAG RATHER THAN A COMPARISON. The first draft returned
  // `cam.released === since ? cam.released : null`, which reads "did the
  // release happen on THIS tick" off a timestamp — and two ticks in the same
  // millisecond share a `since`, so the headline could go out twice on a
  // save that ticked on focus and on a timer in the same instant. The branch
  // that fires it is the only thing that knows, so it says so.
  let firedRelease = false;
  if (!cam.released && ladderFinished(state, content)) {
    cam.released = since;
    firedRelease = true;
    const burst = [];
    for (let i = 0; i < (rel.burst ?? 6); i++) {
      if (cam.loose.length >= (rel.maxLoose ?? 9)) break;
      const lab = labFor(state, content, cam.breakoutCount);
      if (!lab) break;
      const one = makeEscapee(state, content, lab, cam.breakoutCount, since);
      cam.loose.push(one);
      cam.breakoutCount += 1;
      noteEscape(cam, lab.id);
      burst.push({ ...one, lab: lab.name });
    }
    escaped.push(...burst);
    // The clock restarts from the release, on the release's own pacing.
    scheduleNext(state, content, since);
  }

  let guard = 0;
  while (guard++ < 400) {
    if (now < cam.nextBreakAt) break;
    const due = cam.nextBreakAt;
    // The board is full: the lab is having a bad month but the county can
    // only hold so many loose science projects. The clock still advances
    // from when this one was due, so a player who clears the board does not
    // then wait a fresh cooldown for something that was already overdue.
    if (cam.loose.length >= pacing(state, content).maxLoose) {
      scheduleNext(state, content, due);
      continue;
    }
    const rival = labFor(state, content, cam.breakoutCount);
    if (!rival) break; // nobody has lost to you yet — nothing to lose
    const escapee = makeEscapee(state, content, rival, cam.breakoutCount, due);
    cam.loose.push(escapee);
    cam.breakoutCount += 1;
    noteEscape(cam, rival.id);
    escaped.push({ ...escapee, lab: rival.name });
    scheduleNext(state, content, due);
  }
  return { escaped, released: firedRelease ? cam.released : null };
}

// The encounter. One specimen, inline, so nothing has to exist in
// enemies.json for a creature the player's own rival invented this morning.
// R93 — every wave of a loose entry, leader first. One accessor because a
// save written before packs existed has no `pack` at all, and a default
// spelled in five places is a default that will be spelled wrong in one.
export function packOf(loose) {
  return loose ? [loose.unit, ...(loose.pack ?? [])] : [];
}

export function breakoutEncounter(state, content, id) {
  const loose = looseById(state, id);
  if (!loose) return null;
  const t = breakoutTuning(content);
  const rival = rivalOf(content, loose.rivalId);
  return {
    id: `breakout_${loose.id}`,
    breakoutId: loose.id,
    rivalId: loose.rivalId,
    name: packOf(loose).length > 1
      ? `${loose.unit.name} +${packOf(loose).length - 1} — loose`
      : `${loose.unit.name} — loose`,
    blurb: `${loose.unit.name} was ${loose.sighting}. `
      + `${packOf(loose).length > 1 ? (t.pack?.blurb ?? '') : (t.blurb ?? '')}`.trim(),
    intel: ((packOf(loose).length > 1 ? t.pack?.intel : null) ?? t.intel ?? '')
      .replace(/\{lab\}/g, rival?.name ?? 'somebody'),
    waves: packOf(loose),
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
