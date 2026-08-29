// Gene Vault screen: DNA vials and extracted part tokens with lineage.
// Read-only in M2 — the Surgery Theater starts consuming these in M3.

import { SLOTS } from '../render/renderer.js';
import { GRADES, GRADE_INDEX } from './extract.js';
import { vialSVG } from './extract-ui.js';

const SLOT_LABELS = {
  head: 'Head', forelimbs: 'Forelimbs', hindlimbs: 'Hindlimbs',
  tail: 'Tail', hide: 'Hide', organ: 'Organ',
};

export function renderVaultScreen(root, ctx) {
  const { state, content } = ctx;
  const inv = state.inventory;

  const vials = inv.vials.length
    ? `<ul class="token-list">${inv.vials
        .map((v) => {
          const sp = content.species[v.species];
          return `<li>${vialSVG(sp.palette.accent)} ${sp.name} essence <span class="lineage">from ${v.donorName} ★${v.stars}</span></li>`;
        })
        .join('')}</ul>`
    : '<p class="ranch-msg">No essence on file. The centrifuge is bored.</p>';

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
    <section class="card">
      <h3>DNA Vials</h3>
      ${vials}
    </section>
    <section class="card">
      <h3>Part Tokens (${inv.parts.length})</h3>
      ${partSections || '<p class="ranch-msg">The vault echoes. Graduate someone.</p>'}
      <p class="fine-print">Every token remembers its donor forever. It&#39;s sentimental. And legally binding.</p>
    </section>`;
}
