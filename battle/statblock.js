// R81 — WHAT A CREATURE IS, as opposed to what happens when two of them
// fight. Split out of battle/engine.js, which was 64 KB and in the eager
// import graph of every boot.
//
// The measurement that forced it: nine modules import from the engine and
// only two of them are ever in a battle. The Ranch's agenda asks whether a
// chimera is hurt, the Pens print its moves and its obedience, the Theater
// builds a move list to show you what you just spliced, sparring asks who is
// fit, operations bruise somebody on a failed job, and the rival ladder
// turns a genome into a fightable unit — none of which is a fight, and all
// of which used to drag the turn loop, the AI, the damage formula and the
// aftermath along behind it.
//
// So the seam is that sentence: a statblock is the numbers a creature
// carries INTO a fight — its moves from its anatomy, its purebred set bonus,
// its obedience, whether it is hurt — and the engine is the rules for
// resolving one. The engine imports from here; nothing here knows the engine
// exists. The whole game can ask what a creature is without loading the
// machinery for making it fight.

import { analyze } from '../splice/physiology.js';
import { GRADE_INDEX, gradeIndexOf } from '../splice/extract.js';
import { classOf } from '../data/catalog.js';
import { MOVE_SLOTS, activeMoves, defaultPick, partMoveId, comboMoveId } from './moves.js';
import { isSettled } from '../splice/theater.js';
import { rngStream, pick } from '../util/rng.js';
import { grantBattleXp } from './veterancy.js';
import { driftFromBattle } from '../splice/temperament.js';
import { infirmaryGrants } from '../splice/facility.js';

// "Upgraded abilities" (ROADMAP §3.3) — grades already scale stats, so this
// rides gently on top. R17 keyed combo scaling to it as well, which is why
// it lives with the move builder rather than with the damage formula.
export const GRADE_MOVE_BONUS = 0.12;

// Obedience (§3.5): the only place player control wavers, and care fixes
// it — settling removes the big penalty, bond cancels instability.
//
// A7 MEASURED WHAT THIS IS WORTH, because the audit called it "decisive"
// and it is not. Holding settling fixed so Rejection never fires, and
// replaying the real engine 300 times a cell at pilot skill 1.0:
//
//     ignore chance     0%     20%     40%     60%
//     patrol_2         95%     96%     91%     86%
//
// Twenty per cent — the realistic figure for a settled mixed build at zero
// bond — is worth one to three points, inside the noise. Even the 60% cap
// costs about nine. The reason is structural: a disobeying creature
// substitutes another move from its OWN list, so with five or six mostly
// damaging moves it loses a little optimisation and never a turn. Rejection
// (x0.75 power and speed while unsettled) is the far larger penalty, and
// the two were being read together because an unsettled creature has both.
//
// The briefing screen now shows what obedience costs THIS team on THIS
// fight rather than a bare percentage, so the number stays honest at
// whatever this mechanic is eventually worth.
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
  // Two bays of the same organ stack their STATS but must not hand the
  // player two identical buttons (Theater Tier II makes that possible for
  // the first time). Keep the better copy.
  // Only collapse moves that are ACTUALLY the same. Matching on name alone
  // quietly deleted every species' Ground-tagged hindlimb move, because the
  // generic forelimb and hindlimb abilities shared a name.
  const sig = (m) => `${m.name}|${m.power}|${m.cost}|${m.acc}|${m.tags.join(',')}|${JSON.stringify(m.keywords)}`;
  const seen = new Set();
  const add = (move) => {
    const key = sig(move);
    if (seen.has(key)) return;
    seen.add(key);
    moves.push(move);
  };
  for (const token of tokens) {
    const part = content.parts[token.partId];
    if (!part?.move) continue; // passive or retired part — stats only
    // R72: unguarded, a grade this build no longer defines made this NaN,
    // and a NaN multiplier spreads silently through every damage number the
    // engine and the balance sim compute.
    const gradeBonus = 1 + gradeIndexOf(token.grade) * GRADE_MOVE_BONUS;
    // A trait can change what a part DOES, not only what it weighs (R24).
    // Stat bonuses alone made every gene feel like the same gene with a
    // different number on it; a venom gland that actually envenoms is a
    // different creature.
    //
    // R70: the original merge always kept the PART's own value on a shared
    // key, so "a part that already envenoms is not quietly overwritten by a
    // weaker gene" — but it did that unconditionally, by KEY, never looking
    // at either value. R68 gave most hides their own `thorns`; by R70, 22 of
    // 42 did, and `barbed_skin` (hide, thorns 0.2) was silently zeroed on
    // every one of them — not overridden by something bigger, just deleted,
    // regardless of what number was on either side. `venom_gland` (head,
    // venom 1) took the same hit wherever a head already carried venom.
    // Measured: pooled over 9 builds × 4 encounters at high sample,
    // barbed_skin read 0.01–0.07% against a ~0.5–1.4% null-control floor —
    // not quiet, dead — while venom_gland (only 1 of 10 test builds
    // colliding) still cleared its floor by luck of the roster.
    //
    // The fix keeps the ORIGINAL intent — a gene must never make a part
    // WORSE at what it already does — while actually comparing the two
    // numbers instead of one hardcoded winner: on a shared key, the larger
    // magnitude wins (a boolean stays true either way, so ties there are
    // moot). A weak gene still cannot downgrade a strong part; a gene that
    // matches or beats what the part already does is no longer invisible.
    let keywords = part.move.keywords;
    for (const traitId of token.traits ?? []) {
      const extra = content.traits?.[traitId]?.moveKeywords;
      if (!extra) continue;
      const merged = { ...extra, ...keywords };
      for (const key of Object.keys(extra)) {
        if (typeof extra[key] === 'number' && typeof keywords[key] === 'number') {
          merged[key] = Math.max(extra[key], keywords[key]);
        }
      }
      keywords = merged;
    }
    add({
      name: part.ability,
      power: Math.round(part.move.power * gradeBonus),
      cost: part.move.cost,
      acc: part.move.acc,
      tags: part.move.tags,
      keywords,
      // R30: identity is where the move came from, so a saved moveset
      // survives a grade change or a trait that rewrites its keywords.
      source: partMoveId(token.partId),
      id: partMoveId(token.partId),
      sourceLabel: part.name ?? part.ability,
    });
  }
  // A combo is emergent anatomy, so it takes a grade too — the BEST one
  // among the parts that unlock it. Anything less breaks the rule that a
  // combo must out-power the parts it is made of: a part's own move scales
  // by its own grade, so a min- or mean-graded combo gets overtaken by the
  // Prismatic half of its own pair and the player stops pressing the thing
  // they were rewarded with. Across every grade assignment in the roster,
  // min leaves 31 of 192 dead and mean 10; max leaves none, and provably
  // so — combo > max(parts) at base, and scaling both by the same
  // (largest) bonus cannot reorder them.
  const gradeOfPart = {};
  for (const token of tokens) {
    const g = GRADE_INDEX[token.grade] ?? 0;
    gradeOfPart[token.partId] = Math.max(gradeOfPart[token.partId] ?? 0, g);
  }
  for (const combo of report.combos) {
    const grade = Math.max(0, ...combo.parts.map((id) => gradeOfPart[id] ?? 0));
    const gradeBonus = 1 + grade * GRADE_MOVE_BONUS;
    add({ ...combo.move, name: combo.name, power: Math.round(combo.move.power * gradeBonus),
      source: comboMoveId(combo.id), id: comboMoveId(combo.id),
      sourceLabel: `${combo.name} (combo)` });
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
  const unit = {
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
  // A rival who committed to one animal earns the same set the player does.
  // The unit record is the enemies.json shape, so the bonus has to land on
  // the STATS here rather than on a combatant that does not exist yet;
  // `perks` are the neutral block for units, and keyword scaling rides the
  // moves, both of which this shape already carries.
  return applySetBonus(unit, report.purebredSpecies, content);
}

// R34 — the purebred set bonus, which every species declared and nothing
// read. All 41 `setBonus` entries were prose: physiology computed
// `purebredSpecies`, passed it to the combatant as `physiology.purebred`,
// and the engine never looked at it. Measured before wiring it, on matched
// builds — same frame, same grade, same six sockets, same bond — a purebred
// build *trailed* a mixed one by 0.1 to 1.8pp across six frame x grade
// cells. That is the honest brief: a set bonus is not a buff that threatens
// mixing, it is the missing payment for a cost players were already paying.
// (Purebred's one wired benefit, -20 instability, buys nothing in a fight:
// bond cancels the disobedience term outright, so a bonded creature got
// literally nothing for giving up its pick of parts.)
//
// Three dials, all of them things the engine already reads every turn, so
// a 42nd species is a data edit and never an engine one:
//
//   stats    — multiplies the combatant's base numbers (hp, power, armor,
//              speed, stamina, regen)
//   perks    — adds to the temperament perk block (critChance, evasion,
//              power, regen, guardLoss, lastStandAt)
//   keywords — multiplies the NUMERIC value of that keyword wherever it
//              appears on this creature's moves, so "Venom applies twice
//              the stacks" is the venom keyword doing twice as much rather
//              than a special case with the cobra's name on it.
export function applySetBonus(combatant, purebredSpecies, content) {
  const effect = purebredSpecies ? content.species[purebredSpecies]?.setBonus?.effect : null;
  if (!effect) return combatant;
  for (const [stat, mult] of Object.entries(effect.stats ?? {})) {
    if (typeof combatant[stat] !== 'number') continue;
    combatant[stat] = Math.max(1, Math.round(combatant[stat] * mult));
  }
  // maxHp tracks hp, or the bar starts the fight already dented.
  if (effect.stats?.hp) combatant.maxHp = combatant.hp;
  if (effect.stats?.stamina) combatant.staminaMax = combatant.stamina;
  if (effect.perks) {
    combatant.perks = { ...combatant.perks };
    for (const [perk, add] of Object.entries(effect.perks)) {
      combatant.perks[perk] = (combatant.perks[perk] ?? 0) + add;
    }
  }
  if (effect.keywords) {
    combatant.moves = combatant.moves.map((move) => {
      let touched = null;
      for (const [kw, mult] of Object.entries(effect.keywords)) {
        const v = move.keywords?.[kw];
        if (typeof v !== 'number') continue; // a boolean keyword has no dial
        touched ??= { ...move, keywords: { ...move.keywords } };
        touched.keywords[kw] = v * mult;
      }
      return touched ?? move;
    });
  }
  return combatant;
}

const INJURY_NAMES = [
  'Bruised Ego', 'Sprained Everything', 'Temporary Kazoo Phobia',
  'Overstretched Drama Gland', 'Bent Whiskers', 'Full-Body Boop',
];

// Apply the outcome to the world: rewards, war record, and Law 1 —
// KO'd chimeras leave with Infirmary timers the ranch must absorb.
export function finishBattle(state, battle, content, now) {
  const injuries = [];
  // Temperament drifts with a career (§3.5 "drifted by how you raise
  // them"): winning makes a creature fiercer, going down makes it warier.
  for (const c of battle.player.team) {
    const chimera = state.chimeras.find((ch) => ch.id === c.refId);
    if (!chimera) continue;
    driftFromBattle(chimera, content, { won: battle.outcome === 'win', knockedOut: c.hp <= 0 });
  }
  for (const c of battle.player.team) {
    if (c.hp > 0) continue;
    const chimera = state.chimeras.find((ch) => ch.id === c.refId);
    if (!chimera) continue;
    // Keyed on the CREATURE and its own tally of injuries. It used to be
    // keyed on `warRecord.wins + losses + injuries.length`, and the record
    // is incremented after this loop — so a two-casualty loss consumed
    // counters N and N+1 and the next battle started at N+1. Lose twice in
    // a row with two down each time and the second creature's injury was
    // byte-identical to the previous fight's first.
    const rng = rngStream(state.seed, `injury:${chimera.id}`, chimera.injuryCount ?? 0);
    // The Infirmary track shortens convalescence (R25). It buys TIME, not
    // outcomes: the scar roll is still a roll, and treating an injury is
    // still what guarantees it leaves no trace.
    const hours = (2 + rng() * 2) * infirmaryGrants(state, content).healScale;
    const standing = applyInjury(chimera, {
      name: pick(rng, INJURY_NAMES),
      until: now + Math.round(hours * 3600000),
    });
    injuries.push({ chimera: chimera.name, injury: standing });
  }
  // R41: everyone on the card learns something — win or lose, because a
  // walled player grinding losses into levels is the ladder out of the wall
  // working as designed.
  const xp = grantBattleXp(state, battle, content);
  if (battle.outcome === 'win') {
    state.funds += battle.reward;
    state.warRecord.wins++;
  } else {
    state.warRecord.losses++;
  }
  state.battle = null;
  return { outcome: battle.outcome, reward: battle.outcome === 'win' ? battle.reward : 0, injuries, xp };
}

export function isInjured(chimera, now) {
  return !!chimera.injury && now < chimera.injury.until;
}

// R75 — "who can fight right now" was written out three times: the agenda,
// the sparring ring, and (once R75 gated the map's Assault) the War Room.
// Three copies of one rule is how a map comes to offer a fight the agenda
// has already ruled out. It lives beside the injury rule because it IS the
// injury rule, asked about the stable rather than one creature.
export function fitToFight(state, now) {
  return (state.chimeras ?? []).filter((c) => !isInjured(c, now));
}

// R65 — the one place an injury is written to a chimera.
//
// Two rules, both learned from bugs. An injury NEVER SHORTENS convalescence:
// a job that failed while you were away used to overwrite a four-hour battle
// wound with its own ninety minutes, so the worse day was the better outcome
// and the Infirmary bill went with it. And every injury bumps the creature's
// own tally, which is what the name roll and the scar roll are both keyed on
// — before this they were keyed on the global war record, so two consecutive
// two-casualty losses rolled byte-identical injuries.
//
// The tally counts injuries TAKEN, so it advances even when the standing one
// is the longer of the two: the creature was hurt either way.
export function applyInjury(chimera, injury) {
  if (!chimera || !injury) return chimera?.injury ?? null;
  chimera.injuryCount = (chimera.injuryCount ?? 0) + 1;
  const standing = chimera.injury;
  if (!standing || injury.until > standing.until) chimera.injury = injury;
  return chimera.injury;
}
