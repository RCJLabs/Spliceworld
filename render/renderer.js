// Genome → SVG renderer. Pure string builder, no DOM — must stay runnable
// headless in Node (tools/smoke.js) as well as in the browser.
//
// A genome is fully data: { frame: 'M', parts: { head: 'bear_head', ... } }.
// Frames define standardized sockets; parts define shapes in socket-local
// space (conventions documented in data/frames.json _doc). Any part fits
// any socket of its slot — that contract is what makes splicing free-form.

export const SLOTS = ['head', 'forelimbs', 'hindlimbs', 'tail', 'hide', 'organ'];

const OUTLINE = '#2b2440';
const WHITE = '#ffffff';
const NEUTRAL_PALETTE = { primary: '#c9c4b8', secondary: '#a8a396', accent: '#8a8578' };
const STROKE_DEFAULT = 5;

// Painter's order, back to front. Slot 'forelimbs'/'hindlimbs' render into
// both their _far and _near sockets.
const LAYERS = [
  ['forelimbs', 'forelimb_far'],
  ['hindlimbs', 'hindlimb_far'],
  ['tail', 'tail'],
  ['torso', null],
  ['hide', null],
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
  };
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
  for (const [slot, partId] of Object.entries(genome.parts ?? {})) {
    if (!SLOTS.includes(slot)) errors.push(`Unknown slot: ${slot}`);
    if (partId == null) continue;
    const part = content.parts[partId];
    if (!part) errors.push(`Unknown part: ${partId}`);
    else if (part.slot !== slot) errors.push(`${partId} is a ${part.slot} part, not ${slot}`);
  }
  return errors;
}

// Returns a complete inline-<svg> string for the given genome.
// idPrefix keeps defs ids unique when several creatures share a document.
export function renderCreatureSVG(genome, content, { idPrefix = 'cw' } = {}) {
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
      continue;
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

  const frameScale = frame.scale !== 1 ? ` transform="scale(${frame.scale})"` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-230 -230 460 440" role="img" aria-label="Spliced creature">` +
    `<defs><clipPath id="${clipId}">${silhouetteToSVG(frame.silhouette)}</clipPath></defs>` +
    `<g${frameScale}>${layers.join('')}</g>` +
    `</svg>`
  );
}
