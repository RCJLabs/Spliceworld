// R101 — A REAL SAVE OF EVERY VERSION, TAKEN FROM THE VERSION ITSELF.
//
// The migration chain was only ever tested against a six-key object written
// by hand in smoke.js. The fix is not a better hand-written stub — it is to
// stop writing them. Git holds the commit where SAVE_VERSION was 29; that
// tree's `save/save.js` is the code that wrote every real v29 save; so ask
// IT for a new game and the fixture is not a reconstruction of the era, it
// is the era.
//
// Every version 1 through the current one has such a commit — checked, not
// assumed: the map below is rebuilt from `git log` on each run rather than
// hardcoded, so a version that loses its commit is a loud failure and not a
// silently stale table.
//
// ENRICHED WHERE THE ERA ALLOWS IT. A new game is the emptiest save there
// is, and a migration that walks a herd does nothing on an empty one. So
// each fixture is also run through its own era's `ensureRanchSeeded`, which
// puts real animals of that era in the pen. That is done era-agnostically —
// every JSON in the era's `data/` indexed by its own `indexContent` — since
// the loader's API drifted across forty-five versions and the fixture
// generator must not depend on which side of a rename it lands on. v1
// predates the ranch entirely and is correctly bare.
//
// DETERMINISM IS THE POINT (R127's lesson, one milestone old). A generator
// whose output moves cannot be checked against what shipped, so the clocks
// and the world seed are stamped to constants after generation and
// `--check` recomputes and compares rather than writing.
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { SAVE_VERSION } from '../save/save.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'tools', 'saves');
const CHECK = process.argv.includes('--check');

// Fixed stamps, so two runs agree. Any epoch-ms number in a generated save
// is one of these clocks; the world seed is drawn from a real RNG.
const STAMP = 1700000000000;
const SEED = 424242;

const git = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });

// The last commit at each version — the mature end of that era, right
// before the bump. Rebuilt every run from history.
function versionCommits() {
  const map = new Map();
  for (const c of git('log', '--format=%H', '--reverse', '--', 'save/save.js').trim().split('\n')) {
    let src;
    try { src = git('show', `${c}:save/save.js`); } catch { continue; }
    const m = src.match(/SAVE_VERSION\s*=\s*(\d+)/);
    if (m) map.set(Number(m[1]), c);
  }
  return map;
}

// Clocks and seeds to constants, in place, at any depth.
function settle(v) {
  if (Array.isArray(v)) { v.forEach(settle); return; }
  if (v === null || typeof v !== 'object') return;
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === 'number' && val > 1.4e12 && val < 4e12) v[k] = STAMP;
    else if (k === 'seed' && typeof val === 'number') v[k] = SEED;
    else settle(val);
  }
}

async function fixtureFor(version, commit, work) {
  const tree = join(work, `v${version}`);
  mkdirSync(tree, { recursive: true });
  execFileSync('bash', ['-c', `git -C ${root} archive ${commit} | tar -x -C ${tree}`]);
  const url = (p) => pathToFileURL(join(tree, p)).href;
  const { newGameState } = await import(url('save/save.js'));
  const save = newGameState();
  // The world seed BEFORE the ranch is stocked, not after. Seeding draws
  // the era's animals through this seed, so stamping it afterwards left
  // every fixture with a randomly drawn herd — 44 of 45 moved between two
  // runs, and `--check` said so on its first outing.
  save.seed = SEED;
  let stocked = false;
  // Best effort: an era that has no ranch, or whose seeding needs something
  // this cannot supply, yields the bare new game rather than nothing.
  try {
    const { indexContent } = await import(url('render/renderer.js'));
    const { ensureRanchSeeded } = await import(url('ranch/ranch.js'));
    const raw = {};
    for (const f of readdirSync(join(tree, 'data')).filter((n) => n.endsWith('.json'))) {
      raw[f.replace(/\.json$/, '')] = JSON.parse(readFileSync(join(tree, 'data', f), 'utf8'));
    }
    ensureRanchSeeded(save, indexContent(raw), STAMP);
    stocked = (save.ranch?.stock?.length ?? 0) > 0;
  } catch { /* an era without a ranch — v1 is one */ }
  settle(save);
  return { save, stocked };
}

const commits = versionCommits();
const work = join(tmpdir(), `sw-saves-${process.pid}`);
mkdirSync(work, { recursive: true });
const missing = [];
const written = [];
const stale = [];
let stockedCount = 0;

try {
  if (!CHECK) mkdirSync(out, { recursive: true });
  for (let v = 1; v <= SAVE_VERSION; v++) {
    const commit = commits.get(v);
    if (!commit) { missing.push(v); continue; }
    const { save, stocked } = await fixtureFor(v, commit, work);
    if (stocked) stockedCount++;
    const text = `${JSON.stringify(save, null, 2)}\n`;
    const file = join(out, `v${v}.json`);
    if (CHECK) {
      if (!existsSync(file)) stale.push(`v${v}.json is not on disk`);
      else if (readFileSync(file, 'utf8') !== text) stale.push(`v${v}.json is not what v${v}'s own code produces`);
    } else {
      writeFileSync(file, text);
      written.push(v);
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

if (missing.length) {
  console.error(`gen-saves ✗  no commit in history has SAVE_VERSION at ${missing.join(', ')} — a fixture cannot be taken from a version that left no trace`);
  process.exit(1);
}
if (CHECK) {
  if (stale.length) {
    console.error(`gen-saves ✗  ${stale.length} fixture${stale.length === 1 ? '' : 's'} out of step`);
    for (const s of stale) console.error(`  · ${s}`);
    process.exit(1);
  }
  console.log(`gen-saves ok  every fixture v1–v${SAVE_VERSION} is exactly what that version's own code writes (${stockedCount} with a stocked ranch)`);
} else {
  console.log(`gen-saves ✓  ${written.length} fixtures written, v1–v${SAVE_VERSION}, ${stockedCount} of them with a stocked ranch`);
}
