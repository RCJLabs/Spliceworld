// Splice-Dex (M7): the collection screen. Species roster, part discoveries,
// combo abilities (undiscovered ones stay as ??? bait), known traits, and
// the enemy field guide. Everything derives from content + state.dex.
//
// R45 put it behind tabs. Measured at 380px it was 7,113px on a fresh save
// and 9,998px late — 12.5 phone screens and 80 inline SVGs in one column,
// so finding the trait list meant scrolling past forty species portraits
// every single time. Tabs rather than R44's folds because the Dex is a
// reference screen: you come here to look something up, and a screen where
// everything starts shut is a worse place to browse than a long one. R15's
// War Room bar is the precedent, and its rule — alerts never go behind a
// tab — is why completion and the field note stay above it.
//
// Each tab's HTML is built only when it is the active one. That is the
// actual saving: a hidden tab costs nothing, and the portraits are the
// expensive part.

import { renderCreatureSVG, renderUnitSVG, renderRivalSVG } from '../render/renderer.js';
import { stockGenome } from '../ranch/ranch.js';
import { comboHint } from './theater.js';
import { rivalList, rivalRecord } from '../campaign/rivals.js';
import { fieldNote, bindFieldNote } from '../ui/cards.js';
import { subtabBar, bindSubtabs } from '../ui/tabs.js';
import { bandHead } from '../ui/roster.js';
import { openPicker } from '../ui/picker.js';
import { speciesLines, speciesParts, dexProgress, beatenUnits } from './dexentry.js';
import { gauntletStages } from '../campaign/gauntlet.js';
import { guideForScreen } from '../ranch/onboarding.js';

const CLASS_ORDER = ['ground', 'water', 'air'];

const DEX_TABS = [
  { id: 'roster', icon: '🧬', label: 'Roster' },
  { id: 'variants', icon: '✦', label: 'Variants' },
  { id: 'combos', icon: '⚡', label: 'Combos' },
  { id: 'genes', icon: '🧪', label: 'Genes' },
  { id: 'foes', icon: '👁', label: 'Foes' },
];
let dexTab = 'roster';

// --- Roster: the base species, by class, and the triangle that explains
// why the classes matter at all.
function rosterView(state, content) {
  const dex = state.dex;
  const speciesByClass = (cls) => Object.values(content.species)
    .filter((sp) => !sp.synthetic && !sp.variantOf && sp.class === cls)
    .map((sp) => {
      const total = Object.values(content.parts).filter((p) => p.species === sp.id).length;
      const found = dex.parts.filter((p) => content.parts[p].species === sp.id).length;
      // R36. The cell stays scannable — a 100px grid column cannot carry a
      // set bonus and its effect — and gains the tags, which is what the
      // variants and the enemy field guide already show and the base roster
      // did not. The depth is one tap away rather than crammed in here.
      return `
        <button type="button" class="dex-cell dex-open" data-species="${sp.id}">
          <div class="dex-portrait">${renderCreatureSVG(stockGenome(sp.id, content), content, { idPrefix: `dex-${sp.id}`, extraScale: 0.85 })}</div>
          <strong>${sp.name}</strong>
          <span class="fine-print">${sp.role}${sp.tags.length ? ` · ${sp.tags.join(', ')}` : ''}</span>
          <span class="fine-print">parts ${found}/${total}</span>
        </button>`;
    })
    .join('');
  const classSections = CLASS_ORDER.map((cls) => {
    const def = content.classes[cls];
    const owned = Object.values(content.species).filter(
      (sp) => !sp.synthetic && sp.class === cls &&
        dex.parts.some((p) => content.parts[p].species === sp.id)
    ).length;
    const total = Object.values(content.species).filter((sp) => !sp.synthetic && sp.class === cls).length;
    return `<h3>${def.icon} ${def.name} — beats ${content.classes[def.beats].name} <span class="lineage">${owned}/${total} met</span></h3>
      <div class="dex-grid">${speciesByClass(cls)}</div>`;
  }).join('');
  const salvageTotal = Object.values(content.parts).filter((p) => p.species === 'salvage').length;
  const salvageFound = dex.parts.filter((p) => content.parts[p].species === 'salvage').length;

  return `
    <section class="card">
      <h3>Class Triangle</h3>
      <p class="fine-print">${CLASS_ORDER.map((c) => `${content.classes[c].icon} ${content.classes[c].name} beats ${content.classes[content.classes[c].beats].name}`).join(' · ')}. A chimera's class comes from its anatomy — ${CLASS_ORDER.map((c) => content.classes[c].cue).join('; ')} — and a tie leaves it Unclassed (neutral both ways).</p>
    </section>
    <section class="card">
      ${classSections}
      <p class="fine-print">Enemy tech: ${salvageFound}/${salvageTotal} salvaged (Containment Cannon required).</p>
    </section>`;
}

// --- Variants (§3.2): bred, never bought. Locked entries show the
// silhouette and what stock it comes from — enough to know a line exists
// and to go looking for it, not enough to spoil the hatch.
function variantsView(state, content) {
  const bred = state.dex.variants ?? [];
  const variants = Object.values(content.species).filter((sp) => sp.variantOf);
  const rows = variants
    .map((sp) => {
      const found = bred.includes(sp.id);
      const base = content.species[sp.variantOf];
      return `
        <div class="variant-row ${found ? '' : 'variant-locked'}">
          <div class="variant-portrait">${renderCreatureSVG(stockGenome(sp.id, content), content, { idPrefix: `var-${sp.id}`, extraScale: 0.8 })}</div>
          <div style="flex:1;min-width:0">
            <strong>${found ? sp.name : '???'}</strong>
            ${found ? `<span class="variant-badge">✦ bred</span>` : ''}
            <p class="fine-print">${found ? sp.flavor : `A rumoured mutation of the ${base.name} line.`}</p>
            <p class="fine-print">${content.classes[sp.class].icon} ${content.classes[sp.class].name}${
              found ? ` · ${sp.tags.join(', ') || 'no tags'} · ${sp.setBonus.name}` : ` · from ${base.name} stock`
            }</p>
          </div>
        </div>`;
    })
    .join('');
  return `
    <section class="card">
      <h3>✦ Variants (${bred.length}/${variants.length} bred)</h3>
      <p class="fine-print">Variant species are never sold. They surface as rare mutations in the incubator — and once one hatches, it breeds true. Pair two and the line continues.</p>
      ${rows}
    </section>`;
}

// A labelled run of rows, skipped entirely when it is empty — an early
// save has no discoveries and a finished one has no rumours, and a heading
// over nothing is worse than no heading. R46 moved the heading itself to
// ui/roster.js, where the Ranch and the Pens read the same one.
function group(label, rows) {
  return rows.length ? bandHead(label, rows.length) + `<ul class="token-list">${rows.join('')}</ul>` : '';
}

// --- Combos. The tallest list in the Dex late (2,492px on its own), which
// is most of why the single column had to be broken up — and twenty-seven
// rows in content order meant the two you had actually found were buried
// among the twenty-five you had not.
//
// The three groups are three different things to do, not three shades of
// the same thing: what you know, what you could splice this evening, and
// what you still have parts to find for. comboHint already computed the
// middle one — it says "you have handled both, put them on the same
// creature" — and then dropped that row in the middle of the list.
function combosView(state, content) {
  const row = (combo) => {
    if (state.discoveredCombos.includes(combo.id)) {
      return `<li><span class="grade-badge grade-prismatic">${combo.name}</span> ${combo.desc} <span class="lineage">${combo.parts.map((p) => content.parts[p].name).join(' + ')}</span></li>`;
    }
    // A6: a silhouette has to point at something. These all used to read
    // "an undiscovered pairing lurks in the parts bin…" — twenty-seven
    // identical rows naming nothing at all.
    const hint = comboHint(combo, state, content);
    return `<li><span class="grade-badge ${hint.known === 2 ? 'grade-apex' : 'grade-standard'}">???</span> <span class="combo-keyword">${hint.keyword}</span> <span class="lineage">${hint.text}</span></li>`;
  };
  const all = Object.values(content.combos);
  const found = all.filter((c) => state.discoveredCombos.includes(c.id));
  const rest = all.filter((c) => !state.discoveredCombos.includes(c.id));
  const ready = rest.filter((c) => comboHint(c, state, content).known === 2);
  const rumoured = rest.filter((c) => comboHint(c, state, content).known !== 2);
  return `
    <section class="card">
      <h3>Combo Abilities (${found.length}/${all.length})</h3>
      ${group('Both halves in hand', ready.map(row))}
      ${group('Discovered', found.map(row))}
      ${group('Still rumoured', rumoured.map(row))}
    </section>`;
}

function genesView(state, content) {
  const all = Object.values(content.traits);
  const known = all.filter((t) => state.dex.traits.includes(t.id));
  const unknown = all.filter((t) => !state.dex.traits.includes(t.id));
  return `
    <section class="card">
      <h3>Trait Genes (${known.length}/${all.length})</h3>
      ${group('Sequenced', known.map((trait) =>
        `<li><span class="grade-badge grade-apex">${trait.name}</span> ${trait.desc}</li>`))}
      ${group('Not yet expressed', unknown.map(() =>
        `<li><span class="grade-badge grade-standard">???</span> <span class="lineage">a gene the bloodlines haven't coughed up yet…</span></li>`))}
    </section>`;
}

// --- Foes: the rival dossiers and the enemy field guide. One tab, because
// both answer the same question — who is on the other side of the board.
function foesView(state, content) {
  // Rival dossiers. Their whole record — defeats, losses, when you last met,
  // how far they have escalated since — was already kept in the save and
  // shown nowhere you could go back to. A rival you beat three regions ago
  // should be lookupable, and one you have never met should read as a rumour
  // rather than a spoiler.
  const meta = content.rivalMeta ?? {};
  const isMet = (r) => {
    const x = rivalRecord(state, r.id);
    return x.defeats > 0 || x.losses > 0 || x.lastMetAt != null;
  };
  const rivalRows = rivalList(content)
    .map((rival) => {
      const rec = rivalRecord(state, rival.id);
      if (!isMet(rival)) {
        return `
          <div class="variant-row variant-locked">
            <div style="flex:1;min-width:0">
              <strong>???</strong>
              <p class="fine-print">Someone out there is buying the same parts you are.</p>
            </div>
          </div>`;
      }
      // What they will bring NEXT — the same numbers rivalTeam derives, so
      // the dossier is a briefing rather than a scoreboard.
      const scale = Math.min(meta.powerCap ?? 99, rival.powerScale * (1 + rec.defeats * (meta.powerPerDefeat ?? 0)));
      const squad = Math.min(meta.teamCap ?? 3, rival.teamSize + Math.floor(rec.defeats / (meta.teamGrowthEvery ?? 2)));
      const tally = [
        rec.defeats ? `${rec.defeats} graduated` : null,
        rec.losses ? `${rec.losses} lost to them` : null,
      ].filter(Boolean).join(' · ') || 'met, undecided';
      return `
        <div class="variant-row">
          <div class="rival-face">${renderRivalSVG(rival, content.classes)}</div>
          <div style="flex:1;min-width:0">
            <strong>${rival.name}</strong>
            <span class="variant-badge">${tally}</span>
            <p class="fine-print">${rival.title}</p>
            <p class="fine-print">“${rival.philosophy}”</p>
            <p class="fine-print">Favours ${content.classes[rival.classBias]?.name ?? 'no class'}${
              rival.favoredTags?.length ? ` · ${rival.favoredTags.join(', ')}` : ''
            }${rival.counterBias ? ' · reads your stable' : ''}</p>
            <p class="fine-print">Next time: ${squad} in the field at ×${scale.toFixed(2)} power.</p>
          </div>
        </div>`;
    })
    .join('');

  // The field guide is the Dex's other gallery, and it was the only one in
  // file order — forty cells you scrolled to find one unit in. It groups by
  // the same class triangle the roster does, because the triangle is how
  // you pick what to send: knowing the Falconry Unit is Air is the whole
  // reason to look it up.
  // R51: a cell has three states now, not two. "Logged" meant a unit took
  // the field — which it also does while flattening you — so the guide read
  // identically whether you won or were carried out. Beaten is the column
  // that says which.
  const beaten = beatenUnits(state, content);
  const cell = (unit) => {
    const met = state.dex.enemies.includes(unit.id);
    const won = beaten.has(unit.id);
    return `
        <div class="dex-cell ${met ? '' : 'dex-unknown'}${won ? ' dex-beaten' : ''}">
          <div class="dex-portrait">${met ? renderUnitSVG(unit) : '<div class="dex-mystery">?</div>'}</div>
          <strong>${met ? unit.name : '???'}</strong>
          ${met ? `<span class="fine-print">${won ? '✓ beaten' : 'logged'} · ${unit.tags.join(' · ') || 'Organic'}</span>` : ''}
        </div>`;
  };
  const units = Object.values(content.enemies);
  const enemyRows = CLASS_ORDER.map((cls) => {
    const inClass = units.filter((u) => u.class === cls);
    if (!inClass.length) return '';
    const def = content.classes[cls];
    const met = inClass.filter((u) => state.dex.enemies.includes(u.id)).length;
    const won = inClass.filter((u) => beaten.has(u.id)).length;
    return `<h3>${def.icon} ${def.name} <span class="lineage">${met}/${inClass.length} logged${won ? ` · ${won} beaten` : ''}</span></h3>
      <div class="dex-grid">${inClass.map(cell).join('')}</div>`;
  }).join('');
  // A unit whose class is not one of the three would vanish from a grouped
  // guide, so it gets its own run rather than being silently dropped.
  const unclassed = units.filter((u) => !CLASS_ORDER.includes(u.class));

  // R42 left a note that its trophies lived on the War Room card and in the
  // wire but not here. They do now — as one line, because the four bosses
  // are already four of the forty cells below and a second gallery of the
  // same units would be the duplication R50 refused to ship.
  //
  // Gated on dominionAt exactly as the War Room card is: the Gauntlet does
  // not exist before the county is yours, and a Dex that named four unbeaten
  // bosses to a player mid-campaign would be a spoiler, not a trophy shelf.
  const stages = gauntletStages(content);
  const cleared = stages.filter((st) => (state.gauntletBeaten ?? []).includes(st.id));
  const gauntletShelf = state.dominionAt && stages.length
    ? `<p class="fine-print gauntlet-shelf">🏟 The Gauntlet — ${cleared.length}/${stages.length} exhibitions answered${
        cleared.length ? `: ${cleared.map((st) => content.enemies[st.unitId]?.name ?? st.name).join(', ')}` : ''
      }</p>`
    : '';

  return `
    <section class="card">
      <h3>Rival Geneticists (${rivalList(content).filter(isMet).length}/${rivalList(content).length} met)</h3>
      ${rivalRows}
    </section>
    <section class="card">
      <h3>Field Guide — Opposition (${state.dex.enemies.length}/${units.length} logged${
        beaten.size ? ` · ${beaten.size} beaten` : ''
      })</h3>
      ${gauntletShelf}
      ${enemyRows}
      ${unclassed.length ? `<h3>Unclassed <span class="lineage">${unclassed.length}</span></h3><div class="dex-grid">${unclassed.map(cell).join('')}</div>` : ''}
      <p class="fine-print">Every entry remembers you too. That's the AI director's notebook.</p>
    </section>`;
}

const VIEWS = {
  roster: rosterView,
  variants: variantsView,
  combos: combosView,
  genes: genesView,
  foes: foesView,
};

// Completion is why this screen exists, so it does not go behind a tab.
// One strip, every category, above the bar — which also means the tab you
// need next is legible before you tap anything.
function progressStrip(progress) {
  const chips = progress.rows
    .map((r) => {
      const done = r.total > 0 && r.found >= r.total;
      return `<span class="dex-chip${done ? ' dex-chip-done' : ''}">${r.label} <strong>${r.found}/${r.total}</strong></span>`;
    })
    .join('');
  return `
    <section class="card dex-progress">
      <h3>Splice-Dex <span class="lineage">${progress.found}/${progress.total} catalogued · ${progress.pct}%</span></h3>
      <div class="meter"><div class="meter-fill fill-dex" style="width:${progress.pct}%"></div></div>
      <div class="dex-chips">${chips}</div>
    </section>`;
}

export function renderDexScreen(root, ctx) {
  const { state, content } = ctx;
  const progress = dexProgress(state, content);
  const view = VIEWS[dexTab] ?? VIEWS.roster;

  // The only badge a Dex tab earns is "nothing left here". Anything else —
  // a count of what you are missing — would sit on every tab forever, and
  // a badge that is always lit is a badge nobody reads.
  const badgeFor = (id) => (progress.byTab[id]?.complete ? { text: '✓', kind: 'count' } : null);

  root.innerHTML = `
    ${fieldNote(guideForScreen(state, content, ctx.now?.() ?? Date.now(), 'dex'))}
    ${progressStrip(progress)}
    ${subtabBar({ tabs: DEX_TABS, active: dexTab, attr: 'dex-tab', id: 'dex-subtabs', badgeFor })}
    ${view(state, content)}`;

  bindFieldNote(root, ctx, () => renderDexScreen(root, ctx));
  bindSubtabs(root, 'dex-tab', (id) => {
    dexTab = id;
    renderDexScreen(root, ctx);
    root.querySelector('#dex-subtabs')?.scrollIntoView({ block: 'start' });
  });

  // Tap a species for the entry the grid has no room for: what it is, what
  // four of its parts buy you, and which of its six you have actually met.
  // A read-only sheet, so `onPick` closes and does nothing.
  root.querySelectorAll?.('button[data-species]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sp = content.species[btn.dataset.species];
      if (!sp) return;
      const parts = speciesParts(sp, content, state.dex.parts);
      openPicker({
        title: sp.name,
        subtitle: speciesLines(sp, content).join('<br>'),
        groups: [{
          label: `Parts — ${parts.filter((p) => p.found).length}/${parts.length} met`,
          options: parts.map((p) => ({
            id: p.id,
            label: p.label,
            sub: p.sub,
            badge: p.found ? '' : '<span class="grade-badge grade-standard">???</span>',
            disabled: true,
          })),
        }],
        selectedId: '',
        onPick: () => {},
      });
    });
  });
}
