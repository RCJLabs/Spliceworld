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
- save version: 49
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
- **R89 — The Pens and the Ranch at scale.** ✅ *Shipped.*

  **This entry's own numbers understated it.** Measured on the day-180 walked
  save at 380px — which nothing in the tree could produce until this
  milestone, because `campaignWalk` built the state, reported summaries of it
  and dropped it — the expanded Pens is **16,657px and 3,446 words for NINE
  chimeras**, against the 12,554px and 2,157 words this entry recorded for
  ten. The card had kept growing since the audit wrote that down: R103's
  stance row, R125's tier chip, its "why" and its lever all landed after.
  That is the argument for a gate rather than a note.

  **Two of the things proposed here already existed** and were not rebuilt:
  `ui/roster.js` has supplied band headers since R44 (the Pens already reads
  *"Can train now 9"*), and `ui/cards.js` has supplied `collapsibleCard`. The
  real work was narrower — the open card, and a Foes tab with no fold on it
  at all.

  **Two rules, and they only work together.** Tabs (Overview · Moves ·
  Anatomy · History) cut the card, and `bindFolds`' new `exclusive` list
  keeps at most one creature open: a screen whose height is *roster × card*
  cannot be fixed by dieting the card. Break 139 measures exactly that — with
  the tabs still in place but exclusivity removed, the Pens is 7,063px.

  **What is deliberately not in a tab** is the load-bearing half. R15's rule
  is that a countdown costing you something never hides behind a tab, so the
  feral panel, the settling clock, the vat recovery and the Infirmary window
  sit above the bar and show on all four tabs — verified per tab in a real
  browser.

  *Done when: the day-180 save's expanded Pens is under 4,000 px and the Foes
  tab under 2,500, gated.* ✅ — **Pens 16,657 → 1,919px** at its tallest,
  **Foes 4,113 → 664px** shut. `tools/height.js` holds both on the day-180
  save, plus a ratchet on the seven screens R89 does not touch so they cannot
  grow into the space it frees. Breaks 139 and 140 hold both directions.

  **Three gates caught this milestone hiding things from them**, which is the
  system working: `handlers` found `data-moves` and `data-dossier` painted on
  a surface no walk could reach (a `pens:card` surface with a fanout over the
  tabs now walks them), and `a11y` found the retraining sheet unreachable for
  the same reason. The height gate itself had to be fixed first: its first
  version opened every fold and stopped, so on the new card it only ever saw
  Overview at 1,742px while Moves is 1,919 — reporting the shortest of four
  faces as the tallest.

  *(Superseded proposal, kept for the record.)* On the day-180 save at 380 px,
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
- **R90 — The test suite gets a test runner.** ✅ *Shipped.*

  **`npm test` went from 621s to 172s** — and only about 50 of those 449
  seconds came from parallelism. The rest was work that never needed to
  happen, which is not what this entry expected to find.

  **Its proposed mechanism could not have met its own criterion.** "Split
  smoke into `tools/suites/*.test.js` and run them in parallel workers"
  bounds wall-clock below by the largest suite, and the largest single block
  was **242s against a 180s bar**. No partitioning of a file fixes a block
  that is already over budget. What worked was making the blocks smaller.

  **Two kinds of waste, both invisible to a profiler.** The gene probe ran a
  plain arm and a gene arm per build and encounter, and the plain arm depends
  on `(species, encounter, salt)` alone — so it was recomputed identically
  **fourteen times per family**, 200 battles each. `geneRun` is pure in its
  four arguments, so the repeats could only return what the first call
  returned. And once sharding existed, eight blocks were being computed
  **four times over for one answer**: R76's handler walk (40.3s), the
  director's mercy sweep (17.0s), the balance combo-by-grade check (13.9s),
  the difficulty curve (11.6s) and four smaller ones. Roughly **330s of
  duplicated CPU**, removed without losing an assertion.

  **A profiler answers the wrong question when work is duplicated across
  processes.** Section timings say where ONE run spends its time; they say
  nothing about what a SECOND process must repeat. Two suite runs were spent
  optimising the first quantity while the second bounded the result. The
  honest instrument is `SW_SHARD=z`, which runs the common path and nothing
  else — it reported **92.7s** where the profiler's tail had implied six, and
  it should have been the first thing built rather than the fifth.

  **Shards, not a file split.** Each of the four is the whole of `smoke.js`
  with only its share of the heavy blocks enabled, so union coverage is by
  construction — the common path runs in every shard, each guarded block in
  exactly one, an unset `SW_SHARD` runs all. Moving 17,790 lines into
  separate files buys the same concurrency and risks dropping assertions
  where no reviewer would see it. The balance sweep splits by pool and the
  gene probe by family, because a shard holding an indivisible 125s block was
  the critical path at 266s: parallelism cannot help a monolith, only work
  around one.

  *Done when: `npm test` runs every current assertion in under three minutes
  wall-clock on four cores, and no fixture recipe appears in more than one
  file.* ✅ — **172.2s on four cores** (669s of work across 8 concurrent
  jobs), enforced by `tools/suite.js` itself rather than reported; and
  `tools/fixtures.js` holds the laboratory both walking gates build from,
  verified behaviour-preserving (a11y 79 controls across 29 views, handlers
  1,588 across 69 surfaces — both unchanged). Union coverage is a gate too:
  breaks 141 and 142 hold a block guarded under a name no shard owns, and a
  shard entry whose block has gone. Both failures make the suite faster and
  greener while testing less, which is the one bug this milestone could
  otherwise have shipped. `tools/smoke.js` is **16,708
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
  it.** ✅ *Shipped.*

  **Every number in this entry was low, and two things it never mentioned
  were the actual emergency.** Re-measured on the post-R90 tree at seed 2026:
  the day-180 save is **1,843.5 KB**, of which `inventory` is **1,760.9 KB —
  95.5%** — holding **9,451 part tokens at 151 bytes each** and **2,059
  vials**, with **378 containment entries** (not "280 bays") at 44 KB. A
  campaign built **1,834 chimeras to keep nine**, median life **two hours**,
  which is the one figure the entry called exactly right.

  **`MAX_SLOTS` is 4.** The entry's "5 MB fails around 27,000 tokens —
  roughly day 500" is correct arithmetic for one campaign, and the game has
  held four save slots since R71, sharing one quota. Growth is dead linear at
  **10.4 KB a day**, so four campaigns cross 5 MB around **day 124** — inside
  what the walker already simulates. And `saveGame` catches that write
  failure, returns `false`, and none of `main.js`'s four call sites reads the
  result: the game stops saving and says nothing.

  **The entry's own stacking key could not have met its own criterion.**
  `partId + grade + donor` collapses 9,451 tokens to **6,641** — a 30%
  saving — because the donor block is display-only lineage with 884 distinct
  name/stars pairs. `partId + grade + traits` collapses to **250**. Stacking
  was not needed at all in the end: a capacity does the whole job, and it is
  a rule the game already understood, because pens have been sold that way
  since M1.

  **Two doors, two rules.** A yield you ASKED for is refused when it will not
  fit; a yield you were GIVEN — battle salvage, a Wing graduate — cannot be,
  because you never pressed a button, so it is rendered down at the door and
  paid for, and the wire says so. Nothing is destroyed silently, which is the
  promise `SAVE_VERSION` makes about saves applied to everything else.

  **A dismantle is never refused for want of shelf space**, and that was
  learned the hard way: with that door closed, a full stable and a full vault
  could neither dismantle nor splice and sat there for 120 days, while the
  gate reported a median chimera life of 104 days that was pure paralysis. A
  graduation ADDS to your holdings and can be told to wait. A dismantle
  reduces them, and refusing it is how a game deadlocks.

  **The Theater is a room with one table.** Splicing and dismantling both
  occupy it, which is what turns "build one, scrap it, build another" from a
  free action into a day's work. It is deliberately **the only clock in the
  game that is not rushable**: for one measurement it was, and the walker
  bought past it 1,665 times in 180 days. A limit you can pay to ignore is
  not a limit. It is a capacity, like a pen — you do not rush a pen, you buy
  a bigger one, and the Surgery Theater track halves the table.

  **Three things the harness was getting wrong, each found by measuring.**
  `stableCap ?? 9` was a hand-typed copy of a rule that existed nowhere else,
  so the walker churned against its own constant the moment the Theater began
  selling stalls (R61). A stall RESERVED by a running programme is not a
  reason to take an existing creature apart — reading it as one turned 142
  enrolments into 269 dismantles. And the replacement test asked "is this
  build better than that creature" when R13 has charged a price since it
  shipped: a dismantle returns a subset of the parts, each one grade worse.
  The margin is `salvagePreview` — the same function the Pens' confirmation
  shows the player — not a tuning constant.

  *Done when: the 180-day save is under 200 KB, every unbounded array is
  bounded and gated, and the walker's median chimera life exceeds five days.*
  ✅ — **147.6 KB** at day 180 (591 KB across four slots, against 5 MB); **38
  array paths, every one named in `tools/vault.js` with the thing that caps
  it**, and an array the table does not know about fails the build, which is
  how `dex.species` was caught on the milestone that added it; median chimera
  life **43.8 days**. `SAVE_VERSION`
  46, and a save that predates the cap is PAID rather than pruned —
  `consolidateVault` renders the overflow at the Vault screen's own price on
  the first world tick, worst duplicates first, one of every anatomy kept.

  **What this milestone did not fix.** `dex.enemies` holds 244 entries against
  42 real enemies and `dex.beaten` 237 — R97's Dex pollution, ratcheted here
  rather than widened into. The Vault SCREEN is 30,156 px with every bay open:
  finite for the first time, because the data behind it is, but the fold work
  is R89's applied here and is not in this criterion. The Ranch is still one
  card per animal.

  ~~The day-180 save is **1,711 KB**, of which `inventory` is **1,641 KB:
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
  has a stated bound.~~ *(The original entry, struck through: every figure in
  it was measured low, its stacking key saves 30% where the criterion needs
  97%, and the quota arithmetic is right for one save slot out of four.)*
- **R92 — The yardstick plays half the game.** ✅ *Shipped.*

  **Half the entry was already stale, and nothing had noticed** — because
  there was no gate to notice with. Of the eight systems it lists as having
  zero harness coverage: **eggs are 75 laid and 75 hatched** (R120 taught the
  walker to breed two milestones later), the **Gauntlet is 4 of 4** cleared,
  **76 captives** have been rehabilitated (R83 and R91), and traits had crept
  from 0 to 1 of 12. A note nobody re-runs goes stale whether the news is
  good or bad, which is the argument for `tools/coverage.js` rather than a
  seventh audit.

  **The criterion was one row from passing while the problem stood
  untouched.** "Every row the agenda can offer has a walker action behind
  it" — 18 of the 19 rows already fired, and only the chaos vat did not. But
  combo discovery, the Resequencer and retraining a moveset have **no agenda
  row at all**, so the criterion as written could go green with three of the
  four remaining gaps open. R106's lesson, so the gate's second rule checks
  the SYSTEMS rather than the rows.

  **The Surgery Theater was locked out of its own game.** Biasing the planner
  toward combos changed nothing, and three guesses cost more than counting
  would have: across 180 days the stable was **FULL on 2,013 of the 2,063
  steps** where a splice was otherwise ready. The Wing and the vat took every
  stall the moment one opened — 22 graduates and 27 decants against **seven
  splices** — and once R91's replacement margin is in force a full stable
  stays full, because nothing in it is bad enough to be worth the grades a
  dismantle burns. An interaction between two shipped milestones that no gate
  could see until this one existed. Both opportunistic creators now leave a
  quarter of the stable alone: splices 7 → 26.

  **AND THEN THE NUMBERS, which is what this entry was for.**

  *Does breeding pay?* Yes, modestly, and not the way M6 claims. Over 600
  pairs across 35 species a child beats the parent **mean** by +0.111
  potential per stat and sits **−0.178 below the best parent**, beating it
  **25.3%** of the time. Breeding regresses toward the mean with upside: it
  turns two mediocre animals into a better-than-average one, and one cross in
  four beats your best.

  *Is the vat worth a grade?* Not for power — for **variety**, exactly as R12
  said and nobody had checked. Over 200 gestations the child is **−0.89 grade
  steps** below its best parent and beats it only **16.5%** of the time, but
  **69.5%** carry a part from neither parent and **18.5%** gain a socket
  neither had. "A creature the Surgery Theater could not have assembled" is
  now a measurement.

  *Are combos discoverable by playing?* **No.** A median of **2 of 27** across
  five seeds — 7.4% of the combo content — even with the planner actively
  chasing pairs it can complete. A6 was titled "Combos for the other 87%";
  a full 180-day campaign reaches 7% of them. **Queued as R93b.**

  *Done when: every row the agenda can offer has a walker action behind it
  and a number in `campaignWalk`'s report.* ✅ — **19 agenda rows and 8
  systems, every one exercised and counted**, gated by `tools/coverage.js`,
  which reads the row list out of `ranch/agenda.js` rather than re-typing it
  so a row added later is checked the day it lands. Dominion still falls, 21
  nodes, no stall.

  ~~By grep, the walker never
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
  whether combos are discoverable by playing.~~ *(The original entry, struck
  through: four of its eight claims had already been closed by other
  milestones, and its criterion could not see three of the four that had
  not.)*
- **R93b — Seven per cent of the combos.** ✅ *Shipped — as an answer, which
  is what its criterion asked for.*

  R92 queued this with a deliberate escape hatch: *at least half the roster,
  **or** the entry says with numbers why that is the wrong target.* It is the
  wrong target, and **neither candidate the entry named is the reason.**

  **Not "never pointed at."** `comboHint` in `splice/theater.js` has rendered
  *"you have handled both. Put them on the same creature"* since R21, the
  moment a player owns a pair. The Splice-Dex says it out loud.

  **Not the sockets.** Two named parts on a six-socket frame is not a
  squeeze; a frame can carry three pairs at once, which is exactly why one
  of the fixes below failed.

  **IT IS SPECIES REACH.** 25 of the 27 combos need parts from two
  DIFFERENT species, and a 180-day campaign touches a median of **23 of 41
  species** — 109 to 136 of the 244 parts. You cannot discover a combo whose
  second animal you never acquired, so a median **nine of 27 are even
  possible**. Half the roster is unreachable by any play at all, and six more
  need a **variant** species, which is bred and never bought. Making it
  reachable is R95's problem ("71 parts nobody reaches"), not this one's, and
  saying so with numbers is what this phase was for.

  **What WAS this phase's, and it was R92's own bug.** Of the combos a
  campaign could assemble it found **48.1%**, because R92's planner boosted
  every completable pair *including the ones already discovered* — so the
  highest-ranked parts never changed and the walker rebuilt the same
  creature. Excluding the found ones takes it to **69.0%**, measured across
  fourteen seeds.

  **Two fixes measured and reverted**, recorded because a change that sounds
  right and measures worse is worth more written down than deleted. Aiming at
  a single undiscovered target: **62%**, one seed from 89% to 22% — a
  six-socket frame carries several pairs and naming one throws the rest away.
  Protecting undiscovered combo halves from the rendering vat: **63%** — it
  keeps the vault full, which refuses graduations, which starves the economy
  that makes the parts. The same second-order shape as R92's three-way
  deadlock, one milestone later.

  **And three seeds was not a sample either.** The gate started at one seed,
  moved to three when the same tree measured 43% to 100% campaign by
  campaign — and on those three, *removing* the fix scored HIGHER (63%
  against 56%) and the break written to catch it came back MISSED. Fourteen
  seeds settle it: **69.0% with, 48.1% without.** Seven reproduce that at
  71.4% against 54.9% for 25 seconds of walking, which is what the gate runs.
  The lesson is the one this phase had already half-learned one step
  earlier: a content-reach number needs a sample, and "more than one" is not
  a sample.

  *Done when: a 180-day walk discovers at least half the combo roster, or the
  entry says with numbers why that is the wrong target.* ✅ — **the second
  clause**, on the numbers above. `tools/coverage.js` gates what is actually
  in this phase's gift: the fraction of ASSEMBLABLE combos a campaign finds,
  across seven seeds, ratchet 0.65 — between the two measured states, so
  removing the planner's exclusion fails the build.

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
- **R95 — 71 parts nobody reaches, and one encounter nobody beats.** ✅
  *Shipped — the first half met, the second answered.*

  **BOTH HALVES OF THE ENTRY WERE WRONG, AND THE PROPOSED FIX WAS AIMED AT A
  CONSTRAINT THAT DOES NOT BIND.**

  *Not 173 of 244.* Re-measured across the coverage gate's seven seeds, a
  180-day campaign saw a median **118 of 244 parts** — 95 to 153. R91 capped
  the vault and R92 capped the herd and nothing was watching this number
  while they did.

  *Not availability.* By day 180 the walk holds **22 or 23 of the map's 23
  nodes** and finishes on a median **$249,000**, which opens **33 of the 41
  species and 196 of the 244 parts**. It bought **twelve**. A Travelling
  Menagerie would rotate a catalogue that is already open and already
  affordable.

  **WHAT WAS MISSING WAS A REASON.** 41 species share **four classes**, so
  once the best Ground animal you can afford is in the pens every other
  Ground animal is dominated, and nothing on the screen said which of them
  was new. `isNewToDex` reads `dex.parts` — every part the save has ever
  shelved — and the Mail-Order rows now say NEW ANATOMY, the picker counts
  them, and the agenda's buy row leads with what you have never held rather
  than what you can afford.

  **AND THREE DOORS NOBODY WALKED THROUGH.** Buying (the walker took the best
  answer in the demanded class and stopped: 118 → 200 parts on its own, with
  no cost to dominion, record or bank). Salvage (eight enemy-tech parts are
  carried by 23 of the 42 enemies and by nothing else, and rehab and salvage
  are exclusive, so a walker that always enrolled meant those parts did not
  exist). Breeding (34 parts sit on six variant species behind a mutation in
  the Incubator, and two rules of the same walker disagreed about herd size —
  `HERD_CAP` 14 against `WORKING_HERD` 20 — so the buyer locked the breeder
  out for the rest of the campaign: six to thirty-two eggs in 180 days with
  twelve bays empty).

  **ONE GAME CHANGE.** The Incubator's Tier III blurb has sold itself as
  where variants come from since R25 while granting nothing of the kind: the
  variant share was a constant 0.3, so a variant was one egg in forty-two at
  every tier. It is a facility grant now — **0.3 / 0.4 / 0.5 / 0.65** in
  `data/facility.json`, with the constant left as the no-facility floor.

  **AND ONE REGRESSION THE REACH WORK EXPOSED.** R91's save-weight gate went
  red at a median chimera life of **thirty-six hours**, 200 creatures built to
  keep ten. Switching the chaos vat off in a copy answered it in one run: 23
  built, median 91 days. **119 gestations in 180 days and every decant
  scrapped within hours.** R91's rule for the Reorientation Wing — nobody
  waits out a programme to render the result down the same evening — had
  never been applied to the vat. A creature now gets two days to be worth
  keeping, which is long enough to settle and fight once, and the vat is
  self-limiting the moment its output can occupy a stall: 119 gestations
  become 25 and the median chimera lives **50.8 days**.

  **Result: a median campaign sees 233 of 244 parts (95.5%), every seed 224
  to 238, 40 of 41 species, dominion still 7 of 7.**

  **THE WALL IS A GRADE WALL, ON PURPOSE.** The entry names one column;
  measured, **13 of 31 encounters have no standard-grade build that beats
  them half the time and 10 cannot be won at standard by any of the 68
  sampled builds** — while at Apex it is **zero and zero**. (`military_response`
  is not 0% but 33% at its best, one build in 68; the clam boss is 7.4% mean,
  not 10%; kestrel air 3.4% and the median build 23.7% both hold.) A
  standard-grade answer to every encounter would delete the ladder the whole
  husbandry loop climbs, so the Done-when's second clause is answered the way
  the entry's own text offers: `diagnose` gains **`outgraded`**, which replays
  the same fight with the team's parts lifted, cheapest grade first, and names
  the first one that makes it a fight rather than a formality. The string it
  replaces said "these creatures are not strong enough yet" while the comment
  directly above it already knew the number.

  **AND ONE COST, STATED.** A richer save is a taller screen: the Ranch is
  3,572px shut (4.6 phone screens before anything is opened) because the
  folded card is one row per animal and the walk now keeps twenty, and the
  Dex's Combos tab has no fold at all. Both budgets are re-ratcheted rather
  than fixed — **folding the Combos tab is owed alongside the Vault's**, and
  paginating the Ranch has been owed since R46.

  `tools/reach.js` holds all three rules: every species reachable by a
  mechanism that resolves, 95% of the part list across seven seeds, and every
  wall naming its price. *Done when: a 180-day walk sees at least 95% of
  parts, and every encounter has a standard-grade build that beats it at
  least half the time* — first clause met at 95.5%; second answered with
  numbers, because meeting it as written would flatten the grade ladder.
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

- **R97 — The Dex is polluted.** ✅ *Shipped.*

  **THE ENTRY WAS HALF STALE AND ITS OWN PROPOSAL COULD NOT MEET ITS OWN
  CRITERION.** Re-measured across seven seeds: `dex.enemies` holds **248 to
  270** entries — 42 authored plus **206 to 228 generated** — so the count
  holds. The height does not: the Foes tab is **681px shut**, because R89
  folded it two milestones ago, not the 4,306px tallest-screen-in-the-game
  this entry describes. And the proposed key, *lab + class + frame*, is up
  to **60** archetypes on 5 labs × 3 classes × 4 frames, for a ceiling of
  102 against a Done-when of **authored + labs = 47**. The archetype has to
  be the lab; class and frame belong inside that page, not in its key.

  **THE COMMENT SAID IT AND THE CODE DID THE OPPOSITE.** `resolveBattle`
  carried the line *"generated rival chimeras aren't roster units — they
  have no Dex page"* directly above the code that filed them; the guard
  tested for a string and they are strings. Nothing rendered them either —
  the Foes tab iterates the authored roster and tests membership — so all
  211 were weight no screen had ever shown. What the player *could* see was
  a counter: the header printed the raw list length over the authored total,
  reading **"253/42 logged"**, and `dexProgress` hid the same overflow
  behind a `Math.min` on the way into its aggregate.

  `dexKeyFor` sends an authored unit to its own page and a generated one to
  `lab:{rival}`, living beside the line that mints the id and testing the
  prefix rather than splitting on an underscore. `dex.sightings` counts what
  lands there and a **Laboratory stock** fold reads it back — as a list, not
  a gallery, because a lab's specimen is a different creature every duel and
  a portrait cell would be a placeholder pretending otherwise (five cells
  858px, five lines 200px).

  **`dex.enemies` 253 → 47**, exactly the authored roster plus five labs;
  the day-180 save **143.9 KB → 134.6 KB**; Foes **764px shut** against the
  criterion's 1,560. `SAVE_VERSION` **46 → 47**, with a migration that
  collapses the old ids *and counts what it collapsed*, so a player's
  sightings arrive with them. *Done when: Foes is under two screens folded
  on the day-180 save, and `dex.enemies` never exceeds authored units plus
  labs* — both met, the first before this milestone started.
- **R98 — The game says 2,157 words on one screen.** ✅ *Shipped — the
  criterion had already passed, and the words were on the other screen.*

  **THE ENTRY DESCRIBES A SCREEN THAT STOPPED EXISTING TWO MILESTONES AGO.**
  Measured on the day-180 save, expanded Pens is **291 words**, not 2,157:
  R44 sized it and R89 gave it `bindFolds`'s `exclusive` list, so it has ten
  folds and allows **at most one open**. Expanded Ranch is **1,686**, against
  the 973 recorded here, and folded 658 against 448.

  **ONE ARGUMENT WAS THE WHOLE DIFFERENCE.** The Ranch had the same cards,
  the same helper, in the same file, and had never been passed the list —
  twenty-three folds, all open at once. Giving it the Pens' rule took it from
  **1,686 words to 935** and **14,450px to 4,852px**. No redesign was needed
  or done: R47 had already banded the screen into *Ready to graduate*,
  *Needs care* and *Growing*, and every card already withheld its portrait,
  care buttons and dossier until opened, so a shut row was already a roster
  line. The bands stay out of the exclusive group, because they are how you
  **find** an animal rather than something you read.

  **THE BUDGET LIVES IN THE HEIGHT GATE**, because height and word count are
  one question asked twice — the Ranch was tall and wordy for the single
  reason that nothing closed the card you were not reading. `tools/height.js`
  already opens every screen and every fold, so counting `innerText` in that
  pass is free; a second tool would have put ~40s on a suite with six to
  spare. `open` means what a player can have on screen AT ONCE, not the sum
  of every card, and that distinction is the finding.

  Two budgets in the new table were **invented rather than measured** and
  both had to be corrected on the first run — the Dex's Combos tab (350
  written, **527** measured, because R95 took combo discovery from two to
  eight on a tab with no fold) and the Ranch itself (900 written, **935**
  measured). Both are ratchets on the measurement now. The `fine-print`
  audit the entry asks for landed on the Facility card, which printed two
  blurbs per track — the level you own and the level you are choosing;
  the first survives only where a track is maxed and it is the sole
  description, taking that card from **306 words to 197 mid-game**.

  *Done when: expanded Pens is under 900 words with no rule left unexplained*
  — it is 291, and was before this started; the milestone's real work was the
  Ranch, and the terse setting the entry proposes was not needed to get
  there. R128 takes the facility tree off that screen next.
- **R128 — Nobody can find the Surgery Theater upgrade.** Reported from
  play, and the data has been saying so since it was written: every track in
  `facility.json` carries a **`screen`** field naming where it belongs —
  `theater`, `battle`, `ranch`, `extract`, `ranch`, `pens` — and **nothing
  reads it**. All six are listed together in one card called *Facility*, on
  the **Ranch**, shut by default, behind a derelict-house icon that names no
  system. The Surgery Theater has exactly **2 levels**, so there is one
  upgrade in the game that widens what you can splice, and it is the single
  biggest card on the wordiest screen (**256 words**, one of 23 folds).
  `theater-ui.js` already imports `nextUpgrade` and uses `levelData` only to
  print its own level's NAME — it knows what tier it is and never offers the
  next one. Proposed, small-medium, UI: **route each track to the screen its
  data already names**, so the Theater's upgrade is bought on the Theater and
  the Infirmary's on the Pens; leave a roll-up on the Ranch that links out
  rather than duplicating; and make the buy row say what the level UNLOCKS
  (a second organ bay, a wider chassis) rather than only its price. *Done
  when: every facility track is reachable from the screen its `screen` field
  names, and a player who has never opened the Ranch can still buy the
  Surgery Theater's upgrade.*

  **SHIPPED.** The first entry in four whose premise held exactly: R95, R97
  and R98 each turned out to describe a screen that had stopped existing,
  and this one was true to the letter. The `screen` field had gone unread
  since it was written — and a field nobody reads is a field nobody
  validates, so one of the six was pointed at nowhere. `extract` is not a
  screen; extraction is an overlay `main.js` starts from the Ranch. It is
  now `vault`, where two of that track's three grants are felt. **The
  entry's own proposal, shipped as written, would have routed a track to a
  screen that does not exist** — which is the argument for writing the gate
  before the feature, again.

  `ui/facility-card.js` is the one door: `facilityCard(state, content,
  screen)` draws the tracks whose data names that screen, five screens call
  it, and the Ranch keeps a roll-up that says how many upgrades wait
  elsewhere and links out. The buy row now derives what the money buys from
  the `grants` themselves — `sockets 6 → 7`, `frames 2 → 4` — so a track
  that gains a grant next milestone says so without anyone writing a
  sentence.

  **THE GATE FOUND THREE LIVE-LOOKING DEAD CONTROLS, AND PLAY FOUND NONE OF
  THEM.** The card is a fold, and its fourth assertion asks whether each
  screen binds one: the **Theater and the Vault had never called
  `bindFolds`** — neither had a fold before this card, so nothing had ever
  needed it — and the **Ranch lost its buy button** when the `upgrade`
  branch moved out of its `data-act` loop and nothing replaced it. Three
  screens would have shipped a control that looks live and does nothing,
  which is worse than the hidden card this milestone set out to fix.

  Two gates written before this one broke **without any behaviour
  changing**, and both were the same shape of mistake. `twenty < one * 3`
  on the Ranch is a claim about roster growth measured against a
  one-animal page — moving four tracks off the screen pulled **~5.6 KB of
  fixed chrome out of the denominator**, so a leaner Ranch failed a gate
  whose real number, 1,253 chars per head, had not moved at all. A ratio to
  a screen's own furniture rewards furniture; it now measures a row against
  a **card** (1,253 against 9,607), which is the comparison the sentence was
  always making. The second counted every `data-goto` on the Ranch and
  equated it to the agenda's open items; the roll-up adds four real
  destinations that are simply not agenda rows.

  **THE HEIGHT COST IS REAL AND WAS PAID FOR OUT OF A CEILING NOBODY
  COLLECTED.** Advertising the same six tracks on five screens instead of
  one costs each destination a card header — the Vault **+56px shut**, the
  Theater **+98px and +20 words** open — and the Ranch gives back almost
  nothing, because its card was already shut. That is the honest price of
  being findable. It is paid several times over by R98's unclaimed change:
  the one-at-a-time rule took the Ranch's open height from **14,537px to
  4,264px** and left the budget standing at **14,800**, so 10,536px of
  ceiling sat there permitting a screen the code can no longer build.
  14800 → **4450**, 950 → **810 words**. Boot 1055 → **1060 KB** (measured
  1,057), the third raise in three milestones, and the note now says out
  loud that the next one should bring the number down.

  The card is **shut on every screen**. A single-track screen opening its
  own card was the first draft and R98's Pens criterion refused it; shut is
  not hidden, because the summary rides on the header — *1 ready to buy · 1
  upgrade left, from $900*. One number in the entry above was already stale
  when it was written: the Facility card was **197 words, not 256**, R98's
  `fine-print` audit having cut it the session before.

  *Done when: every facility track is reachable from the screen its `screen`
  field names, and a player who has never opened the Ranch can still buy the
  Surgery Theater's upgrade* — both hold, and the second is asserted as a
  real `renderTheaterScreen` call rather than a string check on the card.

  **R128b — FOUR GREEN GATES AND THE PLAYER STILL COULD NOT FIND IT.**
  Reported from play against the merged build: *"I don't see the upgrades
  anywhere… the buttons for battle and pens are weird, not in the same
  style."* Every assertion above was passing. All four asked whether the
  card EXISTS; **none asked where it was, what it was called, or whether
  the sentences pointing at it were still true**, and each of those was
  wrong:

  - **It was appended, so it was last.** 12th of 12 cards on the Pens, 2nd
    of 2 on the Vault, 4th of 4 on the Splice, 10th of 10 in the War Room —
    **1.9 to 3.2 phone screens down**. The Ranch card it replaced was 3rd of
    25. Moving an upgrade from near the top of one screen to the bottom of
    five is not making it findable. Now 2/12, 1/2, 2/4 and 5/10, at 517px,
    128px, 584px and 1,216px.
  - **`class="linkish"` had no rule anywhere.** I invented the name and
    never wrote the CSS, so the roll-up's screen links rendered as default
    grey buttons wedged mid-sentence. **An unstyled class is not an error —
    it is a default button**, which is why nothing caught it.
  - **The roll-up printed internal ids at the player**: *"2 more upgrades on
    battle, pens"*. Two of those four are not words this game shows anybody
    — those tabs read **Splice** and **War**. An id in player-facing prose
    is a wrong direction, not a terse one.
  - **The Theater still said "bought at the Ranch."** R128 moved the
    purchase and never touched the sentence pointing away from it — the
    literal question the report asked, still answered wrongly by the screen
    that now sells it.
  - The card was also **titled after the level** (*Tier I — Card Table &
    Optimism*), which names what you own rather than the machine you were
    looking for. It names the machine now, with the tier in the summary.

  Four new gates, each of which fails on the merged build: a **position
  rule** in `tools/height.js` (a card below half a screen's cards, or more
  than two phone screens down, is buried), a **class rule** (every class
  `ui/facility-card.js` paints has a rule in style.css), a **name rule**
  (`TAB_NAMES` is checked against index.html, and the roll-up must print
  those labels), and a **title rule**.

  *The lesson, written down: a gate that asks whether a thing EXISTS is not
  a gate about whether it can be FOUND.* Four of them in a row asked the
  first question and I read the greens as an answer to the second.
- **R129 — The last lab falls open.** Asked for directly: *"once you beat the
  last rival scientist, the chimeras from rival labs escape — a plethora of
  free-roaming chimeras of numerous combinations, some with unique traits.
  More battles with other chimeras and more chances to capture some."*

  **MEASURED FIRST, AND THE FIRST DRAFT OF THIS ENTRY WAS WRONG.** It called
  the Breakout a drip that needed opening up. Over five 180-day walks:

  | the draft said | measured |
  | --- | --- |
  | a drip; `maxLoose: 4` binds | **~190 escapees per walk**, ~190 breakout fights, and **0 left on the board** on every seed — the cap NEVER binds |
  | five labs, five silhouettes | **181 distinct bodies of 200** — `chooseParts` already mixes freely inside a lab |
  | — | the real ceiling is **species: 21 of 41**. Half the bestiary can never be loose |
  | no traits | **confirmed — 0 of 200**, against 12 in `data/traits.json` |

  **So the BATTLES half of the request is already shipped, in volume.** An
  escapee fight is ~190 of a campaign's fights, more than one a day, and the
  bodies are varied. What is missing is not quantity.

  **THE CAPTURE HALF IS THE HOLE, AND IT IS A DEEP ONE.** The same walks:
  **1,035 specimens bagged**, all **40 bays full**, **13 programmes ever
  started**, **1 rehabilitated**, and **0 programmes running** on day 180.
  The bays are a parking lot.

  The cause is not plumbing — it is that **a captured specimen is not worth a
  stall**. A Wing graduate carries its old lab's grades, so it is worse than
  what the Surgery Theater can build, and the walker's own R91/R92 policy
  refuses to enrol what it would only scrap. R91 measured that directly:
  **141 of 278 creatures were Wing graduates scrapped one table-cycle after
  walking out, median life ten hours.** Capture is a dead end by design, and
  no amount of extra escapees changes that.

  So the milestone is **the release, and a reason to want what it releases**:

  - **A phase change on the fifth lab.** `rivalsAllBeaten` is already computed
    in `campaign/campaign.js:111` and read by two banner sentences. Beating
    the last lab fails every containment in the county at once — its own wire
    line, its own board state, so it reads as an event rather than as the
    cooldown getting shorter.
  - **Anatomy the county has never seen.** After the release an escapee draws
    outside the five lab palettes, which is the only way past the **21 of 41**
    species ceiling — and the only way "numerous combinations" means anything
    when 181 of 200 bodies are already distinct.
  - **A trait you cannot roll, which is the whole point.** Law 2: every
    conquest reward must expand what you can CREATE. A loose apex carrying one
    of the 12 mutation traits is a body worth a stall, worth a bay, worth
    extracting — it feeds the Vault, the Theater and the Dex at once, and it
    is the first thing in the game that makes a bagged specimen better than a
    built one.

  *Done when: beating the fifth lab visibly releases the county's rival stock;
  a loose chimera can carry anatomy from outside every lab palette and a trait
  the player cannot otherwise roll; and a 180-day walk that finishes the
  ladder captures and KEEPS measurably more than the 1 it keeps today.*

  **SHIPPED.** Every clause measured on the built game:

  | clause | before | after |
  | --- | --- | --- |
  | the release is an event | nothing happens on the fifth defeat | fires once, six out at once, its own wire line and a standing Labs card |
  | anatomy past the palettes | the 5 palettes, **21 of 41 species**, and nothing else | **37 species across 540 minted specimens, 16 of them off every lab palette** — bear, falcon, goat, goose, gorilla, heron, jellyfish, moth, otter, porcupine, pufferfish, ram, skunk, tiger, tortoise, wolf |
  | a trait you cannot roll | 0 of 200 | **62.2% of 540**, against a declared 60% |
  | the walk KEEPS more | 1 rehabilitated in 180 days | **3** — and 5/4/4/3 on the other four seeds, every one improved |

  A county with four labs still standing is untouched: 4 escapees, 7 species,
  0 off-palette, 0 traits, R82's 22h cooldown and cap of 4 exactly as before.

  **The release does NOT draw variant anatomy, and that is R129's own bug
  caught by R129's own verification.** The first draft widened a socket to
  every part in the bestiary — including the six variant lines, which are 34
  of the 244 parts and which R95 built a whole milestone around having
  exactly ONE door: a mutation in your own Incubator. Measured with breeding
  disabled outright, the five seeds that finish the ladder reached **20 to 34
  variant parts anyway** while the two that do not reached 2 — so the release
  was handing over the county's rarest bloodlines to a player who never bred
  for one, and handing over the PARTS without the animal (`dex.variants`
  stayed 0 on every seed). It draws from the 35 non-variant species now, up
  from the 18 non-variant species the labs own. The three variants the labs
  themselves favour (iron tortoise, pale cobra, storm eagle) are reachable
  exactly as they were before, by R82's rules.

  The battery is what found it: break 162 — *"the buyer locks the breeder out
  again"* — went from caught to **MISSED**, because the release had become a
  second door to the parts that break exists to strand. With the fix it is
  decisive again: the median campaign drops from 237 parts to **220 (90.2%)**
  and 14 variant parts are reached by no seed at all.

  Two things the milestone found rather than built. The **Genes tab** had
  never been measured full — twelve genes could only be learned by breeding,
  so a walk that now collects them all put it 75 px and 19 words over R89's
  budget; it is folded, and its N identical "???" rows became one line that
  names the slots those genes ride in on, which is A6's combo defect
  surviving in the one tab A6 did not touch. And the **loose board's four
  nested arrays** had no stated bound — invisible for six milestones because
  a walk always ended with an empty board, and R91's rule found them the
  first walk that did not.

  *The lesson, written down: a battery gate that aims at a shard aims with
  the LANE letter, not the block name.* `SW_SHARD='team'` had been aiming the
  facility gate at nothing for a milestone, and it stayed red on R128's
  breaks anyway — because the unsharded assertions caught them. A gate that
  runs the wrong subject and still fails teaches you nothing.

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

  **SHIPPED — AND ONLY ONE OF THE THREE WAS MISSING FOR THE REASON GIVEN.**
  Both named defects were replayed first and **both passed green**, so the
  criterion was real; but the causes were not the ones the entry assumed.

  **The contrast rule was never missing.** R122 built a full WCAG composite
  walk, run across all five themes, and it was correct the whole time. What
  was missing was **reach**: `OPEN_EVERYTHING` captured a NodeList and clicked
  each button, but a fold's handler rerenders the screen, so every click after
  the first landed on a detached node — and R89's exclusive groups make "open
  everything" a contradiction on the Pens and the Ranch anyway. Five folds on
  the Pens, **two left open, neither the feral one**. `.feral-panel` was never
  drawn while the gate was looking, and its **3.42:1** passed every run for
  four milestones. *A rule with nothing to look at passes.*

  Three reach fixes: folds opened **one at a time and re-queried**; subtabs
  found by asking the DOM which `data-*-tab` bars exist rather than naming
  `data-dex-tab`, so the Pens' four join the Dex's five; and the **War Room
  walked at all** — the fixture ships a duel in progress and `#screen-battle`
  renders the arena whenever one exists, so the map, the jobs board, the Labs
  board, the bays and the wire had never been rendered by any gate.
  **29 → 67 views, 80 → 87 controls, 53.7s → 70.1s.**

  **The reduced-motion entry pointed at keyframes, and the keyframes were
  fine** — all eleven were already covered. The gap was **transitions**: three
  declared, only `.meter-fill` listed, so the arena's ground still washed
  colour on a crit and both sprite slots still faded in.

  **THREE LIVE DEFECTS, none of which any gate could previously see.** The new
  reach found `.dominion-card`'s note at **4.43:1** on its `--accent-dim`
  gradient — the line that admits the map has changed under you was the
  hardest one on the card to read. The reduced-motion pass found the two
  uncovered transitions. All three fixed.

  **AND THE GATE NOW ASSERTS ITS OWN REACH.** A count cannot catch a coverage
  collapse — "29 views" went *up* over four milestones while the panel it was
  supposed to measure went dark. A **list** can: five landmarks whose only
  proof of life is that something drew them. Reverting the fold walk turns the
  run red on the landmarks alone, with no rule broken.

  **The battery also caught my own gate from the session before.** R128b's
  position rule was `at * 2 > of`, a knife edge on the one screen whose card
  count moves on its own — the War Room draws a raid, contest or captive card
  only when the world has one, and the fixture is stamped with `Date.now()`.
  It measured **5 of 10** when written and **6 of 11** on the next run. It is
  **never last** now, which catches every appended card and cannot be flipped
  by an alert arriving above it.

  **And the boot budget held without moving**, which R128's note asked for.
  The battery caught this milestone 1 KB over at **1061 against 1060**, and
  the whole breach was CSS comments — `+1,399 bytes` for three declarations.
  They ship inside the render-blocking stylesheet; trimmed to proportion, the
  sheet lands at **+206 bytes** and the ceiling never moved.

  *Done when: both defects, replayed as battery breaks, are caught* — breaks
  180 and 181, plus 182 on the reach collapse, 183 on overlap, 184 on the
  transitions and 185 on a keyframe only the source half can see.

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
- **R101 — every player downloaded forty-four migrations to run none of
  them.** ✅ *Shipped.*

  **Two of this entry's own numbers were wrong, and one of its claims was
  wrong in an interesting way.** `save/save.js` was **1,094 lines and 47.3
  KB**, not 1,020 and 44 — it had grown since the audit wrote this down.
  And the claim that "twenty steps of the chain have never been replayed
  against a real save of their version" understated it in one direction and
  overstated it in another. Instrumenting the table and running the whole
  suite: **every one of the 44 migrations does run**, 679 times over. What
  none of them had ever seen was a real save. The inputs were either the
  six-key object hand-written in smoke.js —

      const v1Save = { saveVersion: 1, seed, createdAt, spliceCount,
                       genome, directorStats };

  — chained upward, or a save built from **today's** `newGameState()` with
  its version number written *backwards* to 24. The second is the worse
  instrument: it hands migration 25 a save that already contains fields
  invented at v40, so a migration that fails to CREATE a field passes anyway
  because the field was already there. Not "never replayed" — replayed
  against something that could not fail.

  **Git had every version, so the fixtures are not written, they are
  taken.** `tools/gen-saves.js` finds the commit where SAVE_VERSION was N —
  all 45 exist — checks that tree out, imports *its* `save/save.js`, and
  asks it for a new game. `v29.json` is a save the game itself wrote when 29
  was current. Each is then stocked through its own era's
  `ensureRanchSeeded`, so 44 of the 45 carry real animals of their period
  and a migration that walks a herd has a herd to walk. v1 predates the
  `ranch/` directory and is correctly bare.

  **The split.** The migration table moved to `save/migrations.js` whole —
  it turned out to reference nothing at module scope, which is what it
  should be: a migration reproduces the schema of its own era and must not
  read today's tuning. `migrate` is async and takes that import **only when
  the save is actually behind**, so the common load never fetches it. The
  slot picker, export file and new-run ceremony moved to `save/slots.js`;
  they were reached only from the already-lazy settings panel and were
  riding into the first paint because they shared a file with `loadSave`.

  *Done when: the eager graph carries under 15 KB of save.js, and `npm test`
  migrates a v1 save to current through every step with a fixture at each.*
  ✅ — the save system's share of the first paint went **47.3 KB → 10.5 KB**,
  and the whole first paint **1053 KB → 1016 KB** (the ceiling came down
  1055 → 1020 behind it). `npm test` now exists and runs `tools/saves.js`,
  which walks a real save of every version v1–v45 to current and requires
  each to land on exactly the shape a new game has — a new game IS the
  specification, with empty containers specifying nothing. Breaks 134–138
  hold five directions: a migration that stops creating its field, a fixture
  that stops being a save of its own version, a fixture hand-edited rather
  than generated, the table put back on a static import, and the lazy module
  fetched from a path that is not there.

  **And a gate that did not exist before this.** Every browser gate in the
  repo seeds a save at the CURRENT version, so none had ever taken the
  migration path — which now fetches a module over the network.
  `tools/stale.js` opens the game on a real v1, v20, v30 and v44 save in
  headless Chromium and reads the console. That last part is the point: when
  the import 404s, `loadSlot`'s catch starts a fresh game and saves it, so
  the ranch paints and storage reads v45 while the returning player's save
  has been quietly set aside. Only the console says otherwise. Proven both
  ways — green on the tree, four errors when the specifier is broken.

  **And one of the new gates was a false green.** The battery reported 138
  breaks, 138 caught, 0 missed — and exited 1: the count covered only the
  break phase, while the baseline pass on a pristine tree had failed.
  `gen-saves --check` rebuilds from git history and the battery copies the
  tree WITHOUT `.git`, so it failed in that copy whether the tree was broken
  or not, which is exactly why its own break read as caught. It now has two
  modes: regenerate-and-compare where history exists, and hashes recorded in
  `tools/saves/index.json` where it does not.

### 9.6 Sixth audit (R87) — queue R103–R117 · **R106 shipped**

Run after R87, against a game with five closed audits behind it and R88–R102
still queued. Same rule as the other five — every line names the measurement
that put it there — and a different set of instruments, chosen to see what
the harness cannot see by *playing*: what a **different player** would have
done in the same fight (six pilots over **5,304 fights at each of three
grades**); the **first two days at fifteen-minute resolution** across five
seeds; the browser's own account of what it draws (**58,313 DOM nodes** on
one screen); **72,171 text nodes** measured against their effective
background under all five themes; the code **no gate has ever run** (V8
coverage merged across the Node suite and a Chromium walk of every screen);
a week away; the wire's **4,034 lines**; and an import with a
`<b onmouseover>` in it. Three things came back clean and are worth saying
so: two 180-day walks on the same seed are **bit-for-bit identical**, the
day-180 save holds **no NaN, undefined or Infinity**, and the tone sweep
found **nothing to fix** (nine hits, all idiom — "Blood Sense", "Dead
Reckoning"). The headline is two sentences. **The build decides the fight
and the briefing announces it: the arena, where the player spends most of
their time, moves the outcome in about one fight in thirty.** And **a new
player's first session ends at minute 45, in front of a five-hour wall the
Path never mentions.** Fifteen phases follow, medium to large, three of them
overhauls, several in steps. Each carries its evidence and a *Done when* the
suite can check.

**Overhauls.**

- **R103 — Decisions that matter.** ✅ *Shipped.* Re-measured before
  anything was built, and it corrected this entry's own premise. Bucketed by
  the briefing's OWN verdict, the "82% invariance" below is an artifact of
  the fixture: **72–81% of the grid's pairings are called walkover or
  not-survivable before a move is pressed** — a day-one build against the
  Compliance Spire cannot be saved by any pilot and a walkover cannot be lost
  by one — and across the **live** bands (favoured/even/losing) the arena
  ALREADY rewarded play by **12.5pp** over pressing the first button and
  **38pp** over mashing. The depth was there; there was nothing to spend it
  on. And "Catch Breath is a nine-point trap" was wrong too: removing resting
  from a random pilot recovers only 2.6 of its ~10 points, and playing well
  while resting a quarter of the time costs 4.2 — most of the gap is bad
  MOVE choice.
  - **So the missing thing was something to play AGAINST.** The opposition
    chose inside `step`, after the player had committed and after a switch
    had already resolved, so bracing was a guess and tagging in a counter
    bought nothing because it simply re-aimed. The intent is now decided at
    the TOP of the turn, seeded, stored on the battle and shown above the
    command bar. **Brace** costs 25% stamina and takes 45% off the blow it
    was warned about — only against a real telegraph, only when the creature
    could have attacked instead, and never twice in a row. A **counter-class
    switch-in** lands a free hit, reading the same triangle every other hit
    reads.
  - **Measured like-for-like against the pre-R103 engine** (mixed-class
    teams, 8 seeds): a decision is worth **16.2 / 22.9 / 30.0pp** over the
    first button at standard / prime / apex (against a bar of 15) and
    **45.5 / 50.4 / 55.6pp** over mashing (bar 25); the forecast's own pilot
    — the floor this milestone was not allowed to lower — **rose** at every
    grade, 48→50%, 43→52%, 43→60%. Difficulty elsewhere is unmoved: the
    Spire finale's best mono-build reads 71/75/63% against a baseline of
    71/71/63, and A1's wall (one chimera against the second node) stays at
    **0%**.
  - **Those numbers were 19.1 / 23.6 / 29.1 until the pilot stopped keeping
    its own copy of the rules.** `ai.js` carried a second `STANCE_DEFAULTS`
    — the drift break 94 exists to catch, one file over from the gate — and
    a brace predicate that was a condition short: it scored mitigation for a
    creature with nothing left to swing, where the engine simply catches its
    breath. The phantom flattered the standard grade by 2.9pp. The obvious
    remedy (pricing a non-bracing rest at the stamina it buys) was tried and
    measured at **+0.3 / −0.1 / −0.5** — a wash — so it is not in the
    build, and the measurement sits beside the rule instead.
  - **Four things it had got wrong about itself, found reading the shipped
    code for the browser QA.** The Brace button promised "and get stamina back" from a brace that
    *spends* a quarter of it, and quoted a flat 45% where a Fierce
    creature's guard absorbs less; `stance.json` shipped a `lines` block
    that `renderer.js` indexed and nobody read, so the engine spoke literals
    that disagreed with it; its `_doc` claimed the opposition braces when it
    breathes too, which the code deliberately does not do and carries the
    measurement for; and the pilot kept the second stance table above. One
    fix for all of them: `bracePreview`, `braceTitle` and `stanceLine`
    exported from the engine, with `step`, the arena and the pilot all
    asking instead of re-deriving (R61). On a Fierce chimera the button now
    reads *"Take 36% off Baton Bonk — costs 15 stamina"* and the log reads
    *"guard absorbs 36% of the blow."*
  - **And three of R103's own gate rules could not fail.** Rule 0 compared
    `stanceTuning(content)` against `stance.json` — but that call spreads
    `content.stanceMeta` *over* the defaults, and `stanceMeta` **is** the
    shipped tuning, so it compared the file with itself; the same vacuous
    assertion had been copied into `smoke.js`. Rule 4 scanned the log for a
    sentence the engine never spoke (the unread `counter` line), matching
    nothing on either tree. Rule 5 counted braces and switches, but a pilot
    blind to the intent still switches and still rests when starving. All
    three now read the thing they claim to: the fallbacks, the counter
    hit's own line, and whether the pilot's answer *changes* when the same
    turn is asked twice with the telegraph swapped out. The battery closes
    at **98 breaks, 98 caught**, with all seventeen gates passing on the
    pristine tree — which it did not do on the first two attempts, and that
    baseline is the only reason anybody knew.
  - **Four things were wrong along the way, all found by measuring.** The
    pilot read `battle.intent` AFTER `step` had cleared it, so it was null on
    all **4,757** decision turns and both new reads were dead while the code
    around them looked right. The agency fixture fielded **three clones of
    one build**, so a counter-class switch could never once fire in the
    thing built to measure it. A **free** brace handed mitigation to
    *starving* pilots — where no decision is made — and pushed the finale to
    **88–92%**; pricing it in stamina fixed the regression outright. And the
    pilot did not subtract the stamina it spent, which made the priced brace
    score **worse than having no brace at all** (9.1pp against 14.1).
  - **One thing found and NOT caused here**, recorded rather than absorbed:
    the gene probe cannot resolve `venom_gland`. Re-salted on the
    **unchanged** engine it reads 1.81× the noise floor on one salt and
    0.50× on another, so the 1.5× bar was never robust for that gene. It is
    exempted by name with its evidence, guarded so the exemption stays at
    exactly one gene, and queued as **R118**.
  *Done when — re-derived, because the entry's own criterion is unreachable
  as written: the grid's 72–81% pre-decided pairings can carry no spread by
  construction, so "15 points" measured across all of it is arithmetic
  rather than a target. Measured across the LIVE bands, where a decision can
  change the outcome at all: the full-skill pilot beats "first button" by at
  least 15 points and mashing by at least 25 at every grade, and the
  forecast's own pilot does not fall.* ✅ **16.2/22.9/30.0pp, 45.5/50.4/55.6pp,
  and the forecast pilot up at all three.**

  *(The original entry, for the record.)* The same 68 builds against all 26
  encounters, a team of three, three seeds, under six pilots: the AI at full
  skill, the forecast's own pilot (0.8), a half-skilled one, "strongest
  affordable move", "first button", and uniform random over moves and Catch
  Breath. At standard grade they win **31.0 / 29.6 / 27.8 / 27.4 / 27.1 /
  18.4%**; at apex **54.9 / 53.6 / 51.1 / 50.8 / 50.6 / 34.6%**. Flying a
  fight well instead of pressing the first button is worth **2.5 points at
  standard and 4.3 at apex**. The outcome is **identical under all six
  pilots in 82% of fights** (77% prime, 72% apex), and the briefing already
  calls **83% of pairings** walkover or not-survivable before a move is
  pressed (78%, 74%). Each fight asks for **6.2 decisions** and about six of
  them do not matter. The one pilot that falls off a cliff is the one that
  rests a quarter of the time — **Catch Breath is a nine-point trap**, and
  it is offered on every turn as an equal. R88 removes the fights that never
  needed a pilot; this makes the remaining ones need one. Proposed, large,
  engine and arena, all in data: **enemy intent** — the AI's choice for next
  turn is shown (it is already seeded and previewable through `previewMove`),
  so a switch into the counter class, a priority move or a guard becomes an
  *answer* rather than a guess; **Guard** replacing Catch Breath as a stance
  that halves a telegraphed hit and refunds stamina, so the defensive button
  is a decision instead of a penalty; **switch-ins with tempo** — tagging
  into the class that counters the telegraphed move lands a free hit; and
  the agency probe becomes a `sim` table so the number is watched. *Done
  when: at every grade the full-skill pilot beats "first button" by at least
  15 points and random by at least 25, without the forecast pilot's win rate
  falling against any encounter — so the game gets harder to play badly, not
  harder.*
- **R104 — The shell repaints blind.** `main.js` rebuilds the active screen
  from a string on a **30-second interval and after every tap**, whether or
  not anything changed, and hidden screens keep their DOM. Measured in
  Chromium: on a fresh save the Dex tick costs **16 ms of script and 10 ms
  of layout for 3,106 nodes** every half minute while the player reads it;
  on the day-180 save the Vault tick is **300 ms** for **58,043 nodes**
  (the string alone is **2,841 KB, 66,047 words, 1,955 buttons and 3,909
  SVGs**, built in 217 ms; with its folds open the screen is **557,274 px
  tall — 714 phone screens**), and after the player *leaves* the Vault,
  **57,489 of those nodes stay in the document** behind `hidden` for the
  rest of the session, so every later theme change and style recalculation
  pays for a screen nobody is looking at. Every tick **destroys a text
  selection** (87 → 0 characters on the Ranch) and every card's DOM
  identity. R89 and R91 shrink the worst screen; this is about the loop that
  paints them. Proposed, medium-large: `tickWorld` returns a **change
  report** (what moved: funds, clocks, arrivals — R107 needs the same
  report), and the shell repaints only when the report is non-empty or the
  screen has declared a live countdown; **keyed cards** — `ui/cards.js`
  grows a `patchList(root, items, keyOf, render)` that replaces only the
  cards whose HTML changed, so a tap on one chimera re-renders one card;
  **screens empty on leave**, so a visited Vault costs nothing afterwards;
  and Dex portraits paint **lazily** below the fold (with the stub rendering
  all, so the gates keep measuring everything). *Done when: a tick on an
  unchanged day-180 save touches zero DOM nodes (a MutationObserver count in
  the a11y gate), a tap on one Pens card leaves every other card's node
  identity intact, leaving any screen leaves under 50 nodes behind, and the
  fresh Dex's first paint is under 100 KB.*
- **R105 — The county calendar.** The game runs entirely on real
  timestamps — CLAUDE.md's own rule — and nothing in it knows what time it
  is: **zero** hits for time of day, season or weather anywhere in the code
  or the data; the Ranch at 3 a.m. is the Ranch at 3 p.m.; five themes,
  every one static. R95's Travelling Menagerie needs a rotation to travel
  on and has nothing to hang it from. Proposed, medium-large, zero assets,
  nothing running in the background: `data/calendar.json` — a **procedural
  sky** in the header drawn from the local hour and the world seed (sun,
  moon, cloud cover as SVG, dusk tinting the header only, so the five themes
  stay themselves); **four 28-day seasons** from the save's `createdAt` whose
  effects are *husbandry, never power* — condition decay, incubation length,
  a breeding window in which variants are likelier, and which species the
  catalogue stocks (the hook R95 wants); **weather rolled per day** from the
  seed, one line on the wire, one small effect (rain slows the ring's
  refill, heat shortens patience in the Pens); and the calendar on the Ranch
  as one line — *"Late Splicetember. Goat season."* *Done when: the same
  save opened at two hours renders two skies and at the same hour the same
  sky; a season changes at least one husbandry number smoke reads; the
  catalogue's stock differs between two months of one save; and the walker's
  180 days cross all four seasons with no new stall.*

**Gameplay.**

- **R106 — The first hour points at a fight nobody can win.** ✅ *Shipped.*
  Re-measured before anything was built, and it corrected **three** claims in
  this entry's own text plus its acceptance criterion.
  - **The five-hour wall does not exist.** A juvenile goat and an adult goat
    both grade **Standard** at the starting condition of 60 — growth changes
    nothing until Prime at 14h, and the lever that pays at five hours is
    **care** (condition 86 buys the Apex ceiling). `extractAnimal` has no age
    guard, so the starters can be graduated at minute 0.
  - **The criterion was already true.** Graduate all three starters at minute
    0, splice three, and they are settled at **minute 23** — against a
    criterion of 90. That is the third audit criterion of mine to pass on the
    shipped game before the milestone began (after R84's and R87's).
  - **The 5.75-to-25-hour opening was the WALKER's, not the game's.**
    `walkAct` refuses to graduate a juvenile and refuses to drop below two
    animals, so the yardstick plays a different opening from the one the Path
    teaches and no measurement of the opening taken from it is evidence about
    a player. That divergence is **R92's**, and is left there.
  - **What was actually wrong is one row.** A1 measured the second node at 0%
    with one chimera and said why: combat is one active per side, so three
    enemy bodies is three health bars against your one. Re-measured through
    the shipped forecast: `downtown` fields **three**, and it is **0% with
    one settled chimera and 100% with three**. The **agenda** — the one place
    that claims to know what you can do right now — offered *"Take a node"*
    through all of it under the same reward line it uses at every other
    moment in the game. Measured across three seeds at half-hour resolution,
    the row is offered outnumbered on **days 0–9 and never afterwards**
    (1.4–2.3% of offers, worst 3.0:1).
  - **The row is not removed, it is made honest.** `battle/forecast.js`
    settles that out loud — a forecast is not a gate, and "a player who wants
    to throw one goat at a police cruiser is entitled to" — so the row stays
    and the hint reads *"Downtown Greenfield fields 3; you can field 1. One
    active per side, so that is 3 health bars against 1 — 2 more bodies
    first."* Bodies rather than a forecast: measured, the check costs
    **0.016 ms** against **4.3 ms** for `forecast()`, which is 267× the check
    and 72× the whole agenda, on something rebuilt every render and every
    step of the walk. The wave count is read through `enemyOf` (R79's
    catalogue) rather than `liveWaves`, because the latter lives in
    `battle/engine.js` and R81 put the engine behind the thing that needs it.
  - **The Path's sixth step resolves its own contradiction.** It sends the
    player to graduate two animals whose Ranch card simultaneously reads
    *"Apex once Biscuit is fully grown (14h) and at condition 86+."* Both are
    true and a new player cannot know which one this hour wants, so the step
    now names them, states what they grade at **today** through the same
    `gradeFor` the card prints, and says that three bodies is what the next
    node asks for — the ceiling is for the batch after.
  - **Two thirds of the proposal were deliberately not built**, both because
    the measurement removed their premise: the starter goats were **not**
    back-dated (growth is not the wall), and no Path step carries a
    **countdown** (the wait it was meant to explain is not a real one; the
    Ranch card already carries the animal's clock and its outlook). The
    **walker progress stall** is R92's, named above. Nothing here was cut for
    time.
  *Done when — re-derived, because the entry's own criterion passed on the
  shipped game before a line was written: on a fresh save with one settled
  chimera the agenda's assault row states the true wave count and the true
  fieldable team instead of its reward line, over ten days of walking it is
  never silent while outnumbered and never cries wall when it is not, and the
  Path's sixth step quotes the same grade the Ranch card would print for the
  same animal.* ✅ **All four, plus the R79 case: five new battery breaks,
  89 caught of 89.**
- **R107 — Welcome back.** A week away from day 25: **+$18,035** earned,
  **6 counter-offensives** came, **4 specimens** got loose, a job came home
  — and the wire, which keeps twelve lines, has **eight** new ones to show
  for it, one of which is the game's only digest (*"While nobody was home, 5
  convoys came, waited at the gate, and left stern letters"*) and the rest
  of which are petting-zoo results. Two weeks away from day 60: **+$71,331,
  12 contests, 4 loose, seven lines.** R64 proved a month away pays fairly;
  nothing tells the player what it paid. Proposed, medium: a **Welcome back**
  card at the top of whichever screen opens when the gap is over six hours,
  built from the tick's change report (R104) rather than from the wire —
  income earned and upkeep paid, contests held and lost, raids missed and
  what they took, breakouts, jobs returned (and the animal in the van), eggs
  hatched, injuries healed, creatures now pacing (with their countdown),
  chimeras settled — one line per category that moved, none for those that
  did not; dismissable; DOM-free so smoke can assert it against the diff.
  *Done when: for the R64 away fixture the digest names every category that
  changed and nothing that did not, and it never appears for a gap under an
  hour.*
- **R108 — Specimen cards, and the fights they carry.** §8 risk 1 says the
  renderer is the whole first impression, and there is **no way to take a
  creature out of the app**: the only download in the game is the save file,
  `navigator.share` is used nowhere, and the renderer already produces
  standalone SVG strings. Proposed, medium-large, zero backend: a
  **specimen card** — portrait, name, lineage, grades, moves, the lab's
  name — as one self-contained SVG with the genome and moveset embedded in
  `<metadata>` and a short **genome code** printed under the portrait;
  exported through the Web Share API (files) with the save exporter's Blob
  fallback; and **import a card** — paste the code or upload the SVG — which
  builds the creature through the same physiology the rivals use (rivals.js
  already assembles chimeras from parts) and offers it as a Gauntlet
  exhibition, *Visiting Specimen*, so two players can fight each other's
  creatures with no server anywhere. Imported genomes pass R114's
  validation; unknown part ids are refused with a sentence. The cards double
  as the store screenshots R100 still needs. *Done when: a card round-trips
  (export, import, identical genome and stat block), an imported specimen
  can be fought as an exhibition, and a card naming a part that does not
  exist is refused.*

**Content and voice.**

- **R109 — The voice repeats.** The wire pushed **4,034 lines in 180 days**
  — 22 a day — from **181 distinct phrasings**, each heard **22 times** on
  average. The top one, *"…came to nothing, which happens,"* ran **670
  times**; the five sparring blurbs covered **539 of 543 spars**. The
  authored reactive voice of the whole game is about **150 lines**: rivals
  have **one line per slot** (40 in all — every duel with the same rival
  opens with the same sentence), philosophies 45 (the `rehab` slot's five
  are never spoken), news 34 lines across 19 events, the Task Force five,
  Feral three, and the eleven deadpan ticker lines live **in `main.js`**, the
  one place CLAUDE.md says content may not. `pickFresh` already exists in
  `util/rng.js` and the wire does not use it. Proposed, medium, three steps:
  **(1)** every reactive line becomes a **pool** of at least three variants
  with optional conditions (`first`, `streak`, `rare`, `season` once R105
  lands) and the wire keeps a **no-repeat window** of the last twenty
  phrasings; **(2)** the ticker lines and spar blurbs move to data, the rival
  `midFight` slot grows to three, and the player's `rehab` slot is wired or
  cut; **(3)** a smoke gate over the walker's diet. *Done when: over 180
  days no phrasing exceeds 5% of the wire and the distinct-phrasing count is
  at least 400.*
- **R110 — Copy is data.** Counted with comments stripped: **5,310 words of
  player-facing prose live in JS string literals** against 20,393 in
  `data/*.json` — **21% of everything the game says is invisible to the data
  rule**, to the tone sweep (which can only read JSON with confidence), and
  to R98's terse mode, which has nowhere to switch it off. The heaviest
  files are `splice/theater.js` (436 words), `battle/ui.js` (363),
  `campaign/ui.js` (361), `render/renderer.js` (299) and `ranch/agenda.js`
  (274 words of hints). Proposed, medium: `data/copy.json` holding every
  string by id with the wire's `{name}` placeholders (its `fill` already
  exists), a `copy(id, vars)` reader, a **scopecheck rule** that a JS string
  literal of three or more words outside `data/` fails unless it is on a
  short developer allowlist, and the tone sweep promoted to a gate over one
  tree. *Done when: game modules carry under 300 prose words, the scopecheck
  rule holds, and the tone gate reads every player-facing word.*
- **R111 — Feel: creature voices, ambience and haptics.** `audio/sfx.js`
  holds **19 stingers** and **none of them depends on the creature** — a
  goat-headed tank and a moth-winged kite land the same `hit`; the Ranch,
  Pens, Vault, Theater and Dex are silent between taps; the only audio
  setting is mute; the whole game has **one gesture** (the arena's hold) and
  **zero** haptics. Proposed, medium-large, zero assets, the synth is
  already hand-rolled: `audio/voice.js` derives a **voice from the genome**
  — mass to pitch, head species to waveform family, organ to modulation,
  temperament to contour (Skittish rises, Bullish falls) — heard on a pen
  tap, a landed hit, a KO and a decant, seeded so the same creature always
  sounds the same; **ambient beds** per screen (filtered noise: barn wind
  and birds, lab hum, war-room static, vault refrigeration) under a separate
  toggle; a **volume slider** replacing mute-only; and **haptics** via
  `navigator.vibrate` on KO, capture and conquest, off by setting. R96 gives
  the creatures motion; this gives them a sound. *Done when: smoke asserts
  two genomes yield two voice specs and one genome always the same, and the
  settings panel carries volume, ambience and haptics controls.*

**UI.**

- **R112 — The dossier: a name on the door, and a yearbook.** The player's
  own dossier — name, lab, philosophy — lives on the War Room's Labs tab; no
  guide and no agenda row points at it (the one guide that says "dossier"
  means the rival's), and the walker's profile reads **`named: false` on day
  180**. Without a philosophy the player's half of every duel conversation
  is **silent** (`duelBarks` returns nothing) and the card reads
  *Unregistered Operator*. Meanwhile the save keeps **about twenty
  counters nobody can see**: `warRecord` 922–42, 1,853 chimeras made, 1,992
  animals raised, 21,745 tokens, 543 spars, 144 contests, 190 breakouts,
  1,189 jobs, 42 raids and **$445k levied**, `directorStats.partUse` with
  128 parts — no screen renders any of them, `runSummary` shows five fields,
  and `spliceCount` has **never been written** since M0. Proposed, medium,
  two steps: **(1)** the **naming ceremony** moves to the first decant —
  `showSpliceResult` offers *Name on the door* (rolled, as now) the moment
  the player becomes a villain, the philosophy picker follows the first
  conquest, both stay editable in the dossier; **(2)** **the Yearbook**, a
  Dex tab: fights by kind, chimeras made and graduated and dismantled,
  longest-serving chimera, most-used part, raids held and missed and what
  they cost, notoriety's peak, days played — every counter the save keeps,
  with `spliceCount` retired and `runSummary` reading the Yearbook so R102's
  relocation has something to show. *Done when: every non-clock counter in
  `newGameState` is either on the Yearbook or gone, and smoke walks a fresh
  save to a name without visiting the Labs tab.*
- **R113 — Vivarium and the fine print: the theme and type pass.** Of
  **1,143 text nodes** on the fresh screens, **665 (58%) are under 12 px**
  and 354 under 11 px: `.fine-print` at 11.5 px ×191, `.lineage` at 10.9 px
  ×67, buttons at 10.9. Contrast, measured against the effective background
  under every theme: Biohazard fails **136 of 72,171** nodes, Lab and
  Blueprint 87, Saturday 95 — and **Vivarium fails 7,353 (10.5%)**, almost
  all of it `.grade-badge` at 4.23:1 on every vial. Common to all five:
  `.fine-print` at **2.3–2.6:1**, `.lineage` at 2.3–2.6, the **SPLICE IT**
  button at 3.3–4.0, `.button` at 3.5–4.0, and 84 decorative `?` cards at
  2.6–2.8. At 150% text the Ranch and Pens spill **70 px** past the edge, at
  200% 216 px. `style.css` has **no safe-area insets, no `forced-colors`,
  no light scheme** — five themes, all dark, `color-scheme: dark` — and
  money prints as `$153249`. R99 is the gate; this is the pass it will
  guard. Proposed, medium: a **12 px type floor** (R98's copy budget absorbs
  the height); per-theme tokens for muted ink, badges and the big button so
  every theme clears AA; the `?` cards marked decorative; `viewport-fit=cover`
  with `env(safe-area-inset-*)` on header, footer and arena; the one
  overflowing span; one **`fmtMoney`** through `Intl.NumberFormat`; and a
  **light theme** (or one existing theme honouring
  `prefers-color-scheme: light`). *Done when: the contrast pass reports zero
  failures on all five themes on fresh and day-180 saves, no text node is
  under 12 px, 150% text overflows nothing, and the header clears a
  simulated 47 px cutout.*

**Durability and tooling.**

- **R114 — A save is untrusted input.** Verified this session: a save with a
  chimera named `<b onmouseover=alert(1)>Chompers</b>` and a goat named
  `Bessie <img src=x onerror=alert(2)>` **imports without complaint and both
  tags render raw** on the Pens and the Ranch. `importSave` checks JSON,
  object, app id, version and seed, then migrates; `renameCreature` strips
  the dangerous characters at the keyboard, and nothing strips them at the
  file. The renderer owns the game's one `esc()` (26 uses, plus seven in the
  arena); the other screens interpolate **263 `.name` fields unescaped**.
  Nothing checks a save's shape either: a `chimeras: "hello"` loads.
  Proposed, medium, three steps: **(1)** `ui/html.js` — an `html` tagged
  template that escapes every interpolation with an explicit `raw()`, the
  263 sites migrated mechanically, and a scopecheck rule against
  `innerHTML` templates outside it; **(2)** `save/schema.js` — types, bounds
  (R91's list), enums and id-exists-in-content through R79's catalogue,
  applied by `importSave` as refusal-with-a-reason and by `loadSlot` as
  **repair** (drop the unknown, clamp the absurd, never reset — the Ascent
  rule); **(3)** a **fuzz gate**: 200 mutated day-180 saves (type flips,
  huge numbers, injected strings) must each import or refuse and render
  every screen without a console error. *Done when: the injection save
  renders as text on every screen and the fuzz gate passes.*
- **R115 — Every shipped function has run under a gate.** V8 coverage
  merged across smoke, handlers, sim, roadmap, scopecheck and a Chromium
  walk of every screen on three saves: **538 of 9,733 code lines (5.5%)
  never ran, and 50 named functions were never called.** Among them the
  **graduation ceremony** — `runExtraction`, `playCeremony`, `showResults`,
  `close`: 66 of `extract-ui.js`'s 76 lines, the first ceremony a new player
  sees — `showVariantCeremony`, `showSpliceResult`, 47 lines of `main.js`
  (`renderBootFailure`, the future-save branch, the dialog's Tab trap),
  `ui/live.js`'s `say`, the audio context, and `sw.js`, which **no gate has
  ever loaded**. The handlers gate fires 1,485 handlers but hands every
  screen an `onExtract` stub, so the ceremony behind the Graduate button is
  the one thing it cannot reach. Alongside: **19 exports imported by
  nothing**, 67 used only by tools, `spliceCount` never written,
  `species.archetype` on 40 species read by no code, and the philosophy
  `rehab` slot authored five times and never spoken. Proposed, medium:
  `tools/coverage.js` (the merge is a hundred lines, zero dependencies)
  that runs the suite under `NODE_V8_COVERAGE`, takes precise coverage
  from the a11y walk itself, and **fails on a never-called function outside
  an allowlist that carries a reason**, on an export nothing imports, and
  on a JSON key nothing reads; first use pays the list down — the three
  ceremonies walked in the browser, a boot-failure fixture, a Node test of
  the worker's fetch handler against a stub cache, and the dead things
  removed. *Done when: `npm run coverage` passes with an allowlist under
  ten entries, each with a reason.*
- **R116 — The jobs board is a slot machine.** Over 180 days the walker
  launched **1,188 jobs — 6.6 a day, more than every fight it fought
  combined (964)** — every one of them **solo**: the four jobs that ask for
  a chimera's tags and class, the interesting half of the design, ran
  **zero** times. They succeeded 43% of the time and paid **$58,800, which
  is 6.7% of the $882k the county paid in income**; the petting zoo ran 720
  times at $23 a run. Those launches are **670 of the wire's lines**. Heat is
  the only brake and it brakes ambition, not taps. Proposed, medium: the
  solo jobs become **standing contracts** — one passive, auto-renewing
  arrangement at a time, settled at the tick like income, no launch — and
  the board keeps the **crewed** jobs, which become where a chimera earns
  while the ring cools; the walker learns to crew them (a policy per
  demand, closing another R92 blind spot); and job outcomes reach the wire
  as **one ledger line a day** (shared with R109). *Done when: on the
  walker's diet launches fall under one a day with job income within 20% of
  today's, crewed launches run at least one a day, and "came to nothing"
  leaves the ten most frequent phrasings.*
- **R117 — Wide screens.** The game is a **560 px column at every width**:
  `main { max-width: 560px }` and not one layout rule above 430 px, so on a
  1,920 px laptop it sits at x = 673 with 1,360 px of dark on either side —
  and GitHub Pages serves laptops. The one-line ticker is the only place the
  wire is read. Proposed, medium: at **900 px and up**, a second column
  docking the Right Now agenda and a readable wire beside the active
  screen; on the Pens and Ranch the open card beside the list; the arena's
  stage growing into the room; the tabs as a left rail at 1,200 px; and a
  1,280 px pass in the a11y gate so nothing regresses at 380. *Done when:
  at 1,280 px the agenda and the wire are visible without scrolling on every
  screen, the 380 px floor and gutter still hold, and the day-180 Pens
  needs no horizontal scroll at either width.*
- **R118 — The gene probe cannot see a damage-over-time gene.** Found while
  shipping R103, and it is not R103's doing: the trait probe in `smoke.js`
  scores a gene by how far it moves TURNS TAKEN and HP LEFT, and
  `venom_gland` is a slow trickle that changes neither aggregate much while
  changing *when* a creature falls. Measured on the **unchanged** engine by
  re-salting the probe, it reads **1.81× the noise floor on one salt and
  0.50× on another** — so the 1.5× bar it was supposed to clear was never
  robust for this gene, and the derivation written beside that bar ("the
  weakest reading measured … venom_gland, 1.81x") was taken on the two salts
  that happened to land well. After R103 reordered the battle's RNG stream it
  reads 0.56×, 0.89×, 0.90× and 1.18× across four salts. Every *other* gene
  reads 5.2–75× on every salt, before and after, so this is one gene and one
  blind spot rather than a bar that is too high. It is exempted by name in
  the suite, with a second assertion that the exemption stays at exactly one
  gene. Proposed, medium: give the probe a third measure that a DoT actually
  moves — total damage dealt to the player's team, or the turn the first
  creature falls — and retire the exemption. *Done when: `venom_gland` clears
  the same 1.5× bar as every other gene on at least four independent salts,
  and `UNRESOLVED_BY_THIS_PROBE` is empty.*

### 9.7 The opening, and the sitting (R119–R120) — asked for directly

Both phases were **measured before either was written**, and the measurement
moved one of them: the first premise held exactly, the second did not.

- **R119 — The first splice has no decision in it.** ✅ *Shipped.* Measured on a
  fresh save: the starter herd is `['goat', 'goat', 'bear']`, the two goats
  are newborn, and the bear is backdated to adult so that one door is open on
  day one (A4's fix). Graduate it and the vault holds **six parts from one
  species** — head, forelimbs, hindlimbs, tail, hide, organ, all `bear`, all
  Standard. So the distinct species available to splice from is **one**, and
  the **Surgery Theater — the system this whole game is named for — opens
  with exactly one creature you can build**. Every player's first chimera is
  the same pure bear, which is not a chimera at all: M0's own done-when is "a
  bear-headed, eagle-winged goat renders and persists," and nothing on day
  one can produce one. The Path's third step says "Splice a chimera" and the
  Theater teaches it with a passive field-guide card. Proposed, medium: a
  **Founding Stock** choice on first open — five starter labs, each a themed
  trio (one grown donor plus a breedable juvenile pair) and a small crate of
  sample parts from a *second* species, so the first splice is a real mix and
  a real decision. Same number of animals, same grades, same ages as today,
  so A1's wall and R106's arithmetic are untouched by construction: the
  choice changes *which* creature, never *how much*. Data-driven in
  `data/starters.json`; adding a sixth lab must never need an engine edit.
  *Done when: a fresh save cannot reach the Theater without choosing one of
  at least five founding labs; the first splice offers parts from two or more
  species under every one of them; two different choices produce measurably
  different first chimeras; and A1's wall — one chimera against the second
  node — still reads 0% under every lab.* ✅ **All four, and the wall reads
  0% under all five.**
  - **The five, and what they measure against the second node** (24 seeds
    each): the Bramble Barn (bear + goats + eagle limbs) **0% / 96%**, the
    Wetwing Annexe (heron + geese + mantis limbs) **0% / 96%**, the
    Nightshift Loft (bat + rams + tiger limbs) **0% / 92%**, the Slab
    (tortoise + porcupines + crocodile limbs) **0% / 100%**, the Kennel
    (wolf + frogs + rhino limbs) **0% / 100%**. A1's wall holds under every
    one and R106's promise — three bodies take it, which the Path prints —
    is true under every one.
  - **It took four passes, and guessing was wrong three times.** The first
    authored set read 96/29/4/100/63 with three bodies: under the Nightshift
    Loft a new player following the Path would have walked into a fight they
    win **4%** of the time, the exact failure R106 exists to remove.
    Diagnosing that as "the donor is too weak" was wrong — with the crate
    held constant every donor lands within **23–28 power**; it is the
    crate's parts that decide, spanning **19–37**. Rebalancing by hand then
    overshot the other way, a tiger crate taking one body to **46%** and
    breaking the wall from above. The last pass **searched** the space
    instead — every crate species against every lab, scored on both numbers
    — which is also how the owl was found unsalvageable as a donor (no crate
    in the roster brings it to the bar) and replaced by the bat.
  - **The crate holds no head, and that was a bug found by writing the
    gate.** A head is mandatory to splice, so the first crate let a
    brand-new player build a two-part creature out of the crate alone on
    their first open and burn the whole reason it exists. Measured: it was
    ALLOWED, and the day-one agenda offered "Splice a chimera" to invite it.
    The crate is the forelimbs and hindlimbs now, which preserves the
    sequence A4 measured and fixed (graduate, THEN splice) and improved both
    numbers: the wall went 0–4% → 0% everywhere and the worst three-body
    reading 88% → 92%. The agenda's splice row reads the vault for a **head**
    rather than for parts, because a row that names a screen where the button
    is greyed out is a row that lies.
  - **The first screen of the game had no accessible name.** The dialog
    controller was installed after the founding render, so the one dialog a
    player cannot escape out of was the one with no focus trap, no focus
    restore and no accessible name — `aria-label` measured null in a real
    browser at 380×640. Hoisted.
  - **Two budgets moved, both argued in the gates themselves**: the eager
    KB cap 590 → 595 (measured 594.1; the MODULE cap is unmoved at 52, which
    is what would catch a screen sneaking into boot) and the first-paint
    budget 1100 → 1106 KB (measured 1102 — this gate loads a *fresh* save,
    where the founding choice IS the first paint). Both were trimmed against
    first. The fourth consecutive raise makes **R121** overdue rather than
    optional.

- **R121 — What should the first paint carry?** ✅ *Shipped, and its own
  premise was the least interesting thing in it.*

  The entry blamed a trend: five milestones running had each raised the
  eager cap by a few KB with a good local argument. Measured, **every one of
  those arguments was true** — `feral`, `rush`, `taskforce`, `gauntlet` and
  the founding choice all genuinely run on the first frame. The cap was
  rising because the first paint really does more. The waste was somewhere
  nobody had looked: in modules added long ago and never re-read since.

  **The rule, and why it is a gate rather than a paragraph.** A number
  cannot settle this, because the next feature always has a reason. So:
  *a module is allowed in the eager graph only if booting runs it* — asked
  of a real browser under V8 precise coverage, across **both** first paints
  (an empty browser, where the founding choice is the whole screen, and a
  save with a herd in it). A module earns its place by running in either.
  Measuring only the fresh boot condemns the wrong things: `splice/
  extract.js` runs ten of its fourteen functions drawing a herd, and none at
  all for a player who has no animals yet.

  **What it found.** Seven of 48 eager modules executed *nothing*. Three
  were SCREEN renderers — the Vault, the Theater, and the extraction
  sequence they share — sitting in `main.js`'s own SCREENS table beside
  three that were already lazy. R74 deferred the War Room, the arena and the
  Dex on the principle that a tab you press is not the first paint; R120
  deferred the Pens for the same reason; both stopped short of these. Third
  time a gate has found a screen sitting eager, and no screen has ever had a
  reason to be.

  **Two exemption categories, both earned by looking at every module the
  gate named.** `ui/theme.js` exports constants `applyTheme` reads on the
  first frame, so it can never run a function. `battle/moves.js`,
  `campaign/director.js` and `campaign/monologue.js` are leaves reached from
  `resolveBattle` and the creature statblock, which are synchronous by
  contract so the headless harness flies the same code — deferring them
  buys 23 KB and costs that contract. Each entry names its reader, and the
  gate fails on an exemption that goes stale in either direction.

  **What this could not see, said plainly because it is the next step.**
  `save/save.js` is 46.9 KB of which the migrations object is **25.3 KB**
  (54%, 43 steps from v2 to v44) — bigger than all three screens together.
  The entry named it and this phase did not take it: the gate's granularity
  is the MODULE, and `save.js` does run at boot, so a large object of
  rarely-called functions inside it is invisible here. Making it lazy also
  makes `migrate()` async, which ripples through `loadSlot`, `loadSave`,
  `importSave` and `adoptSave` — all synchronous today, and all inside the
  one system CLAUDE.md guards hardest. A separate phase, not a footnote.

  *Done when: the eager graph is measurably smaller than R119 left it, and
  the rule for what belongs in boot is written down rather than argued case
  by case.* ✅ — R119 left it at **52 modules / 594.1 KB**; it now stands at
  **45 / 538.2**, with the first paint down from 1076 KB to **1050** and its
  budget from 1106 to 1055. The rule is `tools/boot.js`, not a comment.

- **R120 — The sitting, not the session.** ✅ *Shipped. All three of its
  original findings were wrong, every one in my own favour, and the
  measuring that caught them is the phase.*
  - **What holds.** Sampled on every tick of three real 90-day walks, the
    mid-game is not thin: **11 rows, 8 productive** on an average open after
    the first week, peaking at 15. The thinness is **local to day one** — a
    brand-new save offers **5 rows of which 3 are productive** (graduate ·
    care · run a job; the other two are ways to spend money), and d0–1
    averages **7.9 rows / 5.2 productive** against **11 / 8.1** by day 30.
    R119 did not move any of that: it changed *what* the vault holds, not
    how much there is to do.
  - **What was wrong: the Gauntlet.** The entry claimed it was "shipped
    content a 90-day campaign never surfaces at all". It is not. The walk
    breaks at the END of the iteration that sets `dominionAt`, and the
    sampler runs at the START of one — so the state after dominion was never
    read. Re-run without the early break, on the same seed: **dominion lands
    day 33.3, the Gauntlet row is offered the same day**, and the walker
    goes on to **fight all four exhibitions**. The finding was an artifact of
    `stopAtDominion`, not a fact about the game, and the clause built on it
    would have been vacuous — R106's lesson, paid again.
  - **What was wrong differently: `hatch`.** It really never fires, but not
    because a row is hidden. **The walker never lays a single egg** —
    `eggCount` reaches 0 across 1,081 sampled opens on two seeds — while the
    `breed` row is offered from hour six onward. So the entire M6 loop
    (pairing, incubation, inheritance, mutation, the variant ladder R6 built
    on top of it) is **never exercised by the yardstick**. R83's rule: a
    system the walker never uses is one the harness cannot see.
  - **And the harness cannot see a sitting at all.** `state.__walkLog` is
    written in exactly one place — the `fight` helper — so across 90 days it
    holds **502 entries and every one is a battle** (sparring 273, breakout
    89, defend 54, assault 31, raid 22, rescue 18, rival 11, gauntlet 4).
    Every non-combat thing the walker does — care, graduate, splice, train,
    buy, rush — is invisible. "How much is there to do when you open the
    game" cannot be answered from it, only "how many fights".
  - **And the third clause was wrong too, in the same direction.** "Day one
    offers 3 productive rows" counts HEADINGS. Counted in things a player can
    actually press, a fresh save's first open offers **18**: twelve care
    actions across three animals, one grown donor to graduate, three jobs
    that launch with no crew, and two catalog entries $300 can afford. Day
    one is not short of things to do — **the screen is short of saying so**.
    Which is the real finding: **12 of the 19 agenda rows are fixed
    sentences** that describe what a system IS rather than how much of it is
    waiting. R48 wrote the rule when it added the Sparring Ring's row — "a
    hint's whole value is a NUMBER; *3 charges in the ring* is a reason to
    go, *you can spar* is not" — and then only seven rows ever followed it.
  *Done when — re-derived, because all three of the original clauses were
  measuring my own mistakes: the walk records every action it takes rather
  than only its fights, so a sitting can be counted at all; the ranch loop is
  exercised end to end, so `breed` and `hatch` both appear in a 90-day walk
  and M6 stops being unmeasured; and every agenda row reads the save — no row
  is a fixed sentence — so opening the game shows the volume that is actually
  there rather than a list of headings.* ✅ **All three.**
  - **What shipped.** `state.__walkLog` records every verb through one
    `did()` helper — 22 of them, 49,214 actions over 90 days, against 502
    fights before. The walker breeds and hatches, so M6 runs end to end
    (breed 672, hatch 671) after never once laying an egg. And all nineteen
    agenda rows read the save: day one went from five headings to *"Pearl the
    Bear is grown — six parts"*, *"12 things to do for 3 animals"*, *"3 you
    can run right now, the best worth up to $460"*, with the spend chips
    carrying their number on their face because a `title` is invisible on the
    device this ships to.
  - **Two regressions of my own, both caught by gates.** Eggs cost nothing
    but time, so an uncapped walker bred the ranch from 13 animals to **41**,
    and the upkeep ate the cash that paid for rushes — R86's assertion went
    from 10 rushes to **0**. That is the "stable, not a warehouse" rule R25
    and R44 apply to chimeras, arriving late on the ranch side; capped one
    above the walker's own pre-R120 equilibrium. And the job row **lied**:
    counting lanes it told a day-one player they could run **seven** where
    **three** launch, because `laneFree` says yes to a solo job with nobody
    to send. `runnableOps` answers it once now, for both the row and its
    hint, deferring to the same `opOdds` the launch consults.
  - **And the eager cap came DOWN instead of up.** Twelve hints that read the
    save are ~5 KB, which would have been the *fifth* consecutive raise. A
    cap that moves whenever a feature wants it is not a cap — so the Pens
    screen was deferred on R74's own terms (it is a tab you press; the first
    paint is the Ranch, and R74 stopped one screen short of it). **52 modules
    / 594 KB → 48 / 560**, and both caps were lowered to sit just above the
    new measurement. The first paint is smaller than before this milestone
    started, which discharges most of R121 as a side effect.

### 9.17 Half the agenda did nothing (R137) — carried debt, asked for directly

- **R137 — A row that points at this screen opens the thing it names.** ✅
  *Shipped.*

  R131 filed this as "the agenda lists things that are also on the screen it
  is drawn on". Measured, it was worse than duplication. Of the ten rows a
  day-180 save offers, **five name `ranch` — the screen the agenda is on**:
  Graduate a donor, Breed a pair, Care for the herd, Order from the catalog,
  Expand the pens. `showScreen` on the screen you are already on repaints
  and does nothing else, so **half the panel was buttons that did nothing.**

  And R133 sharpened it three milestones ago by shutting the money card and
  the Breeding Pen: "Order from the catalog" went nowhere *and* the
  catalogue was behind a fold the player had not opened.

  Such a row now names a **fold** and opens it, shuts the animals' exclusive
  group by hand the way a real click would, scrolls the card into view and
  moves focus to its head. `opens` is read from the save like `hint` is,
  because which card answers "care for the herd" depends on which animal is
  asking — it resolves to `ranch-a2069`, `breeding-pen`, `ranch-a2088`,
  `slush-fund`, `slush-fund` on the walked save.

  The gate has two halves, and the second is R128b's lesson: the row must
  name a fold, **and it must be one this page actually paints**. A declared
  id nothing draws is the same dead button wearing an attribute.

  *Done when: no agenda row rendered on the Ranch is a button that navigates
  to the Ranch; every such row opens the card it names and brings it into
  view; and a gate fails if a row's destination is the screen it is drawn on
  without naming a fold that screen paints.*

  **The eager budget is the note worth carrying.** `KB_CAP` 557 → 560,
  measured 557.4 — the third raise in seven milestones (548 → 553 → 557 →
  560), and every one of them the Ranch gaining something. That is
  structural rather than sloppy: the Ranch is the first paint, so anything
  it needs on frame one is eager by definition, and the agenda is the
  biggest such thing. The number to watch is `FIRST_PAINT_KB`, which is what
  the player actually waits for; if that starts moving every milestone too,
  the answer is a smaller eager agenda rather than a bigger budget.

### 9.16 The last flat tab (R136) — carried debt, asked for directly

- **R136 — The Combos tab folds.** ✅ *Shipped.*

  R95 first wrote that folding this tab was owed. R129 folded the Genes tab
  beside it, R89 folded Foes above it, R131 paged the Vault — and the Combos
  tab kept being ratcheted around, most recently by R135. It was the **last
  tab in the game with no fold at all**.

  Measured on the day-180 save at 380px, band by band:

  | band | rows | px |
  | --- | ---: | ---: |
  | Both halves in hand | 12 | 811 |
  | Discovered | 13 | 1,165 |
  | Still rumoured | 2 | 83 |

  **2,403px and 529 words** of three flat lists, on a tab the player looks
  things up in rather than reads.

  | | before | after |
  | --- | ---: | ---: |
  | Combos, shut | 2,403px | **497px** |
  | words, shut | 529 | **78** |

  **All three arrive shut, including the actionable one**, and that is the
  part worth arguing. "Both halves in hand" is twelve combos you own the
  parts for, so the obvious move is to open it when it is non-empty — and it
  is non-empty for most of a campaign, which makes "opens when it can act"
  into *always open wearing a condition*. That is the exact rule R133 had to
  reverse on the Breeding Pen, and taking the same decision twice in two
  milestones is how it becomes a rule rather than a coincidence. Shut is not
  hidden: each summary carries the count and the verb.

  The open number is **2,606px** against the 2,403 it was flat, and that
  203px is the fold's own chrome — three heads and three summaries. Same
  price R89 paid on the Foes tab, paid only by a reader who deliberately
  opened all three.

  `classFold` takes `openByDefault` now, defaulting to the `false` every
  existing caller relied on, so the Combos bands state their answer in a
  named constant where it can be argued with rather than inheriting a
  literal — which is also what makes break 211 a one-token change.

  *Done when: the Combos tab is under 800px shut on the day-180 save at
  380px, each band's shut summary carries the count a player would open it
  for, and the height gate budgets the fold rather than forbidding it.*

### 9.15 The table nobody could find (R135) — reported from play

- **R135 — The dismantle gets its own clock, and the Pens names the
  machine.** ✅ *Shipped.*

  Two complaints in one sentence: *"I don't see upgrades for the surgery
  table and it takes too long."* Both true, and the first one located four
  deep.

  You **dismantle on the Pens**. The Surgery Theater is sold on its own
  screen, which R128 is right about. The roll-up that says where the other
  machines live (`facilityElsewhere`) renders **on the Ranch and nowhere
  else** — its own comment says so. And the fourth is the worst: that
  screen's tab reads **"Splice"**, so the words "surgery table" appear on no
  tab in the game. R128b checked that the card is not buried on the screen it
  is ON; nothing had ever asked about the screen where the constraint is
  FELT.

  | | un-upgraded | Tier II |
  | --- | ---: | ---: |
  | **dismantle** | **3h** | **30m** |
  | splice | 20h | 10h |

  One table, two prices. `theaterBusyFor` and `occupyTheater` take a `kind`;
  `dismantleHours` is a grant beside `tableHours`, so the ladder stays data.

  **Hours stopped being the unit.** Every message rounded to whole hours, so
  a Tier II clock reported "1h to go" whether it had 30 minutes left or two,
  and the upgrade just paid for looked like it had done nothing. `spanOf` is
  shared, because the refusal and the card selling the upgrade have to agree
  on what to call half an hour.

  ### Why not both fast, which is where this started

  The first decision taken was to speed up the whole table — 3h/30m for
  splices too. Measured over seven seeds it moved the bottleneck from the
  table to the shelves: `graduate` −19%, `buy` −17%, parts rendered at the
  door +14%, and part reach 95.5% → **93.9%**, under R95's floor. Enlarging
  the vault (+50%) and the stable (6/12 → 8/16) fixed reach and the Wing —
  and then the churn rule caught what was underneath: **460 creatures built
  to keep 12, median chimera life 2.0 days** against a floor of 5.

  **A correction, because the first diagnosis was wrong.** That collapse was
  blamed on the fast splice alone. Re-measured properly, a 30-minute splice
  on the *shipped* shelves leaves median life at **62.7 days**. It took the
  fast splice AND the enlarged storage together: a full vault and a full
  stable are what stop a player rebuilding, and both brakes had been removed
  in the same sitting before the accelerator was blamed. The storage raises
  were reverted; only the split shipped.

  What the split is worth: **74.8 days** of median chimera life, against
  **48.5** before it. A cheap undo lets a failure be cleared without the
  rebuild being cheap too — which is R91's shared-clock note kept for the
  operation it was written about, and dropped for the one it was not.

  *Done when: a dismantle takes 3 hours un-upgraded and 30 minutes at Tier
  II; the screen where you dismantle names the upgrade that speeds it up and
  can reach it; and the busy message can say a time under an hour.*

  **And it retired a battery break, which is the finding underneath.** The
  full run came back 206 of 207, and the miss was break 164 — R95's conveyor
  belt, which removes the walker's minimum-tenure guard. On main that patch
  produces 2.92 days of median chimera life and the gate catches it; on this
  tree it leaves 13.3 and the gate passes. Measured four ways, *nothing on
  the dismantle side can make a conveyor belt any more* — a free dismantle
  with the guard also gone is 87.2 days, longer still, because fewer
  creatures get made at all. Creating is the only throttle now, and a
  stronger one than the shared clock was. The rule's falsifier is a TWO-place
  change (a cheap splice AND room for the output), so it is not
  battery-reachable; the numbers live in `tools/vault.js` and `battery.js`.

  **Two budgets moved, both argued in place:** `KB_CAP` 553 → 557 and
  `FIRST_PAINT_KB` 1025 → 1030 — the pointer and the split clock are eager
  because the *Ranch* needs those modules, so the bytes are paid on a screen
  that shows neither. `dex:combos` 2350 → 2450, because a cheap undo puts
  parts back on the shelf while the pair that unlocks a combo is still worth
  assembling; folding that tab is still owed.

### 9.14 The Ranch's chrome, a second time (R133) — asked for directly

- **R133 — The Ranch's chrome earns its height (again).** ✅ *Shipped.*

  R131 brought the Ranch from 3,499px to 2,453 by giving it a page ceiling,
  and its own entry named what it could not reach: most of this screen was
  never the herd, so no page size could have got it to the 2.5 phone screens
  it was aiming at. R47 last looked at the chrome and it has grown since.

  *(R131 put the figure at 1,756px by subtracting the roster from the total,
  which quietly counts the gaps between animals as chrome. Measured properly
  — the distance from the top of the screen to the top of the first animal —
  it is **1,521px**. The gate measures it that way now, so the number cannot
  drift again.)*

  Re-measured on the clock-pinned day-180 save at 380px, which is the only
  honest baseline now that R130 pinned the page's `Date`:

  | px | words | card |
  | ---: | ---: | --- |
  | **795** | 158 | **Right Now** — open by default |
  | 257 | 32 | **Breeding Pen** — open by default |
  | 252 | 34 | Slush Fund — the only chrome card with no fold at all |
  | 83 | 18 | Facility (shut) |
  | 64 | 8 | Incubator |
  | 686 | 141 | the whole roster: 8 animal cards, 3 band heads, the pager |

  Total 2,368px. **The two biggest chrome cards are open on arrival**, and
  together they are 1,052px — 44% of the screen — before the player has
  touched anything. The Ranch has had a one-at-a-time rule for *animals*
  since R98; its chrome was deliberately exempted, and the exemption was
  about whether two cards MAY be open together, not about what a player
  should arrive to.

  **What the 795 is made of.** Seven rows at 67px, each a 19px label over a
  28px fine-print, plus three `spend` chips at 40px that already do the
  thing the rows do not. Every fine-print is the same two sentences: a live
  number and then a standing lesson.

  > "15 are grown — six parts each, 90 in all. *This is where chimeras come
  > from.*"
  > "45 pairings the vat will take. *Two go in, one genome out that neither
  > of them was.*"

  Two facts make the lesson indefensible rather than merely long. `agenda()`
  returns **only rows whose `ready` predicate is true**, so a lesson is only
  ever shown to a player already doing the thing it explains. And the lesson
  is *already taught* — `data/guides.json` carries 38 field-guide entries,
  and "Two adults make a third" is verbatim the breeding row's sentence.
  This is R37's rule ("the lesson is behind the wall it explains") against a
  duplication that has been on the screen ever since.

  The same reading found dead prose: the `graduate` row opens with a
  beginner branch, `if (!ripe.length) return 'A grown animal becomes six
  parts…'`, which its own `ready` predicate makes **unreachable**. Same
  class as R130's `_doc` and R10's dead monologue slots.

  *Done when: no agenda row repeats a lesson the field guide already
  teaches; every open row is one line carrying its live number; nothing
  above the roster is open on arrival except the agenda; and the Ranch is
  under 1,950px — 2.5 phone screens, the number R131 named and could not
  reach — with the height gate holding the chrome and the roster as separate
  budgets, so a leaner roster can never pay for a fatter agenda.*

  **SHIPPED.**

  | | before | after |
  | --- | ---: | ---: |
  | Ranch, shut | 2,368px | **1,831px** — 2.3 phone screens |
  | of that, chrome | 1,521px | **984px** |
  | words, shut | 391 | **287** |
  | the facility card sits | 1,199px down | **893px down** |

  **The bound on a row is the shortest row on the screen.** The first
  version of that rule compared a row against a `spend` chip and it was the
  wrong shape — a chip is a pill with a short number, a row is a label over
  a sentence, and holding them equal would have deleted the sentence R120
  built rather than shortening it. Every label is one line, so a row that
  does not wrap is exactly as tall as every other row that does not; a row
  that wraps is taller than all of them. Nothing is typed (R61), and the
  gate names the offending sentence when it fails.

  **What the chrome budget cannot prove, said out loud.** Breaks 204 and 205
  grow the chrome and the rule fires — but the total fires with it, so
  neither break shows the chrome number doing anything the total was not.
  The case it exists for is a TRADE: a milestone that shortens the roster
  and spends the saving on a taller agenda, where the total never moves.
  That is a two-place change and a break is one anchor, so it is not
  reachable from the battery. It is still worth having — R131 shipped
  against a total that hid exactly this — and `tools/height.js` says so
  where somebody might otherwise read two green breaks as more than they are.

  **Two rules were reversed on purpose, and both were mine to reverse.**
  R47 had the Breeding Pen open itself the moment a pairing existed; on any
  save past the opening a pairing always exists — the day-180 walk offers
  thirty-six — so the condition was decoration and the card was 257px on
  every visit. And `assault`'s stood-down line was a fixed sentence for most
  of a campaign, which is precisely what R120's own rule forbids: *"what it
  must not be is the same sentence whether one thing or twenty are
  waiting."* It counts the open nodes now.

  R98's rule is NOT reversed: the chrome stays out of the animals'
  exclusive group, because a player comparing an animal against what the
  agenda is asking for still wants both open. What changed is the default.

  **Known issue, carried.** The agenda still lists things that are also on
  the screen it is drawn on — "Expand the pens · $2350" is a chip in Right
  Now and a button inside the money card. The obvious fix is for the chip to
  open the card it names, which turns the agenda into an index; it is not
  what the criterion asked for and it is the next thing worth doing here.

### 9.13 The generator was a trap (R127) — found while doing something else

- **R127 — The data is what the generator produces, and now it has to stay
  that way.** ✅ *Shipped.*

  **A correction first.** R126 reported that running `tools/gen-parts.js`
  "drops every R6 variant and all eight salvage parts — 42 parts of shipped
  content". **That was wrong.** Measured properly: regeneration produces all
  **244 parts**, drops none and invents none. The generator's own log line —
  "236 parts across 40 species (+8 salvage)" — counts variants separately
  and I read it as a shortfall without checking. The real damage was
  different and quieter.

  **What regenerating actually reverted: forty parts.** Thirty-five tails
  whose abilities had been named per species rather than per family (a
  crocodile does a **Log Roll**, not a "Tail Drive"), three hides that
  answer to their animal instead of their kind (**Roll Up**, **Quill
  Coat**, **Shell Fortress**), one heron balance tune (54 power against the
  generic 58), and the goat's **Iron Gut** passive — which was not reverted
  so much as *deleted*, because the emitted part object had no `passive`
  key at all. All of it now lives in a `HAND_TUNED` table, extracted from
  the shipped data rather than retyped, applied last because that is what
  hand-tuned means: a human looked at the generated answer and disagreed.

  **And sixty-five parts carried float noise.** Coordinates like
  `5.800000000000001` — what `2 + 16 * 0.55` is in binary. Nothing renders
  differently for it, but it is why R126's hand-edited claw geometry and the
  shape library silently disagreed about **thirteen parts**: one wrote two
  decimal places, the other fifteen, and no gate could tell that apart from
  a real change. Geometry is now rounded to 2dp at serialization — a
  hundredth of a pixel on a creature drawn 200 wide.

  *Done when: the generator can be run without changing the game, and
  something checks that it stays true.* ✅ — `node tools/gen-parts.js
  --check` computes the same output and COMPARES it instead of writing,
  so the question can finally be asked without destroying the evidence.
  Verified three ways: the regenerated data is **semantically identical** to
  what shipped (0 parts differ; geometry moves on 2 parts by 0.005px, a
  rounding tie), running the generator twice is a **fixed point**, and
  `--check` goes red both on a one-word hand edit and on the pre-milestone
  data. Breaks 132 and 133 hold both directions of it: tuning the data
  without the generator, and dropping the generator's entry.

### 9.12 The claws were on backwards (R126) — reported from a phone

- **R126 — Claws point where the creature is going.** ✅ *Shipped.* Reported
  with a screenshot of the Splice Theater: "claws are on backwards". They
  were, on **twenty limbs**, and not one of them had a single forward claw.

  Every part is drawn in a local space where the head faces **+x** (see
  `frames.json` `_doc`). The `paw` archetype built its claws as
  near-equilateral triangles — no vertex sharp enough to read as a tip
  except the one hanging **down and backward** — and marched them
  *backwards* across the toe pad (x = 15, 6, −3), so the last claw dangled
  off the heel. Rebuilt as narrow spikes based at the front of the pad with
  the apex furthest forward.

  Two more archetypes were **back-heavy** rather than reversed, which reads
  the same way: `talon` had one toe forward and two trailing, and `stilt`
  one and one. A raptor is three toes forward and one hallux; a wader the
  same. Both now carry two forward toes (each with its own claw tip) and a
  single hallux behind.

  **The generator is eight parts behind the game, and running it is
  destructive.** `tools/gen-parts.js` emits 236 parts across 40 species; the
  game ships **244 across 41**. Regenerating drops every R6 variant
  (`abyssal_shark`, `alpine_ram`, `glider_skunk`, `iron_tortoise`,
  `pale_cobra`, `storm_eagle`) and all eight salvage parts — 42 parts of
  shipped content. `data/parts.json` warns about exactly this trap in its
  own `_doc`. So `tools/shapes.js` was fixed for the future and the shipped
  geometry was rewritten surgically in place, matching each old claw by its
  exact vertex signature: **26 parts touched, 6 shapes added, no other field
  changed.** Closing that drift is its own phase and is not this one.

  *Done when: no clawed foot in the shipped geometry is back-heavy, and the
  rule is checked rather than eyeballed.* ✅ — the `CLAWS` gate states it as
  a property of the SHAPE rather than of a coordinate anybody typed: a claw
  is a triangle, its apex is the vertex opposite its shortest edge, and that
  apex must sit forward of the base it grows from. One backward claw per
  foot is allowed, because the hallux is real anatomy. Measured on the
  shipped data: **20 limbs failed before the fix and 0 after**; the gate now
  reads 69 claws across 31 clawed limbs.

### 9.11 What is this one worth? (R125) — asked for directly

- **R125 — Every chimera carries a letter.** ✅ *Shipped.* Asked for as
  "grade my chimeras F to S, from part grades, moves chosen, traits and part
  combinations, so I know what to keep, dismantle or feed to the vat."

  **The letter had to mean something.** This game already holds three
  opinions about a creature — the class triangle, the briefing's forecast,
  and R123's team suggestion — and a fourth that disagreed with them would
  only teach the player which to distrust. So the tier is not a weighted
  guess: it is a **prediction of one measured number**, the creature's solo
  win rate across every encounter the game ships. The reference is fixed, so
  the scale is absolute and nothing you build later re-grades a creature you
  never touched. A letter is a band of that rate — "B" means "clears about a
  quarter of the board alone".

  **Three of the four named inputs did not behave as the request assumed,
  and measuring said so** (solo, whole 26-encounter table):
  - **Traits are the biggest lever in the game**, and the request listed
    them third. At apex, applied to every part: `thick_hide` **+12.2pp**,
    `dense_bones` +8.2, `deep_lungs` +7.3 — and `hyperthyroid` **−21.8pp**,
    a creature that wins *nothing*, because stamina −10 six times over
    leaves it unable to act. All twelve at once is **+40.2pp**.
  - **Part grades** are second: standard → prismatic moves the rate 4% →
    27%, a **23pp** swing, and `gradeMult` is the strongest single term.
  - **A combo is worth +5.9pp** — mixed-with-combo 23.1% against
    mixed-without 17.2%, holding species-mixing constant.
  - **The moveset is very nearly inert: 1.0pp at standard, 2.6pp at apex**
    between the best and worst picks. The reason is arithmetic rather than
    design — the move pool averages **6.0** and you choose 4. It is
    therefore *not* a term in the score; folding a 2pp effect into a letter
    spanning 35pp would dress noise up as a judgement. It is reported as a
    priced lever instead.

  **Two measurement errors of my own, both caught before they shipped.**
  The first calibration said combos *hurt* (−0.266): false — `sampleBuilds`
  builds purebred creatures combo-less by construction, so the two were
  perfectly confounded, and re-measuring on random legal builds reversed the
  sign. The same run said the moveset had exactly 0.000 correlation: an
  artifact, because `makeSimChimera` gives every creature the same bench
  moveset, so there was no within-build variance to correlate. It also sets
  no traits at all, so the entire first pass ran blind to the biggest lever.

  **The model** is fitted over **420 creatures × 87,360 fights** and
  explains **R² = 0.786**. The bands were then cut for zero middle-50%
  overlap — and *that did not generalise*: on a **held-out** draw of 300
  (a different seed from the fit) three of the five seams overlap again,
  which is what overfitting a threshold looks like. What survived is
  monotonicity, so that is what the gate asks for.

  *Done when: on a population the model was not fitted to, mean measured win
  rate rises strictly with the letter across all six bands, every band is
  populated, and each step is worth at least 3pp; and the Theater shows the
  grade before the splice is committed.* ✅ — held out at 300 creatures:
  **F 5.1% · D 10.2% · C 15.1% · B 23.4% · A 35.1% · S 45.4%**, smallest
  step **4.9pp**. `tools/tierbench.js` is the gate; the scale, the cuts and
  the weights are all `data/tiers.json`, so a band moves without an engine
  edit. `SAVE_VERSION` 44 → 45.

### 9.10 Who should I send? (R123) — asked for directly

- **R123 — The briefing knows the answer and never said it.** ✅ *Shipped.*
  The War Room has run a 32-battle forecast on whatever team you tick since
  A1, but it has never told you which team to tick. Measured on a
  class-mixed roster of nine — 84 legal teams, against a truth forecast at
  24 runs — the pick **changes the outcome in 13 of 14 encounters**, mean
  spread **76 points**, and taking the roster in the order it happens to be
  in lands **17–23pp off the best team**.

  **Three wrong answers, each measured rather than reasoned away.**
  - *Rank by each creature's solo forecast.* Ranks nobody: one creature
    against a multi-wave encounter is 0% for the structural reason
    `forecast.js` documents ("Bodies, not numbers"), so every score ties and
    a stable sort hands back the roster unchanged.
  - *Rank by raw strength.* With no forecasting at all, **17.3pp** off —
    indistinguishable from not choosing; picking by the **class triangle**
    lands **8.7pp** off. Those are the zero-forecast figures, and quoting
    only them overstates the triangle in the SHIPPED configuration: with the
    twelve forecasts this actually spends, triangle-on is **2.2pp** (worst
    roster 3.3) against triangle-off's **5.2pp** (worst 6.4). Still
    load-bearing — better than twice as close — but the forecasting stage
    does more of the work than the headline comparison suggests, and the
    battery is what forced the distinction: break 118 disabled only half the
    triangle term and was MISSED, because half-off lands between the two and
    inside the bars.
  - *Reward class COVERAGE over total edge* — the hypothesis that answering
    more of the enemy's classes beats stacking one counter. Measured over 4
    rosters × 14 encounters it is **worse**: 3.1pp against 2.0pp. Recorded
    because a negative result nobody wrote down gets re-proposed.

  So: score every legal team by the triangle, forecast the best twelve, take
  the winner. **Twelve is measured too** — eight held at 3.0 and 1.8pp on the
  two rosters it was tuned against and was **9.5pp** off on a third; twelve
  takes the worst roster to 4.2pp, and sixteen and twenty-four buy nothing
  more, because past that the limit is the shortlist's ordering rather than
  its length.

  **The gate caught its own first draft.** Written against one roster and
  five encounters, it cleared a 5pp bar on an algorithm that was 9.5pp off on
  the next roster tried by hand — and its 6-run truth was so noisy that ties
  were everywhere and a suggestion scored 0.0pp whatever it picked. It runs
  three rosters against a 24-run truth over twelve encounters now, with a
  worst-roster bar as well as a mean.

  The suggestion says **why** — which creature brings which class against
  what — because a pick whose reason you cannot see teaches nothing, and it
  names only the classes the team actually beats rather than every class the
  opposition fields, which would be the briefing overselling a pick (A1).

  The bars sit where the algorithm measures, with headroom, rather than at
  round numbers chosen before measuring: 4pp mean and 5pp worst, against a
  shipped 2.2 and 3.3, which separates triangle-on from triangle-off clearly
  instead of by two tenths of a point.

  *Done when: the suggestion lands within 4pp of the brute-force best across
  three rosters, no worse than 5pp on any one of them, beats the roster's own
  order by at least 8pp, spends no more than 12 forecasts, and never fields a
  creature that cannot fight.* ✅

### 9.9 The battle screen charges full price for free fights (R88)

- **R88 — Send them, instead of watching them.** ✅ *Shipped.* Measured on
  three 180-day walks before a line was written: **1,013 fights and ~177
  minutes of beat replay per campaign**, sparring alone being 543 fights at a
  **100% win rate**. The entry's own "8.7 turns, 9 decisions, ~25 beats" was
  measured on tier-1 pairings; the real diet averages **17.4 beats**, from
  9.5 for a breakout hunt to 37.4 for a Gauntlet stage.

  **Both halves of the proposed trigger were wrong.** "forecast ≥ 95%" is a
  number invented at a desk — the game already ships the vocabulary
  (`walkover`, floor 0.90, the verdict the briefing has printed since A1),
  and R61's rule is that the canonical predicate wins. Sampled on the walk's
  real fights, **451 walkover forecasts produced 449 wins**. And "the fight
  is a spar, a hunt or a known rescue" forfeits saving for no safety: a
  walkover **defence** won 38/39 and a walkover **assault** 12/12, exactly as
  certain as a spar. Gating on kind would have discarded ~4,600 beats a
  campaign to protect against nothing. So the band decides; the one kind that
  always plays is the rival duel, which is the criterion's second clause
  rather than a safety rule (only 7% of duels forecast as walkovers anyway).

  **Two pilots became one, and that is the load-bearing part.** The
  player-side flier existed twice, byte for byte: `tools/sim.js` flew the
  balance yardstick, `battle/forecast.js` flew the thing whose win rate the
  briefing prints. Same skill, same chooser, different rng stream label —
  R61's orphan. It matters here more than duplication usually does: the
  briefing's claim *"this is a walkover"* is only sound if the pilot the
  forecast modelled is the pilot that flies the fight when the player presses
  Send. `battle/autoplay.js` is the only copy now, and the stream label stays
  a parameter because unifying it would move every balance number in the
  suite. **Proved behaviour-identical**: three 180-day walks, all eight fight
  tallies unchanged to the unit. The beat table moved there for the same
  reason — the arena plays beats and the harness prices them.

  **What the player gets.** *Send them without me* under Launch, deliberately
  quieter than it; the same seeded fight flown by the same autopilot through
  the same `beginFight`; and a report card that reads its lesson off the
  beats the fight actually produced — improvised orders, the class triangle,
  tag-chart hits, resisted anatomy — so a skipped fight still teaches. Plus a
  **battle-speed setting** (Normal · Quick · Instant, `SAVE_VERSION` 43 → 44
  with a migration that defaults to the speed every existing save was already
  playing at). Reduced motion still wins outright: an accessibility
  preference is not something a settings row may override.

  *Done when: the beats the walker's day replays drop by 60% at identical
  outcomes, and a rival duel still plays beat by beat by default.* ✅ —
  measured through the shipped path at **74.4%** (120 days × 2 seeds, 1,407
  fights, 26,816 beats, 267.6 minutes), and `canSend` refuses a duel.

### 9.8 The screen you cannot read (R122) — reported from a phone

- **R124 — Three things a phone could see and no gate could.** ✅ *Shipped.*
  Reported with three screenshots. All three turned out to be measurement
  failures rather than coding ones: the game was rendering exactly what the
  stylesheet and the sentence said, and every gate agreed, because each gate
  was looking at one width and one fixture.

  - **The briefing's roster had a ragged left edge.** R73's global
    `button { justify-content: center }` exists so a shrink-wrapped label
    sits in the middle of its 40px target; `.toggle-row` fills its line, so
    centring slid its content by half of whatever slack that row's own text
    left. Measured: three rows started their tick **82px** in and a fourth,
    whose label wrapped, at **12px**. Third leak of this one rule — R122
    fixed the same centring on `.lab-pick`.
  - **Ranch cards ended in different places.** Under `max-width: 420px` the
    card becomes a flex COLUMN, where `align-items: flex-start` stops
    meaning "top-align the portrait" and starts meaning "shrink-wrap every
    child". The widest child is the Extract button, whose label carries the
    animal's name, so identical cards ended about **70px** apart, read off
    a 411px-wide phone. Invisible at
    380px, where the text already exceeds the line and `fit-content` clamps
    to full width — which is why nothing had ever seen it. **A band
    measured only at its narrow end is a band measured once.**
  - **"Prime once Meatball is ."** `needsAge` and `needsCondition` each
    mean *strictly necessary*, so when either lever alone reaches the
    ceiling neither one is, and the clause listing what is needed had
    nothing to put in it. Five smoke assertions covered this sentence and
    all five missed it, because each picks a fixture and reads what it
    says while the hole is a **combination** of stage, condition and genes.

  On its first honest run the new gate found **two more instances** nobody
  had reported: `.toggle-row` again in Settings, and `.pick-row` — the
  picker sheet, the game's only chooser — whose four option rows held main
  blocks **83, 94, 123 and 81px** wide inside identical boxes. Both fixed
  by the same two lines.

  Three new gates, each proven red before the fix: the a11y walk now asks
  where a full-width row's content actually starts (**+71px** unfixed,
  0 fixed) and re-reads every box at **420px**, the top of the phone band,
  as well as 380 — 29 views, up from 23. The new `OUTLOOK` gate sweeps
  **10,605** sentences across every stage, condition and gene level;
  **150** of them read as a word followed by a lone stop before the fix,
  none after.

  *Done when: each of the three is red in the battery before its fix and
  green after, with no false positive across every view at both ends of the
  phone band.* ✅ — breaks 122, 123 and 124.

- **R122b — The fix shipped and the phone did not get it.** ✅ *Shipped.*
  R122 merged, GitHub Pages deployed it successfully at 04:41Z, and the
  reporter's phone still showed the broken screen. The cause was not the
  fix: **`sw.js` calls itself "network-first with cache fallback", but a
  plain `fetch(request)` READS THROUGH THE BROWSER'S HTTP CACHE**, and Pages
  serves the shell with `Cache-Control: max-age=600`. So it returned the
  previous build believing it had gone to the network — and then wrote that
  stale copy into the freshly-named cache, where it outlived the ten
  minutes. A phone could sit on an old build indefinitely. Bumping `CACHE`,
  which every milestone here has dutifully done, does not help: the install
  that fills the new cache fetches through the same stale HTTP cache.

  `fetch(event.request, { cache: 'no-cache' })` forces a conditional request
  instead — a changed file returns 200 with new bytes, an unchanged one 304
  with almost none — and the offline fallback is untouched.

  **Why no gate could see it.** Every browser gate in the suite calls
  `Network.setBypassServiceWorker` on purpose, because a run that measured
  the *previous* build's CSS would be worse than no run at all. The
  consequence is that the one code path deciding whether a build reaches a
  player had never been executed by anything. `tools/boot.js` now runs it:
  a server sending exactly what Pages sends, a fresh profile so the worker
  installs from scratch, the app opened twice so it takes control, the
  stylesheet then changed *in the response* (the working tree is never
  touched), and the app reopened. The marker is a custom property on
  `:root`, so the check does not depend on which screen is up.

  **Two mistakes this cost, both caught by measuring.** `Page.navigate` to
  an identical URL is not a reload and re-requests nothing, so the first
  version of the probe reported the fixed worker as broken too — leaving the
  page and coming back is the honest simulation of reopening the app. And
  the first marker declared its property on `#__deploy__`, an element that
  does not exist, so the gate failed against a worker that was working.
  *Done when: a build whose bytes changed reaches a browser that already has
  the app cached, gated, and the battery proves the gate load-bearing.* ✅ —
  **break 112 caught**, `boot` red on the reverted fetch.


- **R122 — The founding picker was invisible.** ✅ *Shipped.* Reported with a
  photograph of a phone, and the cause was **three separate bugs stacked on
  one screen**, none of which any existing gate could see.

  - **The card was never a card.** R119's markup said
    `<div class="panel founding">`. `panel` is not a class in `style.css` — it
    is the name of a *colour token* (`--panel`), and the token's name went
    where the class goes. Every other overlay card in the game says `card`,
    which is where the background, border, radius and padding live. Without
    it the founding panel was `rgba(0, 0, 0, 0)`, so the Ranch behind it read
    straight through the words. That is what "impossible to read" was.
  - **`--ink` is the page, not the text.** The palette comment says so in as
    many words: *"Surfaces run ink (page) -> panel (card) -> panel-2 (raised)
    -> well (sunken)"*. Three rules used it as a text colour, painting
    near-black on near-black at **1.1:1**: `.lab-name` and `.lab-row b` (every
    species name on the founding screen — Bear, Goat, Eagle Wings, Marsh
    Heron, Tiger Arms, all of them), and `.intent strong`, which is **R103's
    enemy-intent banner in the battle arena** — the same bug, already shipped,
    on a screen nobody had complained about yet.
  - **A locked dialog was showing a game the player does not own.** `.overlay`
    is deliberately translucent — a graduation ceremony over your own ranch is
    the point — but the founding screen is the one dialog with *nothing*
    behind it, which is exactly what R119's `data-locked` already marks. It
    now takes an opaque ground, and the card caps at `88vh` with the list
    scrolling inside it, because a `position: fixed` overlay does not scroll
    and a card taller than the phone does not go below the fold, it goes away.

  **Why nothing caught it.** The CSS gate asserts that every `var()` names a
  property that **exists** — and `--ink` does exist. The a11y gate measures
  40px targets, 6px gutters, focus, semantics and a keyboard walk — none of
  which a colour can fail. And every one of those measurements runs against a
  fixture **save**, while the founding picker is the one view that exists only
  when there *isn't* one: it was the single screen in the game no gate had
  ever looked at.

  **The gate.** `tools/a11y.js` now asks the browser the only question that
  settles it — what colour is this text, and what colour is actually behind
  it — compositing every translucent ancestor down to the page the way the
  screen does, and holding the result to WCAG's own thresholds (4.5:1, or 3:1
  once type is large). A card with no background contributes nothing to that
  stack, so **both** bugs fall out of one measurement. Gradients are read
  rather than skipped: each colour stop is a candidate ground and the **worst**
  one is the answer, because text legible on four stops of five is text you
  cannot read a fifth of. Only a background with no colours in it at all (a
  `url()`) is declared unmeasured, and the run prints every one of those by
  name — an exemption nobody can see is an exemption that grows. Today there
  are none. The walk also clears `localStorage` first and measures the
  **founding picker itself**, so the screen this milestone fixed is a screen
  the gate now covers: **19 views → 20 → 21, 65 controls → 69**. One fix to
  the harness itself fell out of that: the readings were *judged* before the
  keyboard walk that opens the move readout had taken them, so that view's
  measurements reached the maps after they had been reported. Everything is
  judged at the end of the run now.

  **Two more faults the ratio cannot see**, found by looking at the rendered
  screen rather than at a number. `.lab-row` was `display: flex` so the icon
  would sit beside the sentence — but **a flex container lays out its TEXT
  NODES as items too**, so each row held four of them (the icon, a space,
  `<b>Bear</b>`, `", fully grown…"`) with 5px between each: the screen read
  *"Bear , fully grown"*, and a two-word species name took a column of its own
  with the rest of its sentence stranded beside it. It is a two-cell grid now,
  the sentence in one cell, wrapping like prose and keeping its own
  punctuation. And R73's global `button { align-items: center;
  justify-content: center }` — which exists so a shrink-wrapped label sits in
  the middle of its 40px target — leaked into `.lab-pick`, which had turned
  itself into a **column**: the cross axis became horizontal and every child
  was centred, which is why the laboratory's name floated in the middle of a
  card whose every other line starts at the left margin. Probed for elsewhere
  before deciding whether it deserved a gate of its own: across the founding
  screen and all six screens of a real save, **that row was the only instance
  in the game**, so it is a fix, not a rule.

  **What it found beyond the report.** Two more, on screens nobody had
  flagged: `.intent strong` above, and the field-note title at **4.32:1** in
  the `vivarium` theme — `--accent-2` on `--panel-2`, under the floor in that
  one scheme and no other. Lifted `#ff4fa3 → #ff61ac`, which clears 4.73 there
  and 4.64 on `--accent-2-dim`, and takes dark text *over* the fill from 6.09
  to 6.67 — better in both directions.

  **And the break battery caught me shipping two vacuous breaks.** Reverting
  the class name alone still passed, because the darkened scrim hides a card
  with no ground; reverting the card's height cap alone still passed, because
  the list's own cap already holds it. *Belt-and-braces fixes cannot be shown
  load-bearing one at a time.* So the rule was stated where it is actually
  true — **every element of a visible modal that owns text must paint its own
  opaque background**, because a card that borrows its ground from whatever
  scrim happens to sit behind it today is one stylesheet edit from being
  unreadable. That makes the class name provable, and it immediately found a
  **second instance**: `.sheet` had no rule in this stylesheet at all, so both
  dialogs that wear it — the Pens' repertoire picker and the arena's move
  readout — were transparent, showing the screen behind them through their own
  text. The arena's readout is opened by the keyboard walk and had never been
  measured; it is a view now (**21**), and `.sheet` is a card. The height cap
  stays as belt-and-braces and carries no break, because it cannot honestly
  earn one.

  *Done when: every text node on every view the a11y walk reaches clears its
  WCAG threshold against its real composited background, every dialog card
  paints its own ground, the founding picker and the move readout are both
  among those views, and the battery proves each fix load-bearing.* ✅ —
  **111 breaks, 111 caught**, five of them new (the class name, the two
  `--ink` reversions, the theme token, and `.sheet`'s ground).

- **R130 — 54 KB of shop talk in front of every player.** `data/*.json`
  carries **54.1 KB of `_doc` prose** — developer notes the game never reads,
  keyed into the same objects the engine loads, downloaded on every cold boot
  by every player. Measured this session while looking for the kilobytes R129
  spent: it is **five times what R129 added**, **eight times what R128 did**,
  and it is the last big one left in the first paint (1,068 KB of 1,070).

  This is R81's finding pointed at a new target. That milestone took 400 KB
  of geometry out of the first paint by splitting the file into the half that
  says what things ARE and the half that says what they LOOK LIKE; this is
  the half that says WHY, and it belongs to nobody who has ever opened the
  game. The top ten alone are 31 KB: `regions` 5.0, `stance` 4.6, `species`
  4.3, `rivals` 3.4, `facility` 3.0, `frames` 2.5, `taskforce` 2.4,
  `training` 2.2, `operations` 2.2, `breakout` 2.0.

  **It is a phase and not a `sed`, for three reasons already checked.**
  `tools/gen-parts.js` regenerates `data/parts.json` from its own `_doc`, and
  R127's gate says that generator must reproduce the shipped file exactly.
  Eight source comments cross-reference notes by filename ("see
  `data/frames.json` `_doc`"). And three of smoke's own rules skip the key by
  name, so the notes have to keep a home a tool can find rather than simply
  going away — the point is that the BROWSER stops fetching them, not that
  the writing stops.

  *Done when: the first paint is measurably smaller with every note still in
  the repository and still findable from the file it documents;
  `tools/gen-parts.js` still reproduces `data/parts.json` byte for byte; and
  a gate fails if a note creeps back into a file `data/loader.js` fetches.*

  **SHIPPED.** The first draft of this criterion said "smaller than 1,000 KB",
  which was a round number I picked without doing the arithmetic: 1,075 minus
  53.8 is 1,021, and no amount of prose was ever going to close that gap.
  Corrected above rather than quietly met.

  | | before | after |
  | --- | --- | --- |
  | CORE payload | 401.1 KB | **347.3 KB** |
  | first paint | 1,075 KB | **1,021 KB**, and the ceiling comes down 1,080 → 1,025 |

  Not one word left the repository: 36 notes are `data/notes/<name>.md`, one
  per data file, with a `## path` section for each of the six files that
  documented something nested. Markdown is the mechanism rather than a
  preference — the precache rule ships `.js|.json|.css|.html|.webmanifest`
  and nothing else, so a note in that form *cannot* reach the browser.

  **THE RULE FOUND TWO THINGS THE MILESTONE WAS NOT LOOKING FOR**, which is
  the argument for writing it against the shape rather than the name:
  `tiers.json` carried 365 characters under **`_comment`** — a whole data
  file with no note at all, since R125 spelled it differently and nothing
  ever looked — and one facility track carried 190 under **`_screenNote`**.
  The gate matches any underscore-prefixed string over 120 characters.

  And `tools/gen-parts.js` lost something worth losing. Its `_doc` was built
  as `existing._doc.split(…)` plus a fresh paragraph, so every regeneration
  re-appended the same text: twenty-one copies had piled up before anybody
  looked. A generated file that reads its own prose back in order to rewrite
  it is a loop with no fixed point. Both generated files still reproduce byte
  for byte, which is R127's clause.

- **R131 — The two lists that still grow without a ceiling.** Every other
  screen in this game has been given a shape that stops growing: R44 folded
  the Pens, R45 grouped the Dex, R89 folded the Foes tab, R98 gave the Ranch
  the Pens' one-at-a-time rule, R129 folded the Genes tab. Two are left, and
  they are the two that hold the things a campaign accumulates most of.

  **MEASURED on the day-180 save at 380px**, one phone screen being 780px:

  | | today | what makes it |
  | --- | --- | --- |
  | Ranch, shut | **3,499px — 4.5 phone screens** | one folded row per animal × 20 animals |
  | Vault, fully open | **29,708px — 38 phone screens** | 457 rows (337 parts + 120 vials) across 41 species bays |

  Neither number is a card being too tall. Both are a multiplication with no
  ceiling in it: the Ranch grew 3,269 → 7,438 → 11,607px at four, twelve and
  twenty animals before R98 folded the row, and folding divided the constant
  without touching the multiply. The pens still expand without a ceiling.

  The Vault has a second, sharper version of the same thing **inside one
  bay**: the shark bay on this save holds **101 of the 337 parts** — 30% of
  the shelf behind one summary line, about nine phone screens if you open it.
  And its bays are raw `<details>`, so they are the one fold in the game that
  is neither persisted across a repaint nor exclusive: all 41 open at once is
  a state the player can actually reach, and it is the 38 screens above.

  So: **a page, not a fold** — the fold work is done, and it is the multiply
  that is left. One `ui/pager.js`, used by both, because two implementations
  of "show me the next ten" is how they drift. The Ranch's own rule decides
  the page order and comes along unchanged: ALERTS NEVER HIDE, so an animal
  with a deadline is on the first page or the rule is broken. The Vault's
  bays move onto the project's own fold machinery at the same time, which is
  what makes them persist and makes them one-at-a-time.

  *Done when: neither screen can be made to grow by playing longer — the page
  is the ceiling; every animal carrying a deadline is on the first page of
  the Ranch; and the height gate holds both numbers as arithmetic anybody can
  check rather than as a ratchet.*

  **SHIPPED**, and the two numbers the criterion is really about:

  | | before | after |
  | --- | --- | --- |
  | Ranch, shut | 3,499px | **2,453px** — 1,756 of chrome + 8 rows × 87 |
  | Vault, fully open | 29,708px | **4,009px** — the shut shelf + 16 rows |

  Both are now sums with no campaign-sized term in them. The Ranch's 2,453 is
  3.1 phone screens rather than the 2.5 this entry first asked for, and the
  reason is worth stating: **1,756px of it is chrome** — the Path, Right Now,
  the facility card, the Breeding Pen, the Incubator — so no page size could
  have met that number. R47 last looked at the Ranch's chrome and it has
  grown since; that is the next thing worth doing to this screen.

  Two things the build got wrong first, both caught by measuring rather than
  by reasoning. Keeping `<details>` and driving it from the save made the
  height gate report **2,527px** — it reaches a native `<details>` by setting
  `.open = true`, which after the change revealed forty-one EMPTY shells, so
  the gate was measuring a screen it could no longer open. And paging the
  parts but not the vials left one bay at **16,821px**: the shark bay holds
  101 of the 337 parts *and* 116 of the 120 vials, which the first draft's
  comment cheerfully described as "thin".
