// R156 — HOW FAST IS THIS BOX RIGHT NOW?
//
// R151 replaced a wall-clock budget with CPU-seconds and proved the new unit
// flat against CONTENTION: idle 910, four spinning burners 921, a full break
// battery alongside 946 — 1.2%, against wall-clock's 78%. That evidence is
// still good. What it did not test, and what "does not move with the box"
// over-claimed, is the host's per-cycle throughput over HOURS. Readings on
// the suite since: 910, 823, 783, 1022, and R153 pinned it with a same-box
// A/B in one ten-minute window — the branch read 1012 and `main` read 1022,
// so the code costs nothing and the machine costs 30%. R153 raised the
// ceiling to 1200 to stop it blocking and wrote down that this was a smoke
// alarm rather than a stopwatch.
//
// A stalled cycle is still a charged cycle. So the fix R151's own criterion
// named and did not take — "a measured idle baseline the gate calibrates
// against" — is to run a FIXED amount of work at suite start and divide the
// suite's cost by what that reading says the box is worth today. The suite's
// number stops being "CPU-seconds on whatever machine this was" and becomes
// "CPU-seconds on the reference box", which is a property of the suite.
//
// WHY AN INTEGER LOOP AND NOT SOMETHING THAT LOOKS MORE LIKE THE SUITE.
// Three candidates were measured, idle and under eight burners:
//
//                       idle      8 burners   idle again   verdict
//   integer hash      211.8ms      213.1ms      212.7ms    0.6% spread
//   pointer chase     126.0ms      130.7ms      133.6ms    6%, and RISING
//   alloc + GC         27.9ms       27.8ms       29.1ms    GC noise, tiny
//
// The pointer chase was the promising one — every step is a cache miss, so
// it should see the stalls the suite sees — and it is the one that failed:
// it drifted upward across three consecutive runs with the load in the
// MIDDLE, which is a probe with its own weather. A calibration is only worth
// having if it is quieter than the thing it calibrates. The integer hash is
// the most reproducible instrument on this box by an order of magnitude, and
// it is the one R151 already has two historical readings from.
//
// THE HONEST LIMIT, STATED UP FRONT: the drift this exists to remove is
// hours-scale and cannot be induced on demand — contention does not cause it
// (the probe is flat under 8 and 16 burners, and so is the suite at 1.2%),
// and this box shows essentially no hypervisor steal (1 tick in 111,489).
// The evidence that the probe TRACKS the drift is R151's own pair: its
// benchmark read 509-535ms when the suite read 910, and 605ms when the suite
// read 1022 — +16% against +12%, same direction, same order. Two points,
// with a different implementation of the same idea. That is why the suite
// now PRINTS the probe reading on every run: the day-apart confirmation the
// criterion asks for is a thing the next session can read off two logs
// rather than a claim this one had to make.
import { cpuUsage } from 'node:process';

// The work. Pure integer arithmetic in a monomorphic loop: no allocation, so
// no GC; no memory traffic, so no cache weather; nothing V8 can hoist,
// because every iteration feeds the next.
export const PROBE_ROUNDS = 3e7;

// WHAT THE WORK COMES TO. Pinned so the probe cannot quietly stop being the
// same probe: change the rounds or the arithmetic and this number changes,
// and a budget calibrated against a different amount of work is a budget
// calibrated against nothing. It is a property of the code, not of the box —
// every machine must produce it.
export const PROBE_HASH = -149510724;

// WHAT IT COSTS ON THE REFERENCE BOX. Measured R156 on a quiet box: median
// of seven reads at 107.0ms, spread 0.3%. This is a reference point rather
// than a target — the suite's budget is denominated in it, so the two move
// together and only their ratio is claimed.
export const PROBE_REF_MS = 107;

const spin = (rounds) => {
  let h = 0x811c9dc5 | 0;
  for (let i = 0; i < rounds; i++) {
    h = Math.imul(h ^ i, 0x01000193) | 0;
    h = ((h << 13) | (h >>> 19)) | 0;
    h = Math.imul(h ^ (h >>> 7), 0x85ebca6b) | 0;
  }
  return h;
};

// MEDIAN OF FIVE, AFTER TWO WARM-UPS. The warm-ups are not politeness: the
// first pass through this loop is interpreted and reads three times what the
// optimised one does (33ms against 7ms at a twelfth of the rounds), so a
// cold probe would report a box a third slower than it is. The median throws
// out a single descheduled read without throwing out the box's actual speed,
// which a min would.
export function boxProbe() {
  spin(PROBE_ROUNDS);
  spin(PROBE_ROUNDS);
  const reads = [];
  let hash = 0;
  for (let i = 0; i < 5; i++) {
    const before = cpuUsage();
    hash = spin(PROBE_ROUNDS);
    const d = cpuUsage(before);
    reads.push((d.user + d.system) / 1000);
  }
  reads.sort((a, b) => a - b);
  return { ms: reads[2], hash, reads };
}
