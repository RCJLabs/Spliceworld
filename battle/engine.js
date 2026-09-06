// Battle engine (M4). Pokémon structure: one active fighter per side, a
// bench, switching costs the turn. DOM-free and fully seeded — the M4.5
// balance harness replays battles headless from the same code. The battle
// object is plain serializable state; a mid-battle save/reload continues
// deterministically (rolls derive from seed + rollCount).

import { rngStream, pick } from '../util/rng.js';
import { chooseMoveIndex, skillFor } from './ai.js';
import { levelOf, levelMult, grantBattleXp } from './veterancy.js';
import { analyze } from '../splice/physiology.js';
import { GRADE_INDEX, gradeIndexOf } from '../splice/extract.js';
import { isSettled } from '../splice/theater.js';
import { perksOf, driftFromBattle } from '../splice/temperament.js';
import { flatModifiers, scarEffects, againstTags } from '../splice/scars.js';
import { infirmaryGrants } from '../splice/facility.js';
import { MOVE_SLOTS, activeMoves, defaultPick, partMoveId, comboMoveId } from './moves.js';
// R81 — what a creature IS now lives next door (battle/statblock.js), so the
// eight modules that only ever needed that can have it without this file.
import {
  obedienceIgnoreChance, movesFromTokens, unitFromGenome, applySetBonus, applyInjury, isInjured,
} from './statblock.js';
import { hitReason } from '../campaign/matchup.js';
import { classOf } from '../data/catalog.js';

const STAGE_STEP = 0.15;
const STAGE_CAP = 2; // setup matters, but stacking is not a strategy on its own
const ARMOR_FACTOR = 0.7;
const FRENZY_SCALE = 0.8; // Frenzy at the target's last sliver: +80% damage
const RAGE_SCALE = 0.6;   // Rage at the user's last sliver: +60%
const BLEED_CAP = 4;
const BLEED_TICK = 4;
const REGEN_TURNS = 3;
const TAUNT_TURNS = 2;
const VENOM_TICK = 3;
const VENOM_CAP = 5;
const REJECTION_MULT = 0.75;

// R103 — bracing and the counter-switch, priced in data/stance.json. The
// defaults mirror that file exactly and smoke holds them equal: the data
// wins, so a default that disagrees is a lie waiting for somebody to retune
// one of them (R9's rule, learned in contest.js and paid for again in R87).
const STANCE_DEFAULTS = { absorb: 0.45, stamina: 0.35, counterPower: 1, braceCost: 0.25 };

export function stanceTuning(content) {
  return { ...STANCE_DEFAULTS, ...(content?.stanceMeta ?? {}) };
}

// One rule in one place. The absorb was written out three times — in the
// preview, in the per-hit loop and in the line that announces it — so the
// number the player was shown and the number that landed agreed only by
// everybody remembering to edit all three (R61).
function guardAbsorb(def, content) {
  return stanceTuning(content).absorb * (1 - (def.perks?.guardLoss ?? 0));
}

// The stance's sentences, in data with its numbers. They were written out
// here as literals in the first draft and `stance.json` carried a `lines`
// block nobody read — content that says one thing and an engine that says
// another, which is the exact shape of the bug R9's rule exists to stop.
// The defaults mirror the file; smoke holds them equal.
const STANCE_LINES = {
  brace: '{name} sets its feet and braces — {cost} stamina spent standing still.',
  breath: '{name} catches its breath: +{gain} stamina.',
  absorbed: "{name}'s guard absorbs {pct}% of the blow.",
  counter: '{name} comes in on the turn and lands one for free.',
  braceLive: 'Take {pct}% off {move} — costs {cost} stamina',
  braceIdle: 'Nothing to brace against — catch your breath for +{gain}',
  braceThrough: '{move} goes straight through a guard — this is stamina only, +{gain}',
  braceHeld: 'Braced last turn — this one is stamina only, +{gain}',
  braceSpent: 'Not enough stamina to hold a brace — catch your breath for +{gain}',
  braceNothingLeft: 'Nothing left to swing — catch your breath for +{gain}',
};

export function stanceLine(content, key, vars = {}) {
  const raw = content?.stanceLines?.[key] ?? STANCE_LINES[key] ?? '';
  return raw.replace(/\{(\w+)\}/g, (whole, k) => (vars[k] === undefined ? whole : String(vars[k])));
}

// R103 — WHAT THE BRACE BUTTON IS ABOUT TO DO, worked out once. `step`
// resolves this and the arena quotes it, so the promise on the button and
// the thing that happens cannot drift. They did: the first tooltip said
// "and get stamina back" about a brace that SPENDS a quarter of it, because
// two places were describing one rule (R61 — hand-copy a predicate and the
// canonical one becomes the orphan).
//
// It is HANDED the intent rather than reading it, because `step` consumes
// and clears the field before the rest branch runs; asking again in here
// would plan a second commitment and resolve the turn against the wrong one.
//
// The three conditions, and why each is a condition:
//   - A TELEGRAPH. No telegraph, no brace: the stamina is still there, but
//     standing ready for nothing is the old trap wearing the new name.
//   - SOMETHING ELSE IT COULD HAVE DONE. A creature with nothing affordable
//     left is not making a read, it is catching its breath because that is
//     all there is — and granting the guard there hands free mitigation to
//     exactly the fight A1 built the game's first wall out of. Measured: it
//     lifted one chimera against three bodies from ~0% to 8%, out of "not
//     survivable" and into "losing", which is the Path's own reason for
//     telling a new player to bring three. Bracing is a decision;
//     exhaustion is not.
//   - NOT TWICE RUNNING. A brace is a read of one telegraphed blow; held
//     every turn it stops being a read and becomes 45% permanent mitigation,
//     which compounds hardest in exactly the longest fights. Measured:
//     without this the best mono-build strolls the finale at 77% against a
//     ceiling of 75 that exists to stop any single anatomy owning it.
export function bracePreview(me, intent, content) {
  if (!me) return null;
  const stance = stanceTuning(content);
  const cost = Math.round(me.staminaMax * stance.braceCost);
  const gain = Math.round(me.staminaMax * stance.stamina);
  const telegraphed = !!intent && intent.index >= 0;
  const couldHaveAttacked = me.moves.some((mv) => mv.cost <= me.stamina);
  const braced = telegraphed && couldHaveAttacked && me.stamina >= cost && !me.status.justBraced;
  // Why it will not, in the order the engine checks — this is the sentence
  // the button shows when it is not lit. `unguardable` is deliberately NOT
  // one of them: the creature still braces against a move that ignores
  // guards (and still pays), so the button says so rather than pretending
  // the turn is free.
  const why = braced ? null
    : !telegraphed ? 'braceIdle'
      : !couldHaveAttacked ? 'braceNothingLeft'
        : me.stamina < cost ? 'braceSpent'
          : 'braceHeld';
  return {
    braced, cost, gain, why,
    absorb: guardAbsorb(me, content),
    unguardable: !!intent?.ignoreGuard,
  };
}

// The one sentence the Brace button carries, built from the same preview
// `step` resolves. A tooltip is a promise; this is where it is kept.
export function braceTitle(me, intent, content) {
  const p = bracePreview(me, intent, content);
  if (!p) return '';
  if (!p.braced) return stanceLine(content, p.why, { gain: p.gain });
  if (p.unguardable) return stanceLine(content, 'braceThrough', { move: intent.name, gain: p.gain });
  return stanceLine(content, 'braceLive', {
    pct: Math.round(p.absorb * 100), move: intent.name, cost: p.cost,
  });
}

// A combatant with no temperament — every enemy unit, and any chimera
// still settling — behaves exactly as it did before §3.5 landed.
const NEUTRAL_PERKS = { critChance: 0, critMult: 1.5, lastStandAt: 0.3, evasion: 0, power: 0, guardLoss: 0, regen: 0 };


function stageMult(stage) {
  return 1 + STAGE_STEP * Math.max(-STAGE_CAP, Math.min(STAGE_CAP, stage));
}

function roll(battle) {
  return rngStream(battle.seed, 'roll', battle.rollCount++)();
}


// Waves may name a unit id or carry a generated unit record inline.
export function unitFor(content, ref) {
  return (typeof ref === 'string' ? content.enemies[ref] : ref) ?? null;
}

// R79 — a wave list outlives the roster it names.
//
// Wave lists live in three places a build cannot reach: enemies.json's own
// encounters, a gauntlet stage, and — the one that matters — `battle.queue`
// inside a SAVE, serialized mid-fight. Retire a unit and every one of the
// five `combatantFromUnit(unitFor(...))` sites read `.capturable` off
// undefined, which is not one lost row: it is the whole battle path, the
// campaign walk and the balance harness, down together.
//
// The opposition does not simply vanish, because a wave that evaporates
// hands the player a fight they did not win. Something shows up. It is
// unmarked, it is not on any roster, and it carries no salvage, so nothing
// downstream can be paid out for a unit that no longer exists.
export const ABSENT_UNIT = Object.freeze({
  id: 'unmarked_van',
  name: 'Unmarked Van',
  hp: 1, power: 1, armor: 0, speed: 5, stamina: 10, regen: 1,
  tags: [],
  moves: [{ name: 'Idle Menacingly', power: 1, cost: 0, acc: 100, tags: [], keywords: {} }],
  koLine: 'The van reverses at speed. Nobody was ever inside it. There was never a van.',
  // Procedural, like everything else that draws: a blank shape list renders
  // an empty box in the arena, and an empty box is not an explanation.
  shapes: [
    { type: 'rect', x: -62, y: -34, width: 124, height: 56, rx: 10, fill: '#b9bcc2' },
    { type: 'rect', x: -62, y: -34, width: 46, height: 30, rx: 7, fill: '#8f959e' },
    { type: 'rect', x: -18, y: -8, width: 66, height: 4, rx: 2, fill: '#8f959e' },
    { type: 'circle', cx: -38, cy: 24, r: 15, fill: '#2b2440' },
    { type: 'circle', cx: 38, cy: 24, r: 15, fill: '#2b2440' },
    { type: 'circle', cx: -38, cy: 24, r: 6, fill: '#b9bcc2' },
    { type: 'circle', cx: 38, cy: 24, r: 6, fill: '#b9bcc2' },
  ],
  salvage: [],
});

// Every reader that must produce a combatant NOW goes through here. The
// ones that can decline instead — the launchers, the briefing, the gauntlet
// board — call `unitFor` and drop the wave, so a healthy build never meets
// the van.
export function combatantFor(content, ref, scale = 1) {
  return combatantFromUnit(unitFor(content, ref) ?? ABSENT_UNIT, scale);
}

// The wave list, minus whatever the build no longer has. An encounter left
// with nothing at all is not offered — that is the caller's call, and every
// caller of this checks the length.
export function liveWaves(waves, content) {
  return (waves ?? []).filter((w) => unitFor(content, w));
}

export function combatantFromChimera(chimera, content, now) {
  const tokens = Object.values(chimera.tokens);
  const report = analyze(chimera.frame, tokens, content);
  const settled = isSettled(chimera, now);
  // R30: anatomy says what it KNOWS; the moveset says what it can press.
  // Four slots, combos included. A saved moveset is filtered against what
  // the genome still grants and topped up from the default pick, so a
  // re-splice or a lost part can never leave a creature with two buttons.
  const known = movesFromTokens(tokens, report, content);
  const moves = activeMoves(known, chimera.moveset);

  const debuff = settled ? 1 : REJECTION_MULT;
  // Scars that apply to everyone land on the stats here; the ones that
  // only apply to particular opponents ride along and are resolved when
  // the engine knows who is on the other side (§3.5).
  const flat = flatModifiers(chimera, content);
  // R41: veterancy. Level multiplies hp, power, armor and stamina — what a
  // creature has been through — and never speed, which is anatomy (mass and
  // lift priced it in A9/R32 and levels must not scramble the turn order
  // the body earned). Grades build the creature; levels season it.
  const vet = levelMult(levelOf(chimera.xp ?? 0, content), content);
  const combatant = {
    kind: 'chimera',
    refId: chimera.id,
    name: chimera.name,
    level: levelOf(chimera.xp ?? 0, content),
    maxHp: Math.round(report.stats.hp * vet),
    hp: Math.round(report.stats.hp * vet),
    power: Math.round(report.stats.power * debuff * vet),
    armor: Math.round(report.stats.armor * vet),
    speed: Math.max(1, Math.round(report.stats.speed * debuff) + flat.speed),
    staminaMax: Math.round(report.stats.stamina * vet),
    stamina: Math.round(report.stats.stamina * vet),
    regen: report.regenNet + flat.regen,
    tags: ['Organic', ...report.tags],
    creatureClass: report.creatureClass,
    moves,
    rejection: !settled,
    ignoreChance: obedienceIgnoreChance(chimera, now),
    // Temperament (§3.5): passive stat effects, never a loss of control.
    // Enemy units get the neutral set, so nothing about them changes.
    perks: perksOf(chimera, content),
    scars: scarEffects(chimera, content),
    stages: { acc: 0, evasion: 0, power: 0 },
    status: { venom: 0, bleed: 0, sleep: false, stun: false, guard: false, justBraced: false, charging: null, thorns: 0, regen: null, taunted: 0 },
  };
  return applySetBonus(combatant, report.purebredSpecies, content);
}

// An encounter without a tier fights at its authored stats — tier is opt-in,
// and tier 1 is a deliberately gentle tutorial band, not a default.
//
// `scaleOverride` lets a DERIVED encounter escalate continuously instead of
// stepping a whole tier. The authored ladder is deliberately lumpy (a tier
// is a band of content), which makes it the wrong dial for "the same fight,
// but harder": +1 tier on an already-top-tier boss is a wall, and +1 on a
// mid encounter is a shrug. Region contestation needs a knob it can turn a
// little, and turn again every time you hold the line.
export function tierScaleFor(encounter, content) {
  if (encounter.rivalId) return 1;
  if (encounter.scaleOverride != null) return encounter.scaleOverride;
  if (encounter.tier == null) return 1;
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
    // A unit built from a genome may carry a purebred set that granted
    // perks (unitFromGenome applies it there, because the unit record is
    // the enemies.json shape and has no combatant yet). Authored units have
    // none and get the neutral block exactly as before.
    perks: unit.perks ? { ...NEUTRAL_PERKS, ...unit.perks } : NEUTRAL_PERKS,
    scars: [],
    stages: { acc: 0, evasion: 0, power: 0 },
    status: { venom: 0, bleed: 0, sleep: false, stun: false, guard: false, justBraced: false, charging: null, thorns: 0, regen: null, taunted: 0 },
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
// What a move would do, with the dice taken out: the same arithmetic attack()
// runs, at mean variance and without the conditional crit. One source of
// truth for "what does this button do" — the AI reads it to choose, and the
// battle UI will read it to explain (R28). Deterministic, so calling it never
// disturbs the seeded stream.
// The exact mean of the engine's own Multi-Hit roll, `2 + floor(r * M)` with
// `M = max(1, N - 1)`. For an integer M that is uniform over [2, N] and the
// mean is (2 + N) / 2 — but N is scaled by grade and is routinely
// FRACTIONAL (the bat's Wing Beat is 3 in the data and 4.5 at Prime), so the
// expectation of the floor is what this computes. The old preview used
// `(2 + M) / 2`, which is exactly half a hit low for every integer N and
// 19.5% low on the bat, measured against the engine.
export function multiHitMean(n) {
  const m = Math.max(1, n - 1);
  const whole = Math.floor(m);
  const part = m - whole;
  return 2 + (whole * (whole - 1) / 2 + whole * part) / m;
}

// `turn` matters because the engine gives a Skittish defender an extra dodge
// on turn one (`jumpy`), and a preview that omits it told the player — and
// the AI — that an opening swing lands 92% of the time when it lands 64%.
// Null means "no turn context", which is only honest for a caller that has
// no battle; every caller in the game passes one, and smoke checks that.
export function previewMove(atk, def, move, content, turn = null) {
  const mine = againstTags(atk.scars, def.tags);
  const theirs = againstTags(def.scars, atk.tags);
  const locked = !!move.keywords.ignoreEvasion;
  const jumpy = turn === 1 ? (def.perks?.evasion ?? 0) : 0;
  const hitChance = Math.max(0, Math.min(1, locked
    ? (move.acc + mine.acc) / 100 * stageMult(atk.stages.acc)
    : ((move.acc + mine.acc) / 100) * stageMult(atk.stages.acc) / stageMult(def.stages.evasion) * (1 - jumpy) * (1 - theirs.evasion)));
  const { mult, ignoreArmor } = tagMultiplier(move.tags, def.tags, content.tagChart);
  const clsMult = classMultiplier(atk.creatureClass, def.creatureClass, content);
  if (!(move.power > 0) || mult === 0) {
    return { damage: 0, hitChance, lethal: false, tagMult: mult, classMult: clsMult, immune: move.power > 0 && mult === 0 };
  }
  const hits = move.keywords.multiHit ? multiHitMean(move.keywords.multiHit) : 1;
  let one = move.power * (0.55 + atk.power / 60) * stageMult(atk.stages.power) * mult * clsMult;
  one *= 1 + (atk.perks?.power ?? 0);
  one *= 1 + mine.power;
  one *= 1 - theirs.armor;
  if (move.keywords.frenzy) one *= 1 + FRENZY_SCALE * (1 - def.hp / Math.max(1, def.maxHp));
  if (move.keywords.rage) one *= 1 + RAGE_SCALE * (1 - atk.hp / Math.max(1, atk.maxHp));
  // A cornered Brave creature crits, and the preview used to say so nowhere
  // — measured 18.4% low on a Brave attacker at 10% health, which is a whole
  // extra swing the AI never counted and the player was never shown. The
  // crit is a roll, so it enters as its expectation, in the same place
  // attack() applies it.
  const cornered = atk.maxHp > 0 && atk.hp / atk.maxHp <= (atk.perks?.lastStandAt ?? 0);
  if (cornered && (atk.perks?.critChance ?? 0) > 0) {
    one *= 1 + atk.perks.critChance * ((atk.perks.critMult ?? 1) - 1);
  }
  if (!(ignoreArmor || move.keywords.ignoreArmor)) one -= def.armor * ARMOR_FACTOR;
  if (def.status.guard && !move.keywords.ignoreGuard) one *= 1 - guardAbsorb(def, content);
  // Rounded once at the end: `hits` is an expectation and can be fractional,
  // and a damage chip reading 98.57142857142857 is not a number anybody can
  // use. The per-hit round matches what attack() does to each strike.
  const damage = Math.round(Math.max(1, Math.round(one)) * hits);
  return { damage, hitChance, lethal: damage >= def.hp, tagMult: mult, classMult: clsMult, immune: false };
}

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

// A monologue line, attributed. Without a speaker the log is a row of
// anonymous quotation marks and the reader cannot tell who is gloating.
function barkLine(battle, who, line) {
  const speaker = battle.speakers?.[who];
  return speaker ? `${speaker}: \u201c${line}\u201d` : `\u201c${line}\u201d`;
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
    // R41: the authored wave count, for sizing xp — the queue is spent by
    // the time anyone asks.
    waveCount: encounter.waves.length,
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
    enemy: { queue: encounter.waves.slice(1), active: combatantFor(
        content,
        encounter.waves[0],
        tierScaleFor(encounter, content)
      ) },
    barks: { ...(encounter.barks ?? {}) }, // rival monologue slots (§3.8)
    // The player's half of the conversation, handed in by the caller. The
    // engine stays a data consumer: it emits whatever lines it was given
    // and has no opinion about who is talking or why.
    playerBarks: { ...(context.playerBarks ?? {}) },
    speakers: { ...(context.speakers ?? {}) },
    // Rival chimeras arrive pre-scaled by their own powerScale, so tier
    // scaling applies only to the authored human roster.
    enemyScale: tierScaleFor(encounter, content),
    // How well the opposition plays, fixed at the top of the fight so a
    // mid-battle reload resumes against the same opponent it started against.
    aiSkill: skillFor(encounter, content),
    log: [],
  };
  // Call, then response. A duel that is only ever monologued AT is a wall
  // of one-liners; two voices make it a scene. Kept as its own list as
  // well as in the log, because an opening exchange the player can only
  // find by opening the log overlay is an opening exchange nobody reads.
  battle.opening = [];
  if (battle.barks.intro) battle.opening.push(barkLine(battle, 'enemy', battle.barks.intro));
  if (battle.playerBarks.intro) battle.opening.push(barkLine(battle, 'player', battle.playerBarks.intro));
  battle.log.push(...battle.opening);
  // An em dash, not a colon: with barks now attributed as "Name: …", a
  // colon here made the wave announcement read as something the rival said.
  battle.log.push(`${encounter.name} — ${battle.enemy.active.name} moves in!`);
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
  // Taunted, the only things on the table are the ones that involve hitting
  // the creature waving at you. It never removes the CHOICE (§3.5 — that is
  // obedience's job and only obedience's), it removes the options that are
  // not fighting: no breather, no tagging out, no leaving.
  if (me.status.taunted > 0) {
    const swings = actions.filter((a) => a.type === 'move' && me.moves[a.index].power > 0);
    if (swings.length) return swings;
  }
  // R103 — it braces as well as breathes now, so it is named for the half
  // that decides fights. The old label described the half that never did.
  actions.push({ type: 'rest', label: 'Brace' });
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

function attack(battle, atk, def, move, events, content, powerScale = 1) {
  atk.stamina = Math.max(0, atk.stamina - move.cost);

  const from = sideOf(atk);
  const at = sideOf(def);
  // Scars that only mean something against a particular kind of opponent
  // resolve here, once the engine knows who is on the other side. This is
  // where "fears jeeps" becomes a number.
  const mine = againstTags(atk.scars, def.tags);
  const theirs = againstTags(def.scars, atk.tags);

  // Skittish creatures are hard to pin down on the opening exchange.
  const jumpy = battle.turn === 1 ? (def.perks?.evasion ?? 0) : 0;
  // Lock-On answers every way of not being there at once — the evasion
  // stage, a Skittish temperament, and a scar that taught it to duck.
  // Anything less and the keyword loses to whichever dodge it forgot.
  const locked = !!move.keywords.ignoreEvasion;
  const hitChance = locked
    ? (move.acc + mine.acc) / 100 * stageMult(atk.stages.acc)
    : ((move.acc + mine.acc) / 100) *
      stageMult(atk.stages.acc) /
      stageMult(def.stages.evasion) *
      (1 - jumpy) *
      (1 - theirs.evasion);
  if (roll(battle) > hitChance) {
    events.push({ text: `${atk.name} uses ${move.name} — it whiffs spectacularly!`, kind: 'miss', actor: from, target: at, move: move.name });
    return;
  }

  const { mult, ignoreArmor } = tagMultiplier(move.tags, def.tags, content.tagChart);
  if (move.power > 0 && mult === 0) {
    events.push({ text: `${atk.name} uses ${move.name} — it has no effect on ${def.name}. (${chartNote(move.tags, def.tags, content)})`, kind: 'immune', actor: from, target: at, move: move.name });
  } else if (move.power > 0) {
    const clsMult = classMultiplier(atk.creatureClass, def.creatureClass, content);
    // Brave: cornered, it starts landing telling blows.
    const cornered = atk.maxHp > 0 && atk.hp / atk.maxHp <= (atk.perks?.lastStandAt ?? 0);
    const crit = cornered && (atk.perks?.critChance ?? 0) > 0 && roll(battle) < atk.perks.critChance;
    const bypassArmor = ignoreArmor || move.keywords.ignoreArmor;
    // Multi-Hit strikes 2..N times at the move's LISTED power each, and every
    // strike runs the whole pipeline — armor included. That is the point of
    // the keyword rather than an oversight: a flurry is worse than one big
    // swing into plating and better into a bare target, so the data tunes it
    // by listing a small per-hit power.
    // multiHitMean() above is the exact expectation of this expression; the
    // suite Monte-Carlos this and compares, so the pair cannot drift.
    const hits = move.keywords.multiHit
      ? 2 + Math.floor(roll(battle) * Math.max(1, move.keywords.multiHit - 1))
      : 1;
    let dmg = 0;
    for (let hit = 0; hit < hits; hit++) {
      let one = move.power * powerScale * (0.55 + atk.power / 60) * stageMult(atk.stages.power) * mult * clsMult;
      one *= 0.9 + 0.2 * roll(battle);
      one *= 1 + (atk.perks?.power ?? 0); // Fierce
      one *= 1 + mine.power; // a scar that changed how it fights THESE
      one *= 1 - theirs.armor; // …and one that changed how it takes them
      // Frenzy reads the TARGET's blood in the water; Rage reads its own.
      // Two halves of the same idea, kept apart so a shark and a cornered
      // gorilla do not feel like the same creature.
      if (move.keywords.frenzy) one *= 1 + FRENZY_SCALE * (1 - def.hp / Math.max(1, def.maxHp));
      if (move.keywords.rage) one *= 1 + RAGE_SCALE * (1 - atk.hp / Math.max(1, atk.maxHp));
      if (crit) one *= atk.perks.critMult;
      if (!bypassArmor) one -= def.armor * ARMOR_FACTOR;
      if (def.status.guard && !move.keywords.ignoreGuard) one *= 1 - guardAbsorb(def, content);
      dmg += Math.max(1, Math.round(one));
    }
    if (def.status.guard && !move.keywords.ignoreGuard) {
      // A Fierce creature guards badly — it would rather be hitting.
      events.push(stanceLine(content, 'absorbed', {
        name: def.name, pct: Math.round(guardAbsorb(def, content) * 100),
      }));
    }
    def.hp = Math.max(0, def.hp - dmg);
    if (atk.kind === 'chimera' && def.hp > 0) {
      // Restraint charges the cannon: damage dealt WITHOUT finishing.
      battle.cannon.charge = Math.min(100, battle.cannon.charge + Math.round(dmg * 1.25));
    }
    let line = `${atk.name} uses ${move.name} — ${dmg} damage`;
    if (hits > 1) line += ` across ${hits} hits`;
    if (crit) line += ' — CORNERED AND FURIOUS!';
    if (mult > 1) line += ' (super effective!)';
    // R79 - the multiplier survives a retirement that the NAMES do not: a
    // class still named on an enemy record after it left classes.json makes
    // the chart read 1, but a class that BEATS it is still on the chart, so
    // this line runs with one of the two names missing. Print the clause
    // only when both classes can be named; the damage number is already
    // correct either way.
    const atkCls = classOf(content, atk.creatureClass);
    const defCls = classOf(content, def.creatureClass);
    if (atkCls && defCls) {
      if (clsMult > 1) line += ` (${atkCls.name} beats ${defCls.name}!)`;
      else if (clsMult < 1) line += ` (${defCls.name} shrugs off ${atkCls.name})`;
    }
    // R58: the reason, once per matchup per battle. The multiplier prints on
    // every hit and the sentence behind it would be noise repeated — but
    // never saying it at all is how four authored lines sat unread since the
    // triangle shipped. R37's rule: the lesson arrives at the wall it
    // explains, and only the first time you walk into it.
    const clsWhy = hitReason(atk.creatureClass, def.creatureClass, clsMult, content.classRules);
    const clsPair = clsWhy && (clsMult > 1
      ? `${atk.creatureClass}>${def.creatureClass}`
      : `${def.creatureClass}>${atk.creatureClass}`);
    const clsFirst = clsPair && !(battle.classSaid ??= []).includes(clsPair);
    if (clsFirst) battle.classSaid.push(clsPair);
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
    if (clsFirst) events.push({ text: clsWhy, kind: 'info' });
    if (def.status.sleep) {
      def.status.sleep = false;
      events.push({ text: `${def.name} is rudely awakened.`, kind: 'status', target: at });
    }
    if (move.keywords.recoil) {
      const r = Math.max(1, Math.round(dmg * move.keywords.recoil));
      atk.hp = Math.max(0, atk.hp - r);
      events.push({ text: `${atk.name} takes ${r} recoil. Worth it. Probably.`, kind: 'damage', actor: from, target: from, amount: r, recoil: true, mult: 1 });
    }
    // Thorns belongs to the DEFENDER, so it resolves here rather than in the
    // keyword block: whoever chose to touch the porcupine pays for it.
    if (def.status.thorns > 0 && atk.hp > 0) {
      const t = Math.max(1, Math.round(dmg * def.status.thorns));
      atk.hp = Math.max(0, atk.hp - t);
      events.push({ text: `${def.name} is covered in spines — ${atk.name} takes ${t} back.`, kind: 'damage', actor: at, target: from, amount: t, mult: 1 });
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
  // Bleed is Venom for things that do not breathe. The chart zeroes Venomous
  // against a chassis on purpose; a severed hydraulic line is the answer, so
  // this ticks on anything with hit points.
  if (kw.bleed && def.hp > 0) {
    def.status.bleed = Math.min(BLEED_CAP, (def.status.bleed ?? 0) + kw.bleed);
    events.push({ text: `${def.name} is leaking something. Oil, ichor, morale.`, kind: 'debuff', target: at });
  }
  if (kw.staminaDrain && def.hp > 0) {
    const d = Math.min(def.stamina, kw.staminaDrain);
    def.stamina -= d;
    atk.stamina = Math.min(atk.staminaMax, atk.stamina + Math.round(d / 2));
    events.push({ text: `${atk.name} siphons ${d} stamina off ${def.name}.`, kind: 'debuff', target: at });
  }
  if (kw.slow && def.hp > 0) {
    const before = def.speed;
    def.speed = Math.max(1, Math.round(def.speed * (1 - kw.slow)));
    if (def.speed < before) events.push({ text: `${def.name} bogs down — speed ${before} → ${def.speed}.`, kind: 'debuff', target: at });
  }
  if (kw.thorns) {
    atk.status.thorns = Math.max(atk.status.thorns ?? 0, kw.thorns);
    events.push({ text: `${atk.name} bristles. Touching it is now a decision.`, kind: 'buff', target: from });
  }
  if (kw.regen) {
    atk.status.regen = { amount: kw.regen, turns: REGEN_TURNS };
    events.push({ text: `${atk.name} starts knitting itself back together.`, kind: 'buff', target: from });
  }
  // Rally is the one keyword that reaches past the active fighter. The enemy
  // queue holds ids rather than combatants, so on that side it lands on the
  // active only — which is the honest reading of "the ones actually here".
  if (kw.rally) {
    const squad = from === 'player' ? battle.player.team.filter((c) => c.hp > 0) : [atk];
    for (const c of squad) c.stages.power = Math.min(STAGE_CAP, c.stages.power + kw.rally);
    events.push({ text: `${atk.name} rallies the whole outfit — everyone stands taller.`, kind: 'buff', target: from });
  }
  // Taunt does not take the turn away (§3.5: never remove player control) —
  // it takes the OPTIONS away. You may still choose, but only from the
  // things that involve hitting the creature waving at you.
  if (kw.taunt && def.hp > 0) {
    def.status.taunted = TAUNT_TURNS;
    events.push({ text: `${def.name} is thoroughly provoked and cannot think about anything else.`, kind: 'debuff', target: at });
  }
}

function chartNote(moveTags, defTags, content) {
  for (const rule of content.tagChart) {
    if (rule.mult === 0 && moveTags.includes(rule.attack) && defTags.includes(rule.defender)) return rule.note;
  }
  return 'immune';
}

// Knockback rotates the target's side, and the round loop then drops that
// side's planned action ("fresh fighters don't inherit someone else's
// orders"). That is correct for a KO, but for a rotation it handed a faster
// attacker an unbounded lock: Punt every turn, the defender is shoved aside
// every turn, and the defender never acts at all — measured at a 100% win
// turning into 11% off this one keyword, with the enemy taking zero damage
// across thirteen turns. So a side that was rotated last turn cannot be
// rotated again this turn. Knockback stays a real tempo move (it still costs
// the defender a full action) but it can no longer deny every action for the
// rest of the fight. Symmetric: it caps the player's own knockback too.
function knockedRecently(battle, side) {
  const last = battle.knockedAt?.[side];
  return last != null && battle.turn - last <= 1;
}
function markKnocked(battle, side) {
  battle.knockedAt = { ...(battle.knockedAt ?? {}), [side]: battle.turn };
}

function knockback(battle, target, events, content) {
  const side = target.kind === 'unit' ? 'enemy' : 'player';
  if (knockedRecently(battle, side)) {
    events.push({ text: `${target.name} digs in — no one is getting punted twice in a row.`, kind: 'info' });
    return;
  }
  if (target.kind === 'unit') {
    if (battle.enemy.queue.length === 0) {
      events.push({ text: `${target.name} skids back but holds the line — no reinforcements to rotate in.`, kind: 'info' });
      return;
    }
    // Re-queue by whatever the wave list uses: a roster id, or the whole
    // generated record for a rival chimera that has no enemies.json entry.
    battle.enemy.queue.push(battle.units?.[target.refId] ?? target.refId);
    const nextId = battle.enemy.queue.shift();
    battle.enemy.active = combatantFor(content, nextId, battle.enemyScale);
    markKnocked(battle, 'enemy');
    events.push({ text: `${target.name} is punted out of formation! ${battle.enemy.active.name} scrambles in.`, kind: 'waveIn', target: 'enemy' });
  } else {
    const bench = livingBench(battle);
    if (!bench.length) {
      events.push({ text: `${target.name} staggers but has nowhere to go.`, kind: 'info' });
      return;
    }
    const swap = bench[Math.floor(roll(battle) * bench.length)];
    battle.player.active = swap.i;
    markKnocked(battle, 'player');
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

// `powerScale` is R103's counter-switch hit: the same move, resolved by the
// same path, at a fraction of its power. A fraction rather than a second
// damage formula — the free hit has to obey armour, the class triangle, the
// tag chart and a guard exactly like every other blow in the game, or it is
// a special case that will disagree with the briefing the day somebody
// retunes one of them.
function performMove(battle, side, moveIndex, events, content, powerScale = 1) {
  const atk = side === 'player' ? playerActive(battle) : battle.enemy.active;
  const def = side === 'player' ? battle.enemy.active : playerActive(battle);
  if (atk.hp <= 0) return;
  if (actUnavailable(atk, events)) return;
  atk.status.guard = false; // guard lasts until your next action
  atk.status.justBraced = false; // …and a creature that acted is not turtling

  const move = atk.moves[moveIndex];
  if (move.keywords.charge && atk.status.charging == null) {
    atk.status.charging = moveIndex;
    atk.stamina = Math.max(0, atk.stamina - Math.ceil(move.cost / 2));
    events.push({ text: `${atk.name} winds up ${move.name} — something enormous is coming.`, kind: 'charge', actor: sideOf(atk), move: move.name });
    return;
  }
  if (atk.status.charging != null) atk.status.charging = null;
  attack(battle, atk, def, move, events, content, powerScale);
}

// The opposition thinks now (R22). How hard it thinks is the encounter's
// tier — a beat cop still flails, a Gen-2 response team does not — so the
// difficulty curve gains a dimension that costs no new content.
function enemyChooseMove(battle, content) {
  return chooseMoveIndex(
    battle, battle.enemy.active, playerActive(battle), content,
    battle.aiSkill ?? 0.5, () => roll(battle)
  );
}

// R103 — THE OPPOSITION COMMITS BEFORE YOU ANSWER.
//
// Measured first, and it moved the whole milestone: in a LIVE fight the
// arena already rewards play by 10-16 points over pressing the first button
// and by ~44 over mashing. What it did not offer was anything to play
// AGAINST. The enemy chose inside `step`, after the player had already
// committed, so every defensive option was a guess — you could not brace for
// a hit you had no way to see coming, and switching was a coin toss because
// the opposition simply re-aimed at whoever arrived.
//
// So the choice moves to the top of the turn and is written down. Three
// things follow, and they are the milestone: a telegraphed hit can be
// GUARDED, a telegraphed class can be ANSWERED by tagging in the creature
// that counters it, and neither is a guess any more.
//
// IT IS THE SAME AI. `chooseMoveIndex` is untouched — the opposition is no
// weaker for having said what it is doing, it simply says it first. The one
// real concession is that it no longer re-aims mid-turn: it plans against
// the creature standing in front of it, and a switch makes that plan stale.
// That IS the tempo the switch is buying, and it is why switching is worth
// a turn now when it was not before.
//
// Seeded like everything else, and stored on the battle so a reload resumes
// against the same intent it was showing when the app closed. Null is a
// legitimate state — an old save mid-fight, or a battle that is over — and
// every reader treats it as "not known yet" rather than "no move".
export function planIntent(battle, content) {
  if (!battle || battle.over) return null;
  const foe = battle.enemy?.active;
  const me = playerActive(battle);
  if (!foe || foe.hp <= 0 || !me) return null;
  const index = enemyChooseMove(battle, content);
  const move = index >= 0 ? foe.moves[index] : null;
  battle.intent = {
    index,
    name: move ? move.name : 'Catch Breath',
    power: move ? move.power : 0,
    tags: move ? [...(move.tags ?? [])] : [],
    // What a defender needs to decide: is it worth bracing for, and which
    // of my creatures is the wrong shape to receive it.
    creatureClass: foe.creatureClass ?? null,
    priority: !!move?.keywords?.priority,
    ignoreGuard: !!move?.keywords?.ignoreGuard,
  };
  return battle.intent;
}

// The intent for THIS turn, computed on demand. A save written before R103
// carries a battle with no intent at all, and a fight in flight must not be
// abandoned or restarted — so the first read plans one, exactly as the turn
// before it would have.
export function intentOf(battle, content) {
  if (!battle || battle.over) return null;
  if (battle.intent === undefined || battle.intent === null) return planIntent(battle, content);
  return battle.intent;
}

function endOfTurn(battle, events) {
  for (const c of [playerActive(battle), battle.enemy.active]) {
    if (c.hp <= 0) continue;
    if (c.status.venom > 0) {
      const v = c.status.venom * VENOM_TICK;
      c.hp = Math.max(0, c.hp - v);
      events.push({ text: `Venom simmers: ${c.name} takes ${v}.`, kind: 'damage', target: sideOf(c), amount: v, dot: true, mult: 1 });
    }
    if (c.status.bleed > 0) {
      const b = c.status.bleed * BLEED_TICK;
      c.hp = Math.max(0, c.hp - b);
      events.push({ text: `${c.name} is still leaking: ${b}.`, kind: 'damage', target: sideOf(c), amount: b, dot: true, mult: 1 });
    }
    if (c.status.regen) {
      const h = Math.max(1, Math.round(c.maxHp * c.status.regen.amount));
      c.hp = Math.min(c.maxHp, c.hp + h);
      events.push({ text: `${c.name} knits ${h} HP back.`, kind: 'heal', target: sideOf(c), amount: h });
      if (--c.status.regen.turns <= 0) c.status.regen = null;
    }
    if (c.status.taunted > 0) c.status.taunted -= 1;
    if (c.status.sleep && roll(battle) < 0.5) {
      c.status.sleep = false;
      events.push({ text: `${c.name} wakes up, refreshed and furious.`, kind: 'status', target: sideOf(c) });
    }
    // Gentle creatures pace themselves. Expressed as a share of the
    // stamina POOL rather than a flat number, so it means the same thing
    // to a small creature as to a large one.
    const calm = Math.round((c.perks?.regen ?? 0) * (c.staminaMax / 10));
    c.stamina = Math.max(0, Math.min(c.staminaMax, c.stamina + c.regen + calm));
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
    // A boss with no authored line still announces its second stage rather
    // than blanking the message box for a beat: four of five shipped that way.
    events.push({ text: e.transformLine ?? `${battle.enemy.active.name} takes the field!`, kind: 'ko', target: 'enemy' });
    battle.enemy.active = combatantFor(content, e.transformInto, battle.enemyScale);
    events.push({ text: `${battle.enemy.active.name} looms over the field!`, kind: 'waveIn', target: 'enemy', transform: true });
    return;
  }
  events.push({ text: e.koLine, kind: 'ko', target: 'enemy' });
  if (battle.enemy.queue.length === 1 && battle.barks?.midFight) {
    events.push(barkLine(battle, 'enemy', battle.barks.midFight));
    battle.barks.midFight = null; // once per fight
  }
  if (battle.enemy.queue.length) {
    const nextId = battle.enemy.queue.shift();
    battle.enemy.active = combatantFor(content, nextId, battle.enemyScale);
    events.push({ text: `Next wave: ${battle.enemy.active.name}!`, kind: 'waveIn', target: 'enemy' });
    playerActive(battle).status.trapped = false;
  } else {
    battle.over = true;
    battle.outcome = 'win';
    if (battle.barks?.defeat) events.push({ text: barkLine(battle, 'enemy', battle.barks.defeat), kind: 'bark' });
    if (battle.playerBarks?.victory) events.push({ text: barkLine(battle, 'player', battle.playerBarks.victory), kind: 'bark' });
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
    if (battle.barks?.victory) events.push({ text: barkLine(battle, 'enemy', battle.barks.victory), kind: 'bark' });
    if (battle.playerBarks?.defeat) events.push({ text: barkLine(battle, 'player', battle.playerBarks.defeat), kind: 'bark' });
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
    // The plan was made against the creature that just went down. A
    // replacement is a free action, so the next real turn plans afresh.
    battle.intent = null;
    return events.list;
  }

  // R103 — THE INTENT IS LOCKED HERE, at the top of the turn, before any of
  // the player's action is applied.
  //
  // This line is the whole mechanic. `enemyChooseMove` used to be called
  // below, AFTER the switch had already resolved, so the opposition re-aimed
  // at whoever had just arrived and tagging in a counter bought nothing but
  // a lost turn. Reading it here — and reading whatever the arena has
  // already shown the player, rather than choosing again — is what makes the
  // telegraph honest in both directions: the fight the harness flies is the
  // fight the screen described, whether or not anything ever rendered.
  const intent = intentOf(battle, content);
  battle.intent = null;   // consumed; the next turn plans its own
  // …and BOUND to the creature that made it. A counter-switch below can put
  // the telegraphed attacker down before it ever acts, and the next wave
  // walks in with a move list of its own — an index chosen for somebody else
  // is not a move, it is a crash. (It was, once: the first run of the agency
  // table died here.) Same rule the ordered branch already applies to a
  // knockback rotation: orders do not transfer to whoever arrives.

  const plannedFoe = battle.enemy.active;

  // Obedience (§3.5): unsettled/unbonded chimeras sometimes freelance.
  let playerAction = action;
  if (action.type === 'move' && me.ignoreChance > 0 && roll(battle) < me.ignoreChance) {
    // The improvised move must not be the one that was ORDERED. It used to
    // be drawn from every affordable move including that one, so roughly one
    // ignore in five printed "ignores orders and improvises!" and then did
    // exactly what it was told — a line of combat log that was simply not
    // true. (A7 measured the whole mechanic while it was at it: see
    // obedienceIgnoreChance.)
    const affordable = me.moves.map((m, i) => ({ m, i }))
      .filter(({ m, i }) => m.cost <= me.stamina && i !== action.index);
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
      battle.enemy.active = combatantFor(content, nextId, battle.enemyScale);
      events.push({ text: `Next wave: ${battle.enemy.active.name}!`, kind: 'waveIn', target: 'enemy' });
    } else {
      battle.over = true;
      battle.outcome = 'win';
      if (battle.barks?.defeat) events.push({ text: barkLine(battle, 'enemy', battle.barks.defeat), kind: 'bark' });
      if (battle.playerBarks?.victory) events.push({ text: barkLine(battle, 'player', battle.playerBarks.victory), kind: 'bark' });
      events.push({ text: `Victory! The area is yours (pending paperwork).`, kind: 'victory' });
    }
    battle.turn++;
    battle.log.push(...events.texts());
    return events.list;
  }

  // Switching and resting resolve before moves (Pokémon convention).
  if (playerAction.type === 'switch') {
    battle.player.active = playerAction.index;
    const incoming = playerActive(battle);
    events.push({ text: `${me.name} tags out. ${incoming.name} takes the field!`, kind: 'waveIn', target: 'player' });
    // R103 — THE COUNTER-SWITCH.
    //
    // A switch has always cost the whole turn, and until the intent was
    // written down it bought nothing for it: the opposition simply re-aimed
    // at whoever arrived. Now it has committed, and tagging in the animal
    // its telegraphed attacker is the wrong shape for is an ANSWER — so the
    // incoming creature comes in on the turn and lands one for free.
    //
    // It reads `classMultiplier`, the same triangle every hit in this game
    // reads, rather than a second table of its own: two tables that have to
    // agree are one table and a bug (R61, and R72's whole fixture).
    const rules = content.classRules ?? {};
    const counters = intent && incoming.creatureClass && intent.creatureClass
      && classMultiplier(incoming.creatureClass, intent.creatureClass, content) === rules.advantage;
    if (counters && !actUnavailable(incoming, events)) {
      const idx = chooseMoveIndex(battle, incoming, battle.enemy.active, content, 1, () => roll(battle));
      if (idx >= 0) {
        // SAID OUT LOUD, and not only for the player. A free hit that arrives
        // as an ordinary attack line is indistinguishable from the switch
        // simply not costing a turn — and it left the battery nothing to
        // read: the break that made this fire for ANYBODY was missed,
        // because the gate was scanning for a sentence the engine never
        // spoke while stance.json shipped one nobody used.
        events.push({ text: stanceLine(content, 'counter', { name: incoming.name }), kind: 'buff', target: 'player' });
        performMove(battle, 'player', idx, events, content, stanceTuning(content).counterPower);
        handleEnemyKO(battle, events, content);
      }
    }
  } else if (playerAction.type === 'rest') {
    if (!actUnavailable(me, events)) {
      // R103 — it braces, against the blow it was actually told about. The
      // three conditions and the two numbers are `bracePreview`'s, which is
      // also what the button quotes: one rule, one place (R61).
      const p = bracePreview(me, intent, content);
      me.status.justBraced = p.braced;
      me.stamina = p.braced
        ? Math.max(0, me.stamina - p.cost)
        : Math.min(me.staminaMax, me.stamina + p.gain);
      if (p.braced) me.status.guard = true;
      events.push({
        text: p.braced
          ? stanceLine(content, 'brace', { name: me.name, cost: p.cost })
          : stanceLine(content, 'breath', { name: me.name, gain: p.gain }),
        kind: 'rest', target: 'player',
      });
    }
  }

  // The move it already told you it was making, decided above.
  const enemyMove = intent?.index ?? -1;
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
      if (idx < 0) restCombatant(current, events, content);
      else performMove(battle, side, idx, events, content);
      handleEnemyKO(battle, events, content);
      handlePlayerKO(battle, events);
      if (battle.pendingReplace) break; // replacement happens before anything else
    }
  } else if (battle.enemy.active === plannedFoe) {
    // Player spent the turn on switch/rest — the enemy acts freely, unless
    // the creature that planned the move is no longer the one standing there.
    if (enemyMove < 0) restCombatant(battle.enemy.active, events, content);
    else performMove(battle, 'enemy', enemyMove, events, content);
    handlePlayerKO(battle, events);
  }

  if (!battle.over) {
    // R67: end-of-turn runs even when a replacement is pending. It skips
    // anything already at zero, so the creature that just went down takes
    // nothing — but the ENEMY's venom, bleed, regen and stamina all still
    // tick, and skipping them handed a player cycling a deep bench a free
    // round of every effect they had spent turns applying. Measured: 74
    // damage of venom and bleed on a quiet turn, 0 on the turn a chimera
    // went down.
    endOfTurn(battle, events);
    handleEnemyKO(battle, events, content);
    // …but the KO itself has already been announced and the prompt already
    // raised, so it is not announced twice.
    if (!battle.pendingReplace) handlePlayerKO(battle, events);
  }
  battle.turn++;
  battle.log.push(...events.texts());
  if (battle.log.length > 60) battle.log.splice(0, battle.log.length - 60);
  return events.list;
}

// R103 — breathing is BRACING now, on both sides of the field.
//
// "Catch Breath" gave stamina back and nothing else, which made it the worst
// button on the bar: measured, a pilot that takes it a quarter of the time
// gives up 4.2 points against one that never does, and the only pilot that
// fell off a cliff in the audit was the one that pressed it at random. A
// defensive option that is strictly a loss is not a decision, it is a trap
// with a label.
//
// A BRACE IS AN ANSWER TO A TELEGRAPH, so only the side that gets one can
// make it. The player is told what is coming (`battle.intent`); the
// opposition is told nothing, and bracing against a blow you have no reason
// to expect is not a decision, it is free armour.
//
// Measured, and this is why the rule is written this way round rather than
// "symmetric because symmetry is tidy": granting the brace to both sides put
// half a mitigation on every enemy rest, and every pilot in the harness got
// worse — the forecast's own pilot fell six points and the skill spread
// COMPRESSED from 15.8pp to 11.5. A defensive buff both sides receive is not
// a decision either side makes.
function restCombatant(c, events, content) {
  if (actUnavailable(c, events)) return;
  const gain = Math.round(c.staminaMax * stanceTuning(content).stamina);
  c.stamina = Math.min(c.staminaMax, c.stamina + gain);
  events.push({ text: stanceLine(content, 'breath', { name: c.name, gain }), kind: 'rest', target: sideOf(c) });
}


