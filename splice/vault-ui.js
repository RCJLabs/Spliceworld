// Gene Vault screen: DNA vials and extracted part tokens with lineage.
// Part tokens went to the Surgery Theater in M3. Vials went NOWHERE until
// R31 — every extraction produced one and this screen listed it, forever.
// The Resequencer is what spends them, and it lives here because this is
// where the player already goes to look at them.

import { SLOTS } from '../render/renderer.js';
import { GRADES, gradeOf, gradeIndexOf } from './extract.js';
import { vialSVG } from './extract-ui.js';
import {
  resequencePlan, startResequence, cancelResequence,
  activeResequence, resequenceRemainingMs, resequencerTuning,
} from './resequencer.js';
import { fmtDuration } from '../ranch/ui.js';
import { renderIcon } from '../ui/icons.js';
import { rushQuote, rushButton, bindRush } from './rush.js';
// R39. The Vault was the one screen with no field-note slot at all — five
// screens wired this and the sixth did not, so a note here could not have
// been shown even if one had existed. The suite's hand-written screen list
// happened to omit `vault` too, so nothing ever asked.
import { fieldNote, bindFieldNote, bindFolds, isOpen } from '../ui/cards.js';
import { paginate, pagerRow, bindPager, trimPages } from '../ui/pager.js';
import { facilityCard, bindFacility } from '../ui/facility-card.js';
import { guideForScreen } from '../ranch/onboarding.js';
import { speciesOf, isRetired } from '../data/catalog.js';
import { vaultPressure, surplusParts, renderDown, renderValue } from './vault.js';

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
  // R91 — the shelf space, and the one button that frees some. Both read the
  // same functions the engine and the walker use, so the number on screen
  // and the number in the save cannot drift.
  const pressure = vaultPressure(state, content);
  const surplus = surplusParts(state, content, Math.max(8, Math.ceil(pressure.capacity.parts * 0.15)));
  const surplusValue = surplus.reduce((n, tok) => n + renderValue(tok), 0);
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
    const sp = speciesOf(content, v.species);
    const plan = resequencePlan(state, v.id, content, t);
    return `<li>${vialSVG(sp.palette.accent)} ${sp.name} essence <span class="lineage">from ${v.donorName} ★${v.stars}</span>${
      plan.ok
        ? `<br><span class="fine-print">${Math.round(plan.successChance * 100)}% to take · ${
            Math.round(plan.mutationChance * 100)}% chance of a new gene · ${plan.hours}h</span>
           <button type="button" class="care-train" data-reseq="${v.id}">${renderIcon('dna')} Resequence</button>`
        : isRetired(sp)
          ? `<br><span class="fine-print">${plan.msg} The essence keeps. The paperwork does not.</span>`
          : ''
    }</li>`;
  };
  // The run in flight, with its clock and the one thing that can stall it.
  const runCard = run
    ? `<section class="card">
        <h3>${renderIcon('dna')} Resequencer</h3>
        <p class="ranch-msg">Rebuilding <strong>${run.donorName}</strong> — ${speciesOf(content, run.species).name}, ★${run.stars}.</p>
        <p class="settle">${
          resequenceRemainingMs(state, t) > 0
            ? `<strong class="countdown">${fmtDuration(resequenceRemainingMs(state, t))}</strong> to go.`
            : penRoom ? 'Decanting…' : 'Ready — and the pens are full. Free one and it comes out. Nothing is lost while it waits.'
        }</p>
        <div class="pen-actions">
          ${rushButton(rushQuote(state, 'resequencer', 'resequencer', content, t))}
          <button type="button" class="pen-dismantle" id="reseq-cancel">Abort (the vial goes back in the rack)</button>
        </div>
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
  // R79 - these two loops used to SKIP anything whose species the build no
  // longer has, which kept the screen up and quietly deleted the player's
  // holdings from it: a cobra token is still a real part, still spliceable
  // in the Theater, and it simply stopped appearing in the vault that is
  // supposed to list what you own. Now it shelves under the discontinued
  // line's stand-in and says so. A retired PART is still skipped — there is
  // no part to name — which is R72's rule, unchanged.
  for (const v of inv.vials) bay(v.species).vials.push(v);
  for (const token of inv.parts) {
    const known = content.parts[token.partId];
    if (known) bay(known.species).tokens.push(token);
  }

  const tokenRows = (tokens) => SLOTS.map((slot) => tokens
    .filter((t) => content.parts[t.partId].slot === slot)
    .sort((a, b) => gradeIndexOf(b.grade) - gradeIndexOf(a.grade))
    .map((t) => {
      const part = content.parts[t.partId];
      const grade = gradeOf(t.grade);
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
      sp: speciesOf(content, id),
      ...held,
      stars: held.vials.reduce((m, v) => Math.max(m, v.stars), 0),
      // R72: a retired grade used to make this Math.max NaN, which quietly
      // failed the `grade >= 0` test below and dropped the bay's grade badge.
      grade: held.tokens.reduce((m, t) => Math.max(m, gradeIndexOf(t.grade)), -1),
    }))
    // A bay holding a vial sorts first: a vial is the only thing on this
    // screen with a button, and an actionable shelf outranks a full one.
    .sort((a, b) => (b.vials.length > 0) - (a.vials.length > 0)
      || b.stars - a.stars
      || b.tokens.length - a.tokens.length
      || (a.sp.name > b.sp.name ? 1 : -1))
    .map(({ sp, vials, tokens, stars, grade }) => {
      // R131 — THE BAYS JOIN THE REST OF THE GAME'S FOLDS. These were the one
      // fold in the project still riding on a raw `<details>`, which cost two
      // things: the open state did not survive a repaint (and this screen
      // repaints on every resequence, render and graduation), and nothing
      // stopped all 41 being open at once. That second one is not
      // theoretical — it is a state a player reaches by tapping, and it
      // measured 29,708px, thirty-eight phone screens.
      //
      // So: open comes from the save, one at a time, exactly as the Pens
      // (R89) and the Ranch (R98) do it.
      const open = isOpen(state, `vault-${sp.id}`, false);
      // …AND A BAY IS ITSELF A LIST THAT GROWS, TWICE OVER. The shark bay on
      // a day-180 save holds 101 of the 337 parts AND 116 of the 120 vials —
      // the whole shelf is three species deep in vials and one of them has
      // 97% of them. The first draft paged the parts and left the vials
      // alone, on the reasoning that 120 vials across 41 bays is thin: the
      // gate then measured one open bay at 16,821px, and the 124 rows in it
      // were 8 paged parts and 116 unpaged vials. A list is a list.
      //
      // Both are paged, and vials keep their own counter because they are
      // the only thing on this screen with a button — a player working
      // through them should not lose their place because they also opened
      // the parts.
      const vialPage = paginate(vials, state, `vault-vials-${sp.id}`);
      const page = paginate(tokens, state, `vault-bay-${sp.id}`);
      if (open) {
        trimPages(state, `vault-vials-${sp.id}`, vials.length);
        trimPages(state, `vault-bay-${sp.id}`, tokens.length);
      }
      // A BUTTON, NOT A `<summary>`. The first draft of this kept `<details>`
      // and drove it from the save, and the height gate reported the Vault at
      // 2,527px open — because `openOne` reaches a native `<details>` by
      // setting `.open = true`, which revealed forty-one EMPTY shells once
      // the rows moved behind the state. The gate was not measuring a shorter
      // screen; it was measuring a screen it could no longer open, which is
      // R99's lesson exactly and would have shipped as a green number.
      //
      // So the bays wear the same `data-fold` contract as every other fold in
      // the game: `bindFolds` opens them, `exclusive` keeps one open, the
      // save remembers which, and both browser gates find them because they
      // are looking for the thing the rest of the project uses.
      return `
      <div class="vault-species${open ? ' is-open' : ''}">
        <button type="button" class="bay-head" data-fold="vault-${sp.id}" aria-expanded="${open}">
          <span class="fold-caret" aria-hidden="true">${open ? '▾' : '▸'}</span>
          <strong>${sp.name}</strong>
          <span class="lineage">${[
            vials.length ? `${vials.length} vial${vials.length === 1 ? '' : 's'}` : '',
            tokens.length ? `${tokens.length} part${tokens.length === 1 ? '' : 's'}` : '',
          ].filter(Boolean).join(' · ')}</span>
          ${vials.length ? `<span class="star-badge">★${stars.toFixed(1)}</span>` : ''}
          ${grade >= 0 ? `<span class="grade-badge grade-${GRADES[grade].id}">${GRADES[grade].name}</span>` : ''}
        </button>
        ${!open ? '' : `
          ${vialPage.rows.length ? `<ul class="token-list">${vialPage.rows.map(vialRow).join('')}</ul>` : ''}
          ${pagerRow(vialPage, 'more vials')}
          ${page.rows.length ? `<ul class="token-list">${tokenRows(page.rows)}</ul>` : ''}
          ${pagerRow(page, 'more parts')}`}
      </div>`;
    })
    .join('');

  root.innerHTML = `
    ${fieldNote(guideForScreen(state, content, t, 'vault'))}
    ${lastMsg ? `<section class="card"><p class="ranch-msg">${lastMsg}</p></section>` : ''}
    ${runCard}
    ${/* R128b — ABOVE THE LIST, NOT UNDER IT. Appending the card put it
          last on every screen it moved to: 12th of 12 on the Pens, 2nd of 2
          on the Vault, 4th of 4 here, 10th of 10 in the War Room — between
          1.9 and 3.2 phone screens down. The Ranch it left had it THIRD of
          25. Moving an upgrade from near the top of one screen to the bottom
          of five is not making it findable, and the report said so. */ ''}
    ${facilityCard(state, content, 'vault')}
    <section class="card">
      <h3>Gene Vault</h3>
      <p class="fine-print">${pressure.parts}/${pressure.capacity.parts} part token${
        pressure.parts === 1 ? '' : 's'} · ${inv.vials.length}/${pressure.capacity.vials} vial${
        inv.vials.length === 1 ? '' : 's'}, shelved by the animal they came off.</p>
      <div class="meter" role="img" aria-label="Vault ${
        Math.round(pressure.parts / pressure.capacity.parts * 100)} percent full"><div class="meter-fill ${
        pressure.tight ? 'fill-cannon' : 'fill-sta'}" style="width:${
        Math.min(100, Math.round(pressure.parts / pressure.capacity.parts * 100))}%"></div></div>
      ${pressure.tight ? `<p class="pen-alert">${renderIcon('wrench')} ${
        pressure.full
          ? 'The shelves are full. A graduation needs somewhere to go.'
          : `Room for ${pressure.free} more. The shelves are getting opinionated.`
      }</p>` : ''}
      ${surplus.length ? `<div class="pen-actions">
        <button type="button" class="pen-dismantle" data-render-surplus="${surplus.length}">${
          renderIcon('wrench')} Render down ${surplus.length} duplicate${surplus.length === 1 ? '' : 's'} for $${surplusValue}</button>
      </div>
      <p class="fine-print">Duplicates only, worst grade first — never the last of an anatomy and never one carrying a gene. The vat pays cash and asks nothing.</p>` : ''}
      ${bays || '<p class="ranch-msg">The vault echoes. Graduate someone.</p>'}
      <p class="fine-print">A vial is the whole donor — its stars and its genes. Resequencing grows that animal back${
        run ? '' : '; the vial is spent whether or not it takes'
      }. It is the only way an extraction is not forever.</p>
      <p class="fine-print">Every token remembers its donor forever. It&#39;s sentimental. And legally binding.</p>
    </section>`;
  bindFacility(root, ctx, () => renderVaultScreen(root, ctx), (r) => { lastMsg = r.msg; });

  root.querySelectorAll('button[data-reseq]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const res = startResequence(state, btn.dataset.reseq, content, ctx.now());
      lastMsg = res.msg;
      ctx.save();
      renderVaultScreen(root, ctx);
    });
  });
  root.querySelector('button[data-render-surplus]')?.addEventListener('click', () => {
    lastMsg = renderDown(state, content, surplus.map((tok) => tok.id)).msg;
    ctx.save();
    renderVaultScreen(root, ctx);
  });
  root.querySelector('#reseq-cancel')?.addEventListener('click', () => {
    lastMsg = cancelResequence(state, content).msg;
    ctx.save();
    renderVaultScreen(root, ctx);
  });
  bindFieldNote(root, ctx, () => renderVaultScreen(root, ctx));
  // R128 — same as the Theater: the Vault's first fold arrived with the
  // Extractor's card, and nothing here had ever bound one.
  // R131 — ONE BAY AT A TIME, the rule the Pens has had since R89 and the
  // Ranch since R98. The facility card is deliberately NOT in the group: it
  // is a different kind of thing, and a player checking what shelf space
  // costs while looking at a full shelf wants both.
  bindFolds(root, ctx, () => renderVaultScreen(root, ctx),
    { exclusive: [...shelf.keys()].map((id) => `vault-${id}`) });
  bindPager(root, ctx, () => renderVaultScreen(root, ctx));
  bindRush(root, ctx, (m) => { lastMsg = m; }, () => renderVaultScreen(root, ctx));
}
