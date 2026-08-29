// Procedural shape library for creature parts (Wave 1).
//
// Hand-drawing 150 parts at a consistent quality is not tractable, so parts
// are built from archetype families parameterised per species. This is a DEV
// tool: it emits plain JSON into data/parts.json, which the game loads with
// no build step. Style contract (see data/parts.json _doc): thick @outline
// strokes on masses, thinner on detail, two googly eyes with catchlights,
// @white low-opacity sheen for form, @secondary bellies/muzzles, @accent
// horns/beaks/claws.

const P = '@primary', S = '@secondary', A = '@accent', O = '@outline', W = '@white';

const el = (cx, cy, rx, ry, fill, extra = {}) => ({ type: 'ellipse', cx, cy, rx, ry, fill, ...extra });
const ci = (cx, cy, r, fill, extra = {}) => ({ type: 'circle', cx, cy, r, fill, ...extra });
const pa = (d, fill, extra = {}) => ({ type: 'path', d, fill, ...extra });
const li = (d, stroke, strokeWidth, extra = {}) => ({ type: 'path', d, fill: 'none', stroke, strokeWidth, ...extra });
const po = (points, fill, extra = {}) => ({ type: 'polygon', points, fill, ...extra });
const rc = (x, y, width, height, rx, fill, extra = {}) => ({ type: 'rect', x, y, width, height, rx, fill, ...extra });
const sheen = (cx, cy, rx, ry, o = 0.13) => el(cx, cy, rx, ry, W, { stroke: 'none', opacity: o });

// The house googly eye: white sclera, offset pupil, catchlight.
function eye(cx, cy, r, { pupil = 'round', pr = null, look = 1 } = {}) {
  const p = pr ?? r * 0.44;
  const px = cx + look * r * 0.32, py = cy + r * 0.1;
  const out = [ci(cx, cy, r, W, { strokeWidth: Math.max(3, r * 0.42) })];
  if (pupil === 'slit') out.push(rc(px - p * 0.42, py - p * 1.5, p * 0.85, p * 3, p * 0.4, O, { stroke: 'none' }));
  else if (pupil === 'bar') out.push(rc(px - p * 1.2, py - p * 0.62, p * 2.4, p * 1.25, p * 0.5, O, { stroke: 'none' }));
  else out.push(ci(px, py, p, O, { stroke: 'none' }));
  out.push(ci(px - p * 0.42, py - p * 0.55, Math.max(1.2, p * 0.34), W, { stroke: 'none' }));
  return out;
}

// ---------------------------------------------------------------- HEADS
// Local space: neck at origin, face points +x.
const HEADS = {
  mammal({ snout = 22, ear = 'round', eyeR = 11, skull = 37, teeth = false, mane = false, jowl = 1 }) {
    const s = [];
    if (mane) s.push(ci(16, -16, skull + 9, S));
    if (ear === 'round') {
      s.push(ci(2, -skull - 12, 14, S), ci(38, -skull - 15, 14, P), ci(38, -skull - 15, 6.5, A, { stroke: 'none' }));
    } else if (ear === 'pointed') {
      s.push(po(`-4,${-skull - 4} 6,${-skull - 30} 20,${-skull - 6}`, S),
             po(`26,${-skull - 6} 38,${-skull - 32} 50,${-skull - 2}`, P),
             po(`31,${-skull - 8} 38,${-skull - 24} 45,${-skull - 6}`, A, { stroke: 'none' }));
    } else {
      s.push(ci(6, -skull - 6, 8, S), ci(36, -skull - 8, 8, P));
    }
    s.push(ci(20, -16, skull, P), sheen(6, -34, skull * 0.55, skull * 0.34));
    s.push(...eye(skull + 10, -30, eyeR * 0.62));
    s.push(el(skull + 14, -2, snout, 15 * jowl, A));
    s.push(el(skull + 14 + snout * 0.5, -12, snout * 0.42, 7.5, O, { stroke: 'none' }));
    s.push(li(`M ${skull + 12} 9 q ${snout * 0.36} 7 ${snout * 0.72} 1`, O, 4));
    if (teeth) {
      s.push(po(`${skull + 6},6 ${skull + 13},6 ${skull + 9},17`, W, { strokeWidth: 2.5 }),
             po(`${skull + 20},7 ${skull + 27},7 ${skull + 23},18`, W, { strokeWidth: 2.5 }));
    }
    s.push(li(`M 8 -34 q 12 -7 23 -2`, O, 4));
    s.push(...eye(22, -24, eyeR));
    return s;
  },
  horned({ horn = 'curl', ...rest }) {
    const s = HEADS.mammal({ ear: 'small', snout: 18, eyeR: 10.5, skull: 26, ...rest });
    const horns = horn === 'curl'
      ? [pa('M 4 -34 C 0 -60 -12 -74 -30 -72 C -16 -62 -10 -48 -10 -34 Z', A, { strokeWidth: 4 }),
         pa('M 22 -32 C 22 -58 12 -76 -8 -78 C 4 -64 10 -48 8 -32 Z', A, { strokeWidth: 4 })]
      : horn === 'nose'
        ? [pa('M 48 -12 C 60 -34 72 -40 76 -30 C 78 -20 68 -8 58 -2 Z', A, { strokeWidth: 4 }),
           pa('M 30 -26 C 36 -38 44 -40 46 -33 C 47 -27 40 -22 34 -19 Z', A, { strokeWidth: 3.5 })]
        : [po('2,-30 -6,-64 14,-38', A, { strokeWidth: 4 }), po('20,-30 30,-66 34,-34', A, { strokeWidth: 4 })];
    return [...horns.slice(0, 1), ...s, ...horns.slice(1)];
  },
  bird({ beak = 'hook', crest = true, eyeR = 10.5 }) {
    const s = [];
    if (crest) s.push(pa('M 4 -42 q 8 -20 26 -16 q -8 9 -6 19 z', P));
    s.push(ci(20, -20, 31, S), sheen(8, -34, 16, 10, 0.34));
    s.push(...eye(45, -30, 6.5));
    s.push(beak === 'hook'
      ? pa('M 44 -30 C 65 -33 77 -26 78 -16 C 79 -6 69 -1 61 -6 C 65 -12 62 -17 46 -14 Z', A, { strokeWidth: 4 })
      : pa('M 44 -26 L 82 -18 L 44 -8 Z', A, { strokeWidth: 4 }));
    s.push(ci(55, -23, 2.5, O, { stroke: 'none' }));
    s.push(li('M 12 -38 L 40 -31', O, 5));
    s.push(...eye(27, -24, eyeR));
    return s;
  },
  reptile({ jaw = 40, hood = false, fangs = true, eyeR = 10, frill = false }) {
    const s = [];
    if (hood) s.push(pa('M 2 4 C -20 -22 -18 -62 6 -80 C 20 -90 38 -90 52 -80 C 76 -62 78 -22 56 4 Z', P),
                     el(29, -46, 11, 14, A, { stroke: 'none', opacity: 0.9 }));
    if (frill) s.push(pa('M 6 -30 C -14 -46 -14 -8 6 -14 Z', A, { strokeWidth: 3.5 }));
    s.push(el(22, -20, 30, 22, P), sheen(10, -32, 15, 8));
    s.push(...eye(44, -28, eyeR * 0.62, { pupil: 'slit' }));
    s.push(pa(`M 34 -18 L ${34 + jaw} -12 L ${34 + jaw} 2 L 32 6 Z`, P, { strokeWidth: 4 }));
    s.push(li(`M 36 -4 L ${32 + jaw} -1`, O, 3, { opacity: 0.5 }));
    if (fangs) s.push(po(`${28 + jaw},2 ${34 + jaw},2 ${31 + jaw},12`, W, { strokeWidth: 2.5 }),
                      po(`${14 + jaw},2 ${20 + jaw},2 ${17 + jaw},11`, W, { strokeWidth: 2.5 }));
    s.push(el(34 + jaw * 0.85, -14, 5, 3.5, O, { stroke: 'none' }));
    s.push(...eye(26, -26, eyeR, { pupil: 'slit' }));
    return s;
  },
  fish({ lure = false, gills = true, teeth = true, eyeR = 12 }) {
    const s = [pa('M -6 -10 C -2 -52 44 -66 72 -40 C 86 -26 86 -2 72 12 C 44 36 -2 26 -6 -10 Z', P),
               sheen(24, -26, 20, 10, 0.16),
               el(40, 8, 34, 12, S, { stroke: 'none', opacity: 0.75 })];
    if (gills) s.push(li('M 26 -22 q -5 16 1 30 M 36 -24 q -5 17 1 32 M 46 -25 q -5 18 1 33', O, 3.5, { opacity: 0.55 }));
    if (teeth) s.push(li('M 50 4 L 78 -2', O, 3.5),
                      po('56,3 62,3 59,12', W, { strokeWidth: 2 }), po('66,1 72,1 69,10', W, { strokeWidth: 2 }));
    if (lure) s.push(li('M 28 -44 C 44 -72 70 -68 74 -50', A, 4), ci(75, -48, 8, A, { strokeWidth: 3 }), ci(75, -48, 3.5, W, { stroke: 'none' }));
    s.push(...eye(38, -22, eyeR));
    return s;
  },
  bug({ mandibles = true, antennae = true, eyeR = 15, horn = false }) {
    const s = [];
    if (antennae) s.push(li('M 14 -34 C 22 -58 40 -66 54 -62', O, 3.5), li('M 22 -30 C 34 -50 54 -54 66 -46', O, 3.5));
    if (horn) s.push(pa('M 40 -26 C 56 -50 76 -50 78 -36 C 72 -40 62 -34 54 -20 Z', A, { strokeWidth: 4 }));
    s.push(el(24, -18, 32, 26, P), sheen(12, -30, 15, 8, 0.18));
    s.push(...eye(48, -26, eyeR * 0.55));
    s.push(...eye(24, -22, eyeR));
    if (mandibles) s.push(pa('M 48 -4 C 62 0 70 8 66 16 C 62 10 54 8 46 8 Z', A, { strokeWidth: 3.5 }),
                          pa('M 48 -10 C 64 -12 74 -6 72 2 C 66 -4 58 -4 48 -2 Z', A, { strokeWidth: 3.5 }));
    return s;
  },
  blob({ eyeR = 16 }) {
    return [pa('M 2 0 C -6 -34 14 -66 40 -66 C 66 -66 84 -36 74 -2 C 66 22 14 24 2 0 Z', P),
            sheen(24, -44, 20, 12, 0.18),
            li('M 14 -6 q 12 10 26 4 q 12 -8 26 -2', O, 3.5, { opacity: 0.45 }),
            ...eye(56, -30, eyeR * 0.72),
            ...eye(26, -26, eyeR)];
  },
  amphib({ eyeR = 13 }) {
    return [el(30, -6, 36, 22, P),
            el(30, 4, 30, 12, S, { stroke: 'none', opacity: 0.7 }),
            li('M 4 2 q 30 16 60 0', O, 4.5),
            ci(16, -26, eyeR + 4, P, { strokeWidth: 4.5 }),
            ci(48, -28, eyeR + 3, P, { strokeWidth: 4.5 }),
            ...eye(48, -28, eyeR * 0.7),
            ...eye(16, -26, eyeR)];
  },
};

// ------------------------------------------------------------- LIMBS
// Local space: hangs +y from the shoulder/hip socket at the origin.
const LIMBS = {
  paw({ mass = 20, len = 58, claws = 3, digit = S }) {
    const s = [el(0, 2, mass, mass + 1, P), rc(-mass * 0.8, -2, mass * 1.6, len, mass * 0.75, P),
               li(`M ${-mass * 0.6} 8 q ${mass * 0.25} 24 ${mass * 0.05} 40`, W, 5, { opacity: 0.13 }),
               el(2, len, mass * 0.9, 13, digit)];
    for (let i = 0; i < claws; i++) {
      const x = 15 - i * 9, y = len - 8 + i * 9;
      s.push(po(`${x},${y} ${x + 12},${y + 3} ${x + 3},${y + 13}`, W, { strokeWidth: 3 }));
    }
    return s;
  },
  hoof({ len = 52 }) {
    return [el(0, 0, 15, 16, P), rc(-11, -4, 22, 34, 10, P), el(0, 30, 11, 11, P), rc(-9.5, 28, 19, len - 27, 8, P),
            li('M -7 2 q -2 18 0 26', W, 4, { opacity: 0.16 }),
            pa(`M -12 ${len} h 24 l -2 15 h -20 z`, '#5b5349', { strokeWidth: 4 }),
            li(`M 0 ${len + 3} L 0 ${len + 15}`, O, 3)];
  },
  wing({ span = 118, coverts = true }) {
    const T = 'translate(6 -20) rotate(-4)';
    const s = [pa(`M 4 10 C -10 -14 -46 -46 ${-span + 6} -64 C ${-span - 5} -67 ${-span - 10} -58 ${-span - 1} -51 Q ${-span - 3} -33 ${-span + 19} -31 Q ${-span + 25} -12 ${-span + 47} -15 Q -58 3 -34 1 Q -20 15 2 15 Z`, P, { transform: T }),
               li(`M ${-span + 2} -56 C -92 -42 -70 -30 -44 -22`, O, 3.5, { opacity: 0.5, transform: T }),
               li('M -96 -30 C -76 -20 -54 -10 -30 -4', O, 3.5, { opacity: 0.4, transform: T }),
               li('M -68 -14 C -50 -6 -30 2 -10 6', O, 3.5, { opacity: 0.3, transform: T })];
    if (coverts) s.push(pa('M 4 6 C -8 -12 -34 -34 -74 -44 C -82 -46 -86 -39 -79 -34 Q -80 -20 -62 -19 Q -55 -4 -36 -6 Q -22 6 2 8 Z', S, { strokeWidth: 4, transform: T }));
    s.push(el(0, -2, 16, 15, P), sheen(-5, -7, 7, 6, 0.16));
    return s;
  },
  membrane({ span = 96 }) {
    const T = 'translate(4 -18) rotate(-6)';
    return [pa(`M 2 8 C -8 -12 -40 -40 ${-span} -56 C ${-span - 8} -58 ${-span - 12} -50 ${-span - 4} -44 Q ${-span + 16} -24 ${-span + 34} -20 Q ${-span + 52} 0 -28 2 Q -14 12 2 12 Z`, P, { transform: T, opacity: 0.92 }),
            li(`M -6 2 C -34 -14 -62 -32 ${-span - 2} -50`, O, 3, { opacity: 0.5, transform: T }),
            li(`M -6 4 C -30 -4 -54 -14 ${-span + 16} -26`, O, 3, { opacity: 0.4, transform: T }),
            el(0, -2, 13, 13, P)];
  },
  fin({ len = 54 }) {
    return [el(0, 4, 17, 18, P),
            pa(`M -6 8 C -30 ${len * 0.5} -22 ${len} 4 ${len + 8} C 20 ${len} 22 ${len * 0.5} 12 6 Z`, S, { strokeWidth: 4 }),
            li(`M -2 20 L 2 ${len} M 6 18 L 8 ${len - 2}`, O, 3, { opacity: 0.45 }),
            sheen(-3, 2, 8, 7, 0.16)];
  },
  tentacle({ len = 62 }) {
    return [el(0, 2, 16, 16, P),
            pa(`M -13 4 C -18 ${len * 0.5} -6 ${len} 10 ${len + 6} C 20 ${len * 0.6} 14 20 13 2 Z`, P, { strokeWidth: 4.5 }),
            ci(-4, 24, 4, S, { stroke: 'none', opacity: 0.85 }), ci(-2, 38, 3.6, S, { stroke: 'none', opacity: 0.85 }),
            ci(3, 50, 3.2, S, { stroke: 'none', opacity: 0.85 }), ci(8, 60, 2.8, S, { stroke: 'none', opacity: 0.85 })];
  },
  bugleg({ len = 56 }) {
    return [el(0, 0, 12, 12, P),
            pa(`M -3 2 L -22 ${len * 0.55} L -6 ${len * 0.6} L 8 ${len} L 14 ${len - 4} L 2 ${len * 0.55} L -8 ${len * 0.5} Z`, P, { strokeWidth: 4 }),
            po(`8,${len} 20,${len + 6} 10,${len + 10}`, A, { strokeWidth: 3 })];
  },
  scythe({}) {
    return [el(0, 2, 15, 15, P),
            rc(-9, 0, 18, 30, 8, P),
            pa('M -6 28 C 16 26 34 12 40 -12 C 44 -24 34 -28 28 -18 C 22 2 8 14 -8 16 Z', A, { strokeWidth: 4 }),
            li('M 24 -14 l -4 8 M 16 -2 l -4 8 M 6 8 l -3 7', O, 2.5, { opacity: 0.6 })];
  },
  talon({ len = 54 }) {
    return [el(0, 10, 18, 20, P), sheen(-6, 3, 9, 10, 0.13),
            rc(-5.5, 24, 11, 30, 5, A, { strokeWidth: 4 }),
            po(`0,${len - 4} 21,${len + 3} 19,${len + 11} 2,${len + 9}`, A, { strokeWidth: 4 }),
            po(`-2,${len - 2} 5,${len + 13} -8,${len + 13}`, A, { strokeWidth: 4 }),
            po(`-2,${len - 2} -16,${len + 9} -8,${len + 14}`, A, { strokeWidth: 4 }),
            po(`21,${len + 3} 30,${len + 8} 19,${len + 11}`, O, { stroke: 'none' })];
  },
  hop({ len = 50 }) {
    return [el(0, 8, 22, 24, P), sheen(-7, 0, 11, 12, 0.14),
            pa(`M -10 22 q 12 10 22 0 l 0 10 q -12 10 -22 0 z`, P, { strokeWidth: 4 }),
            rc(-9, 30, 18, len - 22, 8, P),
            pa(`M -14 ${len + 8} q 16 -6 30 0 q -4 10 -14 10 q -12 0 -16 -10 z`, S, { strokeWidth: 4 }),
            li(`M -6 ${len + 12} l -4 8 M 2 ${len + 14} l 0 8 M 10 ${len + 12} l 4 8`, O, 2.5, { opacity: 0.6 })];
  },
};

// ------------------------------------------------------------- TAILS
// Local space: extends -x from the rump socket at the origin.
const TAILS = {
  bushy: ({ len = 60, fluff = true }) => [
    pa(`M 2 6 C -20 14 ${-len} 4 ${-len - 6} -26 C ${-len - 8} -40 ${-len + 12} -44 ${-len + 10} -28 C ${-len + 8} -12 -18 -10 2 -10 Z`, P),
    fluff ? li(`M -14 -2 C -36 2 ${-len + 12} -6 ${-len + 4} -24`, S, 5, { opacity: 0.7 }) : null,
    sheen(-22, -6, 14, 6, 0.12),
  ].filter(Boolean),
  nub: () => [el(-11, -2, 14, 13, P), sheen(-15, -6, 6, 5, 0.16)],
  whip: ({ len = 56 }) => [
    pa(`M 0 -12 C ${-len * 0.5} -18 ${-len - 2} -6 ${-len - 8} 12 C ${-len - 11} 22 ${-len - 3} 28 ${-len + 4} 25 C ${-len - 1} 22 ${-len - 1} 16 ${-len + 6} 12 C ${-len * 0.6} 4 -28 4 0 10 Z`, P),
    li(`M -8 -2 C ${-len * 0.5} -6 ${-len + 2} 3 ${-len + 6} 13`, S, 4.5, { opacity: 0.8 }),
  ],
  // Fish tail: a crescent with a notch, not a cone.
  finTail: ({ len = 62 }) => [
    pa(`M 0 -8 C -24 -13 ${-len * 0.7} -22 ${-len} -42 C ${-len * 0.82} -18 ${-len * 0.86} -6 ${-len * 0.7} 0 C ${-len * 0.86} 6 ${-len * 0.82} 18 ${-len} 42 C ${-len * 0.7} 22 -24 13 0 8 Z`, P, { strokeWidth: 4.5 }),
    li(`M ${-len * 0.72} -30 L ${-len * 0.3} -8 M ${-len * 0.72} 30 L ${-len * 0.3} 8`, O, 3, { opacity: 0.4 }),
    sheen(-18, -2, 12, 5, 0.14),
  ],
  fan: ({ spread = 19 }) => [
    pa('M 0 -5 C -32 -9 -56 -7 -67 -2 C -71 3 -68 8 -61 8 C -38 7 -18 4 0 5 Z', P, { transform: `rotate(${spread})` }),
    pa('M 0 -5 C -32 -9 -56 -7 -67 -2 C -71 3 -68 8 -61 8 C -38 7 -18 4 0 5 Z', P, { transform: `rotate(${-spread + 2})` }),
    pa('M 0 -6 C -34 -10 -59 -8 -70 -2 C -74 4 -71 9 -63 9 C -40 8 -18 5 0 6 Z', S),
    li('M -10 0 C -32 -2 -50 -1 -64 2', O, 3, { opacity: 0.4 }),
  ],
  // Scorpion sting: arches up over the back, tip forward.
  sting: ({ len = 66 }) => [
    pa(`M 0 -4 C -18 -8 -34 -22 -42 -40 C -46 -52 -36 -60 -28 -52 C -24 -36 -12 -22 2 -14 Z`, P, { strokeWidth: 4.5 }),
    ci(-31, -50, 11, P, { strokeWidth: 4 }),
    po('-25,-58 -46,-74 -34,-50', A, { strokeWidth: 3.5 }),
    li('M -10 -16 l -6 6 M -22 -30 l -6 5', A, 2.5, { opacity: 0.6 }),
  ],
  coil: ({}) => [
    pa('M 0 -12 C -36 -18 -62 -6 -71 10 C -75 21 -68 30 -58 27 C -62 22 -64 16 -59 13 C -49 4 -32 3 0 9 Z', P),
    li('M -6 -2 C -35 -6 -55 3 -62 13', S, 5, { opacity: 0.85 }),
    li('M -16 -5 l 4 4 l -4 4 M -31 -5 l 4 4 l -4 4 M -45 0 l 4 4 l -4 4', A, 2.5, { opacity: 0.55 }),
  ],
  flick: ({}) => [
    pa('M 3 7 C -13 5 -25 -7 -22 -27 C -13 -22 -2 -11 7 -2 Z', P, { strokeWidth: 4 }),
    li('M -4 0 q -8 -6 -12 -16', S, 3, { opacity: 0.7 }),
  ],
};

// -------------------------------------------------------------- HIDES
// Local space: torso centre. Clipped to the frame silhouette by the engine.
const HIDES = {
  fur: () => [
    li('M -76 -28 l 11 -12 l 8 14 l 11 -12 l 8 14 l 11 -12 l 8 14 l 11 -12 l 8 14 l 11 -12 l 8 14 l 11 -12 l 8 14', S, 6, { opacity: 0.8 }),
    li('M -72 10 q 12 10 24 0 q 12 10 24 0 q 12 10 24 0 q 12 10 24 0', S, 4.5, { opacity: 0.5 }),
    el(-32, 18, 17, 10, S, { stroke: 'none', opacity: 0.45 }),
    el(36, -2, 12, 8, S, { stroke: 'none', opacity: 0.45 }),
  ],
  stripes: () => [
    li('M -60 -46 q 8 26 2 52 M -30 -50 q 8 30 2 58 M 0 -52 q 8 32 2 60 M 30 -48 q 8 30 2 56 M 58 -42 q 7 26 1 50', S, 9, { opacity: 0.75 }),
    el(-14, 30, 40, 14, A, { stroke: 'none', opacity: 0.25 }),
  ],
  feather: () => [
    li('M -54 -12 q 9 11 18 0 q 9 11 18 0 q 9 11 18 0 q 9 11 18 0', S, 4.5, { opacity: 0.85 }),
    li('M -62 8 q 9 11 18 0 q 9 11 18 0 q 9 11 18 0 q 9 11 18 0 q 9 11 18 0', S, 4.5, { opacity: 0.85 }),
    li('M -54 28 q 9 11 18 0 q 9 11 18 0 q 9 11 18 0 q 9 11 18 0', S, 4.5, { opacity: 0.8 }),
    el(58, 4, 18, 23, S, { stroke: 'none', opacity: 0.55 }),
  ],
  scale: () => [
    li('M -58 -16 l 8 7 l 8 -7 l 8 7 l 8 -7 l 8 7 l 8 -7 l 8 7 l 8 -7 l 8 7 l 8 -7 l 8 7', A, 4, { opacity: 0.6 }),
    li('M -62 4 l 8 7 l 8 -7 l 8 7 l 8 -7 l 8 7 l 8 -7 l 8 7 l 8 -7 l 8 7 l 8 -7 l 8 7', A, 4, { opacity: 0.6 }),
    li('M -54 24 l 8 7 l 8 -7 l 8 7 l 8 -7 l 8 7 l 8 -7 l 8 7 l 8 -7 l 8 7', A, 4, { opacity: 0.55 }),
    po('14,-34 26,-24 14,-14 2,-24', S, { stroke: 'none', opacity: 0.5 }),
  ],
  plate: () => [
    pa('M -70 -30 q 34 -14 68 0 l 0 20 q -34 -12 -68 0 z', S, { strokeWidth: 3.5, opacity: 0.9 }),
    pa('M -74 0 q 38 -14 76 0 l 0 20 q -38 -12 -76 0 z', S, { strokeWidth: 3.5, opacity: 0.85 }),
    pa('M -66 30 q 32 -12 64 0 l 0 18 q -32 -10 -64 0 z', S, { strokeWidth: 3.5, opacity: 0.8 }),
    li('M -30 -26 l 0 16 M 10 -26 l 0 16 M -30 6 l 0 16 M 10 6 l 0 16', O, 2.5, { opacity: 0.35 }),
  ],
  quill: () => [
    li('M -60 -20 l -14 -22 M -40 -28 l -10 -26 M -18 -32 l -4 -28 M 4 -32 l 4 -28 M 26 -28 l 12 -26 M 46 -20 l 18 -22', A, 5, { opacity: 0.9 }),
    li('M -66 4 l -20 -10 M 52 2 l 20 -10', A, 5, { opacity: 0.8 }),
    el(-10, 22, 34, 14, S, { stroke: 'none', opacity: 0.35 }),
  ],
  chitin: () => [
    li('M -62 -22 q 32 -12 64 0 M -66 -4 q 34 -12 68 0 M -62 14 q 32 -12 64 0 M -54 32 q 28 -10 56 0', A, 5, { opacity: 0.7 }),
    el(30, -20, 16, 10, S, { stroke: 'none', opacity: 0.4 }),
  ],
  slick: () => [
    el(-20, -16, 30, 16, S, { stroke: 'none', opacity: 0.4 }),
    el(28, 10, 22, 12, S, { stroke: 'none', opacity: 0.32 }),
    li('M -60 6 q 30 14 60 0 q 30 -14 58 0', W, 4, { opacity: 0.16 }),
    ci(-40, 20, 7, S, { stroke: 'none', opacity: 0.3 }),
    ci(6, -34, 6, S, { stroke: 'none', opacity: 0.3 }),
  ],
  camo: () => [
    pa('M -60 -20 q 18 -16 34 -2 q 10 14 -6 20 q -22 6 -28 -18 z', S, { stroke: 'none', opacity: 0.45 }),
    pa('M 6 -34 q 22 -12 34 4 q 6 16 -12 18 q -24 0 -22 -22 z', S, { stroke: 'none', opacity: 0.4 }),
    pa('M -26 14 q 20 -8 32 6 q 4 14 -14 14 q -20 -2 -18 -20 z', A, { stroke: 'none', opacity: 0.35 }),
    pa('M 34 18 q 16 -6 22 8 q 0 10 -12 10 q -14 -2 -10 -18 z', A, { stroke: 'none', opacity: 0.3 }),
  ],
};

// ------------------------------------------------------------- ORGANS
// Local space: belly socket. A glow plus a glyph that says what it does.
function organ(glow, glyph = []) {
  return [
    el(0, 0, 26, 16, glow, { stroke: 'none', opacity: 0.28 }),
    el(0, 0, 13, 9, glow, { stroke: 'none', opacity: 0.45 }),
    ...glyph,
  ];
}
const GLYPHS = {
  zzz: (c) => [li('M 9 -14 h 11 l -11 12 h 12', c, 2.5, { opacity: 0.8 }), li('M 24 -28 h 8 l -8 9 h 9', c, 2, { opacity: 0.55 })],
  gear: (c) => [ci(0, 0, 5, c, { stroke: 'none', opacity: 0.6 }), li('M -17 -6 h 6 M 11 -6 h 6 M -17 6 h 6 M 11 6 h 6 M 0 -15 v 5 M 0 10 v 5', c, 3, { opacity: 0.65 })],
  drip: (c) => [pa('M 0 -12 C 10 -4 12 6 6 11 C 1 15 -6 13 -8 7 C -10 0 -6 -6 0 -12 Z', c, { stroke: 'none', opacity: 0.6 })],
  feather: (c) => [li('M -14 4 q 14 -12 28 0', c, 3, { opacity: 0.8 }), ci(16, -12, 3, c, { stroke: 'none', opacity: 0.5 })],
  bolt: (c) => [pa('M 4 -14 L -6 1 L 1 1 L -3 14 L 9 -2 L 2 -2 Z', c, { stroke: 'none', opacity: 0.85 })],
  wave: (c) => [li('M -16 -2 q 8 -8 16 0 q 8 8 16 0', c, 3, { opacity: 0.8 }), li('M -16 8 q 8 -8 16 0 q 8 8 16 0', c, 3, { opacity: 0.6 })],
  cloud: (c) => [ci(-8, 2, 7, c, { stroke: 'none', opacity: 0.5 }), ci(2, -3, 8, c, { stroke: 'none', opacity: 0.5 }), ci(11, 3, 6, c, { stroke: 'none', opacity: 0.5 })],
  howl: (c) => [li('M -2 -12 q 10 12 0 24', c, 3, { opacity: 0.75 }), li('M 8 -16 q 14 16 0 32', c, 2.5, { opacity: 0.5 }), li('M 18 -20 q 18 20 0 40', c, 2, { opacity: 0.3 })],
  eye: (c) => [ci(0, 0, 8, c, { stroke: 'none', opacity: 0.55 }), ci(3, -1, 3.5, O, { stroke: 'none', opacity: 0.6 })],
  spark: (c) => [li('M 0 -14 v 8 M 0 6 v 8 M -14 0 h 8 M 6 0 h 8 M -10 -10 l 5 5 M 10 10 l -5 -5 M 10 -10 l -5 5 M -10 10 l 5 -5', c, 2.5, { opacity: 0.7 })],
};

export { TAILS, HIDES, organ, GLYPHS };

export { HEADS, LIMBS, el, ci, pa, li, po, rc, sheen, eye, P, S, A, O, W };
