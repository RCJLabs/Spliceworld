// R214 — WHAT A CHIMERA WEARS, DRAWN. A look from data/cosmetics.json turned
// into the two options the renderer takes: `dye`, a palette every part and
// the torso wear in place of their own, and `wear`, SVG in the head's own
// space, `front` over the head and `back` behind the torso. Read only by
// `chimeraPortrait` in render/ribbons.js, the one door every portrait of a
// chimera goes through. Lazy with the screens that draw one; pure, no DOM.
// A look is drawn and never counted: data/notes/cosmetics.md.

import { shapesToSVG } from './renderer.js';

// Which accessories share a place: one hat, one thing over the eye, one at
// the throat, one down the back.
export const slotOf = (row) => `${row.anchor}:${row.layer ?? 'front'}`;

// R114 — a save is untrusted input, so a look is read rather than trusted: a
// dye names a species with a palette or is ignored, and a worn id names a row
// or is skipped, one to a slot.
export function lookOf(chimera, content) {
  const look = chimera?.look;
  if (!look || typeof look !== 'object') return { dye: null, wear: [] };
  const dye = typeof look.dye === 'string' ? content.species?.[look.dye]?.palette ?? null : null;
  const rows = content.cosmetics?.accessories ?? [];
  const taken = new Set();
  const wear = [];
  for (const id of Array.isArray(look.wear) ? look.wear : []) {
    const row = rows.find((r) => r.id === id);
    if (row && !taken.has(slotOf(row))) { taken.add(slotOf(row)); wear.push(row); }
  }
  return { dye, wear };
}

// Where a head wears things. Generated heads declare it (tools/shapes.js);
// a hand-made one hangs everything off its near eye, the one thing every
// head in the county has.
export function anchorsOf(part) {
  if (part?.anchors) return part.anchors;
  const eye = (part?.shapes ?? []).filter((s) => s.type === 'circle' && s.fill === '@white' && s.stroke !== 'none')
    .sort((a, b) => b.r - a.r)[0] ?? { cx: 24, cy: -24, r: 10 };
  return { crown: [eye.cx - 4, Math.round(eye.cy - eye.r * 2.6), 26], eye: [eye.cx, eye.cy, eye.r], neck: [8, 10] };
}

// Each accessory at its anchor, scaled from the size its shapes were drawn
// for to the size of this head (`anchors` in data/cosmetics.json).
export function wearSVG(wear, head, content, palette) {
  if (!wear.length || !head) return null;
  const at = anchorsOf(head);
  const spec = content.cosmetics?.anchors ?? {};
  const out = { front: '', back: '' };
  for (const row of wear) {
    const a = spec[row.anchor] ?? {};
    const p = at[row.anchor];
    if (!p) continue;
    const size = (at[a.from ?? row.anchor] ?? p)[2] ?? a.unit ?? 30;
    const k = Math.min(a.max ?? 2, Math.max(a.min ?? 0.5, size / (a.unit || 30)));
    out[row.layer === 'back' ? 'back' : 'front'] += `<g class="wear wear-${row.id}" transform="translate(${p[0]} ${p[1]}) scale(${+k.toFixed(3)})">${
      shapesToSVG(row.shapes ?? [], palette)}</g>`;
  }
  return out;
}

// The renderer's two options for this chimera, or two nulls, which draw
// exactly what was drawn before there was a wardrobe.
export function lookOpts(chimera, genome, content) {
  const { dye, wear } = lookOf(chimera, content);
  const head = content.parts?.[genome?.parts?.head];
  return { dye, wear: wearSVG(wear, head, content, dye ?? content.species?.[head?.species]?.palette ?? {}) };
}
