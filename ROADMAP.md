# SPLICEWORK — Design Roadmap

**One-liner:** You are a gleeful mad geneticist bent on world conquest. Breed and raise a ranch full of animals, extract their essence, splice outrageous chimeras, and battle the world's armies — and eventually their own gene-freaks — in turn-based combat. The ranch and the splice lab are the heart; the war is why they matter.

**Tone:** Saturday-morning villain. Despicable Me energy. Zero gore — soldiers parachute away, vehicles comically break down, creatures "poof" into DNA vials. In-game text is punny, gleeful, and self-aware. The player is the villain the way a kid drawing a monster is the villain.

**Platform:** Browser (GitHub Pages) → PWA → TWA on Google Play, per RCJ Labs conventions. Zero art assets — all creatures, units, and UI are procedural SVG.

---

## 1. Design Pillars & Laws

**Pillars (in priority order):**
1. **RANCH** — raising creatures well is the engine of everything.
2. **SPLICE** — the combiner toy: countless combinations, readable consequences.
3. **CONQUER** — battles give purpose, escalation gives endless play.

**Design Laws (test every feature against these):**
- **Law 1:** Every battle outcome must feed a ranch or splice decision (injury, capture, salvage, new species, counter needed).
- **Law 2:** Every conquest reward must expand creation (fauna, parts, surgery tech, frames, income).
- **Law 3:** Care quality must have mechanical teeth. Part grades come from husbandry. Obedience comes from bond. Ranching is never decorative.
- **Law 4:** Building is engineering, not a slot machine. The physiology panel always explains *why*.
- **Law 5:** Cartoon logic everywhere. If a system reads as grim, reframe it until it reads as gleeful.

---

## 2. The Core Loop

```
BREED stock (genetics raise the ceiling)
  → RAISE stock (care raises the floor; age matures the yield)
    → EXTRACT at peak (donor "graduates" into DNA vial + parts; grade = genetics × age × care)
      → SPLICE chimera in the Surgery Theater (frames, slots, physiology, instability)
        → SETTLE & TRAIN chimera (settling timer, bond, temperament; earn full obedience)
          → BATTLE the world (turn-based, Pokémon-structure, vs. armies then rival chimeras)
            → WIN: territory, income, new fauna, salvage captured enemy chimeras
            → LOSE: a chimera is CAPTURED → dissection countdown → rescue raid or the enemy learns
              → ESCALATE: notoriety rises, Threat Generations advance, AI director adapts
                → repeat, forever
```

**Two populations, two mindsets:**
- **STOCK** — base species. Livestock you breed, raise, and extract. You farm their genes.
- **CHIMERAS** — spliced fighters. You settle, train, bond with, battle, injure, rescue. You get attached.

---

## 3. Systems Spec

### 3.1 Stock & Ranch
- Each stock animal has: species, sex, age stage (Egg → Juvenile → Adult → Prime → Elder), **genetic potential** per stat (hidden until Gene Scanner upgrade), **condition** (0–100, driven by care), and heritable trait genes.
- **Care actions** (daily, menu-based): feed (diet matches species), groom, exercise, enrich. Neglect drops condition; condition decays slowly offline (soft floor — never punishing enough to feel like a chore app).
- Species have **upkeep profiles** (carnivore = expensive meat, goat = eats anything = cheap). Upkeep economy is a real constraint on ranch size.
- Pen capacity gates herd size; expansions bought with conquest income (menu upgrade, no spatial layout).

### 3.2 Breeding & Incubation
- Pair two adults of the same species → egg → **incubation on a real-world timer** (first eggs ~30 min, scaling with species rarity; computed offline via timestamps).
- Simple transparent genetics: each stat's potential = weighted average of parents ± variance; trait genes use dominant/recessive alleles (e.g., **Dense Bones** — horn/skull parts gain +armor; **Overclocked Metabolism** — organs yield +stamina regen but +upkeep).
- **Mutations** (rare): stat spikes, novel trait genes, and very rarely a **variant species** (Alpine Ram from Ram, Abyssal Shark from Shark) — variants are the cheap roster multiplier for endless mode.
- Breeding depth target for v0.1: "shallow to learn, deep to optimize." No hidden EV/IV jargon in UI — show it as a family tree with stars.

### 3.3 Extraction & Part Grades
- **The Extractor**: place a stock animal in, comedic sequence (flash, kazoo, poof), out comes a **DNA vial** + that species' **part tokens**. Framed as *graduation*: "Bessie has ascended to her final form (pending assembly)."
- **Part grade = Genetics × Age stage × Condition at extraction.** Grades: **Standard → Prime → Apex → Prismatic.** Each grade = a flat stat multiplier (×1 / ×1.2 / ×1.4 / ×1.65) **and** sharpens the part's own move by 12% per tier (`GRADE_MOVE_BONUS`), so a Prismatic ability is the same ability hitting harder: 80 power becomes 109, and the name, the stamina cost, the accuracy and the keywords are the ones the Standard part had. A grade **sharpens; it does not upgrade** — R84 decided that deliberately and smoke asserts it over all 244 parts at all four grades.
- Timing tension: extract a Juvenile now (fast, Standard) vs. raise to Prime with good care (slow, upkeep cost, Apex+). This is the ranch's central economic decision.
- Every part token permanently records its donor's name and stars for Splice-Dex lineage ("contains the essence of Bessie").
- Chimeras (yours or captured) can also be extracted — returns a *subset* of parts, one grade degraded. Salvage, not free recycling.

### 3.4 The Surgery Theater (Splicing)
- **Frame first:** choose a **torso**, which sets size class (S/M/L for v0.1) and slot layout. Slots: Head, Forelimbs, Hindlimbs, Tail, Hide, Organ ×1 (×2 at Theater Tier 2).
- Every part carries: stat block, **one signature ability**, and **physiology properties** (mass, metabolic draw, thermal tolerance).
- **Physiology panel** computes and *explains*: power-to-weight, stamina pool & regen, speed, thermal comfort band. Eagle wings on a hippo frame = legal, flightless, and the panel says why. Building is engineering (Law 4).
- **Instability** (0–100): rises with species count in the mix and grade mismatches. High instability = longer settling, more care demand and obedience risk.
- **Going Feral (R85):** the top of the scale costs something, and what it costs is *neglect*, not anatomy. A chimera at instability **100** whose bond is under **40** and that nobody has worked with for **72 hours** starts pacing its pen; you then have a **24-hour window** to go and do anything with it at all — train it, fight with it, treat it — and the warning clears. Miss the window and it stops taking your calls: it moves to Containment, and R8's Reorientation Wing hands it back *whole* (same id, level, trained moveset and scars) for the usual fee. Building a six-species monstrosity is never itself the trigger — every chimera is spliced at bond 0, so a snapshot rule would send the game's own premise to Containment the day it was made. Raising bond past the floor makes it impossible.
- **Purebred bonus:** 4+ parts from one species = that species' set bonus.
- **Combo abilities:** specific part pairings unlock discovered abilities logged in the Splice-Dex (Venom Organ + Cobra Head = *Injection*; Electric Organ + Aquatic Hide = *Live Wire*). **27 combos** ship; combos are the "gotta discover 'em all" hook.
- **Splice settling:** new chimeras settle on a real-world timer — **22.5 min at instability 0, rising to about 3 hrs at 100** (`PHYS_TUNING.settleBaseMs` + `settleMaxExtraMs`). Deploying an unsettled chimera = Rejection debuffs in battle. Patience is a stat.

### 3.5 Chimera Raising
- Chimeras have **bond** (raised by training, feeding favorites, post-battle care) and **temperament** on two axes (Brave–Skittish, Fierce–Gentle), seeded by dominant donor species + drifted by how you raise them.
- Temperament = passive battle perks (Brave: +crit below 30% HP; Skittish: +evasion first turn; Fierce: +power, −guard; Gentle: +ally support later). Never removes player control.
- **Obedience rule (full control is earned):** command-ignore chance = f(instability, low bond). A settled, bonded chimera obeys 100%. This is the only place control wavers, and care fixes it (Law 3).
- Battle injuries → Infirmary timer; untreated injuries can scar into permanent trait tradeoffs (cartoony: "Chompers now fears jeeps. +Evasion vs. vehicles, −Accuracy vs. vehicles").

### 3.6 Battle System
- **Format:** turn-based, menu-driven, Pokémon structure. Player fields a **team of 3** (bench + switching); enemy commanders field unit waves. Speed determines turn order; switching costs the turn.
- **Stats:** HP, Power, Armor, Speed, Stamina (pool + regen from physiology). **Moves cost stamina instead of PP** — heavy high-power builds run hot and must pace; this is the physiology sim paying off in combat.
- **Tags instead of types:** parts grant tags — Armored, Airborne, Aquatic, Venomous, Electric, Sonic, Gas, Camo. (Burrower was listed here for a long time and never reached a single part; R68 struck it rather than invent a ninth tag to justify the sentence.) Effectiveness is a small readable chart (Electric ≫ Aquatic; Ground moves miss Airborne; Sonic ignores Armor; Gas ≫ organic, useless vs. vehicles; etc.). The "type chart" emerges from what you built.
- **Human enemy roster** (Gen 1–2): Riot Squad (Shield Wall: guards allies), Net Trooper (Trap), Tranq Team (Sleep), Police Cruiser, Infantry Squad (Suppressing Fire: accuracy down), Jeep .50 (fast, fragile), Tank (Armored, slow, Cannon = 2-turn charge), Attack Chopper (Airborne), Artillery (off-screen strikes, must be rushed). KO'd soldiers parachute away; vehicles sputter and collapse.
- **Multi-stage battles:** commanders send waves; bosses transform mid-fight (Tank → Rail Tank), call reinforcements, or change the arena.
- **Capture — theirs:** defeat a rival chimera with your **Containment Cannon** charged (charges by dealing damage without KO'ing — a capture minigame of restraint) → chimera goes to your Containment → **salvage** its engineered parts (enemy-tech parts are otherwise unobtainable) or, post-v0.1, rehabilitate it into your roster.
- **Capture — yours:** *lose a battle* and one of your downed chimeras is captured → **Dissection Countdown** (real-world, **9–18 hrs**, rolled per capture) → launch a **Rescue Raid** (a themed battle behind enemy lines) before it expires. Fail or ignore it: the creature is lost *and* the enemy's next generation gains a counter-bias against its parts. Stakes without permadeath-by-surprise.

### 3.6b Elemental Classes (Wave 1)
- Three classes in a rock-paper-scissors cycle: **Ground ≫ Water ≫ Air ≫ Ground** (×1.5 advantage, ×0.7 disadvantage), defined in `classes.json`.
- **A chimera's class is derived from its anatomy, never assigned.** Parts carry a `classAffinity`: wings and gliding membranes vote Air, gills/fins/flippers vote Water, feet/paws/hooves/walking legs vote Ground. Most votes wins.
- **A tie leaves the creature Unclassed** — neutral in both directions. Committing to one anatomy buys the matchup edge; hybridising trades it for safety. This is the strategic counterweight to the instability system, which pushes the other way.
- The physiology panel names the class, shows the vote tally, and says which class it beats (Law 4). Enemies declare their class directly; the roster spans all three so the triangle cuts both ways.
- This is what makes rival geneticists matter: a rival who fields Water answers your Air stable, and the AI director has something meaningful to counter-bias.

### 3.7 Campaign, Escalation & the Learning Enemy
- **World map:** regions in an endless ring/spiral of biomes. Each region: new base fauna (capture/sequencing missions), income per real-world tick while held, a commander boss, and eventually a **regional rival geneticist**.
- **Notoriety → Threat Generations:** Gen 1 Police → Gen 2 Military → Gen 3 Coalition (combined arms, mechs) → Gen 4 Rival Splice Programs → Gen 5+ endless scaling: coalition counter-offensives can *contest held regions*, and rival labs iterate.
- **AI Director:** tracks your most-used tags/parts and every dissection completed, then biases enemy generation toward counters (you love Airborne? Expect flak trucks and net batteries). Endless mode stays fresh because the world studies *you*.
- **Endless math:** enemy stats scale on a tuned exponential; player power scales via grades, combos, breeding ceilings, and enemy-tech salvage. Balance harness (see §6) tunes the curves.

### 3.8 Rivals & Story Architecture
- v0.1: **one rival** (Dr. Mantissa, insect-splice philosophy) with data-driven profile.
- All rivals live in `rivals.json`: `{ id, name, philosophy, portraitSeed, favoredTags, monologueSlots: { intro, midFight, defeat, dissectionTaunt } }`. Ship with one-line barks; the schema is the story system, prose comes later.
- **Player profile** uses the same schema (name your geneticist, pick a philosophy tagline) — the villain-monologue feature drops in later with zero refactoring.
- Ambient storytelling from day one: a **news ticker** on the War Room screen reacts to your actions ("Local zoo reports goat shortage. Authorities baffled."). Cheap, cartoony, does the tone's heavy lifting.

### 3.9 Real-World Timers (offline-computed)
Incubation, growth stages, splice settling, injury recovery, dissection countdowns, region income. All computed from timestamps on app open — no background process, PWA-safe.

**The second act (R87).** Conquest used to be the end: measured over six 180-day walks, the county fell on median **day 35**, every facility track was maxed by median **day 28** — *before* dominion, so from day 29 there was nothing left to buy — and the next 145 days were **5.1 fights a day won 97% of the time** while funds ran to a median **$864k**. So the ladder's own last line is made real. Threat Generation 4 announces that they have stopped sending police and started sending procurement, and **notoriety is capped at that top rung** — you cannot be more wanted than maximally wanted. Past it, or once the county is yours, the **Compliance Task Force** comes for the **ranch** rather than for a node: a scheduled raid on R9's two rules (a timestamp, never a per-tick roll; a window that opens *when you see it*, so a fortnight away can never cost you one). Ignore it or lose it and they levy **25%** of the slush fund and take a couple of the herd — money and livestock, **never a creature**, both recoverable. Beat it and your notoriety falls, which is the spend notoriety never had. Money finally has somewhere to go: a **tier IV** on every facility track that still had a knob to turn ($480k together) and **Gauntlet purses at $26k–$90k** instead of the $400–$900 they were set at before anyone measured the economy that reaches them. Measured after: day-180 funds **$864k → $176k**, notoriety **3,975 → 106**, and a median **43 raids at 64% held**.

**Paying a clock to hurry (R86).** Every *sealed* clock can be bought out by the hour at the Infirmary's rate — a **$25** call-out plus **$18** for every hour left. Sealed means the answer is already in the save when the clock starts, so a rush buys time and never a different creature: a settling chimera, the Chaos Vat, the Resequencer and an incubating egg, and smoke proves it by decanting a rushed vat and a waited one and comparing the children. Nothing else is for sale, as a rule rather than an omission: training and care cooldowns are where bond and grade come from (Law 3), growth is the animal, a rehab programme is its curriculum, a job is its duration, and the world's own clocks — convoys, dissections, the agitation window, a breakout — are threats, not waits. There is no second currency. The game's one economy pays for it, and the waits are short enough (22.5 min–3 h settle, 2 h tank, under an hour of incubation) that the choice is a real one rather than a toll.

### 3.10 Facility (menu-based)
Screens: **Ranch** (stock) · **Pens** (chimeras) · **Extractor** · **Surgery Theater** · **Incubator** · **Infirmary** · **Containment** · **War Room** (map, notoriety, ticker) · **Splice-Dex**. Upgrades are menu purchases: pen capacity, Theater tiers (frames/slots), Gene Scanner, Extractor efficiency, Infirmary speed, Containment Cannon mk2.

---

## 4. Content Spec (v0.1 → 1.0)

### 4.0 Shipped, as measured

<!-- R77: tools/smoke.js parses this block and fails the build when a line
     drifts from the data. Every value is derived from data/*.json or the
     engine at test time, never typed twice. If you change content, this
     block is what tells you the prose above it has gone stale. -->

- species: 41
- parts: 244
- frames: 4
- regions: 5
- nodes: 23
- keywords: 29
- combos: 27
- grades: 4
- grade multipliers: 1/1.2/1.4/1.65
- grade move bonus percent: 12
- enemy units: 42
- encounters: 26
- rivals: 5
- save version: 41
- settle minutes at instability 0: 22.5
- settle hours at instability 100: 3
- feral bond floor: 40
- feral neglect hours: 72
- feral window hours: 24
- rush base dollars: 25
- rush dollars per hour: 18
- notoriety ceiling: 600
- task force levy percent: 25
- task force window hours: 21
- dissection hours: 9-18

### 4.1 Roster — 41 Species *(25 at Wave 1; A3 took it to 40 and R6's variants to 41)*
Each species contributes ~6 parts (head, forelimbs, hindlimbs, tail, hide, organ) with one ability each. Picks are swappable; coverage of tags/roles is what matters.

| # | Species | Role | Signature part → ability | Key tags |
|---|---------|------|--------------------------|----------|
| 1 | Bear | Power | Forelimbs → Haymaker (big hit, recoil) | — |
| 2 | Tiger | Striker | Head → Pounce (priority) | — |
| 3 | Wolf | Pack | Organ → Rally Howl (team power up) | Sonic |
| 4 | Crocodile | Bruiser | Head → Chomp Lock (trap + bleed) | Aquatic |
| 5 | Gorilla | Grappler | Forelimbs → Suplex (stun) | — |
| 6 | Rhino | Charger | Head → Rhino Rush (2-turn charge) | Armored |
| 7 | Pangolin | Tank | Hide → Roll Up (guard + reflect) | Armored |
| 8 | Tortoise | Wall | Hide → Shell Fortress (huge armor, −speed) | Armored, Aquatic |
| 9 | Rhino Beetle | Lifter | Forelimbs → Overhead Toss (ignores armor) | Armored |
| 10 | Ram | Breaker | Head → Knockback Butt (forces enemy switch) | — |
| 11 | Eagle | Aerial striker | Hindlimbs+Wings → Dive Bomb (accuracy up) | Airborne |
| 12 | Bat | Disruptor | Organ → Echo Shriek (enemy accuracy down) | Airborne, Sonic |
| 13 | Dragonfly | Speedster | Forelimbs → Flicker (priority + evasion) | Airborne |
| 14 | Shark | Finisher | Head → Frenzy (power up vs. wounded) | Aquatic |
| 15 | Octopus | Controller | Forelimbs → Eight-Grip (trap); Organ → Ink (acc down) | Aquatic, Gas |
| 16 | Electric Eel | Mage | Organ → Discharge (Electric nuke) | Electric, Aquatic |
| 17 | Anglerfish | Taunter | Head → Lure Light (taunt) | Aquatic |
| 18 | Frog | Mobility | Hindlimbs → Springboard (dodge-hop); Head → Tongue Lash | Aquatic |
| 19 | Goat | Economy | Organ → Iron Gut (halves chimera upkeep) | — |
| 20 | Chameleon | Ghost | Hide → Chameleon Vanish (evasion stacks) | Camo |
| 21 | Skunk | Debuffer | Organ → Stink Cloud (team acc/power down) | Gas |
| 22 | Porcupine | Punisher | Hide → Quill Coat (thorns) | — |
| 23 | Mantis | Duelist | Forelimbs → Scythe Strike (priority, crit) | — |
| 24 | Cobra | Poisoner | Head → Venom Fang (Venom stack) | Venomous |
| 25 | Scorpion | Hybrid | Tail → Sting (Venom); Hide → Chitin | Venomous, Armored |

**Math, as shipped:** 41 species × ~6 parts = **244 parts/abilities**, 29 ability keywords, 27 combo abilities, 4 grades. Combination space: 4 frames × 244 parts across 6 slots = effectively unbounded; physiology + tags keep it meaningful instead of noisy.

### 4.2 Ability Keyword System (29 keywords)
Bleed, Venom (stacking), Stun, Sleep, Trap, Slow, Knockback(switch), Taunt, Guard, Reflect, Thorns, Priority, Charge(2-turn), Multi-Hit, Recoil, Frenzy(execute), Rally(team buff), AccUp/AccDown, PowerUp/PowerDown, EvasionUp, Camouflage, Regen, Rage(power-when-hit), StaminaDrain, StaminaRestore, IgnoreArmor, IgnoreEvasion(Lock-On), AoE(vs. squads), Suppression. Every move = 1–2 keywords + numbers. No bespoke scripts; the Monte Carlo harness can enumerate the whole space.

---

## 5. v0.1 Scope

**IN:** 8–10 species (rows 1, 4, 6, 11, 16, 19, 20, 21, 24 + one more), 2 frames (S/M), full breed→raise→extract→splice→settle→battle loop, part grades, instability + obedience, Gen 1–2 human enemies, one region strip (3 nodes + commander boss), capture-on-loss + one rescue raid template, Containment Cannon + salvage, news ticker, offline timers, save system.

**OUT (backlogged):** Rival geneticists & rival chimera battles, variants, combo-ability full set, Theater Tier 2 / L frames, region contestation, AI director (stub the tracking data now, act on it later), rehabilitation, monologue prose, async multiplayer ghosts, chaos-breeding of chimeras, audio beyond a few ZzFX stingers.

---

## 6. Milestones (one per session, Landnám convention)

- **M0 — Skeleton & Renderer Core.** Repo, GH Pages deploy, save/load with `SAVE_VERSION` gate, seeded RNG. **Genome→SVG renderer**: 3 frames with standardized attachment sockets; any part fits any socket; 4 species' parts render recognizably. *Done when: a bear-headed, eagle-winged goat renders and persists across reload.* ← Hardest problem first; this renderer is shared infrastructure for every future creature game.
- **M1 — Ranch & Stock.** Stock data model, care actions, condition, age stages on offline timers, upkeep economy, pen capacity. *Done when: neglect and good care produce visibly different animals over two real days.*
- **M2 — Extractor & Grades.** Extraction flow with cartoon sequence, grade formula, part inventory with lineage tags. *Done when: raising a donor to Prime provably yields better parts than extracting a Juvenile.*
- **M3 — Surgery Theater.** Slot UI, physiology panel with explanations, instability, settling timers, purebred bonus, 4 combo abilities. *Done when: the panel correctly explains why the flightless hippo can't fly.*
- **M4 — Battle Engine.** Turn loop, team of 3, switching, stamina costs, tag chart, keyword resolver, Gen 1 human units, one commander boss with a second stage. *Done when: a full battle plays out and Law 1 fires (injury or capture feeds back).*
- **M4.5 — Balance Harness.** Headless battle simulator in `/tools`: Monte Carlo across part combos vs. enemy roster; outputs win-rate tables and flags degenerate builds. *Done when: it catches one broken combo I planted on purpose.*
- **M5 — Campaign Shell.** Region strip, notoriety Gen 1→2, income ticks, capture-on-loss → dissection countdown → rescue raid, Containment + salvage, news ticker. *Done when: losing a battle creates a rescue mission with a live timer.*
- **M6 — Breeding.** Pairing, incubation timers, genetics inheritance, family tree UI, one mutation trait. *Done when: two starred parents produce a measurably better egg.*
- **M7 — Polish & Ship v0.1.** Splice-Dex, onboarding (guided first splice), obedience UX, audio stingers (planned as ZzFX; shipped as a hand-rolled WebAudio synth in `audio/sfx.js` — same few-bytes-of-joy goal, zero third-party code, so the no-dependency rule held), PWA manifest + service worker, TWA checklist. *Done when: a stranger can go from empty ranch to first conquest without asking questions.*

### Post-v0.1 waves (shipped)
- **Wave 1 — Content & Classes.** 25 species / 150 parts, the Ground ≫ Water ≫ Air ≫ Ground triangle derived from anatomy, menus reorganised for the roster. *Done when: a build's class changes the outcome of a fight it would otherwise win.*
- **Wave 1.5 — In-game pickers.** Every native `<select>`/checkbox replaced by `ui/picker.js`. *Done when: no OS dropdown can appear anywhere in the game.*
- **R1 — Rival Geneticists.** Three rivals with data-driven profiles who field **chimeras generated from real parts under the player's own physiology**; ladder gated so each rival's counter-class anatomy is obtainable first; rivals iterate on every defeat and counter-bias against your stable; capture + salvage yields their parts at their grades. *Done when: a rival fields chimeras the class triangle decides, and beating one yields parts you could not otherwise get.*

- **R2 — Battle Overhaul.** `step()` returns a replayable event stream (each beat carries a state snapshot); the arena plays it one beat at a time with phase labels, floating numbers, sprite animation and a skip. New HUD: class chips, stamina on both sides, wave pips, team tray, and per-move effectiveness against the fighter actually in front of you. *Done when: pressing a move reads as a turn — you see who acted, in what order, and what it did, one beat at a time.*

- **R3 — Balance Pass.** Difficulty curve (`tier` per encounter × `tierScale`), an even grade staircase, health moved off the chassis onto the anatomy, and rivals raised to the top of the ladder. Harness gains `--team=N` — a team of three is the honest yardstick for encounter difficulty; solo stays the yardstick for comparing builds. *Done when: each grade tier opens a new band of content, no build is degenerate at apex or above, and the curve is asserted in smoke.*

- **R4 — AI Director.** The tracking data collected since M0 now acts: the world reads your live stable (per creature, by the class the engine derives), your splice history, and every dissection you let complete, then rewrites encounters toward what answers you — hardest first, reaching further down the ladder as you take territory and lose creatures. Legible by construction: a dossier in the War Room, an intel line in the briefing, a news wire item the first time each countermeasure lands. *Done when: committing to one class costs you measurably, diversifying or pivoting after a loss buys it back, and you can see why.*

- **R5 — Theater Tier II & the Facility.** Menu upgrades (§3.10) as a data-driven track: `facility.json` levels carry `grants`, and the systems that care read them. Tier II buys the L-class Rumbler chassis and the **second organ bay** (§3.4's "Organ ×1, ×2 at Theater Tier 2"), gated on money *and* territory. Genomes are now keyed by SOCKET id rather than slot type, so `organ2` exists without touching a single saved genome. *Done when: buying Tier II unlocks the Rumbler and a seventh bay, and a two-organ chimera is measurably — and visibly — a different creature.*

- **R6 — Variants via mutation.** Six variant species (§3.2's "Alpine Ram from Ram, Abyssal Shark from Shark"), each declaring `variantOf` and inheriting its base's anatomy through `tools/gen-parts.js` — a roster multiplier that costs six JSON objects. Bred, never bought: they surface as the rarest mutation branch and then **breed true**, so one lucky egg becomes a line. Every one is a sidegrade by contract, asserted in smoke. *Done when: a variant can appear from ordinary stock, breeds true once you have it, extracts into its own parts, and is not simply better than the animal it came from.*

- **R7 — Single-screen arena.** The battle laid out the way turn-based creature battles have been since 1996: foe up-and-right, you down-and-left, both facing each other on platforms, HP boxes in the opposite corners, a message box under the field and a 2×2 command menu under that. The shell goes fixed-height in battle mode; the log and any moves past four live one tap away. *Done when: a whole fight is playable without scrolling on a 320×568 screen.*

- **R8 — Rehabilitation.** §3.6's other future for a captured chimera: take it apart, or talk it round. A data-driven **Containment** track in `facility.json` sells the Reorientation Wing (and an Enrichment Annexe that halves it), so the whole feature is gated by a purchase the existing facility system already knows how to sell. A programme runs on a real-world clock scaled to the specimen; enrichment sessions, paced by a share of the programme's own length so the curriculum always fits inside it, decide the bond and instability it graduates with. It keeps its name, its chassis, and the grades its old lab raised. *Done when: a captured rival chimera can be talked into your roster as a creature your own Theater could not have built — and salvage is still worth choosing.*

- **R9 — Region contestation.** §3.9's counter-offensives. Conquest used to be one-way — territory was a number that only went up, which is the shape endless mode goes stale in (§8, risk 5) — so the coalition comes back for a node you hold. Two rules make it fair and both are load-bearing: the next counter-offensive is a **scheduled timestamp**, never a per-tick roll, so how often you open the app cannot change how often you are attacked; and the **defence window starts when you see it**, so being away never costs you a node you were never given the chance to defend. The defence is the node's own garrison at a continuous escalation above the strength you beat it at, growing every time you hold the place — a new region costs zero new encounter data. Contested income is suspended, holding the line impounds the wreckage (Law 2), and a lost node drops back onto the map to be retaken. *Done when: a node you hold can be taken off you and won back, the schedule cannot be farmed by opening the app, and the fight is legibly harder than the assault that took it.*

- **R10 — The monologue pass.** §3.8's other promise: "the player profile uses the same schema… so the villain-monologue feature drops in later with zero refactoring." It does. The player now has a rolled name, a title, a lab and a **philosophy** from `philosophies.json` — narrative only, because anatomy is where this game keeps its mechanics — and their monologue slots fire alongside the rivals': a duel opens as a call-and-response in the message box, and the news wire carries your voice on a conquest, a capture, an enrolment and a graduation. The rivals' barks became prose and gained the slots the events needed: `dissectionTaunt` (dead data for three sessions) now fires when they take one of your chimeras, `dissectionDone` when the window closes, `defection` when you rehabilitate one of theirs, `rematch` when they iterate. Smoke asserts that **every slot has a caller**, so prose can never again be written, shipped and never seen. *Done when: a rival duel reads as a conversation between two named villains, your philosophy turns up across the whole game rather than three fights, and no monologue slot is dead.*

- **R11 — The Jobs board (non-combat operations).** The campaign had no floor. Every route to money and to new fauna ran through winning battles — held nodes paid the income, purses paid the rest, and `unlocksFauna` gated the Mail-Order catalog — so a player who kept losing had $22/day, a catalog of **exactly two species**, and no path at all to the Water or Air anatomy the class triangle says they need in order to stop losing. Seven heists in `operations.json` fix it: real-world timers, seeded outcomes sealed at launch, loot in money *and* livestock. Four rules hold it up — something is always runnable with no territory, no notoriety and no chimera; failure costs time and a bruise, never a creature; `demands` improve the odds and never gate the job; and **heat** (exponential decay, so it settles rather than pinning) is what stops it being a printing press. Conquest stays the better deal: it opens the catalog to buy instantly and repeatedly, and most of the roster — the premium fauna especially — is still beyond any job. *Done when: a player who has never won a battle can fund a ranch and field a counter-class chimera, and a player who grinds the board sees diminishing returns rather than a printing press.*

- **R12 — Chaos-breeding.** Ranch breeding pairs two ANIMALS of one species and produces a predictable hybrid of their stats. The Chaos Vat is the other thing: two finished chimeras go in and a genome neither of them was comes out. The design problem is economic, not genetic — a chimera costs vault tokens permanently and carries no upkeep, so an offspring bought with money and time alone would be a duplication glitch. The price is therefore paid in **grades**, the game's real power currency: both parents permanently drop one on every part. A five-socket pair gives up ten grade steps and returns five, so a line running on its own output slides down the ladder generation by generation until fresh, well-raised stock is crossed back in — which is the ranch loop the whole game is built on. What makes it worth doing anyway: **the vat does not read your permits.** It can install a socket neither parent had and your Theater is not licensed to fill, pick a frame you do not own, and hand over a part from neither parent — drawn from the Splice-Dex, so it is always anatomy you have seen. *Done when: a chimera line measurably decays if you breed it against itself, a child can still occasionally beat its best parent, and the vat can produce a creature the Surgery Theater could not have assembled.*

- **R13 — Chimera extraction & temperament.** Two promises from the main spec that were never built. §3.3's "chimeras can also be extracted — returns a SUBSET of parts, one grade degraded" is the Surgery Theater's missing undo: splicing consumed vault tokens permanently, so a build you regretted was a one-way sink. Which parts survive is seeded on the chimera, so the confirmation shows exactly what you will get. And §3.5's temperament — two axes, Skittish–Brave and Gentle–Fierce — has sat on every chimera as `null` since M3 behind a comment reading "seeded on settling". It now is: seeded from the **dominant donor species** so the anatomy decides, as class and tags already do, and drifted by how you raise them (training makes a creature braver and gentler, winning makes it fiercer, going down makes it warier). The perks are passive stat effects only — §3.5's "never removes player control" rules out anything that takes a turn away, which is obedience's job and only obedience's. *Done when: a chimera can be taken apart for meaningfully less than it cost, and a shark-built creature fights measurably differently from a tortoise-built one.*

- **R14 — Injury scarring.** §3.5's last unbuilt clause: "untreated injuries can scar into permanent trait tradeoffs". A battle injury has always opened an Infirmary timer and then quietly expired; now there is something to do about it and a consequence for not doing it. Treat it and it clears clean; leave it and it may set badly and stay. **Every scar is two-sided**, which is the whole design — a scar is character rather than damage, so missing the window is interesting rather than ruinous, and some are net good for a given build. `vs` narrows an effect to opponents carrying a tag, which makes the roadmap's own example ("Chompers now fears jeeps: +Evasion vs. vehicles, −Accuracy vs. vehicles") literally expressible as data. The Infirmary sells certainty, not power. *Done when: a jeep-shy creature measurably misses vehicles more and dodges them better, and is completely unchanged against everything else.*

- **R15 — Screen density.** Nineteen waves of features had stacked thirteen cards into one scrolling column in the War Room — jobs, counter-offensives, captives, the strip, two dossiers, rival labs, containment and the wire — which was **3,884px of scroll on a 380px phone**. It is now five views behind a sticky tab bar (Map · Jobs · Labs · Bays · Wire), and the median view is 1,107px. The rule the layout is built around, and which smoke enforces by scanning the source: **alerts never go behind a tab.** A rescue window and a counter-offensive both carry live countdowns that cost a creature or a node when they run out, so both sit above the bar and show on every view. Badges are earned rather than decorative — only an unread job report and an occupied containment bay get one. *Done when: every view fits a phone, and nothing time-critical can be hidden by choosing a tab.*

- **R16 — The balance gate.** `tools/sim.js` had reported the same `[OP]` verdict on `L · wolf:organ + tiger:head + …` on **every run for a dozen sessions** and nothing ever acted on it, because a report nobody is obliged to read is not a guard. The build was the **Pack Hunt** combo plus whatever hindlimb the sampler handed it: 64 power for 26 stamina at 95 accuracy — the best damage-per-stamina of all twelve combos *while also* carrying priority and a compounding powerUp. Every peer pays for its upside (`live_wire` buys the top efficiency with no keywords at all; `leap_year`, the direct analogue, takes 8 less power and buys evasion rather than power), so the fix was to price it rather than shrink it: 58/28/92 puts it seventh of twelve on efficiency, below the combos whose keywords are weaker. The real deliverable is that the harness's own verdict is now a **build failure** in `tools/smoke.js`, run across six pools because the sampler fills a combo's spare sockets at random and one pool only decides which fillers a combo happens to wear — the same combo swings between rank 1 and rank 41 of 43 on filler alone. A second, opposite guard stops the next session over-correcting: a combo weaker than the drawback-free moves of the parts that unlock it is dead content, and smoke says so by name. *Done when: the sim reports no degenerate builds, and re-introducing the old numbers fails the build rather than printing a warning.*

- **R17 — Combo grade scaling.** R16's recorded known issue, and a reward that quietly stopped being one. `GRADE_MOVE_BONUS` sharpens a part's move 12% per grade; a combo's move was flat, so a Prismatic Pounce (71) overtook the Pack Hunt (58) it belongs to and the player's discovery became the wrong button — **7 of 12 combos** went dead at Prime or Apex. A combo is emergent anatomy, so it now takes a grade too: **the best one among the parts that unlock it**. Max is not generosity, it is the only rule that holds — a part's move scales by its own grade, so anything less lets the better half of the pair overtake the combo it belongs to; across every grade assignment in the roster, min leaves 31 of 192 dead and mean 10, while max leaves none and provably so. Smoke now checks the rule at **every grade assignment** and through `movesFromTokens` rather than by redoing the arithmetic, because what is being asserted is what the player's move list actually says. The phase also caught the R16 gate under-sampling: `seedsPer: 4` reported a clean roster at Prime that both 8 and 12 flag, so the gate runs at 8 — sampling that hides an outlier is worse than no gate. *Done when: no combo is overtaken by the drawback-free moves of its own parts at any grade, and Standard balance is provably untouched.*

- **R18 — The class triangle, and the gate at every grade.** R17 handed this one over: a `storm_eagle` purebred topping every pool at Prime. It was never a storm_eagle problem. **90% of enemy appearances were Ground** — six of eight encounters were pure Ground — so Ground ≫ Water ≫ Air ≫ Ground was not a rock-paper-scissors choice but a strict ranking: Air dealt ×1.5 and took ×0.7 against almost the whole roster while Water did the reverse. Forcing a build's class and holding everything else fixed put the edge at **+16 to +20pp for Air and −10 to −13pp for Water**, and plain `eagle` matched storm_eagle at 78% — so nerfing the variant would only have promoted its parent. Six units fix the roster instead (a drone, a police falcon, a gunship, a water-cannon truck, a harbour diver and a dredger barge — all procedural SVG, all data): the mix goes 90/5/5 to **50/25/25**, and the spread between the three classes falls from 17pp to 6pp at Standard and 24pp to 7pp at Prime. Even thirds was measured and is *worse* (20pp), because the tag chart stacks its own asymmetries on top — Ground moves miss Airborne outright. The `[OP]` gate now runs at **all four grades**, which is what R17 could not honestly ship. *Done when: no class is a strict upgrade over another, the roster is clean at every grade under sampling well past what the gate uses, and the old roster fails the build.*

- **R19 — The knockback lock, and what the director actually needed.** R18 left two notes: price keywords into the director's `weight`, and pull Vehicle share back. Pricing the keywords found something else first — **Knockback was a soft-lock, not a keyword**. A rotation makes the round loop drop that side's planned action (right for a KO, since the fighter is gone), so a faster attacker with Knockback denied the player *every action for the whole fight*: a control unit turned a 100% win into 11% and took **zero damage across thirteen turns**. A side rotated last turn can no longer be rotated again this turn, which leaves it a real tempo move and caps the worst case at losing every other action. With that fixed the keyword prices collapse into a 0-to-3pp band and the premise evaporates: `weight` predicts real threat at **r=0.958**, adding move power gains 0.006 and adding keywords makes it *worse*. The director's promise is pairwise, though, and no correlation is free of local inversions — so the fix is one guard, not a reweighting: **a slot that hits harder than the counter coming in is never expendable**, which takes measured mercy rules from three to none. A class guard was written, measured **unreachable through the real director** and unnecessary, and deleted rather than shipped as dead code. R18's slot-order workaround is reverted, which is the proof the guard is load-bearing. Two Organic units (a rappel team, a volunteer fire brigade) take Vehicle share 45% → 40%. *Done when: a Knockback attacker cannot deny every action, the director never makes a fight easier with wave order free again, and no adaptation is protected by where a unit happens to sit.*

**Honest estimate:** bigger than Landnám — **~4 weeks of evening sessions** to v0.1 (9 milestones vs. Landnám's cadence). The Pokémon-format battle choice (vs. grid tactics) is what keeps it from being 6+.

---

## 7. Tech Conventions
- Vanilla ES modules, no framework, no build step. Procedural SVG only. GitHub Pages under `RCJLabs/splicework`; TWA conversion deferred until feature-complete (Dirtbag convention).
- `localStorage` saves; `SAVE_VERSION` gates migrations and **never changes without a migration function** (Ascent convention).
- Seeded RNG everywhere (splice outcomes, battles, breeding) — determinism enables the balance harness now and async ghosts later.
- All content data-driven: `species.json`, `parts.json`, `keywords.json`, `enemies.json`, `rivals.json`, `combos.json`. Adding a species must never require touching engine code.

---

## 8. Risks & Mitigations
1. **Renderer quality is the whole first impression.** Mitigation: M0 is the renderer, judged on charm before anything else proceeds. Style target: bold flat vector, thick outlines, googly-eye energy.
2. **Balance space is astronomical.** Mitigation: keyword system + M4.5 harness from the start; grades multiply, never add new mechanics.
3. **Timer fatigue / chore feeling.** Mitigation: soft decay floors, generous early timers, paid rushes on every sealed clock (R86 — measured first: a 180-day walk never once had nothing productive to do, so what shipped is agency over the short waits rather than a second economy), and nothing *breaks* from absence — you return to grown creatures, not dead ones.
4. **Consumption guilt breaking the cartoon tone.** Mitigation: graduation framing, lineage tracking, zero death language anywhere in UI copy.
5. **Endless mode going stale.** Mitigation: AI director + variants + region contestation were the designed content engines — and R87 measured what they actually produce past dominion (5.1 fights a day won 97% of the time, 96% of them at a flat 100%): a schedule, not a second act. What answers the risk is R87's Compliance Task Force, the notoriety ceiling that triggers it, and money sinks that give the endgame economy somewhere to go.

## 9. Post-v0.1 Backlog (ordered)
Rival geneticists (regional, gym cadence) → AI director activation → L frames & Theater T2 → full combo set → variants via mutation → rehabilitation of captured chimeras (shipped) → region contestation (shipped) → monologue/story pass on the profile schema (shipped) → non-combat operations (shipped) → chaos-breeding chimeras (shipped) → chimera extraction & temperament (shipped) → injury scarring (shipped) → async ghost defenses (multiplayer "later").

### 9.1 Audited queue (R20–R29) — **all ten shipped**
From a full audit of the shipped code, not a wishlist — each line names the
evidence that put it here. Ordered: correctness, then depth, then content,
then the player-facing pass.

Every entry closed against a criterion that could be **measured rather than
asserted by hand**, and three of the ten found that their own headline was
wrong once the measurement existed: R21's combos were already persisted,
R28's UI already drew class chips, and R26's second region turned out to be
blocked by an engine that could only see the first one. The audits that
follow this queue should expect the same rate.

- **R20 — Wire the dead keywords (shipped).** `taunt` and `frenzy` sit on shipped PLAYER parts (`shark_head` / `abyssal_shark_head` "Frenzy" at 64 power, `anglerfish_head` "Lure Light") and the engine never reads either: the button lies. Of 33 keywords, 18 are wired, 4 are implemented but on no move, and 11 are pure paper against §4.2's promise of "~30". *Done when: every keyword in `keywords.json` is either on a move AND implemented, or gone — and smoke asserts that invariant so it cannot rot again.* Shipped: 11 keywords implemented (`taunt`, `frenzy`, `rage`, `bleed`, `multiHit`, `staminaDrain`, `ignoreEvasion`, `thorns`, `slow`, `rally`, `regen`), 4 deleted as redundant (`reflect`=thorns, `camouflage`=evasionUp, `aoe` has nothing to splash in a one-active fight, `suppression`=accDown+multiHit), and 11 given homes on moves. **29 keywords, every one live and carried.**
- **R21 — Splice-Dex completeness (shipped).** The audit that queued this was **wrong about its headline**: combos ARE persisted, in `state.discoveredCombos` since the v4 migration, and the dex has always drawn them with `???` bait for the rest. Grepping for `dex.combos` and stopping there is how a non-bug gets scheduled — recorded here rather than quietly dropped. What was genuinely missing shipped: **rival dossiers**, because a rival's whole record (defeats, losses, when you last met, how far they have escalated since) was kept in the save and surfaced nowhere you could go back to; and **two-generation lineage**, bounded by construction rather than by a rule — a grandparent is copied as name and stars only, so there is nowhere for a third tier to live and the tree cannot double every generation in a save that is never reset. *Done when: everything the game announces is findable again afterwards — asserted over the RENDERED dex, not the fields behind it.*
- **R22 — An enemy AI with a policy (shipped).** `enemyChooseMove` picks a random affordable move with a 75% bias toward damaging ones: no targeting, no class awareness, no finishing a hurt opponent. *Done when: the same roster plays measurably better and the all-grade balance gate still passes.* Largest blast radius in the queue — it moves every number in the balance table. Shipped as one scorer in `battle/ai.js` used by BOTH sides, on a shared `previewMove` that is now the single source of truth for what a move does. Skill is a dial driven by encounter tier, so a beat cop still flails and a Gen-2 response team does not, and the difficulty curve gains a dimension costing no new content. Measured at 7–13pp per contested matchup. The pilot upgrade also closed R20's sampling gap — and exposed a real outlier (`frenzy` at 64) the greedy pilot could never press. Class spread **improved at every grade** (prime 19pp → 9pp).
- **R23 — Active hides and organs (shipped).** Every hide was a passive stat stick (0 of 32 carried a move) and most organs were too — and the passive ones were **not** compensated with better stats (21.3 against 22.1), so it was an omission rather than a trade-off. All 64 sockets now carry an active, drawn from one priced vocabulary keyed off tags the parts already had, so a new species inherits one for free. Pricing them took three passes: the first was *pressed* constantly and cost **10.8pp** on contested fights, because a turn not attacking is worth about fifty damage and the effects returned far less. `guard` turned out to be structurally wrong for a hide — it lasts only until your next action and `performMove` clears it, so it never reads as already-up and the AI guarded 386 times while losing every fight; hide actives must **persist** to be worth a turn. *Done when: a hide and an organ each change how a fight is played* — an armoured build goes **37% → 99%** with its own hide and organ actives available.
- **R24 — Mutation traits (shipped).** The allele machinery was generic from M6 and exactly one trait used it, so Mendel had nothing to be Mendel about. Twelve genes now, each paying for what it gives — asserted, not remembered. Two things were quietly wrong underneath: traits entered the pool **only** through conception mutations, so a dozen of them would each surface about once in two hundred eggs and the Splice-Dex would read `???` forever; and `tools/sim.js` **never loaded `traits.json`**, so no gene could be measured at all. `wildChance` puts seven genes into ordinary stock — findable, pairable, breedable up, which is what makes the machinery worth having — while five stay `mutationOnly` and keep their thunderclap. `moveKeywords` lets a gene change what a part *does* rather than only what it weighs. *Done when: two equally-starred parents can produce visibly different offspring, and the difference shows in a fight* — on a contested matchup the twelve range from **−8pp to +24pp**.
- **R25 — Facility depth, and a stable that costs money to keep (shipped).** Two tracks existed (Theater ×2, Containment ×3); the four §3.10 names — Gene Scanner, Extractor efficiency, incubator slots, Infirmary speed — did not. All four ship as data, taking the facility from **$3,400 to $24,000** of purchasable depth. One of them was a promise the game was already making out loud: the pens have printed `Genes: ????? (Gene Scanner required)` since M6, advertising a machine nobody had built.
  R26 made this urgent rather than optional — full conquest paid **$2,385/day** into a game whose priciest animal costs $260 — so the other half of the phase is the drain. **Chimeras cost nothing to keep until now**, which made territory income a score rather than a budget: the only question money ever asked was how long you were willing to wait. A chimera is billed for the chassis it rides, the grade of every part bolted to it, the power those parts draw and its instability — all four read off data the genome already carries, so a new part, grade or frame is priced the moment it is authored. The spread is steep on purpose (**$21/day standard → $147 prismatic**) and the flat terms small, so the top of the game needs territory while a first creature still fits inside the starting stipend — R11's floor, held.
  Two findings came out of measuring rather than assuming. **Incubator bays are not the bottleneck** — pen capacity is, so 3→8 bays changed nothing on its own; the track had to buy a **mutation rate** instead, which is where variants and the mutation-only genes enter the game at all. And the **Gene Scanner's top tier was nearly sold something free**: the graduation forecast it was going to unlock has been on the pens screen since M2. It sells the thing still genuinely hidden instead — the Punnett odds for a *pairing*, carrier versus expresses, computed in closed form from the same rule `expressedTraits` applies.
  *Done when: money has a second sink that changes the loop, and each track pays back measurably* — measured by `facilityPayback`, running the game's own breeding rule, grade thresholds and clocks: **Incubator** 8.0 → 15.2 mutations per 100 eggs; **Extractor** prime+ 50% → 72%, apex+ 4% → 13%; **Infirmary** 3.0h → 1.35h of convalescence, scar rate 34% → 20%, treatment at 60%; **Gene Scanner** 111–400 blind pairings to fix a recessive against **5–8** informed.
- **R26 — Five regions + Threat Gen 3 (shipped).** One region, five nodes, eight encounters was the whole campaign; it is now **five strips, 21 nodes, 24 encounters, 40 units** and a Threat Generation ladder that reaches 3. The engine was the blocker, not the content: `regionOf(content)` returned `regions[0]` and four systems reached past it, so contestation picked defence targets, node names and defending encounters from the first county alone — a sixth region would have been unreachable by the very system §8 names as the endless-mode engine. Gating, lookups and the Threat ladder now live in one pure module (`campaign/map.js`) that contest.js, the director and the War Room share.
  Two things the phase description did not ask for turned out to be load-bearing. The **AI director's reach** is "the hardest encounters, up to a budget" — a fine definition of where the world adapts with one county, but across five it spent the whole budget rewriting the Compliance Spire while the player was still arguing with a parking warden; it is scoped to open regions now. And **redistributing fauna** is the one content edit that can take something away from a live save: a player holding the Guard Post owned nine species that moved three regions out, so save v24 grants them permanently (`faunaGranted`) and the catalog can only ever grow.
  The rotation took four measured attempts. Draft one gave every later region to the same anatomy that won Greenfield — the Foundry because half its units swung **Ground-tagged** moves, which miss an Airborne build outright, so "fly" was still the answer three regions later. Draft two made it class-mixed and turned it into a wall nothing cleared above 19%; draft three found the new units had been authored at boss scale and then tier-multiplied on top (a tier-6 hauler at 253 HP behind 41 armour). Armour-piercing also had to become **earnable before** the region that demands it, or the demand is a wall with the key inside — hence `foghorn_array`, salvaged from the Drowned Quarter's flagship.
  *Done when: taking Greenfield opens a region whose fights need different anatomy than the one that won the first* — **measured, not asserted by hand**: `regionBench` runs five archetypes over every node of every strip, and in each later region a build that cleared Greenfield falls **32–67pp**. Kestrel Reach answers to Water, the Drowned Quarter to Ground, the Foundry Belt to armour-piercing — three different anatomies, stable across seven base seeds — and the Compliance Spire deliberately answers to none (best mono-build 58–66%, spread 2–8pp). Directly answers §8 risk 5.
- **R27 — Rival geneticists as a ladder (shipped).** A rival used to counter you by asking the AI director what class you favoured, which is the wrong source and the reason this line existed: the director reads your WHOLE stable, continuously, from usage banked since M0 — it is the world noticing you. A rival is one person in one building who has only ever seen what walked through their door. **Each rival now keeps their own scouting file**, written by duels against them and by nothing else, so two rivals who met you at different times hold different reads and their counters are personal rather than a shared broadcast.
  The file drives a four-rung ladder: **0** the build they publish · **1** one specimen answers your class (only `counterBias` rivals react this early) · **2** the counter moves to their **lead** and they pick anatomy that blunts your most-used move tag · **3** they field one of your own signature parts back at you. The anatomy table is data keyed on that tag, and the reasons are the real chart — Ground misses Airborne outright, Electric doubles on Aquatic, Sonic ignores Armor so plate bought against it was wasted.
  Measuring it turned up the trap immediately: a rival at two defeats is ALSO stronger and better graded, so "the rematch got harder" proves nothing. The instrument holds the escalation fixed and varies only the file — two copies of the same rival, both beaten twice, both at identical power, one having spent those duels watching the archetype that beats them and one watching something else. That comparison also exposed a real defect: the old ramp (a grade step every second defeat on top of a 9%-per-defeat power climb) turned the first real rematch into **a door rather than a rung** — the anatomy that cleared a rival at 92–100% cleared the same rival at 0–8% two defeats later. Softened to a step every third defeat at 5%.
  *Done when: a rival you have beaten twice fields something built to answer your actual stable* — averaged over six world seeds, the anatomy that beats each rival loses **26pp (Mantissa), 40pp (Aloft), 40pp (Trench)** to the version of that rival which studied it, against the identical rival at the identical power that studied somebody else. And the rematch is hard because they **learned** you, not because the numbers went up: across the ladder the counter costs 35pp against the ramp's 15pp.
- **R28 — Battle readability (shipped).** The audit over-claimed here too: the UI already drew class chips on both fighters and an effectiveness multiplier. What it did **not** do was use `previewMove` — the button printed `move.power`, the raw data value, which is not what arrives once armor, stages, scars, perks, guard, Frenzy, Rage and Multi-Hit have had their say. A 52-power swing into 22 armor is not a 52, and a readout that lies is worse than none. Shipped: `battle/readout.js`, DOM-free so the numbers are tested directly rather than scraped out of HTML — expected damage, chance to land, a finisher mark, and the class and tag multipliers **split apart** so "×1.5" finally says which of the two it was. *Done when: a new player can predict super-effective before pressing, at 380px.*
- **R29 — Onboarding for every shipped system (shipped).** Onboarding was five steps ending at the first conquest (the M7 criterion), and by the time this line came up the game had eight more systems behind it — breeding, the chaos vat, rehabilitation, the jobs board, contestation, scars, temperament, the Dex — plus five regions, six facility tracks and an upkeep economy from R25/R26. **22 field guides** now cover all of it, one per system, and like the Path they are **pure derivations from save state**: no tutorial flags, nothing to migrate, nothing that can desync from the game it describes.
  A guide carries two condition lists — `reachable` (does this system exist for this player) and `done` (have they used it) — and shows only when reachable AND not done, which makes "none fires before its system is reachable" a property of the DATA rather than a rule someone has to remember. Conditions are either a dotted save path with a minimum (counted by array length, key count or value) or, for the dozen that need real derivation, a named helper; the helper registry is the engine's own knowledge of its systems, so adding a guide for something it can already see is a pure data edit.
  Two smaller rules earn their keep. Only **one note per screen** shows at a time, lowest `order` first — a wall of tips is wallpaper. And **the Path owns the screen until the first conquest**, because two tutorials at once is one tutorial too many.
  Shipped alongside: **fold-away cards**. R25 and R26 had made two screens very long (six facility tracks, five region strips in one column), so the Facility card and every region strip collapse, with the state kept in the save so a fold survives a reload. Each picks its own default — the Facility starts shut behind a one-line summary of what is worth opening it for; the War Room opens the strip you are actually fighting in and shuts the ones you have finished or cannot reach — and a player's own choice always overrides the guess.
  *Done when: every shipped system has a first-use guide derived from state, and none fires before its system is reachable* — checked by walking one save forward through **eighteen milestones**, asserting at each that the notes it lights are exactly the ones that milestone makes real and that none of them was live a step earlier. A hand-maintained roll of shipped systems fails the suite if a future phase adds one without a note.


### 9.2 Second audit (A1–A10)
Run after R20–R29 closed, against five regions, six facility tracks, an
upkeep economy, 22 field guides and a rival scouting system that had never
been audited by anybody. Same rule as the first: every line names the
evidence, and the evidence is a number wherever a number was gettable.

The audit opened on a player report — *"I have 1 chimera and keep failing
the 1 mission I can do"* — and that turned out not to be a difficulty
complaint. It is A1, and A1 is the worst thing in the game.

- **A1 — The difficulty curve is tuned for three chimeras and the game gives you one (shipped).** Measured on a standard-grade purebred against the Greenfield ladder: **solo 100% / 0% / 0% / 0% / 0%**, three 100% / **79%** / 100% / 0% / 0%. The second node is not hard at one chimera, it is arithmetically impossible.
  The cause is **structural, not numeric**, and that decided the whole fix: combat is one active per side over a queue, so three enemy bodies means grinding three health bars down with one of your own. `patrol_2` at **tier-1 stats and three waves is still 0%**; the same encounter at full tier-2 stats and **two** waves is 28%. Bodies, not numbers — no stat pass moves it, and a garrison that scales to your force was measured and rejected because it made a team of two *worse* than a solo (22% against 25%) while quietly removing the reason to build a stable at all.
  So the fix is that the game **says so**, and stops presenting an unwinnable assault as though it were a choice. `battle/forecast.js` runs the actual fight on the briefing screen — the real engine, the real AI on both sides, 32 replays, about 8ms — and reports a band. `runs` is load-bearing: at 7, a matchup that is truly about 45% read 0%, 57%, 14%, 43% and 29% across five base seeds, so the *verdict* was being decided by sampling noise, and a forecast that calls a coin-flip "not survivable" costs a player a fight they would have won. And the Path to World Domination, which used to retire one node before the wall, now walks the player to a stable of three — the number the harness has fought at since M4.5, said out loud for the first time. The starter herd is exactly three animals, so the answer was always already in the pens.
  *Done when: the ladder is beatable at every team size the game will let a player field, or the game refuses to send them into a fight it knows they cannot win* — the second clause, asserted over every node of the first region at all three team sizes: **every true 0% is called unwinnable, and no fight at 40% or better ever is.**
- **A2 — Losing with your only chimera is a dead end (shipped).** Verified end to end before the fix: lose the second node with one creature and it was captured, `state.chimeras` was empty, and the rescue raid needed a team you no longer had. Nine-hour window, no door — and the vault was empty too, because those parts went into the creature that had just been taken. The house rule has always been that a captured creature gets a rescue window; this was a window nobody could enter.
  The last one on a roster is no longer taken. It drags itself home instead — hurt, out for a while, and still yours — which leaves the Infirmary timer as the whole of the punishment. Everything downstream of a capture (the dissection clock, the rival taunt, the director's notes) now only ever fires on a roster that can still answer it. *Done when: a loss can never leave a player with no way to act* — asserted both ways, since a capture with a spare at home has to keep working exactly as it did.
- **A3 — Nine new species, to 40 animals, weighted to air and water (shipped).** The roster was **25 buyable species: 15 ground, 7 water, 3 air** — and the part pool behind it was worse, because class comes from anatomy: **36 ground-affinity parts, 25 water, 9 air**, and those nine air parts were six forelimbs and three tails. Air held **nothing at all** in the head and hindlimb sockets, so an Air chimera borrowed somebody else's legs and then lost the vote it borrowed them for. That is why R26's `wings` archetype needed hand-construction to exist.
  Nine species took the game to **40 animals** — Marsh Heron, Peregrine Falcon, Barn Owl, Sentry Goose and Atlas Moth (air), River Otter, Moon Jelly and Pufferfish (water), Screaming Armadillo (ground) — with 54 parts, their actives, and seven combos reaching eight of them. But the fix was three *rules*, not the headline count: a **talon votes Air** (a raptor's foot is a grappling hook, not a walking leg — pricing it as one is why the Bat, wings *and* talons, read as Unclassed); a **head votes where the anatomy is class-defining** (gills already did; now a bell swims, a beak on a hollow skull flies, a horned skull is what you brace and shove with); and seven new locomotion families — `paddle`, `rudder`, `drift` (water), `hindwing`, `streamer` (air), `stilt`, `scute` (ground) — alongside two new heads (`moth`, `bell`) and four hides.
  Two things fell out of it. The **`Ground` attack tag is pure downside** — its only row in the chart is "Ground moves miss Airborne (×0)" and there is none where it helps — and every hindlimb in the game carried it, so a shark's hindfin and an eagle's talon both whiffed completely against anything with wings; it now follows the anatomy, 28 hindlimbs down to 19. And **`tools/gen-parts.js` had drifted**: nobody had run it since R20, and **78 moves and 57 abilities** had since been hand-authored into `data/parts.json` (R20's keywords, R23's hide and organ actives, a hand nerf of Shark Frenzy, a re-tune of Rally Howl), so the first regeneration reverted four phases of tuning — and its salvage loop, which promised to preserve enemy tech "verbatim", explicitly deleted `classAffinity` on the way out. All of it folded back in; the generator now reproduces the committed data exactly bar the changes A3 intends.
  Balance held: on the region bench, `wings` gains 7pp in the air region (it is pure Air now and its kick has stopped whiffing) and nothing else moves more than 3pp. *Done when: an Air or a Water specialist is as buildable as a Ground one, measured as parts-per-slot per class rather than as a species count* — the pool is now **ground 41 / water 35 / air 32**, a **1.28× spread against the old 4.0×**, with every class holding parts in all four voting sockets and air and water holding at least five in each.
- **A4 — There is one thing to do per visit, and it is on a cooldown (shipped).** The premise was wrong and the truth was worse. Measured from the exact state the criterion names — money, a stable, a lost fight — **five** things were open, not none; but four of the five were purchases (buy an animal, buy pen space, buy a training session, buy your way out of the Infirmary) and the fifth was a fifteen-hour job. **Nothing a player could do produced a next thing to do.** And the loop the whole game is built around — graduate a donor into parts, splice them onto something better — was shut for the first **six to twelve hours of every save**, because the starter herd is born the moment the app first opens and nothing can graduate until it reaches adult. That is exactly the window a new player is in when they hit the second node and lose.
  So: not more jobs. Three changes. **The starter bear arrives grown** — birth backdated rather than a free part granted, so it ages normally, its condition still decides the grade it graduates at, and the goats stay newborn so the husbandry timers are still learned. **The Jobs board runs in three lanes**, because "one job at a time" was one rule doing three jobs: *crewed* (one per creature fit to work, capped at three), *solo* (you go yourself — exactly one, always, which is what keeps a player with no chimeras able to run a job at all), and *paperwork* (`crew: 'none'`, occupying no lane). And **`ranch/agenda.js`** is one DOM-free definition of what is open right now, grouped by KIND — work, campaign, spend — rendered as the Ranch's *Right Now* panel and scored by the smoke suite from the same module, so the criterion cannot drift away from the screen.
  The first cut floored the *crewed* lane at one, and smoke caught that it broke the board's own rule 1 in exactly the state the board exists for: lose a fight with a job already out and the floor was occupied. And every panel row pointed at a screen id that does not exist — `showScreen()` silently falls back to the Ranch, so `war` and `splice` (tab labels, not keys) rendered buttons that looked wired and did nothing; smoke now reads the real `SCREENS` map out of `main.js`. Save **v27**: `campaign.operation` becomes `campaign.operations`, and a job in flight keeps its clock, its crew and its sealed outcome. *Done when: a player who opens the game with money, a stable and a lost fight still has three distinct things they can do right now* — **6 open, 2 productive, 3 kinds** (was 5 / 1 / 2), and graduating the donor turns *graduate* into *splice*, which is the whole thesis: a thing you can do produces a next thing to do.
- **A5 — The tag chart leans on one tag, and the rest are thin (shipped).** Two structural holes, both measured before anything changed.
  **The armour-piercing answer could not be obtained by anybody.** R25 invented `foghorn_array` — a 62-power Sonic organ — because the Foundry Belt is **9 of 11 Armored at armor 11–15** and nothing in the buyable pool went through plate. It then wired it as salvage from `leviathan_dredge`, *a unit that appears in no encounter anywhere*. Measured: with `foghorn_array` the `noise` archetype's Sonic move does **68%** of its damage in the Foundry — the archetype really does isolate the armour-piercing axis, exactly as its comment claims — and with the best Sonic part a player could actually hold (`owl_organ`, 26) that falls to **26%**, with 71% coming from a Suplex that eats full armour. The bench was not measuring the axis it says it measures. `foghorn_array` now drops from `eel_generator`: Drowned-exclusive, Vehicle+Aquatic+Armored, the strip immediately before the one it answers. (`dredger_barge` was the first choice and was wrong — it also patrols Greenfield's Guard Post.)
  **Two tags had no limb carrier at all.** Sonic lived on organs and heads, Gas on hides and organs, so neither could be a build's main attack — and a head is one socket competing with the species' signature, where every chimera has three limb sockets. Five parts fix it, on the species whose identity they already are: **Wing Buffet** (goose forelimbs, 48/Sonic), **Shell Knock** (armadillo tail, 40/Sonic), **Business End** (skunk tail, 42/Gas), **Scale Storm** (moth forelimbs, 46/Gas), and **Live Wire** (electric eel tail, 50/Electric) — the last because Electric's only limb carriers were both `storm_eagle`, a chaos variant you must *breed*.
  Measured, same grades, team of three: a **sonic bruiser takes the Foundry at 78%** where the shipped `noise` archetype gets 59%, and still **63%** without the salvage part, so it is not a one-part dependency; a **gas bruiser collapses to 6%** there, because Gas is ×0 against Vehicle — the trade working. None of the five shipped archetypes uses a Sonic or Gas damage part, so `regionBench` is byte-identical before and after: a bench that cannot see a change to the axis it claims to measure is its own finding.
  Gated three ways: every enemy-tech part has at least one **fielded** source (per part, not per unit); every chart tag is swingable **from a limb** at 40+ power; and a majority-Armored strip must have three carriers of the piercing tag reachable when it opens, at a power worth pressing against its median armour. Multiplier tags are deliberately not gated that way — the class triangle already hands out a ×1.5, so Gas and Electric are bonuses rather than requirements, and a first draft that demanded three Gas parts before the tutorial strip was simply wrong. *Done when: no tag the region ladder depends on is carried by fewer parts than the ladder asks for* — the Foundry, the one strip that genuinely depends on a chart rule, opens with **five** reachable Sonic carriers, the best of them 62.
- **A6 — Eighty-six per cent of parts are in no combo (shipped).** 34 of 244, and **eleven species were in none at all** — gorilla, ram, porcupine, mantis, scorpion, and every one of the six chaos variants, which are the rarest things the game produces and had nothing to find. Eight new combos cover all eleven and are weighted to the sockets the first nineteen neglected: those put **ten organ parts and exactly one hindlimb** into a combo, which is the same shape A5 found in the tag chart. Parts in a combo **34 → 49**, hindlimbs **1 → 5**, species with none **11 → 0**.
  The other half was the Dex. All nineteen undiscovered combos rendered the *same sentence* — "an undiscovered pairing lurks in the parts bin…" — nineteen identical rows naming nothing. `comboHint()` now reveals in layers, keyed to the parts the player has actually handled and DOM-free so the screen and the suite read one function: nothing handled gives the keyword and the two slots (*`Venom+` · a head + an organ*), one half gives that half by name (*`Knockback` · Gorilla Haunches + a head*), and both gives *you have handled both. Put them on the same creature.*
  The harness rejected the first pricing twice: `porcupine_hide + mantis_forelimbs` floors at 79, so every legal combo on it was 80+ power and drawback-free and `sim.js` flagged it at 56–57% against a peer median of 23–25% — the *pair* was wrong, not the number. And the new gate caught something I had wrong: it first asserted a combo's parts must be in different slots and failed on A3's Full Spectrum, but Theater Tier II adds an `organ2` bay, so an organ pair is discoverable, just gated. *Done when: every species can appear in at least one combo, and the Dex's silhouettes point at something real* — **no animal is without one**, and all 27 silhouettes are distinguishable, with the text asserted separately from the keyword after a deliberate break proved the first version of that check hollow.
- **A7 — Obedience is decisive and invisible until it costs you (shipped, premise corrected).** Measurement disagreed with both halves. It was **never invisible**: every roster row on the briefing screen already printed `obedience N%`. And it is **not decisive** — the audit read the ignore *percentage* without measuring what it buys, and confounded it with Rejection, since an unsettled creature carries both. Holding settling fixed and replaying the real engine 300 times a cell at pilot skill 1.0, `patrol_2` runs **95% / 96% / 91% / 86%** at ignore chances of 0 / 20 / 40 / 60%: twenty per cent — the realistic figure for a settled mixed build at zero bond — is worth **one to three points**, inside the noise, and even the 60% cap costs about nine. The reason is structural: a disobeying creature substitutes another move from its OWN list, so with five or six mostly-damaging moves it loses a little optimisation and never a turn.
  So the fix is not to display it harder. An ignore now actually **changes the move** — the pool included the move just ordered, so about one ignore in five printed "ignores orders and improvises!" and then did exactly what it was told. And the briefing **prices** it: `forecast()` takes `obedient: true`, replaying the same fight with disobedience switched off and nothing else changed, so the gap between the two win rates is what this team's obedience costs against this encounter — *"Obedience 40% — worth about 6 points of win chance here. Train them, or let them settle."* A team that cannot disobey gets no line and pays nothing for the extra replays. *Done when: the number that decides whether your orders happen is on the screen where you choose who fights* — it is, and it is now convertible into a decision rather than a percentage nobody could act on. **Left open:** obedience is honestly reported and still nearly worthless; making it matter is a combat retune, and Rejection is the penalty that actually bites.
- **A8 — The harness has never simulated a solo player (shipped, premise corrected).** Two of the item's claims were wrong: `runSim` defaults to `teamSize` **1**, not 3 (its callers pass 3), and A1 already sweeps **[1, 2, 3]** and asserts forecast honesty at all three — but only over the **first strip**. The gap was scope: five nodes covered, sixteen not.
  What that hid: measured best-of-five-archetypes at each strip's own grade, **the ladder is climbable only at exactly three**. At two, four of five strips have a 0% node; at one, all five do, and the whole Foundry is unwinnable solo. The forecast is honest about it — 315 cells across every strip, node, size and build show **zero false "not survivable"**; the two apparent misses were undersampling on my side (greenfield/checkpoint ×2 is truly 2.0% over 400 runs and correctly called hopeless; kestrel/cloudbase ×2 is truly 4.5% and sits exactly on the 5% band boundary).
  So the criterion needed a decision rather than a gate: *"the team size a player has when they reach it"* was defined nowhere, and any gate written without it would have asserted whatever the balance happened to be. **`benchTeam`** declares it per node with a per-strip default, the way `benchGrade` already declares the parts a player arrives with. Measuring it exposed the same flaw in `benchGrade` itself — it is per-strip, but a strip is not reached all at once, and Greenfield's Guard Post (behind Threat Gen 2) runs **4% at `standard`, 48% at `prime`, 96% at `apex`**. Both are now per-node overridable. *Done when: the balance gate fails on a ladder that cannot be climbed at the team size a player has when they reach it* — it does, at a 25% floor against a measured map minimum of 29%, alongside a forecast-honesty sweep of 315 cells of which **105 are solo**. **Left standing by design:** a wall at team-of-2 means "go rebuild", which A2 and A4 make always possible without winning a fight.
- **A9 — Three frames since M0 (shipped, premise corrected — twice).** The item said frames "set base stats and socket count" and are "the widest lever in the builder". The socket half was **false**: all three frames declared the identical eight sockets, and socket count was a *facility* grant (`theaterGrants`), never a frame property. And the frame was not a lever at all — measured over 105 (node × archetype) cells at each node's own A8 bench conditions, **bigger was better in 92% of them**, the L frame was strictly best in 57%, and **the S frame was strictly best in exactly zero**. It was a ladder, and the "choice" was just whether you had bought the $900 Tier II yet.
  Two root causes, and the second is the interesting one. **Mass cost only turn order** — hp, stamina and regen were unconditional while speed decides nothing but who swings first — and the one categorical payoff for staying light, **flight**, was computed in `physiology.js` and read by *nothing*. Chasing that turned up a bigger hole: the `Airborne` **defender** tag came from *ancestry*, so 61 bird parts handed out Ground-immunity at any mass on any chassis (**66 of 90 purebred bird builds claimed it while flightless**) — and it never mattered, because across 40 enemy units and 127 authored moves **not one carried the `Ground` tag**. `Ground → Airborne ×0` was a **one-way rule**: the player's 20 Ground-tagged parts whiffed on 12 Airborne enemies, and the player's own Airborne tag had never once been tested. A5 gave the player parts for the tag chart; nobody ever gave the chart to the coalition.
  So: `Airborne` is now a claim about **physics** (lift ≥ mass), the coalition fights at ground level (**19 of 85 authored moves**, never every attack on a unit, densest in the Drowned Quarter at 35% and deliberately sparse in air-region Kestrel at 10%), and the frame stat spread is compressed so the chassis is a floor rather than the bulk (L's free lunch over M went from +12hp/+10 stamina to +6/+6). The fourth frame is the **A-class Kite** — a flying wing at 18 mass that is genuinely airborne on plain *standard* parts, where S needs prime and M and L never get off the ground — and it pays for that with `slots`, the lever this file always claimed frames had: a frame may declare which slot types its geometry supports, the Theater intersects that with what the facility installed, and the Kite has no hindquarters. Tier II now buys **both ends of the mass range at once**, so the upgrade asks *which problem do you have* instead of *are you further along*. *Done when: the frame choice is a real decision at more than one point in the campaign* — every chassis is now strictly best somewhere (A 9, S 13, M 11, L 33 of the decided cells — S went from **zero of 105**), L's share of decided cells fell from **91% to 50%**, and **the best chassis differs by strip**: the Foundry's is M, Greenfield's and the Spire's is L, the Drowned Quarter splits A and L. The ladder still climbs.
  Two corrections to my own first answer, both caught by gates already in the repo. My first pass made the **Foundry** the densest ground-fighting strip — and the Foundry's identity is *armour*, answered by Sonic, so R26's "one anatomy answers it decisively" gate fired: its margin over the runner-up had fallen from a pre-A9 **+25/+30pp** to **+6/+13**. Measured against the pre-A9 tree rather than tuned to green (Kestrel and Drowned came back byte-identical, so the damage was Foundry-specific and mine), the ground-level fighting moved out of a strip whose question was already answered. And the `kite` archetype first carried falcon parts where its peer `wings` carries eagle, so it was measuring the parts rather than the chassis; it now runs the same loadout minus the hindlimb it cannot bolt. Applying the rule symmetrically also caught R27: a rival that counters a Ground kit with **Airborne** anatomy was bolting the wings to its usual Rumbler, so its counter-pick bought wings and stayed on the ground — the countering specimen now takes the lightest chassis that lifts its build (a lab that has lost to you twice turns up flying a Kite), while every other specimen keeps the lab's own taste.
- **Economy pass (requested alongside A9, not an audit finding).** Node income was raised 50% across the map (2385 → 3585/day held end to end), because the wait to afford the Tier II gantry ran about eight days of held territory, which is a long time to look at a locked chassis. And `completionBonus` pays per day for holding **every** node of a region with none contested — worth roughly the strip's best single node, so finishing a region reads as earning a sixth location. It is suspended the moment a counter-offensive contests *any* node in the strip, which is what makes defending the cheapest node in a completed region worth as much as defending the richest.
- **A10 — Stragglers (shipped; the named one was the small one).** `operations.json` did still carry `injuryHours: [2, 5]`, and the audit found **why**: seven modules merge `{...CODE_DEFAULTS, ...data}` so a Node tool with a partial bundle still behaves — the data always wins, so a default that disagrees never runs and a retune editing one side leaves no trace. R24's cut touched `campaign/operations.js` (already `[1.5, 3.75]`) and missed the JSON.
  Two bigger ones hid behind it. **`growthHours` was cut for zero of 32 species while `incubationMinutes` was cut for all of them** — the egg timer shortened and the growing-up timer, the same pipeline one stage later, left alone: 123 values today against `injuryHours`' two. (My first pass keyed species by array index and A3's nine additions had reordered them, which made that comparison meaningless; keyed by id it is unambiguous.) And the **rehab formula's per-unit coefficients** were missed while its base and cap were cut, so that clock fell only to **0.86–0.93** — and least of all for the strongest units, the ones you wait longest on.
  `adult` and `prime` are cut; **`elder` is deliberately exempt and gated to stay that way**, because it is when the extraction penalty lands (`AGE_FACTOR` 0.8 against prime's 1.0) — shortening it would make every animal in every live save decline sooner, taking something away from saves already in flight. Cutting the waits and not the penalty *widens* the prime window (42h → 46h for a goat) rather than narrowing it.
  *Done when: one pass reconciles every real-world clock in the data against the cut that was supposed to have touched it* — it does, and the pass leaves two gates behind: **every numeric knob a module defaults and the data also sets must agree** (60 compared; copy strings are excluded, since the data is the source of truth for wording), which is the invariant that would have caught `injuryHours`; and **a hand-maintained roll of every clock**, R29's `SHIPPED_SYSTEMS` idiom applied to time, so a new clock has to come and declare itself and the next global retune gets one list plus a suite that names every value it missed. The first gate caught a live drift on its first run, and it was mine: A9 added the Kite to `frameBase` in the data and not to `UPKEEP_DEFAULTS`.

- **R30 — Four moves, and every one of them says what it does (shipped).** Two complaints, one cause. Anatomy handed a chimera one move per part plus every combo it unlocked — six or seven buttons — and **110 of the roster's 271 moves (41%) carry no power at all**. The battle screen could not fit them, so since R28 it rendered **three moves and a "More moves" button**: a four-slot grid apologising for a creature that did not have four moves. And a utility move rendered as the word `util` and nothing else, so *"Nub Wiggle · 10⚡"* never once told anybody it raises evasion — the sentence explaining it was sitting in `keywords.json` and was shown to nobody.
  So the cap is real: **four slots, combos competing for them**, because a combo you choose to carry is what makes discovering one a question rather than a free button. What a chimera KNOWS comes from its genome; which four it can press is a decision you **retrain** ($8 and a shared cooldown — reordering what it already carries is free, learning is not, and the message names what it gave up). Move identity is *where a move came from* (`p:bear_tail`), never its stats, so a moveset survives a grade upgrade or a trait rewriting its keywords. Descriptions live in **data**: each keyword gained an `effect` template filled with that move's own magnitude, so *"Returns 45% of any damage you take"* is generated, not written twice. A **long press** opens the whole thing — the arithmetic against the creature in front of you, the tag chart spelled out, one line per keyword. *Done when: a chimera fights with exactly four moves it was trained to know, every move says what it does, and holding one explains it in full* — it does, at `SAVE_VERSION` 28.
  **Four bugs found by building it, three of them mine and one older.** `movesFromTokens` emitted `.source` while `activeMoves` looked up `.id`, so **every moveset lookup missed and everything silently fell back to the default pick** — which invalidated a "balance holds" claim I had already reported, and was only exposed by A8's climbability floor reading 13% against its 25% gate. The **default pick flooded spare slots with attacks**, taking a pure tortoise from 87% to **0%** — caught by R23's own gate, not by my archetype sweep, because every archetype is attack-led. Fixing *that* dropped `fumes`' Gas move, the one thing that archetype exists for: the tag IS the chart, and power does not get a vote on whether you keep your answer to a chart row. And the browser QA caught the last one: comparing against the **stored** moveset rather than the effective one told a migrated save it was learning all four moves it had been fighting with for weeks, and charged for it.
  Balance measured with movesets genuinely in effect: map minimum climbability **29%** against A8's 25% floor, all three shaped regions still decisive (kestrel +14, drowned +14–23, foundry +14–30) with three distinct champions. The harness now fields each archetype's *tuned* four via `benchMoveset` rather than the default pick — A8's floor and R26's margins are statements about the **content**, and gating them on my picker would have measured the picker instead.
- **R31 — The Resequencer: what a DNA vial is actually for (shipped).** A vial has been produced by **every extraction since M2 and read by nothing** — `extract.js` pushed one, the Gene Vault listed it, and that was the end of it. Worse, it concealed the one genuinely irreversible act in the game: `potential` and `genotype` live on the *animal*, so graduating your best recessive carrier **destroyed those genes** with no way back.
  Spending a vial now grows that donor back — same species, same star potential, same genotype. **2 real hours** (shortened by the Incubator's existing `hourScale`), **75% to take**, and a **new-gene chance of 6% + 5%/star** multiplied by the Incubator's `mutationBonus`. Quality buys **upside, never safety**: a five-star vial mutates far more often and fails exactly as often, so banking a good one beats banking four ordinary ones and no amount of quality removes the risk. The Incubator governs both halves because a resequencing *is* an incubation — that track gained a second reason to exist without one new facility knob. The outcome is **sealed at launch** from a seeded stream, like the vat and the jobs board, so reloading cannot reroll a failure into a success. Vials written before R31 kept only a star average and rebuild stats to match it, so a vial banked long ago is worth exactly what it always said. *Done when: a vial does something, and what it does uses what a vial actually is* — measured over 400 runs, **72% took, 29% of successes threw a new gene, and the donor's recessive survived 286 of 286 successes.**
  **Four bugs, three mine.** Aborting wrote the *post-mutation* genome back into the vial, making abort-cycling a free ratchet; the fix then failed because I had taken a **reference** to the vial's `potential` and mutated it in place, so the sample was contaminated before it was copied — 60 abort cycles walked a 3/3/3/3/3 donor to 3/4/4/5/3 without completing a run. **Migration 29 did not return the save**, and `migrate` does `save = fn(save)`, so a missing return turns every existing player's save into `undefined` on load — all 28 other migrations return correctly. And **neither the harness nor the suite loaded the new data file**: `resequencerTuning` falls back to code defaults, so my probe had been measuring defaults rather than the shipped JSON and giving the right answer for the wrong reason. House rules held: a **full pen makes a finished run wait** rather than losing the animal, **aborting returns the vial** unharmed, and the odds are **quoted before the player commits**.

### 9.2b Third wave (R32–R53) — **all twenty-two shipped**

R77 found these missing entirely: the roadmap jumped from R31 to R54 while
twenty-two milestones had shipped in between, so a reader taking this
document at its word would have been looking at a game two months out of
date. They are listed rather than written up — each one's measurement, its
corrected premises and its known issues are in `PROGRESS.md` under the
session that shipped it, which is where that detail has always lived and
where it does not have to be maintained twice.

- **R32 — a part finally says what animal it came from.** ✅
- **R33 — the chimera dossier — physiology on a finished creature.** ✅
- **R34 — the purebred set bonus, which nothing read.** ✅
- **R35 — the other matchup layer, on the screen where you choose.** ✅
- **R36 — the Dex says what the roster is for.** ✅
- **R37 — the lesson is behind the wall it explains.** ✅
- **R38 — "Standard" is three different animals.** ✅
- **R39 — the gate that checked five of six screens.** ✅
- **R40 — the campaign had an end and never said so.** ✅
- **R41 — a chimera you keep.** ✅
- **R42 — The Gauntlet.** ✅
- **R43 — the Sparring Ring holds charges.** ✅
- **R44 — the Pens at nine chimeras.** ✅
- **R45 — the Dex at twelve screens.** ✅
- **R46 — the Ranch at twenty animals.** ✅
- **R47 — the Ranch chrome earns its height.** ✅
- **R48 — the Sparring Ring you can see.** ✅
- **R49 — the map's spar button reads the predicate.** ✅
- **R50 — a new module has to declare itself.** ✅
- **R51 — the field guide records outcomes.** ✅
- **R52 — the Vault at a completionist's inventory.** ✅
- **R53 — one Vault shelf per animal.** ✅

### 9.3 Third audit (R54–R62) — **all nine shipped**
Run after R53, against a game whose roadmap was finished: M0–M7 shipped,
waves R1–R19 shipped, §9.1 and §9.2 both closed, and ten consecutive phases
(R44–R53) spent on screen density and the harness. Same rule as the first
two audits: every line names the evidence that put it there, and the
evidence is a number or a grep wherever one was gettable.

**Ten findings, nine phases.** Two of the findings are one-line fixes and
share a phase with the gate that would have caught them, because padding a
one-liner into a session is how a queue starts lying about its own size.
The overhaul is deliberately last: it is the largest, and four of the
phases before it delete work it would otherwise have to carry.

One correction belongs at the top, because the audit nearly shipped it as a
finding: **"the game is silent" is false.** `audio/sfx.js` is imported as a
namespace by five modules, so a grep for `playSfx|sfx(` returns nothing and
every `sfx.play()` call is invisible to it. Checked before filing.

- **R54 — Saves you can carry.** `grep` for any export, download or backup
  path returns **zero**. The whole game lives in one browser profile's
  `localStorage`: clear site data, switch phones, or install the TWA and it
  is gone. For a project whose defining rule is that a save is sacred and
  is never reset, nothing protects one from the browser. Size is not the
  obstacle — a completionist save is **~38 KB against a ~5 MB budget**.
  *Done when: a save can leave the browser and come back, an import can
  never destroy the game already in progress, and every refusal says which
  rule it broke.*
- **R55 — A second run.** `newGameState()` is reachable only from a missing
  or corrupt save; there is no reset anywhere in the UI. The sacred rule is
  about never DESTROYING a save through migration — it was never about
  denying a player a second playthrough. Pairs with R54, which is what
  makes a reset safe: you can carry the first run out before starting the
  next. *Done when: a player can start over without clearing site data, and
  cannot do it by accident.*
- **R56 — The playthrough has never been walked.** Every measurement this
  project owns is a slice: `runSim` benches a build, `ladderBench` a
  ladder, `regionBench` a strip, `facilityPayback` a track. Nothing walks
  ONE seeded save from an empty ranch to dominion and asks about pacing —
  real time elapsed, whether money is ever the binding constraint, where a
  player stalls with nothing runnable. R41's "L8 at dominion, L10 on a
  realistic diet" is an assumption the entire late game rests on and it has
  never been walked end to end. *Done when: the harness plays a whole
  campaign headless and reports the curve, and one deliberately broken
  economy number fails the build.*
- **R57 — Three villains with no face.** `portraitSeed` is authored on all
  three rivals and has **zero references in any `.js` file**.
  `campaign/ui.js:336` draws the rival's LEAD CHIMERA; the rival is never
  drawn. They carry a title, a philosophy, a monologue set and an
  escalating dossier, and are represented on screen by their pet. The
  renderer already draws creatures and units from data. *Done when: a rival
  has a face, it is procedural and seeded from the field that has been
  waiting for it, and the Dex dossier and the duel both use it.*
- **R58 — The triangle never says why.** `classes.json` carries three
  authored lines — `ground_water`: *"Solid footing beats a flopping swimmer
  on dry land."*, `water_air`, `air_ground` — and **nothing reads them**.
  The engine prints "Ground beats Water!" and swallows the reason. Exactly
  R20's dead-keyword shape: authored content with no caller. *Done when:
  the reason appears where the multiplier does, and smoke asserts every
  matchup line has a reader.*
- **R59 — Audio outside the arena.** Fifteen `sfx.play()` call sites,
  **nine of them in `battle/ui.js`**. The War Room, Pens, Vault and Dex are
  entirely silent: taking a node, beating a rival, a chimera levelling, a
  resequence decanting all make no sound. Fourteen stingers exist and
  combat uses most of them. *Done when: the moments that matter outside a
  fight are scored, and the mute toggle still silences all of it.*
- **R60 — Split the War Room.** `campaign/ui.js` is **1,136 lines**, the
  largest module in the repo and the largest screen by a wide margin: five
  tab views in one file, and the only screen that needed a `document` guard
  (R49) before the harness could render it. The Dex had its logic split
  into `dexentry.js` and its bar into `ui/tabs.js`; the War Room, which is
  where both patterns came from, never got the equivalent. *Done when: the
  War Room's logic is DOM-free and testable the way `dexProgress` is, with
  no change to what the screen renders.*
- **R61 — No orphan content.** Three findings and the gate that would have
  caught all of them. `utilityValue` in `battle/ai.js` is exported and
  appears exactly once in the repo — its own declaration. `species.json`
  names a crocodile move **"Death Roll"**, against CLAUDE.md's *"Zero death
  language"*, which is stated as absolute rather than as a preference. And
  R57 and R58 above are the same species of bug: authored content with no
  reader. R50's `MODULE_NOTES` catches an unclassified MODULE; nothing
  catches an unreferenced EXPORT or an unread DATA KEY. *Done when: a dead
  export, an unread data field and a banned word are each a build failure —
  and the gate is written last, after R57 and R58 have cleared the
  instances it would otherwise fail on.*
- **R62 — The news wire, as a system.** The overhaul, and the one finding
  with a hard convention behind it. CLAUDE.md: *"All content is data.
  Adding content must never require engine edits. If it does, the engine is
  wrong — fix the engine."* The wire violates it outright: **19
  player-facing news strings are hardcoded inside engine modules**
  (`'THE GAUNTLET IS CLEARED…'`, `` `${node.name} seized. Income +$…` ``)
  against 33 authored lines in `/data`. So the game's own voice is half
  engine and half content, and a new world-reaction is an engine edit.
  The overhaul: engines emit `{event, params}` and never a sentence;
  `news.json` owns every phrasing, with variants per event so the world
  stops repeating itself and a weighting by the player's philosophy, whose
  machinery R10 already built for the rivals. *Done when: a new world
  reaction is a JSON edit, no engine module contains a player-facing
  sentence, and smoke asserts every emitted event id has copy AND every
  line has an emitter — R20's invariant, pointed at the wire.*

### 9.4 Fourth audit (R63–R83) — **shipped; all three gaps R77 named are closed (R84, R85, R86)**

Run after R62, against a game with three closed audits behind it. Same rule
as the other three: every line names the evidence that put it there, and the
evidence is a number, a grep, or a headless run wherever one was gettable.
Four agents read the whole repo (engine correctness, content, UX at 380px,
roadmap-versus-shipped) alongside the harness measurements below. Five
outright bugs were fixed in the audit's own PR rather than queued (a
`ReferenceError` on the Jobs board's "Run it" that shipped in R60, an unbound
`infirmaryGrants` in the last-stand branch since A1, `news.json` philosophy
pools keyed on ids that do not exist, four bosses transforming with a blank
line, and the Graduate and vat agenda chips landing on screens that have no
Extract button and no vat). Everything below is bigger than a one-liner, or
needs a gate before it is safe to touch.

**Fifteen findings, fifteen phases,** ordered by what a player hits first.
The queue is a proposal: prune it before starting R63.

- **R63 — The contest treadmill is the wall (shipped; premise corrected).**
  The audit filed this on the 180-day walk: **3–5 of 21 nodes held**, and
  it blamed the counter-offensive clock. The walk was the problem. It could
  only see Greenfield (`nodeStates()` defaults its region to the first
  strip), it called `startSpar()` and never fought the spar, it never ran a
  rescue raid so every capture was a dissection, and it resolved defences
  past `finishBattle`, so its roster read **xp [168, 19, 0, 0, 0, 0] at day
  180** and it attacked the Guard Post **93 times at 2%**. Rewritten to
  play the game as designed — whole map, three spars a day, rescues, the
  A-team, Prime graduations, the class the map's demand line asks for, a
  stable of nine — it holds **16 / 20 / 21 / 21** at day 180 on four seeds
  and reaches dominion on two of them (day 45, day 135); three of six on a
  wider set. Then the contest dials were measured: a cap changed nothing,
  a decay made it worse (the record also spaces the schedule), a grace
  period was noise, and a first defence at **300%** still cost under a
  quarter of the map, while heavier garrisons hold the walk down in a clean
  monotone curve (**x2 → 0.55 of the map, x2.5 → 0.31, x3 → 0.07**; the gate
  uses x2.5, re-measured in R65 once the walker could run jobs). (Veterancy off
  read **3 nodes** at the time; R64 found that a knife-edge — once the walk
  ticked every passive system the browser does, the same fixture cleared
  the map, and either scars or temperaments alone could flip a seed — so
  the doubled garrison is the oracle that shipped.) Shipped: the walker,
  `escalationMax: 2` as insurance against the 330% tail, `defend` and
  `rescue` on the agenda, and a gate that pins all of it — including that
  contests are pressure and the fights' own numbers are the wall. *Done
  when (as restated by the measurement): the walk reaches dominion on a
  realistic diet, the two clocks that cost a node or a creature are on the
  agenda, escalation has a ceiling, and the walk is a gate that a broken
  garrison number fails.*
- **R64 — Being away is strictly profitable** *(shipped, premise
  narrowed).* Measured with the R63 walker: thirty days closed, from the same
  save on the day the app shut, banked a **full month of pay**, met **one
  convoy** on return against the **21–26** a daily player fought, and lost
  nothing but stock condition. Underneath it two elapsed clocks disagreed:
  `main.js` read `NOW()` seven times in one tick, the ranch charged a
  month's upkeep from `state.lastTickAt` and clamped at zero, then the
  campaign paid a month's income from `campaign.lastTickAt` — so a poor save
  came back **$760 richer** than the same save played hourly, exactly the
  upkeep the clamp forgave. Shipped: one `now`, one clock, one order
  (`campaign/world.js`, which the shell and the walker both tick through;
  the second clock is folded in by SAVE_VERSION 35), and the schedule
  replays through the gap — each convoy arrives when it was due, waits its
  window, leaves without taking anything, and the node it sat on paid
  nothing meanwhile; only one still inside its window is waiting on return,
  with its full window from then. Walked: a month away now banks **84–95%**
  of full pay and the world moved as much as it did for the daily player
  (**24 vs 21, 26 vs 26** convoys). *Done when: one `now` per tick and one
  elapsed clock per save; elapsed time resolves the contests it contained,
  capped with a mercy; and a gate replays 30 days away against 30 days of
  daily play and asserts the absent save is not ahead* — **passes**, with
  "not ahead" read as: less than full pay, more than half of it, every node
  it left with, and the same number of convoys.
- **R65 — Timers that start when you look** *(shipped, scope widened).*
  The audit named four instances; measuring every elapsed resolver against a
  six-day absence found **six**, all the same shape — a resolver stamping
  its output with the tick that noticed rather than the moment the thing
  happened. A job that came home six days ago locked for a **fresh 4.5h**
  cooldown and handed its crew a **fresh 1.9h** bruise; the animal it won
  arrived a **newborn** after a week in the van; a vat child decanted six
  days ago **restarted its settling clock**; a resequenced animal arrived a
  newborn too. Two more were not about the clock: a failed job overwrote a
  **4h battle wound with its own 1.9h bruise** — a free heal, so the worse
  day was the better outcome — and the injury RNG was keyed on
  `warRecord.wins + losses + injuries.length`, incremented *after* the loop,
  so the second casualty of one fight was **byte-identical** to the first of
  the next. Shipped: one rule (`endedAt`, never `now`) across all six
  resolvers, one cooldown helper for both the resolve and abort paths, one
  inflict point (`applyInjury`) that is longest-wins and owns the per-creature
  injury tally both the name roll and the scar roll key off. The gate is a
  **sweep, not a list**: prime every resolver with something a week old, tick
  once, and walk the whole save for any timestamp equal to the return —
  exactly one exemption survives, R9's defence window, and removing it fails.
  Found on the way: the walker's `opReady(state, id, content, now)` put
  `content` in `now`, so **every job read as on cooldown and the walk had
  never run one** (fixed; the R63 walk improves to 83/84 nodes and three
  dominions). *Done when: every timer written by an elapsed-time resolver is
  anchored to the event's own clock, injuries only ever lengthen, and a gate
  replays a week's absence and asserts nothing starts at the return time* —
  **passes**, with "nothing" read literally, as a sweep of the whole save.
- **R66 — The preview lies to the player and to the AI** *(shipped, one
  more divergence than the audit found).* `previewMove` is the single source
  of truth for "what does this button do" — the move chip reads it, the AI
  scores on it, the briefing band forecasts from it — and Monte-Carloing the
  engine against it found **three** places it disagreed, not two.
  **Multi-Hit** previewed `(2 + max(1, N−1)) / 2` against an engine rolling
  `2 + floor(r · max(1, N−1))`: half a hit low for every integer N (at N=2,
  1.5 hits against a *guaranteed* 2) and **19.5% low** on the bat's Wing
  Beat, whose N is 4.5 at Prime because keywords scale with grade — so the
  mean had to be the exact expectation of the floor, not `(2 + N) / 2`.
  **Turn-one evasion** was absent: the engine gives a Skittish defender an
  extra dodge on the opening exchange, and the preview said a swing lands
  **92%** of the time when it landed **64%**. And the one the audit missed:
  a **cornered Brave attacker crits**, which the preview omitted "by
  design" and which measures **18.4% low** — a whole extra swing the AI
  never counted. (Armour rounding was suspected and cleared: 0.1–0.4%.)
  Alongside it the AI's own reachability: two `Math.min(Infinity, ...spread)`
  idioms made an empty list read as a real minimum, so a **utility-only
  combatant read as starving forever and breathed for the whole fight**, and
  `staminaDrain` always claimed its 1.8× "we can strand them" bonus against a
  foe with nothing to strand; a guard on a value that cannot be negative went
  too. `scoreMove`'s `battle` parameter, passed and never read, is now what
  carries the turn. *Done when: a gate compares the preview's expected value
  with the engine's Monte-Carlo mean per keyword within tolerance, and the AI
  has no branch the suite cannot reach* — **passes**, all seven benched cases
  within **1% on damage and 1pp on accuracy**, and every call site is swept
  for the turn.
- **R67 — The KO turn skips end-of-turn for both sides** *(shipped).*
  `endOfTurn` sat behind `!battle.pendingReplace`, so the round a chimera
  went down ticked nothing: venom, bleed, regen and stamina recovery all
  skipped, **for both sides**. Measured on a foe carrying three venom and two
  bleed: **74 damage on an ordinary turn, 0 on the turn a chimera went
  down** — a player cycling a deep bench got a free round of every effect
  they had spent turns applying. It now runs whenever the battle is live;
  `endOfTurn` already skips anything at zero, so the creature that just went
  down still takes nothing, and the KO is announced once rather than twice.
  Alongside it, `SKILL_BY_TIER` was a **six-rung array in the engine against
  nine rungs of `tierScale` in the data**, so tiers 6–8 were all piloted
  exactly as well as tier 5 while hitting up to 2.3× stats, and a tier 7
  encounter — which `tierScale` already prices — would have needed an engine
  edit to be piloted properly. `aiSkillByTier` now sits in `enemies.json`
  beside the curve it parallels, nine rungs, with the old array kept as the
  fallback for a caller with no bundle. Benched: the Spire is unmoved
  (47/69/47/53/34/63 across archetypes at apex). *Done when: the enemy's half
  of end-of-turn runs on the KO turn, the skill ladder is data, and a gate
  plays a KO turn and asserts the poison ticked* — **passes**.
- **R68 — 244 parts, six moves.** ✅ *Shipped.* The roster was mostly
  costume. **Tails: 40 parts carrying 6 distinct effects, 35 of them the
  identical `{evasionUp: 1}`** — five of a chimera's six sockets were a
  decision and the tail was a formality. **Hides: 21 identical thorns.**
  **Five species shared a literal `{power: 1.15}` set bonus**, so four of
  them were paying for a name. `Camo` was a tag on six chameleon parts with
  **no chart row and no enemy carrying it** — R20 struck the `camouflage`
  keyword as a duplicate of evasionUp and left the tag behind, doing
  nothing: R20 and R58's shape exactly, authored content with no reader.
  *Burrower* was promised in §3 and never reached a single part.
  - **Now:** tails carry **19 distinct effects, largest group 5 of 40
    (12.5%)**; hides **9**, with the three §4.1 names finally distinct —
    pangolin *Roll Up* is the guard + reflect row 7 promises, tortoise
    *Shell Fortress* is thorns + regen, porcupine *Quill Coat* is all quills
    and no guard. Set-bonus collisions **0**, each expressed in dials the
    engine reads. `Camo` has a chart row (*Sonic ≫ Camo* — a shape you
    cannot see still echoes) and the Surveillance Drone carries it, so the
    rule is reachable from both sides. Burrower struck rather than invent a
    ninth tag to justify a sentence.
  - **The goat's Iron Gut is real money at last.** `chimeraUpkeep` reads
    `part.passive.upkeepMult` generically — 20 a day against 40 — so the
    ledger never learns a species name and the next such passive is a JSON
    edit.
  - **One animal must not carry the same button twice.** Fourteen did: a
    bear whose tail and organ were both `{powerUp: 1}`, five whose tail and
    hide were both `{evasionUp: 1}`. The criterion is *identical*, not
    "shares a keyword" — the chameleon's `{evasionUp: 1}` tail at cost 10
    under its `{evasionUp: 2}` hide at cost 12 is the Ghost's whole design,
    which §4.1 row 20 spells out in the word *stacks*. The first draft of
    the rule outlawed that and cost the chameleon 53pp of win rate before
    the measurement caught it.
  - **Three readers were wrong, and fielding the content honestly for the
    first time is what surfaced them.** `ai.js` scored Knockback a flat
    `+9` — but `knockback()` re-queues the fighter it punts and rebuilds it
    fresh, so the damage already spent is *refunded*: punting something you
    are three swings into is a rout of your own position, and the pilot paid
    a turn for it. Slow was priced at the target's whole speed, ignoring
    both how much the move takes (the data ships 0.3 to 1) and that Slow,
    alone among the control keywords, has no already-applied guard and
    **compounds**. And the starvation guard — the one R22's comment says
    cost a whole class — **has been unreachable since R66**: it took its
    cheapest swing from `options`, which is already filtered to
    `cost <= stamina`, so `stamina < cheapestSwing` could never once be
    true. An eagle pressed a cheap tail **374 times in 60 fights** instead
    of resting toward its 30-stamina Dive Bomb. Reading the whole moveset
    instead took that build from 56/60 to **60/60**.
  - **R24's criterion was measuring the seed, not the gene.** It fielded one
    build against one encounter whose second wave is a Vehicle — machinery
    does not bleed, so a Venom Gland was half dead on arrival — and demanded
    a 10pp swing in *team win rate* over 80 fights, a metric that saturates
    at both ends and is worth ~10pp of noise on its own. It passed for four
    sessions on the seed string it happened to use, and re-authoring one
    tail re-rolled that dice. Rebuilt: organic encounters only, the default
    moveset rather than the attack-led bench one (R30's lesson — a gene on a
    hide is invisible if the hide is never fielded, which is why barbed_skin
    read a flat 0.0%), pooled over 9 builds × 4 encounters, turns and
    HP-left rather than win rate, **two independent seed families**, and a
    null control that sets the bar instead of a number picked by hand.
  *Done when: no two non-variant species share an identical slot kit, every
  promised signature ability is shipped or struck from §3, `Camo` and
  `Burrower` are read by the engine or removed from the data, and a gate
  fails on identical-kit collisions.* ✅ all four.
- **R69 — The late game has no content in it.** ✅ *Shipped.* Fauna
  unlocked per region: **Greenfield 16, Kestrel 7, Drowned 7, Foundry 2,
  Spire 0** — taking the final region put nothing in the catalog.
  `tierScale` priced tiers 7–8 and nothing fielded them; Threat Generation
  stopped at 3; all three rivals gated on **Greenfield** nodes (notoriety
  40–85), so the ladder was climbed before the map was. The roadmap's Tank
  and Artillery were never built.
  - **Fauna, redistributed rather than duplicated.** Four species moved out
    of Greenfield's later nodes (one per class, so Spire's "all three
    classes" demand has an unlock to match) into Foundry and Spire:
    **Greenfield 16 → 12, Foundry 2 → 3, Spire 0 → 3.** This nearly shipped
    wrong: the first draft handed each of the six A3 variants a node,
    because they had no `mailOrderPrice` and no unlock — which is exactly
    what R6 built them NOT to have. *"Bred, never bought: they surface as
    the rarest mutation branch and then breed true"* (§3.2, R6); A6 calls
    them "the rarest things the game produces." Every one of the 34
    ordinary species was already reachable before this phase — the real
    gap was which region a species belonged to, not whether it existed
    anywhere. `SAVE_VERSION` **35 → 36**: a save keeps every species it
    already unlocked via `faunaGranted`, the same permanent-grant mechanism
    v24 built for exactly this reshuffle, and its own comment already said
    "any future reshuffle of unlocksFauna is safe for the same reason."
  - **One rival per region, met on arrival, not stacked on Greenfield.**
    Aloft and Trench re-gated onto Kestrel and Drowned's first nodes; two
    new rivals, **Magister Cinder Ferrule** (Foundry, Armored) and **Chair
    Emerita Prudence Lacuna** (Spire, mixed), each waiting on the last and
    costing more notoriety than it.
  - **Threat Generation 4**, read off the same data-driven ladder R26 built
    — a rung is a JSON edit, still. Two Spire nodes gate on it.
  - **The Tank and the Artillery**, procedural SVG, both fielded at tiers
    7–8: **Siege Tank** is the most armoured thing on the roster (Sonic is
    its authored answer) with a 2-turn-charge Main Gun; **Battery 88** hits
    harder and folds if you reach it (74hp/5armour against the Tank's
    138/20) — "must be rushed" made mechanical, not just flavour text.
  - **Two pre-existing cracks, found by fielding this honestly rather than
    by looking for them:**
    - **Heron's kit was already climbing toward the "no build dominates"
      ceiling before this phase touched it** — measured at HEAD: a 6–13pp
      gap over the peer median at Standard, 17–20 at Prime, 19–22 at Apex,
      21–24 at Prismatic. R69's harder tiers nudged the peer median down
      the last few points needed to cross 30pp, but the climb was already
      there, invisible because R68's own suite only ever measured it
      against the roster that existed then. `heron_head`'s power **58 →
      54** flattens it; clean across all four grades and six seeds.
    - **R68's away-gate logged a nonsensical row for every underwater
      seed** — `banked -1429 of -90 (1588%)` printed BEFORE the
      "underwater, skipped" line that superseded it, because the log and
      `compared++` both ran ahead of the guard instead of behind it. No
      assertion depended on the order; fixed as a drive-by.
  *Done when: every region unlocks fauna and hosts a rival, Gen 4 and the
  heavy vehicles exist in data, and a gate asserts a floor of unlocks and
  one rival per region.* ✅ ten breaks, all red — identical-kit-style
  coverage for fauna gating, rival regioning and chaining, the Gen 4 rung,
  and both heavies' §3 identity (armour, fragility, the charge itself).
  **Still open, out of this phase's Done-when:** the Containment Cannon
  mk2 upgrade §3 also promised alongside the Tank and Artillery remains
  unbuilt.
- **R70 — Dead and unreachable content, second pass.** ✅ *Shipped.*
  `jeep_50` was never fielded, so `v8_heart` could not be obtained;
  `air_patrol` and `harbor_watch` hung off no node; **34 of 41 species had
  no `flavor`** and `ranch/ui.js:64` rendered the empty string; **47 emoji
  sat in data files** (guides 30, operations 7, facility 6, classes 3 — one
  of them Unicode 14, which older Android renders as a box) against *"no
  emoji-as-art."* R68 had already rebuilt R24's gene-pool probe once and
  proved it could only make an aggregate claim — `venom_gland` alone read
  1.1%–8.2% across four seed families at N=25, so whether it was quiet or
  merely unmeasured was open.
  - **`patrol_2`'s third wave swapped to `jeep_50`, fielding it.**
    `air_patrol` and `harbor_watch` moved from a single hardcoded
    `rescueEncounter` id to a `rescueEncounters` pool, picked
    deterministically per captive (`rescueEncounterFor`) — a fourth rescue
    site from here is a data edit, not an engine change. All 34 species
    carry a one-line flavor sentence drawn from their own `diet`/`role`
    fields; zero banned death-language.
  - **A 53-icon inline-SVG set (`ui/icons.js`) replaced every emoji in the
    game, not only the ones the phase went looking for.** The first sweep
    converted the 47 data-authored `.icon` fields — 42 icons, wired into
    every screen's headers, tabs and badges. A browser QA pass on the
    result then found `hasRawEmoji: true` on **every single tab anyway**:
    sixty-odd more pictographs were hardcoded directly into eight UI
    modules' template strings with no `.icon` data field to have converted
    in the first place — headings (`ranch/ui.js`'s "🗺 Path to World
    Domination"), buttons, the footer save/mute chrome, even the favicon.
    R61's original gate could not have caught this; it only ever opens
    `data/*.json`. A third layer turned up after that: `style.css`'s
    `.ticker::before { content: "📡 BREAKING: " }` painted a live emoji on
    every screen's footer, on every visit, invisible to both a JS-source
    scan and to the browser QA's own `innerText` check — this Chromium
    build does not fold `::before` generated content into `innerText`, so
    a rendered-DOM check missed exactly what a screenshot caught by eye.
    Moved into the ticker's own JS-rendered markup as a real icon instead.
    11 more icons and 62 more call sites later, zero pictographic emoji
    remain outside one deliberately-kept exception (a battle-HUD status
    strip that mixes two newer-block pictographs among three older Dingbat
    glyphs doing the identical job in one packed row — converting only the
    two would size-mismatch them against their row-mates). R61 gained an
    eighth check watching JS source *and* `style.css` directly, scoped to
    the actual "renders as a colour picture" Unicode block so it does not
    also flag the arrows, stars and checkmarks this codebase uses
    everywhere on purpose.
  - **The gene probe now makes a per-gene claim for all twelve traits, at
    N=200 (was 25).** Floor dropped 0.05 → 0.02, the aggregate bar rose
    from 1.8× to 4× the floor, and every trait individually has to clear
    1.5× the floor rather than riding the aggregate. `barbed_skin` failed
    the new bar outright — 0.0% regardless of sample size — for a
    pre-existing engine reason the old statistic was too coarse to see:
    `movesFromTokens` let a part's own `moveKeywords` value beat a trait's
    on any shared key unconditionally, independent of which was bigger. 22
    of 42 hides already carry their own `thorns` (an R68 side effect), so
    `barbed_skin`'s `thorns: 0.2` was silently discarded on all of them.
    Fixed with `Math.max()` on the merge plus a magnitude bump to `0.7` —
    **both** required, since 0.2 stayed under a typical hide's 0.45 either
    way. Reverting the merge fix alone still passed the 200-fight,
    two-family probe: only crocodile and shark, the two of ten test builds
    whose hide carries no native `thorns` to collide with, carried the
    pooled signal by themselves. A statistic that cannot tell "works
    everywhere" from "works on a fifth of the roster" is not proof the
    mechanism is fixed — added a direct mechanism assertion beside it that
    checks the merged keyword value precisely, independent of battle noise.
  *Done when: every unit is fielded somewhere, every species has flavor,
  data carries icon ids that resolve to inline SVG, the gene probe resolves
  every trait against its control well enough to make a per-gene claim, any
  gene that then reads under the floor is fixed, and R61's gate is extended
  to all three.* ✅ all five — R61 gained checks for units fielded, species
  flavor, the data glyph scan, icon-id resolution, and (found along the
  way) a JS-source glyph scan the first four checks could not have caught.
- **R71 — A save from a newer build starts a new game.** ✅ *Shipped.*
  `save.js:535–547` threw on `saveVersion > SAVE_VERSION`, the `catch`
  backed the string up under a timestamped key and returned
  `newGameState()`; `importSave` refused the same case with a named reason.
  A stale service-worker cache was enough to serve old code against a new
  save, and the player opened the app to an empty ranch. Related: a boot
  failure in `main.js` left a half-live shell.
  - **`loadSlot` now throws `FutureSaveError` and touches nothing** — no
    backup key, no rewrite, the stored save byte-identical afterward.
    `main.js`'s `boot()` catches it and renders one full-screen refusal
    (title, an explanation, a Reload button, never a reset) through the
    SAME `renderBootFailure` a content-load failure already used — the
    "boot failure is one screen" half of the criterion closes a second bug
    at the same time: content-load failure used to leave header/tabs/footer
    standing over a `<main>` that would never render, the actual half-live
    shell, not a screen that says so.
  - **Also shipped this session, beyond R71's own scope, at Evan's direct
    request**: the footer's save and mute buttons are one settings button
    now (`save/settings-ui.js`, a new module — CLAUDE.md's "small modules
    by system" extended to the shell's own chrome), opening a panel for
    sound, the five colour schemes (`THEMES` existed since main.js's
    `?theme=` dev override but had no player-facing control until now),
    the save-file door, and **up to four independent save slots**
    ("labs"). Slot 1 stays the literal `spliceworld_save` key forever —
    every save that has ever existed already lives there, so an existing
    player's save is discovered as slot 1 on first read with no migration
    step; slots 2+ get `spliceworld_save_N`, with a small registry
    (`spliceworld_slots`, synthesized on first read) naming which exist and
    which is active. No `SAVE_VERSION` bump: the only new field on
    `gameState` (`slotId`) is stamped fresh on every load rather than
    trusted from storage, so nothing about the schema itself changed.
  - **An adversarial four-dimension review of the diff, run before shipping
    given what "never reset player saves" is worth: 16 raw findings, each
    re-verified by a second pass instructed to try to refute it — 11 real.**
    Fixed: deleting a lab was one unconfirmed tap with no backup, unlike
    every other destructive path in the game; `downloadSave()`'s anchor was
    never attached to the document, which silently fails to trigger a
    save-as on Safari — the exact browser three separate dialogues tell a
    player to trust for their one copy outside this device; an import's
    async file-read could still land and reload after Close; the rename
    prompt opened blank instead of pre-filled; a corrupted slot read
    identically to "never started"; `?warp=` desynced an inactive slot's
    day-count from the active one; the boot-failure screen said
    "Splicework" — CLAUDE.md's own header carries the project's old
    codename, and it reached a live screen. Deferred, not regressions:
    `saveGame()`'s write-failure return is discarded by 25+ pre-existing
    callers app-wide (needs a UI surface this session didn't build), and
    unpruned backup keys are R54's own already-documented, deliberately
    unresolved tradeoff.
  *Done when: "from the future" is a refusal the shell renders with a
  reload path and never a reset, boot failure is one screen that says so,
  and a gate loads a v35 save into v34 code and asserts the stored save is
  byte-identical afterwards.* ✅ all three — plus a full slot-management
  test suite (create/switch/delete/rename, `MAX_SLOTS`, backward-compat
  synthesis, active-slot and last-slot refusals) that R71 didn't originally
  ask for but the added scope needed.
- **R72 — Retired content ids crash the Theater.** ✅ *Shipped.*
  `theater.js:81` read `content.parts[token.partId].slot` unguarded and
  `:99` called `tokensFor` without `content`, so its own retired guard was a
  no-op. `physiology.js:61` indexed `GRADES` unguarded one line after
  guarding the part; `classVotes` hardcoded three classes in
  `physiology.js` and twice in `director.js`, so a fourth class voted `NaN`
  and was silently dropped.
  - **The named four were the smaller half.** A fixture that retires one
    part, retires one grade and adds a fourth class — built first, then
    pointed at the pristine tree — measured the actual blast radius:
    **four of six screens threw, and the sim died inside `createBattle`.**
    The retired GRADE was the worst of it, because `GRADES` is code rather
    than data and nine sites indexed it with an id straight out of a save.
    Two of those looked guarded and were not:
    `GRADES[Math.max(0, GRADE_INDEX[id] - 1)]` throws, since `undefined - 1`
    is `NaN` and `Math.max(0, NaN)` is `NaN`, not `0`. One `gradeOf()` /
    `gradeIndexOf()` pair in `extract.js` now backs every reader, degrading
    a retired grade to the baseline so the part keeps its face stats and the
    player keeps the part.
  - **`battle/engine.js:108` was the one that reached the sim.**
    `1 + GRADE_INDEX[token.grade] * GRADE_MOVE_BONUS` on a retired grade is
    `NaN`, and a `NaN` multiplier spreads silently through every damage
    number the engine and the balance harness compute.
  - **The renderer VALIDATES a genome and throws on an unknown part**, so
    one retired part took the whole Pens screen down rather than one
    overlay. `chimeraGenome` drops it now — the creature draws without that
    piece, exactly as `analyze` already scored it.
  - **The class list was hardcoded in six places, not three.** Beyond the
    two tallies the entry named, `dex-ui.js`'s
    `CLASS_ORDER = ['ground', 'water', 'air']` decided three separate things
    at once (which sections the roster grows, which runs the foe guide
    groups by, which enemies count as Unclassed) and a fourth class lost all
    three silently; `ranch/ui.js` fell through every catalog group, so a new
    class's animals never appeared in the Mail-Order Menagerie at all; and
    three icon maps in `battle/ui.js`, `ranch/ui.js` and `theater-ui.js`
    duplicated `classes.json`'s own `icon` field — the Theater's as emoji,
    against the project's no-emoji-as-art rule. All six read the data now.
  - **The genome in a containment bay is frozen into the save.**
    `campaign.js` stores a captured unit's `battle.units` record verbatim and
    a bay only empties on dismantle or rehab, so retiring one of its parts
    threw at `campaign/ui.js:734` and took the War Room with it — a
    soft-lock, since the dismantle button that clears the bay is on the
    screen that will not render. `battle/ui.js:124` is the same shape for a
    battle serialized mid-fight. `validateGenome` stays strict; the new
    `drawableGenome` softens only those two save-fed readers. Found by the
    adversarial sweep AFTER the gate was already green, because the fixture
    had an empty `containment`.
  - **The Dex's `dex.parts` is a SAVE-held list** read three times without a
    guard, plus `combo.parts` in `comboHint` and the salvage line in
    `campaign.js:608`, whose `GRADES.find(...).name` was unguarded on both
    halves. The first fixture missed every one of these because its Dex was
    empty and its cards were shut — a shut fold renders nothing, and
    "nothing" is not the same as "renders safely."
  *Done when: a gate retires one part, one grade and adds one class in a
  fixture, and every screen and the sim still run.* ✅ — and the gate walks
  all five Dex tabs with every fold forced open, asserts no screen leaks
  `undefined`/`NaN`/`[object Object]` into its own output (a screen that
  prints the hole instead of falling into it is still broken), and holds a
  static rule that no module may name the three shipped classes as a
  literal set again.
- **R82 — The Breakout.** ✅ *Shipped.* R27 built rival labs that field
  chimeras from real parts under the player's own physiology. R8 built a
  Reorientation Wing that turns a captured specimen into a member of the
  roster. Between them sat a gap nobody had named: the ONLY way to stand in
  front of a rival's chimera was to challenge that rival — a gated ladder
  duel, fought three-at-a-time and won once. The most interesting anatomy in
  the game was also the rarest thing to meet. *Done when: rival specimens
  escape into the world and accumulate on a board you can hunt in any order,
  each one a real rival-built chimera; and capturing one and putting it
  through the Reorientation Wing adds it to your roster at the grades its old
  lab raised.* ✅
  - **A lab that keeps losing to you starts losing other things.** Gated on
    the player's own record (`startsAfterDefeats`), not a clock, so the first
    escapee is a consequence of something they did — and until then no clock
    runs behind the gate at all.
  - **The generator is `rivalSpecimen`, pulled out of `rivalTeam`'s loop.**
    A loose specimen is indistinguishable from one still on the ladder
    because it was on the ladder: the same anatomy counter, the same class
    votes, the same chassis-lift decision. Two generators would be two sets
    of rules about what a lab builds, and they would drift.
  - **TWO DELIBERATE DIFFERENCES FROM A COUNTER-OFFENSIVE.** A contest is a
    threat and a threat needs a clock; an escapee is an OPPORTUNITY, and a
    window that closes while the player is asleep produces FEWER fights with
    rival anatomy — the one thing this system exists to produce. So the board
    is standing: they accumulate, in any order, capped by `maxLoose` so a
    fortnight away is a queue rather than a wall. And it is not about land:
    no node, no income, no suspension.
  - **The capture path is not new, and that is the point.** A bagged escapee
    lands in containment like any other prize and reaches the roster through
    the Wing, at its old lab's grades. This is a SOURCE of specimens, not a
    second way to own one, and the gate fails if it becomes the second thing.
  - **R78's lesson, paid forward.** Eligibility lives in the save, so the
    tick that first arms the clock can also be the tick closing a month-long
    gap. Arming at `now` and returning produced an empty board and a
    plausible-looking save — invisible for exactly the reason seed 5150 was.
    Arming dates from the start of the gap and falls through to the replay
    loop; one jump and two-hourly steps land on the same board, asserted.
  - **The harness still does not walk the rival ladder** — and therefore
    cannot reach the breakout either. `campaignWalk` has never fought a
    rival, which R82 found rather than made. Fixing it re-baselines every
    economic assertion in the suite (measured: it moves seed 5150 into the
    away-walk's dead zone), so it is R83's job, not a rider on this one.
  - **43 breaks, 43 caught**, on a sixth battery gate that walks the whole
    route at battery speed. One defect the gates could not have found: a
    specimen bagged in a LOST fight would have stayed on the board as well as
    in the bay. Unreachable today — one wave, and bagging the only wave wins
    the fight — which is precisely why the rule now lives in the function
    rather than in the wave count.

- **R79 — The same hole, for retired species and frames.** ✅ *Shipped.*
  *Done when: the R72 fixture also retires one species, one frame, one
  enemy, one region node and one class, and every screen and the sim still
  run.* ✅ — measured on HEAD before writing the fix, with the fixture
  itself rather than the entry's list: **six of six screens threw**, and six
  of eleven sim entry points died on `combatantFromUnit(undefined)` or
  `analyze`'s frame read. R72 fixed the ids its own criterion named; this is
  the identical shape one level out, and worse, because a frame read sits on
  the battle and sim paths as well as the screen.
  - **One module, one rule.** `data/catalog.js`: VALIDATION reads `content`
    directly (`if (!content.frames[id])` is asking a real question and must
    get a real no); PRESENTATION and MATH read through the catalogue, because
    they are describing something the player already owns and "you own
    nothing" is the wrong answer. `speciesOf`/`frameOf` never return null — a
    **Discontinued Line** and a **Retired Chassis** carry every field the
    readers dereference. `classOf`/`enemyOf`/`rivalOf` do return null: those
    are rows to skip, not things to describe. Region nodes are deliberately
    absent — `nodeById` has answered that since R26, and a second way to ask
    is the copy the module exists to avoid.
  - **`thermal` and `setBonus` are null on purpose.** A comfort band nobody
    can state must not narrow a mix (an unstatable range is not a zero-width
    one), and a bonus nobody can name must not be claimed. The gate asserts
    both, so a future "helpful" default fails.
  - **Nine screens painted creatures unsoftened.** R72 softened the two
    readers whose genomes come out of a save; the other nine called
    `renderCreatureSVG` on a genome assembled from content, which is only as
    good as the ids behind it — `stockGenome` takes its frame off the
    animal's SPECIES. `creaturePortrait` is the one call now, a gone chassis
    gets a procedural empty crate, and a static rule fails the build if any
    module outside `render/` reaches past it.
  - **A wave list outlives the roster it names**, in three places: enemies.json,
    a gauntlet stage, and `battle.queue` inside a save. `warTargetEncounter`
    filters once so the briefing and the battle still agree, an encounter with
    nothing left is not offered, and a boss-less gauntlet stage is not a
    stage. For the queue a save can resume into, an **Unmarked Van** turns up
    — procedural, no salvage, so nothing pays out for a unit that is gone.
    The data-integrity walk now covers gauntlet stages and region nodes, which
    is the hole `smoke.js:479` could not see.
  - **The vault stopped deleting what it could not name** (R52's rule,
    deliberately reversed). A cobra token is still spliceable in the Theater;
    it simply vanished from the screen whose job is listing what you own.
  - **The fixture only ever saw the War Room's default sub-tab**, so a break
    reverting the rival class guard survived — the Water school lives on Labs.
    Five tabs are walked now, and Bays immediately surfaced an `ARM undefined`
    the fixture had been hiding.
  - **The battery grew a fifth gate and 14 breaks (35 total, 35 caught).**
    Its baseline was silently failing on the first draft, which scored ten
    breaks green for free; the stand-ins are now checked against the shape of
    the shipped records in both directions, because the two defects that
    check catches — a chassis claiming `slots: []` when three of four shipped
    frames omit it, and sockets as an array where the renderer indexes by
    name — were found by hand, not by any gate.
- **R73 — Tap targets and focus at 380 px.** ✅ *Shipped.*
  Re-measured rather than trusted: the entry's own list was stale (it costed
  a mute button R71 had already replaced). A real headless pass at 380 px
  found **21 of 46 distinct controls under the floor**, the worst a **15×21**
  rename button that was also a raw `✏️` — emoji-as-art, which R70's block
  test could not see because a Dingbat wearing U+FE0F is not in the emoji
  block. It is a procedural pencil now, and that gate reads the variation
  selector too.
  - **The floor is stated once.** A `min-height`/`min-width` added to the
    fifteen selectors that were wrong would have fixed fifteen and missed the
    sixteenth somebody adds next phase — which is how the floor got to 15 px
    in the first place. One rule over `button, summary, label[for],
    [role="button"], select, input`, with the box-sizing and flex centring
    that make a 40 px box actually contain its label. Verified against
    controls the walk never reaches: the field-note dismiss and the battle
    log button, authored 26×26 and 30×30, both compute to 40×40 without
    being named anywhere.
  - **`outline: none` had no replacement anywhere in the file.** One
    `:focus-visible` ring now, two-tone so it survives all five themes, and
    the gate presses a real Tab to check it — measuring after a programmatic
    `.focus()` reports "no ring" on a page whose ring is fine, which the
    first version of that check did.
  - **The overlay is a dialog in ONE place.** Nine call sites across five
    modules open it by hand (`overlay.hidden = false`), so the behaviour
    watches the element instead of asking nine authors to remember: name
    from the heading, focus in, Escape, Tab trapped, and focus **restored to
    the opener** — the half that is always forgotten. The first draft of it
    restored focus only down its own Escape path, and every Close button in
    the game silently kept the old behaviour.
  - **A dead custom property, in four rules.** `var(--bg)` — never defined,
    in any theme — silently fell back to `inherit`, so two chips designed as
    dark-ink-on-lime rendered muted-grey-on-lime and measured **1.91:1**. A
    new gate reads every `var()` against every definition and found a second
    one the first grep missed (`--text-dim`, three more rules). Disabled
    controls went from 2.35:1 to 4.03:1, because a disabled button's label is
    usually the sentence saying *why* it is disabled.
  *Done when: every control is at least 40 px at 380 px, focus is visible,
  the wire is a live region, the overlay is a dialog, and a Playwright pass
  measures bounding boxes and fails below the floor.* ✅ — with one
  substitution: **no Playwright.** CLAUDE.md's no-dependencies rule is
  absolute, and Node 22 ships a global `WebSocket`, so `tools/a11y.js`
  (`npm run a11y`) drives headless Chromium over CDP in ~40 lines, serves
  the repo itself, launches its own browser, and needs no argument. It
  measures every control across eight views and asserts the four semantic
  halves as well, because a gate that measured boxes and ignored semantics
  would pass a game no keyboard could play. Proven both ways: it exits 1
  with 28 named problems against the pre-R73 stylesheet.
  - **Follow-up, after the merge.** The audit finished late and found two
    more of exactly the kind this phase was fixing, plus a gap in the gate.
    `--cls-air` sat defined in all five theme blocks and used NOWHERE — both
    rules that should have named it reached for `--accent-2`, while the two
    rules directly above them named their own tokens correctly, so the class
    the triangle makes hardest to read was drawn in another role's colour.
    And `.forecast-hopeless` — the only rule in the file that hardcoded a hex
    for text — put `#fff` on a solid `--danger-2` fill: 3.96 / 2.78 / 4.18 /
    4.01 / 3.62 across the five schemes, below AA in all of them. Nothing
    light clears these reds, so that band takes a new near-black
    `--on-danger`, one value for all five. The gate had measured ONE theme of
    five; it walks all five now, and a new rule fails a class colour that is
    defined but unused.
- **R83 — The harness has never fought a rival.** ✅ *Shipped.*
  `campaignWalk` claimed to measure the honest 180-day campaign, and across
  sixteen seeds and 2,880 simulated days it fought **735 assaults, 590
  defences, 2,235 spars, 368 rescues — and zero duels.** The rival ladder is
  the game's second axis of difficulty and its only source of apex-graded
  anatomy, and the yardstick had never been down it. Everything downstream
  went with it: R82's loose board (escapes are gated on having beaten a
  lab), the Containment Cannon (the walk's autoplay never fired it), the
  Reorientation Wing, and R25's entire facility track. *Done when: the walk
  fights rivals and hunts escapees, every assertion it moves is re-derived
  rather than retuned, and the suite says what a 180-day campaign actually
  earns.* ✅
  - **A dead agenda row, shipped in A4 and never once seen.** The walker
    bought no lab upgrades because `ranch/agenda.js` gated the offer on
    `up.cost` — a field `nextUpgrade` does not return (the cost is at
    `up.level.cost`), so `funds >= undefined` was false for every player at
    every balance. It also checked `up.locked`, which does not exist either,
    so the lock test was a no-op in the other direction. Measured: with a
    billion dollars and all 23 nodes held, the Ranch still never suggested
    buying an upgrade. This is the milestone's thesis in one line — a
    harness that actually walked the game would have caught it in 2026-08.
  - **Two assertions moved, both re-derived.** The away-walk denominator used
    the upkeep rate at the instant of leaving, which is right only while the
    roster cannot change size while you are away — measured on pre-R83 main,
    it never did (chimeras at leave equalled chimeras at return on all
    fifteen comparable seeds). The Wing made it live: seed 64 comes home with
    two extra chimeras and 27% more upkeep, banked 33% against a 35% floor,
    and read as an empire fined for a month away when it had in fact bought
    two creatures. The denominator now uses the mean upkeep across the
    window; **the floor is untouched**. And R63's garrison wall had drifted
    from 0.31 to 0.44 of the healthy map against a 0.50 limit — passing at 20
    nodes against 23, one nudge from flipping. Re-measured over six seeds
    (x2.5 → 0.44, x3 → 0.28, x3.5 → 0.32) and moved to the x3 rung on R65's
    own principle of headroom on both sides; **the limit is untouched**.
  - **Coverage went up, not down.** The away comparison halts at dominion,
    and a stronger walker reaches it on day 24-39 instead of 28-48, so six of
    sixteen seeds were being skipped for winning — a gate passing because it
    measured less. The away walk now continues past dominion (R9's
    counter-offensives keep arriving, so post-dominion play is real) and all
    sixteen seeds are compared, against fifteen before.
  - **A battery break caught a false-confidence assertion of mine.** The gate
    proved the cannon fires by counting BAYS — but a held defence impounds
    the wreckage, so bays fill whether or not the cannon is ever fired. Break
    46 passed against it. Both gates now count units actually bagged.
  - **48 breaks, 48 caught**, on a seventh battery gate. And one observation
    worth keeping: continued past dominion, 125 distinct rehabilitated
    specimens pass through the roster on seed 4242, peaking at 8 held at
    once, with **0 remaining at day 180** — the walker's stable cap dismantles
    them, because a specimen carries its old lab's grades and those fall
    behind what the Theater builds. The Wing's output is raw material to a
    late-game stable.

- **R84 — Grades promise an ability and deliver a percentage.** ✅ *Shipped —
  as a decision, which is what the entry asked for.* §3.3 had promised since
  M0 that Apex and Prismatic give "an upgraded version of the part's
  ability"; what ships is +12% move power per tier. R84 chose between them,
  and chose the shipped mechanic, on two measurements rather than on taste:
  - **The game never made the promise to a player.** The `grades` field guide
    says genetics × age × condition and nothing about abilities, and the Pens
    prints the graded number — 80 → 90 → 99 → 109 on the same Haymaker — so
    what a grade buys is already visible and already honest. Only the design
    doc over-promised, and R77's rule is that the doc describes the build.
  - **Grade scaling is load-bearing.** R17 measured it: a combo takes the best
    grade among the parts that unlock it precisely so a Prismatic part cannot
    overtake the combo it belongs to, and when the two scaled differently
    **7 of 12 combos went dead** at Prime or Apex. A distinct Apex ability
    reopens that, at four grades across six pools.
  So §3.3 now says what a grade does and stops implying more, and the
  decision is enforced rather than written down: smoke reads **all 244 parts
  at all four grades — 976 readings — through `movesFromTokens`, the function
  the Pens renders from**, and asserts the move keeps its name, its cost, its
  accuracy, its tags and its keyword SET, with only power moving, by exactly
  12% per tier off the authored number. Ship a distinct Apex ability later and
  this fails, which is the point: whoever does it has to change §3.3 in the
  same breath. Proved by shipping one — an Apex part gaining `ignoreArmor`
  lights up 484 readings.
- **R85 — Feral at instability 100.** ✅ *Shipped.* The promise lives in
  **§3.4**, not §3.5 — the entry pointed at the wrong section, which is its
  own small lesson about a document nothing runs. Measured before building,
  and the entry understated it: at instability 100 the price was a one-time
  three-hour settle and $8/day, and the obedience penalty is
  `instability/100 × 0.2` MINUS `bond/100 × 0.2`, so a trained creature at
  the top of the scale had a **0% ignore chance**. The top of the scale was
  cheaper than the middle.
  - **The trigger is neglect, not anatomy.** The bear-headed, eagle-winged
    goat this game exists to let you build scores 90 instability, and *every*
    chimera is spliced at bond 0 — so a snapshot rule on "unstable and
    unbonded" would send the game's own premise to Containment the day it was
    made. That is not a mechanic, it is a punishment for playing. What tips a
    creature over is being LEFT ALONE: instability **100**, bond under **40**,
    and nobody has worked with it in **72 hours**.
  - **A scheduled window, never a per-tick roll (R9).** An agitated chimera is
    a **24-hour** countdown with an obvious answer, and how often you open the
    app cannot change what happens to your creatures. The clock starts when
    the condition is met rather than when you next looked (R65), so a whole
    cycle away cannot cost a creature that was fine when you left.
  - **Everything you do WITH a creature answers it** — a training session, a
    fight, a treatment, a rescue all stamp the same field, and the warning
    leaves the card the instant you act. Raising bond past 40 makes it
    impossible at all, which is what the field guide tells you *before* any
    clock is running.
  - **Losing it is a loan.** R8's Reorientation Wing had been shipped and idle
    for exactly this since. A bay now holds the creature **itself** rather than
    a description of it: the Wing was written for a captured rival and rebuilds
    one from its genome, which for a creature of your own would hand back a
    stranger with the same name and none of its level, its trained moveset or
    its scars. Zero death language throughout — it has not gone anywhere, it
    is simply no longer taking your calls.
  - **On the screen, not in the engine.** The Pens gives agitation a band above
    all three existing ones and a countdown badge on the *shut* row that
    outranks even the Infirmary clock; the agenda opens with a `settle` row
    above the two clocks R63 put at the front. R15's rule with the stakes
    turned up: this is the only clock in the game whose expiry removes a row
    from the roster.
  - **Gates:** an R85 block in smoke and a thirteenth battery gate, with breaks
    69–73 — the trigger firing on anatomy alone, the window becoming a roll,
    attending stopping counting, the bay keeping a copy, and the agenda going
    quiet. All five caught. The first draft of the 400-tick assertion counted
    the roster rather than what the tick reported and was true for every
    possible implementation; the battery is what found that.
  - **Six copies of one list, found on the way through.** Shipping
    `data/feral.json` meant editing the content-file list in six places
    (smoke had two; sim, roadmap, handlers and the battery one each), and the
    failure mode for missing one is not an error — it is `content.feral`
    coming back undefined and the tuning silently falling back to its
    defaults. R41's `training.json` bug with the blast radius spread across
    the toolchain. `data/loader.js` now exports the list the *game* loads and
    every tool derives from it; `sim.js` had already drifted, scoring a world
    with no breakouts in it.
- **R86 — Gene Juice.** ✅ *Shipped — as the Infirmary's model, not a
  second economy, which is what the measurement said to do.* §3.9 had said
  since M0 that every timer is skippable with Gene Juice, an earned currency.
  Both of the entry's premises were checked first and both were wrong: "no
  timer is skippable at any price" — the **Infirmary already was**, for $25 +
  $18 an hour, and the vat could be drained; "load-bearing for the TWA pitch"
  — `docs/TWA.md` mentions no skip, no currency and no purchase. And the
  pacing problem it was designed for does not exist in the harness: the
  180-day walker's longest stretch with nothing productive to do is **zero
  hours**, its stable is **64% free in week one and 82% after**, and its
  biggest "wait" is the fifteen-hour training cooldown — which is not a wait,
  it is where bond comes from.
  - **The rule is the engine's own.** Four clocks in this game are *sealed*
    when they start — `startVat` says "a reload must not be able to reroll
    it", `startResequence` says "every die is thrown here, and tick only
    reads the answer", an egg is fixed at lay, a temperament is seeded from
    the world. During each of them nothing is being decided. **Rushable ⇔
    sealed.** Those four take money at the Infirmary's rate; everything else
    refuses, as a rule rather than an omission — cooldowns are husbandry
    (Law 3), growth is the animal, rehab is its curriculum, a job is its
    duration, the world's clocks are threats. Injury is neither: its scar is
    rolled when it heals and treatment changes that, so `treatInjury` keeps
    its meaning and only lends its price — the formula moved to
    `splice/rush.js` and `scars.json` lost two fields.
  - **A rush buys time and nothing else, proved literally.** One save with
    all four clocks running; one copy waits it out, the other pays at t+1min
    and ticks. The vat child, the tank's animal, the hatchling and the
    settled creature's temperament are **identical**. $265 for all four; a
    three-hour settle is $79, a two-hour tank $61, a half-hour egg $35.
  - **One binder, three screens.** `data-rush="kind:id"` beside the four
    countdowns — settle and vat on the Pens, the egg on the Ranch, the tank
    in the Vault — through one shared button and one shared handler. The
    shell lends its tick to the screens (`ctx.tick`) so a rushed vat decants
    on the click rather than at the next thirty-second refresh. No agenda
    row, deliberately: a rush never creates a new thing to do, it makes a row
    that already exists arrive sooner, and the agenda's `screen` is static
    where the rushes live on three.
  - **The walker pays, and finally treats.** Reserve-gated like every other
    purchase: 1–18 rushes in 45 days across four seeds ($29–$577), and 29–43
    Infirmary buyouts for its A-team — and until R86 asked, **the harness had
    never once called `treatInjury`**. The game's one paid skip had shipped
    with zero coverage (R83's rule, found late).
  - **Gates.** An R86 block in smoke and a fourteenth battery gate, breaks
    75–79: a rush that forgets to charge, a cooldown joining the registry,
    the Infirmary growing its own price, a rush that re-opens the vat, and
    the walker going quiet. Found on the way: break 51 went **MISSED** rather
    than BADANCH because the roadmap gate's probe matched the words "Gene
    Juice" in a *comment* explaining why it was not built — the probe now
    strips comments first. Break 50 hardcoded the save version and had gone
    BADANCH three milestones running; it reads `SAVE_VERSION` now.
  `SAVE_VERSION` 40 (`rushCount`, the one thing the mechanic persists).
- **R80 — The keyboard can see the game but not play it.** ✅ *Shipped.*
  Every claim in the entry was checked against the shipped game before
  anything was touched, and nine of the ten held. The tenth did not, and it
  is the one worth writing down: the entry said the crowded controls sat
  "under the 8 px the same audit measured everywhere else". Measured in a
  browser at 380 px — every pair of controls that shares an axis, on every
  screen, subtab, sheet and theme — the game's gutter is **6 px**, not 8, in
  eighteen separate places. "Train sits directly beside Dismantle" was wrong
  too: they sit 6 px apart, which is the standard. What was genuinely under
  it: the picker rows at 5, the Dex subtab strip at 4, and one nobody had
  seen — **Retreat ends 1.5 px above the settings gear** in battle mode.
  The handler gate has fired the arena's buttons headlessly since R75, but
  nothing had ever laid a ruler on the screen, and battle mode reshapes
  every band in the shell. Its own message-log button turned out to be 30 px
  — under R73's floor since R73. So the gutter floor is the number the game
  actually uses, and five rules came up to meet it.
  - **Focus survives a repaint** (`ui/focus.js`). One `MutationObserver` per
    render root rather than a wrapper around a dozen render calls, because
    there is no funnel: `tick()` repaints the active screen, `bindSubtabs`
    repaints on activation, and the Pens and the briefing repaint themselves
    from inside their own handlers. The DOM mutation IS the event. Identity
    is R76's: tag + id + `data-*`, so the restore is a lookup and not an
    index — position is exactly what a repaint changes. Measured before:
    focus a Dismiss button, wait for the tick, `document.activeElement` is
    `BODY`. After: it is the Dismiss button.
  - **R73's dialog controller, fixed by inclusion.** The overlay is in the
    keeper's list, and the keeper's observer is registered first, so by the
    time the dialog controller looks, focus is already back where the player
    left it and its "focus the first control" fallback correctly does
    nothing. "Download my save" no longer answers by announcing the sound
    toggle.
  - **Two controls that were not controls.** The opening exchange of a duel
    is a real `<button>` that Tab reaches and Enter presses (and that takes
    focus as each line advances); the move readout — the whole of R30's
    arithmetic, tags and keyword sentences — answers `?` on the focused move
    as well as a 350 ms hold, advertised in `aria-keyshortcuts` and a title.
  - **Three things that changed in silence now speak** (`ui/live.js`). One
    region, in `index.html`, outside every render root — because a live
    region written INSIDE a panel is destroyed and rebuilt by that panel's
    next render, which is the bug wearing its own fix as a costume. The
    settings panel's result line and the retraining slot counter announce
    through it; the arena's commentary keeps its own, because that node is
    stable for the length of a round.
  - **The rename sheet.** Enter belonged to `document` with no target check,
    so the ✕ committed the rename — the control that means "no" did the same
    thing as the control that means "yes". Enter now belongs to the field.
    It also never recorded an opener (focus went to the top of the document
    on close) and never trapped Tab despite claiming `aria-modal="true"`;
    both now come from one helper shared with the picker.
  - **`pickerField` labels its button.** `aria-labelledby` naming the label
    and the value, so a picker announces "Theme, Laboratory" rather than
    "Laboratory" and a guess.
  - **The gate.** `tools/a11y.js` now enters an arena — the fixture carries a
    duel in progress, which is only a save — and then puts the mouse down:
    it opens all six screens with Tab and Enter, Tabs to all 52 controls on
    them, fires the tick and checks focus held, advances a duel's opening
    exchange, opens a move readout with `?`, throws a punch, activates a Dex
    subtab and checks focus stayed on it, drives a real announcement through
    the retraining sheet, and proves Enter on the rename sheet's ✕ cancels.
    Plus the 6 px gutter, measured pairwise across every view, and the arena
    at 380×640 as well as 380×780 — the stylesheet's short-phone band exists
    because that screen is height-locked, and no gate had ever rendered it.
    Since `overflow: hidden` means a clipped control still reports a
    full-size rect, the arena is also checked for OVERFLOW, which is the
    only way to see it. 59 controls across 19 views. Seven battery breaks
    aim at the new gate and all seven go red; the suite is 60 for 60.
- **R74 — The briefing runs 64–160 battles per checkbox.** ✅ *Shipped.*
  Re-measured before touching anything, and the graph had grown since the
  entry was written: **55 modules and 701 KB** eager, not 52 and 623.
  - **`diagnose` was paying to decline.** The comment above its call site
    already claimed it was "only computed on a verdict that needs it" — true
    of the RESULT and of nothing else. It ran a full 32-battle forecast of
    its own purely to learn the band, then returned `null` on any winning
    one. That forecast was `forecast(team, encounter, content, seed, now,
    { runs: 32 })` and the briefing's own call is the same function with the
    same arguments and the same seed, so the two were **identical by
    construction** — verified across all 26 encounters before the change.
    The band now travels in the forecast the caller already holds
    (`wantsDiagnosis`, exported so one place knows which verdicts want a
    reason), and `diagnose` takes that forecast instead of recomputing it.
    Measured: a **winning** band, which is the common case, went 4.9 ms →
    **2.1 ms**; a hopeless one 20.5 ms → **11.0 ms**; battles per toggle
    155 → **123** with the obedience replay and 123 → **91** without.
  - **Two screens load on first use.** The War Room (which is also the
    battle screen — one module renders both) and the Dex. That takes 8
    modules and 131 KB out of the eager graph: `campaign/ui.js`,
    `battle/ui.js`, `battle/forecast.js`, `battle/readout.js`,
    `campaign/warroom.js`, `splice/dex-ui.js`, `splice/dexentry.js` and
    `ui/tabs.js`, reachable no other way. **55 modules / 701 KB → 47 / 570
    KB**, and boot went from 81 network requests to 73. What this buys is
    parse and execute, **not download**: `sw.js` precaches the whole shell
    on purpose so the game works on a train, and the gate asserts the
    deferred modules are still in that list. The boot simply stops compiling
    a battle engine's worth of UI before it can paint a ranch.
  *Done when: `diagnose` reuses the computed forecast and runs only on
  losing bands, the War Room, battle and Dex load on first use, and a gate
  caps the eager import graph from `main.js`.* ✅ — the cap is a budget (50
  modules, 620 KB) rather than a fingerprint, because a gate that fails on
  a small new module is one people learn to raise without reading; what it
  has to catch is the graph regrowing by a SCREEN, and putting that import
  back at the top of `main.js` costs eight modules at once. It also asserts
  which screens are deferred, that their modules are genuinely absent from
  the eager graph, that each still resolves to a real export (nothing
  type-checks a string inside `import()`), and that each is still
  precached.
- **R81 — The other 766 KB, and the modules eager for one function.**
  ✅ *Shipped.* Every number re-measured first, and the entry held on the
  data and was wrong about the code. **Measured, before:** 1,462 KB and 79
  requests to put the game on screen; 51 modules and 616 KB of eager JS.
  **After: 1,010 KB (−31%), 49 modules, 537 KB.**
  - **The geometry was half of everything the game downloads.**
    `parts[].shapes` is 276.8 KB of `parts.json` (69.1%) and
    `units[].shapes` 122.8 KB of `enemies.json` (72.8%) — the entry's
    percentages were exact and its absolutes a little stale. Both now ship
    as their own file, fetched a frame *after* the game is on screen and
    merged onto the objects they came off, so every reader in the game is
    unchanged and simply starts working. The renderer draws "developing" for
    the few hundred milliseconds in between, which is the same idea as the
    empty crate it already drew for a chassis it could not find.
  - **The trap the entry named was real and the split walks past it.** The
    Ranch does read `enemies.json` through `ranch/agenda.js`, so deferring
    the file wholesale until the War Room opens would have broken the agenda
    panel — but it reads `content.encounters`, never a unit, and the units'
    bodies are the 122.8 KB. Splitting by what the renderer reads splits
    exactly where the Ranch does not look.
  - **`battle/engine.js` was not "eager for six small helpers".** It had
    **11 import sites across 9 modules**, and the eager graph took seven
    distinct names from it. Four are trivial and engine-free; three
    (`movesFromTokens`, `unitFromGenome`, `finishBattle`) are real. So it
    could not be lifted out — it had to be **split**, along the seam those
    seven names describe: `battle/statblock.js` is what a creature IS (its
    moves from its anatomy, its purebred set, its obedience, whether it is
    hurt, and what a finished fight does to it) and `battle/engine.js` is the
    rules for resolving a fight. The engine imports from the statblock;
    nothing in the statblock knows the engine exists. 65 KB, plus the AI and
    the matchup chart behind it, now load only for the two screens that hold
    a fight.
  - **`campaign/campaign.js` cannot leave the graph, and the entry's saving
    for it was overcounted.** `campaign/world.js` needs `tickCampaign` on
    every tick. What was real is the rest of the claim: `main.js` took
    `pushNews` through a **bare re-export** and now takes it from
    `campaign/wire.js`, which defines it.
  - **`save/settings-ui.js`** is imported when the gear is pressed. The
    five-line theme list it also held moved to `ui/theme.js`, because the
    shell needs to know which `[data-theme]` to stamp before anything paints
    and was importing a 16 KB modal to find out.
  - **The gate is a browser, not the import graph.** `tools/boot.js` (new,
    on R73's dependency-free CDP driver, now shared as `tools/cdp.js`) loads
    the game for real and splits the waterfall at the moment a screen first
    has a game in it. **The first version of it split on
    `firstContentfulPaint` and passed on the old behaviour** — the header and
    the tab bar are static HTML, so FCP fires long before any content is
    fetched at all. A gate that cannot tell the two apart proves nothing.
  - **It shipped a defect past `scopecheck`, and closed the hole.** Moving
    nine exports broke five `await import` call sites, which the static pass
    skipped by design since R76 — so the rule "a name that is not there fails
    the build" now holds for the destructured dynamic form too, with six new
    link cases and a battery break.
  - **Known and not fixed here:** `tools/gen-parts.js` has drifted from the
    roster it generates — running it would rewrite **40 of 244 parts**, all
    the hand-tuned tails. The split was therefore done mechanically, with the
    serializer proved byte-identical against each file before anything was
    removed. Also unchanged: `sw.js` is still network-first for everything.
- **R75 — The small wrongs the walk found.** ✅ *Shipped.* All ten fixed,
  and the handler-firing stub is now a suite gate: **70 handlers across six
  screens, every one fired** — 70 function bodies that no gate in this repo
  had ever executed. `SAVE_VERSION` → **37** for one field.
  - **Rename dropped `res.msg`.** The refusal (an empty or
    sanitised-to-nothing name) and the confirmation were both computed and
    both thrown away. `lastMsg = res.msg` — the same banner the Pens and
    Settings already use for the same call.
  - **The empty-vault SPLICE IT hid its own reason.** `errors.length &&
    tokens.length` suppressed the fine print in exactly the state a new
    player meets first: an empty vault, a disabled button, no explanation.
    The reason now renders on the same condition that disables the button,
    so the two cannot disagree — "A head is required. Company policy."
  - **Only Spar read the predicate — and it was worse than the entry says.**
    Assault was one of **five** launchers on that screen with no fitness
    check at all; Defend, Rescue Raid, the rival Challenge and the
    Gauntlet's Answer were the other four, and the two timed ones are the
    ones that hurt: a player watching a counter-offensive countdown pressed
    Defend and got bounced to a briefing where every row was greyed out.
    All five now read one exported `fitToFight(state, now)` in
    `battle/engine.js`, beside the injury rule it asks about — **not**
    `canSpar`'s verdict, which would gate an assault on the ring's
    bookkeeping. The map, the agenda and the ring can no longer answer "can
    I fight?" three ways for one save. Disabled with the reason in the
    LABEL, per the rule `style.css` already records: this ships as a TWA and
    a `title` tooltip is invisible to every player who hits it.
  - **"Run a job" named a screen when it meant a tab.** The War Room is lazy
    since R74, so the shell cannot reach into `warTab`: the request is
    parked on `ctx` and collected by the screen on its first paint, whenever
    that is. Browser QA caught what the static gate could not — `agenda()`
    rebuilds each entry from a named field list, so the new `subtab` was
    declared on the entry and dropped on the way out. The gate now asserts
    the rendered shape, not the constant.
  - **Hatch! was enabled with the pens full.** The button now reads
    `Pens full` and refuses, rather than spending the egg into nowhere.
  - **An unread job report was overwritten by the next.** Two jobs landing
    in one tick, or thirty seconds apart, evicted the first card before
    anyone read it. An unread report is kept and the newcomer goes to the
    wire.
  - **The pen-full line was pushed every 30 s.** `WIRE_KEEP` is 12, so six
    minutes of a full pen flushed every other thing that had happened out of
    the feed. Said once per run now (`penFullSaid`, the one field behind the
    `SAVE_VERSION` bump — declared by a migration rather than appearing by
    accident). Measured: 12 ticks, 1 line.
  - **Hatchlings and vat children used bare `pick`** over 12 and 18 names on
    a ranch that holds twenty. Collisions were not a risk, they were the
    expected case. Both use `pickFresh` now, like the stock and the chimeras
    already did.
  - **`.grad-shake` was `infinite`** — bounded in fact only by a
    `setTimeout` in another file — and the reduced-motion block covered
    neither it, `.grad-flash` nor `.poof`. Nine iterations (1.26 s) inside
    the 1155 ms the element exists, and all eleven animating selectors are
    now covered; zero `infinite` declarations remain.
  - **The move sheet bound `{ once: true }`**, so the backdrop closed the
    sheet exactly once per render. A named module-level handler, removed and
    re-added, so it survives every re-render.
  - **The gate.** A recording DOM stub answers `querySelectorAll` from the
    HTML the screen actually painted — every other stub in the suite returns
    `[]`, which is why the binding loops had always iterated nothing. Each
    screen renders, every bound handler fires once, and a floor (60) stops a
    render that silently stops binding from passing vacuously. Proven on a
    pristine worktree: the two new War Room gates fail 6/6 there and pass
    6/6 here.
- **R76 — The gate that would have caught R60.** ✅ *Shipped.* Two new gates
  and a widened one, all three proven by a **19-break battery, 19 caught** —
  and the battery ships as `tools/battery.js`, so that number is reproducible
  rather than asserted. No game code changed: this milestone is entirely
  instrument.
  - **`tools/scopecheck.js` — a free identifier fails the build.** A
    hand-written tokenizer (no dependencies, none coming) over all **66
    modules in ~1 s**, with **61 syntax and 27 link cases** behind it. It reports a name that is READ in a file and BOUND
    nowhere in it. That is a FILE-level question on purpose: scope-level
    analysis needs correct lexical scoping for every binding form, and one
    mistake there is a false build failure on correct code — worse than a
    miss, because the fix for a false alarm is to stop trusting the gate.
    File-level only needs the BINDING SET to be complete, so every ambiguous
    construct is resolved by binding MORE names, which can only cost a miss.
    Both historical bugs are file-level and both replay green: **`opOdds` at
    `campaign/ui.js:720`, `infirmaryGrants` at `campaign/campaign.js:566`.**
    The audit's default-parameter false positive is fixed and pinned
    (`(a, b = a * 2)` binds both and reads `a`).
  - **…and every import is answered.** Added because break 5 was MISSED:
    rename an exported function, leave one call site, and no name is free —
    the import statement still binds it. That is a link error, so the module
    never evaluates and the game does not boot. The pass follows
    `export * from` and `export { x } from` chains. It immediately found a
    module the walk had never scanned at all: `data/loader.js`, excluded by
    a directory skip meant for JSON.
  - **The tokenizer is tested against its own corpus**, not the tree: **72
    syntax cases + 27 link cases**, so nested templates, regex-versus-
    division, shorthand-versus-keys and defaults that read earlier
    parameters are pinned by cases that fail loudly, rather than by whatever
    happens to be in the codebase today. Breaks 6, 7 and 15 aim at the
    instrument and all go red.
  - **An adversarial audit found defects in every one of the new gates.**
    The worst: the surface walk fired **57 of the War Room's 72 handlers
    never** — module state (`warTab`) drifted between probe and run, the
    list collapsed 72 → 17, and a missing index returned silently. Runs now
    take a fresh module instance and find handlers by key, not position;
    1056 fires became **1222**. In the analyzer, three live false passes: a name spelled like a keyword after a dot
    (`unit.class`, `promise.catch(…)`, `cfg.in / 2`) started the keyword's
    binding branch and swallowed the free identifier after it — in the files
    R60's bug lived in. Each fix carries the corpus case that was missing.
  - **`tools/handlers.js` — every `data-*` handler has been fired once.**
    R75's version fired **70 handlers** against one render per screen;
    everything behind a click was out of its reach. This walks SURFACES —
    screens, sub-tabs, the briefing, the arena, the settings panel, every
    picker sheet — and fires **1222 handlers across 59 surfaces, 34 controls
    pressed and 7 parameters carried** — including
    the picker sheet's Escape-and-Tab focus trap, which is bound on
    `document` and had never been fired by anything. The control/parameter
    split is the audit's doing: seven attributes are never a selector, so
    "every `data-*` handler has been fired" was reading stronger than the
    code proved. Each handler is fired against a screen
    rendered FRESH for it, because firing a snapshot in sequence tests
    stale elements (it produced `#wr-launch` reading `draftTarget.kind`
    after `#wr-back` cleared it, a sequence no player can make).
  - **The exemption list proves itself.** Two `data-*` attributes are
    markers with nothing listening (`data-guide`, `data-slot`); the gate
    greps the tree for a reader and fails if one appears, because a marker
    that grows a handler is a hole with a comment on it. `data-screen` is
    listed separately as a real control this walk cannot reach — the shell's
    nav, bound in `main.js` at boot — and named as covered by `tools/a11y.js`
    clicking all six tabs in a real browser. That is an admission, not a
    dismissal.
  - **The stub grew a real query engine.** It answered only `[data-x]`
    selectors, so `#thtr-frames button` and `.pick-row` bound *nothing* —
    the frame chooser and the picker sheet were invisible, in the way that
    looks like success. It
    now parses painted HTML and supports comma groups, descendant chains,
    tag/id/class/attribute and `:not([disabled])`, and hands each handler
    the WHOLE tag's dataset rather than the one attribute it was selected
    by.
- **R78 — A month lost unseen on one seed.** ✅ *Shipped.* Seed 5150 now
  records **25 away events against 25 daily** — the same world movement as
  its daily walk — and the pinned list is **empty**, asserted to stay empty.
  - **The cause was an ordering, not a tuning value.** `tickContests`
    replayed the gap in two passes: every arrival, then every expiry. An
    arrival needs a free slot and `maxConcurrent` is **1**, so a player who
    closed the app with a convoy already at the gate had the *entire* gap
    skipped — the open contest held the only slot from the first instant to
    the last, nothing was replayed, and the expiry pass then took the node
    and scheduled the next convoy from `now`, after they were already back.
  - **Which is why only one seed in sixteen showed it.** 5150 is the only
    seed in the sample that leaves with `contested: 1`; every other one
    leaves with an empty gate and never reaches the path. That is what a
    defect needing "a specific empire shape" turned out to mean, and it is
    the argument for the sixteen-seed sample R68 widened to.
  - **The replay is one loop over one timeline now**, taking whichever is
    due first — an expiry or an arrival. Two consequences are load-bearing
    rather than incidental: a contest expires **at its own deadline**, not
    at `now`, so the convoy after it is scheduled from inside the gap and
    arrives inside it; and `armed` is re-read every iteration, because a
    node falling mid-replay can take the empire below `minHeld`.
  - **The node 5150 loses is still lost, and that is correct**: it was
    contested *before* the app closed, so the window was offered and
    ignored. The gate's own rule (`back.nodes >= left.nodes - left.contested`)
    says exactly that — and it had never once run on this seed, because the
    frozen-seed exemption skipped it before reaching any assertion.
  - Pinned at the unit level too (a month away with a convoy at the gate
    must replay the month), because the empire shape that reaches this path
    is rare and a chaotic forty-day walk is a bad place to keep a mechanism
    honest. Break battery: **21 breaks, 21 caught**, two of them aimed here.
- **R77 — The roadmap describes a different game.** ✅ *Shipped.* Every one
  of the entry's claims checked out, which is unusual for this queue — the
  document really had drifted on all of them. §3 promised chimeras settle in
  "~1-4 hrs" (**22.5 min to 3 h**), a Dissection Countdown of "12-24 hrs"
  (**9-18**, rolled per capture), "3 frames" (**4**), "~12 combos" (**27**),
  "25 species × ~6 parts ≈ 150" (**41 and 244**), and ZzFX as the audio that
  shipped — `audio/sfx.js` is a hand-rolled WebAudio synth written precisely
  so the no-dependency rule would hold. Two whole mechanics were designed in
  §3 with **zero hits anywhere in the codebase**: going Feral at instability
  100, and Gene Juice skipping timers. And §9 jumped from R31 to R54 with
  twenty-two shipped milestones missing in between. *Done when: ROADMAP
  either describes the shipped game or names each gap as a queued phase, and
  a gate checks the numbers it states — settle hours, frame count, region
  count, `SAVE_VERSION` — against the data.* ✅
  - **`tools/roadmap.js`, and `npm run roadmap`.** A design document is prose
    and prose does not run, so the numbers moved into §4.0, a block the gate
    parses and re-derives from `data/*.json` and the engine. Nothing is typed
    twice: fifteen values, every one computed at test time.
  - **Two directions, the shape of the news wire's own gate.** Every number
    §4.0 states must match the data — and every mechanic the LIVE SPEC
    (§1-§5) names must exist in the code, or the line naming it must say
    `not shipped — queued as R##` and point at a phase the roadmap actually
    carries. §6 onward is exempt by construction: a milestone entry
    narrating "one region, five nodes" is history, not a claim, and a gate
    that could not tell the difference would have made the log unwritable.
  - **The three gaps are phases now rather than fiction**: R84 (grades
    promise an ability and deliver a percentage), R85 (Feral at instability
    100), R86 (Gene Juice). Each is named at the point the spec makes the
    promise, and the gate checks the pointer resolves.
  - **Five breaks on an eighth battery gate**: a number drifting,
    `SAVE_VERSION` going stale, a queued gap re-described as shipped, a
    pointer to a phase that does not exist, and the block deleted outright.
    The last was rewritten after the first attempt MISSED — renaming the
    heading with a suffix still matched the prefix, which was the block still
    being there rather than a hole in the gate.

### 9.5 Fifth audit (R84–R86) — queue R87–R102 · **R87 shipped**

Run after R86, against a game with four closed audits and R77's three gaps
closed behind it. Same rule as the other four — every line names the
measurement that put it there — with one difference: this one was run by
the harness rather than by readers. One instrumented 180-day campaign (seed
4242, the walker's realistic diet) sampled at nine checkpoints; every screen
rendered at 380 px on that campaign's day-180 save, folded and expanded; the
balance table re-read across 68 builds × 31 encounters; the shipped source
measured; and the walker's own blind spots enumerated by grep. The headline
is one sentence: **the county falls on day 40, and the next 140 days are a
treadmill nothing in the game can currently see — because the yardstick does
not play a third of it.** Fifteen phases follow, medium to large, four of
them overhauls. Each carries its evidence and a *Done when* the suite can
check.

**Overhauls.** *(R87 shipped — its run-boundary third deferred and queued as
R102; R88–R90 remain.)*

- **R87 — The endgame.** ✅ *Shipped.* Re-measured over six 180-day walks
  before anything was built, and it corrected three claims in the audit
  entry's own text. The county falls on **median day 35**; every facility
  track is maxed by **median day 28** — *before* dominion, so from day 29
  there is nothing left to buy, ever; funds run to a median **$864k** at
  **+$5,128/day**; and the next ~145 days are **5.1 fights a day won 97% of
  the time**, 96% of them at a flat 100%. Two corrections: the threat ladder
  has a **Gen 4 at 600** (the entry said it topped out at Gen 3), and **the
  Gauntlet already was a second act** — four exhibitions, opened at dominion,
  genuinely hard (0/100/56/0% autoplayed by a day-60 A-team), which the
  walker had entered **zero** times in every walk this harness has ever run
  and which paid **$400–$900** into that economy.
  - **The answer was already written, in the ladder's own last line.** Gen 4
    announces *"they have stopped sending police and started sending
    procurement."* So procurement arrives. Notoriety is **capped at 600** —
    you cannot be more wanted than maximally wanted — and past it, or once
    the county is yours, the **Compliance Task Force** comes for the **ranch**
    rather than for a node. Every other threat in the game costs a node, a
    purse or an opportunity, and by dominion the player holds every node and
    cannot spend their money, so none of them is a stake. The barn had never
    once been in danger.
  - **R9's two rules, unchanged, because they are why contestation is fair.**
    The next raid is a scheduled timestamp, never a per-tick roll. The window
    opens **when you see it** — R9's own exemption in the R65 sweep, the one
    R85 took for a creature — so a fortnight away can never cost a levy you
    were given no chance to answer.
  - **What it costs is money and livestock, never a creature.** A Compliance
    Levy of **25%** of the slush fund — a fraction rather than a figure,
    precisely so it scales with the runaway economy it exists to drain — and
    a bounded number of animals off for inspection. Both recoverable; zero
    death language; everyone is very polite about it. Beating one drops
    notoriety, which is the **spend** notoriety never had, and makes raids a
    rhythm the player manages rather than a tax they pay.
  - **Money finally has somewhere to go.** A **tier IV** on the four facility
    tracks that still had a knob to turn — **$480k** together, most of a
    campaign's bank, and a pure data edit because the facility system was
    already fully data-driven. Theater and Scanner deliberately get none:
    Theater's next step is an eighth socket and Scanner's two grants are both
    already true, so both need an engine change, and a level that grants
    nothing is a price with no purchase behind it. **Gauntlet purses
    $400–$900 → $26k–$90k**, and the walker now fights the four exhibitions.
  - **Two agenda rows**: *defend the ranch* (above even R85's feral row — the
    only clock in the game that bills you a quarter of the bank for ignoring
    it) and *answer an exhibition* (unreachable from any screen but the Labs
    tab since R42).
  - **Tuned by measurement, twice, and the first two cuts were both wrong.**
    Drawing from the Spire's top two shelves at up to 2.5× an A-team held
    **17 of 41** — 41% is not a fight you can lose, it is a fight you usually
    lose, and a stake the player cannot meet is just a tax. Backing off
    overshot to **89%**, a formality with a countdown. Settled at **64%**.
    The walker also had to stop head-butting a wall: its first cut retried
    whichever exhibition was open on every tick it could field a team, and
    one seed entered the same fight **182 times**, losing 98%.
  - **Measured after, six seeds:** funds day 180 **$864k → $176k**; notoriety
    **3,975 → 106**; raids **0 → 43 median, 64% held, $403k levied**;
    exhibitions fought **0 → 4**; and the endgame agenda shows **raid** and
    **gauntlet** where no mid-game save has either.
  - **Gates:** an R87 block in smoke and a fifteenth battery gate with breaks
    80–84 (the schedule becoming a roll, the window back-dating, the levy
    taking a creature, the ceiling failing, and winning buying no quiet). All
    five caught. `SAVE_VERSION` 41.
  - **One third of the entry was deliberately not built, and is queued as
    R102.** The original proposal had three parts: the task force, the money
    sinks, and a *run boundary* — "Relocate the lab", a new game plus
    carrying one legacy pick. The first two ship here; the third is a
    save-schema feature with its own migration, its own UI and its own
    gates, and building it alongside these would have landed two half-proved
    things instead of one proved one. `startNewRun`, `runSummary` and
    `CARRIED_ACROSS_RUNS` already exist in `save.js`, so the machinery is
    waiting.
  *Done when — re-derived, because the entry's own criterion was
  part-vacuous against the shipped game (its funds test passed 6/6 already,
  and its fight test passed on 1/6 by seed noise): across six seeds the
  median campaign faces 40+ Task Force raids and holds between half and
  85% of them; median day-180 funds fall under a quarter of the $864k the
  shipped game banked; and two agenda rows appear in the endgame that no
  mid-game save has shown.* ✅ **43 raids at 64% · $176k (20%) · raid and
  gauntlet.**

- **R88 — The battle screen charges full price for free fights.** A battle
  is **8.7 turns, 9 player decisions and ~25 beats** (measured, 20 pairings at
  tier 1), and the arena replays every beat with a per-kind timer and a
  tap-to-skip. The walker's 180 days hold **543 spars, 157 breakout hunts and
  18 rescues at 100%** — four fights a day whose outcome was never in doubt,
  each costing the same attention as a duel; the harness itself autoplays
  them. Proposed, medium-large: a **forecast → send-them** path — when the
  briefing's own forecast reads ≥ 95% and the fight is a spar, a hunt or a
  known rescue, offer *Send them* (the same seeded engine, resolved at once,
  reported on the wire with a one-line why) beside *Watch*; a battle **speed
  setting** (1× / 2× / instant) that reduced-motion selects; and a post-fight
  **report card** naming what decided it (the class edge, the tag-chart hit,
  the obedience miss) so a skipped fight still teaches. Duels, defences and
  assaults default to Watch. *Done when: the beats the walker's day replays
  drop by 60% at identical outcomes, and a rival duel still plays beat by
  beat by default.*
- **R89 — The Pens and the Ranch at scale.** On the day-180 save at 380 px,
  folded: Ranch **2,892 px (3.7 screens)**, Dex Foes **4,306 px (5.5)**, Dex
  front **3,172 (4.1)**, Vault **2,380 with one button per vial**; expanded:
  Ranch **8,356 px (10.7 screens, 98 buttons)** and the Pens **12,554 px —
  sixteen phone screens, 2,157 words, 52 buttons — for ten chimeras.** R44
  measured 10,470 px for nine; the card has grown 20% since (moves, dossier,
  the feral panel, rush). Proposed, large: one **list component**
  (`ui/list.js`) with band headers, a filter chip row (*can train · hurt ·
  settling · idle*) and one card open at a time; the creature card split into
  **tabs inside the card** (Overview · Moves · Anatomy · History) so an open
  card is under 1.5 screens; the Vault grouping vials by species with a
  count and a picker; and a **height budget in the a11y gate** — no screen
  over four screens folded, no card over two open — so the next system that
  adds a paragraph fails the build instead of the phone. *Done when: the
  day-180 save's expanded Pens is under 4,000 px and the Foes tab under
  2,500, gated.*
- **R90 — The test suite gets a test runner.** `tools/smoke.js` is **16,708
  lines in one file** and takes **twelve minutes**; the battery about an hour.
  R86 burned four full smoke cycles on single-assertion fixes (a missing roll
  entry, a chip's control marker, a hint's list membership, the eager cap).
  The same splice fixture is written out in **four tools, nine times**; the
  content-file list was in six places until R85; and three fixtures this
  session could not reach the code they guarded. Proposed, large, no new
  dependencies — `node:test` and `node:worker_threads` ship with Node 22:
  split smoke into `tools/suites/*.test.js` by system and run them in
  parallel workers; one `tools/fixtures.js` (the lab, the every-clock-running
  save, the walker's day-N saves) shared by smoke, handlers, a11y, the
  battery and any probe; a `--only <suite>` flag; and the battery aims breaks
  at suites rather than the whole file. *Done when: `npm test` runs every
  current assertion in under three minutes wall-clock on four cores, and no
  fixture recipe appears in more than one file.*

**Gameplay.**

- **R91 — The vault is a hoard with no bottom, and the save is paying for
  it.** The day-180 save is **1,711 KB**, of which `inventory` is **1,641 KB:
  8,760 part tokens and 1,965 vials.** Nothing caps either (grep: no cap on
  parts, vials, bays or notoriety anywhere); a token costs ~190 bytes, so
  localStorage's 5 MB quota fails around 27,000 tokens — roughly day 500 at
  this rate, silently. The same run created **1,797 chimeras with a median
  life of two hours**: splices are free of consequence because parts are
  abundant and dismantling hands them back. Proposed, medium: **vault
  capacity** sold like pen capacity and raised by the Extractor track;
  **stacking** (partId + grade + donor → count) so the save stores counts;
  vials that **retire into the Dex** after a season (the donor's genes stay
  remembered when the vial is gone); a dismantle **cooldown**, so a chimera
  is a decision; a **bay count** for Containment (280 bays on day 180, 719
  bagged, 0 rehabilitated); and a smoke rule that every array in the save
  has a stated bound. *Done when: the 180-day save is under 200 KB, every
  unbounded array is bounded and gated, and the walker's median chimera life
  exceeds five days.*
- **R92 — The yardstick plays half the game.** By grep, the walker never
  calls `breedPair`, `hatchEgg`, `startVat`, `startResequence`, `setMoveset`
  or the Gauntlet. Measured over 180 days: **0 of 27 combos discovered, 0 of
  12 traits expressed, 0 eggs, 0 vats, 0 tank runs, 0 of 4 Gauntlet stages,
  0 of 719 bagged specimens rehabilitated** — eight systems with zero
  harness coverage, the exact gap R83 closed for rivals, escapees and the
  Wing. Every balance claim about breeding, genetics, the vat, combos and
  retraining is currently unmeasured. Proposed, medium: a reserve-gated
  walker policy per loop, a number per loop in the walk report, a floor per
  loop in smoke — and then read the numbers, which will be the first honest
  answer to whether breeding pays, whether the vat is worth a grade, and
  whether combos are discoverable by playing. *Done when: every row the
  agenda can offer has a walker action behind it and a number in
  `campaignWalk`'s report.*
- **R93 — Breakouts and contests are the whole late game, and neither has
  stakes.** After dominion: **157 breakout hunts at 1.1 a day, 100% won**,
  against 8 assaults; **93 defences at 92%**, where the only cost of a loss
  is suspended income. Proposed, medium: **escapee packs** — a lab that has
  lost N specimens sends them back together, with the rival's counter-bias
  (R27's machinery, already built); **consequences at home** — an escapee
  left loose raids the ranch (a vial gone, the herd spooked to a condition
  floor); and **contest stakes that grow with tenure** — a node held thirty
  days pays a bonus and its loss costs a facility level. *Done when:
  post-dominion breakout and defence win rates are under 90% on the walker's
  diet, and the walk still reaches day 180 solvent.*
- **R94 — Notoriety is a number that goes up.** **3,833 on day 180**; the
  Threat Gen ladder is its only reader and tops out at Gen 3; every job adds
  heat and nothing spends or cools it. Proposed, medium: notoriety as a
  **meter with a top** that summons R87's task force, a **decay** through
  lying low (an "off the grid" job that pays nothing and cools you), and at
  least one **spend** — a bribe that suspends a convoy, a rival's dossier
  bought from the press — all in `regions.json`. *Done when: notoriety has a
  cap, a decay and a spend, and the walker's notoriety on day 180 is under
  the cap.*
- **R95 — 71 parts nobody reaches, and one encounter nobody beats.** Dex
  parts plateau at **173 of 244** from day 150 to 180 — 71 parts, twelve
  species' worth, never enter a 180-day campaign. In the standard-grade
  table the `military` column is **0% across all 68 builds** (kestrel air
  3%, the clam boss 10%) while the median build wins 23% of encounters.
  Proposed, medium, content and balance: a **Travelling Menagerie** — a
  rotating three-species catalog that visits monthly, weighted toward
  species the Dex lacks (the director already tracks what you have used);
  and a pass on the wall encounters so each has at least one standard-grade
  answer, or says in its briefing that it is Apex content. *Done when: a
  180-day walk sees at least 95% of parts, and every encounter has a
  standard-grade build that beats it at least half the time.*
- **R96 — Creatures that move.** The renderer holds **0 `<animate>`
  elements**; the stylesheet 11 keyframes; a chimera's temperament (two
  axes), condition, injuries and ten scar types are all *text beside a
  static portrait*. §8 risk 1 says the renderer is the whole first
  impression. Proposed, medium-large, zero art assets: a procedural **idle
  layer** (breathing, blink, tail sway — on the existing shape groups, off
  under reduced motion); **temperament in the posture** (Skittish crouches,
  Bullish squares up); **injury and scar marks** drawn as part-space
  overlays; and a **victory and KO beat** in the arena. All driven by state
  the save already carries. *Done when: a Skittish and a Bullish chimera
  with the same genome render visibly differently, a scarred one shows it,
  and the boot and a11y (reduced-motion) gates still pass.*

**UI.**

- **R97 — The Dex is polluted.** `dex.enemies` holds **255 entries for 42
  authored units** and `beaten` 250: `campaign.js` records every generated
  rival chimera and escapee by its unique id, so the Foes tab is the tallest
  folded screen in the game (4,306 px) and grows with every duel. Proposed,
  medium: key generated units by **archetype** (lab + class + frame) with a
  sightings count; a Foes tab that groups authored units by region and
  generated ones by lab; and a migration that dedupes existing saves. *Done
  when: Foes is under two screens folded on the day-180 save, and
  `dex.enemies` never exceeds authored units plus labs.*
- **R98 — The game says 2,157 words on one screen.** Expanded Pens **2,157
  words**, expanded Ranch 973, folded Ranch 448; 33 field guides averaging
  55 words; every card carries a deadpan paragraph while the tone rules ask
  the ticker for one sentence. Proposed, medium, copy and UI: a **card copy
  budget** (headline ≤ 8 words, body ≤ 25, everything else behind a fold);
  a **terse setting** that hides flavour lines; a `fine-print` audit for
  lines that explain nothing the number beside them does not; and a smoke
  gate on words per card. *Done when: expanded Pens is under 900 words with
  no rule left unexplained — every mechanic still has a title or a guide.*
- **R99 — The a11y gate learns to see overlap, contrast and motion.** This
  session shipped two defects the gate passed: **3.42:1** body text on the
  feral panel, and the egg's Hurry button overlapping its lineage text and
  escaping the card at 380 px. The gate measures a control's size and its
  gutter to the next control, and nothing else; two `prefers-reduced-motion`
  blocks cover eleven keyframes. Proposed, medium: a **contrast pass** (every
  text node against its effective background, AA, all five themes), an
  **overlap and containment pass** (no control's box intersects another's or
  leaves its card), and a **reduced-motion pass** (media query emulated,
  nothing animates). *Done when: both defects, replayed as battery breaks,
  are caught.*

**Platform and durability.**

- **R100 — Ship the TWA: four unchecked boxes, an offline-second worker,
  and a save that lives in localStorage.** `docs/TWA.md` has **four items
  open** (device test, 512 px icon, screenshots, cache-bump discipline);
  `sw.js` is **network-first for all 95 shell entries** — a known issue since
  R81, so every cold open waits on the network before it will use the cache;
  the save lives only in localStorage (5 MB, evictable on iOS) though export
  and import are already built. Proposed, medium: cache-first for the
  versioned shell with background revalidation; IndexedDB as the primary
  store with localStorage as a mirror; an export reminder in settings after
  N days; the icon and screenshots; and a `tools/release.js` that checks
  `CACHE` against `SAVE_VERSION` rather than remembering to. *Done when: the
  app opens offline in under a second from cache, the checklist is empty,
  and a 2 MB save round-trips through IndexedDB.*
- **R102 — The run boundary: "Relocate the lab".** The third part of R87,
  deliberately deferred rather than half-built. R87 gave the endgame a stake
  and a sink; what it still has no shape for is an **ending the player
  chooses**. Measured there: the county falls on median day 35–54 and the
  remaining ~130 days have no terminus, so a campaign stops when the player
  gets bored rather than when they decide it is finished. Proposed, large:
  new game plus, carrying exactly **one legacy pick** — a bloodline, a
  philosophy perk, or a named veteran — so a second run starts different
  rather than merely faster. `startNewRun`, `runSummary` and
  `CARRIED_ACROSS_RUNS` already exist in `save/save.js` (the settings panel's
  "new run" button uses them today, carrying only `settings`, `guidesSeen`
  and `ui`), so the machinery exists and what is missing is the *pick*: a
  save-schema field, its migration, the ceremony that offers it, and a gate
  that a legacy creature arrives with its history and none of its old
  roster. *Done when: a completed run can be retired into a new one carrying
  exactly one chosen thing, and smoke asserts the new save keeps that one
  thing and nothing else.*
- **R101 — `save/save.js` is 1,020 lines of migrations, with fixtures for
  19 of 39.** It is the largest eager module (**44 KB**), so every player
  downloads every migration they will never run, and twenty steps of the
  chain have never been replayed against a real save of their version.
  Proposed, medium: migrations 1–35 behind a lazy import taken only when
  `saveVersion < 36`; a **fixture per version** generated from the walker
  (`tools/saves/v{N}.json`) so smoke replays v1 → current step by step; and
  a rule that a migration ships with its fixture. *Done when: the eager graph
  carries under 15 KB of save.js, and `npm test` migrates a v1 save to
  current through every step with a fixture at each.*
