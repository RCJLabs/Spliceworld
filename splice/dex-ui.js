// Splice-Dex (M7): the collection screen. Species roster, part discoveries,
// combo abilities (undiscovered ones stay as ??? bait), known traits, and
// the enemy field guide. Everything derives from content + state.dex.

import { renderCreatureSVG, renderUnitSVG } from '../render/renderer.js';
import { stockGenome } from '../ranch/ranch.js';

export function renderDexScreen(root, ctx) {
  const { state, content } = ctx;
  const dex = state.dex;

  const speciesRows = Object.values(content.species)
    .filter((sp) => !sp.synthetic)
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

  root.innerHTML = `
    <section class="card">
      <h3>Species</h3>
      <div class="dex-grid">${speciesRows}</div>
      <p class="fine-print">Enemy tech: ${salvageFound}/${salvageTotal} salvaged (Containment Cannon required).</p>
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
