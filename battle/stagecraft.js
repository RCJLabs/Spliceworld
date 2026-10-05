// R209 — BATTLES YOU CAN FEEL. The arena told you a fight was happening and
// showed you very little of it: a lunge, a shake and a number, whatever the
// move was and wherever it was thrown. This module is the part of the stage
// that knows what a beat LOOKS like — the effect a move's tags make, the
// scenery a fight is held in, and how a fighter leaves it — and it knows it
// all from `data/arena.json`, so a new tag's effect, a new region's backdrop
// and a new unit's exit are rows rather than code.
//
// Pure, like the engine whose beats it reads: it returns markup and keyframes
// and never touches the page, so the balance harness and the smoke suite can
// ask it every question the arena does. `battle/ui.js` is the half that
// plays what this hands back, and only when the player has not asked the
// screen to hold still.

import { shapesToSVG } from '../render/renderer.js';

// The renderer's own hand. Every colour in arena.json is literal, so no
// species palette applies.
const drawShapes = (shapes) => shapesToSVG(shapes ?? [], {});
import { regionOfNode } from '../campaign/map.js';
import { ABSENT_UNIT } from './engine.js';

// Effects and exit props share one box over the fighter; the scenery has
// its own, sliced to the stage and anchored at the floor.
const FX_BOX = '-100 -100 200 200';
const SCENE_BOX = '0 0 480 270';

// --- The scenery ----------------------------------------------------------

// Where this fight is held. A kind the data names (the Gauntlet's hangar)
// wins; otherwise the region the fight's node sits in; otherwise home, which
// is where a raid on the ranch and a rival calling round both happen.
export function backdropFor(battle, content) {
  const arena = content.arena;
  if (!arena?.backdrops) return null;
  const context = battle?.context ?? {};
  const id = arena.backdropByKind?.[context.kind]
    ?? (context.nodeId ? regionOfNode(content, context.nodeId)?.id : null)
    ?? arena.homeBackdrop;
  return arena.backdrops[id] ? id : arena.backdrops[arena.homeBackdrop] ? arena.homeBackdrop : null;
}

export function sceneMarkup(battle, content) {
  const id = backdropFor(battle, content);
  if (!id) return '';
  return `<div class="scene scene-${id}" aria-hidden="true"><svg viewBox="${SCENE_BOX}" preserveAspectRatio="xMidYMax slice" focusable="false">${
    drawShapes(content.arena.backdrops[id].shapes)}</svg></div>`;
}

// --- What a move looks like -----------------------------------------------

// Only a MOVE's beat carries `tags` (R209 put them there); recoil, thorns
// and a venom tick are damage too, and none of them is a move landing.
const MOVE_BEATS = new Set(['damage', 'immune', 'miss']);

// One effect per tag the move carries, layered; the plain slash for a move
// with no tags, or none this file has drawn yet.
export function effectsOf(beat, content) {
  const rows = content.arena?.effects;
  if (!rows || !MOVE_BEATS.has(beat?.kind) || !Array.isArray(beat.tags)) return [];
  const drawn = beat.tags.filter((t) => rows[t]);
  if (drawn.length) return drawn;
  return rows.plain ? ['plain'] : [];
}

// `dir` is +1 when the move lands on the foe (it arrives from the left, the
// way every effect is drawn) and -1 when it lands on you. A hit is drawn
// whole; one the target shrugged off is drawn faint; a miss goes wide.
export function effectMarkup(id, content, { dir = 1, kind = 'damage' } = {}) {
  const row = content.arena?.effects?.[id];
  if (!row) return '';
  const mode = kind === 'immune' ? ' is-immune' : kind === 'miss' ? ' is-miss' : '';
  return `<svg class="hit-fx hit-${id}${mode}" viewBox="${FX_BOX}" aria-hidden="true" focusable="false"><g${
    dir < 0 ? ' transform="scale(-1 1)"' : ''}>${drawShapes(row.shapes)}</g></svg>`;
}

// A crit shakes the stage: the engine's own (a cornered Brave creature) and
// the arena's (a hit at better than even odds, which the float has called a
// crit since M2).
export const shakes = (beat) => beat?.kind === 'damage' && Array.isArray(beat.tags) && (!!beat.crit || beat.mult > 1.05);

// --- How a fighter leaves -------------------------------------------------

// The exit a knockout plays. Yours nap; so does any genome-built opponent,
// because a chimera is a chimera whoever raised it. An enemy unit leaves the
// way its line in enemies.json says, by the exit named beside it.
export function exitOf(side, snap, battle, content) {
  const arena = content.arena;
  if (!arena?.exits) return null;
  let id;
  if (side === 'player') id = arena.chimeraExit;
  else {
    const refId = snap?.enemy?.refId;
    const unit = battle?.units?.[refId] ?? content.enemies?.[refId] ?? (refId === ABSENT_UNIT.id ? ABSENT_UNIT : null);
    id = unit?.genome ? arena.chimeraExit : unit?.exit;
  }
  return id && arena.exits[id] ? id : null;
}

// The prop an exit brings: a canopy, a hook, smoke on the floor. One that
// `turns` (speed lines) trails whichever way the fighter is going.
export function propMarkup(id, content, dir = 1, style = '') {
  const prop = content.arena?.exits?.[id]?.prop;
  if (!prop?.shapes?.length) return '';
  return `<svg class="exit-prop exit-${id}" viewBox="${FX_BOX}" aria-hidden="true" focusable="false"${
    style ? ` style="${style}"` : ''}><g${prop.turns && dir < 0 ? ' transform="scale(-1 1)"' : ''}>${drawShapes(prop.shapes)}</g></svg>`;
}

// --- Motion ---------------------------------------------------------------

// One frame of a motion row, in the file's small vocabulary: x/y in percent
// of the element, dx/dy in pixels, r in degrees, s (or sx/sy) as scale, o as
// opacity. `dir` turns the horizontal half, so "away" in an exit is away
// from the other fighter on either side of the stage. Every frame writes the
// same transform list, so any two of them interpolate.
function frameOf(f, dir) {
  const sx = f.sx ?? f.s ?? 1;
  const sy = f.sy ?? f.s ?? 1;
  return {
    transform: `translate(${(f.x ?? 0) * dir}%, ${f.y ?? 0}%) translate(${(f.dx ?? 0) * dir}px, ${f.dy ?? 0}px) rotate(${(f.r ?? 0) * dir}deg) scale(${sx}, ${sy})`,
    opacity: f.o ?? 1,
  };
}

// A named motion as Web Animations keyframes and timing.
export function motionOf(name, content, dir = 1) {
  const m = content.arena?.motions?.[name];
  if (!m?.frames?.length) return null;
  const frames = m.frames.map((f) => (f.at != null ? { ...frameOf(f, dir), offset: f.at } : frameOf(f, dir)));
  return { frames, ms: m.ms ?? 500, easing: m.easing ?? 'ease-out', fill: m.fill ?? 'none' };
}

// Where a motion comes to rest, as an inline style: a creature still napping
// when the arena redraws for its replacement is drawn asleep, not standing.
export function restOf(name, content, dir = 1) {
  const m = content.arena?.motions?.[name];
  if (!m?.frames?.length) return '';
  const f = frameOf(m.frames[m.frames.length - 1], dir);
  return `transform:${f.transform};opacity:${f.opacity}`;
}
