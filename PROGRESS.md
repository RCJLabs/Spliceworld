# PROGRESS

## Session 89 — R66: the preview lies to the player and to the AI ✅

**Acceptance criterion:** a gate compares the preview's expected value with
the engine's Monte-Carlo mean per keyword within tolerance, and the AI has no
branch the suite cannot reach — **passes**. No schema change; `SAVE_VERSION`
stays **35**. `sw.js` cache → `v35-preview`.

### Measured first: three divergences, not two
`previewMove` is the single source of truth — the move chip reads it, the AI
scores on it, the briefing forecasts from it. Benched against the engine's own
damage over 3,000 seeded rolls per case:

| case | preview before | engine | after |
|---|---|---|---|
| Multi-Hit (bat Wing Beat, N=4.5) | 82.5 | 98.6 | 99 (−0.4%) |
| plain swing (control) | 55 | 55.3 | unchanged |
| turn 1 vs a Skittish defender | 92% | 64% | 65% (−1pp) |
| cornered Brave attacker | 55 | 65.1 | 65 (+0.2%) |
| into armour 20 / 60 | 42 / 14 | 42.1 / 14.1 | unchanged |

- **Multi-Hit** was half a hit low for every integer N — at N=2 it previewed
  1.5 hits against a *guaranteed* 2 — and 19.5% low on the bat, whose N is
  **4.5 at Prime** because keywords scale with grade. So the fix is the exact
  expectation of `floor(r · M)` for real M, not `(2 + N) / 2`.
- **Turn-one evasion** simply was not there.
- **The crit** was omitted "by design", and design was wrong: 18.4% is a
  whole extra swing the AI never counted.
- **Armour rounding** was suspected (per-hit clamping against a mean) and
  measured clean at 0.1–0.4%. No change.

### Shipped
- `multiHitMean(n)`, exported, sitting beside the engine's own roll with a
  comment pointing each at the other; the gate Monte-Carlos the roll and
  compares, so the pair cannot drift.
- `previewMove(atk, def, move, content, turn)` — the turn carries the opening
  dodge. `null` stays honest for a caller with no battle, and the gate sweeps
  every module to prove no such caller exists in the game.
- Crit enters as its expectation, in the same place `attack()` applies it.
- The preview's damage is rounded once at the end: `hits` is an expectation
  and a chip reading `98.57142857142857` is not a number anybody can use.
- **The AI:** two `Math.min(Infinity, ...spread)` idioms replaced with a real
  emptiness check — a utility-only pilot pressed nothing and breathed for the
  whole fight, and `staminaDrain` always took its 1.8× bonus against a foe
  with no swing to lose. The `after < 0` guard, unreachable because `options`
  is built from `affordable`, is gone. `scoreMove`'s `battle` parameter —
  passed and never read — is now what carries the turn.

### Three balance gates were fitted to a mismeasured AI
A preview that stopped lying moves every number the AI plays on, and three
gates turned out to be sitting on their own floors:

| gate | before R66 | floor | after | resolution |
|---|---|---|---|---|
| `records_annex` climbable solo | 25% | 25% | 4% | `benchTeam` 1 → 2 (100% there) |
| Drowned identity margin | ~15pp true, 6–20pp per seed | 10pp | same | pooled across bench seeds |
| Water at Precinct is a class problem | 11.3pp | 10pp | 6.4pp | fixture replaced (Air at the Drowned Marina, 69pp) |

None of the three was fixed by moving a floor. The first was a data field
that was already wrong by its own definition, the second a gate reading one
noisy draw instead of the quantity it means, and the third a fixture one
point above the line — whose own comment claimed a stale "16 points" it had
not measured in some time. `forecast.js` carries the corrected numbers now.

### Balance impact
Champions unchanged on every strip; weak archetypes move a few points
(prime Kestrel boots 13→6%, noise 72→69%; apex kite 63→66%). The AI is
slightly sharper, which is what a preview that stopped lying to it should do.

### Known issues
- Next in §9.4: **R67 — the KO turn skips end-of-turn for both sides**, and
  the AI skill ladder hardcoded at six tiers against nine in data.

### Next session's first task
R67. Start at `battle/engine.js:1106` (`endOfTurn` behind `!pendingReplace`)
and the early return on the replacement action; the gate plays a KO turn and
asserts the poison ticked.

## Session 88 — R65: timers that start when you look ✅

**Acceptance criterion:** every timer written by an elapsed-time resolver is
anchored to the event's own clock, injuries only ever lengthen, and a gate
replays a week's absence and asserts nothing starts at the return time —
**passes**. No schema change; `SAVE_VERSION` stays **35**. `sw.js` cache →
`v35-anchors`.

### Measured first: six instances, not four
Every elapsed resolver primed with something that finished **six days** before
the player looked:

| resolver | before | after |
|---|---|---|
| job cooldown | fresh 4.5h lock on return | ready 139.5h ago |
| job injury | fresh 1.9h bruise | expired 142.1h ago |
| job animal | arrives a newborn | aged 144h |
| vat child | settling restarts | settled 143.6h ago |
| resequenced animal | arrives a newborn | aged 144h |
| failed job vs battle wound | 4h wound → 1.9h bruise (free heal) | wound stands |

Plus the injury RNG: two consecutive two-casualty losses rolled a
byte-identical injury, because the stream was keyed on the war record and the
record increments *after* the loop.

### Shipped
- **One rule.** Every resolver stamps `endedAt` (`run.until`, `vat.until`,
  `rehab.until`), never `now`. An animal won or decanted while you were away
  has aged exactly as it would have in the pen — which also means it can
  arrive past its prime, and that is the honest number rather than a fresh
  prime window handed out for being absent.
- **One cooldown helper.** `startCooldown(state, content, opId, endedAt)` for
  both paths: `run.until` when a job finished, `now` when it was called off,
  because that is when the crew is actually back. Aborting a six-hour job a
  minute in used to free it sooner than letting it run.
- **One inflict point.** `applyInjury(chimera, injury)` in `battle/engine.js`:
  longest-wins, and it owns `injuryCount`, the per-creature tally the name
  roll (`injury:<id>`) and the scar roll (`scar:<id>`) both key off. The tally
  moved from heal-time to inflict-time, so one number means one thing.
- **A sweep, not a list.** The gate primes a job, a vat, a tank and a convoy,
  ticks once after a week, and walks the whole save for any value equal to the
  return time. One exemption survives — R9's defence window, which opens when
  you SEE it — and the gate fails if it is removed. It also plants a timer and
  asserts the sweep names it, so a walk that never walked cannot pass.

### Two economic anchors the walker fix exposed
Letting the walker run jobs changed what a month away costs, and the R64 gate
caught it at **47% of full pay** against its 50% floor. Two real bugs, not a
threshold to move:
- **Upkeep and condition were charged for the whole gap** to creatures that
  arrived *during* it. An animal a job brought home on day one of a
  thirty-day absence was billed a month of upkeep and decayed to the
  condition floor for a month it had not lived through. `applyElapsed` now
  prorates both by how long each head was actually owned — which it can only
  do because R65 made `birthAt` and `createdAt` honest.
- **The strip completion bonus was suspended retroactively.** R64 restored a
  contested node's own income for the period before its convoy arrived, but
  a contest also suspends its region's `completionBonus`, and that was never
  put back — so a convoy arriving in the last two hours of a month away
  withheld **thirty days** of Greenfield's $150/day. Measured: $4,500.

With both fixed, a month away banks **81% across seeds** (52 / 73 / 89% on
the three that stay mid-campaign for the whole window) — the R64 gate now
states that claim as an aggregate, because early in a campaign one waiting
convoy can suspend a large share of a four-node empire and a tight per-seed
line would be a coin flip.

### Two things the suite itself was getting wrong
- **The vat settling gate** asserted a child is *still* settling 99 hours
  after the vat was sealed — which was really a statement about how late the
  fixture ticked. Re-anchored to the claim it meant: settling runs from the
  moment it decanted, and `createdAt` is that moment.
- **The scar fixture inflicted injuries by hand** (`ch.injury = {...}`). That
  used to be equivalent; it is not, because the tally the scar roll is keyed
  on now advances at inflict. Frozen, the fixture rolled the same scar forty
  times and 33 of 80 careers came out clean. Routed through `applyInjury`:
  **80 of 80** scar, cap respected. The lesson is now a gate — every shipped
  module is swept, and only three injury writes are legitimate (healing to
  null, the one assignment inside `applyInjury`, and the save migration's
  normalise), with exactly one inflict point.

### Found on the way
- **The walker had never run a job.** `opReady(state, o.id, content, now)`
  put `content` in the `now` parameter, so the comparison was against an
  object and every job read as on cooldown; `laneFree` was mis-argued too and
  never reached. Fixed. The R63 walk improves to **83/84 nodes and three
  dominions** (was 81 and two), so R63's thresholds hold with more margin.
- **`injuryCount` semantics changed** without a schema change: a save whose
  creature is mid-injury has a tally one lower than the old code would have
  left, so its scar roll draws from a different position. No migration, no
  crash — noted here because it is a behaviour change a reader should know.

### Known issues
- Next in §9.4: **R66 — the preview lies to the player and to the AI**
  (Multi-Hit off by half a hit; no turn-one evasion term).

### Next session's first task
R66. Start at `battle/engine.js:442` (`previewMove`) against the engine's own
roll at `:648`; the fix is a formula, and the gate is a Monte-Carlo comparison
of preview against engine per keyword.

## Session 87 — R64: being away is strictly profitable ✅

**Acceptance criterion:** one `now` per tick and one elapsed clock per save;
elapsed time resolves the contests it contained, capped with a mercy; a gate
replays 30 days away against 30 days of daily play and asserts the absent
save is not ahead — **passes**. `SAVE_VERSION` → **35** (the campaign's
second clock is folded into the one clock). `sw.js` cache → `v35-clock`.

### Measured first, with the R63 walker
- Thirty days closed on the day the app shut banked a **full month of pay**
  and met **one convoy** against the daily player's **21–26**; the only cost
  was stock condition at the floor.
- The two-clock forgiveness was exact: a $200 save with $72/day upkeep and
  $340/day income came back **$760 richer** after one thirty-day tick than
  after 720 hourly ones — the upkeep the zero-clamp forgave before income
  landed.

### Shipped
- **`campaign/world.js`** — `tickWorld(state, content, now)`: income before
  upkeep, one clamp, one clock (`state.lastTickAt`), every passive system in
  one order. `main.js` reads `NOW()` once and no longer ticks systems itself;
  the walker ticks through the same function, so a browser tick and a walk
  tick are the same tick. `applyElapsed` and `tickCampaign` take `since`.
- **Migration 35** — `campaign.lastTickAt` is deleted; a missing ranch clock
  takes its value so the gap is neither charged nor paid twice.
- **The schedule replays through an absence** (`contest.js`): each convoy
  arrives when due, waits `windowHours`, leaves without taking anything; the
  next rolls a cooldown after it left; only one still inside its window is
  waiting on return, with its full window from then (R9's rule untouched).
  `tickContests` returns `{ news, missed }`; `tickCampaign` prices the missed
  convoys' windows and pays a waiting convoy's node until it arrived. One
  wire line summarises the ones that came and went (`news.missed`).
- **Measured after:** a month away banks **84–95%** of full pay (88 / 84 / 95
  on three seeds), the world moved as much as it did for the daily player
  (24 vs 21, 26 vs 26 convoys), no node is lost unseen, at most one convoy
  waits.
- **Gates:** tick() reads the clock once and calls nothing but `tickWorld`;
  no module reads the second clock; hourly and monthly ticks agree on the
  poor save; migration folds the clock; a week away replays about six
  convoys deterministically, each waited exactly its window, none took a
  node; the week is priced to the dollar as full pay minus the windows, and
  a zero window (the broken number) makes it full pay again; the 30-day walk
  on two seeds is under full pay, over half, same convoys, same nodes.

### Corrected from session 86
- R63's gate used "no veterancy → 3 nodes" as its broken number. Once the
  walk ticked every passive system the browser does, the same fixture read
  21 and 21 with dominion — and ticking scars alone flipped one seed while
  temperaments alone flipped the other. An unlevelled roster sits on a
  knife-edge at the Precinct; the oracle now doubles every garrison
  (24 nodes against 81), which is monotone. ROADMAP's R63 line is corrected.
  Flattening the class triangle, incidentally, makes the walk *easier*
  (84/84, dominion on every seed by day 103): the class check is the wall.

### Discarded on measurement
- A first cut capped **catch-up convoys at three, parked until return**, with
  income suspended from arrival. Three convoys arriving within two days of
  the first and sitting for 28 turned a month away into a fine (funds fell
  below what was left in the bank). Replaced by the replay, which is what a
  watching player would have seen.

### Known issues
- The walker's day-30 leave snapshot is taken after that day's actions;
  `snapshots[day]` remain "after tick, before act". Documented in `sim.js`.
- Next in §9.4: **R65 — timers anchored to the return time** (job cooldowns
  and failure injuries in `operations.js`).

### Next session's first task
R65. Start from `operations.js:332` and `:371`; the R64 walker's `away`
option already reproduces the week-away case, so the gate can be walked.

## Session 86 — R63: the contest treadmill, measured honestly ✅

**Acceptance criterion (as restated by the measurement):** the walk reaches
dominion on a realistic diet, defending and rescuing are on the agenda,
escalation has a ceiling, and the walk is a gate that a broken number fails —
**passes.** No schema change; `SAVE_VERSION` stays **34**. `sw.js` cache →
`v34-contest`.

### The premise was the walker
R63 was filed on "3–5 of 21 nodes in 180 days". Four defects in
`campaignWalk` produced that number, none of them the game:
- it saw only Greenfield — `nodeStates(state, content)` defaults its region
  argument to the first strip, so it never saw Kestrel exist;
- it called `startSpar()` and never fought the spar: every charge burned for
  zero xp, and R43's ladder out of the wall was never climbed;
- it never ran a rescue raid, so a loss a day drained veterans through the
  impound faster than they levelled (xp at day 180: `[168, 19, 0, 0, 0, 0]`);
- it resolved defences through `resolveContest()` directly, past
  `finishBattle` — no xp, no injuries, no capture on a lost defence — and its
  "do not retry a node that beat this roster" rule keyed on total xp, which
  changes every fight, so it retried the Guard Post 93 times.

### What the honest walk says
Rewritten to play as designed (whole map, best three by level, three spars a
day, rescues, wait for the A-team inside the window, Prime graduations,
build the class the demand line asks for, a stable of nine):

| 180 days, seed | 2026 | 7 | 99 | 4242 |
|---|---|---|---|---|
| nodes held of 21 | 16 | 20 | 21 (dominion d45) | 21 (dominion d135) |

Six seeds: dominion on three. Then every contest dial was measured over the
six: `escalationMax 1.5` neutral, `memoryHours 168` **worse** (the defence
record also spaces the schedule, so forgetting brought convoys back 50%
more often), a 48h grace noise. Broken numbers: a 30-minute window, a 300%
first defence, four convoys an hour — 16–21 nodes, dominion still reached.
**Veterancy off: 3 nodes.** Contests are pressure; levels are the ladder.

### Shipped
- `tools/sim.js`: the walker rewrite above, `roster`/`log`/`spars`/`rescues`
  in the report, and a fix to `at.dominion` (the loop broke out before the
  mark). `regionStates` for the map, `pilotAction` for the fights.
- `data/regions.json` + `campaign/contest.js`: `escalationMax: 2` — above
  anything the walk reached (230%), insurance against the 330% tail. Grace
  and memory were built, measured, and removed.
- `ranch/agenda.js`: `defend` and `rescue`, ahead of the job board, with the
  time left in the hint. Both `campaign` kind; the walker reads them.
- Gate (end of smoke.js): the walk leaves Greenfield, spars and rescues for
  real, ≥1 of 4 seeds reaches dominion and ≥48 of 84 nodes are held, no
  veterancy halves it, a 300% first defence costs under a quarter, the cap
  prices thirty defences at 200%, the two agenda entries read right.

### Known issues
- The walk gate adds ~70s to the suite (nine 180-day walks). Worth it; the
  R56 45-day gate stays as the fast one.
- §9.4 R64's absence claim (zero contests in thirty days away) is untested by
  this walker, which ticks every two hours. Still queued.

### Next session's first task
R64 — being away is strictly profitable. Start by making the walker skip
thirty days and comparing it with itself.

## Session 85 — Fourth audit + hotfixes ✅

**Scope:** a full audit of the shipped game, not a milestone. Four agents
(engine correctness, content, UX at 380 px, roadmap-versus-shipped) plus the
harness: a 180-day walk on four seeds, a 30-day-absence replay, a
reachability sweep, a screen walk with every handler fired, and a static
free-identifier pass. **Fifteen recommendations are written up as ROADMAP
§9.4 (R63–R77), marked proposed.** No schema change; `SAVE_VERSION` stays
**34**. `sw.js` cache → `v34-audit`.

### Shipped in this PR (bugs, not phases)
- **`opOdds` ReferenceError on the Jobs board's "Run it"** — R60 trimmed the
  `operations.js` import past a symbol two call sites still used. Live
  crash, missed by the render-identity harness because nothing fires the
  handler. Import restored.
- **`infirmaryGrants` unbound in `campaign.js`** since A1, behind an `??=`
  that never evaluates (finishBattle always sets the injury first). Import
  added; the dead branch is R75's.
- **`news.json` philosophy pools keyed on `purist` / `chimerist`**, ids that
  exist nowhere — the R62 weighting had never fired, and its gate took the
  authored key as the profile. Rekeyed to `naturalist` / `engineer`; gate 7
  now asserts every `by` key is a real philosophy. Unreachable
  `capture_ours` pool and its dead fallback removed.
- **Zero-param events printed one phrasing forever** — `spar_done` authored
  three lines and a save heard one of them. `newsFor` now rotates while the
  last telling is still on the wire; still seeded, no new save field. Gate 6b.
- **Four of five bosses transformed with a blank line** (only
  `captain_clampdown` had a `transformLine`). Authored the other four, null
  guard in the engine, gate: every `transformInto` has a line and a target.
- **Agenda chips on the wrong screen** — Graduate went to the Vault (no
  Extract button there; it is on the Ranch card) and the vat went to the
  Theater (no vat). The A4 gate checked only that the screen *existed*, and
  both are real screens — the hollow-gate shape again. Fixed, plus the
  `chaos` guide's screen; the gate now names the control each chip promises
  and asserts the mapped module renders it, with the two old targets as
  negatives, and renders Ranch and Pens to see the buttons.

### Known issues
- Everything in §9.4. The three with the highest player cost are R63 (the
  contest treadmill — no seed reaches dominion in 180 days), R64 (thirty
  days away is strictly profitable) and R71 (a save from a newer build opens
  an empty ranch).
- `tools/smoke.js` is 12.5k lines and ~4–5 min; R76 proposes the two cheap
  static gates that would have caught this session's regressions.

### Next session's first task
Prune §9.4 with Evan, then start **R63** (or whichever survives the prune
first). Read its evidence line before touching `contest.js`.

## Session 84 — R62: the news wire, as a system ✅

**Acceptance criterion:** a new world reaction is a JSON edit, no engine module
contains a player-facing sentence, and smoke asserts every emitted event id has
copy AND every line has an emitter — **passes**, with the second clause scoped
to the wire (below). No schema change; `SAVE_VERSION` stays **34**.

### The rule was already written down, one module over

`campaign/monologue.js` opens by stating exactly what this phase needed:

> *"The design rule the whole module exists to enforce: a monologue slot is a
> KEY IN A JSON FILE and a caller, never an engine change."*

That was written for the rivals. The campaign's own voice never adopted it —
seventeen player-facing sentences lived inside `campaign.js` and `rehab.js`,
so a new world-reaction was an engine edit, against CLAUDE.md's *"all content
is data"*. So the wire now uses that machinery rather than a second copy of
it: `campaign/wire.js` looks the phrasing up and fills it with monologue's own
`fill`.

### And the wire was lying

`regions.json` authors an `announce` line per threat rung, including a
distinct one for Generation 3 — and **nothing read either**. `campaign.js`
pushed a hardcoded Generation 2 sentence for every rung-up:

```
THREAT LEVEL UP: the military is now returning your calls. Threat Generation 2.
```

Measured: **Gen 3 is reachable at 14 nodes and notoriety 320+**, so a player
who got there was told they had reached Gen 2, and the authored Gen 3 line —
*"a Compliance Spire has been erected in your honour"* — **had never once
played**. R57 and R58's shape, with the engine's own copy shouting over the
data instead of merely ignoring it.

Worth noting where the existing gates sat: R61's "every authored section
reaches runtime" passes here, because `threatGens` *does* reach runtime as
`campaignMeta.threatGens`. The dead thing was a **field inside** a section
that arrived intact. R61's gate is section-level by design; catching this is
what "every line has an emitter" is for.

### The premise, corrected twice

The queue said **19** hardcoded strings. At `pushNews` call sites there were
**11** — but that was an undercount too: two more hid inside `?? fallback`
expressions, and four more were built in `rehab.js` before reaching the wire.
Seventeen.

Then the wider scan found something the criterion had to be read against:
**299 prose sentences live in engine modules**, and they are three different
populations, not one.

| population | count | is it the wire? |
|---|---|---|
| news lines | 17 | **yes — this phase** |
| the combat log (`battle/engine.js`) | 61 | no: turn-by-turn arena readout |
| action results (`{ok, msg}` to screens) | ~220 | no: an answer to a button press |

Taking *"no engine module contains a player-facing sentence"* across all three
is a 299-sentence overhaul in a phase whose entry describes `news.json`, event
ids, variants and philosophy weighting. So the scope was cut **inside** the
milestone, the way CLAUDE.md asks: the wire is done completely, and the other
two populations are named here with their numbers rather than quietly folded
in or quietly skipped.

### What shipped

`data/news.json` — **17 events, 29 phrasings, 2 philosophy-weighted variants.**
`campaign/wire.js` — 6 exports, DOM-free, owns both the buffer and the lookup.

The pool is picked with the seeded RNG keyed on **the event's own params**, so
the same save always tells its story the same way, different nodes get
different phrasings, and no save field had to be invented to hold a position —
which is why `SAVE_VERSION` did not move.

Two call sites in `rehab.js` were rewritten to spell out their event ids and
params instead of computing them into variables. The repetition buys the
invariant: an id assembled at runtime has copy nothing can prove is reachable,
and a param passed in a variable hides half of the contract the gate exists to
check.

### The break battery: fourteen breaks, two real gaps, both mine

| # | break | verdict |
|---|---|---|
| 1 / 1b | an engine goes back to writing a sentence | CAUGHT |
| 2 / 2b | an event is emitted with no copy for it | CAUGHT |
| 3 | copy is authored that nothing emits | CAUGHT |
| 4 | copy asks for a placeholder nobody supplies | CAUGHT |
| 5 | the emitter renames a param out from under its copy | CAUGHT |
| 6 | the engine names a threat generation again | CAUGHT |
| 7 | **the rung stops reading its own authored line** | **MISSED** → fixed → CAUGHT |
| 8 | the wire stops being seeded | CAUGHT |
| 9 | **the pool collapses to one phrasing** | **MISSED** → fixed → CAUGHT |
| 10 | the philosophy weighting is dropped | CAUGHT |
| 11 | an engine keeps a duplicate of authored copy | CAUGHT |
| 12 | an unknown event prints "null" onto the wire | CAUGHT |

Breaks 1 and 2 were caught by the wrong gate — removing an emit also orphaned
its copy, and renaming `gauntlet_cleared` tripped R42's gate first. `1b` and
`2b` re-ran each without the side effect, and the gates they were aimed at
fired: *"campaign.js pushes events, not sentences"* and *"every emitted event
has copy in news.json (dismantled_for_parts)"*.

**Break 7 is the one worth the phase.** It pinned the rung lookup to
`threatGens[1]` — the original bug wearing a different coat — and **every gate
passed.** They tested the wrong half:

- *"Generation N announces its own line"* calls `newsFor` with a rung already
  in hand, so it proves the **wire prints what it is given**.
- *"the engine does not name a threat generation in prose"* proves the
  **sentence is gone**.

Neither proves the engine looks up the rung the player actually reached, and
the wire will faithfully print whichever one it gets. The fix walks a real
rung-up: build a state one node short of each threshold, take that node
through `resolveBattle`, and assert the wire carries that rung's own line and
only that one. Against the break it reports what a player would have seen.

> A gate that stops at the seam tests only the half it can reach. **The bug
> lived in the handoff.**

**Break 9** collapsed the pool to its first entry — the wire would repeat
itself forever — and the gate watching for exactly that passed. It collected
the *filled* lines from eight nodes and asserted they differed. They always
do: eight node names make eight strings out of one template. It now traces
each line back to the pool entry that produced it and says *"1 of 3 phrasings
used across eight nodes"*.

That is the session's pattern for the third time in my own gate: **filled text
is a stand-in for the template that made it.**

### Browser QA, 380px, console clean

Driven through the real `loadContent` the browser uses — 17 events loaded —
so the five loader spots are proven by the thing that reads them, not by a
Node harness:

```
gen2: THREAT LEVEL UP: the military is now returning your calls. Threat Generation 2.
gen3: THREAT LEVEL UP: a Compliance Spire has been erected in your honour. Threat Generation 3.
seized A: Old Barn Perimeter changes hands. +$40/day, and nobody has filed anything about it.
seized B: Radio Mast seized. Income +$105/day. Locals adjusting surprisingly well.
chimerist: Radio Mast seized. Income +$105/day. Witnesses disagree about how many legs were involved.
```

**The Gen 3 line plays for the first time.** Two nodes draw two phrasings; a
Chimerist hears a different sentence than everyone else. Wire tab renders at
380px with no horizontal overflow and no console messages.

### Next session's first task

The audited queue (ROADMAP §9.3, R54–R62) is **finished**. Nothing is queued,
so the next session starts with an audit rather than an item.

Three things it should look at first, all recorded during this run:

1. **The other two prose populations.** The combat log (61 sentences in
   `battle/engine.js`) and action-result messages (~220 across `theater.js`,
   `breeding.js`, `ranch.js`, `save.js`). Neither is the wire; both are engine
   modules writing player-facing text, and R62's machinery now exists to move
   either one if that is wanted.
2. **The agenda has no entry for defending a contested node** (R56). R59 gave
   the moment a sound, R60 made its cost honest, R62 gave it a voice — the
   walker still cannot answer it. Three phases have now decorated a hole.
3. **`campaign/ui.js` is still the largest module** at 1,019 lines (R60), and
   splitting its markup means moving five pieces of shared module state.

### Standing leftovers

- The campaign plateau is still unexplained (R56).
- The duel still doesn't show a rival face (R57).
- Briefing chips still say "beats their Water" with no reason (R58).
- 26 exports are used only inside their own module (R61) — a wide interface,
  not dead content, and deliberately not gated.

## Session 83 — R61: no orphan content ✅

**Acceptance criterion:** a dead export, an unread data field and a banned word
are each a build failure — and the gate is written last, after R57 and R58
have cleared the instances it would otherwise fail on. **Passes.** No schema
change; `SAVE_VERSION` stays **34**.

### The queue named three findings; the best one was not among them

`utilityValue` was real, and it is not what the queue thought. Its own comment
says it was exported so the battle UI could rank which utility move earned one
of four buttons — *"whichever one happens to sit earliest in socket order,
which was the tail, every time, on every six-part build"*. **R30 deleted that
question:** the moveset is the cap now, so every move a creature carries is on
screen in the order it was trained, and nothing needs ranking. So this is not
an unbuilt feature. It is a **fossil of a problem another phase solved**, and
it sat there for thirty phases because nothing was watching. Removed, with the
reason kept where it stood.

Then the scan found a second dead export the queue never named, and it is the
better one:

> `knownMoves` in `battle/moves.js` is one line, and its comment says it exists
> to **be** the single definition of what a genome grants — *"so this asks it
> rather than reimplementing the rules."* Nothing called it.

The rule had **four copies**: the Pens (where a player actually picks the
four), `tools/sim.js`, `tools/smoke.js`, and the orphaned original. Wired all
three to it rather than deleting it — deleting the canonical definition and
leaving three copies is backwards. R49's shape exactly, one layer down.

**"Death Roll" is now "Spin Cycle."** The crocodile move *is* the spin, so the
joke survives the tone rule intact. CLAUDE.md states zero death language as an
absolute, not a preference, and this was the one place the game broke it.

### The gates, and what each one names on the old tree

Written last, as the queue asked. Each was run against the tree as it stood
**before R58**, where every instance still existed:

| gate | on the pre-R58 tree | today |
|---|---|---|
| every export has a reader | `utilityValue` — and `setMuted`, dead until R59 wired it | clean |
| every authored section reaches runtime | exactly `classes.json:flavor` | clean |
| zero death language | exactly `species.json "Death Roll"` | clean |

Gate 2 is R58's bug as an assertion: `indexContent` is a hand-written
projection, so a section a data file authors reaches runtime only if somebody
remembered to pick it up. It compares the 44 authored sections against what
the indexed content actually exposes.

One trap inside it, and it is the R56/R58 lesson again: **a scalar matches
anything holding the same number.** `classes.advantage` "reached"
`temperamentMeta.critMult` purely because both are the same float. A
value-only match is not evidence, so for a scalar the destination has to carry
the same name.

### Gate 1 took three attempts, and the two failures are the lesson

**Attempt 1 — "the identifier appears in another file."** That counts a
*mention*, not a call. Two things went wrong at once: naming an instrument in
the gate's own exemption list made it look called, and a comment in
`theater.js` — `// \`known\` is what the genome grants (battle/moves.js
knownMoves)` — had been hiding a genuine dead export for thirty phases. The
gate would have passed while the thing it exists to catch sat in plain sight.

**Attempt 2 — blank the comments first, then look.** Worse. `tools/smoke.js`
contains `/*` inside a regex literal, so the block-comment stripper ran from
there to the next `*/` and ate its own assertions, reporting **four healthy
exports as dead**. A gate that mangles the file it is reading is not stricter,
it is louder.

**Attempt 3 — resolve the import graph.** Ask who actually imports the name,
including through a namespace import, because `sfx.initAudio()` is a reader
and a regex written to skip property access says it is not.

Same shape as the three the last sessions recorded (R55's `confirmNewRun`
regex, R57's whole-SVG comparison, R59's function-name count): **assert the
thing, not a stand-in for it.** The difference here is that the stand-in was
inside the gate whose whole job is to catch stand-ins.

### The exemption lists have to stay live

Two lists, and both are the kind of thing that rots into a blanket:

- `tools/sim.js` holds six hand-run balance instruments — `extractorYield`,
  `infirmaryPayback` and four more — that the developer calls from `node -e`
  to answer one question. "No importer" is their normal state, not rot, and
  deleting somebody's instruments is not this phase's call. Named
  individually, never waved through as a directory.
- Three idioms carry no death sense in use: **"Dead Reckoning"** (navigation),
  **"Dead heat"** (racing), **"executed flawlessly"** (carried out — and it is
  about running away).

Both lists are checked for **liveness**: a renamed instrument or an idiom
nobody writes any more fails the build rather than lingering as a hole with
nothing behind it. And the idioms are exact **phrases**, never bare words, so
allowing "Dead Reckoning" cannot let "the beast is dead" through.

### Reported, deliberately not gated

**26 exports are used only inside their own module** — `closePicker` (9 uses),
`livingBench` (5), `announceDominion` (3) and 23 more. That is a wider
interface than needed, not dead content, and the criterion says *dead*. A gate
demanding 26 mechanical edits for no player-visible reason is a gate people
learn to route around. Recorded here instead.

### The break battery: twelve breaks, four real gaps, all four mine

| # | break | verdict |
|---|---|---|
| 1 | a new export arrives with nothing calling it | CAUGHT |
| 2 | a dead export hides behind a mention in a comment | CAUGHT |
| 3 | the exemption list waves through a shipped module | **MISSED** → fixed → CAUGHT |
| 4 | an exemption goes stale — the instrument is renamed | CAUGHT |
| 4b | an exemption names something that never existed | CAUGHT |
| 5 | a new authored section is never indexed (R58 exactly) | CAUGHT |
| 6 | an existing section stops being indexed | CAUGHT *(sibling; isolated below)* |
| 7 | a scalar section is indexed under another name | CAUGHT *(sibling; isolated below)* |
| 8 | the banned word returns to authored content | CAUGHT |
| 9 | death language arrives in an engine string | CAUGHT |
| 10 | the idiom list is widened into a bare word | **MISSED** → fixed → CAUGHT |
| 11 | an idiom exemption goes stale | **MISSED** → fixed → CAUGHT |
| 12 | a data file drops out of the walk | **MISSED** → fixed → CAUGHT |

Breaks 6 and 7 were caught by older gates that fire earlier — R58's own
line-survival assertion, and a combat assertion that went to 0% when the class
multiplier lost its name. Re-run against gate 2 alone, it names them itself:
`dropped: classes.json:flavor` and `dropped: classes.json:advantage`.

**Every one of the four misses was the same defect, and I wrote all four.**

- **3** — the exemption list would silence any export at all. The reason for
  the exemption ("a hand-run balance instrument") can only be true of a
  developer tool, so that is now what bounds its scope: a shipped module
  cannot claim it.
- **10** — *"exact phrases, never bare words"* was a **comment**. The battery
  added `['Death', 'shush']` and every "Death Roll" in the game went quiet. An
  entry must now contain a space and carry a word beyond the banned one.
- **11** — the liveness check counted the suite's own source, so listing
  `'Dead heat'` in `smoke.js` was evidence that `'Dead heat'` was still used
  somewhere. **This is the identical self-satisfaction I had already found and
  fixed in the HAND_RUN list two gates earlier, reproduced one gate later by
  the same hand.**
- **12** — dropping `species.json` from the walk made the gate report clean on
  a file it never opened. The file list is a checked value now: twenty files
  minimum, three named explicitly, and a floor on strings actually read.

### The pattern, sharpened

The last three sessions logged *assert the thing, not a stand-in for it*
(R55's `confirmNewRun` regex, R57's whole-SVG comparison, R59's function-name
count). R60 added: a gate anchored to a screen's **source text** breaks on its
setup, never its claim.

This phase adds the version that stings, because it is about gates themselves:

> **An exemption list is content, and content needs a reader.** Mine kept
> being its own. A list that satisfies its own liveness check, or that
> silences the rule it is an exception to, is not an exception — it is the
> rule switched off, written in a place nobody re-reads.

The gate whose entire job is catching authored content with no reader shipped
three drafts with exactly that bug inside it. It took the battery to find each
one, which is the argument for running a battery on a gate at all.

### Browser QA, 380px, console clean

The crocodile's bonus reads **"Spin Cycle — Slow cuts 60% more Speed"** out of
the content the browser actually loaded, and a sweep of that loaded content
for death language returns one hit: `parts.json Dead Reckoning`, the exempted
navigation idiom. Nothing else.

The Pens is where the wiring landed, and an empty Pens would have read as a
passing one — so a creature was seeded rather than assumed:

```
Moves 4/4 slots · knows 6
Rhino Rush · Suplex · Pangolin Bristles · Bear Spike
2 more it knows and cannot currently press. Swapping one in means giving one up.
```

That count and that sentence are computed from `knownMovesOf`, which now reads
the shared definition. 1,438px, no horizontal overflow, no console messages.

One thing in the screenshot that is **not** a finding: the card reads
`instability undefined/100`. That is the hand-built QA creature missing a
field every real chimera gets at splice time (`theater.js:124`), not a shipped
bug — recorded so the next person reading the shot does not chase it.

### Next session's first task

**R62 — the news wire, as a system.** The overhaul, and the one finding with a
hard convention behind it. CLAUDE.md: *"All content is data. Adding content
must never require engine edits. If it does, the engine is wrong — fix the
engine."* The wire breaks it outright: **19 player-facing news strings are
hardcoded inside engine modules** against 33 authored lines in `/data`, so the
game's own voice is half data and half engine.

R61 leaves it better armed than it found it: gate 3 already walks every string
literal in every shipped module, so it knows where those 19 live.

### Standing leftovers

- The campaign plateau is still unexplained (R56).
- The agenda has no entry for **defending** a contested node (R56). R59 gave
  that moment a sound, R60 made its cost honest, and the walker still cannot
  answer it.
- The duel still doesn't show a rival face (R57).
- Briefing chips still say "beats their Water" with no reason (R58).
- `campaign/ui.js` is still the largest module at 1,019 lines (R60), and
  splitting its markup means moving five pieces of shared module state.
- **26 exports are used only inside their own module.** Reported by this
  phase's scan, deliberately not gated: a wide interface is not dead content.

## Session 82 — R60: the War Room's decisions, out where they can be tested ✅

**Acceptance criterion:** the War Room's logic is DOM-free and testable the
way `dexProgress` is, with no change to what the screen renders — **passes,
measured**. No schema change; `SAVE_VERSION` stays **34**.

### The premise was half right, and the wrong half was the interesting one

The queue said `campaign/ui.js` is 1,139 lines of screen with its logic
tangled in. Reading it first: the *systems* were already leaf modules —
`campaign.js`, `operations.js`, `contest.js`, `rehab.js`, `rivals.js`,
`sparring.js`, `gauntlet.js`, `monologue.js`. The War Room is not a monolith
of untested logic. It is a monolith of **markup over well-factored logic**,
with a thin layer between them that nobody had ever named:

> which strip opens by default, which tab earns a badge, what a job row says
> when it cannot be run, and **how much money a counter-offensive is costing
> you**.

Every one of those was written inside a template literal, where the only way
to check one is to render the screen and read the HTML back.

### One of them was already wrong

Each counter-offensive alert computed its own strip bonus inline — *"is every
node in my strip held? then the whole bonus is at risk from me"* — beside a
function, `incomeSuspended`, that already knew the answer and is what the econ
row three inches above it prints.

With two contests open in one completed strip, both alerts claim the same
$180. Measured on Kestrel Reach, held end to end:

| contests | alerts claim | econ row says |
|---|---|---|
| 1 | $310 | $310 |
| 2 | $310 + $260 = **$570** | **$390** |
| 3 | $310 + $260 + $285 = **$855** | **$495** |

Two numbers on the same screen, at the same moment, disagreeing by 73%.

**It was unreachable only because `contestation.maxConcurrent` ships as 1** —
a value in `data/regions.json`. CLAUDE.md promises content changes never
require engine edits, so the single most obvious knob in that file makes the
War Room start lying about money. Walked it to be sure: raising it to 2 opens
a second contest and produces exactly the numbers above.

The strip bonus is a property of the **strip**, not of any one contest, so it
is now attributed once — to the first alert in that strip — and the others say
so and name the alert carrying it. The alerts now sum to `incomeSuspended` by
construction, which is the invariant the gate asserts.

### The proof: 124 cells, 119 byte-identical

"No change to what the screen renders" needs a measurement, not a promise. The
harness walks 13 fixtures × 5 tabs × 6 briefing kinds (with and without a team
picked) and hashes the markup: **124 cells**, rendered against a clean
pre-R60 worktree and against the new tree, then diffed.

**119 cells byte-identical.** The 5 that changed are all `twoContests` — the
fixture that exercises the bug. Nothing else moved, which is what makes the
diff attributable to the fix rather than to the refactor.

Checked deterministic across runs and *sensitive* before trusting it: a
one-character edit to a heading moved 12 cells.

### Three bugs found while building the proof were in the proof

This is the part worth writing down. The measurement kept passing for the
wrong reasons, and each one is the same species as R55's `{id:'a1'}` animals
and R57's locked rivals — **a broken fixture reads as a working feature**.

1. **The rival briefing was never reached.** `data-rival` lives on the Labs
   tab and the walk only ever looked at the map. R57's hole exactly, this time
   in my own harness.
2. **The live-job card was never rendered.** The fixture wrote
   `campaign.ops`; `operations.js` reads `campaign.operations`. So the Jobs
   board showed an idle board in every one of the 124 cells — and the live-job
   card is markup this phase rewrote. Fixed, re-baselined, still 119/124.
3. **`warTab` leaked between fixtures.** It is module state that survives
   every draw, and the walk only switched tabs when the target was not `map` —
   so after a fixture ended on Labs, the *next* fixture's "map" cell was a
   Labs render under a map label. Both sides of the comparison had it, so the
   identity result held, but the labels were lying.

And the browser QA reported a clean screen with **no contest card at all**: it
seeded `spliceworld:save` while the game reads `spliceworld_save`. The QA
script now exits non-zero rather than reporting on an unseeded screen.

Before spending another five minutes on the full suite, I rehearsed the new
gates standalone — which caught **two of my own gates being wrong**: one
asserted a crewed job with an empty stable says "no crew free" when the honest
answer is that it falls to the solo lane and is runnable; the other held
Kestrel without the strip that unlocks it, leaving the region closed with no
buttons to walk into. Both were fixed before the suite ever saw them.

### What moved, and what did not

`campaign/warroom.js` — 317 lines, 16 exports, DOM-free:

```
warTargetEncounter  the router — called once for the briefing, again for the
                    battle; if they disagree you fight a different fight
contestAlerts       what a counter-offensive costs (the fix lives here)
econRow  stripState  frontierRegionId  sparVerdict  tabBadge  WAR_TABS
jobsModel  jobRow  heatBand
foeRead  obedienceRead  canBringMore  fitTeam  aftermathText
```

`campaign/ui.js` is **1,139 → 1,019 lines** and is still the largest module in
the repo. Recording that plainly rather than claiming the title: the remaining
1,019 lines are markup, and the screen stays one file because it is **one
state machine written in two halves** — `warTab`, `draftTarget`, `draftTeam`,
`lastAftermath` and `identityRoll` are shared module state; the map builds the
briefing's target and the briefing writes the map's aftermath. Splitting the
markup would mean moving that state somewhere both halves can reach, which is
a different phase with real render-identity risk, not a tidy-up.

Two dead imports (`opTuning`, `threatRung`) fell out while rewriting the lines
they sat on. Both predate this phase — exactly what **R61**'s unreferenced-
export gate is for.

### Browser QA, 380px, console clean

Kestrel Reach held end to end with a counter-offensive live on it, so the
number the phase changed is on screen:

```
COUNTER-OFFENSIVE — Crop-Duster Strip
5h 0m to hold the line · $260/day suspended until you do
(the node plus Kestrel Reach's $180 strip bonus)

TERRITORY +$1025/day  incl. +$150 strip bonus  −$260 contested
```

$260 in the alert, $260 in the econ row — the two numbers that disagreed by
73% at two contests, now agreeing at one. Map 1,697px, Labs 1,814px, Jobs
1,467px, Bays 890px, Wire 877px. No horizontal overflow on any tab, no console
messages, and the alerts sit above the tab bar on all five (R15's rule),
checked on the rendered page rather than in the source.

### Four gates were anchored to the screen's source, and all four broke

Seven places in the suite read `campaign/ui.js` as *text*. Moving the
decisions broke four of them — the tab list, the gauntlet router and two spar
gates — and every one broke on its **setup**, never on its **claim**.

That is the session's recurring pattern arriving from the other direction. A
gate that greps a screen for `kind === 'gauntlet') return gauntletEncounter`
is asserting that a *string appears in a file*; what it means to assert is
that a stage resolves to the authored fight. Now that the router is
importable, it does:

```js
const viaBriefing = warTargetEncounter(held, { kind: 'gauntlet', stageId }, content, t0);
assert.deepEqual(viaBriefing.waves, rawStage(held, content, stageId).encounter.waves);
```

Four proxy assertions became four real ones, and only because the code moved
somewhere it could be **called** instead of matched. That is the argument for
this phase, better than any line count.

### The break battery

Twelve breaks. **All twelve caught**, each on the assertion it was aimed at.

| # | break | caught by |
|---|---|---|
| 1 | the bonus is claimed in full by every alert (the original bug) | the alerts total what the econ row prints ($545 vs $365) |
| 2 | the bonus is **split evenly** — total right, shape wrong | one alert carries the strip bonus |
| 3 | the other alerts stop saying the strip is down | Radio Mast still says the strip is down |
| 4 | the strip is down and nothing says who is carrying it | and names the alert carrying it |
| 5 | an unfinished strip invents a bonus to lose | an incomplete strip puts no bonus at risk |
| 6 | the screen keeps its own opinion about what is suspended | *(a crash — see below)* |
| 7 | a DOM reference creeps into `warroom.js` | warroom.js never touches a DOM |
| 8 | the briefing and the battle stop facing the same team | the briefing and the battle face the same team |
| 9 | a tab wears a badge with nothing behind it | map never wears a badge |
| 10 | the heat bands overlap by one | strict equality on the boundary |
| 11 | the map opens on a strip already finished | a finished strip stops being the frontier |
| 12 | the foe read stops resolving units named by id | a wave named by id and the same wave inlined read the same |

**Break 2 is the one worth keeping.** Splitting the bonus evenly across the
alerts leaves the *total* correct — gate 1 passes it — and it is still wrong,
because the money is attributed to contests that are not costing it. Gate 2
caught it on shape. Two gates that look redundant are not; one of them exists
for exactly this break.

**Break 6 was a category error.** It re-added `incomeSuspended(...)` to the
screen after the extraction had removed the import, so Node threw
`ReferenceError` before the gate could speak: that tests the module system,
not the guard. Re-run as **6b** with the import wired in, so the screen really
does keep a second opinion. The gate is what caught it:

```
CAUGHT  6b the same second opinion, wired so it actually runs
        AssertionError: the screen does not recompute what is suspended
```

### Next session's first task

**R61 — no orphan content.** Three findings and the gate that would have
caught all of them: `utilityValue` in `battle/ai.js` is exported and appears
exactly once in the repo (its own declaration); `species.json` names a
crocodile move **"Death Roll"** against CLAUDE.md's *"Zero death language"*;
and R57/R58 were both authored content with no reader. R50's `MODULE_NOTES`
catches an unclassified module; nothing catches an unreferenced export or an
unread data key. This phase adds two more instances to its pile —
`opTuning` and `threatRung`, imported into the War Room and never used.

Then **R62**, the news-wire overhaul: 19 hardcoded strings in engine modules
against CLAUDE.md's "all content is data".

### Standing leftovers

- The campaign plateau is still unexplained (R56).
- The agenda has no entry for **defending** a contested node (R56). R59 gave
  that moment a sound and R60 made its cost honest — the walker still cannot
  answer it.
- The duel still doesn't show a rival face (R57).
- Briefing chips still say "beats their Water" with no reason (R58).
- `campaign/ui.js` is still the largest module in the repo at 1,019 lines.
  Splitting the markup means moving five pieces of shared module state
  somewhere both halves can reach — a phase, not a tidy-up.

## Session 81 — R59: audio outside the arena ✅

**Acceptance criterion:** the moments that matter outside a fight are scored,
and the mute toggle still silences all of it — **passes**. No schema change;
`SAVE_VERSION` stays **34**.

### The audit nearly filed a sixteenth finding that wasn't there

The queue said fourteen stingers exist and combat uses most of them. Checking
before writing, one — `waveIn` — looked unplayed. It isn't: the grep matching
stinger names used `[a-z]+` and the capital `I` hid it. **All fifteen fire.**
The problem was only ever *where*: fifteen `sfx.play()` call sites and **nine
of them in `battle/ui.js`**. Three in the shell, two in the Pens, one each in
Extraction and the Theater. The War Room and the Dex made no sound at all.

A game scored for its fights and silent everywhere else.

### One rule, four cues

The temptation is to score everything — a chirp per tab, a tap per button.
The rule that decides it: **a sound marks a change in your position** —
something arrived, completed, or was taken from you. Navigation is not an
event, and the shell already has one `click`.

```
alarm     a node you hold is contested   (the only cue with a deadline)
conquest  a node taken
report    a job came back
decant    a resequenced donor arrived
```

Four new stingers to carry them: two sawtooth stabs, a rising triad, a
two-note ding, a sine rise and pop.

### The mapper is data, not four copies of a decision

`watchSignals` takes a snapshot of five scalars off `gameState`; `cuesFor`
diffs two snapshots and returns cue names. Both live in `audio/sfx.js`, not
sprinkled across four screens — *"what deserves a sound"* is one decision, and
four copies of it drift. Because it reads scalars it is DOM-free, so the suite
asserts every cue with no browser and no `AudioContext`.

`tick()` is the hook, and deliberately: it is the only place that can see a
job come back or a node fall **while nobody was looking**. A screen can only
score what happens while it is open.

Two judgements, both gated in both directions:

- A resequencing run that ended **with an animal arriving** decants. One that
  ended without is an **abort the player did on purpose and already saw** — no
  sound for something you just did to yourself.
- **Losing a node is silent.** The wire says it; a fanfare would be the wrong
  feeling and a klaxon would punish a player for reading the news.

### The break battery — and the third instance of one pattern

Eight breaks. **Seven caught, one MISSED, and the miss was a real gap.**

| # | break | verdict |
|---|---|---|
| 1 | a cue names a stinger nobody wrote | CAUGHT |
| 2 | the alarm stops firing | CAUGHT |
| 3 | every tick makes a noise | CAUGHT |
| 4 | an aborted run is announced as a decant | CAUGHT |
| 5 | losing a node gets a fanfare | CAUGHT |
| 6 | the shell stops snapshotting before the tick | CAUGHT |
| 7 | the shell stops playing what changed | CAUGHT |
| 8 | a second path around the mute appears | **MISSED** |

Break 8 added `playUnmuted` — a second, unmuted route to the synth. The gate
counted functions *named* `play`, and `function play` in `playUnmuted` is not
followed by `(`, so the count stayed at 1 and the suite stayed green. **A
player who muted the game would have kept hearing it.**

The invariant is **one path to sound**, not one function with a particular
name. Rewritten to find every function that reaches `voice()`, require exactly
one, and require that it is the one checking the mute. Re-run against two
breaks, not one — the original, plus an `8c` that removes the mute check with
*no* second function at all, to check the fix generalises instead of being
tuned to break 8's silhouette:

```
CAUGHT  8 (rerun) a second path around the mute appears
        exactly one function reaches the synth (playUnmuted, play)
CAUGHT  8c the mute check itself stops applying
        play() refuses while muted
```

**Third time this session** a gate was true of the text and silent about the
claim: R55's `confirmNewRun` regex matched the definition while the *call* was
gone; R57 compared whole SVGs, which name and colour alone satisfied; this one
counted a name instead of a path. Same shape every time — **assert the thing,
not a stand-in for it.** Recording it as a pattern rather than three
footnotes, because the tell is consistent: when a gate asserts something
*near* the claim because the claim is awkward to reach, that convenience is
the bug.

### No browser QA, and why

The harness cannot hear. The cue logic is DOM-free and fully gated headless;
what a browser run would add is a screenshot of an unchanged screen. Noted
rather than staged, the same call made for R52's Theater half. The mute toggle
itself is unchanged and already covered.

### Next session's first task

**R60 — split the War Room.** `campaign/ui.js` is 1,136 lines, the largest
module in the repo: five tab views in one file, and the only screen that
needed a `document` guard (R49) before the harness could render it. The Dex
already has this shape — logic in `dexentry.js`, bar in `ui/tabs.js` — and the
War Room is where both patterns came from.

Then R61 (no orphan content: `utilityValue`, "Death Roll", plus the gate) and
R62 (the news wire overhaul — 19 hardcoded strings in engine modules).

### Standing leftovers

- The campaign plateau is still unexplained (R56).
- The agenda has no entry for **defending** a contested node (R56) — and R59
  just gave that moment a sound, which sharpens it: the game now shouts about
  a thing the walker has no way to answer.
- The duel still doesn't show a rival face (R57).
- Briefing chips still say "beats their Water" with no reason (R58).

## Session 80 — R58: the triangle says why ✅

**Acceptance criterion:** the reason appears where the multiplier does, and
smoke asserts every matchup line has a reader — **passes, measured in the
browser**. No schema change; `SAVE_VERSION` stays **34**.

### It was worse than "nothing reads them"

The queue entry said `classes.json` carries authored lines that nothing
reads. Probing the runtime shape first — the R56 habit — turned up something
sharper: **`indexContent` kept only the class list and the two multipliers,
so the whole `flavor` block was dropped at index time and never reached
runtime at all.** A reader written before this phase would have found nothing
there to read. My first probe returned four `null`s, which is what exposed it.

Same trap as R56's `content.director.counters`, caught the same way: ask the
runtime what shape it actually has instead of trusting the file.

And it is **four lines, not three** — my audit missed `unclassed`, which is
the one no hit can ever fire, because a neutral matchup has no multiplier to
explain.

### One predicate, because the key order is the trap

The flavor is keyed `winner_loser`. At the moment of a hit the winner is the
**attacker** when the multiplier is up and the **defender** when it is down —
so a second reader constructing that key itself is a second chance to get it
backwards. `classReason` and `hitReason` live in `campaign/matchup.js`, which
imports nothing and is therefore safe for both the battle engine and the Dex
to read. R49's lesson applied *before* the second reader existed.

### Once per matchup, not once per hit

The reason fires as its own `info` event after the hit it explains — an
existing event kind, so the arena already knows how to pace it. Said on every
hit it is noise; said never is the bug this phase fixes. R37's rule: the
lesson arrives at the wall it explains, the first time you walk into it.

Probed in a real fight: **three hits printed the multiplier, the reason said
it once.**

### Browser QA, 380px, console clean

```
🦶 Ground beats Water — Solid footing beats a flopping swimmer on dry land.
🌊 Water beats Air — A soaked flyer is a falling flyer.
🪽 Air beats Ground — You cannot punch what refuses to stay on the ground.
```

The Dex is the lookup home, and the only place `unclassed` can live. The list
costs **188px** against the one-line paragraph it replaced (~60px), putting
the roster tab at **2,909px / 3.6 screens** — inside R45's 4.4-screen worst
case. Recorded rather than waved past.

### The break battery

Nine breaks. **Seven caught, one bad break, one bad anchor re-run.**

| break | verdict |
|---|---|
| `indexContent` drops the flavor again | CAUGHT |
| the reason fires on every hit | CAUGHT |
| the reason never fires | CAUGHT |
| the key order is flipped, explaining the wrong edge | CAUGHT |
| a neutral hit starts explaining itself | **MISSED — bad break** |
| the Dex lists edges without reasons | BADANCH (my escaping) |
| 6 (rerun, correct anchor) | **CAUGHT** — `the Dex names why ground beats water` |
| the `unclassed` line loses its only home | CAUGHT |
| an authored line is deleted from the data | CAUGHT — `classes.json authors reasons (3)` |

Breaks 2 and 3 are the pair that matters: **too often and never**, both
caught. A gate that only asked "does the reason appear" would have passed
the noise failure.

**Break 5 was a bad break, and worth being precise about rather than
counting as a gap.** Removing the `mult === 1` guard changes nothing
observable: two *different* classes can never produce a multiplier of 1 —
they either interact or one is null, which the preceding guard catches — and
same-class falls through to a `ground_ground` key that does not exist and
returns null anyway. The guard is defensive against a state the triangle
cannot produce, so there was no behaviour for the gate to catch.

Break 6's bad anchor was the uniqueness assert (added at R55) doing its job:
a 0-hit anchor now fails loudly instead of reporting as a silent miss.

### Known gaps

- The briefing chips still say `beats their Water` with no reason. The chips
  are inline spans on per-chimera rows, so a sentence there would cost the
  height R35 and R44 fought for. A `title=` tooltip is the R47 pattern but is
  nearly useless on a phone, which is why it was not done rather than done
  badly.
- The reason is per-battle, so a player who reloads mid-fight hears it again.
  `classSaid` lives on the battle, not the save, which is the right scope.

### Next session's first task

**R59 — audio outside the arena.** Fifteen `sfx.play()` call sites, nine of
them in `battle/ui.js`; taking a node, beating a rival, a chimera levelling
and a resequence decanting are all silent.

## Session 79 — R57: the rivals get their own faces ✅

**Acceptance criterion:** a rival has a face, it is procedural and seeded
from the field that has been waiting for it, and the Dex dossier and the War
Room both use it — **passes, verified by looking at it**. No schema change;
`SAVE_VERSION` stays **34**.

### Three villains represented on screen by their pet

`portraitSeed` was authored on all three rivals at R27 and had **zero
references in any `.js` file**. `campaign/ui.js` drew the rival's LEAD
CHIMERA into a slot it calls `.rival-portrait` — so a cast with titles,
philosophies, monologue sets and escalating dossiers was depicted by their
creatures, and the Dex dossier carried no art at all.

### Procedural, seeded, and built on what already existed

The same rival draws the same face on every device and every reload, and a
fourth rival is three JSON fields rather than an art commission. Tinted by
`classBias`, so the picture carries the one thing about a rival that decides
a fight.

Built on the **same shape vocabulary and the same `shapeToSVG`** every enemy
unit already uses — the enemy roster is full of procedurally drawn people in
riot gear, so the drawing system existed. **No new module**, so R50's
`MODULE_NOTES` needs no entry.

### Two defects found by LOOKING, which no assertion would have caught

- **Every rival came out bald.** The first cut drew hair as an arc band from
  y −22 to −34, inside a head rect starting at −46, so it rendered as a
  sliver behind the face. Shape counts and SVG lengths were all healthy.
- **A brow tilt of −8..8 is not an expression, it is a rounding error.** All
  three wore the same face. Widened to −14..14, with the mouth agreeing.

The crown reads as hair on some seeds and a surgical cap on others. For a
cast of lab villains both are right, so it is named for what it covers
rather than for one reading.

### The War Room slot draws the rival now

The face is the portrait; what a rival **leads with** is kept underneath at
half size, because that is roster information rather than identity. Measured
at 380px: an unlocked card goes ~207px → ~260px, **+98px across the Labs
tab** for three villains gaining identities. Recorded as a number so a later
session can revisit it with evidence rather than taste — the lead creature is
also named with HP/PWR in the roster line below it, which is the argument for
dropping it if the tab ever needs the height back.

### Browser QA, 380px, console clean

| surface | result |
|---|---|
| Dex › Foes | 3 rival rows, **1 face** (the met rival), 2 still `???` |
| War Room › Labs | Mantissa and Aloft with faces + leads; **Trench locked and redacted** |
| overflow | none |

**The first QA run proved nothing and I nearly reported it as a pass.** My
fixture gave one node and 60 notoriety, so every rival was LOCKED, the War
Room drew three redaction boxes, and the portrait was never exercised.
Mantissa needs a `checkpoint` node and 40 notoriety; Aloft needs
`guard_post` and 70. Unlocking two and leaving Trench locked puts both
states on screen at once.

### The break battery

Eight breaks. **All caught — but one only after the gate it exposed was
fixed.**

| break | verdict |
|---|---|
| the seed is ignored, so every rival wears one face | **MISSED — a real gap** |
| 1 (rerun, gate fixed) | **CAUGHT** — `their own FACE, not merely their own name and colour (1/3)` |
| the portrait stops carrying the class | CAUGHT |
| the face is not reproducible | CAUGHT |
| the Dex leaks a face for a rival never met | CAUGHT |
| the War Room portrait goes back to the pet | CAUGHT |
| a rival with no seed crashes instead of drawing | CAUGHT — `TypeError` |
| the portrait stops naming whose face it is | CAUGHT |

**Break 1 is the phase's real lesson, and it is the third time this session.**
The distinctness gate compared **whole rendered SVGs**, which differ by
`aria-label` (the name) and by the class tint even when every rival shares
one seed. So "every rival has their own face" was satisfied by the NAME and
the COLOUR — the seed could be ignored entirely and the suite stayed green.
That is R51's `logged.includes('logged')` again: an assertion true of the
rendered output and silent about the claim. It now compares the shapes at a
fixed class, so only the features the seed picks can satisfy it.

Worth noting the near-miss on the same theme: **an assertion of mine was
wrong about my own design** and was corrected before the battery ran. I had
claimed the same seed draws an identical SVG across rivals. It does not and
should not — the label carries the name and the tint carries `classBias`,
both deliberately.

R45's per-tab portrait gate moved its anchor: the foes tab legitimately
draws its 40 units **and** its 3 dossier faces. Derived from content rather
than bumped to 43, so a fourth rival moves the number by itself.

### Known gaps

- The duel does not show the face. The roadmap entry named the Dex and the
  duel; the duel's call-and-response is text in the message box, and putting
  a portrait there is a battle-screen layout change that deserves its own
  measurement rather than a drive-by.
- The `+98px` on the Labs tab is unexamined beyond being recorded.

### Next session's first task

**R58 — the triangle never says why.** `classes.json` carries three authored
lines explaining each matchup and nothing reads them; the engine prints
"Ground beats Water!" and swallows the reason.

## Session 78 — R56: the playthrough, walked ✅

**Acceptance criterion:** the harness plays a whole campaign headless and
reports the curve, and one deliberately broken economy number fails the
build — **passes**, with an honest caveat about *which* gate does the
failing (below). No schema change; `SAVE_VERSION` stays **34**.

### The walker does not invent a policy

Every measurement this project owns is a **slice**: `runSim` benches a
build, `ladderBench` a ladder, `regionBench` a strip, `facilityPayback` a
track. None answers what it is like to *play* this from an empty ranch, and
R41's trajectory math is an assumption the whole late game rests on.

`campaignWalk` drives one seeded save on a simulated clock and does whatever
`agendaShape` — the game's own answer to "what can I do right now" — says is
open. So the curve is the game's designed pace rather than mine, and a tick
offering nothing productive **is** a stall, measured with the same code the
Ranch screen renders from.

### Getting an honest walker took three policies

The first two measured the walker, not the game:

1. **Assaulted every tick. Went 140–1191.** A player who lost 1,191 fights
   would have quit; any curve underneath that is meaningless.
2. **Trained the whole stable every cooldown and spent to $3**, then could
   not buy an animal or feed the ones it had. Doing *nothing* nets **+22/day**
   ($40 stipend against $18 upkeep), so that insolvency was entirely the
   policy's doing.
3. **Shipped:** care first; a fourteen-day upkeep reserve before any
   discretionary spend; one assault a day; no second attempt on a node that
   already beat this exact roster. **187–36**, never below the reserve.

### Four bugs of mine, three of them signature errors

`careStatus` takes `(animal, now)`, not `(state, animal, …)`. `catalogFor`
returns **species objects**, so the `.affordable` the walker looked for was
always `undefined` and it never bought anything. `validateSplice` returns an
**array of error strings**, so `.ok` was undefined and always falsy — the
first walk produced six parts and never wore any of them.

The fourth was a **hollow metric caught by reading rather than by the
battery**: `applyElapsed` clamps funds with `Math.max(0, …)`, so funds can
never go negative and a `brokeHours` counting `funds < 0` could not fire.
Insolvency here means *pinned at zero*.

### What the walk found

- **The agenda has no entry for defending a contested node.** It is the one
  action in the game with a deadline that costs you territory, and a player
  following the agenda is never told to do it. The walker had to defend
  directly, outside the agenda, or it bled nodes silently. Same shape as
  R48, and a candidate phase.
- **`longestStallHours` is 0 across every seed over 240 simulated days.**
  A4's promise — that something *productive* is always open, not merely
  something to buy — holds across a whole campaign and not just one save.
- **The campaign plateaus.** First parts at day 0.08, first chimera 0.17,
  first node 0.25 — then 1–5 nodes held and **no dominion in 240 days**,
  with 110+ defences at ~55% held. **Whether that is the game or the walker
  is NOT established**, and it is deliberately not asserted or claimed.
  Settling it needs its own measurement.

### The break battery, and what it honestly showed

Nine breaks. Eight caught, one bad break — but the count is the least
interesting part.

| break | verdict |
|---|---|
| the stipend goes to zero | CAUGHT — **sibling** (M1's `stipend minus upkeep`) |
| chimera upkeep flattened | CAUGHT — **sibling** (R25's `upkeep climbs with grade`) |
| 2b. upkeep scaled 60×, curve intact | CAUGHT — **sibling** (R25's R11-floor gate) |
| the starting funds gutted | **MISSED — bad break** |
| graduation removed from the agenda | CAUGHT — **sibling** (A4) |
| 4b. agenda offers it, the action refuses | CAUGHT — **sibling** (M2's `assert.ok(resA.ok)`) |
| the agenda offers no productive work | CAUGHT — **sibling** (A4) |
| the coalition never comes back | CAUGHT — **sibling** (R9) |
| the walk is not reproducible | **CAUGHT — this phase's own gate** |

**Every break except determinism was caught by a pre-existing gate.** That
is not an accident and it is worth stating plainly rather than counting
eight catches and moving on: the walker sits on top of heavily gated
systems, so anything that breaks a *system* trips that system's gate long
before the walk runs. Two rounds of isolation (2b, 4b) failed to find a
break the walk catches first.

So: **the walk's gates are redundant, not hollow.** They can fail — they are
simply second in line. The distinction matters, because a hollow gate is a
lie and a redundant one is a seatbelt. They are kept for that reason, and
because a future refactor that removes a sibling should not silently remove
the coverage too.

**The walk's real deliverable is the measurement, not its gates** — the
curve, the stall metric, the agenda gap, and four of my own bugs it exposed.
The one thing it uniquely guards today is that the same seed walks the same
way twice.

Break 3 was a **bad break**: dropping starting funds from $300 to $1 changes
a number without changing an outcome, because the stipend nets +22/day — the
player is poor, never insolvent, and still closes the opening loop on day
one.

**Two fixes to the battery harness itself.** After R54's break 3 silently
patched an identical earlier line, `patch()` now asserts its anchor is
**unique** — and it earned that immediately, catching a 0-hit anchor in this
very battery. And a bad anchor now reports `BADANCH` and continues rather
than aborting the run, so one loud mis-aim no longer costs the other six
verdicts.

### Known gaps

- The plateau is unexplained, and the walker's strength is the confound.
- The walker does not breed, use the Chaos Vat, treat scars, or buy facility
  upgrades. Those are enhancements to the loop rather than the loop, but a
  walker that used them might not plateau — which is part of why the plateau
  is not claimed as a finding.
- The walk's only uniquely load-bearing gate is determinism.

### Next session's first task

**R57 — three villains with no face**, or settle the plateau first. The
plateau is the more interesting question and the walk now exists to answer
it: give the walker the enhancements it skips and see whether dominion
arrives.

## Session 77 — R55: a second run ✅

**Acceptance criterion:** a player can start over without clearing site
data, and cannot do it by accident — **passes, measured in a real
browser**. No schema change; `SAVE_VERSION` stays **34**.

### The audit found a category, not a button

`newGameState()` existed and nothing in the UI could reach it, so the only
way to start over was to clear site data — indistinguishable from losing
your game by accident. The sacred rule is that a save is never *destroyed
by a migration*; it was never that a player may only ever have one run.

Building it forced a distinction the save has always had and never named.
**Three fields are not part of the run:**

- `settings` — a device preference. Wiping it un-mutes somebody's phone
  because they started a new game.
- `guidesSeen` — 22 field notes already dismissed. R37 put every lesson
  behind the wall it explains, so a fresh save re-fires all of them as the
  player re-reaches each system. That is the tedium tax on run two.
- `ui.collapsed` — which cards they like shut.

`CARRIED_ACROSS_RUNS` names them, and the gate asserts **the list**, not
only its current members, so a fourth entry has to be a decision rather
than a slip.

### That category is a correction to R54, shipped the session before

`adoptSave` wrote an imported save wholesale, so **importing a muted
friend's save muted your phone**. One list now answers "what is a run" for
both the reset and the import, because two answers is exactly how the two
paths drift apart. A deliberate change to behaviour shipped one phase ago,
made because R55 is what forced the category to exist.

### Cannot happen by accident, cannot destroy what it replaces

Two taps, and the second is reached only after the first says out loud what
it costs — chimeras, animals, part tokens, nodes held, days — with the
download button repeated **inside** the confirmation, because "there is a
backup in this browser" is not a plan a player can hold.

An **empty** run skips the dialogue. Confirming the destruction of nothing
is how a player learns to tap through the confirmation that guards a real
run.

The reset goes through the same `adoptSave` R54 built, so the outgoing run
is set aside first and the reset is **refused outright** if it cannot be.
`downloadSave()` was extracted rather than duplicated: the confirmation is
where it matters most, so it must not be the copy that drifts.

### Browser QA, 380px, console clean

| step | result |
|---|---|
| fresh save | resets immediately, no dialogue |
| played save | `⚠ Start a new run?` · *"2 chimeras, 3 animals on the ranch, 4 part tokens, 2 nodes held, over 37 days"* · run still live |
| cancel | back on the panel, chimeras still 2 |
| download inside the confirmation | `spliceworld-lab-v34-2026-09-02.json` |
| confirm | chimeras 0, nodes 0, funds 300, **1 backup holding the played run** |
| carried | `muted=true`, `guidesSeen=2`, `folds=1`; the mute button still reads 🔇 |

One number needed disambiguating rather than reporting: post-reset stock
read **3**, which could have been the old herd surviving. It is
`goat/Miriam, goat/Poppy, bear/Nigel` — M1's starter herd, freshly seeded —
while the backup holds the old `bear, tiger, wolf`.

**The first QA run failed, and it was the fixture rather than the game.** I
seeded `{id:'a1'}` animals with no `species`, so `stockUpkeepPerDay` threw
on every render and took the overlay down with it — a broken fixture
reading exactly like a broken feature. R46 made the same mistake about the
same screen.

### The break battery

Twelve breaks. **Ten caught outright; two real gaps, and they are the same
mistake twice.**

| break | verdict |
|---|---|
| the reset keeps the run | CAUGHT |
| the reset wipes the device preferences too | CAUGHT |
| a fourth field crosses the boundary silently | CAUGHT |
| carried values are shared references | CAUGHT |
| the new run reuses the old world seed | CAUGHT |
| the confirmation miscounts what is at stake | CAUGHT |
| every run reads as empty, skipping the confirmation | CAUGHT |
| the reset sets nothing aside | **MISSED — a real gap** |
| 8 (rerun, now gated) | **CAUGHT** |
| one tap ends the run | **MISSED — a real gap** |
| 9 (rerun, now gated) | **CAUGHT** |
| the import clobbers device preferences again | CAUGHT |

**Neither miss was a bad break.** Break 8 replaced the shell's `adoptSave`
call with a direct `localStorage.setItem`: the gate exercised `adoptSave`
itself and never asserted that the shell *uses* it — R49's lesson, that a
shared mechanism needs every reader asserted and not only the mechanism.
Break 9 replaced the *call* to `confirmNewRun` and left its definition
standing, so a regex over the whole file still matched — R51's
`logged.includes('logged')` in different clothes.

Both are now asserted where the claim lives: the reset handler is sliced
out of `main.js` and read inside, both reset paths must go through
`adoptSave`, and the shell may not touch `localStorage` at all.

**One process fix shipped with the battery.** After R54's break 3 silently
patched an identical earlier line, `patch()` now asserts its anchor is
**unique** and fails loudly on a mis-aim rather than reporting it as a gate
failure.

### Known gaps

- The reset keeps `guidesSeen`, so a player who genuinely wants the
  tutorials again has no way to ask for them. Deliberate — re-teaching
  somebody who has already read them is the larger insult — but a "show me
  the field notes again" toggle would close it properly.
- Backups still accumulate under `spliceworld_save_backup_*` and nothing
  prunes them (carried from R54).

### Next session's first task

**R56 — the playthrough has never been walked.** Every measurement is a
slice; nothing walks one seeded save from an empty ranch to dominion and
reports the pacing curve.

## Session 76 — R54: a save that can leave the browser ✅

**Acceptance criterion:** a save can leave the browser and come back, an
import can never destroy the game already in progress, and every refusal
says which rule it broke — **passes, measured in a real browser**. No schema
change; `SAVE_VERSION` stays **34**.

First phase of the third audited queue (ROADMAP §9.3, R54–R62), which this
session also wrote.

### Nobody had built the door

A grep for any export, download or backup path returned **zero**.
`SAVE_VERSION` and the migration table protect a save from *this code*
changing under it; nothing protected it from the browser it lives in, from
a new phone, or from installing the TWA. For a project whose defining rule
is that a save is sacred and is never reset, that is the largest hole in
the rule. Size was never the obstacle — a completionist save is **~38 KB
against a ~5 MB budget**.

### Three verbs, none of which touch the DOM

`exportSave` wraps the save with its app id, format and version;
`importSave` parses, identifies, refuses or migrates; `adoptSave` installs
it. All three live in `save/save.js` and are DOM-free, so the harness
exercises every path — including the ones a browser only reaches when it is
full or locked down — without a browser. `main.js` holds the door and none
of the lock.

**Every refusal names the rule it broke**: `not-json`, `not-spliceworld`,
`no-version`, `from-the-future`, `migration-failed`. A player only ever
meets one when something has already gone wrong, which is exactly when
"invalid file" is most expensive — it cannot tell a typo from a lost
campaign. A **bare save is accepted** alongside the wrapper: someone's raw
`localStorage` dump is plainly readable, and refusing it would be pedantry
rather than safety.

### The rule the feature exists for

An import is the only operation in the game that replaces a running save,
so the running save is set aside first — the same backup key `loadSave` has
always used for a corrupt one, applied to a deliberate act.

**And if that backup cannot be written, the import is refused rather than
completed.** A full disk loses the import, never the campaign. That is the
one outcome this phase exists to prevent, so it fails closed.

Adoption reboots rather than swapping state under the running screens:
every screen, timer and module-level cache was built against the old save,
and boot is the one path already proven to set all of them up.

### Browser QA, 380px, console clean

| check | result |
|---|---|
| footer buttons | `savefile 301–334`, `mute 339–372`, no overlap, ticker clear at 296 |
| export | `spliceworld-the-gurgling-annexe-v34-2026-09-02.json`, real blob, 3,718 bytes |
| import a different save | live `funds 4321 → 9999`, **backup kept** (`funds=4321 seed=777`), page reloaded |
| junk file | *"That file is not JSON. The centrifuge declines to spin it."* — live save untouched |

Driven through the real `<input type="file">` with a real `File`, and the
real anchor download intercepted at `HTMLAnchorElement.prototype.click` —
the two things the headless harness structurally cannot reach.

Two shell fixes came with it: both footer buttons were absolutely
positioned at the same right edge and would have **stacked**, and the
ticker's reserved gutter widened to match. `sw.js` CACHE bumped so stale
shells drain.

### The break battery, and the accident in it

Twelve breaks. **Eleven caught; the one miss was a bad break that found a
real gap** — which is the most useful thing that happened this phase.

| break | verdict |
|---|---|
| the import stops setting the running game aside | CAUGHT |
| a failed backup no longer refuses the import | CAUGHT |
| a save from a newer build is accepted | **MISSED — bad break** |
| 3b. …aimed at `importSave` specifically | **CAUGHT** |
| 3c. …aimed at `loadSave`, the one break 3 hit | **CAUGHT** (by the gate below) |
| every refusal collapses to one reason | CAUGHT |
| the import stops migrating | CAUGHT |
| the round trip quietly loses a field | CAUGHT |
| the filename stops carrying the version | CAUGHT |
| any object with a `saveVersion` is a save | CAUGHT |
| the shell loses the button | CAUGHT |
| adoption stops rebooting | CAUGHT |

**`if (save.saveVersion > SAVE_VERSION) {` appears TWICE, character for
character** — `loadSave`'s at line 535 and `importSave`'s at 615 — and the
break's `replace(..., 1)` patched the first. `importSave`'s check was never
touched, so its gate never had a chance to fire. A bad break, cleanly.

But the suite **passed with `loadSave`'s refusal disabled**. That check has
guarded the boot path since M0 and *nothing has ever asserted it*: a save
from a newer build must not load into an older one, and must be kept rather
than destroyed when refused. Not R54's code, but R54's rule, and R54's
battery is what noticed. Both halves are gated now, and 3c confirms the
gate fires rather than merely looking right.

The lesson is narrower than "check your breaks": **a `replace(old, new, 1)`
against a string that is not unique is a silent mis-aim**, and the battery
reports it as a gate failure. Worth anchoring breaks on the surrounding
line, not the interesting one.

### Known gaps

- The export writes a plain file. Anyone who edits one can hand themselves
  a prismatic stable — deliberately not defended, because a single-player
  local save has nothing to protect and a checksum would only make an
  honest recovery harder.
- Old backups accumulate under `spliceworld_save_backup_*` and nothing
  prunes them. At ~38 KB against ~5 MB it is 100+ imports before this
  matters, and pruning is how a rescue disappears.
- R55 is what makes this feature complete: a reset is only safe once a
  player can carry the first run out.

### Next session's first task

**R55 — A second run.** `newGameState()` is reachable only from a missing
or corrupt save; there is no reset anywhere in the UI. Now that a save can
leave the browser, starting over stops being destructive.

## Session 75 — R53: one Vault shelf per animal ✅

**Acceptance criterion:** the Vault is one shelf per animal, and a
completionist's inventory fits a phone — **passes, measured in the
browser**. No schema change; `SAVE_VERSION` stays **34**.

### My own recorded objection was wrong

R52 left this as a decision rather than a task, and left the argument
against it in my own words: *merging would make "what can I splice with"
harder to scan.* Built and measured, that is false. **Both halves were
already a fold per species**, so the taps needed to reach a part are
unchanged — what changed is that the same animal stopped occupying a row in
each of two cards.

The split was historical, not designed. An extraction produces one vial
**and** that animal's parts, from the same donor, in the same moment. Only
the screen pretended they were separate collections.

### Measured at 380px

| inventory | R51 | R52 (two cards) | R53 (one shelf) |
|---|---|---|---|
| nothing extracted | 260px | 260px | **224px** |
| 3 graduations | 673px | 673px | **330px** |
| 10 | 1,723px | 1,052px | **638px** |
| 25 | 3,973px | 2,297px | **1,302px** |
| **41 (completionist)** | **5,999px (7.5)** | 3,044px (3.8) | **1,788px (2.2)** |

Bays halve: 68 folds become 34, because one animal is one bay.

### R52's threshold is retired, not re-anchored

R52 kept a rack of four or fewer **flat**, so a new player saw their vial
without tapping. That was right while a fold hid one line. A bay hides an
animal's whole parts list — and applying the old rule to the new fold
measured **1,357px against the two-card layout's 673px**. The rule doubled
the screen it existed to protect.

So every bay is now closed, at every size. **No threshold at all**, which is
a simpler rule and a smaller screen. Two things make it safe:

1. **The summary carries the holdings** — `Goat · 1 vial · 6 parts · ★4.0 ·
   APEX` — so a closed bay still answers what you own. You open it to act,
   not to look. A first graduation reads `Bear 1 vial · 6 parts ★3.2
   Standard`: one row that says exactly what that animal produced.
2. **The Resequencer never depended on a fold to be found.** `guides.json`
   has taught it on this screen since R31, so the visible button was not
   what made the feature discoverable.

Bays holding a vial sort first, because a vial is the only thing on this
screen with a button.

### Browser QA, 380px, console clean

The shapes that matter are the **diverged** ones — a real mid-game vault has
had the Resequencer spend from one half and the Theater from the other, so
the two halves stop lining up.

| state | Vault | bays | buttons |
|---|---|---|---|
| 3 graduations, halves overlap | 330px (0.4) | 3 | 3 |
| **diverged** — vials 0–4, parts 3–9 | 619px (0.8) | 10 | 5 |
| all vials spent — parts only | 696px (0.9) | 12 | 0 |
| all parts spliced — vials only | 708px (0.9) | 12 | 12 |
| completionist | 1,788px (2.2) | 34 | 40 |
| + resequence in flight | 1,902px (2.4) | 34 | 0 |

Summaries degrade correctly in every one: `Wolf 1 vial ★4.0` where only a
vial remains, `Gorilla 1 vial · 6 parts ★3.5 Prismatic` where both do,
`Bat 6 parts Prismatic` where the vial is spent — never `0 parts`. No
horizontal overflow anywhere.

### The break battery

Ten breaks. **Six caught outright, one real gap, one bad break** — and the
two misses are different animals, which is the point of separating them.

| break | verdict |
|---|---|
| every bay opens itself again | CAUGHT |
| the shelf loses the parts half | CAUGHT |
| the shelf loses the vials half | CAUGHT |
| a bay keeps only its first token | CAUGHT |
| the summary stops carrying the holdings | **MISSED — a real gap** |
| 5 (rerun, now gated) | **CAUGHT** |
| the retired-part guard comes off | CAUGHT — `TypeError` |
| the countdown moves inside the shelf card | **MISSED — a bad break** |
| 7b. …moves INSIDE a bay | **CAUGHT** — `and never behind a fold` |
| the two cards come back | CAUGHT |

**Break 5 was a real gap, and an important one.** "The summary carries the
holdings" is the *entire* argument for closing every bay, and nothing
asserted it: the count-line assertion beside it was being satisfied by the
card SUBTITLE (`40 vials · 244 part tokens`), not by any summary. Strip the
holdings line and the suite stayed green — 34 bare species names would have
shipped. Same shape as R51's `logged.includes('logged')`: asserting against
the whole page when the claim is about one element. The new gate slices the
summary out and reads inside it, and also checks a one-sided bay says only
its own half.

**Break 7 was a bad break, not a gap.** It moved `${runCard}` inside the
Gene Vault card but still *above* every bay — so the countdown was never
behind a fold and R15's rule genuinely still held. 7b puts it inside a bay
body, which is what the break was named after, and R52's gate fires on the
first run.

### Known gaps

- The bay sort is by vial-first, then stars, then part count, then name.
  Finding a *specific* animal in 34 bays is a scan either way, but a filter
  or a jump-to-letter would help a completionist. Not built; no measurement
  says it hurts yet.
- The Gauntlet rematch toggle (R42) remains a preference, still unbuilt.
- `dex.beaten` records the win but not when (R51).

### Next session's first task

Nothing queued. Every long screen has been measured (Pens R44, Dex R45,
Ranch R46/R47, Vault and Theater R52, Vault again R53), so the next session
picks its own subject rather than inheriting one.

## Session 74 — R52: the Vault at a completionist's inventory ✅

**Acceptance criterion:** the last two unmeasured long screens are measured,
and the one that needed cutting fits a phone — **passes, measured in the
browser**. No schema change; `SAVE_VERSION` stays **34**.

### Half the phase died in the audit, and that is the result

The Surgery Theater measured **1,630px at every one of five inventories** —
from nothing extracted to a completionist's 41 graduations. It does not grow
with the player at all: its sockets are capped by the chassis and its
physiology panel is fixed. There was nothing to cut, so nothing was cut.

What that half got instead is **gate 5**, which turns "does not grow" from a
note into a build failure. Break 7 proves it: list owned tokens inline under
the sockets and the Theater goes 5,773 chars to 9,810 and the build stops.

### The Vault, measured at 380px

| inventory | Vault | DNA Vials card | Part Tokens card |
|---|---|---|---|
| nothing extracted | 260px | 133px | 115px |
| 3 graduations | 673px | 447px | 214px |
| 10 | 1,723px | 1,210px | 501px |
| 25 | 3,973px | 2,845px | 1,116px |
| **41 (completionist)** | **5,999px (7.5 screens)** | **4,502px** | 1,485px |

The vials card was **75% of the screen for forty items**, while the token
list directly below it carried **244 in 1,485px**.

### The screen already contained its own answer

Volume was never the difference. **The tokens fold by species and the vials
never did.** R31 added the Resequencer, gave every vial a plan line and a
Resequence button, and left the list flat — so the card grew a live button
per vial forever, sitting directly above a list that had solved exactly this
problem.

Same fold, same `.vault-species` class, same screen:

| inventory | Vault before | after | DNA Vials before | after |
|---|---|---|---|---|
| 3 | 673px | **673px** | 447px | **447px** |
| 10 | 1,723px | **1,052px** | 1,210px | **539px** |
| 25 | 3,973px | **2,297px** | 2,845px | **1,169px** |
| 41 | 5,999px | **3,044px** | 4,502px | **1,547px** |

**7.5 screens to 3.8**, and the vials card down 66%.

### My first cut made the small rack worse, and the measurement said so

The first version rendered the folds **open** below the threshold, on the
reasoning that a fold you must tap to see your only vial is friction. Re-
measured: three vials went **447px to 575px**. An open `<details>` still
pays for its summary row, so "open while small" bought three summaries and
saved nothing.

Below five vials the card now renders **flat** — byte-identical to what
shipped before this phase. The threshold earns itself immediately: in the
browser, four vials is 556px and five folded is **329px**, smaller while
holding one more.

### R15's rule reaches this screen

The Resequencer's countdown is the one thing here that costs something if
missed. It is a card of its own **above** the rack, verified in the browser
(`run card at child 0, vials card at 1`) and gated on position rather than
presence, so a later edit cannot quietly move it inside a fold. Break 6 does
exactly that and is caught.

### Browser QA, 380px, console clean

| state | Vault | vials card | folds | buttons |
|---|---|---|---|---|
| 3 vials | 574px (0.7) | 447px | 0 | 3 |
| 4 vials — boundary | 683px (0.9) | 556px | 0 | 4 |
| 5 vials — folds on | 456px (0.6) | 329px | 5 | 5 |
| 40 vials | 1,674px (2.1) | 1,547px | 34 | 40 |
| 40 + run in flight | 1,788px (2.2) | 1,533px | 34 | 0 |

All forty buttons survive folding; opening a fold gives a live
`🧬 Resequence`. Zero buttons during a run is correct — a second run cannot
start. No horizontal overflow in any state.

### The break battery

Seven breaks, each run against the full suite in an isolated worktree.
**All caught, and this time none by a sibling** — every failure message
belongs to a gate this phase wrote.

| break | verdict |
|---|---|
| the vials stop folding at all | CAUGHT — `five vials fold` |
| the fold swallows every vial but the best | CAUGHT — `40 vials, 40 ways to spend one` |
| a folded vial keeps its row and loses its button | CAUGHT — `1 vials, 1 ways to spend one` |
| the small rack goes back to open folds | CAUGHT — `four vials render flat, as they always did` |
| the retired-species guard comes off | CAUGHT — `TypeError` |
| the Resequencer countdown moves behind a fold | CAUGHT — `and never behind a fold` |
| the Theater starts growing with the vault | CAUGHT — `5,773 chars at 6 tokens, 9,810 at 244` |

Break 5 fails with a `TypeError` rather than an assertion, which is the
honest signal: take the guard off and the grouping pass cannot run at all.

### Two small things picked up on the way

- A vial whose species left the roster is now **skipped rather than crashed
  on**, matching what the token loop beside it has always done.
- A `run ? '' : ''` ternary — both branches empty — is gone.

### Known gaps

- **Both Vault cards now list the same ~34 species names** (1,547px and
  1,485px). A single per-species shelf holding that animal's vial *and* its
  parts would halve the summaries and answer "what have I got of this
  animal" in one place. Not built, because vials and parts are spent by
  different systems — the Resequencer here, the Theater elsewhere — and
  merging them would make "what can I splice with" harder to scan. Recorded
  so a later session does not have to re-derive the trade.
- The Gauntlet rematch toggle (R42) is still a preference, still unbuilt.
- `dex.beaten` records the win but not when (R51).

### Next session's first task

Every long screen now has a measurement behind it: Pens (R44), Dex (R45),
Ranch (R46/R47), Vault and Theater (R52). Nothing is queued, so the next
session picks its own subject — the per-species Vault shelf above is the
best-specified candidate, and the first job is to decide whether the merge
is worth losing the vial/part split.

## Session 73 — R51: the field guide records outcomes ✅

**Acceptance criterion:** the Dex says what you *beat*, not just what you
saw — and a save that already cleared the Gauntlet keeps its trophies —
**passes, measured in the browser**. `SAVE_VERSION` **33 → 34**, additive,
with a migration.

### The queued note was aimed at the wrong hole, twice

R42 left *"Trophies appear on the card and the wire, not in the Dex."*
Audited before writing anything, both halves were already handled:

1. **The four bosses were already in the Dex.** `stratofortress`,
   `leviathan_dredge`, `crucible_9000` and `the_compliance_engine` are four
   of the forty cells in the field guide, logged like any other unit.
2. **The beaten record was never lost.** The War Room's Gauntlet card
   renders `BEATEN` permanently once dominion is held.

So a trophy gallery in the Dex would have duplicated a card that already
exists and never goes away — the same duplication R50 refused to ship.

### The real hole is older and wider than the note

`dex.enemies` has been a **sighting log** since R21, and a unit logs itself
just as readily while flattening you. A player who won a fight and one who
was carried out of it had **identical Dex entries** — under a card whose
own closing line promises *"Every entry remembers you too."*

`dex.beaten` is the second dimension: every unit that took the field in a
battle you won. **A spar does not count**, on R41's existing ruling that a
drill has no stakes — the ring only ever fields a garrison from a node you
already took, so counting the drill would add nothing true.

### The migration recovers what the save can prove and invents nothing

The shelf arrives **empty**, and empty is the honest value: nothing in any
previous save recorded *which* units a player beat (`warRecord` is a global
tally), so backfilling would mean inventing a history.

The Gauntlet is the one recoverable thing and it needs **no migration at
all**. `gauntletBeaten` has held those exhibitions since v32, so
`beatenUnits()` reads both records — and beating a stage beat its escorts
too, which is derivable rather than guessable. A save that cleared
Exhibition I years ago keeps its trophies without a single fabricated
entry.

### Completion deliberately did not move

A `beaten 0/40` row would have dropped **every existing save's percentage**
for a column no save ever recorded and no player can retroactively fill.
That is the salvage reasoning (a figure that misrepresents the player's
position is lying about the game), pointed at a different column. Beaten is
a second dimension on the guide, not a completion axis — and gate 6 holds
that decision in place.

### Measured in the browser, 380px, console clean

| state | field guide header | cells |
|---|---|---|
| fresh save | `0/40 logged` | — |
| ten met, none beaten | `10/40 logged` | `Riot Squad → logged` |
| ten met, four beaten | `10/40 logged · 4 beaten` | `Riot Squad → ✓ beaten [marked]` |
| v33 save, Exhibition I cleared, 40 wins | `40/40 logged · 3 beaten` | shelf: `🏟 1/4 exhibitions answered: Stratofortress` |
| same, county not held | `40/40 logged · 3 beaten` | shelf absent |

No horizontal overflow in any state.

### Three things the process caught rather than shipped

**A hollow assertion, before the battery.** The first gate 3 asserted
`logged.includes('logged')` — which the card header (`N/40 logged`)
satisfies on *every page ever rendered*. Caught by reading the markup the
header emits. R34, R35, R45 and R48 each shipped that mistake and found it
in the battery; this is the second phase running where it was caught by
reading instead.

**QA found a seam the gates did not.** Row 5 above: with `dominionAt`
cleared, the shelf correctly hides but the boss *cells* stay marked. That
state is unreachable in play — `dominionAt` is never un-set, and the four
bosses appear in no encounter and no director counter, so one can only take
the field through a stage dominion already gates. **A fixture artefact, not
a leak.** But "unreachable" is a fact about the DATA that a later phase
could quietly falsify, so it is now two assertions rather than a comment.

**The anti-hollow guard on those loops earned itself on its first run.**
`content.director.counters` is not the runtime shape — `indexContent` keys
them by id into `directorRules` — so without the emptiness check the loop
would have iterated over nothing and passed while guarding nothing.

### The break battery

Thirteen breaks, each run against the full suite in an isolated worktree.
**All caught.**

| break | verdict |
|---|---|
| a loss fills the shelf | CAUGHT |
| a drill counts as a trophy | CAUGHT |
| the cell stops distinguishing beaten from logged | CAUGHT |
| the beaten cell loses its mark | CAUGHT |
| the migration invents a history | CAUGHT |
| `beatenUnits` forgets the Gauntlet | CAUGHT |
| `beatenUnits` forgets the escorts | CAUGHT |
| the shelf ignores the spoiler rule | CAUGHT |
| beaten becomes a completion row | CAUGHT — by **R45's dexProgress gate**, a sibling |
| 9b. …with R45's fixture satisfied | **CAUGHT** |
| a boss lands in an ordinary patrol | CAUGHT — by the **balance harness**, a sibling |
| 10b. …in `rescue_impound` instead | CAUGHT — by **M5's rescue gate**, a sibling |
| 10c. …in an encounter nothing fights | **CAUGHT** |
| the director may requisition a boss | **CAUGHT** |

**Three sibling catches, and they are the interesting rows.** A sibling
catch proves *something* objects, not that the gate this phase added does.
Break 9 died on R45's `a finished save has catalogued everything`, which
sits earlier in the file and short-circuits the run; 9b fills R45's own
`everything()` fixture so only gate 6 can speak, and it does — `the shelf
is not a completion row`.

Break 10 took **two** isolation attempts, which is itself the finding:
every *referenced* encounter is fought by some gate. `patrol_1` made the
opening node unclimbable (the balance harness scored it at 13%);
`rescue_impound` broke M5's rescue. 10c therefore invents `ghost_patrol` —
an encounter nothing points at, so no node, no rescue and no fight — and
the new assertion finally speaks for itself: `no Gauntlet boss fields
outside the Gauntlet (stratofortress in ghost_patrol)`.

### Two existing gates fired unprompted

Bumping `SAVE_VERSION` tripped **`sw.js` CACHE tracks SAVE_VERSION**, and
adding a dex field tripped **M7's v8 migration shape test**. Both are
anchor moves — the claims are untouched, the setups moved — and both are
free evidence that those gates work, since neither was provoked on purpose.

### Verified

- Full suite green; six R51 gate blocks.
- Browser QA at 380px across five states, table above; zero console errors
  on a fresh save and on a genuine v33 migration.
- `SAVE_VERSION` **34**, additive, migration tested from v1 and v33.

### Known gaps

- The Gauntlet rematch toggle (R42) is still unbuilt — R42 called a beaten
  exhibition "a highlight reel, deliberately", so this is a preference
  rather than a defect.
- The agenda's rows remain the Ranch's largest chrome cost, by design
  (R47).
- `dex.beaten` records the win but not *when*, so the guide cannot say "you
  beat this one three regions ago" the way a rival dossier can. Noted
  rather than built: a timestamp per unit is a schema decision that should
  wait until something wants to read it.

### Next session's first task

Nothing is queued. The oldest standing notes are the Gauntlet rematch
toggle (a preference) and per-unit timestamps (speculative), so the honest
next move is a fresh audit rather than a carried-over note — the Vault and
the Surgery Theater are the two long screens never measured the way R44–R47
measured the Pens, the Dex and the Ranch.

## Session 72 — R50: a new module has to declare itself ✅

**Acceptance criterion:** a system cannot ship without somebody deciding
who teaches it — **passes**, proven by a break battery in which a new
module fails the build until it is classified. Harness-only change; no
runtime file is touched and `SAVE_VERSION` stays **33**.

### The note that queued this was wrong three ways

R49 left this as *"fold `SHIPPED_SYSTEMS` into `DATA_NOTES` so the harness
derives it."* Auditing it before writing anything:

1. **The two lists cover disjoint sets.** Fifteen of the thirty systems on
   the roll — `bond`, `breeding`, `catalog`, `containment`, `contest`,
   `dex`, `flight`, `grades`, `incubator`, `infirmary`, `pairing`,
   `rehab`, `rescue`, `stable`, `upkeep` — are behaviour in code with no
   data file at all. `DATA_NOTES` is keyed on data files, so it
   structurally cannot reach them. Folding would have **deleted their only
   coverage** while looking like a tidy-up.
2. **The roll is not silently droppable anyway.** `orphans` already asserts
   every note names a system on the roll, so the direction the note worried
   about is guarded.
3. **The real hole is narrower than the note described.** Not "the roll can
   drift" but: a system shipped with **no note, no roll entry *and* no data
   file** — the Resequencer failure with its one catchable symptom removed.

What transfers from `DATA_NOTES` is the **mechanism**, not the map.

### MODULE_NOTES

Same shape, over source modules instead of data files. All 51 modules are
classified: **21 name the system-note that teaches them**, 30 are exempted
by category, each category with its reason written down —

| category | n | why exempt |
|---|---|---|
| shell and save | 7 | the ground everything stands on, not systems |
| shared UI machinery | 4 | a fold, a picker, a tab bar, a band |
| screens | 8 | a screen is where a system is *met*; the note belongs to the system |
| battle engine + readouts | 9 | R28's point: these explain the fight, they don't add to it |
| onboarding machinery | 2 | cannot be taught by one of its own notes without circularity |

`orphans` forces a roll entry for every **note**; this forces a decision
for every **module**. Between them the only way to ship a system nobody
teaches is to write no module and no data file for it.

Two guards against the map itself going hollow: a non-null value must name
a note that exists, and the map must keep **≥20 claims across ≥15 distinct
systems** (it carries 21 across 19), so blanking the system half cannot
leave a gate that passes while guarding nothing.

### A redundant assertion dropped *before* the battery

The first draft asserted both `covered.has(note)` and
`SHIPPED_SYSTEMS.includes(note)`. But `missing` and `orphans` below prove
those two sets are **equal**, so the second is the first spelled
differently — an assertion that cannot fail on its own.

R34, R35, R45 and R48 all shipped a hollow gate and found it in the
battery. This one was caught by reading the surrounding assertions first.
Same lesson, applied earlier.

### The break battery

Nine breaks, each run against the full suite in an isolated worktree.

| break | verdict |
|---|---|
| a new module ships unclassified | CAUGHT — by the **sw.js precache gate**, a sibling |
| 1b. …and is precached, so only MODULE_NOTES can object | **CAUGHT** |
| a mapped module leaves the tree | CAUGHT — by `ERR_MODULE_NOT_FOUND`, a sibling |
| 2b. the map names a module that never existed | **CAUGHT** |
| a module points at a note that does not exist | **CAUGHT** |
| the map goes all-exemption | MISSED — **bad break** |
| 4b. the map really does go all-exemption | **CAUGHT** |
| the walk skips a whole directory | **CAUGHT** |
| the completeness check stops checking | MISSED — **category error**, dropped |

**Neither miss is a gate failure; both are my errors writing the break.**
Naming them honestly, in the taxonomy this run of phases has been
building:

- **Bad break** (4). Named "all-exemption" but removed a *single* entry —
  21 claims to 20, which clears the `>=20` floor by exactly one. The gate
  could always have failed; the break just didn't do the thing it was
  named after. 4b blanks every `'…': 'system',` in the block and the floor
  fires immediately (`modules actually claim systems (0)`).
- **Category error** (6). `const unlisted = []` damages **the guard
  itself** rather than the thing guarded — of course a check you delete
  stops checking. Tautological, so it is dropped rather than counted.

**Sibling catches** (1 and 2) are the other thing worth naming. Both were
caught, but by older gates — the precache list and the module loader — not
by `MODULE_NOTES`. A sibling catch proves *something* catches it, not that
the new gate does, so both were re-run in isolation: 1b adds the module to
`sw.js` so the precache gate is satisfied, 2b names a file that never
existed so nothing imports it. Both then fail on `MODULE_NOTES`'s own
assertions, by their own messages.

### Verified

- Full suite green; the R50 block is four assertions over a 51-entry map.
- No runtime file touched — the whole diff is `tools/smoke.js` — so the
  fresh save, the migrated save, the 380px layout and every screen are
  bit-identical to R49's verified build.
- No schema change; `SAVE_VERSION` stays **33**.

### Known gaps

- Trophies still are not in the Dex (R42), and the Gauntlet rematch toggle
  (R42) is still unbuilt.
- The agenda's rows remain the Ranch's largest chrome cost, by design
  (R47).
- `MODULE_NOTES` is hand-kept in the same sense `SHIPPED_SYSTEMS` was —
  the difference is that it now *cannot silently fall behind the tree*,
  because the walk fails the build on any module it has never seen.

### Next session's first task

Trophies in the Dex (R42) — the oldest note still standing now that the
`SHIPPED_SYSTEMS` one is closed. The `foes` tab shipped in R45 with rival
records; trophies are the missing half of that page.

## Session 71 — R49: the map's spar button reads the predicate ✅

**Acceptance criterion:** all three surfaces give one answer to "can I
spar", in every state — **passes, measured in the browser**. No schema
change; `SAVE_VERSION` stays **33**.

### The note R48 left was wrong about its own severity

R48 recorded the map button as *"a wording gap rather than a broken
affordance, since the briefing disables it correctly."* Reading the
briefing properly: the roster rows are `disabled: injured` and Launch is
`disabled` without a team. So a player with three charges and every
chimera in the Infirmary got an **ENABLED** `🥊 Spar 3` onto a screen
where nothing at all can be pressed.

Nothing breaks — the earlier note was right that far — but an enabled
button onto a dead end is a wasted trip, not a wording problem. **"Wording
gap" was the wrong call**, and it took re-reading the briefing rather than
trusting the note to see it.

### One predicate, three readers

The button reads `canSpar()` now. It is disabled on the verdict, not on
the bucket, and it names the reason:

| state | map button | Pens | agenda |
|---|---|---|---|
| full bucket | `[enabled] 🥊 Spar 3` | ready | offered |
| one charge spent | `[enabled] 🥊 Spar 2` | ready | offered |
| bucket empty | `[disabled] 🥊 10m` | — | withheld |
| everyone hurt | `[disabled] 🥊 no-one fit` | — | withheld |
| hurt **and** empty | `[disabled] 🥊 no-one fit` | — | withheld |

Every row: **all three agree**. Clicking the disabled button no longer
reaches a briefing (`#wr-launch` absent), so the dead-end trip is closed.

**The predicate is shared; the wording deliberately is not.** This is a
chip inside a node row and the Pens has a whole line, so they say the same
thing at different lengths — `no-one fit` against `nobody fit to send`.
Sharing the verdict is the point; sharing the string would be wrong for
the space.

That last row also settles a precedence I had not specified: with both
conditions failing, **fitness wins the label**. Telling a player to wait
ten minutes when they would still have nobody to send is the less useful
truth, so `canSpar`'s reason ladder checks garrison, then fitness, then
charges.

### The War Room was the one screen the harness could not render

`campaign/ui.js` had exactly one `document` reference — `document.body
.classList.remove('in-battle')` — which is why R15's gate had to grep the
module's *source* rather than assert its markup, and why this phase's
first gate died on `ReferenceError: document is not defined`.

Guarded, so the War Room now renders to a plain `{ innerHTML }` like every
other screen. `main.js` already clears that class on every navigation, so
the guard is inert in a browser. It is a production change made for
testability, and worth naming as such: what it buys is that a gate can
assert the button's real markup instead of a regex over source text.

### R43's gate 7 moved its anchor

It asserted `sparCharges(state, t, content)` appears in `campaign/ui.js`.
`canSpar` wraps `sparCharges` and adds the other two conditions, so the
function named changed and the claim — *the map must not have its own
opinion of the bucket* — did not. Same shape as the R44, R45 and R46
anchor moves this run of phases keeps producing.

### The break battery

Twelve breaks, each run against the full suite in an isolated worktree.
**All caught.**

| break | verdict |
|---|---|
| the button reads the bucket alone | CAUGHT |
| the button is enabled on charges | CAUGHT |
| the button stops naming the reason | CAUGHT |
| every refusal blames fitness | CAUGHT |
| the countdown becomes a word | CAUGHT (R43's gate 7) |
| a ready button stops counting | CAUGHT (R43's gate 7) |
| the War Room forks the predicate | CAUGHT |
| the Pens forks the predicate | CAUGHT |
| the agenda forks the predicate | CAUGHT |
| the predicate ignores fitness | CAUGHT |
| the predicate ignores charges | CAUGHT |
| the War Room needs a document again | CAUGHT |

**Breaks 10 and 11 are the ones this phase's design invites.** Every other
break damages one surface, and the agreement gate catches it because the
three stop matching. Break the PREDICATE instead and all three agree on
the wrong answer together — an agreement-only gate sails past that. They
are caught by the per-reason assertions (`nothing to send, no spar`, `an
empty bucket is not an open action`), which is why those exist alongside
the agreement loop rather than being folded into it.

Breaks 5 and 6 were caught by **R43's own gate 7** — the one whose anchor
moved this phase. It still guards exactly what it always did: the button
says how many, and shows a countdown when empty.

Break 12 fails with `ReferenceError: document is not defined` rather than
an assertion, which is the honest signal: undo the guard and the harness
cannot render the screen at all.

### Verified

- Full suite green; four R49 gate blocks.
- Browser QA at 380px across five states, table above; all three surfaces
  agree in every one, the disabled button cannot reach a briefing, zero
  console errors.
- No schema change; `SAVE_VERSION` stays **33**.

### Known gaps

- The agenda's rows remain the Ranch's largest chrome cost, by design
  (R47).
- Trophies still are not in the Dex (R42), and `SHIPPED_SYSTEMS` in
  `smoke.js` is still hand-kept rather than folded into `DATA_NOTES`
  (R39) — the oldest surviving note on this list.

### Next session's first task

`SHIPPED_SYSTEMS` has outlived ten phases as a hand-kept list that a new
system can silently fall out of. Fold it into `DATA_NOTES` so the harness
derives it, the way R39 derived the screen list from `main.js`.

## Session 70 — R48: the Sparring Ring you can see ✅

**Acceptance criterion:** the charge bucket is legible wherever you would
act on it, and every surface derives it from one place —
**passes, measured in the browser**. No schema change; `SAVE_VERSION`
stays **33**.

### A resource nobody could see

R41 built the ring on a player report — "no combination of them could beat
the missions in front of them" — and R43 turned it into a three-charge
bucket on the same player's report that one spar per 45 minutes was too
slow to be a ladder. Then `sparCharges()` was read in exactly **one
place**: the button on the War Room map.

So `ranch/agenda.js`, whose own header calls it *"the single place that
knows what a player can actually DO"*, had **zero** mentions of sparring —
and the Pens, the screen you visit to make a creature better, never
mentioned the three free sources of xp sitting in your pocket.

### Three changes

- **The agenda knows the ring exists.** A `spar` entry, filed as **work**
  rather than campaign: a spar pays no purse, earns no notoriety and
  cannot take a node. It makes a better creature, which is what `work`
  means in that module.
- **A hint may be a function of the save.** The entry's whole value is a
  *number* — "3 charges in the ring" is a reason to go, "you can spar" is
  not — and a static string cannot say three. Strings pass through
  untouched, so all thirteen entries written before this read exactly as
  they did.
- **The Pens shows the bucket as one LINE, not a card.** R47 spent a whole
  phase establishing that a card has to earn its height; a status readout
  does not.

### Browser QA found the thing the gates did not

The first cut had the Pens read the charge bucket directly. With a full
ring and the only chimera in the Infirmary it reported:

> 🥊 Sparring Ring **3/3** · full — spend them

…in the ready colour, while the agenda — correctly — offered nothing.
**Two surfaces disagreeing about whether an action is available is the
exact failure this phase exists to prevent**, and my gate had only checked
that the counts matched, not that the *verdicts* did.

`canSpar()` in `sparring.js` answers it once — charges, a garrison to
spar, somebody fit to send — and names which is missing. Both surfaces
read it, and a gate now asserts they agree across every reason:

| state | Pens | agenda |
|---|---|---|
| full bucket, garrison, fit chimera | `3/3 full — spend them` **ready** | offered, "3 charges" |
| one charge spent | `2/3 +1 in 10m` **ready** | offered, "2 charges" |
| bucket empty | `0/3 re-chalking — 10m` | withheld |
| no garrison held | absent entirely | withheld |
| only fighter in the Infirmary | `3/3 nobody fit to send` | withheld |

### Two errors of mine, caught before they were claims

- **`shellScreenMap()` returns objects, not screen names**, so my
  route-check gate would have compared a string against a list of records
  and passed for the wrong reason. It uses `shellScreens()` now.
- **A `content ? t0 : t0` ternary** in a gate fixture, which does nothing
  at all. Removed rather than left as decoration.

A third was in the QA script rather than the game: it looked for the
active tab by `is-on` when the shell uses `active`, so a working
navigation reported `?`. Fixed, and the Ring button demonstrably lands on
the War Room.

### The break battery

Fifteen breaks, each run against the full suite in an isolated worktree,
plus one re-run. **All caught.**

| break | verdict |
|---|---|
| the agenda has no spar entry | CAUGHT |
| a spar is filed as spending | CAUGHT |
| the spar entry routes nowhere real | CAUGHT (R39's screen-map gate, first) |
| the spar hint cannot name the count | CAUGHT |
| a function hint is never resolved | CAUGHT |
| a spar is offered with no charges | CAUGHT |
| a spar is offered with no garrison | CAUGHT |
| a spar is offered with nothing to send | CAUGHT |
| the agenda forks its own spar test | CAUGHT |
| the Pens forks its own spar test | CAUGHT |
| the Pens loses the ring | CAUGHT |
| the Pens invents its own charge count | CAUGHT |
| the Pens advertises a ring you cannot use | CAUGHT |
| the Pens ring button goes nowhere | CAUGHT |
| the ring becomes a card again | **MISSED** → gate rewritten, CAUGHT |

**The miss was a HOLLOW GATE this time**, which is worth separating from
R44's and R46's misses — those were bad breaks, where the gate could
always have failed and the break simply changed nothing. This one could
not fail at all. The assertion was:

```js
!/<section[^>]*>\s*<p class="spar-line"/.test(page)
```

…which demands a closing quote immediately after `spar-line`. In the ready
state the class is `spar-line is-ready`, so the pattern never matched and
the assertion passed no matter what the markup did. Same family as R34's
and R45's: **a pattern narrower than the thing under test**. It anchors on
what PRECEDES the line now rather than on a class string, and re-run
against the same break it fails immediately on
`the ring is a line, not a card of its own (…<section class="card">)`.

Two of the fifteen — *the agenda forks its own spar test* and *the Pens
forks its own* — exist because that is exactly how the two surfaces
disagreed in the first cut. A defect the phase actually shipped earns a
break rather than a promise.

Break 3 was caught by R39's screen-map gate before the R48 one it was
written for; the R48 assertion covers the same ground and simply runs
later in the file.

### Verified

- Full suite green; four R48 gate blocks.
- Browser QA at 380px across five states, table above; the Ring button
  lands on the War Room, the map's own badge reads the same count as the
  Pens, zero console errors.
- No schema change; `SAVE_VERSION` stays **33**.

### Known gaps

- **The map's spar button still builds its own label** from `sparCharges`
  rather than `canSpar`, so it can read "Spar 3" while nobody is fit to
  send. It is disabled correctly by the briefing flow, so this is a wording
  gap rather than a broken affordance — but it is the third surface and it
  should read the predicate too.
- The agenda's rows remain the Ranch's largest chrome cost, by design
  (R47).
- Trophies still are not in the Dex (R42), and `SHIPPED_SYSTEMS` in
  `smoke.js` is still hand-kept (R39).

### Next session's first task

Point the War Room's spar button at `canSpar()` as well, so all three
surfaces read one predicate — the gap this phase closed for two of them
and left open for the third.

## Session 69 — R47: the Ranch chrome earns its height ✅

**Acceptance criterion:** every card above the herd justifies its space in
every game state — **asked and answered, measured in the browser**. No
schema change; `SAVE_VERSION` stays **33**.

### The question R46 left, and the answer it got

R46 folded the herd and noted that the cards *above* it had never been
asked to justify their height. Measured at 380px they were **1,023px on a
fresh save and 1,597px once the Path retires — 71% of the whole screen at
four animals**.

Asking got a mixed answer, which is the useful kind. Most of them earn it.
Two did not, and one was doing the same thing the codebase already warns
about in writing:

| card | before | after | verdict |
|---|---|---|---|
| Breeding Pen | 223px always | 66–80px shut · 233px when pairable | **didn't earn it** |
| Right Now | 678px | 580px | purchases were taking a project's width |
| economy row | 106px, 5 cells | 79px, 3 cells | **one subtraction, printed three times** |
| field note | 248px | unchanged | earns it — one tip, dismissible (R29) |
| facility | 66px shut | unchanged | earns it |
| Incubator | 64px empty | unchanged | earns it — carries the hatch clocks |
| Path | 223px | unchanged | earns it — and it *does* retire (see below) |

| state | chrome before | after |
|---|---|---|
| fresh, 0 animals | 1,023px | **853px** (−17%) |
| fresh, 2 animals | 965px | **781px** (−19%) |
| mid, 4 animals | 1,597px | **1,482px** (−7%) |
| late, 12 animals | 1,739px | **1,624px** (−7%) |

The win is concentrated early, and that is where it should be: a fresh
save has the smallest herd and the worst chrome ratio.

### A card that cannot act

The Breeding Pen needs two adults of one stock and opposite sexes. On a
fresh save that is hours away, and until then it was 223px of disabled
pickers on every single visit. It folds now — shut when there is no
pairing (or the incubator is full), with **one line saying which**, and it
opens by itself the moment a pairing exists.

> ▸ **Breeding Pen**  2 adults
> 2 adults, no pair. Two of one stock, opposite sexes.

### "Three things you can buy is not three things to do"

That sentence is in `agenda.js`'s own header, and the card was rendering a
purchase at the same width as a thing you make. `spend` items are chips
now. **Nothing is hidden** — every open item keeps its click and its
destination; a chip carries its hint in `title`. The change is the shape
of the list, not its length.

### One subtraction, printed three times

Income, Upkeep and Net were three cells of the same arithmetic, wrapping
to 106px at 380px. R40 already settled this in the War Room: Net is the
number, its derivation is the subtitle. The Ranch reads the same way now,
and the two screens stopped disagreeing about how to present money.

### My own gates found the same defect twice

`collapsibleCard` puts its body in a hidden div, so a shut fold that
*builds* a body ships it anyway. R44 established that rule for the Pens.
I broke it twice in one phase, in both cards I touched — and the R47 gates
caught both:

1. **Breeding Pen** — `so it ships no pickers and no button`. The shut
   card was still building two picker fields that walk the whole herd to
   group it by species, plus the pairing forecast and the breed button.
2. **Right Now** — `shutting it costs nothing to render`. Same defect, the
   biggest card on the screen.

Both fixed by hoisting the open/shut decision above the body. Worth being
precise about what that bought: those bodies were already `hidden`, so
this is a **render-cost fix, not a height fix** — the pixel numbers above
do not move because of it.

### Two fixture errors of mine, caught before they became claims

- **The Path looked like it never retired.** It showed at 12 animals with
  200 notoriety, which reads as a bug. It is not: `onboardingActive` is
  `heldNodes.length === 0 || chimeras.length < 3`, and my late-game state
  had territory but *no chimeras*. Correct behaviour, wrong fixture.
- **The first measurement measured the same screen four times.** `SET(0)`
  emptied `ranch.stock`, and every later state read from it, bailed out
  with `NO STOCK` and changed nothing — four identical readings that
  looked like a finding. The harness now captures a prototype animal once
  and warns when a setup does not take.

One R46 gate also needed scoping: it asserted `nothing is open` when its
claim was about the **herd**, and the new Breeding Pen fold trips the
broader reading.

### The break battery

Fifteen breaks, each run against the full suite in an isolated worktree.
**All caught.**

| break | verdict |
|---|---|
| the Breeding Pen is not a fold | CAUGHT |
| the Breeding Pen always opens | CAUGHT |
| the Breeding Pen never opens on its own | CAUGHT |
| a pairing ignores sex | CAUGHT |
| a pairing ignores stock | CAUGHT |
| a full incubator gives the wrong reason | CAUGHT |
| purchases go back to full rows | CAUGHT |
| a spend chip goes nowhere | CAUGHT |
| a spend chip loses its hint | CAUGHT |
| work items become chips too | CAUGHT |
| the economy is five cells again | CAUGHT |
| Net loses its derivation | CAUGHT |
| the subtitle shows the wrong upkeep | CAUGHT |
| a shut Breeding Pen still builds its body | CAUGHT |
| a shut Right Now still builds its rows | CAUGHT |

Three of these earn a note.

**Break 5 (`a pairing ignores stock`) is only catchable because the
fixture was fixed first.** Every other case in that gate is goats, so a
card that ignored species entirely would have sailed through — the R34
failure exactly. Adding a goat-and-a-bear case before running the battery
is what turned a hollow assertion into a real one.

**Break 13 (`the subtitle shows the wrong upkeep`) is the one that guards
the economy rather than the layout.** The gate compares the printed
subtitle against `upkeepPerDay`, so a presentation change cannot quietly
alter what the number means.

**Breaks 14 and 15 re-break the defects this phase actually shipped in its
first cut** — both shut folds building their bodies. They are in the
battery rather than taken on trust precisely because I got them wrong
once already.

The battery also caught its own staleness before costing anything: after
the open/shut decisions were hoisted, three break anchors no longer
existed, and `assert old in s` stopped the run on break 2 instead of
silently applying nothing. Every anchor is now checked against the real
files before the run starts.

### Verified

- Full suite green; four R47 gate blocks.
- Browser QA at 380px across five states — fresh/0, fresh/2, mid/4 with
  the Path running, mid/4 retired, late/12 with eggs — zero console errors
  in every one, no sideways scroll.
- No schema change; `SAVE_VERSION` stays **33**.

### Known gaps

- **The agenda's own rows are the remaining cost and they are not fat.**
  Six open actions, five with a hint that wraps to two lines, ~65px each.
  Cutting the hint would cut A4's reason for existing, so the card stays
  foldable and the player decides. Stated here so a later session does not
  have to re-derive it.
- **Foes in the Dex is still 4.4 screens late** — carried over from R45.
- Trophies still are not in the Dex (R42), and `SHIPPED_SYSTEMS` in
  `smoke.js` is still hand-kept (R39).

### Next session's first task

The Dex's Foes tab is the last measured screen still over four screens,
and R45 established there is no room for a sixth tab to split it. Either
find the height inside the 40-cell gallery or decide it is a gallery and
close the note.

## Session 68 — R46: the Ranch at twenty animals ✅

**Acceptance criterion:** a full herd fits a phone, nothing time-critical
hides, and both stables are navigable rather than merely short —
**passes, measured in the browser**. No schema change; `SAVE_VERSION`
stays **33**.

### The audit corrected my own R44 note

R44 closed by saying the Ranch "uses the same 1081px card shape" as the
Pens. **That was wrong, and measuring is what caught it** — a Ranch animal
card is **514px**, less than half a Pens card. The shape was never the
problem. The multiplication was:

| herd | before | after |
|---|---|---|
| 1 | 1,689px (2.1 screens) | 1,293px (1.6) |
| 4 | 3,269px (4.1) | 1,609px (2.0) |
| 8 | 5,346px (6.7) | 1,951px (2.4) |
| 12 | 7,438px (9.3) | 2,321px (2.9) |
| **20** | **11,607px (14.5)** | **3,019px (3.8)** |

Exactly 514px a head, and `penUpgradeSize: 2` has no ceiling, so it never
stopped growing. **Marginal cost per animal: 514px → 91px.**

### The fold, and the one clock that had to survive it

Same machinery as R44, same rule with it — **ALERTS NEVER HIDE**. The Ranch
has exactly one deadline and it is the one R38 was written about: an animal
that ages out of Prime loses grade and does not get it back. That countdown
rides on the shut row:

> ▸ **Beast 3** ♀   🎓 Prime for 1d 6h
> 🦶 Goat · Prime · condition 54 · Standard · 4 care ready

Care being ready is a *prompt*, not a deadline, so it ranks under the Prime
clock in the badge and still shows in the summary line either way. A shut
fold builds **no portrait, no care buttons, no extract route** — browser-
verified at **zero `<svg>` elements** with twenty animals shut, and exactly
one the moment a fold opens.

### An order for both stables

R44 left "nothing sorts the stable" as a known gap. R45 answered the same
problem in the Dex by grouping combos into what you would *do* about a row.
`ui/roster.js` is that rule, shared, so three screens cannot drift into
different opinions about it:

- **Ranch** — Ready to graduate · Needs care · Growing
- **Pens** — Can train now · Ready · On a clock

Sorting the Pens' clocks *last* is only defensible because R44 already put
their countdowns on the shut rows. Browser-verified at nine chimeras:
`Can train now 4 | Ready 3 | On a clock 2`, with `⏳ 1h 30m` and `⚕ 42m`
still legible on rows that never opened.

An unrecognised band falls into the **last** band rather than being
dropped — a creature that quietly stops being listed is the failure mode
banding introduces, and it has its own gate.

### Two gates broke, and both were right

1. **R44's Infirmary gate** sliced the page between `pen-g1` and `pen-g2`,
   which assumed render order — and banding moves the injured one to the
   end, so the slice came back empty. Same class as R45's War Room anchor:
   the *setup* was invalidated, not the claim. It now slices from a
   creature's own fold header to whichever header comes next, which is
   order-independent and strictly stronger.
2. **R45's group gate** anchored on `<p class="dex-group">`. The class
   stopped being Dex-only the moment two more screens used it, so it is
   `list-group` now and the gate follows it.

### My own fixture was wrong about the game

The first banding gate assumed a fresh animal has nothing to do. It does
not: **`createAnimal` stamps `lastCare` with zeroes, not with the creation
time**, so every animal is care-ready from the moment it exists and an
untouched herd is *entirely* "Needs care". That is correct behaviour — you
should be able to feed something you just bought — and the gate was the
thing that was wrong. It now asserts both directions.

(A second self-inflicted one worth recording: `pkill -f "tools/smoke.js"`
matches its own shell's command line, so one edit round silently made no
change at all. Same family as R41's no-op `replace` — the defence is that
every patch asserts its anchor and the result gets checked, never the
exit code alone.)

### The break battery

Fourteen breaks, each run against the full suite in an isolated worktree,
plus one re-run. **All caught.**

| break | verdict |
|---|---|
| every Ranch animal ships open (the pre-R46 wall) | CAUGHT |
| a shut Ranch fold builds the portrait anyway | **MISSED** → re-run as 2b, CAUGHT |
| the Prime countdown leaves the shut row | CAUGHT |
| the Ranch summary row goes blank | CAUGHT |
| the Ranch is unbanded again | CAUGHT |
| the Ranch bands run backwards | CAUGHT |
| the Pens are unbanded again | CAUGHT |
| the Pens bands run backwards | CAUGHT |
| an unbanded creature vanishes | CAUGHT |
| a heading over an empty band | CAUGHT |
| bands stop rendering in declaration order | CAUGHT |
| the Pens Infirmary clock leaves the shut row | CAUGHT |
| `ui/roster.js` falls out of the offline shell | CAUGHT |
| the Dex forks its own heading again | CAUGHT |
| **2b** a shut Ranch fold ships the whole card, merely hidden | CAUGHT |

**The miss was a bad break, not a hollow gate — and it is the same miss
R44 recorded, in the same place.** Restoring the portrait *computation*
while shut changes nothing observable, because `body` discards it: the
rendered output is byte-identical, so no gate could fail. Rewritten to
emit the card while shut, it is caught at once — on `no extract button
either`, which is precisely the symptom.

Worth separating from a hollow gate, which asserts something that cannot
fail. This gate could always fail; the break simply did not break
anything. That the identical mistake recurred two phases later is the
argument for running the battery at all rather than reasoning about it.

Break 12 also shows the repaired slice working: it now reports real
content (`data-fold="pen-g1" aria-expanded="false">`) where the old
order-dependent version returned the empty string that exposed it.

### Verified

- Full suite green; seven R46 gate blocks.
- Browser QA at 380px: the Ranch curve above at 1/4/8/12/20 animals, zero
  console errors, no sideways scroll; opening one fold restores the
  portrait, all four care buttons and the extract route, and the open
  state survives a reload.
- The Pens at nine chimeras: 1,295px, three bands in the right order, both
  countdowns on shut rows, nothing open.

### Known gaps

- The Ranch's chrome — Path, Right Now, economy, Breeding Pen, Incubator —
  is ~1,175px before the first animal, which is now most of the screen at
  small herds. Nothing measured whether all five deserve that space.
- **Foes in the Dex is still 4.4 screens late** — carried over from R45.
- Trophies still are not in the Dex (R42), and `SHIPPED_SYSTEMS` in
  `smoke.js` is still hand-kept rather than folded into `DATA_NOTES` (R39).

### Next session's first task

Measure the Ranch's five chrome cards the way this phase measured its
herd: at a small herd they are the screen, and none of them has been
asked to justify its height.

## Session 67 — R45: the Dex at twelve screens ✅

**Acceptance criterion:** every part of the Dex is reachable without a
twelve-screen scroll, and completion is visible from all of it —
**passes, measured in the browser**. No schema change; `SAVE_VERSION`
stays **33**.

### The screen R44 handed over

R44 closed by naming the Dex as the longest screen in the game, and it
was. Measured at 380px:

| | fresh save | late game |
|---|---|---|
| **before** | **7,113px** (8.9 screens) | **9,998px** (12.5) |

Forty inline creature SVGs and forty enemy units in one column. Looking up
a trait gene meant scrolling past the entire species roster every time.

### Tabs, not folds — and the reason matters

R44 fixed the Pens with folds. The Pens is a **working** screen: you go
there to act on one creature, so a shut summary row is the right default.
The Dex is a **reference** screen — you go there to look something up, and
a page where every section starts shut is a *worse* place to browse than a
long one. R15's War Room bar is the precedent, and its rule travels with
it: **completion never goes behind a tab**, because completion is the
reason the screen exists.

Five tabs, and each one builds only when it is the active one — a hidden
tab costs nothing, which is where the weight actually went:

| tab | fresh | late |
|---|---|---|
| 🧬 Roster | 2,901px (3.6) | 2,922px (3.7) |
| ✦ Variants | 1,037px (1.3) | 1,128px (1.4) |
| ⚡ Combos | 1,379px (1.7) | 2,907px (3.6) |
| 🧪 Genes | 837px (1.0) | 1,356px (1.7) |
| 👁 Foes | 2,708px (3.4) | **3,539px (4.4)** |

Worst case **12.5 screens → 4.4**, and three of five tabs are under two.
The 80 portraits split 34 / 6 / 0 / 0 / 40; the two galleries never render
on the same page again.

**Five tabs is the ceiling, measured, not guessed.** At five columns a
button is 64.8px wide and the word "Variants" renders at 61px. There is no
headroom for a sixth, which is why Rivals shares the Foes tab rather than
getting its own — and why the Foes tab is the one still over four screens.

### The bar was bespoke to one screen

`subtabBar` already existed — inside `campaign/ui.js`, hardcoded to
`repeat(5, 1fr)`. It moved to **`ui/tabs.js`** with the column count driven
by `tabs.length`, and the War Room now reads the same implementation
(`bindSubtabs` too, which derives the dataset key from the attribute name —
the one part of this that is easy to get wrong by hand). Same rule as
R35's `tagtext.js`, R39's `shellScreens`, R44's `collapsibleCard`: two
copies of a nav is how two screens drift apart.

### Completion is new, not just relocated

The Dex never had an overall readout. `dexProgress()` in `dexentry.js` is
DOM-free and derives all of it — **0/366 on a fresh save, 366/366 when
finished** — as a meter plus eight chips above the bar. Salvage is its own
row rather than folded into parts: a player without the Containment Cannon
has not *failed to find* those eight, the column is not open to them yet.
Rival counts come through `rivalRecord()` so the Dex and the War Room
cannot disagree about who you have met.

The only badge a tab earns is **"nothing left here"** (✓). A count of what
you are missing would sit on every tab from the first minute, and a badge
that is always lit is a badge nobody reads.

### Two lists that were only ever in file order

Twenty-seven combos in content order buried the two you had found among
the twenty-five you had not — and buried the ones you could splice tonight
among the ones you have no parts for. `comboHint` already knew the
difference (it says *"you have handled both, put them on the same
creature"*) and the list ignored it. Three groups, in the order you would
act on them: **Both halves in hand · Discovered · Still rumoured**. Genes
get the same treatment. An empty group renders nothing at all.

The **field guide** was the Dex's other gallery and the only one that was
not organised — forty cells in file order. It groups by the same class
triangle the roster has used since Wave 1, because the triangle is what you
came to look up: knowing the Falconry Unit is Air is the point.

### The gates caught my own refactor twice

Extracting the bar broke two existing gates immediately, both correctly:

1. **The precache gate.** `ui/tabs.js` shipped without going into `sw.js`'s
   SHELL — exactly the offline-shell hole that gate was written for after
   two modules slipped through in consecutive sessions.
2. **R15's War Room gate**, which sliced the source between `root.innerHTML`
   and the inline `button[data-war-tab]` handler to isolate the region above
   the bar. The handler is `bindSubtabs` now, so the anchor moved. The
   *claim* did not: alerts still must sit above the bar, and a break that
   moves the captives alert below it is still caught.

R21's findability gate needed the bigger rethink. "A discovery you were
told about is still findable in the Dex" used to read one rendered string;
under tabs it is a claim about the **nav**, so the harness now walks all
five views through a stub that can actually be clicked. Stronger form of
the same rule.

**One of my own gates was wrong.** I asserted "at least three tabs draw no
portraits" — there are two. Rather than loosen the number I replaced it
with the exact per-tab counts derived from content, which fails if any view
ever starts building a neighbour's portraits.

### The break battery

Fifteen breaks, each run against the full suite in an isolated worktree.
**All fifteen caught.**

| break | verdict |
|---|---|
| all five tabs render at once (the pre-R45 column) | CAUGHT |
| completion drops below the bar | CAUGHT |
| salvage folded into the parts count | CAUGHT |
| a rival you only lost to stops counting as met | CAUGHT |
| every tab wears a badge | CAUGHT |
| a tab in the bar with no view behind it | CAUGHT (R21 first — see below) |
| no fallback, so an unknown tab renders blank | CAUGHT |
| the bar goes back to five hardcoded columns | CAUGHT |
| `bindSubtabs` reads the wrong dataset key | CAUGHT (R21 first — see below) |
| a heading over an empty list | CAUGHT |
| combos back in content order | CAUGHT |
| the field guide ungrouped again | CAUGHT |
| a whole class drops out of the guide | CAUGHT |
| `ui/tabs.js` falls out of the offline shell | CAUGHT |
| War Room alerts go behind its bar (R15's rule) | CAUGHT |

Break 13 is the one worth pointing at: dropping Air out of the grouped
field guide is caught by **the per-tab portrait count** — the gate I had
to rewrite after getting it wrong — which reads `foes: 28` where it owes
40. The loose ratio it replaced would have sailed straight past that.

**Two breaks were caught by a sibling, not by their own gate.** R21's
findability gate sits ~8,700 lines earlier in `smoke.js`, so breaking the
view map (6) or the dataset key (9) makes the Dex unbrowsable and R21
fires first. That proves *something* catches them; it does not prove the
R45 gate written for them would. Run alone against the same worktree
(R43's isolation pattern):

| isolated | break 6 | break 9 |
|---|---|---|
| gate 5 — every tab has a view | **FAIL** `tab "genes" has a view` | PASS |
| shared bar — a click reports the tab id | PASS | **FAIL** `not undefined` |

Each fires for its own break and only its own. Neither gate is hollow.

### Verified

- Full suite green; six R45 gate blocks plus the shared-bar block.
- Browser QA at 380px on a fresh save and a fully-catalogued one: every
  tab measured above, zero console errors on both, no sideways scroll, no
  button overflow, the species sheet still opens with its six part rows.
- The tab you are on survives leaving the screen and coming back, and
  resets to Roster on a reload — module state, like the War Room's, which
  is why a layout preference costs no migration.

### Known gaps

- **Foes is still 4.4 screens late.** A 40-cell gallery is inherently
  tall, and there is no room for a sixth tab to split Rivals off (see the
  61px-in-64.8px measurement above). Grouping made it navigable, not short.
- The Ranch is 3,388px with a full pen and has never been measured against
  a *large* herd — carried over from R44.
- Nothing sorts the stable — carried over from R44.
- Trophies still are not in the Dex (R42), and `SHIPPED_SYSTEMS` in
  `smoke.js` is still hand-kept rather than folded into `DATA_NOTES` (R39).

### Next session's first task

Measure the Ranch against a full pen the way R44 measured the Pens and R45
measured the Dex — it is the last unmeasured long screen.

## Session 66 — R44: the Pens at nine chimeras ✅

**Acceptance criterion:** a full stable fits a phone, and nothing
time-critical hides — **passes, measured in the browser**. No schema
change; `SAVE_VERSION` stays **33**.

### The audit killed my first candidate outright

R42 left a note that iterated rivals *out-scaled* a max-level stable
(0–6%). Re-measured across grade × level, that note was **wrong** — and
wrong in an instructive way. Mantissa and Trench scale properly with
veterancy (84% and 69% at prime L10). Baroness Aloft sat at 0–6%
everywhere… against `wings+noise+boots`. She is the **Air** rival:

| team vs Aloft (prime) | L0 | L5 | L10 |
|---|---|---|---|
| wings+noise+boots | 0% | 0% | 6% |
| **gills×3 (Water)** | 9% | 75% | **100%** |

Aloft is a **class puzzle, not a wall** — exactly what R27 specified
("ladder gated so each rival's counter-class anatomy is obtainable
first"). My R42 note had generalised from one team composition. Corrected
here rather than fixed in code, because there was nothing to fix.

### What the player's own situation pointed at instead

Nine chimeras. Measured at 380px, one chimera card is **1081px — taller
than the phone it renders on**:

| stable | before | after |
|---|---|---|
| 1 | 1,529px | 800px |
| 3 | 3,915px | 871px |
| **9** | **10,470px** (13.1 screens) | **1,339px** (1.7) |
| 12 | 13,748px (17.2) | 1,573px (2.0) |

R15 rebuilt the entire War Room for being **3,884px**. The Pens had grown
to **2.7× worse than the screen that phase was written to rescue** — and
R41 made keeping creatures the whole point, so it grows 1081px per
creature, forever.

### The same fix, with the machinery already in the box

R29 shipped `collapsibleCard` / `bindFolds` / `isOpen`, persisting in
`state.ui.collapsed` — which is **already in the save**, so a layout
preference costs no migration. Each creature folds to a summary row:

> ▸ **UNIT 4**  ⚕ 42m
> 🦶 Lv 0 · bond 100/100 · obedience 100%

R15's rule carries over intact — **ALERTS NEVER HIDE**. Both clocks that
cost a player something ride on the *shut* row: the Infirmary countdown
and the settling clock, browser-verified as `Unit 2 ⏳ 1h 30m` and
`Unit 4 ⚕ 42m`, with the hurt row outlined in the alert colour.

### A shut fold builds nothing

The first cut hid the body behind an attribute, and **the size gate caught
it**: a portrait is ~12KB of inline SVG, so twelve shut creatures would
have meant 145KB of DOM rendering nothing. A shut fold now builds no
portrait, no manifest, no card at all. The browser confirms **zero `<svg>`
elements while shut**, and one the moment a fold opens.

That is the gate earning its place rather than rubber-stamping: my first
assertion was arithmetically wrong (nine rows cannot fit inside 3× a
one-row page), and rewriting it to measure *marginal* cost is what
surfaced the real inefficiency underneath.

### One older gate had to move

R33's dossier gate asserted the pens card renders a dossier — true when
every card was always open. It now opens the fold first, which is what a
player does before reading a dossier. A layout change that invalidates an
old gate's *setup* is not the same as one that invalidates its claim.

### The break battery

Nine breaks, plus one re-run. All caught.

| break | verdict |
|---|---|
| the fold goes away (the pre-R44 wall) | CAUGHT |
| every fold ships open | CAUGHT |
| a shut fold builds the portrait anyway | **MISSED** → re-run as 3b, CAUGHT |
| the Infirmary clock hides | CAUGHT (sibling, same block) |
| the settling clock hides | CAUGHT |
| the shut row stops being worth reading | CAUGHT |
| opening one opens them all | CAUGHT (sibling) |
| the fold state stops persisting | CAUGHT (R29's own gate) |
| opening drops the card contents | CAUGHT |
| **3b** a shut fold ships the whole card, merely hidden | CAUGHT |

**The miss was a bad break, not a hollow gate** — the same shape as R41's
identical-curve break. It only restored *computing* the portrait, while
the body still discarded it when shut, so the rendered output never
changed and nothing observable regressed. Rewritten to emit the card while
shut, it is caught immediately — by the gate's guard clause ("an open card
is the heavy thing"), which is precisely the symptom: if shut folds ship
the card, *opening* one stops adding weight.

Worth separating from a hollow gate, which asserts something that cannot
fail. This gate could always fail; the break simply did not break
anything.

### Verified

- Full suite green; five R44 gate blocks.
- Browser QA at 380px with nine chimeras: shut page 1,339px, zero
  portraits built; opening one yields exactly one open fold, one portrait,
  the dossier and the care controls; the state survives a reload; both
  alert rows keep their countdowns; no sideways scroll, zero console
  errors.

### Known gaps

- **The Dex is now the longest screen at 7,113px** — it inherited the
  title the Pens just gave up. It is a reference screen rather than a
  working one, which is a weaker case for folding, but it is next on this
  particular list.
- The Ranch is 3,388px with a full pen and uses the same 1081px-card
  shape; it has not been measured against a *large* herd.
- Nothing sorts the stable — nine rows are nine rows, in splice order.

### Next session's first task

Measure the Ranch against a full pen the way this phase measured the Pens,
or fold the Dex.

## Session 65 — R43: the Sparring Ring holds charges ✅

**Acceptance criterion:** three spars every thirty minutes — **passes,
walked rather than multiplied**, at `SAVE_VERSION` **33**.

### The ask, and what it actually changes

> *"Allow more sparring. 3 spars every 30 minutes."*

R41 shipped the ring at one spar per 45 minutes, deliberately conservative
— the worry was a risk-free grind loop (§8, risk 5). Played, that was the
wrong side to err on: an evening bought **one** drill, so a walled player
went back to losing the same assault, which is precisely the trap the ring
was built to be the ladder out of.

Three charges, one back every ten minutes. The xp per spar is
**unchanged**, so what moved is session pacing, not the curve — one real
assault is still worth more than one drill, and the grind ceiling is still
a ceiling. It is just a ceiling you can reach in one sitting.

### A bucket, not a cooldown

Charges beat a shorter cooldown for the case that actually hurts: someone
returning after a break finds **all three waiting** and can spend them back
to back, rather than being metered one at a time by a clock that started
while they were away.

All of it derived from **one stored timestamp** — `sparRefillAt`, the
moment the bucket next stands completely full — because timers here are
timestamps and nothing runs in the background. A reload, a closed tab and
a week away all compute the same ring. Spending *pushes* that stamp one
regen later rather than restarting it, which is what keeps three-in-a-row
costing ten minutes to the next charge instead of thirty.

The button carries the count (`🥊 Spar 3`) and, when empty, the **short**
countdown — a player staring at an empty ring wants "next in 9m", not
"full in 29m".

### Migration

v32 → v33: `sparRefillAt ??= 0`, and the old `lastSparAt` cooldown stamp is
deleted. Everyone arrives with a **full ring** rather than a converted
cooldown — converting would be arithmetic nobody asked for, and would
leave some players mid-wait on a mechanic that no longer exists.

### The break battery, and a weak gate it could not see

Ten breaks, **zero misses** — but five were caught by sibling assertions
running earlier in the file, which meant several of my own R43 assertions
had never proven themselves. Rather than accept the tally, I ran an
**isolation harness**: a scratch copy of the modules with each break
applied, running *only* the R43 assertions.

That found one my battery could not: **"spending restarts the clock"
passed gate 3.** Under that break the first spar jumps straight to a
full-window refill, and the ladder back up — one charge per regen — looks
*identical* to correct behaviour, so every charge-count check agreed. What
separates pushing from restarting is the **total**: two spent must be two
regens from full, not a fresh whole window. Gate 3 asserts `msToFull` now,
and the isolation run confirms it fails under exactly that break.

| break | verdict |
|---|---|
| the ring goes back to one charge | CAUGHT |
| the rate is halved (regen wrong) | CAUGHT |
| spending restarts the clock | CAUGHT (gate 1; **gate 3 rewritten** after isolation) |
| charges overflow past the cap | CAUGHT (sibling) |
| the empty ring never re-opens | CAUGHT (sibling) |
| the button shows the long countdown | CAUGHT |
| the button stops showing the count | CAUGHT |
| the ring ticks in the background | CAUGHT (sibling) |
| the migration converts instead of filling | CAUGHT |
| the old stamp is left behind | CAUGHT |

The lesson is about batteries, not about this feature: **a whole-suite
break tells you the suite noticed, not that the gate you wrote noticed.**
When siblings fire first, isolate.

### Verified

- Full suite green; seven R43 gate blocks.
- Browser QA at 380px, the whole arc: a v32 save **mid-cooldown** migrates
  to `🥊 Spar 3`; three spars back to back walk the button `3 → 2 → 1 → 9m`
  and disable it; ten minutes back on the clock returns exactly one
  (`Spar 1`); the full window returns three. Zero console errors, no
  sideways scroll.

### Known gaps

- Charges are global, not per-node — sparring three different garrisons
  draws on one bucket. Intentional (the ring is the player's time, not the
  garrison's), but worth revisiting if partners ever get identities.
- Nothing surfaces the bucket outside the map's Spar buttons; a player on
  another tab cannot see it refilling.

### Next session's first task

Still the playtest: take a veteran stable through the Gauntlet now that
levelling is reachable in a single sitting, and report what the pacing
feels like from the inside.

## Session 64 — R42: The Gauntlet ✅

**Acceptance criterion:** after the county is yours, the coalition sends
what it was saving — and a veteran stable is the thing that can meet it —
**passes, measured**, at `SAVE_VERSION` **32**.

### The audit first killed my own pitch

I went in expecting to recommend *"make the world answer veterancy"* — the
worry that R41's levels would trivialise everything. Measured, half of that
premise died: **the rival ladder holds** (a standard L10 stable wins 3–22%
against fresh rivals, 0–6% against iterated ones), and the mid-map softens
exactly the way any earned progression should. What the game actually
lacked was the other end: a stable that clears the Boardroom had rivals,
counter-offensives, and *nothing else* — while four boss-scale units sat
parked in `enemies.json` with full stat blocks, moves, procedural shapes,
salvage manifests and KO lines, drafted at R25 and pinned by A5's gate as
fitting no strip without a rescale, for **seventeen phases**.

R41 built the thing they fit. The trajectory math says so: a creature that
fights every node assault reaches **L8 at dominion** (L3 by end of
Greenfield, L5 at Kestrel), and a realistic diet — losses, defences, eight
spars — caps it at **L10 right at the finale**. No curve retune needed. The
Gauntlet is the tier that starts where the map ends.

### Four exhibitions, in order

The card appears under the dominion banner the moment the county is yours:
Stratofortress, Leviathan Dredge, CRUCIBLE-9000, THE COMPLIANCE ENGINE —
each one derived encounter, authored escorts first, the boss walking on
last. No node behind it, no income, **no notoriety** (an exhibition is not
a conquest). The purse is real, the Containment Cannon works — bagging THE
COMPLIANCE ENGINE is the intended jackpot, since its salvage carries the
game's only **apex `mandate_horn`** — and the director does not rewrite a
Gauntlet fight, because these *are* the coalition's answer. Each stage win
fires a philosophy line through R10's machinery; the fourth closes the set
on the wire.

### Tuned against the stables that will actually fight it

The first draft (scale 1.35–1.6) was a walkover across every cell — 100%s
everywhere — because "boss-scale authored stats" mean nothing to a prime
L10 team. Swept upward and pinned per stage (2.4 / 3.2 / 2.5 / 2.8):

| stage | prime L8 | prime L10 | apex **L0** (fresh) | apex L10 |
|---|---|---|---|---|
| Stratofortress | 44% | 84% | **3%** | 97% |
| Leviathan Dredge | 34% | 75% | 0% | 100% |
| CRUCIBLE-9000 | 28% | 50% | 0% | 88% |
| THE COMPLIANCE ENGINE | 6% | 47% | 0% | 88% |

The thesis, measured: **a fresh apex-grade stable fails Exhibition I at
3%.** Entry to the Gauntlet is what a team has been through, not what was
bought for it — grades cannot skip the queue that levels built.

### A5's pin closes to empty

The parked-units gate spent seventeen phases asserting *"the parked units
are exactly the four known ones."* It now asserts the list is **empty** —
every drafted unit is fielded somewhere (encounter, director, or Gauntlet)
— and a newly drafted unit must arrive with a stage or an encounter or
fail the build the day it lands. The gate's original purpose, finally able
to say yes.

### The break battery

Thirteen breaks, thirteen caught, no misses.

| break | verdict |
|---|---|
| the Gauntlet opens before the county is yours | CAUGHT |
| the card stops going in order | CAUGHT |
| a beaten stage re-opens (trophy farming) | CAUGHT |
| the boss walks on first | CAUGHT |
| the exhibitions get gentle (pre-tuning scale) | CAUGHT — *"a fresh apex stable does not (94%)"* |
| the finale becomes a wall | CAUGHT — *"(0%)"* |
| a win pays notoriety like a conquest | CAUGHT *(the battery's log line came back blank; reproduced by hand to confirm it fails on its own assertion)* |
| the win stops being recorded | CAUGHT |
| sparring's guard leaks over the Gauntlet | CAUGHT (sibling — the leak kills win-recording first) |
| a stage names a phantom unit | CAUGHT (A5's pin, same protection) |
| the migration forgets the shelf | CAUGHT |
| a unit goes back to being parked | CAUGHT |
| the SW forgets `campaign/gauntlet.js` | CAUGHT |

### Verified

- Full suite green; seven R42 gate blocks (the criterion at both ends,
  order enforcement, data resolution, resolve-path recording, the cannon
  jackpot, migration, UI wiring).
- Browser QA at 380px, both halves: a mono-Ground veteran team fought
  Exhibition I and **lost honestly** — R37's diagnosis fired with *"the
  class triangle is costing you about 63 points here"* — shelf unchanged,
  card held. A flier team re-ran it at *Favoured — 88%*, won, and the card
  showed 🏆 with Exhibition II open. Zero console errors, no sideways
  scroll, pre-dominion card correctly absent, v31 winner migrates to an
  open Exhibition I.
- R41's keyed loader paid rent: adding gauntlet.json to the browser was
  one list entry.

### Known gaps

- The Gauntlet has no rematch after victory — a beaten exhibition is a
  highlight reel, deliberately, but a "replay for no reward" toggle might
  be wanted someday.
- Trophies appear on the card and the wire, not in the Dex.
- Rivals still do not level (measured non-urgent this phase, but a
  max-level stable at 0–6% against iterated rivals means the ladder now
  out-scales veterans — the opposite imbalance may deserve a look).

### Next session's first task

Whatever the player reports after taking a veteran stable through it.

## Session 63 — R41: a chimera you keep ✅

**Acceptance criterion:** a chimera you create at the beginning of the game
can last the entire game — **passes, measured**, at `SAVE_VERSION` **31**
(schema bumped, with a migration).

### The brief was a player report, verbatim

> *"I have like 9 chimeras and no combination of them could ever beat the
> war missions I'm on. We need ways to train them… Each chimera needs xp
> and levels as well… A chimera you create at the beginning of the game
> should be able to last the entire game."*

He was right about the shape of the game. The only ladder out of a wall was
to **replace** the creatures — raise better donors, extract better parts,
splice again — and R13 even built the dismantler for it. Nothing made the
creature you already had stronger for having fought. On top of that:
fifteen chimera names covered a stable the game pushes past nine, and none
of them could be changed.

### Veterancy: grades build a creature; levels season it

Every battle a chimera walks out of pays xp — **win or lose**, sized by the
waves actually reached × the opposition's scale, because a walled player
grinding losses into levels is the ladder out of the wall working as
designed. Level is *derived* from xp (one source of truth, no stored level
to disagree with it) and multiplies hp, power, armour and stamina.

**Never speed.** Turn order is anatomy — A9 and R32 priced flight and speed
in mass and lift — and no amount of drilling changes what a creature is
made of. A max-level veteran acts exactly as fast as the day it was
spliced, and a gate holds it there.

### Tuned against the measured finale, not stat parity

Grade also sharpens *moves* (+12%/step), so equal stats are not an equal
fight — the first dial (0.045) left a max-level day-one team at 25% against
the endgame. The shipped dial is **0.05** (L10 = +50%):

| | fresh (L0) | max level (L10) |
|---|---|---|
| day-one Standard **wings** team vs The Boardroom | 0% | **63%** |
| fresh **Apex** team of the same build, for scale | 44% | — |
| day-one **kite / noise** vs The Boardroom | 0% | **0%** |
| Standard boots vs Precinct (the report's wall) | 0% | 34% @ **L3** · 50% @ **L5** |

0.06 was measured and rejected: 94% at the finale, matchups washed out.
Levels reward the right anatomy — they do not replace it. And every
pre-existing bench in the harness runs at level 0, so all of R16–R19's
degeneracy gates measure exactly what they measured last release.

### The Sparring Ring

Every held node grows a 🥊 button: a seeded, scaled-down rematch against
the garrison you already beat there — half xp, **zero purse, zero
notoriety**, and the capture pipeline is exempted *before* the containment
loop, because a cannon that fires on a 0.75-scale drill with no stakes is a
free capture farm. Injuries stay real (the QA run's walkover spar sent Sir
Chomps-a-Lot to the Infirmary with Bent Whiskers, which is exactly the
tone). One shared 45-minute clock across the ring, so real assaults stay
the better evening.

The briefing, forecast and R37 diagnosis all run on the spar through the
same path an assault takes — and the losing diagnosis now names the new
lever: *spar a garrison you hold and level them up, or raise better
donors.* The director does not get a look at a drill.

### Names, and the right to change them

120 chimera names (was 15), 80 stock names (was 18), and `pickFresh`
prefers a name nobody on the roster is wearing — a fully spoken-for pool
repeats as a *lineage* (Chompers II), never a duplicate. Every creature
card grows a ✏️: a one-field sheet in the picker's own chrome, sanitised at
write because names are interpolated into markup all over the game — markup
never gets to *be* a name.

### The bug browser QA caught — third phase running

The pens card told a level-0 chimera it was *"a finished veteran"*. Only in
the browser: `data/loader.js` destructured **twenty fetched files into
nineteen positional names**, and a destructure that comes up short does not
error — training.json was in the list, fetched, and silently dropped, so
the page ran on fallback tuning with an empty level curve. It was the
*fourth* loader spot this phase needed (sim, renderer index, smoke,
browser), and the only one whose failure was invisible. The loader now
builds its object keyed by the same names it fetches, so a listed file
reaches `indexContent` by construction — the bug class is dead, not
patched.

### Migration (the Ascent rule, sacred)

v30 → v31: `xp ??= 0` on every chimera **including captives sitting in a
rival's holding cell** — a rescue must not return a crash — plus the ring's
clock and counter. Level 0 is exactly yesterday's power; nothing is taken
from anyone.

### The break battery

Thirteen breaks, all caught (two by sibling assertions in the same block).

| break | verdict |
|---|---|
| the engine stops reading levels (the pre-R41 world) | CAUGHT |
| veterancy starts touching speed | CAUGHT |
| the engine keeps its own curve, differing from data | CAUGHT *(first attempt hardcoded the identical curve — a bad break, not a hollow gate; re-run with one that disagrees)* |
| a loss pays nothing | CAUGHT (sibling) |
| a loss pays for waves never reached | CAUGHT |
| the spar keeps the node's purse | CAUGHT |
| the spar fights at full strength | CAUGHT |
| a sparring loss feeds the capture pipeline | CAUGHT |
| the ring loses its cooldown | CAUGHT |
| names go back to colliding | CAUGHT |
| a rename stores markup | CAUGHT (sibling) |
| the migration forgets captives | CAUGHT |
| the SW forgets `battle/veterancy.js` | CAUGHT |

The battery runner now refuses a break that fails to apply — `assert old in
s` on every patch — which is R40's silently-unapplied-break lesson promoted
into the harness itself.

### Verified

- Full suite green; ten R41 gate blocks, the criterion measured with the
  real engine at both ends (fresh fails the finale, seasoned takes it, the
  wrong anatomy seasoned still fails).
- Browser QA at 380px, on the player's own shape — a v30 save with nine
  identical Ground chimeras and three held nodes: migrates clean, renames
  stick, a spar runs end to end (*"Victory! +7 xp each."*), the cooldown
  chip counts down, no purse line, zero console errors, no sideways scroll.

### Known gaps

- Rival chimeras and rehabilitated captives have no xp of their own —
  rivals scale by `powerScale`, so a max-level stable will eventually want
  the rival ladder re-benched with veterans in mind.
- Sparring draws only from a node's authored encounter — the director's
  rewritten versions never appear in the ring (deliberate, but it means the
  ring teaches yesterday's coalition).
- The xp bar has no place on the battle screen itself — you learn what a
  fight paid only in the aftermath line.

### Next session's first task

Play-test the trajectory: how many evenings from the report's position
(nine standard chimeras, three nodes) to Precinct falling — and re-bench
the rival ladder against a leveled stable.

## Session 62 — R40: the campaign had an end and never said so ✅

**Acceptance criterion:** taking the last node is not the same event as
taking the first — **passes**, at `SAVE_VERSION` **30** (schema bumped, with
a migration).

### The audit, and three premises that did not survive it

The balance harness runs clean — *"no degenerate builds flagged"*, 5,508
battles in 1.8s — so this was not a numbers phase. Three things I went
looking for turned out to be fine:

- **Unreachable species?** None. All 40 have a route in: 34 mail-order, 32
  by conquest, 6 bred, 10 from job loot.
- **Dead enemy units?** Four are unfielded — `crucible_9000`,
  `leviathan_dredge`, `stratofortress`, `the_compliance_engine` — and A5
  already knows, pins the list deliberately, and would fail the build if a
  fifth appeared. The existing gate caught my premise for me.
- **No final boss?** There is one. The Boardroom fields Director Prime.

What is missing is what happens **after** you beat him.

### Twenty-one nodes and nothing at the end of them

Taking The Boardroom — the last node of the last region, past Director
Prime — ran the same three lines as taking the Old Barn Perimeter:

```
Precinct HQ seized. Income +$150/day. Locals adjusting surprisingly well.
{the player's conquest bark}
```

`regionComplete` existed per strip; there was **no campaign-level
equivalent**, and nothing anywhere read "every node held". The monologue
system's slots stopped at a per-node `conquest`. Twenty-one nodes,
twenty-four encounters, five regions and three rival labs, and the run
terminated in silence.

### It is a milestone, not a win state

ROADMAP §8's fifth risk is endless mode going stale, and its mitigation —
the director, variants, and R9's counter-offensives — keeps running. So the
announcement says so in the same breath:

> **THE COUNTY IS YOURS.** All 21 nodes held. Somewhere, a regional manager
> is updating a spreadsheet with shaking hands.
> *{the player's dominion line}*
> The coalition does not concede. It reschedules. Counter-offensives continue.

And a standing banner on the map, so a player who was away when the wire
scrolled past still learns the run they finished was finished. It stays put
when a node is lost and says so rather than pretending: *"1 back in
coalition hands. Take it again."*

Everything is derived from the roster. Add a sixth region and dominion
simply moves further away; the engineer's line names the count with
`{nodes}` rather than typing 21, which a gate enforces.

### `SAVE_VERSION` 29 → 30

The one stored field is `dominionAt`, and its only job is to make the moment
fire **once** rather than every render. It is null on migrate rather than
backfilled, deliberately: a player who already holds all 21 earned the
moment and never got it, so they get it on their next load. Additive; every
other value untouched.

### Browser QA caught the bug the suite could not

`claimDominion` fired only where a node is **taken**. A player already
holding all twenty-one — anyone migrating from v29 having finished the map —
has **no node left to take**, and would never be told. The banner never
appeared.

The gate for exactly that case called `claimDominion` directly and passed,
while the game never reached the call. `announceDominion` is now called from
the capture path *and* from `tickCampaign` (a no-op on every other tick), and
the gate asserts through the tick.

That is the second phase running where the browser found what the suite
could not — R39's Vault had no field-note slot at all under the same
conditions: note written, gates green, nothing on screen.

### The break battery, twice

Twenty-one breaks across three runs. **Five came back MISSED, every one of them my gate rather than the code**, and all five are fixed with the re-runs recorded:

| break | verdict |
|---|---|
| the last node goes back to being the first | CAUGHT |
| it fires on every render | CAUGHT |
| the node count is typed into the engine | CAUGHT |
| losing a node retracts the claim | **MISSED** → CAUGHT |
| a voice loses its line | CAUGHT |
| the engineer types the count into the prose | CAUGHT (sibling) |
| it is announced as an ending | CAUGHT |
| the schema changes with no version bump | CAUGHT (sibling) |
| the migration forgets the field | CAUGHT (sibling) |
| a save that already won is skipped | **MISSED** → CAUGHT |
| the banner is dropped from the map | **MISSED** → CAUGHT |
| the SW cache stops tracking `SAVE_VERSION` | CAUGHT |
| **10c** the tick stops announcing | CAUGHT |
| **11c** the banner shows before the claim | CAUGHT |
| **11d** the banner hides the losses | CAUGHT |
| **11e** the view forks the wording | **MISSED** → CAUGHT |

**Three gates had setups that never reached the code they guard** — the same
family in three shapes, all in one phase:

- Gate 4 changed `heldNodes` and read `dominionAt` back **without
  re-entering** the code a retraction would live in.
- Gate 9 called `claimDominion` **directly** instead of the load path, and
  so passed while the game never reached the call at all.
- Gate 9's second half reused its fixture — and **`migrate` mutates and
  returns the same object**, so the first call left the save stamped v30 and
  the second migrated nothing. That one came back MISSED *twice* before I
  stopped guessing and applied the break by hand to watch it work.

All three now enter through `tickCampaign` or a fresh fixture. Two of the
break scripts also gained `assert old in s`, so a break that fails to apply
reports itself instead of masquerading as a passing suite.

Distinct from R38's hollow gate (right property, fixture that could not
express it) and from R34/R35's (a substring appearing in more places than the
thing under test). This one is: **right property, wrong entry point.**

**Two were holes rather than hollow gates.** Nothing asserted the banner
rendered at all, and nothing asserted the view used the shared wording — a
break replacing the body with *"All done. Nice one."* passed clean. `renderWarRoomScreen` touches `document.body` and cannot run
headless, and grepping the view's source for a template literal tests the
spelling of the code rather than what a player reads — so the content moved
into `dominionBanner()`, DOM-free, the same move R38 made with
`outlookLine()`.

### Verified

- Full suite green; nine R40 gate blocks.
- Browser QA at 380px: no banner on a fresh or mid-campaign save; it fires on
  a v29 save migrated holding all 21; it survives losing a node and reports
  the loss. No sideways scroll.
- Zero console errors on a fresh save and on a **v29 → v30** migration with
  every screen visited.

### Known gaps

- Beating all three rival labs is reported in the banner but is not a moment
  of its own — the map is the campaign and the ladder runs beside it.
- The four parked boss-scale units are still parked. THE COMPLIANCE ENGINE
  and CRUCIBLE-9000 are drafted at hp 118–145 and fit no strip without a
  rescale; a post-dominion tier is where they would belong.
- `SHIPPED_SYSTEMS` still sits beside `DATA_NOTES` (R39's leftover).
- Stars still are not shown on an animal's own card (R38's leftover).

### Next session's first task

A post-dominion escalation that fields the four parked units, or clear one
of the two standing leftovers.

## Session 61 — R39: the gate that checked five of six screens ✅

**Acceptance criterion:** the suite derives what it checks from the game, and
the Vault is no longer the screen nobody was told about — **passes**, at
`SAVE_VERSION` 29 (no schema change).

### Three defects, stacked, each hiding the one beneath it

R29 shipped the rule *"one first-use note per shipped system"* and two
hand-written lists to enforce it. One of them was wrong the day it was
typed:

```js
const SCREENS = ['ranch', 'pens', 'theater', 'battle', 'dex'];
```

The game has **six**. The missing one is the **Vault** — which is also the
only screen in the game with no note at all, so the assertion that exists to
catch exactly that could never fire. And the suite already knew how to
derive the real list: the A4 agenda gate reads it out of `main.js`. Two
lists, one derived and one hand-kept, and the hand-kept one is the one that
went stale.

Underneath it sat a **real, shipped, unguided system**. The Resequencer
(R31) has a data file, a module, a Vault card, a save field and a tick in
the shell — and it arrived *two phases after* the one-note rule with no note.
Invisible, because the omission was in the roll and in the notes alike.

And underneath **that**: the Vault had **no field-note slot at all**. Five
screen modules wire `guideForScreen` and `bindFieldNote`; the Vault wired
neither. A note there could not have been shown even once it existed.

That third one was found by **browser QA, not by the suite** — the note was
written, the gates were green, and nothing appeared on the screen. Worth
recording: two of these three would have stayed invisible to a passing test
run.

### What shipped

**`shellScreenMap()` is the one derivation**, following `main.js` from the
screen id to its render function to the module that exports it. Both gates
that needed a screen list read it. The moment it went in, the suite failed on
`vault has at least one note` — the phase proving itself.

**A gate that follows that chain** and asserts each screen's module can show
a note, asks for its **own** screen's note, and lets the player dismiss it.
Derived, so a seventh screen is held to the rule without anyone adding it
anywhere. *(My first draft of this gate made a second copy of the derivation
and the "only one place knows how to find the shell map" assertion caught
me — the gate doing precisely its job, to my face.)*

**The Resequencer's note**, on the Vault:

> **A vial is the whole animal, banked**
> Every graduation leaves a DNA vial, and for a long time that was a pile of
> inventory that did nothing. The Resequencer spends one to grow that donor
> *back* — same species, same star potential, same hidden genes… A run takes
> 2 hours, the vial is spent either way, and one in four collapses.

Reachable on the first vial, retiring on `state.resequenceCount` — a field
the save already had, so a note costs no schema. The numbers in the body are
gated against `resequencer.json`, so tuning and prose cannot drift apart.

**`DATA_NOTES`** maps every content file to the note that teaches it or an
explicit exemption with a reason. A new `data/*.json` now fails the build
until somebody decides which it is. This does **not** make the roll
self-writing — "system" is not derivable from source — it makes forgetting
loud instead of silent, which is the actual failure being fixed.

### The break battery, twice, and a contamination bug of mine

Nineteen breaks across two runs. **No misses.**

| break | verdict |
|---|---|
| the screen list goes back to being typed out | CAUGHT (R29 sibling) |
| the Vault note is deleted | CAUGHT |
| a sixth screen ships unguided (the *next* Vault) | CAUGHT |
| the two gates fork the derivation again | CAUGHT |
| a note points at a screen the shell lacks | CAUGHT (R29 sibling) |
| the tuning drifts from the note | CAUGHT (R31 sibling) |
| the note never retires | CAUGHT |
| the note fires before a vial exists | CAUGHT (criterion walk) |
| the SW forgets `resequencer.json` | CAUGHT |
| **A** the Vault loses its slot again | CAUGHT |
| **B** the Vault renders another screen's note | CAUGHT |
| **C** the note cannot be dismissed | CAUGHT |
| **D** the note text misquotes the run time | CAUGHT |
| **E** the note stops stating the odds | CAUGHT |
| **F** an unmapped content file, precached | CAUGHT |
| **G** the map points at a phantom note | CAUGHT |

**The first run contaminated itself.** `git checkout -- .` restores tracked
files and does not delete untracked ones, so the `data/workshop.json` a
break created survived into the two breaks after it — both of which then
reported *"missing: data/workshop.json"* rather than their own signal. Those
two results were discarded and re-run with `git clean -fd` in the restore
step. Seven of the first twelve also landed on older sibling gates that fire
earlier, so the second battery isolates my own assertions: it breaks the
*note text* rather than the tuning, and precaches the stray file so the
service-worker gate does not answer first.

### Verified

- Full suite green; seven R39 gate blocks.
- Browser QA at 380px: the Vault shows nothing with no vial, shows the note
  the moment one arrives, and drops it after one run. Dismissible, no
  sideways scroll.
- Zero console errors on a fresh save and on a v8 save migrated to v29 with
  every screen visited.

### Known gaps

- `SHIPPED_SYSTEMS` still exists as a hand-kept list beside `DATA_NOTES`.
  The two overlap; the roll could probably be derived from the map now, and
  was left alone rather than refactored blind at the end of a phase.
- A system with no data file of its own (training, dismantle, the dossier)
  is still invisible to `DATA_NOTES` — the map keys off content files, and
  not every system has one.
- Stars are still not shown on an animal's own card (R38's gap, untouched).

### Next session's first task

Fold `SHIPPED_SYSTEMS` into `DATA_NOTES` so there is one list, or take R38's
leftover and show an animal its own stars.

## Session 60 — R38: "Standard" is three different animals ✅

**Acceptance criterion:** the graduation forecast says what is holding a
grade down and what the animal is worth if you fix it — **passes**, at
`SAVE_VERSION` 29 (no schema change).

### The premise, for once, held up — and got sharper

ROADMAP §3.3 calls the timing tension — extract a Juvenile now, or raise it
to Prime with good care — **"the ranch's central economic decision."** Both
screens that touch it printed one word:

> Graduation forecast: **Standard**

Three inputs (genetics × age × condition), one verdict, and no way back from
the verdict to the input you could change. The card shows all three raw
numbers — age stage, a condition bar, a genes line — and never connects any
of them to the grade.

A starter herd makes the case without any arithmetic. All three read
`Standard`:

| animal | ★ | age | shows | if grown | if grown + kept | ceiling |
|---|---|---|---|---|---|---|
| Gordon the Goat | 3.60 | juvenile | Standard | Prime | **Apex** | Apex |
| Alfredo the Goat | 2.20 | juvenile | Standard | Standard | **Prime** | Prime |
| Agnes the Bear | 2.80 | **adult** | Standard | **Standard** | **Apex** | Apex |

Agnes is already grown. Waiting does nothing for her; care alone is worth two
grades. Measured across **1,200 starter animals** over 400 seeds: every
single one sits below its own ceiling — 25% by one grade, 68% by two, 7% by
three. **None is at its cap.** 91% are capped below Prismatic by genetics,
and in 69% of herds the three animals do not all want the same thing.

### What shipped

`gradeOutlook()` decomposes the forecast: the ceiling, whether age or
condition is what still stands between, **the condition number that actually
buys it**, and whether genetics has capped it. `outlookLine()` is the one
sentence both screens render — the ceremony and the ranch card — because two
copies of an explanation is how two screens end up disagreeing about the same
animal.

> **Pickles** · Condition 60 · Graduation forecast: **Standard** `+2`
> *Apex once Pickles is fully grown (14h) and at condition 81+. Waiting alone gets you Prime.*

The condition is a **number**, not "look after it", because `Condition 60` is
printed two lines above it and a number is something you can act on. The
ceremony prices the decision in what it costs: *"Graduating now gives up 2
grades."*

Three cases the sentence has to get right, and does: an **elder** is told
*"past its prime, so waiting from here only costs upkeep"* and never told to
grow; an animal at its ceiling is told *"time and care are done — anything
better has to be bred, not raised"*; and the breeding lever is named **only**
once husbandry is spent, never while there is still care to do.

### It caught a mistake I shipped last session

R37's losing verdict said *"Raise donors longer for better grades"* — one of
the three inputs, named blind. Measured: for **12%** of starter animals,
waiting alone raises the grade by nothing at all and care is the only lever
that moves it; for **6%**, reaching the ceiling needs no further ageing.
Either way I had pointed some players at the one thing that would not work —
the same defect as the *"bring more creatures"* I replaced it with, one
session later. It now sends them to the Ranch, where the answer is per
animal.

*(Two numbers because they answer two different questions — "does waiting
raise this grade at all" and "does the ceiling still need age". Both are in
the source, each labelled with its question.)*

### The break battery, and two hollow gates of mine

Twelve breaks. **Two came back MISSED, both my gates rather than the code**,
and both are fixed with the re-runs recorded.

| break | verdict |
|---|---|
| the outlook drifts from the forecast the screens showed | CAUGHT |
| every animal is told the same thing (the pre-R38 world) | CAUGHT (sibling assertion) |
| a grown, neglected animal is told to wait | CAUGHT |
| the condition number is a guess, not the threshold | CAUGHT |
| the condition number rounds the wrong way | CAUGHT |
| an elder is told to wait for a prime it is past | **MISSED** → CAUGHT after fix |
| the breeding lever is named while care still has work | CAUGHT (sibling assertion) |
| the ranch card rebuilds the wording instead of sharing it | CAUGHT |
| the ceremony stops pricing what you give up | CAUGHT |
| R37's single-lever advice comes back | CAUGHT |
| the grades note is deleted | CAUGHT |
| the note retires without the player ever raising one | **MISSED** → CAUGHT after fix |

**The elder gate was hollow because of its fixture, not its assertion.** An
elder's age factor is 0.8 against a prime's 1.0, so deleting the elder rule
only shows up on an animal whose score straddles a grade threshold between
those two values — and the dealt herd happened not to. The genes are pinned
at 3.0★ now (0.48 → Prime as an elder, 0.60 → Apex if it could grow into its
prime), with a younger control proving the gate discriminates on the elder
rule rather than on genetics.

**The second was a gate that did not exist.** Nothing asserted the grades
note retires on proof, so `gradedPartOwned` could have returned a constant
and the suite would not have noticed.

That is a different failure from the four hollow gates of R34/R35 — those
asserted on a substring that appeared in more places than the thing under
test. This one asserted the right property on a fixture that could not
express it. Worth distinguishing: the fix is a better fixture, not a better
assertion.

### Verified

- Full suite green; nine R38 gate blocks.
- Browser QA at 380px: three starter cards each carry a `+2` chip and their
  own line (condition 81+, 92+, 81+); the ceremony reads *"Graduating now
  gives up 2 grades"* and fits; a grown, well-kept herd flips to *"time and
  care are done"*. No sideways scroll.
- Zero console errors on a fresh save and on a v8 save migrated to v29 with
  every screen visited.

### Known gaps

- Stars are still not shown on an animal's own card — the outlook names the
  genetic ceiling but never the number behind it. The Gene Scanner gates
  trait visibility; whether it should gate stars too is undecided.
- `SHIPPED_SYSTEMS` in the suite is still a hand-kept list, so a system that
  ships with no note and no roll entry stays invisible to it. Flagged in R37,
  still true.
- The Guard Post is a pure grade wall and now has a lesson, but nothing links
  the two: the briefing does not say "this is what better grades buy you".

### Next session's first task

Make the shipped-systems roll derive itself, or show an animal its own stars.

## Session 59 — R37: the lesson is behind the wall it explains ✅

**Acceptance criterion:** a player whose team cannot answer the node in front
of them is told why, in terms they can act on — **passes**, at `SAVE_VERSION`
29 (no schema change).

### The premise was wrong twice, and measurement caught it both times

I pitched this phase as *"the 24 guides teach you to run a ranch and never
how to win a fight"*, with a table of six mechanics at zero coverage.

**Wrong once.** The `regions` note states the tag chart outright — *"Kestrel
Reach is Airborne, so your Ground-tagged moves miss entirely."* Combat is
taught. But it is gated on `secondRegionOpen`, which means holding **Precinct
HQ**, which is the wall it explains. Same for `director` at four war wins.
The lessons sit behind the door they are the key to.

**Wrong twice.** I then assumed Precinct was a *class* wall. It is not — not
for the team that hits it. Three standard-grade chimeras, one layer lifted at
a time, 32 replays each:

| archetype | base | class off | chart off | at Prime |
|---|---|---|---|---|
| boots (Ground) | 0% | 0% | 3% | **28%** |
| wings (Air) | **91%** | **0%** | 91% | 100% |
| gills (Water) | 0% | **16%** | 0% | 0% |

A Ground team loses there on **grade**. A flying team wins on **class and
nothing else** — 91% collapses to 0% the moment the triangle is lifted off
it. Water is the only one the triangle is actually costing.

### The defect that finding exposed

The briefing already ran the real fight 32 times (A1) and then explained the
verdict with **one of two constant strings**:

> *Not survivable — This team cannot win this fight. It is not close — **bring
> more creatures**.*

`campaign/ui.js` caps a strike team at three. For a player who already has
three — which the Path explicitly tells them to build — that is advice **the
screen itself refuses to accept**. And it was shown to all six archetypes
above, whose actual causes differ.

### What shipped

**`diagnose()` measures the cause instead of guessing it.** The same
instrument A7 used for obedience: replay the same fight with the class layer
lifted, then with the tag layer lifted, and name a cause only when removing
it actually moves the win rate. Verified against the table above —

| team at Precinct | says |
|---|---|
| boots ×3, at the cap | *Hand them every matchup above and this is still a loss — these creatures are not strong enough yet.* |
| gills ×3 | *The class triangle is costing you about 16 points here.* |
| noise ×3 | *Their tags are blanking your attacks — worth about 13 points.* |
| boots ×1 | *You are 1 against 2. Bring another body.* — A1's answer, kept |
| wings ×3 | nothing; it wins |

The bands now **describe**; only the diagnosis prescribes. `even` lost its
"bring another body if you have one" too — the same defect in gentler form.

**The class chip reports both directions.** R35 put losses beside wins on the
tag notes and left the class chip upside-only — `beats their Water` when the
triangle favoured you, and an **empty string** when it did not, on the layer
worth 16–20pp against the chart's 3.7–7.4pp. A row now reads:

> 🦶 **Big Unit 1** — ready · obedience 100%
> ✘ their Air beats its Ground
> ✘ its Ground attacks do nothing to Airborne ✘ their Sonic goes through its armour

**Two lesson notes, reachable at the first conquest** — before both walls.
`triangle` retires when the player *demonstrates* it (two classes in the
stable, derived from anatomy, never stored), not when they have walked far
enough. `chart` retires at eight wins.

### Two things the work turned up

**`runs` was a trap and is gone.** I first ran the diagnosis gate at 12
replays to keep the suite quick, and it named the wrong cause: the 16-point
class effect on a Water team fell under the floor and read as *"your
creatures are too weak"* — sending the player after the one fix that does not
work. That is the identical lesson `runs = 32` is documented for one layer
up. `diagnose` no longer takes the parameter.

**The R29 roll is hand-maintained.** I claimed the suite had no gate for
"every shipped system has a note." It has one — `SHIPPED_SYSTEMS` in
`tools/smoke.js` — but it is a list a human keeps, so six phases shipped past
it without the gate noticing. It caught both new notes immediately, which is
the half of it that works.

### The break battery

Twelve breaks. Every gate fails when the thing it guards is broken.

| break | verdict |
|---|---|
| the bands prescribe again (the pre-R37 world) | CAUGHT |
| the diagnosis goes away entirely | CAUGHT |
| a team at the cap is told to bring more (*the actual bug*) | CAUGHT |
| A1's real case loses its answer | CAUGHT |
| the cause is asserted from the chart instead of measured | CAUGHT |
| `classBlind` becomes a no-op | CAUGHT |
| the class chip goes back to upside-only | CAUGHT |
| the triangle is hardcoded in the chip | CAUGHT |
| the lessons go back behind the wall they explain | CAUGHT (R29's criterion walk, same property) |
| a lesson note is deleted | CAUGHT |
| the lesson retires on progress, not demonstration | CAUGHT |
| the briefing keeps its own copy of the cap | CAUGHT |

Two of the messages are worth keeping. Break 3 reproduces the bug in its own
words — *"You are 3 against 2. Bring another body"* — and break 5, which
asserts the cause from the chart instead of measuring it, produces the
giveaway of every unmeasured diagnosis: *"the class triangle is costing you
about **0** points here."*

### Verified

- Full suite green.
- Browser QA at 380px on the real wall: three Ground chimeras at Precinct HQ
  render three ✘ class/tag lines apiece, the red verdict card, and the why
  line; an Air stable renders `✔ beats their Ground ✘ their Water beats its
  Air` on one row. No sideways scroll, zero console errors.
- Zero console errors on a fresh save and on a v8 save migrated to v29.

### Known gaps

- `diagnose` runs three forecasts (96 replays) on a losing verdict. Only on
  losing and hopeless, and only when a team is picked, but it is the most
  expensive thing the briefing does.
- The `even` band lost its prescription and did not gain a diagnosis — an
  even fight is arguably where knowing the lever helps most, but it is also
  the band players see most often, and the replays are not free.
- `SHIPPED_SYSTEMS` is still a hand-kept list.
- Grades have no lesson note, and the Guard Post is a pure grade wall
  (0% at Standard, 53–67% at Prime for the same teams).

### Next session's first task

The `grades` lesson, or make the shipped-systems roll derive itself.

## Session 58 — R36: the Dex says what the roster is for ✅

**Acceptance criterion:** a base species entry is worth opening — **passes**,
at `SAVE_VERSION` 29 (no schema change).

### The premise was wrong again, in the usual direction

My own audit note called the Dex "a stamp album." It is not. It has seven
sections and most of them are generous: rival dossiers carry what that rival
will field **next**, undiscovered combos carry A6's hints, the field guide
carries 40 enemy units with their tags, and 12 trait genes and 27 combos have
their own entries. Calling the whole screen thin was lazy.

The thin part was one section — and it happened to be the one the entire
game is spent filling.

### A base species showed less than a mutation of itself

The 34 base cells rendered exactly this:

```
Bear
Power
parts 0/6
```

A name, a role, a count. Meanwhile a **variant** of that same bear — six of
them in the game — showed its class, its tags and its set bonus name. So did
the enemy field guide. The roster you spend the game collecting was the
least-documented thing in its own catalogue, and none of the last four
phases had reached it:

| shipped | where it shows | in the base Dex cell |
|---|---|---|
| R32 bulk (0.3 moth → 1.9 rhino), which decides flight | nowhere | ✘ |
| R34 set bonuses, all 41 wired into the engine | variant cells, name only | ✘ |
| R35 tags, on the briefing and the field guide | variant + enemy cells | ✘ |
| thermal band, diet | care screens | ✘ |

### Where the depth had to go

`.dex-grid` is `minmax(100px, 1fr)` — three columns at 380px. *"Unstoppable
— +15% Power, with 4+ Rhino parts"* does not fit in a 100px column, and
widening the grid to make it fit would cost the at-a-glance sweep of 34
animals that is the grid's whole job.

So the split is: **the cell gains its tags** (parity with the variants and
the field guide, and it fits), and everything else goes into a **tap-to-open
sheet** through R31's existing picker, which already renders read-only HTML
in its `subtitle` for the dismantle flow.

> **COBRA**
> 🦶 Ground · Poisoner · light
> Tags: Venomous
> **Cold-Blooded Focus** — Venom applies twice the stacks, with 4+ Cobra parts
> Comfortable 18° to 40° · eats gourmet eggs, no questions
>
> **PARTS — 4/4 MET**
> **Cobra Head** — Venom Fang · 40 power · 8 mass
> **Cobra Coil** — Constrict · 3 mass
> **Cobra Scales** — Cobra Bristles · 7 mass
> **Venom Sac** — Cobra Leech · 3 mass

Four rows, not six. The cobra has no limbs, and a snake entry with two blank
limb slots is a bug wearing a straight face.

An unmet part names the **slot** and withholds the part — *"Hide — not yet
extracted"* — because "you are missing a hide" is a lead and "???" is not.

### Three places the entry could have kept a second opinion, and doesn't

`data/*.json` and the engine own these numbers; the Dex reads them.

- **The purebred threshold.** I first typed `4+` into the sheet. That is a
  copy of `PHYS_TUNING.purebredAt`, and it would go on promising four the
  day physiology wanted five. It reads the constant now.
- **Part mass and lift.** Quoted from `part.phys`, never recomputed. Lift is
  printed only where the part makes some — 8 of 34 species have a
  lift-bearing part, and *"0 lift"* on a rhino horn is noise, not data.
- **The weight word.** `featherweight / light / middleweight / heavy` are
  quartiles of the roster's own bulks, not a hardcoded table. Double every
  bulk in `species.json` and the words are unchanged; retune one animal and
  its word moves on its own.

### One thing the work turned up

**Three species were being weighed against animals that have no build.**
`weightWord` first polled every non-synthetic species — which includes the
six bred variants, three of which (`alpine_ram`, `storm_eagle`, `pale_cobra`)
carry no `bulk` of their own and fall back to 1.0. Three phantom 1.0s stacked
in the middle of a 34-animal scale, and demoted the **ram, eagle and goose**
a class each. Scoped to the base roster, with a gate that fails if the
variants come back.

### The break battery

Twelve breaks. Every gate fails when the thing it guards is broken.

| break | verdict |
|---|---|
| the cell goes back to a div — entry unreachable | CAUGHT |
| the cell drops its tags again | CAUGHT |
| the set bonus is a name with no effect | CAUGHT |
| the threshold is typed in rather than read | CAUGHT |
| the weight word becomes a fixed bulk table | CAUGHT |
| the scale counts the bulkless variants again | CAUGHT |
| an unextracted part is named outright | CAUGHT |
| an unextracted part is a blank | CAUGHT |
| mass is recomputed instead of quoted | CAUGHT |
| zero lift is reported as a feature | CAUGHT |
| the cobra gets two empty limb rows | CAUGHT |
| the SW forgets `splice/dexentry.js` | CAUGHT |

**One gate is structural, and says so.** The threshold gate checks the
rendered text *and* greps `dexentry.js` for a literal `4+`. With
`purebredAt` currently at 4, a hardcoded `4+` renders identically — only the
grep can catch it. That is a real limit of the gate, not a hidden one:
raising `purebredAt` would make the text check bite, and until then the grep
is the whole of it.

*(Procedural note, mine again: I ran the suite by hand inside the break
worktree while the battery was still working through it — the same racing
mistake as last session, from misreading a `nohup ... &` wrapper's exit code
as the battery's. Nothing was corrupted, since the manual run only read, and
its result matched the battery's own for that break; but I stopped touching
the tree and let it finish rather than reporting from output I could not be
sure of.)*

### Verified

- Full suite green — 244 parts · 4 frames · 41 species · 40 enemy units.
- Browser QA at 380px: 34 cells, all open; sheet fits (`scrollWidth ≤ 380`),
  no sideways scroll; closes on backdrop, close button and Escape.
- Zero console errors on a fresh save, and on a v8 save migrated to v29 with
  every screen visited and an entry opened afterwards.
- Save/load survives a reload mid-feature — the sheet is read-only and holds
  no state, and the parts it lists come from `state.dex.parts`.

### Known gaps

- Variants (`alpine_ram`, `storm_eagle`, `pale_cobra` and three others) still
  render as the old rich cells and do not open a sheet. They already show
  class, tags and set bonus name; what they lack is the effect text and the
  parts list.
- Three of the six variants carry no `bulk` of their own, so they have no
  weight class to show even if they did open.
- The enemy field guide's 40 units show tags but no numbers.

### Next session's first task

Decide between finishing the variants' entries (small, closes the asymmetry
this phase created in the other direction) and the next audit pass.

## Session 57 — R35: the other matchup layer, on the screen where you choose ✅

**Acceptance criterion:** the strike-team picker shows what you need to pick
with — **passes**, at `SAVE_VERSION` 29 (no schema change).

### First, the premise was wrong again

Last session's note said the briefing "shows a chimera's class and nothing
else." It does not. It already showed a class icon per row, obedience,
injury state, a **type advantage** flag, and the opposition's classes — A7
and A1 had both been through here. The class triangle was covered.

The gap was the **other** matchup layer.

### The tag chart decides fights and was invisible

| | |
|---|---|
| encounters carrying a tag beyond Organic | **23 of 24 (96%)** |
| encounters throwing at least one Ground move | **17 of 24 (71%)** |
| tag spread | Vehicle 19, Airborne 13, Armored 11, Aquatic 11 |

**Priced wrong the first time.** Comparing an eagle build on the A frame
against the same parts on M made flight look *harmful* — 53% against 56%.
That comparison changes stats, sockets and mass, so it measured the chassis,
not the rule. Isolated properly, same build on both sides of the chart with
only the rule toggled:

| rule | on | off | worth |
|---|---|---|---|
| Ground misses Airborne | 53% | 49% | **+3.7pp** |
| Sonic ignores Armor | 32% | 24% | **+7.4pp** |

A layer worth 4–7pp, live in 96% of fights, with nothing about it on the
screen where you commit a team.

### What shipped

The opposition lists its tags **from your chair** — *"Armored: your Sonic
goes straight through it"*, *"Airborne: your Ground does nothing"* — and
every roster row says what the chart actually does between that creature and
this enemy, using the four moves it can press:

> 🪽 **Kite Eagle** — ready · obedience 100% · beats their Ground
> ✔ their Ground attacks miss it entirely
>
> 🪽 **Sentry Goose** — ready · obedience 100% · beats their Ground
> ✔ their Ground attacks miss it entirely ✔ Sonic goes through their armour
>
> 🦶 **Big Unit** — ready · obedience 100% · beats their Water
> ✘ its Ground attacks do nothing to Airborne

**Losses get the same space as wins.** A briefing that lists only upsides is
a sales brochure, and A1's lesson was that the game must not present a losing
pick as a choice.

### Two things the work turned up on its own

**A note that fires for every pick is not information for picking.** "Their
Gas hits it harder" appeared on all four rows of nearly every encounter,
because the engine stamps `Organic` on every chimera — true, and useless for
choosing between them. It is said once on the opposition line now.

**And "type advantage here" is true of every row in 21% of encounters** —
Slag Gate among them, which is how the screenshot caught it. It discriminates
in the other 79%, so it stays; it names the class now (*"beats their
Ground"*), which informs in both cases.

### One implementation of the chart

R33 wrote the chart's sentences for the dossier; R35 needed them again from
the defender's chair. They live in `battle/tagtext.js` and both screens read
them, because two copies of a chart is how a chart goes stale. A gate adds a
chart row and proves it reaches the opposition list *and* a roster row with
no engine edit.

### The break battery, and a pattern in how I write gates

Nine breaks, plus four serial re-runs once the gates were fixed. Every break
lands.

| break | verdict |
|---|---|
| incoming chart rules go silent | CAUGHT |
| outgoing chart rules go silent | CAUGHT (sibling R35 assertion, same path) |
| losses stop being reported — only upsides | CAUGHT |
| a new chart row is ignored | CAUGHT |
| the Organic suppression is removed | CAUGHT *(after the gate was fixed)* |
| the universal rule vanishes from the opposition line | CAUGHT *(after the gate was fixed)* |
| the dossier forks the chart | CAUGHT (R33's dossier gate, same property) |
| the briefing renders no opposition tags | CAUGHT |
| the SW forgets `campaign/matchup.js` | CAUGHT |

It found **three gates of mine that could not fail, and one piece of dead
code** — a better haul than the code changes.

**Two hollow gates, one mistake, twice.** Both asserted on a substring that
appears in more places than the thing under test:

- The Organic-suppression gate grepped a note's **text** for "Organic". A
  note's text names only the attacking tag — *"their Gas hits it harder"* —
  while the defender tag lives in the `key`. It could never fail.
- The opposition-line gate grepped for "Organic" too, and `foeTagLines`
  emits an ordinary per-tag line for Organic whenever the **opposition** is
  Organic, which most of it is. It passed whether or not the universal rule
  was reported at all. It matches *"everything you own"* now — a phrase only
  the universal line carries.

That is four such gates across R34 and R35, all the same failure. Worth
naming as a pattern in how I write assertions rather than fixing four times
and moving on.

**One gate guarding code that could not run.** The dedup filter in
`matchupNotes` carried a comment claiming "several waves can carry the same
tag" — but `campaign/ui.js` collapses the waves into Sets before the function
is reached, and the chart is walked once, so a repeated key cannot arise.
Measured across all 24 encounters against a maximal tag set: zero
duplicates. A comment I had not verified, guarding unreachable code, checked
by a gate that could not fail. All three found by one break. The filter is
gone and the gate now asserts the property where it *can* be violated.

Two breaks were caught by sibling assertions rather than the one named —
stubbing the shared chart trips R33's dossier gate first, which is the same
property from the other chair.

**And a third that could not fail in either of two shapes.** The "no repeated
clause" gate first guarded the dead dedup filter; rewritten to test the
caller, it built a `Set` from a doubled array — which the Set collapses
before the function sees it. `matchupNotes` takes Sets by contract and walks
the chart once, so the property is unviolatable. The gate is deleted rather
than reshaped a third time: a gate that cannot fail is worse than no gate,
because it reads like coverage.

*(Procedural notes, both mine. I raced my own battery — moved HEAD in the
break worktree while four breaks were mid-flight — and then let three queued
jobs run the re-run script concurrently against one worktree, interleaving
the log. Both sets of results were discarded and the affected breaks re-run
serially on a settled tree, rather than reported from output I could not
trust.)*

### Known gaps

- The battle screen shows a class chip but still no tag chips — the matchup
  is explained before the fight and during the fight only through damage
  numbers.
- R34's set bonus is named on the Pens card and the Dex, not on the briefing.
  It is a passive, and the row is already carrying obedience, class and up to
  two chart clauses at 380px.

### Next session's first task

The Dex. It lists what you have collected; it does not say what any of it is
*for*. With R32's mass, R33's dossier rows and R34's set bonuses all real
now, the Dex is the one screen still describing the roster as a stamp album.

## Session 56 — R34: the purebred set bonus, which nothing read ✅

**Acceptance criterion:** going purebred does something the battle engine
actually reads, priced so mixing stays worth doing — **passes**, at
`SAVE_VERSION` 29 (no schema change).

### Forty-one promises, zero mechanism

Every species declared a `setBonus`. Physiology computed `purebredSpecies`,
handed it to the combatant as `physiology.purebred`, and **the engine never
looked at it.** The Dex printed the name, the panel printed the prose, and
the fight ignored both.

### The brief inverted under measurement — twice

I told Evan purebred was already **7pp ahead**, so bonuses would need a real
cost or mixing would die. Then I corrected that to **2.1pp**. Both were
artifacts of the sim's build sampler: purebreds average **5.9 sockets** and
the mixed pool **3.6**, so I was measuring socket count wearing a purebred
label.

Matched builds — same frame, same grade, the same six sockets, bond 100 on
each — say the opposite:

| | purebred | mixed | gap |
|---|---|---|---|
| M / standard | 32.2% | 33.0% | −0.8pp |
| M / prime | 44.5% | 44.4% | +0.1pp |
| M / apex | 59.0% | 60.2% | −1.2pp |
| L / standard | 35.2% | 36.4% | −1.2pp |
| L / prime | 47.9% | 48.7% | −0.8pp |
| L / apex | 60.9% | 62.7% | −1.8pp |

**Purebred trailed, everywhere.** Of course it did — a mixed build picks the
best head, the best hide and the best organ from anywhere; a purebred takes
what one animal gives. And purebred's one wired benefit, −20 instability,
**buys nothing in a fight**: instability feeds a disobedience roll that bond
cancels outright, and at bond 100 the term is zero. Going purebred was a cost
with no payment.

So the set bonus is not a buff that threatens mixing. It is the payment.

### Three dials, and a 42nd species is a data edit

`setBonus.effect` speaks only in things the engine already reads every turn:

| dial | what it does |
|---|---|
| `stats` | multiplies the combatant's base numbers |
| `perks` | adds to the temperament perk block |
| `keywords` | multiplies the numeric value of that keyword on this creature's moves |

A boolean keyword has no dial and is left alone — `trap: true` times two is
not a thing, and there is a gate that says so. Rivals who commit to one
animal earn their set too.

### Fourteen of the promises were unimplementable as written

"+20% trap duration" on a trap with no duration. "+25% knockback" on a
boolean. "ignore 25% armor" on a beetle whose signature move **already**
ignores armour outright, so the bonus was redundant even in prose. Every
`desc` is rewritten to state what its effect does; every **name** is kept.

### The first draft reproduced the bug it was fixing

Six bonuses — wolf, tortoise, goat, heron, storm eagle, iron tortoise —
scaled a keyword living on a **utility move that loses R30's four-slot
competition.** Dead on arrival, exactly like the prose they replaced. Found
by probing every species rather than assuming; those six pay in stats or
perks instead, and gate 2 now proves all 41 change the creature that earned
them.

Then **the gate written to prove the mechanism hit the same trap**: it
invented a bonus scaling `thorns` on a bear, and a bear's thorns are on its
hide active, which it never presses. It scales `recoil` now.

### Measured after

| | before | after |
|---|---|---|
| purebred vs mixed, mean of six cells | **−0.9pp** | **+1.3pp** |
| cells where purebred leads | 1 of 6 | **6 of 6** |
| dominance flags across 24 pools | 0 | **0** |

A real reason to chase a set; not a reason to stop mixing. The Storm Eagle
is no longer even the roster's top build — that is the mantis, at 75%
against a 51% median.

### The break battery, which found two gates that could not fail

Thirteen deliberate breaks against an isolated worktree. The first pass came
back **7 clean, 2 overshoots and 1 MISS** — and the miss was the point of the
exercise. Final: **8 caught by the assertion that guards them, 4 overshoots
covering 2 load-bearing properties, 0 unguarded.**

**Scaling booleans came back MISSED.** The guard says `trap: true` times two
is not a thing; the gate handed the cobra's real effect a move carrying
`trap`. But `applySetBonus` iterates the **effect's** keys, not the move's,
and the cobra's effect names only `venom` — so the boolean was never within
reach of the code under test. A gate that cannot fail is decoration. It now
invents an effect that names the boolean.

**And the mixed-build gate compared stats only**, so a keyword-only leak — a
bonus reaching a mixed build without touching a single stat — would have
walked straight through. It compares all three dials now. That one was found
by writing the isolating re-run for break 9 and noticing it would miss.

**Two properties turned out not to be isolable at all**, and that is worth
recording rather than papering over: the four-part threshold, and the rule
that a mixed build collects nothing.

Leaking a *stat* bonus to every build breaks the older "battle HP =
physiology HP" identity first; re-run as a keyword-only leak, it trips R24's
"a gene must show in a fight" instead, because handing every build a bonus
perturbs the measurement that gate takes. And the threshold behaves the same way:
lowering `purebredAt` trips an M3 settling gate (the −20 instability discount moves with it); holding
`purebredStability` at zero to compensate then trips R26's region-identity
gate instead, because handing *every* build a set bonus collapses a strip's
margin. The property is guarded — verified by hand, 3 parts reads 68 hp with
the bonus on and 68 with it off, 4 parts reads 110 against 92 — but it is
load-bearing enough that every break large enough to violate it violates
something broader first. That is a well-defended property, not a hollow gate;
the distinction from break 8's genuine MISS is the whole reason to say which
is which.

### Known gaps

- `goat`'s original promise was *halved upkeep* — an economy effect, not a
  battle one, and the only bonus whose natural home is `ranch.js`. It pays in
  Stamina instead. Wiring upkeep-shaped bonuses is a separate, smaller phase.
- The bonus is invisible mid-fight. The dossier and the panel name it before
  the fight; the battle log never says "Fortress absorbed that."

### Next session's first task

The war room briefing shows a chimera's class and nothing else — not whether
it can fly into an Airborne node, not the set it is carrying. R33 put those
facts on the Pens card; the screen where you pick a strike team still does
not have them.

## Session 55 — R33: the chimera dossier ✅

**Acceptance criterion:** from the Pens screen, a player can see everything
`analyze()` knows about a creature they already own — **passes**, at
`SAVE_VERSION` 29 (no schema change).

### The panel talks to a builder and stops at the door

`physiology.analyze()` computes eight rows, and the Theater shows them
**while you build**. Measured across the four screens a player sees *after*
the creature exists:

| | reaches the player? |
|---|---|
| Class | ✓ war room briefing (icon, "type advantage here"), battle (class chip) |
| Instability | ✓ pens card |
| Stamina pool | ~ the battle bar — never regen against draw |
| **Flight** | **nowhere** |
| **Speed** | **nowhere** — one tie-breaker line in battle |
| **Mass, lift, power-to-weight** | **nowhere** |
| **Thermal band** | **nowhere** |
| **Field tags** | **nowhere** |

R32 had just made the first of those decide a fight, and the second cost a
point per 50 mass. Six invisible numbers had become six invisible
**decisions**.

*(I told Evan "you can't see whether it flies or what class it is" before
measuring. The class half was wrong — it is on two screens. Flight and every
number were the real gap.)*

### It is not a re-render of `report.rows`

Three of the panel's eight notes are written for somebody still building,
and are wrong for somebody looking at what they made:

- **Flight** — *"Try a lighter frame or fewer dense parts."* You cannot
  re-frame a chimera that already exists.
- **Instability** — *"Settling estimate: ~N min."* Stale the moment it settles.
- **Chassis** — *"One extraction gives you all six parts of a donor; use
  them."* Advice for a build still on the bench.

So `splice/dossier.js` composes its own copy from the report's **structured
fields**. Same numbers, different voice — and because both read one report
they can never disagree about a fact, which is the first thing gated.

DOM-free, like `battle/moves.js` before it, so the suite asserts every line
without a browser.

### Two things it refuses to do

**It does not restate the tag chart.** The first draft hardcoded "Electric
hits Aquatic twice as hard" — a second copy of `data/keywords.json` that goes
stale the first time anyone edits the real one, and exactly the trap
CLAUDE.md's *all content is data* rule exists to prevent. Rules are read from
the chart and phrased from their mechanics, so a new row reaches the player
with no engine edit. There is a gate that adds one to prove it.

**It does not promise the purebred set bonus.** All 41 are read by the panel
and the Dex and by **nothing in the battle engine**. A dossier quoting one
would be lying about what the creature does, so it states the instability
discount physiology actually applies.

### And it names the class that beats you

Physiology's own note ends *"weak to whatever beats it"* — the one fact a
player cannot work out from the screen. The triangle is a cycle in the data,
so who beats you is a lookup, not a constant.

### What browser QA caught that no gate would have

The card printed **`Settling… NaNd NaNh remaining`** beside a perfectly good
dossier. Not a shipped bug — all four chimera-creation paths set `settleUntil`
correctly — but my hand-authored test fixture had invented `settledAt`, so it
was a shape the game never produces. **A fixture that has drifted from the
real shape tests the fixture.** It now goes through `spliceChimera` like a
player would, and the gate asserts no `NaN` reaches the card at all.

### And what my own gate got wrong

It demanded every flight row quote the creature's mass, and failed on the
rhino — which has no lift surface, so no lift *equation*, so nothing to
quote. The assertion was wrong, not the code. It now checks both sides of the
equation where there is one, and separately that mass reaches the player
somewhere in the dossier regardless.

### Shape

Folded shut by default. At 380px the pens card runs **1099px closed and
1573px open**, and it already carries a portrait, temperament, obedience, four
move slots and a parts manifest. The summary line carries class, flight and
speed — the three facts worth a glance. No new field-note guide: the summary
is always visible, so discovery is a design property rather than a tip, and
`ui/cards.js` is right that a wall of tips is wallpaper.

### The break battery

Twelve deliberate breaks against an isolated worktree; every one made the
suite fail, and after two re-targets every one failed on the assertion that
guards it.

| break | verdict |
|---|---|
| dossier speed drifts from the report | CAUGHT |
| flightless collapses into ground unit | CAUGHT |
| the airborne row becomes a badge with no consequence | CAUGHT |
| the tag chart stops reaching the dossier | CAUGHT |
| the class row punts on the counter | CAUGHT |
| the dossier quotes the dead set bonus | CAUGHT |
| the shut summary says nothing | CAUGHT |
| the fold ships open | CAUGHT |
| the dossier is dropped from the card | CAUGHT |
| the settling clock goes missing | overshoot — see below |
| a NaN in the dossier's own arithmetic | CAUGHT (after a real fix) |
| the SW forgets the module | CAUGHT — `every runtime file is precached (missing: splice/dossier.js)` |

**Removing the settling clock overshot**, exactly as R32's lift break did: an
M3-era gate ("settling flips exactly on time") catches it long before a card
is ever rendered, so the NaN assertion never got a turn. Re-run as a NaN in a
number the dossier computes itself — and *that* found a real defect rather
than landing cleanly. `P2W_WORD.find(([m]) => p2w >= m)[1]` **threw** on a
NaN, because `NaN >= 0` is false at every threshold and indexing the miss
raises. On a display module that blanks the whole Pens roster rather than
showing one wrong number, which is strictly worse: a visible bad value is
something a gate can catch; an exception takes the screen with it. The lookup
is total now, and the break lands on the NaN gate.

### Known gaps

- The war room briefing still shows class only. A creature that cannot fly
  into an Airborne-heavy node is a fact the dossier now states and the
  briefing still does not.

### Next session's first task

`setBonus`. Forty-one species promise a purebred reward that never fires, and
the dossier now has to route around it. Wire them or delete the claim — but
note the measurement first: purebred builds already run ~7pp ahead of mixed
ones in the harness, so each bonus needs a real cost or mixing becomes dead
content.

## Session 54 — R32: a part finally says what animal it came from ✅

**Acceptance criterion:** part mass expresses the animal, every purebred flier
flies on its own chassis and none flies on a big one, every species' anatomy
votes for its declared class, and the cobra rides a chassis that fits it —
**passes**, at `SAVE_VERSION` 29 (no schema change).

### Mass was a constant, and A9 had made it the currency

Every one of the 41 species' anatomy totalled **exactly 58 mass**. Not
approximately — exactly, because `SLOT_BASE` was the whole story: head 12,
forelimbs 13, hindlimbs 13, tail 5, hide 10, organ 5. A rhino's head massed
what a moth's head massed. A plate hide massed what a jelly mantle massed.

That was harmless while mass only bought turn order. **A9 changed the
stakes**: mass now gates flight outright (`lift >= mass`) and costs a point of
speed per 50 — so the widest decision in the builder was being priced in a
currency that carried no information about the creature.

Three consequences fell out of it:

- **Zero of 41 species lived on the Kite frame** A9 had just shipped.
- **No purebred flier could fly on its own chassis** once mass meant anything.
- The **cobra**, which has no limbs at all, rode a quadruped chassis that drew
  two empty limb sockets.

### What shipped

| | |
|---|---|
| `species.bulk` | what the ANIMAL weighs — 0.3 (moth) to 1.9 (rhino) |
| `DENSITY` | what the PART is made of, keyed on its shape family |
| lift | scales `bulk^(2/3)` — wing AREA, not wing mass |
| Scamper mass | 40 → **28** (the chassis is a floor, not the bulk) |
| cobra + pale cobra | → the **A-class Kite** |
| six species | armadillo, chameleon, pangolin, porcupine, goose, heron → S |

Part mass now spans **1 to 34** instead of six constants. A rhino's horn is 32
and a moth's head is 1, and the number is on the part in the Theater picker so
you can see the trade before you fit it.

**Every purebred flier now flies on its own chassis, and none flies on an M or
an L.** Swap in the heaviest head or hide on the roster and the Scamper says
no — the Kite is what you buy to carry that weight aloft, and it clears half
those loads.

### Three species had no classifying anatomy at all

The **octopus** — the most aquatic animal on the roster — was **Unclassed**,
because `tentacle` and a `blob` head were in no affinity table. So were both
**cobras**, whose only classifying anatomy is the coil they move on. And the
**dragonfly** tied itself out of Air, 1 vote to 1, on a pair of bug legs.

The dragonfly turned out to be a content error rather than a tuning one: **a
dragonfly has four wings.** Its hind pair are now hindwings, which votes Air
natively, carries lift, and needed no per-species override.

All 41 species' anatomy now votes for the class they are declared as.

### And a wing does not kick

Every unsigned limb was named for its **socket**: `<Species> Strike` in front,
`<Species> Kick` behind, across the whole roster. The game shipped a **Moth
Kick delivered by a hindwing**, an Owl Strike thrown by a wing, and a Heron
Bite from a spear-shaped bill. Limb and head verbs now follow the anatomy —
Wing Beat, Downbeat, Talon Rake, Stilt Jab, Paddle Slap, Peck, Headbutt — and
a paw is split by socket, because a front one swipes and a back one kicks.

### Four things this phase got wrong first, and how each was caught

**I scaled metabolic draw with bulk** (Kleiber's law, `bulk^0.75`) because it
sounded right. It cost the `gills` archetype four stamina a turn and dropped
kestrel/cloudbase from **54% to 21%**, breaking A8's climbability floor. Draw
is the *stamina economy* — R23's actives and A5's move costs are priced
against it — and mass is the *physics*. Rescaling one as a side effect of the
other retunes every long fight in the game. Cut entirely.

**The Storm Eagle broke the dominance gate** at apex — 82% against a peer
median of 51%. It was not new: the baseline measures it at **76%, already the
roster's best build at every grade**, sitting just under the +30pp bar. R32's
six points tipped it. Its trade was `speed 1.3 / power 1.1 / hp 0.75` for
Airborne, Electric on every move, and a set bonus — which is not a trade, and
CLAUDE.md says a variant that is strictly better makes its base dead content.
Now `speed 1.25 / hp 0.65 / armor 0.7 / stamina 0.85`: still the best build in
the game, at 72% rather than 82%, and it has to land its hits before it runs
out of breath.

*(Noted while in there, not fixed: `setBonus` is read by the physiology panel
and the Dex and by **nothing in the battle engine**. All 41 purebred set
bonuses are flavour text. That is its own phase.)*

**The harness's Gas axis quietly became a second Water build.** `fumes` was
built from two octopus tentacles and a cobra head — none of which were in any
affinity table, so it came out Unclassed *by accident*. Giving tentacles a
vote (the octopus fix, above) made it Water-classed, so in Kestrel it rode the
same triangle advantage as `gills` and jumped **72% to 94%**, closing that
region's identity margin to 6pp and breaking R26's gate. The `noise` archetype
already documents the rule — *"one ground limb and one water limb, so the
affinities tie… an archetype meant to isolate one axis must not also be
carrying a class advantage"* — `fumes` just never had it applied.

Applying it with a *leg* then broke a different gate: a ground limb votes
Ground and therefore swings a Ground-tagged move, which is a fifth attack tag
competing for R30's four move slots — and the one it evicted was the Gas
answer the archetype exists to measure. The tie now comes from a **wing**:
Scale Storm is a Gas attack whose anatomy votes Air, so one part buys the tie
and feeds the axis. Kestrel is back to 14pp on both bench seeds.

**A9's frame-ladder gate turned out to be resolving on coin flips.** It fired
— "the best chassis differs by strip", and R32 made it L everywhere. Measured
at 4x the sampling on **both** trees, the picture is identical: L takes **41 of
~75** decided cells before R32 and 41 after, and the per-strip winner is L on
four strips and an A/L tie on the fifth in each. At the gate's own 12 seeds the
*pre-R32* tree came out level on three of five strips (kestrel 3-3, drowned
3-3, spire 4-4), so the assertion had been passing by counting a tie as a
second answer. R32 did not move the ladder; it moved a tie.

The gate now samples at 48 (5.3s against 2.0s) and asserts what A9 actually
cares about and the data actually supports: **no strip is a one-chassis
strip** — something other than the map's best must win at least a fifth of
each region's decided cells. Measured minimum 29% here, 35% pre-R32, against
the pre-A9 world this exists to catch, which would leave about 9%.

**And the break battery found a gate that could not fail.** Flattening every
`DENSITY` to 1 was caught only by the flight gates four sections down — never
by the mass ones, because with density flat, mass still varies *by bulk*: the
animals still differ in size. Divide bulk out and what is left is the
material, and that is now its own assertion: within one slot, the densest part
must outweigh the flimsiest by 2.5x with bulk removed. Measured 3.0x
(forelimbs) to 6.5x (hide); flat density gives 1.14x to 1.50x, all rounding.

Two smaller ones, both caught by gates written for earlier phases: the
dragonfly's new hindwing overflowed the viewBox by 12px on the L chassis
(Wave 1's bounds check — span 96 to 84), and the anatomy-derived limb verbs
collided wherever a species wears the same family front and back, so a
tortoise had two parts called "Fin Slash". Families that appear in both
sockets now split, the way `paw` does.

### The break battery

Eleven deliberate breaks, each run against an isolated worktree; every one
had to make the suite fail, and fail on the assertion that guards it.

| break | verdict |
|---|---|
| mass back to a slot constant (the pre-R32 world) | CAUGHT |
| every DENSITY flattened to 1 | CAUGHT *(by the gate this battery forced me to write)* |
| a heron put on the Kite, which has no stilt socket | CAUGHT |
| tentacles and a blob head stop voting | CAUGHT |
| the coil stops voting | CAUGHT |
| the dragonfly back to two wings and bug legs | CAUGHT |
| the Scamper back to 40 mass | CAUGHT |
| lift linear in bulk again (no wing-area exponent) | CAUGHT |
| wing lift 90 → 260 | CAUGHT-ELSEWHERE — see below |
| wing lift 90 → 110 (the narrow version) | CAUGHT |
| every limb named for its socket again | CAUGHT |

Two of them taught me something. **Flat density** was caught only by the
flight gates four sections down — the mass gates could not see it, because
density and bulk both move mass and only bulk was being asserted. That became
its own assertion (above), and the re-run caught it there.

**Wing lift 90 → 260** was too big a break: at that lift *nothing* is
grounded, so A9's older "some frame/grade combinations fly and some do not"
fired first and my own gate never got a turn. A break that overshoots proves
the suite works and proves nothing about the assertion you wrote. Re-run at
110 — measured to be the value where A9's check still passes but 14 of 20
heavy-import builds wrongly clear the Scamper — and R32's gate is the one that
fails.

### Known gaps

- Flight status is only visible in the Theater while building. An existing
  chimera's Pens card shows chassis, instability and bond — not whether it
  actually gets off the ground. A9 shipped it that way; R32 did not change it.

### Next session's first task

`setBonus` — wire the purebred bonuses into the battle engine, or delete the
claim from the panel. Forty-one species promise a reward that never arrives.

## Session 53 — R31: the Resequencer, which is what a vial is FOR ✅

**Acceptance criterion:** a DNA vial does something, and what it does uses
what a vial actually is — **passes**, at `SAVE_VERSION` 29.

### Vials were write-only, and they were hiding a real loss

A vial has been produced by **every extraction since M2** and read by
**nothing**. `extract.js` pushed one, the Gene Vault listed it, and that was
the end of it — a pile of inventory that grew forever and did nothing.

Worse, it concealed the one genuinely irreversible act in the game.
`potential` and `genotype` live on the *animal*, so graduating your best
recessive carrier **destroyed those genes**. There was no way back.

### What shipped

Spending a vial grows that donor back.

| | |
|---|---|
| clock | **2 real hours**, shortened by the Incubator's `hourScale` (1h at Tier III) |
| takes | **75%**, flat |
| new gene | **6% + 5%/star**, times the Incubator's `mutationBonus` |
| sealed | at launch, from a seeded stream |

**Quality buys upside, never safety.** A five-star vial mutates far more
often and fails exactly as often — banking a good one is worth more than
banking four ordinary ones, and no amount of quality makes the risk go away.

The Incubator governs both halves because a resequencing *is* an incubation,
so that track gained a second reason to exist without one new facility knob.

Vials now bank `potential` and `genotype`. Vials written before R31 kept only
a star average, so those rebuild stats to match it — **a vial banked long ago
is worth exactly what it always said it was worth.**

### Measured over 400 runs

- **72% took** (against 75% authored)
- **29% of successes** threw a new gene
- **the donor's recessive survived 286 of 286 successes** — the whole point

### Four bugs, three of them mine and one a near-miss

**1. Aborting banked the mutation.** Cancel wrote the *post-mutation* genome
back into the vial, so abort-cycling was a free ratchet.

**2. The fix didn't work, because I aliased instead of copying.** I took a
reference to the vial's own `potential` and mutated it in place, so the
sample was contaminated before it was ever copied. Measured: **60 abort
cycles walked a 3/3/3/3/3 donor to 3/4/4/5/3** without completing a run.

**3. Migration 29 didn't return the save.** `migrate` does `save = fn(save)`,
so a missing `return` turns the whole save into `undefined` on load — every
existing player's game, gone on the next boot. All 28 other migrations
return correctly; this was mine alone.

**4. Neither tool loaded the new data file.** `resequencerTuning` falls back
to code defaults when the data is absent, so **my probe had been running on
defaults rather than the shipped JSON the whole time**. It gave the right
answer for the wrong reason — had I tuned the file, the probe would have kept
reporting the old numbers. The suite caught it by reading
`content.resequencerMeta` directly instead of through the fallback.

### House rules honoured

- **A full pen makes a finished run WAIT** rather than losing the animal.
  Losing a successful decant to a housekeeping problem the player could not
  see coming is exactly the surprise this project forbids.
- **Aborting returns the vial**, unharmed. A cancel that ate it would make
  starting one a trap.
- **The odds are quoted before committing** — *"75% to take · 28% chance of a
  new gene · 2h"* — because a one-in-four loss nobody was told about is a
  different feature from one they accepted.
- The new clock joined **A10's roll** and the code-default agreement gate.

### Known issues

- One machine, one run. Deliberate for now, but a player with twenty vials
  will feel the queue.
- The Resequencer has no facility track of its own; it rides the Incubator's.
  That is thrifty, but it means there is no way to buy *down* the 25%.

**Next session's first task:** the frames/parts/abilities reassessment. The
audit is already open and has its first finding — the **cobra carries only
four parts** (no forelimbs, no hindlimbs, because snakes have neither) yet
sits on the **S frame, which draws two empty limb sockets**. Three of 41
species have an incomplete body plan, and **zero species use the Kite**.

## Session 52 — R30: four moves, and every one of them legible ✅

**Acceptance criterion:** a chimera fights with exactly four moves it was
trained to know, every move says what it does, and holding one explains it
in full — **passes**, at `SAVE_VERSION` 28.

### Two complaints, one cause

Anatomy handed a chimera **one move per part plus every combo it unlocked**
— six or seven buttons. The battle grid has four cells. So since R28 it
showed **three moves and a "More moves" button**: a four-slot grid
apologising for a creature that did not have four moves.

And **110 of the roster's 271 moves — 41% — carry no power at all**. Every
one of them rendered as the word `util`. The sentence explaining what
`Nub Wiggle` does was sitting in `keywords.json` and was shown to nobody.

### What shipped

- **The cap is real.** Four slots, **combos competing for them** — a combo
  you choose to carry is what makes discovering one a question rather than a
  free button.
- **Identity is origin, not stats.** A move is `p:bear_tail` or
  `c:injection`, so a moveset survives a grade upgrade or a trait rewriting
  its keywords.
- **Descriptions live in data.** Each keyword gained an `effect` template
  filled with that move's own magnitude, so *"Returns 45% of any damage you
  take to whatever dealt it"* is generated rather than written twice.
- **Retraining** costs $8 and a shared cooldown. Reordering what it already
  carries is free; learning is not, and the message names what it gave up:
  *"Doorstop learns Tortoise Bite, and promptly forgets Tortoise Strike."*
- **A long press** (350ms, or right-click) opens the whole thing — the
  arithmetic against the creature in front of you, the tag chart spelled
  out, one line per keyword.

### Four bugs found by building it

**1. The moveset was never being honoured.** `movesFromTokens` emitted
`.source`; `activeMoves` looked up `.id`. Every lookup missed and everything
fell back to the default pick — in the harness, the pens screen and the
battle screen alike. I had already reported "balance holds, no retune
needed" off that measurement; it was measuring code that wasn't running.
**A8's climbability floor is what exposed it**: 13% against a 25% gate.

**2. The default pick flooded spare slots with attacks.** A pure tortoise
went from **87% to 0%** — it had one attack and three defensive moves, and
the picker replaced its shell with a second bite. **R23's own gate caught
it**, not my archetype sweep, because every archetype is attack-led.

**3. Fixing that dropped `fumes`' Gas move** — the one thing that archetype
exists for. The tag IS the chart; power does not get a vote on whether you
keep your answer to a chart row.

**4. A migrated save was charged for moves it already had.** The browser QA
caught it: comparing against the **stored** moveset rather than the
effective one told a v27 player their creature was learning all four moves
it had been fighting with for weeks.

### Balance, measured with movesets genuinely in effect

| | pre-R30 | now | gate |
|---|---|---|---|
| map minimum climbability | 38% | **29%** | ≥25% |
| kestrel margin | +17/+16 | +14 | ≥10 |
| drowned margin | +23/+27 | +14–23 | ≥10 |
| foundry margin | +30/+25 | +14–30 | ≥10 |
| distinct champions | 3 | **3** | 3 |

The harness now fields each archetype's **tuned** four via `benchMoveset`
rather than the default pick. A8's floor and R26's margins are statements
about the **content**; gating them on my picker would have measured the
picker instead. `defaultPick` is gated separately, on its own terms.

### Three house rules the suite enforced

- The service worker cache version tracks `SAVE_VERSION`, and a new module
  that is not precached breaks the offline shell.
- UI files may not render native `<input>` — the project ships `toggleRow`
  for exactly this, and using it meant no new CSS.
- R28's readout bench presses one move 120 times and needs 40 landed swings;
  the bear's new four led with a 99-power recoil move that killed the reader
  in five, so that fixture now picks a plain, keyword-free swing.

### Known issues

- `defaultPick` is a suggestion, not an optimum. It keeps every tag answer
  and one utility, which is defensible for a creature you have not tuned —
  but a player who never opens the retrain sheet is fielding a compromise.
- Enemy and rival units are unaffected: their movesets are authored, and
  they still field everything they carry.

**Next session's first task:** whatever §6 calls for next.

## Session 51 — A10: every clock reconciled, and the mechanism found ✅

**Acceptance criterion:** one pass reconciles every real-world clock in the
data against the cut that was supposed to have touched it — **passes**, and
the pass leaves two gates behind so the next retune cannot repeat it.

### The named straggler was real, and it was the small one

`operations.json` did still carry `injuryHours: [2, 5]`. The audit found
**why**, which turned out to be the useful part.

Seven modules merge `{...CODE_DEFAULTS, ...data}` so a Node tool holding a
partial content bundle still behaves. **The data always wins**, so a code
default that disagrees with it never runs — and a global retune that edits
one side and not the other leaves no trace at all. R24's cut touched
`campaign/operations.js` (already `[1.5, 3.75]`) and missed the JSON.

### Two bigger ones were hiding behind it

| clock | R24 cut it? |
|---|---|
| `incubationMinutes` | **all 32 species** |
| `growthHours` | **zero of 32** |

The egg timer shortened; the growing-up timer — the same pipeline, one stage
later — did not. **123 values today** against `injuryHours`' two.

*My first pass keyed species by array index, and A3's nine additions had
reordered the file, so that comparison was meaningless — it "found" that the
goat's growth was uncut when the goat had simply moved. Keyed by id it is
unambiguous.*

And the **rehab formula's per-unit coefficients** were missed while its base
and cap were cut, so that clock fell only to **0.86–0.93** — and least of all
for the strongest units, which are the ones you wait longest on:

| unit (power, instability) | pre-R24 | after R24 | now |
|---|---|---|---|
| (40, 20) | 10.6h | 9.1h (0.858) | 7.95h (0.750) |
| (140, 80) | 22.6h | 21.1h (**0.934**) | 16.95h (0.750) |

### `elder` is exempt on purpose, and gated to stay that way

`adult` and `prime` are **waits** — cut them and the player gets there
sooner. `elder` is when the **extraction penalty** lands (`AGE_FACTOR` 0.8
against prime's 1.0). Shortening it would make every animal in every live
save decline sooner: taking something away from saves already in flight,
which is the Ascent rule's spirit if not its letter.

So the rule is *cut the clocks a player waits on, never the one that takes
something away* — which **widens** the prime window instead of narrowing it.
Measured in the browser on a save that already existed: a goat born 6h ago
reads *Adult · Prime in 8h*, and the prime window went 42h → **46h**.

### The gates, which are the point of the phase

1. **Every numeric knob a module defaults AND the data sets must agree.**
   60 compared. Copy strings are excluded deliberately — the data is the
   source of truth for wording and the default is only a fallback, so a
   `blurb` differing is correct where a number differing is a bug. *This is
   the invariant that would have caught `injuryHours`.*
2. **A hand-maintained roll of every real-world clock**, R29's
   `SHIPPED_SYSTEMS` idiom applied to time: a new clock has to come here and
   say so, and the next global retune gets one list to walk plus a suite that
   names every value it missed. R24 had neither.
3. Growth stages stay ordered and the prime window stays the longest stage,
   so a future retune cannot quietly shorten the one clock that is a penalty.

### The gate caught a live drift on its first run, and it was mine

A9 added the Kite to `frameBase` in `data/facility.json` and **not** to
`UPKEEP_DEFAULTS` in `splice/facility.js`, so a partial bundle would have
priced the new chassis at the fallback (5) instead of 4. Same bug class,
introduced by me two sessions ago, caught the first time the check ran.

### One more of my own

The job roll's first draft paired job ids with clocks read off the *indexed*
R24 diff rather than off the file, so `county_fair` was rolled with
`petting_zoo`'s numbers. The suite caught it; read from the source, all seven
match.

### The break battery

Seven breaks, all caught — but two of them **for the wrong reason**, which
was a gap inside A10's own gate.

| break | caught by |
|---|---|
| `injuryHours` back to `[2, 5]` | *the data and the code default disagree — the data wins, so the default is a lie* |
| growth reverted to pre-cut | *salvage: growth stages ordered* ← weak |
| rehab coefficients un-cut | *rehab.hoursPerPower: data and code default disagree* |
| a numeric knob gains a value in data only | *upkeep.gradeCost: the data and the code default disagree* |
| `elder` cut for every species | *the goat clock is the one the onboarding quotes* ← weak |
| a new job arrives unrolled | *a new job has to come to the roll and declare its clocks* |
| a rolled clock drifts | *the window closes well before the next one opens* |

Reverting growth was caught only by the goat's pin and by a rounding
artefact on the synthetic `salvage` species; cutting `elder` only by the
goat's pin. Both mean a retune touching **any of the other 39 animals**
would have sailed straight through — the exact shape of the bug this phase
exists to close, sitting inside the gate meant to close it.

So the roll now carries all 41 species × `[adult, prime, elder, egg]`
instead of one pinned animal and an ordering rule. Re-broken, including a
case the old gate provably missed:

| re-break | caught by |
|---|---|
| `elder` cut for every species | *bear growth drifted from the roll (`{adult:9, prime:27, elder:72}`)* |
| **the tiger alone reverted** | ***tiger growth drifted from the roll (`{adult:11, prime:32, elder:90}`)*** |

### Known issues

- `treatPerHour` ($18 per hour of injury remaining) is a **price**, not a
  clock, so the cut left it alone — but shorter injuries mean treatment got
  quietly cheaper. Not A10's business; worth a look in an economy pass.
- The roll is per-value and hand-maintained. That is the point, but it does
  mean a deliberate retune touches two places.

**Next session's first task:** the audit queue A1–A10 is complete. Next is
whatever the roadmap's remaining §6 milestones call for.

## Session 50 — A9: the frame was a ladder, not a lever ✅

**Acceptance criterion:** the frame choice is a real decision at more than
one point in the campaign — **passes**, after an audit found the item's
premise wrong twice and turned up a bigger hole underneath it.

### The item was wrong twice

- *"Frames set base stats and socket count"* — the socket half is **false**.
  All three frames declared the **identical eight sockets**; socket count is
  a *facility* grant (`theaterGrants`), never a frame property.
- *"the widest lever in the builder"* — it was not a lever at all. Measured
  over 105 (node × archetype) cells at each node's own A8 bench conditions:

| | frames strictly best |
|---|---|
| S | **0 of 105** |
| M | 6 |
| L | **60 (57%)** |
| tie | 39 |

  **Bigger was better in 92% of cells.** A ladder, and the only "choice" was
  whether you had bought the $900 Tier II yet.

### Two causes, and the second is the interesting one

**Mass cost only turn order.** hp, stamina and regen are unconditional;
speed decides nothing but who swings first. So mass was nearly free.

**The one payoff for staying light was inert.** `flight.capable` was
computed in `physiology.js` and read by *nothing*. Chasing that turned up
the real hole: the `Airborne` **defender** tag came from **ancestry** —
61 parts carry it, only **12 make lift** — so a full bird build bolted to a
160-mass Rumbler was immune to Ground moves while sitting on the ground.
**66 of 90** purebred bird builds claimed Ground-immunity they could not
cash.

And it never mattered anyway, because:

| direction | Ground attacks | Airborne defenders |
|---|---|---|
| player → coalition | **20 parts** | 12 enemy units |
| coalition → player | **0 of 85 moves** | 61 parts |

`Ground → Airborne ×0` was a **one-way rule**. It had never fired against a
player once, in the whole campaign. A5 gave the player parts for the tag
chart; nobody ever gave the chart to the coalition.

### What shipped

1. **`Airborne` is a claim about physics**, not ancestry: the tag survives
   only where lift ≥ mass. Mass now has a categorical cost.
2. **The coalition fights at ground level** — 19 of 85 authored moves (was
   **0**), never every attack on a unit (a flier answers *part* of a fight),
   densest in the Drowned Quarter at 35% and deliberately sparse in
   air-region Kestrel at 10%.
3. **The frame ladder is compressed** so the chassis is a floor, not the
   bulk: L's free lunch over M went from +12hp/+10 stamina to +6/+6.
4. **The A-class Kite** — a flying wing at 18 mass, genuinely airborne on
   plain **standard** parts where S needs prime and M and L never leave the
   ground. It pays with **`slots`**: a frame may declare which slot types its
   geometry supports, the Theater intersects that with what the facility
   installed, and the Kite has no hindquarters. This is the lever the file's
   own summary always claimed frames had.
5. **Tier II buys both ends of the mass range at once** — the heaviest
   chassis and the lightest — so the upgrade asks *which problem do you have*
   rather than *are you further along*.
6. **Income:** every node +50% (2385 → 3585/day), and `completionBonus` pays
   per day for holding a whole strip uncontested (+1210 across the map).

### The lift ladder, which is the whole decision

| chassis | mass | flies at |
|---|---|---|
| A Kite | 18 | **standard** |
| S Scamper | 40 | prime |
| M Trotter | 80 | never (one wing pair) |
| L Rumbler | 160 | never |

### The result

| | best-frame cells |
|---|---|
| A | 9 |
| S | 13 |
| M | 11 |
| L | 33 |
| tie | 60 |

Every chassis is now the right answer somewhere — S went from **zero of 105**
to 13 — and L's share of decided cells fell from **91% to 50%**. The best
chassis differs by strip (the Foundry's is M, Greenfield's and the Spire's
is L, the Drowned Quarter splits A and L), which is what "more than one point
in the campaign" has to mean. The ladder still climbs.

### Two corrections I had to make to my own first answer

**The Foundry.** My first pass made it the densest ground-fighting strip, and
its own identity (R26) is *armour*, answered by Sonic. R26's gate caught it:
the Foundry's margin over its runner-up had fallen from a pre-A9 **+25 to
+30pp** to **+6 to +13**. I checked that against the pre-A9 tree rather than
tuning to green, and Kestrel and Drowned came back byte-identical — so the
damage was Foundry-specific and mine. The strip where flying pays must not be
one whose question is already answered, so the ground-level fighting moved
out: it is densest in the **Drowned Quarter** now (35% of moves) and thinnest
in air-region **Kestrel** (10%). The Foundry is back to +25/+30.

**The kite archetype.** I first gave it falcon parts where its peer `wings`
carries eagle — so it was measuring the parts, not the chassis. It now runs
the *same* loadout as `wings` minus the hindlimb the Kite cannot bolt, which
is the only honest way to ask A9's question.

### One thing the audit found that was not the frame

The M5 conquest test flipped to a loss. Isolated against the original data
file by file — new frames only, new enemies only, both — the cause was
**not** the frame retune. It was the new Ground tags changing what the enemy
AI chose, against smoke's `autoplay`, which is strictly greedy on power (it
never rests, never guards, never reads the tag chart) and is a *worse* pilot
than the game's own policy. The same army wins that fight 40/40 under the
real policy, and the node scores 88% under its own bench conditions.

Swapping in the real policy fixed `downtown` and broke `precinct` — which is
the tell that the problem was never the pilot but the **single seed**. That
loop's actual assertions are the bookkeeping underneath (nodes held, income
paid, notoriety raised); the combat only has to be *winnable*, and
`nodeClimbability` scores that separately and properly. So it now sweeps
eight seeds and requires a win on at least one. `autoplay` is unchanged, so
nothing else in the suite moved.

### The rule applied symmetrically, and caught the rival AI too

R27's rivals counter a Ground kit by fielding **Airborne** anatomy — that is
the mechanism, checked directly rather than inferred from win rates. But
rival specimens are built through the same `analyze()` the player's are, and
`trench` fields M and L chassis, so the moment Airborne became a physics
claim its counter-pick **bought wings and stayed on the ground**. Exactly the
mistake the new rules punish the player for.

A rival's authored `frames` list is a *style*; answering you is a *decision*.
The countering specimen now takes the lightest chassis that actually lifts
its build — so a lab that has lost to you twice turns up flying a **Kite**,
for the same reason you would. Every other specimen keeps the lab's own
taste, and there is a gate for that: a lazy fix that used the lightest frame
everywhere would pass "the lead took off" while quietly erasing every
rival's character.

### Four income literals, all of them stale

Deriving the raise turned up four assertions that had quietly become
constants — `25`, `225`, `225` again, and a two-day payout of `50`. Each was
correct when written and silently wrong the moment the economy moved. All
five income assertions read from the holdings now.

### The break battery

Ten deliberate breaks, each on its own copy of the repo so they could not
collide. Nine caught first time; the tenth found a hole in my own gate.

| break | caught by |
|---|---|
| Airborne back to ancestry | *M/standard: the tag tracks actual flight (lift 90 vs mass 125)* |
| every Ground tag stripped | *the coalition fights at ground level (0/85 moves are Ground)* |
| one unit's every attack Ground | *police_cruiser keeps an answer to a flier* |
| **the pre-A9 frame ladder restored** | ***the S chassis is the best answer somewhere (A 8, S 0, M 11, L 45)*** |
| the Kite keeps its legs | *at least one frame declares its own slots* |
| a region forgets its bonus | *drowned pays a completion bonus* |
| the bonus survives a contest | *a contested node suspends the whole strip bonus* |
| the vat ignores chassis geometry | *the vat bolted a hindlimbs to the A chassis, which has none* |
| a frame lies about its geometry | *frame A supports hindlimbs but has no hindlimb_near socket* |
| income rolled back to pre-A9 | **MISSED** → *node income alone is up on pre-A9 (2391/day vs 2385)* |

The fourth row is the one that matters: restoring the old frame ladder
reproduces the exact defect A9 exists to fix — **S best in zero cells**.

And the miss was worth having. The income gate asserted "the whole map pays
more than it did" by summing nodes **and** bonuses against a **node-only**
baseline, so rolling every node back to its pre-A9 value still passed — the
$1210/day of strip bonuses covered the gap on their own. Two claims shipped,
so it is two assertions now, and the re-broken run fails as it should.

### Known issues

- The overall "no chassis is the answer everywhere" gate runs at 12 seeds
  where the audit used 24; the load-bearing assertions are "every chassis
  wins somewhere" and "the strips disagree", which are far from their
  thresholds.
- Suite is **166s**, essentially unchanged — the four-frame sweep is 6048
  battles and costs about two seconds. A 3-second `a9-preflight` script now
  runs the cheap half of the gate, because three of this session's cycles
  were spent discovering a data slip 160 seconds at a time.
- The Kite is available only from Theater Tier II, and its edge is largest
  early. Worth revisiting whether it should be a Tier I option.
- Obedience remains honestly reported and nearly worthless (A7's leftover).
- `benchTeam` still records the ladder as it is (A8's leftover).

**Next session's first task:** A10 — reconcile every real-world clock in the
data against R24's 25% timer cut.

## Session 49 — A8: benchTeam, and an audit that came first ✅

**Acceptance criterion:** the balance gate fails on a ladder that cannot be
climbed at the team size a player has when they reach it — **passes**, after
the audit established that the phrase "the team size a player has" was not
defined anywhere, which made the criterion undecidable.

### The item was wrong twice

- *"`runSim` defaults to `teamSize 3`"* — it defaults to **1**. The callers
  pass 3.
- *"nothing in the suite looks at the team sizes the game will actually hand
  somebody"* — **A1 already sweeps [1, 2, 3]**, and asserts forecast honesty
  at all three. But only over the **first strip**.

The gap was **scope**: five nodes covered, sixteen not.

### What the unmeasured sixteen looked like

Best of five archetypes, each strip at its own bench grade:

| strip | team 1 | team 2 | team 3 |
|---|---|---|---|
| greenfield | walls at precinct, guard_post | wall at guard_post | clear |
| kestrel | wall at aerodrome | 8% at aerodrome | clear |
| drowned | walls at dredge_yard, harbor_rig | wall at harbor_rig | clear |
| foundry | **0% on all four nodes** | wall at motor_pool | clear |
| spire | walls at rooftop_pad, boardroom | walls at both | clear |

**The ladder is climbable only at exactly three.**

### But the forecast is honest about all of it

315 cells — 5 strips × every node × 3 sizes × 5 builds — **zero false "not
survivable"**. The forecast never tells a player to walk away from a fight
they would win.

Two apparent misses were **my own undersampling**, not defects:
greenfield/checkpoint ×2 reads 0/32 but is truly **2.0% over 400 runs**, and
the forecast calls it hopeless on all five base seeds; kestrel/cloudbase ×2
is truly **4.5%**, sitting exactly on the 5% band boundary, so it flaps
between `hopeless` and `losing` as it should.

### So the criterion needed a decision, not a gate

Without a declared team size, any gate would have asserted whatever the
balance happened to be — the vacuous-assertion failure mode this project
keeps catching. `benchTeam` makes it a **declaration**, per node with a
per-strip default, exactly as `benchGrade` already declares the parts a
player arrives with. Derived from measurement: the smallest team at which the
best archetype clears the node with room to spare.

Measuring it turned up **a second finding of the same shape**: `benchGrade`
is per-*strip*, but a strip is not reached all at once. Greenfield's Guard
Post sits behind Threat Gen 2 and runs **4% at `standard`, 48% at `prime`,
96% at `apex`** — so scoring it at the strip's opening grade was measuring a
fight nobody has. Both knobs are now per-node overridable, and guard_post
declares `prime`.

### The gates

1. Every node declares a team the game can field (the briefing caps a strike
   team at three) and a real grade — and `benchTeam` must actually vary, or
   it is "3" wearing a data structure.
2. The first node of the campaign is a **solo** fight.
3. Every node is climbable at the team and grade it is tuned for: floor 25%
   for the best of five archetypes, against a measured map minimum of 29%.
4. The forecast never calls a winnable fight unwinnable, **at every size on
   every strip** — 315 cells, 105 of them solo, which is the "measure a solo
   player" the item asked for.

### The break battery

| break | caught by |
|---|---|
| motor_pool declares team 1 | *is climbable at the 1 chimera(s) and apex parts it is tuned for — best of five is 0%* |
| boardroom declares a team of five | *declares a team the game can field (5)* |
| the campaign opens demanding a stable | *the first node of the campaign is a solo fight* |
| the forecast's hopeless band swallows everything under 50% | *drowned/sunken_marina wings x2: called unwinnable but truly 42%* |

### Known issues

- Smoke is **196s**, up from ~160s.
- `benchTeam` records the ladder as it is. If a future balance pass makes a
  node easier, the declaration will be stale in the safe direction (the gate
  still passes) — it catches regressions, not improvements.
- **A wall at team-of-2 remains by design**: dropping below three means "go
  rebuild", which A2 and A4 make always possible without winning a fight, and
  which the forecast warns about. That was a design call, not a measurement.

**Next session's first task:** A9 — a fourth frame.

## Session 48 — A7: obedience, priced ✅

**Acceptance criterion:** the number that decides whether your orders happen
is on the screen where you choose who fights — **passes**, though not in the
way the item expected, because measurement disagreed with both halves of its
premise.

### It was never invisible

Every roster row on the briefing screen already printed `obedience N%`. The
audit's premise was simply out of date.

### And it is not decisive

The audit read the ignore *percentage* — 45% sounds enormous — without
measuring what it buys. The original reading also confounded two things: an
unsettled creature carries **both** a big ignore chance **and** Rejection
(×0.75 power and speed), so the damage was being attributed to the wrong one.

Holding settling fixed so Rejection never fires, and replaying the real
engine **300 times a cell at pilot skill 1.0**:

| ignore chance | 0% | 20% | 40% | 60% (the cap) |
|---|---|---|---|---|
| patrol_2 | 95% | 96% | 91% | 86% |
| checkpoint | 100% | 100% | 99% | 96% |

**Twenty per cent — the realistic figure for a settled mixed build at zero
bond — is worth one to three points, inside the noise.** Even the cap costs
about nine. I checked it at pilot skill 0.8 and 1.0 in case the forecast's AI
was simply too weak for a random substitution to hurt it; same answer.

The reason is structural: **a disobeying creature substitutes another move
from its own list.** With five or six mostly-damaging moves, a random one is
usually nearly as good. It costs a little optimisation and never a turn.

### So: not "display it harder"

**One.** An ignore now actually changes the move. The improvisation pool
included the move that had just been *ordered*, so roughly one ignore in five
printed *"ignores orders and improvises!"* and then did exactly what it was
told — a line of combat log that was not true.

**Two.** The briefing *prices* it. `forecast()` takes `obedient: true`, which
replays the same fight with disobedience switched off and **nothing else
changed**, so the gap between the two win rates is what this team's obedience
costs against this encounter:

> **Obedience 40%** — worth about **6 points** of win chance here. Train them,
> or let them settle.

A team that cannot disobey gets no line at all and pays nothing for the extra
replays. Verified in the browser: Steady alone (100%) shows nothing; adding
Havoc (40%) produces the line above.

That is the criterion satisfied in substance rather than in letter — the
number is not just present, it is convertible into a decision — and it stays
honest at whatever this mechanic is eventually worth.

### The break battery

| break | caught by |
|---|---|
| the improvisation pool includes the ordered move again | *never "improvises" into the move it was just ordered to use* |
| the obedient replay perturbs power and Rejection too | *a team that never disobeys forecasts identically either way* |
| the obedient replay sets ignoreChance to 1 instead of 0 | *switching disobedience off never makes a team worse* |

The second is the one that matters: it is what stops the screen reporting
sampling noise as a cost.

I also lost both engine edits mid-battery to a `git checkout -- battle/engine.js`
used to undo a mutation — the same trap as earlier in this run. Re-applied and
re-verified.

### Known issues

- **Obedience is now honestly reported and still nearly worthless.** At the
  values the game actually produces it is a 1–3 point effect, so as a system
  it is close to decorative. Making it matter is a combat retune — a separate
  decision, not something to slip into a display phase.
- Rejection (×0.75 power and speed) is the penalty that actually bites, and
  the briefing names it without quantifying it. The same forecast-delta trick
  would price it.

**Next session's first task:** A8 — the balance harness fights at a team of
three and never measures the solo player the game actually starts you as.

## Session 47 — A6: a combo for everybody, and a silhouette that points ✅

**Acceptance criterion:** every species can appear in at least one combo, and
the Dex's silhouettes point at something real — **passes on both halves.**

### Half one: eleven species had nothing to find

34 of 244 parts were in a combo, and **eleven species were in none at all** —
gorilla, ram, porcupine, mantis, scorpion, and **every one of the six chaos
variants**, which are the rarest things the game produces. Combos are the
discovery layer; most of the roster was not in it.

Eight new combos, chosen so each covers uncovered species and so the slot
spread stops leaning on organs — the first nineteen put **ten organ parts and
exactly one hindlimb** into a combo, which is the same shape A5 found in the
tag chart:

| combo | pair | slots |
|---|---|---|
| Full Contact | gorilla haunches + ram head | hindlimbs + head |
| Bramble Thresher | porcupine arms + duelist ganglion | forelimbs + organ |
| Double Dose | scorpion sting + pale cobra hide | tail + hide |
| Switchback | alpine ram kickers + iron gut | hindlimbs + organ |
| Ball Lightning | thunderhead surge + eel hide | organ + hide |
| Lights Out | abyssal shark tail + angler head | tail + head |
| Siege Engine | iron tortoise hindfins + charge gland | hindlimbs + organ |
| Downwind | glider skunk haunches + bat wings | hindlimbs + forelimbs |

**Every animal is now in a combo**, parts coverage is 34 → 49, and hindlimbs
in a combo went **1 → 5**.

### Half two: the silhouettes named nothing

All 19 undiscovered combos rendered the *same sentence* — "an undiscovered
pairing lurks in the parts bin…". A silhouette is supposed to be bait; 19
identical rows saying "there is something somewhere" is a wall.

`comboHint()` in `splice/theater.js` reveals in layers, keyed to the parts the
player has actually handled (`dex.parts`, which survives spending the token),
and is DOM-free so the Dex and the smoke suite read the same function:

- **nothing handled** → the keyword and the two slots: *`Venom+` · a head + an organ*. Enough to rummage with, and it gives away no part.
- **one half handled** → that half by name: *`Knockback` · Gorilla Haunches + a head*. The actual lead.
- **both handled** → *`Bleed` · Porcupine Arms + Duelist Ganglion — you have handled both. Put them on the same creature.* You are holding the answer; the Dex should say so rather than smirk.

All 27 cold hints are distinct from each other.

### The harness rejected the first pricing, twice

`porcupine_hide + mantis_forelimbs` floors at **79** — Scythe Strike at
prismatic — and the combo gate requires a combo to beat its own parts at every
grade. So every legal combo on that pair was ≥80 power and drawback-free, and
`tools/sim.js` flagged it as an outlier at **56–57% against a peer median of
23–25%**. Dropping the keywords and the power to 82 did not help; the *pair*
was wrong, not the number. `porcupine_forelimbs + mantis_organ` floors at 60,
and the combo sits at 68 with thorns and bleed. Clean at 3, 8 and 12 seeds.

### My own gate caught a thing I had wrong

The first version asserted that a combo's two parts must be in *different*
slots — "one creature cannot wear two organs" — and it immediately failed on
A3's **Full Spectrum** (owl organ + bat organ). The data was right and the
assertion was wrong: Theater Tier II adds an `organ2` bay, so an organ pair is
discoverable, just gated. The gate now reads the real socket list and allows a
doubled slot exactly where a second socket exists.

### The break battery, and the assertion it exposed as hollow

| break | caught by |
|---|---|
| a species loses its only combo | *every animal appears in a combo (missing: alpine_ram)* |
| a combo pairs two single-socket slots | *switchback is wearable: hindlimbs + hindlimbs — only organ has a second socket* |
| combos drain out of the hindlimb socket | *combos reach the hindlimbs socket (0)* |
| the cold hint stops naming its keyword | *a cold hint still names the keyword* |
| a cold hint leaks both part names | *and it does not give the parts away* |
| **every silhouette reads alike again** | **MISSED at first** |

The last one is the finding. I made every unseen half render the word
"something", so all 27 cold hints read `something + something` — the exact
bug A6 exists to fix — **and the suite passed.** The distinctness assertion
keyed on `keyword|text`, and 17 distinct keywords were carrying the whole
test on their own, so the part the hint is actually *for* went unguarded.

Now asserted separately: the **text** must vary on its own (≥12 distinct of
27, measured at 17), and the pair must be ≥90% unique (measured 26/27). The
same break now fails with *the silhouette TEXT varies on its own, without
leaning on the keyword (1/27 unique)*.

One earlier attempt at that break was also just wrong: flattening the whole
`text` expression broke the one-half-handled branch too, so it tripped *the
half you have handled is named* instead — caught by A6, but not by the
assertion under test.

### Known issues

- Two combos (Full Spectrum, Powder Keg) need Theater Tier II, so their
  silhouettes read "an organ + an organ" to a player who cannot yet build
  them. Honest, but the hint does not say "you need a second bay".
- Combo coverage is 20% of parts. Every *species* is reachable now; most
  individual parts still are not.

**Next session's first task:** A7 — put obedience on the screen where a team
is actually committed.

## Session 46 — A5: a tag you cannot reach, and a tag you cannot swing ✅

**Acceptance criterion:** no tag the region ladder depends on is carried by
fewer parts than the ladder asks for — **passes**, and getting there meant
defining "depends on" properly first.

### 1. The armour-piercing answer could not be obtained by anybody

R25 invented `foghorn_array` — a 62-power Sonic organ — because the Foundry
Belt is **9 of 11 Armored at armor 11–15** and nothing in the buyable pool
went through plate. It then wired it as salvage from `leviathan_dredge`,
**a unit that appears in no encounter anywhere**. So the part existed, the
unit existed, and the two were never connected to the map.

Meanwhile `tools/sim.js` kept benching the Foundry with it. Measured share of
damage dealt in the Foundry by the `noise` archetype:

| organ | Sonic move's share of damage |
|---|---|
| `foghorn_array` (62) — the shipped bench, unobtainable | **68%** |
| `owl_organ` (26) — the best a player could hold | **26%**, with 71% coming from a Suplex that eats full armour |

So the archetype *does* isolate the armour-piercing axis, exactly as its
comment claims — but only when built from a part nobody can have.

`foghorn_array` now drops from `eel_generator`: Drowned-exclusive,
Vehicle+Aquatic+Armored, the strip immediately before the one it answers.
`dredger_barge` was the first choice and was **wrong** — it also patrols
Greenfield's Guard Post, which would have put the strongest Sonic attack in
the game a whole region before Kestrel. Caught by re-running the provenance
audit rather than by reasoning.

### 2. Two of the five tags could not be swung at all

| tag | slots it lived in, before |
|---|---|
| Electric | organ 72/46 · head 46 · forelimbs 70 · hindlimbs 44 |
| Venomous | head 40/40 · tail 48/32 |
| **Sonic** | organ 62/30/28/26/0 · head 60/36 — **no limb, at all** |
| **Gas** | hide 0/0/0 · organ 28/24/24 — **no limb, and nothing above 28** |

I first wrote this up as "Sonic and Gas exist only on support slots", and the
break battery disproved it: a **head is a damage slot**, and Sonic already had
`mandate_horn` (60) and `goose_head` (36) there, so the first gate sailed
straight through a break that removed both of A5's new Sonic parts. The claim
was wrong, not the code.

The accurate statement is narrower and more useful. Neither tag had **any
limb carrier** — forelimbs, hindlimbs or tail — which is where a build's
damage actually lives: a head is one socket competing with the species'
signature, and every chimera has three limb sockets. Gas could not be swung
at all; Sonic only from a head, and the one worth pressing is Spire salvage,
a strip *past* the armour wall it answers.
Four parts move them into damage slots, on the species whose identity they
already are: **Wing Buffet** (goose forelimbs, 48/Sonic), **Shell Knock**
(armadillo tail, 40/Sonic), **Business End** (skunk tail, 42/Gas), **Scale
Storm** (moth forelimbs, 46/Gas). Priced under the generic 52, because
ignoring armour and ×1.5 on organics are worth a few points.

### What that buys, measured

Same grades, team of three, 8 seeds a node:

| build | greenfield | kestrel | drowned | foundry | spire |
|---|---|---|---|---|---|
| noise (the shipped bench) | 55% | 72% | 63% | 59% | 59% |
| **sonic bruiser (A5 parts)** | 73% | 75% | 25% | **78%** | 66% |
| sonic, no salvage | 73% | 63% | 22% | **63%** | 53% |
| gas bruiser (A5 parts) | 55% | 63% | 28% | **6%** | 50% |

The armour region has an answer a player can build, and it works *without*
the salvage part too — so it is not a one-part dependency. Gas collapsing to
6% in the Foundry is the trade working: Gas is ×0 against Vehicle.

**The five shipped archetypes could not see any of this.** Not one uses a
Sonic or Gas damage part, so `regionBench` is byte-identical before and
after. A bench that cannot see a change to the axis it claims to measure is
its own finding.

### Defining "depends on", which took two attempts

The first gate asked, per region, "which chart tag has the biggest edge on
this roster?" and then demanded three reachable carriers of it. It failed
**Greenfield** — 62% Organic, so Gas wins the edge — and demanded three Gas
parts before the tutorial strip. That is absurd: every archetype clears
Greenfield at 55–83% with no Gas at all.

The fix is a real distinction. **The class triangle already hands out a
×1.5**, so a chart *multiplier* is a nicer way to do something the player
could do anyway. The one effect nothing else in the game reproduces is
`ignoreArmor` — armour is a flat subtraction and no class advantage goes
through it. So the gate now binds only where a strip is majority-Armored,
which is the case R25 actually hit.

### Gates

- Every enemy-tech part has at least one **fielded** source — per *part*, not
  per unit. `rotor_limbs` is promised by both `crop_duster` and the parked
  `stratofortress`, which is fine; what killed `foghorn_array` was that its
  only source was parked. (The first draft got this wrong and failed on
  `rotor_limbs`.)
- Every chart tag is swingable from a damage slot at 40+ power.
- For a majority-Armored strip: three carriers of the piercing tag reachable
  when it opens, at a power worth pressing against its median armour.

### The break battery

| break | caught by |
|---|---|
| `foghorn_array` back to its parked-only source (R25's actual bug) | *foghorn_array has a fielded source — its only sources are leviathan_dredge…* |
| Sonic loses its limb carriers | *Sonic can be swung from a limb (0: none)* |
| Gas loses its limb carriers | same, for Gas |
| every reachable Sonic attack is feeble | *Sonic's best limb move is worth pressing (20)* |
| the Sonic fauna unlocks a strip **later** than the armour wall | *foundry is 82% Armored and only Sonic ignores it, but a player can hold 2 part(s) … when the strip opens (bat_organ, foghorn_array)* |
| a fifth unit falls off the map | *the parked units are exactly the four known ones (audit_diver, …)* |

Four of the six took a second attempt, and all four were **bad breaks, not
bad assertions**:

- Removing A5's Sonic parts passed, because the gate counted heads. That one
  was a genuine error in my claim and the gate was rewritten around limbs.
- Weakening the Sonic pool *by removing its salvage source* tripped the
  orphan-salvage gate first, which is the more important assertion — so the
  power clause had to be isolated by weakening the moves instead.
- Removing `harbor_skiff` from every wave changed nothing, because the
  **director** fields it as a counter-rule unit, so it was never parked.
- Removing `hydrofoil_lance` tripped orphan-salvage instead, because it was
  the only fielded source of `hydro_jets`. Isolating the parked-list
  assertion needed a unit with no salvage and no director rule.

One mutation was also simply broken: `waves` entries are sometimes a bare
string rather than an array, so the first version iterated the *characters*
of a unit id and the suite failed with `unknown unit r,i,o,t,_,s,q,u,a,d`.

### Known issues

- **Four units are parked** — `crucible_9000`, `leviathan_dredge`,
  `stratofortress`, `the_compliance_engine`, all drafted at boss scale
  (hp 118–145, armor 13–18), too heavy for any strip they could join without
  a rescale. The list is pinned by an assertion so a fifth cannot fall off
  the map unnoticed the way `leviathan_dredge` did. Fielding them properly is
  a balance job, not a data job.
- The archetype bench needs a Sonic-damage and a Gas-damage archetype, or it
  stays blind to this axis.
- **Electric's limb carriers were both `storm_eagle`** — a chaos variant you
  must *breed*, never buy — so the tag was swingable only by someone who had
  already run the vat. `electric_eel_tail` "Live Wire" (50/Electric) is the
  base-species door.

**Next session's first task:** A6 — every species should appear in at least
one combo, and the Dex's silhouettes should point at something real.

## Session 45 — A4: open the loop that was already there ✅

**Acceptance criterion:** a player who opens the game with money, a stable
and a lost fight still has three distinct things they can do right now —
**passes**, and the criterion had to be sharpened before it meant anything.

### The audit's premise was wrong, and the truth was worse

The item was filed as *"there is one thing to do per visit and it is on a
cooldown"*. I built an instrument that enumerates every action the game would
accept from the exact state the criterion names, and measured **five things
open, not zero**. But:

| open, before | what it actually is |
|---|---|
| Order from the catalog | spend money |
| Expand the pens | spend money |
| Train a chimera | spend money |
| Buy someone out of the Infirmary | spend money |
| Run a job | one 15-hour job on a 22.5h cooldown |

Four of five were purchases and the fifth was a wait. **Nothing a player
could do produced a next thing to do** — and six systems were dark, because
the loop the whole game is built around (graduate a donor → splice what comes
out) is shut for the first **six to twelve hours** of every save. The starter
herd is born the moment the app first opens; nothing can graduate until it
reaches adult. That is precisely the window the player who filed this report
was living in.

So the fix is not more jobs.

### 1. The starter bear arrives grown

Its birth is **backdated**, not a free part granted, so every downstream rule
stays honest: it ages normally from there, its condition still decides the
grade it graduates at, and caring for it first still pays. The two goats stay
newborn, so the husbandry timers are still something the player learns —
there is simply one door open on day one.

### 2. Three lanes, because "one job at a time" was one rule doing three jobs

- **crewed** — one lane per creature fit to work, capped at 3.
- **solo** — you go yourself. Exactly one, always. This is what keeps a player
  with *no* chimeras able to run a job at all, which is rule 1 and predates A4.
- **paperwork** — `crew: 'none'` occupies no lane.

The first cut floored the *crewed* lane at one instead, and smoke caught that
it broke rule 1 in exactly the state this board exists for: lose a fight with
a job already out and the floor was occupied, so the thing guaranteed to be
runnable was not runnable. A job in flight also no longer hides the board —
launching one thing used to remove the only screen showing what else there was.

### 3. `ranch/agenda.js` — one definition of "what can I do"

DOM-free, so the Ranch's **Right Now** panel and the smoke suite score a save
with the same code and the criterion cannot drift away from the screen. Every
item carries a `kind`, which is the half that matters:

> **spend** — money leaves, something arrives.
> **work** — you make something: a part, an egg, a creature, a better one.
> **campaign** — you push on the world.

**Measured, criterion state: 5 open / 1 productive / 2 kinds → 6 open / 2
productive / 3 kinds.** And the thesis, demonstrated rather than asserted:
graduating the donor turns `graduate` into `splice`. A thing you can do
produces a next thing to do.

### The bug only the browser could catch

Every Right Now row pointed at a screen id **that does not exist**.
`showScreen()` silently falls back to the Ranch for anything it does not
recognise, so `war` and `splice` — which are tab *labels*, not keys; the keys
are `battle` and `theater` — rendered buttons that looked perfectly wired and
did nothing at all. Smoke now reads the real `SCREENS` map out of `main.js`
and checks every row against it, so the ids cannot drift again.

Two more the screenshot caught and no assertion would have: a solo job with
no stable rendered **"1/0 crews out"**, and the board offered **"-1 of 0 crews
free"** — the arithmetic was mixing lanes. And a long "you are already out
doing something" tag turned a job row into one word per line at 380px, which
is the R25 econ-row lesson arriving for the third time.

### Save v27

`campaign.operation` (one slot) becomes `campaign.operations` (a list). A job
in flight when the save was written keeps its clock, its sealed outcome and
its crew — verified in the browser by hand-writing a v26 save with a running
job and reloading.

### The break battery, and the hole it found

Eight mutations, then one more.

| break | caught by |
|---|---|
| starter herd back to all-newborn | the criterion — *three KINDS of thing* (`work:graduate` is gone from the list it prints) |
| the crewless job needs a crew slot again | the criterion — *three KINDS of thing* (`campaign:job` is gone) |
| an agenda row points at a screen the shell lacks | *job points at a screen the shell actually has (war not in ranch, pens, vault, theater, battle, dex)* |
| every item becomes a purchase | *three KINDS of thing* |
| concurrency reverts to one job | *three fit creatures, three crews* |
| only the first finished job resolves | *every finished job resolves* |
| the same creature in two places | *the same crew cannot go twice* |
| **the migration forgets the in-flight job** | **MISSED — the whole suite passed** |

The first two are caught by the *criterion* rather than by their own
diagnostic, because the criterion is asserted first and each break removes
the only item of its kind. That is the right outcome and the failure message
is the proof: it prints the surviving list, and exactly the item that change
is responsible for is missing from it.

The miss was real. A v27 migration that simply wrote `operations = []`
**passed everything**, because every other assertion only ever checked the
*shape* of a migrated save — that it has the right keys — and never that a
job which was in flight is still in flight. Now asserted: same op, same crew,
same clock, and the outcome sealed at launch that a reload must not reroll.
Re-broken afterwards to confirm it fires.

### Known issues

- The Path to World Domination and Right Now overlap on visit one, so Right
  Now stays folded until the Path retires. Two lists saying the same thing is
  worse than either.
- Smoke is ~3 minutes.

**Next session's first task:** A5 — no tag the region ladder depends on
should be carried by fewer parts than the ladder asks for.

## Session 44 — A3: forty animals, and Air anatomy to build them out of ✅

**Acceptance criterion:** an Air or a Water specialist is as buildable as a
Ground one, *measured as parts-per-slot per class rather than as a species
count* — **passes.**

### The pool, which is the thing that was actually broken

Class comes from anatomy, so the roster count was never the number that
mattered. Affinity-bearing parts, by slot:

| slot | ground | water | air | → | ground | water | air |
|---|---|---|---|---|---|---|---|
| head | 0 | 4 | **0** | → | 4 | 6 | 7 |
| forelimbs | 16 | 7 | 6 | → | 17 | 9 | 11 |
| hindlimbs | 20 | 9 | **0** | → | 19 | 12 | 6 |
| tail | 0 | 5 | 3 | → | 1 | 8 | 8 |
| **total** | **36** | **25** | **9** | → | **41** | **35** | **32** |

(hide and organ vote for nothing, for any class, by design)

**4.0× spread → 1.28×.** Air held nothing at all in two of the four voting
sockets, so an Air build borrowed somebody's legs and then lost the vote it
borrowed them for. Nine more birds donating nine more wings would have moved
the headline number and fixed none of that, which is why the criterion is
per-slot.

Three rules did the work, and only one of them is "new content":

- **A talon votes Air.** A raptor's foot is a grappling hook that touches the
  ground at the end of a dive; pricing it as a walking leg is why the Bat —
  wings *and* talons — read as **Unclassed**.
- **A head votes where the anatomy is class-defining.** Gills already did.
  Now a bell swims, a beak on a hollow skull flies, and a horned skull is
  something you brace and shove with. Most heads still vote nothing.
- **New families:** `paddle` and `rudder` and `drift` (water), `hindwing` and
  `streamer` (air), `stilt` and `scute` (ground).

### The Ground tag was a free x0 and every hindlimb had it

`Ground` appears in exactly one row of the tag chart — *Ground moves miss
Airborne (×0)* — and in no row where it helps. The generic hindlimb move
carried it unconditionally, so a **shark's hindfin** and an **eagle's talon**
both whiffed completely against anything with wings. It now follows the
anatomy: 28 hindlimbs carried it, 19 do.

### The generator had drifted, and running it would have reverted four phases

`data/parts.json` is emitted by `tools/gen-parts.js`. Nobody had run it since
R20, and in the meantime **78 moves and 57 abilities** had been hand-authored
straight into the JSON — R20's keywords, R23's hide and organ actives, a
hand nerf of Shark Frenzy from 64 to 50, a re-tune of Rally Howl. The first
regeneration silently reverted all of it. Two separate faults:

- The salvage loop promised to "preserve them verbatim" and then explicitly
  `delete`d `classAffinity` on the way out, so **`rotor_limbs` and
  `hydro_jets` lost their votes** on any regeneration.
- Everything else was simply absent from the generator.

Both folded back in: `KEYWORD_MOVES` (by part id — the Thunderhead's head
does *not* carry its base's Lock-On, and keying by species would have given
it one), and `HIDE_ACTIVE` / `ORGAN_ACTIVE` / `ACTIVES`, where the numbers
live once and the *kind* is chosen per species. The generator now reproduces
the committed data exactly, except the 20 changes A3 intends.

### Balance barely moved, which is the point

Region bench, 8 seeds, prime grade — before → after:

| region | boots | wings | gills | fumes | noise |
|---|---|---|---|---|---|
| greenfield | 73→73% | 83→83% | 65→68% | 57→57% | 83→83% |
| kestrel | 25→25% | **59→66%** | 97→94% | 44→50% | 72→72% |
| drowned | 88→88% | 25→25% | 56→56% | 25→25% | 63→63% |
| foundry | 28→28% | 19→19% | 13→16% | 0→0% | 19→19% |
| spire | 50→50% | 31→31% | 22→22% | 28→28% | 53→53% |

`wings` gains 7pp in the air region — it is pure Air now and its kick has
stopped whiffing. Nothing else shifts more than 3pp.

### Two assertions that were not measuring what they claimed

- **"Actives get pressed" was on a knife edge.** Three builds, needing two
  distinct archetypes, seeing exactly two — and *which* two depended on the
  seed string and on whether a build's kick happened to whiff. Untagging the
  hindlimbs moved one build off a whiff and onto its kick and the guard went
  red with nothing about the actives having changed. It now sweeps the whole
  pool at both grades: 40 species, 0.3s, a stronger guard and a stable one.
  It also surfaced a **known gap, deliberately left visible**: the AI never
  presses Slipskin, Vanish, Screen or Focus. They cost a turn of not
  attacking, and `chooseMoveIndex` values damage. That is a pricing problem
  for its own phase; the floor is set below it rather than asserted away.
- **"The part pool really is Ground-skewed"** was the *justification* for
  reading class per creature — and A3 makes it false. The rule is still
  right for a better reason (a census counts parts; what fights is
  creatures), so the guard now pins the balanced pool and the per-creature
  read separately.

And the class-triangle cases had been padding their sockets with a **goat
head**, which A3 turned into a third voter. Swapped for a bear's, with the
mute-ness asserted rather than assumed.

### Also shipped

- **Seven combos** reaching eight of the nine new animals — Full Spectrum,
  Powder Keg, Nettle Curtain, Screaming Roll, High Water Mark, Deterrent
  Display, Shell Game. Each verified to out-damage the best drawback-free
  move of its own two parts at all sixteen grade assignments (304 checks).
- The Foundry paid **no fauna at all** before this; it now unlocks the
  Screaming Armadillo and the Peregrine Falcon.
- Every new hide and organ is an active. Pufferfish "Inflate" (guard +
  thorns) and the Screaming Armadillo's "Screaming Fit" (Sonic) are
  signatures; the rest take their species' kind.

### The break battery, including the two breaks that were wrong

Twelve mutations, each run against the suite; every A3 assertion fails when
the thing it guards is broken.

| break | caught by |
|---|---|
| ground loses its only tail | rule 1 — *ground has no tail anywhere in the game* |
| talons vote Ground again | rule 2 — *air hindlimbs is 1 part(s)* |
| water pool thinned past 1.5× | rule 3 — *the class pools are within a half of each other* |
| every air vote flipped to ground | rule 1 — *air has no head anywhere in the game* |
| all air anatomy from one donor | rule 4 — *air can be built from at least three donors* |
| goose unreachable | rule 5 — *goose is unlocked by conquering something* |
| Ground tag back on every kick | rule 6 — *crocodile_hindlimbs swings a Ground move but its anatomy votes water* |
| horned heads stop voting | rule 1 — *ground has no head anywhere in the game* |
| one animal goes missing | the count — *forty animals (39)* |
| one combo disappears | `gradeAssignmentsChecked` |
| a combo priced below its own parts | *high_water_mark … is 10 power but a drawback-free move of its own parts is 58* |
| every hide active priced out | caught **elsewhere** — by R23's own win-rate guard directly above it, which is the stronger assertion and fires first |

Three of those took two attempts, and the reasons are worth keeping:

- **Two breaks were the wrong size.** Dropping paddle/rudder/drift left Water
  at 30 against Ground's 41 — a 1.37× spread, *inside* the 1.5× the gate
  allows. Stripping Water entirely then tripped rule 1 before rule 3 could
  speak. Only trimming each Water slot to exactly five isolates rule 3.
- **One break was masked by a crash.** Deleting the armadillo left the
  `screaming_roll` combo pointing at a part that no longer existed, so the
  suite died on a `TypeError` long before the count assertion — and a harness
  that greps for `AssertionError` reported that as a *pass*.
- So the last five run through a probe that lifts the A3 block's **actual
  source out of `smoke.js`** and executes it against mutated content, rather
  than a re-implementation that could drift. It carries a control on
  unmutated content — which is what caught the probe's own first version
  being broken (a relative import resolving from the wrong directory), a
  failure that would otherwise have read as five clean catches.

### Two self-inflicted process faults, recorded because they nearly shipped

- The break scripts chained themselves with `while pgrep -f "a3-breaks.sh"`,
  which **matches the waiting process's own command line** — both waiters
  deadlocked on themselves. One survivor then mutated `species.json`,
  `combos.json` and `smoke.js` in the window between my verifying the tree
  and committing it, so the first push was missing the armadillo. Caught by
  re-diffing against the backup afterwards; amended.
- `tools/gen-parts.js` built its `_doc` by appending to whatever the previous
  run left behind, so the Wave 1 paragraph had accumulated **twenty-one
  copies**. Now built from a canonical base and verified idempotent across
  two consecutive runs.

### Known issues

- Smoke is now ~3 minutes, up from ~80 seconds: several sweeps are
  per-species and the roster grew 29%.
- The four evasion/accuracy actives are still never pressed by the AI.
- Ground has exactly **one** affinity-bearing tail (the armadillo's scute).
  Every class has *something* in every voting slot, but ground's identity is
  still its limbs.

**Next session's first task:** A4 — a player who opens the game with money,
a stable and a lost fight should have three distinct things they can do
right now.

## Session 43 — A1/A2: the solo cliff, and the dead end under it ✅

**Acceptance criterion:** the ladder is beatable at every team size the game
will let a player field, *or the game refuses to send them into a fight it
knows they cannot win* — **passes** on the second clause, asserted over
every node of the first region at all three team sizes: **every true 0% is
called unwinnable, and no fight at 40% or better ever is.**

### The cause was structural, and that decided the fix

| team | Old Barn | Downtown | Checkpoint | Precinct | Guard Post |
|---|---|---|---|---|---|
| **1** | 100% | **0%** | **0%** | 0% | 0% |
| 3 | 100% | **79%** | 100% | 0% | 0% |

Combat is one active per side over a queue, so three enemy bodies means
grinding three health bars down with one of your own. The diagnosis that
mattered:

- `patrol_2` at **tier-1 stats with three waves**: still **0%**
- `patrol_2` at **full tier-2 stats with two waves**: **28%**

**Bodies, not numbers.** No stat pass moves it. I modelled a garrison that
scales to the force you bring and **rejected it on the measurement**: it put
node 2 at 25% solo but 22% at two, so growing your stable made the fight
*harder*, and it quietly removed the reason to keep a stable at all.

### So the game says so

`battle/forecast.js` runs the actual fight on the briefing screen — real
engine, real AI on both sides, 32 replays, ~8ms — and reports a band. It
refuses nothing; the launch button just stops looking like the recommended
action and reads **"Launch anyway"**.

**`runs = 32` is load-bearing.** At 7, a matchup that is truly ~45% read
0%, 57%, 14%, 43% and 29% across five base seeds — the *verdict* was being
decided by sampling noise. A forecast that calls a coin-flip "not
survivable" costs a player a fight they would have won, so the walk-away
verdict is the one that must never be wrong in that direction.

And the Path to World Domination, which retired **one node before the
wall**, now walks to a stable of three — the number the harness has fought
at since M4.5, said out loud for the first time. The starter herd is exactly
three animals, so the answer was always already in the pens.

### A2 — the dead end

Before: lose node 2 with your only creature and it was captured, roster
empty, vault empty (those parts went into the creature that was just taken),
and the rescue raid needed a team you no longer had. Nine-hour window, no
door.

Now the last one on a roster drags itself home instead. Verified in the
browser, not just the harness — lost the fight, and:

> *Gerald is the last one on the roster, and the coalition could not quite
> hold on to it. It limped back through the fence at dawn, furious and
> filthy. Infirmary.*

Roster 1, captives 0. A capture with a spare at home still works exactly as
it did — asserted both ways, because the mechanic is good and only its edge
was broken.

### Two of my own assertions were weak, and the battery found them

- **The determinism test used a 0% matchup.** Swapping the seeded runs for
  `Math.random()` changed nothing, because 0% is 0% however you roll it. It
  runs against a ~45% fixture now, and asserts the fixture *has* variance so
  it can never go blind again.
- **The "never calls a winnable fight unwinnable" mutation was too weak** to
  trip its own assertion. The assertion was right; the break was not.

Also caught: two mutations in the battery silently no-op'd on a quote
mismatch and were reported as passes. Re-run with the real anchors, both
caught.

### Guards, each verified to fail when broken

Ten: every fight called unwinnable · an unwinnable fight called winnable ·
the forecast sampled too thin · the forecast rerolling per render · the
outnumbered count dropped · the last chimera taken again · captures stopping
entirely · the Path dropping the stable step · the Path retiring at the
first conquest · the stable field note removed.

### Known issues

- The A1 fix is informational, not a rebalance. Node 2 is still 0% solo —
  the game now says so before you commit, and A2 means finding out cannot
  cost you the run. If playtesting says that is still too blunt a wall,
  the lever is content (A3's air and water species) rather than stats.
- The forecast costs ~8ms per briefing render, recomputed on every team
  toggle. Fine at 380px; worth watching if the team cap ever grows.

### Next session — first task

**A3** — nine new species to 40 animals, weighted 5 air / 3 water / 1
ground. It is the largest remaining item and it is the lever that would let
a smaller stable clear the early ladder on anatomy rather than bodies.

## Session 42 — Second audit (A1–A10) 🔍

No code shipped. Ten queue items, each with the evidence that put it there.

### The player report was not a difficulty complaint

*"I have 1 chimera and keep failing the 1 mission I can do."* Measured, on a
standard-grade purebred against the Greenfield ladder:

| team | Old Barn | Downtown | Checkpoint | Precinct | Guard Post |
|---|---|---|---|---|---|
| **1** | 97% | **0%** | **0%** | 0% | 0% |
| 2 | 100% | 9% | 50% | 0% | 0% |
| **3** | 100% | **69%** | 97% | 0% | 0% |

The second node is not hard with one chimera. It is **arithmetically
impossible**, and it is a comfortable fight with three. Every balance number
in the ROADMAP was measured at `teamSize 3` — M4.5 established that tuning
against a lone chimera measures the wrong game, which was true, and quietly
became the reason nobody ever looked at what a solo player faces.

The Path to World Domination retires at "Conquer the Old Barn Perimeter" —
**one node before the wall** — and nothing anywhere says the answer is a
second creature.

And the failure mode underneath it is worse. Verified end to end: lose that
node with your only chimera and it is captured, the roster is empty, the
vault is empty because you spent those parts splicing it, and **the rescue
raid requires a team you no longer have**. Nine-hour timer, no door.

### Two things checked and found innocent

- **Jobs do award animals** — 40–60% on a success, 29% per attempt overall
  on the good ones. The report of never getting one was bad luck, not a
  bug. What is true is that the rate is nowhere visible.
- **Obedience is not broken.** My first measurement showed bond 0 and bond
  100 producing identical results, which looked like a dead mechanic. It is
  not: a *settled purebred* ignores 0% of orders either way, so the fixture
  could not see it. An unsettled mixed build ignores 45%.

### The roster, counted

| | ground | water | air |
|---|---|---|---|
| buyable species | 15 | 7 | **3** |
| class-affinity parts | 36 | 25 | **9** |

Air's nine parts are six forelimbs and three tails. There is **no** air
affinity on any head, hindlimb, hide or organ in the game, so an Air chimera
can carry at most two air parts and must dilute itself with somebody else's
legs. That is why R26's `wings` archetype needed hand-construction.

Related: **29 of 46 tagged moves are Ground**; every other tag has 3–5. R26
built five regions on that chart, and R25 had to invent `foghorn_array`
mid-phase because the armour-piercing answer to the Foundry did not exist in
the buyable pool.

And **24 of 190 parts appear in a combo**. Eleven species have none at all,
including all six chaos variants — the rarest things the game produces have
nothing to discover.

### The queue

| | item |
|---|---|
| **A1** | The solo cliff — the ladder is tuned for three and the game gives you one |
| **A2** | Never stranded at zero chimeras |
| **A3** | Nine new species to 40 animals, weighted 5 air / 3 water / 1 ground |
| **A4** | More to do per visit — one job at a time on 4.5–22.5h cooldowns |
| **A5** | Parts for the tag chart |
| **A6** | Combos for the other 87% |
| **A7** | Obedience on the briefing screen |
| **A8** | The harness must measure a solo player |
| **A9** | A fourth frame |
| **A10** | Timer-cut stragglers (`injuryHours [2,5]` missed R24's cut) |

### Next session — first task

**A1**, and A2 belongs in the same phase: they are one experience. Fixing the
curve without closing the dead end just means losing more slowly.

## Session 41 — R27: a rival who has beaten you twice has read you ✅

**Acceptance criterion:** a rival you have beaten twice fields something
built to answer your actual stable — **passes**, and measured in a way that
cannot be fooled by the difficulty ramp.

**This closes the audited queue: R20–R29, all ten shipped.**

### The wrong source

A rival used to counter you by asking the AI director what class you
favoured. That is the wrong source, and it is the reason this line was on
the queue at all: the director reads your **whole stable, continuously**,
from usage banked since M0 — it is the world noticing you. A rival is one
person in one building who has only ever seen what walked through their
door.

Each rival now keeps their own file, written by duels against them and by
nothing else. Two rivals who met you at different times hold different
reads. Owning an Air stable tells a rival nothing until you bring it through
their door, and what one rival learns is filed in one lab.

They record what was **deployed**, not what is owned — a stable of five
where you only ever send the same one is a stable a rival knows a fifth of.
And the file is written on every duel including the ones they win, because
losing to a stable is the best possible reason to study it.

### The ladder

| defeats | what they field |
|---|---|
| 0 | the build they publish |
| 1 | one specimen answers your class — only `counterBias` rivals react this early |
| **2** | **the counter moves to their lead, and they pick anatomy that blunts your most-used move tag** |
| 3+ | they field one of your own signature parts back at you |

The anatomy table is data, keyed on the tag you actually swing, and the
reasons are the real chart: Ground misses Airborne outright, Electric
doubles on Aquatic, Sonic ignores Armor so plate bought against it was
money wasted.

### Measuring it, without being fooled by the ramp

The trap is obvious once you look for it: a rival at two defeats is **also**
stronger and better graded, so *"the rematch got harder"* proves nothing at
all. So the instrument holds the escalation fixed and varies only the file —
two copies of the same rival, both beaten exactly twice, both at identical
power and grade, one having spent those duels watching the archetype that
beats them and one watching something else entirely.

| rival | the anatomy that beats them | vs the rival that studied someone else | vs the rival that studied **it** | penalty |
|---|---|---|---|---|
| Dr. Mantissa | wings | 68% | 47% | **26pp** |
| Baroness Aloft | gills | 97% | 57% | **40pp** |
| Prof. Trench | boots | 50% | 4% | **40pp** |

Averaged over six world seeds — a rival's team is re-rolled per defeat
count, so a single seed swings 0–75pp while the mean is steady. And the
rematch is hard because they **learned** you, not because the numbers went
up: across the ladder the counter costs **35pp** against the ramp's 15pp.

### The defect the measurement exposed

Building the instrument immediately showed that the old escalation — a grade
step every second defeat on top of a 9%-per-defeat power climb — turned the
first real rematch into **a door rather than a rung**. The anatomy that
cleared a rival at 92–100% cleared the same rival at 0–8% two defeats later,
which is not a ladder. Softened to a step every third defeat at 5%, so the
thing that makes a rematch hard is the counter rather than the ramp.

A second, smaller one: the counter only led the team when there was a class
to counter, so an **unclassed** stable — the hardest kind to read — quietly
made rivals stop reacting. The lead is decided by the tier now.

### Guards, each verified to fail when broken

Eleven, and one of them only exists because the battery found the hole:
every assertion tested `scoutStable` **directly**, so removing the call in
`resolveBattle` changed nothing and the suite stayed green. That is exactly
the line a refactor drops silently, and it now has an end-to-end assertion
that resolves a real duel and checks the file was written.

| break | caught by |
|---|---|
| rivals stop countering entirely | the counter-class assertion |
| the anatomy counter is ignored | the mirror is really on the field |
| the counter never reaches the lead | two defeats puts it in front |
| a rival reads the whole stable again | a chimera left at home was never seen |
| the file is shared between rivals | a read is personal, not a broadcast |
| duels stop being recorded | *(the end-to-end assertion above)* |
| the tutorial rival reacts too early | Mantissa lets the first rematch go |
| the escalation goes back to a wall | the criterion's own margin collapses |
| the mirror tier never fires | four defeats and they take your anatomy |
| the v26 migration invents observations | a rival beaten five times has still never watched you |

### Known issues

- Per-seed variance on the counter is wide (0–75pp), so the gate averages
  over six world seeds. Within one save it is deterministic, so this is
  world-to-world variety rather than noise the player can feel.
- `fumes` and `noise` lose to every rival at every tier, so their rows in
  the bench measure nothing. They are still worth running: an archetype that
  cannot win is exactly where a counter would be invisible.

### Next session — first task

The audited queue is empty. The honest next move is **another full audit of
the shipped code** in the shape that produced R20–R29 — three of those ten
turned out to have the wrong headline once someone looked, and there are now
five regions, six facility tracks, an upkeep economy, 22 field guides and a
rival scouting system that have never been audited by anybody.

## Session 40 — R29: every system gets one note, and the long screens fold ✅

**Acceptance criterion:** every shipped system has a first-use guide derived
from state, and none fires before its system is reachable — **passes**,
checked by walking one save forward through **eighteen milestones** and
asserting at each that the notes it lights are exactly the ones that
milestone makes real, and that none of them was live a step earlier.

### 22 field guides, all derived, none persisted

Onboarding shipped in M7 as a five-step Path ending at the first conquest.
Eight more systems shipped behind it — breeding, the chaos vat,
rehabilitation, the jobs board, contestation, scars, temperament, the Dex —
and then R25 and R26 added five regions, six facility tracks and an upkeep
economy. None of it was mentioned anywhere.

| screen | notes |
|---|---|
| Ranch | breeding · incubator · genes · pairing · facility · upkeep · catalogue |
| Pens | temperament · bond · infirmary · scars |
| Splice | combos · chaos vat |
| War Room | jobs · containment · rehab · rivals · rescue · contest · regions · director |
| Dex | the Dex itself |

A guide carries two condition lists — `reachable` (does this system exist
for this player) and `done` (have they used it) — and shows only when
reachable **and** not done. That makes *"none fires before its system is
reachable"* a property of the **data** rather than a rule someone has to
remember. Conditions are either a dotted save path with a minimum (counted
by array length, key count or value) or, for the dozen needing real
derivation, a named helper. The helper registry is the engine's own
knowledge of its systems, so a note for something it can already see is a
pure data edit.

Two smaller rules earn their keep. **One note per screen**, lowest order
first — a wall of tips is wallpaper. And **the Path owns the screen until
the first conquest**, because two tutorials at once is one tutorial too
many.

### Fold-away cards

R25 and R26 had made two screens very long: six facility tracks and five
region strips in one column. Both fold now, and the state lives in the save
so a fold survives the reload the Definition of Done requires.

Each card picks its own default and a player's choice always overrides it:

- **Facility** starts shut behind a one-line summary of what is worth
  opening it for — *"4 ready to buy · 5 upgrades left, from $700."*
- **The War Room** opens the strip you are actually fighting in and shuts
  the ones you have finished or cannot reach. Greenfield collapses to
  *"Held end to end"*; the locked regions keep their price of entry visible.

The War Room went from a 3,280px scroll to 2,826px with more structure, not
less.

### Two assertions that passed while the thing they guarded was broken

The break battery is the only reason these were found, and both failed the
same way — **the assertion derived its expectation from the thing under
test**:

- *"The Path owns the screen"* was checked against a **fresh** save, which
  has nothing ready anyway. Deleting the suppression changed nothing, so
  the test passed. It now runs against a save with a settled chimera, a
  laid egg and no conquest — several notes genuinely live underneath.
- *"A screen shows the lowest-order note"* compared `guideForScreen` to the
  first entry of `guideStates`, which sorts with the same comparator.
  Reversing the sort flipped both and the assertion held. The expected note
  is computed from the authored `order` in the content file now.

### Guards, each verified to fail when broken

| break | caught by |
|---|---|
| a guide fires from turn one | the milestone walk |
| a shipped system loses its note | the coverage roll |
| a guide has no way to be finished | it would nag forever |
| a guide points at a screen that does not exist | screen validity |
| the Path stops owning the screen | *(after the fix above)* |
| a screen shows the wrong note first | *(after the fix above)* |
| dismissing a note does nothing | dismissal sticks |
| a stored fold state is ignored | a stored value always wins |
| the v25 migration forgets the fold record | migrated saves get an empty record |
| two guides share an order | the queue is deterministic |

### Known issues

- The coverage roll (`SHIPPED_SYSTEMS`) is a hand-maintained literal. That
  is deliberate — it forces a future phase to come and say it shipped
  something — but it is the one part of this that can rot silently if
  somebody edits it instead of adding a note.
- Save **v25**: `guidesSeen` and `ui.collapsed`, plus the four R25 facility
  tracks named explicitly in `newGameState` (they already read as level 1;
  a save listing two of six just looked half-configured).

### Next session — first task

R27 (rival geneticists as a ladder) is the last of the audited queue: three
rivals that counter-bias through their own path rather than the director's
banked usage data. *Done when: a rival you have beaten twice fields
something built to answer your actual stable.*

## Session 39 — R25: four more tracks to buy, and a stable that costs money to keep ✅

**Acceptance criterion:** money has a second sink that changes the loop, and
each track pays back measurably — **passes**, measured by `facilityPayback`
running the game's own breeding rule, grade thresholds and clocks.

| track | what it buys | measured payback |
|---|---|---|
| **Incubator** | 3 → 8 bays, half the incubation, and a mutation rate | **8.0 → 15.2** mutations per 100 eggs |
| **Extractor** | a cleaner draw | prime+ **50% → 72%**, apex+ **4% → 13%** |
| **Gene Scanner** | what an animal carries, then what a pairing will produce | **111–400 → 5–8** pairings to fix a recessive |
| **Infirmary** | time and certainty | **3.0h → 1.35h** downtime, scars 34% → 20%, treatment at 60% |

The facility went from **$3,400 to $24,000** of purchasable depth. One of the
four was a promise the game was already making out loud: the pens have
printed `Genes: ????? (Gene Scanner required)` since M6, advertising a
machine nobody had built.

### The other half: a stable is no longer free to own

R26 made this urgent rather than optional — full conquest paid **$2,385/day**
into a game whose priciest animal costs $260. Chimeras cost **nothing** to
keep until now, which made territory income a score rather than a budget:
the only question money ever asked was how long you were willing to wait.

A chimera is billed for the chassis it rides, the grade of every part bolted
to it, the power those parts draw, and its instability — four terms, all read
off data the genome already carries, so a new part, grade or frame is priced
the moment it is authored.

| | standard | prime | apex | prismatic |
|---|---|---|---|---|
| upkeep/day | **$21** | $46 | $88 | **$147** |

The spread is steep on purpose and the flat terms small, so the treadmill
bites at the top and not at the bottom:

| stage | income | upkeep | net |
|---|---|---|---|
| opening, one standard chimera | $40 | $35 | **+$5/day** |
| Greenfield held, three primes | $345 | $159 | +$186/day |
| four regions, six apex Rumblers | $1,665 | $603 | +$1,062/day |
| full map, eight prismatic Rumblers | $2,425 | $1,280 | **+$1,145/day** |

Upkeep at full conquest is **53% of income**. You cannot simply stockpile any
more, which is the point.

### Two things measurement caught that assumption would not have

- **Incubator bays are not the bottleneck — pen capacity is.** 3 → 8 bays
  changes nothing on its own: you can queue eight eggs and still only keep
  four animals. The track had to buy something that changes the loop, so it
  buys a **mutation rate** — which is where variants and the mutation-only
  genes enter the game at all (R24).
- **The Gene Scanner was about to sell something free.** Its top tier was
  going to unlock a graduation forecast that has been on the pens screen
  since M2. It sells the thing still genuinely hidden instead: the Punnett
  odds for a *pairing*, carrier against expresses, computed in closed form
  from the same rule `expressedTraits` applies. Two heterozygotes read
  75%/75% dominant and 75%/25% recessive — textbook, and asserted as such.

### The floor held, but only just

The onboarding path is care → extract → splice → battle → conquer, so a
player reaches their first chimera having conquered **nothing**. The first
draft priced that creature at $54/day against a $40 stipend — the guided
first loop walking a new player straight into insolvency. The fixture that
caught it was also wrong in the other direction: building a chimera
*consumes* an animal, so the herd shrinks as the creature arrives. Both
fixed; the assertion now models the real path and passes at $36 against $40.

Funds still floor at zero and nothing is ever repossessed — a player away for
a fortnight comes back to a poor lab, not a ruined one. Asserted over thirty
simulated days of absence with four prismatic Rumblers eating.

### Guards, each verified to fail when broken

Eleven new assertions, every one confirmed against a deliberate break:

| break | caught by |
|---|---|
| the Extractor stops improving grades | each tier grades better |
| the Incubator stops changing what hatches | mutations per 100 eggs |
| the Infirmary stops shortening convalescence | downtime hours |
| the Infirmary gives certainty away free | scar chance is never zero |
| upkeep stops caring about grade | upkeep climbs with grade |
| a first chimera is priced out of the stipend | the R11 floor |
| `applyElapsed` stops charging for chimeras | a day of upkeep leaves the account |
| the funds floor is removed | absence empties and stops |
| the forecast forgets recessives need two copies | a recessive needs both copies |
| a facility level 1 starts charging rent | level 1 is free |
| a track gates on a node that does not exist | facility gates reference real nodes |

### Known issues

- **The econ row is five cells in a two-column grid**, so Pens sits alone on
  a third row. Legible, slightly ragged.
- The smoke suite is ≈80s. The R25 bench adds ~2s; the rest is R26's
  encounter set.
- No save migration was needed — every new value is derived, nothing new is
  persisted — so `SAVE_VERSION` stays at 24. The service-worker cache name
  still had to change, or a returning player keeps the old shell.

### Next session — first task

R27 (rival geneticists as a ladder) or R29 (onboarding for the eight
unguided systems). R29 is the stronger case now: R25 and R26 between them
added five regions, six facility tracks and an upkeep economy, none of which
the guided first loop mentions.

## Session 38 — R26: five regions, and a ladder that asks five questions ✅

**Acceptance criterion:** taking Greenfield opens a region whose fights need
different anatomy than the one that won the first — **passes**, measured
rather than asserted by hand: in every later region a build that cleared
Greenfield falls **32–67pp**, stable across seven independent base seeds.

### The map

| | Greenfield County | Kestrel Reach | The Drowned Quarter | The Foundry Belt | The Compliance Spire |
|---|---|---|---|---|---|
| identity | Ground, Organic | Airborne, Air class | Aquatic, Water class | Vehicle + Armored, all three classes | all three classes, no plating theme |
| answers to | Air | **Water** | **Ground** | **armour-piercing** | nothing in particular |
| bench champion (apex) | — | gills 100% | boots 100% | noise 75% | flat, top 58–66% |

Five strips, 21 nodes, 24 encounters, 40 units, a Threat Generation ladder
that reaches 3, and five new enemy-tech parts — one dropped by each region.

### The engine was the blocker, not the content

`regionOf(content)` returned `regions[0]` and four systems reached past it.
Contestation picked its defence target, its node names and the defending
encounter from the first county alone, so a counter-offensive could never
have landed anywhere else — the very system §8 names as the endless-mode
content engine stopped working at the county line. Gating, lookups and the
Threat ladder now live in one pure module, `campaign/map.js`, shared by
contest.js, the director and the War Room.

Two things the phase description never mentioned turned out to be
load-bearing:

- **The AI director's reach** is "the hardest encounters, up to a budget."
  That is a fine definition of where the world adapts with one county;
  across five it spent the entire budget rewriting the Compliance Spire
  while the player was still arguing with a parking warden in Greenfield.
  Scoped to open regions.
- **Redistributing fauna is the one content edit that can rob a live save.**
  A player holding the Guard Post owned nine species that moved three
  regions out. Save **v24** grants them permanently (`faunaGranted`), so the
  catalog can only ever grow — and any future reshuffle is safe for the same
  reason. Verified in the browser on a rolled-back v23 save: all 23 species
  survive, no console errors.

### Four attempts at the rotation, and what each one got wrong

1. **Draft one handed every later region to the same anatomy that won
   Greenfield.** The Foundry because half its units swung **Ground-tagged**
   moves, which miss an Airborne build outright — so "fly" was still the
   answer three regions later. A tipper, a wrench and a ladle were never
   ground attacks anyway.
2. **Draft two made it class-mixed and turned it into a wall** — nothing
   cleared it above 19%. A region everything loses measures as little as a
   region everything wins.
3. **Draft three found the cause**: the new units had been authored at boss
   scale and then tier-multiplied on top. A tier-6 hauler came out at 253 HP
   behind 41 armour. They sit in the shipped roster's band now, and the tier
   ladder does the escalating; the Foundry's identity survives as armour
   *relative to its peers*, not as a big number.
4. **Armour-piercing had to become earnable BEFORE the region that demands
   it**, or the demand is a wall with the key inside. Hence `foghorn_array`,
   salvaged from the Drowned Quarter's flagship — and priced twice, because
   at 44 power the pilot never pressed it over a 70-power forelimb.

A mixed strip is intrinsically the harder fight at equal tier, because a
mono-class strip hands the right anatomy a free ×1.5 that a mixed one cannot.
The tier ladder compensates: the Drowned Quarter firmed up, the Foundry and
the Spire stepped down.

### Two bugs the new content exposed in old code

- **`sampleBuilds` built impossible chimeras.** It made a "purebred" from
  every part of a species, which was a no-op while every species carried
  exactly one part per socket. Enemy tech is a catch-all, and R26 grew it to
  three organs and two hides — so the harness assembled an eight-socket
  creature the game cannot offer, and that creature promptly flagged as the
  most degenerate build in the pool. A yardstick has to measure builds a
  player could hold.
- **The War Room's headline row collided with itself.** At full conquest it
  reads `+$2385/day` beside `128W–12L`, and at 380px those two overlapped
  mid-glyph — while every measurement in the suite reported four cells of
  equal height, because overflowing text does not change a box. Two columns
  on phone widths, and the breakpoint is now pinned in smoke.

### What did not work

`seedsPer 4` on the balance gate. R26 tripled the encounter set and with it
that gate's runtime, so 4 was tried again on the theory that three times the
encounters buys back half the seeds. It does not: the detector is
peer-*relative*, and thinning the sample fattens both tails, so 4 immediately
flagged a build that 8 and 12 both call clean. The suite is slower than it
was (≈75s). That is the price of a bigger world, and it is cheaper than a
gate that lies.

### Guards, each verified to fail when broken

Eleven new assertions, every one confirmed by deliberately breaking the thing
it guards:

| break | caught by |
|---|---|
| Kestrel stops being an air region | the anatomy-drop gate (drop falls to 20pp) |
| the air fauna moves past Greenfield's boss | the playability guarantee |
| a region requires a node from a *later* region | ladder reachability |
| Threat Gen 3 removed | the ladder has three rungs |
| a Gen-3 node placed before the map banks 320 | the gen-gate reachability walk |
| two nodes share one encounter | encounter ownership |
| the Foundry unlocks nothing new to build | Law 2 |
| the Spire becomes solvable by one anatomy | the finale's flatness bar |
| a region gets no boss | strip structure |
| the migration stops grandfathering | a migrated save keeps what it earned |
| the econ breakpoint drifts back to 360px | the CSS breakpoint pin |

### Known issues

- **Income outruns its sinks.** Full conquest pays **$2,385/day** against a
  catalog whose priciest animal is $260. R25 (facility depth) is the second
  money sink and is now overdue rather than optional.
- **Contestation still starts at Gen 2 and caps at one concurrent
  offensive.** Across 21 held nodes that is a very quiet map. Tuning only —
  no engine work — but it wants a pass.
- The smoke suite takes ≈75s, up from ≈35s, almost entirely in the
  all-grade balance gate now that there are 24 encounters to sample.

### Next session — first task

R25 (facility depth): the economy now generates far more money than it has
anywhere to go, and R26 made that acute rather than theoretical. R27 and R29
are the rest of the queue.

## Session 37 — R24: mutation traits, and every timer cut by a quarter ✅

**Acceptance criterion:** two equally-starred parents can produce visibly
different offspring, and the difference shows in a fight — **passes**: on a
contested matchup the twelve genes range from **−8pp to +24pp**.

### Every real-world clock is 25% shorter

Applied across the board, data and the code defaults that mirror it: care and
training cooldowns 20h → 15h, settling 30min → 22.5min, incubation (goat
30 → 22min), the seven jobs and their cooldowns, chaos gestation, rehab
programmes, contest windows 18h → 13.5h, the rescue window 12–24h → 9–18h,
heat half-life, infirmary. One `facility.json` block hid its hours under
`tracks[].tuning` and was missed by the first pass — caught by checking the
output rather than trusting the script.

The smoke banner moved on its own as a result: `care 97 → 99` and grades
`standard/prime → standard/apex`, because more care now fits the same window
and better condition means a better extraction. The cut is doing what it was
asked to.

### The gene pool

The allele machinery has been generic since M6 — dominant/recessive, Mendel
inheritance, extraction stamping tokens by slot — and **exactly one trait
used it**. Twelve now, each with a real trade-off:

| | |
|---|---|
| circulating (7) | Dense Bones, Hollow Bones, Deep Lungs, Thick Hide, Hyperthyroid, Second Wind, Glass Jaw |
| mutation-only (5) | Venom Gland, Barbed Skin, Keen Eye, Clotting Factor, Pack Instinct |

Two things were quietly wrong underneath, and neither was in the phase's
description:

- **Traits could only arrive by mutation.** Mail-order stock is gene-plain,
  so with twelve genes each would surface about once in two hundred eggs and
  the Splice-Dex would read `???` forever. `wildChance` puts seven into
  ordinary stock: you can find a carrier, pair carriers, and breed a
  recessive up — which is the Mendel machinery finally being worth having.
  Measured at 36–59 carriers per 400 head.
- **The harness never loaded `traits.json`.** `tools/sim.js` has been blind
  to genes for four sessions, so every measurement would have quietly
  compared a build against itself. Smoke now asserts the harness loads the
  same gene pool the game does.

`moveKeywords` lets a gene change what a part *does* — a Venom Gland that
actually envenoms is a different creature from +3 Armor with a different
name. Merged **under** the part's own keywords, so a gene never overwrites
what a part already did.

### One gene was a trap, and the fix was R23's lesson again
`Clotting Factor` rode a `regen` keyword onto an organ move and measured
**−26pp** on a contested fight — negative in every matchup tested. Two
re-prices changed nothing, because the keyword was pressed once per fight
either way; the cost was the turn, not the number. A gene that is a trap
everywhere is not a trade-off, so it pays in durability instead: **−26pp →
+24pp**.

### Known issues
- `Hollow Bones` sits at −8pp on the one contested bench used here. It is a
  speed-for-HP trade and should win elsewhere, but that is asserted nowhere.
- Trait effects are still measured one gene at a time; nothing checks a
  *combination*, and stacking two on one chimera is legal.
- No save-schema change — `genotype` already existed and gains only entries.
  `SAVE_VERSION` stays **23**.

### Next session — first task
R26 (a second region) is the largest remaining content gap; R25, R27 and R29
are the rest of the queue.

## Session 36 — R23: active hides and organs ✅

**Acceptance criterion:** a hide and an organ each change how a fight is
played — **passes**: an armoured build wins **37% without** its hide and
organ actives and **99% with** them.

### The premise held this time

Checked first, after two phases of over-claiming. Every hide was a passive
stat stick — **0 of 32** carried a move — and most organs were too. And the
passive parts were **not** compensated with better stats (21.3 total against
22.1 for the active ones), so this was an omission, not a designed
trade-off.

All 64 sockets now carry an active, from one priced vocabulary keyed off tags
the parts already had, so a species added later inherits one for free and
re-tuning is one edit rather than fifty-six.

### Pricing them took three passes, and two were wrong

1. **First pass: pressed, and a trap.** The actives were used constantly and
   cost **−10.8pp** on contested fights — some cells −33pp. A turn not
   attacking is worth about fifty damage, and the effects returned far less,
   so the AI was talking builds into losing trades. *Pressed is not the same
   as useful.*
2. **`guard` is structurally wrong for a hide.** It lasts only until your
   next action, and `performMove` clears it at the start of that action — so
   it never reads as already-up. The AI guarded **386 times across 60 fights
   and lost every one**. Hide actives have to **persist** to be worth a turn,
   so the fifteen guard hides became thorns.
3. **Then price them to be worth the turn** (thorns 0.25 → 0.45, heal → 0.30,
   regen → 0.09): −10.8pp became **+2.0pp**.
4. **Then scale the investment to its payoff window.** Thorns, evasion and
   regen pay out over the turns still to come, so a creature with three turns
   left should not buy a five-turn return. That was the difference between a
   tortoise (+62pp) and an eagle (−18pp) — the fragile build was being talked
   into spending turns it did not have. `+2.0pp` became **+6.1pp**, and the
   eagle cells went from −18/−12 to 0/+5.

### The part only a screenshot could find

Everything above passed, and the player still could not see any of it. Six
moves, four buttons, and the UI showed the first three **in socket order** —
head, forelimbs, hindlimbs, tail, hide, organ. The two sockets this phase
existed to activate are the exact two that fall off the end.

The buttons now show the hardest swings plus **one utility, ranked by what it
is worth right now** — so the plating surfaces when something is hitting hard
and a heal surfaces when you are hurt, instead of the tail winning the slot
every time by being socket three.

### Balance
0 `[OP]` and 0 `[TRASH]` at all four grades, headroom **+8.8 to +14.8pp** —
the best the table has been. Difficulty stable (38/48/58/70), and class
spread improved again at every grade.

### Known issues
- Only one utility slot exists on the main row, so on a six-part build the
  organ active still sits behind "more". Correct given four buttons, but the
  organ is the quieter half of this phase.
- Archetype use is very uneven — Bristles 511 presses across a full sweep,
  Leech and Focus 2 each. None is decoration, but some are much more niche
  than others.
- No save-schema change: parts are content. `SAVE_VERSION` stays **23**.

### Next session — first task
R26 (a second region) is the largest remaining content gap; R24, R25, R27 and
R29 are the rest of the queue.

## Session 35 — R28: battle readability ✅

**Acceptance criterion:** a new player can predict super-effective before
pressing, at 380px — **passes** (verified on screen, not just in the DOM).

### The audit over-claimed, again

R28 was queued as *"`turnForecast` returns speed and nothing else… the player
gets no pre-commit signal"*. Half wrong. `turnForecast` does only return
speed, but the battle UI never used it for that — it already drew **class
chips on both fighters** and an effectiveness multiplier chip.

That is two phases running (R21, R28) where the audit claimed more than the
code deserved. The pattern is the same both times: I read one symbol, found
nothing, and wrote down "missing" instead of "not here". Naming it because it
is cheap to keep doing.

### What was actually wrong: the number was a lie

The button printed `move.power` — the raw data value. That is not what lands.
Armor, power stages, scars, perks, guard, Frenzy, Rage and Multi-Hit all sit
between the two. **A 52-power swing into 22 armor is not a 52**, and R22 had
already built `previewMove` to compute the honest figure for the AI. The
player was reading a different board from the opposition.

`battle/readout.js` is DOM-free on purpose — the numbers are what the
criterion is about, so smoke tests them directly instead of scraping HTML:

> **Eagle Bite ✓** · ~84 (95%) · 22⚡ · `Air ▸`

- **Expected damage**, not listed power, with the chance to land beside it.
- **A finisher mark** when the swing should end it.
- **Class and tag split apart.** The old chip multiplied them together and
  printed one number, so "×1.5" never said whether it was the triangle or the
  chart — which is the half a new player is trying to learn.
- Immunity reads as *no effect*, never as a small number.

### Two things only the screenshot caught

Both passed every assertion I had written, which is the point of looking:

1. **`~8495%`.** Damage and accuracy ran together into a third number. My
   regex `/~\d+/` matched it perfectly happily. Now `~84 (95%)`, and smoke
   fails on a four-digit run-together.
2. **The finisher mark was a red ✕**, which conventionally reads as
   *unavailable* — the exact opposite of "this one closes it". Now a green
   ✓, and the tooltip says *graduate* rather than anything the tone rules ban.

### Known issues
- Against a badly outmatched opponent every move earns the finisher mark, so
  it stops distinguishing anything. Accurate, but noise at that end.
- The overflow picker only appears with five or more moves, so its longer
  "listed 52 · 95% to land" line is unexercised in the common case.
- No save-schema change: the readout is pure display. `SAVE_VERSION` stays
  **23**.

### Next session — first task
R23 (active hides and organs), which R20 already made a down payment on with
three utility organ moves, or R26 (a second region), the largest content gap.

## Session 34 — R21: Splice-Dex completeness ✅

**Acceptance criterion:** everything the game announces is findable again
afterwards — **passes**, asserted over the *rendered* dex rather than the
fields behind it.

### First: the phase's own premise was wrong

R20 recorded, and R21 was queued on, "combos are never persisted to the dex
despite `combos.json`'s `_doc` claiming it". **That is false.** Combos are
persisted in `state.discoveredCombos` — a top-level field since the **v4**
migration — and the dex has drawn them all along, with `???` bait for the
undiscovered. The `_doc` was telling the truth; I grepped for `dex.combos`,
found nothing, and scheduled a session to fix a bug that did not exist.

Recording it rather than quietly dropping it, because the failure mode is
worth naming: an audit that greps for one spelling of a thing will invent
work. The other two claims held.

### Rival dossiers

A rival's whole record — defeats, losses, when you last met — was kept in
`campaign.rivals` and surfaced **nowhere you could return to**. There is no
rival UI file at all; they appear as a live War Room card and then they are
gone. A rival you beat three regions ago should be lookupable.

The dex now carries a dossier per rival: their title and philosophy, what
they favour, whether they read your stable — and, because it should brief
rather than just score, **what they will bring next**, derived from the same
numbers `rivalTeam` uses:

> **Dr. Mantissa** · 2 graduated · 1 lost to them
> Next time: 3 in the field at ×1.89 power.

A rival you have never met stays `???` — a rumour, not a spoiler, and smoke
fails if an unmet rival is ever named.

### Lineage: two generations, bounded by construction

The family tree was a one-generation snapshot. It now reaches grandparents —
and the cap is **structural rather than a rule someone has to remember**: the
snapshot copies a grandparent's name and stars but never its own `sire`/`dam`,
so there is nowhere for a third tier to live. An unbounded tree doubles every
generation in a save that is never reset, and this save is never reset.

Smoke breeds three generations and asserts a grandparent carries exactly
`['name', 'stars']` — the assertion fails the moment someone spreads the
whole object in.

### The invariant
Stated once over the rendered page: plant one of each announceable discovery
— combo, enemy, variant, trait gene, rival with a record — render the dex to
a string (it needs no DOM), and require each to still be there. All three
break paths fail the build.

### Known issues
- **QA lesson, not a product bug**: `innerText` omits below-the-fold content
  in headless Chrome, so the combo check failed while the entry rendered
  perfectly. `textContent` proves presence; a layout probe (88×14px,
  `visibility: visible`) proves it is on screen. Worth remembering before
  "the UI is broken" gets written down again.
- Operations keep only `campaign.opReport`, the last one. A jobs history is
  the same class of gap as the rival one was, and is not covered here.
- Scars are findable on a living chimera in the Pens; a graduated one takes
  its history with it.
- `SAVE_VERSION` **22 → 23** (grandparent fields normalised), with a
  migration; sw cache `spliceworld-v23-dex`.

### Next session — first task
R28 (battle readability) can now lean on R22's `previewMove`, or R23 (active
hides and organs), which R20 already made a down payment on.

## Session 33 — R22: an enemy AI with a policy ✅

**Acceptance criterion:** the same roster plays measurably better and the
all-grade balance gate still passes — **passes** (7–13pp per contested
matchup; 0 `[OP]` and 0 `[TRASH]` across 4 grades × 10 pools at `seedsPer`
12 **and** 16).

### One scorer, both sides

`enemyChooseMove` was a coin flip with a 75% lean toward damage. It is now
`battle/ai.js`: a single scorer that reads expected damage through the chart
and the class triangle, values a kill above the damage on it, prices every
status against whether it is *already there*, and keeps stamina in reserve.

It sits on a new `previewMove()` — the same arithmetic `attack()` runs, with
the dice taken out. That makes it the one source of truth for "what does this
button do", which the AI reads to choose and R28's battle UI will read to
explain. Smoke asserts the two agree to within 8% over 100+ swings.

**Skill is a dial, not a switch.** Encounter tier drives it (0.15 at a beat
patrol, 0.85 at a Gen-2 response, 0.9 for rivals), so the difficulty curve
gains a dimension that costs no new content.

| contested matchup | vs random | vs the policy | worth |
|---|---|---|---|
| boss / bear | 85% | 76% | 9pp |
| boss / shark | 78% | 49% | 29pp |
| military / bear | 39% | 27% | 13pp |
| air patrol / bear | 98% | 89% | 9pp |

### The pilot got the same brain — and that mattered more

R20 recorded that the greedy pilot never pressed a low-power or defensive
move, so those could never be priced. Giving the harness the same policy
closed that, and immediately **exposed a real outlier**: the shark purebred
at 77% against a 45% median at Prime. Frenzy was priced at 64 power back when
it was decoration; the first pilot able to press it found it. Re-priced to
50 — under a plain 52-power Strike at full health, above it once the target
is hurt, which is what a finisher should read like.

### The bug that cost a whole class

Air collapsed from 34% to **13%** at Standard. Three hypotheses were wrong
before measurement found it — it was not the enemy (a dumb enemy gave the
same 13%), not the rest heuristic, not the stamina penalty, and not the 20%
random branch.

Counting presses found it in one line: on a fragile Air build the pilot
pressed a **capped, zero-power evasion buff 545 times across 80 fights and
won none of them**, where the old greedy rule — which had no way to *choose*
a setup move — rested, recovered, and won half. Once a stage caps it scores
zero, but a 10-stamina buff stays affordable long after the 20-stamina attack
does not, so the pilot chain-cast it and never climbed back.

Two rules fix it: never spend a turn on a move worth nothing, and when
*nothing that hits* is affordable, a buff must clear a bar to beat resting.
The same build now wins **66%**, against greedy's 51%.

| class spread | before R22 | after |
|---|---|---|
| standard | 20pp | **12pp** |
| prime | 19pp | **9pp** |
| apex | 26pp | **16pp** |
| prismatic | 24pp | **20pp** |

Better play on both sides made the *class balance* read more honestly than
it ever has — R18's work shows through once neither side is flailing.

### Known issues
- **Smoke is 13.7s → 27.3s.** The policy evaluates every move every turn, and
  the gate is 4 grades × 6 pools × 40 builds × 11 encounters × 8 seeds. Worth
  it for now; if it grows again, trim the gate's pools before its grades.
- **The pilot does not switch.** It picks moves only, so a bad class matchup
  is played out rather than tagged out — which understates any build with a
  bench answer. The next honest step for the yardstick.
- The boss-transform test now pins `aiSkill = 0`. Captain Clampdown with a
  policy opens on accDown and stays on its best swing, which ends a thin squad
  before stage two — a real difficulty change, but that assertion is about a
  KO trigger, not difficulty.
- `SAVE_VERSION` **21 → 22** (`battle.aiSkill`), with a migration; sw cache
  `spliceworld-v22-ai`.

### Next session — first task
R21 (Splice-Dex completeness) is small and is the last correctness item, or
R28 (battle readability) which can now lean on `previewMove`.

## Session 32 — R20: wire the dead keywords ✅

**Acceptance criterion:** every keyword in `keywords.json` is either on a move
AND implemented, or gone — with a smoke invariant so it cannot rot again —
**passes** (29 keywords, 0 unimplemented, 0 uncarried; all three break paths
fail the build).

### The button was lying

`taunt` and `frenzy` sat on shipped **player** parts — anglerfish "Lure Light"
and shark "Frenzy" at 64 power, one of the biggest moves in the game — against
keywords `keywords.json` itself labelled **"Reserved (post-M4)"**. The engine
never read either. Content had been authored against keywords that were never
built, and nothing in the project could see it.

The full count: **18 implemented, 15 not; 11 on no move at all.** Two of those
— `heal` and `staminaRestore` — had been wired since M4 and unreachable the
whole time, because organs almost never carry a move (5 of 32).

### What shipped

| | |
|---|---|
| implemented | `taunt` `frenzy` `rage` `bleed` `multiHit` `staminaDrain` `ignoreEvasion` `thorns` `slow` `rally` `regen` |
| deleted as redundant | `reflect` (= thorns) · `camouflage` (= evasionUp) · `aoe` (one active per side over a queue — nothing to splash) · `suppression` (= accDown + multiHit) |
| given a home | 11 placements, each on the species the keyword already describes |

Frenzy reads the **target's** wounds, Rage the **user's own** — two halves of
one idea kept apart so a shark and a cornered gorilla do not feel like the
same creature. Rally finally does what `wolf_organ`'s "Rally Howl" and the
Pack Hunt combo's `"keyword": "Rally"` have claimed since M3: it buffs the
whole side. Multi-Hit runs the *whole* pipeline per strike, armor included,
so a flurry is worse into plating and better into a bare target.

`heal`, `regen` and `staminaRestore` got the three utility organ moves they
always needed (Shell Rebuild, Cutaneous Mend, Second Stomach) — the smallest
slice of R23 the invariant required.

### The invariant is behavioural, not a grep

A textual check for `frenzy` in the engine passes on a *comment*. So every
keyword is bolted onto a control move and the same fight is replayed on the
same seed with and without it. **An inert keyword consumes no rolls and
changes no state, so the two logs come back identical** — which is exactly
the bug, and it fails.

Two keywords needed their own setup, and finding that out mattered:
`ignoreGuard` and `ignoreEvasion` have nothing to bypass unless the target is
guarding and evasive, and a bench that never creates the condition reports a
**live** keyword as decoration. Guard is the awkward one — `performMove`
clears the attacker's own guard, so it only stands while the guarding side has
not acted, which means the player must swing first, which would have made
`priority` untestable in the shared bench. Each conditional keyword now gets a
matched baseline under the same condition.

### Balance
0 `[OP]` across 4 grades × 10 pools at `seedsPer` 12 **and** 16, headroom
4.4–6.7pp. `[TRASH]` went **1 → 0** at every grade: the newly-live keywords
gave the weak builds something to do.

### Known issues
- **The sim never presses the new defensive or low-power moves.** The pilot is
  greedy on raw power, so Multi-Hit (20 power × 2–3) and the thorns move (44)
  lose to a plain 46-power bite and are never sampled — their balance
  contribution is untested. Squarely R22's territory; the browser QA drives
  them by name instead.
- **Rally Howl changed hands**: `powerUp` on self became `rally` on the whole
  side, and it is Pack Hunt's parent part. Balance holds today, but that combo
  has been re-tuned once already — watch it.
- Three organ moves is a down payment on R23, not the phase.
- `SAVE_VERSION` **20 → 21** (`bleed`/`thorns`/`regen`/`taunted` on battle
  status), with a migration; sw cache `spliceworld-v21-keywords`.
- Smoke 12.9s → 13.7s.

### Next session — first task
R21 (Splice-Dex completeness) is the other correctness item and is small.
R22 (enemy AI) is the big one and would also fix the sampling gap above.

## Session 31 — The knockback lock, and what the director actually needed ✅

**Acceptance criterion:** a Knockback attacker cannot deny every action, the
director never makes a fight easier with wave order free again, and no
adaptation is protected by where a unit happens to sit — **passes** (R18's
slot workaround reverted and `military_response` still goes 55% → 3% under
adaptation; all three guards fail smoke when broken).

### The keyword pricing found a bug instead

R18 asked for keyword prices in the director's `weight`. Measuring them, on
one control unit, one keyword at a time:

| keyword | Δ player win |
|---|---|
| **knockback** | **−88.7pp** |
| evasionUp | −3.0pp |
| accDown | −2.0pp |
| everything else | ≤ −2pp |

That is not a balance number. Knockback rotates the target's side, and the
round loop then drops that side's planned action — correct for a KO, because
the fighter is gone. For a rotation the fighter is alive on the bench, so a
faster attacker with Knockback denied the player **every action for the
entire fight**. The log is unambiguous: thirteen turns, enemy on
`131/131 hp`, the player acting exactly once — when the last chimera had
nowhere left to be shoved.

A side rotated last turn can no longer be rotated again this turn. It stays
a real tempo move (it still costs a full action) but the worst case is now
losing every other action. Same fight: **loss in 13 turns → win in 5**.

### The premise didn't survive the fix

With the lock gone, every keyword prices between 0 and −3pp — knockback
included, at −2.0pp. So there was nothing to price in. Checking the
heuristic itself against measured threat across the roster:

| formula | corr with real threat |
|---|---|
| **current** `hp + power*3 + armor*2` | **0.958** |
| + best move power | 0.964 |
| + best move + keyword count | 0.962 |

`weight` was never the problem. But the director's promise is *pairwise*,
and r=0.958 still leaves local inversions — `gunship_80` (weight 118, a
58-power move) reads flimsier than `attack_chopper` (130, 52) and is not.
So: one guard, not a reweighting. **A slot that hits harder than the counter
coming in is never expendable.** Measured across every encounter × rule
pairing:

| guards | mercy rules | swaps kept |
|---|---|---|
| none (R18) | 3 | 21 |
| move power | **0** | **16** |
| class only | 1 | 11 |
| class + move | 0 | 9 |

**R18's slot workaround is reverted.** `military_response` has its strong
unit back in the swappable middle slot, and the director now correctly
appends instead of swapping: 55% → 3%. Wave order is no longer load-bearing.

### A guard I wrote and then deleted

A class guard (never trade an Air slot that counters a Ground stable for a
Ground one) looked well-motivated — it was one of the three measured
mercies. Removing it from the code changed nothing, which is how a guard
rots into dead code, so it got checked properly: through the real director,
`ground_stable` always outranks `chemical` for a Ground stable and answers
with an Air unit, so the guard **cannot fire**. My "proof" that it was
reachable had hand-picked the counter and bypassed rule selection. The move
guard alone gets 0 mercies and keeps *more* swaps. Deleted.

### Vehicle share
Two Organic units — `rappel_team` (air) and `fire_brigade` (water), both
land-plausible so they are not stuck in harbour encounters. Vehicle share
45% → **40%**.

### Known issues
- **40%, not the 35% R18 asked for.** Reaching 35% meant trading the impound
  lot's cruiser and the checkpoint's truck for weaker organics, and that cost
  10pp of Standard difficulty (median 34% → 44%). Difficulty is worth more
  than the round number, so it stopped at 40% with the median back at 37%.
- **`weight` still ignores keywords**, by measurement rather than oversight —
  pricing them in made the correlation worse. The move guard covers every
  observed failure, but a future unit whose *keywords* rather than move power
  outclass a counter could still slip through. Knockback was exactly that
  case and is now capped; the general blind spot remains.
- `SAVE_VERSION` **19 → 20** for `battle.knockedAt`, with a migration; sw
  cache is `spliceworld-v20-knockback`.
- Smoke 9.9s → 12.9s (the no-mercy sweep measures every encounter × rule).

### Next session — first task
Onboarding past the first conquest, or the ZzFX audio pass — both have been
open since M7 and neither is blocked.

## Session 30 — The class triangle, and the gate at every grade ✅

**Acceptance criterion:** no class is a strict upgrade over another, the
roster is clean at every grade under sampling well past what the gate uses,
and the old roster fails the build — **passes** (0 `[OP]` across 4 grades ×
10 pools at `seedsPer` 12 *and* 16; restoring the old roster fails smoke,
naming the storm_eagle Prime outlier by name).

### It was never a storm_eagle problem

R17 handed over a `storm_eagle` purebred topping every pool. The first
measurement killed the obvious fix:

| enemy roster | share |
|---|---|
| **ground** | **90%** |
| air | 5% |
| water | 5% |

Six of eight encounters were pure Ground. With Ground ≫ Water ≫ Air ≫
Ground, that is not rock-paper-scissors, it is a ranking — Air dealt ×1.5
*and* took ×0.7 against nearly everything; Water did the reverse. Forcing a
build's class and holding its stats fixed:

| build | as air | as ground | as water | unclassed |
|---|---|---|---|---|
| storm_eagle | 77% | 64% | 48% | 61% |
| eagle | 78% | 55% | 51% | 58% |
| tiger | 82% | 73% | 61% | 73% |

Class was worth **+16 to +20pp**; Water was a **−10 to −13pp** tax. And
plain `eagle` already matched storm_eagle at 78%, so nerfing the variant
would have promoted its parent and changed nothing.

### Six units, not a nerf

`surveillance_drone`, `falconry_unit`, `gunship_80` (air) and
`water_cannon_truck`, `harbor_diver`, `dredger_barge` (water) — procedural
SVG, pure data, no engine edits. Roster 10 → 16 units, mix **90/5/5 →
50/25/25**:

| grade | air/ground/water spread — before | after |
|---|---|---|
| standard | 17pp | **6pp** |
| prime | 24pp | **7pp** |
| apex | — | 13pp |
| prismatic | — | 12pp |

storm_eagle drops from rank 1–2 at every grade to **rank 8/43** at Standard,
without one of its numbers being touched.

**Even thirds is wrong** and was measured, not assumed: 35/35/30 gives a
20pp spread against 50/25/25's 12pp. The tag chart stacks asymmetries on top
of the triangle — Ground moves miss Airborne *entirely* — so the enemy mix
that equalises the classes is not the one that looks symmetrical.

### Two things the change broke, and what they taught

- **The AI director became a mercy rule.** It may only ever make a fight
  harder, and guards that by stat weight — but `weight` cannot see move
  keywords. `gunship_80` at weight 118 was beating attack_chopper's 130
  because of one keyword: `knockback` alone was worth **~35pp** (removing it
  took the encounter from 46% to 80%). Rather than gut the unit, the strong
  new units now sit in the opening and final slots, which the director may
  never cut, so the slot it *can* swap is one its counters genuinely
  outclass. `military_response` holds at 48% (was 45%) and the director's
  adaptation takes it to 10%.
- **The tutorial must stay class-neutral.** An Air unit in tier 1 punished
  every Ground starter on the first fight. `patrol_1` is all-Ground again;
  the triangle starts at tier 2.

### Known issues
- **Vehicle share rose 35% → 45%**, because Air and Water fiction is
  inherently vehicular (choppers, boats, trucks) and only two of the six new
  units could plausibly be Organic. Gas does ×0 to Vehicles, so pure-Gas
  builds are worse off. Mid-change this cost 4 `[TRASH]` builds; the final
  roster is back to **1**, the same one that failed before this session, but
  the pressure is real. Fix is more Organic air/water units, not a tag change.
- **The director's `weight` heuristic is blind to keywords.** Worked around
  by slot placement, not fixed. A unit whose kit outclasses its stats can
  still turn an adaptation into a mercy. Pricing keywords into `weight` is
  the real fix.
- Smoke goes 4.0s → 9.9s: the gate is now 4 grades × 6 pools × 8 seeds.
- No save-schema change, so `SAVE_VERSION` stays **19**.

### Next session — first task
Price keywords into the director's `weight` so slot placement stops being
load-bearing, then add one Organic air and one Organic water unit to pull
Vehicle share back toward 35%.

## Session 29 — Combo grade scaling ✅

**Acceptance criterion:** no combo is overtaken by the drawback-free moves of
its own parts at any grade, and Standard balance is provably untouched —
**passes** (192 grade assignments asserted through `movesFromTokens`;
Standard win-rate table byte-identical before and after).

### The reward that stopped being one

`GRADE_MOVE_BONUS` sharpens a part's move 12% per grade. A combo's move was
flat. So a well-raised chimera watched its discovery fall behind the parts
that made it:

| Pack Hunt | before | after |
|---|---|---|
| Standard | 58 vs Pounce 52 ✅ | 58 vs 52 ✅ |
| Prime | 58 vs **58** ❌ | 65 vs 58 ✅ |
| Apex | 58 vs **64** ❌ | 72 vs 64 ✅ |
| Prismatic | 58 vs **71** ❌ | 79 vs 71 ✅ |

Not just Pack Hunt: **7 of 12 combos** went dead at Prime or Apex.

### Why the best grade, not the average

A combo is emergent anatomy, so it takes a grade too — **the best one among
the parts that unlock it**. That is not generosity, it is the only rule that
holds. A part's move scales by *its own* grade, so if the combo scales by
anything less than the largest, the better half of the pair overtakes the
combo it belongs to. Measured across every grade assignment in the roster:

| rule | dead assignments |
|---|---|
| min (weakest link) | 31 of 192 |
| mean | 10 of 192 |
| **max** | **0 of 192** |

And provably so: `combo > max(parts)` at base, and scaling both sides by the
same bonus cannot reorder them. All three variants are pinned in smoke —
reverting to flat, to min, or to mean each fails by name.

**Standard grade is untouched by construction** (grade index 0 → bonus 1.0),
which the win-rate table confirms: identical medians, identical flags. The
change only reaches chimeras someone actually raised.

### The gate was under-sampling

Checking the other grades turned up something worse than the bug being
fixed. R16's gate runs at Standard with `seedsPer: 4`. At Prime:

| seedsPer | `[OP]` flags across 10 pools |
|---|---|
| 4 | 0 |
| 8 | 1 |
| 12 | 3 |

The clean result was under-sampling, not a clean roster — the same failure
mode that produced three vacuous assertions two sessions ago. The gate now
runs at `seedsPer: 8`. Smoke goes 3.2s → 4.0s.

### Known issues
- **A pre-existing Prime outlier, deliberately not fixed here.** The
  `storm_eagle` purebred is the strongest build in the pool at every grade
  (mean rank 1.5/43 at Prime, +28.6pp over the median) and flags `[OP]` in
  3 of 10 pools at `seedsPer: 12`. It is **not** this change's doing: it
  carries no combo, and its win rate is 78% both before and after. It is a
  variant-species tuning question — storm_eagle trades 2–4 HP per part for
  +1 power and +1 speed, and it is Air, which beats Ground — so re-pricing
  it is its own pass, not a line in this one.
- **The `[OP]` gate therefore still runs at Standard only.** Extending it to
  every grade would need that outlier fixed first; a gate that passes only
  because it samples too coarsely to see a known outlier certifies something
  false, which is exactly what this session found. Next phase gets both.
- Two `[TRASH]` builds (2 of 10 pools) — randomly-sampled 3-part builds that
  win nothing. Pre-existing, unrelated.
- No save-schema change, so `SAVE_VERSION` stays **19**.

### Next session — first task
Re-price the `storm_eagle` variant against the Air matchup until Prime is
clean at `seedsPer: 12`, then extend the `[OP]` gate to all four grades.

## Session 28 — The balance gate ✅

**Acceptance criterion:** the sim reports no degenerate builds, and
re-introducing the old numbers fails the build rather than printing a
warning — **passes** (`node tools/sim.js` ends "no degenerate builds
flagged."; restoring 64/26/95 fails `tools/smoke.js` naming both pools).

### The flag that ran for a dozen sessions

`tools/sim.js` had printed the same verdict on every run since M4.5:

```
[OP] L · wolf:organ + tiger:head + scorpion:hindlimbs [standard]
     — 68% vs peer median 32% and 6.8 vs 9.2 turns — outlier
```

Nobody was obliged to read it, so nobody did. That is the actual defect;
the overtuned combo is just what it was pointing at.

### Diagnosis — three wrong answers first

Worth recording, because each wrong answer *looked* measured:

1. **"It's the double buff."** `wolf_organ`'s Rally Howl is the only part in
   all 184 with a two-axis buff. But variants that stripped it to one axis,
   and that tripled its cost, came back **byte-identical** — the sim's greedy
   pilot picks by power, and Rally Howl is power 0. It is never pressed.
2. **"It's the stamina economy."** Every part adds metabolic draw; only
   organs add regen, so the 3-part build nets +6/turn against a 6-part
   purebred's +1. Across the full 43-build pool `corr(winRate, regenNet)`
   is **0.048**. It is not the mechanism.
3. **"It's `tiger_head`'s Pounce."** Patching its power, cost *and* accuracy
   changed nothing at all. That impossibility was the tell.

The build's near-twin settled it: `L · skunk:organ + anglerfish:head +
tiger:hindlimbs` has an almost identical stat block (regenNet 6, stamina 70,
power 20, speed 1, mass 190) and wins **16%**. The difference was never the
stats. `sampleBuilds` generates a build from every combo, and this one is
the **`pack_hunt` combo** — wolf_organ + tiger_head — plus a random filler.
Every part-level patch was a no-op because the pilot only ever pressed the
combo move.

### The fix: price it, don't shrink it

Pack Hunt was 64 power for 26 stamina at 95 accuracy — the **best
damage-per-stamina of all twelve combos (2.34)** while also carrying
priority *and* a compounding powerUp. The roster's own pricing is visible
once the ladder is sorted: `live_wire` buys the top efficiency (2.32) with
**no keywords at all**, and every keyword-carrying combo sits below it.
Pack Hunt took both.

**64/26/95 → 58/28/92** (efficiency 2.34 → 1.91, seventh of twelve, below
`leap_year` whose priority+evasion is the weaker pair). It keeps its
identity — priority and the Rally powerUp — and stays a real upgrade over
its own Pounce.

| | win% | turns | rank | `[OP]` in 10 pools |
|---|---|---|---|---|
| before | 69% | 6.9 | 1 / 43 | **2** |
| after | 57% | 7.1 | 5 / 43 | **0** |

Accuracy did the last of the work deliberately. At 95 the build cleared the
detector by **0.5pp** — one content change from flaking. Cutting power
further instead would have made the move cost more than it returns and
turned a discovered combo into a trap, so 92 (matching `thunderclap` and
`depth_charge`) buys **+7.3pp** of headroom without that.

### The guard

Two assertions in `tools/smoke.js`, both verified to fail when broken:

- **The harness's verdict is now a build failure.** Six pools, because the
  sampler fills a combo's spare sockets at random and one pool only decides
  which fillers a combo wears — the same combo swings between rank 1 and
  rank 41 of 43 on filler alone. `seedsPer: 4`, not the sim's default 3: at
  three battles per encounter a win rate can only land on 0/33/67/100%, and
  that quantisation flags a clean roster on its own.
- **The opposite failure.** A combo weaker than the drawback-free moves of
  the parts that unlock it is dead content. This is the assertion that ruled
  out the cheaper nerfs.

Smoke goes 2.5s → 3.2s.

### Known issues
- **Combo moves don't get the grade bonus part moves do.** `GRADE_MOVE_BONUS`
  scales a part's move 12% per grade; a combo's move is flat. So a Prismatic
  Pounce is 71 against Pack Hunt's 58, and the combo stops being the right
  button. This is systemic and pre-existing — **7 of 12 combos** are already
  overtaken by their own parts at Prime or Apex, Pack Hunt among them before
  this change. The smoke assertion only checks base power, because making it
  grade-aware would fail the whole roster today. Best candidate for the next
  balance phase.
- Two `[TRASH]` builds (2 of 10 pools) — randomly-sampled 3-part builds that
  win nothing. Pre-existing and unrelated; the gate asserts on `[OP]` only.
- `combos.json`'s `_doc` says discoveries are "permanently logged in the save
  for the Splice-Dex", but `dex` has `parts`/`enemies`/`traits`/`variants` and
  no `combos` — they surface at splice time and are never persisted.
- No save-schema change this session, so `SAVE_VERSION` stays **19**.

### Next session — first task
Decide the combo/grade interaction above: either give combo moves their own
grade scaling and re-run the balance table, or state in data that combos are
deliberately flat and re-price the seven that fall behind.

## Session 27 — Screen density ✅

Nineteen waves of features had quietly stacked **thirteen cards into one
scrolling column** in the War Room: the econ row, counter-offensives, captives,
the jobs board, the region strip, their dossier, your dossier, rival labs,
containment and the news wire. Measured on a 380px phone with a busy late-game
save, that was **3,884px of scroll**.

### Five views behind a tab bar

| tab | holds |
|---|---|
| **Map** | the region strip and its assaults |
| **Jobs** | the operations board and heat |
| **Labs** | both dossiers and Rival Labs |
| **Bays** | containment and rehabilitation |
| **Wire** | the full news feed |

Median view is now **1,107px — a 71% reduction**; the heaviest (Labs) is
1,781px. The bar is sticky, so a long view is navigable from anywhere in it.

### The rule the whole layout rests on
**Alerts never go behind a tab.** A rescue window and a counter-offensive both
carry live countdowns that cost a creature or a node when they run out — hiding
either on a view the player is not looking at would recreate exactly the
failure mode region contestation was designed to avoid. The econ row and both
alerts sit above the bar and render on every view.

Smoke enforces it by scanning `campaign/ui.js`: the alerts must not appear
inside the view map, must still be rendered, and must appear *before*
`subtabBar` in the template. Every tab in the bar must have a view behind it,
and an unrecognised tab must fall back to the map rather than a blank screen.
All five guards verified to fail when broken — including one that adds a sixth
tab with nothing behind it.

### Badges are a promise
Only two things earn one: an **unread job report** and an **occupied bay**. A
badge on every tab teaches players to ignore the badges that matter, so Map,
Labs and Wire carry none.

### Two things fixed along the way
- The econ row used `auto-fit, minmax(90px)`, which drops to three columns at
  380px and leaves **Record dangling alone on a second row** beside an empty
  half. Invisible before; conspicuous the moment the card became permanent
  chrome above the tabs. Now four fixed columns, two at very narrow widths.
- The alert cards' chrome is paid for on all five views, so their padding and
  heading margins were tightened. Worth 44px off every screen.

Tab state is deliberately module-level rather than saved: it survives the
re-render on every tick and every action, which is what matters, and costs no
save migration to do it that way. **No save version change in this phase.**

### Next session's first task
Open, and worth picking from: the balance harness has flagged the same
degenerate build every run for a dozen sessions (`wolf:organ + tiger:head +
scorpion:hindlimbs`, 67% against a 30% peer median); onboarding still ends at
first conquest and predates fourteen shipped systems; and audio is still a
handful of ZzFX stingers.

## Session 26 — Injury scarring ✅

> §3.5: "Battle injuries → Infirmary timer; untreated injuries can scar into
> permanent trait tradeoffs (cartoony: 'Chompers now fears jeeps. +Evasion vs.
> vehicles, −Accuracy vs. vehicles')."

An injury has always opened a timer and then quietly expired. There was nothing
to do about it and no consequence for doing nothing. Now there is both.

### The choice
**Treat it** at the Infirmary and it clears clean — the bill scales with how
much of the injury is left, so an early visit costs more than sweeping up at
the end. What you are buying is *certainty*, not healing.

**Leave it** and there is a 34% chance it sets badly and stays.

### Every scar is two-sided
This is the whole design, and smoke enforces it: a scar must give something
*and* take something. That makes a scar **character rather than damage** — so a
player who slept through the treatment window gets something interesting, not
something ruinous, and because several scars are net *good* for a particular
build, "leave it and see" is a real strategy rather than a mistake.

Ten scars, four of them narrowed by a `vs` tag, which is what makes the
roadmap's own example literally expressible as data:

> **Jeep Shyness** — +14% evasion, −10 accuracy *vs Vehicle*
> "Goatzilla has developed strong opinions about anything with an engine, and
> gives it a wide, twitchy berth."

Measured in the real engine over 200 fights: a jeep-shy creature hits a Police
Cruiser **79% → 70%** of the time and is hit back measurably less — and is
**exactly, identically unchanged** against a Riot Squad. The scar is about
vans.

Bounded, too: never the same scar twice, never more than three, and a scar
never keeps a creature benched — the injury always clears on schedule either
way.

### Kept honest
~35 new smoke assertions, each verified to fail when the code it guards is
broken. Two needed the *test* fixing rather than the code, and both were the
same mistake — **sample size**:

- The accuracy assertion ran 30 fights to detect a 9-point gap. With the code
  deliberately broken it still passed, because the RNG stream diverges slightly
  and 30 samples is noise. At 200 it catches it cleanly (79% vs 80% broken).
- The no-duplicate-scars check ran one career. Three draws from a pool of ten
  collide about a quarter of the time, so one career proves nothing; it now
  runs eighty.

The bidirectional service-worker precache check added two sessions ago earned
its keep immediately — it caught `data/scars.json` and `splice/scars.js` before
I had got round to adding them.

Save **v19**; `sw` cache `spliceworld-v19-scars`. Nobody is retroactively
scarred for injuries taken before the Infirmary sold treatment.

### Next session's first task
Every clause of the v0.1 spec is now built. The only remaining roadmap item is
**async ghost defences**, which has always been marked "multiplayer — later";
a full plan for that is written up separately.

## Session 25 — Chimera extraction & temperament ✅

Two promises from the main spec that were written into the roadmap and then
never built.

### Extraction (§3.3)
> "Chimeras (yours or captured) can also be extracted — returns a **subset** of
> parts, one grade degraded. Salvage, not free recycling."

This is the Surgery Theater's missing undo. Splicing consumes vault tokens
permanently, so until now a chimera was a **one-way sink**: a build you
regretted, a chaos-vat reject, or a rehabilitated creature carrying anatomy you
wanted somewhere else all just sat in the Pens forever.

Two costs keep it honest — you get back only 50–80% of the sockets, and what
comes back is a grade poorer. Measured over 60 dismantles of prismatic
six-part chimeras, **the vault gets back well under three-quarters of the grade
value that went in**. Which parts survive is seeded on the chimera itself, so
the confirmation sheet lists exactly what you will get, by name and by
was-grade, and reloading cannot reroll it.

### Temperament (§3.5)
> "temperament on two axes (Brave–Skittish, Fierce–Gentle), seeded by dominant
> donor species + drifted by how you raise them … Never removes player control."

Every chimera has carried `temperament: null` since M3 behind a comment saying
"seeded on settling — later milestone". It now is.

**Seeded by the anatomy.** The dominant donor species — whichever put in the
most parts — supplies the bias, so a shark build comes out Fierce because it is
mostly shark. Biases are keyed by species **role** rather than by species, so a
designer writes "Walls are calm and steady" once instead of thirty-two times,
with `bySpecies` overrides where a particular animal has character its role
misses.

**Drifted by how you raise them.** Every existing verb now shapes who the
creature becomes: training makes them braver and gentler, winning makes them
fiercer, going down makes them warier. Both axes are bounded, so a long career
cannot run away.

**Perks are passive stat effects only** — §3.5's "never removes player control"
rules out anything that takes a turn away, which is obedience's job and only
obedience's. Brave lands telling blows below 30% health; Skittish is hard to
hit on the opening exchange; Fierce hits harder but guards worse; Gentle paces
itself and recovers stamina faster. They express only past a threshold and
scale with how far past — one point over the line is worth nothing.

Balance impact, measured against the identical roster with temperament
disabled: **mean +1.2pp win rate, max +12pp**, and much of that spread is RNG
stream divergence rather than the perks (the crit check consumes a roll). The
Fierce guard penalty is a real cost, so defensive builds lose a little where
aggressive ones gain.

### One fragile old test, replaced
The grade-ladder assertion compared the **maximum** boss win rate across builds
at two seeds per build. That saturates the instant one lucky build goes
two-for-two — it was reporting "100% at standard grade" off two coin flips, and
duly broke the moment anything nudged the RNG stream. It now compares the
**mean** across the whole ladder, which is what the claim actually means and
checks three steps instead of one: 5% → 20% → 47% → 73% from standard to
prismatic.

### Kept honest
~40 new smoke assertions, each verified to fail when the code it guards is
broken. Four needed the *test* fixing: my drift checks called the drift
functions directly rather than through `trainChimera` and the battle aftermath
(so breaking either call site went unnoticed), the dominance fixture happened
to be alphabetical as well as dominant, and the damage measurement read the
*next wave's* health because the target died in one hit. Browser pass at 380
and 320px: temperament on the Pens cards, the dismantle sheet with its exact
preview, and a v17 save migrating and seeding temperaments on the next tick. No
console errors.

Save **v18**; `sw` cache `spliceworld-v18-temperament`.

### Next session's first task
Both backlogs are now clear. What remains unbuilt from the spec: **injury
scarring** (§3.5 — "untreated injuries can scar into permanent trait
tradeoffs"), and **async ghost defences**, which the roadmap has always marked
multiplayer-later.

## Session 24 — Chaos-breeding ✅

Ranch breeding pairs two **animals** of one species and produces a predictable
hybrid of their stats. The Chaos Vat is the other thing: two finished
**chimeras** go in and a genome neither of them was comes out.

### The problem is economic, not genetic
A chimera costs vault tokens permanently, and — unlike livestock — carries no
upkeep. So an offspring bought with only money and time is a duplication
glitch: breed two, breed the two you got, field an army you never paid for.

The price is therefore paid in **grades**, which is this game's real power
currency. Both parents permanently drop one grade on every part. A five-socket
pair gives up ten grade steps and returns five, so the exchange is strictly
deflationary and a line running on its own output slides down the ladder:

| generation | child power vs founders |
|---|---|
| 1 | 96% |
| 3 | 85% |
| 6 | 80% |

Six generations took a pair of prismatic founders to a roster averaging
standard/prime. The only way back up is crossing freshly-raised, well-graded
stock back in — which is exactly the ranch loop the whole game is built on.

**One ordering detail is load-bearing** and now has a comment and an assertion
holding it in place: the child is conceived from the parents *before* they pay.
Degrade first and the offspring inherits the damage, the operation becomes
strictly destructive, and nobody would ever use the vat.

### Why you would do it anyway
**The vat does not read your permits.** Measured over 200 gestations:

| | |
|---|---|
| child beats its best parent | 7–16% (max seen: 130%) |
| carries a part from neither parent | 54% |
| gains a socket neither parent had | 19% |
| comes out on a frame neither parent used | 7% |

That socket clause is the one that makes this more than recombination — a
second organ bay before you own Theater Tier II. It measured **zero** before I
added it, because the union of two five-socket parents is, inevitably, five
sockets. The wild cards draw from the **Splice-Dex**, so chaos is always
anatomy you have already seen and never a gift from the end of the game.

An emergent nicety worth recording: prismatic parents beat their best parent
only 7% of the time against prime's 16%, because prismatic can only degrade.
**Chaos-breeding is for the middle of your roster, not the top.**

### Kept honest
~30 new smoke assertions, each verified to fail when the code it guards is
broken. Four needed fixing rather than the code: my fixture gave both parents
identical sockets (so the carry-over rule never ran), granted the full parts
list as the Dex (so the wild-card pool was untestable), and left the
cancel-refund check loose enough to pass either way. Browser pass at 380 and
320px: the two donor pickers, the price warning, sealing, the countdown,
decanting into the Pens, and a v16 save migrated live. No console errors.

Save **v17**; `sw` cache `spliceworld-v17-chaos`.

### Next session's first task
The post-v0.1 backlog is empty. Still unbuilt from the main spec: **chimera
extraction** (§3.3 — "chimeras can also be extracted, returns a subset of
parts, one grade degraded"), which is the other way to recycle a chimera and
would pair naturally with the vat; and **temperament** (§3.5), which every
chimera carries as `null` and nothing has ever set.

## Session 23 — The Jobs board ✅

The complaint was "I keep losing so I have no money to get new animals to
breed." That is not a difficulty problem, it is a **structural** one, and
measuring it first made the shape of the fix obvious.

### What the numbers said
A player holding no nodes has:

| | |
|---|---|
| net income | **$22/day** (a $40 stipend minus $18 upkeep) |
| Mail-Order catalog | **exactly two species** — Goat and Ram |
| route to Water anatomy | none |
| route to Air anatomy | none |

Every Water and Air species is gated behind `checkpoint`, `precinct` or
`guard_post`. So a losing player cannot obtain the counter-class anatomy the
class triangle says they need in order to stop losing. A spiral with no floor.

### The board
Seven heists, on real-world timers, paying money **and livestock**. Four rules,
all load-bearing and all asserted in smoke:

1. **Something is always runnable** — no territory, no notoriety, no chimera,
   no particular anatomy. Three of the seven can be run by going yourself.
2. **Failure never costs a creature.** Time and a bruise, nothing else. You
   cannot punish a losing player for trying to stop losing.
3. **`demands` improve the odds; they never gate the job.** Requiring Aquatic
   anatomy before you may rob the aquarium that would *give* you Aquatic
   anatomy is the same circle in a smaller hat. A plain goat chimera robs the
   aquarium at 62%; a shark build does it at 95%.
4. **Heat is the price** — and a mechanic, not a nerf. Trimming payouts to cap
   the ceiling would have punished exactly the broke player this board is for.

### Two tuning passes worth recording
**Heat had to become exponential.** Linear decay is bang-bang: heat either
drains to zero or pins at the cap depending on which side of the drain rate
your job rate happens to sit, with no useful middle. A half-life gives a smooth
equilibrium that scales with how hard you push. Measured at launch:

| cadence | heat | odds | 7-day take |
|---|---|---|---|
| once a day | 6 | 70% | $889 |
| three times a day | 23 | 63% | $1,751 |
| cycling all evening | 32 | 60% | $2,974 |

Diminishing returns for the grinder, nothing at all for the casual player, and
full territory ($1,575/week) is still passive and still gates the catalog, the
facility tiers and the rivals.

**The loot lists had to be trimmed.** My first draft let the aquarium yield
Octopus and the reptile house yield Crocodile — both `guard_post` fauna — and a
smoke assertion caught that conquest was then adding almost nothing to the
catalog. Jobs now hand over the **entry** animal of each class (Frog, Bat,
Eagle, Cobra) and conquest keeps the good stuff. Over the whole campaign, 60%
of the catalog is still beyond any job, and nothing stealable is within 70% of
the top price.

### Does it work?
A broke, node-less player with one plain goat chimera, checking in once a day,
has **$889 and four animals after a week** against $150 and no options before.
Checking in three times a day they have Water and Air stock inside two days —
which is to say, the game becomes playable again from a standing start.

25 new smoke assertions, each verified to fail when the code it guards is
broken. Browser pass at 380 and 320px: the board above the map, the crew sheet
showing per-candidate odds *and why*, a job in flight, a warp to the report,
the stolen animal in the pens, and a v15 save migrated live. No console errors.
One UI fix along the way: seven four-line rows turned the board into a wall, so
the blurbs moved to the crew sheet where they are read at the decision point.

Save **v16**; `sw` cache `spliceworld-v16-jobs`.

### Next session's first task
Chaos-breeding of chimeras. *(Shipped in Session 24.)*

## Session 22 — The monologue pass ✅

§3.8 has said this since the roadmap was written: *"Player profile uses the
same schema (name your geneticist, pick a philosophy tagline) — the villain-
monologue feature drops in later with zero refactoring."* Later arrived, and
it did drop in without a refactor, which is the nicest thing you can say about
a schema you wrote nineteen sessions ago.

### You are now somebody
A **Your Dossier** card sits next to the Rival Labs — deliberately the same
furniture, because the player is a villain in the same schema. It carries a
title, a name, a lab and a **philosophy**: five voices (Improver, Collector,
Showman, Naturalist, Engineer), each with its own tagline and its own set of
monologue slots.

**A philosophy is narrative only, and smoke enforces it** — it asserts a
philosophy object carries exactly `id / name / tagline / blurb / monologue` and
nothing else. Anatomy is where this game keeps its mechanics; a stat bonus
hiding inside a flavour menu would be the exact invisible modifier the class
triangle was built to replace.

**Names are rolled, not typed.** No screen in this game may render a native
form control, and on a phone a seeded generator beats a keyboard anyway: the
picker offers six candidates from ~2,300 with a re-roll, and the same roll
always offers the same six so a reload mid-choice is safe.

### A duel is now a conversation
The rival opens, you answer, and both lines are attributed by name — a log of
anonymous quotation marks tells you nothing about who is gloating. The exchange
is kept as `battle.opening` as well as in the log, because a story beat you can
only find by opening a log overlay is a story beat nobody reads: it takes over
the message box before turn 1 and taps away. A patrol gets none of this; you do
not monologue at a riot squad.

### Every slot has a caller now
`dissectionTaunt` had been sitting in `rivals.json` for **three sessions with no
caller** — written, shipped, never once seen by a player. So the pass added the
slots the events actually needed and wired all of them:

| slot | fires |
|---|---|
| `intro` / `victory` / `defeat` | the duel, both voices |
| `dissectionTaunt` | a rival takes one of your chimeras |
| `dissectionDone` | the rescue window closes on it |
| `defection` | you rehabilitate one of *their* specimens |
| `rematch` | they iterate after another defeat |
| `conquest` / `capture` / `rehab` / `graduation` | your voice, in the news wire |

And the assertion that stops it happening again: **every monologue slot must be
reached by a caller in the source**, checked statically. Two lines were already
dead when I wrote it — the player's `rehab` slot and `startRehab`'s own news
line, which the War Room was dropping on the floor.

### Two bugs found along the way
- **`campaign/rehab.js` and `campaign/contest.js` were never added to the
  service worker precache** — shipped in the last two sessions, and the offline
  shell would have failed on both. The existing assertion only checked
  *precached → exists*; it now checks both directions, and the reverse check is
  the one that bites.
- Three of my own new assertions were **vacuous**: half these lines open with
  `{creature}`, so "text before the first placeholder" was the empty string and
  `includes('')` is always true. Replaced with a fragment helper that takes the
  longest literal chunk and asserts it found one.

Also worth recording: the browser QA was reading a **stale `battle/ui.js`** out
of Chromium's HTTP cache for part of this session. Not a product bug — the
service worker is network-first — but the QA harness now disables the HTTP
cache, and the previous two sessions' browser results were re-run and confirmed
under it.

25 new smoke assertions, each verified to fail when the code it guards is
broken. Save **v15**; `sw` cache `spliceworld-v15-monologue`.

### Next session's first task
The post-v0.1 backlog is down to chaos-breeding of chimeras and async ghost
defences. Neither is started; both want a design conversation first.

## Session 21 — Region contestation ✅

Conquest was one-way. You took a node, it paid income, and that was the end of
the story — territory was a number that only went up, which is exactly the
shape endless mode goes stale in (§8, risk 5). The coalition now comes back
for it.

### Two rules, both load-bearing
- **The schedule is a timestamp, not a per-tick roll.** Rolling on each tick
  would mean a player who opens the app ten times an evening gets attacked ten
  times as often — the frequency would measure their habits, not the world.
  Smoke asserts that fifty ticks inside the window open nothing.
- **The window starts when you SEE it.** Come back from a week away and the
  convoy is arriving *now*, with your full 18 hours ahead of you. Losing a node
  to a window you were never shown is the kind of surprise the rescue-window
  house rule exists to forbid. A week away produces exactly one counter-
  offensive, not fifty.

### The fight
The defence is the node's **own garrison**, escalated — no new encounter data,
which is the whole reason this can be the endless-mode content engine. The
escalation grows every time you hold the same place, so the ramp is opt-in and
self-paced instead of front-loaded.

**The escalation had to become a continuous dial.** The first draft stepped the
authored tier by one and added a reinforcement wave. Measured against the
harness's yardstick team of three at prismatic, that was catastrophic:

| node | assault | +1 tier & +1 wave | +10%, same garrison |
|---|---|---|---|
| Old Barn | 100% | 25% | 100% |
| Downtown | 100% | 0% | 98% |
| Checkpoint | 93% | 22% | 88% |
| Precinct HQ | 30% | 0% | 12% |
| Guard Post | 55% | 3% | 42% |

The tier ladder is a ladder of *content* and its rungs are deliberately uneven,
so it is the wrong dial for "the same fight, but harder": +1 tier on an
already-top-tier boss is a wall while +1 on a mid encounter is a shrug. The
engine's `tierScaleFor` now honours a `scaleOverride`, and a defence is the
authored scale × 1.10, +0.10 per successful defence.

**Node choice went uniform, too.** Weighting it by income reads beautifully —
"they go for the throat" — and plays badly: your richest node is the commander's
HQ, which is also the hardest fight on the ladder, so almost every counter-
offensive landed on the one you were least able to answer.

### Stakes
Contested income is **suspended** — that is the sting, and it is why answering
beats ignoring even when you could retake the node later. Holding the line pays
a 1.6× purse, notoriety, and **the wreckage**: one vehicle from the garrison
goes to Containment, because a conquest reward has to expand what you can
*build* with (Law 2). A garrison of people leaves nothing behind, which is
correct; a commander does, once you follow his transform, so what you impound
at the Precinct is the Clampdown 9000 you actually beat.

Lose the defence, or let the window close, and the node drops back onto the map
as an ordinary objective. A setback, never a deletion.

### Kept honest
25 new smoke assertions, every one verified to fail when the code it guards is
broken. Three of them didn't discriminate on the first pass — the concurrency
cap was never actually tested, the wreckage transform chain was never reached,
and the Splice-Dex assertion was already satisfied by the conquest that set the
fixture up. Fixed the tests, not the code. Browser pass at 380 and 320px: the
alert card, the map state, the suspended-income line, the briefing quoting
110% strength, a real defence launching into the arena at `enemyScale 1.595`,
and the window closing to take the node. v13 → v14 migrated live, no console
errors.

Save **v14**. `sw` cache `spliceworld-v14-contest`.

### Next session's first task
The monologue/story pass on the rival profile schema. *(Shipped in Session 22.)*

## Session 20 — Rehabilitation ✅

§3.6 always promised a captured chimera two futures — "salvage its engineered
parts **or**, post-v0.1, rehabilitate it into your roster." Only the bandsaw
was built. Now the other one is.

### The fork
A Containment bay shows both offers with their real numbers before any money
moves:

| | costs | yields |
|---|---|---|
| **Salvage** | nothing, instantly | its parts, at the grades its old lab raised |
| **Rehabilitate** | a fee, a real-world clock, and those parts | the whole creature |

Picking one forecloses the other: a specimen in the programme cannot also be
dismantled, and pulling out returns it to the bench but not the fee.

### It is a facility purchase, not a new system
The whole feature is gated by a **Containment track in `facility.json`** — the
same shape the Surgery Theater already uses, so `nextUpgrade`/`buyUpgrade` and
the Ranch's Facility card picked it up with zero engine edits. Tier II (the
Reorientation Wing, $700, needs the Checkpoint — exactly when rival chimeras
first become capturable) unlocks it; Tier III (the Enrichment Annexe, $1800,
needs the Precinct) halves the clock and takes a third off the fee. `grants`
carries `rehab` / `hourScale` / `feeScale`; `tuning` carries the rest.

### Two knobs, deliberately separate
- **The clock releases it.** Length scales off the specimen's power and
  instability. Enrol one and forget about it and it still graduates — bond 0,
  and it will freelance on you until you train it.
- **The sessions decide who walks out.** Each buys bond and shaves
  instability.

The first draft let sessions take hours off the clock *as well*, which quietly
made the **shortest** programmes — the scrappiest, easiest specimens — the ones
you could invest in least, because the curriculum no longer fit inside them.
Smoke caught it on session 4. The gap between sessions is now a share of the
programme's own length, so the whole curriculum always fits however short the
programme is, and the clock never moves.

### What graduates
A real chimera, not a trophy. It keeps its name (it was somebody before you met
it), its chassis, and its grades; its parts become vault-shaped tokens whose
lineage names the specimen, so it extracts and salvages later like anything you
built. It arrives **settled** — the programme was the settling — and **wary**:
its old instability plus a wariness penalty, minus whatever the sessions bought.

The pitch is that it is off-menu. The acceptance test rehabilitates Professor
Trench's L-frame specimen and then asserts the player's own Tier I Theater
would refuse to assemble it.

### Kept honest
16 new smoke assertions, every one verified to **fail** when the code it guards
is broken — including the two-organ socket guard, which no rival build
exercises, so it got a fixture of its own. Browser pass at 380 and 320px: the
fork, the countdown, an enrichment session, a reload mid-programme, a warp past
the deadline into the Pens, and a v12 save migrated live (legacy bays gain ids
and still salvage). One real bug found and fixed: the "needs the Reorientation
Wing" pill inherited `flex: 0 0 auto` from the node tags and walked the page
sideways at 380px.

Save **v13**. `sw` cache `spliceworld-v13-rehab`.

### Next session's first task
Region contestation — the coalition counter-attacking a held node. *(Shipped
in Session 21.)*

## Session 19b — Colour tokens, five schemes, and Biohazard shipped ✅

Every colour in the game is now a semantic token. 83 hardcoded hexes had crept
into `style.css` over eighteen sessions; they are all gone, replaced by a
palette of surfaces (ink / panel / panel-2 / well), roles (danger / warn / hp /
sta) and the three class colours. `--goo` and `--zap` survive as aliases so 200
existing rules did not need rewriting.

**A scheme is one block of variables.** Five ship in `style.css`:

| id | character |
|---|---|
| `lab` | today's palette — indigo, acid green, violet |
| `biohazard` | charcoal, toxic lime, hazard amber |
| `vivarium` | sea-navy, aqua, hot magenta |
| `blueprint` | slate, cyan, warm cream on ochre |
| `saturday` | warm plum, tangerine, mint |

**Biohazard is the shipped scheme.** It lives in `:root` rather than behind an
attribute, so a fresh load paints it before any JS runs and the manifest's
`theme_color` has something true to point at. The old indigo moved to
`[data-theme="lab"]`, and `settings.theme` / `?theme=` still reach all five —
the default deliberately is *not* recorded into saves, so changing it stays a
one-line change rather than something every existing lab is pinned against.

One rule the schemes are built around: the **class colours stay
distinguishable in every one**. Ground/Water/Air is a mechanic, so it never
collapses into a scheme's accent. That is also the argument against keeping
`lab`: its violet is both the brand's second colour *and* the Air class.

### Next session's first task
The remaining backlog: rehabilitation of captured chimeras, region
contestation, the monologue pass.

## Session 19 — The arena is one screen ✅

The complaint was that a fight was a scrolling column of panels, not a fight.
It is now laid out the way turn-based creature battles have been laid out since
1996.

### Staging
- Foe **up and to the right**, you **down and to the left**, each on a lit
  platform. Both **face each other**: everything is drawn facing right, so the
  foe's zoom wrapper is mirrored — and because the sprite is that wrapper's
  child, one set of keyframes reads correctly on both sides (three flipped
  keyframe copies deleted).
- HP boxes are **overlaid on the field** in the opposite corners, Pokémon-style:
  name, class chip, remaining-fighter pips, HP bar, status as icons. Yours adds
  stamina, and the Containment Cannon bar only when there is something to
  capture.
- A zoom wrapper crops the renderer's generous viewBox padding so a chimera
  fills its slot — and enemy *units*, whose viewBox is already tight, are told
  apart by a `kind-` class so a Riot Squad does not get its helmet cropped off.

### One screen, no scrolling
`body.in-battle` locks the shell to `100dvh`, hides the tagline, shrinks the
header and tabs, and lets the stage flex. Everything that used to be a stacked
panel is now an overlay or one tap away:
- the **battle log** moved behind a ▤ button on the message box,
- the **team tray** became pips on your HP box,
- **moves past four** live behind a "More moves" cell that opens the existing
  picker sheet, with the same effectiveness badges.

Verified to fit with the command menu fully on screen at **320×568, 360×640,
390×780 and 412×915** — the stage flexes from 279px to 594px.

### The command menu
A 2×2 of moves (name, power, cost, and what it will actually do to the fighter
in front of you) over a utility row of Breath / Switch / Retreat / Cannon.
`pendingReplace` swaps the grid for the bench; a charging move gets its own
release cell.

### Verified
`node tools/smoke.js` and `node tools/bounds.js` green (the engine is
untouched — this is a renderer change). CDP: a patrol and a rival duel end to
end, floats and KO animation firing, the More-moves sheet, the log sheet,
`in-battle` cleanly removed when the fight ends or you change tabs, and no
console errors at any of the four viewports.

### Next
Colour schemes: five palettes for the whole game, to pick from.

## Session 18 — Variants via mutation ✅

The third kind of mutation, deferred since M6 with a comment in `breeding.js`
that said so. §3.2: *"very rarely a variant species (Alpine Ram from Ram,
Abyssal Shark from Shark) — variants are the cheap roster multiplier."*

### Six species for six JSON objects
A variant declares `variantOf` and **inherits its base's anatomy** through
`tools/gen-parts.js` — same shape families, same signature ability — while
carrying its own palette, tags, thermal band, set bonus and `statMult`. Roster
25 → **31 species, 148 → 182 parts**, no new shape code.

| variant | from | it becomes | it gives up |
|---|---|---|---|
| Alpine Ram | Ram | +50% armour, +30% HP, Armored | speed |
| Abyssal Shark | Shark | +50% armour, +30% power | speed, regen |
| Thunderhead Eagle | Eagle | **Electric on every strike** | a quarter of its HP |
| Glider Skunk | Skunk | a patagium: its limbs vote **Air** | power, HP, armour |
| Iron Tortoise | Tortoise | double armour, +40% HP | half its speed |
| Pale Cobra | Cobra | +35% power | HP and armour |

### The sidegrade contract
A variant that is better at everything makes its base **dead content** the moment
you breed one. So smoke asserts every variant gives something up *and* gains
something, and measures it: purebred variant vs purebred base at apex, team of
three, gave Ram 62% / Alpine 64%, Shark 73% / Abyssal 73%, Cobra 3% / Pale 2%.

Two failed that bar on the first pass and were re-tuned rather than shipped:
- **Alpine Ram at 48% vs 62%** — Wall role × `statMult` double-dipped the same
  stat, so it hit softer *and* slower. It is a Punisher now, with its damage
  back at parity and armour/HP as the actual trade.
- **Glider Skunk at 0% everywhere** — a blanket `moveTag: Gas` put Gas on every
  damaging move, and Gas does **zero** to vehicles, which are half the roster.
  Its real mutation is the patagium; Gas stayed on the Stink Gland where it
  belongs. It sits at 90% now — below the Eagle among Air builds, which is the
  honest comparison once a variant changes class.

### Bred, never bought
`mailOrderPrice: null` on all six, asserted against the live catalog rule. They
arrive as the rarest branch of the existing mutation roll (30% of the 8% that
fires, and only where the stock has a variant to become) — measured at **under
10% of eggs from ordinary parents over 400 rolls**.

Then heredity does the work the roadmap wanted: **a variant breeds true.** Two
Alpine Rams give an Alpine Ram >70% of the time; a cross with a plain Ram gives
both, so a lucky mutant is worth crossing back into a good line rather than
kept in a corner. `canBreed` compares **base stock**, so an Alpine Ram is still
a ram.

### A regression this phase surfaced
The generic forelimb and hindlimb abilities shared a name (`Goat Strike`), and
last session's duplicate-move guard matched on name alone — so **every species
had been quietly losing its Ground-tagged kick**. Hindlimbs got their own name
(`Goat Kick`), the guard now matches the whole move, and smoke asserts arms and
legs are different moves for every species.

### It also fixed a structural shortage
Air had **four parts in the entire game** — flagged twice in earlier sessions.
The Glider Skunk's patagium and the Thunderhead's wings take it to **eight**.

### Verified
`node tools/smoke.js` green with a new variants block: the sidegrade contract,
anatomy inheritance, never-in-the-catalog, lineage helpers, the picker and the
breeding rule agreeing on who may pair, true-breeding rates, mutation rarity,
the Dex trophy firing once, variant extraction, and the move-name regression.
Four assertions deliberately broken to confirm they bite. `bounds` clean, the
difficulty curve unmoved by a 24% bigger roster (33/47/62/75), `--plant` caught.

CDP at 380px: v11→v12 migration, the Dex trophy case locked (0/6) then unlocked,
a variant pair breeding and hatching, both ceremonies (**NEW VARIANT SPECIES**
and **THE LINE HOLDS**), the incubator naming base stock so the hatch is not
spoiled, and extraction yielding Alpine Ram parts.

### Known issues
- A variant that changes class changes matchups by a lot — the triangle doing
  its job, but it means Glider Skunk vs Skunk is not a like-for-like comparison.
  The AI director does read such a stable as Air and answers it.
- Pale Cobra inherits the cobra's limbless corner: both are weak purebreds.

### Next session's first task
Open. Remaining backlog: rehabilitation of captured chimeras, region
contestation, and the monologue/story pass.

## Session 17 — Theater Tier II, and a Facility to buy it from ✅

ROADMAP §3.4 has always said "Organ ×1, **×2 at Theater Tier 2**", and §3.10 has
always said upgrades are menu purchases. Both landed together, because a second
organ bay you are simply handed is not an upgrade — it is a balance change.

### Socket ids, not slot types
The genome was `{ frame, parts: { slot: partId } }`, so a second organ had
nowhere to go. Now `parts` is keyed by **socket id**: usually the same string as
the slot type, except where a frame offers more than one bay. `organ2` resolves
to slot type `organ` via `slotOfSocket()`.

The payoff is that **every genome ever saved is still a valid genome** — old
saves simply never mention `organ2`. `validateGenome`, `validateSplice` and
`spliceChimera` all moved to socket ids; `spliceChimera` in particular now keys
`chimera.tokens` by the socket the player *chose*, not the part's slot, or two
organs would quietly collapse into one bay.

### A Facility, not a hardcoded tier
`data/facility.json` declares tracks of levels, each carrying `grants`. The
Surgery Theater asks what frames and sockets it may build with; it does not
know what a "tier" is. Adding Tier III, or the Gene Scanner and Extractor
tracks §3.10 names, is a JSON edit.

- **Tier I — Card Table & Optimism**: S and M frames, six bays.
- **Tier II — The Rumbler Rig** ($900, requires holding the Highway
  Checkpoint): the **L-class chassis** and the **second organ bay**.

Gated on money **and** territory, because Law 2 says conquest must expand
creation. All the money in the world will not skip the objective, and the
objective will not skip the money — both asserted.

### Never take a frame away
The L frame used to be free to everyone. Rather than repossess it, the v11
migration **grandfathers** any save that has ever built on one straight to Tier
II. Verified in the browser both ways: a v10 save with an L chimera lands on
Tier II, one without lands on Tier I.

### What the money buys, measured
+5pp at standard, **+9pp at prime and apex**, +4pp at prismatic (team of three,
median build) — a real upgrade that does not break the curve the last session
built. No new degenerate builds at any grade. On one creature: an apex gorilla
Rumbler goes 146→155 HP and 72→86 stamina with a wolf organ in the second bay,
for 5 more mass.

Two bays of the *same* organ stack their stats but no longer produce two
identical move buttons — Tier II made that possible for the first time.

### Details that would have been bugs
- The physiology panel's Chassis row counts the bays you can actually fill, so
  it says `6/7` at Tier II instead of quietly congratulating you at `6/6`.
- `tools/bounds.js` now checks every socket a slot can occupy, not one per slot
  type, so a badly-placed future bay is caught the same way a cropped tail was.
- A draft holding a locked frame or bay corrects itself silently instead of
  erroring at the player.

### Verified
`node tools/smoke.js` green with a new Tier II block — socket/slot resolution,
every frame carrying the bay, the two-part gate, the Theater refusing the
Rumbler *by name* and the second bay *separately*, a seven-socket splice that
renders, and the stat/move contract. Four assertions deliberately broken to
confirm they bite. `node tools/bounds.js` clean; `--plant` still caught.

CDP at 380px: both migration paths, the locked Facility card naming both
blockers, the purchase (funds charged, news line, track maxed), the Theater at
Tier I with the Rumbler struck through, then Tier II with seven bays — filled
all seven, spliced, and the creature renders with **both organ glyphs visible**.

### Known issues
- The Facility has exactly one track. Gene Scanner, Extractor efficiency,
  Infirmary speed and Containment Cannon mk2 are all the same shape when their
  systems are ready for them.
- `organ2` is the only extra bay; a Tier III with a second hide or forelimb pair
  would need socket geometry, not new plumbing.

### Next session's first task
Open. The remaining backlog is variants via mutation, rehabilitation of
captured chimeras, and region contestation.

## Session 16 — AI Director: the world studies you ✅

The tracking stub has been collecting `directorStats` since M0 on the promise
that something would eventually read it. This is that session.

### What it reads
Three inputs, in rising order of how much they sting:
1. **your live stable** — and per *creature*, by the same majority vote the
   battle engine uses, not per part. That distinction is the whole mechanic:
   ~32 parts vote Ground against Air's 4, so a part-count read calls every
   stable "Ground" and diversifying buys you nothing. (`rivals.js` had the
   same bug; both now share one definition.)
2. **your splice history** (`directorStats.partUse`), for tags.
3. **every dissection you let complete** — weighted as exactly one creature
   you are still fielding. Enough to tip a balanced stable back into being
   legible; not so much that a single loss is a permanent tax.

### What it does
`data/director.json` declares seven counter-rules — what each *reads* (player
tags and/or a class) and which roster units answer it. The director rewrites
**one wave slot**, under hard constraints found by measuring, not by guessing:

- **Never the opening beat, the final wave, or anything that transforms.** The
  first draft cheerfully swapped Captain Clampdown out of his own boss fight.
- **Never a mercy rule.** It replaces the *flimsiest* expendable slot and only
  with something at least as heavy; if nothing there is expendable it sends an
  **extra** wave instead. The first draft made `air_patrol` go 23% → 90% for an
  Armored build by replacing the helicopter with a counter that was weaker.
- **A budget, not a tier threshold.** It starts with one encounter — the
  hardest, where the budget is — and reaches further down as you take territory
  and lose creatures. Tiers are lumpy (four encounters share tier 3) and
  crossing one wholesale turned a pressure into a **-22pp wall**.

### Measured
Tax on the median build, all-Ground stable, team of 3, apex: **-2pp** early
(1 encounter adapted) rising to **-20pp** deep in a campaign with dissections on
file (6 adapted). Against the stable it actually read, on the encounter it
rewrote: Ground 98% → 75%, Water 35% → 10% on `military_response`.

**The escape hatch works, and it is the point:**

| stable | reads | tax |
|---|---|---|
| committed to one class | that class | **-13 to -16pp** |
| one of each | nothing — no dominant class | **-2pp** |
| one of each, after losing one | the dissected class | **-16pp** |
| pivoted away after the loss | nothing again | **-2pp** |

### Legible by construction (Law 4)
A director you cannot see is a difficulty knob. So: a **dossier** in the War
Room showing what they have filed on you and whether they are acting on it, an
**intel line** in the briefing naming the swap before you commit a team, and a
**news wire** item the first time each countermeasure reaches the field
("County leases a helicopter. The invoice line reads 'anti-goat measures.'").

### Save v10
`directorStats.announced` so a rule only makes the papers once. Additive; the
rest of `directorStats` is untouched and its history is exactly what the
director reads. v1→v10 chain tested.

### Verified
`node tools/smoke.js` green with a new director block — gating, the per-creature
class read, the escape hatch, the dissection weighting, reach growth, boss
protection, the never-a-mercy-rule contract (with a synthetic stacked encounter,
because the live roster rarely exercises it), one-shot news, and that being
predictable actually costs you. Three assertions deliberately broken to confirm
they bite. CDP at 380px: v9 → v10 migration, dossier, intel line, the swapped
wave reaching the battle, the news item, and all four escape-hatch states.

### Known issues
- The director only ever swaps one slot; multi-slot pressure and per-*unit*
  counter-loadouts (the roadmap's "flak trucks and net batteries") are still
  a single unit each.
- Rivals still counter-bias through their own path rather than the director's;
  they now share the class read, which is the first half of merging them.

### Next session's first task
Open. The audit's remaining backlog is Theater Tier 2 / L-frame slots, variants
via mutation, and region contestation.

## Session 15 — Balance pass: the curve that was never there ✅

The prismatic complaint carried for three sessions turned out to be the small
half of the problem. Fixing the measurement came first.

### The harness was measuring the wrong game
`tools/sim.js` fought every encounter with **one** chimera. The game hands you
**three**. Two different games:

| | solo | team of 3 |
|---|---|---|
| standard grade, median | 7% | **69%** |
| every encounter but two | 0% | **100%** |

So the previous sessions' notes were both wrong: prismatic wasn't the problem
(the *whole ladder* was free), and **seven of the eight `[TRASH]` builds were a
measurement artifact**, not dead content. New `--team=N` flag; three is now the
default for encounter tuning, solo stays available for comparing builds.

### The real bug: frames carried the creature
A 1-part L frame had **109 HP**; filling all six sockets bought **8 more** — and
cost 7 regen, because every part adds metabolic draw. The dominant strategy was
*biggest chassis, fewest parts*, which is exactly what the physiology panel warns
against. The panel was right and the mechanics were wrong.

Health now lives in the anatomy. Frame HP S/M/L 55/70/105 → **22/30/42**; every
slot carries real HP (hide 5 → 20, head 4 → 12, and so on) via `tools/gen-parts.js`,
so all 148 parts were regenerated rather than hand-edited. Same L frame today:
**54 HP bare, 106 HP full.** Filling sockets nearly doubles you.

### A difficulty curve, at last
Each encounter declares a `tier`; `tierScale` in `enemies.json` multiplies unit
stats at battle time. One authored roster now covers the whole campaign — a Riot
Squad at the National Guard Post is the same unit, three tiers of budget later.
**Tier 1 is scaled *below* the authored stats on purpose**: a new player fields
exactly one chimera of standard parts, and losing it means a capture.

### The grade ladder is a staircase
1 / 1.25 / 1.5 / **2.0** → 1 / 1.2 / 1.4 / **1.65**, and the move bonus 15% → 12%
per tier so grades stop double-dipping. Prismatic was a leap that turned every
wall into a formality in one husbandry tier.

### Rivals were the easiest content on the ladder
Tuned against a lone chimera, they folded against a real team. Power, team size
and grade ladders raised; `powerCap` lifted so rematches still iterate.

### Measured result (team of 3, median build)

| | std | prime | apex | prismatic |
|---|---|---|---|---|
| **overall** | 33% | 45% | 58% | 75% |
| tutorial patrol | 100% | 100% | 100% | 100% |
| checkpoint / air / harbor / rescue | 0–80% | 60–100% | 100% | 100% |
| Precinct boss | 0% | 0% | 40% | 100% |
| military response | 0% | 0% | 40% | 100% |
| rivals | 0% | 0% | 0% | 0–20% |

Every grade opens a new band; rivals sit above the human roster. The triangle
still decides them — at prismatic, counter ≈ 87–100%, mirror ≈ 37–67%, wrong
class ≈ 0–13%.

**Degenerate builds: 7 OP + 8 TRASH → 1 OP (at standard only) + 0 TRASH.**
The one survivor is a light 3-part build 66% vs a 32% peer median — a wide
spread at the lowest grade is build quality mattering, not a defect.

### Guarded
Smoke now asserts the shape, not just the plumbing: the grade ladder is evenly
stepped, the curve only rises, tier 1 is a tutorial band, a tier-less encounter
fights at authored stats, rivals are never tier-scaled, **a full build is worth
at least 1.6× a bare frame**, and the sim's own ordering (tutorial winnable at
standard, boss not; prismatic answers the boss; rivals harder than the boss).
Three assertions were deliberately broken to confirm they bite.

### Verified
`node tools/smoke.js` green in 1.7s. `node tools/sim.js --plant` still caught.
CDP at 380px: a v8 save migrates to v9 and plays; a fresh save's guided first
splice (94 HP) beats the tier-1 patrol (38 HP) and takes the node; the Theater
shows an empty M slab at 30 HP against 94 HP fully built. No console errors.

### Next session's first task
AI director — the counter-bias plumbing already works for rivals; generalise it
to the human roster.

## Session 14 — Battle overhaul: turns you can actually see ✅

The complaint was exact: *"there isn't obvious turns. I just press attacks and
get attacked at the same time."* True — the engine resolved a whole round in one
synchronous call and the arena printed the receipt. Fixed at the seam, not with
a rewrite.

### `step()` now returns a replayable stream
- Every event carries `{ text, kind, actor, target, amount, mult, snap }` where
  **`snap` is a frozen snapshot of the battle at that instant** — both fighters'
  HP/stamina/status/stages, the bench, waves left, cannon charge.
- One helper (`makeEvents`) wraps the log, so ~64 `events.push('…')` call sites
  kept working untouched; only the beats worth animating got annotated.
- The engine stays synchronous and DOM-free — `tools/sim.js` is unaffected.
- New export `turnForecast(battle)` so the UI can say who strikes first *before*
  you commit to a move.

### The arena is a player, not a printer
- Beats replay on a timer (620ms for a hit, 900ms for a KO, 1.1s for a rival's
  monologue), driving the HUD **from each snapshot** rather than from live state.
- A **phase strip** names whose beat it is — `YOUR MOVE` / `ENEMY MOVE` — and the
  acting fighter's panel takes the spotlight. That is the fix for "no obvious turns".
- Floating damage numbers, coloured by effectiveness (crit gold, resisted grey,
  MISS / NO EFFECT). Lunge, hit-shake, KO flop, wave-in slide, buff/debuff pulse.
- Actions lock during playback with **▶ tap to skip** — an immediate flush that
  runs every remaining beat at once, so skipping never changes the outcome.
- Ten combat stingers added to the WebAudio synth (hit / bigHit / weakHit / miss /
  buff / debuff / ko / waveIn).

### HUD rebuilt
- Turn badge, encounter title, RIVAL DUEL / RESCUE RAID mode tag.
- Class chips on **both** fighters, stamina bar on the enemy too, wave pips,
  status chips (venom stacks, sleep, stun, trapped, guard, stage changes),
  a **team tray** with live HP for the bench.
- **Per-move effectiveness against the fighter in front of you**: `×1.5`,
  `no effect`, `armor ✗`, `⚡ first`, `2-turn`. The tag chart and the class
  triangle stop being lore you have to memorise.
- `prefers-reduced-motion` resolves the round instantly with no floats and no
  animation classes — verified in the browser, not assumed.

### Verified
- `node tools/smoke.js` green with a new block asserting the stream's shape:
  every event has text/kind/snap, snapshots are frozen **copies** (test bites if
  `copyStatus` is removed), a KO beat shows an empty bar, and the stream and the
  log never disagree. Two assertions deliberately broken to confirm they fail.
- `node tools/sim.js` unchanged: 1320 battles. `--plant` still caught.
- CDP at 380px: beats arrive one at a time with correct phase labels, floats and
  sprite animations fire, skip flushes in ~20ms, ten log kinds observed across a
  boss fight, all six tabs clean on a fresh save. No console errors, no overflow.

### Known issues
- Prismatic balance pass still pending — **next**.
- Enemy AI is still "mild preference for damage"; it will get smarter with the
  director.

### Next session's first task
The balance pass (prismatic tier + the seven `[TRASH]` purebred builds), then the
AI director.

## Session 13 — Rival Geneticists ✅

The audit's #1 deferred item, and the reason Wave 1's class triangle exists.

### Rivals field chimeras, not stat blocks
- `campaign/rivals.js` builds each rival's team from **real parts** and runs it
  through **`splice/physiology.js` — the player's own physiology**. Their HP, tags
  and elemental class are earned by anatomy, exactly like yours. A rival who fields
  Water is Water *because of the gills*.
- `battle/engine.js` grew two small seams: `unitFromGenome()` (genome → a record in
  the `enemies.json` unit shape) and `unitFor()` (a wave entry may be an id *or* an
  inline record). Everything downstream — capture, containment, salvage, knockback,
  the arena — works unchanged. Move-building is now shared (`movesFromTokens`) so
  a rival's chimera and yours can never drift apart.
- The arena draws rival chimeras from their genome. **Zero new art.**

### Three rivals, one ladder
- Dr. Mantissa (Ground, insects) → Baroness Vesper Aloft (Air) → Prof. Abyssa
  Trench (Water). Each one answers the class you just farmed off the last.
- **Gates follow counter-part availability**: you are never asked to beat a class
  before the anatomy that answers it is obtainable. Asserted in smoke against the
  *real* `faunaUnlocked` rule — the test bites if a gate is moved.
- Measured triangle (40 seeds/cell, 1 chimera vs their whole team):

  | build | Mantissa (Gnd) | Aloft (Air) | Trench (Wtr) |
  |---|---|---|---|
  | Ground | 83% | **10%** | **85%** |
  | Air | **98%** | 15% | **0%** |
  | Water | 15% | **95%** | 78% |

  Bring the counter and you win; bring the wrong class and you do not.

### They iterate, and they read you
- Every defeat raises their grade ladder, power scale, team size and purse.
- `counterBias` rivals read your stable (the `directorStats` idea, finally acting)
  and build the class that beats it — an all-Air stable makes Aloft field Water.
  Mantissa, the tutorial rival, stays honest.
- Monologue slots per §3.8 (intro / midFight / defeat / victory / dissectionTaunt)
  as data; the engine only relays `encounter.barks`, so any encounter can have them.

### The payoff loop
- Cannon a rival's chimera → Containment → salvage yields **their parts at the
  grades they actually raised**. Prismatic rival parts are a real prize, and the
  only way to get some anatomy early. Verified end-to-end in smoke.

### Save v9
- `campaign.rivals` per-rival records; containment bays carry an optional inline
  `unit` for generated specimens. Additive — old bays still resolve by `unitId`.
  v1→v9 chain tested.

### Verified
- `node tools/smoke.js` green, with ~35 new rival assertions (three checked to
  fail when deliberately broken). `node tools/sim.js` now fights rivals too: 1320
  battles, 11 encounters.
- CDP pass at 380px on a **migrated v8 save**: cards render with procedural
  portraits, gates read correctly, challenge → briefing → duel → aftermath →
  reload all clean; 0 native controls, no overflow, no console errors.

### Known issues
- Prismatic grade still flags OP builds — the balance pass is now two sessions
  overdue and should come before Wave 2 content.
- Rivals have no Splice-Dex page yet.

### Next session's first task
Either the prismatic balance pass, or AI director activation (rivals already prove
the counter-bias plumbing works; the director generalises it to normal encounters).

## Session 12 — In-game pickers: no more OS dropdowns ✅

Wave 1 pushed the last native `<select>` past its limit — a 25-species catalog on
Android opened the platform's grey scroll wheel over the game. Every native form
control is now gone from the build.

### `ui/picker.js` — one component, every choice
- `pickerField()` renders a **button** styled as a form field (label, value, hint,
  owned-count, caret). `openPicker()` opens a full-screen bottom sheet drawn with
  the game's own panels: grouped rows, sub-lines, class marks, grade badges.
- Closes on pick, backdrop tap, or **Escape**; scrolls the current selection into
  view; never leaves a listener behind. `toggleRow()` replaces checkboxes.
- Presentation only — callers own their state, so nothing about the save changed.
  **`SAVE_VERSION` stays at 8.**

### Converted
- **Theater**: 6 slot sockets — grouped by species, best grade first, with the
  ability and donor on each row.
- **Ranch**: Mail-Order Menagerie, now **grouped by elemental class** with price,
  role, tags and daily upkeep per row (and prices in red when you can't afford
  them); both Breeding Pen parents, grouped by species with stage and condition.
- **War Room**: strike-team checkboxes → toggle rows, now showing each chimera's
  class icon — plus a new **"Opposition:"** line naming the classes you're about
  to walk into, and a *"type advantage here"* note on the members who counter
  them. The triangle is finally visible at the moment you pick a team.

### Guarded
- Smoke now greps every UI module for `<select>`, `<input>` and `<textarea>` and
  fails if one comes back — plus asserts the `#picker` host exists and the service
  worker precaches the module. The rule is enforced, not remembered.
- Two robustness fixes found while testing hand-edited saves: a retired part id no
  longer crashes `combatantFromChimera` (matching the guard physiology already
  had), and a chimera missing `instability`/`bond` reads as 0 instead of `NaN%`.

### Verified
- CDP pass at 380px: **0 native controls anywhere**, no horizontal overflow, no
  console errors, sheets open/pick/escape/backdrop-close correctly, breeding runs
  end-to-end through the new pickers and the egg survives a reload.
- `node tools/smoke.js` green (now with the no-native-controls guard);
  `node tools/sim.js` unchanged at 960 battles.

### Known issues
- Prismatic grade still flags 15 OP builds of 40 — top tier wants a balance pass
  before Wave 2 (carried over from Session 11).
- Seven purebred aquatic/insect builds still flag `[TRASH]`; they're waiting on the
  Theater Tier 2 slots, not on the UI.

### Next session's first task
Rival geneticists (audit's #1 deferred item) — now that there's a real part pool
and a class triangle for them to build against.

## Session 11 — Content Wave 1: 25 species + the class triangle ✅

The audit's recommended next phase, taken further than scoped: the full roadmap
roster, not a half-step to 10.

### The class triangle (new core mechanic, ROADMAP §3.6b)
- **Ground ≫ Water ≫ Air ≫ Ground** (×1.5 / ×0.7), in `data/classes.json`.
- **Class is derived from anatomy, never assigned.** Parts carry `classAffinity`:
  wings/membranes vote Air, gills/fins/flippers vote Water, feet/paws/hooves vote
  Ground. Most votes wins; **a tie leaves the chimera Unclassed** — neutral both
  ways. Committing to one anatomy buys the matchup edge, hybridising trades it for
  safety. That's a genuine counterweight to instability, which pushes the other way.
- The physiology panel names the class, shows the vote tally, and says what it
  beats. Enemies declare a class; two new units (**Attack Chopper** air, **Harbor
  Skiff** water) make the triangle cut both ways.
- Measured working: a Ground build wins 100% vs the ground squad but **7% vs the
  chopper**; an Air build crushes ground and drowns at 13% vs the skiff.

### Content: 4 → 25 species, 24 → 150 parts
- Full ROADMAP §4.1 roster with palettes, roles, tags, ranch economics, thermal
  bands, set bonuses, incubation timers, and signature abilities.
- **Parts are generated** by `tools/gen-parts.js` from the roster + an archetype
  shape library (`tools/shapes.js`: 8 head families, 10 limb, 8 tail, 9 hide, 10
  organ glyphs). A dev tool, not a build step — the game still loads static JSON.
  Species #26 is now nearly free.
- **The audit's headline finding is fixed: all 6 tag-chart rules are live.** Every
  one was unreachable before; Electric/Sonic/Gas/Aquatic/Airborne now exist on both
  sides. Asserted in smoke so it can't regress.
- Combos 4 → **12** (the roadmap target), using the new roster.
- **Fauna acquisition fixed** — eagle and cobra were previously unobtainable. Region
  nodes now list `unlocksFauna`; conquest stocks the Mail-Order catalog.

### UI reorganised for scale
- **Theater**: parts grouped by species in `<optgroup>`s with class marks and
  per-slot owned counts; a class banner above the stage.
- **Vault**: collapsible per-species groups with counts and best grade, instead of
  a flat wall of 150 tokens.
- **Ranch**: the catalog is a select + Order button (25 species won't fit as buttons).
- **Dex**: species grouped under the three classes with a triangle legend.

### Bugs found and fixed
- **Tails cropped by the viewBox** on the L frame — 14 parts silently rendered as a
  "trumpet" taper. Rebuilt the tail library within a fit budget; `tools/bounds.js`
  now guards every part on every frame, wired into smoke.
- **A save holding a token for a retired part crashed the Vault and Theater.**
  Content is data and evolves; unknown part ids are now skipped, not fatal.
- `classes.json` was missing from the service-worker precache (offline would break);
  cache key now busts on content releases, not just save-schema ones.
- Closed the audit's onboarding finding: the panel warns on an under-built chassis
  ("this is barely a creature — it will not survive contact with a patrol").
- The sim's degeneracy detector was tuned for 3 encounters and stopped catching the
  planted combo at 6; flags are now peer-relative (median-based) and catch it at
  every sample size with no false positives on clean data.

### Balance after the wave
Grade ladder holds: mean win rate 12.3% → 25.3% → 40.2% → 69.0% (standard →
prismatic). Prismatic now flags 15 OP builds of 40 — the top tier is probably too
strong and wants a pass before Wave 2.

## Session 10b — v0.1 Audit ✅

`docs/AUDIT-v0.1.md` — measured post-ship audit (sim runs, data introspection,
coverage mapping), not impressions.

**Headline:** the engine is ahead of the content, and the gap now has mechanical
consequences — **5 of 6 tag-chart rules are unreachable in play** because the
4-species roster doesn't carry Aquatic/Electric/Sonic/Gas. ROADMAP §3.6's "the type
chart emerges from what you built" is currently non-functional, and it stalls the
AI director (nothing to counter-bias) and combo design (pool too small).

**Also found:** the minimum legal splice (head only) has a **0% win rate** at the
first node — a literal-minded new player can build a chimera that cannot win. Fix
before the next content wave.

**Healthy:** grade ladder measured at 10% → 44% mean win rate standard → prismatic
(husbandry is provably the progression axis); enemy-tech salvage tops the apex table,
validating the Containment Cannon minigame; no OP builds at standard; save discipline
(7 migrations, v1→v8 tested) and the DOM-free core are the codebase's best assets.

**Recommendation:** next phase is **Content Wave 1 (species 4 → 10)** — six species
picked to make every dead chart rule live, plus an Airborne enemy — ahead of the §9
backlog, because rivals/director/Theater-T2 all consume content variety rather than
create it. Removed one dead export (`resetTheaterDraft`) while in there.

## Session 10 — Art Quality Pass (post-v0.1) ✅

The visual pass Evan flagged during M0. Content-only where possible: 24 parts and
8 enemy units redrawn in data, plus two generic rendering techniques in the engine.
No save version change, no gameplay change — every number is untouched.

### What shipped
- **Engine (generic, data-driven):** frames gained `shadow` (ground-contact ellipse
  drawn behind the creature — they sit in the world instead of floating) and `form`
  (volume shading clipped to the silhouette: belly occlusion + rim light along the
  back). Flat-vector depth, no gradients, per-frame tunable.
- **All 24 parts redrawn** (104 → 155 shapes): two googly eyes with catchlights on
  every head (goat keeps its rectangular pupils, cobra its slit), layered muzzles and
  inner ears, sheen highlights for form, clawed paws, jointed limbs with cleft hooves.
- **Eagle wings reposed**: were reading as blades held aloft; now fold back along the
  flank with a scalloped primary edge and layered coverts.
- **Goat legs** thickened with knee joints and bigger hooves (was spindly).
- **Organ art** now says something: hibernation gland has Zzz, iron gut has a gear,
  venom sac a drip, hollow-bone marrow a feather arc.
- **All 8 enemy units got faces**: organics have googly eyes and angry brows under the
  brim; **vehicles have windshield eyes with furious eyebrows** — the Police Cruiser
  and Clampdown 9000 now glare at you. Uniform detail added (lapels, belts, webbing,
  Clampdown's red tie and gold buttons).
- `tools/gallery.html` now renders the enemy roster too, so future art passes can QA
  creatures and opposition on one page.

### Verified
Smoke suite green (art is data; every existing assertion still holds), gallery QA at
several sizes, and in-app at 380px: Ranch portraits, Theater preview, and the arena —
zero console errors, no overflow.

## Session 9 — M7: Polish & Ship v0.1 ✅ — **v0.1 COMPLETE**

**Acceptance criterion:** a stranger can go from empty ranch to first conquest without asking questions — the "Path to World Domination" checklist on the Ranch walks the whole loop (care → graduate → splice → settle → conquer), derives purely from save state, highlights the current step with a plain-language hint pointing at the right tab, and retires itself after the first conquest. Verified in-browser: fresh save shows step 1; each real action advances it.

### What shipped
- **Splice-Dex** (sixth tab, "Dex"): species roster with portraits and part-collection counts, combo abilities with undiscovered entries as ??? bait, trait genes, and an enemy field guide (silhouetted ??? until fought). Discovery tracking (`state.dex`) records at extraction, salvage, battle resolution, and hatching; the v8 migration backfills it from anything a save already owns.
- **Guided onboarding** (`ranch/onboarding.js`, pure): the five-step checklist above. No tutorial flags, no scripted cage.
- **Obedience UX**: Pens cards show live obedience % with the reason ("unsettled", "instability resists") and a **Train** action (+8 bond, $5, 20h cooldown) — bond finally has a lever besides rescues; War Room briefings show obedience per fighter.
- **Audio stingers** (`audio/sfx.js`): splice, graduation (with kazoo-adjacent slide), hatch, win/lose fanfares, Containment Cannon thwoomp. Hand-rolled WebAudio (~90 lines) instead of vendoring ZzFX — same joy, zero third-party code pasted from memory; every call fails silently. Mute toggle in the footer, persisted in the save.
- **PWA**: `manifest.webmanifest` (standalone, portrait, procedural SVG icon with a googly-eye rivet) + `sw.js` service worker (network-first, cache fallback, version-stamped to `SAVE_VERSION`, precache list verified against the real file tree by the smoke test). Registered on load; installable from the deployed site.
- **TWA checklist** (`docs/TWA.md`): Bubblewrap steps, assetlinks, Play Console notes.
- Tab bar now six: Ranch · Pens · Vault · Splice · War · Dex (fits 380px).
- **SAVE_VERSION → 8** (settings, dex, chimera training); v1→v8 chain tested.

### Known issues / v0.2 candidates
- ROADMAP §9 backlog stands: rival geneticists, AI director activation (dissection + usage data is already banked), L-frame Theater T2, full combo set, variants, rehabilitation, region contestation, monologue pass, chaos-breeding, async ghosts.
- Play Store listing needs raster exports of `icon.svg` (see TWA.md).
- The art-quality pass Evan flagged: all shapes are data, so it's a content-only sweep.

**v0.1 definition (ROADMAP §5) is fully shipped: all nine milestones, M0–M7.**

## Session 8 — M6: Breeding ✅

**Acceptance criterion:** two starred parents produce a measurably better egg — **passes**, proven by Monte Carlo in the smoke suite: 150 eggs from 5★×5★ parents average >4.4 stars vs. <2.8 from 2★×2★ (gap >1.5), and selective breeding beats the mail-order catalog baseline by >1 full star. Eggs are seed-deterministic (genetics decided at conception).

### What shipped
- **Breeding & incubation** (`ranch/breeding.js`, pure/seeded): pair two same-species, opposite-sex adults (juveniles refused; cross-species romance redirected to the Surgery Theater); incubator holds 3 eggs; eggs hatch by hand after a real-world timer (`incubationMinutes` per species — goat 30 min, bear 60, per the rarity-scaling rule). Hatching requires pen space.
- **Transparent inheritance** (§3.2): each stat's potential = parent average ± mid-weighted variance with a gentle upward drift, clamped 1–5 — shallow to learn, deep to optimize.
- **Heritable trait genes** (`data/traits.json`): 0–2 alleles per trait, dominant/recessive expression, each parent passes an allele with probability alleles/2. **Dense Bones** ships as the mutation-only trait — and it has teeth: expressed donors stamp head/hide tokens at extraction, and the physiology engine pays +3 Armor (verified end-to-end).
- **Mutations** (8% at conception): stat surges or a spontaneous Dense Bones gene ("The lab denies responsibility"). Variant species remain post-v0.1.
- **Family tree with stars** (v0.1 shallow form): every egg and hatchling records its parents' names + star ratings; animal cards show "child of Alfredo ★2.2 × Gordon ★3.6" (or "origin: questionable paperwork"). Mutated eggs "vibrate suspiciously" before hatching.
- **Ranch UI**: Breeding Pen (partner select filters to compatible mates live), Incubator with palette-tinted procedural egg SVGs and countdowns, trait badges on cards. Starter goats are now always an F+M pair (the first egg is a tutorial moment, not a dice roll).
- **SAVE_VERSION → 7** (eggs, genotypes, lineage). v1→v7 chain tested headless + in-browser.
- Fix found by tests: `breedPair` labeled sire/dam by argument order rather than actual sex.

### Known issues
- Family tree is one generation deep (snapshot); a full ancestor browser is a Splice-Dex/M7+ candidate.
- One trait ships; the allele machinery is generic — more traits are pure data.
- Breeding has no cooldown; incubator slots are the only throttle (watch for degenerate egg-spam once eggs matter more).

### Next session — M7: Polish & Ship v0.1
First task: Splice-Dex screen (species/parts/combos/discoveries), then guided onboarding (first splice), obedience UX, ZzFX stingers, PWA manifest + service worker, TWA checklist. Done when: a stranger can go from empty ranch to first conquest without asking questions.

## Session 7 — M5: Campaign Shell ✅

**Acceptance criterion:** losing a battle creates a rescue mission with a live timer — **passes**. A deliberate loss in the browser produced "Nibbles CAPTURED! 'Unauthorized peer review' scheduled in 18h" with a live countdown card + Rescue Raid button in the War Room; the countdown persists across reload; the rescue raid won and brought Nibbles home injured and fonder (+10 bond). Headless: window verified in the 12–24h range, still open after an hour, expiry path removes the creature and records the dissection.

### What shipped
- **Region strip** (`data/regions.json`): Greenfield County — 4 Gen 1 nodes (Old Barn → Downtown → Highway Checkpoint → Precinct HQ boss) + a Gen 2 National Guard Post gated behind Threat Gen 2. Nodes unlock in order; each grants income/day while held and notoriety when seized.
- **Notoriety → Threat Generations**: conquest raises notoriety; crossing 60 (the boss tips it) announces Threat Gen 2 and unlocks the Gen 2 node. New Gen 2 units in data: Infantry Squad (Suppressing Fire), Jeep .50 (fast, fragile, salvageable).
- **Income ticks**: held nodes pay per real-world day via `tickCampaign` timestamps (verified to the dollar after a 24h warp). The M1 stipend remains as the floor.
- **Capture-on-loss → Dissection Countdown → Rescue Raid**: on a lost assault, one downed chimera is captured (seeded pick), leaves the roster, and gets a 12–24h real-world rescue window. The rescue raid (one themed template: Evidence Impound Lot) restores it — injured, +10 bond ("you came back for me"). Ignore the window: the creature is lost ("out-of-state research internship, involuntary") and the **dissection is recorded in the AI-director stub** for future counter-bias (§3.7).
- **Containment Cannon + salvage**: the cannon charges from damage dealt *without* KO'ing (restraint minigame); at ≥100 charge it can capture weakened (≤40% HP) salvageable units — vehicles. Impounded units sit in Containment; salvaging yields **enemy-tech part tokens otherwise unobtainable**: Riot Plating (Armored hide) and V8 Heart (organ), under a new `salvage` pseudo-species with its own palette and set bonus.
- **War Room screen** (replaces the Battle tab): notoriety/threat/territory header, region map, captive cards with live countdowns, Containment bays, news wire — and the assault/rescue briefing + arena flow lives inside it.
- **News ticker reacts to the campaign**: conquests, captures, rescues, expiries, and threat-level changes push lines; the footer ticker shows the latest.
- **SAVE_VERSION → 6** (campaign, news, dissections; in-flight v5 battles gain cannon/capture fields). v1→v6 chain tested headless + in-browser.

### Known issues
- Rescue raids can be retried without limit inside the window (no cost beyond injuries); consider a cooldown if it feels cheap.
- Region contestation, rehabilitation of captured units, and the AI director acting on dissections remain post-v0.1 backlog per ROADMAP.
- The aftermath's `.ranch-msg` line lives per-screen; battle summaries only show in the War Room's Last Sortie card.

### Next session — M6: Breeding
First task: pairing UI + incubation timers (eggs on timestamps), then genetics inheritance (stat potential = weighted parent average ± variance), family tree with stars, one mutation trait. Done when: two starred parents produce a measurably better egg.

## Session 6 — M4.5: Balance Harness ✅

**Acceptance criterion:** it catches one broken combo planted on purpose — **passes**. `node tools/sim.js --plant` injects an Injection combo with power 500 / cost 0; the harness flags every build carrying it as `[OP] wins 100% in ~2 turns — nerf something` and exits nonzero if the plant escapes. Also asserted in the smoke suite.

### What shipped
- **`tools/sim.js`** — headless Monte Carlo using the exact browser battle engine (the DOM-free rule paying off): seeded build sampling (all purebreds + all combo pairings + random mixes), a fixed naive greedy pilot as the yardstick, N seeds × all encounters per build. Outputs a win-rate table (overall + per encounter + avg turns) and flags `[OP]` (≥85% wins, ≤5 turns) and `[TRASH]` (0% everywhere) builds. ~500 battles in <50 ms. `npm run sim`, with `--builds/--seeds/--grade/--plant`.
- **It immediately found two real problems:**
  1. **Engine crash**: a KO or Knockback swapping a fighter mid-round let the other side's pre-chosen move index land on the replacement's different moveset (crash/wrong move). Fixed: actions are bound to the combatant they were chosen for; mid-round replacements drop stale orders (which also gives correct Pokémon behavior — a freshly swapped-in fighter doesn't act that round).
  2. **Game-wide tuning failure**: at standard grade, *every* build lost *everything* (best: 33% overall). Data-only rebalance — frame HP/stamina/regen up (S 30→55 HP, M 50→70, L 80→105), Gen 1 enemy power/HP down ~25% — landed the intended curve: patrol 1 ≈75–100% for reasonable standard builds, patrol 2 partially open, boss ≈0% at standard but **100% for good apex builds** (the grade ladder is provably the power curve; asserted in smoke).
- Smoke integration: clean data has no OP flags at standard; the planted combo is caught; apex raises the boss ceiling over standard.

### Known issues / balance notes for the next pass
- S-frame solo builds still flag TRASH at standard (glass chassis). Partly by design — scampers are flight/speed platforms and real play fields teams of 3 (the sim pilots solos) — but worth revisiting when temperament/set bonuses gain mechanics.
- The pilot is deliberately naive (greedy biggest move); a smarter policy would shift absolute numbers but not the relative table.
- Venom-heavy builds underperform vs. the cruiser/9000 by design (chart: Venomous ×0.5 vs Vehicle); watch that Gen 2 doesn't make venom dead.

### Next session — M5: Campaign Shell
First task: region strip in data (3 nodes + commander boss), notoriety Gen 1→2, income ticks while held; then capture-on-loss → dissection countdown → rescue raid template, Containment + salvage, news ticker reacting to events. Done when: losing a battle creates a rescue mission with a live timer.

## Session 5 — M4: Battle Engine ✅

**Acceptance criterion:** a full battle plays out and Law 1 fires — **passes**. Full battles run headless (deterministic, seed-reproducible logs) and in-browser through real buttons at 380px; every KO'd chimera leaves with an Infirmary timer that blocks redeployment (the browser QA run lost to the boss's second stage and both fighters landed in the Infirmary — the aftermath literally says "breed, raise, splice").

### What shipped
- **Battle engine** (`battle/engine.js`, pure/DOM-free/seeded): Pokémon structure — one active fighter per side, bench of up to 3, switching costs the turn, speed + Priority ordering. The battle object is plain serializable state inside the save (`SAVE_VERSION` 5): mid-battle reload resumes exactly (verified: same foe HP, same log, deterministic continuation via seed + rollCount).
- **Physiology → combat, verbatim**: battle stats are the panel's numbers (HP/Power/Armor/Speed/Stamina pool, net regen minus metabolic draw — "runs hot" builds bleed stamina every turn). Moves cost stamina instead of PP; unaffordable moves drop off the menu; Catch Breath is always available.
- **Moves come from parts**: each part's `move` (power/cost/acc/tags/keywords) in `parts.json`; hides + most organs are passive (stats only); combos grant their bonus move; grades upgrade moves (+15%/tier — the Apex/Prismatic "upgraded ability" rule).
- **Keyword resolver**: recoil, venom (stacking, useless on Vehicles), stun, sleep, trap (blocks switching), guard, priority, charge (2-turn), ignoreArmor/ignoreGuard, knockback (rotates the other side's fighter), acc/power/evasion stages, staminaRestore, heal. Full ~30-keyword vocabulary listed in `data/keywords.json`; unimplemented ones are marked reserved.
- **Data-driven tag chart** (`keywords.json`): Electric≫Aquatic, Ground misses Airborne, Sonic ignores Armor, Gas vs Vehicle = nothing, etc.
- **Gen 1 enemies** (`data/enemies.json`): Riot Squad (Shield Wall), Net Trooper (Net Toss), Tranq Team (Sleep darts), Police Cruiser (Sonic siren, Vehicle/Armored) — all with procedural-SVG drawings and zero-death KO lines — plus **Captain Clampdown**, who slams a big red button mid-fight and transforms into The Clampdown 9000 (charge cannon). Encounters (2 patrols + boss) with wave lists and rewards.
- **Rejection & obedience** (§3.5): deploying unsettled = −25% power/speed + raised command-ignore chance from instability (bond will lower it); ignoring chimeras improvise a move of their own.
- **Battle screen**: briefing (team picker with ready/unsettled/Infirmary states + war record) → arena (sprites, HP/stamina bars, status icons, log, action grid) → aftermath.
- **Law 1**: KO'd chimeras get cartoony injuries ("Bent Whiskers") with 2–4h Infirmary timers, shown in Pens, blocking deployment. Wins pay confiscated budget.

### Known issues
- Enemy AI is weighted-random; the M4.5 harness is the tool to tune it.
- Capture (Containment Cannon, capture-on-loss → dissection countdown) is M5 — losses currently cost injuries + the record only.
- Set bonuses (purebred) and temperament perks still display-only; wire them when M4.5 exposes balance numbers.
- Battle briefing team draft is screen-local (unsaved), like the Theater draft.

### Next session — M4.5: Balance Harness
First task: `tools/sim.js` — Monte Carlo over part combos vs. the enemy roster using the same battle engine, win-rate tables, degenerate-build flags. Done when: it catches one broken combo planted on purpose.

## Session 4 — M3: Surgery Theater ✅

**Acceptance criterion:** the panel correctly explains why the flightless hippo can't fly — **passes**. Our hippo is apex eagle wings + dense bear parts on the L Rumbler frame: the Flight row reads "FLIGHTLESS — Lift 135 cannot hoist 218 mass… try a lighter frame or fewer dense parts," and switching the same build to the S frame live-flips it to "FLIGHT-CAPABLE — Lift 135 comfortably hoists 98 mass." Verified headless (assertions on the row text and numbers) and in-browser through the real selects.

### What shipped
- **Physiology data on all content**: every part now carries `stats` (hp/power/armor/speed/stamina/regen), `phys` (mass, metabolic draw, lift on wings), and its own `tags`; frames carry base `phys`; species carry `thermal` comfort bands and purebred `setBonus` definitions. New `data/combos.json` with 4 combo abilities (Injection, Orbital Headbutt, Squeeze Play, Slipstream — effects wire up via M4 keywords).
- **Physiology engine** (`splice/physiology.js`, pure): computes power-to-weight, speed after mass penalty, stamina pool + net regen vs. draw ("runs HOT" warning), thermal band as the intersection of donor species bands (disjoint bands = thermal chaos → instability), flight (lift ≥ mass; grade multipliers apply to lift, so apex wings out-hoist standard), purebred detection, instability, settling forecast, combo detection — every metric returned as a row with a plain-language explanation (Law 4).
- **Instability & settling**: (extra species ×18) + (extra grade tiers ×8) + thermal chaos 15 − purebred 20, clamped 0–100; settling = 30 min + up to 3.5 h. Chimeras carry `settleUntil` timestamps; Pens shows live countdowns; deploy-while-unsettled Rejection debuffs land in M4.
- **The Theater replaces the M0 dev slab**: frame picker + slot selects listing only owned Vault tokens (grade + lineage in the label, cross-slot double-use blocked), live creature preview, live panel, SPLICE IT (head required). Tokens are consumed into the chimera; combo discoveries are permanent Splice-Dex entries with a toast.
- **Pens screen**: chimera roster with portraits, instability/bond, settling state, full part manifest with lineage.
- **SAVE_VERSION → 4** (chimeras, discoveredCombos; `slab` activeScreen migrates to `theater`; legacy `genome` field retained untouched). v1→v4 chain tested headless + in-browser.
- Chimera naming is seed-deterministic; director stub now counts real spliced builds.

### Known issues
- Cobra's thermal band moved to [18,40] so bear+cobra genuinely conflict (was touching at exactly 15°).
- Set bonuses, combo effects, Rejection debuffs, and stamina-burn are display/data only until the M4 battle engine consumes them.
- Chimera names aren't renameable yet (obedience/bond UX is M7 territory).
- Theater draft is screen-local and unsaved by design (an unspliced slab is a shopping cart).

### Next session — M4: Battle Engine
First task: DOM-free battle core (`battle/`) — turn loop, team of 3, switching, stamina costs from physiology, tag chart, keyword resolver — then Gen 1 human units in `enemies.json` and one commander boss with a second stage. Done when: a full battle plays out and Law 1 fires (injury or capture feeds back).

## Session 3 — M2: Extractor & Grades ✅

**Acceptance criterion:** raising a donor to Prime provably yields better parts than extracting a Juvenile — **passes** both headless (identical-genetics twins: juvenile extraction → Standard ×1.0, twin raised to Prime with care → Prime ×1.25; the formula-edge tests separately prove 3★ pampered Prime → Apex and 5★ perfect Prime → Prismatic) and in-browser through the real ceremony UI (juvenile goat → Standard tokens; second goat warped to Prime with care → Prime tokens, both side by side in the Vault).

### What shipped
- **Grade formula** (`splice/extract.js`, pure): score = (avg potential stars/5) × age factor (Juvenile 0.35 / Adult 0.75 / **Prime 1.0** / Elder 0.8) × (condition/100); thresholds Standard <0.35 ≤ Prime <0.55 ≤ Apex <0.75 ≤ Prismatic. Care has teeth: a neglected Prime donor grades Standard (Law 3). Grades carry stat multipliers (×1/×1.25/×1.5/×2) for the M4 battle engine; Apex/Prismatic ability upgrades also land in M4.
- **Extraction**: donor leaves the herd permanently → 1 DNA vial + one token per species part, every token stamped with donor name, star rating, and timestamp ("essence of Bessie ★3.2" — lineage is forever).
- **Graduation Ceremony overlay**: confirm (with grade forecast) → shake/flash/poof/"~ kazoo noises ~" (CSS keyframes; ZzFX stingers arrive M7) → results card. Zero death language throughout.
- **Grade forecast on ranch cards** — the extract-now-vs-raise tension is visible live per animal.
- **Gene Vault screen** (third tab): DNA vials + part tokens grouped by slot, sorted by grade, with inline-SVG vial icons.
- **SAVE_VERSION → 3** (adds `inventory`); v1→v3 and v2→v3 migration chains tested headless and in-browser.
- **Bug fixed**: author CSS (`display:flex` on `.screen`/`.overlay`) silently overrode the `[hidden]` attribute — screens stacked and the closed ceremony overlay kept dimming and swallowing real clicks (synthetic test clicks had masked it). Fixed with a global `[hidden]{display:none!important}`; verified with hit-tested CDP clicks.

### Known issues
- Chimera extraction (salvage at one grade degraded) deferred until chimeras exist as entities (M3 settling / M5 Containment).
- Vials have no consumer yet (breeding/M6 candidate); they accumulate as flavor for now.
- Vault is read-only; the Surgery Theater starts consuming tokens in M3.

### Next session — M3: Surgery Theater
First task: turn the Splice Slab into the real Surgery Theater consuming Vault tokens (slot UI limited to owned parts), then the physiology panel with explanations, instability, settling timers, purebred bonus, 4 combo abilities. Done when: the panel correctly explains why the flightless hippo can't fly.

## Session 2 — M1: Ranch & Stock ✅

**Acceptance criterion:** neglect and good care produce visibly different animals over two real days — **passes**, proven on simulated clocks two ways: headless (48h sim in `tools/smoke.js`: cared goat 97/gleaming with sparkles vs. neglected 41/scruffy with dirt overlay) and in-browser via the dev time-warp (`?warp=48`), where the same divergence shows on the Ranch screen through the real UI.

### What shipped
- **Stock data model** (`ranch/ranch.js`, pure/DOM-free): species, sex, age stage (Juvenile→Adult→Prime→Elder from `birthAt` timestamps), hidden 1–5★ genetic potential per battle stat (UI shows `?????` until the Gene Scanner upgrade exists), condition 0–100, empty `traits` awaiting M6.
- **Care actions**: feed (costs funds per species diet) / groom / exercise / enrich, +8 condition each, 20h per-action cooldowns. Decay 0.4/h with a soft floor at 25 — absence never breaks anything (ROADMAP §8.3).
- **Offline timers**: `applyElapsed(state, content, now)` computes decay, upkeep, and stipend from timestamps on load, focus, and a 30s display tick. Negative elapsed (clock skew / warp removal) is clamped to a no-op.
- **Upkeep economy**: per-species `upkeepPerDay` + feed costs vs. a placeholder $40/day stipend (stands in for region income until M5). Starter herd (2 goats + 1 bear) runs $18/day — bears are deliberately expensive.
- **Pens**: capacity 4, +2 per expansion at escalating cost. **Mail-Order Menagerie**: goat only ($60); other species are conquest-gated per ROADMAP.
- **Ranch screen**: tabbed nav (Ranch | Splice Slab), econ header, per-animal cards with renderer-drawn purebred portraits (species→frame mapping in `species.json`), condition bars, stage countdowns, care buttons with live cooldown labels.
- **Renderer**: generic condition overlays (dirt smudges clipped to torso when scruffy, sparkles when gleaming) + `extraScale` (juveniles render small). Still species-blind.
- **SAVE_VERSION → 2** with the project's first real migration; verified against a genuine v1 save in-browser (progress, nickname, and slab genome preserved; ranch seeded; zero console errors).
- Dev time-warp `?warp=<hours>` (URL-only, never saved) for QA of multi-day behavior.

### Known issues
- Stipend is a placeholder income source; replace with region income in M5.
- Care-result messages live in `ranch/ui.js` (module state) — reset on reload, harmless.
- Condition currently has no mechanical output beyond visuals/labels; its teeth arrive in M2 (extraction grade = genetics × age × condition).

### Next session — M2: Extractor & Grades
First task: grade formula (`Standard→Prime→Apex→Prismatic` from genetics × age stage × condition) + extraction flow with the comedic sequence, then part inventory with donor lineage tags. Done when: raising a donor to Prime provably yields better parts than extracting a Juvenile.

## Session 1 — M0: Skeleton & Renderer Core ✅

**Acceptance criterion:** a bear-headed, eagle-winged goat renders and persists across reload — **passes** (verified in headless Chromium at a 380px viewport: fresh save renders the acceptance creature; random splices + manual frame/slot edits survive reload with identical recipe, nickname, and save timestamp).

### What shipped
- Repo skeleton per CLAUDE.md: vanilla ES modules, no build step, `.nojekyll` for Pages, `package.json` is metadata only (`type: module` so Node tooling can import engine code — zero dependencies).
- **Save system** (`save/save.js`): `SAVE_VERSION = 1`, localStorage, migration table, corrupt saves backed up instead of destroyed, newer-version saves refused.
- **Seeded RNG** (`util/rng.js`): mulberry32 + FNV-1a labeled streams (`rngStream(seed, 'splice', n)`); world seed minted once per save.
- **Genome→SVG renderer** (`render/renderer.js`): DOM-free string builder. 3 frames (S Scamper / M Trotter / L Rumbler) with standardized sockets (head, forelimb near/far, hindlimb near/far, tail, organ + hide overlay clipped to torso silhouette). Any part fits any socket; empty sockets are legal; far limbs auto-shaded; torso wears the hide species' palette (neutral lab-gray when bare).
- **Content** (`data/*.json`): 4 species (bear, eagle, goat, cobra), 22 parts, all drawn as data-driven shape specs — engine has zero species knowledge. Part-local space conventions documented in `frames.json` `_doc`.
- **Dev harness** (index.html): frame picker, per-slot part selects, seeded Random Splice, nickname + recipe line, news ticker, auto-save on every change. Mobile-first, no horizontal overflow at 380px.
- **Tools**: `tools/smoke.js` (headless Node: content coherence, acceptance genome, every part × every frame, genome validation, RNG determinism, save migration) and `tools/gallery.html` (visual QA grid).
- AI-director stat stub records part/tag usage per splice (ROADMAP §3.7 says ship the tracking now, act on it later).

### Known issues
- Eagle wing covert reads a bit shield-like; worth one more polish pass someday, not blocking.
- Organ glow is subtle on light hides (goat) — revisit when organs get mechanics (M3).
- Design docs still say "Splicework"/`RCJLabs/splicework`; repo is `spliceworld`. Game UI uses **Spliceworld**. Reconcile whenever Evan picks the final name.
- GitHub Pages deploy happens when this lands on `main` (Pages must be enabled in repo settings, root of `main`).

### Next session — M1: Ranch & Stock
First task: stock data model (species, sex, age stage, genetic potential, condition) in `gameState`, then care actions and offline age/condition timers from timestamps. Done when: neglect and good care produce visibly different animals over two real days.
