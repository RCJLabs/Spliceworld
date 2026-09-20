// R117 — THE SECOND COLUMN, and the only thing in the game that exists only
// on a wide screen.
//
// WHAT IT IS FOR. Two of the three things the criterion names were not "hard
// to find on a laptop", they were NOT ON THE SCREEN AT ALL. `.agenda-head` is
// drawn by `ranch/ui.js` and nowhere else, so "Right Now" existed on one
// screen of six; `#ticker` lives in `<footer>`, after a `<main>` that is
// 1,700-2,700px tall on every screen, so the county's voice was below the
// fold at every width including a phone's. A column that is only ever dark
// gutter is where both of them belong.
//
// LAZY ON PURPOSE, and not for speed. `MODULE_CAP` in tools/smoke.js is at 50
// eager modules of 50 with no headroom, and a rail that a phone can never see
// has no business in the boot graph at all: `main.js` imports this the first
// time the media query matches and never on a narrow screen. That also means
// every import here is free of the eager budget, which is why it can reach
// for `util/text.js` directly.
//
// NO PLAYER-FACING PROSE. Every sentence on this panel comes from somewhere
// that already owns it — the agenda's own labels and hints (`ranch/agenda.js`,
// read from the save), the wire's lines (`state.news`), and `data/copy.json`
// for the two empty states. The scopecheck copy rule is what keeps that true.
import { agendaShape, AGENDA_KINDS } from '../ranch/agenda.js';
import { renderIcon } from './icons.js';
import { copy } from '../util/text.js';

// Per bucket, the same cut R143 made on the Ranch card and for the same
// reason: the badge counts everything, so the rows past this are a LENGTH
// decision and not a disclosure one. Three fits the rail without the agenda
// needing to scroll on a typical day; more than that and it does, which is
// what `.rail-agenda { overflow-y: auto }` is for.
const ROWS = 3;

// Newest last in the save, so this many off the end and then reversed.
const WIRE_LINES = 6;

function agendaHtml(state, content, now) {
  const shape = agendaShape(state, content, now);
  const groups = AGENDA_KINDS.map(({ kind, icon, heading }) => {
    const items = shape.open.filter((i) => i.kind === kind);
    if (!items.length) return '';
    const rest = items.length - ROWS;
    // `data-goto` always, and `data-open-fold` as well when the destination
    // is a card on the screen it sends you to. The Ranch's own copy of this
    // chooses BETWEEN them, because a row drawn on the Ranch that says
    // `data-goto="ranch"` repaints and nothing else (R137). From out here
    // the fold and the trip are both needed, so the button carries both and
    // the handler below does them in that order.
    return `<p class="agenda-head">${renderIcon(icon)} ${heading}</p>`
      + items.slice(0, ROWS).map((i) => `
        <button type="button" class="agenda-row" data-goto="${i.screen}"${
          i.subtab ? ` data-subtab="${i.subtab}"` : ''}${
          i.opens ? ` data-open-fold="${i.opens}"` : ''}>
          <span class="agenda-label">${i.label}</span>
          <span class="fine-print">${i.hint}</span>
        </button>`).join('')
      + (rest > 0 ? `<p class="fine-print">${copy(content, 'rail.more', { n: rest })}</p>` : '');
  }).join('');
  return `
    <section class="card rail-agenda">
      <p class="rail-title">${renderIcon('paw')} Right Now
        <span class="pill">${shape.count}</span></p>
      ${groups || `<p class="fine-print">${copy(content, 'rail.idle')}</p>`}
    </section>`;
}

function wireHtml(lines) {
  const said = (lines ?? []).slice(-WIRE_LINES).reverse();
  return `
    <section class="card rail-wire">
      <p class="rail-title">${renderIcon('satellite', { size: 14 })} The Wire</p>
      ${said.map((line) => `<p class="wire-line">${line}</p>`).join('')}
    </section>`;
}

// Draw the rail. Called on every repaint the shell makes, so it rebuilds
// wholesale and rebinds: the nodes it bound last time went out with the
// innerHTML, which is how every other panel in this game works.
export function renderRail(host, ctx, lines) {
  const { state, content } = ctx;
  host.innerHTML = agendaHtml(state, content, ctx.now()) + wireHtml(lines);
  host.querySelectorAll('button[data-goto]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const fold = btn.dataset.openFold;
      if (fold) {
        state.ui ??= { collapsed: {} };
        state.ui.collapsed ??= {};
        // The animals are an at-most-one-open group (R98), and nothing has
        // clicked a fold head, so shut the siblings by hand the way
        // `bindFolds` would. Without this the rail can leave two open.
        if (fold.startsWith('ranch-')) {
          for (const animal of state.ranch.stock) state.ui.collapsed[`ranch-${animal.id}`] = true;
        }
        state.ui.collapsed[fold] = false;
        ctx.save();
      }
      ctx.goto?.(btn.dataset.goto, btn.dataset.subtab);
    });
  });
}
