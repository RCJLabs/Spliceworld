// Surgery Theater logic (M3). Pure functions over state: assemble vault
// tokens onto a frame, birth a chimera, start its settling timer, log any
// combo discoveries. Presentation lives in theater-ui.js.

import { rngStream, pick } from '../util/rng.js';
import { SOCKETS, slotOfSocket } from '../render/renderer.js';
import { analyze } from './physiology.js';
import { theaterGrants } from './facility.js';

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
  const grants = theaterGrants(state, content);
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
      errors.push(`The ${socketId} bay is not installed yet — upgrade the Surgery Theater.`);
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
  const report = analyze(frameId, tokens, content, theaterGrants(state, content).sockets.length);

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
export const TRAINING = { cost: 5, bondGain: 8, cooldownHours: 20 };

export function trainChimera(state, chimeraId, now) {
  const chimera = state.chimeras.find((c) => c.id === chimeraId);
  if (!chimera) return { ok: false, msg: 'No such chimera.' };
  const readyAt = (chimera.lastTrainedAt ?? 0) + TRAINING.cooldownHours * 3600000;
  if (now < readyAt) return { ok: false, msg: `${chimera.name} needs a break between sessions.` };
  if (state.funds < TRAINING.cost) return { ok: false, msg: 'Training treats cost money. The good ones, anyway.' };
  state.funds -= TRAINING.cost;
  chimera.lastTrainedAt = now;
  chimera.bond = Math.min(100, chimera.bond + TRAINING.bondGain);
  return { ok: true, msg: `${chimera.name} nails the obstacle course and earns a treat. Bond ${chimera.bond}/100.` };
}
