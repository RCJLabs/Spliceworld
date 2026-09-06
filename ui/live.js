// R80 — SAYING IT OUT LOUD.
//
// Three things in this game changed on screen and told nobody: the settings
// panel's own result line ("Save exported.", "Short by $400."), the
// retraining sheet's slot counter, and the running commentary of a battle.
// A sighted player reads them; a screen reader user is told nothing, because
// text that appears in a repaint is text that was never announced.
//
// There is a rule about live regions that decides the shape of this module:
// the region has to EXIST BEFORE its content changes. Assistive tech watches
// a node; a node inserted already-full is just new markup. Every panel in
// this game renders by replacing `innerHTML`, so a live region written into
// a panel is destroyed and recreated on every render and announces nothing
// — which is exactly the bug, dressed as its own fix.
//
// So the region lives in index.html, outside every render root, and this is
// the one way to speak into it. Two systems keep their own regions instead,
// and both are right to: the news wire (`#ticker`, R73) and the arena's
// message line, which is a stable node that a round's beats write into in
// place — announcing those through here would say everything twice.
export function announce(text) {
  const el = globalThis.document?.getElementById?.('announcer');
  if (!el || !text) return;
  // Cleared first, and re-filled a beat later. The same sentence twice in a
  // row is not a DOM change, and a region that has not changed is not read —
  // so "Short by $400." on the second attempt would be silence.
  el.textContent = '';
  const say = () => { el.textContent = String(text); };
  if (typeof globalThis.requestAnimationFrame === 'function') globalThis.requestAnimationFrame(say);
  else say();
}
