// R92 — DOES THE YARDSTICK PLAY THE WHOLE GAME?
//
// `tools/sim.js` is the only thing in this project that claims to know what
// a campaign is worth. Every balance number the roadmap states comes out of
// it, so a system the walker never touches is a system whose balance has
// never been measured — and nothing said which those were.
//
// R92's entry named eight. Re-measured on the post-R91 tree, four of them
// had quietly been closed by other milestones (R120 taught it to breed and
// hatch, R83 and R91 the Wing, and it now clears all four Gauntlet stages)
// and nobody noticed, because there was no gate to notice with. That is the
// same failure in the other direction: a note nobody re-runs goes stale
// whether the news is good or bad.
//
// TWO RULES, AND THE SECOND IS THE ONE THE ENTRY ACTUALLY WANTED.
//
//   1. EVERY AGENDA ROW HAS A WALKER ACTION. `ranch/agenda.js` is the
//      game's own list of what a player can do right now, so it is the
//      honest roll to check against — and it is derived from the source
//      rather than re-typed, so a row added later is checked the day it
//      lands (R50's declare-yourself, R61's do-not-copy).
//
//   2. EVERY NAMED SYSTEM HAS A NUMBER. R92's criterion stops at the
//      agenda, and three of the systems it complains about — combo
//      discovery, the Resequencer, retraining a moveset — have no agenda
//      row at all, so the criterion as written cannot see them. Measured:
//      18 of 19 rows already fire. A criterion one row from passing while
//      the thing it was written about is four systems wide is R106's
//      lesson, so the roll below is the systems, not the rows.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSimContent, campaignWalk } from './sim.js';
import { walkedSave, primeWalkCache } from './fixtures.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');

// A row id is not always the verb the walker logs — `settle` is paid for
// with a rush, `spar` is logged as `sparring`. The alias table is the only
// hand-written thing here and it is three entries, each of which would fail
// loudly rather than silently if it went stale (the row would read NEVER).
const VERB_FOR_ROW = { settle: 'rush', spar: 'sparring' };

// The systems R92 names, and the number in `campaignWalk`'s report that
// proves each one ran. A system with no number cannot be argued about.
//
// `min` defaults to 1 — "did this run at all" is the question for most of
// them. Combos are the exception and break 152 is why: taking the Theater's
// reserved stalls away drops a campaign from 17 splices to 10 and from THREE
// combos to ONE, and a floor of one let that through. One discovery in 180
// days is an anecdote, not coverage; nobody can say anything about combo
// balance from it, which is the whole thing this milestone exists to fix.
const SYSTEMS = {
  // R95 raises the floor from 2 to 4. R93b set it at 2 because a campaign
  // could only ASSEMBLE a median nine of the 27; opening the roster took
  // that to twenty-five, and seed 2026 now finds eight. Half the headroom,
  // which is this project's ratchet.
  combos:      { key: 'combosFound', min: 4, what: 'a combo discovered by splicing the parts that unlock it' },
  vat:         { key: 'vats',          what: 'a chaos-vat gestation run to a decant' },
  resequencer: { key: 'resequences',   what: 'a vial grown back into an animal' },
  moveset:     { key: 'movesetTrains', what: 'a chimera retrained onto different move slots' },
  traits:      { key: 'traitsSeen',    what: 'a heritable trait expressed on a creature' },
  breeding:    { key: 'eggs',          what: 'an egg laid and hatched' },
  gauntlet:    { key: 'gauntletsWon',  what: 'a Gauntlet stage cleared' },
  rehab:       { key: 'rehabbedEver',  what: 'a captive talked onto the roster' },
};

const content = loadSimContent();
const walk = campaignWalk(content, { seed: 2026, days: 180, stopAtDominion: false });
// R95 — hand it on. `tools/reach.js` runs next on the same suite lane and
// wants this exact campaign; without this it walked it a second time.
primeWalkCache(walk.save);
const fails = [];

// ---- 1. every agenda row ---------------------------------------------
// Read off the source, so the roll cannot drift from the screen.
const src = readFileSync(join(root, 'ranch', 'agenda.js'), 'utf8');
const rows = [...src.matchAll(/id: '([a-z-]+)', kind: '(\w+)'/g)].map((m) => ({ id: m[1], kind: m[2] }));
if (rows.length < 15) {
  fails.push(`only ${rows.length} agenda rows were found in ranch/agenda.js — the reader has gone stale`);
}
if (REPORT) console.log(`\n${rows.length} agenda rows:`);
for (const row of rows) {
  const verb = VERB_FOR_ROW[row.id] ?? row.id;
  const n = walk.verbs[verb] ?? 0;
  if (REPORT) console.log(`  ${String(n).padStart(6)}  ${row.id.padEnd(12)} (${row.kind}, logged as ${verb})`);
  if (!n) {
    fails.push(`the agenda offers \`${row.id}\` and the walker never does it`
      + ` — 180 days, ${walk.actions} actions, not one \`${verb}\``);
  }
}

// ---- 2. every named system -------------------------------------------
if (REPORT) console.log(`\n${Object.keys(SYSTEMS).length} systems:`);
for (const [name, { key, what, min }] of Object.entries(SYSTEMS)) {
  const n = walk[key];
  if (n === undefined) {
    fails.push(`\`campaignWalk\` reports no \`${key}\`, so nothing can say whether ${name} ever ran`);
    continue;
  }
  const floor = min ?? 1;
  if (REPORT) console.log(`  ${String(n).padStart(6)} / ${String(floor).padEnd(3)} ${name.padEnd(12)} ${what}`);
  if (n < floor) {
    fails.push(floor === 1
      ? `${name}: 180 days and not once — ${what}`
      : `${name}: ${n} in 180 days, under the floor of ${floor} — ${what}`);
  }
}

// ---- 3. the combos a campaign could actually have ---------------------
//
// R93b — R92 found a median 2 of 27 combos discovered and queued "at least
// half the roster" as the target. That target was wrong at the time and the
// numbers said why: a campaign touched a median 23 of 41 species, and 25 of
// the 27 combos need parts from two DIFFERENT species, so only a median NINE
// were even assemblable. Half the roster was unreachable, and making it
// reachable was named as R95's problem.
//
// R95 DID IT, AND THIS RULE HAD TO BE RE-DERIVED BECAUSE OF IT. A campaign
// now reaches a median 233 of 244 parts and 40 of 41 species, so a median
// TWENTY-FIVE of the 27 combos are assemblable where nine were. The
// numerator went up — 28 found across seven seeds becomes 56 — and the
// denominator went up harder, 51 to 172. The ratio therefore FELL, from 55%
// to 33%, on a tree that discovers twice as many combos. A ratio whose
// denominator triples underneath it is not a regression signal.
//
// What bounds the numerator now is the Surgery Theater, not the vault: a
// campaign makes a median FIFTEEN splices, and you cannot discover
// twenty-five combos in fifteen creatures. That ceiling is structural and
// belongs to whichever phase widens the Theater, so this floor is set where
// it can still catch the planner going blind rather than where it would
// demand something the stable cannot do.
//
// AND ONE BREAK IS RETIRED HERE, WITH ITS NUMBERS. R93b's break 157 — the
// planner boosting combos it has ALREADY discovered — was worth 16.5pp on
// the pre-R95 tree (71.4% against 54.9%) and is worth 5.1pp now (32.6%
// against 27.5%), with per-seed results that cross over: seed 101 scores 2
// with the fix and 9 without. The fix is still correct and still shipped;
// what changed is that when seventeen undiscovered combos are completable,
// leaving eight discovered ones in the ranking barely moves it. A break the
// gate can only catch by luck is a break that teaches the battery to lie, so
// it is removed rather than left to go MISSED. Break 151 — the planner not
// weighing combos at all — separates 32.6% from 1.2% and stays.
const COMBO_SEEDS = [2026, 7, 101, 4242, 55, 900, 31];
// Measured 32.6%; break 151 puts it at 1.2%. The floor sits between them and
// near enough to today's number that drift fails.
const COMBO_REACH = 0.22;
{
  let possible = 0;
  let found = 0;
  const per = [];
  for (const seed of COMBO_SEEDS) {
    // R95 — through the FIXTURE CACHE, not a fresh walk. Both numbers this
    // rule needs live in the save (`dex.parts` and `discoveredCombos`), and
    // `tools/reach.js` asks about the same seven seeds; sharing the cache
    // means the pair walks seven campaigns between them instead of fourteen.
    // Seed 2026 stays the full walk above, because rules 1 and 2 need the
    // verb tally, which a save does not carry.
    const save = seed === 2026 ? walk.save : walkedSave({ seed, days: 180 });
    const seen = new Set(save.dex.parts ?? []);
    const could = Object.values(content.combos ?? {})
      .filter((k) => (k.parts ?? []).length && k.parts.every((pid) => seen.has(pid))).length;
    const got = (save.discoveredCombos ?? []).length;
    possible += could;
    found += got;
    per.push(`${seed}: ${got}/${could}`);
  }
  const ratio = possible ? found / possible : 1;
  if (REPORT) {
    console.log(`\ncombos: ${found} of ${possible} assemblable across ${COMBO_SEEDS.length} seeds`
      + ` (${Math.round(ratio * 100)}%) — ${per.join(', ')}`);
    console.log(`  the roster is ${Object.keys(content.combos).length}; a campaign reaches`
      + ' a median 40 of 41 species since R95, so nearly all of it is assemblable'
      + ' and the Theater\'s fifteen splices are what bound the count');
  }
  if (ratio < COMBO_REACH) {
    fails.push(`combo reach: ${found} of the ${possible} combos these campaigns could assemble`
      + ` (${Math.round(ratio * 100)}%, under ${Math.round(COMBO_REACH * 100)}%) — ${per.join(', ')}`
      + ' — a pair you own and never put on one creature is a reward going unclaimed');
  }
}

// ---- 4. R154: the paddock buys stable room, and the roster uses it -----
//
// R157 derived the walker's roster ceiling from the Theater's grant instead of
// the nine it had been given by hand, and then could not gate it: at a fixed
// grant of twelve the walk lands on nine spliced plus graduations whichever
// way the constant reads, so re-typing it left every gate green. R154 sells a
// bigger stable — a stall per six pens past the starting four — which is what
// makes the derivation observable at all.
//
// IT LIVES HERE RATHER THAN IN SMOKE because smoke's campaign block halts at
// dominion, on day 24-39, and the stalls exist long before there is time to
// fill them: measured there, rosters read 11/10/11 against a grant of 12 and
// the assertion is simply false. This walk runs the full 180 days, which is
// the only place the claim is true. Measured at sixteen seeds: every campaign
// ends over the grant, seed 2026 on fifteen against a cap of sixteen.
{
  const { stableRoom } = await import('../splice/facility.js');
  const grant = Math.max(...(content.facility.theater.levels ?? []).map((l) => l.grants?.stable ?? 0));
  const cap = stableRoom(walk.save, content).cap;
  const roster = walk.save.chimeras?.length ?? 0;
  if (REPORT) console.log(`\n  stable: Theater grants ${grant}, paddock took it to ${cap}, roster ${roster}`);
  if (cap <= grant) {
    fails.push(`the paddock buys no stable room: cap ${cap} against the Theater's grant of ${grant}`
      + ` — "Expand the pens" is back to meaning only livestock`);
  }
  // And the other half, which is the one worth having: room nobody stands in
  // is not room. A cap that grows while the roster does not would be the
  // feature shipping as a number on a screen.
  if (roster <= grant) {
    fails.push(`the stable grew to ${cap} and the campaign finished on ${roster}`
      + ` — at or under the Theater's own ${grant}, so the stalls a paddock bought went unused`);
  }
}

// ---- verdict ---------------------------------------------------------
if (fails.length) {
  console.error(`\ncoverage ✗  ${fails.length} gap${fails.length === 1 ? '' : 's'}:`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`coverage ✓  ${rows.length} agenda rows and ${Object.keys(SYSTEMS).length} systems,`
  + ` every one of them exercised and counted across 180 days (${walk.actions} actions)`);
