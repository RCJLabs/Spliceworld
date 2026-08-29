// Battle engine (M4). Pokémon structure: one active fighter per side, a
// bench, switching costs the turn. DOM-free and fully seeded — the M4.5
// balance harness replays battles headless from the same code. The battle
// object is plain serializable state; a mid-battle save/reload continues
// deterministically (rolls derive from seed + rollCount).

import { rngStream, pick } from '../util/rng.js';
import { analyze } from '../splice/physiology.js';
import { GRADE_INDEX } from '../splice/extract.js';
import { isSettled } from '../splice/theater.js';

const STAGE_STEP = 0.15;
const STAGE_CAP = 3;
const ARMOR_FACTOR = 0.7;
const VENOM_TICK = 3;
const VENOM_CAP = 5;
const REST_FRACTION = 0.35;
const REJECTION_MULT = 0.75;
const GRADE_MOVE_BONUS = 0.15; // Apex/Prismatic "upgraded abilities": +15%/tier

const INJURY_NAMES = [
  'Bruised Ego', 'Sprained Everything', 'Temporary Kazoo Phobia',
  'Overstretched Drama Gland', 'Bent Whiskers', 'Full-Body Boop',
];

function stageMult(stage) {
  return 1 + STAGE_STEP * Math.max(-STAGE_CAP, Math.min(STAGE_CAP, stage));
}

function roll(battle) {
  return rngStream(battle.seed, 'roll', battle.rollCount++)();
}

// --- Combatant builders -------------------------------------------------

export function combatantFromChimera(chimera, content, now) {
  const tokens = Object.values(chimera.tokens);
  const report = analyze(chimera.frame, tokens, content);
  const settled = isSettled(chimera, now);

  const moves = [];
  for (const token of tokens) {
    const part = content.parts[token.partId];
    if (!part.move) continue; // passive part — stats only
    const gradeBonus = 1 + GRADE_INDEX[token.grade] * GRADE_MOVE_BONUS;
    moves.push({
      name: part.ability,
      power: Math.round(part.move.power * gradeBonus),
      cost: part.move.cost,
      acc: part.move.acc,
      tags: part.move.tags,
      keywords: part.move.keywords,
    });
  }
  for (const combo of report.combos) {
    moves.push({ name: combo.name, ...combo.move });
  }

  const debuff = settled ? 1 : REJECTION_MULT;
  return {
    kind: 'chimera',
    refId: chimera.id,
    name: chimera.name,
    maxHp: report.stats.hp,
    hp: report.stats.hp,
    power: Math.round(report.stats.power * debuff),
    armor: report.stats.armor,
    speed: Math.round(report.stats.speed * debuff),
    staminaMax: report.stats.stamina,
    stamina: report.stats.stamina,
    regen: report.regenNet,
    tags: ['Organic', ...report.tags],
    moves,
    rejection: !settled,
    // Obedience (§3.5): instability risks it, bond earns it back.
    ignoreChance: Math.max(
      0,
      Math.min(0.6, (settled ? 0 : 0.25) + (chimera.instability / 100) * 0.2 - (chimera.bond / 100) * 0.2)
    ),
    stages: { acc: 0, evasion: 0, power: 0 },
    status: { venom: 0, sleep: false, stun: false, guard: false, charging: null },
  };
}

export function combatantFromUnit(unit) {
  return {
    kind: 'unit',
    refId: unit.id,
    name: unit.name,
    maxHp: unit.hp,
    hp: unit.hp,
    power: unit.power,
    armor: unit.armor,
    speed: unit.speed,
    staminaMax: unit.stamina,
    stamina: unit.stamina,
    regen: unit.regen,
    tags: unit.tags,
    moves: unit.moves.map((m) => ({ ...m })),
    koLine: unit.koLine,
    transformInto: unit.transformInto ?? null,
    transformLine: unit.transformLine ?? null,
    rejection: false,
    ignoreChance: 0,
    stages: { acc: 0, evasion: 0, power: 0 },
    status: { venom: 0, sleep: false, stun: false, guard: false, charging: null },
  };
}

// --- Battle lifecycle ---------------------------------------------------

export function createBattle(chimeras, encounter, content, seed, now) {
  const battle = {
    seed,
    rollCount: 0,
    encounterId: encounter.id,
    encounterName: encounter.name,
    reward: encounter.reward,
    turn: 1,
    over: false,
    outcome: null, // 'win' | 'loss' | 'fled'
    pendingReplace: false,
    player: { team: chimeras.map((c) => combatantFromChimera(c, content, now)), active: 0 },
    enemy: { queue: encounter.waves.slice(1), active: combatantFromUnit(content.enemies[encounter.waves[0]]) },
    log: [],
  };
  battle.log.push(`${encounter.name}: ${content.enemies[encounter.waves[0]].name} moves in!`);
  const first = battle.player.team[0];
  if (first.rejection) battle.log.push(`${first.name} is unsettled — Rejection saps its power and speed.`);
  return battle;
}

export function playerActive(battle) {
  return battle.player.team[battle.player.active];
}

export function livingBench(battle) {
  return battle.player.team
    .map((c, i) => ({ c, i }))
    .filter(({ c, i }) => c.hp > 0 && i !== battle.player.active);
}

// Legal actions for the UI and the harness. Rest is always available.
export function playerActions(battle) {
  if (battle.over) return [];
  const me = playerActive(battle);
  if (battle.pendingReplace) {
    return livingBench(battle).map(({ c, i }) => ({ type: 'switch', index: i, label: `Send ${c.name}` }));
  }
  if (me.status.charging != null) {
    return [{ type: 'release', label: `Unleash ${me.moves[me.status.charging].name}` }];
  }
  const actions = me.moves
    .map((m, i) => ({ type: 'move', index: i, label: m.name, cost: m.cost, disabled: m.cost > me.stamina }))
    .filter((a) => !a.disabled);
  actions.push({ type: 'rest', label: 'Catch Breath' });
  const trapped = me.status.trapped;
  if (!trapped) {
    for (const { c, i } of livingBench(battle)) actions.push({ type: 'switch', index: i, label: `Switch to ${c.name}` });
    actions.push({ type: 'flee', label: 'Tactical Scamper' });
  }
  return actions;
}

// --- Resolution ---------------------------------------------------------

function tagMultiplier(moveTags, defenderTags, chart) {
  let mult = 1;
  let ignoreArmor = false;
  for (const rule of chart) {
    if (moveTags.includes(rule.attack) && defenderTags.includes(rule.defender)) {
      if (rule.rule === 'ignoreArmor') ignoreArmor = true;
      else mult *= rule.mult;
    }
  }
  return { mult, ignoreArmor };
}
export { tagMultiplier }; // exposed for tests and the M4.5 harness

function attack(battle, atk, def, move, events, content) {
  atk.stamina = Math.max(0, atk.stamina - move.cost);

  const hitChance = (move.acc / 100) * stageMult(atk.stages.acc) / stageMult(def.stages.evasion);
  if (roll(battle) > hitChance) {
    events.push(`${atk.name} uses ${move.name} — it whiffs spectacularly!`);
    return;
  }

  const { mult, ignoreArmor } = tagMultiplier(move.tags, def.tags, content.tagChart);
  if (move.power > 0 && mult === 0) {
    events.push(`${atk.name} uses ${move.name} — it has no effect on ${def.name}. (${chartNote(move.tags, def.tags, content)})`);
  } else if (move.power > 0) {
    let dmg = move.power * (0.55 + atk.power / 60) * stageMult(atk.stages.power) * mult;
    dmg *= 0.9 + 0.2 * roll(battle);
    const bypassArmor = ignoreArmor || move.keywords.ignoreArmor;
    if (!bypassArmor) dmg -= def.armor * ARMOR_FACTOR;
    if (def.status.guard && !move.keywords.ignoreGuard) {
      dmg /= 2;
      events.push(`${def.name}'s guard absorbs half the blow.`);
    }
    dmg = Math.max(1, Math.round(dmg));
    def.hp = Math.max(0, def.hp - dmg);
    let line = `${atk.name} uses ${move.name} — ${dmg} damage`;
    if (mult > 1) line += ' (super effective!)';
    if (bypassArmor && def.armor > 0) line += ' (armor ignored!)';
    events.push(line + '.');
    if (def.status.sleep) {
      def.status.sleep = false;
      events.push(`${def.name} is rudely awakened.`);
    }
    if (move.keywords.recoil) {
      const r = Math.max(1, Math.round(dmg * move.keywords.recoil));
      atk.hp = Math.max(0, atk.hp - r);
      events.push(`${atk.name} takes ${r} recoil. Worth it. Probably.`);
    }
  } else {
    events.push(`${atk.name} uses ${move.name}.`);
  }

  const kw = move.keywords;
  if (kw.venom && def.hp > 0) {
    if (def.tags.includes('Vehicle')) events.push(`Venom drips off the chassis. Machines remain unimpressed.`);
    else {
      def.status.venom = Math.min(VENOM_CAP, def.status.venom + kw.venom);
      events.push(`${def.name} is envenomed (${def.status.venom} stack${def.status.venom > 1 ? 's' : ''}).`);
    }
  }
  if (kw.stun && def.hp > 0 && roll(battle) < kw.stun) {
    def.status.stun = true;
    events.push(`${def.name} is seeing cartoon birdies — stunned!`);
  }
  if (kw.sleep && def.hp > 0) {
    if (def.tags.includes('Vehicle')) events.push(`${def.name} has no bedtime. The dart pings off.`);
    else if (roll(battle) < kw.sleep) {
      def.status.sleep = true;
      events.push(`${def.name} falls asleep mid-shift.`);
    }
  }
  if (kw.trap && def.hp > 0) {
    def.status.trapped = true;
    events.push(`${def.name} is trapped — no switching out!`);
  }
  if (kw.guard) {
    atk.status.guard = true;
    events.push(`${atk.name} braces behind a guard.`);
  }
  if (kw.accUp) { atk.stages.acc = Math.min(STAGE_CAP, atk.stages.acc + kw.accUp); events.push(`${atk.name}'s accuracy sharpens.`); }
  if (kw.accDown && def.hp > 0) { def.stages.acc = Math.max(-STAGE_CAP, def.stages.acc - kw.accDown); events.push(`${def.name}'s accuracy drops.`); }
  if (kw.powerUp) { atk.stages.power = Math.min(STAGE_CAP, atk.stages.power + kw.powerUp); events.push(`${atk.name} flexes menacingly — power up!`); }
  if (kw.powerDown && def.hp > 0) { def.stages.power = Math.max(-STAGE_CAP, def.stages.power - kw.powerDown); events.push(`${def.name}'s power wilts.`); }
  if (kw.evasionUp) { atk.stages.evasion = Math.min(STAGE_CAP, atk.stages.evasion + kw.evasionUp); events.push(`${atk.name} gets slippery — evasion up!`); }
  if (kw.staminaRestore) { atk.stamina = Math.min(atk.staminaMax, atk.stamina + kw.staminaRestore); events.push(`${atk.name} recovers ${kw.staminaRestore} stamina.`); }
  if (kw.heal) {
    const h = Math.round(atk.maxHp * kw.heal);
    atk.hp = Math.min(atk.maxHp, atk.hp + h);
    events.push(`${atk.name} patches up ${h} HP.`);
  }
  if (kw.knockback && def.hp > 0) knockback(battle, def, events, content);
}

function chartNote(moveTags, defTags, content) {
  for (const rule of content.tagChart) {
    if (rule.mult === 0 && moveTags.includes(rule.attack) && defTags.includes(rule.defender)) return rule.note;
  }
  return 'immune';
}

function knockback(battle, target, events, content) {
  if (target.kind === 'unit') {
    if (battle.enemy.queue.length === 0) {
      events.push(`${target.name} skids back but holds the line — no reinforcements to rotate in.`);
      return;
    }
    battle.enemy.queue.push(target.refId); // sent to the back, returns later
    const nextId = battle.enemy.queue.shift();
    battle.enemy.active = combatantFromUnit(content.enemies[nextId]);
    events.push(`${target.name} is punted out of formation! ${battle.enemy.active.name} scrambles in.`);
  } else {
    const bench = livingBench(battle);
    if (!bench.length) {
      events.push(`${target.name} staggers but has nowhere to go.`);
      return;
    }
    const swap = bench[Math.floor(roll(battle) * bench.length)];
    battle.player.active = swap.i;
    events.push(`${target.name} is sent tumbling! ${swap.c.name} is shoved onto the field.`);
  }
}

function actUnavailable(c, events) {
  if (c.status.sleep) {
    events.push(`${c.name} is fast asleep. Adorable. Tactically ruinous.`);
    return true;
  }
  if (c.status.stun) {
    c.status.stun = false;
    events.push(`${c.name} is stunned and loses the turn!`);
    return true;
  }
  return false;
}

function performMove(battle, side, moveIndex, events, content) {
  const atk = side === 'player' ? playerActive(battle) : battle.enemy.active;
  const def = side === 'player' ? battle.enemy.active : playerActive(battle);
  if (atk.hp <= 0) return;
  if (actUnavailable(atk, events)) return;
  atk.status.guard = false; // guard lasts until your next action

  const move = atk.moves[moveIndex];
  if (move.keywords.charge && atk.status.charging == null) {
    atk.status.charging = moveIndex;
    atk.stamina = Math.max(0, atk.stamina - Math.ceil(move.cost / 2));
    events.push(`${atk.name} winds up ${move.name} — something enormous is coming.`);
    return;
  }
  if (atk.status.charging != null) atk.status.charging = null;
  attack(battle, atk, def, move, events, content);
}

function enemyChooseMove(battle) {
  const e = battle.enemy.active;
  if (e.status.charging != null) return e.status.charging;
  const affordable = e.moves.map((m, i) => ({ m, i })).filter(({ m }) => m.cost <= e.stamina);
  if (!affordable.length) return -1; // rest
  // Mild preference for damage; setup moves get picked sometimes.
  const damaging = affordable.filter(({ m }) => m.power > 0);
  const pool = roll(battle) < 0.75 && damaging.length ? damaging : affordable;
  return pool[Math.floor(roll(battle) * pool.length)].i;
}

function endOfTurn(battle, events) {
  for (const c of [playerActive(battle), battle.enemy.active]) {
    if (c.hp <= 0) continue;
    if (c.status.venom > 0) {
      const v = c.status.venom * VENOM_TICK;
      c.hp = Math.max(0, c.hp - v);
      events.push(`Venom simmers: ${c.name} takes ${v}.`);
    }
    if (c.status.sleep && roll(battle) < 0.5) {
      c.status.sleep = false;
      events.push(`${c.name} wakes up, refreshed and furious.`);
    }
    c.stamina = Math.max(0, Math.min(c.staminaMax, c.stamina + c.regen));
    if (c.regen < 0) events.push(`${c.name} runs hot — stamina bleeds ${-c.regen}.`);
  }
  // A trap only holds while the trapper stands.
  if (battle.enemy.active.hp <= 0) playerActive(battle).status.trapped = false;
  if (playerActive(battle).hp <= 0) battle.enemy.active.status.trapped = false;
}

function handleEnemyKO(battle, events, content) {
  const e = battle.enemy.active;
  if (e.hp > 0) return;
  if (e.transformInto) {
    events.push(e.transformLine);
    battle.enemy.active = combatantFromUnit(content.enemies[e.transformInto]);
    events.push(`${battle.enemy.active.name} looms over the field!`);
    return;
  }
  events.push(e.koLine);
  if (battle.enemy.queue.length) {
    const nextId = battle.enemy.queue.shift();
    battle.enemy.active = combatantFromUnit(content.enemies[nextId]);
    events.push(`Next wave: ${battle.enemy.active.name}!`);
    playerActive(battle).status.trapped = false;
  } else {
    battle.over = true;
    battle.outcome = 'win';
    events.push(`Victory! The area is yours (pending paperwork).`);
  }
}

function handlePlayerKO(battle, events) {
  const me = playerActive(battle);
  if (me.hp > 0) return;
  events.push(`${me.name} is down — dramatic slow-motion flop!`);
  battle.enemy.active.status.trapped = false;
  if (livingBench(battle).length) {
    battle.pendingReplace = true;
    events.push(`Choose a replacement.`);
  } else {
    battle.over = true;
    battle.outcome = 'loss';
    events.push(`The team is out. Regroup at the lab — the Infirmary awaits.`);
  }
}

// One full round. `action` comes from playerActions().
export function step(battle, action, content) {
  if (battle.over) return [];
  const events = [];
  const me = playerActive(battle);

  // Free replacement after a KO — the enemy does not get a bonus turn.
  if (battle.pendingReplace) {
    if (action.type !== 'switch') return [];
    battle.player.active = action.index;
    battle.pendingReplace = false;
    events.push(`${playerActive(battle).name} takes the field!`);
    if (playerActive(battle).rejection) events.push(`${playerActive(battle).name} is unsettled — Rejection applies.`);
    battle.log.push(...events);
    return events;
  }

  // Obedience (§3.5): unsettled/unbonded chimeras sometimes freelance.
  let playerAction = action;
  if (action.type === 'move' && me.ignoreChance > 0 && roll(battle) < me.ignoreChance) {
    const affordable = me.moves.map((m, i) => ({ m, i })).filter(({ m }) => m.cost <= me.stamina);
    if (affordable.length) {
      const alt = affordable[Math.floor(roll(battle) * affordable.length)];
      events.push(`${me.name} ignores orders and improvises!`);
      playerAction = { type: 'move', index: alt.i };
    }
  }

  if (playerAction.type === 'flee') {
    battle.over = true;
    battle.outcome = 'fled';
    events.push(`You beat a tactical retreat. The kazoo plays taps.`);
    battle.log.push(...events);
    return events;
  }

  // Switching and resting resolve before moves (Pokémon convention).
  if (playerAction.type === 'switch') {
    battle.player.active = playerAction.index;
    events.push(`${me.name} tags out. ${playerActive(battle).name} takes the field!`);
  } else if (playerAction.type === 'rest') {
    if (!actUnavailable(me, events)) {
      me.status.guard = false;
      const gain = Math.round(me.staminaMax * REST_FRACTION);
      me.stamina = Math.min(me.staminaMax, me.stamina + gain);
      events.push(`${me.name} catches its breath: +${gain} stamina.`);
    }
  }

  const enemyMove = enemyChooseMove(battle);
  const playerMoves = playerAction.type === 'move' || playerAction.type === 'release';
  const playerMoveIndex = playerAction.type === 'release' ? playerActive(battle).status.charging : playerAction.index;

  if (playerMoves) {
    const pm = playerActive(battle).moves[playerMoveIndex];
    const em = enemyMove >= 0 ? battle.enemy.active.moves[enemyMove] : null;
    const pPri = (pm.keywords.priority ? 100 : 0) + playerActive(battle).speed;
    const ePri = (em?.keywords.priority ? 100 : 0) + battle.enemy.active.speed;
    const playerFirst = pPri > ePri || (pPri === ePri && roll(battle) < 0.5);

    // Bind each action to the combatant it was chosen for: if a KO or a
    // Knockback rotates in a replacement mid-round, the stale action is
    // dropped — fresh fighters don't inherit someone else's orders.
    const plannedPlayer = playerActive(battle);
    const plannedEnemy = battle.enemy.active;
    const order = playerFirst
      ? [['player', playerMoveIndex], ['enemy', enemyMove]]
      : [['enemy', enemyMove], ['player', playerMoveIndex]];
    for (const [side, idx] of order) {
      if (battle.over) break;
      const current = side === 'player' ? playerActive(battle) : battle.enemy.active;
      const planned = side === 'player' ? plannedPlayer : plannedEnemy;
      if (current !== planned) continue; // swapped in mid-round: needs a moment
      if (idx < 0) restCombatant(current, events);
      else performMove(battle, side, idx, events, content);
      handleEnemyKO(battle, events, content);
      handlePlayerKO(battle, events);
      if (battle.pendingReplace) break; // replacement happens before anything else
    }
  } else {
    // Player spent the turn on switch/rest — the enemy acts freely.
    if (enemyMove < 0) restCombatant(battle.enemy.active, events);
    else performMove(battle, 'enemy', enemyMove, events, content);
    handlePlayerKO(battle, events);
  }

  if (!battle.over && !battle.pendingReplace) {
    endOfTurn(battle, events);
    handleEnemyKO(battle, events, content);
    handlePlayerKO(battle, events);
  }
  battle.turn++;
  battle.log.push(...events);
  if (battle.log.length > 60) battle.log.splice(0, battle.log.length - 60);
  return events;
}

function restCombatant(c, events) {
  if (actUnavailable(c, events)) return;
  const gain = Math.round(c.staminaMax * REST_FRACTION);
  c.stamina = Math.min(c.staminaMax, c.stamina + gain);
  events.push(`${c.name} catches its breath: +${gain} stamina.`);
}

// Apply the outcome to the world: rewards, war record, and Law 1 —
// KO'd chimeras leave with Infirmary timers the ranch must absorb.
export function finishBattle(state, battle, content, now) {
  const injuries = [];
  for (const c of battle.player.team) {
    if (c.hp > 0) continue;
    const chimera = state.chimeras.find((ch) => ch.id === c.refId);
    if (!chimera) continue;
    const rng = rngStream(state.seed, 'injury', state.warRecord.wins + state.warRecord.losses + injuries.length);
    const hours = 2 + rng() * 2;
    chimera.injury = {
      name: pick(rng, INJURY_NAMES),
      until: now + Math.round(hours * 3600000),
    };
    injuries.push({ chimera: chimera.name, injury: chimera.injury });
  }
  if (battle.outcome === 'win') {
    state.funds += battle.reward;
    state.warRecord.wins++;
  } else {
    state.warRecord.losses++;
  }
  state.battle = null;
  return { outcome: battle.outcome, reward: battle.outcome === 'win' ? battle.reward : 0, injuries };
}

export function isInjured(chimera, now) {
  return !!chimera.injury && now < chimera.injury.until;
}
