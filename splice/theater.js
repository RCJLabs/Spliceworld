// Surgery Theater logic (M3). Pure functions over state: assemble vault
// tokens onto a frame, birth a chimera, start its settling timer, log any
// combo discoveries. Presentation lives in theater-ui.js.

import { rngStream, pick } from '../util/rng.js';
import { SOCKETS, slotOfSocket } from '../render/renderer.js';
import { analyze } from './physiology.js';
import { theaterGrants } from './facility.js';
import { driftFromTraining } from './temperament.js';
import { MOVE_SLOTS, activeMoves } from '../battle/moves.js';
import { defaultMoveset } from '../battle/moves.js';
import { movesFromTokens } from '../battle/engine.js';

const CHIMERA_NAMES = [
  'Chompers', 'Beefsquawk', 'Sir Hornsalot', 'Dr. Fluffles', 'Snack Hazard',
  'Captain Wiggles', 'Exhibit A', 'Prototype Dave', 'Ms. Chaos', 'The Intern',
  'Gnawthaniel', 'Fangela', 'Beaklash', 'Goatzilla', 'Hissterica',
];

// slotTokens: { socketId: tokenId | null }. Heads are mandatory — every
// abomination deserves googly eyes. Which frames and sockets are legal is a
// facility question (§3.10): Tier II buys the Rumbler chassis and the second
// organ bay, so the Theater asks rather than assumes.
export function validateSplice(state, frameId, slotTokens, content) {
  const errors = [];
  const grants = theaterGrants(state, content, frameId);
  if (!content.frames[frameId]) errors.push(`Unknown frame: ${frameId}`);
  else if (!grants.frames.includes(frameId)) {
    errors.push(`The ${content.frames[frameId].name} needs a bigger Theater than you own.`);
  }
  if (!slotTokens.head) errors.push('A head is required. Company policy.');
  const seen = new Set();
  for (const [socketId, tokenId] of Object.entries(slotTokens)) {
    if (!tokenId) continue;
    if (!SOCKETS.includes(socketId)) errors.push(`Unknown socket: ${socketId}`);
    else if (!grants.sockets.includes(socketId)) {
      // Two different "no": the facility has not bought the bay, or this
      // chassis has nowhere to put it. Say which, or the player upgrades
      // the Theater and nothing changes.
      const chassis = content.frames[frameId]?.slots;
      errors.push(
        chassis && !chassis.includes(slotOfSocket(socketId))
          ? `The ${content.frames[frameId].name} has no ${slotOfSocket(socketId)} to bolt that to.`
          : `The ${socketId} bay is not installed yet — upgrade the Surgery Theater.`
      );
    }
    if (seen.has(tokenId)) errors.push(`Token ${tokenId} used twice.`);
    seen.add(tokenId);
    const token = state.inventory.parts.find((t) => t.id === tokenId);
    if (!token) errors.push(`Token ${tokenId} is not in the vault.`);
    else if (content.parts[token.partId].slot !== slotOfSocket(socketId)) {
      errors.push(`${content.parts[token.partId].name} does not fit the ${socketId} socket.`);
    }
  }
  return errors;
}

export function tokensFor(state, slotTokens, content) {
  return Object.values(slotTokens)
    .filter(Boolean)
    .map((id) => state.inventory.parts.find((t) => t.id === id))
    .filter((t) => t && (!content || content.parts[t.partId]));
}

export function spliceChimera(state, frameId, slotTokens, content, now) {
  const errors = validateSplice(state, frameId, slotTokens, content);
  if (errors.length) return { ok: false, msg: errors.join(' ') };

  const tokens = tokensFor(state, slotTokens);
  const report = analyze(frameId, tokens, content, theaterGrants(state, content, frameId).sockets.length);

  // Tokens leave the vault and live inside the chimera (salvage can
  // recover a degraded subset later — that flow lands with Containment).
  const tokenIds = new Set(tokens.map((t) => t.id));
  state.inventory.parts = state.inventory.parts.filter((t) => !tokenIds.has(t.id));

  const n = state.chimeraCount++;
  const rng = rngStream(state.seed, 'chimera', n);
  const chimera = {
    id: `c${n}`,
    name: pick(rng, CHIMERA_NAMES),
    frame: frameId,
    // socket id → token (full token kept: grades and lineage travel with it).
    // Keyed by the SOCKET the player chose, not the part's slot type, or two
    // organs would collapse into one bay.
    tokens: Object.fromEntries(
      Object.entries(slotTokens)
        .filter(([, tokenId]) => tokenId)
        .map(([socketId, tokenId]) => [socketId, tokens.find((t) => t.id === tokenId)])
        .filter(([, token]) => token)
    ),
    createdAt: now,
    settleUntil: now + report.settlingMs,
    instability: report.instability,
    bond: 0, // raised via training/feeding — M5+ (§3.5)
    temperament: null, // seeded on settling — later milestone
    injury: null, // Infirmary timer set by battle aftermath (Law 1)
    lastTrainedAt: 0,
    // R30: what it can press, out of everything its anatomy knows. Stamped
    // at birth so the four slots are a thing the player owns from the first
    // fight rather than something the engine improvises each time.
    moveset: [],
    lastMoveTrainAt: 0,
    exhaustedUntil: 0, // recovery after a turn in the chaos vat
    scars: [], // set by untreated injuries (§3.5)
    injuryCount: 0,
  };
  // The default pick, so a new creature walks out knowing which four it
  // fights with. Computed here rather than left to the engine's top-up
  // because the player is about to be shown it, and a moveset that only
  // exists at battle time is one they cannot retrain before the fight.
  chimera.moveset = defaultMoveset(movesFromTokens(tokens, report, content));
  state.chimeras.push(chimera);

  // Combo discoveries are permanent Splice-Dex entries.
  const newCombos = [];
  for (const combo of report.combos) {
    if (!state.discoveredCombos.includes(combo.id)) {
      state.discoveredCombos.push(combo.id);
      newCombos.push(combo);
    }
  }

  // AI-director stub keeps counting real builds (ROADMAP §3.7).
  for (const token of tokens) {
    state.directorStats.partUse[token.partId] = (state.directorStats.partUse[token.partId] ?? 0) + 1;
  }
  for (const tag of report.tags) {
    state.directorStats.tagUse[tag] = (state.directorStats.tagUse[tag] ?? 0) + 1;
  }

  return { ok: true, chimera, report, newCombos, msg: `${chimera.name} is alive! Legally speaking, "alive-adjacent."` };
}

export function chimeraGenome(chimera, content) {
  const parts = {};
  for (const [slot, token] of Object.entries(chimera.tokens)) parts[slot] = token.partId;
  return { frame: chimera.frame, parts };
}

export function isSettled(chimera, now) {
  return now >= chimera.settleUntil;
}

export function settleRemainingMs(chimera, now) {
  return Math.max(0, chimera.settleUntil - now);
}

// Training (M7 obedience UX): bond is earned, not assigned (§3.5).
export const TRAINING = { cost: 5, bondGain: 8, cooldownHours: 15 };

export function trainChimera(state, chimeraId, now, content) {
  const chimera = state.chimeras.find((c) => c.id === chimeraId);
  if (!chimera) return { ok: false, msg: 'No such chimera.' };
  const readyAt = (chimera.lastTrainedAt ?? 0) + TRAINING.cooldownHours * 3600000;
  if (now < readyAt) return { ok: false, msg: `${chimera.name} needs a break between sessions.` };
  if (state.funds < TRAINING.cost) return { ok: false, msg: 'Training treats cost money. The good ones, anyway.' };
  state.funds -= TRAINING.cost;
  chimera.lastTrainedAt = now;
  chimera.bond = Math.min(100, chimera.bond + TRAINING.bondGain);
  // Trust makes a creature braver, and gentler with it (§3.5).
  driftFromTraining(chimera, content);
  return { ok: true, msg: `${chimera.name} nails the obstacle course and earns a treat. Bond ${chimera.bond}/100.` };
}

// --- R30: four slots, and you retrain to change them --------------------
//
// A chimera KNOWS every move its anatomy grants. It can press four. Swapping
// one in means giving one up, which is the whole point: a combo you just
// discovered has to be worth more than whatever it displaces, and a build
// with four attacks and no answer to armour is a choice you made rather
// than a list you were handed.
//
// Priced with the training idiom that already exists (bond training), so
// there is no second economy to learn: a small fee and a shared cooldown.
// Deliberately cheap and deliberately NOT permanent — forgetting a move you
// can still see in the list would be a trap, and A6's lesson was that a
// reward you cannot press is not a reward.
export const MOVE_TRAINING = { cost: 8, cooldownHours: 3.75 };

export function moveTrainingReady(chimera, now, content) {
  const t = { ...MOVE_TRAINING, ...(content?.moveTrainingMeta ?? {}) };
  const readyAt = (chimera.lastMoveTrainAt ?? 0) + t.cooldownHours * 3600000;
  return { ready: now >= readyAt, readyAt, msRemaining: Math.max(0, readyAt - now), cost: t.cost };
}

// `known` is what the genome grants (battle/moves.js knownMoves); `next` is
// the ids the player wants in the four slots.
export function setMoveset(state, chimeraId, next, known, now, content) {
  const chimera = state.chimeras.find((c) => c.id === chimeraId);
  if (!chimera) return { ok: false, msg: 'No such chimera.' };
  const ids = [...new Set(next ?? [])];
  const legal = new Set(known.map((m) => m.id));
  const unknown = ids.filter((id) => !legal.has(id));
  if (unknown.length) return { ok: false, msg: 'That is not a move this one knows.' };
  if (!ids.length) return { ok: false, msg: 'A creature with no moves is a very expensive pet.' };
  if (ids.length > MOVE_SLOTS) {
    return { ok: false, msg: `Four slots. Something has to go.` };
  }
  // Reordering what it already carries is free — the cost is for LEARNING,
  // not for deciding which button sits where.
  //
  // "What it already carries" is the EFFECTIVE moveset, not the stored
  // array. A save migrated from before R30 stores an empty one and is
  // topped up from the default pick at battle time, so comparing against
  // the raw field would tell that player their creature is learning all
  // four moves it has been fighting with for weeks — and charge them.
  const current = new Set(activeMoves(known, chimera.moveset).map((m) => m.id));
  const learning = ids.filter((id) => !current.has(id));
  if (!learning.length) {
    chimera.moveset = ids;
    return { ok: true, msg: `${chimera.name} shuffles its repertoire.`, free: true };
  }
  const t = moveTrainingReady(chimera, now, content);
  if (!t.ready) return { ok: false, msg: `${chimera.name} has had enough drilling for now.` };
  if (state.funds < t.cost) {
    return { ok: false, msg: `Short by $${Math.ceil(t.cost - state.funds)}. Treats are not free.` };
  }
  state.funds -= t.cost;
  chimera.lastMoveTrainAt = now;
  chimera.moveset = ids;
  const dropped = [...current].filter((id) => !ids.includes(id));
  const name = (id) => known.find((m) => m.id === id)?.name ?? 'something';
  return {
    ok: true,
    msg: dropped.length
      ? `${chimera.name} learns ${learning.map(name).join(' and ')}, and promptly forgets ${dropped.map(name).join(' and ')}.`
      : `${chimera.name} learns ${learning.map(name).join(' and ')}.`,
  };
}

// --- A6: what an undiscovered combo is allowed to tell you --------------
//
// Every undiscovered combo used to render the same sentence — "an
// undiscovered pairing lurks in the parts bin…" — nineteen identical rows
// that named nothing. A silhouette is supposed to be BAIT: a lead you can
// act on. Nineteen copies of "there is something somewhere" is a wall.
//
// So a hint reveals in layers, and what it reveals depends on what the
// player has actually handled (state.dex.parts — every part ever seen,
// which survives spending the token):
//
//   nothing seen  → the two SLOTS and the keyword. "a hindlimb and a head,
//                   and it knocks things over." Enough to rummage with.
//   one half seen → that half by NAME, plus the other's slot. This is the
//                   real lead: you own one end of it and now you know.
//   both seen     → both names. You are holding the answer and have not
//                   noticed; the Dex should say so rather than smirk.
//
// DOM-free so the Dex screen and the smoke suite read the same function.
const SLOT_WORDS = {
  head: 'a head', forelimbs: 'a pair of forelimbs', hindlimbs: 'a pair of hindlimbs',
  tail: 'a tail', hide: 'a hide', organ: 'an organ',
};

export function comboHint(combo, state, content) {
  const seen = new Set(state.dex?.parts ?? []);
  const halves = combo.parts.map((id) => ({ part: content.parts[id], seen: seen.has(id) }));
  const known = halves.filter((h) => h.seen).length;
  const label = (h) => (h.seen ? h.part.name : SLOT_WORDS[h.part.slot] ?? `a ${h.part.slot}`);
  return {
    known,
    // The keyword is always shown: it is the reason to go looking, and it
    // gives away nothing about WHICH parts.
    keyword: combo.keyword,
    text: known === 2
      ? `${label(halves[0])} + ${label(halves[1])} — you have handled both. Put them on the same creature.`
      : `${label(halves[0])} + ${label(halves[1])}`,
  };
}
