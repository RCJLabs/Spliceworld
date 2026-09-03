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
- **Tags instead of types:** parts grant tags — Armored, Airborne, Aquatic, Venomous, Electric, Sonic, Gas, Camo. (Burrower was listed here for a long time and never reached a single part; R68 struck it rather than invent a ninth tag to justify the sentence.) Effectiveness is a small readable chart (Electric ≫ Aquatic; Ground moves miss Airborne; Sonic ignores Armor; Gas ≫ organic, useless vs. vehicles; etc.). The "type chart" emerges from what you built.
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

### 9.4 Fourth audit (R63–R77) — proposed, not yet accepted

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
- **R72 — Retired content ids crash the Theater.** `theater.js:81` reads
  `content.parts[token.partId].slot` unguarded (verified: a vault token
  whose part was removed from `parts.json` throws and takes the screen
  down), and `:99` calls `tokensFor` without `content`, so its own retired
  guard is a no-op. `physiology.js:61` indexes `GRADES` unguarded one line
  after guarding the part; `classVotes` hardcodes three classes in
  `physiology.js` and twice in `director.js`, so a fourth class votes `NaN`
  and is silently dropped. Every other module defends this case. *Done when:
  a gate retires one part, one grade and adds one class in a fixture, and
  every screen and the sim still run.*
- **R73 — Tap targets and focus at 380 px.** Per screen, **8–14 controls
  under 40 px**: mute 24 h, field-note dismiss 26 h, agenda chip 28 h, row
  buttons 31–33 h; the nav is ~36 h with no `aria-current`; focus rings are
  absent (`outline: none`, `style.css:2104`); zero `aria-live` regions, so
  the wire never reaches a screen reader; `#overlay` has no dialog role and
  no Escape; the save-import label is unfocusable; the Dex sheet's disabled
  state sits at ~3.1:1. This ships as a TWA. *Done when: every control is
  at least 40 px at 380 px, focus is visible, the wire is a live region,
  the overlay is a dialog, and a Playwright pass measures bounding boxes
  and fails below the floor.*
- **R74 — The briefing runs 64–160 battles per checkbox.** `campaign/ui.js`
  calls `forecast` and then `diagnose`, whose first act is the same
  `forecast` again, and on a losing band two more 32-battle sweeps —
  **~150 ms synchronous in Node per toggle**, most of a second on a
  mid-range phone. Boot is the same shape: **52 modules, 623 KB of JS and
  745 KB of JSON** (`parts.json` alone 410 KB) all eager, **zero dynamic
  imports**, against CLAUDE.md's *"lazy-init heavy systems."* *Done when:
  `diagnose` reuses the computed forecast and runs only on losing bands,
  the War Room, battle and Dex load on first use, and a gate caps the
  eager import graph from `main.js`.*
- **R75 — The small wrongs the walk found.** Rename drops `res.msg`; the
  empty-vault SPLICE IT is disabled with its reason suppressed
  (`theater-ui.js:164`); Assault is enabled with everyone injured while only
  Spar reads `canSpar`; "Run a job" lands on the map, not the Jobs tab;
  Hatch! is enabled with the pens full; an unread job report is overwritten
  by the next (`campaign.js:233`); the resequencer's pen-full line is pushed
  **every 30 s** while it waits, so six minutes erase the whole wire
  (`WIRE_KEEP` is 12); hatchlings and vat children use bare `pick` over 12
  and 18 names while `pickFresh` exists; `.grad-shake` is infinite and
  `.poof` ignores `prefers-reduced-motion`; the move sheet binds
  `{ once: true }`. *Done when: each is fixed and the handler-firing stub the
  audit used becomes a suite gate, so every bound handler on every screen
  fires once headlessly.*
- **R76 — The gate that would have caught R60.** `opOdds` was removed from
  an import in R60 while two call sites remained: a live `ReferenceError`
  on the Jobs board, through a 124-cell render-identity harness and a
  five-minute suite, because nothing fires the handler and nothing reads
  the free identifiers. `infirmaryGrants` had been unbound since A1 behind
  a `??=` that never evaluates. A static free-identifier pass over every
  module (the audit's script finds both, with one default-parameter false
  positive to fix) costs under a second. *Done when: a free identifier in
  any module fails the build, every `data-*` handler has been fired once,
  and the battery carries one break per new gate.*
- **R78 — A month lost unseen on one seed.** Found by R68 widening R64's
  away-gate from four seeds to sixteen. On `campaignWalk` seed **5150**,
  leaving on day 10 for thirty days records **zero contest events** for the
  whole month and comes back a **node down (7 → 6)** with nothing counted
  against it, where all ten other comparable seeds record 25 or 26 events
  and hold every node. A node lost with no contest recorded is precisely
  what R64's schedule replay was built to make impossible, so this is not a
  tuning outlier — the replay has a hole, and it takes a specific empire
  shape to fall into it. The suite pins the seed by name (`frozen` must
  equal `['5150']`), so a second seed developing the symptom fails the gate
  rather than widening the exemption. *Done when: seed 5150's away walk
  records the same world movement as its daily walk and loses no node
  unseen, the pinned list is empty, and the gate asserts it stays empty.*
- **R77 — The roadmap describes a different game.** §9.3 listed R54–R62 as
  open with all nine shipped (fixed above); R32–R53 appear nowhere; the
  clocks are stale (settle 22.5 min–3 h, dissection 9–18 h); "three
  frames" against four shipped; ZzFX is named where a hand-rolled synth
  shipped; Gene Juice and Feral-at-instability-100 are designed with **zero
  hits** in code; grades promise upgraded abilities and deliver +12%. *Done
  when: ROADMAP either describes the shipped game or names each gap as a
  queued phase, and a gate checks the numbers it states — settle hours,
  frame count, region count, `SAVE_VERSION` — against the data.*
