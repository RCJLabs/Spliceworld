# PROGRESS

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
