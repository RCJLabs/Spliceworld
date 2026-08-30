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
- **Part grade = Genetics × Age stage × Condition at extraction.** Grades: **Standard → Prime → Apex → Prismatic.** Each grade = flat stat multiplier + at Apex/Prismatic, an upgraded version of the part's ability.
- Timing tension: extract a Juvenile now (fast, Standard) vs. raise to Prime with good care (slow, upkeep cost, Apex+). This is the ranch's central economic decision.
- Every part token permanently records its donor's name and stars for Splice-Dex lineage ("contains the essence of Bessie").
- Chimeras (yours or captured) can also be extracted — returns a *subset* of parts, one grade degraded. Salvage, not free recycling.

### 3.4 The Surgery Theater (Splicing)
- **Frame first:** choose a **torso**, which sets size class (S/M/L for v0.1) and slot layout. Slots: Head, Forelimbs, Hindlimbs, Tail, Hide, Organ ×1 (×2 at Theater Tier 2).
- Every part carries: stat block, **one signature ability**, and **physiology properties** (mass, metabolic draw, thermal tolerance).
- **Physiology panel** computes and *explains*: power-to-weight, stamina pool & regen, speed, thermal comfort band. Eagle wings on a hippo frame = legal, flightless, and the panel says why. Building is engineering (Law 4).
- **Instability** (0–100): rises with species count in the mix and grade mismatches. High instability = longer settling, more care demand, obedience risk, and at 100 the chimera goes **Feral** (moves to Containment until rehabilitated).
- **Purebred bonus:** 4+ parts from one species = that species' set bonus.
- **Combo abilities:** specific part pairings unlock discovered abilities logged in the Splice-Dex (Venom Organ + Cobra Head = *Injection*; Electric Organ + Aquatic Hide = *Live Wire*). ~12 combos at v0.1; combos are the "gotta discover 'em all" hook.
- **Splice settling:** new chimeras settle on a real-world timer (~1–4 hrs by instability). Deploying an unsettled chimera = Rejection debuffs in battle. Patience is a stat.

### 3.5 Chimera Raising
- Chimeras have **bond** (raised by training, feeding favorites, post-battle care) and **temperament** on two axes (Brave–Skittish, Fierce–Gentle), seeded by dominant donor species + drifted by how you raise them.
- Temperament = passive battle perks (Brave: +crit below 30% HP; Skittish: +evasion first turn; Fierce: +power, −guard; Gentle: +ally support later). Never removes player control.
- **Obedience rule (full control is earned):** command-ignore chance = f(instability, low bond). A settled, bonded chimera obeys 100%. This is the only place control wavers, and care fixes it (Law 3).
- Battle injuries → Infirmary timer; untreated injuries can scar into permanent trait tradeoffs (cartoony: "Chompers now fears jeeps. +Evasion vs. vehicles, −Accuracy vs. vehicles").

### 3.6 Battle System
- **Format:** turn-based, menu-driven, Pokémon structure. Player fields a **team of 3** (bench + switching); enemy commanders field unit waves. Speed determines turn order; switching costs the turn.
- **Stats:** HP, Power, Armor, Speed, Stamina (pool + regen from physiology). **Moves cost stamina instead of PP** — heavy high-power builds run hot and must pace; this is the physiology sim paying off in combat.
- **Tags instead of types:** parts grant tags — Armored, Airborne, Aquatic, Venomous, Electric, Sonic, Burrower, Gas, Camo. Effectiveness is a small readable chart (Electric ≫ Aquatic; Ground moves miss Airborne; Sonic ignores Armor; Gas ≫ organic, useless vs. vehicles; etc.). The "type chart" emerges from what you built.
- **Human enemy roster** (Gen 1–2): Riot Squad (Shield Wall: guards allies), Net Trooper (Trap), Tranq Team (Sleep), Police Cruiser, Infantry Squad (Suppressing Fire: accuracy down), Jeep .50 (fast, fragile), Tank (Armored, slow, Cannon = 2-turn charge), Attack Chopper (Airborne), Artillery (off-screen strikes, must be rushed). KO'd soldiers parachute away; vehicles sputter and collapse.
- **Multi-stage battles:** commanders send waves; bosses transform mid-fight (Tank → Rail Tank), call reinforcements, or change the arena.
- **Capture — theirs:** defeat a rival chimera with your **Containment Cannon** charged (charges by dealing damage without KO'ing — a capture minigame of restraint) → chimera goes to your Containment → **salvage** its engineered parts (enemy-tech parts are otherwise unobtainable) or, post-v0.1, rehabilitate it into your roster.
- **Capture — yours:** *lose a battle* and one of your downed chimeras is captured → **Dissection Countdown** (real-world, 12–24 hrs) → launch a **Rescue Raid** (a themed battle behind enemy lines) before it expires. Fail or ignore it: the creature is lost *and* the enemy's next generation gains a counter-bias against its parts. Stakes without permadeath-by-surprise.

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
Incubation, growth stages, splice settling, injury recovery, dissection countdowns, region income. All computed from timestamps on app open — no background process, PWA-safe. Every timer skippable with **Gene Juice** (earned currency only, no IAP assumptions in v0.1).

### 3.10 Facility (menu-based)
Screens: **Ranch** (stock) · **Pens** (chimeras) · **Extractor** · **Surgery Theater** · **Incubator** · **Infirmary** · **Containment** · **War Room** (map, notoriety, ticker) · **Splice-Dex**. Upgrades are menu purchases: pen capacity, Theater tiers (frames/slots), Gene Scanner, Extractor efficiency, Infirmary speed, Containment Cannon mk2.

---

## 4. Content Spec (v0.1 → 1.0)

### 4.1 Roster — 25 Species *(complete as of Wave 1)*
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
| 13 | Dragonfly | Speedster | Wings → Flicker (evasion, first-strike) | Airborne |
| 14 | Shark | Finisher | Head → Frenzy (power up vs. wounded) | Aquatic |
| 15 | Octopus | Controller | Forelimbs → Eight-Grip (trap); Organ → Ink (acc down) | Aquatic, Gas |
| 16 | Electric Eel | Mage | Organ → Discharge (Electric nuke) | Electric, Aquatic |
| 17 | Anglerfish | Taunter | Head → Lure Light (taunt) | Aquatic |
| 18 | Frog | Mobility | Hindlimbs → Springboard (dodge-hop); Head → Tongue Lash | Aquatic |
| 19 | Goat | Economy | Organ → Iron Gut (halves chimera upkeep) | — |
| 20 | Chameleon | Ghost | Hide → Camouflage (evasion stacks) | Camo |
| 21 | Skunk | Debuffer | Organ → Stink Cloud (team acc/power down) | Gas |
| 22 | Porcupine | Punisher | Hide → Quill Coat (thorns) | — |
| 23 | Mantis | Duelist | Forelimbs → Scythe Strike (priority, crit) | — |
| 24 | Cobra | Poisoner | Head → Venom Fang (Venom stack) | Venomous |
| 25 | Scorpion | Hybrid | Tail → Sting (Venom); Hide → Chitin | Venomous, Armored |

**Math:** 25 species × ~6 parts ≈ **150 parts/abilities**, ~30 ability keywords, 12 combo abilities, 4 grades. Combination space: 3 frames × 150 parts across 6 slots = effectively unbounded; physiology + tags keep it meaningful instead of noisy.

### 4.2 Ability Keyword System (~30 keywords)
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
- **M7 — Polish & Ship v0.1.** Splice-Dex, onboarding (guided first splice), obedience UX, ZzFX stingers, PWA manifest + service worker, TWA checklist. *Done when: a stranger can go from empty ranch to first conquest without asking questions.*

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
3. **Timer fatigue / chore feeling.** Mitigation: soft decay floors, generous early timers, Gene Juice skips, and nothing *breaks* from absence — you return to grown creatures, not dead ones.
4. **Consumption guilt breaking the cartoon tone.** Mitigation: graduation framing, lineage tracking, zero death language anywhere in UI copy.
5. **Endless mode going stale.** Mitigation: AI director + variants + region contestation are the designed content engines; ship the tracking stub in v0.1 so data exists when the director lands.

## 9. Post-v0.1 Backlog (ordered)
Rival geneticists (regional, gym cadence) → AI director activation → L frames & Theater T2 → full combo set → variants via mutation → rehabilitation of captured chimeras (shipped) → region contestation (shipped) → monologue/story pass on the profile schema (shipped) → non-combat operations (shipped) → chaos-breeding chimeras (shipped) → chimera extraction & temperament (shipped) → injury scarring (shipped) → async ghost defenses (multiplayer "later").
