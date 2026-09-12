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
import { readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// R156 — the box's own speed, so the budget below is denominated in it.
import { boxProbe, PROBE_REF_MS, PROBE_HASH } from './probe.js';
// R156 — and whether this run had to rebuild the 180-day walks, which is
// worth 15% and was never in the reading.
import { walkCacheState } from './fixtures.js';

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

// R95 — LONGEST FIRST, FROM A NUMBER RATHER THAN FROM THE ARRAY ORDER.
// The comment below has claimed "longest first" since R90 and the mechanism
// was the hand-written order of `JOBS`, which goes stale the first time
// somebody appends. `walks` (77s) was appended last, so it started only once
// the small tools had been picked up — at t=130 on a four-lane run — and
// finished at 207s against a 180s budget, on a suite whose total work had
// just gone DOWN. `cost` is a rough measured seconds, and wrong by a few
// seconds costs nothing: it decides order, never anything else.
const COST = {
  'smoke:a': 111, 'smoke:b': 104, 'smoke:c': 132, 'smoke:d': 134,
  walks: 77, vault: 24, handlers: 24, scopecheck: 2, roadmap: 1, saves: 1,
};
const picked = (only ? JOBS.filter((j) => j.name === only || j.name.startsWith(`${only}:`)) : JOBS)
  .slice().sort((a, b) => (COST[b.name] ?? 0) - (COST[a.name] ?? 0));
if (!picked.length) {
  console.error(`suite ✗  no job called "${only}" (have: ${JOBS.map((j) => j.name).join(', ')})`);
  process.exit(1);
}

// R90 — AT MOST ONE JOB PER CORE. The first run put eight processes on four
// cores and every one of them ran at roughly half speed: 878s of work in
// 266s of wall-clock, against a 180s budget. Oversubscription does not add
// throughput, it just makes every job's timing a lie about its own cost.
const LANES = Math.max(1, availableParallelism());
// R156 — BEFORE ANYTHING ELSE RUNS. Taken on an otherwise idle box, which is
// the only moment in this script where that is true, and taken in the PARENT
// — `childCpuSeconds` reads cutime+cstime, so the probe's own cost is not
// charged to the budget it calibrates.
const probeBefore = boxProbe();
const cacheAtStart = walkCacheState();
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

// R151 — WHAT A CHILD COST, NOT HOW LONG IT WAITED. Fields 16 and 17 of
// /proc/self/stat are `cutime` and `cstime`: the user and system time of
// every child this process has REAPED, in clock ticks. Node reaps a child
// before it emits `close`, so by the time the lanes are done the number is
// complete. `comm` is field 2 and may itself contain spaces and brackets, so
// the split starts after the LAST ')'. USER_HZ is 100 on every Linux that
// runs Node; nothing portable exposes it, and being wrong about it would
// make the budget wrong by a constant rather than unstable.
const childCpuSeconds = () => {
  const stat = readFileSync('/proc/self/stat', 'utf8');
  const f = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
  return (Number(f[13]) + Number(f[14])) / 100;
};

const wall = Date.now() - started;
const failed = results.filter((r) => r.code !== 0);
for (const r of results.sort((a, b) => b.ms - a.ms)) {
  console.log(`  ${r.code === 0 ? '\u2713' : '\u2717'} ${r.name.padEnd(11)} ${(r.ms / 1000).toFixed(1)}s`);
}
if (failed.length) {
  for (const r of failed) {
    console.error(`\n--- ${r.name} ---`);
    console.error(r.out.split('\n').slice(-40).join('\n'));
  }
  console.error(`\nsuite \u2717  ${failed.length} of ${results.length} failed in ${(wall / 1000).toFixed(1)}s`);
  process.exit(1);
}

// R151 — THE BUDGET IS CPU-SECONDS. WALL-CLOCK IS NOT A PROPERTY OF THE
// SUITE.
//
// R90's gate was 195 seconds of wall-clock and it held for sixty milestones.
// Then the SAME COMMIT read 185.9s and, an hour later, 242.1s. Not the code:
// a worktree at that commit was re-run cold and warm and read 241.2s both
// times, while a fixed integer-hash benchmark read 16ms before and after and
// four concurrent copies of it scaled perfectly on the four cores. The box
// has four real cores and they are the speed they always were.
//
// WHAT MOVED IS SLACK THE SUITE WAS NEVER ENTITLED TO. Measure any one job
// on an idle box and it burns about 1.3 CPU-seconds per wall-second — V8
// runs concurrent marking and background compilation off the main thread,
// and `--v8-pool-size=0` barely dents it (1.31 -> 1.29). `handlers` alone:
// 41.5s wall, 54.5s CPU. `smoke:b` alone: 124.6s wall, 166.2s CPU. So four
// lanes on four cores is not one job per core, it is 5.2 cores of demand on
// 4 — and whether that 30% costs anything is the HOST's decision, invisible
// from inside the VM. On a generous afternoon smoke:b reads 130.5s; on an
// ordinary one it reads 168s. Same code. Same box. Same idle.
//
// R90's own comment names this mistake and then makes a smaller version of
// it: "AT MOST ONE JOB PER CORE... oversubscription does not add throughput,
// it just makes every job's timing a lie about its own cost." It fixed
// eight-on-four and called four-on-four solved. A Node process is not one
// core.
//
// So the unit is the suite's own consumption. CPU-seconds do not move with
// the lane count, with how the host feels about background threads, or with
// what else is on the machine — they move when the suite actually does more
// work, which is the only thing this gate was ever for. Sum-of-wall (the old
// `work` line) is NOT that number: it is contaminated by exactly the
// contention it was being used to see past, and it drifted 698 -> 902
// alongside the wall-clock on identical source.
//
// MEASURED ON A QUIET BOX: see the ledger below. The budget sits just above
// it, like the import cap and the height budget.
//
// AND THE WALL CLOCK IS REPORTED, NEVER GATED. `effective lanes` is
// cpu/wall: how many of the lanes you asked for the box actually gave you.
// Four means you got what you asked for. Anything under is the host, and it
// is not the suite's fault and not the suite's to fail over.
//
// R151 LEDGER — the same suite, the same commit, three times in one evening.
// The second run had four spinning Node processes on the four cores beside
// it; the third ran alongside a full break battery:
//
//                       idle box    four burners    battery beside it
//   wall-clock             241.0s          429.5s              450.7s
//   sum-of-wall (R90)        926s           1648s               1729s
//   CPU-seconds              910s            921s                946s
//   effective lanes            3.8             2.1                 2.1
//                                            +78% wall, +1.2% CPU
//
// Both of the units the entry offered move with the box by the same 78%.
// Sum-of-wall is not a second opinion about wall-clock, it is the same
// opinion added up ten times. 910 is what this suite costs.
//
// CPU-seconds are not PERFECTLY flat and the budget should not pretend they
// are: contention costs real cycles in stalls and context switches, and the
// spread across those three is 910 -> 946, about 4%. So the ceiling sits
// above the WORST honest reading rather than above the quietest one. 1000 is
// +9.9% on a quiet box and +5.7% on a box already running its own battery —
// because the failure this milestone exists to end is a gate that goes red
// for the machine, and a gate nobody can pass on a bad afternoon is a gate
// that gets raised until it means nothing. Creep worth catching is tens of
// percent: breaking the walk cache costs 1255.
// R153 — 1000 -> 1200, AND R151'S INVARIANCE CLAIM WAS TOO STRONG.
//
// R151 replaced a wall-clock budget with CPU-seconds and proved the new unit
// flat against CONTENTION: idle 910, four spinning burners 921, a full break
// battery alongside 946 — 1.2% against wall-clock's 78%. That evidence is
// still good and the unit is still the right one. What it did not test, and
// what the wording "does not move with the box" over-claimed, is the host's
// per-cycle throughput over HOURS.
//
// Measured here the only honest way, a same-box A/B in the same ten minutes:
// this branch read 1012 and `main` at 200ac47 read 1022 — so the milestone
// costs nothing, and the suite that read 783 on the same commit earlier in
// the day now reads 1022. Readings since R151: 910, 823, 783, 1022. R151's
// own fixed integer benchmark moved with it (509-535ms then, 605ms now),
// which is the tell: it is the machine, and CPU-seconds see it because a
// stalled cycle is still a charged cycle.
//
// R156 TAKES THAT FIX, AND THE CEILING COMES BACK DOWN TO R151's NUMBER.
//
// `tools/probe.js` runs a fixed amount of integer work before and after the
// jobs and reports what it cost. The budget is denominated in that reading,
// so the number this gate checks is "CPU-seconds ON THE REFERENCE BOX" — a
// property of the suite — rather than CPU-seconds on whatever this machine
// felt like being today. A box 16% slower inflates the suite AND the probe,
// and the ratio does not move.
//
// AND THE SECOND VARIABLE, WHICH NOBODY WAS TRACKING AT ALL. Measured back
// to back in one window on one tree, probe steady at 1.00x:
//
//   warm walk cache      643   ·   again   631      (0.6% apart)
//   cold walk cache      736                        (+15%)
//
// The cache key covers every game file, so ANY milestone that edits one runs
// cold — which is most of them, and every one of those readings was being
// compared against a warm one. R153's "the suite that read 783 earlier in the
// day now reads 1022" spans exactly that boundary. So the run says which kind
// it was, because 15% that nobody names gets read as the machine.
//
// R158 — AND THE DIVISION IS WITHDRAWN, ONE DAY LATER, BECAUSE THE PROBE
// MEASURES THE WRONG THING.
//
// R156 shipped the normalisation as a stated bet: the probe would track what
// makes the suite expensive, and PROGRESS said so out loud. The day-apart
// reading the criterion asked for arrived on the very next session, on the
// identical seven seeds with a cold cache both times:
//
//                    raw CPU    probe        normalised
//   yesterday          722      107ms 1.00x     722
//   today              826       95ms 0.89x     931
//
// The suite got 14% MORE expensive while the probe says the box got 11%
// FASTER. Whatever the integer loop measures, it is not what this suite
// spends its cycles on — and dividing by it did not remove the drift, it
// nearly doubled it. One pair is enough to falsify "the ratio does not
// move"; it is not enough to say what the relationship is.
//
// The probe was chosen for being the quietest of three candidates. The one
// it beat was a pointer chase over 8MB — every step a cache miss — rejected
// for a 6% spread that was read as its own weather. This suite is allocation
// and GC, not register arithmetic, so the rejected probe was the one shaped
// like the workload, and its "noise" was never tested against the suite's.
// That is the experiment R160 is filed for.
//
// SO THE PROBE STAYS AND THE DIVISION GOES. It is printed on every run,
// because a box that moved 11% overnight is worth knowing about and nothing
// else in the tree could say so. It is a diagnostic, not a denominator.
//
// 1100, ON RAW CPU-SECONDS. The observed spread on IDENTICAL work across two
// days is 722 -> 826, 14%; R158's six extra reach seeds cost about 105 more
// (931 measured cold today); so 1100 covers the expensive day with 18% over
// it, which is the size of the drift actually observed rather than a number
// chosen to feel safe. R153's 1200 was closer to right than R156's 900, and
// saying so is cheaper than discovering it again.
//
// TWO READINGS, NOT ONE, and the mean of them. The probe runs after the jobs
// as well as before, because a box that changes speed halfway through a
// four-minute suite would otherwise be calibrated against the half it was
// not. When the two disagree by more than a little the run says so — that
// disagreement is the drift itself, caught live.
const CPU_BUDGET_S = 1100;
const probeAfter = boxProbe();
const cpu = childCpuSeconds();
const work = (results.reduce((a, r) => a + r.ms, 0) / 1000).toFixed(0);
// A budget that cannot read its own number must not pass quietly: a rule
// with nothing to look at is a rule that always agrees with you. There is no
// wall-clock fallback on purpose — that is the unit R151 removed.
if (!only && (!Number.isFinite(cpu) || cpu <= 0)) {
  console.error('\nsuite \u2717  every job passed, but the suite could not read its own CPU cost');
  console.error('   /proc/self/stat gave nothing usable, so the budget has nothing to check.');
  process.exit(1);
}
// R156 — AND THE SAME RULE FOR THE CALIBRATION. A probe that reads NaN, zero
// or a wild number would silently scale the budget to anything at all, which
// is worse than no calibration: R154 shipped a budget that could go NaN and
// `x > NaN` is false, so every comparison passes in silence. The band is
// deliberately wide — a box half the speed of the reference is a box this
// should still calibrate for — and anything outside it is a broken probe
// rather than a slow machine.
const probeMs = (probeBefore.ms + probeAfter.ms) / 2;
const probeFactor = probeMs / PROBE_REF_MS;
if (!only) {
  const bad = [];
  for (const [when, p] of [['before', probeBefore], ['after', probeAfter]]) {
    if (!Number.isFinite(p.ms) || p.ms <= 0) bad.push(`the ${when} reading is ${p.ms}, not a duration`);
    if (p.hash !== PROBE_HASH) {
      bad.push(`the ${when} probe computed ${p.hash} where the pinned answer is ${PROBE_HASH}`
        + ' — it is no longer doing the work the reference was measured on');
    }
  }
  if (probeFactor < 0.25 || probeFactor > 4) {
    bad.push(`the box reads ${probeFactor.toFixed(2)}x the reference (${probeMs.toFixed(1)}ms`
      + ` against ${PROBE_REF_MS}ms), which is outside anything a machine does`);
  }
  if (bad.length) {
    console.error('\nsuite \u2717  every job passed, but the budget has nothing to calibrate against');
    for (const b of bad) console.error(`   \u00b7 ${b}`);
    process.exit(1);
  }
}
const laneCount = Math.min(LANES, picked.length);
const lanesGot = (cpu / (wall / 1000)).toFixed(1);
// R158 — reported, not divided by. See the note above.
const onRef = cpu / probeFactor;
const drift = Math.abs(probeAfter.ms - probeBefore.ms) / probeMs;
const box = `probe ${probeMs.toFixed(0)}ms = ${probeFactor.toFixed(2)}x the reference`
  + (drift > 0.05 ? `, and it MOVED under the suite (${probeBefore.ms.toFixed(0)} -> ${probeAfter.ms.toFixed(0)}ms)` : '');
// R156 — the OTHER thing that moves this number, and the one nobody was
// tracking. Cold is not a fault; it is what any milestone that edits a game
// file gets, because the cache key covers them. It just has to be SAID, or
// the 15% it costs gets read as the machine.
const cacheLine = cacheAtStart.warm
  ? `walk cache warm (${cacheAtStart.hits} walks ready)`
  : 'walk cache COLD — every 180-day walk rebuilt, worth about 15%';
if (!only && cpu > CPU_BUDGET_S) {
  console.error(`\nsuite \u2717  every job passed, but the suite costs ${cpu.toFixed(0)} CPU-seconds, over the ${CPU_BUDGET_S}s budget`);
  console.error(`   (${box} would put it at ${onRef.toFixed(0)} on the reference box, ${cacheLine} — both are reported, neither is gated on.`);
  console.error(`    This run: ${(wall / 1000).toFixed(1)}s wall on ${laneCount} lanes, ${lanesGot} effective, sum-of-wall ${work}s.)`);
  process.exit(1);
}
console.log(`\nsuite \u2713  ${results.length} jobs, ${cpu.toFixed(0)} CPU-seconds of ${CPU_BUDGET_S} budgeted`);
console.log(`   ${(wall / 1000).toFixed(1)}s wall on ${laneCount} lanes (${lanesGot} effective), sum-of-wall ${work}s`);
console.log(`   ${box} (${onRef.toFixed(0)} on the reference box, reported only) \u00b7 ${cacheLine}`);
