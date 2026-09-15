// R107 — the welcome-back card. LAZY, AND IT OWNS THE WHOLE DECISION.
//
// Shown on the first load after a gap of six hours or more, which on a normal
// week is a small minority of loads. Everything about it lives behind that
// import — the threshold, the digest, the phrasing of how long you were gone,
// the dismissal — so the shell carries one line and one condition rather than
// a feature it has to understand. R74's split, taken as far as it goes.
//
// The digest itself is DOM-free (campaign/digest.js) so the gate can assert it
// against the tick's change report rather than against a screen; this module
// is the other half, and knows nothing about what a line MEANS.
import { esc } from './cards.js';
import { awayDigest, awayFor } from '../campaign/digest.js';

export function showWelcome(root, tick, content, onDone) {
  if (!root) return false;
  const lines = awayDigest(tick.before, tick.after, tick.dt, content);
  if (!lines.length) return false;
  const paint = () => {
    root.hidden = false;
    root.innerHTML = `<h2 id="welcome-h">While you were away — ${esc(awayFor(tick.dt))}</h2>`
      + `<ul class="welcome-lines">${lines.map((l) => `<li>${esc(l.text)}</li>`).join('')}</ul>`
      + '<button type="button" id="welcome-dismiss">Right, back to work</button>';
    // Bound by id rather than a `data-*` attribute: R89 reserves `data-*` for
    // controls a screen's own walker presses, and this card is not on a screen
    // — the same reason `#settings` in the footer is bound this way.
    root.querySelector('#welcome-dismiss')?.addEventListener('click', () => {
      root.hidden = true;
      root.replaceChildren();
      onDone?.();
    });
  };
  paint();
  return true;
}
