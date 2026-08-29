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
Rival geneticists (regional, gym cadence) → AI director activation → L frames & Theater T2 → full combo set → variants via mutation → rehabilitation of captured chimeras → region contestation → monologue/story pass on the profile schema → chaos-breeding chimeras → async ghost defenses (multiplayer "later").
