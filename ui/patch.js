// R104 — PAINT WHAT CHANGED, in the half of the app that needs it.
//
// Split out of `ui/cards.js` for R167's reason: cards.js is compiled before
// the first paint because the eager Ranch imports it, and the screen that
// patches rather than replaces is lazy. `unbound` stays behind in cards.js
// because the eager binders call it too; this is the part only a patching
// screen reads.
//
// R104 — PAINT WHAT CHANGED. Every screen renders by building one string and
// assigning it to `innerHTML`, which is why opening one pen used to destroy
// all five cards on the screen: not their markup, their NODES. A rebuilt card
// loses the player's text selection, its scroll position, and the focus ring
// on whatever they were about to press.
//
// This replaces the assignment, not the rendering: a screen still builds the
// same string. Top-level children are matched by key — a fold id where there
// is one, otherwise position and tag — and any child whose markup is byte
// for byte what it already was is LEFT ALONE. A screen where nothing changed
// therefore touches nothing at all, which is the other half of the rule the
// a11y gate measures on the tick.
const keyOf = (el) => el.querySelector?.('[data-fold]')?.dataset.fold
  ?? el.getAttribute?.('data-key')
  ?? null;

export function paintScreen(root, html) {
  // R104 — the gates run this in a DOM stub that has no `createElement`, and
  // a screen that throws while painting is a screen the gate reports as
  // missing rather than as broken. Where there is no document to diff
  // against, assign: the stub is measuring the MARKUP, which is identical
  // either way, and node identity is a question only a browser can ask.
  if (typeof document?.createElement !== 'function') {
    root.innerHTML = html;
    return;
  }
  const next = document.createElement('div');
  next.innerHTML = html;
  const incoming = [...next.children];
  const mine = new Map();
  for (const el of [...root.children]) {
    const k = keyOf(el);
    if (k) mine.set(k, el);
  }
  const keep = [];
  for (const [i, el] of incoming.entries()) {
    const k = keyOf(el);
    const existing = k ? mine.get(k) : root.children[i];
    // Byte-identical markup means the player is looking at this exact card
    // already; anything else is a real change and gets the new node.
    if (existing && keyOf(existing) === k && existing.outerHTML === el.outerHTML) {
      keep.push(existing);
      if (k) mine.delete(k);
      continue;
    }
    keep.push(el);
  }
  // Reorder in place: an element already in the right slot is not touched.
  for (const [i, el] of keep.entries()) {
    if (root.children[i] !== el) root.insertBefore(el, root.children[i] ?? null);
  }
  while (root.children.length > keep.length) root.lastElementChild.remove();
}
