// R90 — THE SUITE, RUN ALL AT ONCE.
//
// `npm test` was five tools end to end and ten and a half minutes, of which
// smoke was ten. Profiled, smoke's time is not spread: after the balance
// sweep was pooled and the gene probe memoised it is 331s, and the top
// sixteen sections are 98% of that. The tail is 5.7 SECONDS.
//
// That is what makes shards the right shape rather than a file split. Each
// shard is the WHOLE of smoke.js with only its own share of the heavy blocks
// enabled (see SHARD_OF there), so the union covers every assertion by
// construction and the duplicated cheap work costs four times six seconds.
// Moving 17,790 lines into separate files would buy the same concurrency and
// risk dropping assertions in a way no reviewer could eyeball.
//
// Everything runs concurrently, including the four non-smoke tools, and the
// exit code is the worst of them. `--only <name>` runs one.
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;

const JOBS = [
  { name: 'smoke:a', file: 'tools/smoke.js', env: { SW_SHARD: 'a' } },
  { name: 'smoke:b', file: 'tools/smoke.js', env: { SW_SHARD: 'b' } },
  { name: 'smoke:c', file: 'tools/smoke.js', env: { SW_SHARD: 'c' } },
  { name: 'smoke:d', file: 'tools/smoke.js', env: { SW_SHARD: 'd' } },
  { name: 'scopecheck', file: 'tools/scopecheck.js', env: {} },
  { name: 'saves', file: 'tools/saves.js', env: {} },
  { name: 'handlers', file: 'tools/handlers.js', env: {} },
  { name: 'roadmap', file: 'tools/roadmap.js', env: {} },
];

const picked = only ? JOBS.filter((j) => j.name === only || j.name.startsWith(`${only}:`)) : JOBS;
if (!picked.length) {
  console.error(`suite ✗  no job called "${only}" (have: ${JOBS.map((j) => j.name).join(', ')})`);
  process.exit(1);
}

const started = Date.now();
const results = await Promise.all(picked.map((job) => new Promise((resolve) => {
  const t0 = Date.now();
  const p = spawn('node', [job.file], { cwd: root, env: { ...process.env, ...job.env } });
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { out += d; });
  p.on('close', (code) => resolve({ ...job, code, ms: Date.now() - t0, out }));
})));

const wall = Date.now() - started;
const failed = results.filter((r) => r.code !== 0);
for (const r of results.sort((a, b) => b.ms - a.ms)) {
  console.log(`  ${r.code === 0 ? '✓' : '✗'} ${r.name.padEnd(11)} ${(r.ms / 1000).toFixed(1)}s`);
}
if (failed.length) {
  for (const r of failed) {
    console.error(`\n--- ${r.name} ---`);
    console.error(r.out.split('\n').slice(-40).join('\n'));
  }
  console.error(`\nsuite ✗  ${failed.length} of ${results.length} failed in ${(wall / 1000).toFixed(1)}s`);
  process.exit(1);
}
// The budget R90 exists to meet. A ceiling rather than a fingerprint, and it
// sits just above the measurement so creep fails — the same rule the eager
// import cap and the height budget are written to.
const BUDGET_S = 180;
console.log(`\nsuite ✓  ${results.length} jobs in ${(wall / 1000).toFixed(1)}s wall-clock`
  + ` (sum ${(results.reduce((a, r) => a + r.ms, 0) / 1000).toFixed(0)}s of work)`);
if (!only && wall / 1000 > BUDGET_S) {
  console.error(`suite ✗  ${(wall / 1000).toFixed(1)}s is over the ${BUDGET_S}s budget`);
  process.exit(1);
}
