// Running a mission — the board, the odds, and the three consequences.
//
// LAZY ON PURPOSE, the same split R179 made and for the same reason: the
// shell needs to know who is committed and what happened when the clock ran
// out, and nothing else. The odds arithmetic, the aptitude read and the
// three consequence builders are fetched by the screen that composes one.
//
// EVERY CONSEQUENCE IS BUILT HERE, AT LAUNCH, and stored sealed. That is
// what keeps `campaign/mission.js` cheap enough to be eager — the tick files
// a record that already exists rather than constructing one — and it is the
// board's own rule besides: a reload must not be able to re-roll a job that
// went badly.

import { rngStream } from '../util/rng.js';
import { analyze } from '../splice/physiology.js';
import { isInjured, unitFromGenome } from '../battle/statblock.js';
import { missionTuning, activeMission, HOUR_MS } from './mission.js';

const HOUR = HOUR_MS;

// THE BOARD'S READERS, here rather than in the eager half. Every one of them
// is read by the War Room and by nothing the first frame runs — R169's blind
// spot is a module boot pulls in for one small function, and `mission.js` was
// becoming one. What stays eager is the tick and the two state reads the
// world and the rival roster genuinely need.
// The board, in the order the file declares. Sorted on `order` rather than
// on object key order, so adding a fourth mission is a JSON object.
export function missionsFor(content) {
  return Object.entries(content.missions ?? {})
    .map(([id, m]) => ({ id, ...m }))
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}

export function missionHours(mission) {
  const hours = mission?.hourOptions ?? [];
  return hours.length ? hours : [6];
}

export function missionReadyAt(state) {
  return state.campaign?.missionReadyAt ?? 0;
}

export function missionRemainingMs(state, now) {
  const run = activeMission(state);
  return run ? Math.max(0, run.until - now) : 0;
}

// Call it off. Nothing is gained, the creature comes home, and the cooldown
// runs from the moment it is back — the board's `startCooldown` rule (R65).
export function recallMission(state, content, now = state.lastTickAt ?? 0) {
  if (!activeMission(state)) return { ok: false, msg: content.copy?.mission?.none };
  state.campaign.mission = null;
  state.campaign.missionReadyAt = now + Math.round(missionTuning(content).cooldownHours * HOUR);
  return { ok: true, msg: content.copy?.mission?.recalled };
}

// WHAT MAKES A CREATURE GOOD AT THIS, read off the anatomy the same way the
// class vote is. Three terms, each normalised to 0..1 and weighted in data:
//
//   Camo   — the rarest real tag in the game. Six parts carry it and all six
//            are chameleon, so an infiltrator is a commitment rather than a
//            stat you happen to have.
//   speed  — what R149 shipped and combat still under-rewards.
//   mass   — INVERTED. Heavy is bad here, which is the first thing in the
//            game that is true, and it is why R148's Rumbler is the wrong
//            animal for this and right for the fight you take instead.
//
// The armour interaction is not written here and does not need to be:
// `camoTags` in splice/physiology.js strips Camo outright when armor > 0, so
// a plated creature reads zero on the first term by the engine's own rule.
// You cannot be armoured and hidden, and the aptitude says so without this
// module knowing why.
export function missionAptitude(content, chimera) {
  const a = missionTuning(content).aptitude;
  const report = analyze(chimera.frame, Object.values(chimera.tokens ?? {}), content);
  const camoParts = Object.values(chimera.tokens ?? {}).filter((t) => {
    const part = content.parts?.[t.partId];
    return [...(part?.tags ?? []), ...(part?.move?.tags ?? [])].includes('Camo');
  }).length;
  const hidden = (report.tags ?? []).includes('Camo');
  const camo = hidden ? clamp01(camoParts / Math.max(1, a.camoCeil)) : 0;
  const speed = clamp01((report.stats?.speed ?? 0) / Math.max(1, a.speedCeil));
  const mass = clamp01((a.massCeil - (report.mass ?? a.massCeil)) / Math.max(1, a.massCeil - a.massFloor));
  const score = clamp01(camo * a.camoWeight + speed * a.speedWeight + mass * a.massWeight);
  return { camo, speed, mass, score, camoParts, hidden, raw: { speed: report.stats?.speed ?? 0, mass: report.mass ?? 0 } };
}

function clamp01(n) {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

// The odds and the purse, shown before the player commits. Derived, so the
// number on the button is the number the launch rolls against.
export function missionOdds(content, mission, hours, chimera) {
  const t = missionTuning(content);
  const apt = chimera ? missionAptitude(content, chimera) : { score: 0 };
  const chance = Math.max(t.minChance, Math.min(t.maxChance,
    t.baseChance + apt.score * t.perAptitude + hours * t.perHour));
  return {
    chance,
    aptitude: apt,
    funds: Math.round((mission.fundsPerHour ?? 0) * hours),
    notoriety: mission.notoriety ?? 0,
  };
}

// Which labs you can send somebody against: one you have already met, because
// a mission against a lab the campaign has not introduced is a mission
// against a name the player has never read.
export function missionTargets(state, content) {
  const met = state.campaign?.rivals ?? {};
  return Object.values(content.rivals ?? {})
    .filter((r) => met[r.id] && ((met[r.id].defeats ?? 0) + (met[r.id].losses ?? 0)) > 0);
}

// Launching decides everything NOW, seeded, and stores it.
export function startMission(state, content, now, missionId, rivalId, chimeraId, hours = 0) {
  const t = missionTuning(content);
  if (activeMission(state)) return { ok: false, msg: content.copy?.mission?.already };
  if (now < missionReadyAt(state)) return { ok: false, msg: content.copy?.mission?.resting };
  const mission = missionsFor(content).find((m) => m.id === missionId);
  if (!mission) return { ok: false, msg: content.copy?.mission?.no_mission };
  const rival = missionTargets(state, content).find((r) => r.id === rivalId);
  if (!rival) return { ok: false, msg: content.copy?.mission?.no_rival };
  if (!missionHours(mission).includes(hours)) return { ok: false, msg: content.copy?.mission?.no_hours };
  const busy = new Set((state.campaign?.operations ?? []).map((r) => r.chimeraId).filter(Boolean));
  const chimera = (state.chimeras ?? []).find((c) => c.id === chimeraId);
  if (!chimera || isInjured(chimera, now) || busy.has(chimera.id)) {
    return { ok: false, msg: content.copy?.mission?.no_specimen };
  }

  const odds = missionOdds(content, mission, hours, chimera);
  state.campaign.missionCount = (state.campaign.missionCount ?? 0) + 1;
  const rng = rngStream(state.seed, `mission:${missionId}:${rivalId}`, state.campaign.missionCount);
  const success = rng() < odds.chance;

  // THE FATE. Renewal spends the creature whether or not the job lands —
  // that is what `alwaysSpends` means and it is the whole price of the
  // mission. Sabotage risks it only on a failure, and then only sometimes.
  // Espionage never costs more than time.
  let fate = 'home';
  if (mission.alwaysSpends) fate = 'released';
  else if (!success && mission.risk === 'conscripted' && rng() < (mission.catchOnFail ?? 0)) fate = 'conscripted';
  else if (!success && mission.risk === 'detained') fate = 'detained';

  const outcome = {
    success,
    funds: success ? odds.funds : Math.round(odds.funds * (mission.consolation ?? 0)),
    notoriety: success ? (mission.notoriety ?? 0) : 0,
    grants: success ? (mission.grants ?? 'none') : 'none',
    setback: mission.setback ?? 1,
    detainHours: mission.detainHours ?? 9,
    fate,
    conscript: fate === 'conscripted' ? conscriptOf(chimera) : null,
    loose: fate === 'released' ? looseOf(state, content, chimera, rng, now) : null,
  };

  const run = {
    missionId, rivalId, chimeraId,
    name: chimera.name,
    hours,
    startedAt: now,
    until: now + Math.round(hours * HOUR),
    chance: odds.chance,
    outcome,
  };
  state.campaign.mission = run;
  return { ok: true, run, odds, mission, rival };
}

// A creature that is now theirs. STORED AS A GENOME, NOT AS A STAT BLOCK —
// R108's rule, and the reason is the same one visiting.js gives: a saved
// stat block is a promise about a fight that the engine has stopped making,
// so a conscript taken three balance passes ago would fight with numbers
// nothing else in the game still uses. `rivalTeam` re-derives it on every
// read through `unitFromGenome`, which is what every other combatant does.
function conscriptOf(chimera) {
  return {
    name: chimera.name,
    frame: chimera.frame,
    tokens: Object.values(chimera.tokens ?? {}).map((t) => ({ partId: t.partId, grade: t.grade })),
  };
}

// A creature turned loose in the county. The loose board's own shape, built
// here so the tick only has to push it. It carries no `rivalId`, because no
// lab built it — the Wire and the hunt both read the field rather than
// assuming one, and this is the first entry on that board that was never on
// the ladder.
function looseOf(state, content, chimera, rng, now) {
  const t = content.breakoutMeta ?? {};
  const tokens = Object.values(chimera.tokens ?? {}).map((x) => ({ partId: x.partId, grade: x.grade }));
  const unit = unitFromGenome({
    id: `renewal-${state.campaign.missionCount}`,
    name: chimera.name,
    frame: chimera.frame,
    tokens,
    capturable: true,
  }, content);
  const sightings = t.sightings ?? [];
  return {
    id: `loose-renewal-${state.campaign.missionCount}`,
    rivalId: null,
    unit,
    pack: [],
    wild: true,
    traits: unit.traits ?? [],
    escapedAt: now,
    sighting: sightings.length
      ? sightings[Math.floor(rng() * sightings.length)]
      : content.copy?.mission?.sighting_unknown,
    reward: Math.round((t.rewardBase ?? 140) + unit.power * (t.rewardPerPower ?? 5)),
  };
}
