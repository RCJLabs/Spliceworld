// R159 — WHICH VERDICT: A SLOW BOX, OR A BROKEN SCREEN?
//
// R131 gave the height gate an `opens` count because every other rule there
// fails upwards: a screen the walk can no longer get into reports a
// comfortable height and passes. That rule is right and load-bearing. What it
// could not do is tell a screen that STOPPED OPENING from a screen that was
// not given the time to open, so a cold or busy box printed "its height
// budget is being met by a screen nobody can open" about a screen that was
// fine — and a 47-minute battery that false-reds at random is a battery
// nobody trusts the fifth time.
//
// The discriminator is whether the screen was still MOVING when the walk ran
// out of things to open. A screen still being painted is a slow run; a screen
// that sits perfectly still and still has nothing to open is the defect R131
// wrote the rule for. Both still FAIL — a rule that goes quiet on a page it
// could not read is the false green R131 exists to prevent — but they fail
// saying different, true things.
//
// IT LIVES IN ITS OWN FILE so the decision can be tested without a browser.
// The evidence that mattered for this milestone was gathered under 40 CPU
// burners on four cores, which is not a state a break battery on an idle box
// can produce; a gate whose new rule can only be exercised by weather is a
// gate with nothing to look at. As a pure function of (opened, want, moved)
// both branches are reachable from a unit test, and breaks can aim at each.
//
// NOTE ON THE WORDING: the stalled verdict must not contain the phrase "nobody
// can open" AT ALL, not even to deny it. The first draft read "not a screen
// nobody can open" and smoke caught it: a log grep, and the rule itself, see
// only the substring, so the two verdicts stopped being distinguishable by the
// thing that reads them. Denying a sentence is not the same as not saying it.
export const STALLED = 'stalled';
export const UNOPENABLE = 'unopenable';

// `want` is the screen's declared `opens` count, `opened` what the walk got
// into, `moved` whether the screen was still repainting when the walk came up
// short. Returns null when there is nothing to complain about.
export function foldVerdict({ id, opened, want, moved }) {
  if (!want || opened >= want) return null;
  if (moved) {
    return {
      kind: STALLED,
      msg: `${id} — THE PAGE DID NOT SETTLE: the walk got into ${opened} of the ${want} folds it`
        + ' declares, and the screen was still repainting when it ran out. That is a starved or'
        + ' cold run rather than a fault in the screen — re-run the gate on an idle box.',
    };
  }
  return {
    kind: UNOPENABLE,
    msg: `${id} declares ${want} folds to walk and the gate got into ${opened}`
      + ' — its height budget is being met by a screen nobody can open',
  };
}
