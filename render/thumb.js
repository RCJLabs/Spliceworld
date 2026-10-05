// R208 — ONE PART, DRAWN WHERE IT WOULD GO. The Theater's pickers listed
// parts by name, so choosing between two forelimbs meant remembering what a
// "Beetle Horn" looks like. A thumbnail is the real renderer drawing a genome
// that holds this one part, on a ghost of the chassis it is being chosen for,
// cropped to where that part sits. Lazy: only the Theater imports it.

import { renderCreatureSVG } from './renderer.js';

// Every frame position a genome socket draws into: `forelimb_near` and
// `forelimb_far` for `forelimbs`, `organ2` for `organ2` — the rule the
// content-coherence check in tools/smoke.js reads frames by.
const positionsOf = (frame, socketId) => Object.keys(frame.sockets ?? {})
  .filter((name) => name.replace(/_(near|far)$/, 's') === socketId);

// The extent of a shape list in its own coordinates. Paths are read as
// coordinate pairs, which is generous for curves and exact for the
// polygons and ellipses most parts are made of.
export function extentOf(shapes) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const take = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  };
  for (const s of shapes ?? []) {
    const mirror = /scale\(\s*-1/.test(s.transform ?? '') ? -1 : 1;
    const pt = (x, y) => take(mirror * x, y);
    if (s.type === 'rect') { pt(s.x, s.y); pt(s.x + s.width, s.y + s.height); }
    else if (s.type === 'circle') { pt(s.cx - s.r, s.cy - s.r); pt(s.cx + s.r, s.cy + s.r); }
    else if (s.type === 'ellipse') { pt(s.cx - s.rx, s.cy - s.ry); pt(s.cx + s.rx, s.cy + s.ry); }
    else if (s.type === 'line') { pt(s.x1, s.y1); pt(s.x2, s.y2); }
    else if (s.type === 'polygon' || s.type === 'polyline') {
      for (const p of String(s.points ?? '').trim().split(/\s+/)) { const [x, y] = p.split(',').map(Number); pt(x, y); }
    } else if (s.type === 'path') {
      const n = (String(s.d ?? '').match(/-?\d*\.?\d+/g) ?? []).map(Number);
      for (let i = 0; i + 1 < n.length; i += 2) pt(n[i], n[i + 1]);
    }
  }
  return x0 <= x1 ? { x0, x1, y0, y1 } : null;
}

// The part's box once it is bolted to the frame: the socket's scale and
// turn, its position, then the frame's own scale, as the renderer applies
// them.
function placedBox(ext, socket, frameScale) {
  const k = socket.scale ?? 1;
  const a = ((socket.angle ?? 0) * Math.PI) / 180;
  const box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  for (const [x, y] of [[ext.x0, ext.y0], [ext.x1, ext.y0], [ext.x0, ext.y1], [ext.x1, ext.y1]]) {
    const px = (socket.x + k * (x * Math.cos(a) - y * Math.sin(a))) * frameScale;
    const py = (socket.y + k * (x * Math.sin(a) + y * Math.cos(a))) * frameScale;
    box.x0 = Math.min(box.x0, px); box.x1 = Math.max(box.x1, px);
    box.y0 = Math.min(box.y0, py); box.y1 = Math.max(box.y1, py);
  }
  return box;
}

const union = (a, b) => (a ? { x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1) } : b);

// A square crop around the part, padded, and never so tight that a moth's
// organ fills the box like a rhino's head does: a floor keeps scale honest.
const MIN_SIDE = 90;
const PAD = 0.14;

// Where the part would sit on this chassis, as a viewBox string.
export function thumbBox(partId, frameId, socketId, content) {
  const frame = content.frames?.[frameId];
  const part = content.parts?.[partId];
  if (!frame || !part) return null;
  const scale = frame.scale ?? 1;
  let box = null;
  if (socketId === 'hide') {
    const torso = extentOf(frame.torso);
    if (torso) box = placedBox(torso, { x: 0, y: 0 }, scale);
  } else {
    const ext = extentOf(part.shapes);
    for (const pos of ext ? positionsOf(frame, socketId) : []) box = union(box, placedBox(ext, frame.sockets[pos], scale));
  }
  if (!box) return null;
  const side = Math.max(MIN_SIDE, box.x1 - box.x0, box.y1 - box.y0) * (1 + 2 * PAD);
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const r = (v) => Math.round(v * 10) / 10;
  return `${r(cx - side / 2)} ${r(cy - side / 2)} ${r(side)} ${r(side)}`;
}

let made = 0;

// The thumbnail itself: decorative (the row beside it names the part), so
// it is hidden from assistive tech rather than announced twice.
export function partThumbnail(partId, frameId, socketId, content) {
  const viewBox = thumbBox(partId, frameId, socketId, content);
  if (!viewBox) return '';
  const svg = renderCreatureSVG({ frame: frameId, parts: { [socketId]: partId } }, content,
    // A hide IS the torso's colouring, so it is the one part drawn on a solid
    // chassis rather than a ghost of one.
    { idPrefix: `pt${made++}`, ghost: socketId !== 'hide', viewBox });
  return svg.replace('role="img" aria-label="Spliced creature"', 'class="pick-thumb" aria-hidden="true" focusable="false"');
}
