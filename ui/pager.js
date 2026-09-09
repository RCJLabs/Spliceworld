// R131 — THE CEILING THE FOLD NEVER GAVE THESE SCREENS.
//
// Folding a row divides a constant; it does not stop a multiplication. The
// Ranch measured 3,269px at four animals and 11,607 at twenty before R98
// folded the row, and 3,499 at twenty after it — better by a factor of three
// and growing at exactly the same rate. The Vault is the same shape twice
// over: 41 species bays, and the shark bay on a day-180 save holding 101 of
// the 337 parts and 116 of the 120 vials behind one summary line.
//
// A page is the ceiling. It lives here rather than on either screen because
// two implementations of "show me the next ten" is how two screens end up
// with different opinions about what a page is — R128 spent a milestone
// merging the Ranch's fold back into the Pens'. `ui/roster.js` owns how a
// list is GROUPED; this owns how much of it you are handed at once.
//
// The page count is remembered per list id: a Ranch that bounced back to
// page one every time you fed an animal would be worse than the long screen.

const DEFAULT_SIZE = 8;

export function pagesShown(state, id) {
  const n = state?.ui?.pages?.[id];
  return typeof n === 'number' && n >= 1 ? n : 1;
}

// `size` rides in the result so `pagerRow` cannot disagree with the slice
// about how big a page is.
export function paginate(items, state, id, size = DEFAULT_SIZE) {
  const total = items.length;
  const shown = Math.min(total, size * pagesShown(state, id));
  return { id, size, total, shown, hidden: total - shown, rows: items.slice(0, shown) };
}

// R80's rule — a control says exactly what happens: the button names what it
// will add and how far in you already are.
export function pagerRow(page, noun = 'more') {
  if (!page.hidden) return '';
  const next = Math.min(page.size, page.hidden);
  return `<div class="pen-actions">
    <button type="button" class="pager-more" data-page="${page.id}">Show ${next} ${
      noun} · ${page.shown} of ${page.total}</button>
  </div>`;
}

// One binding for both screens, so R76's gate has one thing to fire.
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

// A Ranch whose herd shrank to four must not still be on page three, or the
// button says "8 of 4".
export function trimPages(state, id, total, size = DEFAULT_SIZE) {
  const pages = state?.ui?.pages;
  if (!pages || !(id in pages)) return;
  const need = Math.max(1, Math.ceil(total / size));
  if (pages[id] > need) pages[id] = need;
}
