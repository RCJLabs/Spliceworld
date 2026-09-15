// R169 — WHO THE PLAYER IS, as opposed to what gets said. DOM-free.
//
// This was the back half of `campaign/monologue.js`, and splitting it is
// R169 paying the line the entry named. The whole module was on the
// exemption list — 4.1 KB in the eager graph running nothing on either
// first paint — and the entry read that as 4.1 KB of savings. It is not:
// the front half (`fill`, `playerLine`, `rivalLine`, `philosophyOf`) is
// read by four EAGER modules on the synchronous battle-resolution path, so
// moving it anywhere eager would save nothing at all. What can actually
// leave is this: the founding ceremony's name roll and the philosophy menu,
// whose only caller in the game is `campaign/ui.js`, which R74 made lazy.
//
// The split line is therefore not a tidiness preference, it is the measured
// one: a function boot can reach stays, a function only a pressed tab can
// reach goes. See ROADMAP R169.

import { rngStream, pick } from '../util/rng.js';
import { playerLine } from './monologue.js';

export function philosophyList(content) {
  return Object.values(content.philosophies ?? {});
}

// Names are ROLLED, not typed: no screen in this game may render a native
// form control (tools/smoke.js guards it), and on a phone a seeded
// generator beats a keyboard anyway. `n` candidates from one seed, so the
// same roll always offers the same list and a reload mid-choice is safe.
export function rollIdentities(content, seed, n = 6) {
  const names = content.labNames;
  if (!names) return [];
  const out = [];
  const seen = new Set();
  for (let i = 0; out.length < n && i < n * 8; i++) {
    const rng = rngStream(seed, 'identity', i);
    const identity = {
      title: pick(rng, names.titles),
      name: `${pick(rng, names.firsts)} ${pick(rng, names.lasts)}`,
      lab: pick(rng, names.labs),
    };
    if (seen.has(identity.name)) continue;
    seen.add(identity.name);
    out.push({ id: `id${i}`, ...identity });
  }
  return out;
}

export function setIdentity(state, identity) {
  state.profile = { ...(state.profile ?? {}), ...identity, named: true };
  return state.profile;
}

export function setPhilosophy(state, philosophyId) {
  state.profile = { ...(state.profile ?? {}), philosophy: philosophyId };
  return state.profile;
}

// The player's half of a rival duel. Handed to createBattle in the
// context so the engine stays a data consumer: it emits whatever barks it
// was given and has no opinion about who is talking.
export function duelBarks(state, content, rival) {
  const slots = {};
  for (const slot of ['intro', 'victory', 'defeat']) {
    const line = playerLine(state, content, slot, { rival: rival?.name });
    if (line) slots[slot] = line;
  }
  return slots;
}
