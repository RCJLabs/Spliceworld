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

// R170 — AND THE SHARE RULE HAD TWO HOLES, ONE OF THEM FATAL.
//
// It was guarded `rebuilt === 0` in tools/suite.js — warm runs only, for the
// good reason measured below. But EVERY break in the battery patches a source
// file, which changes `sourceStamp()`, which busts the walk cache, which
// makes `rebuilt > 0`. So the rule was skipped for every break, always: the
// exact shape R168 invoked R50 to avoid when it moved the rule into this
// module so the battery could reach it. It could be reached and never ran.
//
// WHY WARM-ONLY, AND WHY IT NO LONGER HAS TO BE. Measured cold and warm on
// one box, same tree: the rebuild cost lands ENTIRELY in `walks` (241.8s cold,
// 31.0s warm), and every other job moves by at most 5.7s. So taking `walks`
// out and renormalising over the rest gives shares that agree cold-to-warm
// within 0.47pp — and the rule can run on every run, which is the only way
// the battery was ever going to see it.
//
// `walks` loses nothing by leaving: its cost is guarded by the rebuild
// allowance, the empty-cache rule and R168's duplicate-walk rule, all in
// tools/suite.js.
//
// MEASURED over the non-walks jobs, one cold run and one warm on today's box.
// Written to one decimal because these are READINGS, not roundings: the first
// draft of this table was rounded to whole percent and summed to 101, which
// the rule below caught on its first run. Shares of one run cannot.
export const SHARE = {
  'smoke:a': 28.3, 'smoke:b': 19.5, 'smoke:c': 22.7, 'smoke:d': 21.3,
  handlers: 5.2, vault: 2.8, scopecheck: 0.2,
};

// The job the shares do NOT do, which is the whole of R170's second half:
// R90 splits the balance sweep round-robin across all four shards, so a
// change to its sampling inflates all four EQUALLY and every share holds.
// Break 262 quadruples that sampling and the worst share moves 1.4pp. The
// band is not the problem and no band would fix it — a proportion cannot see
// a change that is proportional. That is what BATTLE_BUDGET below is for.
//
// The largest share movement across R168's runs was 3.4pp — and it is
// EXPLAINED: R104 put a fifth campaign in shard a. The largest unexplained is
// 3.1pp of run-to-run noise on smoke:c. Six is about twice either, which
// catches a job growing by roughly a third relative to the rest.
export const SHARE_BAND = 6;

// `walks` is excluded from the total as well as from the table: a share is of
// something, and the something has to be the same set both sides or the
// percentages are of two different suites.
export function shareProblems(jobs, want = SHARE, band = SHARE_BAND) {
  const counted = jobs.filter((r) => want[r.name] != null);
  const total = counted.reduce((a, r) => a + r.ms, 0);
  const off = [];
  if (!total) return off;
  for (const r of counted) {
    const declared = want[r.name];
    const got = (r.ms / total) * 100;
    if (Math.abs(got - declared) > band) {
      off.push(`${r.name} is ${got.toFixed(1)}% of the suite, declared ${declared}%`);
    }
  }
  return off;
}

// R170 — HOW MANY FIGHTS THE SUITE ASKS THE ENGINE TO FLY. No seconds in it,
// no proportions either, and therefore the only one of these three rules that
// can see a sampling change.
//
// Break 262 is the case that forced it: `seedsPer: 8` to `32` in the balance
// sweep. Measured on today's box, warm, the non-walks jobs fly
//
//   clean        855,308 battles      743 CPU-seconds
//   break 262  2,069,516 battles     1084 CPU-seconds
//
// 2.4x the work, and it fits under a seconds budget of 1150 with room to
// spare, because that budget has to be loose enough for a host that reads 998
// on a bad day and 743 on a good one. The battle count does not care what the
// host is doing.
//
// `walks` is excluded here too, and for a reason of its own: a cached
// campaign is a campaign not re-fought, so that job reads 35,292 battles cold
// and 20,163 warm. Every other job is byte-identical run to run, which is why
// this budget can sit close.
//
// 940,000 is 855,308 plus 10%. The headroom is for CONTENT — a new species or
// a new enemy adds fights to the benches that iterate the catalogue — and not
// for sampling, which moves in multiples and would blow this by 100% or more.
export const BATTLE_BUDGET = 940_000;

export function battleProblem(byJob, budget = BATTLE_BUDGET) {
  const counted = [...byJob].filter(([name]) => name !== 'walks');
  const total = counted.reduce((a, [, n]) => a + n, 0);
  if (total <= budget) return null;
  const worst = counted.sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([name, n]) => `${name} ${n.toLocaleString('en-US')}`).join(', ');
  return `the suite flies ${total.toLocaleString('en-US')} battles, over the budget of `
    + `${budget.toLocaleString('en-US')} (worst: ${worst})`;
}
