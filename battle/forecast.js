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
  { id: 'even', floor: 0.4, label: 'Even fight', hint: 'It could go either way. Bring another body if you have one.' },
  { id: 'losing', floor: 0.05, label: 'Losing fight', hint: 'You are outnumbered or outclassed. Expect to lose this one.' },
  // Reserved for genuinely near-zero, and the floor is low on purpose. This
  // is the only verdict that tells a player to walk away, so it has to be
  // the one verdict that is never overclaimed: a one-in-five fight is a bad
  // idea, not an impossible one, and calling it impossible would cost the
  // player a fight they could have won.
  { id: 'hopeless', floor: 0, label: 'Not survivable', hint: 'This team cannot win this fight. It is not close — bring more creatures.' },
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
export function forecast(team, encounter, content, seed = 1, now = 0, { runs = 32, obedient = false } = {}) {
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
