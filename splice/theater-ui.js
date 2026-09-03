// Surgery Theater screen (M3): assemble vault tokens on a frame, watch the
// physiology panel explain the consequences live, then splice. Replaces the
// M0 free-form dev slab — every part here is an owned token with lineage.

import { renderCreatureSVG, slotOfSocket } from '../render/renderer.js';
import { renderIcon } from '../ui/icons.js';
import { GRADES, GRADE_INDEX } from './extract.js';
import { analyze } from './physiology.js';
import { spliceChimera, validateSplice, tokensFor } from './theater.js';
import * as sfx from '../audio/sfx.js';
import { pickerField, bindPickers } from '../ui/picker.js';
import { theaterGrants, facilityLevel, levelData, nextUpgrade } from './facility.js';
import { fieldNote, bindFieldNote } from '../ui/cards.js';
import { guideForScreen } from '../ranch/onboarding.js';

const SLOT_LABELS = {
  head: 'Head', forelimbs: 'Forelimbs', hindlimbs: 'Hindlimbs',
  tail: 'Tail', hide: 'Hide', organ: 'Organ', organ2: 'Organ II',
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

  // The Theater builds with whatever the facility has installed (§3.10).
  const grants = theaterGrants(state, content);
  // A draft made before a downgrade, or carrying a locked frame, quietly
  // corrects itself rather than erroring at the player.
  if (!grants.frames.includes(draft.frame)) draft.frame = grants.frames[0];
  // A9: which bays this build actually has is the facility AND the chassis.
  // Switching to the Kite drops the hindlimb the player had loaded rather
  // than leaving a part wedged in a socket the frame does not have.
  const sockets = theaterGrants(state, content, draft.frame).sockets;
  for (const socketId of Object.keys(draft.slots)) {
    if (!sockets.includes(socketId)) delete draft.slots[socketId];
  }

  const tokens = tokensFor(state, draft.slots, content);
  const report = analyze(draft.frame, tokens, content, sockets.length);

  const frameBtns = Object.values(content.frames)
    .map((f) => {
      const owned = grants.frames.includes(f.id);
      return `<button type="button" data-frame="${f.id}" class="${f.id === draft.frame ? 'active' : ''}${owned ? '' : ' locked'}" ${
        owned ? '' : 'disabled'
      } title="${owned ? f.flavor : 'Needs a bigger Surgery Theater.'}">${f.sizeClass} · ${f.name}${owned ? '' : ` ${renderIcon('lock')}`}</button>`;
    })
    .join('');

  const chosen = new Set(Object.values(draft.slots).filter(Boolean));
  const CLASS_MARK = { air: '\u{1FABD}', ground: '\u{1F9B6}', water: '\u{1F30A}' };

  // 236 parts across 40 animals: grouped, and never through an OS dropdown.
  const slotOptions = (socketId) => {
    const slot = slotOfSocket(socketId);
    const owned = state.inventory.parts.filter((t) => content.parts[t.partId]?.slot === slot);
    const bySpecies = new Map();
    for (const t of owned) {
      const sp = content.parts[t.partId].species;
      if (!bySpecies.has(sp)) bySpecies.set(sp, []);
      bySpecies.get(sp).push(t);
    }
    const groups = [...bySpecies.entries()]
      .sort((a, b) => (content.species[a[0]].name > content.species[b[0]].name ? 1 : -1))
      .map(([sp, tokens]) => ({
        label: content.species[sp].name,
        options: tokens
          .sort((a, b) => GRADE_INDEX[b.grade] - GRADE_INDEX[a.grade])
          .map((t) => {
            const part = content.parts[t.partId];
            const grade = GRADES[GRADE_INDEX[t.grade]];
            return {
              id: t.id,
              label: part.name,
              mark: part.classAffinity ? CLASS_MARK[part.classAffinity] : '',
              badge: `<span class="grade-badge grade-${t.grade}">${grade.name}</span>`,
              // R32 made mass the currency the chassis decision is priced in — a
              // rhino head is 32 and a moth head is 1 — so the number has to be on
              // the part, not only in the panel after you have already fitted it.
              sub: `${part.ability} \u00b7 ${part.phys.mass} mass${
                part.phys.lift ? ` \u00b7 ${Math.round(part.phys.lift * grade.mult)} lift` : ''
              } \u00b7 essence of ${t.donor.name} \u2605${t.donor.stars}`,
              disabled: chosen.has(t.id) && draft.slots[socketId] !== t.id,
            };
          }),
      }));
    return { owned, groups };
  };

  const slotFields = sockets.map((socketId) => {
    const { owned } = slotOptions(socketId);
    const tokenId = draft.slots[socketId];
    const token = tokenId ? state.inventory.parts.find((t) => t.id === tokenId) : null;
    const part = token ? content.parts[token.partId] : null;
    return pickerField({
      id: `slot-${socketId}`,
      label: `${SLOT_LABELS[socketId]}${socketId === 'head' ? ' *' : ''}`,
      count: owned.length || null,
      value: part
        ? `${part.name}${part.classAffinity ? ' ' + CLASS_MARK[part.classAffinity] : ''}`
        : owned.length ? 'Empty socket' : 'None in the vault',
      hint: part ? `${GRADES[GRADE_INDEX[token.grade]].name} \u00b7 ${token.donor.name}` : '',
      disabled: !owned.length,
    });
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
    ${fieldNote(guideForScreen(state, content, ctx.now?.() ?? Date.now(), 'theater'))}
    <section class="card stage-card">
      <h2>Surgery Theater</h2>
      <p class="class-banner class-${report.creatureClass ?? 'none'}">${
        report.creatureClass
          ? `${renderIcon(content.classes[report.creatureClass].icon)} ${content.classes[report.creatureClass].name} — beats ${content.classes[content.classes[report.creatureClass].beats].name}`
          : '◇ Unclassed — neutral in every matchup'
      }</p>
      <p class="recipe">${statLine}${report.tags.length ? ` · tags: ${report.tags.join(', ')}` : ''}</p>
      <div class="stage">${renderCreatureSVG(draftGenome(state, content), content, { idPrefix: 'thtr' })}</div>
      <p class="ranch-msg">${lastMsg}</p>
    </section>
    <section class="card">
      <p class="tier-line">${
        levelData(content, 'theater', facilityLevel(state, 'theater'))?.name ?? 'Surgery Theater'
      }${(() => {
        const up = nextUpgrade(state, content, 'theater');
        return up ? ` · next: ${up.level.name} — $${up.level.cost}, bought at the Ranch` : ' · fully equipped';
      })()}</p>
      <h3>Frame</h3>
      <div class="frame-picker" id="thtr-frames">${frameBtns}</div>
      <h3>Sockets (from the Vault)</h3>
      <div class="slot-grid">${slotFields}</div>
      <button id="thtr-splice" type="button" class="big-btn" ${errors.length ? 'disabled' : ''}>⚡ SPLICE IT</button>
      ${errors.length && tokens.length ? `<p class="fine-print">${errors.join(' ')}</p>` : ''}
    </section>
    <section class="card">
      <h3>Physiology Panel</h3>
      ${panelRows}
      ${comboRows}
    </section>`;
  bindFieldNote(root, ctx, () => renderTheaterScreen(root, ctx));

  root.querySelectorAll('#thtr-frames button').forEach((btn) => {
    btn.addEventListener('click', () => {
      draft.frame = btn.dataset.frame;
      renderTheaterScreen(root, ctx);
    });
  });
  bindPickers(root, Object.fromEntries(sockets.map((socketId) => [`slot-${socketId}`, () => {
    const { groups } = slotOptions(socketId);
    return {
      title: SLOT_LABELS[socketId],
      subtitle: socketId === 'head'
        ? 'A head is mandatory. Every abomination deserves googly eyes.'
        : socketId === 'organ2'
          ? 'The second bay. More metabolism, or a second ability — if the frame can carry the mass.'
          : 'Leave it empty if you like living dangerously.',
      selectedId: draft.slots[socketId] ?? '',
      groups: [{ label: null, options: [{ id: '', label: 'Empty socket', sub: 'Nothing installed' }] }, ...groups],
      onPick: (value) => {
        if (value) draft.slots[socketId] = value;
        else delete draft.slots[socketId];
        renderTheaterScreen(root, ctx);
      },
    };
  }])));
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
