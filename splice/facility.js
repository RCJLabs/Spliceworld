// Facility upgrades (ROADMAP §3.10). Pure and DOM-free.
//
// An upgrade must expand what you can CREATE, never what you can grind
// (Law 2). So a track's levels carry `grants` — frames, sockets — and the
// systems that care read them. The Surgery Theater asks this module what it
// is allowed to build with; it does not know what a "tier" is.

import { SOCKETS, slotOfSocket } from '../render/renderer.js';

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

// The named readers. Every system that a facility track touches asks for
// its own grants through one of these rather than reaching into the data,
// so a track can gain a level, or a whole new knob, without any of them
// learning what a "tier" is. Each default is the world as it stood before
// R25 shipped: a save with no facility record, or a Node tool holding a
// partial content bundle, behaves exactly as it always did.
export function incubatorGrants(state, content) {
  const g = grantsOf(state, content, 'incubator');
  return { slots: g.slots ?? 3, hourScale: g.hourScale ?? 1, mutationBonus: g.mutationBonus ?? 0, variantShare: g.variantShare ?? 0.3 };
}

export function extractorGrants(state, content) {
  const g = grantsOf(state, content, 'extractor');
  // R91 — the Extractor track buys shelf space as well as sharper grades.
  // The fallbacks are the day-180 ceiling rather than the level-1 floor,
  // because a Node tool holding a partial content bundle must not lock a
  // player out of their own vault; the rule elsewhere in this file.
  return { gradeBonus: g.gradeBonus ?? 0, vaultParts: g.vaultParts ?? 400, vaultVials: g.vaultVials ?? 120 };
}

export function scannerGrants(state, content) {
  const g = grantsOf(state, content, 'scanner');
  return { genotype: !!g.genotype, pairing: !!g.pairing };
}

export function infirmaryGrants(state, content) {
  const g = grantsOf(state, content, 'infirmary');
  return {
    healScale: g.healScale ?? 1,
    treatScale: g.treatScale ?? 1,
    scarChanceScale: g.scarChanceScale ?? 1,
  };
}

const UPKEEP_DEFAULTS = {
  frameBase: { A: 4, S: 3, M: 5, L: 9 },
  frameFallback: 5,
  gradeCost: { standard: 1, prime: 5, apex: 12, prismatic: 22 },
  drawCost: 0.35,
  instabilityCost: 0.08,
  // R143 — the two things that were free to own. R25 pointed the upkeep
  // economy at livestock and nothing ever pointed it at territory or the
  // plant, so income scaled with conquest and outgo did not. FRACTIONS, not
  // tables: a garrison priced as a share of the node's own income can never
  // exceed what the node pays, so conquest still pays and losing a node is
  // never a relief — including for a region nobody has written yet.
  // Calibration and the liquidity wall it hit are in ROADMAP §9.22.
  garrisonFraction: 0.12,
  facilityRunningFraction: 0.0006,
};

export function upkeepTuning(content) {
  return { ...UPKEEP_DEFAULTS, ...(content.upkeepMeta ?? {}) };
}

// R143 — what the map costs to hold, and what the plant costs to run. A
// contested node still pays its garrison: income is suspended while the
// convoy sits there, and a garrison that stopped would make being attacked a
// saving. The plant is priced off what each level cost to build, so it is
// zero on a fresh save and grows only as the player grows it.
export function territoryUpkeepPerDay(state, content) {
  const held = new Set(state.campaign?.heldNodes ?? []);
  if (!held.size) return 0;
  const f = upkeepTuning(content).garrisonFraction;
  return Object.values(content.regions ?? {})
    .flatMap((r) => r.nodes ?? [])
    .reduce((n, node) => (held.has(node.id) ? n + (node.incomePerDay ?? 0) * f : n), 0);
}

export function facilityUpkeepPerDay(state, content) {
  const f = upkeepTuning(content).facilityRunningFraction;
  return tracks(content).reduce((n, t) => n + (t.levels ?? [])
    .slice(0, facilityLevel(state, t.id))
    .reduce((m, l) => m + (l.cost ?? 0) * f, 0), 0);
}

// What the Surgery Theater may build with right now.
//
// A9: the chassis gets a vote. The facility says which bays you have
// INSTALLED; the frame says which ones it has anywhere to bolt them. The
// Kite is a flying wing with no hindquarters, so `hindlimbs` is not a
// purchase it is missing, it is geometry it does not have. A frame that
// declares no `slots` supports all of them, so S, M and L — and every save
// that predates the Kite — behave exactly as they always did.
export function theaterGrants(state, content, frameId = null) {
  const g = grantsOf(state, content, 'theater');
  const sockets = g.sockets ?? SOCKETS;
  const frameSlots = frameId ? content.frames?.[frameId]?.slots : null;
  return {
    // No facility data at all (a Node tool with a partial content bundle)
    // means "everything" rather than "nothing" — never lock a player out
    // because a file failed to load.
    frames: g.frames ?? Object.keys(content.frames ?? {}),
    sockets: frameSlots ? sockets.filter((s) => frameSlots.includes(slotOfSocket(s))) : sockets,
    // R91 — the Theater builds the creatures, so the Theater houses them,
    // and its one table decides how often it can change its mind.
    stable: g.stable ?? 12,
    tableHours: g.tableHours ?? 20,
    // R135 — taking a creature apart is not building one. One table, two
    // prices: a splice stays 20h/10h (R91's note on the shared clock is
    // load-bearing) and a dismantle is 3h/30m, which is the complaint this
    // milestone was reported against. Measured: 74.8 days of median chimera
    // life, against 48.5 before — a cheap undo lets a failure be cleared
    // without the rebuild being cheap too. Fallback is the UNbought rung.
    dismantleHours: g.dismantleHours ?? 3,
  };
}

// R91 — THE THEATER IS A ROOM WITH ONE TABLE IN IT.
//
// Splicing and dismantling both occupy it. Before this, a splice cost
// nothing you could not immediately undo, so a 180-day walk built 1,834
// creatures to keep nine and the median chimera lived TWO HOURS: the vault
// was deep enough that a build was a draft rather than a decision. The
// table is the decision. A better Theater turns it round faster, which is
// what a facility track is for, and the clock is rushable like every other
// sealed clock since R86 — so a player in a hurry pays money instead of
// waiting, and nobody is ever simply stopped.
// `kind` is 'splice' or 'dismantle' — the two things that take the table.
export function theaterBusyFor(state, content, kind = 'splice') {
  const g = theaterGrants(state, content);
  return (kind === 'dismantle' ? g.dismantleHours : g.tableHours) * 3600000;
}

export function theaterFree(state, now) {
  return (state.theater?.busyUntil ?? 0) <= now;
}

// One sentence for a busy table, beside the clock it describes, so the
// Theater and the Extractor cannot drift into wording the same refusal two
// different ways — and so `splice/extract.js` does not have to import the
// whole Surgery Theater to say it. That import cost 20 KB of the boot
// budget for one string.
// R135 — hours stopped being the unit: the Tier II table is half of one, and
// anything rounding to whole hours reported "1h" for every clock under it,
// so the upgrade just paid for looked like it had done nothing. Shared, so
// the refusal and the card selling it agree on what to call half an hour.
export function spanOf(hours) {
  const mins = Math.round(hours * 60);
  if (mins < 60) return `${mins}m`;
  return mins % 60 === 0 ? `${mins / 60}h` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// `content` is optional: with it the refusal also says what the next tier
// would make this — the one sentence read at the moment the wait bites.
export function theaterBusyMsg(state, now, content = null, kind = 'splice') {
  const left = Math.max(0, (state.theater?.busyUntil ?? 0) - now);
  const mins = Math.max(1, Math.ceil(left / 60000));
  const clock = mins < 60 ? `${mins}m` : `${Math.ceil(mins / 60)}h`;
  const up = content ? nextUpgrade(state, content, 'theater') : null;
  const grants = up?.level?.grants;
  const faster = kind === 'dismantle' ? grants?.dismantleHours : grants?.tableHours;
  const sell = faster == null ? ''
    : ` ${up.level.name} would take ${kind === 'dismantle' ? 'a dismantle' : 'a splice'} to ${
      spanOf(faster)}, for $${up.level.cost}.`;
  return `The table is still occupied — ${clock} to go.`
    + ` Surgery is not a thing you do twice at once.${sell}`;
}

export function occupyTheater(state, content, now, kind = 'splice') {
  state.theater ??= { busyUntil: 0 };
  state.theater.busyUntil = now + theaterBusyFor(state, content, kind);
}

// R91 — HOW MANY STALLS ARE SPOKEN FOR.
//
// A chimera arrives by five doors: a splice, a Wing graduation, a vat
// decant, a rescue and a feral coming home. The last two are the player's
// own creature COMING BACK and can never be refused — a cap that loses you
// a chimera you already had is a bug wearing a rule's clothes. The first
// three are creations, and all three are capped here.
//
// A running programme counts. The Wing and the vat are clocks the player
// STARTED, and a clock that has been started must always be allowed to
// finish (the same promise R9 makes about a defence window and R86 about a
// rush), so the refusal belongs at the enrolment rather than at the
// graduation — which means the stall has to be reserved while the clock
// runs, or a player could enrol at eleven, splice to twelve, and graduate
// into thirteen.
export function stableRoom(state, content) {
  const cap = theaterGrants(state, content).stable;
  // A CAPTURED OR FERAL CREATURE STILL HAS A STALL. Its rescue window is a
  // clock the player is running, exactly like a Wing programme, and it comes
  // home to the roster when it closes — so leaving it out would let a player
  // splice into the space of a creature they are on their way to getting
  // back, and then exceed the cap the moment it walked in. Measured: the
  // walk ended on THIRTEEN chimeras against a stable of twelve, and the gate
  // said so. `chimeras.length <= stable` is only an invariant if everything
  // that can rejoin the roster is counted while it is away.
  const pending = (state.campaign?.containment ?? []).filter((b) => b.rehab || b.feral).length
    + (state.campaign?.captives ?? []).length
    + (state.vat ? 1 : 0);
  const used = (state.chimeras?.length ?? 0) + pending;
  return { cap, used, pending, free: Math.max(0, cap - used) };
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
