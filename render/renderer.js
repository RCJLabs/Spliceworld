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
  return {
    frames: byId(raw.frames.frames),
    parts: byId(raw.parts.parts),
    species: byId(raw.species.species),
    combos: raw.combos ? byId(raw.combos.combos) : {},
    enemies: raw.enemies ? byId(raw.enemies.units) : {},
    encounters: raw.enemies ? byId(raw.enemies.encounters) : {},
    tierScale: raw.enemies?.tierScale ?? [1, 1],
    keywords: raw.keywords ? byId(raw.keywords.keywords) : {},
    tagChart: raw.keywords ? raw.keywords.tagChart : [],
    regions: raw.regions ? byId(raw.regions.regions) : {},
    traits: raw.traits ? byId(raw.traits.traits) : {},
    classes: raw.classes ? byId(raw.classes.classes) : {},
    rivals: raw.rivals ? byId(raw.rivals.rivals) : {},
    rivalMeta: raw.rivals ? raw.rivals.rematch : null,
    directorRules: raw.director ? byId(raw.director.counters) : {},
    directorMeta: raw.director ? raw.director.tuning : null,
    facility: raw.facility ? byId(raw.facility.tracks) : {},
    philosophies: raw.philosophies ? byId(raw.philosophies.philosophies) : {},
    labNames: raw.philosophies ? raw.philosophies.labNames : null,
    classRules: raw.classes ? { advantage: raw.classes.advantage, disadvantage: raw.classes.disadvantage } : { advantage: 1, disadvantage: 1 },
    campaignMeta: raw.regions
      ? {
          threatGen2At: raw.regions.threatGen2At,
          rescueEncounter: raw.regions.rescueEncounter,
          contestation: raw.regions.contestation ?? null,
        }
      : { threatGen2At: Infinity, rescueEncounter: null, contestation: null },
  };
}

// Human units and vehicles: same shape interpreter, literal palettes.
export function renderUnitSVG(unit) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-110 -110 220 220" role="img" aria-label="${esc(unit.name)}">` +
    `<g>${unit.shapes.map((s) => shapeToSVG(s, NEUTRAL_PALETTE)).join('')}</g>` +
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
      layers.push(`<g clip-path="url(#${clipId})">${shapesToSVG(part.shapes, palette)}</g>`);
      continue;
    }
    const socket = frame.sockets[socketName];
    if (!socket) continue; // frame simply lacks this socket — legal
    const shade = socket.shade ? ' style="filter:brightness(0.8)"' : '';
    layers.push(
      `<g transform="${socketTransform(socket)}"${shade}>${shapesToSVG(part.shapes, palette)}</g>`
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
