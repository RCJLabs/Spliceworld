// R128 — where a facility track is bought: the screen its own `screen` field
// names. That field had been in facility.json since it was written and
// nothing read it, so all six sat in one shut card on the Ranch and the
// Surgery Theater's upgrade was unfindable. The argument and the numbers are
// in tools/smoke.js's R128 block.
import { tracks, facilityLevel, levelData, nextUpgrade, buyUpgrade } from '../splice/facility.js';
import { nodeName } from '../campaign/map.js';
import { collapsibleCard, isOpen } from './cards.js';
import { renderIcon } from './icons.js';

// R128b — THE SCREEN'S OWN NAME, NOT ITS ID. The roll-up printed `theater`
// and `battle` at the player, and neither is a word this game shows anybody:
// those two tabs read Splice and War. An internal id in player-facing prose
// is a wrong direction, not a terse one — it sends someone looking for a tab
// that is not there.
//
// Read off the tab bar when there is a DOM, so the sentence cannot drift
// from the button it points at. The table is the headless fallback (the
// screens render to a string in the suite), and a gate asserts it still
// matches index.html — typed once, never allowed to rot.
export const TAB_NAMES = {
  ranch: 'Ranch', pens: 'Pens', vault: 'Vault', theater: 'Splice', battle: 'War', dex: 'Dex',
};
export function screenName(id) {
  const tab = globalThis.document?.querySelector?.(`nav.tabs button[data-screen="${id}"]`);
  return tab?.textContent?.trim() || TAB_NAMES[id] || id;
}

// The tracks that belong to one screen, in data order.
export function tracksFor(content, screen) {
  return tracks(content).filter((t) => t.screen === screen);
}

// R128 — what the money buys, from the grants rather than from prose. The
// buy row said `$3200` and nothing else. Derived, so a track that gains a
// grant next milestone says so without anyone writing a sentence (R61).
function grantDelta(current, next) {
  const from = current?.grants ?? {};
  const to = next?.grants ?? {};
  const rows = Object.keys(to)
    .filter((k) => (from[k] ?? 0) !== to[k])
    // The key IS the label: a second name for the same thing is a second
    // thing to keep in step.
    .map((k) => `${k.replace(/([A-Z])/g, ' $1').toLowerCase()} ${from[k] ?? 0} → ${to[k]}`);
  return rows;
}

// One track's row — the card exactly as the Ranch drew it since R25.
function trackRow(state, content, track) {
  const level = facilityLevel(state, track.id);
  const current = levelData(content, track.id, level);
  const up = nextUpgrade(state, content, track.id);
  const blockedNode = up?.blockers.find((b) => b.kind === 'node');
  const short = up?.blockers.find((b) => b.kind === 'funds');
  const delta = up ? grantDelta(current, up.level) : [];
  return `
      <div class="facility-row">
        <div class="facility-head">
          <strong>${renderIcon(track.icon)} ${current?.name ?? track.name}</strong>
          <span class="lineage">level ${level}${up ? '' : ' · maxed'}</span>
        </div>
        ${up ? '' : `<p class="fine-print">${current?.blurb ?? ''}</p>`}
        ${up ? `
          <div class="facility-next">
            <div>
              <strong>${up.level.name}</strong>
              <p class="fine-print">${up.level.blurb}</p>
              ${delta.length ? `<p class="fine-print facility-delta">${delta.join(' · ')}</p>` : ''}
              ${blockedNode ? `<p class="fine-print locked-note">Needs ${nodeName(content, blockedNode.nodeId)} held.</p>` : ''}
              ${short ? `<p class="fine-print locked-note">Short by $${short.short}.</p>` : ''}
            </div>
            <button type="button" data-act="upgrade" data-track="${track.id}" ${up.affordable ? '' : 'disabled'}>
              $${up.level.cost}
            </button>
          </div>` : ''}
      </div>`;
}

// The card for one screen, or '' when no track belongs to it — a screen with
// nothing to sell must render nothing rather than an empty fold.
export function facilityCard(state, content, screen) {
  const mine = tracksFor(content, screen);
  if (!mine.length) return '';
  const upgrades = mine.map((t) => nextUpgrade(state, content, t.id)).filter(Boolean);
  const affordable = upgrades.filter((u) => u.affordable);
  const cheapest = upgrades.length ? Math.min(...upgrades.map((u) => u.level.cost)) : 0;
  // R128b — THE TITLE NAMES THE MACHINE. It named the LEVEL first — a
  // player on the Splice screen read "TIER I — CARD TABLE & OPTIMISM" and
  // had no reason to think that row was the Surgery Theater's upgrade. The
  // level is what you own; the machine is what you were looking for, so the
  // machine is the heading and the level rides in the summary under it.
  const solo = mine.length === 1 ? mine[0] : null;
  const name = solo ? solo.name : 'Facility';
  const level = solo ? levelData(content, solo.id, facilityLevel(state, solo.id))?.name : null;
  const summary = upgrades.length
    ? `${level ? `${level}. ` : ''}${affordable.length ? `<strong>${affordable.length} ready to buy</strong> · ` : ''}${
        upgrades.length} upgrade${upgrades.length === 1 ? '' : 's'} left, from $${cheapest}.`
    : `${level ? `${level}. ` : ''}Maxed. There is nothing left to buy and that is its own kind of sad.`;
  return collapsibleCard({
    id: `facility-${screen}`,
    title: `${renderIcon(mine.length === 1 ? mine[0].icon : 'derelict-house')} ${name}`,
    badge: affordable.length ? `${affordable.length} ready` : `${upgrades.length || '—'}`,
    summary,
    body: mine.map((t) => trackRow(state, content, t)).join(''),
    // SHUT by default, on every screen. A single-track screen opening its
    // own card was the first draft, and R98's gate refused it: the Pens
    // asserts that nothing on that screen opens by default, because the
    // whole point of that milestone was a stable costing a row per creature
    // rather than a screen each, and a panel that opens itself spends the
    // budget R98 just won back. Shut is not hidden — `collapsibleCard` draws
    // the summary while shut, so the header still reads "1 ready to buy · 1
    // upgrade left, from $900" without costing the height.
    open: isOpen(state, `facility-${screen}`, false),
  });
}

// R128 — the Ranch's roll-up: how many upgrades wait elsewhere and where,
// so a player who learned to buy them here does not find them simply gone.
export function facilityElsewhere(state, content, screen) {
  const away = tracks(content).filter((t) => t.screen !== screen);
  const open = away.map((t) => ({ t, up: nextUpgrade(state, content, t.id) })).filter((x) => x.up);
  if (!open.length) return '';
  const where = [...new Set(open.map((x) => x.t.screen))];
  return `<p class="fine-print facility-elsewhere">${renderIcon('derelict-house')} ${
    open.length} more upgrade${open.length === 1 ? '' : 's'} on ${
    where.map((s) => `<button type="button" class="facility-goto" data-goto="${s}">${screenName(s)}</button>`).join(', ')
  } — each machine is bought on its own screen.</p>`;
}

// R128 — one door for the button too. Five screens draw an upgrade now, and
// five copies of a purchase is five places for it to drift (R50).
export function bindFacility(root, ctx, again, onResult) {
  for (const btn of root.querySelectorAll('button[data-act="upgrade"]')) {
    btn.addEventListener('click', () => {
      const result = buyUpgrade(ctx.state, ctx.content, btn.dataset.track);
      if (result.ok && result.news) ctx.pushNews?.(result.news);
      if (result.ok) ctx.save?.();
      onResult?.(result);
      again?.();
    });
  }
  // `data-goto` is NOT bound here. The roll-up only renders on the Ranch,
  // and the Ranch already binds every `button[data-goto]` on the screen —
  // a second listener on the same button is two navigations per click.
}
