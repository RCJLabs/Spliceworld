// R168 — EACH JOB'S SHARE OF THE SUITE, WHICH THE BOX CANNOT MOVE.
//
// R151 chose CPU-seconds because they are flat against CONTENTION, and they
// are: 910 / 921 / 946 across an idle box, four spinning burners and a full
// break battery. What nobody tested is the host's throughput over DAYS.
// R168 did, by running R160's own tree — byte-identical, checked out fresh,
// warm — on a later box:
//
//   R160's tree, when R160 measured it      728
//   R160's tree, today                      941      +29%, all host
//   today's tree                            998      +6% on top, real growth
//
// 728 x 1.29 x 1.06 = 995, against 998 measured. The arithmetic closes, and
// the overrun that failed this gate from R104 to R107 was four-fifths
// weather.
//
// So the seconds budget cannot be tight AND honest, and it keeps only the
// gross job. THIS is the precise one, and it is immune to the box by
// construction: if every job slows by 29%, every share is unchanged. A job
// that grows relative to its peers is code.
//
// Lives in its own module because `tools/suite.js` spawns the whole suite on
// import — a rule the battery can reach has to be somewhere importing it
// costs nothing.

// MEASURED, three warm runs spanning fifteen milestones and that 29% swing.
// Written to one decimal because these are READINGS, not roundings: the first
// draft of this table was rounded to whole percent and summed to 101, which
// the rule below caught on its first run. Shares of one run cannot.
export const SHARE = {
  'smoke:a': 27.2, 'smoke:b': 18.9, 'smoke:c': 21.6, 'smoke:d': 20.6,
  handlers: 4.7, walks: 4.1, vault: 2.7,
};

// The largest share movement across those runs is 3.4pp — and it is
// EXPLAINED: R104 put a fifth campaign in shard a. The largest unexplained is
// 3.1pp of run-to-run noise on smoke:c. Six is about twice either, which
// catches a job growing by roughly a third relative to the rest.
export const SHARE_BAND = 6;

export function shareProblems(jobs, want = SHARE, band = SHARE_BAND) {
  const total = jobs.reduce((a, r) => a + r.ms, 0);
  const off = [];
  for (const r of jobs) {
    const declared = want[r.name];
    if (declared == null || !total) continue;
    const got = (r.ms / total) * 100;
    if (Math.abs(got - declared) > band) {
      off.push(`${r.name} is ${got.toFixed(1)}% of the suite, declared ${declared}%`);
    }
  }
  return off;
}
