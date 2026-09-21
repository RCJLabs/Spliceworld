// Expeditions — crew sent into a region for real-world hours, one at a time.
// Pure and DOM-free, like the board. Why the price is the CREW rather than
// the money, and what `rarityFloor` buys: data/notes/regions.md. What is in
// here rather than in the lazy half: `campaign/outfit.js` says.

import { regionOpen } from './map.js';
import { createAnimal } from '../ranch/ranch.js';
import { isInjured } from '../battle/statblock.js';

const HOUR = 3600000;

const DEFAULTS = {
  crewMax: 3,
  hourOptions: [4, 12, 24],
  baseChance: 0.24,
  perCrew: 0.1,
  perHour: 0.01,
  answerBonus: 0.12,
  minChance: 0.08,
  maxChance: 0.88,
  cooldownHours: 9,
  fundsPerCrewHour: 9,
  consolation: 0.3,
  rarityFloor: {},
};

export function expTuning(content) {
  return { ...DEFAULTS, ...(content.campaignMeta?.expeditions ?? {}) };
}

export function expeditionHours(content) {
  const hours = expTuning(content).hourOptions ?? [];
  return hours.length ? hours : DEFAULTS.hourOptions;
}

// Where you can actually go: a region the campaign has already opened, with
// a table to roll on. The entry conditions are the map's own, so an
// expedition can never reach past it.
export function expeditionRegions(state, content) {
  return Object.values(content.regions ?? {})
    .filter((r) => (r.expedition?.finds ?? []).length > 0)
    .filter((r) => regionOpen(state, content, r));
}

export function activeExpedition(state) {
  return state.campaign?.expedition ?? null;
}

// Who is abroad, as a Set. ONE HOME, because five places ask — two on the
// board, three in the War Room. A creature counted fit in one of them and
// abroad in another is a price that is not really being paid.
export function expeditionCrew(state) {
  return new Set(activeExpedition(state)?.crew ?? []);
}

export function expeditionReadyAt(state) {
  return state.campaign?.expeditionReadyAt ?? 0;
}

export function expeditionReady(state, now) {
  return !activeExpedition(state) && now >= expeditionReadyAt(state);
}

export function expeditionRemainingMs(state, now) {
  const run = activeExpedition(state);
  return run ? Math.max(0, run.until - now) : 0;
}

// The creatures who could go: fit, and not already carrying a job.
export function expeditionCandidates(state, now, busy = new Set()) {
  return (state.chimeras ?? []).filter((c) => !isInjured(c, now) && !busy.has(c.id));
}

// Call them home early. Nothing is found and the cooldown runs from the
// moment they are back, which is the board's `startCooldown` rule verbatim.
export function recallExpedition(state, content, now = state.lastTickAt ?? 0) {
  if (!activeExpedition(state)) return { ok: false, msg: content.copy?.expedition?.none };
  state.campaign.expedition = null;
  state.campaign.expeditionReadyAt = now + Math.round(expTuning(content).cooldownHours * HOUR);
  return { ok: true, msg: content.copy?.expedition?.recalled };
}

// Elapsed, like every other timer here. It READS the outcome sealed at
// launch rather than rolling one, which is why the table can live in the
// lazy half. Stamped `run.until`, never `now`, so a trip that landed on
// Tuesday hands back an animal that has been growing since Tuesday (R65).
export function tickExpeditions(state, content, now) {
  const run = activeExpedition(state);
  if (!run || now < run.until) return { result: null };
  const endedAt = run.until;
  const region = content.regions?.[run.regionId];
  state.campaign.expedition = null;
  state.campaign.expeditionReadyAt = endedAt + Math.round(expTuning(content).cooldownHours * HOUR);

  const { success, funds, species } = run.outcome;
  state.funds = (state.funds ?? 0) + funds;
  const result = {
    regionId: run.regionId,
    region: region?.name ?? run.regionId,
    hours: run.hours,
    crew: run.crew.length,
    success,
    funds,
    animal: null,
    overCapacity: false,
  };
  if (success && species && content.species?.[species]) {
    // The animal ALWAYS arrives, even into a full barn — the board's rule,
    // for the board's reason: a reward earned and not visible reads as
    // broken, and upkeep is per head so the cap still has teeth.
    const animal = createAnimal(state, species, content, endedAt);
    state.ranch.stock.push(animal);
    result.animal = animal;
    result.overCapacity = state.ranch.stock.length > state.ranch.penCapacity;
  }
  return { result };
}
