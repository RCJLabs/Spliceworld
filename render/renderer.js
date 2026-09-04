// Genome → SVG renderer. Pure string builder, no DOM — must stay runnable
// headless in Node (tools/smoke.js) as well as in the browser.
//
// A genome is fully data: { frame: 'M', parts: { head: 'bear_head', ... } }.
// Frames define standardized sockets; parts define shapes in socket-local
// space (conventions documented in data/frames.json _doc). Any part fits
// any socket of its slot — that contract is what makes splicing free-form.

// SLOT TYPES: what kind of part something is. A part declares one of these.
export const SLOTS = ['head', 'forelimbs', 'hindlimbs', 'tail', 'hide', 'organ'];

// SOCKET IDS: where a part is installed. Usually the same string as the slot
// type — except where a frame offers more than one bay for a kind of part.
// Surgery Theater Tier II opens `organ2` (ROADMAP §3.4: "Organ ×1, ×2 at
// Theater Tier 2"). Keeping socket ids string-keyed means every genome ever
// saved is still a valid genome: old saves simply never mention organ2.
export const SOCKETS = ['head', 'forelimbs', 'hindlimbs', 'tail', 'hide', 'organ', 'organ2'];

export function slotOfSocket(socketId) {
  return socketId.replace(/\d+$/, '');
}

const OUTLINE = '#2b2440';
const WHITE = '#ffffff';
const NEUTRAL_PALETTE = { primary: '#c9c4b8', secondary: '#a8a396', accent: '#8a8578' };
const STROKE_DEFAULT = 5;

// Painter's order, back to front. Slot 'forelimbs'/'hindlimbs' render into
// both their _far and _near sockets.
// [socket id in the genome, socket name on the frame]. Draw order is the
// creature's depth order, back to front.
const LAYERS = [
  ['forelimbs', 'forelimb_far'],
  ['hindlimbs', 'hindlimb_far'],
  ['tail', 'tail'],
  ['torso', null],
  ['hide', null],
  ['organ2', 'organ2'],
  ['organ', 'organ'],
  ['hindlimbs', 'hindlimb_near'],
  ['forelimbs', 'forelimb_near'],
  ['head', 'head'],
];

export function indexContent(raw) {
  const byId = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));
  const indexed = {
    frames: byId(raw.frames.frames),
    parts: byId(raw.parts.parts),
    species: byId(raw.species.species),
    combos: raw.combos ? byId(raw.combos.combos) : {},
    enemies: raw.enemies ? byId(raw.enemies.units) : {},
    encounters: raw.enemies ? byId(raw.enemies.encounters) : {},
    tierScale: raw.enemies?.tierScale ?? [1, 1],
    // R67: how well the opposition PLAYS at each rung, beside how hard it
    // HITS. Lifted here for the same reason tierScale is — battle/ai.js reads
    // it, and a ladder that lives only in the engine cannot grow a rung
    // without an engine edit.
    aiSkillByTier: raw.enemies?.aiSkillByTier ?? null,
    keywords: raw.keywords ? byId(raw.keywords.keywords) : {},
    tagChart: raw.keywords ? raw.keywords.tagChart : [],
    regions: raw.regions ? byId(raw.regions.regions) : {},
    traits: raw.traits ? byId(raw.traits.traits) : {},
    classes: raw.classes ? byId(raw.classes.classes) : {},
    rivals: raw.rivals ? byId(raw.rivals.rivals) : {},
    rivalMeta: raw.rivals ? raw.rivals.rematch : null,
    // R82: the breakout's whole tuning is one flat object, so it is
    // indexed as one rather than split into a list and a meta block.
    breakoutMeta: raw.breakout ?? null,
    directorRules: raw.director ? byId(raw.director.counters) : {},
    directorMeta: raw.director ? raw.director.tuning : null,
    facility: raw.facility ? byId(raw.facility.tracks) : {},
    // Daily upkeep constants (R25). Kept beside the facility because the
    // tracks below are what a player buys with what upkeep leaves them.
    upkeepMeta: raw.facility ? raw.facility.upkeep ?? null : null,
    philosophies: raw.philosophies ? byId(raw.philosophies.philosophies) : {},
    operations: raw.operations ? byId(raw.operations.operations) : {},
    operationMeta: raw.operations ? raw.operations.tuning : null,
    chaosMeta: raw.chaos ? raw.chaos.tuning : null,
    resequencerMeta: raw.resequencer ? raw.resequencer.tuning : null,
    trainingMeta: raw.training ? raw.training.tuning : null,
    gauntlet: raw.gauntlet ? raw.gauntlet.stages : [],
    // R62: the wire's copy, keyed by event id.
    news: raw.news ? raw.news.events : {},
    sparBlurbs: raw.training ? raw.training.sparBlurbs : null,
    scars: raw.scars ? byId(raw.scars.scars) : {},
    scarMeta: raw.scars ? raw.scars.tuning : null,
    // First-use field guides (R29), keyed by id and kept in authored order
    // by their own `order` field rather than by object insertion.
    guides: raw.guides ? byId(raw.guides.guides) : {},
    temperamentMeta: raw.temperament ? raw.temperament.tuning : null,
    temperamentByRole: raw.temperament ? raw.temperament.byRole : null,
    temperamentBySpecies: raw.temperament ? raw.temperament.bySpecies : null,
    temperamentLabels: raw.temperament ? raw.temperament.labels : null,
    chaosNames: raw.chaos ? raw.chaos.names : null,
    chaosLines: raw.chaos ? raw.chaos.lines : null,
    resequencerLines: raw.resequencer ? raw.resequencer.lines : null,
    labNames: raw.philosophies ? raw.philosophies.labNames : null,
    classRules: raw.classes
      ? { advantage: raw.classes.advantage, disadvantage: raw.classes.disadvantage, flavor: raw.classes.flavor ?? {} }
      : { advantage: 1, disadvantage: 1, flavor: {} },
    campaignMeta: raw.regions
      ? {
          // The Threat Generation ladder (R26). threatGen2At is kept beside
          // it as the fallback a pre-ladder regions.json still reads by.
          threatGens: raw.regions.threatGens ?? null,
          threatGen2At: raw.regions.threatGen2At,
          // R70: a pool, not a single id — `rescue_impound` was the only
          // response the coalition ever sent to a rescue, forever, and
          // `air_patrol` and `harbor_watch` sat fully authored and unused
          // beside it. `rescueEncounter` (singular) is read as a one-entry
          // pool so an older regions.json still boots.
          rescueEncounters: raw.regions.rescueEncounters
            ?? (raw.regions.rescueEncounter ? [raw.regions.rescueEncounter] : []),
          contestation: raw.regions.contestation ?? null,
        }
      : { threatGens: null, threatGen2At: Infinity, rescueEncounters: [], contestation: null },
  };
  // R81: present for a Node tool that read every file off disk, absent in
  // the browser until the first paint is over. Same merge either way.
  return attachShapes(indexed, raw);
}

// Human units and vehicles: same shape interpreter, literal palettes.
// R57 — the rivals had a `portraitSeed` on every one of them since R27 and
// ZERO references to it in any .js file. campaign/ui.js draws the rival's
// LEAD CHIMERA into a slot it calls `.rival-portrait`, so three named
// villains with a title, a philosophy, a monologue set and an escalating
// dossier were represented on screen by their pet.
//
// Procedural and seeded, because that is what the waiting field is for: the
// same rival draws the same face on every device and every reload, and a
// fourth rival is three JSON fields rather than an art commission.
//
// Tinted by `classBias`, so the picture carries the one thing about a rival
// that decides a fight. Same shape vocabulary and the same shapeToSVG as
// every enemy unit — a second drawing system would have been the real cost.

const SKINS = ['#e8c39e', '#c68642', '#8d5524', '#f1d2b6', '#a86b3c'];
// Reads as hair or as a surgical cap depending on the seed. Both are
// correct for this cast, so the palette serves both.
const CROWNS = ['#2b2440', '#6b4423', '#b8b0a0', '#8c2f39', '#d8d3c4'];

// A tiny seeded stream. The renderer has never needed randomness before and
// should not grow a dependency on util/rng for five draws.
function portraitRng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// R81 — THE GEOMETRY ARRIVES SEPARATELY.
//
// `parts[].shapes` was 69% of data/parts.json and `units[].shapes` 73% of
// data/enemies.json — 400 KB between them, half of everything the game
// downloads, read by this module and by nothing else. So both now ship as
// their own file and are fetched AFTER the first paint (data/loader.js).
//
// They are merged back onto the very objects they came off, which is the
// whole point: `content.parts[id].shapes` is where every reader already
// looks, so nothing downstream learned a new shape. The only thing that
// changed is that for a few hundred milliseconds it is `undefined`, and the
// two draw paths below say so rather than throwing.
//
// A Node tool that hands `indexContent` the shapes files alongside the rest
// gets them merged here and never notices the split at all.
export function attachShapes(content, raw) {
  // Keyed by FILE NAME, like every other entry in `raw` — the browser hands
  // over what it fetched and a Node tool hands over what it read, and there
  // is one spelling between them.
  for (const [key, into] of [['parts-shapes', content.parts], ['enemies-shapes', content.enemies]]) {
    const table = raw?.[key]?.shapes;
    if (!table) continue;
    for (const [id, shapes] of Object.entries(table)) {
      if (into[id]) into[id].shapes = shapes;
    }
  }
  return content;
}

// Can this genome be drawn yet? Every part it names has to have arrived.
export function hasGeometry(genome, content) {
  return Object.values(genome.parts ?? {}).every((id) => !id || content.parts[id]?.shapes);
}

export function rivalPortraitShapes(rival, classes = {}) {
  const rng = portraitRng(rival.portraitSeed ?? 1);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const skin = pick(SKINS);
  const hair = pick(CROWNS);
  const accent = classes[rival.classBias]?.color ?? '#8a8578';
  const coat = '#f2f0ea';
  const eyewear = Math.floor(rng() * 3); // 0 goggles, 1 round glasses, 2 none
  const browTilt = -14 + Math.floor(rng() * 29); // the whole expression
  const jaw = 34 + Math.floor(rng() * 8);
  const eyeGap = 15 + Math.floor(rng() * 5);
  const shapes = [];

  // Shoulders and lab coat, with the class stripe on the lapel.
  shapes.push({ type: 'path', d: 'M -84 110 C -84 56 -44 40 0 40 C 44 40 84 56 84 110 Z', fill: coat });
  shapes.push({ type: 'path', d: `M -20 44 L 0 78 L 20 44 L 8 40 L 0 52 L -8 40 Z`, fill: accent });
  shapes.push({ type: 'rect', x: -10, y: 20, width: 20, height: 28, rx: 7, fill: skin });

  // Head, hair, and a pair of genuinely googly eyes under whatever is on
  // the face — the house style since M0.
  shapes.push({ type: 'rect', x: -jaw, y: -46, width: jaw * 2, height: 74, rx: 26, fill: skin });
  const bareHeaded = rng() < 0.22;
  if (!bareHeaded) {
    shapes.push({ type: 'rect', x: -jaw, y: -48, width: jaw * 2, height: 18 + Math.floor(rng() * 9), rx: 20, fill: hair });
  }
  for (const side of [-1, 1]) {
    shapes.push({ type: 'circle', cx: side * eyeGap, cy: -8, r: 9, fill: '#ffffff' });
    shapes.push({ type: 'circle', cx: side * eyeGap + Math.round(rng() * 4 - 2), cy: -6, r: 4, fill: '#2b2440', stroke: 'none' });
    shapes.push({
      type: 'path',
      d: `M ${side * eyeGap - 9} ${-20 + side * browTilt * 0.45} L ${side * eyeGap + 9} ${-22 - side * browTilt * 0.45}`,
      fill: 'none', stroke: '@outline', strokeWidth: 4,
    });
  }
  if (eyewear === 0) {
    shapes.push({ type: 'rect', x: -jaw + 2, y: -20, width: (jaw - 2) * 2, height: 24, rx: 10, fill: accent, opacity: 0.35 });
    shapes.push({ type: 'rect', x: -jaw + 2, y: -24, width: (jaw - 2) * 2, height: 7, rx: 3, fill: '#5a5468', stroke: 'none' });
  } else if (eyewear === 1) {
    for (const side of [-1, 1]) {
      shapes.push({ type: 'circle', cx: side * eyeGap, cy: -8, r: 13, fill: 'none', stroke: '@outline' });
    }
    shapes.push({ type: 'path', d: `M ${-eyeGap + 13} -8 L ${eyeGap - 13} -8`, fill: 'none', stroke: '@outline', strokeWidth: 3 });
  }
  // A mouth that agrees with the eyebrows: villains smile when they mean it.
  shapes.push({
    type: 'path',
    d: browTilt > 3
      ? `M -13 13 Q 0 ${21 + browTilt * 0.35} 13 13`
      : `M -13 ${19 + browTilt * 0.2} Q 0 ${11 - browTilt * 0.2} 13 ${19 + browTilt * 0.2}`,
    fill: 'none', stroke: '@outline', strokeWidth: 4,
  });
  return shapes;
}

export function renderRivalSVG(rival, classes = {}) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-110 -110 220 220" role="img" aria-label="${esc(rival.name)}">` +
    `<g>${rivalPortraitShapes(rival, classes).map((sh) => shapeToSVG(sh, NEUTRAL_PALETTE)).join('')}</g>` +
    `</svg>`
  );
}

export function renderUnitSVG(unit) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-110 -110 220 220" role="img" aria-label="${esc(unit.name)}">` +
    `<g>${(unit.shapes ?? []).map((s) => shapeToSVG(s, NEUTRAL_PALETTE)).join('')}</g>` +
    `</svg>`
  );
}

function resolveColor(token, palette) {
  if (token == null) return null;
  switch (token) {
    case '@primary': return palette.primary;
    case '@secondary': return palette.secondary;
    case '@accent': return palette.accent;
    case '@outline': return OUTLINE;
    case '@white': return WHITE;
    default: return token; // literal color
  }
}

function esc(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function shapeToSVG(shape, palette) {
  const fill = resolveColor(shape.fill ?? 'none', palette);
  // Filled shapes get the thick cartoon outline unless told otherwise.
  const strokeToken = shape.stroke ?? (shape.fill && shape.fill !== 'none' ? '@outline' : 'none');
  const stroke = resolveColor(strokeToken, palette);
  const attrs = [
    `fill="${esc(fill)}"`,
    `stroke="${esc(stroke)}"`,
  ];
  if (stroke !== 'none') {
    attrs.push(`stroke-width="${esc(shape.strokeWidth ?? STROKE_DEFAULT)}"`);
    attrs.push('stroke-linecap="round"', 'stroke-linejoin="round"');
  }
  if (shape.opacity != null) attrs.push(`opacity="${esc(shape.opacity)}"`);
  if (shape.transform) attrs.push(`transform="${esc(shape.transform)}"`);
  const a = attrs.join(' ');

  switch (shape.type) {
    case 'path':
      return `<path d="${esc(shape.d)}" ${a}/>`;
    case 'circle':
      return `<circle cx="${esc(shape.cx)}" cy="${esc(shape.cy)}" r="${esc(shape.r)}" ${a}/>`;
    case 'ellipse':
      return `<ellipse cx="${esc(shape.cx)}" cy="${esc(shape.cy)}" rx="${esc(shape.rx)}" ry="${esc(shape.ry)}" ${a}/>`;
    case 'rect':
      return `<rect x="${esc(shape.x)}" y="${esc(shape.y)}" width="${esc(shape.width)}" height="${esc(shape.height)}"${shape.rx != null ? ` rx="${esc(shape.rx)}"` : ''} ${a}/>`;
    case 'polygon':
      return `<polygon points="${esc(shape.points)}" ${a}/>`;
    case 'line':
      return `<line x1="${esc(shape.x1)}" y1="${esc(shape.y1)}" x2="${esc(shape.x2)}" y2="${esc(shape.y2)}" ${a}/>`;
    default:
      throw new Error(`Unknown shape type: ${shape.type}`);
  }
}

function shapesToSVG(shapes, palette) {
  return shapes.map((s) => shapeToSVG(s, palette)).join('');
}

function socketTransform(socket) {
  const t = [`translate(${socket.x} ${socket.y})`];
  if (socket.angle) t.push(`rotate(${socket.angle})`);
  if (socket.scale != null && socket.scale !== 1) t.push(`scale(${socket.scale})`);
  return t.join(' ');
}

// Silhouette shapes only need geometry attributes, no styling.
function silhouetteToSVG(shapes) {
  return shapes
    .map((s) => shapeToSVG({ ...s, fill: '#000', stroke: 'none' }, NEUTRAL_PALETTE))
    .join('');
}

function partPalette(part, content) {
  const species = content.species[part.species];
  return species ? species.palette : NEUTRAL_PALETTE;
}

export function validateGenome(genome, content) {
  const errors = [];
  if (!content.frames[genome.frame]) errors.push(`Unknown frame: ${genome.frame}`);
  for (const [socketId, partId] of Object.entries(genome.parts ?? {})) {
    if (!SOCKETS.includes(socketId)) errors.push(`Unknown socket: ${socketId}`);
    if (partId == null) continue;
    const part = content.parts[partId];
    if (!part) errors.push(`Unknown part: ${partId}`);
    else if (part.slot !== slotOfSocket(socketId)) {
      errors.push(`${partId} is a ${part.slot} part, not ${slotOfSocket(socketId)}`);
    }
  }
  return errors;
}

// Care-state overlays (M1): generic, species-blind. Dirt smudges draw in
// torso space (clipped like a hide); sparkles draw in viewBox space.
const DIRT_SHAPES = [
  { type: 'ellipse', cx: -34, cy: 22, rx: 16, ry: 9, fill: '#6e5a3f', stroke: 'none', opacity: 0.4 },
  { type: 'ellipse', cx: 28, cy: -12, rx: 12, ry: 7, fill: '#6e5a3f', stroke: 'none', opacity: 0.35 },
  { type: 'ellipse', cx: 2, cy: 40, rx: 10, ry: 6, fill: '#5c4a33', stroke: 'none', opacity: 0.4 },
];
const SPARKLE_PATH = 'M 0 -12 L 3 -3 L 12 0 L 3 3 L 0 12 L -3 3 L -12 0 L -3 -3 Z';
const SPARKLE_SPOTS = [
  { x: -128, y: -118, s: 1 },
  { x: 138, y: -86, s: 0.7 },
  { x: -158, y: 36, s: 0.8 },
];

// R72 — a genome that came out of a SAVE can name content this build no
// longer has. `validateGenome` stays strict (a genome assembled wrong is a
// bug, and the suite depends on hearing about it), so the softening happens
// here instead, at the two readers whose genomes are persisted rather than
// generated: a captured unit sitting in a containment bay, and a battle
// saved mid-fight. Returns null when the FRAME is gone — there is no
// creature to draw without one — and otherwise drops only the sockets whose
// parts are gone, exactly as `chimeraGenome` does for the player's own.
export function drawableGenome(genome, content) {
  if (!genome || !content.frames[genome.frame]) return null;
  return {
    ...genome,
    parts: Object.fromEntries(
      Object.entries(genome.parts ?? {}).filter(([, id]) => id == null || content.parts[id])
    ),
  };
}

// R79 — the portrait EVERY screen should ask for.
//
// R72 softened the two readers whose genomes come out of a save. The other
// nine call `renderCreatureSVG` directly on a genome assembled from content
// — and that genome is only as good as the ids behind it, which a save also
// holds: `stockGenome` reads its frame off the animal's SPECIES, and
// `chimeraGenome` reads the frame the chimera was built on. Retire either
// and nine screens threw `Bad genome: Unknown frame`, which is a whole
// screen lost to one card.
//
// So: one call that always returns an <svg>. Drawable genomes draw. A
// genome whose chassis is gone gets an EMPTY CRATE — procedural, sized to
// the same viewBox, and captioned by the alt text rather than by a leaked
// id, so the row keeps its shape and the player sees an absence instead of
// a blank.
export function creaturePortrait(genome, content, opts = {}) {
  const drawable = drawableGenome(genome, content);
  // R81 — the anatomy is known and the geometry is still in flight. This is
  // the same idea as the crate below and for the same reason: the row keeps
  // its shape, and the player sees a thing happening rather than a blank.
  // In practice it is on screen for the length of one fetch, and only if
  // they open a fold before it lands.
  if (drawable && !hasGeometry(drawable, content)) return developingPortrait();
  if (drawable) return renderCreatureSVG(drawable, content, opts);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-230 -230 460 440" role="img" ` +
    `aria-label="No chassis on file for this specimen">` +
    `<g fill="none" stroke="${OUTLINE}" stroke-width="10" stroke-linejoin="round" opacity="0.45">` +
    `<path d="M-120 -40 L0 -100 L120 -40 L120 90 L0 150 L-120 90 Z"/>` +
    `<path d="M-120 -40 L0 20 L120 -40"/><path d="M0 20 L0 150"/>` +
    `</g>` +
    `<text x="0" y="205" text-anchor="middle" font-size="34" fill="${OUTLINE}" opacity="0.6">` +
    `chassis unfiled</text>` +
    `</svg>`
  );
}

// A specimen whose body has not been delivered yet. Deliberately not the
// bare chassis — that is a real creature with no parts on it, and a player
// should never be shown one thing while another is meant.
function developingPortrait() {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-230 -230 460 440" role="img" ` +
    `aria-label="Specimen still developing">` +
    `<g fill="none" stroke="${OUTLINE}" stroke-width="9" stroke-linecap="round" opacity="0.35">` +
    `<ellipse cx="0" cy="20" rx="132" ry="96"/>` +
    `<path d="M-132 20 a132 96 0 0 0 264 0"/>` +
    `<path d="M-58 -34 q58 46 116 0"/>` +
    `</g>` +
    `<text x="0" y="205" text-anchor="middle" font-size="34" fill="${OUTLINE}" opacity="0.5">` +
    `developing</text>` +
    `</svg>`
  );
}

// Returns a complete inline-<svg> string for the given genome.
// idPrefix keeps defs ids unique when several creatures share a document.
// condition: null | 'gleaming' | 'scruffy' (see ranch.conditionTier).
// extraScale multiplies the frame scale (juvenile portraits render small).
export function renderCreatureSVG(genome, content, { idPrefix = 'cw', condition = null, extraScale = 1 } = {}) {
  const errors = validateGenome(genome, content);
  if (errors.length) throw new Error('Bad genome: ' + errors.join('; '));

  const frame = content.frames[genome.frame];
  const clipId = `${idPrefix}-torso-clip`;

  // Torso wears the hide species' palette; bare frames read as lab-gray.
  const hidePart = genome.parts.hide ? content.parts[genome.parts.hide] : null;
  const torsoPalette = hidePart ? partPalette(hidePart, content) : NEUTRAL_PALETTE;

  const layers = [];
  for (const [slot, socketName] of LAYERS) {
    if (slot === 'torso') {
      layers.push(`<g>${shapesToSVG(frame.torso, torsoPalette)}</g>`);
      // Volume shading: flat-vector form, not gradients — occlusion at the
      // belly, rim light along the back, clipped to the silhouette.
      if (frame.form) {
        layers.push(`<g clip-path="url(#${clipId})">${shapesToSVG(frame.form, torsoPalette)}</g>`);
      }
      continue;
    }
    if (slot === 'organ' && condition === 'scruffy') {
      // Dirt sits just under the near limbs, clipped like a hide overlay —
      // drawn whether or not an organ is spliced.
      layers.push(`<g clip-path="url(#${clipId})">${shapesToSVG(DIRT_SHAPES, NEUTRAL_PALETTE)}</g>`);
    }
    const partId = genome.parts[slot];
    if (!partId) continue;
    const part = content.parts[partId];
    const palette = partPalette(part, content);

    if (slot === 'hide') {
      // Hide overlays draw in torso space, clipped to the torso silhouette.
      layers.push(`<g clip-path="url(#${clipId})">${shapesToSVG(part.shapes ?? [], palette)}</g>`);
      continue;
    }
    const socket = frame.sockets[socketName];
    if (!socket) continue; // frame simply lacks this socket — legal
    const shade = socket.shade ? ' style="filter:brightness(0.8)"' : '';
    layers.push(
      `<g transform="${socketTransform(socket)}"${shade}>${shapesToSVG(part.shapes ?? [], palette)}</g>`
    );
  }

  const scale = frame.scale * extraScale;
  const frameScale = scale !== 1 ? ` transform="scale(${scale})"` : '';
  const groundShadow = frame.shadow
    ? `<ellipse cx="0" cy="${frame.shadow.cy}" rx="${frame.shadow.rx}" ry="${frame.shadow.ry}" ` +
      `fill="${OUTLINE}" stroke="none" opacity="0.28"/>`
    : '';
  const sparkles = condition === 'gleaming'
    ? SPARKLE_SPOTS.map(
        (p) =>
          `<path d="${SPARKLE_PATH}" fill="#ffe9a3" stroke="none" opacity="0.9" ` +
          `transform="translate(${p.x} ${p.y}) scale(${p.s})"/>`
      ).join('')
    : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-230 -230 460 440" role="img" aria-label="Spliced creature">` +
    `<defs><clipPath id="${clipId}">${silhouetteToSVG(frame.silhouette)}</clipPath></defs>` +
    `<g${frameScale}>${groundShadow}${layers.join('')}</g>` +
    sparkles +
    `</svg>`
  );
}
