// R90 — ONE RECIPE PER FIXTURE, IN ONE FILE.
//
// `tools/a11y.js` and `tools/handlers.js` each built a laboratory to walk,
// and they built the SAME one: the same six graded parts, the same
// cobra/bear/goat grade map, the same socket-numbering loop that turns a
// slot into `hide`, `hide2`, `hide3`, the same herd of three, the same slice
// of the Dex. They differed by an id prefix — `a11y-` against `h-` — and by
// what each gate then piled on top.
//
// That is the duplication R90 names, and it is the expensive kind: R85 found
// the content-file list in six places, where a file missing from one copy
// came back `undefined` and the system quietly ran on fallback tuning. A
// fixture is worse, because a fixture that drifts does not fail — it goes on
// measuring a laboratory no player will ever open.
//
// So the CORE lives here once and the gates keep their own extras, which
// are not duplication: the feral twin exists for the Pens' alert, the loose
// specimen for the Labs tab's Hunt button, the second egg for the Ranch's
// Hurry button. Each appears in exactly one file, which is the rule.
import { readFileSync, existsSync, mkdirSync, writeFileSync, renameSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
// Static, and therefore SYNCHRONOUS. These were dynamic imports at first,
// which made every fixture async — and `tools/handlers.js` builds its
// laboratory inside a plain `(now) => {}`, so an async recipe would have
// rippled through a walk that has no other reason to await anything. A tool
// pays no page weight for an import; the browser never loads this file.
import { indexContent } from '../render/renderer.js';
import { CONTENT_FILES } from '../data/loader.js';
import { newGameState, SAVE_VERSION } from '../save/save.js';
import { spliceChimera } from '../splice/theater.js';
import { createAnimal } from '../ranch/ranch.js';
import { loadSimContent, campaignWalk } from './sim.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// R91 — THE CACHE HAS TO KNOW WHICH GAME IT WALKED.
//
// `walkedSave` is keyed by seed and day count and stored in the system temp
// directory, which is shared by every copy of the tree — including the ones
// `tools/battery.js` makes when it breaks a file on purpose. A break in
// engine code would therefore be answered from a cache built by the
// UNBROKEN tree, and the gate would come back green on a game it never ran:
// a MISSED break that looks like coverage. R89's height gate has sat on this
// since it started using the cache; it only escaped because its breaks are
// in rendering, which the cached save does not decide.
//
// So the key carries the game too. Cheap and honest: hash every module and
// data file the walk can reach.
//
// R92 — AND THE WALKER ITSELF. R91 wrote this as "everything outside
// `tools/`, which cannot change what a campaign does", and `tools/sim.js`
// IS the campaign: it decides every action the walk takes. Teaching it to
// run the Resequencer changed the day-180 save completely and the cache
// handed the height gate the old one, so a screen was measured against a
// save no version of the game would now produce. The excluded directory was
// right about the GATES in it and wrong about the two files that build the
// thing being cached.
const WALK_FILES = ['sim.js', 'fixtures.js'];
let stampCache = null;
function sourceStamp() {
  if (stampCache) return stampCache;
  const h = createHash('sha256');
  const walkTools = (dir) => {
    for (const name of WALK_FILES) {
      try { h.update(name).update(readFileSync(join(dir, name))); } catch { /* not there yet */ }
    }
  };
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      // `tools/` holds the gates, which cannot change a campaign — except
      // for the two files that ARE the campaign and the fixture.
      if (dir === root && e.name === 'tools') { walkTools(join(dir, e.name)); continue; }
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js') || e.name.endsWith('.json')) h.update(e.name).update(readFileSync(p));
    }
  };
  walk(root);
  stampCache = h.digest('hex').slice(0, 12);
  return stampCache;
}

// The content index, built from the list the GAME loads rather than a
// seventh hand-written copy of it (R85's rule). Cached: every tool that
// wants a fixture wants content first, and re-reading 30 JSON files per
// caller is pure waste in a suite that is trying to get under three minutes.
let contentCache = null;
export function fixtureContent() {
  if (contentCache) return contentCache;
  contentCache = indexContent(Object.fromEntries(
    CONTENT_FILES.map((n) => [n, JSON.parse(readFileSync(join(root, 'data', `${n}.json`), 'utf8'))])
  ));
  return contentCache;
}

// THE LABORATORY BOTH WALKING GATES START FROM. A Theater built out, one
// finished six-socket chimera, spare parts to splice a second, three animals
// in the pen and enough Dex to draw its strips.
//
// `prefix` only names the ids. It is a parameter because the two callers
// have always used different ones and an id is not a fixture decision —
// making them share one would change what every gate reports for no reason
// beyond tidiness.
export function labCore({
  now, prefix = 'fx', funds = 20000,
  // The Theater is all any caller has ever needed to SPLICE; a gate that
  // walks the Containment bay or the incubator says so by naming the tracks
  // it needs, rather than every caller carrying every track forever.
  facility = { theater: 2 },
  spares = [['goat_head', 'standard'], ['bear_organ', 'prime'], ['cobra_tail', 'apex']],
} = {}) {
  const content = fixtureContent();

  const s = { ...newGameState(), seed: 4242, funds, saveVersion: SAVE_VERSION };
  s.lastTickAt = now;
  s.facility = { ...facility };

  // The grade map is the fixture's one real opinion: an apex head so a grade
  // multiplier is exercised, a prime hindlimb so two tiers are in play, and
  // standard everywhere else so the baseline is the baseline.
  const grades = {
    cobra_head: 'apex', bear_forelimbs: 'standard', goat_hindlimbs: 'prime',
    cobra_organ: 'standard', bear_hide: 'standard', goat_tail: 'standard',
  };
  for (const [pid, grade] of Object.entries(grades)) {
    s.inventory.parts.push({
      id: `${prefix}-${pid}`, partId: pid, grade,
      donor: { name: 'Donor', species: pid.split('_')[0], stars: 3, extractedAt: now },
    });
  }
  // Slot to socket: a second hide is `hide2`, a third `hide3`. Written once
  // here because both gates had their own copy of this loop and a socket
  // scheme that drifted between them would be invisible until a splice
  // silently landed a part somewhere else.
  const used = new Set();
  const slots = Object.fromEntries(Object.keys(grades).map((pid) => {
    const slot = content.parts[pid].slot;
    let socket = slot;
    let n = 2;
    while (used.has(socket)) socket = `${slot}${n++}`;
    used.add(socket);
    return [socket, `${prefix}-${pid}`];
  }));
  const made = spliceChimera(s, 'M', slots, content, now);
  if (!made.ok) throw new Error(`fixture splice failed: ${made.msg}`);

  // Spares, so the Theater has something to build a second creature from.
  for (const [pid, grade] of spares) {
    s.inventory.parts.push({
      id: `${prefix}-spare-${pid}`, partId: pid, grade,
      donor: { name: 'Spare', species: pid.split('_')[0], stars: 2, extractedAt: now },
    });
  }
  s.ranch = { ...s.ranch, stock: [], penCapacity: 8, animalCount: 0, seeded: true };
  // R131 — NINE ANIMALS AND A DEEP BAY, so the fixture reaches the state the
  // pager exists for. Three animals and three spare parts never produced a
  // "show 8 more" button anywhere, and R76's rule is that a `data-*` the game
  // paints has had a handler RUN — a control the fixture cannot reach is a
  // control no gate has ever pressed. R99 spent a milestone on exactly this
  // shape of blindness; nine is one over the page so the button appears with
  // one row behind it, which is the smallest honest version of the state.
  for (const sp of ['goat', 'bear', 'cobra', 'goat', 'bear', 'cobra', 'goat', 'bear', 'cobra']) {
    s.ranch.stock.push(createAnimal(s, sp, content, now));
  }
  // …and one species bay with more parts than a page holds, which is the
  // Vault's half of the same rule. Goat, because the fixture already owns
  // goat anatomy and a bay the player recognises beats an arbitrary one.
  const goatParts = Object.values(content.parts).filter((pt) => pt.species === 'goat').slice(0, 9);
  for (const [i, pt] of goatParts.entries()) {
    s.inventory.parts.push({
      id: `${prefix}-bay-${i}`, partId: pt.id, grade: 'standard',
      donor: { name: 'Bulk order', species: 'goat', stars: 2, extractedAt: now },
    });
  }
  s.dex = {
    parts: Object.keys(content.parts).slice(0, 8),
    enemies: Object.keys(content.enemies).slice(0, 4),
    beaten: Object.keys(content.enemies).slice(0, 2),
    traits: Object.keys(content.traits ?? {}).slice(0, 2),
    variants: [],
  };
  s.discoveredCombos = Object.keys(content.combos).slice(0, 3);
  s.chimeras[0].settleUntil = now - 1000;
  return { s, content, chimera: made.chimera };
}

// R89/R101 — the save a 180-day campaign ends on, which is what the height
// budget and any at-scale question needs. CACHED ON DISK because the walk
// costs about fifteen seconds and is perfectly deterministic from its seed:
// every gate that wants one was paying that separately.
// R132 — WRITE, THEN RENAME. The cache is keyed by a hash of the source, so
// the parallel battery's workers running gates over identical trees all aim
// at the same file at the same time. `writeFileSync` truncates first, and a
// reader that arrives mid-write gets half a save: `walkedSave` catches the
// parse and rebuilds, so the answer stays right, but a rename is atomic and
// costs nothing — every reader sees the whole old file or the whole new one.
function writeCache(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

// R95 — WHERE THE CACHE LIVES, so a caller that already has the walk can put
// it there. `tools/coverage.js` runs a FULL walk of seed 2026 (it needs the
// verb tally, which a save does not carry) and `tools/reach.js` then asked
// `walkedSave` for the same seed and walked it again — the same campaign,
// twice, in one suite job. One line of sharing is worth ten seconds of the
// suite's wall clock, and the two gates now genuinely walk seven campaigns
// between them rather than eight.
function cacheFile(seed, days) {
  return join(join(tmpdir(), 'sw-walk-cache'), `walk-${seed}-${days}-${sourceStamp()}.json`);
}

// Hand a walk you have already done to whoever asks for it next. Silent on
// failure for the same reason `walkedSave` is: a cache that cannot be
// written is a slower answer, never a wrong one.
export function primeWalkCache(save, { seed = 2026, days = 180 } = {}) {
  try {
    mkdirSync(join(tmpdir(), 'sw-walk-cache'), { recursive: true });
    writeCache(cacheFile(seed, days), JSON.stringify(withGuidesRead(save)));
  } catch { /* not fatal, ever */ }
}

// A player this far in has met every system, so every first-use field guide
// has been read. Without this the guide dialog covers the screen and a
// browser gate measures the DIALOG — which is exactly what R89's first
// measurement did.
function withGuidesRead(save) {
  save.guidesSeen = JSON.parse(readFileSync(join(root, 'data', 'guides.json'), 'utf8')).guides.map((g) => g.id);
  return save;
}

// R156 — WAS THIS RUN'S CACHE WARM? A suite that rebuilds every 180-day walk
// costs 15% more than one that reads them back (736 CPU-seconds against 639,
// measured back to back in one window), and nothing anywhere said which kind
// of run a reading was. A budget compared across runs without that fact is
// comparing two different amounts of work — and the 30% "machine drift" R153
// recorded was measured across exactly that boundary, because the cache key
// includes every game file, so any milestone that edits one starts cold.
export function walkCacheState({ days = 180, seeds = [2026] } = {}) {
  const dir = join(tmpdir(), 'sw-walk-cache');
  let hits = 0;
  for (const seed of seeds) if (existsSync(cacheFile(seed, days))) hits++;
  return { dir, hits, of: seeds.length, warm: hits === seeds.length };
}

export function walkedSave({ days = 180, seed = 2026, fresh = false } = {}) {
  const cache = join(tmpdir(), 'sw-walk-cache');
  const file = cacheFile(seed, days);
  if (!fresh && existsSync(file)) {
    try { return JSON.parse(readFileSync(file, 'utf8')); } catch { /* rebuild it */ }
  }
  const save = campaignWalk(loadSimContent(), { seed, days, stopAtDominion: false }).save;
  withGuidesRead(save);
  try {
    mkdirSync(cache, { recursive: true });
    writeCache(file, JSON.stringify(save));
  } catch { /* a cache that cannot be written is still a correct answer */ }
  return save;
}
