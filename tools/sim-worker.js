// R90 — the balance sweep's unit of work, off the main thread.
//
// One `runSim` per message. The content index is loaded once per worker and
// reused across every task that worker is handed, which is the whole reason
// for a pool rather than a process per task.
//
// It returns FLAGS ONLY, not the full row set: a pool that ships 40 builds x
// 24 pools of per-encounter detail back across the thread boundary spends
// more on structured cloning than the sim saved.
import { parentPort } from 'node:worker_threads';
import { loadSimContent, runSim } from './sim.js';

const content = loadSimContent();

parentPort.on('message', ({ i, task }) => {
  try {
    const { flags, rows } = runSim(content, task);
    parentPort.postMessage({ i, result: { flags, rowCount: rows.length } });
  } catch (err) {
    parentPort.postMessage({ i, error: err?.stack ?? String(err) });
  }
});
