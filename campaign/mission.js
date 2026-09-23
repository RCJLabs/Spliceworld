// Missions — one creature sent against one rival lab, for real-world hours,
// without a fight. Pure and DOM-free, like the board.
//
// The eager half: who is committed, is one running, what happened when the
// clock ran out. The table, the odds and the three consequences are in
// `campaign/caper.js`, which is lazy. Why the split, why the outcome is
// sealed at launch, and what each mission costs: data/notes/missions.md.

import { isInjured, applyInjury } from '../battle/statblock.js';

export const HOUR_MS = 3600000;
const HOUR = HOUR_MS;

const DEFAULTS = {
  cooldownHours: 11,
  maxConscripts: 3,
  baseChance: 0.26,
  perAptitude: 0.42,
  perHour: 0.006,
  minChance: 0.1,
  maxChance: 0.9,
  aptitude: {
    camoWeight: 0.5, speedWeight: 0.3, massWeight: 0.2,
    camoCeil: 4, speedCeil: 12, massFloor: 95, massCeil: 165,
  },
};

export function missionTuning(content) {
  const t = content.missionMeta ?? {};
  return { ...DEFAULTS, ...t, aptitude: { ...DEFAULTS.aptitude, ...(t.aptitude ?? {}) } };
}

export function activeMission(state) {
  return state.campaign?.mission ?? null;
}

// The creatures who could go: fit, home, and not already carrying a job. Eager
// because the agenda asks on the first frame; why, in data/notes/missions.md.
export function missionCandidates(state, now, busy = new Set()) {
  return (state.chimeras ?? []).filter((c) => !isInjured(c, now) && !busy.has(c.id));
}

// ONE HOME for the board's rest: the tick and the recall both write it, and a
// mission may override the board's own. Renewal does; why, and what it cost
// R93's late game not to, is in data/notes/missions.md.
export function missionCooldownMs(content, mission) {
  const t = missionTuning(content);
  return Math.round((mission?.cooldownHours ?? t.cooldownHours) * HOUR);
}

// Every conscript this rival is holding. One reader, so the roster and the
// board cannot disagree about who was taken.
export function conscriptsOf(state, rivalId) {
  return state.campaign?.rivals?.[rivalId]?.conscripts ?? [];
}

// Elapsed, like every other timer here. Stamped `run.until`, never `now`.
// Reads the outcome sealed at launch; R114 says a save is untrusted input,
// so every field of it is read defensively.
export function tickMissions(state, content, now) {
  const run = activeMission(state);
  if (!run || !(now >= run.until)) return { result: null };
  const endedAt = run.until;
  state.campaign.mission = null;
  state.campaign.missionReadyAt = endedAt + missionCooldownMs(content, content.missions?.[run.missionId]);

  const out = run.outcome ?? {};
  const funds = Number.isFinite(out.funds) ? out.funds : 0;
  state.funds = (state.funds ?? 0) + funds;
  if (Number.isFinite(out.notoriety) && out.notoriety > 0) {
    state.campaign.notoriety = (state.campaign.notoriety ?? 0) + out.notoriety;
  }

  const result = {
    missionId: run.missionId,
    mission: content.missions?.[run.missionId]?.name ?? run.missionId,
    rivalId: run.rivalId,
    rival: content.rivals?.[run.rivalId]?.name ?? run.rivalId,
    hours: run.hours,
    chimeraId: run.chimeraId,
    name: run.name ?? '',
    success: !!out.success,
    funds,
    fate: out.fate ?? 'home',
    granted: null,
  };

  // The three fates. Each is a move of data the composer already built.
  if (result.fate === 'conscripted' && out.conscript && content.rivals?.[run.rivalId]) {
    // A lab holds only so many: `rivalTeam` fields every one of these, so
    // unbounded is a save array AND a fight nobody designed. Oldest reassigned.
    const cap = Math.max(1, missionTuning(content).maxConscripts ?? 3);
    const record = recordFor(state, run.rivalId);
    record.conscripts = [...(record.conscripts ?? []), out.conscript].slice(-cap);
    dropChimera(state, run.chimeraId);
  } else if (result.fate === 'released' && out.loose) {
    state.campaign.loose ??= [];
    state.campaign.loose.push(out.loose);
    dropChimera(state, run.chimeraId);
  } else if (result.fate === 'detained') {
    // ONE HOME for an injury, which the gate caught this writing around.
    // `applyInjury` counts it and keeps the LONGER of the two clocks, so a
    // specimen already hurt is not quietly healed early by a night in a
    // holding pen — writing `c.injury` directly would have done exactly that.
    const c = (state.chimeras ?? []).find((x) => x.id === run.chimeraId);
    const hours = Number.isFinite(out.detainHours) ? out.detainHours : 9;
    if (c) applyInjury(c, { until: endedAt + Math.round(hours * HOUR), reason: 'detained' });
  }

  // What a success bought besides money, filed here so the digest can name it.
  if (out.success && out.grants === 'intel') {
    recordFor(state, run.rivalId).intel = true;
    result.granted = 'intel';
  } else if (out.success && out.grants === 'setback') {
    const record = recordFor(state, run.rivalId);
    record.setback = (record.setback ?? 0) + (Number.isFinite(out.setback) ? out.setback : 1);
    result.granted = 'setback';
  }
  return { result };
}

// The lab's record, made if this is the first thing to touch it. Written out
// three times in one function before R180 finished; the shape is rivals.js's.
function recordFor(state, rivalId) {
  state.campaign.rivals ??= {};
  return (state.campaign.rivals[rivalId] ??= { defeats: 0, losses: 0, lastMetAt: null });
}

// A creature that is not coming back. Vault tokens stay spent, as for every
// creature that leaves by any door.
function dropChimera(state, id) {
  const i = (state.chimeras ?? []).findIndex((c) => c.id === id);
  if (i >= 0) state.chimeras.splice(i, 1);
  if (state.party) state.party = state.party.filter((p) => p !== id);
}
