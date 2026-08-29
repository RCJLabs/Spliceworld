// Ranch screen DOM. All game logic lives in ranch.js; this module only
// renders state and forwards clicks. Re-renders the whole screen per action
// — herd sizes are tiny, simplicity wins.

import { renderCreatureSVG } from '../render/renderer.js';
import {
  CARE_ACTIONS, ageStage, nextStage, conditionTier, careStatus, careAction,
  penUpgradeCost, buyPenUpgrade, buyMailOrder, stockGenome, upkeepPerDay,
  TUNING,
} from './ranch.js';

const STAGE_LABELS = { juvenile: 'Juvenile', adult: 'Adult', prime: 'Prime', elder: 'Elder' };
const STAGE_SCALE = { juvenile: 0.72, adult: 0.92, prime: 1, elder: 0.96 };
const CARE_LABELS = { feed: 'Feed', groom: 'Groom', exercise: 'Exercise', enrich: 'Enrich' };
const TIER_BLURBS = {
  gleaming: 'gleaming — award-caliber husbandry',
  fine: 'fine — perfectly adequate',
  scruffy: 'scruffy — the ethics board has questions',
};

export function fmtDuration(ms) {
  const m = Math.ceil(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

let lastMsg = 'The herd awaits your questionable attention.';

export function renderRanchScreen(root, ctx) {
  const { state, content, now } = ctx;
  const t = now();
  const upkeep = upkeepPerDay(state, content);

  const head = `
    <section class="card">
      <div class="econ-row">
        <div><span class="econ-label">Slush fund</span><strong>$${Math.floor(state.funds)}</strong></div>
        <div><span class="econ-label">Stipend</span><strong>+$${TUNING.stipendPerDay}/day</strong></div>
        <div><span class="econ-label">Upkeep</span><strong>−$${upkeep}/day</strong></div>
        <div><span class="econ-label">Pens</span><strong>${state.ranch.stock.length}/${state.ranch.penCapacity}</strong></div>
      </div>
      <div class="ranch-actions">
        <button type="button" data-act="pen">Expand pens +${TUNING.penUpgradeSize} — $${penUpgradeCost(state)}</button>
        ${Object.values(content.species)
          .filter((s) => s.mailOrderPrice)
          .map((s) => `<button type="button" data-act="order" data-species="${s.id}">Mail-order ${s.name} — $${s.mailOrderPrice}</button>`)
          .join('')}
      </div>
      <p class="ranch-msg">${lastMsg}</p>
    </section>`;

  const cards = state.ranch.stock.map((animal) => {
    const species = content.species[animal.species];
    const stage = ageStage(animal, content, t);
    const next = nextStage(animal, content, t);
    const tier = conditionTier(animal.condition);
    const care = careStatus(animal, t);
    const portrait = renderCreatureSVG(stockGenome(animal.species, content), content, {
      idPrefix: `pt-${animal.id}`,
      condition: tier === 'fine' ? null : tier,
      extraScale: STAGE_SCALE[stage],
    });
    const buttons = CARE_ACTIONS.map((action) => {
      const cost = action === 'feed' ? ` $${species.feedCost}` : '';
      const label = care[action].ready
        ? `${CARE_LABELS[action]}${cost}`
        : `${CARE_LABELS[action]} (${fmtDuration(care[action].msRemaining)})`;
      return `<button type="button" data-act="care" data-animal="${animal.id}" data-care="${action}" ${care[action].ready ? '' : 'disabled'}>${label}</button>`;
    }).join('');

    return `
      <section class="card animal-card">
        <div class="portrait">${portrait}</div>
        <div class="animal-info">
          <h4>${animal.name} <span class="sex">${animal.sex === 'F' ? '♀' : '♂'}</span></h4>
          <p class="meta">${species.name} · ${STAGE_LABELS[stage]}${next ? ` · ${STAGE_LABELS[next.stage]} in ${fmtDuration(next.msRemaining)}` : ''}</p>
          <div class="cond-bar"><div class="cond-fill tier-${tier}" style="width:${Math.round(animal.condition)}%"></div></div>
          <p class="cond-label">Condition ${Math.round(animal.condition)} · ${TIER_BLURBS[tier]}</p>
          <p class="meta">Diet: ${species.diet} · Genes: ????? (Gene Scanner required)</p>
          <div class="care-row">${buttons}</div>
        </div>
      </section>`;
  }).join('');

  root.innerHTML = head + (cards || '<section class="card"><p class="ranch-msg">The pens are empty. Suspiciously tidy, though.</p></section>');

  root.querySelectorAll('button[data-act]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const t2 = ctx.now();
      let result;
      if (btn.dataset.act === 'care') {
        result = careAction(ctx.state, btn.dataset.animal, btn.dataset.care, content, t2);
      } else if (btn.dataset.act === 'pen') {
        result = buyPenUpgrade(ctx.state);
      } else if (btn.dataset.act === 'order') {
        result = buyMailOrder(ctx.state, btn.dataset.species, content, t2);
      }
      if (result) lastMsg = result.msg;
      ctx.save();
      renderRanchScreen(root, ctx);
    });
  });
}
