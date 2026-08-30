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

// One note, or nothing. Deliberately singular: a wall of tips is wallpaper.
export function fieldNote(guide) {
  if (!guide) return '';
  return `
    <section class="card field-note" data-guide="${guide.id}">
      <div class="field-note-head">
        <strong>${guide.icon} ${guide.title}</strong>
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

export function collapsibleCard({ id, title, badge = '', summary = '', body, open, extraClass = '' }) {
  return `
    <section class="card foldable ${open ? 'is-open' : 'is-shut'} ${extraClass}">
      <button type="button" class="fold-head" data-fold="${id}" aria-expanded="${open}">
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
      state.ui.collapsed[id] = btn.getAttribute('aria-expanded') === 'true';
      ctx.save();
      rerender();
    });
  });
}
