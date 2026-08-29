# PROGRESS

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
