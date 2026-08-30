// Battle policy (R22). One scorer, used by BOTH sides: the enemy picks with
// it, and the balance harness pilots with it. That shared use is the point —
// the old pilot was greedy on raw power, so a 20-power Multi-Hit or a
// defensive move was never pressed and therefore never priced. A yardstick
// that cannot hold a defensive move cannot measure one.
//
// DOM-free and deterministic apart from the battle's own seeded stream, so
// tools/sim.js replays the exact code the browser runs.
import { previewMove } from './engine.js';

// Skill is a dial, not a switch: at 0 this is the old coin flip, at 1 it
// always takes the best line. Encounter tier drives it, so a beat cop plays
// like a beat cop and a Gen-2 response team does not.
export const SKILL_BY_TIER = [0.15, 0.15, 0.35, 0.55, 0.7, 0.85];
export const RIVAL_SKILL = 0.9;
// What a utility move must be worth to beat resting when nothing can swing.
const STARVED_UTILITY_BAR = 22;

export function skillFor(encounter) {
  if (!encounter) return 0.5;
  if (encounter.rivalId) return RIVAL_SKILL;
  const t = encounter.tier;
  if (t == null) return 0.5;
  return SKILL_BY_TIER[Math.max(0, Math.min(SKILL_BY_TIER.length - 1, t))];
}

// How much a status is worth is mostly "is it already there" — the single
// biggest thing the old chooser got wrong was re-applying what it had just
// applied.
function utilityScore(move, atk, def, allies) {
  const kw = move.keywords ?? {};
  const missingHp = atk.maxHp - atk.hp;
  const staminaRoom = atk.staminaMax - atk.stamina;
  let v = 0;

  if (kw.heal) v += Math.min(atk.maxHp * kw.heal, missingHp) * 1.1;
  if (kw.regen && !atk.status.regen) v += atk.maxHp * kw.regen * 2.2;
  if (kw.staminaRestore) v += Math.min(kw.staminaRestore, staminaRoom) * 0.7;
  if (kw.staminaDrain) v += Math.min(kw.staminaDrain, def.stamina) * 0.5;
  if (kw.guard && !atk.status.guard) v += def.power * 1.6;
  if (kw.thorns && !atk.status.thorns) v += def.power * 1.2;

  // Stages are worth nothing once capped, and worth less the closer the
  // fight is to over — a power-up on a foe about to fall is a wasted turn.
  const room = (stage, want) => Math.max(0, want ? 2 - stage : 2 + stage);
  const longFight = Math.min(1, def.hp / Math.max(1, def.maxHp * 0.5));
  if (kw.powerUp) v += room(atk.stages.power, true) * 9 * longFight;
  if (kw.accUp) v += room(atk.stages.acc, true) * 6 * longFight;
  if (kw.evasionUp) v += room(atk.stages.evasion, true) * 6 * longFight;
  if (kw.rally) v += room(atk.stages.power, true) * 7 * longFight * Math.max(1, allies);
  if (kw.powerDown) v += room(def.stages.power, false) * 7 * longFight;
  if (kw.accDown) v += room(def.stages.acc, false) * 6 * longFight;
  if (kw.slow && def.speed > 1) v += def.speed * 1.4;

  // Control: only ever worth applying to something it is not already on.
  if (kw.venom && !def.tags.includes('Vehicle')) v += Math.max(0, 4 - def.status.venom) * 7;
  if (kw.bleed) v += Math.max(0, 4 - (def.status.bleed ?? 0)) * 7;
  if (kw.sleep && !def.status.sleep) v += 16 * kw.sleep;
  if (kw.stun && !def.status.stun) v += 14 * kw.stun;
  if (kw.trap && !def.status.trapped) v += 8;
  if (kw.taunt && !(def.status.taunted > 0)) v += 10;
  if (kw.knockback) v += 9;
  return v;
}

// Everything that is not the damage itself: finishing, tempo, and the cost.
function scoreMove(battle, atk, def, move, content, allies) {
  const p = previewMove(atk, def, move, content);
  let score = p.damage * p.hitChance;
  // A kill is worth more than the damage on it — it ends the turn the foe
  // would have taken. Weighted by the odds of actually landing it.
  if (p.lethal) score += (def.hp + 24) * p.hitChance;
  score += utilityScore(move, atk, def, allies) * p.hitChance;
  if (p.immune) score = 0;
  // Charge spends a turn before it does anything; only worth it well ahead.
  if (move.keywords.charge) score *= 0.55;
  if (move.keywords.recoil) score -= p.damage * move.keywords.recoil * 0.9;
  // Priority is tempo when the exchange is close to lethal either way.
  if (move.keywords.priority && def.speed >= atk.speed) score += 6;
  // Stamina is a real resource: a move that empties the tank costs the next
  // turn too. Cheap moves get a nudge when the tank is low.
  const after = atk.stamina - move.cost;
  if (after < atk.staminaMax * 0.2) score *= 0.75;
  if (after < 0) score = -Infinity;
  return score;
}

// Returns a move index, or -1 to rest.
export function chooseMoveIndex(battle, atk, def, content, skill, rollFn) {
  if (atk.status.charging != null) return atk.status.charging;
  const affordable = atk.moves.map((m, i) => ({ m, i })).filter(({ m }) => m.cost <= atk.stamina);
  if (!affordable.length) return -1;
  // Taunted, only the swings are on the table — matching playerActions.
  const taunted = atk.status.taunted > 0;
  const pool = taunted ? affordable.filter(({ m }) => m.power > 0) : affordable;
  const options = pool.length ? pool : affordable;

  // The dial. Below skill, it plays the old way: mild preference for damage,
  // otherwise anything.
  if (rollFn() > skill) {
    const damaging = options.filter(({ m }) => m.power > 0);
    const bag = rollFn() < 0.75 && damaging.length ? damaging : options;
    return bag[Math.floor(rollFn() * bag.length)].i;
  }

  const allies = battle.player?.team?.filter((c) => c.hp > 0).length ?? 1;
  let best = null;
  for (const { m, i } of options) {
    const score = scoreMove(battle, atk, def, m, content, allies);
    if (!best || score > best.score) best = { score, i };
  }
  // If the best thing on the table is worth nothing, breathe instead. This is
  // the rule the first draft was missing and it cost a whole class: once a
  // stage buff is capped it scores zero, and a cheap zero-power move stayed
  // affordable long after the real swings did not. The pilot then pressed a
  // capped evasion buff 545 times in 80 fights and won none of them, where
  // the old greedy pilot — which simply had no way to choose a setup move —
  // rested, recovered, and won half. Fragile builds die of wasted turns.
  if (!taunted && (!best || best.score <= 0)) return -1;
  // Starving: nothing that hits is affordable. A cheap buff is still legal
  // and still scores, but pressing it burns the very stamina that would buy
  // the next swing — so it has to be worth more than the turn that unlocks
  // hitting again. Without this bar the pilot chain-casts a 10-stamina buff
  // and never climbs back to its 20-stamina attack.
  const cheapestSwing = Math.min(Infinity, ...options.filter(({ m }) => m.power > 0).map(({ m }) => m.cost));
  const starving = atk.stamina < cheapestSwing;
  const chosen = atk.moves[best.i];
  if (!taunted && starving && !(chosen.power > 0) && best.score < STARVED_UTILITY_BAR) return -1;
  return best.i;
}
