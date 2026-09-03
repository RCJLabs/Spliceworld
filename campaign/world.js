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
import { pushNews } from './wire.js';

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
  state.lastTickAt = now;
}
