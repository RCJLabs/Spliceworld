// R96 — a chimera's MOOD, and the marks a career leaves on it.
//
// Split out of the renderer for the reason R167 split the move descriptions:
// `render/renderer.js` is compiled before the first paint because the Ranch
// draws stock animals on it, and a stock animal has neither a temperament nor
// a scar. Only the Pens card and the arena do — `splice/pens-ui.js` and
// `battle/ui.js`, both lazy since R74 — so this half is loaded by the screens
// that need it and by nobody else. The eager renderer keeps only the four
// lines that APPLY what this returns.

// POSTURE. Temperament has been two numbers and a caption since R13:
// the creature that "fights harder cornered" stood exactly like the one that
// is "hard to hit on the opening exchange". The deltas are DATA
// (`temperament.json`'s `posture`), keyed by the same bands `describe()`
// names, so a stance and the sentence under it can never disagree — and they
// ride the sockets the FRAME already positions, so a new frame inherits
// posture without a line of posture work.
function bandOf(value, at) {
  return value >= at ? 'high' : value <= -at ? 'low' : 'mid';
}

export function postureOf(temperament, content) {
  const spec = content?.temperamentPosture;
  if (!spec || !temperament) return null;
  const at = content.temperamentMeta?.expressAt ?? 30;
  const out = {};
  for (const axis of ['nerve', 'temper']) {
    const deltas = spec[axis]?.[bandOf(temperament[axis] ?? 0, at)];
    if (!deltas) continue;
    for (const [part, d] of Object.entries(deltas)) {
      const acc = (out[part] ??= { dx: 0, dy: 0, angle: 0, scale: 1 });
      acc.dx += d.dx ?? 0;
      acc.dy += d.dy ?? 0;
      acc.angle += d.angle ?? 0;
      acc.scale *= d.scale ?? 1;
    }
  }
  if (!Object.keys(out).length) return null;
  const asTransforms = {};
  for (const [part, d] of Object.entries(out)) {
    const t = postureTransform(d);
    if (t) asTransforms[part] = t;
  }
  return Object.keys(asTransforms).length ? asTransforms : null;
}

// Rendered to a transform string HERE, so the eager renderer keeps nothing
// but the interpolation. Composed outside the socket transform, never folded
// into it: a socket is where the frame says a limb attaches, and a mood is
// not allowed to move it.
function postureTransform(d) {
  if (!d) return '';
  const t = [];
  if (d.dx || d.dy) t.push(`translate(${d.dx} ${d.dy})`);
  if (d.angle) t.push(`rotate(${d.angle})`);
  if (d.scale !== 1) t.push(`scale(${Math.round(d.scale * 1000) / 1000})`);
  return t.join(' ');
}

// SCARS. Ten types, every one of them text beside a static portrait
// since R13. Which mark a scar wears is content (`scars.json`); the four
// marks themselves are overlay chrome, drawn in torso space and clipped to
// the silhouette exactly as R85's dirt is. Placement is seeded off the scar
// id rather than authored, so a new scar costs one word of data.
const SCAR_MARKS = {
  slash: { d: 'M-22 -7 L22 7', w: 7, c: '#7c4a3e' },
  notch: { d: 'M-9 -13 L2 0 L-9 13', w: 6, c: '#6d4235' },
  stitch: { d: 'M-18 0 L18 0 M-11 -7 L-11 7 M0 -7 L0 7 M11 -7 L11 7', w: 5, c: '#5f4a54' },
  patch: { d: 'M-15 -11 L15 -11 L15 11 L-15 11 Z', w: 5, c: '#6b5a46' },
  flinch: { d: 'M-12 -10 L-2 -2 L-12 6 M4 -8 L14 0 L4 8', w: 5, c: '#6a5570' },
};
const SCAR_SPOTS = [
  { x: -46, y: -16 }, { x: 30, y: -26 }, { x: -22, y: 30 },
  { x: 44, y: 18 }, { x: -52, y: 12 }, { x: 8, y: -6 },
];

export function scarOverlay(scarIds, content) {
  if (!scarIds?.length) return '';
  const out = [];
  for (const id of scarIds) {
    const kind = SCAR_MARKS[content?.scars?.[id]?.mark];
    if (!kind) continue; // unknown or unmarked scar: the caption still says it
    // Seeded by the id's own characters — the same scar sits in the same
    // place on every screen that draws the creature, with no state to store.
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    const spot = SCAR_SPOTS[h % SCAR_SPOTS.length];
    const angle = (h >> 5) % 60 - 30;
    out.push(
      `<path d="${kind.d}" fill="none" stroke="${kind.c}" stroke-width="${kind.w}" ` +
      `stroke-linecap="round" stroke-linejoin="round" opacity="0.72" ` +
      `transform="translate(${spot.x} ${spot.y}) rotate(${angle})"/>`
    );
  }
  return out.join('');
}


// What the two screens actually call: everything the renderer needs to draw
// this creature's state, in the shape `creaturePortrait` takes it.
export function moodOf(chimera, content) {
  return {
    posture: postureOf(chimera?.temperament, content),
    scarMarks: scarOverlay(chimera?.scars, content),
  };
}
