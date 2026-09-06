// R101 — DOES THE CHAIN ACTUALLY WORK, OR DOES IT ONLY WORK ON A STUB?
//
// `migrate` walks a save from its version to the current one, one step at a
// time, and the suite has always checked that it arrives. What it checked it
// on was a SIX-KEY OBJECT hand-written in smoke.js:
//
//     const v1Save = { saveVersion: 1, seed, createdAt, spliceCount,
//                      genome, directorStats };
//
// Every later step therefore saw a save assembled by chaining migrations
// over that stub — never a save of its own version. A real v43 save carries
// 34 keys; migration 44 had never seen one. Twenty-odd steps of the chain
// were, in the roadmap's words, never replayed against a real save of their
// version, and this is the gate that says so.
//
// The fixtures are not invented. `tools/gen-saves.js` checks out the commit
// where SAVE_VERSION was N, imports THAT tree's `save/save.js`, and asks it
// for a new game — so `v29.json` is a save the game itself wrote in the era
// when 29 was current, not a reconstruction. Git had every version.
//
// THE SHAPE TEST IS THE STRONG HALF. Arriving at the current version proves
// only that no step threw. What a player needs is that the save they end up
// with is the same shape as the one a new game starts with, because that is
// the shape every screen reads. So a new game IS the specification: every
// key it has, the migrated save must have. An EMPTY container specifies
// nothing — a new game has no chimeras, and a save that has some is not
// wrong — which keeps the rule honest without hand-listing the fields.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAVE_VERSION, newGameState, migrate } from '../save/save.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'tools', 'saves');
const problems = [];

// The specification, walked against a candidate. Recurses through plain
// objects only; arrays and empty objects say nothing about shape.
function compareShape(spec, got, path, out) {
  if (!isPlain(spec) || !Object.keys(spec).length) return;
  if (!isPlain(got)) { out.push(`${path} is ${got === undefined ? 'missing' : typeof got}, and a new game has an object there`); return; }
  for (const k of Object.keys(spec)) {
    if (!(k in got)) { out.push(`${path}.${k} is missing`); continue; }
    compareShape(spec[k], got[k], `${path}.${k}`, out);
  }
}
const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const fresh = newGameState();
let populated = 0;
const seen = [];

for (let v = 1; v <= SAVE_VERSION; v++) {
  const file = join(dir, `v${v}.json`);
  if (!existsSync(file)) {
    problems.push(`v${v} has no fixture — a migration ships with the save it was written for (tools/saves/v${v}.json)`);
    continue;
  }
  let fixture;
  try { fixture = JSON.parse(readFileSync(file, 'utf8')); }
  catch (err) { problems.push(`v${v}'s fixture will not parse: ${err.message}`); continue; }
  if (fixture.saveVersion !== v) {
    problems.push(`v${v}'s fixture says it is v${fixture.saveVersion} — it is not a save of the version it stands for`);
    continue;
  }
  if ((fixture.ranch?.stock?.length ?? 0) > 0) populated++;
  seen.push(v);
  let out;
  try {
    out = await migrate(structuredClone(fixture), 1700000000000);
  } catch (err) {
    problems.push(`a real v${v} save does not survive the chain: ${err.message}`);
    continue;
  }
  if (out.saveVersion !== SAVE_VERSION) {
    problems.push(`a real v${v} save stops at v${out.saveVersion} instead of v${SAVE_VERSION}`);
    continue;
  }
  const bad = [];
  compareShape(fresh, out, 'save', bad);
  for (const b of bad.slice(0, 4)) problems.push(`a migrated v${v} save is missing what a new game has: ${b}`);
}

if (problems.length) {
  console.error(`saves ✗  ${problems.length} problem${problems.length === 1 ? '' : 's'}`);
  for (const p of problems.slice(0, 25)) console.error(`  · ${p}`);
  if (problems.length > 25) console.error(`  · …and ${problems.length - 25} more`);
  process.exit(1);
}
console.log(`saves ✓  a real save of every version v1–v${SAVE_VERSION} migrates to v${SAVE_VERSION}`
  + ` and lands on exactly the shape a new game has · ${seen.length} fixtures, ${populated} with a stocked ranch`);
