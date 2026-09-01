// R42 — The Gauntlet. DOM-free.
//
// Four boss-scale units were drafted at R25 — full stat blocks, moves,
// procedural shapes, salvage manifests, KO lines — and A5 measured that
// they fit no strip without a rescale, so they sat behind a pinned
// "parked units" gate for seventeen phases. R41 built the thing they fit:
// a veteran stable. The trajectory math says a creature that fights the
// whole campaign reaches L8 at dominion and caps at L10 on a realistic
// diet, so the coalition's held-back assets are the tier that starts where
// the map ends.
//
// Stages unlock in order, the first when the county is yours (R40's
// dominionAt). Each is one derived encounter — authored escorts, then the
// boss — with no node behind it, no income and no notoriety: a prestige
// fight, for the purse and whatever the Containment Cannon can bag.
// Capturing THE COMPLIANCE ENGINE is the intended jackpot; its salvage
// carries the game's only apex mandate_horn. The director does not rewrite
// a Gauntlet fight: these ARE the coalition's answer.

export function gauntletStages(content) {
  return content.gauntlet ?? [];
}

// Every stage with its status: 'locked' (dominion unclaimed, or the stage
// before it unbeaten), 'open', or 'beaten'. Order is the data's order.
export function gauntletState(state, content) {
  const beaten = new Set(state.gauntletBeaten ?? []);
  let gate = !!state.dominionAt;
  return gauntletStages(content).map((stage) => {
    const done = beaten.has(stage.id);
    const status = done ? 'beaten' : gate ? 'open' : 'locked';
    if (!done) gate = false; // only the first unbeaten stage is open
    return { stage, status };
  });
}

export function gauntletComplete(state, content) {
  const rows = gauntletState(state, content);
  return rows.length > 0 && rows.every((r) => r.status === 'beaten');
}

// The derived encounter. Escorts first, the boss last — a finale walks on
// after its introduction, not before it.
export function gauntletEncounter(state, content, stageId) {
  const row = gauntletState(state, content).find((r) => r.stage.id === stageId);
  if (!row) return { ok: false, msg: 'No such exhibition.' };
  if (row.status === 'beaten') return { ok: false, msg: 'Already beaten. The rematch is a highlight reel.' };
  if (row.status === 'locked') {
    return { ok: false, msg: state.dominionAt ? 'The card goes in order. Beat the one before it.' : 'The Gauntlet opens when the county is yours.' };
  }
  const s = row.stage;
  return {
    ok: true,
    encounter: {
      id: s.id,
      name: s.name,
      blurb: s.blurb,
      reward: s.reward,
      waves: [...s.escorts, s.unitId],
      tier: null,
      scaleOverride: s.scaleOverride,
    },
  };
}

// Called from resolveBattle on a win. Returns the stage (for the news) or
// null if this id is not a stage — resolve calls it unconditionally on
// kind === 'gauntlet' and trusts the id.
export function recordGauntletWin(state, content, encounterId) {
  const stage = gauntletStages(content).find((s) => s.id === encounterId);
  if (!stage) return null;
  state.gauntletBeaten ??= [];
  if (!state.gauntletBeaten.includes(stage.id)) state.gauntletBeaten.push(stage.id);
  return stage;
}
