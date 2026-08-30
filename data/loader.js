// Browser-side content loader. Node tools read the JSON straight from disk
// and call indexContent themselves — keep fetch out of the engine.

import { indexContent } from '../render/renderer.js';

export async function loadContent(base = '.') {
  const files = ['frames', 'parts', 'species', 'combos', 'enemies', 'keywords', 'regions', 'traits', 'classes', 'rivals', 'director', 'facility', 'philosophies', 'operations', 'chaos', 'temperament'];
  const [frames, parts, species, combos, enemies, keywords, regions, traits, classes, rivals, director, facility, philosophies, operations, chaos, temperament] = await Promise.all(
    files.map(async (name) => {
      const res = await fetch(`${base}/data/${name}.json`);
      if (!res.ok) throw new Error(`Failed to load data/${name}.json (${res.status})`);
      return res.json();
    })
  );
  return indexContent({ frames, parts, species, combos, enemies, keywords, regions, traits, classes, rivals, director, facility, philosophies, operations, chaos, temperament });
}
