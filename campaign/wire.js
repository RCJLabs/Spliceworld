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
// The rule this replaces rotated "while the last telling of this exact event
// is still on the wire". The wire keeps twelve lines and a campaign says
// twenty-six a day, so a telling is off the end in under half a day and the
// rotation almost never fired. What was left was the seed: `base` is hashed
// from the PARAMS, so an event whose params repeat — three operations, five
// rivals — picks the same variant every time for the life of the save.
//
// Measured on the five-line `op_failed` pool the moment it existed: 724
// tellings, three distinct operations, one phrasing took 256 of them and two
// were never heard at all. Authoring more variants into that is authoring
// more silence, which is why this comes before the writing.
//
// TWO DRAFTS FAILED BEFORE THIS ONE, and both failed the same way — they
// left the CHOICE to a roll instead of to memory.
//
//   1. A seeded roll per telling. `rngStream` is re-seeded from its
//      arguments on every call, so a stream keyed on the window's LENGTH
//      returns the same first number forever once that length pins at its
//      cap. It picked the same slot every time and took the distinct count
//      DOWN, 107 to 102.
//   2. A global no-repeat window of the last twenty phrasings — which is
//      what the milestone entry asks for, and it does not work on its own.
//      Twenty lines is eighteen hours of wire, so a busy event's own keys
//      fall out of the window between tellings, every variant reads as
//      unseen, and the pick lands on the same one again. 101 distinct.
//
// So the memory is PER EVENT and it is a cursor, not a history: `wireAt`
// holds the next index for each event, and every telling advances it. A pool
// of five is heard five times before any line is heard twice, exactly, with
// no randomness in the rotation at all. The seed still chooses where each
// save STARTS in each pool, so two campaigns do not open the same event on
// the same sentence.
//
// It is bounded by the number of events (R91's rule) rather than by a window
// somebody has to pick a length for, and it is in the save, so a reload
// replays the wire rather than rerolling it.
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
