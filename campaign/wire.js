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

import { fill, pickPooled, DEFAULT_PHILOSOPHY } from './monologue.js';

const WIRE_KEEP = 12;

// The wire itself. Lives here rather than in campaign.js so that "what the
// world says" is one module, and the engine's job is to say WHAT HAPPENED.
export function pushNews(state, line) {
  if (!line) return;
  state.news.push(line);
  if (state.news.length > WIRE_KEEP) state.news.splice(0, state.news.length - WIRE_KEEP);
  // R109 — THE WIRE IS TWELVE LINES LONG AND THE QUESTION IS ABOUT FIVE
  // THOUSAND. Every line the world says goes past here and then falls off the
  // end, so nothing in the tree could answer "what does a campaign actually
  // sound like" — the audit that queued this milestone had to guess, and
  // guessed 4,034 lines from 181 phrasings against a measured 4,697 from 85.
  //
  // Only the harness ever sets this. It is a `__` field, which `campaignWalk`
  // strips from the save it returns for exactly the reason R91 gives: a
  // fixture carrying scratch fields measures a save no player has. A browser
  // never creates it, so a player pays one `if` per line for it.
  if (state.__wire) state.__wire.push(line);
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

// R109 — A CURSOR PER EVENT, SO A POOL EMPTIES ITSELF BEFORE IT REPEATS.
//
// What this replaces rotated only while the last telling was still on the
// wire — twelve lines against twenty-six a day, so it almost never fired —
// and fell back to a seed hashed from the PARAMS, which pins an event whose
// params repeat to one variant for the life of the save.
//
// `wireAt` holds the next index per event and every telling advances it, so
// a pool of five is heard five times before any line is heard twice. The
// seed chooses only where each save OPENS each pool. Bounded by the event
// count (R91's rule) rather than by a window somebody has to pick a length
// for, and it is in the save, so a reload replays the wire rather than
// rerolling it. Two earlier drafts rolled instead of remembering and both
// made it worse; ROADMAP R109 has them and the numbers.
export function newsFor(state, content, event, params = {}) {
  const pool = poolFor(state, content, event);
  if (!pool?.length) return null;
  return fill(pickPooled(state, `news:${event}`, pool), params);
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
