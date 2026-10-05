// R208 — "IT'S ALIVE." The splice used to land as a card. Now it lands as a
// scene: lightning on a dark slab, a seam stitching itself shut across the
// torso, two eyes opening in the dark, the lights coming up. Then the card
// it always was. Skippable at any beat, and under reduced motion it is the
// last frame, held still. Lazy: only the Theater imports it.
//
// Every beat is a CSS animation with a delay, and the scene advances on one
// timer rather than on `animationend` (R75's rule for the graduation), so
// switching the motion off in style.css leaves nothing waiting.

import { creaturePortrait } from '../render/renderer.js';
import { extentOf } from '../render/thumb.js';
import * as sfx from '../audio/sfx.js';
import { copy } from '../util/text.js';

// The scene's length, and the beat the stinger lands on (the eyes).
export const ALIVE_MS = 2700;
const EYES_MS = 1300;

const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// The scene's own drawing, in the portrait's viewBox so the two line up:
// two bolts from the top of the frame, a stitched seam across the torso, and
// a pair of eyes at the head socket. Frame coordinates are scaled the way
// the renderer scales the chassis.
function effects(genome, content) {
  const frame = content.frames?.[genome.frame];
  if (!frame) return { back: '', front: '' };
  const k = frame.scale ?? 1;
  const torso = extentOf(frame.torso) ?? { x0: -90, x1: 90, y0: -40, y1: 60 };
  const y = Math.round(((torso.y0 + torso.y1) / 2) * k);
  const x0 = Math.round((torso.x0 + 24) * k);
  const x1 = Math.round((torso.x1 - 24) * k);
  let seam = `M ${x0} ${y} H ${x1}`;
  for (let x = x0 + 12; x < x1 - 6; x += 22) seam += ` M ${x - 6} ${y - 11} L ${x + 6} ${y + 11}`;
  const bolt = (cx, cls) => `<polyline class="alive-bolt ${cls}" points="${cx - 30},-230 ${cx + 6},-150 ${cx - 26},-138 ${cx + 14},-46" `
    + 'fill="none" stroke="#fff6a8" stroke-width="12" stroke-linejoin="round" stroke-linecap="round"/>';
  const head = frame.sockets?.head ?? { x: 70, y: -30 };
  const hx = Math.round(head.x * k);
  const hy = Math.round(head.y * k);
  const eye = (dx) => `<g class="alive-eye"><ellipse cx="${hx + dx}" cy="${hy - 12}" rx="15" ry="18" fill="#fffbe6"/>`
    + `<circle cx="${hx + dx + 4}" cy="${hy - 10}" r="7" fill="#2b2440"/></g>`;
  return {
    back: `${bolt(-70, 'b1')}${bolt(80, 'b2')}`,
    front: `<path class="alive-stitch" pathLength="100" d="${seam}" fill="none" stroke="#2b2440" stroke-width="7" stroke-linecap="round"/>`
      + eye(-14) + eye(20),
  };
}

const fx = (inner) => `<svg class="alive-fx" xmlns="http://www.w3.org/2000/svg" viewBox="-230 -230 460 440" aria-hidden="true" focusable="false">${inner}</svg>`;

// The whole card, for a genome. `still` is the reduced-motion frame: the
// same drawing with the lights already up, and a button that continues
// rather than skips, because there is nothing left to skip.
export function aliveMarkup(genome, content, { still = false } = {}) {
  const { back, front } = effects(genome, content);
  return `
    <div class="alive card${still ? ' is-still' : ' grad-flash'}" role="dialog" aria-label="${copy(content, 'theater.alive_label')}">
      <div class="alive-stage">
        ${fx(back)}
        <div class="alive-body">${creaturePortrait(genome, content, { idPrefix: 'alive' })}</div>
        ${fx(front)}
      </div>
      <h3 class="alive-title">${copy(content, 'theater.alive_title')}</h3>
      <button type="button" id="alive-skip" class="big-btn">${still ? copy(content, 'theater.alive_continue') : copy(content, 'theater.alive_skip')}</button>
    </div>`;
}

// Play it in the overlay, then hand over. `onDone` runs exactly once, on the
// timer or on a skip, whichever comes first.
export function playAlive(overlay, content, genome, onDone) {
  const still = reducedMotion();
  overlay.hidden = false;
  overlay.innerHTML = aliveMarkup(genome, content, { still });
  const timers = [];
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    timers.forEach(clearTimeout);
    document.removeEventListener('keydown', onKey);
    onDone();
  };
  const onKey = (e) => { if (e.key === 'Escape') finish(); };
  document.addEventListener('keydown', onKey);
  overlay.querySelector('#alive-skip')?.addEventListener('click', finish);
  overlay.querySelector('#alive-skip')?.focus();
  if (still) {
    sfx.play('alive');
    return;
  }
  timers.push(setTimeout(() => sfx.play('alive'), EYES_MS));
  timers.push(setTimeout(finish, ALIVE_MS));
}
