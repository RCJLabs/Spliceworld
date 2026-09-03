// Rehabilitation (ROADMAP §3.6). Pure and DOM-free, so tools/sim.js and the
// smoke suite can run a whole programme headless.
//
// §3.6 gives a captured chimera two futures: "salvage its engineered parts
// or, post-v0.1, rehabilitate it into your roster." Salvage is instant,
// certain, and hands you enemy tech at the grades its owner raised. Rehab
// must therefore cost what salvage does not — real-world time, money, and
// the parts you are giving up — and pay what salvage cannot: a whole
// creature you could not have built. A rival's anatomy, a rival's grades,
// on a chassis your Theater may not even be licensed for.
//
// Two knobs make it a decision rather than a delay:
//   • the CLOCK releases it — ignore the programme entirely and it still
//     graduates, just wary of you (bond 0, obedience poor);
//   • the SESSIONS decide who it becomes — each one buys bond and shaves
//     instability.
// The two are kept deliberately separate. A first draft let sessions take
// hours off the clock as well, which quietly made the SHORTEST programmes
// — the scrappiest, easiest specimens — the ones you could invest in least,
// because the curriculum no longer fit inside them. So the lazy path works
// and the invested path is better, which is the same bargain training
// already offers (splice/theater.js).

import { SOCKETS, slotOfSocket } from '../render/renderer.js';
import { grantsOf } from '../splice/facility.js';
import { playerLine } from './monologue.js';
import { newsFor } from './wire.js';

const HOUR = 3600000;

// Defaults exist so a Node tool with a partial content bundle still has
// coherent numbers; data/facility.json is the real source (Law: all
// content is data).
const DEFAULT_TUNING = {
  baseHours: 4.5,
  hoursPerPower: 0.0675,
  hoursPerInstability: 0.0375,
  maxHours: 22.5,
  baseFee: 60,
  feePerPower: 2.2,
  wariness: 25,
  sessionCost: 25,
  sessionBond: 12,
  sessionStability: 4,
  sessionGapFraction: 0.2,
  maxSessions: 4,
};

export function rehabTuning(content) {
  return { ...DEFAULT_TUNING, ...(content.facility?.containment?.tuning ?? {}) };
}

// What the Containment track currently permits. Unlike the Theater (where
// missing data means "everything", so a failed load never locks a player
// out of what they already had), a missing Containment track means rehab
// is simply not installed — salvage, the thing that already worked, is
// unaffected.
export function rehabGrants(state, content) {
  const g = grantsOf(state, content, 'containment');
  return {
    enabled: g.rehab === true,
    hourScale: g.hourScale ?? 1,
    feeScale: g.feeScale ?? 1,
  };
}

// A bay holds either a generated record (a rival's chimera, whose stats
// came from physiology) or a roster id from enemies.json.
export function bayUnit(entry, content) {
  if (!entry) return null;
  return entry.unit ?? content.enemies[entry.unitId] ?? null;
}

export function findBay(state, ref) {
  const bays = state.campaign.containment;
  if (typeof ref === 'number') return bays[ref] ?? null;
  return bays.find((b) => b.id === ref) ?? null;
}

// Where each recovered part is installed. A rival fields at most one part
// per slot, but a donor with two organs must land the second in organ2
// rather than overwrite the first — and a part with nowhere to go is
// dropped from the body plan rather than crashing the intake.
function assignSockets(unit, content) {
  const partIds = unit.salvage ?? [];
  const grades = unit.salvageGrades ?? [];
  const sockets = {};
  const skipped = [];
  for (const [i, partId] of partIds.entries()) {
    const part = content.parts[partId];
    if (!part) { skipped.push(partId); continue; } // retired part id
    const free = SOCKETS.find((s) => slotOfSocket(s) === part.slot && !(s in sockets));
    if (!free) { skipped.push(partId); continue; }
    sockets[free] = { partId, grade: grades[i] ?? 'standard' };
  }
  return { sockets, skipped };
}

// The offer, with real numbers, before any money changes hands (Law 4:
// building is engineering, not a slot machine — so is adopting).
// `possible` asks whether this specimen could ever be rehabilitated;
// `enabled` asks whether you have built the wing to do it in.
export function rehabPlan(state, entry, content) {
  const t = rehabTuning(content);
  const grants = rehabGrants(state, content);
  const unit = bayUnit(entry, content);
  if (!unit) return { possible: false, enabled: grants.enabled, reason: 'That bay is empty and slightly damp.' };
  if (!unit.genome) {
    return {
      possible: false,
      enabled: grants.enabled,
      unit,
      reason: `${unit.name} is not, in the end, an animal. It can be dismantled. It cannot be befriended.`,
    };
  }
  const { sockets, skipped } = assignSockets(unit, content);
  if (!Object.keys(sockets).length) {
    return { possible: false, enabled: grants.enabled, unit, reason: 'Nothing in there is recoverable enough to rebuild a body plan from.' };
  }

  // It was built to someone else's standards and has opinions about you.
  const instability = Math.min(100, Math.round((unit.physiology?.instability ?? 0) + t.wariness));
  const hours = Math.max(
    1,
    Math.min(
      t.maxHours,
      Math.round((t.baseHours + unit.power * t.hoursPerPower + instability * t.hoursPerInstability) * grants.hourScale)
    )
  );
  const fee = Math.round((t.baseFee + unit.power * t.feePerPower) * grants.feeScale);
  return { possible: true, enabled: grants.enabled, unit, sockets, skipped, hours, fee, instability, reason: null };
}

export function rehabRemainingMs(entry, now) {
  return Math.max(0, (entry?.rehab?.until ?? 0) - now);
}

export function rehabDone(entry, now) {
  return !!entry?.rehab && now >= entry.rehab.until;
}

// The gap between sessions is a share of the programme's OWN length, so a
// long, difficult intake paces out over days and a short one over an
// evening — and either way the whole curriculum fits before graduation.
// The first session is available the moment the specimen is enrolled.
export function sessionReadyAt(entry, content) {
  const rehab = entry?.rehab;
  if (!rehab) return Infinity;
  const t = rehabTuning(content);
  const gap = Math.max(0.25, rehab.hours * t.sessionGapFraction) * HOUR;
  return rehab.lastSessionAt ? rehab.lastSessionAt + gap : rehab.startedAt;
}

export function startRehab(state, ref, content, now) {
  const entry = findBay(state, ref);
  if (!entry) return { ok: false, msg: 'Nothing in that bay.' };
  if (entry.rehab) return { ok: false, msg: 'That one is already in the programme.' };
  const plan = rehabPlan(state, entry, content);
  if (!plan.enabled) return { ok: false, msg: 'You do not have a Reorientation Wing. Right now the only programme on offer is a bandsaw.' };
  if (!plan.possible) return { ok: false, msg: plan.reason };
  if (state.funds < plan.fee) {
    return { ok: false, msg: `Short by $${Math.ceil(plan.fee - state.funds)}. Enrichment toys are, inexplicably, not cheap.` };
  }

  state.funds -= plan.fee;
  entry.rehab = {
    startedAt: now,
    until: now + plan.hours * HOUR,
    hours: plan.hours,
    fee: plan.fee,
    // Snapshotted at intake so a later tuning change never rewrites a
    // programme the player already paid for.
    instability: plan.instability,
    sessions: 0,
    lastSessionAt: null,
    bond: 0,
  };
  return {
    ok: true,
    plan,
    msg: `${plan.unit.name} enters the Reorientation Wing. ${plan.hours}h of soft lighting and unearned trust begins.`,
    // An array, because the wire gets the event AND your opinion of it.
    news: [
      newsFor(state, content, 'rehab_enrolled', { creature: plan.unit.name }),
      playerLine(state, content, 'rehab', { creature: plan.unit.name }),
    ].filter(Boolean),
  };
}

// One enrichment session: what you actually get out of the programme, as
// opposed to what the clock gives you for free.
export function rehabSession(state, ref, content, now) {
  const t = rehabTuning(content);
  const entry = findBay(state, ref);
  if (!entry?.rehab) return { ok: false, msg: 'Nobody is enrolled in that bay.' };
  if (rehabDone(entry, now)) return { ok: false, msg: 'Programme complete — they are just waiting on the paperwork.' };
  if (entry.rehab.sessions >= t.maxSessions) {
    return { ok: false, msg: 'They have had every session on the curriculum. Any more would be showing off.' };
  }
  if (now < sessionReadyAt(entry, content)) {
    return { ok: false, msg: 'Too soon. Even a reformed apex predator needs a nap between breakthroughs.' };
  }
  if (state.funds < t.sessionCost) return { ok: false, msg: `Short by $${Math.ceil(t.sessionCost - state.funds)} for the session.` };

  const unit = bayUnit(entry, content);
  state.funds -= t.sessionCost;
  entry.rehab.sessions += 1;
  entry.rehab.lastSessionAt = now;
  entry.rehab.bond = Math.min(100, entry.rehab.bond + t.sessionBond);
  entry.rehab.instability = Math.max(0, entry.rehab.instability - t.sessionStability);
  return {
    ok: true,
    entry,
    msg: `${unit?.name ?? 'The specimen'} accepts a treat from your hand and does not remove the hand. Bond ${entry.rehab.bond}/100.`,
  };
}

// Pulling out. The bay goes back to being salvageable — nothing the player
// owns is ever destroyed — but the intake fee is spent, and says so.
export function cancelRehab(state, ref, content) {
  const entry = findBay(state, ref);
  if (!entry?.rehab) return { ok: false, msg: 'Nobody is enrolled in that bay.' };
  const unit = bayUnit(entry, content);
  entry.rehab = null;
  return {
    ok: true,
    msg: `${unit?.name ?? 'The specimen'} is returned to the holding bay and the intake fee is not returned to you. It is available for salvage again.`,
  };
}

// Graduation: the bay empties and a chimera walks out of it. The parts
// become real vault-shaped tokens carrying the donor's name, so a
// rehabilitated creature can later be extracted, salvaged and remembered
// exactly like one you built.
// R65: `now` is when the player looked; `rehab.until` is when the programme
// actually ended, and that is what everything here is stamped with. A
// graduate that finished on Tuesday has been cleared for deployment since
// Tuesday — stamping it `now` gave it a settling clock it had already served.
function graduate(state, entry, content, now) {
  const unit = bayUnit(entry, content);
  const { sockets } = assignSockets(unit, content);
  const rehab = entry.rehab;
  const graduatedAt = rehab.until ?? now;

  const tokens = {};
  for (const [socketId, { partId, grade }] of Object.entries(sockets)) {
    tokens[socketId] = {
      id: `t${state.inventory.tokenCount++}`,
      partId,
      grade,
      donor: { name: unit.name, species: content.parts[partId].species, stars: 5, extractedAt: graduatedAt },
    };
    if (!state.dex.parts.includes(partId)) state.dex.parts.push(partId);
  }

  const chimera = {
    id: `c${state.chimeraCount++}`,
    // It keeps its name. It was somebody before you met it.
    name: unit.name,
    frame: unit.genome.frame,
    tokens,
    createdAt: graduatedAt,
    // The programme WAS the settling — it arrives cleared for deployment,
    // just not yet convinced about you.
    settleUntil: graduatedAt,
    instability: rehab.instability,
    bond: rehab.bond,
    temperament: null,
    injury: null,
    lastTrainedAt: 0,
    // Whose lab it came out of, so the right villain can complain about
    // losing it (§3.8 `defection`).
    rehabilitated: { from: entry.unitId ?? unit.id, rivalId: entry.rivalId ?? null, at: graduatedAt, sessions: rehab.sessions },
  };
  state.chimeras.push(chimera);
  return chimera;
}

// Elapsed rehab effects, computed on load like every other timer. Returns
// the news lines rather than pushing them, so this module never has to
// know campaign.js exists.
export function tickRehab(state, content, now) {
  const news = [];
  const graduates = [];
  for (const entry of [...(state.campaign.containment ?? [])]) {
    if (!rehabDone(entry, now)) continue;
    state.campaign.containment = state.campaign.containment.filter((b) => b !== entry);
    const chimera = graduate(state, entry, content, now);
    graduates.push(chimera);
    // Three outcomes, three events: how much attention the programme got is
    // the thing being said, so it is the event id rather than a branch
    // choosing between three sentences written here.
    //
    // Each id is written out at its own call site rather than computed into
    // a variable, because "the event id is a literal you can grep" is what
    // lets the suite run the invariant both ways — an id assembled at
    // runtime has copy nothing can prove is reachable.
    // The params are written out too, for the same reason as the ids: a line
    // that asks for {creature} and an emitter that supplies it are two
    // readers of one contract, and the suite can only check that contract
    // where both ends are visible at the call site.
    news.push(
      entry.rehab.sessions >= 3
        ? newsFor(state, content, 'rehab_graduated_honours', { creature: chimera.name })
        : entry.rehab.sessions === 0
          ? newsFor(state, content, 'rehab_graduated_alone', { creature: chimera.name })
          : newsFor(state, content, 'rehab_graduated', { creature: chimera.name })
    );
  }
  return { news, graduates };
}
