// The founding choice (R119) — the first thing a new player sees, and until
// R119 the first thing they saw was somebody else's animals. The finding,
// the crate rule and the measured balance are all in data/starters.json's
// _doc; this file is the screen.
//
// It renders into the shared overlay (R73's dialog: focus trap, restore,
// aria-label) with one difference — `data-locked`, because there is no game
// behind this screen to go back to.
import { renderIcon } from '../ui/icons.js';
import { foundLab } from './ranch.js';
import { speciesOf } from '../data/catalog.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// What a lab is, in the player's words rather than the schema's. Read off
// the same content the seeder reads, so a lab card cannot advertise a herd
// the founding does not deliver (R61).
export function labSummary(lab, content) {
  const nameOf = (id) => speciesOf(content, id)?.name ?? id;
  const crate = (lab.crate ?? []).map((id) => content.parts?.[id]).filter(Boolean);
  const crateSpecies = [...new Set(crate.map((p) => nameOf(p.species)))];
  return {
    donor: nameOf(lab.donor),
    pair: nameOf(lab.pair),
    crateSpecies,
    crateParts: crate.map((p) => p.name ?? p.id),
  };
}

export function renderFounding(overlay, ctx, onDone) {
  const { state, content, now } = ctx;
  const labs = content.starterLabs ?? [];
  const cards = labs.map((lab) => {
    const s = labSummary(lab, content);
    return `<li class="lab-card">
      <button type="button" class="lab-pick" data-lab="${esc(lab.id)}">
        <span class="lab-name">${esc(lab.name)}</span>
        <span class="lab-blurb">${esc(lab.blurb)}</span>
        <span class="lab-kit">
          <span class="lab-row">${renderIcon('graduation-cap', { size: 13 })} <b>${esc(s.donor)}</b>, fully grown — graduate it today for six parts</span>
          <span class="lab-row">${renderIcon('heart', { size: 13 })} a breeding pair of <b>${esc(s.pair)}</b>, newborn</span>
          <span class="lab-row">${renderIcon('package', { size: 13 })} a crate: ${s.crateParts.map((n) => `<b>${esc(n)}</b>`).join(' and ')}</span>
        </span>
        <span class="lab-pitch">${esc(lab.pitch)}</span>
      </button>
    </li>`;
  }).join('');

  overlay.dataset.locked = 'true';
  overlay.innerHTML = `
    <div class="panel founding">
      <h2>Choose your laboratory</h2>
      <p class="founding-lede">Every one of these was abandoned in a hurry. Pick the one whose
        leftovers you like: a grown donor for the slab, a pair to raise, and a crate of
        parts from something else entirely — because a creature made of one animal is
        just that animal.</p>
      <ul class="lab-list">${cards}</ul>
      <p class="founding-foot">You can order any species from the catalog later. This only decides what you start with.</p>
    </div>`;
  overlay.hidden = false;

  overlay.querySelectorAll('[data-lab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const res = foundLab(state, content, btn.dataset.lab, now());
      if (!res.ok) return;
      delete overlay.dataset.locked;
      overlay.hidden = true;
      overlay.innerHTML = '';
      onDone(res);
    });
  });
}
