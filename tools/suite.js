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
import { availableParallelism } from 'node:os';
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
  // R91 — the save's own weight. It walks a 180-day campaign, which costs
  // about fifteen seconds; it goes on the shortest lane and does not move the
  // wall-clock, because the four smoke shards are what the budget is made of.
  { name: 'vault', file: 'tools/vault.js', env: {} },
  // R92 — the walk plays every system, and says so. R95 — and can a player
  // reach the content? The two gates ask about the SAME seven 180-day
  // campaigns, so they share one lane and one set of walks: coverage runs
  // first and fills the walk cache, reach reads it. Split across two lanes
  // they walked fourteen campaigns for seven and put the suite 16s over
  // budget.
  { name: 'walks', files: ['tools/coverage.js', 'tools/reach.js'], env: {} },
];

const picked = only ? JOBS.filter((j) => j.name === only || j.name.startsWith(`${only}:`)) : JOBS;
if (!picked.length) {
  console.error(`suite ✗  no job called "${only}" (have: ${JOBS.map((j) => j.name).join(', ')})`);
  process.exit(1);
}

// R90 — AT MOST ONE JOB PER CORE. The first run put eight processes on four
// cores and every one of them ran at roughly half speed: 878s of work in
// 266s of wall-clock, against a 180s budget. Oversubscription does not add
// throughput, it just makes every job's timing a lie about its own cost.
const LANES = Math.max(1, availableParallelism());
const started = Date.now();
const queue = [...picked];
const results = [];
// R95 — a job may be SEVERAL tools, run one after another on one lane. Two
// gates that walk the same campaigns should walk them once: `coverage` and
// `reach` both ask about the same seven 180-day seeds, and in parallel they
// each paid for their own set — 14 walks for 7 campaigns, and the suite went
// 196s against a 180s budget. Sequenced on one lane, the second reads the
// walk cache the first just wrote and costs almost nothing.
const spawnOne = (file, env) => new Promise((resolve) => {
  const p = spawn('node', [file], { cwd: root, env: { ...process.env, ...env } });
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { out += d; });
  p.on('close', (code) => resolve({ code, out }));
});
const runOne = async (job) => {
  const t0 = Date.now();
  let out = '';
  let code = 0;
  for (const file of job.files ?? [job.file]) {
    const r = await spawnOne(file, job.env);
    out += r.out;
    // Every tool in the job runs even when an earlier one fails: a job that
    // stopped at the first red would hide the second gate's verdict, and the
    // whole point of the suite is that one run says everything.
    if (r.code !== 0) code = r.code;
  }
  return { ...job, code, ms: Date.now() - t0, out };
};
await Promise.all(Array.from({ length: Math.min(LANES, queue.length) }, async () => {
  // Longest first, so a big job never starts last and leaves cores idle
  // behind it. The shards are ordered ahead of the small tools by cost.
  while (queue.length) results.push(await runOne(queue.shift()));
}));

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
const work = (results.reduce((a, r) => a + r.ms, 0) / 1000).toFixed(0);
if (!only && wall / 1000 > BUDGET_S) {
  console.error(`\nsuite ✗  every job passed, but ${(wall / 1000).toFixed(1)}s is over the ${BUDGET_S}s budget (sum ${work}s of work)`);
  process.exit(1);
}
console.log(`\nsuite ✓  ${results.length} jobs in ${(wall / 1000).toFixed(1)}s wall-clock (sum ${work}s of work)`);
