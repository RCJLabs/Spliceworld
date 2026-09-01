// Pens screen (M3): the chimera roster. Settling countdowns, instability,
// part manifests with lineage. Training, bond, and deployment arrive with
// later milestones — for now the pens are a proud, slightly humming nursery.

import { renderCreatureSVG } from '../render/renderer.js';
import { GRADES, GRADE_INDEX, salvagePreview, extractChimera } from './extract.js';
import {
  chimeraGenome, isSettled, settleRemainingMs, trainChimera, TRAINING,
  setMoveset, moveTrainingReady,
} from './theater.js';
import { MOVE_SLOTS, activeMoves, moveSummary, moveDetail } from '../battle/moves.js';
import { toggleRow } from '../ui/picker.js';
import { movesFromTokens } from '../battle/engine.js';
import { analyze } from './physiology.js';
import { dossierRows, dossierSummary } from './dossier.js';
import { xpProgress, maxLevel } from '../battle/veterancy.js';
import { renameCreature } from './theater.js';

// Everything this genome grants, which is what the four slots are chosen
// FROM. One definition, shared with the battle screen and the harness.
// R33. `analyze` is already run per chimera for the move list; the dossier
// reads the SAME report, so the two can never disagree about a number.
function reportOf(chimera, content) {
  const tokens = Object.values(chimera.tokens ?? {});
  return analyze(chimera.frame, tokens, content, tokens.length);
}

function knownMovesOf(chimera, content) {
  const tokens = Object.values(chimera.tokens);
  return movesFromTokens(tokens, analyze(chimera.frame, tokens, content), content)
    .map((m) => ({ ...m, id: m.source }));
}
import { isInjured, obediencePercent } from '../battle/engine.js';
import { describe as describeTemperament } from './temperament.js';
import { scarsOf, describeScar, treatInjury, treatmentCost } from './scars.js';
import { fmtDuration } from '../ranch/ui.js';
import { pickerField, bindPickers, openPicker, openPrompt } from '../ui/picker.js';
import {
  activeVat, vatPlan, vatRemainingMs, startVat, cancelVat, isExhausted, chaosTuning,
} from './chaos.js';
import { fieldNote, bindFieldNote, collapsibleCard, bindFolds, isOpen } from '../ui/cards.js';
import { guideForScreen } from '../ranch/onboarding.js';

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
      // R44: a shut fold builds NOTHING heavy. A portrait is ~12KB of
      // inline SVG, so twelve shut creatures would otherwise mean 145KB of
      // DOM that renders nothing — hiding it with an attribute costs the
      // phone the same as showing it.
      const open = isOpen(state, `pen-${ch.id}`, false);
      const portrait = open
        ? renderCreatureSVG(chimeraGenome(ch, content), content, { idPrefix: `pen-${ch.id}` })
        : '';
      const manifest = !open ? '' : Object.entries(ch.tokens)
        .map(([slot, token]) => {
          const part = content.parts[token.partId];
          const grade = GRADES[GRADE_INDEX[token.grade]];
          return `<li><span class="grade-badge grade-${token.grade}">${grade.name}</span> ${part.name} <span class="lineage">essence of ${token.donor.name} ★${token.donor.stars}</span></li>`;
        })
        .join('');
      const obedience = obediencePercent(ch, t);
      const trainReadyAt = (ch.lastTrainedAt ?? 0) + TRAINING.cooldownHours * 3600000;
      const trainReady = t >= trainReadyAt;
      // R44. Measured at 380px: one chimera card is 1081px — taller than the
      // phone — so nine of them made the Pens 10,470px, thirteen screens of
      // scrolling. R15 rebuilt the War Room for being 3,884px; this was
      // 2.7x worse than the screen that phase was written to rescue, and
      // R41 made keeping creatures the whole point, so it only grows.
      //
      // Same fix, same machinery: fold each creature to a summary row and
      // open the one you are working on. R15's rule carries over — ALERTS
      // NEVER HIDE — so the Infirmary clock and the settling clock are on
      // the shut row, in the badge, where they cost a creature if missed.
      const prog = xpProgress(ch.xp ?? 0, content);
      const cls = reportOf(ch, content).creatureClass;
      const clsIcon = cls ? content.classes[cls].icon : '◇';
      const hurt = isInjured(ch, t);
      const badge = hurt
        ? `<span class="pen-alert">⚕ ${fmtDuration(ch.injury.until - t)}</span>`
        : !settled
          ? `<span class="pen-alert">⏳ ${fmtDuration(ch.settleUntil - t)}</span>`
          : trainReady
            ? '<span class="pen-ready">ready · can train</span>'
            : '<span class="pen-ready">ready</span>';
      const summary = `${clsIcon} Lv ${prog.level} · bond ${ch.bond}/100 · obedience ${obedience}%${
        scarsOf(ch, content).length ? ` · ${scarsOf(ch, content).length} scar${scarsOf(ch, content).length === 1 ? '' : 's'}` : ''
      }`;
      const body = !open ? '' : `
        <section class="card animal-card">
          <div class="portrait">${portrait}</div>
          <div class="animal-info">
            <h4>${ch.name} <button type="button" class="rename-btn" data-rename="${ch.id}" aria-label="Rename ${ch.name}">✏️</button></h4>
            ${(() => {
              // R41: what it has been through, beside what it is built from.
              const prog = xpProgress(ch.xp ?? 0, content);
              const bar = prog.atCap
                ? '<span class="xp-cap">MAX</span>'
                : `<span class="xp-bar"><span class="xp-fill" style="width:${Math.round((prog.into / Math.max(1, prog.span)) * 100)}%"></span></span>
                   <span class="fine-print">${prog.into}/${prog.span} xp</span>`;
              return `<p class="meta level-row"><strong class="level-chip">Lv ${prog.level}</strong>${
                prog.atCap ? ` <span class="fine-print">of ${maxLevel(content)} — a finished veteran</span>` : ''
              } ${bar}</p>`;
            })()}
            <p class="meta">${content.frames[ch.frame].name} chassis · instability ${ch.instability}/100 · bond ${ch.bond}/100</p>
            ${(() => {
              // R33. Everything physiology knows, on the creature rather than
              // on the bench. Measured before building it: of the eight rows
              // the Theater shows while you build, only class and instability
              // reached a player afterwards — flight, speed, mass, lift,
              // power-to-weight, the thermal band and the field tags reached
              // them nowhere, and R32 had just made the first of those
              // decisive. Folded shut by default: the card is already long,
              // and the summary carries the three facts worth a glance.
              const rep = reportOf(ch, content);
              const rows = dossierRows(rep, content)
                .map((r) => `<li><span class="dossier-label">${r.label}</span>` +
                  `<strong class="dossier-value">${r.value}</strong>` +
                  `<span class="dossier-note">${r.note}</span></li>`)
                .join('');
              return `
                <details class="dossier">
                  <summary><span class="dossier-sum">${dossierSummary(rep, content)}</span></summary>
                  <ul class="dossier-rows">${rows}</ul>
                </details>`;
            })()}
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
            ${(() => {
              // R30. A chimera knows every move its anatomy grants and can
              // press four. This is where you choose which four, and it is
              // on the pens card rather than the briefing screen because it
              // is husbandry: the same place you build bond and treat scars.
              const known = knownMovesOf(ch, content);
              const active = activeMoves(known, ch.moveset);
              const activeIds = new Set(active.map((m) => m.id));
              const mt = moveTrainingReady(ch, t, content);
              return `
              <div class="moveset">
                <p class="meta"><strong>Moves</strong> <span class="lineage">${active.length}/${MOVE_SLOTS} slots · knows ${known.length}</span></p>
                <ul class="token-list move-list">${active.map((m) => `
                  <li><strong>${m.name}</strong> <span class="lineage">${m.power > 0 ? `${m.power} power` : 'utility'} · ${m.cost}⚡</span>
                  <br><span class="fine-print">${moveSummary(m, content)}</span></li>`).join('')}</ul>
                ${known.length > MOVE_SLOTS ? `
                  <button type="button" class="care-train" data-moves="${ch.id}" ${mt.ready ? '' : 'disabled'}>
                    ${mt.ready
                      ? `🧠 Retrain moves ($${mt.cost})`
                      : `Retrain moves (${fmtDuration(mt.msRemaining)})`}
                  </button>
                  <p class="fine-print">${known.length - active.length} more it knows and cannot currently press. Swapping one in means giving one up.</p>`
                  : '<p class="fine-print">It knows every move it can carry. Splice it something new to give it a choice.</p>'}
              </div>`;
            })()}
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
              ? `<p class="settle">🩹 Infirmary: ${ch.injury.name} — ${fmtDuration(ch.injury.until - t)} of dramatic convalescing left.</p>
                 <p class="fine-print scar-warn">Left to itself it may set badly and stay that way. Treating it costs money and guarantees it will not.</p>
                 <button type="button" class="care-train" data-treat="${ch.id}">🩺 Treat ($${treatmentCost(ch, content, t, state)})</button>`
              : ''}
            ${(() => {
              const scars = scarsOf(ch, content).map((sc) => describeScar(sc, ch.name));
              if (!scars.length) return '';
              return `<ul class="token-list scar-list">${scars
                .map((sc) => `<li><strong>${sc.name}</strong> <span class="lineage">${sc.summary}</span><br><span class="fine-print">${sc.line}</span></li>`)
                .join('')}</ul>`;
            })()}
            <ul class="token-list">${manifest}</ul>
          </div>
        </section>`;
      return collapsibleCard({
        id: `pen-${ch.id}`,
        title: `${ch.name}`,
        badge,
        summary,
        body,
        // Shut by default: the summary row carries what a glance needs, and
        // a stable is a list you scan before it is a creature you open.
        open,
        extraClass: `pen-fold${hurt ? ' pen-hurt' : ''}${settled ? '' : ' pen-settling'}`,
      });
    })
    .join('');

  const note = fieldNote(guideForScreen(state, content, t, 'pens'));
  root.innerHTML = note +
    (lastMsg ? `<section class="card"><p class="ranch-msg">${lastMsg}</p></section>` : '') +
    vatCard(state, content, t) +
    (cards ||
      `<section class="card"><p class="ranch-msg">No chimeras yet. The Splice tab accepts walk-ins.</p></section>`);

  // R41: a creature you keep for a whole campaign is a creature you name.
  root.querySelectorAll('button[data-rename]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ch = state.chimeras.find((c) => c.id === btn.dataset.rename);
      if (!ch) return;
      openPrompt({
        title: 'Rename the specimen',
        label: 'It will answer to (eventually):',
        value: ch.name,
        onSubmit: (value) => {
          const res = renameCreature(state.chimeras, ch.id, value);
          if (res.ok) ctx.save();
          lastMsg = res.msg;
          renderPensScreen(root, ctx);
        },
      });
    });
  });

  bindFolds(root, ctx, () => renderPensScreen(root, ctx));
  bindFieldNote(root, ctx, () => renderPensScreen(root, ctx));
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
  root.querySelectorAll('button[data-treat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      lastMsg = treatInjury(state, btn.dataset.treat, content, ctx.now()).msg;
      ctx.save();
      renderPensScreen(root, ctx);
    });
  });
  // R30: the retraining sheet. Every move the creature knows, four
  // checkable, and it will not let you leave with five or with none —
  // "something has to go" is the mechanic, so the sheet says which.
  root.querySelectorAll('button[data-moves]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ch = state.chimeras.find((c) => c.id === btn.dataset.moves);
      if (!ch) return;
      const known = knownMovesOf(ch, content);
      const chosen = new Set(activeMoves(known, ch.moveset).map((m) => m.id));
      const overlay = document.querySelector('#overlay');
      overlay.hidden = false;
      const draw = () => {
        const full = chosen.size >= MOVE_SLOTS;
        overlay.innerHTML = `
          <div class="sheet move-sheet">
            <div class="pick-head">
              <h3>${ch.name}'s repertoire</h3>
              <p class="fine-print">Pick ${MOVE_SLOTS}. It knows ${known.length}. Learning one costs $${moveTrainingReady(ch, ctx.now(), content).cost} and a rest; reordering is free.</p>
              <button type="button" class="pick-close" data-close="1" aria-label="Close">&#10005;</button>
            </div>
            <p class="ranch-msg" id="mv-count">${chosen.size}/${MOVE_SLOTS} slots filled${full ? ' — uncheck one to swap' : ''}</p>
            <div class="pick-list">${known.map((m) => toggleRow({
              id: m.id,
              label: m.name,
              sub: `${m.power > 0 ? `${m.power} power` : 'utility'} · ${m.cost}⚡ · ${m.acc}% · ${moveSummary(m, content)}`,
              checked: chosen.has(m.id),
              // At four, the only move left is to drop one — which is the
              // mechanic, so the sheet stops rather than scolding.
              disabled: !chosen.has(m.id) && full,
            })).join('')}</div>
            <button type="button" class="care-train" id="mv-save" ${chosen.size ? '' : 'disabled'}>Train it</button>
          </div>`;
        overlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { overlay.hidden = true; }));
        overlay.querySelectorAll('[data-toggle]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const id = btn.dataset.toggle;
            if (chosen.has(id)) chosen.delete(id); else chosen.add(id);
            draw();
          });
        });
        overlay.querySelector('#mv-save')?.addEventListener('click', () => {
          const res = setMoveset(state, ch.id, [...chosen], known, ctx.now(), content);
          if (res.ok) {
            overlay.hidden = true;
            lastMsg = res.msg;
            ctx.save();
            renderPensScreen(root, ctx);
            return;
          }
          // A refusal is answered in place — closing the sheet on a failure
          // would hide the reason it failed.
          const note = overlay.querySelector('#mv-count');
          if (note) note.textContent = res.msg;
        });
      };
      draw();
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
