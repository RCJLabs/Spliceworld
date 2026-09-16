// R105 — THE HEADER'S SKY, and the reason it is not in the boot graph.
//
// This module is loaded AFTER the first paint, by a dynamic import in
// main.js. That is not a micro-optimisation, it is the budget: R105 started
// from 48 eager modules of 49, 311.2 KB of eager code of 314 and 1,029 KB of
// first paint of 1,034. A sky is chrome — nobody is waiting on it to know
// what their goat is doing — and `tools/boot.js` exists to keep geometry out
// of the player's way. `campaign/calendar.js` IS eager, because the husbandry
// numbers it scales are read inside `tickWorld`, which boot runs on the first
// frame. The split follows the arithmetic.
//
// PROCEDURAL SVG, no assets — CLAUDE.md's rule, and here it is also the only
// option that could fit. The whole sky is four shapes and a tint.
//
// THE TINT IS HEADER-ONLY AND THAT IS LOAD-BEARING. Five themes ship, and a
// dusk that reached into the theme tokens would make Blueprint at 7 p.m. a
// sixth theme nobody designed. It is an overlay inside the <header> element,
// so every theme stays itself and simply has an evening.

// A cloud is three circles; the seeded x/y keep a foggy day overcast all day
// rather than reshuffling on every render.
function clouds(n, rng) {
  let out = '';
  for (let i = 0; i < n; i++) {
    const x = 6 + rng() * 88;
    const y = 8 + rng() * 26;
    const r = 5 + rng() * 6;
    out += `<g opacity="${(0.18 + rng() * 0.22).toFixed(2)}" fill="currentColor">`
      + `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"/>`
      + `<circle cx="${(x + r * 0.9).toFixed(1)}" cy="${(y + 2).toFixed(1)}" r="${(r * 0.75).toFixed(1)}"/>`
      + `<circle cx="${(x - r * 0.8).toFixed(1)}" cy="${(y + 2.5).toFixed(1)}" r="${(r * 0.65).toFixed(1)}"/>`
      + '</g>';
  }
  return out;
}

// `sky` is whatever `skyOf` returned — this module does no time arithmetic of
// its own, so there is exactly one answer to "what hour is it" in the tree.
export function skySvg(sky, rng) {
  const x = 4 + sky.bodyX * 92;
  const y = 40 - sky.bodyY * 26;
  const body = sky.body === 'moon'
    // A crescent is one circle with another bitten out of it — cheaper than a
    // path and it scales with the header.
    ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="currentColor" opacity="0.85"/>`
      + `<circle cx="${(x + 2.4).toFixed(1)}" cy="${(y - 1.6).toFixed(1)}" r="4.4" fill="var(--sky-cut, #000)" opacity="0.9"/>`
    : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="currentColor" opacity="0.9"/>`;
  return `<svg class="sky" viewBox="0 0 100 46" preserveAspectRatio="none" aria-hidden="true" focusable="false">`
    + `${body}${clouds(sky.clouds, rng)}</svg>`;
}

// Paint it into the header, under the title. Idempotent: called again on the
// next render it replaces its own node rather than stacking, which is the bug
// every "just append it" header decoration ships with.
export function paintSky(header, sky, rng) {
  if (!header) return null;
  let layer = header.querySelector('.sky-layer');
  if (!layer) {
    layer = header.ownerDocument.createElement('div');
    layer.className = 'sky-layer';
    // First child, so the title and tagline paint over it.
    header.insertBefore(layer, header.firstChild);
  }
  layer.innerHTML = skySvg(sky, rng);
  layer.style.setProperty('--sky-tint', sky.tint);
  layer.style.setProperty('--sky-alpha', String(sky.alpha));
  // The band is on the element so style.css can reach it without this module
  // knowing any colours — the data owns those.
  layer.dataset.band = sky.band;
  return layer;
}
