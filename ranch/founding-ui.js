// The founding choice (R119). The first thing a new player sees, and until
// R119 the first thing they saw was somebody else's animals.
//
// MEASURED, and this is the whole reason the screen exists: the starter herd
// was `['goat', 'goat', 'bear']` with the goats newborn, so the only animal
// that could be graduated on day one was the bear — and a graduation yields
// six parts from ONE species. The distinct species available to splice from
// was exactly one, which means the Surgery Theater, the system this game is
// named for, opened with exactly one creature anybody could build. Every
// player's first "chimera" was the same purebred bear. M0's own done-when is
// "a bear-headed, eagle-winged goat renders and persists"; nothing on day one
// could produce one.
//
// So: five labs, and the lab you pick decides your donor, your breeding pair
// and a crate of parts from a third species — which is what turns the first
// splice from a formality into a decision. The choice changes WHICH creature,
// never HOW MUCH: three animals, one grown and two juvenile, all Standard,
// under every lab, so A1's wall and R106's arithmetic are untouched.
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
