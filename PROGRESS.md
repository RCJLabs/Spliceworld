# PROGRESS

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
