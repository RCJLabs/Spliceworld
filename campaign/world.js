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

import { applyElapsed, treatInjuries } from '../ranch/ranch.js';
import { tickVat } from '../splice/chaos.js';
import { tickResequencer } from '../splice/resequencer.js';
import { ensureTemperaments } from '../splice/temperament.js';
import { tickScars } from '../splice/scars.js';
import { tickCampaign } from './campaign.js';
import { tickBreakouts } from './breakout.js';
import { tickFeral } from '../splice/feral.js';
import { impound } from './rehab.js';
import { tickTaskforce } from './taskforce.js';
import { pushNews, emitNews } from './wire.js';
import { consolidateVault } from '../splice/vault.js';

export function elapsedSince(state, now) {
  const since = state.lastTickAt ?? now;
  return { since, dt: Math.max(0, now - since) };
}

// R107 — the pair this tick diffed, for the shell. See ROADMAP R107.
export const lastTick = { dt: 0, before: null, after: null };

export function tickWorld(state, content, now) {
  const before = worldSnapshot(state, now);
  lastTick.dt = Math.max(0, now - (state.lastTickAt ?? now));
  lastTick.before = before;
  const { since } = elapsedSince(state, now);
  // R91 — before anything else, because every system below this reads the
  // vault and none of them should have to wonder whether it is over its
  // capacity. A no-op for every save written since v46; the one that made
  // it necessary is the one that arrives holding 9,451 tokens.
  const consolidated = consolidateVault(state, content);
  if (consolidated) emitNews(state, content, 'rendered', consolidated);
  // R181 — before the campaign tick: the vet treats what the window found.
  treatInjuries(state, content, now, since);
  // Income first, so the one clamp in applyElapsed sees the whole ledger.
  tickCampaign(state, content, now, since);
  applyElapsed(state, content, now, since);
  for (const line of tickVat(state, content, now).news) pushNews(state, line);
  for (const line of tickResequencer(state, content, now).news) pushNews(state, line);
  ensureTemperaments(state, content, now);
  // R140 — what the player has BUILT with, beside what they have seen. Read
  // off the roster rather than hooked to the splice: a part reaches a chimera
  // five ways and a hook on one verb goes wrong the day a sixth is added.
  // ROADMAP §9.30.
  if (state.dex) {
    const worn = (state.dex.worn ??= []);
    const known = new Set(worn);
    for (const c of state.chimeras ?? []) {
      for (const t of Object.values(c.tokens ?? {})) {
        if (t?.partId && !known.has(t.partId)) { known.add(t.partId); worn.push(t.partId); }
      }
    }
  }
  for (const line of tickScars(state, content, now).news) pushNews(state, line);
  // R82 — the breakout, last, because an escape is a consequence of the
  // campaign tick above (a rival's defeat count is what lets one out) and a
  // fight the player can go and have rather than a timer they have to beat.
  // Every escape says so on the wire, including the ones that happened while
  // the app was closed: the board they come back to has to be explained.
  // R129 — and once, a phase rather than a specimen. The release says so
  // before the six bodies it let out do: a player returning to a board of
  // nine wants the headline above the sightings, not buried under them.
  const broke = tickBreakouts(state, content, now, since);
  if (broke.released) emitNews(state, content, 'labs_open', {});
  for (const e of broke.escaped) {
    emitNews(state, content, 'specimen_loose', { lab: e.lab, sighting: e.sighting });
  }
  // R85 — the top of the instability scale, after the scars and before the
  // clock is stamped, because whether a creature is agitated depends on
  // everything above it having already happened this tick.
  const feral = tickFeral(state, content, now);
  for (const line of feral.news) pushNews(state, line);
  for (const chimera of feral.gone) impound(state, chimera, content, now);
  // R87 — the Task Force last, and after the campaign tick above, because
  // whether they are in range depends on the notoriety that tick just paid
  // out and on whether the county fell during it. It also caps notoriety,
  // so this is the one place that clamp lives.
  for (const line of tickTaskforce(state, content, now).news) pushNews(state, line);
  state.lastTickAt = now;
  // R104 — WHAT MOVED; the shell repaints on this rather than on a timer.
  const after = worldSnapshot(state, now);
  lastTick.after = after;
  return changesBetween(before, after);
}

// Scalars only, every one something a player would notice: a count rather
// than an array, so reordering a list is not a change. See ROADMAP R104.
// R176 — MOVED HERE FROM `audio/sfx.js`, and the move is what let that module
// leave the eager graph. These two are pure functions over state scalars:
// they touch no AudioContext, no mute, no stinger table. They were the ONLY
// thing main.js needed from the synth synchronously, so while they lived
// beside it, 9.5 KB of oscillators was compiled on every boot to supply
// twenty lines of arithmetic.
//
// This is also where they belonged. `worldSnapshot`/`changesBetween` below
// are the same shape — snapshot the world, diff two snapshots — and the
// module that decides the order systems advance in is the one that can see
// what moved. A sound module should not own state-diffing. (The two pairs
// are now visibly redundant; collapsing them is a milestone of its own and
// is NOT this one.)
//
// THE RULE these four share: a sound marks a change in your POSITION —
// something arrived, completed, or was taken from you. Navigation and taps
// are not events. R111's `buzz` reads the same cues for the same reason; the
// story of what was silent before either is in `data/notes/voice.md`.
export function watchSignals(state) {
  return {
    nodes: state?.campaign?.heldNodes?.length ?? 0,
    contested: state?.campaign?.contested?.length ?? 0,
    report: state?.campaign?.opReport ? 1 : 0,
    stock: state?.ranch?.stock?.length ?? 0,
    resequencing: state?.resequencer ? 1 : 0,
  };
}

export function cuesFor(before, after) {
  if (!before || !after) return [];
  const cues = [];
  // The alarm comes first because it is the only one with a deadline: a
  // contested node is lost if it is not defended in its window.
  if (after.contested > before.contested) cues.push('alarm');
  if (after.nodes > before.nodes) cues.push('conquest');
  if (after.report > before.report) cues.push('report');
  // A run that ended WITH an animal arriving decanted; one that ended
  // without is an abort, which the player did on purpose and already saw.
  if (before.resequencing && !after.resequencing && after.stock > before.stock) cues.push('decant');
  return cues;
}

export function worldSnapshot(state, now = state?.lastTickAt ?? 0) {
  const c = state?.campaign ?? {};
  const r = state?.ranch ?? {};
  // A pending clock is what makes a countdown go stale with nothing else
  // moving. Bucketed to the minute; zero when nothing is counting.
  // One pass for four numbers. See ROADMAP R104.
  const herd = state?.chimeras ?? [];
  let injured = 0;
  let scarred = 0;
  let agitated = 0;
  let settling = 0;
  for (const x of herd) {
    if (x?.injury) injured++;
    scarred += x?.scars?.length ?? 0;
    if (x?.agitatedUntil > now) agitated++;
    if (x?.settleUntil > now) settling++;
  }
  const counting = (r.eggs?.length ?? 0) + (state?.vat ? 1 : 0) + (state?.resequencer ? 1 : 0)
    + settling + (c.contested?.length ?? 0);
  // R181 — each hire's tallies, in whole units.
  const staff = {};
  for (const h of state?.staff?.hired ?? []) {
    staff[`hire:${h.id}:done`] = Math.floor(h.done ?? 0);
    staff[`hire:${h.id}:missed`] = Math.floor(h.missed ?? 0);
  }
  return {
    ...staff,
    funds: Math.round(state?.funds ?? 0),
    notoriety: Math.round(c.notoriety ?? 0),
    heldNodes: c.heldNodes?.length ?? 0,
    contested: c.contested?.length ?? 0,
    loose: c.loose?.length ?? 0,
    captives: c.captives?.length ?? 0,
    bays: c.bays?.length ?? 0,
    stock: r.stock?.length ?? 0,
    eggs: r.eggs?.length ?? 0,
    chimeras: herd.length,
    injured,
    scarred,
    agitated,
    parts: state?.inventory?.length ?? 0,
    news: state?.news?.length ?? 0,
    // R107 — counters, not levels: everything above is blind to an event that
    // starts and ends inside one gap. See ROADMAP R107.
    contestCount: c.contestCount ?? 0,
    breakoutCount: c.breakoutCount ?? 0,
    opCount: c.opCount ?? 0,
    raidCount: c.raidCount ?? 0,
    settling,
    tick: counting ? Math.floor(now / 60000) : 0,
  };
}

export function changesBetween(before, after) {
  const moved = {};
  for (const k of Object.keys(after)) {
    if (before?.[k] !== after[k]) moved[k] = [before?.[k], after[k]];
  }
  return moved;
}
