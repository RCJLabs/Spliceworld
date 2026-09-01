// R41 — veterancy. DOM-free; the harness tunes with the same math the game
// runs.
//
// The design brief arrived as a player report, verbatim: "I have like 9
// chimeras and no combination of them could ever beat the war missions I'm
// on" and "a chimera you create at the beginning of the game should be able
// to last the entire game." The game's only ladder out of a wall was to
// REPLACE — raise better donors, extract better parts, splice a better
// creature — and R13 even built the dismantler for it. Nothing made the
// creature you already loved stronger for having fought.
//
// So: grades are what a chimera is BUILT from; levels are what it has BEEN
// THROUGH. Every number lives in data/training.json — the engine reads the
// curve and holds no second opinion about it.
//
// Level multiplies hp, power, armor and stamina. NEVER speed: how fast a
// creature acts is anatomy — mass, lift, the physiology the body earned —
// and A9/R32 priced flight and turn order in that currency. Veterancy must
// not scramble it.

const FALLBACK = { xpPerWave: 12, lossFraction: 0.4, sparringFraction: 0.5, levels: [], statPerLevel: 0, sparScale: 0.75, sparCooldownHours: 0.75 };

export function trainingTuning(content) {
  return { ...FALLBACK, ...(content.trainingMeta ?? {}) };
}

// Cumulative thresholds: the level is how many of them the xp has reached.
// One source of truth — the level is DERIVED, never stored, so xp and level
// cannot disagree on a save.
export function levelOf(xp, content) {
  const { levels } = trainingTuning(content);
  let lvl = 0;
  for (const at of levels) {
    if ((xp ?? 0) >= at) lvl++;
    else break;
  }
  return lvl;
}

export function levelMult(level, content) {
  return 1 + trainingTuning(content).statPerLevel * level;
}

export function maxLevel(content) {
  return trainingTuning(content).levels.length;
}

// For the pens card and the aftermath line: where this creature stands and
// what the next rung costs.
export function xpProgress(xp, content) {
  const { levels } = trainingTuning(content);
  const level = levelOf(xp, content);
  const floor = level > 0 ? levels[level - 1] : 0;
  const next = level < levels.length ? levels[level] : null;
  return {
    level,
    xp: xp ?? 0,
    next,
    into: (xp ?? 0) - floor,
    span: next != null ? next - floor : 0,
    atCap: next == null,
  };
}

// What one battle pays. Sized by what was actually stood against — the
// opposition's scale and wave count — not by who won: a loss against
// something real still teaches, at lossFraction, because a walled player
// grinding losses into levels is the ladder out of the wall working as
// designed. Sparring pays sparringFraction on top of whatever happened.
export function xpForBattle(battle, content) {
  const t = trainingTuning(content);
  // Waves actually REACHED: the authored count minus whatever never left
  // the queue. A win has faced them all; a loss on wave one of three pays
  // for one, because the other two taught nothing. `waveCount` is stamped
  // by createBattle; a fight saved mid-battle on an older version migrates
  // without it and falls back to what it can see.
  const authored = battle.waveCount ?? 1 + (battle.enemy.queue?.length ?? 0);
  const waves = Math.max(1, authored - (battle.enemy.queue?.length ?? 0));
  const base = t.xpPerWave * waves * (battle.enemyScale ?? 1);
  const outcome = battle.outcome === 'win' ? 1 : t.lossFraction;
  const spar = battle.context?.kind === 'sparring' ? t.sparringFraction : 1;
  return Math.max(1, Math.round(base * outcome * spar));
}

// Grant it to everyone who was on the card. Full share each, no splitting:
// splitting would punish fielding a full team, and A1 spent a whole phase
// establishing that three bodies is how this game is played. A knocked-out
// creature still earns — it was there, and temperament drift already treats
// a KO as something that happened to it, not something it should be docked
// for.
export function grantBattleXp(state, battle, content) {
  const gained = xpForBattle(battle, content);
  const report = [];
  for (const c of battle.player.team) {
    const chimera = state.chimeras.find((ch) => ch.id === c.refId);
    if (!chimera) continue;
    const before = levelOf(chimera.xp ?? 0, content);
    chimera.xp = (chimera.xp ?? 0) + gained;
    const after = levelOf(chimera.xp, content);
    report.push({ name: chimera.name, gained, level: after, leveled: after > before });
  }
  return report;
}
