# PROGRESS

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
