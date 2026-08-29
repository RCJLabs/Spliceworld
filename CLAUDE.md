# CLAUDE.md — Splicework

Working agreement for Claude Code sessions on this repo. Read ROADMAP.md before writing any code.

## Project
Splicework: cartoony mad-geneticist ranch/splice/battle game. Browser, procedural SVG, zero art assets. GitHub Pages now (`RCJLabs/splicework`), TWA later. Solo dev (Evan), evening sessions.

## Session Protocol
- **One milestone per session.** Do not start the next milestone's work early, even if it's tempting. Ship the current milestone's "Done when" criterion, then stop.
- Start each session by reading ROADMAP.md §6 and stating which milestone is active and its acceptance criterion.
- End each session by updating a short `PROGRESS.md` (milestone, what shipped, known issues, next session's first task).
- If a milestone won't fit the session, cut scope *inside* it rather than deferring the acceptance criterion — smaller numbers, fewer species, same proof.

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

## Definition of Done (every milestone)
1. Acceptance criterion from ROADMAP.md §6 demonstrably passes.
2. Save/load survives a reload mid-feature.
3. No console errors on a fresh save and on a migrated save.
4. Works at 380px wide (mobile-first — this ships as a TWA).
5. `PROGRESS.md` updated.

## Delivery
When handing builds back outside the repo, include the source zip alongside `index.html` and the current ROADMAP.md (Dirtbag convention).
