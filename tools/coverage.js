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
const SYSTEMS = {
  combos:      { key: 'combosFound',   what: 'a combo discovered by splicing the parts that unlock it' },
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
for (const [name, { key, what }] of Object.entries(SYSTEMS)) {
  const n = walk[key];
  if (n === undefined) {
    fails.push(`\`campaignWalk\` reports no \`${key}\`, so nothing can say whether ${name} ever ran`);
    continue;
  }
  if (REPORT) console.log(`  ${String(n).padStart(6)}  ${name.padEnd(12)} ${what}`);
  if (!n) fails.push(`${name}: 180 days and not once — ${what}`);
}

// ---- verdict ---------------------------------------------------------
if (fails.length) {
  console.error(`\ncoverage ✗  ${fails.length} gap${fails.length === 1 ? '' : 's'}:`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`coverage ✓  ${rows.length} agenda rows and ${Object.keys(SYSTEMS).length} systems,`
  + ` every one of them exercised and counted across 180 days (${walk.actions} actions)`);
