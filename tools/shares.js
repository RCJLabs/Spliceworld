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
// R118 — 940,000 -> 1,110,000, AND THE RULE WORKED EXACTLY AS BUILT.
//
// R118 reshaped the gene probe: the old one asked how FAR a gene moves the
// fight, on two salt families at 200 battles a cell; the new one asks WHICH
// WAY, on six salts at 100. That is a sampling change, which is the one thing
// this budget was written to refuse quietly — so it did not go quietly. The
// suite came in at 1,010,051 and this rule stopped it, on a run where the
// seconds budget had already been satisfied. That is the whole argument for
// a host-invariant count, made against the milestone that wrote it.
//
// So it is answered with arithmetic rather than a wider number. Measured, two
// warm runs each, same box, same hour:
//
//   R117's tree (d2ec4a1)      858,851 battles
//   R118's tree              1,010,051 battles      +151,200
//
// And the delta is the probe, to the battle. `geneRun` is memoised on
// (sp, traitId, enc, salt), so the count is countable:
//
//                        OLD (2 families, 200/cell)   NEW (6 salts, 100/cell)
//   shard a    control + 12 genes    108,000          3 genes + control  108,000
//   shard b    nothing                     0          3 genes             86,400
//   shard c    nothing                     0          3 genes             86,400
//   shard d    control + 12 genes    108,000          3 genes             86,400
//                                    -------                             -------
//                                    216,000                             367,200
//
// 367,200 - 216,000 = 151,200, against 151,200 measured. Nothing else in the
// suite moved: shard a's count is byte-identical either way (269,942), which
// is what you would expect of a shard whose gene work happens to cost the
// same before and after.
//
// THE COST IS BOUGHT, NOT SPENT. Halving the cell paid for a third of the
// salts; the rest buys the gate's strength, which IS the salt count — a dead
// gene holds one direction with probability 2^(1-n), so six salts is 3% and
// the old two were 50%. Cutting builds from 9 to 7 would fit under the old
// number and take the probe from holding 36/36 subsets to 30/36, which is
// paying for a budget with the gate the budget exists to protect.
//
// 1,110,000 is 1,010,051 plus 10%, the same band on the same reasoning: the
// headroom is for CONTENT, not for the next sampling change. And widening it
// has not blinded it — break 262 still reads 2,224,259, twice the new
// ceiling, because quadrupling the sweep moves in multiples and this does
// not.
export const BATTLE_BUDGET = 1_110_000;

// AND A FLOOR, which matters more than the ceiling and exists because R170
// shipped the defect it catches. `tools/pool.js` ends the balance sweep with
// `w.terminate()`, and a terminated worker thread runs no exit handler — so
// the sweep, 404,736 of the suite's 855,308 fights, wrote nothing to the log
// and the count read the same with break 262 applied as without it.
//
// A ceiling cannot see that. A counter going blind makes its number FALL, and
// a falling number under a ceiling is indistinguishable from good news. This
// is the same failure R168's share rule had and R170's first draft repeated:
// a rule that can only ever pass. 910,000 is 1,010,051 minus 10%; losing the
// sweep alone reads 605,315 on this tree, two thirds of the floor.
export const BATTLE_FLOOR = 910_000;

export function battleProblem(byJob, budget = BATTLE_BUDGET, floor = BATTLE_FLOOR) {
  const counted = [...byJob].filter(([name]) => name !== 'walks');
  const total = counted.reduce((a, [, n]) => a + n, 0);
  const worst = () => counted.slice().sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([name, n]) => `${name} ${n.toLocaleString('en-US')}`).join(', ');
  if (total > budget) {
    return `the suite flies ${total.toLocaleString('en-US')} battles, over the budget of `
      + `${budget.toLocaleString('en-US')} (worst: ${worst()})`;
  }
  if (total < floor) {
    return `the suite recorded only ${total.toLocaleString('en-US')} battles, under the floor of `
      + `${floor.toLocaleString('en-US')} — work has gone MISSING from the count, not from the `
      + `suite (got: ${worst() || 'nothing'})`;
  }
  return null;
}
