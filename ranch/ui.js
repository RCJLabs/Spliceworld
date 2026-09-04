// Ranch screen DOM. All game logic lives in ranch.js; this module only
// renders state and forwards clicks. Re-renders the whole screen per action
// — herd sizes are tiny, simplicity wins.

import { creaturePortrait } from '../render/renderer.js';
import {
  CARE_ACTIONS, ageStage, nextStage, conditionTier, careStatus, careAction,
  penUpgradeCost, buyPenUpgrade, buyMailOrder, stockGenome, upkeepPerDay,
  catalogFor, TUNING,
} from './ranch.js';
import { gradeFor, gradeOutlook, outlookLine } from '../splice/extract.js';
import { renameCreature } from '../splice/theater.js';
import { openPrompt } from '../ui/picker.js';
import {
  canBreed, breedPair, hatchEgg, BREEDING, isVariant, baseSpecies, incubatorSlots,
  pairingForecast, expressedTraits,
} from './breeding.js';
import { onboardingSteps, onboardingActive, guideForScreen, pathOwnsScreen } from './onboarding.js';
import * as sfx from '../audio/sfx.js';
import { pickerField, bindPickers } from '../ui/picker.js';
import { tracks, facilityLevel, levelData, nextUpgrade, buyUpgrade } from '../splice/facility.js';
import { nodeName } from '../campaign/map.js';
import { scannerGrants } from '../splice/facility.js';
import { speciesOf } from '../data/catalog.js';
import { incomePerDay } from '../campaign/campaign.js';
import { fieldNote, bindFieldNote, collapsibleCard, bindFolds, isOpen } from '../ui/cards.js';
import { agendaShape } from './agenda.js';
import { bandedHtml } from '../ui/roster.js';
import { renderIcon } from '../ui/icons.js';

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
let catalogPick = '';
// R72 - the mark is the class's OWN icon, named in classes.json. Three
// entries typed out here meant a fourth class's animals wore no mark at
// all, and a retired one left a stale mark behind: both are the data
// disagreeing with the code about what a class is.
const classMark = (content, cls) => {
  const def = cls ? content.classes?.[cls] : null;
  return def ? `${renderIcon(def.icon, { size: 13 })} ` : '';
};

// A variant hatching is the rarest thing the ranch produces (ROADMAP §3.2),
// so it gets the ceremony treatment rather than a line in the message strip.
function showVariantCeremony(ctx, result, onClose) {
  const { content } = ctx;
  const species = speciesOf(content, result.variant);
  const overlay = document.querySelector('#overlay');
  overlay.hidden = false;
  overlay.innerHTML = `
    <div class="ceremony card">
      <h3>${result.firstOfItsKind ? '✦ NEW VARIANT SPECIES' : '✦ THE LINE HOLDS'}</h3>
      <div class="grad-portrait">${creaturePortrait(stockGenome(species.id, content), content, { idPrefix: 'variant' })}</div>
      <p><strong>${result.hatchling.name}</strong> — ${species.name}</p>
      <p class="fine-print">${species.flavor ?? ''}</p>
      <p class="fine-print">Same stock as the ${speciesOf(content, species.variantOf).name}, and it breeds true: pair two and the line continues. Its parts carry ${species.tags.join(' and ') || 'no tags'} — and its own numbers.</p>
      ${result.firstOfItsKind ? '<p class="combo-toast">✦ Logged in the Splice-Dex.</p>' : ''}
      <button type="button" id="variant-done" class="big-btn">Astonishing</button>
    </div>`;
  overlay.querySelector('#variant-done').addEventListener('click', () => {
    overlay.hidden = true;
    overlay.innerHTML = '';
    onClose();
  });
}

// Facility upgrades (ROADMAP §3.10). Every level here has to expand what
// you can CREATE — a bigger chassis, another bay — never just a bigger
// number (Law 2).
function facilityCard(state, content) {
  const open = isOpen(state, 'facility', false);
  const upgrades = tracks(content)
    .map((track) => nextUpgrade(state, content, track.id))
    .filter(Boolean);
  const affordable = upgrades.filter((u) => u.affordable);
  const cheapest = upgrades.length ? Math.min(...upgrades.map((u) => u.level.cost)) : 0;
  const summary = upgrades.length
    ? `${affordable.length ? `<strong>${affordable.length} ready to buy</strong> · ` : ''}${upgrades.length} upgrade${
        upgrades.length === 1 ? '' : 's'
      } left, from $${cheapest}.`
    : 'Every track maxed. There is nothing left to buy and that is its own kind of sad.';
  const rows = tracks(content).map((track) => {
    const level = facilityLevel(state, track.id);
    const current = levelData(content, track.id, level);
    const up = nextUpgrade(state, content, track.id);
    const blockedNode = up?.blockers.find((b) => b.kind === 'node');
    const short = up?.blockers.find((b) => b.kind === 'funds');
    return `
      <div class="facility-row">
        <div class="facility-head">
          <strong>${renderIcon(track.icon)} ${current?.name ?? track.name}</strong>
          <span class="lineage">level ${level}${up ? '' : ' · maxed'}</span>
        </div>
        <p class="fine-print">${current?.blurb ?? ''}</p>
        ${up ? `
          <div class="facility-next">
            <div>
              <strong>${up.level.name}</strong>
              <p class="fine-print">${up.level.blurb}</p>
              ${blockedNode ? `<p class="fine-print locked-note">Needs ${nodeName(content, blockedNode.nodeId)} held.</p>` : ''}
              ${short ? `<p class="fine-print locked-note">Short by $${short.short}.</p>` : ''}
            </div>
            <button type="button" data-act="upgrade" data-track="${track.id}" ${up.affordable ? '' : 'disabled'}>
              $${up.level.cost}
            </button>
          </div>` : ''}
      </div>`;
  }).join('');
  return collapsibleCard({
    id: 'facility',
    title: `${renderIcon('derelict-house')} Facility`,
    badge: affordable.length ? `${affordable.length} ready` : `${upgrades.length || '—'}`,
    summary,
    body: rows,
    open,
  });
}

// What the pens print where it used to say "????? (Gene Scanner required)".
// That line shipped in M6 advertising a machine that did not exist, which
// is the most conspicuous kind of unkept promise: the game itself telling
// the player about a feature nobody had built.
//
// A carrier is written differently from an expresser on purpose — one copy
// of a recessive is invisible in the animal and decisive in its offspring,
// and that distinction IS the breeding game.
function genesLine(animal, content, scanner) {
  if (!scanner.genotype) return '????? <span class="locked-note">(Gene Scanner required)</span>';
  const carried = Object.entries(animal.genotype ?? {}).filter(([, n]) => n > 0);
  if (!carried.length) return '<span class="genes-clean">nothing remarkable</span>';
  const expressed = new Set(expressedTraits(animal.genotype, content));
  return carried
    .map(([id, n]) => {
      const trait = content.traits?.[id];
      if (!trait) return null;
      const shown = expressed.has(id);
      return `<span class="gene-chip ${shown ? 'is-expressed' : 'is-carrier'}">${trait.name} ${n === 2 ? '××' : '×'}${
        shown ? '' : ' <em>carrier</em>'
      }</span>`;
    })
    .filter(Boolean)
    .join(' ');
}

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
  // What the operation actually banks. Upkeep used to be stock-only and
  // chimeras were free, so this number could never go negative and nobody
  // had to look at it. It can now.
  const territory = incomePerDay(state, content);
  const net = Math.round(TUNING.stipendPerDay + territory - upkeep);
  const scanner = scannerGrants(state, content);
  const catalog = catalogFor(state, content);
  if (!catalog.some((sp) => sp.id === catalogPick)) catalogPick = catalog[0]?.id ?? '';
  const catalogSpecies = catalog.find((sp) => sp.id === catalogPick) ?? null;

  // 40 animals and climbing: group the catalog by elemental class so the
  // sheet reads like a menagerie, not a phone book.
  // R72 - derived from the data, not typed out: a fourth class's animals
  // used to fall through every group and never appear in the catalog at all.
  // `null` stays last, because Unclassed is a leftover, not a class.
  const catalogGroups = [...Object.keys(content.classes ?? {}), null].map((cls) => {
    const rows = catalog.filter((sp) => (sp.class ?? null) === cls);
    return {
      label: cls ? `${renderIcon(content.classes[cls].icon)} ${content.classes[cls].name}` : 'Unclassed',
      options: rows.map((sp) => ({
        id: sp.id,
        label: sp.name,
        mark: classMark(content, sp.class),
        badge: `<span class="pick-price ${state.funds >= sp.mailOrderPrice ? '' : 'too-rich'}">$${sp.mailOrderPrice}</span>`,
        sub: `${sp.role} · ${sp.tags.join(', ') || 'no tags'} · upkeep $${sp.upkeepPerDay}/day`,
      })),
    };
  });

  // Path to World Domination: the guided first loop, gone after conquest #1.
  let onboarding = '';
  if (onboardingActive(state)) {
    const steps = onboardingSteps(state, content, t);
    const current = steps.find((s) => !s.done);
    onboarding = `
      <section class="card onboarding">
        <h3>${renderIcon('map')} Path to World Domination</h3>
        <ol class="onboard-list">
          ${steps
            .map((s) => `<li class="${s.done ? 'done' : s === current ? 'current' : ''}">${s.done ? '✔' : s === current ? '→' : '·'} ${s.label}</li>`)
            .join('')}
        </ol>
        ${current ? `<p class="fine-print">${current.hint}</p>` : ''}
      </section>`;
  }

  // A4: what is actually open right now, from the same module the smoke
  // suite scores a save with — so the screen and the acceptance criterion
  // cannot drift apart. Grouped by KIND, because the finding that queued
  // this phase was not that a losing player had nothing to do; it was that
  // everything they had was a way to spend money.
  const shape = agendaShape(state, content, t);
  const KINDS = [
    ['work', `${renderIcon('test-tube')} Make something`],
    ['campaign', `${renderIcon('map')} Push on the world`],
    ['spend', `${renderIcon('money-wings')} Spend money`],
  ];
  // R47: decided above the body, for the same reason the Breeding Pen is —
  // a shut fold must not build what it is not showing, and this is the
  // biggest card on the screen.
  const rightNowOpen = isOpen(state, 'right-now', !pathOwnsScreen(state));
  const rightNow = collapsibleCard({
    id: 'right-now',
    title: '☑ Right Now',
    badge: `<span class="pill">${shape.count} open</span>`,
    summary: shape.productive
      ? `${shape.productive} of them make something.`
      : 'All of them are ways to spend money — which is the state this panel exists to show you.',
    // Folded by default only while the Path to World Domination still owns
    // the screen: on visit one that guide IS the agenda, and two lists
    // saying the same thing is worse than either. Once the Path retires,
    // this is what replaces it, so it opens.
    open: rightNowOpen,
    // R47. Measured at 380px this card is 678px open — 42% of the Ranch's
    // chrome — because every open item got a full-width row with a wrapping
    // hint, at ~86px each. The module this reads from already says what to
    // do about that: "three things you can buy is not three things to do",
    // and "three ways to spend the same money is one idea wearing three
    // hats". So `spend` gets chips rather than rows. Nothing is hidden and
    // every click survives; the difference is that a purchase no longer
    // takes the same space as a thing you make.
    body: !rightNowOpen ? '' : KINDS.map(([kind, heading]) => {
      const items = shape.open.filter((i) => i.kind === kind);
      if (!items.length) return '';
      if (kind === 'spend') {
        return `<p class="agenda-head">${heading}</p><div class="agenda-chips">` + items.map((i) => `
          <button type="button" class="agenda-chip" data-goto="${i.screen}"${i.subtab ? ` data-subtab="${i.subtab}"` : ''} title="${i.hint}">${i.label}</button>`).join('') + '</div>';
      }
      return `<p class="agenda-head">${heading}</p>` + items.map((i) => `
        <button type="button" class="agenda-row" data-goto="${i.screen}"${i.subtab ? ` data-subtab="${i.subtab}"` : ''}>
          <span class="agenda-label">${i.label}</span>
          <span class="fine-print">${i.hint}</span>
        </button>`).join('');
    }).join('') || '<p class="fine-print">Nothing is open. Everything is on a timer — come back shortly.</p>',
  });

  // R47. Income, Upkeep and Net were three cells showing one subtraction —
  // the same "one idea wearing three hats" the agenda warns about — and at
  // 380px five cells wrapped to three rows, 106px of them. R40 already
  // solved this in the War Room: Net is the number, its derivation is its
  // subtitle. Three cells now, and the Ranch reads like the War Room.
  const head = `
    <section class="card">
      <div class="econ-row">
        <div><span class="econ-label">Slush fund</span><strong>$${Math.floor(state.funds)}</strong></div>
        <div><span class="econ-label">Net</span><strong class="${net < 0 ? 'net-negative' : 'net-positive'}">${net < 0 ? '−' : '+'}$${Math.abs(net)}/day</strong><span class="econ-next">+$${TUNING.stipendPerDay + territory} in, −$${upkeep} upkeep</span></div>
        <div><span class="econ-label">Pens</span><strong>${state.ranch.stock.length}/${state.ranch.penCapacity}</strong></div>
      </div>
      <div class="ranch-actions">
        <button type="button" data-act="pen">Expand pens +${TUNING.penUpgradeSize} — $${penUpgradeCost(state)}</button>
      </div>
      <div class="catalog">
        ${pickerField({
          id: 'catalog-pick',
          label: 'Mail-Order Menagerie',
          count: catalog.length || null,
          value: catalogSpecies
            ? `${classMark(content, catalogSpecies.class)}${catalogSpecies.name}`
            : '— conquer territory to open the catalog —',
          hint: catalogSpecies
            ? `$${catalogSpecies.mailOrderPrice} · ${catalogSpecies.role} · ${catalogSpecies.tags.join(', ') || 'no tags'}`
            : '',
          disabled: !catalog.length,
        })}
        <button type="button" data-act="order" ${catalog.length ? '' : 'disabled'}>Order</button>
      </div>
      <p class="ranch-msg">${lastMsg}</p>
    </section>
    ${facilityCard(state, content)}`;

  // Breeding Pen: adults of one species, opposite sexes. The egg does the rest.
  const eligible = state.ranch.stock.filter((a) => ageStage(a, content, t) !== 'juvenile');
  // R47. Measured at 380px, this card is 223px whether or not it can do
  // anything — and it cannot until two adults of one stock and opposite
  // sexes are standing in the pens, which on a fresh save is hours away.
  // 223px of disabled pickers was the clearest dead weight in the Ranch's
  // ~1,600px of chrome, so it folds: SHUT when there is no pairing to make,
  // open the moment there is.
  //
  // The open/shut decision is made HERE, above the body, because R44's rule
  // applies to this card too: a shut fold must not build what it is not
  // showing. The pickers walk the whole herd to group it by species.
  const pairable = new Map();
  for (const a of eligible) {
    const stock = baseSpecies(a.species, content);
    const seen = pairable.get(stock) ?? new Set();
    seen.add(a.sex);
    pairable.set(stock, seen);
  }
  const canPair = [...pairable.values()].some((sexes) => sexes.size > 1);
  const incubatorFull = state.ranch.eggs.length >= incubatorSlots(state, content);
  const breedingOpen = isOpen(state, 'breeding-pen', canPair && !incubatorFull);
  if (!eligible.some((a) => a.id === pickA)) pickA = '';
  // Same STOCK, not the same species string: an Alpine Ram is still a ram,
  // and crossing a lucky mutant back into the good line is the point of it
  // (canBreed has always allowed this — the picker was hiding it).
  const partnerPool = eligible.filter((b) => {
    const a = eligible.find((x) => x.id === pickA);
    return (
      a && b.id !== a.id && b.sex !== a.sex &&
      baseSpecies(b.species, content) === baseSpecies(a.species, content)
    );
  });
  if (!partnerPool.some((b) => b.id === pickB)) pickB = '';
  const parentRow = (a) => ({
    id: a.id,
    label: `${a.name} ${a.sex === 'F' ? '♀' : '♂'}`,
    mark: classMark(content, content.species[a.species]?.class),
    sub: `${speciesOf(content, a.species).name} · ${STAGE_LABELS[ageStage(a, content, t)]} · condition ${Math.round(a.condition)}`,
  });
  const parentGroups = (pool) => {
    const bySpecies = new Map();
    for (const a of pool) {
      if (!bySpecies.has(a.species)) bySpecies.set(a.species, []);
      bySpecies.get(a.species).push(a);
    }
    return [...bySpecies.entries()]
      .sort((x, y) => (speciesOf(content, x[0]).name > speciesOf(content, y[0]).name ? 1 : -1))
      .map(([sp, pool2]) => ({ label: speciesOf(content, sp).name, options: pool2.map(parentRow) }));
  };
  const parentField = (id, label, pick, pool, disabled) => {
    const a = pool.find((x) => x.id === pick) ?? null;
    return pickerField({
      id,
      label,
      count: pool.length || null,
      value: a ? `${a.name} ${a.sex === 'F' ? '♀' : '♂'}` : disabled ? 'Pick Parent A first' : pool.length ? '— choose —' : 'No eligible adults',
      hint: a ? speciesOf(content, a.species).name : '',
      disabled: disabled || !pool.length,
    });
  };
  // The Predictive Pairing Suite (Gene Scanner Tier III). Inheritance here
  // is a closed form, not a simulation, so these are real percentages —
  // and the carrier/expresses split is the whole of the breeding game made
  // visible: one copy of a recessive shows up in no animal and decides
  // every one of its grandchildren.
  const sireA = pickA ? state.ranch.stock.find((a) => a.id === pickA) : null;
  const damB = pickB ? state.ranch.stock.find((a) => a.id === pickB) : null;
  let forecast = '';
  if (scanner.pairing && sireA && damB) {
    const rows = pairingForecast(sireA, damB, content);
    forecast = `
      <div class="pairing-forecast">
        <p class="econ-label">${renderIcon('microscope')} Predicted offspring</p>
        ${rows.length
          ? rows.map((r) => `
            <div class="pairing-row">
              <span>${r.trait.name} <em>${r.trait.dominant ? 'dominant' : 'recessive'}</em></span>
              <span class="pairing-odds">carries <strong>${Math.round(r.carrier * 100)}%</strong> · shows <strong>${Math.round(r.express * 100)}%</strong></span>
            </div>`).join('')
          : '<p class="fine-print">Neither of them is carrying anything. This pairing produces a very ordinary animal, quickly.</p>'}
      </div>`;
  } else if (scanner.pairing) {
    forecast = '<p class="fine-print">Pick both parents and the Suite will run the numbers.</p>';
  }

  const breedingSummary = incubatorFull
    ? 'The incubator is full. Hatch something first.'
    : !eligible.length
      ? 'Nobody is old enough yet. Adults only — the paperwork is very clear.'
      : !canPair
        ? `${eligible.length} adult${eligible.length === 1 ? '' : 's'}, no pair. Two of one stock, opposite sexes.`
        : 'A pairing is available.';
  const breeding = collapsibleCard({
    id: 'breeding-pen',
    title: 'Breeding Pen',
    badge: canPair && !incubatorFull
      ? '<span class="pen-ready">pairing available</span>'
      : `<span class="pen-wait">${eligible.length} adult${eligible.length === 1 ? '' : 's'}</span>`,
    summary: breedingSummary,
    open: breedingOpen,
    body: !breedingOpen ? '' : `
      <div class="slot-grid">
        ${parentField('breed-a', 'Parent A', pickA, eligible, false)}
        ${parentField('breed-b', 'Parent B', pickB, partnerPool, !pickA)}
      </div>
      ${forecast}
      <button type="button" class="big-btn" data-act="breed" ${pickA && pickB ? '' : 'disabled'}>${renderIcon('heart')} Introduce Them (science)</button>`,
  });

  // Incubator: eggs on real-world timers, hatched by hand.
  // R75 — `hatchEgg` already refuses a hatch into full pens and says why, so
  // nothing was ever lost; the button just did not know. An enabled control
  // that answers a tap with a complaint is the shape R49 took off the map's
  // spar button — the predicate the action reads belongs on the control too.
  const pensFull = state.ranch.stock.length >= state.ranch.penCapacity;
  const eggCards = state.ranch.eggs.map((egg) => {
    const species = speciesOf(content, egg.species);
    const ready = t >= egg.hatchAt && !pensFull;
    // The egg shows its BASE stock: a variant is a surprise you earn at the
    // moment of hatching, not something the incubator spoils.
    const shown = speciesOf(content, species.variantOf ?? species.id);
    return `
      <div class="encounter">
        <div class="egg-wrap">${eggSVG(species.palette)}</div>
        <div style="flex:1;min-width:0">
          <strong>${shown.name} egg</strong><br>
          <span class="fine-print">of ${egg.parents.sire.name} ★${egg.parents.sire.stars} × ${egg.parents.dam.name} ★${egg.parents.dam.stars}${
            egg.mutationNote || egg.variantNote ? ' · the egg vibrates suspiciously' : ''
          }</span>
        </div>
        <button type="button" data-act="hatch" data-egg="${egg.id}" ${ready ? '' : 'disabled'} title="${
          t < egg.hatchAt ? 'Still incubating.' : pensFull ? 'The pens are full — free one first.' : 'Hatch it'
        }">${
          t < egg.hatchAt ? fmtDuration(egg.hatchAt - t) : pensFull ? 'Pens full' : 'Hatch!'
        }</button>
      </div>`;
  }).join('');
  const incubator = `
    <section class="card">
      <h3>Incubator (${state.ranch.eggs.length}/${incubatorSlots(state, content)})</h3>
      ${eggCards || '<p class="ranch-msg">No eggs. The incubator hums expectantly.</p>'}
    </section>`;

  // R46. Measured at 380px, one animal card is 514px and the Ranch grew by
  // exactly that per head: 3,269px at four, 7,438px at twelve, 11,607px at
  // twenty — 14.5 screens, and the pens expand without a ceiling, so it
  // only gets worse. (R44's note that the Ranch "uses the same 1081px card
  // shape" as the Pens was wrong: a Ranch card is less than half that. The
  // shape was fine; the multiplication was the problem.)
  //
  // Same fix as the Pens, same machinery, and the same rule with it —
  // ALERTS NEVER HIDE. The clock that costs you something here is the one
  // R38 was written about: an animal that ages past Prime loses grade, and
  // nothing else on this screen has a deadline. It rides on the SHUT row.
  const careReadyCount = (animal) => CARE_ACTIONS.filter((a) => careStatus(animal, t)[a].ready).length;
  const RANCH_BANDS = [
    { id: 'graduate', label: 'Ready to graduate' },
    { id: 'care', label: 'Needs care' },
    { id: 'growing', label: 'Growing' },
  ];
  const bandOf = (animal) => {
    const stage = ageStage(animal, content, t);
    if (stage === 'prime' || stage === 'elder') return 'graduate';
    return careReadyCount(animal) ? 'care' : 'growing';
  };

  const cards = bandedHtml(state.ranch.stock, RANCH_BANDS, bandOf, (animal) => {
    const species = speciesOf(content, animal.species);
    const stage = ageStage(animal, content, t);
    const next = nextStage(animal, content, t);
    const tier = conditionTier(animal.condition);
    const care = careStatus(animal, t);
    const open = isOpen(state, `ranch-${animal.id}`, false);
    const portrait = !open ? '' : creaturePortrait(stockGenome(animal.species, content), content, {
      idPrefix: `pt-${animal.id}`,
      condition: tier === 'fine' ? null : tier,
      extraScale: STAGE_SCALE[stage],
    });
    const buttons = !open ? '' : CARE_ACTIONS.map((action) => {
      const cost = action === 'feed' ? ` $${species.feedCost}` : '';
      const label = care[action].ready
        ? `${CARE_LABELS[action]}${cost}`
        : `${CARE_LABELS[action]} (${fmtDuration(care[action].msRemaining)})`;
      return `<button type="button" data-act="care" data-animal="${animal.id}" data-care="${action}" ${care[action].ready ? '' : 'disabled'}>${label}</button>`;
    }).join('');

    // R38. One word said the same thing about three different animals.
    const outlook = gradeOutlook(animal, content, t, state);
    const ready = careReadyCount(animal);

    // The badge is the one thing that must survive the fold, so it carries
    // the most expensive thing to miss: at Prime there is a countdown to
    // ageing out of it, and that is real grade lost. Care being ready is a
    // prompt, not a deadline, so it ranks under it and still shows in the
    // summary line either way.
    const badge = stage === 'prime' && next
      ? `<span class="pen-alert">${renderIcon('graduation-cap')} Prime for ${fmtDuration(next.msRemaining)}</span>`
      : stage === 'elder'
        ? `<span class="pen-alert">${renderIcon('graduation-cap')} past its Prime</span>`
        : ready
          ? `<span class="pen-ready">${ready} care ready</span>`
          : next
            ? `<span class="pen-wait">⏳ ${STAGE_LABELS[next.stage]} in ${fmtDuration(next.msRemaining)}</span>`
            : '<span class="pen-ready">ready</span>';
    const summary = `${classMark(content, species.class)}${species.name} · ${STAGE_LABELS[stage]} · condition ${Math.round(animal.condition)} · ${gradeFor(animal, content, t).name}${
      ready ? ` · ${ready} care ready` : ''
    }`;

    const body = !open ? '' : `
      <section class="card animal-card">
        <div class="portrait">${portrait}</div>
        <div class="animal-info">
          <h4>${animal.name} <button type="button" class="rename-btn" data-rename="${animal.id}" aria-label="Rename ${animal.name}">${renderIcon('pencil', { size: 15 })}</button> <span class="sex">${animal.sex === 'F' ? '♀' : '♂'}</span>${
            isVariant(animal.species, content) ? ' <span class="variant-badge">✦ variant</span>' : ''
          }${(animal.traits ?? [])
            .map((tr) => ` <span class="grade-badge grade-apex">${content.traits[tr]?.name ?? tr}</span>`)
            .join('')}</h4>
          <p class="meta">${species.name} · ${STAGE_LABELS[stage]}${next ? ` · ${STAGE_LABELS[next.stage]} in ${fmtDuration(next.msRemaining)}` : ''}</p>
          <p class="meta">${animal.parents
            ? `child of ${animal.parents.sire.name} ★${animal.parents.sire.stars} × ${animal.parents.dam.name} ★${animal.parents.dam.stars}`
            : 'origin: questionable paperwork'}</p>
          <div class="cond-bar"><div class="cond-fill tier-${tier}" style="width:${Math.round(animal.condition)}%"></div></div>
          <p class="cond-label">Condition ${Math.round(animal.condition)} · ${TIER_BLURBS[tier]}</p>
          <p class="meta">Diet: ${species.diet} · Genes: ${genesLine(animal, content, scanner)}</p>
          <p class="meta">Graduation forecast: <span class="grade-badge grade-${gradeFor(animal, content, t).id}">${gradeFor(animal, content, t).name}</span>${
            outlook.headroom > 0 ? ` <span class="headroom">+${outlook.headroom}</span>` : ''
          }</p>
          <p class="fine-print outlook">${outlookLine(outlook, animal.name)}</p>
          <div class="care-row">${buttons}</div>
          <button type="button" class="extract-btn" data-act="extract" data-animal="${animal.id}">${renderIcon('graduation-cap')} Extract (graduate ${animal.name})</button>
        </div>
      </section>`;

    return collapsibleCard({
      id: `ranch-${animal.id}`,
      title: `${animal.name} <span class="sex">${animal.sex === 'F' ? '♀' : '♂'}</span>${
        isVariant(animal.species, content) ? ' <span class="variant-badge">✦</span>' : ''
      }`,
      badge,
      summary,
      body,
      open,
      extraClass: 'pen-fold',
    });
  });

  // The field note sits under the Path (which owns the screen until the
  // first conquest) and above everything else, because a note nobody
  // scrolls to is a note nobody reads.
  const note = fieldNote(guideForScreen(state, content, t, 'ranch'));

  root.innerHTML = onboarding + note + rightNow + head + breeding + incubator + (cards || '<section class="card"><p class="ranch-msg">The pens are empty. Suspiciously tidy, though.</p></section>');
  const again = () => renderRanchScreen(root, ctx);
  root.querySelectorAll('button[data-rename]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openPrompt({
        title: 'Rename the asset',
        label: 'The herd registry will show:',
        value: ctx.state.ranch.stock.find((a) => a.id === btn.dataset.rename)?.name ?? '',
        onSubmit: (value) => {
          const res = renameCreature(ctx.state.ranch.stock, btn.dataset.rename, value);
          if (res.ok) ctx.save();
          // R75 — `renameCreature` refuses a blank or all-punctuation name and
          // says why, and this threw the sentence away: the prompt closed, the
          // name was unchanged, and nothing on the screen accounted for it.
          // The Pens rename already did this; the Ranch one did not.
          lastMsg = res.msg;
          again();
        },
      });
    });
  });
  bindFieldNote(root, ctx, again);
  bindFolds(root, ctx, again);
  root.querySelectorAll('button[data-goto]').forEach((btn) => {
    btn.addEventListener('click', () => ctx.goto?.(btn.dataset.goto, btn.dataset.subtab));
  });

  bindPickers(root, {
    'catalog-pick': () => ({
      title: 'Mail-Order Menagerie',
      subtitle: `Slush fund $${Math.floor(state.funds)}. Livestock arrives in an unmarked van, as tradition demands.`,
      selectedId: catalogPick,
      groups: catalogGroups,
      onPick: (value) => { catalogPick = value; renderRanchScreen(root, ctx); },
    }),
    'breed-a': () => ({
      title: 'Parent A',
      subtitle: 'Adults only. The juveniles have homework.',
      selectedId: pickA,
      groups: parentGroups(eligible),
      onPick: (value) => { pickA = value; pickB = ''; renderRanchScreen(root, ctx); },
    }),
    'breed-b': () => ({
      title: 'Parent B',
      subtitle: 'Same species, opposite sex. Genetics is picky about exactly two things.',
      selectedId: pickB,
      groups: parentGroups(partnerPool),
      onPick: (value) => { pickB = value; renderRanchScreen(root, ctx); },
    }),
  });

  root.querySelectorAll('button[data-act]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const t2 = ctx.now();
      let result;
      if (btn.dataset.act === 'care') {
        result = careAction(ctx.state, btn.dataset.animal, btn.dataset.care, content, t2);
      } else if (btn.dataset.act === 'pen') {
        result = buyPenUpgrade(ctx.state);
      } else if (btn.dataset.act === 'upgrade') {
        result = buyUpgrade(ctx.state, content, btn.dataset.track);
        if (result.ok) {
          sfx.play('splice');
          if (result.news) ctx.pushNews?.(result.news);
        }
      } else if (btn.dataset.act === 'order') {
        result = buyMailOrder(ctx.state, catalogPick, content, t2);
      } else if (btn.dataset.act === 'breed') {
        result = breedPair(ctx.state, pickA, pickB, content, t2);
        if (result.ok) { pickA = ''; pickB = ''; }
      } else if (btn.dataset.act === 'hatch') {
        result = hatchEgg(ctx.state, btn.dataset.egg, content, t2);
        if (result.ok) {
          sfx.play(result.firstOfItsKind ? 'graduate' : 'hatch');
          if (result.variant) {
            lastMsg = result.msg;
            ctx.save();
            showVariantCeremony(ctx, result, () => renderRanchScreen(root, ctx));
            return;
          }
        }
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
