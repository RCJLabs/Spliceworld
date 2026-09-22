// Missions — one creature sent against one rival lab, for real-world hours,
// without a fight. Pure and DOM-free, like the board.
//
// WHAT IS IN HERE RATHER THAN IN `campaign/caper.js`: the same split R179
// made, for the same reason. Four places have to know a creature is away on
// the first frame — the Pens, the briefing, the board and the War Room — and
// none of them needs the mission table, the odds arithmetic or the three
// consequences. So the eager half is "who is committed, is one running, what
// happened when the clock ran out", and the composer is lazy.
//
// THE OUTCOME IS SEALED AT LAUNCH, which is what lets the table be lazy at
// all: `tickMissions` READS a decision made when the player pressed the
// button rather than rolling one, so a reload cannot re-roll it and the
// consequence — a conscript, a release — is already built and only has to be
// filed. Why each mission is priced the way it is: data/notes/missions.md.

import { isInjured } from '../battle/statblock.js';

const HOUR = 3600000;

const DEFAULTS = {
  cooldownHours: 11,
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

export function activeMission(state) {
  return state.campaign?.mission ?? null;
}

// Who is away, as a Set. ONE HOME for the same reason the expedition's crew
// has one: a creature counted fit in one screen and committed in another is
// a price that is not really being paid. A mission commits exactly one.
export function missionCommitted(state) {
  const run = activeMission(state);
  return new Set(run?.chimeraId ? [run.chimeraId] : []);
}

export function missionReadyAt(state) {
  return state.campaign?.missionReadyAt ?? 0;
}

export function missionReady(state, now) {
  return !activeMission(state) && now >= missionReadyAt(state);
}

export function missionRemainingMs(state, now) {
  const run = activeMission(state);
  return run ? Math.max(0, run.until - now) : 0;
}

// The creatures who could go: fit, home, and not already carrying a job.
export function missionCandidates(state, now, busy = new Set()) {
  return (state.chimeras ?? []).filter((c) => !isInjured(c, now) && !busy.has(c.id));
}

// Every conscript this rival is holding. ONE READER, because both the team
// builder and the War Room ask, and a roster that disagrees with the board
// about who was taken is the bug this milestone exists to avoid.
export function conscriptsOf(state, rivalId) {
  return state.campaign?.rivals?.[rivalId]?.conscripts ?? [];
}

// Call it off. Nothing is gained, the creature comes home, and the cooldown
// runs from the moment it is back — the board's `startCooldown` rule (R65).
export function recallMission(state, content, now = state.lastTickAt ?? 0) {
  if (!activeMission(state)) return { ok: false, msg: content.copy?.mission?.none };
  state.campaign.mission = null;
  state.campaign.missionReadyAt = now + Math.round(missionTuning(content).cooldownHours * HOUR);
  return { ok: true, msg: content.copy?.mission?.recalled };
}

// Elapsed, like every other timer here. Stamped `run.until`, never `now`, so
// a mission that landed on Tuesday files its consequence as of Tuesday.
//
// R114 — A SAVE IS UNTRUSTED INPUT. Every field of the sealed outcome is read
// defensively: a run with no outcome, no fate or a rival that no longer
// exists in the build resolves to nothing rather than throwing on the first
// render after load.
export function tickMissions(state, content, now) {
  const run = activeMission(state);
  if (!run || !(now >= run.until)) return { result: null };
  const endedAt = run.until;
  state.campaign.mission = null;
  state.campaign.missionReadyAt = endedAt + Math.round(missionTuning(content).cooldownHours * HOUR);

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

  // THE THREE FATES. Each one is a move of data the composer already built,
  // which is the whole reason this function is cheap enough to be eager.
  if (result.fate === 'conscripted' && out.conscript && content.rivals?.[run.rivalId]) {
    state.campaign.rivals ??= {};
    const record = (state.campaign.rivals[run.rivalId] ??= { defeats: 0, losses: 0, lastMetAt: null });
    record.conscripts ??= [];
    record.conscripts.push(out.conscript);
    dropChimera(state, run.chimeraId);
  } else if (result.fate === 'released' && out.loose) {
    state.campaign.loose ??= [];
    state.campaign.loose.push(out.loose);
    dropChimera(state, run.chimeraId);
  } else if (result.fate === 'detained') {
    const c = (state.chimeras ?? []).find((x) => x.id === run.chimeraId);
    const hours = Number.isFinite(out.detainHours) ? out.detainHours : 9;
    if (c) c.injury = { until: endedAt + Math.round(hours * HOUR), reason: 'detained' };
  }

  // What a success bought besides money, filed here so the digest can name it.
  if (out.success && out.grants === 'intel') {
    state.campaign.rivals ??= {};
    const record = (state.campaign.rivals[run.rivalId] ??= { defeats: 0, losses: 0, lastMetAt: null });
    record.intel = true;
    result.granted = 'intel';
  } else if (out.success && out.grants === 'setback') {
    state.campaign.rivals ??= {};
    const record = (state.campaign.rivals[run.rivalId] ??= { defeats: 0, losses: 0, lastMetAt: null });
    record.setback = (record.setback ?? 0) + (Number.isFinite(out.setback) ? out.setback : 1);
    result.granted = 'setback';
  }
  return { result };
}

// A creature that is not coming back. It leaves the roster and the vault
// tokens it holds stay spent, which is the Theater's rule for every creature
// that leaves by any door.
function dropChimera(state, id) {
  const i = (state.chimeras ?? []).findIndex((c) => c.id === id);
  if (i >= 0) state.chimeras.splice(i, 1);
  if (state.party) state.party = state.party.filter((p) => p !== id);
}
