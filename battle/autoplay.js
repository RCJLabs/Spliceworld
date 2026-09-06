// R88 — SENDING THEM, instead of watching them.
//
// A battle is replayed one beat at a time, each beat holding the screen for
// a few hundred milliseconds. That is right for a duel and wrong for the
// fourth spar of the day. Measured on three 180-day walks before any of
// this was written: **1,013 fights and ~177 minutes of beat replay per
// campaign**, of which sparring alone is 543 fights at a 100% win rate.
//
// So a fight whose outcome is not in doubt can be SENT: the same seeded
// engine, flown by the same autopilot, resolved in one go and reported in a
// sentence. Nothing here is a shortcut — there is no second combat model,
// no dice roll standing in for a battle. `autoResolve` is the loop the
// arena would have run, without the timers.
//
// WHICH FIGHTS. The roadmap proposed "forecast >= 95% AND the fight is a
// spar, a hunt or a known rescue". Both halves were wrong, and measuring
// said so:
//
//   * 95% is a number invented at the desk. The game already ships the
//     vocabulary — `walkover`, floor 0.90, the verdict the briefing has
//     printed since A1 — and R61's rule is that the canonical predicate
//     wins. Sampled across the walk's real fights, 451 forecasts of
//     `walkover` produced 449 wins.
//   * Gating on KIND forfeits honest saving for no safety at all. A
//     walkover DEFENCE won 38/39 and a walkover ASSAULT 12/12 — exactly as
//     certain as a spar. Restricting to three kinds would have thrown away
//     roughly 4,600 beats a campaign to protect against nothing.
//
// The one kind that always plays is the rival duel. That is not a safety
// rule — only 7% of duels forecast as walkovers anyway — it is a statement
// about what the game is: the duels are its set-pieces, and a set-piece you
// skipped is a set-piece you did not have.
//
// DOM-free, like the rest of `battle/`, so the balance harness flies the
// same autopilot the game does rather than keeping a private copy of it.
import { playerActions, playerActive, step } from './engine.js';
import { chooseMoveIndex } from './ai.js';
import { rngStream } from '../util/rng.js';

// THE ONE PILOT. Until R88 this policy existed TWICE, byte for byte: once
// in `tools/sim.js` as the balance harness's yardstick flier, once in
// `battle/forecast.js` as the thing whose win rate the briefing prints.
// Same skill constant, same move chooser, same rest fallback, different rng
// stream label — R61's orphan, waiting.
//
// It matters more here than duplication usually does. The briefing's whole
// claim is "this is a walkover", and that claim is only sound if the pilot
// the FORECAST modelled is the pilot that will actually fly the fight when
// the player presses Send them. Two copies is two answers to what your team
// does, and the day they drift the verdict stops being about the fight.
//
// The stream label stays a parameter because it is load-bearing history,
// not a detail: the forecast has always drawn on 'forecast' and the harness
// on 'pilot', and unifying those would move every balance number in the
// suite — a change to what the game is, smuggled in as a refactor.
export const PILOT_SKILL = 0.8;

export function pilotAction(battle, content, { skill = PILOT_SKILL, stream = 'pilot' } = {}) {
  const actions = playerActions(battle);
  if (!actions.length) return null;
  const release = actions.find((a) => a.type === 'release');
  if (release) return release;
  const me = playerActive(battle);
  const idx = chooseMoveIndex(battle, me, battle.enemy.active, content, skill,
    () => rngStream(battle.seed, stream, battle.rollCount++)());
  if (idx >= 0) {
    const move = actions.find((a) => a.type === 'move' && a.index === idx);
    if (move) return move;
  }
  return actions.find((a) => a.type === 'rest') ?? actions[0];
}

// How long the arena holds the screen for each kind of beat. This lives
// here rather than in `battle/ui.js` because two things need it and they
// must not drift: the arena, which plays them, and the harness, which
// counts what a campaign costs in wall-clock. R61 — one table.
export const BEAT_MS = {
  damage: 620,
  ko: 900,
  waveIn: 720,
  bark: 1100,
  victory: 700,
  defeat: 700,
  info: 460,
};

export function beatCost(event) {
  return BEAT_MS[event?.kind] ?? BEAT_MS.info;
}

// What a run of beats costs the eye, in milliseconds.
export function replayCost(events) {
  let ms = 0;
  for (const e of events ?? []) ms += beatCost(e);
  return ms;
}

// Fly the fight to its end and return every beat it produced, in order.
//
// `capture: true` fires the Containment Cannon whenever the engine offers
// it. The walker has always done this, and the walker is the balance model,
// so a sent fight has to do it too or sending would quietly cost the player
// specimens. It is offered, never forced: the engine only puts the action
// on the table when the cannon is charged and the target is weakened.
//
// The guard is the same 400 the harness has used since R83. A fight that
// cannot end in 400 actions is a bug in the engine, and swallowing it here
// would hide it.
export function autoResolve(battle, content, { capture = true } = {}) {
  const events = [];
  let guard = 0;
  while (!battle.over && guard++ < 400) {
    const offered = playerActions(battle);
    const bag = capture ? offered.find((a) => a.type === 'capture') : null;
    const action = bag ?? pilotAction(battle, content);
    if (!action) break;
    events.push(...step(battle, action, content));
  }
  return events;
}

// WHAT DECIDED IT, read off the beats the fight actually produced rather
// than re-derived from the state afterwards. R88's whole risk is that a
// sent fight teaches the player nothing: the arena is where you learn that
// your Water chimera folds to a Ground brawler, and a player who sends
// every walkover for a month learns none of it.
//
// So a sent fight reports its own lesson in one sentence, and every input
// comes from the engine's own events — `classMult` and `tagMult` are on
// each damage beat, disobedience has its own kind. Nothing here re-runs the
// fight or re-reads the tag chart; a second opinion about a fight that has
// already happened is how two systems start disagreeing about it.
//
// The order is deliberate: what went WRONG first, because that is the part
// worth learning, then what went right. Zero death language — a KO'd
// soldier parachutes away.
export function whatDecidedIt(events) {
  let chart = 0;
  let edge = 0;
  let resisted = 0;
  let ignored = 0;
  let ourLosses = 0;
  let theirLosses = 0;
  for (const e of events ?? []) {
    if (e.kind === 'disobey') { ignored++; continue; }
    if (e.kind === 'ko') { if (e.target === 'player') ourLosses++; else theirLosses++; continue; }
    if (e.kind !== 'damage' || e.recoil) continue;
    const ours = e.target === 'enemy';
    if (ours && e.tagMult > 1) chart++;
    if (ours && e.classMult > 1) edge++;
    if (ours && e.tagMult < 1) resisted++;
  }
  const bits = [];
  if (ignored) bits.push(`${ignored} order${ignored === 1 ? '' : 's'} improvised on — bond buys obedience`);
  if (ourLosses) bits.push(`${ourLosses} of ours parachuted out early`);
  if (edge) bits.push(`the class triangle did the work (${edge} hit${edge === 1 ? '' : 's'} with the edge)`);
  if (chart) bits.push(`${chart} tag-chart hit${chart === 1 ? '' : 's'} landed hard`);
  if (resisted && !chart) bits.push(`${resisted} hit${resisted === 1 ? '' : 's'} came back resisted — the anatomy is wrong for this`);
  if (!bits.length) bits.push(theirLosses ? 'straightforward: they simply had less' : 'nothing decisive happened');
  return bits.join(' \u00b7 ');
}

// R61 — ONE ANSWER TO "CAN THIS BE SENT", read by the briefing and by the
// gate. It takes the forecast the caller has ALREADY paid for rather than
// running one: `forecast()` fights 32 battles, the briefing has run it to
// draw the verdict, and R74's whole lesson was that asking twice is how a
// walkover ends up costing more than a losing fight.
//
// No forecast means no send. A missing number is not a confident one, and
// the failure has to land on the side that shows the player their fight.
export function canSend(fc, context = {}) {
  if (!fc?.band) return false;
  if (context.kind === 'rival') return false;
  return fc.band.id === 'walkover';
}
