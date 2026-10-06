// R213 — A CHIMERA'S PORTRAIT, WEARING WHAT IT WON. Every screen that draws
// one of the player's chimeras draws it through `chimeraPortrait`, so a
// ribbon from the County Fair shows wherever the creature does: the Pens, the
// arena, the specimen card and the fair itself. Lazy with those screens; the
// renderer it wraps is untouched, and a creature with no ribbons draws
// exactly as it did. The rosettes' colours are data (data/fair.json).
//
// R214 — and wearing what it was dressed in: a dye and accessories from
// data/cosmetics.json, through render/cosmetics.js, on every one of those
// screens for the same reason.

import { creaturePortrait } from './renderer.js';
import { chimeraGenome } from '../splice/theater.js';
import { lookOpts } from './cosmetics.js';

// R114 — a save is untrusted input, and `?? []` does not guard a field that
// is present and not an array.
export const ribbonsOf = (chimera) => (Array.isArray(chimera?.ribbons) ? chimera.ribbons : []);

const STAR = '0,-11 3,-4 11,-4 5,1 7,9 0,4 -7,9 -5,1 -11,-4 -3,-4';

// One rosette, centred on (x, y) in the portrait's own coordinates: two
// tails, a pleated ring, and a star for Best in Show or a flag for the race.
export function rosette(ribbon, places, x, y) {
  const p = places?.[ribbon.place] ?? { color: '#b8b2a4', edge: '#6b665b' };
  const mark = ribbon.event === 'show'
    ? `<polygon points="${STAR}" fill="${p.edge}"/>`
    : `<path d="M-7 10 V-10 H8 V0 H-7" fill="none" stroke="${p.edge}" stroke-width="3" stroke-linejoin="round"/>`;
  return `<g class="ribbon" transform="translate(${x} ${y})">`
    + `<path d="M-12 18 L-22 62 L-10 54 L-4 64 L2 22 Z" fill="${p.color}" stroke="${p.edge}" stroke-width="3" stroke-linejoin="round"/>`
    + `<path d="M12 18 L22 62 L10 54 L4 64 L-2 22 Z" fill="${p.color}" stroke="${p.edge}" stroke-width="3" stroke-linejoin="round"/>`
    + `<circle r="28" fill="${p.color}" stroke="${p.edge}" stroke-width="8" stroke-dasharray="4 3"/>`
    + `<circle r="16" fill="#fffdf6" stroke="${p.edge}" stroke-width="3"/>${mark}</g>`;
}

// The newest three, pinned along the top right of the portrait.
export function chimeraPortrait(chimera, content, opts = {}) {
  const genome = chimeraGenome(chimera, content);
  const svg = creaturePortrait(genome, content, { ...opts, ...lookOpts(chimera, genome, content) });
  const ribbons = ribbonsOf(chimera).slice(0, 3);
  if (!ribbons.length) return svg;
  const places = content.fair?.ribbons?.places;
  const pinned = ribbons.map((r, i) => rosette(r, places, 185 - i * 62, -180)).join('');
  return svg.replace(/<\/svg>\s*$/, `<g class="ribbons">${pinned}</g></svg>`);
}
