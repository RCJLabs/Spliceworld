// R90 — A WORKER POOL, BECAUSE THE SUITE'S TIME IS NOT WHERE IT LOOKED.
//
// Profiled section by section, `tools/smoke.js` spends 588 seconds, and 87%
// of that is in five blocks: the balance sweep alone is 242s (41%) and the
// gene probe 136s (23%). The other 181 sections share 76 seconds between
// them.
//
// That number kills the obvious plan. R90's entry proposed splitting smoke
// into suites and running the SUITES in parallel — but wall-clock is then
// bounded below by the largest suite, and the balance sweep on its own is
// 242s against a 180s budget. No partitioning of a file fixes a single block
// that is already over the bar.
//
// What does fix it is parallelising the WORK rather than the file. The
// balance sweep is 24 independent `runSim` calls (four grades x six pools),
// each seeded and each depending on nothing the others produce; the gene
// probe is the same shape. Fed through this pool they cost about a quarter
// of the wall-clock and exactly the same CPU.
//
// No dependencies: `node:worker_threads` ships with Node.
import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// One fewer than the machine has, floor 1, cap 8. The main thread is doing
// real work between batches — it holds the content index and runs every
// assertion — so handing every core to workers makes the run slower, not
// faster, on the four-core machine this is budgeted for.
export const poolSize = () => Math.max(1, Math.min(8, availableParallelism() - 1));

// Run `tasks` through `workerFile`, returning results IN INPUT ORDER.
//
// Order matters more than it looks: the balance sweep reports which pool and
// grade flagged a build, and a gate whose message depends on scheduling is a
// gate that reads differently every run. Results are placed by index, never
// pushed as they land.
export async function runPool(workerFile, tasks, { size = poolSize() } = {}) {
  if (!tasks.length) return [];
  const file = join(here, workerFile);
  const out = new Array(tasks.length);
  let next = 0;
  let failure = null;

  const workers = Array.from({ length: Math.min(size, tasks.length) }, () => new Worker(file));
  await Promise.all(workers.map((w) => new Promise((resolve) => {
    const feed = () => {
      if (failure !== null || next >= tasks.length) { w.terminate(); resolve(); return; }
      const i = next++;
      w.postMessage({ i, task: tasks[i] });
    };
    w.on('message', (msg) => {
      if (msg.error) {
        // First failure wins and stops the run. A pool that swallows one
        // worker's exception and returns 23 of 24 results is a gate that
        // passes because it did less work.
        failure ??= new Error(`${workerFile} failed on task ${msg.i}: ${msg.error}`);
        w.terminate(); resolve(); return;
      }
      out[msg.i] = msg.result;
      feed();
    });
    w.on('error', (err) => { failure ??= err; resolve(); });
    w.on('exit', () => resolve());
    feed();
  })));

  if (failure) throw failure;
  for (let i = 0; i < tasks.length; i++) {
    if (out[i] === undefined) throw new Error(`${workerFile}: task ${i} produced no result`);
  }
  return out;
}
