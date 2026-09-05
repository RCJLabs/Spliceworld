// R77 — THE ROADMAP DESCRIBES A DIFFERENT GAME.
//
// Measured before this was written: §3 promised chimeras settle in "~1-4
// hrs" (they settle in 22.5 min to 3 h), a dissection countdown of "12-24
// hrs" (it is 9-18), "3 frames" against four shipped, "~12 combos" against
// 27, "25 species / 150 parts" against 41 and 244, and ZzFX as the audio
// that shipped when `audio/sfx.js` is a hand-rolled synth written precisely
// so the no-dependency rule would hold. Two whole mechanics — going Feral at
// instability 100, and Gene Juice skipping timers — were designed in §3 and
// have ZERO hits anywhere in the codebase.
//
// None of that could fail a build, because a design document is prose and
// prose does not run. So the numbers move into a block that does.
//
// TWO DIRECTIONS, the same shape as the news wire's two-way gate:
//
//   1. Every number §4.0 states is re-derived from data/*.json and the
//      engine here and must match. Nothing is typed twice.
//   2. Every mechanic the LIVE SPEC (§1-§5) names must exist in the code —
//      or the same line must say it does not, and name the phase that will
//      build it. §6 onward is a milestone LOG and is exempt: an entry
//      narrating "one region, five nodes" is history, not a claim.
//
//   node tools/roadmap.js        # exit 1 if the roadmap has drifted
//
// A tool rather than a block inside smoke.js so the break battery can aim at
// it directly without paying for the whole suite.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

import { indexContent } from '../render/renderer.js';
import { feralTuning } from '../splice/feral.js';
import { rushTuning } from '../splice/rush.js';
import { taskforceTuning } from '../campaign/taskforce.js';
// R85: derived, not named — see data/loader.js.
import { CONTENT_FILES as FILES } from '../data/loader.js';
import { SAVE_VERSION } from '../save/save.js';
import { GRADES } from '../splice/extract.js';
import { GRADE_MOVE_BONUS } from '../battle/statblock.js';
import { PHYS_TUNING } from '../splice/physiology.js';
import { moduleFiles } from './scopecheck.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));


// Each is a mechanic §1-§5 has named since M0. `prose` is how the spec says
// it; `probe` is what the code would have to contain for it to be real.
const CLAIMS = [
  { name: 'Feral at instability 100', prose: /\bFeral\b/, probe: /feral/i },
  { name: 'Gene Juice', prose: /Gene Juice/i, probe: /gene ?juice/i },
];

export function shippedNumbers() {
  const content = indexContent(Object.fromEntries(FILES.map((n) => [n, readJSON(`data/${n}.json`)])));
  const regions = readJSON('data/regions.json').regions;
  return {
    species: Object.keys(content.species).length,
    parts: Object.keys(content.parts).length,
    frames: Object.keys(content.frames).length,
    regions: regions.length,
    nodes: regions.reduce((n, r) => n + r.nodes.length, 0),
    keywords: Object.keys(content.keywords).length,
    combos: Object.keys(content.combos).length,
    grades: GRADES.length,
    // R84 — §3.3 now states what a grade is WORTH, not just how many there
    // are, and R77's rule is that a stated number is a checked one. Both are
    // read out of the code rather than restated here, so retuning either one
    // fails this before it reaches a player who was told the old figure.
    'grade multipliers': GRADES.map((g) => g.mult).join('/'),
    'grade move bonus percent': Math.round(GRADE_MOVE_BONUS * 100),
    'enemy units': Object.keys(content.enemies).length,
    encounters: Object.keys(content.encounters).length,
    rivals: Object.keys(content.rivals).length,
    'save version': SAVE_VERSION,
    'settle minutes at instability 0': PHYS_TUNING.settleBaseMs / 60000,
    // The top of the scale, rounded the way prose rounds it.
    'settle hours at instability 100':
      Math.round(((PHYS_TUNING.settleBaseMs + PHYS_TUNING.settleMaxExtraMs) / 3600000) * 10) / 10,
    // R85 — §3.4 now states the price of the top of the scale, so R77's rule
    // applies to all four of its numbers. Read out of data/feral.json through
    // the same function the Pens and the tick read, so retuning the mechanic
    // fails here rather than leaving the spec quietly describing a game that
    // no longer exists.
    'feral bond floor': feralTuning(content).bondFloor,
    'feral neglect hours': feralTuning(content).neglectHours,
    'feral window hours': feralTuning(content).windowHours,
    // R86 — §3.9 states the price of a rush, which is also the Infirmary's
    // price. Read through the same function both call, so retuning it in
    // data fails here rather than leaving the spec quoting the old figure.
    'rush base dollars': rushTuning(content).base,
    'rush dollars per hour': rushTuning(content).perHour,
    // R87 — §3.9 states what the endgame costs, so R77's rule applies to all
    // three of its numbers. Read through the same function the tick and the
    // War Room card read, so retuning the raid in data fails here rather
    // than leaving the spec quoting the old figure.
    'notoriety ceiling': taskforceTuning(content).notorietyCap,
    'task force levy percent': Math.round(taskforceTuning(content).fineFraction * 100),
    'task force window hours': taskforceTuning(content).windowHours,
    // Rolled per capture in campaign.js. Read the literal rather than
    // restating it, so widening the window fails here.
    'dissection hours': (readFileSync(join(root, 'campaign/campaign.js'), 'utf8')
      .match(/const hours = randInt\(rng,\s*(\d+),\s*(\d+)\)/) ?? []).slice(1, 3).join('-'),
  };
}

export function checkRoadmap() {
  const problems = [];
  const note = (msg) => problems.push(msg);
  const roadmap = readFileSync(join(root, 'ROADMAP.md'), 'utf8');

  // --- 1. the numbers -----------------------------------------------------
  const block = roadmap.split('### 4.0 Shipped, as measured')[1]?.split('###')[0] ?? '';
  if (!block.trim()) {
    note('ROADMAP.md has no "### 4.0 Shipped, as measured" block to check');
    return problems;
  }
  const stated = {};
  for (const m of block.matchAll(/^- ([a-z][a-z0-9 ]*?):\s*(.+)$/gim)) stated[m[1].trim()] = m[2].trim();

  const truth = shippedNumbers();
  for (const key of Object.keys(truth)) {
    if (!(key in stated)) note(`§4.0 does not state "${key}" (shipped: ${truth[key]})`);
  }
  for (const key of Object.keys(stated)) {
    if (!(key in truth)) note(`§4.0 states "${key}", which nothing here can check`);
  }
  for (const [key, value] of Object.entries(truth)) {
    if (key in stated && String(value) !== String(stated[key])) {
      note(`§4.0 says ${key} is ${stated[key]}; shipped is ${value}`);
    }
  }
  // The rounding above must not be doing the work: 3 h is a real reading of
  // the tuning, not a number that lands wherever the prose wants it.
  const ceiling = (PHYS_TUNING.settleBaseMs + PHYS_TUNING.settleMaxExtraMs) / 3600000;
  if (Math.abs(ceiling - Number(stated['settle hours at instability 100'])) > 0.1) {
    note(`the settle ceiling is ${ceiling.toFixed(2)}h, which §4.0 does not round to`);
  }

  // --- 2. no mechanic is promised that does not exist ---------------------
  //
  // The live spec is everything before the milestone log. Split on the §6
  // heading rather than a line number, so the log growing cannot silently
  // drag a section out of scope.
  const liveSpec = roadmap.split('## 6. Milestones')[0];
  if (liveSpec.length < 2000) note('the live spec (§1-§5) could not be found');
  // R86 — comments stripped before probing. Break 51 of the battery went
  // MISSED the day splice/rush.js landed with a header explaining why an
  // earned skip currency was NOT built: the probe found the mechanic's name
  // in that sentence and scored the promise as kept. A probe a comment can
  // satisfy is R10's dead-prose problem inverted — prose with no code behind
  // it, passing for code.
  const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const engineSource = moduleFiles()
    .map((f) => relative(root, f))
    .filter((f) => !f.startsWith('tools/'))
    .map((f) => stripComments(readFileSync(join(root, f), 'utf8')))
    .join('\n');

  for (const claim of CLAIMS) {
    if (!claim.prose.test(liveSpec)) continue;   // not promised — nothing to check
    if (claim.probe.test(engineSource)) continue; // promised and built — fine
    // Promised and NOT built: the line naming it must say so, and name the
    // phase that will. "Designed but absent" is a legitimate state for a
    // design document; "designed, absent, and written as though it works" is
    // the thing this gate exists to stop.
    const line = liveSpec.split('\n').find((l) => claim.prose.test(l)) ?? '';
    const marker = line.match(/not shipped — queued as (R\d+)/);
    if (!marker) {
      note(`${claim.name} is designed in the live spec and has no implementation, so its line must `
        + `say "not shipped — queued as R##":\n      ${line.trim().slice(0, 150)}`);
      continue;
    }
    if (!new RegExp(`- \\*\\*${marker[1]} — `).test(roadmap)) {
      note(`${claim.name} points at ${marker[1]}, which this roadmap does not carry as a phase`);
    }
  }
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const problems = checkRoadmap();
  if (problems.length) {
    console.error(`roadmap ✗  ${problems.length} claim${problems.length === 1 ? ' has' : 's have'} drifted`);
    for (const p of problems) console.error(`  · ${p}`);
    process.exit(1);
  }
  const n = Object.keys(shippedNumbers()).length;
  console.log(`roadmap ✓  ${n} stated numbers match the data · every named mechanic exists or is queued`);
}
