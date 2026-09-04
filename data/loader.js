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
const CORE = ['frames', 'parts', 'species', 'combos', 'enemies', 'keywords', 'regions', 'traits', 'classes', 'rivals', 'director', 'facility', 'philosophies', 'operations', 'chaos', 'temperament', 'scars', 'guides', 'resequencer', 'training', 'gauntlet', 'news', 'breakout'];

// …and everything it needs before it can draw one.
const GEOMETRY = ['parts-shapes', 'enemies-shapes'];

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
