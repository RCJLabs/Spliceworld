// Gene Vault screen: DNA vials and extracted part tokens with lineage.
// Read-only in M2 — the Surgery Theater starts consuming these in M3.

import { SLOTS } from '../render/renderer.js';
import { GRADES, GRADE_INDEX } from './extract.js';
import { vialSVG } from './extract-ui.js';

const SLOT_LABELS = {
  head: 'Heads', forelimbs: 'Forelimbs', hindlimbs: 'Hindlimbs',
  tail: 'Tails', hide: 'Hides', organ: 'Organs',
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

  const bySlot = new Map(SLOTS.map((s) => [s, []]));
  for (const token of inv.parts) bySlot.get(content.parts[token.partId].slot)?.push(token);
  for (const list of bySlot.values()) {
    list.sort((a, b) => GRADE_INDEX[b.grade] - GRADE_INDEX[a.grade]);
  }

  const partSections = SLOTS.map((slot) => {
    const tokens = bySlot.get(slot);
    if (!tokens.length) return '';
    const rows = tokens
      .map((t) => {
        const part = content.parts[t.partId];
        const grade = GRADES[GRADE_INDEX[t.grade]];
        const traits = (t.traits ?? []).map((tr) => ` <span class="grade-badge grade-apex">${content.traits[tr]?.name ?? tr}</span>`).join('');
        return `<li><span class="grade-badge grade-${t.grade}">${grade.name}</span> ${part.name}${traits} <span class="lineage">essence of ${t.donor.name} ★${t.donor.stars}</span></li>`;
      })
      .join('');
    return `<h3>${SLOT_LABELS[slot]}</h3><ul class="token-list">${rows}</ul>`;
  }).join('');

  root.innerHTML = `
    <section class="card">
      <h3>DNA Vials</h3>
      ${vials}
    </section>
    <section class="card">
      <h3>Part Tokens</h3>
      ${partSections || '<p class="ranch-msg">The vault echoes. Graduate someone.</p>'}
      <p class="fine-print">Every token remembers its donor forever. It&#39;s sentimental. And legally binding.</p>
    </section>`;
}
