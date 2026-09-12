// Graduation Ceremony overlay: confirm → flash/kazoo/poof → results.
// The comedy is CSS keyframes and copy; the state change is one call to
// extract.js. Timeouts here are presentation only — never game logic.

import { creaturePortrait } from '../render/renderer.js';
import { stockGenome, conditionTier } from '../ranch/ranch.js';
import { extractAnimal, gradeFor, gradeOutlook, outlookLine } from './extract.js';
import * as sfx from '../audio/sfx.js';
import { renderIcon } from '../ui/icons.js';
import { speciesOf } from '../data/catalog.js';

const CEREMONY_MS = 2100;

export function runExtraction(overlay, ctx, animalId, onDone) {
  const { state, content } = ctx;
  const animal = state.ranch.stock.find((a) => a.id === animalId);
  if (!animal) return;
  const species = speciesOf(content, animal.species);
  const grade = gradeFor(animal, content, ctx.now());
  // R38. This is the screen where §3.3's "central economic decision" is
  // actually made, and it offered one word and no second term.
  const outlook = gradeOutlook(animal, content, ctx.now(), state);
  const portrait = creaturePortrait(stockGenome(animal.species, content), content, {
    idPrefix: 'grad',
    condition: (() => { const t = conditionTier(animal.condition); return t === 'fine' ? null : t; })(),
  });

  overlay.hidden = false;
  overlay.innerHTML = `
    <div class="ceremony card">
      <h3>Graduation Ceremony</h3>
      <div class="grad-portrait">${portrait}</div>
      <p>Enroll <strong>${animal.name}</strong> the ${species.name} in the graduation ceremony?</p>
      <p class="fine-print">Forecast: <span class="grade-badge grade-${grade.id}">${grade.name}</span> essence.
      This is permanent. ${animal.name} will become parts. Gleefully.</p>
      ${outlook.headroom > 0
        ? `<p class="fine-print outlook giving-up">Graduating now gives up ${outlook.headroom} grade${
            outlook.headroom === 1 ? '' : 's'
          }: ${outlookLine(outlook, animal.name)}</p>`
        : `<p class="fine-print outlook">${outlookLine(outlook, animal.name)}</p>`}
      <div class="ceremony-btns">
        <button type="button" id="grad-go" class="big-btn">${renderIcon('graduation-cap')} Graduate</button>
        <button type="button" id="grad-no">Not yet</button>
      </div>
    </div>`;

  overlay.querySelector('#grad-no').addEventListener('click', () => close(overlay, onDone, false));
  overlay.querySelector('#grad-go').addEventListener('click', () => {
    const result = extractAnimal(state, animalId, content, ctx.now());
    // R161 — A REFUSAL IS NOT A CEREMONY. This went straight to
    // `playCeremony` whatever came back, and a refusal has no tokens: the
    // kazoo played, the portrait poofed, the buttons were removed, and then
    // `showResults` read `result.tokens.map` on `undefined` and threw. The
    // overlay was left with no way out but closing the app — reported from
    // play, twice in a row, because a full vault stays full.
    if (!result.ok) return showRefusal(overlay, result, onDone);
    ctx.save();
    playCeremony(overlay, ctx, result, onDone);
  });
}

// R161 — the sentence R91 wrote and nothing ever showed. No state changed,
// so the only thing to offer is the way back; the Pens button is disabled
// with the same reason on it, so this is the belt to that pair of braces.
function showRefusal(overlay, result, onDone) {
  overlay.innerHTML = `
    <div class="ceremony card">
      <h3>Not today</h3>
      <p>${result.msg}</p>
      <div class="ceremony-btns">
        <button type="button" id="grad-back" class="big-btn">Back to the pens</button>
      </div>
    </div>`;
  overlay.querySelector('#grad-back').addEventListener('click', () => close(overlay, onDone, false));
}

function playCeremony(overlay, ctx, result, onDone) {
  sfx.play('graduate');
  const stage = overlay.querySelector('.grad-portrait');
  overlay.querySelector('.ceremony-btns').remove();
  overlay.querySelector('.fine-print').textContent = '~ kazoo noises ~';
  stage.classList.add('grad-shake');
  setTimeout(() => {
    stage.innerHTML = '<div class="poof"></div>';
    overlay.querySelector('.ceremony').classList.add('grad-flash');
  }, CEREMONY_MS * 0.55);
  setTimeout(() => showResults(overlay, ctx, result, onDone), CEREMONY_MS);
}

function showResults(overlay, ctx, result, onDone) {
  const { content } = ctx;
  const tokenRows = result.tokens
    .map((t) => {
      const part = content.parts[t.partId];
      return `<li><span class="grade-badge grade-${t.grade}">${result.grade.name}</span> ${part.name} <span class="lineage">essence of ${t.donor.name} ★${t.donor.stars}</span></li>`;
    })
    .join('');
  overlay.innerHTML = `
    <div class="ceremony card">
      <h3>${renderIcon('graduation-cap')} ${result.donorName} has ascended!</h3>
      <p class="fine-print">${result.msg}</p>
      <ul class="token-list">
        <li>${vialSVG(speciesOf(content, result.vial.species).palette.accent)} DNA Vial — ${speciesOf(content, result.vial.species).name} <span class="lineage">★${result.vial.stars}</span></li>
        ${tokenRows}
      </ul>
      <button type="button" id="grad-done" class="big-btn">Collect (pending assembly)</button>
    </div>`;
  overlay.querySelector('#grad-done').addEventListener('click', () => close(overlay, onDone, true));
}

function close(overlay, onDone, extracted) {
  overlay.hidden = true;
  overlay.innerHTML = '';
  onDone?.(extracted);
}

// Tiny inline-SVG vial icon (UI icons are procedural SVG, never emoji-art).
export function vialSVG(liquid) {
  return (
    `<svg class="vial" viewBox="0 0 20 30" aria-hidden="true">` +
    `<rect x="5" y="1" width="10" height="4" rx="1" fill="#8a84b0"/>` +
    `<path d="M 6 5 L 6 22 A 4 4 0 0 0 14 22 L 14 5 Z" fill="#3a3463" stroke="#8a84b0" stroke-width="1.5"/>` +
    `<path d="M 7 13 L 7 22 A 3 3 0 0 0 13 22 L 13 13 Z" fill="${liquid}"/>` +
    `</svg>`
  );
}
