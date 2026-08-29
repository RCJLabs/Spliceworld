# Spliceworld — v0.1 Audit

Post-ship engineering + design audit, taken after M0–M7 and the art pass.
All numbers below were measured, not estimated (`tools/sim.js`, `tools/smoke.js`,
and data introspection). Read alongside ROADMAP §9.

---

## 1. Verdict

**The engine is ahead of the content, and the gap now has mechanical consequences.**
Every system the roadmap called for is built and tested; what's missing is enough
*stuff* for those systems to chew on. The single highest-value next phase is a
**content wave**, not a new system — and the architecture was specifically built
to make that cheap (content is data; adding it must never touch engine code).

## 2. The headline finding: the type chart is 5/6 dead

ROADMAP §3.6 promises *"the type chart emerges from what you built."* Right now
it can't, because the 4-species roster doesn't carry the tags:

| Rule | Status | Why |
|---|---|---|
| Electric ≫ Aquatic | **DEAD** | no player move has Electric; no enemy is Aquatic |
| Ground misses Airborne | **DEAD** | no enemy is Airborne |
| Sonic ignores Armor | **DEAD** | no player move has Sonic (enemies have it; players can't answer) |
| Gas ≫ Organic | **DEAD** | no player move has Gas |
| Gas useless vs Vehicle | **DEAD** | as above |
| Venomous ×0.5 vs Vehicle | LIVE | cobra |

Player-accessible tags today: **Airborne, Venomous, Armored** (bodies) and
**Airborne, Ground, Venomous** (moves). Aquatic, Electric, Sonic, Gas and Camo
exist in the chart and in `species.json` role text but are unreachable in play.

Downstream, this also stalls two backlog items: the **AI director** is designed to
bias enemies against your favourite tags, but with three reachable tags there is
nothing meaningful to counter; and **combo discovery** (4 of a planned 12) has too
small a part pool to build interesting pairings from.

Two implemented keywords are also unused by any move: `ignoreArmor`, `powerDown`.

## 3. Content inventory vs roadmap targets

| | Now | Roadmap v1.0 | Gap |
|---|---|---|---|
| Species | 4 (+1 synthetic salvage) | 25 | **16%** |
| Parts | 24 | ~150 | **16%** |
| Combo abilities | 4 | 12 | 33% |
| Keywords implemented | 18 of a 33-word vocabulary | ~30 | 60% |
| Tag-chart rules | 6 (1 reachable) | — | — |
| Enemy units / encounters | 8 / 6 | Gen 1–2 complete | good |
| Trait genes | 1 | — | allele machinery is generic; more are pure data |
| Regions / nodes | 1 / 5 | endless ring | v0.1 scope, fine |

Frames, enemies and the campaign shell are proportionally healthy. **Species and
parts are the outlier**, and they gate combos, tags, traits, and the director.

## 4. Balance state (measured)

Grade ladder across 26 sampled builds × 4 seeds × all encounters:

| Grade | Mean win rate | Best build |
|---|---|---|
| Standard | 10.3% | 25% |
| Prime | 21.6% | 79% |
| Apex | 31.9% | 92% |
| Prismatic | 44.1% | 100% |

The husbandry→grade→power chain works: raising donors is provably the progression
axis, and the boss stays a wall (50% for the best apex build). Degenerate-build
flags are low (0 OP at standard; 1–2 at apex/prismatic, all near-ceiling builds).

Worth noting: the strongest apex build in the sample runs **Riot Plating + V8 Heart**
— enemy-tech salvage. The Containment Cannon restraint minigame is paying off
exactly as designed, which validates M5's most speculative mechanic.

## 5. Onboarding risk (concrete)

The guided checklist says "Splice a chimera", and a **head is the only mandatory
part**. Measured win rates at the first node with Standard grade:

- Full goat purebred (all 6 parts, which is what one extraction gives you): **73%**
- Head + hindlimbs + organ: **65%**
- **Head only (the minimum legal splice): 0%**

A literal-minded first-timer can build a legal chimera that cannot win anything.
Cheap fix candidates: have the physiology panel warn on an under-built chassis
("3 empty sockets — this will not survive contact"), or have the onboarding hint
say "use every part the donor gave you."

Otherwise the new-player path is sound: ~30 minutes wall-clock from empty ranch to
first conquest (no growth wait needed at Standard), with a next-day Prime path for
players who wait. Economy has no soft-lock — the $40/day stipend is unconditional
against $18/day starter upkeep.

## 6. Code health

~3,100 lines of JS. No TODO/FIXME/HACK markers anywhere.

- **Pure/DOM-free core holds.** `battle/`, `splice/physiology.js`, `ranch/`,
  `campaign/campaign.js` are all headless — which is what lets `tools/sim.js`
  replay the real battle engine. This is the single best structural decision in
  the codebase; protect it.
- **`battle/engine.js` is the one heavy file** (568 lines, 24 functions). It is
  cohesive but is the first candidate for a split (`resolve.js` / `combatants.js`)
  if it grows again. Not urgent.
- **Screen-local module state** (`let lastMsg`, `let draft`, `let pickA/pickB` in
  five UI modules) resets on reload. Intentional and documented, but it's now a
  repeated pattern — worth a tiny shared `screenState(key)` helper if a sixth
  screen wants one.
- **Dead code:** one genuinely unused export (`resetTheaterDraft`) — removed in
  this pass. The other "unused" exports (`PHYS_TUNING`, `gradeScore`, `livingBench`,
  `obedienceIgnoreChance`, `pushNews`) are used within their own modules.
- **Save discipline is excellent**: 7 migrations, v1→v8 chain tested headless and
  in-browser every milestone. No schema change has ever shipped without one.

## 7. Test coverage

Strong on logic, absent on UI — a deliberate and reasonable trade for a solo dev:

- **Covered:** RNG determinism, save migrations, renderer coverage (every part ×
  every frame), physiology, grades, battle (seed-reproducible logs, mid-battle
  serialization), campaign (capture/rescue/expiry/salvage), breeding (Monte Carlo),
  onboarding derivation, PWA shell integrity.
- **Not covered by automated tests:** all 8 `*-ui.js` modules. They're exercised
  only by the per-milestone CDP browser passes, which are ad-hoc scripts in the
  scratchpad rather than committed. **Recommendation:** promote one CDP smoke run
  (boot → care → extract → splice → battle → reload) into `tools/` so UI
  regressions get caught without hand-driving a browser.
- `audio/sfx.js` and `splice/dex-ui.js` have no assertions at all.

## 8. Recommended next phase — Content Wave 1 (species 4 → 10)

Six species chosen specifically to make every dead chart rule live, plus one
Airborne enemy so Ground-misses-Airborne can fire:

| Add | Tags it lights up |
|---|---|
| Electric Eel | Electric, Aquatic — makes Electric ≫ Aquatic real |
| Crocodile | Aquatic body (a target for the above) |
| Skunk | Gas — lights both Gas rules |
| Bat | Sonic + Airborne — lets players answer Armored enemies |
| Pangolin | Armored player bodies (currently only via salvage) |
| Tiger | Striker role, no tags — pure power baseline |
| *(enemy)* Attack Chopper | Airborne defender |

**Why this before the §9 backlog:** rival geneticists, the AI director, and
Theater Tier 2 all consume content variety rather than create it. Rivals fighting
with the same shallow part pool are the same fight with a portrait; the director
has nothing to counter-bias with three tags; T2 adds slots we have nothing to fill.
Content is the unlock for all three.

**Scope:** ~36 new parts (stats, moves, and SVG shapes — the shapes are the real
cost, ~1 evening each for 2 species), 8 more combos, 2–3 more trait genes, and a
rerun of `tools/sim.js` to re-tune. The acceptance criterion writes itself:
*every tag-chart rule is reachable by a player-built chimera, and the sim shows no
single species dominating the win table.*

**Prerequisite worth doing first (30 min):** the under-built-chassis warning from
§5, so new players can't build the 0% chimera.

### Deferred, in order

1. Rival geneticists (now with a real part pool to differentiate them)
2. AI director activation (dissection + tag-usage data is already banked)
3. Theater Tier 2 / L-frame slot expansion
4. Variants via mutation (cheap roster multiplier once base species exist)
5. Region contestation, rehabilitation, monologue pass, chaos-breeding, async ghosts
