// R131 — THE CEILING THE FOLD NEVER GAVE THESE SCREENS.
//
// Folding a row divides a constant; it does not stop a multiplication. The
// Ranch measured 3,269px at four animals, 7,438 at twelve and 11,607 at
// twenty before R98 folded the row, and 3,499 at twenty after it — better by
// a factor of three and still growing at exactly the same rate, because the
// screen is one row per animal and the pens expand without a ceiling. The
// Vault is the same shape twice over: 41 species bays, and the shark bay on
// a day-180 save holding 101 of the 337 parts behind one summary line.
//
// A page is the ceiling. It lives here rather than on either screen because
// two implementations of "show me the next ten" is how two screens end up
// with different opinions about what a page is — R44's fold and R98's fold
// were written twice for the same reason and R128 spent a milestone merging
// them back. `ui/roster.js` already owns how a list is GROUPED; this owns
// how much of it you are handed at once.
//
// How many pages the player has asked for is remembered per list id, in the
// same `state.ui` bag the folds use: a Ranch that bounced back to page one
// every time you fed an animal would be worse than the long screen, since
// every care action repaints.

const DEFAULT_SIZE = 8;

export function pagesShown(state, id) {
  const n = state?.ui?.pages?.[id];
  return typeof n === 'number' && n >= 1 ? n : 1;
}

// The slice, plus everything a caller needs to describe it. `size` rides in
// the result so `pagerRow` cannot disagree with the slice about how big a
// page is — the two used to be separate arguments and that is one edit away
// from a button that promises ten and reveals eight.
export function paginate(items, state, id, size = DEFAULT_SIZE) {
  const total = items.length;
  const shown = Math.min(total, size * pagesShown(state, id));
  return { id, size, total, shown, hidden: total - shown, rows: items.slice(0, shown) };
}

// R73's 40px floor and R80's "a control says exactly what happens" both
// apply: the button names the number it is about to add and the number it is
// adding it to, so a player can tell a long list from a nearly-finished one
// without counting rows.
export function pagerRow(page, noun = 'more') {
  if (!page.hidden) return '';
  const next = Math.min(page.size, page.hidden);
  return `<div class="pen-actions">
    <button type="button" class="pager-more" data-page="${page.id}">Show ${next} ${
      noun} · ${page.shown} of ${page.total}</button>
  </div>`;
}

// R76's rule: a `data-*` selector in source is a handler the gate will fire,
// so this stays one binding for both screens rather than one per screen.
export function bindPager(root, ctx, rerender) {
  if (!root?.querySelectorAll) return;
  root.querySelectorAll('button[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.page;
      const state = ctx.state;
      state.ui ??= {};
      state.ui.pages ??= {};
      state.ui.pages[id] = pagesShown(state, id) + 1;
      ctx.save?.();
      rerender();
    });
  });
}

// Handed to a screen that has just rebuilt its list from scratch — a Ranch
// whose herd shrank to four should not still be on page three, or the
// button says "8 of 4". Silent when the list is short enough that paging
// never happened.
export function trimPages(state, id, total, size = DEFAULT_SIZE) {
  const pages = state?.ui?.pages;
  if (!pages || !(id in pages)) return;
  const need = Math.max(1, Math.ceil(total / size));
  if (pages[id] > need) pages[id] = need;
}
