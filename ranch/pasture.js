// R210 — THE RANCH THROUGH THE WINDOW. The header has painted the sky for
// the hour and the weather since R105, and under it the Ranch was rows of
// text: a herd you could only read about. This is the field under that sky,
// with the player's own animals in it, grazing; munching when they have been
// fed, shining when they have been groomed. The barn's window glows with
// whatever is in the incubator, the season is the grass, the calendar's
// weather falls on all of it, and the lamps come on after dark.
//
// Pure, like the arena's stagecraft: state in, markup out, the page never
// touched. `main.js` fetches it after the first paint, the way it fetches the
// sky, and hands `pastureMarkup` to the Ranch as `ctx.pasture`; until then the Ranch draws
// what it always drew, so the boot budget never sees any of this. Every
// animal is a button carrying the `data-open-fold` the Ranch's agenda rows
// already use, so the screen's own handler opens its card. What it draws is
// `data/pasture.json`, and why it is laid out as it is is in that file's note.

import { creaturePortrait, shapesToSVG } from '../render/renderer.js';
import { stockGenome, ageStage } from './ranch.js';
import { seasonOf, weatherOf, skyOf } from '../campaign/calendar.js';
import { mulberry32, hashString } from '../util/rng.js';
import { copy, esc } from '../util/text.js';

const HOUR = 3600000;
const BOX = '0 0 400 160';
const STAGE_SIZE = { juvenile: 0.72, adult: 0.9, prime: 1, elder: 0.96 };

// What the pasture shows at this instant: the season's grass, the day's
// weather, the hour, whether the lamps are lit, how many eggs glow, and which
// animals stand in which spot. `herd` is the Ranch's roster in its own order,
// so the animals out here are the ones at the top of the list below.
export function pastureScene(state, content, now, herd = state.ranch.stock) {
  const p = content.pasture;
  if (!p?.spots?.length) return null;
  const seasons = Object.keys(p.seasons ?? {});
  const season = seasonOf(state, content, now).id;
  const weather = weatherOf(state, content, now).id;
  const sky = skyOf(state, content, now);
  const shown = herd.slice(0, Math.min(p.cap ?? p.spots.length, p.spots.length));
  return {
    season: seasons.includes(season) ? season : seasons[0],
    weather: p.weather?.[weather] ? weather : 'clear',
    band: sky.band,
    lit: (p.lampBands ?? []).includes(sky.band),
    tint: sky.tint,
    dark: sky.alpha ?? 0,
    eggs: Math.min(state.ranch.eggs.length, p.eggSlots?.length ?? 0),
    animals: shown.map((animal, i) => ({
      animal,
      spot: p.spots[i],
      fed: now - (animal.lastCare?.feed ?? 0) < (p.fedHours ?? 6) * HOUR,
      groomed: now - (animal.lastCare?.groom ?? 0) < (p.groomedHours ?? 6) * HOUR,
      stage: ageStage(animal, content, now),
    })),
    more: Math.max(0, herd.length - shown.length),
  };
}

// One animal: its own drawing, standing in its spot, a button that opens its
// card. Seeded by the animal, so it keeps its facing and its place in the
// walk from one render to the next.
function animalButton(content, { animal, spot, fed, groomed, stage }) {
  const p = content.pasture;
  const rng = mulberry32(hashString(`${animal.id}:pasture`));
  const left = rng() < 0.5;
  const walk = (rng() * 9).toFixed(2);
  const portrait = creaturePortrait(stockGenome(animal.species, content), content, {
    idPrefix: `pa-${animal.id}`, extraScale: STAGE_SIZE[stage] ?? 1, viewBox: p.viewBox,
  }).replace('role="img"', 'aria-hidden="true" focusable="false"');
  const extra = (fed ? `<svg class="pasture-hay" viewBox="-12 -12 24 14" aria-hidden="true" focusable="false">${shapesToSVG(p.fed ?? [], {})}</svg>` : '')
    + (groomed ? `<svg class="pasture-shine" viewBox="-10 -10 20 20" aria-hidden="true" focusable="false">${shapesToSVG(p.shine ?? [], {})}</svg>` : '');
  return `<button type="button" class="pasture-animal${fed ? ' is-fed' : ''}${groomed ? ' is-groomed' : ''}" data-open-fold="ranch-${esc(animal.id)}"`
    + ` style="left:${spot.x}%;top:${spot.y}%;width:${spot.w}%" aria-label="${esc(copy(content, 'pasture.open', { name: animal.name }))}">`
    + `<span class="pasture-body" style="animation-delay:-${walk}s"><span class="pasture-face${left ? ' is-left' : ''}">${portrait}</span></span>${extra}</button>`;
}

export function pastureMarkup(state, content, now, herd) {
  const scene = pastureScene(state, content, now, herd);
  if (!scene) return '';
  const p = content.pasture;
  const palette = p.seasons[scene.season]?.palette ?? {};
  const eggs = (p.eggSlots ?? []).slice(0, scene.eggs).map((e) =>
    `<circle cx="${e.cx}" cy="${e.cy}" r="5" fill="#ffd36b" opacity="0.45"/><ellipse cx="${e.cx}" cy="${e.cy}" rx="2.4" ry="3.2" fill="#fff0b8"/>`).join('');
  const heads = (p.lamps ?? []).map((l) => `<rect x="${l.cx - 5}" y="${l.cy - 6}" width="10" height="5" fill="#2b2440"/>`
    + `<circle cx="${l.cx}" cy="${l.cy}" r="3.5" fill="${scene.lit ? '#fff3c0' : '#6b6560'}"/>`).join('');
  const glow = scene.lit ? (p.lamps ?? []).map((l) => `<circle cx="${l.cx}" cy="${l.cy}" r="18" fill="#ffd36b" opacity="0.35"/>`).join('') : '';
  const svg = (cls, body) => `<svg class="${cls}" viewBox="${BOX}" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">${body}</svg>`;
  // Behind the animals: the land, the season, the barn and fence, the eggs in
  // the window. In front of them: the weather, the hour's dark, and the lamps'
  // light, so a downpour falls on the goats and the night darkens them too.
  return `<section class="pasture season-${scene.season} weather-${scene.weather} band-${scene.band}" aria-label="${esc(copy(content, 'pasture.label'))}">`
    + '<div class="pasture-field">'
    + svg('pasture-land', shapesToSVG(p.land ?? [], palette) + shapesToSVG(p.seasons[scene.season]?.shapes ?? [], palette)
      + shapesToSVG(p.scenery ?? [], palette) + eggs + heads)
    + scene.animals.map((a) => animalButton(content, a)).join('')
    + svg('pasture-sky', shapesToSVG(p.weather[scene.weather]?.shapes ?? [], palette)
      + (scene.dark ? `<rect x="0" y="0" width="400" height="160" fill="${scene.tint}" opacity="${scene.dark}"/>` : '') + glow)
    + '</div>'
    + (scene.more ? `<p class="pasture-more">${copy(content, 'pasture.more', { n: scene.more })}</p>` : '')
    + '</section>';
}
