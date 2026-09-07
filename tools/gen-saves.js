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
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { SAVE_VERSION } from '../save/save.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'tools', 'saves');
const CHECK = process.argv.includes('--check');

// R101 — TWO CHECKS, BECAUSE THE BATTERY HAS NO GIT.
//
// Regenerating a fixture needs history: `git archive` of the commit where
// that version was current. The break battery copies the tree WITHOUT `.git`
// and runs each gate there, so the git-backed check cannot run — and on its
// first outing it failed in the copy whether the tree was broken or not,
// which made its own break register as "caught" for entirely the wrong
// reason. A gate that fails identically on a clean tree proves nothing.
//
// So the fixtures ship with a manifest of their hashes. With history, this
// regenerates everything and compares — the strong question, "is this what
// that version's code writes?". Without it, it compares each fixture to its
// recorded hash — the weaker but still real question, "has anyone edited one
// of these by hand?" — which is exactly what break 136 does.
const INDEX = 'index.json';
const sha = (text) => createHash('sha256').update(text).digest('hex');
const hasGit = () => {
  try { git('rev-parse', '--git-dir'); return true; } catch { return false; }
};

// Fixed stamps, so two runs agree. Any epoch-ms number in a generated save
// is one of these clocks; the world seed is drawn from a real RNG.
const STAMP = 1700000000000;
const SEED = 424242;

// stderr piped, not inherited: `hasGit()` below EXPECTS to fail in a tree
// copied without .git, and a stray `fatal: not a git repository` printed
// above a passing line reads like a broken gate.
const git = (...a) => execFileSync('git', ['-C', root, ...a],
  { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['pipe', 'pipe', 'pipe'] });

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

if (CHECK && !hasGit()) {
  // The copied-tree path: hashes only, and it says so rather than passing
  // quietly and letting a reader think the strong check ran.
  const idxPath = join(out, INDEX);
  if (!existsSync(idxPath)) {
    console.error('gen-saves ✗  no fixture manifest, and no git history to rebuild one from');
    process.exit(1);
  }
  const idx = JSON.parse(readFileSync(idxPath, 'utf8'));
  const bad = [];
  for (const [name, want] of Object.entries(idx.sha256 ?? {})) {
    const f = join(out, name);
    if (!existsSync(f)) { bad.push(`${name} is missing`); continue; }
    if (sha(readFileSync(f, 'utf8')) !== want) bad.push(`${name} has been edited by hand since it was generated`);
  }
  if (bad.length) {
    console.error(`gen-saves ✗  ${bad.length} fixture${bad.length === 1 ? '' : 's'} out of step`);
    for (const b of bad) console.error(`  · ${b}`);
    process.exit(1);
  }
  console.log(`gen-saves ok  ${Object.keys(idx.sha256 ?? {}).length} fixtures match their recorded hashes (no git here, so the regeneration check was not the one that ran)`);
  process.exit(0);
}

const commits = versionCommits();
const work = join(tmpdir(), `sw-saves-${process.pid}`);
mkdirSync(work, { recursive: true });
const manifest = {};
const fromCommit = {};
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
    manifest[`v${v}.json`] = sha(text);
    fromCommit[v] = commit;
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
const indexText = `${JSON.stringify({
  _doc: 'R101 — one real save per version, taken from the commit where that version was current. '
    + 'Regenerate with `npm run gen-saves`; `--check` regenerates and compares where git history is '
    + 'available, and falls back to these hashes where it is not (the break battery copies the tree '
    + 'without .git). Do not hand-edit a fixture: it stops being a save the game actually wrote.',
  fixtures: Object.keys(manifest).length,
  fromCommit,
  sha256: manifest,
}, null, 2)}\n`;

if (CHECK) {
  // R90 — COMPARE THE CONTENT, NOT THE PROVENANCE. This compared the whole
  // index byte for byte, and `fromCommit` records which commit each fixture
  // was taken from — so squash-merging the branch that generated them
  // rewrote every hash and the gate went red on fixtures that had not
  // changed at all. A commit id is a fact about history, not about the save;
  // it stays in the file for a reader and out of the comparison.
  const idxPath = join(out, INDEX);
  if (!existsSync(idxPath)) stale.push(`${INDEX} is not on disk`);
  else {
    let have = null;
    try { have = JSON.parse(readFileSync(idxPath, 'utf8')); }
    catch (err) { stale.push(`${INDEX} will not parse: ${err.message}`); }
    if (have) {
      const want = JSON.parse(indexText);
      if (JSON.stringify(have.sha256) !== JSON.stringify(want.sha256)) {
        stale.push(`${INDEX} records hashes the fixtures beside it do not have`);
      }
      if (have.fixtures !== want.fixtures) {
        stale.push(`${INDEX} counts ${have.fixtures} fixtures and there are ${want.fixtures}`);
      }
    }
  }
  if (stale.length) {
    console.error(`gen-saves ✗  ${stale.length} fixture${stale.length === 1 ? '' : 's'} out of step`);
    for (const s of stale) console.error(`  · ${s}`);
    process.exit(1);
  }
  console.log(`gen-saves ok  every fixture v1–v${SAVE_VERSION} is exactly what that version's own code writes (${stockedCount} with a stocked ranch)`);
} else {
  writeFileSync(join(out, INDEX), indexText);
  console.log(`gen-saves ✓  ${written.length} fixtures written, v1–v${SAVE_VERSION}, ${stockedCount} of them with a stocked ranch`);
}
