// The story system (ROADMAP §3.8). Pure and DOM-free.
//
// §3.8 promised two things and delivered half of each: rivals carry a
// profile schema with monologue slots, and "the player profile uses the
// same schema… so the villain-monologue feature drops in later with zero
// refactoring." This is later.
//
// The design rule the whole module exists to enforce: a monologue slot is
// a KEY IN A JSON FILE and a caller, never an engine change. Adding a
// beat — a new taunt when something happens — must cost one line of data
// and one line at the site of the event. Everything here is lookup and
// substitution; nothing here decides anything.
//
// A philosophy is narrative only, and must stay that way. Anatomy is
// where this game keeps its mechanics; a stat bonus hiding inside a
// flavour menu would be exactly the invisible modifier the class triangle
// was built to replace.

import { rngStream, pick } from '../util/rng.js';

export const DEFAULT_PHILOSOPHY = 'improver';

export function philosophyList(content) {
  return Object.values(content.philosophies ?? {});
}

export function philosophyOf(state, content) {
  const id = state.profile?.philosophy ?? DEFAULT_PHILOSOPHY;
  return content.philosophies?.[id] ?? content.philosophies?.[DEFAULT_PHILOSOPHY] ?? null;
}

// Who the player is, as far as the story is concerned. An unnamed lab is
// still a lab — nothing in the game waits for the player to fill in a
// form, and the dossier simply says so until they do.
export function profileOf(state, content) {
  const philosophy = philosophyOf(state, content);
  return {
    named: !!state.profile?.named,
    title: state.profile?.title ?? 'Director',
    name: state.profile?.name ?? 'the Management',
    lab: state.profile?.lab ?? 'an unregistered barn',
    philosophy,
  };
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

// {rival} {creature} {node} {lab} {name}. An unknown placeholder is left
// alone rather than printed as "undefined" — a line with a typo in it
// should read oddly, not break.
export function fill(template, vars = {}) {
  if (!template) return null;
  return template.replace(/\{(\w+)\}/g, (whole, key) => (vars[key] != null ? String(vars[key]) : whole));
}

export function playerLine(state, content, slot, vars = {}) {
  const profile = profileOf(state, content);
  return fill(profile.philosophy?.monologue?.[slot], {
    lab: profile.lab,
    name: profile.name,
    ...vars,
  });
}

export function rivalLine(content, rivalId, slot, vars = {}) {
  const rival = content.rivals?.[rivalId];
  return fill(rival?.monologue?.[slot], { name: rival?.name, ...vars });
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
