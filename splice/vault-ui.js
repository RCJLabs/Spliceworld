// Gene Vault screen: DNA vials and extracted part tokens with lineage.
// Part tokens went to the Surgery Theater in M3. Vials went NOWHERE until
// R31 — every extraction produced one and this screen listed it, forever.
// The Resequencer is what spends them, and it lives here because this is
// where the player already goes to look at them.

import { SLOTS } from '../render/renderer.js';
import { GRADES, GRADE_INDEX } from './extract.js';
import { vialSVG } from './extract-ui.js';
import {
  resequencePlan, startResequence, cancelResequence,
  activeResequence, resequenceRemainingMs, resequencerTuning,
} from './resequencer.js';
import { fmtDuration } from '../ranch/ui.js';
// R39. The Vault was the one screen with no field-note slot at all — five
// screens wired this and the sixth did not, so a note here could not have
// been shown even if one had existed. The suite's hand-written screen list
// happened to omit `vault` too, so nothing ever asked.
import { fieldNote, bindFieldNote } from '../ui/cards.js';
import { guideForScreen } from '../ranch/onboarding.js';

let lastMsg = '';

const SLOT_LABELS = {
  head: 'Head', forelimbs: 'Forelimbs', hindlimbs: 'Hindlimbs',
  tail: 'Tail', hide: 'Hide', organ: 'Organ',
};

export function renderVaultScreen(root, ctx) {
  const { state, content } = ctx;
  const inv = state.inventory;

  const t = ctx.now();
  const run = activeResequence(state);
  const penRoom = state.ranch.stock.length < state.ranch.penCapacity;

  // R52. Measured at 380px: this card was 4,502px of a 5,999px Vault at a
  // completionist's inventory — 75% of the screen for FORTY items, while
  // the token list directly below it carried 244 in 1,485px. The whole
  // difference is that the tokens fold by species and the vials never did.
  // R31 gave each vial a plan line and a Resequence button and left the
  // list flat, so the card grew a live button per vial forever.
  //
  // Same fold, same class, same screen — the inconsistency was the bug.
  const vialRow = (v) => {
    const sp = content.species[v.species];
    const plan = resequencePlan(state, v.id, content, t);
    return `<li>${vialSVG(sp.palette.accent)} ${sp.name} essence <span class="lineage">from ${v.donorName} ★${v.stars}</span>${
      plan.ok
        ? `<br><span class="fine-print">${Math.round(plan.successChance * 100)}% to take · ${
            Math.round(plan.mutationChance * 100)}% chance of a new gene · ${plan.hours}h</span>
           <button type="button" class="care-train" data-reseq="${v.id}">🧬 Resequence</button>`
        : ''
    }</li>`;
  };
  const vialsBySpecies = new Map();
  for (const v of inv.vials) {
    // A vial whose species left the roster is skipped rather than thrown on,
    // matching what the token loop below has always done.
    if (!content.species[v.species]) continue;
    if (!vialsBySpecies.has(v.species)) vialsBySpecies.set(v.species, []);
    vialsBySpecies.get(v.species).push(v);
  }
  // Flat while the rack is small, and FLAT rather than open-by-default: an
  // open <details> still pays for its summary row, which the first cut of
  // this measured the hard way — three vials went 447px to 575px because
  // three open folds added three summaries and saved nothing. Below the
  // threshold the card renders exactly what it always did.
  const vials = inv.vials.length <= 4
    ? (inv.vials.length
        ? `<ul class="token-list">${inv.vials.filter((v) => content.species[v.species]).map(vialRow).join('')}</ul>`
        : '<p class="ranch-msg">No essence on file. The centrifuge is bored.</p>')
    : vialsBySpecies.size
    ? [...vialsBySpecies.entries()]
        .map(([id, vs]) => ({ sp: content.species[id], vs, best: vs.reduce((m, v) => Math.max(m, v.stars), 0) }))
        .sort((a, b) => b.best - a.best || (a.sp.name > b.sp.name ? 1 : -1))
        .map(({ sp, vs, best }) => `
          <details class="vault-species">
            <summary>
              <strong>${sp.name}</strong>
              <span class="lineage">${vs.length} vial${vs.length === 1 ? '' : 's'}</span>
              <span class="star-badge">★${best.toFixed(1)}</span>
            </summary>
            <ul class="token-list">${vs.map(vialRow).join('')}</ul>
          </details>`)
        .join('')
    : '<p class="ranch-msg">No essence on file. The centrifuge is bored.</p>';

  // The run in flight, with its clock and the one thing that can stall it.
  const runCard = run
    ? `<section class="card">
        <h3>🧬 Resequencer</h3>
        <p class="ranch-msg">Rebuilding <strong>${run.donorName}</strong> — ${content.species[run.species].name}, ★${run.stars}.</p>
        <p class="settle">${
          resequenceRemainingMs(state, t) > 0
            ? `<strong class="countdown">${fmtDuration(resequenceRemainingMs(state, t))}</strong> to go.`
            : penRoom ? 'Decanting…' : 'Ready — and the pens are full. Free one and it comes out. Nothing is lost while it waits.'
        }</p>
        <button type="button" class="pen-dismantle" id="reseq-cancel">Abort (the vial goes back in the rack)</button>
      </section>`
    : '';

  // With 150 possible parts a flat list is unreadable: collapse by species,
  // newest/best first, and let the player open the one they care about.
  const bySpecies = new Map();
  for (const token of inv.parts) {
    const known = content.parts[token.partId];
    if (!known) continue; // token from a retired part — ignore, never crash
    const sp = known.species;
    if (!bySpecies.has(sp)) bySpecies.set(sp, []);
    bySpecies.get(sp).push(token);
  }
  const partSections = [...bySpecies.entries()]
    .sort((a, b) => b[1].length - a[1].length || (content.species[a[0]].name > content.species[b[0]].name ? 1 : -1))
    .map(([sp, tokens]) => {
      const species = content.species[sp];
      const best = tokens.reduce((m, t) => Math.max(m, GRADE_INDEX[t.grade]), 0);
      const rows = SLOTS.map((slot) => {
        const inSlot = tokens
          .filter((t) => content.parts[t.partId].slot === slot)
          .sort((a, b) => GRADE_INDEX[b.grade] - GRADE_INDEX[a.grade]);
        return inSlot
          .map((t) => {
            const part = content.parts[t.partId];
            const grade = GRADES[GRADE_INDEX[t.grade]];
            const traits = (t.traits ?? []).map((tr) => ` <span class="grade-badge grade-apex">${content.traits[tr]?.name ?? tr}</span>`).join('');
            return `<li><span class="grade-badge grade-${t.grade}">${grade.name}</span> ${SLOT_LABELS[slot]}: ${part.name}${traits} <span class="lineage">${t.donor.name} ★${t.donor.stars}</span></li>`;
          })
          .join('');
      }).join('');
      return `
        <details class="vault-species">
          <summary>
            <strong>${species.name}</strong>
            <span class="lineage">${tokens.length} part${tokens.length === 1 ? '' : 's'}</span>
            <span class="grade-badge grade-${GRADES[best].id}">${GRADES[best].name}</span>
          </summary>
          <ul class="token-list">${rows}</ul>
        </details>`;
    })
    .join('');

  root.innerHTML = `
    ${fieldNote(guideForScreen(state, content, t, 'vault'))}
    ${lastMsg ? `<section class="card"><p class="ranch-msg">${lastMsg}</p></section>` : ''}
    ${runCard}
    <section class="card">
      <h3>DNA Vials (${inv.vials.length})</h3>
      <p class="fine-print">A vial is the whole donor — its stars and its genes. Resequencing grows that animal back${
        run ? '' : '; the vial is spent whether or not it takes'
      }. It is the only way an extraction is not forever.</p>
      ${vials}
    </section>
    <section class="card">
      <h3>Part Tokens (${inv.parts.length})</h3>
      ${partSections || '<p class="ranch-msg">The vault echoes. Graduate someone.</p>'}
      <p class="fine-print">Every token remembers its donor forever. It&#39;s sentimental. And legally binding.</p>
    </section>`;

  root.querySelectorAll('button[data-reseq]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const res = startResequence(state, btn.dataset.reseq, content, ctx.now());
      lastMsg = res.msg;
      ctx.save();
      renderVaultScreen(root, ctx);
    });
  });
  root.querySelector('#reseq-cancel')?.addEventListener('click', () => {
    lastMsg = cancelResequence(state, content).msg;
    ctx.save();
    renderVaultScreen(root, ctx);
  });
  bindFieldNote(root, ctx, () => renderVaultScreen(root, ctx));
}
