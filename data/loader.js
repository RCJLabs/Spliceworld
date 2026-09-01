// Browser-side content loader. Node tools read the JSON straight from disk
// and call indexContent themselves — keep fetch out of the engine.

import { indexContent } from '../render/renderer.js';

export async function loadContent(base = '.') {
  const files = ['frames', 'parts', 'species', 'combos', 'enemies', 'keywords', 'regions', 'traits', 'classes', 'rivals', 'director', 'facility', 'philosophies', 'operations', 'chaos', 'temperament', 'scars', 'guides', 'resequencer', 'training', 'gauntlet'];
  // Keyed by name, not destructured by position. R41's training.json was
  // added to the list, fetched, and silently DROPPED — the positional
  // destructure had nineteen names for twenty files, and nothing errors
  // when a destructure comes up short. The browser then ran on the
  // fallback tuning and told a level-0 chimera it was a finished veteran.
  const loaded = await Promise.all(
    files.map(async (name) => {
      const res = await fetch(`${base}/data/${name}.json`);
      if (!res.ok) throw new Error(`Failed to load data/${name}.json (${res.status})`);
      return res.json();
    })
  );
  return indexContent(Object.fromEntries(files.map((name, i) => [name, loaded[i]])));
}
