// Battle policy (R22). One scorer, used by BOTH sides: the enemy picks with
// it, and the balance harness pilots with it. That shared use is the point —
// the old pilot was greedy on raw power, so a 20-power Multi-Hit or a
// defensive move was never pressed and therefore never priced. A yardstick
// that cannot hold a defensive move cannot measure one.
//
// DOM-free and deterministic apart from the battle's own seeded stream, so
// tools/sim.js replays the exact code the browser runs.
import { previewMove, classMultiplier as classMult, intentOf, stanceTuning, bracePreview } from './engine.js';

// Skill is a dial, not a switch: at 0 this is the old coin flip, at 1 it
// always takes the best line. Encounter tier drives it, so a beat cop plays
// like a beat cop and a Gen-2 response team does not.
// The fallback ladder, for a caller with no content bundle. The real one is
// `aiSkillByTier` in enemies.json, beside the `tierScale` it parallels — this
// array had SIX rungs against nine tiers of scaling, so the hardest fight in
// the game was piloted at exactly the same skill as tier 5 while hitting 2.3x
// stats, and a tier 7 encounter (which tierScale already prices) would have
// needed an engine edit to be piloted properly. CLAUDE.md: if adding content
// requires an engine edit, the engine is wrong.
export const SKILL_BY_TIER = [0.15, 0.15, 0.35, 0.55, 0.7, 0.85];
export const RIVAL_SKILL = 0.9;
// What a utility move must be worth to beat resting when nothing can swing.
const STARVED_UTILITY_BAR = 22;

export function skillFor(encounter, content = null) {
  if (!encounter) return 0.5;
  if (encounter.rivalId) return RIVAL_SKILL;
  const t = encounter.tier;
  if (t == null) return 0.5;
  const ladder = content?.aiSkillByTier?.length ? content.aiSkillByTier : SKILL_BY_TIER;
  return ladder[Math.max(0, Math.min(ladder.length - 1, t))];
}

// How much a status is worth is mostly "is it already there" — the single
// biggest thing the old chooser got wrong was re-applying what it had just
// applied.
// What the other side is about to do to you, in damage rather than in stat
// points. Defensive utility priced against `def.power` (a stat around 8) was
// worth a quarter of what it should be against a move that actually lands
// thirty, so guard, thorns and evasion only ever got pressed by accident —
// twenty of R23's new actives were never pressed once.
function incomingDamage(atk, def, content, turn) {
  let worst = 0;
  for (const m of def.moves) {
    if (!(m.power > 0)) continue;
    const p = previewMove(def, atk, m, content, turn);
    worst = Math.max(worst, p.damage * p.hitChance);
  }
  return worst || def.power;
}

// R61: `utilityValue` stood here, exported so the battle UI could rank which
// utility move earned one of the four buttons. R30 removed the question — the
// moveset is the cap now, so every move a creature carries is on screen in
// the order it was trained, and nothing needs ranking. The wrapper outlived
// the problem by thirty phases because nothing was watching for an export
// with no reader. That is what this phase's gate is for.

function utilityScore(move, atk, def, allies, incoming, window, battle) {
  const kw = move.keywords ?? {};
  const missingHp = atk.maxHp - atk.hp;
  const staminaRoom = atk.staminaMax - atk.stamina;
  let v = 0;

  if (kw.heal) v += Math.min(atk.maxHp * kw.heal, missingHp) * 1.1;
  if (kw.regen && !atk.status.regen) v += atk.maxHp * kw.regen * 2.2 * window;
  if (kw.staminaRestore) v += Math.min(kw.staminaRestore, staminaRoom) * 0.7;
  if (kw.staminaDrain) {
    // A foe with NO damaging move has no cheapest swing to strand it short
    // of — `Math.min(Infinity)` made that read as "always stranded" and the
    // 1.8x bonus fired on every drain against a utility-only opponent.
    const swings = def.moves.filter((m) => m.power > 0).map((m) => m.cost);
    const cheapest = swings.length ? Math.min(...swings) : null;
    const strands = cheapest != null && def.stamina - kw.staminaDrain < cheapest;
    v += Math.min(kw.staminaDrain, def.stamina) * (strands ? 1.8 : 0.4);
  }
  // Each priced against what is actually coming in, and against how much of
  // it the effect turns away.
  // Guard is cheap here on purpose: it blocks one hit and costs a whole turn,
  // and performMove clears it at the start of your own action so it never
  // reads as already-up. Priced at half a hit it out-scored attacking every
  // turn and turtled the fight away.
  if (kw.guard && !atk.status.guard) v += incoming * 0.25;
  if (kw.thorns && !atk.status.thorns) v += incoming * kw.thorns * 3 * window;

  // Stages are worth nothing once capped, and worth less the closer the
  // fight is to over — a power-up on a foe about to fall is a wasted turn.
  const room = (stage, want) => Math.max(0, want ? 2 - stage : 2 + stage);
  const longFight = Math.min(1, def.hp / Math.max(1, def.maxHp * 0.5));
  if (kw.powerUp) v += room(atk.stages.power, true) * 9 * longFight;
  if (kw.accUp) v += room(atk.stages.acc, true) * 6 * longFight;
  // An evasion stage persists for the whole fight, so it is worth what it
  // turns away over the REST of it, not what it saves this turn: a stage is
  // ~23% fewer hits landed, across the several turns still to come.
  if (kw.evasionUp) v += room(atk.stages.evasion, true) * incoming * 0.28 * longFight * window;
  if (kw.rally) v += room(atk.stages.power, true) * 7 * longFight * Math.max(1, allies);
  if (kw.powerDown) v += room(def.stages.power, false) * 7 * longFight;
  if (kw.accDown) v += room(def.stages.acc, false) * incoming * 0.1 * longFight;
  // Slow was priced at the target's WHOLE speed, ignoring both how much of
  // it the move takes and how much is left to take. The data ships Slow
  // from 0.3 to 1, so a 30% clip scored as the full stop; and unlike Venom,
  // Sleep, Stun, Trap and Taunt, Slow has no "already applied" guard and
  // COMPOUNDS on every press, so nothing ever told the pilot to stop. On an
  // eagle carrying a 0.3 tail it pressed Downdraft 374 times in 60 fights —
  // more than its best attack — and lost fights the greedy rule won.
  // Priced now at the speed the press actually removes, and discounted once
  // the pilot is already the faster of the two and the order is not in doubt.
  if (kw.slow && def.speed > 1) {
    const after = Math.max(1, Math.round(def.speed * (1 - kw.slow)));
    v += (def.speed - after) * (def.speed > atk.speed ? 1.4 : 0.5);
  }

  // Control: only ever worth applying to something it is not already on.
  if (kw.venom && !def.tags.includes('Vehicle')) v += Math.max(0, 4 - def.status.venom) * 7;
  if (kw.bleed) v += Math.max(0, 4 - (def.status.bleed ?? 0)) * 7;
  if (kw.sleep && !def.status.sleep) v += 16 * kw.sleep;
  if (kw.stun && !def.status.stun) v += 14 * kw.stun;
  if (kw.trap && !def.status.trapped) v += 8;
  if (kw.taunt && !(def.status.taunted > 0)) v += 10;
  if (kw.knockback) {
    // R68: this was a flat +9, and it made knockback a trap the pilot walked
    // into on purpose. `knockback()` re-queues the fighter it punts and
    // rebuilds it with `combatantFromUnit` when it comes back around — so
    // the damage already spent on the active is not merely deferred, it is
    // REFUNDED. Punting something you are three swings into is a rout of
    // your own position, and the AI was paying a turn for the privilege.
    // It is also a no-op in two states the score never checked: an empty
    // bench, and the one-turn lockout after anybody was punted.
    const side = def.kind === 'unit' ? 'enemy' : 'player';
    const last = battle?.knockedAt?.[side];
    const locked = last != null && battle.turn - last <= 1;
    const bench = def.kind === 'unit'
      ? (battle?.enemy?.queue?.length ?? 0)
      : (battle?.player?.team ?? []).filter((c) => c !== def && c.hp > 0).length;
    if (!locked && bench > 0) {
      // Worth most against something fresh — a wall you cannot get through
      // yet — and steeply negative against one you are about to finish.
      const spent = 1 - def.hp / Math.max(1, def.maxHp);
      v += 9 - spent * 26;
    }
  }
  return v;
}

// Everything that is not the damage itself: finishing, tempo, and the cost.
// `battle` is here for its TURN: the opening exchange gives a Skittish
// defender an extra dodge, and a pilot that scores without it over-values
// every swing on turn one. Before R66 the parameter was passed and never
// read, which is why the AI could not see the dodge at all.
function scoreMove(battle, atk, def, move, content, allies, incoming, window) {
  const p = previewMove(atk, def, move, content, battle.turn);
  let score = p.damage * p.hitChance;
  // A kill is worth more than the damage on it — it ends the turn the foe
  // would have taken. Weighted by the odds of actually landing it.
  if (p.lethal) score += (def.hp + 24) * p.hitChance;
  score += utilityScore(move, atk, def, allies, incoming, window, battle) * p.hitChance;
  if (p.immune) score = 0;
  // Charge spends a turn before it does anything; only worth it well ahead.
  if (move.keywords.charge) score *= 0.55;
  if (move.keywords.recoil) score -= p.damage * move.keywords.recoil * 0.9;
  // Priority is tempo when the exchange is close to lethal either way.
  if (move.keywords.priority && def.speed >= atk.speed) score += 6;
  // Stamina is a real resource: a move that empties the tank costs the next
  // turn too. Cheap moves get a nudge when the tank is low.
  // `options` is built from `affordable`, so `after` is never negative and
  // the guard that used to sit here could not fire. Dropped rather than left
  // as a comfort blanket over a branch the suite cannot reach.
  const after = atk.stamina - move.cost;
  if (after < atk.staminaMax * 0.2) score *= 0.75;
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
  const incoming = incomingDamage(atk, def, content, battle.turn);
  // An investment is only worth its payoff WINDOW. Thorns, evasion and regen
  // all pay out over the turns still to come, so a creature with three turns
  // left in it should not buy a five-turn return — measured as the difference
  // between a tortoise (+63pp with its hide active) and an eagle (-18pp),
  // where the fragile build was talked into spending turns it did not have.
  const window = Math.min(1, (atk.hp / Math.max(1, incoming)) / 4);
  let best = null;
  for (const { m, i } of options) {
    const score = scoreMove(battle, atk, def, m, content, allies, incoming, window);
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
  // Same shape, same bug: a creature whose whole moveset is utility has no
  // swing to be starved of, and `Math.min(Infinity)` told the pilot it was
  // starving forever — so it refused every buff under the bar and breathed
  // instead, permanently. Starving means "there IS a swing and I cannot
  // afford it".
  // R68: read from the creature's WHOLE moveset, not from `options`. Those
  // are the moves it can already pay for, so every cost in that list was
  // `<= atk.stamina` by construction and `atk.stamina < cheapestSwing` could
  // never once be true — the guard below has been unreachable since R66
  // sourced it from the filtered list, and the eagle it was written for went
  // straight back to pressing a cheap tail 374 times in 60 fights. Filtering
  // by `power > 0` still answers R66's case: a utility-only creature has no
  // swing to be starved of, so `cheapestSwing` is null and it is not starving.
  const swings = atk.moves.filter((m) => m.power > 0).map((m) => m.cost);
  const cheapestSwing = swings.length ? Math.min(...swings) : null;
  const starving = cheapestSwing != null && atk.stamina < cheapestSwing;
  const chosen = atk.moves[best.i];
  if (!taunted && starving && !(chosen.power > 0) && best.score < STARVED_UTILITY_BAR) return -1;
  return best.i;
}

// R103 — THE WHOLE ACTION SPACE, not just the moves.
//
// `chooseMoveIndex` above answers one question — which move — because until
// this milestone that was the only question with an answer. Bracing gave
// stamina and nothing else, and switching was a coin toss because the
// opposition re-aimed at whoever arrived, so a pilot that considered either
// was a pilot playing worse.
//
// Both are decisions now: the enemy commits first (`battle.intent`), so a
// brace is worth exactly the share of a KNOWN hit it absorbs, and tagging in
// the class that counters the telegraphed attacker lands a free hit on the
// way in. This is what a player who is paying attention does, so it is what
// the yardstick's pilot has to do — a mechanic no pilot uses is a mechanic
// the harness cannot see (R83), and the whole point of this phase is a
// number that says whether paying attention pays.
//
// It scores against the SAME `scoreMove` the enemy uses, in the same units,
// so the three options are comparable rather than three tunings that happen
// to sit near each other.
export function choosePlayerAction(battle, actions, content, skill, rollFn) {
  if (!actions?.length) return null;
  const me = battle.player.team[battle.player.active];
  const foe = battle.enemy.active;
  const release = actions.find((a) => a.type === 'release');
  if (release) return release;

  // `chooseMoveIndex` keeps its own skill dial, including its coin flip — so
  // it is asked first and unchanged. The first draft of this function
  // replaced that flip with one of its own over the WHOLE action space, and
  // a distracted pilot started tagging out at random: the forecast's own
  // pilot fell fifteen points, which is the one thing this milestone is not
  // allowed to do. Skill decides how often you are paying ATTENTION, and the
  // extra options below are what attention buys.
  const moveIdx = chooseMoveIndex(battle, me, foe, content, skill, rollFn);
  const bestMove = moveIdx >= 0 ? actions.find((a) => a.type === 'move' && a.index === moveIdx) : null;
  const allies = battle.player.team.filter((c) => c.hp > 0).length;
  const incoming = incomingDamage(foe, me, content, battle.turn);
  const window = Math.min(1, (me.hp / Math.max(1, incoming)) / 4);
  // The currency for the three options is EXPECTED DAMAGE, not `scoreMove`'s
  // composite. Scored against the composite, bracing won a third of all
  // turns — it was being compared against a number that carries a kill bonus
  // and a utility term, so mitigation looked like tempo — and the pilot
  // spent a third of the fight standing still and lost ground for it.
  //
  // Preventing damage is worth strictly less than dealing it: a blow you
  // absorb extends the fight, a blow you land ends it. So the bar for
  // standing there is the damage you would otherwise have done.
  const bestPreview = bestMove ? previewMove(me, foe, me.moves[moveIdx], content, battle.turn) : null;
  const bestDamage = bestPreview ? bestPreview.damage * bestPreview.hitChance : 0;

  // Not paying attention this turn: press the button and move on.
  if (rollFn() > skill) return bestMove ?? actions.find((a) => a.type === 'rest') ?? actions[0];

  // ASKED FOR, not read off the battle. `step` consumes the intent and
  // clears it, so `battle.intent` is null every time a pilot is called — the
  // first draft read the field directly and got null on all 4,757 decision
  // turns, which silently switched off both of this milestone's reads while
  // the code around them looked exactly right. `intentOf` plans one if there
  // is none and stores it, so the pilot and `step` resolve the same turn
  // against the same commitment, and the RNG is drawn once.
  const intent = intentOf(battle, content);
  const rules = content?.classRules ?? {};
  const stance = stanceTuning(content);
  let best = bestMove ? { action: bestMove, score: bestDamage } : null;

  // BRACE. Worth the share of the telegraphed hit it takes off, and only
  // when there is a telegraphed hit — against a foe that is resting or has
  // no move coming, standing there is exactly the old trap.
  // ASKED, not re-derived. The pilot used to carry its own copy of the
  // three conditions and its own stance table, and it was already missing
  // one of them — it scored a brace for a creature with nothing affordable
  // left, where the engine simply catches its breath. A pilot that models a
  // rule the engine does not have is measuring a game nobody plays (R61).
  //
  // IT COST SOMETHING, and the cost is recorded rather than tuned away:
  // asking the engine dropped the standard grade's spread from 19.1pp to
  // 16.2 (the bar is 15; prime and apex held at 22.9 and 30.0). The obvious
  // culprit — a starving creature scoring every option at zero, so any
  // counter-switch above nothing takes the turn — was tried and measured,
  // and pricing that rest at the stamina it buys returned +0.3/-0.1/-0.5.
  // A wash, so it is not here. The phantom brace flattered the number; this
  // is what the arena is actually worth.
  const braceAction = actions.find((a) => a.type === 'rest');
  const brace = bracePreview(me, intent, content);
  const braceCost = brace.cost;
  if (braceAction && brace.braced && !brace.unguardable) {
    const absorb = brace.absorb;
    // Damage avoided…
    let braceScore = incoming * absorb;
    // …and the whole creature, when the blow coming would otherwise finish
    // it. That is the read this option exists for: a telegraph you cannot
    // survive is the one turn standing still is obviously right.
    if (incoming >= me.hp) braceScore += me.hp;
    // …less what the stamina would have bought. A brace is PAID for, and a
    // pilot that does not price what it spends will buy a brace it did not
    // need: measured, scoring it free made the priced brace worth 9.1pp
    // against the 14.1pp of not having one at all — the option was actively
    // losing fights because nobody was subtracting its cost.
    const perStamina = bestMove ? bestDamage / Math.max(1, me.moves[moveIdx].cost) : 0;
    braceScore -= braceCost * perStamina;
    if (braceScore > bestDamage) best = { action: braceAction, score: braceScore };
  }

  // COUNTER-SWITCH. Tag in the animal the telegraphed attacker is the wrong
  // shape for: it arrives, lands one for free, and the hit that was aimed at
  // somebody else is now aimed at the creature that resists it.
  if (intent && intent.creatureClass) {
    for (const a of actions) {
      if (a.type !== 'switch') continue;
      const incomingMate = battle.player.team[a.index];
      if (!incomingMate || incomingMate.hp <= 0) continue;
      const beats = incomingMate.creatureClass
        && classMult(incomingMate.creatureClass, intent.creatureClass, content) === rules.advantage;
      if (!beats) continue;
      const freeIdx = chooseMoveIndex(battle, incomingMate, foe, content, 1, rollFn);
      if (freeIdx < 0) continue;
      const free = previewMove(incomingMate, foe, incomingMate.moves[freeIdx], content, battle.turn);
      // The free hit, plus what the switch spares this creature. Discounted:
      // it still costs the turn, and the incoming animal takes the blow.
      // The free hit, in the same currency, plus the share of the telegraphed
      // blow the incoming animal's class takes off it.
      const score = free.damage * free.hitChance * stance.counterPower
        + incoming * (1 - (rules.disadvantage ?? 1));
      if (score > (best?.score ?? 0)) best = { action: a, score };
    }
  }

  if (best) return best.action;
  return braceAction ?? actions.find((a) => a.type === 'move') ?? actions[0];
}
