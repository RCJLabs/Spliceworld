// Pens screen (M3): the chimera roster. Settling countdowns, instability,
// part manifests with lineage. Training, bond, and deployment arrive with
// later milestones — for now the pens are a proud, slightly humming nursery.

import { renderCreatureSVG } from '../render/renderer.js';
import { GRADES, GRADE_INDEX, salvagePreview, extractChimera } from './extract.js';
import { chimeraGenome, isSettled, settleRemainingMs, trainChimera, TRAINING } from './theater.js';
import { isInjured, obediencePercent } from '../battle/engine.js';
import { describe as describeTemperament } from './temperament.js';
import { fmtDuration } from '../ranch/ui.js';
import { pickerField, bindPickers, openPicker } from '../ui/picker.js';
import {
  activeVat, vatPlan, vatRemainingMs, startVat, cancelVat, isExhausted, chaosTuning,
} from './chaos.js';

let lastMsg = '';
let vatPick = { a: null, b: null };

// --- The Chaos Vat -------------------------------------------------------
//
// Two finished chimeras in, one genome out that neither of them was. The
// card's whole job is to make the PRICE unmissable before anything is
// sealed: both parents permanently drop a grade on every part, and no
// amount of subsequent regret gets it back.
function vatCard(state, content, t) {
  const running = activeVat(state);
  if (running) {
    return `
      <section class="card vat-card">
        <h3>🧪 The Chaos Vat</h3>
        <p class="ranch-msg">${running.parentNames.join(' × ')}</p>
        <p class="settle">Gestating… <strong class="countdown">${fmtDuration(vatRemainingMs(state, t))}</strong> remaining. The vat is making decisions and will not be taking questions.</p>
        <button type="button" id="vat-cancel" class="care-train">Drain the vat</button>
      </section>`;
  }

  const eligible = state.chimeras.filter(
    (c) => isSettled(c, t) && !isExhausted(c, t) && !isInjured(c, t)
  );
  if (state.chimeras.length < 2) {
    return `
      <section class="card vat-card">
        <h3>🧪 The Chaos Vat</h3>
        <p class="fine-print">Two settled chimeras go in. Something neither of them was comes out. You have ${state.chimeras.length}.</p>
      </section>`;
  }

  const label = (id) => state.chimeras.find((c) => c.id === id)?.name ?? 'Choose';
  const plan = vatPick.a && vatPick.b ? vatPlan(state, vatPick.a, vatPick.b, content, t) : null;
  const tune = chaosTuning(content);

  return `
    <section class="card vat-card">
      <h3>🧪 The Chaos Vat</h3>
      <p class="fine-print">Two settled chimeras in, one genome out that nobody designed. It may install a socket your Theater is not licensed to fill, and it may bring a part from neither parent.</p>
      ${pickerField({ id: 'vat-a', label: 'First donor', value: label(vatPick.a), hint: `${eligible.length} available` })}
      ${pickerField({ id: 'vat-b', label: 'Second donor', value: label(vatPick.b), hint: 'must be a different one' })}
      ${plan?.ok
        ? `<p class="vat-price">⚠ Both parents permanently drop <strong>one grade on every part</strong> — ${plan.gradeSteps} grade${plan.gradeSteps === 1 ? '' : 's'} in total, and you do not get them back. They then need ${tune.exhaustionHours}h off.</p>
           <p class="fine-print">Gestation ${plan.hours}h · fee <strong>$${plan.fee}</strong> · up to ${plan.sockets.length} sockets to inherit.</p>
           <button type="button" id="vat-go" class="big-btn" ${plan.affordable ? '' : 'disabled'}>🧪 Seal the vat — $${plan.fee}</button>`
        : `<p class="fine-print">${plan ? plan.msg : 'Pick two.'}</p>`}
    </section>`;
}

function bindVat(root, ctx, redraw) {
  const { state, content } = ctx;
  const t = ctx.now();
  const rows = (exclude) =>
    state.chimeras
      .filter((c) => c.id !== exclude)
      .map((c) => {
        const why = !isSettled(c, t) ? 'still settling'
          : isExhausted(c, t) ? `recovering — ${fmtDuration(c.exhaustedUntil - t)}`
            : isInjured(c, t) ? 'in the Infirmary'
              : `${content.frames[c.frame].name} · ${Object.keys(c.tokens).length} parts · instability ${c.instability}`;
        return {
          id: c.id,
          label: c.name,
          sub: why,
          disabled: !isSettled(c, t) || isExhausted(c, t) || isInjured(c, t),
        };
      });
  bindPickers(root, {
    'vat-a': () => ({
      title: 'First donor', subtitle: 'It will come out of this a grade poorer, on every part.',
      groups: [{ label: null, options: rows(vatPick.b) }], selectedId: vatPick.a ?? '',
      onPick: (v) => { vatPick.a = v; redraw(); },
    }),
    'vat-b': () => ({
      title: 'Second donor', subtitle: 'So will this one.',
      groups: [{ label: null, options: rows(vatPick.a) }], selectedId: vatPick.b ?? '',
      onPick: (v) => { vatPick.b = v; redraw(); },
    }),
  });
  root.querySelector('#vat-go')?.addEventListener('click', () => {
    const res = startVat(state, vatPick.a, vatPick.b, content, ctx.now());
    lastMsg = res.msg;
    if (res.ok) vatPick = { a: null, b: null };
    ctx.save();
    redraw();
  });
  root.querySelector('#vat-cancel')?.addEventListener('click', () => {
    lastMsg = cancelVat(state).msg;
    ctx.save();
    redraw();
  });
}

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
            ${(() => {
              const temp = describeTemperament(ch, content);
              if (!temp) {
                return settled ? '' : '<p class="meta temperament">Temperament: still forming.</p>';
              }
              return `<p class="meta temperament"><strong>${temp.label}</strong>${
                temp.perks.length ? ` — ${temp.perks.join('; ')}` : ' — no strong feelings about anything'
              }</p>`;
            })()}
            <p class="meta">Obedience: <strong>${obedience}%</strong>${
              obedience < 100
                ? ` — ${settled ? '' : 'unsettled; '}train to build bond${ch.instability > 0 ? ' (instability resists)' : ''}`
                : ' — follows orders to the letter. Suspiciously eager, even.'
            }</p>
            <div class="pen-actions">
              <button type="button" class="care-train" data-train="${ch.id}" ${trainReady ? '' : 'disabled'}>
                ${trainReady ? `🎯 Train ($${TRAINING.cost}, +${TRAINING.bondGain} bond)` : `Train (${fmtDuration(trainReadyAt - t)})`}
              </button>
              <button type="button" class="pen-dismantle" data-dismantle="${ch.id}">🔧 Dismantle</button>
            </div>
            ${isExhausted(ch, t) ? `<p class="settle">🧪 Recovering from the vat — ${fmtDuration(ch.exhaustedUntil - t)} left.</p>` : ''}
            ${ch.vatBorn ? `<p class="fine-print">Decanted from ${ch.vatBorn.parents.join(' × ')}.</p>` : ''}
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
    vatCard(state, content, t) +
    (cards ||
      `<section class="card"><p class="ranch-msg">No chimeras yet. The Splice tab accepts walk-ins.</p></section>`);

  bindVat(root, ctx, () => renderPensScreen(root, ctx));
  // Dismantling is irreversible and returns less than it consumed, so the
  // sheet shows the EXACT parts that will come back — seeded on the
  // chimera, so the preview and the outcome can never disagree.
  root.querySelectorAll('button[data-dismantle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ch = state.chimeras.find((c) => c.id === btn.dataset.dismantle);
      if (!ch) return;
      const preview = salvagePreview(state, ch, content);
      const kept = preview.tokens
        .map((tk) => `${content.parts[tk.partId].name} (${GRADES[GRADE_INDEX[tk.grade]].name}, was ${GRADES[GRADE_INDEX[tk.wasGrade]].name})`)
        .join(', ');
      const lost = preview.lose
        .map((socketId) => content.parts[ch.tokens[socketId].partId]?.name)
        .filter(Boolean)
        .join(', ');
      openPicker({
        title: `Dismantle ${ch.name}?`,
        subtitle: `${ch.name} leaves the roster for good. Salvage, not recycling: you get some of it back, a grade poorer.<br><br><strong>Recovered:</strong> ${kept}${
          lost ? `<br><br><strong>Lost:</strong> ${lost}` : ''
        }`,
        groups: [{
          label: null,
          options: [
            { id: 'go', label: `🔧 Dismantle ${ch.name}`, sub: `${preview.tokens.length} of ${Object.keys(ch.tokens).length} parts return to the vault` },
            { id: 'no', label: 'Leave them alone', sub: 'They are having a nice time' },
          ],
        }],
        selectedId: '',
        onPick: (value) => {
          if (value !== 'go') return;
          lastMsg = extractChimera(state, ch.id, content, ctx.now()).msg;
          ctx.save();
          renderPensScreen(root, ctx);
        },
      });
    });
  });
  root.querySelectorAll('button[data-train]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const result = trainChimera(state, btn.dataset.train, ctx.now(), content);
      lastMsg = result.msg;
      ctx.save();
      renderPensScreen(root, ctx);
    });
  });
}
