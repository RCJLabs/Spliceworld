// R62 — the news wire, as a system. DOM-free.
//
// CLAUDE.md: "All content is data. Adding content must never require engine
// edits. If it does, the engine is wrong — fix the engine." The wire broke
// that outright: seventeen player-facing sentences were written inside
// campaign.js and rehab.js, so a new world-reaction was an engine change.
//
// The rule this module enforces is the one campaign/monologue.js already
// states for rivals — "a slot is a KEY IN A JSON FILE and a caller, never an
// engine change" — pointed at the campaign's own voice. Engines emit
// `{event, params}`. This looks the phrasing up in data/news.json and fills
// it. Nothing here writes a sentence, and nothing here decides anything.
//
// It found a bug on the way in. regions.json authors an `announce` line per
// threat rung, including a distinct one for Generation 3, and NOTHING read
// either: campaign.js pushed a hardcoded Gen 2 sentence for every rung-up,
// so a player reaching Gen 3 was told they had reached Gen 2 and the
// authored Gen 3 line had never once played. That is R57 and R58's shape —
// authored content with no reader — with the engine's own copy shouting over
// it. `threat_rung` now prints what the data says.

import { rngStream, hashString } from '../util/rng.js';
import { fill, philosophyOf, DEFAULT_PHILOSOPHY } from './monologue.js';

const WIRE_KEEP = 12;

// The wire itself. Lives here rather than in campaign.js so that "what the
// world says" is one module, and the engine's job is to say WHAT HAPPENED.
export function pushNews(state, line) {
  if (!line) return;
  state.news.push(line);
  if (state.news.length > WIRE_KEEP) state.news.splice(0, state.news.length - WIRE_KEEP);
}

export function newsEvents(content) {
  return content.news ?? {};
}

// Which pool an event draws from: the player's philosophy first, so the
// world reacts differently to a Naturalist than to an Engineer, then the
// general one. The ids here are philosophies.json's ids — the first draft
// keyed on 'purist' and 'chimerist', which exist nowhere, so the weighting
// had never fired and its gate did not notice because it took the authored
// key as the profile instead of asking whether the key was real. A philosophy with nothing to say about an event is the normal case.
export function poolFor(state, content, event) {
  const spec = newsEvents(content)[event];
  if (!spec) return null;
  const id = state?.profile?.philosophy ?? DEFAULT_PHILOSOPHY;
  const mine = spec.by?.[id];
  return mine?.length ? mine : (spec.lines ?? null);
}

// The line for an event, filled. Seeded on the params rather than on a
// counter: the same event about the same node always reads the same way, so
// a reload cannot reroll the wire, and no save field had to be invented to
// hold a position. Different nodes still get different phrasings, which is
// the whole point of a pool.
//
// The seed alone was not enough. An event with no params — a spar, the
// county holding — hashes to the same position every time, so a pool of
// three authored phrasings printed one of them for the life of the save and
// the other two had never once played. So a repeat rotates: while the last
// telling of this exact event is still on the wire, the next telling moves
// to the next phrasing. Still a function of the save, still no new field,
// and the wire stops saying the same sentence twice in a row.
export function newsFor(state, content, event, params = {}) {
  const pool = poolFor(state, content, event);
  if (!pool?.length) return null;
  const rng = rngStream(state?.seed ?? 0, `news:${event}`, hashString(JSON.stringify(params)));
  const base = Math.floor(rng() * pool.length) % pool.length;
  const wire = state?.news ?? [];
  const repeats = pool.filter((line) => wire.includes(fill(line, params))).length;
  return fill(pool[(base + repeats) % pool.length], params);
}

// What an engine calls: say what happened, not what to print.
export function emitNews(state, content, event, params = {}) {
  const line = newsFor(state, content, event, params);
  pushNews(state, line);
  return line;
}

// Every placeholder a piece of copy asks for. The gate reads this to check
// that an emitter actually supplies what its line needs — copy that says
// {node} and an emitter that passes `nodeName` is a sentence with a hole in
// it, and the fill leaves the hole visible rather than crashing.
export function placeholdersIn(line) {
  return [...String(line).matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
}
