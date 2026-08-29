// Ranch screen DOM. All game logic lives in ranch.js; this module only
// renders state and forwards clicks. Re-renders the whole screen per action
// — herd sizes are tiny, simplicity wins.

import { renderCreatureSVG } from '../render/renderer.js';
import {
  CARE_ACTIONS, ageStage, nextStage, conditionTier, careStatus, careAction,
  penUpgradeCost, buyPenUpgrade, buyMailOrder, stockGenome, upkeepPerDay,
  TUNING,
} from './ranch.js';
import { gradeFor } from '../splice/extract.js';
import { canBreed, breedPair, hatchEgg, BREEDING } from './breeding.js';

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
let pickA = ''; // breeding pen draft (screen-local)
let pickB = '';

function eggSVG(palette) {
  return (
    `<svg viewBox="0 0 60 76" class="egg" aria-hidden="true">` +
    `<ellipse cx="30" cy="42" rx="23" ry="30" fill="${palette.secondary}" stroke="#2b2440" stroke-width="4"/>` +
    `<ellipse cx="24" cy="32" rx="7" ry="9" fill="${palette.primary}" stroke="none" opacity="0.7"/>` +
    `<ellipse cx="38" cy="50" rx="5" ry="7" fill="${palette.primary}" stroke="none" opacity="0.7"/>` +
    `<circle cx="36" cy="28" r="3" fill="${palette.accent}" stroke="none" opacity="0.8"/>` +
    `</svg>`
  );
}

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

  // Breeding Pen: adults of one species, opposite sexes. The egg does the rest.
  const eligible = state.ranch.stock.filter((a) => ageStage(a, content, t) !== 'juvenile');
  if (!eligible.some((a) => a.id === pickA)) pickA = '';
  const partnerPool = eligible.filter((b) => {
    const a = eligible.find((x) => x.id === pickA);
    return a && b.id !== a.id && b.species === a.species && b.sex !== a.sex;
  });
  if (!partnerPool.some((b) => b.id === pickB)) pickB = '';
  const optionFor = (a) => `<option value="${a.id}">${a.name} ${a.sex === 'F' ? '♀' : '♂'} (${content.species[a.species].name})</option>`;
  const breeding = `
    <section class="card">
      <h3>Breeding Pen</h3>
      <div class="slot-grid">
        <label class="slot"><span>Parent A</span>
          <select id="breed-a"><option value="">— choose —</option>${eligible.map((a) => `<option value="${a.id}" ${a.id === pickA ? 'selected' : ''}>${a.name} ${a.sex === 'F' ? '♀' : '♂'} (${content.species[a.species].name})</option>`).join('')}</select>
        </label>
        <label class="slot"><span>Parent B</span>
          <select id="breed-b" ${pickA ? '' : 'disabled'}><option value="">— choose —</option>${partnerPool.map((b) => `<option value="${b.id}" ${b.id === pickB ? 'selected' : ''}>${b.name} ${b.sex === 'F' ? '♀' : '♂'}</option>`).join('')}</select>
        </label>
      </div>
      <button type="button" class="big-btn" data-act="breed" ${pickA && pickB ? '' : 'disabled'}>💕 Introduce Them (science)</button>
    </section>`;

  // Incubator: eggs on real-world timers, hatched by hand.
  const eggCards = state.ranch.eggs.map((egg) => {
    const species = content.species[egg.species];
    const ready = t >= egg.hatchAt;
    return `
      <div class="encounter">
        <div class="egg-wrap">${eggSVG(species.palette)}</div>
        <div style="flex:1;min-width:0">
          <strong>${species.name} egg</strong><br>
          <span class="fine-print">of ${egg.parents.sire.name} ★${egg.parents.sire.stars} × ${egg.parents.dam.name} ★${egg.parents.dam.stars}${egg.mutationNote ? ' · the egg vibrates suspiciously' : ''}</span>
        </div>
        <button type="button" data-act="hatch" data-egg="${egg.id}" ${ready ? '' : 'disabled'}>${ready ? 'Hatch!' : fmtDuration(egg.hatchAt - t)}</button>
      </div>`;
  }).join('');
  const incubator = `
    <section class="card">
      <h3>Incubator (${state.ranch.eggs.length}/${BREEDING.incubatorSlots})</h3>
      ${eggCards || '<p class="ranch-msg">No eggs. The incubator hums expectantly.</p>'}
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
          <h4>${animal.name} <span class="sex">${animal.sex === 'F' ? '♀' : '♂'}</span>${(animal.traits ?? [])
            .map((tr) => ` <span class="grade-badge grade-apex">${content.traits[tr]?.name ?? tr}</span>`)
            .join('')}</h4>
          <p class="meta">${species.name} · ${STAGE_LABELS[stage]}${next ? ` · ${STAGE_LABELS[next.stage]} in ${fmtDuration(next.msRemaining)}` : ''}</p>
          <p class="meta">${animal.parents
            ? `child of ${animal.parents.sire.name} ★${animal.parents.sire.stars} × ${animal.parents.dam.name} ★${animal.parents.dam.stars}`
            : 'origin: questionable paperwork'}</p>
          <div class="cond-bar"><div class="cond-fill tier-${tier}" style="width:${Math.round(animal.condition)}%"></div></div>
          <p class="cond-label">Condition ${Math.round(animal.condition)} · ${TIER_BLURBS[tier]}</p>
          <p class="meta">Diet: ${species.diet} · Genes: ????? (Gene Scanner required)</p>
          <p class="meta">Graduation forecast: <span class="grade-badge grade-${gradeFor(animal, content, t).id}">${gradeFor(animal, content, t).name}</span></p>
          <div class="care-row">${buttons}</div>
          <button type="button" class="extract-btn" data-act="extract" data-animal="${animal.id}">🎓 Extract (graduate ${animal.name})</button>
        </div>
      </section>`;
  }).join('');

  root.innerHTML = head + breeding + incubator + (cards || '<section class="card"><p class="ranch-msg">The pens are empty. Suspiciously tidy, though.</p></section>');

  root.querySelector('#breed-a').addEventListener('change', (e) => {
    pickA = e.target.value;
    pickB = '';
    renderRanchScreen(root, ctx);
  });
  root.querySelector('#breed-b').addEventListener('change', (e) => {
    pickB = e.target.value;
    renderRanchScreen(root, ctx);
  });

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
      } else if (btn.dataset.act === 'breed') {
        result = breedPair(ctx.state, pickA, pickB, content, t2);
        if (result.ok) { pickA = ''; pickB = ''; }
      } else if (btn.dataset.act === 'hatch') {
        result = hatchEgg(ctx.state, btn.dataset.egg, content, t2);
      } else if (btn.dataset.act === 'extract') {
        ctx.onExtract?.(btn.dataset.animal);
        return; // the ceremony overlay owns the flow from here
      }
      if (result) lastMsg = result.msg;
      ctx.save();
      renderRanchScreen(root, ctx);
    });
  });
}
