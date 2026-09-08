// R128 — WHERE A FACILITY TRACK IS BOUGHT.
//
// Reported from play: "I don't see how to upgrade the surgery theater or
// where it is." It existed — one upgrade, two levels — in a card called
// Facility on the RANCH, shut by default, behind a derelict-house icon that
// names no system, alongside five other tracks. The screen that is named
// after the machine never mentioned it.
//
// The data had said where each one belongs since it was written: every track
// in facility.json carries a `screen`. Nothing read it, so nothing validated
// it either, and one of the six pointed at `extract` — which is not a
// screen. Extraction is an overlay you start from the Ranch, not a place.
//
// So the card moved out of `ranch/ui.js` and takes the screen it is being
// drawn on. Each screen shows the tracks whose data names it; the Ranch
// keeps a roll-up that LINKS to the others rather than repeating them,
// because two places to buy the same thing is the duplication R50 refuses.
import { tracks, facilityLevel, levelData, nextUpgrade } from '../splice/facility.js';
import { nodeName } from '../campaign/map.js';
import { collapsibleCard, isOpen } from './cards.js';
import { renderIcon } from './icons.js';

// The tracks that belong to one screen, in data order.
export function tracksFor(content, screen) {
  return tracks(content).filter((t) => t.screen === screen);
}

// R128 — WHAT THE MONEY BUYS, from the grants rather than from prose.
//
// The buy row said `$3200` and nothing else, so the only description of what
// changed was a blurb written for flavour. The grants are the mechanical
// truth and they are already data: show every number that moves. Derived, so
// a track that gains a grant next milestone says so without anyone
// remembering to write a sentence about it (R61).
function grantDelta(current, next) {
  const from = current?.grants ?? {};
  const to = next?.grants ?? {};
  const rows = Object.keys(to)
    .filter((k) => (from[k] ?? 0) !== to[k])
    .map((k) => {
      // `vaultParts` reads as "vault parts". The key is the label because
      // the key is what the engine calls it, and a second name for the same
      // thing is a second thing to keep in step.
      const label = k.replace(/([A-Z])/g, ' $1').toLowerCase();
      return `${label} ${from[k] ?? 0} → ${to[k]}`;
    });
  return rows;
}

// One track's row. `screen` decides membership; everything else is the card
// exactly as the Ranch drew it since R25.
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
  const name = mine.length === 1 ? (levelData(content, mine[0].id, facilityLevel(state, mine[0].id))?.name ?? mine[0].name) : 'Facility';
  const summary = upgrades.length
    ? `${affordable.length ? `<strong>${affordable.length} ready to buy</strong> · ` : ''}${upgrades.length} upgrade${
        upgrades.length === 1 ? '' : 's'} left, from $${cheapest}.`
    : 'Maxed. There is nothing left to buy and that is its own kind of sad.';
  return collapsibleCard({
    id: `facility-${screen}`,
    title: `${renderIcon(mine.length === 1 ? mine[0].icon : 'derelict-house')} ${name}`,
    badge: affordable.length ? `${affordable.length} ready` : `${upgrades.length || '—'}`,
    summary,
    body: mine.map((t) => trackRow(state, content, t)).join(''),
    // R128 — a screen with ONE track opens by default: it is that screen's
    // own machine and the whole complaint was that it was hidden. The
    // Ranch's two stay shut, because the Ranch has plenty else to show.
    open: isOpen(state, `facility-${screen}`, mine.length === 1),
  });
}

// R128 — the Ranch's roll-up. It does not repeat the rows; it says how many
// upgrades are waiting elsewhere and which screens they are on, because a
// player who has learned to buy upgrades on the Ranch must not simply find
// them gone.
export function facilityElsewhere(state, content, screen) {
  const away = tracks(content).filter((t) => t.screen !== screen);
  const open = away.map((t) => ({ t, up: nextUpgrade(state, content, t.id) })).filter((x) => x.up);
  if (!open.length) return '';
  const where = [...new Set(open.map((x) => x.t.screen))];
  return `<p class="fine-print facility-elsewhere">${renderIcon('derelict-house')} ${
    open.length} more upgrade${open.length === 1 ? '' : 's'} on ${
    where.map((s) => `<button type="button" class="linkish" data-goto="${s}">${s}</button>`).join(', ')
  } — each machine is bought on its own screen.</p>`;
}
