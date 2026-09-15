// R170 — HOW MANY FIGHTS THE SUITE FLIES. A number no box can move.
//
// R151 chose CPU-seconds because they are flat against CONTENTION. R168
// found they are NOT flat against the host over days — 728, 941, 998 for
// comparable trees — and answered with a share rule, invariant by
// construction: if every job slows equally, every share is unchanged.
//
// R170 found the hole in that answer, and it is two holes.
//
//   1. The share rule is guarded `rebuilt === 0`, warm runs only, for a
//      reason R168 measured. But EVERY break in the battery patches a source
//      file, which changes `sourceStamp()`, which busts the walk cache. So
//      the share rule was skipped for every break, always — the exact shape
//      R168 invoked R50 to avoid when it put that rule in its own module.
//
//   2. It could not have caught the break anyway. R90 splits the balance
//      sweep round-robin across all four shards, so break 262's 4x sampling
//      inflates all four EQUALLY and every share holds. Measured: the worst
//      share moves 1.4pp against a 6pp band.
//
// So the rule this module exists for has no seconds in it at all, and no
// proportions either. It counts the thing break 262 actually changes: the
// number of battles the suite asks the engine to fly. Quadruple a sample and
// this number quadruples, on any box, warm or cold, in a battery worker or
// on a laptop.
//
// Every tool that flies a fight imports `createBattle` FROM HERE rather than
// from `battle/engine.js`, which is the whole mechanism. The engine is
// untouched: CLAUDE.md's rule is that the harness flies the same battle code
// the browser does, so the counting is a wrapper in `tools/`, never a line
// in `battle/`.

import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createBattle as engineCreateBattle } from '../battle/engine.js';

let flown = 0;

export function createBattle(...args) {
  flown += 1;
  return engineCreateBattle(...args);
}

// Beside the walk cache's `.computed` log, and for the same reason: the
// suite's jobs are separate processes (and the balance sweep's are worker
// threads inside them), so the only place a total can be assembled is a file
// they all append to. `tools/suite.js` clears it before the run.
export const FLOWN_LOG = join(tmpdir(), 'sw-walk-cache', '.flown');

process.on('exit', () => {
  if (!flown) return;
  try {
    mkdirSync(join(tmpdir(), 'sw-walk-cache'), { recursive: true });
    appendFileSync(FLOWN_LOG, `${process.env.SW_JOB ?? 'unnamed'}\t${flown}\n`);
  } catch { /* suite.js fails loudly on a log it cannot read; see there */ }
});
