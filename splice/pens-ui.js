// Pens screen (M3): the chimera roster. Settling countdowns, instability,
// part manifests with lineage. Training, bond, and deployment arrive with
// later milestones — for now the pens are a proud, slightly humming nursery.

import { renderCreatureSVG } from '../render/renderer.js';
import { GRADES, GRADE_INDEX } from './extract.js';
import { chimeraGenome, isSettled, settleRemainingMs } from './theater.js';
import { isInjured } from '../battle/engine.js';
import { fmtDuration } from '../ranch/ui.js';

export function renderPensScreen(root, ctx) {
  const { state, content, now } = ctx;
  const t = now();

  const cards = state.chimeras
    .map((ch) => {
      const settled = isSettled(ch, t);
      const portrait = renderCreatureSVG(chimeraGenome(ch, content), content, { idPrefix: `pen-${ch.id}` });
      const manifest = Object.entries(ch.tokens)
        .map(([slot, token]) => {
          const part = content.parts[token.partId];
          const grade = GRADES[GRADE_INDEX[token.grade]];
          return `<li><span class="grade-badge grade-${token.grade}">${grade.name}</span> ${part.name} <span class="lineage">essence of ${token.donor.name} ★${token.donor.stars}</span></li>`;
        })
        .join('');
      return `
        <section class="card animal-card">
          <div class="portrait">${portrait}</div>
          <div class="animal-info">
            <h4>${ch.name}</h4>
            <p class="meta">${content.frames[ch.frame].name} chassis · instability ${ch.instability}/100 · bond ${ch.bond}</p>
            <p class="settle ${settled ? 'settled' : ''}">${
              settled
                ? 'Settled ✓ — cleared for deployment'
                : `Settling… ${fmtDuration(settleRemainingMs(ch, t))} remaining. No sudden noises.`
            }</p>
            ${isInjured(ch, t)
              ? `<p class="settle">🩹 Infirmary: ${ch.injury.name} — ${fmtDuration(ch.injury.until - t)} of dramatic convalescing left.</p>`
              : ''}
            <ul class="token-list">${manifest}</ul>
          </div>
        </section>`;
    })
    .join('');

  root.innerHTML =
    cards ||
    `<section class="card"><p class="ranch-msg">No chimeras yet. The Surgery Theater accepts walk-ins.</p></section>`;
}
