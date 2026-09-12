# CLAUDE.md — Splicework

Working agreement for Claude Code sessions on this repo. Read ROADMAP.md before writing any code.

## Project
Splicework: cartoony mad-geneticist ranch/splice/battle game. Browser, procedural SVG, zero art assets. GitHub Pages now (`RCJLabs/splicework`), TWA later. Solo dev (Evan), evening sessions.

## Session Protocol
- **One milestone per session.** Do not start the next milestone's work early, even if it's tempting. Ship the current milestone's "Done when" criterion, then stop.
- Start each session by reading ROADMAP.md §6 and stating which milestone is active and its acceptance criterion.
- End each session by updating a short `PROGRESS.md` (milestone, what shipped, known issues, next session's first task).
- If a milestone won't fit the session, cut scope *inside* it rather than deferring the acceptance criterion — smaller numbers, fewer species, same proof.
- **Merge to `main` when the milestone is verified. Do not ask.** A milestone that is green and sitting on a branch is a milestone the player does not have: `main` is what GitHub Pages serves, so unmerged work is unshipped work. Verified means the Definition of Done below, in full — criterion, save/load, no console errors, 380px, PROGRESS.md — plus the verification tier below. Open the PR, merge it, then restart the branch from the new `main` so the next milestone starts clean.
- Two things still stop and ask: work the acceptance criterion does not cover, and anything that would discard someone else's commits (a force-push over unmerged history). Everything else ships.

## Hard Conventions
- **Vanilla ES modules. No framework. No build step. No dependencies** without explicit approval — ZzFX (audio) is pre-approved for M7.
- **Procedural SVG only.** No image files, no sprite sheets, no emoji-as-art. Creature rendering goes through the genome→SVG renderer; UI icons are inline SVG.
- **`SAVE_VERSION` gates all saves.** Never change the save schema without bumping `SAVE_VERSION` and writing a migration function. Never reset player saves. (This is the Ascent rule; it is sacred.)
- **Seeded RNG everywhere** (`mulberry32` or similar). Battles, splices, breeding, and enemy generation must be reproducible from a seed. No bare `Math.random()` in game logic.
- **All content is data.** Species, parts, keywords, enemies, rivals, combos live in `/data/*.json`. Adding content must never require engine edits. If it does, the engine is wrong — fix the engine.
- Deploy = push to `main` → GitHub Pages. Keep `index.html` loading instantly; lazy-init heavy systems.

## Code Style
- Small modules by system: `render/`, `ranch/`, `splice/`, `battle/`, `campaign/`, `save/`, `data/`, `tools/`.
- State in one serializable `gameState` object; systems are functions over state. No classes holding hidden state.
- Timers are timestamps, not intervals: compute elapsed effects on load and on screen focus. Nothing runs in the background.
- The balance harness (`tools/sim.js`) must run headless in Node with the same battle code the browser uses — keep battle logic DOM-free.

## Tone Rules for All In-Game Text
- Gleeful Saturday-morning villain. Puns welcome. Self-aware, never mean.
- **Zero death language.** Extraction = "graduation" / "ascension." KO'd soldiers parachute away. Vehicles "retire loudly." Dissection is "unauthorized peer review" (and we always give the player a rescue window).
- News ticker lines are one sentence, deadpan: "Local zoo reports goat shortage. Authorities baffled."

## Verification (what to run, and when)
The full break battery is a **47-minute** answer to a question that changes
slowly — *do the gates still catch defects?* Gates change when a milestone
writes one. Paying it every evening was buying the slow half at the price of
the session.

**Every milestone, before merging (~10 min):**
- `node tools/battery.js --anchors` — every break still aims at real code. **0.3s.**
- `node tools/battery.js --baseline` — every gate green on a clean tree. ~7 min.
- `node tools/battery.js --only <the breaks this milestone added>` — the new rules go red on demand.
- `npm test` — **~4 min wall, ~900 CPU-seconds on four lanes, run alone.**
  Run it BEFORE or AFTER the battery, never alongside it. R154 followed the old
  "~3 min, runs in parallel" advice and starved the height gate's fold walk into
  a false red (`pens declares 20 folds to walk and the gate got into 1`), and
  R155 measured what the parallelism actually costs: alone the suite reads 237s
  wall on 3.8 effective lanes, alongside the battery 464s on 2.0. So sharing the
  box roughly DOUBLES the suite's wall time and false-reds the browser gates —
  there was never a saving to collect. (R154's own "940 CPU-s / ~8 min" was the
  contended reading; it is ~900 and ~4 min clean.) Filed as R159.

**The full battery (~47 min), on these triggers only:**
- A milestone that **changes an existing gate's logic** rather than adding one.
- Before a release, or any push to `main` that is not a single milestone.
- Every ~5 milestones, as a rot check, whether or not anything looks wrong.
- Any time `--anchors` or the baseline goes red for a reason nobody predicted.

*The evidence for the split is R133.* Its only two real findings were a gate
the **baseline** caught in 7 minutes and a stale anchor **`--anchors`** would
have caught in a second; the other 203 breaks were green twice, for forty
minutes each time. Judge every battery run by `BATTERY_EXIT`, never the
summary line — a clean break score can sit on top of a red baseline.

## Definition of Done (every milestone)
1. Acceptance criterion from ROADMAP.md §6 demonstrably passes.
2. Save/load survives a reload mid-feature.
3. No console errors on a fresh save and on a migrated save.
4. Works at 380px wide (mobile-first — this ships as a TWA).
5. `PROGRESS.md` updated.

## Delivery
When handing builds back outside the repo, include the source zip alongside `index.html` and the current ROADMAP.md (Dirtbag convention).
