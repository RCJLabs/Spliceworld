// Surgery Theater screen (M3): assemble vault tokens on a frame, watch the
// physiology panel explain the consequences live, then splice. Replaces the
// M0 free-form dev slab — every part here is an owned token with lineage.

import { renderCreatureSVG, SLOTS } from '../render/renderer.js';
import { GRADES, GRADE_INDEX } from './extract.js';
import { analyze } from './physiology.js';
import { spliceChimera, validateSplice, tokensFor } from './theater.js';
import * as sfx from '../audio/sfx.js';

const SLOT_LABELS = {
  head: 'Head', forelimbs: 'Forelimbs', hindlimbs: 'Hindlimbs',
  tail: 'Tail', hide: 'Hide', organ: 'Organ',
};

// Screen-local draft (not saved: an unspliced slab is just a shopping cart).
let draft = { frame: 'M', slots: {} };
let lastMsg = 'The slab is sterile-ish. Select parts from the vault.';

function draftGenome(state, content) {
  const parts = {};
  for (const [slot, tokenId] of Object.entries(draft.slots)) {
    const token = state.inventory.parts.find((t) => t.id === tokenId);
    if (token) parts[slot] = token.partId;
  }
  return { frame: draft.frame, parts };
}

export function renderTheaterScreen(root, ctx) {
  const { state, content } = ctx;

  // Drop draft picks whose tokens vanished (spliced or from another screen).
  for (const [slot, tokenId] of Object.entries(draft.slots)) {
    if (!state.inventory.parts.some((t) => t.id === tokenId)) delete draft.slots[slot];
  }

  const tokens = tokensFor(state, draft.slots, content);
  const report = analyze(draft.frame, tokens, content);

  const frameBtns = Object.values(content.frames)
    .map(
      (f) =>
        `<button type="button" data-frame="${f.id}" class="${f.id === draft.frame ? 'active' : ''}" title="${f.flavor}">${f.sizeClass} · ${f.name}</button>`
    )
    .join('');

  const chosen = new Set(Object.values(draft.slots).filter(Boolean));
  const CLASS_MARK = { air: '🪽', ground: '🦶', water: '🌊' };
  const slotSelects = SLOTS.map((slot) => {
    // 150 parts do not fit in a flat list — group by species, best grade first.
    const owned = state.inventory.parts.filter((t) => content.parts[t.partId]?.slot === slot);
    const bySpecies = new Map();
    for (const t of owned) {
      const sp = content.parts[t.partId].species;
      if (!bySpecies.has(sp)) bySpecies.set(sp, []);
      bySpecies.get(sp).push(t);
    }
    const groups = [...bySpecies.entries()]
      .sort((a, b) => (content.species[a[0]].name > content.species[b[0]].name ? 1 : -1))
      .map(([sp, tokens]) => {
        const opts = tokens
          .sort((a, b) => GRADE_INDEX[b.grade] - GRADE_INDEX[a.grade])
          .map((t) => {
            const part = content.parts[t.partId];
            const grade = GRADES[GRADE_INDEX[t.grade]];
            const taken = chosen.has(t.id) && draft.slots[slot] !== t.id;
            const mark = part.classAffinity ? ` ${CLASS_MARK[part.classAffinity]}` : '';
            return `<option value="${t.id}" ${draft.slots[slot] === t.id ? 'selected' : ''} ${taken ? 'disabled' : ''}>${part.name}${mark} · ${grade.name} (${t.donor.name} ★${t.donor.stars})</option>`;
          })
          .join('');
        return `<optgroup label="${content.species[sp].name}">${opts}</optgroup>`;
      })
      .join('');
    const count = owned.length;
    return `
      <label class="slot"><span>${SLOT_LABELS[slot]}${slot === 'head' ? ' *' : ''}${count ? ` <em>${count}</em>` : ''}</span>
        <select data-slot="${slot}" ${count ? '' : 'disabled'}>
          <option value="">${count ? '— empty socket —' : '— none in the vault —'}</option>
          ${groups}
        </select>
      </label>`;
  }).join('');

  const panelRows = report.rows
    .map(
      (r) =>
        `<div class="phys-row"><div class="phys-head"><span>${r.label}</span><strong>${r.value}</strong></div><p>${r.note}</p></div>`
    )
    .join('');

  const comboRows = report.combos.length
    ? `<div class="phys-row"><div class="phys-head"><span>Combo detected</span><strong>${report.combos
        .map((c) => c.name)
        .join(' + ')}</strong></div><p>${report.combos.map((c) => c.desc).join(' ')}</p></div>`
    : '';

  const errors = validateSplice(state, draft.frame, draft.slots, content);
  const statLine = `HP ${report.stats.hp} · PWR ${report.stats.power} · ARM ${report.stats.armor} · SPD ${report.stats.speed} · STA ${report.stats.stamina}`;

  root.innerHTML = `
    <section class="card stage-card">
      <h2>Surgery Theater</h2>
      <p class="class-banner class-${report.creatureClass ?? 'none'}">${
        report.creatureClass
          ? `${content.classes[report.creatureClass].icon} ${content.classes[report.creatureClass].name} — beats ${content.classes[content.classes[report.creatureClass].beats].name}`
          : '◇ Unclassed — neutral in every matchup'
      }</p>
      <p class="recipe">${statLine}${report.tags.length ? ` · tags: ${report.tags.join(', ')}` : ''}</p>
      <div class="stage">${renderCreatureSVG(draftGenome(state, content), content, { idPrefix: 'thtr' })}</div>
      <p class="ranch-msg">${lastMsg}</p>
    </section>
    <section class="card">
      <h3>Frame</h3>
      <div class="frame-picker" id="thtr-frames">${frameBtns}</div>
      <h3>Sockets (from the Vault)</h3>
      <div class="slot-grid">${slotSelects}</div>
      <button id="thtr-splice" type="button" class="big-btn" ${errors.length ? 'disabled' : ''}>⚡ SPLICE IT</button>
      ${errors.length && tokens.length ? `<p class="fine-print">${errors.join(' ')}</p>` : ''}
    </section>
    <section class="card">
      <h3>Physiology Panel</h3>
      ${panelRows}
      ${comboRows}
    </section>`;

  root.querySelectorAll('#thtr-frames button').forEach((btn) => {
    btn.addEventListener('click', () => {
      draft.frame = btn.dataset.frame;
      renderTheaterScreen(root, ctx);
    });
  });
  root.querySelectorAll('select[data-slot]').forEach((sel) => {
    sel.addEventListener('change', () => {
      if (sel.value) draft.slots[sel.dataset.slot] = sel.value;
      else delete draft.slots[sel.dataset.slot];
      renderTheaterScreen(root, ctx);
    });
  });
  root.querySelector('#thtr-splice').addEventListener('click', () => {
    const result = spliceChimera(state, draft.frame, draft.slots, content, ctx.now());
    lastMsg = result.msg;
    if (result.ok) {
      sfx.play('splice');
      draft = { frame: draft.frame, slots: {} };
      ctx.save();
      showSpliceResult(ctx, result, () => renderTheaterScreen(root, ctx));
    } else {
      renderTheaterScreen(root, ctx);
    }
  });
}

function showSpliceResult(ctx, result, onClose) {
  const { content } = ctx;
  const overlay = document.querySelector('#overlay');
  const genome = { frame: result.chimera.frame, parts: {} };
  for (const [slot, token] of Object.entries(result.chimera.tokens)) genome.parts[slot] = token.partId;
  const combos = result.newCombos.length
    ? `<p class="combo-toast">✦ Combo discovered: <strong>${result.newCombos.map((c) => c.name).join(', ')}</strong> — logged in the Splice-Dex.</p>`
    : '';
  overlay.hidden = false;
  overlay.innerHTML = `
    <div class="ceremony card">
      <h3>⚡ IT'S ALIVE(-ADJACENT)!</h3>
      <div class="grad-portrait">${renderCreatureSVG(genome, content, { idPrefix: 'born' })}</div>
      <p><strong>${result.chimera.name}</strong> · instability ${result.report.instability}/100</p>
      <p class="fine-print">Settling for ~${Math.round(result.report.settlingMs / 60000)} minutes. Deploying early causes Rejection. Patience is a stat.</p>
      ${combos}
      <button type="button" id="born-done" class="big-btn">To the Pens</button>
    </div>`;
  overlay.querySelector('#born-done').addEventListener('click', () => {
    overlay.hidden = true;
    overlay.innerHTML = '';
    onClose();
    document.querySelector('#tabs button[data-screen="pens"]')?.click();
  });
}
