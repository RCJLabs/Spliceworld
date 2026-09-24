// Outfitting an expedition — the table, the odds and the launch.
//
// LAZY ON PURPOSE, and the split is where the eager budget was paid. Only
// the War Room and the harness ever ask what is on a region's table; the
// shell needs to know who is abroad and when they are back, and nothing
// else. So `campaign/expedition.js` keeps the judgement and the elapsed
// settle — which the first frame genuinely runs — and the odds, the table
// and the launch are fetched by the screen that composes one. Same split,
// and the same argument, as `audio/sfx.js` and `audio/room.js` (R111).

import { rngStream } from '../util/rng.js';
import { analyze } from '../splice/physiology.js';
import { isInjured } from '../battle/statblock.js';
import {
  expTuning, expeditionHours, expeditionRegions, activeExpedition, expeditionReadyAt,
} from './expedition.js';

const HOUR = 3600000;

// WHAT A TRIP OF THIS SHAPE COULD BRING BACK, as a list rather than a
// yes/no, because "which region, for how long, with whom" is only a decision
// if the player can see what each answer buys. Anything above common has a
// floor in hours and in crew, and a trip under either floor cannot roll it.
//
// R186 — AND A UNIQUE IS ONCE PER RUN. Given a save, anybody this run has
// already brought home is off the table: `campaign.legendsFound` is the run's
// own record of them, and the campaign block does not cross a relocation, so
// the next lab can go looking for her again. Without a save (the Dex, the
// balance harness) the table is the table.
export function findsFor(content, region, hours, crew, state = null) {
  const floors = expTuning(content).rarityFloor ?? {};
  const found = new Set((state?.campaign?.legendsFound ?? []).map((l) => l?.species));
  return (region?.expedition?.finds ?? []).filter((f) => {
    if (found.has(f.species)) return false;
    const floor = floors[content.species?.[f.species]?.rarity ?? 'common'];
    if (!floor) return true;
    return hours >= (floor.hours ?? 0) && crew >= (floor.crew ?? 0);
  });
}

// What a longer, fuller trip would ALSO reach — derived from the table, so
// the screen advertises a species the day somebody adds one and stops the
// day somebody takes it out.
export function findsBeyond(content, region, hours, crew, state = null) {
  const here = new Set(findsFor(content, region, hours, crew, state).map((f) => f.species));
  const most = expeditionHours(content).reduce((n, h) => Math.max(n, h), 0);
  return findsFor(content, region, most, expTuning(content).crewMax, state)
    .filter((f) => !here.has(f.species)).map((f) => f.species);
}

export function expeditionOdds(state, content, region, hours, crew = []) {
  const t = expTuning(content);
  const reasons = [];
  let chance = t.baseChance + crew.length * t.perCrew + hours * t.perHour;
  reasons.push({ text: `${crew.length} out for ${hours}h`, delta: crew.length * t.perCrew + hours * t.perHour });
  const answered = crew.filter((c) => {
    const report = analyze(c.frame, Object.values(c.tokens ?? {}), content);
    return report.creatureClass === region?.answer;
  });
  if (answered.length) {
    const delta = t.answerBonus * (answered.length / crew.length);
    chance += delta;
    reasons.push({ text: `${region.answer} anatomy for ${region.name}`, delta });
  }
  return {
    chance: Math.max(t.minChance, Math.min(t.maxChance, chance)),
    reasons,
    funds: Math.round(t.fundsPerCrewHour * Math.max(1, crew.length) * hours),
  };
}

// Launching decides the outcome NOW, seeded, and stores it — the board's own
// rule (campaign/operations.js), for the board's reason: a reload must not
// be able to reroll a trip that went badly.
export function startExpedition(state, content, now, regionId, crewIds = [], hours = 0) {
  const t = expTuning(content);
  if (activeExpedition(state)) return { ok: false, msg: content.copy?.expedition?.already };
  if (now < expeditionReadyAt(state)) return { ok: false, msg: content.copy?.expedition?.resting };
  const region = expeditionRegions(state, content).find((r) => r.id === regionId);
  if (!region) return { ok: false, msg: content.copy?.expedition?.no_region };
  if (!expeditionHours(content).includes(hours)) return { ok: false, msg: content.copy?.expedition?.no_hours };
  const busy = new Set((state.campaign?.operations ?? []).map((r) => r.chimeraId).filter(Boolean));
  const crew = crewIds
    .map((id) => state.chimeras.find((c) => c.id === id))
    .filter((c) => c && !isInjured(c, now) && !busy.has(c.id));
  if (!crew.length) return { ok: false, msg: content.copy?.expedition?.no_crew };
  if (crew.length > t.crewMax) return { ok: false, msg: content.copy?.expedition?.too_many };

  const odds = expeditionOdds(state, content, region, hours, crew);
  state.campaign.expeditionCount = (state.campaign.expeditionCount ?? 0) + 1;
  const rng = rngStream(state.seed, `expedition:${regionId}`, state.campaign.expeditionCount);
  const success = rng() < odds.chance;
  const table = findsFor(content, region, hours, crew.length, state);
  const total = table.reduce((n, f) => n + (f.weight ?? 1), 0);
  let roll = rng() * total;
  let species = null;
  for (const find of table) {
    roll -= find.weight ?? 1;
    if (roll <= 0) { species = find.species; break; }
  }
  const run = {
    regionId,
    crew: crew.map((c) => c.id),
    hours,
    startedAt: now,
    until: now + Math.round(hours * HOUR),
    chance: odds.chance,
    // Sealed at launch, opened when they come back through the door.
    outcome: {
      success,
      funds: success ? odds.funds : Math.round(odds.funds * t.consolation),
      species: success ? species : null,
      // R186 — a unique comes home as HERSELF, and the lab that found her is
      // part of the story. Sealed with everything else, so the settle on the
      // first frame decides nothing and reads one field.
      ...(success && content.species?.[species]?.rarity === 'unique'
        ? { legend: { species, name: content.species[species].name, lab: state.profile?.lab ?? null, region: regionId } }
        : {}),
    },
  };
  state.campaign.expedition = run;
  return { ok: true, run, odds, region };
}
