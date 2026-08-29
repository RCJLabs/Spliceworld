// Splice-Dex (M7): the collection screen. Species roster, part discoveries,
// combo abilities (undiscovered ones stay as ??? bait), known traits, and
// the enemy field guide. Everything derives from content + state.dex.

import { renderCreatureSVG, renderUnitSVG } from '../render/renderer.js';
import { stockGenome } from '../ranch/ranch.js';

export function renderDexScreen(root, ctx) {
  const { state, content } = ctx;
  const dex = state.dex;

  const CLASS_ORDER = ['ground', 'water', 'air'];
  const speciesByClass = (cls) => Object.values(content.species)
    .filter((sp) => !sp.synthetic && !sp.variantOf && sp.class === cls)
    .map((sp) => {
      const total = Object.values(content.parts).filter((p) => p.species === sp.id).length;
      const found = dex.parts.filter((p) => content.parts[p].species === sp.id).length;
      return `
        <div class="dex-cell">
          <div class="dex-portrait">${renderCreatureSVG(stockGenome(sp.id, content), content, { idPrefix: `dex-${sp.id}`, extraScale: 0.85 })}</div>
          <strong>${sp.name}</strong>
          <span class="fine-print">${sp.role} · parts ${found}/${total}</span>
        </div>`;
    })
    .join('');
  const classSections = CLASS_ORDER.map((cls) => {
    const def = content.classes[cls];
    const cells = speciesByClass(cls);
    const owned = Object.values(content.species).filter(
      (sp) => !sp.synthetic && sp.class === cls &&
        dex.parts.some((p) => content.parts[p].species === sp.id)
    ).length;
    const total = Object.values(content.species).filter((sp) => !sp.synthetic && sp.class === cls).length;
    return `<h3>${def.icon} ${def.name} — beats ${content.classes[def.beats].name} <span class="lineage">${owned}/${total} met</span></h3>
      <div class="dex-grid">${cells}</div>`;
  }).join('');
  const salvageTotal = Object.values(content.parts).filter((p) => p.species === 'salvage').length;
  const salvageFound = dex.parts.filter((p) => content.parts[p].species === 'salvage').length;

  const comboRows = Object.values(content.combos)
    .map((combo) => {
      const found = state.discoveredCombos.includes(combo.id);
      return found
        ? `<li><span class="grade-badge grade-prismatic">${combo.name}</span> ${combo.desc} <span class="lineage">${combo.parts.map((p) => content.parts[p].name).join(' + ')}</span></li>`
        : `<li><span class="grade-badge grade-standard">???</span> <span class="lineage">an undiscovered pairing lurks in the parts bin…</span></li>`;
    })
    .join('');

  const traitRows = Object.values(content.traits)
    .map((trait) =>
      dex.traits.includes(trait.id)
        ? `<li><span class="grade-badge grade-apex">${trait.name}</span> ${trait.desc}</li>`
        : `<li><span class="grade-badge grade-standard">???</span> <span class="lineage">a gene the bloodlines haven't coughed up yet…</span></li>`
    )
    .join('');

  const enemyRows = Object.values(content.enemies)
    .map((unit) => {
      const met = dex.enemies.includes(unit.id);
      return `
        <div class="dex-cell ${met ? '' : 'dex-unknown'}">
          <div class="dex-portrait">${met ? renderUnitSVG(unit) : '<div class="dex-mystery">?</div>'}</div>
          <strong>${met ? unit.name : '???'}</strong>
          ${met ? `<span class="fine-print">${unit.tags.join(' · ') || 'Organic'}</span>` : ''}
        </div>`;
    })
    .join('');

  const discovered = state.discoveredCombos.length;
  const comboTotal = Object.keys(content.combos).length;

  // Variants (§3.2): bred, never bought. Locked entries show the silhouette
  // and what stock it comes from — enough to know a line exists and to go
  // looking for it, not enough to spoil the hatch.
  const bred = state.dex.variants ?? [];
  const variants = Object.values(content.species).filter((sp) => sp.variantOf);
  const variantRows = variants
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

  root.innerHTML = `
    <section class="card">
      <h3>Class Triangle</h3>
      <p class="fine-print">${CLASS_ORDER.map((c) => `${content.classes[c].icon} ${content.classes[c].name} beats ${content.classes[content.classes[c].beats].name}`).join(' · ')}. A chimera's class comes from its anatomy — ${CLASS_ORDER.map((c) => content.classes[c].cue).join('; ')} — and a tie leaves it Unclassed (neutral both ways).</p>
    </section>
    <section class="card">
      ${classSections}
      <p class="fine-print">Enemy tech: ${salvageFound}/${salvageTotal} salvaged (Containment Cannon required).</p>
    </section>
    <section class="card">
      <h3>✦ Variants (${bred.length}/${variants.length} bred)</h3>
      <p class="fine-print">Variant species are never sold. They surface as rare mutations in the incubator — and once one hatches, it breeds true. Pair two and the line continues.</p>
      ${variantRows}
    </section>
    <section class="card">
      <h3>Combo Abilities (${discovered}/${comboTotal})</h3>
      <ul class="token-list">${comboRows}</ul>
    </section>
    <section class="card">
      <h3>Trait Genes</h3>
      <ul class="token-list">${traitRows}</ul>
    </section>
    <section class="card">
      <h3>Field Guide — Opposition</h3>
      <div class="dex-grid">${enemyRows}</div>
      <p class="fine-print">Every entry remembers you too. That's the AI director's notebook.</p>
    </section>`;
}
