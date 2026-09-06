// Two shared card behaviours: the first-use field note (R29) and the
// fold-away card (R25/R26 made several screens very long — six facility
// tracks and five region strips in one column).
//
// Collapse state lives in the save (`ui.collapsed`) rather than in a module
// variable, so folding a card shut survives the reload that the Definition
// of Done requires every feature to survive. It is keyed by a caller-chosen
// id, so a card can decide its own sensible default and still remember an
// override.

import { dismissGuide } from '../ranch/onboarding.js';
import { renderIcon } from './icons.js';

// R123 — HTML-escaping, in the shared UI module rather than a fourth private
// copy. `battle/ui.js` and `ranch/founding-ui.js` each keep one of their own
// and should fold into this; that is a separate change and is written down
// here rather than smuggled into a milestone about picking a strike team.
//
// It matters wherever a PLAYER-TYPED string reaches markup, which creature
// names do — the Pens hand out a rename sheet.
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// One note, or nothing. Deliberately singular: a wall of tips is wallpaper.
export function fieldNote(guide) {
  if (!guide) return '';
  return `
    <section class="card field-note" data-guide="${guide.id}">
      <div class="field-note-head">
        <strong>${renderIcon(guide.icon)} ${guide.title}</strong>
        <button type="button" class="field-note-dismiss" data-dismiss-guide="${guide.id}" aria-label="Dismiss">&#10005;</button>
      </div>
      <p>${guide.body}</p>
    </section>`;
}

// The Dex renders to a plain `{ innerHTML }` in the test harness so its
// output can be asserted as a string rather than scraped out of a DOM —
// binding is a no-op there rather than a crash.
export function bindFieldNote(root, ctx, rerender) {
  if (!root?.querySelectorAll) return;
  root.querySelectorAll('button[data-dismiss-guide]').forEach((btn) => {
    btn.addEventListener('click', () => {
      dismissGuide(ctx.state, btn.dataset.dismissGuide);
      ctx.save();
      rerender();
    });
  });
}

// --- Fold-away cards ----------------------------------------------------

// `defaultOpen` is the card's own judgement; a stored value always wins.
export function isOpen(state, id, defaultOpen = true) {
  const stored = state.ui?.collapsed?.[id];
  if (stored === undefined) return defaultOpen;
  return !stored;
}

// R89 — `group` makes a set of cards EXCLUSIVE: opening one shuts the rest.
// It exists because a stable of nine cards that can all be open at once is
// 16,657px of screen, and no per-card diet fixes that — the height is the
// product of the card and the roster, so the only ceiling that holds as the
// roster grows is "one at a time". A screen without a group keeps the old
// behaviour exactly.
export function collapsibleCard({ id, title, badge = '', summary = '', body, open, extraClass = '', group = '' }) {
  return `
    <section class="card foldable ${open ? 'is-open' : 'is-shut'} ${extraClass}">
      <button type="button" class="fold-head" data-fold="${id}"${group ? ` data-fold-group="${group}"` : ''} aria-expanded="${open}">
        <span class="fold-caret" aria-hidden="true">${open ? '▾' : '▸'}</span>
        <span class="fold-title">${title}</span>
        ${badge ? `<span class="fold-badge">${badge}</span>` : ''}
      </button>
      ${!open && summary ? `<p class="fold-summary">${summary}</p>` : ''}
      <div class="fold-body" ${open ? '' : 'hidden'}>${body}</div>
    </section>`;
}

export function bindFolds(root, ctx, rerender) {
  if (!root?.querySelectorAll) return;
  root.querySelectorAll('button[data-fold]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.fold;
      const state = ctx.state;
      state.ui ??= { collapsed: {} };
      state.ui.collapsed ??= {};
      // Stored as "is it collapsed", so an absent key means "use the
      // card's own default" rather than "open".
      const wasOpen = btn.getAttribute('aria-expanded') === 'true';
      state.ui.collapsed[id] = wasOpen;
      // Opening one member of a group shuts the others. Closing one shuts
      // nothing else — a group is "at most one open", not "exactly one".
      const group = btn.dataset.foldGroup;
      if (group && wasOpen === false) {
        for (const other of root.querySelectorAll(`button[data-fold-group="${group}"]`)) {
          if (other !== btn) state.ui.collapsed[other.dataset.fold] = true;
        }
      }
      ctx.save();
      rerender();
    });
  });
}
