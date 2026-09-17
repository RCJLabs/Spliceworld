// R114 — THE SAVE'S SHAPE, APPLIED AS REPAIR.
//
// `importSave` used to check five things — that the text is JSON, that it is
// an object, that the app id matches, that `saveVersion` is a number and that
// `seed` is one — and then hand the rest straight to the migrations. So
// `chimeras: "hello"` loaded. So did `funds: "lots"`, `ranch: null`,
// `funds: -999999` and `day: 1e308`.
//
// THE RULE HERE IS REPAIR, NEVER RESET. That is the Ascent rule, and it is why
// this module clamps and drops rather than refusing: a save that has picked up
// one bad field somewhere is still somebody's hundred hours, and the honest
// response is to fix the field and keep the run. `importSave` still refuses
// the handful of things that mean "this is not a Spliceworld save at all",
// because those are not damage — they are a different file.
//
// WHAT IT DOES NOT DO is check that ids exist in the content. That was in the
// entry, and it is wrong for this layer: a part renamed between builds would
// see a player's chimera DELETED by the thing meant to protect it. R79's
// catalogue already handles a retired id at the point of use, by declining to
// render rather than by destroying. This module is about shape, and shape only.
//
// Lazy on purpose. It sits behind the same door as `save/migrations.js` (R101)
// — the load path awaits it — so the fiftieth eager module stays the fiftieth.

import { safeText } from '../util/text.js';
import { newGameState } from './save.js';

// The keys that carry text a PERSON typed: their creatures' names, their lab,
// their own. Everything else a save holds as a string is an id, a timestamp or
// prose this repo wrote. Both lists matter, which is why they are two rules
// below rather than one.
export const NAME_KEYS = new Set([
  'name', 'lab', 'title', 'donorName', 'chimeraName', 'parentNames', 'nick',
]);

// How long a piece of typed text may be. `renameCreature` has capped a name at
// 24 since M3 and the card at 40; the longer of the two is the bound here,
// because this runs BEHIND those and must never truncate what they allowed.
const TEXT_LIMIT = 40;

// The numbers a screen divides by, counts up to, or draws a bar from. A bound
// is here only where being out of it would break a render or the arithmetic —
// this is not a balance table, and clamping a number the game itself produced
// would be a bug rather than a repair.
const BOUNDS = {
  funds: [0, 1e12],
  day: [0, 1e6],
  spliceCount: [0, 1e9],
  chimeraCount: [0, 1e6],
  renderCount: [0, 1e9],
  cardCount: [0, 1e9],
  sparCount: [0, 1e9],
  vatCount: [0, 1e9],
  rushCount: [0, 1e9],
  sentCount: [0, 1e9],
  resequenceCount: [0, 1e9],
};

// The lists whose entries a screen iterates and then reads fields off. A `7`
// in `chimeras` reaches every screen that reads `c.name`, and there is no
// render that survives it.
const ARRAY_OF_OBJECTS = new Set(['chimeras', 'stock', 'eggs', 'vials', 'parts', 'captives', 'containment', 'contested', 'loose', 'operations']);

// Angle brackets, everywhere. Measured before this was written: a day-60 save
// holds 3,120 strings and NOT ONE of them contains `<` or `>`. That is what
// licenses a rule about every string rather than a list of paths somebody has
// to keep current — the characters that open a tag have no legitimate place in
// a save, so removing them costs nothing and closes the fields nobody listed.
//
// Prose keeps its apostrophes. A captive's `koLine` reads "…collected by Dr.
// Mantissa's very patient interns", and `safeText` would eat that, which is
// exactly why the two rules are separate.
const detag = (v) => v.replace(/[<>]/g, '');

// A repair is `{ at, why }` — a field path and a reason ID, never a sentence.
// The sentence a player reads about it belongs in `data/copy.json` with the
// rest of the game's words (R110), and the scopecheck copy ledger says so out
// loud: the first draft of this module pushed English and the gate caught 23
// words of prose in a file with no business holding any.
export function cleanSave(save, { limit = TEXT_LIMIT } = {}) {
  const repairs = [];
  if (!save || typeof save !== 'object' || Array.isArray(save)) {
    return { save, repairs };
  }

  // 1. Every string, by the two rules above.
  const scrub = (node, path) => {
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      const at = path ? `${path}.${key}` : key;
      if (typeof value === 'string') {
        const clean = NAME_KEYS.has(key) ? safeText(value, limit) : detag(value);
        if (clean !== value) { node[key] = clean; repairs.push({ at, why: 'text' }); }
      } else if (Array.isArray(value)) {
        for (const [i, item] of value.entries()) {
          if (typeof item === 'string') {
            const clean = NAME_KEYS.has(key) ? safeText(item, limit) : detag(item);
            if (clean !== item) { value[i] = clean; repairs.push({ at: `${at}[${i}]`, why: 'text' }); }
          } else scrub(item, `${at}[${i}]`);
        }
      } else scrub(value, at);
    }
  };
  scrub(save, '');

  // 2. The containers a screen iterates, ALL THE WAY DOWN. A string where a
  //    list belongs is the `chimeras: "hello"` case and it takes out the Pens
  //    on the first paint; `campaign.captives: null` is the same defect one
  //    level in, and it takes out the War Room. The fuzz below found that one
  //    within a minute of first running, which is the whole argument for it —
  //    a top-level-only walk looks thorough and covers a fifth of the fields.
  //
  //    `newGameState` is the authority for the shape, so a field added to the
  //    save is covered the day it lands rather than the day somebody
  //    remembers to list it here. R39's rule, applied to the save.
  const shape = (want, got, path) => {
    for (const [key, wantAt] of Object.entries(want ?? {})) {
      const at = path ? `${path}.${key}` : key;
      const gotAt = got[key];
      if (Array.isArray(wantAt)) {
        if (!Array.isArray(gotAt)) { got[key] = []; repairs.push({ at, why: 'not-a-list' }); }
      } else if (wantAt !== null && typeof wantAt === 'object') {
        if (!gotAt || typeof gotAt !== 'object' || Array.isArray(gotAt)) {
          got[key] = structuredClone(wantAt); repairs.push({ at, why: 'not-an-object' });
        } else shape(wantAt, gotAt, at);
      } else if (typeof wantAt === 'number' && !Number.isFinite(gotAt)) {
        got[key] = wantAt; repairs.push({ at, why: 'not-a-number' });
      }
    }
  };
  shape(freshShape(), save, '');

  // 3. Rows that are not rows. A `7` in `chimeras` reaches every screen that
  //    reads `c.name`, and there is no render that survives it.
  const pruneRows = (node) => {
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (Array.isArray(value) && ARRAY_OF_OBJECTS.has(key)) {
        const kept = value.filter((row) => row && typeof row === 'object' && !Array.isArray(row));
        if (kept.length !== value.length) {
          node[key] = kept; repairs.push({ at: key, why: 'not-a-row', dropped: value.length - kept.length });
        }
        for (const row of node[key]) pruneRows(row);
      } else if (value && typeof value === 'object' && !Array.isArray(value)) pruneRows(value);
    }
  };
  pruneRows(save);

  // 4. The numbers, clamped into the range the screens can draw.
  const clamp = (node) => {
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      const bound = BOUNDS[key];
      if (bound && typeof value === 'number') {
        if (!Number.isFinite(value)) { node[key] = bound[0]; repairs.push({ at: key, why: 'not-a-number' }); continue; }
        const held = Math.min(Math.max(value, bound[0]), bound[1]);
        if (held !== value) { node[key] = held; repairs.push({ at: key, why: 'out-of-range' }); }
      } else if (value && typeof value === 'object') clamp(value);
    }
  };
  clamp(save);

  return { save, repairs };
}

// Read from the save module rather than restated here, so this cannot drift
// from what a new game actually produces: a field added to `newGameState` is
// covered the day it lands. Not a cycle — `save/save.js` awaits this module
// from inside its load path, long after its own evaluation has finished — and
// cached, because building a fresh state per field would be the most
// expensive thing in the boot.
let SHAPE = null;
function freshShape() {
  if (!SHAPE) SHAPE = newGameState();
  return SHAPE;
}
