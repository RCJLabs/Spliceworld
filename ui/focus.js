// R80 — KEEPING FOCUS ACROSS A RE-RENDER.
//
// Every render function in this game ends by replacing its root's
// `innerHTML` wholesale. That is a deliberate and good simplification — the
// screen is a pure function of state — but it detaches whatever the player
// had focused, and the browser's answer to a detached activeElement is
// `<body>`. Measured on a real keyboard walk before this module existed:
// focus a Dismiss button inside the Ranch, let `main.js`'s 30-second tick
// fire, and focus is `BODY`. A keyboard user is returned to the top of the
// document TWICE A MINUTE, and the same thing happens on every subtab
// activation, every retraining toggle and every strike-team pick.
//
// WHY AN OBSERVER RATHER THAN WRAPPING THE RENDERS. There are a dozen
// re-render call sites across five modules and no single funnel: `tick()`
// repaints the active screen, `bindSubtabs` repaints on activation, and the
// Pens and the briefing repaint themselves from inside their own handlers.
// Wrapping each is a list somebody has to maintain, and the next render
// added would silently not be on it. The DOM mutation IS the event — the
// same reasoning R73's overlay controller records — so one observer per
// screen container catches every repaint, including the ones nobody thought
// about when they wrote them.
//
// WHAT IDENTITY MEANS HERE. R76 established that a control is identified by
// its `data-*` payload rather than its position: the same button in a fresh
// render carries the same dataset, and position is exactly what a repaint
// changes. So the key is tag + id + dataset, and the restore is a lookup
// rather than an index.

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';

// The stable identity of a control across a repaint. Null for anything that
// is not a real control, so a stray focus on a container is never restored
// on top of the player's next move.
export function focusKey(el) {
  if (!(el instanceof HTMLElement) || !el.matches(FOCUSABLE)) return null;
  const data = Object.entries(el.dataset ?? {}).sort(([a], [b]) => (a < b ? -1 : 1));
  return JSON.stringify([el.tagName, el.id || '', data]);
}

function findByKey(root, key) {
  for (const el of root.querySelectorAll(FOCUSABLE)) {
    if (focusKey(el) === key) return el;
  }
  return null;
}

// `containers` are the elements whose innards get replaced. Each is made
// programmatically focusable so there is somewhere to land when the control
// the player was on genuinely no longer exists — dismissing a guide removes
// the button that dismissed it, and the honest answer to "where now" is
// "the screen you are on", not "the top of the document".
export function installFocusKeeper(containers) {
  let last = null; // { key, container }

  document.addEventListener('focusin', (e) => {
    const container = containers.find((c) => c.contains(e.target));
    if (!container) { last = null; return; }
    const key = focusKey(e.target);
    if (key) last = { key, container };
  });

  for (const container of containers) {
    if (!container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1');
    new MutationObserver(() => {
      // Only step in when the repaint actually destroyed focus. If the
      // player has since clicked elsewhere, or focus is already inside, this
      // must not yank it back — stealing focus is the other half of the same
      // bug and is worse, because it happens while they are typing.
      if (document.activeElement !== document.body) return;
      if (!last || last.container !== container || container.hidden) return;
      const match = findByKey(container, last.key);
      (match ?? container).focus();
    }).observe(container, { childList: true, subtree: true });
  }
}
