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
import { renderIcon } from '../ui/icons.js';
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
           <button type="button" class="care-train" data-reseq="${v.id}">${renderIcon('dna')} Resequence</button>`
        : ''
    }</li>`;
  };
  // The run in flight, with its clock and the one thing that can stall it.
  const runCard = run
    ? `<section class="card">
        <h3>${renderIcon('dna')} Resequencer</h3>
        <p class="ranch-msg">Rebuilding <strong>${run.donorName}</strong> — ${content.species[run.species].name}, ★${run.stars}.</p>
        <p class="settle">${
          resequenceRemainingMs(state, t) > 0
            ? `<strong class="countdown">${fmtDuration(resequenceRemainingMs(state, t))}</strong> to go.`
            : penRoom ? 'Decanting…' : 'Ready — and the pens are full. Free one and it comes out. Nothing is lost while it waits.'
        }</p>
        <button type="button" class="pen-dismantle" id="reseq-cancel">Abort (the vial goes back in the rack)</button>
      </section>`
    : '';

  // R53. The Vault used to be two cards that both listed the SAME ~34
  // species names — R52 measured them at 1,547px and 1,485px, near-identical
  // halves of one screen, each a fold per animal. The split was historical:
  // vials arrived in M2 and parts in M2, and nothing ever asked whether a
  // player thinks in "vials" and "parts" or in animals. They think in
  // animals — an extraction produces one vial AND that animal's parts, from
  // the same donor, in the same moment.
  //
  // One shelf per species, holding everything that came off that animal.
  const shelf = new Map();
  const bay = (id) => {
    if (!shelf.has(id)) shelf.set(id, { vials: [], tokens: [] });
    return shelf.get(id);
  };
  for (const v of inv.vials) {
    // Retired species are skipped rather than thrown on, as R52 established
    // for vials and the token loop has always done.
    if (content.species[v.species]) bay(v.species).vials.push(v);
  }
  for (const token of inv.parts) {
    const known = content.parts[token.partId];
    if (known && content.species[known.species]) bay(known.species).tokens.push(token);
  }

  const tokenRows = (tokens) => SLOTS.map((slot) => tokens
    .filter((t) => content.parts[t.partId].slot === slot)
    .sort((a, b) => GRADE_INDEX[b.grade] - GRADE_INDEX[a.grade])
    .map((t) => {
      const part = content.parts[t.partId];
      const grade = GRADES[GRADE_INDEX[t.grade]];
      const traits = (t.traits ?? []).map((tr) => ` <span class="grade-badge grade-apex">${content.traits[tr]?.name ?? tr}</span>`).join('');
      return `<li><span class="grade-badge grade-${t.grade}">${grade.name}</span> ${SLOT_LABELS[slot]}: ${part.name}${traits} <span class="lineage">${t.donor.name} ★${t.donor.stars}</span></li>`;
    }).join('')).join('');

  // Every bay closed, at every size — no threshold, which is the part R52
  // could not have. R52 kept a small rack FLAT so a new player could see
  // their vial without tapping, and that was right when a fold hid nothing
  // but one line. A bay hides an animal's whole parts list, so opening the
  // short shelf measured at 1,357px against the two-card layout's 673px:
  // the old rule, applied to the new fold, doubled the screen it was meant
  // to protect.
  //
  // What made it safe to drop is that the summary now CARRIES the holdings
  // — "Goat · 1 vial · 6 parts · ★4.0 · APEX" — so a closed bay still
  // answers what you own; you open it to act, not to look. And the
  // Resequencer does not depend on a fold to be found: guides.json has
  // taught it on this screen since R31.
  const bays = [...shelf.entries()]
    .map(([id, held]) => ({
      sp: content.species[id],
      ...held,
      stars: held.vials.reduce((m, v) => Math.max(m, v.stars), 0),
      grade: held.tokens.reduce((m, t) => Math.max(m, GRADE_INDEX[t.grade]), -1),
    }))
    // A bay holding a vial sorts first: a vial is the only thing on this
    // screen with a button, and an actionable shelf outranks a full one.
    .sort((a, b) => (b.vials.length > 0) - (a.vials.length > 0)
      || b.stars - a.stars
      || b.tokens.length - a.tokens.length
      || (a.sp.name > b.sp.name ? 1 : -1))
    .map(({ sp, vials, tokens, stars, grade }) => `
      <details class="vault-species">
        <summary>
          <strong>${sp.name}</strong>
          <span class="lineage">${[
            vials.length ? `${vials.length} vial${vials.length === 1 ? '' : 's'}` : '',
            tokens.length ? `${tokens.length} part${tokens.length === 1 ? '' : 's'}` : '',
          ].filter(Boolean).join(' · ')}</span>
          ${vials.length ? `<span class="star-badge">★${stars.toFixed(1)}</span>` : ''}
          ${grade >= 0 ? `<span class="grade-badge grade-${GRADES[grade].id}">${GRADES[grade].name}</span>` : ''}
        </summary>
        ${vials.length ? `<ul class="token-list">${vials.map(vialRow).join('')}</ul>` : ''}
        ${tokens.length ? `<ul class="token-list">${tokenRows(tokens)}</ul>` : ''}
      </details>`)
    .join('');

  root.innerHTML = `
    ${fieldNote(guideForScreen(state, content, t, 'vault'))}
    ${lastMsg ? `<section class="card"><p class="ranch-msg">${lastMsg}</p></section>` : ''}
    ${runCard}
    <section class="card">
      <h3>Gene Vault</h3>
      <p class="fine-print">${inv.vials.length} vial${inv.vials.length === 1 ? '' : 's'} · ${
        inv.parts.length} part token${inv.parts.length === 1 ? '' : 's'}, shelved by the animal they came off.</p>
      ${bays || '<p class="ranch-msg">The vault echoes. Graduate someone.</p>'}
      <p class="fine-print">A vial is the whole donor — its stars and its genes. Resequencing grows that animal back${
        run ? '' : '; the vial is spent whether or not it takes'
      }. It is the only way an extraction is not forever.</p>
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
