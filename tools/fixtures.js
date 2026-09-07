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
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
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
  for (const sp of ['goat', 'bear', 'cobra']) s.ranch.stock.push(createAnimal(s, sp, content, now));
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
export function walkedSave({ days = 180, seed = 2026, fresh = false } = {}) {
  const cache = join(tmpdir(), 'sw-walk-cache');
  const file = join(cache, `walk-${seed}-${days}.json`);
  if (!fresh && existsSync(file)) {
    try { return JSON.parse(readFileSync(file, 'utf8')); } catch { /* rebuild it */ }
  }
  const save = campaignWalk(loadSimContent(), { seed, days, stopAtDominion: false }).save;
  // A player this far in has met every system, so every first-use field
  // guide has been read. Without this the guide dialog covers the screen and
  // a browser gate measures the DIALOG — which is exactly what R89's first
  // measurement did.
  save.guidesSeen = JSON.parse(readFileSync(join(root, 'data', 'guides.json'), 'utf8')).guides.map((g) => g.id);
  try {
    mkdirSync(cache, { recursive: true });
    writeFileSync(file, JSON.stringify(save));
  } catch { /* a cache that cannot be written is still a correct answer */ }
  return save;
}
