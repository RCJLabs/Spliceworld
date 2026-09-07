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
  combos:      { key: 'combosFound', min: 2, what: 'a combo discovered by splicing the parts that unlock it' },
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
// half the roster" as the target. That target is wrong, and the numbers say
// why: a 180-day campaign touches a median of 23 OF 41 SPECIES and 109-136
// of 244 parts, and 25 of the 27 combos need parts from two DIFFERENT
// species. You cannot discover a combo whose second animal you never
// acquired, so only a median NINE of 27 are even possible. Half the roster
// was never reachable, and making it reachable is a species-reach problem —
// R95's, not this one's.
//
// What IS this one's: of the combos a campaign could assemble, it finds 55%
// (28 of 51 across seven seeds, ranging 22% to 89%). That gap is the
// Theater's, and it is worth closing — a pair you own and never think to put
// on the same creature is the reward for collecting it going unclaimed.
// ACROSS SEEDS, because one campaign's luck is not a content-reach number —
// and SEVEN of them, because three was not enough either.
//
// The single-seed version ranged 43% to 100% on the same tree, so this
// started at three. On three, removing the fix this phase shipped scored
// HIGHER (63% against 56%) and break 157 came back MISSED: the sample was
// small enough to invert the result. On fourteen the answer is unambiguous —
// 69.0% with the fix, 48.1% without — and seven reproduces it at 71.4%
// against 54.9% for 25 seconds of walk, which the suite can afford.
//
// The lesson is the one this phase had already half-learned when it went
// from one seed to three: a content-reach number needs a sample, and
// "more than one" is not a sample.
const COMBO_SEEDS = [2026, 7, 101, 4242, 55, 900, 31];
// Ratchet between the two measured states, so removing the planner's
// exclusion of already-discovered combos fails the build.
const COMBO_REACH = 0.65;
{
  let possible = 0;
  let found = 0;
  const per = [];
  for (const seed of COMBO_SEEDS) {
    const run = seed === 2026 ? walk : campaignWalk(content, { seed, days: 180, stopAtDominion: false });
    const seen = new Set(run.save.dex.parts ?? []);
    const could = Object.values(content.combos ?? {})
      .filter((k) => (k.parts ?? []).length && k.parts.every((pid) => seen.has(pid))).length;
    possible += could;
    found += run.combosFound;
    per.push(`${seed}: ${run.combosFound}/${could}`);
  }
  const ratio = possible ? found / possible : 1;
  if (REPORT) {
    console.log(`\ncombos: ${found} of ${possible} assemblable across ${COMBO_SEEDS.length} seeds`
      + ` (${Math.round(ratio * 100)}%) — ${per.join(', ')}`);
    console.log(`  the roster is ${Object.keys(content.combos).length}; a campaign reaches`
      + ' a median 23 of 41 species, so most of it was never assemblable at all (R95)');
  }
  if (ratio < COMBO_REACH) {
    fails.push(`combo reach: ${found} of the ${possible} combos these campaigns could assemble`
      + ` (${Math.round(ratio * 100)}%, under ${Math.round(COMBO_REACH * 100)}%) — ${per.join(', ')}`
      + ' — a pair you own and never put on one creature is a reward going unclaimed');
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
