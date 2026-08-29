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
const STAGE_CAP = 2; // setup matters, but stacking is not a strategy on its own
const ARMOR_FACTOR = 0.7;
const VENOM_TICK = 3;
const VENOM_CAP = 5;
const REST_FRACTION = 0.35;
const REJECTION_MULT = 0.75;
const GRADE_MOVE_BONUS = 0.12; // "upgraded abilities" — grades already scale stats, so this rides gently on top

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

// Obedience (§3.5): the only place player control wavers, and care fixes
// it — settling removes the big penalty, bond cancels instability.
export function obedienceIgnoreChance(chimera, now) {
  const settled = isSettled(chimera, now);
  return Math.max(
    0,
    Math.min(0.6, (settled ? 0 : 0.25) + ((chimera.instability ?? 0) / 100) * 0.2 - ((chimera.bond ?? 0) / 100) * 0.2)
  );
}

export function obediencePercent(chimera, now) {
  return Math.round((1 - obedienceIgnoreChance(chimera, now)) * 100);
}

// --- Combatant builders -------------------------------------------------

// Moves come from anatomy: every part with a move contributes one, grade
// sharpens it, and discovered combos add their own. Shared so a rival's
// chimera is built by exactly the same rules as the player's (§3.8).
export function movesFromTokens(tokens, report, content) {
  const moves = [];
  for (const token of tokens) {
    const part = content.parts[token.partId];
    if (!part?.move) continue; // passive or retired part — stats only
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
  return moves;
}

// A genome fielded by someone who isn't the player. Produces a record in
// the enemies.json unit shape, so combatantFromUnit and every downstream
// system (capture, containment, salvage, the arena) work unchanged — the
// only difference is that its numbers came from physiology, not a table.
export function unitFromGenome(spec, content) {
  const { id, name, frame, tokens, koLine, powerScale = 1, capturable = true } = spec;
  const report = analyze(frame, tokens, content);
  const scale = (n) => Math.max(1, Math.round(n * powerScale));
  return {
    id,
    name,
    hp: scale(report.stats.hp),
    power: scale(report.stats.power),
    armor: scale(report.stats.armor),
    speed: Math.max(1, Math.round(report.stats.speed)),
    stamina: scale(report.stats.stamina),
    regen: report.regenNet,
    tags: ['Organic', ...report.tags],
    class: report.creatureClass,
    moves: movesFromTokens(tokens, report, content),
    koLine: koLine ?? `${name} bows theatrically and is airlifted out by its own support staff.`,
    salvage: tokens.map((t) => t.partId),
    // Dismantling a rival's chimera yields the grades they actually raised,
    // which is the whole reason to fight one twice.
    salvageGrades: tokens.map((t) => t.grade),
    capturable,
    // The arena draws this one from its genome — no sprite table needed.
    genome: { frame, parts: Object.fromEntries(tokens.map((t) => [content.parts[t.partId].slot, t.partId])) },
    physiology: { instability: report.instability, sockets: tokens.length, purebred: report.purebredSpecies },
  };
}

// Waves may name a unit id or carry a generated unit record inline.
export function unitFor(content, ref) {
  return typeof ref === 'string' ? content.enemies[ref] : ref;
}

export function combatantFromChimera(chimera, content, now) {
  const tokens = Object.values(chimera.tokens);
  const report = analyze(chimera.frame, tokens, content);
  const settled = isSettled(chimera, now);
  const moves = movesFromTokens(tokens, report, content);

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
    creatureClass: report.creatureClass,
    moves,
    rejection: !settled,
    ignoreChance: obedienceIgnoreChance(chimera, now),
    stages: { acc: 0, evasion: 0, power: 0 },
    status: { venom: 0, sleep: false, stun: false, guard: false, charging: null },
  };
}

// An encounter without a tier fights at its authored stats — tier is opt-in,
// and tier 1 is a deliberately gentle tutorial band, not a default.
export function tierScaleFor(encounter, content) {
  if (encounter.rivalId || encounter.tier == null) return 1;
  return content.tierScale?.[encounter.tier] ?? 1;
}

// scale: the encounter's tier multiplier (see enemies.json tierScale). One
// authored roster covers the whole campaign — a Riot Squad at the Precinct is
// the same unit that patrolled the barn, three tiers of budget later.
export function combatantFromUnit(unit, scale = 1) {
  const up = (n) => Math.max(1, Math.round(n * scale));
  return {
    kind: 'unit',
    capturable: unit.capturable ?? !!unit.salvage?.length, // Containment Cannon targets
    refId: unit.id,
    name: unit.name,
    maxHp: up(unit.hp),
    hp: up(unit.hp),
    power: up(unit.power),
    armor: up(unit.armor),
    speed: unit.speed, // speed stays authored: the turn order is a design choice
    staminaMax: up(unit.stamina),
    stamina: up(unit.stamina),
    regen: unit.regen,
    tags: unit.tags,
    creatureClass: unit.class ?? null,
    moves: unit.moves.map((m) => ({ ...m })),
    koLine: unit.koLine,
    genome: unit.genome ?? null, // rival chimeras draw from anatomy, not a sprite table
    transformInto: unit.transformInto ?? null,
    transformLine: unit.transformLine ?? null,
    rejection: false,
    ignoreChance: 0,
    stages: { acc: 0, evasion: 0, power: 0 },
    status: { venom: 0, sleep: false, stun: false, guard: false, charging: null },
  };
}

// --- Event log ----------------------------------------------------------
// The engine resolves a whole round at once, but a player who presses one
// button and sees seven lines appear has not experienced a turn — they
// have experienced a receipt. So every event carries a SNAPSHOT of the
// battle at the instant it happened, and the UI replays them one beat at
// a time. The engine stays synchronous and DOM-free; the drama is the
// renderer's job.

const copyStatus = (s) => ({ ...s });

function sideOf(combatant) {
  return combatant.kind === 'chimera' ? 'player' : 'enemy';
}

function snapshot(battle) {
  const me = battle.player.team[battle.player.active];
  const foe = battle.enemy.active;
  const shot = (c) =>
    c && {
      name: c.name,
      hp: c.hp,
      maxHp: c.maxHp,
      stamina: c.stamina,
      staminaMax: c.staminaMax,
      status: copyStatus(c.status),
      stages: { ...c.stages },
      refId: c.refId,
      creatureClass: c.creatureClass ?? null,
      rejection: !!c.rejection,
    };
  return {
    turn: battle.turn,
    activeIndex: battle.player.active,
    player: shot(me),
    enemy: shot(foe),
    bench: battle.player.team.map((c) => ({ name: c.name, hp: c.hp, maxHp: c.maxHp })),
    wavesLeft: battle.enemy.queue.length,
    cannon: battle.cannon.charge,
    pendingReplace: battle.pendingReplace,
    over: battle.over,
    outcome: battle.outcome,
  };
}

// Accepts a plain string (most call sites) or an annotated event. Either
// way it lands as an object with text + snapshot.
function makeEvents(battle) {
  const list = [];
  return {
    list,
    get length() {
      return list.length;
    },
    push(entry) {
      const e = typeof entry === 'string' ? { text: entry } : { ...entry };
      e.kind ??= 'info';
      e.snap = snapshot(battle);
      list.push(e);
      return list.length;
    },
    texts() {
      return list.map((e) => e.text);
    },
  };
}

// Who acts first, for the pre-turn readout. Priority moves override speed,
// so this is the base forecast the UI shows before a move is chosen.
export function turnForecast(battle) {
  const me = battle.player.team[battle.player.active];
  const foe = battle.enemy.active;
  return {
    playerSpeed: me.speed,
    enemySpeed: foe.speed,
    playerFirst: me.speed > foe.speed,
    tied: me.speed === foe.speed,
  };
}

// --- Battle lifecycle ---------------------------------------------------

// context (optional): { kind: 'assault'|'rescue', nodeId, captiveId } —
// campaign metadata the aftermath resolver acts on. The engine itself
// only reads encounter data.
export function createBattle(chimeras, encounter, content, seed, now, context = {}) {
  const battle = {
    seed,
    rollCount: 0,
    encounterId: encounter.id,
    encounterName: encounter.name,
    reward: encounter.reward,
    context,
    turn: 1,
    over: false,
    outcome: null, // 'win' | 'loss' | 'fled'
    pendingReplace: false,
    cannon: { charge: 0 }, // Containment Cannon: charged by damage dealt
    captured: [], // unit ids bagged this battle
    // Generated units (rival chimeras) travel inline in the wave list;
    // index them so containment can resolve a refId after the fight.
    units: Object.fromEntries(
      encounter.waves.filter((w) => typeof w !== 'string').map((u) => [u.id, u])
    ),
    player: { team: chimeras.map((c) => combatantFromChimera(c, content, now)), active: 0 },
    enemy: { queue: encounter.waves.slice(1), active: combatantFromUnit(
        unitFor(content, encounter.waves[0]),
        tierScaleFor(encounter, content)
      ) },
    barks: { ...(encounter.barks ?? {}) }, // rival monologue slots (§3.8)
    // Rival chimeras arrive pre-scaled by their own powerScale, so tier
    // scaling applies only to the authored human roster.
    enemyScale: tierScaleFor(encounter, content),
    log: [],
  };
  if (battle.barks.intro) battle.log.push(`\u201c${battle.barks.intro}\u201d`);
  battle.log.push(`${encounter.name}: ${unitFor(content, encounter.waves[0]).name} moves in!`);
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
  // Containment Cannon: charged by restraint (damage without the KO),
  // fires only at weakened capturable targets (ROADMAP §3.6).
  const foe = battle.enemy.active;
  if (foe.capturable && battle.cannon.charge >= 100 && foe.hp > 0 && foe.hp <= foe.maxHp * 0.4) {
    actions.push({ type: 'capture', label: `Containment Cannon (${foe.name})` });
  }
  actions.push({ type: 'rest', label: 'Catch Breath' });
  const trapped = me.status.trapped;
  if (!trapped) {
    for (const { c, i } of livingBench(battle)) actions.push({ type: 'switch', index: i, label: `Switch to ${c.name}` });
    actions.push({ type: 'flee', label: 'Tactical Scamper' });
  }
  return actions;
}

// --- Resolution ---------------------------------------------------------

// Ground ≫ Water ≫ Air ≫ Ground. Unclassed neither exploits nor is exploited.
export function classMultiplier(atkClass, defClass, content) {
  if (!atkClass || !defClass || atkClass === defClass) return 1;
  const rules = content.classRules ?? { advantage: 1, disadvantage: 1 };
  if (content.classes?.[atkClass]?.beats === defClass) return rules.advantage;
  if (content.classes?.[defClass]?.beats === atkClass) return rules.disadvantage;
  return 1;
}

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

  const from = sideOf(atk);
  const at = sideOf(def);
  const hitChance = (move.acc / 100) * stageMult(atk.stages.acc) / stageMult(def.stages.evasion);
  if (roll(battle) > hitChance) {
    events.push({ text: `${atk.name} uses ${move.name} — it whiffs spectacularly!`, kind: 'miss', actor: from, target: at, move: move.name });
    return;
  }

  const { mult, ignoreArmor } = tagMultiplier(move.tags, def.tags, content.tagChart);
  if (move.power > 0 && mult === 0) {
    events.push({ text: `${atk.name} uses ${move.name} — it has no effect on ${def.name}. (${chartNote(move.tags, def.tags, content)})`, kind: 'immune', actor: from, target: at, move: move.name });
  } else if (move.power > 0) {
    const clsMult = classMultiplier(atk.creatureClass, def.creatureClass, content);
    let dmg = move.power * (0.55 + atk.power / 60) * stageMult(atk.stages.power) * mult * clsMult;
    dmg *= 0.9 + 0.2 * roll(battle);
    const bypassArmor = ignoreArmor || move.keywords.ignoreArmor;
    if (!bypassArmor) dmg -= def.armor * ARMOR_FACTOR;
    if (def.status.guard && !move.keywords.ignoreGuard) {
      dmg /= 2;
      events.push(`${def.name}'s guard absorbs half the blow.`);
    }
    dmg = Math.max(1, Math.round(dmg));
    def.hp = Math.max(0, def.hp - dmg);
    if (atk.kind === 'chimera' && def.hp > 0) {
      // Restraint charges the cannon: damage dealt WITHOUT finishing.
      battle.cannon.charge = Math.min(100, battle.cannon.charge + Math.round(dmg * 1.25));
    }
    let line = `${atk.name} uses ${move.name} — ${dmg} damage`;
    if (mult > 1) line += ' (super effective!)';
    if (clsMult > 1) line += ` (${content.classes[atk.creatureClass].name} beats ${content.classes[def.creatureClass].name}!)`;
    else if (clsMult < 1) line += ` (${content.classes[def.creatureClass].name} shrugs off ${content.classes[atk.creatureClass].name})`;
    if (bypassArmor && def.armor > 0) line += ' (armor ignored!)';
    events.push({
      text: line + '.',
      kind: 'damage',
      actor: from,
      target: at,
      move: move.name,
      amount: dmg,
      mult: mult * clsMult,
      classMult: clsMult,
      tagMult: mult,
    });
    if (def.status.sleep) {
      def.status.sleep = false;
      events.push({ text: `${def.name} is rudely awakened.`, kind: 'status', target: at });
    }
    if (move.keywords.recoil) {
      const r = Math.max(1, Math.round(dmg * move.keywords.recoil));
      atk.hp = Math.max(0, atk.hp - r);
      events.push({ text: `${atk.name} takes ${r} recoil. Worth it. Probably.`, kind: 'damage', actor: from, target: from, amount: r, recoil: true, mult: 1 });
    }
  } else {
    events.push({ text: `${atk.name} uses ${move.name}.`, kind: 'setup', actor: from, target: at, move: move.name });
  }

  const kw = move.keywords;
  if (kw.venom && def.hp > 0) {
    if (def.tags.includes('Vehicle')) events.push(`Venom drips off the chassis. Machines remain unimpressed.`);
    else {
      def.status.venom = Math.min(VENOM_CAP, def.status.venom + kw.venom);
      events.push({ text: `${def.name} is envenomed (${def.status.venom} stack${def.status.venom > 1 ? 's' : ''}).`, kind: 'debuff', target: at });
    }
  }
  if (kw.stun && def.hp > 0 && roll(battle) < kw.stun) {
    def.status.stun = true;
    events.push({ text: `${def.name} is seeing cartoon birdies — stunned!`, kind: 'debuff', target: at });
  }
  if (kw.sleep && def.hp > 0) {
    if (def.tags.includes('Vehicle')) events.push(`${def.name} has no bedtime. The dart pings off.`);
    else if (roll(battle) < kw.sleep) {
      def.status.sleep = true;
      events.push({ text: `${def.name} falls asleep mid-shift.`, kind: 'debuff', target: at });
    }
  }
  if (kw.trap && def.hp > 0) {
    def.status.trapped = true;
    events.push({ text: `${def.name} is trapped — no switching out!`, kind: 'debuff', target: at });
  }
  if (kw.guard) {
    atk.status.guard = true;
    events.push({ text: `${atk.name} braces behind a guard.`, kind: 'buff', target: from });
  }
  if (kw.accUp) { atk.stages.acc = Math.min(STAGE_CAP, atk.stages.acc + kw.accUp); events.push({ text: `${atk.name}'s accuracy sharpens.`, kind: 'buff', target: from }); }
  if (kw.accDown && def.hp > 0) { def.stages.acc = Math.max(-STAGE_CAP, def.stages.acc - kw.accDown); events.push({ text: `${def.name}'s accuracy drops.`, kind: 'debuff', target: at }); }
  if (kw.powerUp) { atk.stages.power = Math.min(STAGE_CAP, atk.stages.power + kw.powerUp); events.push({ text: `${atk.name} flexes menacingly — power up!`, kind: 'buff', target: from }); }
  if (kw.powerDown && def.hp > 0) { def.stages.power = Math.max(-STAGE_CAP, def.stages.power - kw.powerDown); events.push({ text: `${def.name}'s power wilts.`, kind: 'debuff', target: at }); }
  if (kw.evasionUp) { atk.stages.evasion = Math.min(STAGE_CAP, atk.stages.evasion + kw.evasionUp); events.push({ text: `${atk.name} gets slippery — evasion up!`, kind: 'buff', target: from }); }
  if (kw.staminaRestore) { atk.stamina = Math.min(atk.staminaMax, atk.stamina + kw.staminaRestore); events.push({ text: `${atk.name} recovers ${kw.staminaRestore} stamina.`, kind: 'buff', target: from }); }
  if (kw.heal) {
    const h = Math.round(atk.maxHp * kw.heal);
    atk.hp = Math.min(atk.maxHp, atk.hp + h);
    events.push({ text: `${atk.name} patches up ${h} HP.`, kind: 'heal', target: from, amount: h });
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
      events.push({ text: `${target.name} skids back but holds the line — no reinforcements to rotate in.`, kind: 'info' });
      return;
    }
    // Re-queue by whatever the wave list uses: a roster id, or the whole
    // generated record for a rival chimera that has no enemies.json entry.
    battle.enemy.queue.push(battle.units?.[target.refId] ?? target.refId);
    const nextId = battle.enemy.queue.shift();
    battle.enemy.active = combatantFromUnit(unitFor(content, nextId), battle.enemyScale);
    events.push({ text: `${target.name} is punted out of formation! ${battle.enemy.active.name} scrambles in.`, kind: 'waveIn', target: 'enemy' });
  } else {
    const bench = livingBench(battle);
    if (!bench.length) {
      events.push({ text: `${target.name} staggers but has nowhere to go.`, kind: 'info' });
      return;
    }
    const swap = bench[Math.floor(roll(battle) * bench.length)];
    battle.player.active = swap.i;
    events.push({ text: `${target.name} is sent tumbling! ${swap.c.name} is shoved onto the field.`, kind: 'waveIn', target: 'player' });
  }
}

function actUnavailable(c, events) {
  if (c.status.sleep) {
    events.push({ text: `${c.name} is fast asleep. Adorable. Tactically ruinous.`, kind: 'blocked', target: sideOf(c) });
    return true;
  }
  if (c.status.stun) {
    c.status.stun = false;
    events.push({ text: `${c.name} is stunned and loses the turn!`, kind: 'blocked', target: sideOf(c) });
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
    events.push({ text: `${atk.name} winds up ${move.name} — something enormous is coming.`, kind: 'charge', actor: sideOf(atk), move: move.name });
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
      events.push({ text: `Venom simmers: ${c.name} takes ${v}.`, kind: 'damage', target: sideOf(c), amount: v, dot: true, mult: 1 });
    }
    if (c.status.sleep && roll(battle) < 0.5) {
      c.status.sleep = false;
      events.push({ text: `${c.name} wakes up, refreshed and furious.`, kind: 'status', target: sideOf(c) });
    }
    c.stamina = Math.max(0, Math.min(c.staminaMax, c.stamina + c.regen));
    if (c.regen < 0) events.push({ text: `${c.name} runs hot — stamina bleeds ${-c.regen}.`, kind: 'debuff', target: sideOf(c) });
  }
  // A trap only holds while the trapper stands.
  if (battle.enemy.active.hp <= 0) playerActive(battle).status.trapped = false;
  if (playerActive(battle).hp <= 0) battle.enemy.active.status.trapped = false;
}

function handleEnemyKO(battle, events, content) {
  const e = battle.enemy.active;
  if (e.hp > 0) return;
  if (e.transformInto) {
    events.push({ text: e.transformLine, kind: 'ko', target: 'enemy' });
    battle.enemy.active = combatantFromUnit(unitFor(content, e.transformInto), battle.enemyScale);
    events.push({ text: `${battle.enemy.active.name} looms over the field!`, kind: 'waveIn', target: 'enemy', transform: true });
    return;
  }
  events.push({ text: e.koLine, kind: 'ko', target: 'enemy' });
  if (battle.enemy.queue.length === 1 && battle.barks?.midFight) {
    events.push(`\u201c${battle.barks.midFight}\u201d`);
    battle.barks.midFight = null; // once per fight
  }
  if (battle.enemy.queue.length) {
    const nextId = battle.enemy.queue.shift();
    battle.enemy.active = combatantFromUnit(unitFor(content, nextId), battle.enemyScale);
    events.push({ text: `Next wave: ${battle.enemy.active.name}!`, kind: 'waveIn', target: 'enemy' });
    playerActive(battle).status.trapped = false;
  } else {
    battle.over = true;
    battle.outcome = 'win';
    if (battle.barks?.defeat) events.push({ text: `\u201c${battle.barks.defeat}\u201d`, kind: 'bark' });
    events.push({ text: `Victory! The area is yours (pending paperwork).`, kind: 'victory' });
  }
}

function handlePlayerKO(battle, events) {
  const me = playerActive(battle);
  if (me.hp > 0) return;
  events.push({ text: `${me.name} is down — dramatic slow-motion flop!`, kind: 'ko', target: 'player' });
  battle.enemy.active.status.trapped = false;
  if (livingBench(battle).length) {
    battle.pendingReplace = true;
    events.push({ text: `Choose a replacement.`, kind: 'prompt' });
  } else {
    battle.over = true;
    battle.outcome = 'loss';
    if (battle.barks?.victory) events.push({ text: `\u201c${battle.barks.victory}\u201d`, kind: 'bark' });
    events.push({ text: `The team is out. Regroup at the lab — the Infirmary awaits.`, kind: 'defeat' });
  }
}

// One full round. `action` comes from playerActions().
export function step(battle, action, content) {
  if (battle.over) return [];
  const events = makeEvents(battle);
  const me = playerActive(battle);

  // Free replacement after a KO — the enemy does not get a bonus turn.
  if (battle.pendingReplace) {
    if (action.type !== 'switch') return [];
    battle.player.active = action.index;
    battle.pendingReplace = false;
    events.push({ text: `${playerActive(battle).name} takes the field!`, kind: 'waveIn', target: 'player' });
    if (playerActive(battle).rejection) events.push({ text: `${playerActive(battle).name} is unsettled — Rejection applies.`, kind: 'debuff', target: 'player' });
    battle.log.push(...events.texts());
    return events.list;
  }

  // Obedience (§3.5): unsettled/unbonded chimeras sometimes freelance.
  let playerAction = action;
  if (action.type === 'move' && me.ignoreChance > 0 && roll(battle) < me.ignoreChance) {
    const affordable = me.moves.map((m, i) => ({ m, i })).filter(({ m }) => m.cost <= me.stamina);
    if (affordable.length) {
      const alt = affordable[Math.floor(roll(battle) * affordable.length)];
      events.push({ text: `${me.name} ignores orders and improvises!`, kind: 'disobey', target: 'player' });
      playerAction = { type: 'move', index: alt.i };
    }
  }

  if (playerAction.type === 'flee') {
    battle.over = true;
    battle.outcome = 'fled';
    events.push({ text: `You beat a tactical retreat. The kazoo plays taps.`, kind: 'flee' });
    battle.log.push(...events.texts());
    return events.list;
  }

  if (playerAction.type === 'capture') {
    const foe = battle.enemy.active;
    battle.cannon.charge = 0;
    battle.captured.push(foe.refId);
    events.push({ text: `THWOOMP. The Containment Cannon fires — ${foe.name} poofs into the impound queue!`, kind: 'capture', target: 'enemy' });
    me.status.trapped = false;
    if (battle.enemy.queue.length) {
      const nextId = battle.enemy.queue.shift();
      battle.enemy.active = combatantFromUnit(unitFor(content, nextId), battle.enemyScale);
      events.push({ text: `Next wave: ${battle.enemy.active.name}!`, kind: 'waveIn', target: 'enemy' });
    } else {
      battle.over = true;
      battle.outcome = 'win';
      if (battle.barks?.defeat) events.push({ text: `\u201c${battle.barks.defeat}\u201d`, kind: 'bark' });
      events.push({ text: `Victory! The area is yours (pending paperwork).`, kind: 'victory' });
    }
    battle.turn++;
    battle.log.push(...events.texts());
    return events.list;
  }

  // Switching and resting resolve before moves (Pokémon convention).
  if (playerAction.type === 'switch') {
    battle.player.active = playerAction.index;
    events.push({ text: `${me.name} tags out. ${playerActive(battle).name} takes the field!`, kind: 'waveIn', target: 'player' });
  } else if (playerAction.type === 'rest') {
    if (!actUnavailable(me, events)) {
      me.status.guard = false;
      const gain = Math.round(me.staminaMax * REST_FRACTION);
      me.stamina = Math.min(me.staminaMax, me.stamina + gain);
      events.push({ text: `${me.name} catches its breath: +${gain} stamina.`, kind: 'rest', target: 'player' });
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
  battle.log.push(...events.texts());
  if (battle.log.length > 60) battle.log.splice(0, battle.log.length - 60);
  return events.list;
}

function restCombatant(c, events) {
  if (actUnavailable(c, events)) return;
  const gain = Math.round(c.staminaMax * REST_FRACTION);
  c.stamina = Math.min(c.staminaMax, c.stamina + gain);
  events.push({ text: `${c.name} catches its breath: +${gain} stamina.`, kind: 'rest', target: sideOf(c) });
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
