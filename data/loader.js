// Browser-side content loader. Node tools read the JSON straight from disk
// and call indexContent themselves — keep fetch out of the engine.
//
// R81 — TWO ROUNDS, because the first paint was waiting on 400 KB of
// geometry it did not need. `parts[].shapes` and `enemies units[].shapes`
// were 69% and 73% of their files and half of everything the game
// downloads, and both are read by `render/renderer.js` and by nothing else.
// So the shell boots on the half that decides what things ARE, and the half
// that decides what they LOOK LIKE arrives behind it.

import { indexContent, attachShapes } from '../render/renderer.js';

// Everything the game needs to know before it can show you anything.
export const CORE = ['frames', 'parts', 'species', 'combos', 'enemies', 'keywords', 'regions', 'traits', 'classes', 'rivals', 'director', 'facility', 'philosophies', 'operations', 'chaos', 'temperament', 'scars', 'guides', 'resequencer', 'training', 'gauntlet', 'news', 'breakout', 'feral', 'rush'];

// …and everything it needs before it can draw one.
export const GEOMETRY = ['parts-shapes', 'enemies-shapes'];

// R85 — and both halves together, for the Node tools.
//
// Every tool that scores this game builds its own `content`, and until now
// each one did it from its own hand-written list of file names: smoke had
// two, sim, roadmap, handlers and the break battery one each. Six lists for
// one set of files, so shipping `feral.json` meant editing six places and
// the failure mode for missing one was not an error — it was `content.feral`
// coming back undefined and the tuning silently falling back to its
// defaults. That is R41's training.json bug (nineteen names for twenty
// files, and the browser ran on fallback tuning for a milestone) with the
// blast radius spread across the toolchain.
//
// This is the list the GAME loads, so a tool built from it is by definition
// scoring the same content the player has. R81's lesson, again: derive it,
// do not name it.
export const CONTENT_FILES = [...CORE, ...GEOMETRY];

async function grab(base, name) {
  const res = await fetch(`${base}/data/${name}.json`);
  if (!res.ok) throw new Error(`Failed to load data/${name}.json (${res.status})`);
  return res.json();
}

export async function loadContent(base = '.') {
  // Keyed by name, not destructured by position. R41's training.json was
  // added to the list, fetched, and silently DROPPED — the positional
  // destructure had nineteen names for twenty files, and nothing errors
  // when a destructure comes up short. The browser then ran on the
  // fallback tuning and told a level-0 chimera it was a finished veteran.
  const loaded = await Promise.all(CORE.map((name) => grab(base, name)));
  return indexContent(Object.fromEntries(CORE.map((name, i) => [name, loaded[i]])));
}

// The second round. Merged onto the very objects the shapes came off, so
// every reader in the game is unchanged and simply starts working.
//
// A failure here is NOT a boot failure: the game is fully playable with no
// portraits — every stat, every timer, every fight still works, and the
// renderer draws "developing" where a creature would be. So this rejects
// nothing and returns whether it landed, and the shell decides what to say.
export async function loadShapes(content, base = '.') {
  try {
    const files = await Promise.all(GEOMETRY.map((name) => grab(base, name)));
    attachShapes(content, Object.fromEntries(GEOMETRY.map((name, i) => [name, files[i]])));
    return true;
  } catch {
    return false;
  }
}
