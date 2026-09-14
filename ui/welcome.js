// R107 — the welcome-back card. LAZY, and that is the point.
//
// This is shown on the first load after a gap of six hours or more, which on
// any normal week is a small minority of loads. Compiling it before every
// first paint would be paying for it on all of them; `main.js` imports it
// only once it already has lines to show. R74's split, same reasoning.
//
// The digest itself is DOM-free (campaign/digest.js) so the gate can assert
// it against the tick's change report rather than against a screen. This
// module is the other half: it knows nothing about what a line MEANS.
import { esc } from './cards.js';

export function renderWelcome(root, digest, onDismiss) {
  if (!root) return;
  if (!digest) {
    root.hidden = true;
    if (root.childElementCount) root.replaceChildren();
    return;
  }
  root.hidden = false;
  root.innerHTML = `<h2 id="welcome-h">While you were away — ${esc(digest.for)}</h2>`
    + `<ul class="welcome-lines">${digest.lines.map((l) => `<li>${esc(l.text)}</li>`).join('')}</ul>`
    + '<button type="button" id="welcome-dismiss">Right, back to work</button>';
  // Bound by id rather than a `data-*` attribute: R89 reserves `data-*` for
  // controls a screen's own walker presses, and this card is not on a screen
  // — the same reason `#settings` in the footer is bound this way.
  root.querySelector('#welcome-dismiss')?.addEventListener('click', onDismiss);
}
