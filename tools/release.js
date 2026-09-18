// R100 — A FORGOTTEN CACHE BUMP USED TO COST TEN MINUTES. NOW IT IS FOREVER.
//
// `docs/TWA.md` carried "Bump CACHE in sw.js with the release" as a checklist
// box — an instruction to a human, which is the weakest kind of rule this repo
// has. Under the network-first worker that was survivable: a stale cache
// drained on its own, because every request went to the network first anyway.
// R100 turned the worker round, and the same mistake now means a phone serves
// the old build indefinitely. That is R122's original bug report, and it was
// reported by a person holding a phone rather than by anything in the suite.
//
// So the box stops being a box. `CACHE` carries a HASH OF THE SHELL, and this
// gate recomputes it: change any file the worker precaches without bumping the
// version and the build goes red, naming the files that moved. There is
// nothing to remember, which is the only reliable kind of discipline.
//
// WHY THE HASH AND NOT `SAVE_VERSION`. The entry proposed checking CACHE
// against SAVE_VERSION, and that rule is too weak by construction: SAVE_VERSION
// moves only when the SAVE SCHEMA changes, and most releases do not touch it.
// R100 itself is one — it rewrote the service worker, the save path and two
// gates, and changed no schema at all. A CACHE tied to SAVE_VERSION would have
// sat still through exactly the release that made staleness permanent.
// SAVE_VERSION stays in the NAME because it is what a human reading
// `caches.keys()` in a debugger wants to see; the hash is what is checked.
//
// `--fix` rewrites the line. A gate whose remedy is a chore gets negotiated
// with; one whose remedy is a command gets obeyed.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIX = process.argv.includes('--fix');
const swPath = join(root, 'sw.js');

// WHAT THIS HASHES IS THE SHELL, AND sw.js IS NOT IN IT. A service worker does
// not precache itself, and it does not need to: the browser revalidates it on
// every navigation, so a changed sw.js installs itself. What cannot self-deliver
// is everything sw.js HOLDS — 116 files a cache-first worker will never ask
// about again — and that is exactly what this hash covers.
//
// (The first version of this file carried a branch blanking the CACHE line
// before hashing sw.js, to avoid a fixed point: writing a hash into the file
// whose hash it is. The branch was dead the moment it was written, because
// `shellFiles` never returns sw.js. Removed rather than left as a comment
// about a problem that cannot occur.)
const CACHE_LINE = /const CACHE = '([^']+)';/;

export function shellFiles(sw = readFileSync(swPath, 'utf8')) {
  const list = sw.match(/const SHELL = \[([\s\S]*?)\n\];/)?.[1] ?? '';
  return [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((f) => f !== '.');
}

export function shellHash(sw = readFileSync(swPath, 'utf8')) {
  const h = createHash('sha256');
  // Sorted, so the hash is about the CONTENT of the shell and not about the
  // order somebody happened to list it in. A reordered SHELL is not a new
  // build and must not look like one.
  for (const rel of [...shellFiles(sw)].sort()) {
    const abs = join(root, rel);
    if (!existsSync(abs)) continue;          // reported separately below
    h.update(rel);
    h.update(readFileSync(abs));
  }
  return h.digest('hex').slice(0, 8);
}

export function checkRelease() {
  const problems = [];
  const sw = readFileSync(swPath, 'utf8');
  const current = sw.match(CACHE_LINE)?.[1];
  if (!current) return ['sw.js has no `const CACHE = \'…\';` line to check'];

  // Every precached path has to exist, or the worker's `install` rejects and
  // the app has no offline story at all — `cache.addAll` is all-or-nothing.
  const missing = shellFiles(sw).filter((f) => !existsSync(join(root, f)));
  if (missing.length) {
    problems.push(`sw.js precaches ${missing.length} file(s) that are not on disk, so install() rejects `
      + `and nothing is cached at all: ${missing.join(', ')}`);
  }

  const want = `spliceworld-v${saveVersion()}-${shellHash(sw)}`;
  if (current !== want) {
    problems.push(`the shell has changed and CACHE has not: it reads '${current}' and should read '${want}'`
      + ' — run `npm run release -- --fix`');
  }
  return problems;
}

// Read rather than imported: `save/save.js` pulls the whole boot graph in, and
// this tool has no business compiling the game to read one integer.
function saveVersion() {
  const src = readFileSync(join(root, 'save', 'save.js'), 'utf8');
  const n = Number(src.match(/export const SAVE_VERSION = (\d+)/)?.[1]);
  if (!Number.isInteger(n)) throw new Error('save/save.js has no readable SAVE_VERSION');
  return n;
}

// R178 — RUN THE GATE ONLY WHEN THIS IS THE COMMAND, NOT WHEN IT IS IMPORTED.
//
// This file exports `shellFiles` AND checked the release at module scope, so
// `await import('./release.js')` ran the whole gate as a side effect — printing
// into its importer's output and, on a red tree, calling `process.exit(1)`
// before the importer's own code got a line. R178 makes tools/smoke.js read the
// shell through `shellFiles`, which would have killed the suite mid-block and
// reported the right answer for entirely the wrong reason.
//
// `node tools/release.js`, `npm run release` and the battery's CACHEBUMP gate
// all still take this branch: they ARE the command. Nothing about the gate's
// behaviour moves — only whether importing the parser drags it along.
const RUN_AS_COMMAND = process.argv[1]
  && fileURLToPath(import.meta.url) === process.argv[1];

if (!RUN_AS_COMMAND) {
  // imported for `shellFiles` / `shellHash` / `checkRelease`; nothing to do.
} else if (FIX) {
  const sw = readFileSync(swPath, 'utf8');
  const want = `spliceworld-v${saveVersion()}-${shellHash(sw)}`;
  const was = sw.match(CACHE_LINE)?.[1];
  if (was === want) {
    console.log(`release ✓  CACHE is already '${want}'`);
  } else {
    writeFileSync(swPath, sw.replace(CACHE_LINE, `const CACHE = '${want}';`));
    console.log(`release ✓  CACHE '${was}' -> '${want}'`);
  }
} else {
  const problems = checkRelease();
  if (problems.length) {
    console.error(`release ✗  ${problems.length} problem${problems.length > 1 ? 's' : ''}:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  const sw = readFileSync(swPath, 'utf8');
  console.log(`release ✓  CACHE names the shell it actually holds `
    + `(${shellFiles(sw).length} files, v${saveVersion()}-${shellHash(sw)})`);
}
