// Surgery Theater logic (M3). Pure functions over state: assemble vault
// tokens onto a frame, birth a chimera, start its settling timer, log any
// combo discoveries. Presentation lives in theater-ui.js.

import { rngStream, pick } from '../util/rng.js';
import { SOCKETS, slotOfSocket } from '../render/renderer.js';
import { analyze } from './physiology.js';
import { theaterGrants } from './facility.js';
import { driftFromTraining } from './temperament.js';

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
    exhaustedUntil: 0, // recovery after a turn in the chaos vat
    scars: [], // set by untreated injuries (§3.5)
    injuryCount: 0,
  };
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
