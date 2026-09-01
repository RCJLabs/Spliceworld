// Matchup forecast (A1). DOM-free, so the same answer reaches the briefing
// screen, the balance harness and the test suite.
//
// The audit found the second node of the campaign sitting at a flat 0% for
// a player with one chimera — and, worse, that it is 0% for a STRUCTURAL
// reason no amount of stat-tuning would move. Combat is one active per side
// over a queue, so three enemy bodies means grinding three health bars down
// with one of your own: patrol_2 at tier-1 stats and three waves is still
// 0%, while the same encounter at full tier-2 stats and two waves is 28%.
// Bodies, not numbers.
//
// A player cannot be expected to work that out from a wave count. So the
// briefing runs the fight — the real engine, the real AI on both sides, a
// handful of seeds — and says what it found. This is R28's rule applied to
// the map: the number on the screen is the number that lands.
//
// It is a FORECAST, not a gate. Nothing here refuses a launch. A player who
// wants to throw one goat at a police cruiser is entitled to, and A2 makes
// sure it cannot cost them the game.

import { createBattle, step, playerActions, playerActive } from './engine.js';
import { chooseMoveIndex } from './ai.js';
import { rngStream } from '../util/rng.js';

// The same skill the balance harness pilots at. A forecast flown better
// than the player can fly is a lie in the optimistic direction, which is
// the worse direction for this particular number to be wrong in.
const FORECAST_SKILL = 0.8;
const TURN_GUARD = 300;

// Bands, widest first. `floor` is the win rate at or above which the band
// applies. These are what the player reads, so they are written as advice
// rather than as a probability the game does not really have to that
// precision.
export const BANDS = [
  { id: 'walkover', floor: 0.9, label: 'Walkover', hint: 'They have not brought enough.' },
  { id: 'favoured', floor: 0.65, label: 'Favoured', hint: 'This should hold.' },
  { id: 'even', floor: 0.4, label: 'Even fight', hint: 'It could go either way.' },
  { id: 'losing', floor: 0.05, label: 'Losing fight', hint: 'Expect to lose this one.' },
  // Reserved for genuinely near-zero, and the floor is low on purpose. This
  // is the only verdict that tells a player to walk away, so it has to be
  // the one verdict that is never overclaimed: a one-in-five fight is a bad
  // idea, not an impossible one, and calling it impossible would cost the
  // player a fight they could have won.
  { id: 'hopeless', floor: 0, label: 'Not survivable', hint: 'This team cannot win this fight, and it is not close.' },
];

export function bandFor(winRate) {
  return BANDS.find((b) => winRate >= b.floor) ?? BANDS[BANDS.length - 1];
}

function pilot(battle, content) {
  const actions = playerActions(battle);
  if (!actions.length) return null;
  const release = actions.find((a) => a.type === 'release');
  if (release) return release;
  const me = playerActive(battle);
  const idx = chooseMoveIndex(
    battle, me, battle.enemy.active, content, FORECAST_SKILL,
    () => rngStream(battle.seed, 'forecast', battle.rollCount++)()
  );
  if (idx >= 0) {
    const move = actions.find((a) => a.type === 'move' && a.index === idx);
    if (move) return move;
  }
  return actions.find((a) => a.type === 'rest') ?? actions[0];
}

// Replay the fight `runs` times and report what happened. `team` is the
// chimera records the player has actually selected, so the forecast is of
// THIS team against THIS encounter — obedience, injuries, scars, settling
// and temperament all ride along, because createBattle reads them.
// `runs` is 32 and that number is load-bearing. At 7 the same matchup —
// two chimeras against the Highway Checkpoint, truly about 45% — read 0%,
// 57%, 14%, 43% and 29% across five base seeds, so the VERDICT was being
// decided by sampling noise rather than by the fight. A forecast that calls
// a coin-flip "not survivable" is worse than no forecast, because a player
// who trusts it walks away from a fight they would win. 32 runs costs about
// 10ms and makes a false "not survivable" on a 45% matchup astronomically
// unlikely (0.55^32), which is the one verdict here that must never be
// wrong in that direction.
// `obedient: true` replays the same fight with the team's disobedience
// switched off — nothing else changed, so the difference between the two
// win rates IS the price of obedience for this team against this encounter.
// That is what the briefing shows, rather than a bare percentage that a
// player has no way to convert into a decision.
export function forecast(team, encounter, content, seed = 1, now = 0, { runs = 32, obedient = false, classBlind = false, chartBlind = false } = {}) {
  if (!team?.length || !encounter) {
    return { winRate: 0, runs: 0, band: bandFor(0), turns: null, waves: encounter?.waves?.length ?? 0 };
  }
  let wins = 0;
  let turns = 0;
  for (let i = 0; i < runs; i++) {
    // Seeded off the real battle seed so a reload shows the same forecast,
    // and offset per run so the seven are genuinely different fights.
    const battle = createBattle(team, encounter, content, (seed ^ Math.imul(i + 1, 0x9e3779b9)) >>> 0, now);
    if (obedient) for (const c of battle.player.team) c.ignoreChance = 0;
    // R37. The same trick as `obedient`, aimed at the other layer.
    // `classMultiplier` returns 1 the moment either side has no class, so
    // dropping the PLAYER's class lifts the triangle off this team in both
    // directions — their edge and their penalty alike. The gap between the
    // two win rates is therefore what the class triangle is worth to this
    // team against this encounter, measured rather than asserted.
    if (classBlind) for (const c of battle.player.team) c.creatureClass = null;
    if (chartBlind) for (const c of battle.player.team) {
      c.tags = [];
      for (const m of c.moves ?? []) m.tags = [];
    }
    let guard = 0;
    while (!battle.over && guard++ < TURN_GUARD) {
      const action = pilot(battle, content);
      if (!action) break;
      step(battle, action, content);
    }
    if (battle.outcome === 'win') {
      wins++;
      turns += battle.turn;
    }
  }
  const winRate = wins / runs;
  return {
    winRate,
    runs,
    band: bandFor(winRate),
    turns: wins ? turns / wins : null,
    waves: encounter.waves.length,
    // The line the audit exists because of: how many bodies each side has.
    // One health bar against three is the whole of A1.
    outnumberedBy: Math.max(0, encounter.waves.length - team.length),
  };
}

// --- R37: why you are losing, measured ----------------------------------
//
// The two losing bands used to carry a prescription apiece — "bring another
// body if you have one" and "bring more creatures" — and a constant string
// can only be right by luck. Measured at Precinct HQ, the node that gates
// the second region, with three standard-grade chimeras:
//
//   archetype   base   class off   chart off   at prime
//   boots (G)     0%          0%          3%        28%
//   wings (A)    91%          0%         91%       100%
//   gills (W)     0%         16%          0%         0%
//
// Nothing there is a shortage of bodies, and the briefing caps a team at
// three regardless — so "bring more creatures" was advice the game itself
// refuses to accept. What actually decides it: for a flier, the triangle
// and nothing else (91% collapses to 0% with the class layer lifted); for a
// Ground team, grade (0% to 28% at Prime).
//
// So the hint is measured the same way A7 measured obedience: replay the
// same fight with one layer switched off and read the difference. Nothing
// here is asserted from the class chart or the tag chart — a layer is named
// only when taking it away actually moves this team's win rate.

// How much a layer has to be worth before it is named as the cause. Below
// this it is noise on 32 replays, and naming it would send the player after
// the wrong fix — the failure this whole function exists to stop.
const CAUSE_FLOOR = 0.1;

// `runs` is deliberately NOT a parameter here. The first version of this
// gate ran the diagnosis at 12 replays to keep the suite quick, and it
// named the wrong cause: the class layer is worth a measured 16 points to a
// Water team at Precinct, and at 12 samples that lands under the floor and
// reads as "your creatures are too weak" — sending the player after the one
// fix that does not work. It is the same lesson `runs = 32` above is
// written down for, one layer up, and a knob that quietly degrades an
// answer is worse than no knob.
export function diagnose(team, encounter, content, seed = 1, now = 0, { canBringMore = false } = {}) {
  const runs = 32;
  const base = forecast(team, encounter, content, seed, now, { runs });
  if (base.band.id !== 'losing' && base.band.id !== 'hopeless') return null;

  // The one prescription that is free to check and the only one A1's
  // original wall actually needed: they are short a body AND have one to
  // bring. Both halves matter — telling a player at the cap to bring more
  // is the bug this replaces.
  if (base.outnumberedBy > 0 && canBringMore) {
    return {
      id: 'outnumbered',
      text: `You are ${team.length} against ${base.waves}. Bring another body — one health bar cannot outlast three.`,
    };
  }

  const classGain = forecast(team, encounter, content, seed, now, { runs, classBlind: true }).winRate - base.winRate;
  const chartGain = forecast(team, encounter, content, seed, now, { runs, chartBlind: true }).winRate - base.winRate;

  if (classGain >= CAUSE_FLOOR && classGain >= chartGain) {
    return {
      id: 'outclassed',
      text: `The class triangle is costing you about ${Math.round(classGain * 100)} points here. Something of another class does better against these.`,
    };
  }
  if (chartGain >= CAUSE_FLOOR) {
    return {
      id: 'outchartered',
      text: `Their tags are blanking your attacks — worth about ${Math.round(chartGain * 100)} points. Check the opposition list and bring moves they cannot ignore.`,
    };
  }
  // Neither layer is what is wrong, so it is the creatures. This is the
  // honest answer at Precinct HQ for a Ground stable, and it is the one the
  // old string never gave: 0% at Standard, 28% at Prime, on the same team.
  // Worded to agree with the roster rows above it. Those list every chart
  // rule that applies, so a flat "not a matchup problem" reads as a
  // contradiction of three ✘ lines the player is looking at. It is not one:
  // the rules apply AND lifting them does not save the fight, which is a
  // different and more useful thing to say.
  return {
    id: 'outgunned',
    // R38. This said "raise donors longer", naming ONE of the three inputs
    // to a part's grade. Measured over 1,200 starter animals, waiting is the
    // wrong lever for 12% of them — an adult in poor condition gains nothing
    // by ageing further — so the advice pointed some players at the one
    // thing that would not work. The Ranch card now decomposes it per
    // animal; this line sends them there rather than guessing for them.
    text: 'Hand them every matchup above and this is still a loss — these creatures are not strong enough yet. Better parts come from better donors; each animal on the Ranch says what is holding its grade down.',
  };
}
