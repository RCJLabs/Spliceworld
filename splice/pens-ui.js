// Pens screen (M3): the chimera roster. Settling countdowns, instability,
// part manifests with lineage. Training, bond, and deployment arrive with
// later milestones — for now the pens are a proud, slightly humming nursery.

import { renderCreatureSVG } from '../render/renderer.js';
import { GRADES, GRADE_INDEX } from './extract.js';
import { chimeraGenome, isSettled, settleRemainingMs, trainChimera, TRAINING } from './theater.js';
import { isInjured, obediencePercent } from '../battle/engine.js';
import { fmtDuration } from '../ranch/ui.js';

let lastMsg = '';

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
      const obedience = obediencePercent(ch, t);
      const trainReadyAt = (ch.lastTrainedAt ?? 0) + TRAINING.cooldownHours * 3600000;
      const trainReady = t >= trainReadyAt;
      return `
        <section class="card animal-card">
          <div class="portrait">${portrait}</div>
          <div class="animal-info">
            <h4>${ch.name}</h4>
            <p class="meta">${content.frames[ch.frame].name} chassis · instability ${ch.instability}/100 · bond ${ch.bond}/100</p>
            <p class="meta">Obedience: <strong>${obedience}%</strong>${
              obedience < 100
                ? ` — ${settled ? '' : 'unsettled; '}train to build bond${ch.instability > 0 ? ' (instability resists)' : ''}`
                : ' — follows orders to the letter. Suspiciously eager, even.'
            }</p>
            <button type="button" class="care-train" data-train="${ch.id}" ${trainReady ? '' : 'disabled'}>
              ${trainReady ? `🎯 Train ($${TRAINING.cost}, +${TRAINING.bondGain} bond)` : `Train (${fmtDuration(trainReadyAt - t)})`}
            </button>
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
    (lastMsg ? `<section class="card"><p class="ranch-msg">${lastMsg}</p></section>` : '') +
    (cards ||
      `<section class="card"><p class="ranch-msg">No chimeras yet. The Splice tab accepts walk-ins.</p></section>`);

  root.querySelectorAll('button[data-train]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const result = trainChimera(state, btn.dataset.train, ctx.now());
      lastMsg = result.msg;
      ctx.save();
      renderPensScreen(root, ctx);
    });
  });
}
