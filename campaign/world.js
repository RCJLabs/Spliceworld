// R64 — the world advances in one place, from one clock.
//
// Before this module the shell read the clock seven times in one tick and
// two systems kept their own elapsed timestamp: the ranch charged upkeep
// from `state.lastTickAt` and clamped funds at zero, then the campaign paid
// income from `campaign.lastTickAt`. Interleaved every thirty seconds the
// two agree; over a month away they do not. Upkeep for the month hit first
// and was clamped — forgiven — and the month's income landed on top, so a
// save that closed the app came back richer than the same save played
// daily. Measured at exactly the forgiven amount ($760 on a $200 save).
//
// So: one `now`, one `since`, income before upkeep, one clamp. Every timer
// still reads its own timestamps; this only decides the order and owns the
// clock. DOM-free, and the harness walks the campaign through it too, so a
// tick in the browser and a tick in the walk are the same tick.

import { applyElapsed } from '../ranch/ranch.js';
import { tickVat } from '../splice/chaos.js';
import { tickResequencer } from '../splice/resequencer.js';
import { ensureTemperaments } from '../splice/temperament.js';
import { tickScars } from '../splice/scars.js';
import { tickCampaign } from './campaign.js';
import { tickBreakouts } from './breakout.js';
import { tickFeral } from '../splice/feral.js';
import { impound } from './rehab.js';
import { pushNews, emitNews } from './wire.js';

export function elapsedSince(state, now) {
  const since = state.lastTickAt ?? now;
  return { since, dt: Math.max(0, now - since) };
}

export function tickWorld(state, content, now) {
  const { since } = elapsedSince(state, now);
  // Income first, so the one clamp in applyElapsed sees the whole ledger.
  tickCampaign(state, content, now, since);
  applyElapsed(state, content, now, since);
  for (const line of tickVat(state, content, now).news) pushNews(state, line);
  for (const line of tickResequencer(state, content, now).news) pushNews(state, line);
  ensureTemperaments(state, content, now);
  for (const line of tickScars(state, content, now).news) pushNews(state, line);
  // R82 — the breakout, last, because an escape is a consequence of the
  // campaign tick above (a rival's defeat count is what lets one out) and a
  // fight the player can go and have rather than a timer they have to beat.
  // Every escape says so on the wire, including the ones that happened while
  // the app was closed: the board they come back to has to be explained.
  for (const e of tickBreakouts(state, content, now, since).escaped) {
    emitNews(state, content, 'specimen_loose', { lab: e.lab, sighting: e.sighting });
  }
  // R85 — the top of the instability scale, after the scars and before the
  // clock is stamped, because whether a creature is agitated depends on
  // everything above it having already happened this tick.
  const feral = tickFeral(state, content, now);
  for (const line of feral.news) pushNews(state, line);
  for (const chimera of feral.gone) impound(state, chimera, content, now);
  state.lastTickAt = now;
}
