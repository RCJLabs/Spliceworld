# PROGRESS

## Session 48 — A7: obedience, priced ✅

**Acceptance criterion:** the number that decides whether your orders happen
is on the screen where you choose who fights — **passes**, though not in the
way the item expected, because measurement disagreed with both halves of its
premise.

### It was never invisible

Every roster row on the briefing screen already printed `obedience N%`. The
audit's premise was simply out of date.

### And it is not decisive

The audit read the ignore *percentage* — 45% sounds enormous — without
measuring what it buys. The original reading also confounded two things: an
unsettled creature carries **both** a big ignore chance **and** Rejection
(×0.75 power and speed), so the damage was being attributed to the wrong one.

Holding settling fixed so Rejection never fires, and replaying the real
engine **300 times a cell at pilot skill 1.0**:

| ignore chance | 0% | 20% | 40% | 60% (the cap) |
|---|---|---|---|---|
| patrol_2 | 95% | 96% | 91% | 86% |
| checkpoint | 100% | 100% | 99% | 96% |

**Twenty per cent — the realistic figure for a settled mixed build at zero
bond — is worth one to three points, inside the noise.** Even the cap costs
about nine. I checked it at pilot skill 0.8 and 1.0 in case the forecast's AI
was simply too weak for a random substitution to hurt it; same answer.

The reason is structural: **a disobeying creature substitutes another move
from its own list.** With five or six mostly-damaging moves, a random one is
usually nearly as good. It costs a little optimisation and never a turn.

### So: not "display it harder"

**One.** An ignore now actually changes the move. The improvisation pool
included the move that had just been *ordered*, so roughly one ignore in five
printed *"ignores orders and improvises!"* and then did exactly what it was
told — a line of combat log that was not true.

**Two.** The briefing *prices* it. `forecast()` takes `obedient: true`, which
replays the same fight with disobedience switched off and **nothing else
changed**, so the gap between the two win rates is what this team's obedience
costs against this encounter:

> **Obedience 40%** — worth about **6 points** of win chance here. Train them,
> or let them settle.

A team that cannot disobey gets no line at all and pays nothing for the extra
replays. Verified in the browser: Steady alone (100%) shows nothing; adding
Havoc (40%) produces the line above.

That is the criterion satisfied in substance rather than in letter — the
number is not just present, it is convertible into a decision — and it stays
honest at whatever this mechanic is eventually worth.

### The break battery

| break | caught by |
|---|---|
| the improvisation pool includes the ordered move again | *never "improvises" into the move it was just ordered to use* |
| the obedient replay perturbs power and Rejection too | *a team that never disobeys forecasts identically either way* |
| the obedient replay sets ignoreChance to 1 instead of 0 | *switching disobedience off never makes a team worse* |

The second is the one that matters: it is what stops the screen reporting
sampling noise as a cost.

I also lost both engine edits mid-battery to a `git checkout -- battle/engine.js`
used to undo a mutation — the same trap as earlier in this run. Re-applied and
re-verified.

### Known issues

- **Obedience is now honestly reported and still nearly worthless.** At the
  values the game actually produces it is a 1–3 point effect, so as a system
  it is close to decorative. Making it matter is a combat retune — a separate
  decision, not something to slip into a display phase.
- Rejection (×0.75 power and speed) is the penalty that actually bites, and
  the briefing names it without quantifying it. The same forecast-delta trick
  would price it.

**Next session's first task:** A8 — the balance harness fights at a team of
three and never measures the solo player the game actually starts you as.

## Session 47 — A6: a combo for everybody, and a silhouette that points ✅

**Acceptance criterion:** every species can appear in at least one combo, and
the Dex's silhouettes point at something real — **passes on both halves.**

### Half one: eleven species had nothing to find

34 of 244 parts were in a combo, and **eleven species were in none at all** —
gorilla, ram, porcupine, mantis, scorpion, and **every one of the six chaos
variants**, which are the rarest things the game produces. Combos are the
discovery layer; most of the roster was not in it.

Eight new combos, chosen so each covers uncovered species and so the slot
spread stops leaning on organs — the first nineteen put **ten organ parts and
exactly one hindlimb** into a combo, which is the same shape A5 found in the
tag chart:

| combo | pair | slots |
|---|---|---|
| Full Contact | gorilla haunches + ram head | hindlimbs + head |
| Bramble Thresher | porcupine arms + duelist ganglion | forelimbs + organ |
| Double Dose | scorpion sting + pale cobra hide | tail + hide |
| Switchback | alpine ram kickers + iron gut | hindlimbs + organ |
| Ball Lightning | thunderhead surge + eel hide | organ + hide |
| Lights Out | abyssal shark tail + angler head | tail + head |
| Siege Engine | iron tortoise hindfins + charge gland | hindlimbs + organ |
| Downwind | glider skunk haunches + bat wings | hindlimbs + forelimbs |

**Every animal is now in a combo**, parts coverage is 34 → 49, and hindlimbs
in a combo went **1 → 5**.

### Half two: the silhouettes named nothing

All 19 undiscovered combos rendered the *same sentence* — "an undiscovered
pairing lurks in the parts bin…". A silhouette is supposed to be bait; 19
identical rows saying "there is something somewhere" is a wall.

`comboHint()` in `splice/theater.js` reveals in layers, keyed to the parts the
player has actually handled (`dex.parts`, which survives spending the token),
and is DOM-free so the Dex and the smoke suite read the same function:

- **nothing handled** → the keyword and the two slots: *`Venom+` · a head + an organ*. Enough to rummage with, and it gives away no part.
- **one half handled** → that half by name: *`Knockback` · Gorilla Haunches + a head*. The actual lead.
- **both handled** → *`Bleed` · Porcupine Arms + Duelist Ganglion — you have handled both. Put them on the same creature.* You are holding the answer; the Dex should say so rather than smirk.

All 27 cold hints are distinct from each other.

### The harness rejected the first pricing, twice

`porcupine_hide + mantis_forelimbs` floors at **79** — Scythe Strike at
prismatic — and the combo gate requires a combo to beat its own parts at every
grade. So every legal combo on that pair was ≥80 power and drawback-free, and
`tools/sim.js` flagged it as an outlier at **56–57% against a peer median of
23–25%**. Dropping the keywords and the power to 82 did not help; the *pair*
was wrong, not the number. `porcupine_forelimbs + mantis_organ` floors at 60,
and the combo sits at 68 with thorns and bleed. Clean at 3, 8 and 12 seeds.

### My own gate caught a thing I had wrong

The first version asserted that a combo's two parts must be in *different*
slots — "one creature cannot wear two organs" — and it immediately failed on
A3's **Full Spectrum** (owl organ + bat organ). The data was right and the
assertion was wrong: Theater Tier II adds an `organ2` bay, so an organ pair is
discoverable, just gated. The gate now reads the real socket list and allows a
doubled slot exactly where a second socket exists.

### The break battery, and the assertion it exposed as hollow

| break | caught by |
|---|---|
| a species loses its only combo | *every animal appears in a combo (missing: alpine_ram)* |
| a combo pairs two single-socket slots | *switchback is wearable: hindlimbs + hindlimbs — only organ has a second socket* |
| combos drain out of the hindlimb socket | *combos reach the hindlimbs socket (0)* |
| the cold hint stops naming its keyword | *a cold hint still names the keyword* |
| a cold hint leaks both part names | *and it does not give the parts away* |
| **every silhouette reads alike again** | **MISSED at first** |

The last one is the finding. I made every unseen half render the word
"something", so all 27 cold hints read `something + something` — the exact
bug A6 exists to fix — **and the suite passed.** The distinctness assertion
keyed on `keyword|text`, and 17 distinct keywords were carrying the whole
test on their own, so the part the hint is actually *for* went unguarded.

Now asserted separately: the **text** must vary on its own (≥12 distinct of
27, measured at 17), and the pair must be ≥90% unique (measured 26/27). The
same break now fails with *the silhouette TEXT varies on its own, without
leaning on the keyword (1/27 unique)*.

One earlier attempt at that break was also just wrong: flattening the whole
`text` expression broke the one-half-handled branch too, so it tripped *the
half you have handled is named* instead — caught by A6, but not by the
assertion under test.

### Known issues

- Two combos (Full Spectrum, Powder Keg) need Theater Tier II, so their
  silhouettes read "an organ + an organ" to a player who cannot yet build
  them. Honest, but the hint does not say "you need a second bay".
- Combo coverage is 20% of parts. Every *species* is reachable now; most
  individual parts still are not.

**Next session's first task:** A7 — put obedience on the screen where a team
is actually committed.

## Session 46 — A5: a tag you cannot reach, and a tag you cannot swing ✅

**Acceptance criterion:** no tag the region ladder depends on is carried by
fewer parts than the ladder asks for — **passes**, and getting there meant
defining "depends on" properly first.

### 1. The armour-piercing answer could not be obtained by anybody

R25 invented `foghorn_array` — a 62-power Sonic organ — because the Foundry
Belt is **9 of 11 Armored at armor 11–15** and nothing in the buyable pool
went through plate. It then wired it as salvage from `leviathan_dredge`,
**a unit that appears in no encounter anywhere**. So the part existed, the
unit existed, and the two were never connected to the map.

Meanwhile `tools/sim.js` kept benching the Foundry with it. Measured share of
damage dealt in the Foundry by the `noise` archetype:

| organ | Sonic move's share of damage |
|---|---|
| `foghorn_array` (62) — the shipped bench, unobtainable | **68%** |
| `owl_organ` (26) — the best a player could hold | **26%**, with 71% coming from a Suplex that eats full armour |

So the archetype *does* isolate the armour-piercing axis, exactly as its
comment claims — but only when built from a part nobody can have.

`foghorn_array` now drops from `eel_generator`: Drowned-exclusive,
Vehicle+Aquatic+Armored, the strip immediately before the one it answers.
`dredger_barge` was the first choice and was **wrong** — it also patrols
Greenfield's Guard Post, which would have put the strongest Sonic attack in
the game a whole region before Kestrel. Caught by re-running the provenance
audit rather than by reasoning.

### 2. Two of the five tags could not be swung at all

| tag | slots it lived in, before |
|---|---|
| Electric | organ 72/46 · head 46 · forelimbs 70 · hindlimbs 44 |
| Venomous | head 40/40 · tail 48/32 |
| **Sonic** | organ 62/30/28/26/0 · head 60/36 — **no limb, at all** |
| **Gas** | hide 0/0/0 · organ 28/24/24 — **no limb, and nothing above 28** |

I first wrote this up as "Sonic and Gas exist only on support slots", and the
break battery disproved it: a **head is a damage slot**, and Sonic already had
`mandate_horn` (60) and `goose_head` (36) there, so the first gate sailed
straight through a break that removed both of A5's new Sonic parts. The claim
was wrong, not the code.

The accurate statement is narrower and more useful. Neither tag had **any
limb carrier** — forelimbs, hindlimbs or tail — which is where a build's
damage actually lives: a head is one socket competing with the species'
signature, and every chimera has three limb sockets. Gas could not be swung
at all; Sonic only from a head, and the one worth pressing is Spire salvage,
a strip *past* the armour wall it answers.
Four parts move them into damage slots, on the species whose identity they
already are: **Wing Buffet** (goose forelimbs, 48/Sonic), **Shell Knock**
(armadillo tail, 40/Sonic), **Business End** (skunk tail, 42/Gas), **Scale
Storm** (moth forelimbs, 46/Gas). Priced under the generic 52, because
ignoring armour and ×1.5 on organics are worth a few points.

### What that buys, measured

Same grades, team of three, 8 seeds a node:

| build | greenfield | kestrel | drowned | foundry | spire |
|---|---|---|---|---|---|
| noise (the shipped bench) | 55% | 72% | 63% | 59% | 59% |
| **sonic bruiser (A5 parts)** | 73% | 75% | 25% | **78%** | 66% |
| sonic, no salvage | 73% | 63% | 22% | **63%** | 53% |
| gas bruiser (A5 parts) | 55% | 63% | 28% | **6%** | 50% |

The armour region has an answer a player can build, and it works *without*
the salvage part too — so it is not a one-part dependency. Gas collapsing to
6% in the Foundry is the trade working: Gas is ×0 against Vehicle.

**The five shipped archetypes could not see any of this.** Not one uses a
Sonic or Gas damage part, so `regionBench` is byte-identical before and
after. A bench that cannot see a change to the axis it claims to measure is
its own finding.

### Defining "depends on", which took two attempts

The first gate asked, per region, "which chart tag has the biggest edge on
this roster?" and then demanded three reachable carriers of it. It failed
**Greenfield** — 62% Organic, so Gas wins the edge — and demanded three Gas
parts before the tutorial strip. That is absurd: every archetype clears
Greenfield at 55–83% with no Gas at all.

The fix is a real distinction. **The class triangle already hands out a
×1.5**, so a chart *multiplier* is a nicer way to do something the player
could do anyway. The one effect nothing else in the game reproduces is
`ignoreArmor` — armour is a flat subtraction and no class advantage goes
through it. So the gate now binds only where a strip is majority-Armored,
which is the case R25 actually hit.

### Gates

- Every enemy-tech part has at least one **fielded** source — per *part*, not
  per unit. `rotor_limbs` is promised by both `crop_duster` and the parked
  `stratofortress`, which is fine; what killed `foghorn_array` was that its
  only source was parked. (The first draft got this wrong and failed on
  `rotor_limbs`.)
- Every chart tag is swingable from a damage slot at 40+ power.
- For a majority-Armored strip: three carriers of the piercing tag reachable
  when it opens, at a power worth pressing against its median armour.

### The break battery

| break | caught by |
|---|---|
| `foghorn_array` back to its parked-only source (R25's actual bug) | *foghorn_array has a fielded source — its only sources are leviathan_dredge…* |
| Sonic loses its limb carriers | *Sonic can be swung from a limb (0: none)* |
| Gas loses its limb carriers | same, for Gas |
| every reachable Sonic attack is feeble | *Sonic's best limb move is worth pressing (20)* |
| the Sonic fauna unlocks a strip **later** than the armour wall | *foundry is 82% Armored and only Sonic ignores it, but a player can hold 2 part(s) … when the strip opens (bat_organ, foghorn_array)* |
| a fifth unit falls off the map | *the parked units are exactly the four known ones (audit_diver, …)* |

Four of the six took a second attempt, and all four were **bad breaks, not
bad assertions**:

- Removing A5's Sonic parts passed, because the gate counted heads. That one
  was a genuine error in my claim and the gate was rewritten around limbs.
- Weakening the Sonic pool *by removing its salvage source* tripped the
  orphan-salvage gate first, which is the more important assertion — so the
  power clause had to be isolated by weakening the moves instead.
- Removing `harbor_skiff` from every wave changed nothing, because the
  **director** fields it as a counter-rule unit, so it was never parked.
- Removing `hydrofoil_lance` tripped orphan-salvage instead, because it was
  the only fielded source of `hydro_jets`. Isolating the parked-list
  assertion needed a unit with no salvage and no director rule.

One mutation was also simply broken: `waves` entries are sometimes a bare
string rather than an array, so the first version iterated the *characters*
of a unit id and the suite failed with `unknown unit r,i,o,t,_,s,q,u,a,d`.

### Known issues

- **Four units are parked** — `crucible_9000`, `leviathan_dredge`,
  `stratofortress`, `the_compliance_engine`, all drafted at boss scale
  (hp 118–145, armor 13–18), too heavy for any strip they could join without
  a rescale. The list is pinned by an assertion so a fifth cannot fall off
  the map unnoticed the way `leviathan_dredge` did. Fielding them properly is
  a balance job, not a data job.
- The archetype bench needs a Sonic-damage and a Gas-damage archetype, or it
  stays blind to this axis.
- **Electric's limb carriers were both `storm_eagle`** — a chaos variant you
  must *breed*, never buy — so the tag was swingable only by someone who had
  already run the vat. `electric_eel_tail` "Live Wire" (50/Electric) is the
  base-species door.

**Next session's first task:** A6 — every species should appear in at least
one combo, and the Dex's silhouettes should point at something real.

## Session 45 — A4: open the loop that was already there ✅

**Acceptance criterion:** a player who opens the game with money, a stable
and a lost fight still has three distinct things they can do right now —
**passes**, and the criterion had to be sharpened before it meant anything.

### The audit's premise was wrong, and the truth was worse

The item was filed as *"there is one thing to do per visit and it is on a
cooldown"*. I built an instrument that enumerates every action the game would
accept from the exact state the criterion names, and measured **five things
open, not zero**. But:

| open, before | what it actually is |
|---|---|
| Order from the catalog | spend money |
| Expand the pens | spend money |
| Train a chimera | spend money |
| Buy someone out of the Infirmary | spend money |
| Run a job | one 15-hour job on a 22.5h cooldown |

Four of five were purchases and the fifth was a wait. **Nothing a player
could do produced a next thing to do** — and six systems were dark, because
the loop the whole game is built around (graduate a donor → splice what comes
out) is shut for the first **six to twelve hours** of every save. The starter
herd is born the moment the app first opens; nothing can graduate until it
reaches adult. That is precisely the window the player who filed this report
was living in.

So the fix is not more jobs.

### 1. The starter bear arrives grown

Its birth is **backdated**, not a free part granted, so every downstream rule
stays honest: it ages normally from there, its condition still decides the
grade it graduates at, and caring for it first still pays. The two goats stay
newborn, so the husbandry timers are still something the player learns —
there is simply one door open on day one.

### 2. Three lanes, because "one job at a time" was one rule doing three jobs

- **crewed** — one lane per creature fit to work, capped at 3.
- **solo** — you go yourself. Exactly one, always. This is what keeps a player
  with *no* chimeras able to run a job at all, which is rule 1 and predates A4.
- **paperwork** — `crew: 'none'` occupies no lane.

The first cut floored the *crewed* lane at one instead, and smoke caught that
it broke rule 1 in exactly the state this board exists for: lose a fight with
a job already out and the floor was occupied, so the thing guaranteed to be
runnable was not runnable. A job in flight also no longer hides the board —
launching one thing used to remove the only screen showing what else there was.

### 3. `ranch/agenda.js` — one definition of "what can I do"

DOM-free, so the Ranch's **Right Now** panel and the smoke suite score a save
with the same code and the criterion cannot drift away from the screen. Every
item carries a `kind`, which is the half that matters:

> **spend** — money leaves, something arrives.
> **work** — you make something: a part, an egg, a creature, a better one.
> **campaign** — you push on the world.

**Measured, criterion state: 5 open / 1 productive / 2 kinds → 6 open / 2
productive / 3 kinds.** And the thesis, demonstrated rather than asserted:
graduating the donor turns `graduate` into `splice`. A thing you can do
produces a next thing to do.

### The bug only the browser could catch

Every Right Now row pointed at a screen id **that does not exist**.
`showScreen()` silently falls back to the Ranch for anything it does not
recognise, so `war` and `splice` — which are tab *labels*, not keys; the keys
are `battle` and `theater` — rendered buttons that looked perfectly wired and
did nothing at all. Smoke now reads the real `SCREENS` map out of `main.js`
and checks every row against it, so the ids cannot drift again.

Two more the screenshot caught and no assertion would have: a solo job with
no stable rendered **"1/0 crews out"**, and the board offered **"-1 of 0 crews
free"** — the arithmetic was mixing lanes. And a long "you are already out
doing something" tag turned a job row into one word per line at 380px, which
is the R25 econ-row lesson arriving for the third time.

### Save v27

`campaign.operation` (one slot) becomes `campaign.operations` (a list). A job
in flight when the save was written keeps its clock, its sealed outcome and
its crew — verified in the browser by hand-writing a v26 save with a running
job and reloading.

### The break battery, and the hole it found

Eight mutations, then one more.

| break | caught by |
|---|---|
| starter herd back to all-newborn | the criterion — *three KINDS of thing* (`work:graduate` is gone from the list it prints) |
| the crewless job needs a crew slot again | the criterion — *three KINDS of thing* (`campaign:job` is gone) |
| an agenda row points at a screen the shell lacks | *job points at a screen the shell actually has (war not in ranch, pens, vault, theater, battle, dex)* |
| every item becomes a purchase | *three KINDS of thing* |
| concurrency reverts to one job | *three fit creatures, three crews* |
| only the first finished job resolves | *every finished job resolves* |
| the same creature in two places | *the same crew cannot go twice* |
| **the migration forgets the in-flight job** | **MISSED — the whole suite passed** |

The first two are caught by the *criterion* rather than by their own
diagnostic, because the criterion is asserted first and each break removes
the only item of its kind. That is the right outcome and the failure message
is the proof: it prints the surviving list, and exactly the item that change
is responsible for is missing from it.

The miss was real. A v27 migration that simply wrote `operations = []`
**passed everything**, because every other assertion only ever checked the
*shape* of a migrated save — that it has the right keys — and never that a
job which was in flight is still in flight. Now asserted: same op, same crew,
same clock, and the outcome sealed at launch that a reload must not reroll.
Re-broken afterwards to confirm it fires.

### Known issues

- The Path to World Domination and Right Now overlap on visit one, so Right
  Now stays folded until the Path retires. Two lists saying the same thing is
  worse than either.
- Smoke is ~3 minutes.

**Next session's first task:** A5 — no tag the region ladder depends on
should be carried by fewer parts than the ladder asks for.

## Session 44 — A3: forty animals, and Air anatomy to build them out of ✅

**Acceptance criterion:** an Air or a Water specialist is as buildable as a
Ground one, *measured as parts-per-slot per class rather than as a species
count* — **passes.**

### The pool, which is the thing that was actually broken

Class comes from anatomy, so the roster count was never the number that
mattered. Affinity-bearing parts, by slot:

| slot | ground | water | air | → | ground | water | air |
|---|---|---|---|---|---|---|---|
| head | 0 | 4 | **0** | → | 4 | 6 | 7 |
| forelimbs | 16 | 7 | 6 | → | 17 | 9 | 11 |
| hindlimbs | 20 | 9 | **0** | → | 19 | 12 | 6 |
| tail | 0 | 5 | 3 | → | 1 | 8 | 8 |
| **total** | **36** | **25** | **9** | → | **41** | **35** | **32** |

(hide and organ vote for nothing, for any class, by design)

**4.0× spread → 1.28×.** Air held nothing at all in two of the four voting
sockets, so an Air build borrowed somebody's legs and then lost the vote it
borrowed them for. Nine more birds donating nine more wings would have moved
the headline number and fixed none of that, which is why the criterion is
per-slot.

Three rules did the work, and only one of them is "new content":

- **A talon votes Air.** A raptor's foot is a grappling hook that touches the
  ground at the end of a dive; pricing it as a walking leg is why the Bat —
  wings *and* talons — read as **Unclassed**.
- **A head votes where the anatomy is class-defining.** Gills already did.
  Now a bell swims, a beak on a hollow skull flies, and a horned skull is
  something you brace and shove with. Most heads still vote nothing.
- **New families:** `paddle` and `rudder` and `drift` (water), `hindwing` and
  `streamer` (air), `stilt` and `scute` (ground).

### The Ground tag was a free x0 and every hindlimb had it

`Ground` appears in exactly one row of the tag chart — *Ground moves miss
Airborne (×0)* — and in no row where it helps. The generic hindlimb move
carried it unconditionally, so a **shark's hindfin** and an **eagle's talon**
both whiffed completely against anything with wings. It now follows the
anatomy: 28 hindlimbs carried it, 19 do.

### The generator had drifted, and running it would have reverted four phases

`data/parts.json` is emitted by `tools/gen-parts.js`. Nobody had run it since
R20, and in the meantime **78 moves and 57 abilities** had been hand-authored
straight into the JSON — R20's keywords, R23's hide and organ actives, a
hand nerf of Shark Frenzy from 64 to 50, a re-tune of Rally Howl. The first
regeneration silently reverted all of it. Two separate faults:

- The salvage loop promised to "preserve them verbatim" and then explicitly
  `delete`d `classAffinity` on the way out, so **`rotor_limbs` and
  `hydro_jets` lost their votes** on any regeneration.
- Everything else was simply absent from the generator.

Both folded back in: `KEYWORD_MOVES` (by part id — the Thunderhead's head
does *not* carry its base's Lock-On, and keying by species would have given
it one), and `HIDE_ACTIVE` / `ORGAN_ACTIVE` / `ACTIVES`, where the numbers
live once and the *kind* is chosen per species. The generator now reproduces
the committed data exactly, except the 20 changes A3 intends.

### Balance barely moved, which is the point

Region bench, 8 seeds, prime grade — before → after:

| region | boots | wings | gills | fumes | noise |
|---|---|---|---|---|---|
| greenfield | 73→73% | 83→83% | 65→68% | 57→57% | 83→83% |
| kestrel | 25→25% | **59→66%** | 97→94% | 44→50% | 72→72% |
| drowned | 88→88% | 25→25% | 56→56% | 25→25% | 63→63% |
| foundry | 28→28% | 19→19% | 13→16% | 0→0% | 19→19% |
| spire | 50→50% | 31→31% | 22→22% | 28→28% | 53→53% |

`wings` gains 7pp in the air region — it is pure Air now and its kick has
stopped whiffing. Nothing else shifts more than 3pp.

### Two assertions that were not measuring what they claimed

- **"Actives get pressed" was on a knife edge.** Three builds, needing two
  distinct archetypes, seeing exactly two — and *which* two depended on the
  seed string and on whether a build's kick happened to whiff. Untagging the
  hindlimbs moved one build off a whiff and onto its kick and the guard went
  red with nothing about the actives having changed. It now sweeps the whole
  pool at both grades: 40 species, 0.3s, a stronger guard and a stable one.
  It also surfaced a **known gap, deliberately left visible**: the AI never
  presses Slipskin, Vanish, Screen or Focus. They cost a turn of not
  attacking, and `chooseMoveIndex` values damage. That is a pricing problem
  for its own phase; the floor is set below it rather than asserted away.
- **"The part pool really is Ground-skewed"** was the *justification* for
  reading class per creature — and A3 makes it false. The rule is still
  right for a better reason (a census counts parts; what fights is
  creatures), so the guard now pins the balanced pool and the per-creature
  read separately.

And the class-triangle cases had been padding their sockets with a **goat
head**, which A3 turned into a third voter. Swapped for a bear's, with the
mute-ness asserted rather than assumed.

### Also shipped

- **Seven combos** reaching eight of the nine new animals — Full Spectrum,
  Powder Keg, Nettle Curtain, Screaming Roll, High Water Mark, Deterrent
  Display, Shell Game. Each verified to out-damage the best drawback-free
  move of its own two parts at all sixteen grade assignments (304 checks).
- The Foundry paid **no fauna at all** before this; it now unlocks the
  Screaming Armadillo and the Peregrine Falcon.
- Every new hide and organ is an active. Pufferfish "Inflate" (guard +
  thorns) and the Screaming Armadillo's "Screaming Fit" (Sonic) are
  signatures; the rest take their species' kind.

### The break battery, including the two breaks that were wrong

Twelve mutations, each run against the suite; every A3 assertion fails when
the thing it guards is broken.

| break | caught by |
|---|---|
| ground loses its only tail | rule 1 — *ground has no tail anywhere in the game* |
| talons vote Ground again | rule 2 — *air hindlimbs is 1 part(s)* |
| water pool thinned past 1.5× | rule 3 — *the class pools are within a half of each other* |
| every air vote flipped to ground | rule 1 — *air has no head anywhere in the game* |
| all air anatomy from one donor | rule 4 — *air can be built from at least three donors* |
| goose unreachable | rule 5 — *goose is unlocked by conquering something* |
| Ground tag back on every kick | rule 6 — *crocodile_hindlimbs swings a Ground move but its anatomy votes water* |
| horned heads stop voting | rule 1 — *ground has no head anywhere in the game* |
| one animal goes missing | the count — *forty animals (39)* |
| one combo disappears | `gradeAssignmentsChecked` |
| a combo priced below its own parts | *high_water_mark … is 10 power but a drawback-free move of its own parts is 58* |
| every hide active priced out | caught **elsewhere** — by R23's own win-rate guard directly above it, which is the stronger assertion and fires first |

Three of those took two attempts, and the reasons are worth keeping:

- **Two breaks were the wrong size.** Dropping paddle/rudder/drift left Water
  at 30 against Ground's 41 — a 1.37× spread, *inside* the 1.5× the gate
  allows. Stripping Water entirely then tripped rule 1 before rule 3 could
  speak. Only trimming each Water slot to exactly five isolates rule 3.
- **One break was masked by a crash.** Deleting the armadillo left the
  `screaming_roll` combo pointing at a part that no longer existed, so the
  suite died on a `TypeError` long before the count assertion — and a harness
  that greps for `AssertionError` reported that as a *pass*.
- So the last five run through a probe that lifts the A3 block's **actual
  source out of `smoke.js`** and executes it against mutated content, rather
  than a re-implementation that could drift. It carries a control on
  unmutated content — which is what caught the probe's own first version
  being broken (a relative import resolving from the wrong directory), a
  failure that would otherwise have read as five clean catches.

### Two self-inflicted process faults, recorded because they nearly shipped

- The break scripts chained themselves with `while pgrep -f "a3-breaks.sh"`,
  which **matches the waiting process's own command line** — both waiters
  deadlocked on themselves. One survivor then mutated `species.json`,
  `combos.json` and `smoke.js` in the window between my verifying the tree
  and committing it, so the first push was missing the armadillo. Caught by
  re-diffing against the backup afterwards; amended.
- `tools/gen-parts.js` built its `_doc` by appending to whatever the previous
  run left behind, so the Wave 1 paragraph had accumulated **twenty-one
  copies**. Now built from a canonical base and verified idempotent across
  two consecutive runs.

### Known issues

- Smoke is now ~3 minutes, up from ~80 seconds: several sweeps are
  per-species and the roster grew 29%.
- The four evasion/accuracy actives are still never pressed by the AI.
- Ground has exactly **one** affinity-bearing tail (the armadillo's scute).
  Every class has *something* in every voting slot, but ground's identity is
  still its limbs.

**Next session's first task:** A4 — a player who opens the game with money,
a stable and a lost fight should have three distinct things they can do
right now.

## Session 43 — A1/A2: the solo cliff, and the dead end under it ✅

**Acceptance criterion:** the ladder is beatable at every team size the game
will let a player field, *or the game refuses to send them into a fight it
knows they cannot win* — **passes** on the second clause, asserted over
every node of the first region at all three team sizes: **every true 0% is
called unwinnable, and no fight at 40% or better ever is.**

### The cause was structural, and that decided the fix

| team | Old Barn | Downtown | Checkpoint | Precinct | Guard Post |
|---|---|---|---|---|---|
| **1** | 100% | **0%** | **0%** | 0% | 0% |
| 3 | 100% | **79%** | 100% | 0% | 0% |

Combat is one active per side over a queue, so three enemy bodies means
grinding three health bars down with one of your own. The diagnosis that
mattered:

- `patrol_2` at **tier-1 stats with three waves**: still **0%**
- `patrol_2` at **full tier-2 stats with two waves**: **28%**

**Bodies, not numbers.** No stat pass moves it. I modelled a garrison that
scales to the force you bring and **rejected it on the measurement**: it put
node 2 at 25% solo but 22% at two, so growing your stable made the fight
*harder*, and it quietly removed the reason to keep a stable at all.

### So the game says so

`battle/forecast.js` runs the actual fight on the briefing screen — real
engine, real AI on both sides, 32 replays, ~8ms — and reports a band. It
refuses nothing; the launch button just stops looking like the recommended
action and reads **"Launch anyway"**.

**`runs = 32` is load-bearing.** At 7, a matchup that is truly ~45% read
0%, 57%, 14%, 43% and 29% across five base seeds — the *verdict* was being
decided by sampling noise. A forecast that calls a coin-flip "not
survivable" costs a player a fight they would have won, so the walk-away
verdict is the one that must never be wrong in that direction.

And the Path to World Domination, which retired **one node before the
wall**, now walks to a stable of three — the number the harness has fought
at since M4.5, said out loud for the first time. The starter herd is exactly
three animals, so the answer was always already in the pens.

### A2 — the dead end

Before: lose node 2 with your only creature and it was captured, roster
empty, vault empty (those parts went into the creature that was just taken),
and the rescue raid needed a team you no longer had. Nine-hour window, no
door.

Now the last one on a roster drags itself home instead. Verified in the
browser, not just the harness — lost the fight, and:

> *Gerald is the last one on the roster, and the coalition could not quite
> hold on to it. It limped back through the fence at dawn, furious and
> filthy. Infirmary.*

Roster 1, captives 0. A capture with a spare at home still works exactly as
it did — asserted both ways, because the mechanic is good and only its edge
was broken.

### Two of my own assertions were weak, and the battery found them

- **The determinism test used a 0% matchup.** Swapping the seeded runs for
  `Math.random()` changed nothing, because 0% is 0% however you roll it. It
  runs against a ~45% fixture now, and asserts the fixture *has* variance so
  it can never go blind again.
- **The "never calls a winnable fight unwinnable" mutation was too weak** to
  trip its own assertion. The assertion was right; the break was not.

Also caught: two mutations in the battery silently no-op'd on a quote
mismatch and were reported as passes. Re-run with the real anchors, both
caught.

### Guards, each verified to fail when broken

Ten: every fight called unwinnable · an unwinnable fight called winnable ·
the forecast sampled too thin · the forecast rerolling per render · the
outnumbered count dropped · the last chimera taken again · captures stopping
entirely · the Path dropping the stable step · the Path retiring at the
first conquest · the stable field note removed.

### Known issues

- The A1 fix is informational, not a rebalance. Node 2 is still 0% solo —
  the game now says so before you commit, and A2 means finding out cannot
  cost you the run. If playtesting says that is still too blunt a wall,
  the lever is content (A3's air and water species) rather than stats.
- The forecast costs ~8ms per briefing render, recomputed on every team
  toggle. Fine at 380px; worth watching if the team cap ever grows.

### Next session — first task

**A3** — nine new species to 40 animals, weighted 5 air / 3 water / 1
ground. It is the largest remaining item and it is the lever that would let
a smaller stable clear the early ladder on anatomy rather than bodies.

## Session 42 — Second audit (A1–A10) 🔍

No code shipped. Ten queue items, each with the evidence that put it there.

### The player report was not a difficulty complaint

*"I have 1 chimera and keep failing the 1 mission I can do."* Measured, on a
standard-grade purebred against the Greenfield ladder:

| team | Old Barn | Downtown | Checkpoint | Precinct | Guard Post |
|---|---|---|---|---|---|
| **1** | 97% | **0%** | **0%** | 0% | 0% |
| 2 | 100% | 9% | 50% | 0% | 0% |
| **3** | 100% | **69%** | 97% | 0% | 0% |

The second node is not hard with one chimera. It is **arithmetically
impossible**, and it is a comfortable fight with three. Every balance number
in the ROADMAP was measured at `teamSize 3` — M4.5 established that tuning
against a lone chimera measures the wrong game, which was true, and quietly
became the reason nobody ever looked at what a solo player faces.

The Path to World Domination retires at "Conquer the Old Barn Perimeter" —
**one node before the wall** — and nothing anywhere says the answer is a
second creature.

And the failure mode underneath it is worse. Verified end to end: lose that
node with your only chimera and it is captured, the roster is empty, the
vault is empty because you spent those parts splicing it, and **the rescue
raid requires a team you no longer have**. Nine-hour timer, no door.

### Two things checked and found innocent

- **Jobs do award animals** — 40–60% on a success, 29% per attempt overall
  on the good ones. The report of never getting one was bad luck, not a
  bug. What is true is that the rate is nowhere visible.
- **Obedience is not broken.** My first measurement showed bond 0 and bond
  100 producing identical results, which looked like a dead mechanic. It is
  not: a *settled purebred* ignores 0% of orders either way, so the fixture
  could not see it. An unsettled mixed build ignores 45%.

### The roster, counted

| | ground | water | air |
|---|---|---|---|
| buyable species | 15 | 7 | **3** |
| class-affinity parts | 36 | 25 | **9** |

Air's nine parts are six forelimbs and three tails. There is **no** air
affinity on any head, hindlimb, hide or organ in the game, so an Air chimera
can carry at most two air parts and must dilute itself with somebody else's
legs. That is why R26's `wings` archetype needed hand-construction.

Related: **29 of 46 tagged moves are Ground**; every other tag has 3–5. R26
built five regions on that chart, and R25 had to invent `foghorn_array`
mid-phase because the armour-piercing answer to the Foundry did not exist in
the buyable pool.

And **24 of 190 parts appear in a combo**. Eleven species have none at all,
including all six chaos variants — the rarest things the game produces have
nothing to discover.

### The queue

| | item |
|---|---|
| **A1** | The solo cliff — the ladder is tuned for three and the game gives you one |
| **A2** | Never stranded at zero chimeras |
| **A3** | Nine new species to 40 animals, weighted 5 air / 3 water / 1 ground |
| **A4** | More to do per visit — one job at a time on 4.5–22.5h cooldowns |
| **A5** | Parts for the tag chart |
| **A6** | Combos for the other 87% |
| **A7** | Obedience on the briefing screen |
| **A8** | The harness must measure a solo player |
| **A9** | A fourth frame |
| **A10** | Timer-cut stragglers (`injuryHours [2,5]` missed R24's cut) |

### Next session — first task

**A1**, and A2 belongs in the same phase: they are one experience. Fixing the
curve without closing the dead end just means losing more slowly.

## Session 41 — R27: a rival who has beaten you twice has read you ✅

**Acceptance criterion:** a rival you have beaten twice fields something
built to answer your actual stable — **passes**, and measured in a way that
cannot be fooled by the difficulty ramp.

**This closes the audited queue: R20–R29, all ten shipped.**

### The wrong source

A rival used to counter you by asking the AI director what class you
favoured. That is the wrong source, and it is the reason this line was on
the queue at all: the director reads your **whole stable, continuously**,
from usage banked since M0 — it is the world noticing you. A rival is one
person in one building who has only ever seen what walked through their
door.

Each rival now keeps their own file, written by duels against them and by
nothing else. Two rivals who met you at different times hold different
reads. Owning an Air stable tells a rival nothing until you bring it through
their door, and what one rival learns is filed in one lab.

They record what was **deployed**, not what is owned — a stable of five
where you only ever send the same one is a stable a rival knows a fifth of.
And the file is written on every duel including the ones they win, because
losing to a stable is the best possible reason to study it.

### The ladder

| defeats | what they field |
|---|---|
| 0 | the build they publish |
| 1 | one specimen answers your class — only `counterBias` rivals react this early |
| **2** | **the counter moves to their lead, and they pick anatomy that blunts your most-used move tag** |
| 3+ | they field one of your own signature parts back at you |

The anatomy table is data, keyed on the tag you actually swing, and the
reasons are the real chart: Ground misses Airborne outright, Electric
doubles on Aquatic, Sonic ignores Armor so plate bought against it was
money wasted.

### Measuring it, without being fooled by the ramp

The trap is obvious once you look for it: a rival at two defeats is **also**
stronger and better graded, so *"the rematch got harder"* proves nothing at
all. So the instrument holds the escalation fixed and varies only the file —
two copies of the same rival, both beaten exactly twice, both at identical
power and grade, one having spent those duels watching the archetype that
beats them and one watching something else entirely.

| rival | the anatomy that beats them | vs the rival that studied someone else | vs the rival that studied **it** | penalty |
|---|---|---|---|---|
| Dr. Mantissa | wings | 68% | 47% | **26pp** |
| Baroness Aloft | gills | 97% | 57% | **40pp** |
| Prof. Trench | boots | 50% | 4% | **40pp** |

Averaged over six world seeds — a rival's team is re-rolled per defeat
count, so a single seed swings 0–75pp while the mean is steady. And the
rematch is hard because they **learned** you, not because the numbers went
up: across the ladder the counter costs **35pp** against the ramp's 15pp.

### The defect the measurement exposed

Building the instrument immediately showed that the old escalation — a grade
step every second defeat on top of a 9%-per-defeat power climb — turned the
first real rematch into **a door rather than a rung**. The anatomy that
cleared a rival at 92–100% cleared the same rival at 0–8% two defeats later,
which is not a ladder. Softened to a step every third defeat at 5%, so the
thing that makes a rematch hard is the counter rather than the ramp.

A second, smaller one: the counter only led the team when there was a class
to counter, so an **unclassed** stable — the hardest kind to read — quietly
made rivals stop reacting. The lead is decided by the tier now.

### Guards, each verified to fail when broken

Eleven, and one of them only exists because the battery found the hole:
every assertion tested `scoutStable` **directly**, so removing the call in
`resolveBattle` changed nothing and the suite stayed green. That is exactly
the line a refactor drops silently, and it now has an end-to-end assertion
that resolves a real duel and checks the file was written.

| break | caught by |
|---|---|
| rivals stop countering entirely | the counter-class assertion |
| the anatomy counter is ignored | the mirror is really on the field |
| the counter never reaches the lead | two defeats puts it in front |
| a rival reads the whole stable again | a chimera left at home was never seen |
| the file is shared between rivals | a read is personal, not a broadcast |
| duels stop being recorded | *(the end-to-end assertion above)* |
| the tutorial rival reacts too early | Mantissa lets the first rematch go |
| the escalation goes back to a wall | the criterion's own margin collapses |
| the mirror tier never fires | four defeats and they take your anatomy |
| the v26 migration invents observations | a rival beaten five times has still never watched you |

### Known issues

- Per-seed variance on the counter is wide (0–75pp), so the gate averages
  over six world seeds. Within one save it is deterministic, so this is
  world-to-world variety rather than noise the player can feel.
- `fumes` and `noise` lose to every rival at every tier, so their rows in
  the bench measure nothing. They are still worth running: an archetype that
  cannot win is exactly where a counter would be invisible.

### Next session — first task

The audited queue is empty. The honest next move is **another full audit of
the shipped code** in the shape that produced R20–R29 — three of those ten
turned out to have the wrong headline once someone looked, and there are now
five regions, six facility tracks, an upkeep economy, 22 field guides and a
rival scouting system that have never been audited by anybody.

## Session 40 — R29: every system gets one note, and the long screens fold ✅

**Acceptance criterion:** every shipped system has a first-use guide derived
from state, and none fires before its system is reachable — **passes**,
checked by walking one save forward through **eighteen milestones** and
asserting at each that the notes it lights are exactly the ones that
milestone makes real, and that none of them was live a step earlier.

### 22 field guides, all derived, none persisted

Onboarding shipped in M7 as a five-step Path ending at the first conquest.
Eight more systems shipped behind it — breeding, the chaos vat,
rehabilitation, the jobs board, contestation, scars, temperament, the Dex —
and then R25 and R26 added five regions, six facility tracks and an upkeep
economy. None of it was mentioned anywhere.

| screen | notes |
|---|---|
| Ranch | breeding · incubator · genes · pairing · facility · upkeep · catalogue |
| Pens | temperament · bond · infirmary · scars |
| Splice | combos · chaos vat |
| War Room | jobs · containment · rehab · rivals · rescue · contest · regions · director |
| Dex | the Dex itself |

A guide carries two condition lists — `reachable` (does this system exist
for this player) and `done` (have they used it) — and shows only when
reachable **and** not done. That makes *"none fires before its system is
reachable"* a property of the **data** rather than a rule someone has to
remember. Conditions are either a dotted save path with a minimum (counted
by array length, key count or value) or, for the dozen needing real
derivation, a named helper. The helper registry is the engine's own
knowledge of its systems, so a note for something it can already see is a
pure data edit.

Two smaller rules earn their keep. **One note per screen**, lowest order
first — a wall of tips is wallpaper. And **the Path owns the screen until
the first conquest**, because two tutorials at once is one tutorial too
many.

### Fold-away cards

R25 and R26 had made two screens very long: six facility tracks and five
region strips in one column. Both fold now, and the state lives in the save
so a fold survives the reload the Definition of Done requires.

Each card picks its own default and a player's choice always overrides it:

- **Facility** starts shut behind a one-line summary of what is worth
  opening it for — *"4 ready to buy · 5 upgrades left, from $700."*
- **The War Room** opens the strip you are actually fighting in and shuts
  the ones you have finished or cannot reach. Greenfield collapses to
  *"Held end to end"*; the locked regions keep their price of entry visible.

The War Room went from a 3,280px scroll to 2,826px with more structure, not
less.

### Two assertions that passed while the thing they guarded was broken

The break battery is the only reason these were found, and both failed the
same way — **the assertion derived its expectation from the thing under
test**:

- *"The Path owns the screen"* was checked against a **fresh** save, which
  has nothing ready anyway. Deleting the suppression changed nothing, so
  the test passed. It now runs against a save with a settled chimera, a
  laid egg and no conquest — several notes genuinely live underneath.
- *"A screen shows the lowest-order note"* compared `guideForScreen` to the
  first entry of `guideStates`, which sorts with the same comparator.
  Reversing the sort flipped both and the assertion held. The expected note
  is computed from the authored `order` in the content file now.

### Guards, each verified to fail when broken

| break | caught by |
|---|---|
| a guide fires from turn one | the milestone walk |
| a shipped system loses its note | the coverage roll |
| a guide has no way to be finished | it would nag forever |
| a guide points at a screen that does not exist | screen validity |
| the Path stops owning the screen | *(after the fix above)* |
| a screen shows the wrong note first | *(after the fix above)* |
| dismissing a note does nothing | dismissal sticks |
| a stored fold state is ignored | a stored value always wins |
| the v25 migration forgets the fold record | migrated saves get an empty record |
| two guides share an order | the queue is deterministic |

### Known issues

- The coverage roll (`SHIPPED_SYSTEMS`) is a hand-maintained literal. That
  is deliberate — it forces a future phase to come and say it shipped
  something — but it is the one part of this that can rot silently if
  somebody edits it instead of adding a note.
- Save **v25**: `guidesSeen` and `ui.collapsed`, plus the four R25 facility
  tracks named explicitly in `newGameState` (they already read as level 1;
  a save listing two of six just looked half-configured).

### Next session — first task

R27 (rival geneticists as a ladder) is the last of the audited queue: three
rivals that counter-bias through their own path rather than the director's
banked usage data. *Done when: a rival you have beaten twice fields
something built to answer your actual stable.*

## Session 39 — R25: four more tracks to buy, and a stable that costs money to keep ✅

**Acceptance criterion:** money has a second sink that changes the loop, and
each track pays back measurably — **passes**, measured by `facilityPayback`
running the game's own breeding rule, grade thresholds and clocks.

| track | what it buys | measured payback |
|---|---|---|
| **Incubator** | 3 → 8 bays, half the incubation, and a mutation rate | **8.0 → 15.2** mutations per 100 eggs |
| **Extractor** | a cleaner draw | prime+ **50% → 72%**, apex+ **4% → 13%** |
| **Gene Scanner** | what an animal carries, then what a pairing will produce | **111–400 → 5–8** pairings to fix a recessive |
| **Infirmary** | time and certainty | **3.0h → 1.35h** downtime, scars 34% → 20%, treatment at 60% |

The facility went from **$3,400 to $24,000** of purchasable depth. One of the
four was a promise the game was already making out loud: the pens have
printed `Genes: ????? (Gene Scanner required)` since M6, advertising a
machine nobody had built.

### The other half: a stable is no longer free to own

R26 made this urgent rather than optional — full conquest paid **$2,385/day**
into a game whose priciest animal costs $260. Chimeras cost **nothing** to
keep until now, which made territory income a score rather than a budget:
the only question money ever asked was how long you were willing to wait.

A chimera is billed for the chassis it rides, the grade of every part bolted
to it, the power those parts draw, and its instability — four terms, all read
off data the genome already carries, so a new part, grade or frame is priced
the moment it is authored.

| | standard | prime | apex | prismatic |
|---|---|---|---|---|
| upkeep/day | **$21** | $46 | $88 | **$147** |

The spread is steep on purpose and the flat terms small, so the treadmill
bites at the top and not at the bottom:

| stage | income | upkeep | net |
|---|---|---|---|
| opening, one standard chimera | $40 | $35 | **+$5/day** |
| Greenfield held, three primes | $345 | $159 | +$186/day |
| four regions, six apex Rumblers | $1,665 | $603 | +$1,062/day |
| full map, eight prismatic Rumblers | $2,425 | $1,280 | **+$1,145/day** |

Upkeep at full conquest is **53% of income**. You cannot simply stockpile any
more, which is the point.

### Two things measurement caught that assumption would not have

- **Incubator bays are not the bottleneck — pen capacity is.** 3 → 8 bays
  changes nothing on its own: you can queue eight eggs and still only keep
  four animals. The track had to buy something that changes the loop, so it
  buys a **mutation rate** — which is where variants and the mutation-only
  genes enter the game at all (R24).
- **The Gene Scanner was about to sell something free.** Its top tier was
  going to unlock a graduation forecast that has been on the pens screen
  since M2. It sells the thing still genuinely hidden instead: the Punnett
  odds for a *pairing*, carrier against expresses, computed in closed form
  from the same rule `expressedTraits` applies. Two heterozygotes read
  75%/75% dominant and 75%/25% recessive — textbook, and asserted as such.

### The floor held, but only just

The onboarding path is care → extract → splice → battle → conquer, so a
player reaches their first chimera having conquered **nothing**. The first
draft priced that creature at $54/day against a $40 stipend — the guided
first loop walking a new player straight into insolvency. The fixture that
caught it was also wrong in the other direction: building a chimera
*consumes* an animal, so the herd shrinks as the creature arrives. Both
fixed; the assertion now models the real path and passes at $36 against $40.

Funds still floor at zero and nothing is ever repossessed — a player away for
a fortnight comes back to a poor lab, not a ruined one. Asserted over thirty
simulated days of absence with four prismatic Rumblers eating.

### Guards, each verified to fail when broken

Eleven new assertions, every one confirmed against a deliberate break:

| break | caught by |
|---|---|
| the Extractor stops improving grades | each tier grades better |
| the Incubator stops changing what hatches | mutations per 100 eggs |
| the Infirmary stops shortening convalescence | downtime hours |
| the Infirmary gives certainty away free | scar chance is never zero |
| upkeep stops caring about grade | upkeep climbs with grade |
| a first chimera is priced out of the stipend | the R11 floor |
| `applyElapsed` stops charging for chimeras | a day of upkeep leaves the account |
| the funds floor is removed | absence empties and stops |
| the forecast forgets recessives need two copies | a recessive needs both copies |
| a facility level 1 starts charging rent | level 1 is free |
| a track gates on a node that does not exist | facility gates reference real nodes |

### Known issues

- **The econ row is five cells in a two-column grid**, so Pens sits alone on
  a third row. Legible, slightly ragged.
- The smoke suite is ≈80s. The R25 bench adds ~2s; the rest is R26's
  encounter set.
- No save migration was needed — every new value is derived, nothing new is
  persisted — so `SAVE_VERSION` stays at 24. The service-worker cache name
  still had to change, or a returning player keeps the old shell.

### Next session — first task

R27 (rival geneticists as a ladder) or R29 (onboarding for the eight
unguided systems). R29 is the stronger case now: R25 and R26 between them
added five regions, six facility tracks and an upkeep economy, none of which
the guided first loop mentions.

## Session 38 — R26: five regions, and a ladder that asks five questions ✅

**Acceptance criterion:** taking Greenfield opens a region whose fights need
different anatomy than the one that won the first — **passes**, measured
rather than asserted by hand: in every later region a build that cleared
Greenfield falls **32–67pp**, stable across seven independent base seeds.

### The map

| | Greenfield County | Kestrel Reach | The Drowned Quarter | The Foundry Belt | The Compliance Spire |
|---|---|---|---|---|---|
| identity | Ground, Organic | Airborne, Air class | Aquatic, Water class | Vehicle + Armored, all three classes | all three classes, no plating theme |
| answers to | Air | **Water** | **Ground** | **armour-piercing** | nothing in particular |
| bench champion (apex) | — | gills 100% | boots 100% | noise 75% | flat, top 58–66% |

Five strips, 21 nodes, 24 encounters, 40 units, a Threat Generation ladder
that reaches 3, and five new enemy-tech parts — one dropped by each region.

### The engine was the blocker, not the content

`regionOf(content)` returned `regions[0]` and four systems reached past it.
Contestation picked its defence target, its node names and the defending
encounter from the first county alone, so a counter-offensive could never
have landed anywhere else — the very system §8 names as the endless-mode
content engine stopped working at the county line. Gating, lookups and the
Threat ladder now live in one pure module, `campaign/map.js`, shared by
contest.js, the director and the War Room.

Two things the phase description never mentioned turned out to be
load-bearing:

- **The AI director's reach** is "the hardest encounters, up to a budget."
  That is a fine definition of where the world adapts with one county;
  across five it spent the entire budget rewriting the Compliance Spire
  while the player was still arguing with a parking warden in Greenfield.
  Scoped to open regions.
- **Redistributing fauna is the one content edit that can rob a live save.**
  A player holding the Guard Post owned nine species that moved three
  regions out. Save **v24** grants them permanently (`faunaGranted`), so the
  catalog can only ever grow — and any future reshuffle is safe for the same
  reason. Verified in the browser on a rolled-back v23 save: all 23 species
  survive, no console errors.

### Four attempts at the rotation, and what each one got wrong

1. **Draft one handed every later region to the same anatomy that won
   Greenfield.** The Foundry because half its units swung **Ground-tagged**
   moves, which miss an Airborne build outright — so "fly" was still the
   answer three regions later. A tipper, a wrench and a ladle were never
   ground attacks anyway.
2. **Draft two made it class-mixed and turned it into a wall** — nothing
   cleared it above 19%. A region everything loses measures as little as a
   region everything wins.
3. **Draft three found the cause**: the new units had been authored at boss
   scale and then tier-multiplied on top. A tier-6 hauler came out at 253 HP
   behind 41 armour. They sit in the shipped roster's band now, and the tier
   ladder does the escalating; the Foundry's identity survives as armour
   *relative to its peers*, not as a big number.
4. **Armour-piercing had to become earnable BEFORE the region that demands
   it**, or the demand is a wall with the key inside. Hence `foghorn_array`,
   salvaged from the Drowned Quarter's flagship — and priced twice, because
   at 44 power the pilot never pressed it over a 70-power forelimb.

A mixed strip is intrinsically the harder fight at equal tier, because a
mono-class strip hands the right anatomy a free ×1.5 that a mixed one cannot.
The tier ladder compensates: the Drowned Quarter firmed up, the Foundry and
the Spire stepped down.

### Two bugs the new content exposed in old code

- **`sampleBuilds` built impossible chimeras.** It made a "purebred" from
  every part of a species, which was a no-op while every species carried
  exactly one part per socket. Enemy tech is a catch-all, and R26 grew it to
  three organs and two hides — so the harness assembled an eight-socket
  creature the game cannot offer, and that creature promptly flagged as the
  most degenerate build in the pool. A yardstick has to measure builds a
  player could hold.
- **The War Room's headline row collided with itself.** At full conquest it
  reads `+$2385/day` beside `128W–12L`, and at 380px those two overlapped
  mid-glyph — while every measurement in the suite reported four cells of
  equal height, because overflowing text does not change a box. Two columns
  on phone widths, and the breakpoint is now pinned in smoke.

### What did not work

`seedsPer 4` on the balance gate. R26 tripled the encounter set and with it
that gate's runtime, so 4 was tried again on the theory that three times the
encounters buys back half the seeds. It does not: the detector is
peer-*relative*, and thinning the sample fattens both tails, so 4 immediately
flagged a build that 8 and 12 both call clean. The suite is slower than it
was (≈75s). That is the price of a bigger world, and it is cheaper than a
gate that lies.

### Guards, each verified to fail when broken

Eleven new assertions, every one confirmed by deliberately breaking the thing
it guards:

| break | caught by |
|---|---|
| Kestrel stops being an air region | the anatomy-drop gate (drop falls to 20pp) |
| the air fauna moves past Greenfield's boss | the playability guarantee |
| a region requires a node from a *later* region | ladder reachability |
| Threat Gen 3 removed | the ladder has three rungs |
| a Gen-3 node placed before the map banks 320 | the gen-gate reachability walk |
| two nodes share one encounter | encounter ownership |
| the Foundry unlocks nothing new to build | Law 2 |
| the Spire becomes solvable by one anatomy | the finale's flatness bar |
| a region gets no boss | strip structure |
| the migration stops grandfathering | a migrated save keeps what it earned |
| the econ breakpoint drifts back to 360px | the CSS breakpoint pin |

### Known issues

- **Income outruns its sinks.** Full conquest pays **$2,385/day** against a
  catalog whose priciest animal is $260. R25 (facility depth) is the second
  money sink and is now overdue rather than optional.
- **Contestation still starts at Gen 2 and caps at one concurrent
  offensive.** Across 21 held nodes that is a very quiet map. Tuning only —
  no engine work — but it wants a pass.
- The smoke suite takes ≈75s, up from ≈35s, almost entirely in the
  all-grade balance gate now that there are 24 encounters to sample.

### Next session — first task

R25 (facility depth): the economy now generates far more money than it has
anywhere to go, and R26 made that acute rather than theoretical. R27 and R29
are the rest of the queue.

## Session 37 — R24: mutation traits, and every timer cut by a quarter ✅

**Acceptance criterion:** two equally-starred parents can produce visibly
different offspring, and the difference shows in a fight — **passes**: on a
contested matchup the twelve genes range from **−8pp to +24pp**.

### Every real-world clock is 25% shorter

Applied across the board, data and the code defaults that mirror it: care and
training cooldowns 20h → 15h, settling 30min → 22.5min, incubation (goat
30 → 22min), the seven jobs and their cooldowns, chaos gestation, rehab
programmes, contest windows 18h → 13.5h, the rescue window 12–24h → 9–18h,
heat half-life, infirmary. One `facility.json` block hid its hours under
`tracks[].tuning` and was missed by the first pass — caught by checking the
output rather than trusting the script.

The smoke banner moved on its own as a result: `care 97 → 99` and grades
`standard/prime → standard/apex`, because more care now fits the same window
and better condition means a better extraction. The cut is doing what it was
asked to.

### The gene pool

The allele machinery has been generic since M6 — dominant/recessive, Mendel
inheritance, extraction stamping tokens by slot — and **exactly one trait
used it**. Twelve now, each with a real trade-off:

| | |
|---|---|
| circulating (7) | Dense Bones, Hollow Bones, Deep Lungs, Thick Hide, Hyperthyroid, Second Wind, Glass Jaw |
| mutation-only (5) | Venom Gland, Barbed Skin, Keen Eye, Clotting Factor, Pack Instinct |

Two things were quietly wrong underneath, and neither was in the phase's
description:

- **Traits could only arrive by mutation.** Mail-order stock is gene-plain,
  so with twelve genes each would surface about once in two hundred eggs and
  the Splice-Dex would read `???` forever. `wildChance` puts seven into
  ordinary stock: you can find a carrier, pair carriers, and breed a
  recessive up — which is the Mendel machinery finally being worth having.
  Measured at 36–59 carriers per 400 head.
- **The harness never loaded `traits.json`.** `tools/sim.js` has been blind
  to genes for four sessions, so every measurement would have quietly
  compared a build against itself. Smoke now asserts the harness loads the
  same gene pool the game does.

`moveKeywords` lets a gene change what a part *does* — a Venom Gland that
actually envenoms is a different creature from +3 Armor with a different
name. Merged **under** the part's own keywords, so a gene never overwrites
what a part already did.

### One gene was a trap, and the fix was R23's lesson again
`Clotting Factor` rode a `regen` keyword onto an organ move and measured
**−26pp** on a contested fight — negative in every matchup tested. Two
re-prices changed nothing, because the keyword was pressed once per fight
either way; the cost was the turn, not the number. A gene that is a trap
everywhere is not a trade-off, so it pays in durability instead: **−26pp →
+24pp**.

### Known issues
- `Hollow Bones` sits at −8pp on the one contested bench used here. It is a
  speed-for-HP trade and should win elsewhere, but that is asserted nowhere.
- Trait effects are still measured one gene at a time; nothing checks a
  *combination*, and stacking two on one chimera is legal.
- No save-schema change — `genotype` already existed and gains only entries.
  `SAVE_VERSION` stays **23**.

### Next session — first task
R26 (a second region) is the largest remaining content gap; R25, R27 and R29
are the rest of the queue.

## Session 36 — R23: active hides and organs ✅

**Acceptance criterion:** a hide and an organ each change how a fight is
played — **passes**: an armoured build wins **37% without** its hide and
organ actives and **99% with** them.

### The premise held this time

Checked first, after two phases of over-claiming. Every hide was a passive
stat stick — **0 of 32** carried a move — and most organs were too. And the
passive parts were **not** compensated with better stats (21.3 total against
22.1 for the active ones), so this was an omission, not a designed
trade-off.

All 64 sockets now carry an active, from one priced vocabulary keyed off tags
the parts already had, so a species added later inherits one for free and
re-tuning is one edit rather than fifty-six.

### Pricing them took three passes, and two were wrong

1. **First pass: pressed, and a trap.** The actives were used constantly and
   cost **−10.8pp** on contested fights — some cells −33pp. A turn not
   attacking is worth about fifty damage, and the effects returned far less,
   so the AI was talking builds into losing trades. *Pressed is not the same
   as useful.*
2. **`guard` is structurally wrong for a hide.** It lasts only until your
   next action, and `performMove` clears it at the start of that action — so
   it never reads as already-up. The AI guarded **386 times across 60 fights
   and lost every one**. Hide actives have to **persist** to be worth a turn,
   so the fifteen guard hides became thorns.
3. **Then price them to be worth the turn** (thorns 0.25 → 0.45, heal → 0.30,
   regen → 0.09): −10.8pp became **+2.0pp**.
4. **Then scale the investment to its payoff window.** Thorns, evasion and
   regen pay out over the turns still to come, so a creature with three turns
   left should not buy a five-turn return. That was the difference between a
   tortoise (+62pp) and an eagle (−18pp) — the fragile build was being talked
   into spending turns it did not have. `+2.0pp` became **+6.1pp**, and the
   eagle cells went from −18/−12 to 0/+5.

### The part only a screenshot could find

Everything above passed, and the player still could not see any of it. Six
moves, four buttons, and the UI showed the first three **in socket order** —
head, forelimbs, hindlimbs, tail, hide, organ. The two sockets this phase
existed to activate are the exact two that fall off the end.

The buttons now show the hardest swings plus **one utility, ranked by what it
is worth right now** — so the plating surfaces when something is hitting hard
and a heal surfaces when you are hurt, instead of the tail winning the slot
every time by being socket three.

### Balance
0 `[OP]` and 0 `[TRASH]` at all four grades, headroom **+8.8 to +14.8pp** —
the best the table has been. Difficulty stable (38/48/58/70), and class
spread improved again at every grade.

### Known issues
- Only one utility slot exists on the main row, so on a six-part build the
  organ active still sits behind "more". Correct given four buttons, but the
  organ is the quieter half of this phase.
- Archetype use is very uneven — Bristles 511 presses across a full sweep,
  Leech and Focus 2 each. None is decoration, but some are much more niche
  than others.
- No save-schema change: parts are content. `SAVE_VERSION` stays **23**.

### Next session — first task
R26 (a second region) is the largest remaining content gap; R24, R25, R27 and
R29 are the rest of the queue.

## Session 35 — R28: battle readability ✅

**Acceptance criterion:** a new player can predict super-effective before
pressing, at 380px — **passes** (verified on screen, not just in the DOM).

### The audit over-claimed, again

R28 was queued as *"`turnForecast` returns speed and nothing else… the player
gets no pre-commit signal"*. Half wrong. `turnForecast` does only return
speed, but the battle UI never used it for that — it already drew **class
chips on both fighters** and an effectiveness multiplier chip.

That is two phases running (R21, R28) where the audit claimed more than the
code deserved. The pattern is the same both times: I read one symbol, found
nothing, and wrote down "missing" instead of "not here". Naming it because it
is cheap to keep doing.

### What was actually wrong: the number was a lie

The button printed `move.power` — the raw data value. That is not what lands.
Armor, power stages, scars, perks, guard, Frenzy, Rage and Multi-Hit all sit
between the two. **A 52-power swing into 22 armor is not a 52**, and R22 had
already built `previewMove` to compute the honest figure for the AI. The
player was reading a different board from the opposition.

`battle/readout.js` is DOM-free on purpose — the numbers are what the
criterion is about, so smoke tests them directly instead of scraping HTML:

> **Eagle Bite ✓** · ~84 (95%) · 22⚡ · `Air ▸`

- **Expected damage**, not listed power, with the chance to land beside it.
- **A finisher mark** when the swing should end it.
- **Class and tag split apart.** The old chip multiplied them together and
  printed one number, so "×1.5" never said whether it was the triangle or the
  chart — which is the half a new player is trying to learn.
- Immunity reads as *no effect*, never as a small number.

### Two things only the screenshot caught

Both passed every assertion I had written, which is the point of looking:

1. **`~8495%`.** Damage and accuracy ran together into a third number. My
   regex `/~\d+/` matched it perfectly happily. Now `~84 (95%)`, and smoke
   fails on a four-digit run-together.
2. **The finisher mark was a red ✕**, which conventionally reads as
   *unavailable* — the exact opposite of "this one closes it". Now a green
   ✓, and the tooltip says *graduate* rather than anything the tone rules ban.

### Known issues
- Against a badly outmatched opponent every move earns the finisher mark, so
  it stops distinguishing anything. Accurate, but noise at that end.
- The overflow picker only appears with five or more moves, so its longer
  "listed 52 · 95% to land" line is unexercised in the common case.
- No save-schema change: the readout is pure display. `SAVE_VERSION` stays
  **23**.

### Next session — first task
R23 (active hides and organs), which R20 already made a down payment on with
three utility organ moves, or R26 (a second region), the largest content gap.

## Session 34 — R21: Splice-Dex completeness ✅

**Acceptance criterion:** everything the game announces is findable again
afterwards — **passes**, asserted over the *rendered* dex rather than the
fields behind it.

### First: the phase's own premise was wrong

R20 recorded, and R21 was queued on, "combos are never persisted to the dex
despite `combos.json`'s `_doc` claiming it". **That is false.** Combos are
persisted in `state.discoveredCombos` — a top-level field since the **v4**
migration — and the dex has drawn them all along, with `???` bait for the
undiscovered. The `_doc` was telling the truth; I grepped for `dex.combos`,
found nothing, and scheduled a session to fix a bug that did not exist.

Recording it rather than quietly dropping it, because the failure mode is
worth naming: an audit that greps for one spelling of a thing will invent
work. The other two claims held.

### Rival dossiers

A rival's whole record — defeats, losses, when you last met — was kept in
`campaign.rivals` and surfaced **nowhere you could return to**. There is no
rival UI file at all; they appear as a live War Room card and then they are
gone. A rival you beat three regions ago should be lookupable.

The dex now carries a dossier per rival: their title and philosophy, what
they favour, whether they read your stable — and, because it should brief
rather than just score, **what they will bring next**, derived from the same
numbers `rivalTeam` uses:

> **Dr. Mantissa** · 2 graduated · 1 lost to them
> Next time: 3 in the field at ×1.89 power.

A rival you have never met stays `???` — a rumour, not a spoiler, and smoke
fails if an unmet rival is ever named.

### Lineage: two generations, bounded by construction

The family tree was a one-generation snapshot. It now reaches grandparents —
and the cap is **structural rather than a rule someone has to remember**: the
snapshot copies a grandparent's name and stars but never its own `sire`/`dam`,
so there is nowhere for a third tier to live. An unbounded tree doubles every
generation in a save that is never reset, and this save is never reset.

Smoke breeds three generations and asserts a grandparent carries exactly
`['name', 'stars']` — the assertion fails the moment someone spreads the
whole object in.

### The invariant
Stated once over the rendered page: plant one of each announceable discovery
— combo, enemy, variant, trait gene, rival with a record — render the dex to
a string (it needs no DOM), and require each to still be there. All three
break paths fail the build.

### Known issues
- **QA lesson, not a product bug**: `innerText` omits below-the-fold content
  in headless Chrome, so the combo check failed while the entry rendered
  perfectly. `textContent` proves presence; a layout probe (88×14px,
  `visibility: visible`) proves it is on screen. Worth remembering before
  "the UI is broken" gets written down again.
- Operations keep only `campaign.opReport`, the last one. A jobs history is
  the same class of gap as the rival one was, and is not covered here.
- Scars are findable on a living chimera in the Pens; a graduated one takes
  its history with it.
- `SAVE_VERSION` **22 → 23** (grandparent fields normalised), with a
  migration; sw cache `spliceworld-v23-dex`.

### Next session — first task
R28 (battle readability) can now lean on R22's `previewMove`, or R23 (active
hides and organs), which R20 already made a down payment on.

## Session 33 — R22: an enemy AI with a policy ✅

**Acceptance criterion:** the same roster plays measurably better and the
all-grade balance gate still passes — **passes** (7–13pp per contested
matchup; 0 `[OP]` and 0 `[TRASH]` across 4 grades × 10 pools at `seedsPer`
12 **and** 16).

### One scorer, both sides

`enemyChooseMove` was a coin flip with a 75% lean toward damage. It is now
`battle/ai.js`: a single scorer that reads expected damage through the chart
and the class triangle, values a kill above the damage on it, prices every
status against whether it is *already there*, and keeps stamina in reserve.

It sits on a new `previewMove()` — the same arithmetic `attack()` runs, with
the dice taken out. That makes it the one source of truth for "what does this
button do", which the AI reads to choose and R28's battle UI will read to
explain. Smoke asserts the two agree to within 8% over 100+ swings.

**Skill is a dial, not a switch.** Encounter tier drives it (0.15 at a beat
patrol, 0.85 at a Gen-2 response, 0.9 for rivals), so the difficulty curve
gains a dimension that costs no new content.

| contested matchup | vs random | vs the policy | worth |
|---|---|---|---|
| boss / bear | 85% | 76% | 9pp |
| boss / shark | 78% | 49% | 29pp |
| military / bear | 39% | 27% | 13pp |
| air patrol / bear | 98% | 89% | 9pp |

### The pilot got the same brain — and that mattered more

R20 recorded that the greedy pilot never pressed a low-power or defensive
move, so those could never be priced. Giving the harness the same policy
closed that, and immediately **exposed a real outlier**: the shark purebred
at 77% against a 45% median at Prime. Frenzy was priced at 64 power back when
it was decoration; the first pilot able to press it found it. Re-priced to
50 — under a plain 52-power Strike at full health, above it once the target
is hurt, which is what a finisher should read like.

### The bug that cost a whole class

Air collapsed from 34% to **13%** at Standard. Three hypotheses were wrong
before measurement found it — it was not the enemy (a dumb enemy gave the
same 13%), not the rest heuristic, not the stamina penalty, and not the 20%
random branch.

Counting presses found it in one line: on a fragile Air build the pilot
pressed a **capped, zero-power evasion buff 545 times across 80 fights and
won none of them**, where the old greedy rule — which had no way to *choose*
a setup move — rested, recovered, and won half. Once a stage caps it scores
zero, but a 10-stamina buff stays affordable long after the 20-stamina attack
does not, so the pilot chain-cast it and never climbed back.

Two rules fix it: never spend a turn on a move worth nothing, and when
*nothing that hits* is affordable, a buff must clear a bar to beat resting.
The same build now wins **66%**, against greedy's 51%.

| class spread | before R22 | after |
|---|---|---|
| standard | 20pp | **12pp** |
| prime | 19pp | **9pp** |
| apex | 26pp | **16pp** |
| prismatic | 24pp | **20pp** |

Better play on both sides made the *class balance* read more honestly than
it ever has — R18's work shows through once neither side is flailing.

### Known issues
- **Smoke is 13.7s → 27.3s.** The policy evaluates every move every turn, and
  the gate is 4 grades × 6 pools × 40 builds × 11 encounters × 8 seeds. Worth
  it for now; if it grows again, trim the gate's pools before its grades.
- **The pilot does not switch.** It picks moves only, so a bad class matchup
  is played out rather than tagged out — which understates any build with a
  bench answer. The next honest step for the yardstick.
- The boss-transform test now pins `aiSkill = 0`. Captain Clampdown with a
  policy opens on accDown and stays on its best swing, which ends a thin squad
  before stage two — a real difficulty change, but that assertion is about a
  KO trigger, not difficulty.
- `SAVE_VERSION` **21 → 22** (`battle.aiSkill`), with a migration; sw cache
  `spliceworld-v22-ai`.

### Next session — first task
R21 (Splice-Dex completeness) is small and is the last correctness item, or
R28 (battle readability) which can now lean on `previewMove`.

## Session 32 — R20: wire the dead keywords ✅

**Acceptance criterion:** every keyword in `keywords.json` is either on a move
AND implemented, or gone — with a smoke invariant so it cannot rot again —
**passes** (29 keywords, 0 unimplemented, 0 uncarried; all three break paths
fail the build).

### The button was lying

`taunt` and `frenzy` sat on shipped **player** parts — anglerfish "Lure Light"
and shark "Frenzy" at 64 power, one of the biggest moves in the game — against
keywords `keywords.json` itself labelled **"Reserved (post-M4)"**. The engine
never read either. Content had been authored against keywords that were never
built, and nothing in the project could see it.

The full count: **18 implemented, 15 not; 11 on no move at all.** Two of those
— `heal` and `staminaRestore` — had been wired since M4 and unreachable the
whole time, because organs almost never carry a move (5 of 32).

### What shipped

| | |
|---|---|
| implemented | `taunt` `frenzy` `rage` `bleed` `multiHit` `staminaDrain` `ignoreEvasion` `thorns` `slow` `rally` `regen` |
| deleted as redundant | `reflect` (= thorns) · `camouflage` (= evasionUp) · `aoe` (one active per side over a queue — nothing to splash) · `suppression` (= accDown + multiHit) |
| given a home | 11 placements, each on the species the keyword already describes |

Frenzy reads the **target's** wounds, Rage the **user's own** — two halves of
one idea kept apart so a shark and a cornered gorilla do not feel like the
same creature. Rally finally does what `wolf_organ`'s "Rally Howl" and the
Pack Hunt combo's `"keyword": "Rally"` have claimed since M3: it buffs the
whole side. Multi-Hit runs the *whole* pipeline per strike, armor included,
so a flurry is worse into plating and better into a bare target.

`heal`, `regen` and `staminaRestore` got the three utility organ moves they
always needed (Shell Rebuild, Cutaneous Mend, Second Stomach) — the smallest
slice of R23 the invariant required.

### The invariant is behavioural, not a grep

A textual check for `frenzy` in the engine passes on a *comment*. So every
keyword is bolted onto a control move and the same fight is replayed on the
same seed with and without it. **An inert keyword consumes no rolls and
changes no state, so the two logs come back identical** — which is exactly
the bug, and it fails.

Two keywords needed their own setup, and finding that out mattered:
`ignoreGuard` and `ignoreEvasion` have nothing to bypass unless the target is
guarding and evasive, and a bench that never creates the condition reports a
**live** keyword as decoration. Guard is the awkward one — `performMove`
clears the attacker's own guard, so it only stands while the guarding side has
not acted, which means the player must swing first, which would have made
`priority` untestable in the shared bench. Each conditional keyword now gets a
matched baseline under the same condition.

### Balance
0 `[OP]` across 4 grades × 10 pools at `seedsPer` 12 **and** 16, headroom
4.4–6.7pp. `[TRASH]` went **1 → 0** at every grade: the newly-live keywords
gave the weak builds something to do.

### Known issues
- **The sim never presses the new defensive or low-power moves.** The pilot is
  greedy on raw power, so Multi-Hit (20 power × 2–3) and the thorns move (44)
  lose to a plain 46-power bite and are never sampled — their balance
  contribution is untested. Squarely R22's territory; the browser QA drives
  them by name instead.
- **Rally Howl changed hands**: `powerUp` on self became `rally` on the whole
  side, and it is Pack Hunt's parent part. Balance holds today, but that combo
  has been re-tuned once already — watch it.
- Three organ moves is a down payment on R23, not the phase.
- `SAVE_VERSION` **20 → 21** (`bleed`/`thorns`/`regen`/`taunted` on battle
  status), with a migration; sw cache `spliceworld-v21-keywords`.
- Smoke 12.9s → 13.7s.

### Next session — first task
R21 (Splice-Dex completeness) is the other correctness item and is small.
R22 (enemy AI) is the big one and would also fix the sampling gap above.

## Session 31 — The knockback lock, and what the director actually needed ✅

**Acceptance criterion:** a Knockback attacker cannot deny every action, the
director never makes a fight easier with wave order free again, and no
adaptation is protected by where a unit happens to sit — **passes** (R18's
slot workaround reverted and `military_response` still goes 55% → 3% under
adaptation; all three guards fail smoke when broken).

### The keyword pricing found a bug instead

R18 asked for keyword prices in the director's `weight`. Measuring them, on
one control unit, one keyword at a time:

| keyword | Δ player win |
|---|---|
| **knockback** | **−88.7pp** |
| evasionUp | −3.0pp |
| accDown | −2.0pp |
| everything else | ≤ −2pp |

That is not a balance number. Knockback rotates the target's side, and the
round loop then drops that side's planned action — correct for a KO, because
the fighter is gone. For a rotation the fighter is alive on the bench, so a
faster attacker with Knockback denied the player **every action for the
entire fight**. The log is unambiguous: thirteen turns, enemy on
`131/131 hp`, the player acting exactly once — when the last chimera had
nowhere left to be shoved.

A side rotated last turn can no longer be rotated again this turn. It stays
a real tempo move (it still costs a full action) but the worst case is now
losing every other action. Same fight: **loss in 13 turns → win in 5**.

### The premise didn't survive the fix

With the lock gone, every keyword prices between 0 and −3pp — knockback
included, at −2.0pp. So there was nothing to price in. Checking the
heuristic itself against measured threat across the roster:

| formula | corr with real threat |
|---|---|
| **current** `hp + power*3 + armor*2` | **0.958** |
| + best move power | 0.964 |
| + best move + keyword count | 0.962 |

`weight` was never the problem. But the director's promise is *pairwise*,
and r=0.958 still leaves local inversions — `gunship_80` (weight 118, a
58-power move) reads flimsier than `attack_chopper` (130, 52) and is not.
So: one guard, not a reweighting. **A slot that hits harder than the counter
coming in is never expendable.** Measured across every encounter × rule
pairing:

| guards | mercy rules | swaps kept |
|---|---|---|
| none (R18) | 3 | 21 |
| move power | **0** | **16** |
| class only | 1 | 11 |
| class + move | 0 | 9 |

**R18's slot workaround is reverted.** `military_response` has its strong
unit back in the swappable middle slot, and the director now correctly
appends instead of swapping: 55% → 3%. Wave order is no longer load-bearing.

### A guard I wrote and then deleted

A class guard (never trade an Air slot that counters a Ground stable for a
Ground one) looked well-motivated — it was one of the three measured
mercies. Removing it from the code changed nothing, which is how a guard
rots into dead code, so it got checked properly: through the real director,
`ground_stable` always outranks `chemical` for a Ground stable and answers
with an Air unit, so the guard **cannot fire**. My "proof" that it was
reachable had hand-picked the counter and bypassed rule selection. The move
guard alone gets 0 mercies and keeps *more* swaps. Deleted.

### Vehicle share
Two Organic units — `rappel_team` (air) and `fire_brigade` (water), both
land-plausible so they are not stuck in harbour encounters. Vehicle share
45% → **40%**.

### Known issues
- **40%, not the 35% R18 asked for.** Reaching 35% meant trading the impound
  lot's cruiser and the checkpoint's truck for weaker organics, and that cost
  10pp of Standard difficulty (median 34% → 44%). Difficulty is worth more
  than the round number, so it stopped at 40% with the median back at 37%.
- **`weight` still ignores keywords**, by measurement rather than oversight —
  pricing them in made the correlation worse. The move guard covers every
  observed failure, but a future unit whose *keywords* rather than move power
  outclass a counter could still slip through. Knockback was exactly that
  case and is now capped; the general blind spot remains.
- `SAVE_VERSION` **19 → 20** for `battle.knockedAt`, with a migration; sw
  cache is `spliceworld-v20-knockback`.
- Smoke 9.9s → 12.9s (the no-mercy sweep measures every encounter × rule).

### Next session — first task
Onboarding past the first conquest, or the ZzFX audio pass — both have been
open since M7 and neither is blocked.

## Session 30 — The class triangle, and the gate at every grade ✅

**Acceptance criterion:** no class is a strict upgrade over another, the
roster is clean at every grade under sampling well past what the gate uses,
and the old roster fails the build — **passes** (0 `[OP]` across 4 grades ×
10 pools at `seedsPer` 12 *and* 16; restoring the old roster fails smoke,
naming the storm_eagle Prime outlier by name).

### It was never a storm_eagle problem

R17 handed over a `storm_eagle` purebred topping every pool. The first
measurement killed the obvious fix:

| enemy roster | share |
|---|---|
| **ground** | **90%** |
| air | 5% |
| water | 5% |

Six of eight encounters were pure Ground. With Ground ≫ Water ≫ Air ≫
Ground, that is not rock-paper-scissors, it is a ranking — Air dealt ×1.5
*and* took ×0.7 against nearly everything; Water did the reverse. Forcing a
build's class and holding its stats fixed:

| build | as air | as ground | as water | unclassed |
|---|---|---|---|---|
| storm_eagle | 77% | 64% | 48% | 61% |
| eagle | 78% | 55% | 51% | 58% |
| tiger | 82% | 73% | 61% | 73% |

Class was worth **+16 to +20pp**; Water was a **−10 to −13pp** tax. And
plain `eagle` already matched storm_eagle at 78%, so nerfing the variant
would have promoted its parent and changed nothing.

### Six units, not a nerf

`surveillance_drone`, `falconry_unit`, `gunship_80` (air) and
`water_cannon_truck`, `harbor_diver`, `dredger_barge` (water) — procedural
SVG, pure data, no engine edits. Roster 10 → 16 units, mix **90/5/5 →
50/25/25**:

| grade | air/ground/water spread — before | after |
|---|---|---|
| standard | 17pp | **6pp** |
| prime | 24pp | **7pp** |
| apex | — | 13pp |
| prismatic | — | 12pp |

storm_eagle drops from rank 1–2 at every grade to **rank 8/43** at Standard,
without one of its numbers being touched.

**Even thirds is wrong** and was measured, not assumed: 35/35/30 gives a
20pp spread against 50/25/25's 12pp. The tag chart stacks asymmetries on top
of the triangle — Ground moves miss Airborne *entirely* — so the enemy mix
that equalises the classes is not the one that looks symmetrical.

### Two things the change broke, and what they taught

- **The AI director became a mercy rule.** It may only ever make a fight
  harder, and guards that by stat weight — but `weight` cannot see move
  keywords. `gunship_80` at weight 118 was beating attack_chopper's 130
  because of one keyword: `knockback` alone was worth **~35pp** (removing it
  took the encounter from 46% to 80%). Rather than gut the unit, the strong
  new units now sit in the opening and final slots, which the director may
  never cut, so the slot it *can* swap is one its counters genuinely
  outclass. `military_response` holds at 48% (was 45%) and the director's
  adaptation takes it to 10%.
- **The tutorial must stay class-neutral.** An Air unit in tier 1 punished
  every Ground starter on the first fight. `patrol_1` is all-Ground again;
  the triangle starts at tier 2.

### Known issues
- **Vehicle share rose 35% → 45%**, because Air and Water fiction is
  inherently vehicular (choppers, boats, trucks) and only two of the six new
  units could plausibly be Organic. Gas does ×0 to Vehicles, so pure-Gas
  builds are worse off. Mid-change this cost 4 `[TRASH]` builds; the final
  roster is back to **1**, the same one that failed before this session, but
  the pressure is real. Fix is more Organic air/water units, not a tag change.
- **The director's `weight` heuristic is blind to keywords.** Worked around
  by slot placement, not fixed. A unit whose kit outclasses its stats can
  still turn an adaptation into a mercy. Pricing keywords into `weight` is
  the real fix.
- Smoke goes 4.0s → 9.9s: the gate is now 4 grades × 6 pools × 8 seeds.
- No save-schema change, so `SAVE_VERSION` stays **19**.

### Next session — first task
Price keywords into the director's `weight` so slot placement stops being
load-bearing, then add one Organic air and one Organic water unit to pull
Vehicle share back toward 35%.

## Session 29 — Combo grade scaling ✅

**Acceptance criterion:** no combo is overtaken by the drawback-free moves of
its own parts at any grade, and Standard balance is provably untouched —
**passes** (192 grade assignments asserted through `movesFromTokens`;
Standard win-rate table byte-identical before and after).

### The reward that stopped being one

`GRADE_MOVE_BONUS` sharpens a part's move 12% per grade. A combo's move was
flat. So a well-raised chimera watched its discovery fall behind the parts
that made it:

| Pack Hunt | before | after |
|---|---|---|
| Standard | 58 vs Pounce 52 ✅ | 58 vs 52 ✅ |
| Prime | 58 vs **58** ❌ | 65 vs 58 ✅ |
| Apex | 58 vs **64** ❌ | 72 vs 64 ✅ |
| Prismatic | 58 vs **71** ❌ | 79 vs 71 ✅ |

Not just Pack Hunt: **7 of 12 combos** went dead at Prime or Apex.

### Why the best grade, not the average

A combo is emergent anatomy, so it takes a grade too — **the best one among
the parts that unlock it**. That is not generosity, it is the only rule that
holds. A part's move scales by *its own* grade, so if the combo scales by
anything less than the largest, the better half of the pair overtakes the
combo it belongs to. Measured across every grade assignment in the roster:

| rule | dead assignments |
|---|---|
| min (weakest link) | 31 of 192 |
| mean | 10 of 192 |
| **max** | **0 of 192** |

And provably so: `combo > max(parts)` at base, and scaling both sides by the
same bonus cannot reorder them. All three variants are pinned in smoke —
reverting to flat, to min, or to mean each fails by name.

**Standard grade is untouched by construction** (grade index 0 → bonus 1.0),
which the win-rate table confirms: identical medians, identical flags. The
change only reaches chimeras someone actually raised.

### The gate was under-sampling

Checking the other grades turned up something worse than the bug being
fixed. R16's gate runs at Standard with `seedsPer: 4`. At Prime:

| seedsPer | `[OP]` flags across 10 pools |
|---|---|
| 4 | 0 |
| 8 | 1 |
| 12 | 3 |

The clean result was under-sampling, not a clean roster — the same failure
mode that produced three vacuous assertions two sessions ago. The gate now
runs at `seedsPer: 8`. Smoke goes 3.2s → 4.0s.

### Known issues
- **A pre-existing Prime outlier, deliberately not fixed here.** The
  `storm_eagle` purebred is the strongest build in the pool at every grade
  (mean rank 1.5/43 at Prime, +28.6pp over the median) and flags `[OP]` in
  3 of 10 pools at `seedsPer: 12`. It is **not** this change's doing: it
  carries no combo, and its win rate is 78% both before and after. It is a
  variant-species tuning question — storm_eagle trades 2–4 HP per part for
  +1 power and +1 speed, and it is Air, which beats Ground — so re-pricing
  it is its own pass, not a line in this one.
- **The `[OP]` gate therefore still runs at Standard only.** Extending it to
  every grade would need that outlier fixed first; a gate that passes only
  because it samples too coarsely to see a known outlier certifies something
  false, which is exactly what this session found. Next phase gets both.
- Two `[TRASH]` builds (2 of 10 pools) — randomly-sampled 3-part builds that
  win nothing. Pre-existing, unrelated.
- No save-schema change, so `SAVE_VERSION` stays **19**.

### Next session — first task
Re-price the `storm_eagle` variant against the Air matchup until Prime is
clean at `seedsPer: 12`, then extend the `[OP]` gate to all four grades.

## Session 28 — The balance gate ✅

**Acceptance criterion:** the sim reports no degenerate builds, and
re-introducing the old numbers fails the build rather than printing a
warning — **passes** (`node tools/sim.js` ends "no degenerate builds
flagged."; restoring 64/26/95 fails `tools/smoke.js` naming both pools).

### The flag that ran for a dozen sessions

`tools/sim.js` had printed the same verdict on every run since M4.5:

```
[OP] L · wolf:organ + tiger:head + scorpion:hindlimbs [standard]
     — 68% vs peer median 32% and 6.8 vs 9.2 turns — outlier
```

Nobody was obliged to read it, so nobody did. That is the actual defect;
the overtuned combo is just what it was pointing at.

### Diagnosis — three wrong answers first

Worth recording, because each wrong answer *looked* measured:

1. **"It's the double buff."** `wolf_organ`'s Rally Howl is the only part in
   all 184 with a two-axis buff. But variants that stripped it to one axis,
   and that tripled its cost, came back **byte-identical** — the sim's greedy
   pilot picks by power, and Rally Howl is power 0. It is never pressed.
2. **"It's the stamina economy."** Every part adds metabolic draw; only
   organs add regen, so the 3-part build nets +6/turn against a 6-part
   purebred's +1. Across the full 43-build pool `corr(winRate, regenNet)`
   is **0.048**. It is not the mechanism.
3. **"It's `tiger_head`'s Pounce."** Patching its power, cost *and* accuracy
   changed nothing at all. That impossibility was the tell.

The build's near-twin settled it: `L · skunk:organ + anglerfish:head +
tiger:hindlimbs` has an almost identical stat block (regenNet 6, stamina 70,
power 20, speed 1, mass 190) and wins **16%**. The difference was never the
stats. `sampleBuilds` generates a build from every combo, and this one is
the **`pack_hunt` combo** — wolf_organ + tiger_head — plus a random filler.
Every part-level patch was a no-op because the pilot only ever pressed the
combo move.

### The fix: price it, don't shrink it

Pack Hunt was 64 power for 26 stamina at 95 accuracy — the **best
damage-per-stamina of all twelve combos (2.34)** while also carrying
priority *and* a compounding powerUp. The roster's own pricing is visible
once the ladder is sorted: `live_wire` buys the top efficiency (2.32) with
**no keywords at all**, and every keyword-carrying combo sits below it.
Pack Hunt took both.

**64/26/95 → 58/28/92** (efficiency 2.34 → 1.91, seventh of twelve, below
`leap_year` whose priority+evasion is the weaker pair). It keeps its
identity — priority and the Rally powerUp — and stays a real upgrade over
its own Pounce.

| | win% | turns | rank | `[OP]` in 10 pools |
|---|---|---|---|---|
| before | 69% | 6.9 | 1 / 43 | **2** |
| after | 57% | 7.1 | 5 / 43 | **0** |

Accuracy did the last of the work deliberately. At 95 the build cleared the
detector by **0.5pp** — one content change from flaking. Cutting power
further instead would have made the move cost more than it returns and
turned a discovered combo into a trap, so 92 (matching `thunderclap` and
`depth_charge`) buys **+7.3pp** of headroom without that.

### The guard

Two assertions in `tools/smoke.js`, both verified to fail when broken:

- **The harness's verdict is now a build failure.** Six pools, because the
  sampler fills a combo's spare sockets at random and one pool only decides
  which fillers a combo wears — the same combo swings between rank 1 and
  rank 41 of 43 on filler alone. `seedsPer: 4`, not the sim's default 3: at
  three battles per encounter a win rate can only land on 0/33/67/100%, and
  that quantisation flags a clean roster on its own.
- **The opposite failure.** A combo weaker than the drawback-free moves of
  the parts that unlock it is dead content. This is the assertion that ruled
  out the cheaper nerfs.

Smoke goes 2.5s → 3.2s.

### Known issues
- **Combo moves don't get the grade bonus part moves do.** `GRADE_MOVE_BONUS`
  scales a part's move 12% per grade; a combo's move is flat. So a Prismatic
  Pounce is 71 against Pack Hunt's 58, and the combo stops being the right
  button. This is systemic and pre-existing — **7 of 12 combos** are already
  overtaken by their own parts at Prime or Apex, Pack Hunt among them before
  this change. The smoke assertion only checks base power, because making it
  grade-aware would fail the whole roster today. Best candidate for the next
  balance phase.
- Two `[TRASH]` builds (2 of 10 pools) — randomly-sampled 3-part builds that
  win nothing. Pre-existing and unrelated; the gate asserts on `[OP]` only.
- `combos.json`'s `_doc` says discoveries are "permanently logged in the save
  for the Splice-Dex", but `dex` has `parts`/`enemies`/`traits`/`variants` and
  no `combos` — they surface at splice time and are never persisted.
- No save-schema change this session, so `SAVE_VERSION` stays **19**.

### Next session — first task
Decide the combo/grade interaction above: either give combo moves their own
grade scaling and re-run the balance table, or state in data that combos are
deliberately flat and re-price the seven that fall behind.

## Session 27 — Screen density ✅

Nineteen waves of features had quietly stacked **thirteen cards into one
scrolling column** in the War Room: the econ row, counter-offensives, captives,
the jobs board, the region strip, their dossier, your dossier, rival labs,
containment and the news wire. Measured on a 380px phone with a busy late-game
save, that was **3,884px of scroll**.

### Five views behind a tab bar

| tab | holds |
|---|---|
| **Map** | the region strip and its assaults |
| **Jobs** | the operations board and heat |
| **Labs** | both dossiers and Rival Labs |
| **Bays** | containment and rehabilitation |
| **Wire** | the full news feed |

Median view is now **1,107px — a 71% reduction**; the heaviest (Labs) is
1,781px. The bar is sticky, so a long view is navigable from anywhere in it.

### The rule the whole layout rests on
**Alerts never go behind a tab.** A rescue window and a counter-offensive both
carry live countdowns that cost a creature or a node when they run out — hiding
either on a view the player is not looking at would recreate exactly the
failure mode region contestation was designed to avoid. The econ row and both
alerts sit above the bar and render on every view.

Smoke enforces it by scanning `campaign/ui.js`: the alerts must not appear
inside the view map, must still be rendered, and must appear *before*
`subtabBar` in the template. Every tab in the bar must have a view behind it,
and an unrecognised tab must fall back to the map rather than a blank screen.
All five guards verified to fail when broken — including one that adds a sixth
tab with nothing behind it.

### Badges are a promise
Only two things earn one: an **unread job report** and an **occupied bay**. A
badge on every tab teaches players to ignore the badges that matter, so Map,
Labs and Wire carry none.

### Two things fixed along the way
- The econ row used `auto-fit, minmax(90px)`, which drops to three columns at
  380px and leaves **Record dangling alone on a second row** beside an empty
  half. Invisible before; conspicuous the moment the card became permanent
  chrome above the tabs. Now four fixed columns, two at very narrow widths.
- The alert cards' chrome is paid for on all five views, so their padding and
  heading margins were tightened. Worth 44px off every screen.

Tab state is deliberately module-level rather than saved: it survives the
re-render on every tick and every action, which is what matters, and costs no
save migration to do it that way. **No save version change in this phase.**

### Next session's first task
Open, and worth picking from: the balance harness has flagged the same
degenerate build every run for a dozen sessions (`wolf:organ + tiger:head +
scorpion:hindlimbs`, 67% against a 30% peer median); onboarding still ends at
first conquest and predates fourteen shipped systems; and audio is still a
handful of ZzFX stingers.

## Session 26 — Injury scarring ✅

> §3.5: "Battle injuries → Infirmary timer; untreated injuries can scar into
> permanent trait tradeoffs (cartoony: 'Chompers now fears jeeps. +Evasion vs.
> vehicles, −Accuracy vs. vehicles')."

An injury has always opened a timer and then quietly expired. There was nothing
to do about it and no consequence for doing nothing. Now there is both.

### The choice
**Treat it** at the Infirmary and it clears clean — the bill scales with how
much of the injury is left, so an early visit costs more than sweeping up at
the end. What you are buying is *certainty*, not healing.

**Leave it** and there is a 34% chance it sets badly and stays.

### Every scar is two-sided
This is the whole design, and smoke enforces it: a scar must give something
*and* take something. That makes a scar **character rather than damage** — so a
player who slept through the treatment window gets something interesting, not
something ruinous, and because several scars are net *good* for a particular
build, "leave it and see" is a real strategy rather than a mistake.

Ten scars, four of them narrowed by a `vs` tag, which is what makes the
roadmap's own example literally expressible as data:

> **Jeep Shyness** — +14% evasion, −10 accuracy *vs Vehicle*
> "Goatzilla has developed strong opinions about anything with an engine, and
> gives it a wide, twitchy berth."

Measured in the real engine over 200 fights: a jeep-shy creature hits a Police
Cruiser **79% → 70%** of the time and is hit back measurably less — and is
**exactly, identically unchanged** against a Riot Squad. The scar is about
vans.

Bounded, too: never the same scar twice, never more than three, and a scar
never keeps a creature benched — the injury always clears on schedule either
way.

### Kept honest
~35 new smoke assertions, each verified to fail when the code it guards is
broken. Two needed the *test* fixing rather than the code, and both were the
same mistake — **sample size**:

- The accuracy assertion ran 30 fights to detect a 9-point gap. With the code
  deliberately broken it still passed, because the RNG stream diverges slightly
  and 30 samples is noise. At 200 it catches it cleanly (79% vs 80% broken).
- The no-duplicate-scars check ran one career. Three draws from a pool of ten
  collide about a quarter of the time, so one career proves nothing; it now
  runs eighty.

The bidirectional service-worker precache check added two sessions ago earned
its keep immediately — it caught `data/scars.json` and `splice/scars.js` before
I had got round to adding them.

Save **v19**; `sw` cache `spliceworld-v19-scars`. Nobody is retroactively
scarred for injuries taken before the Infirmary sold treatment.

### Next session's first task
Every clause of the v0.1 spec is now built. The only remaining roadmap item is
**async ghost defences**, which has always been marked "multiplayer — later";
a full plan for that is written up separately.

## Session 25 — Chimera extraction & temperament ✅

Two promises from the main spec that were written into the roadmap and then
never built.

### Extraction (§3.3)
> "Chimeras (yours or captured) can also be extracted — returns a **subset** of
> parts, one grade degraded. Salvage, not free recycling."

This is the Surgery Theater's missing undo. Splicing consumes vault tokens
permanently, so until now a chimera was a **one-way sink**: a build you
regretted, a chaos-vat reject, or a rehabilitated creature carrying anatomy you
wanted somewhere else all just sat in the Pens forever.

Two costs keep it honest — you get back only 50–80% of the sockets, and what
comes back is a grade poorer. Measured over 60 dismantles of prismatic
six-part chimeras, **the vault gets back well under three-quarters of the grade
value that went in**. Which parts survive is seeded on the chimera itself, so
the confirmation sheet lists exactly what you will get, by name and by
was-grade, and reloading cannot reroll it.

### Temperament (§3.5)
> "temperament on two axes (Brave–Skittish, Fierce–Gentle), seeded by dominant
> donor species + drifted by how you raise them … Never removes player control."

Every chimera has carried `temperament: null` since M3 behind a comment saying
"seeded on settling — later milestone". It now is.

**Seeded by the anatomy.** The dominant donor species — whichever put in the
most parts — supplies the bias, so a shark build comes out Fierce because it is
mostly shark. Biases are keyed by species **role** rather than by species, so a
designer writes "Walls are calm and steady" once instead of thirty-two times,
with `bySpecies` overrides where a particular animal has character its role
misses.

**Drifted by how you raise them.** Every existing verb now shapes who the
creature becomes: training makes them braver and gentler, winning makes them
fiercer, going down makes them warier. Both axes are bounded, so a long career
cannot run away.

**Perks are passive stat effects only** — §3.5's "never removes player control"
rules out anything that takes a turn away, which is obedience's job and only
obedience's. Brave lands telling blows below 30% health; Skittish is hard to
hit on the opening exchange; Fierce hits harder but guards worse; Gentle paces
itself and recovers stamina faster. They express only past a threshold and
scale with how far past — one point over the line is worth nothing.

Balance impact, measured against the identical roster with temperament
disabled: **mean +1.2pp win rate, max +12pp**, and much of that spread is RNG
stream divergence rather than the perks (the crit check consumes a roll). The
Fierce guard penalty is a real cost, so defensive builds lose a little where
aggressive ones gain.

### One fragile old test, replaced
The grade-ladder assertion compared the **maximum** boss win rate across builds
at two seeds per build. That saturates the instant one lucky build goes
two-for-two — it was reporting "100% at standard grade" off two coin flips, and
duly broke the moment anything nudged the RNG stream. It now compares the
**mean** across the whole ladder, which is what the claim actually means and
checks three steps instead of one: 5% → 20% → 47% → 73% from standard to
prismatic.

### Kept honest
~40 new smoke assertions, each verified to fail when the code it guards is
broken. Four needed the *test* fixing: my drift checks called the drift
functions directly rather than through `trainChimera` and the battle aftermath
(so breaking either call site went unnoticed), the dominance fixture happened
to be alphabetical as well as dominant, and the damage measurement read the
*next wave's* health because the target died in one hit. Browser pass at 380
and 320px: temperament on the Pens cards, the dismantle sheet with its exact
preview, and a v17 save migrating and seeding temperaments on the next tick. No
console errors.

Save **v18**; `sw` cache `spliceworld-v18-temperament`.

### Next session's first task
Both backlogs are now clear. What remains unbuilt from the spec: **injury
scarring** (§3.5 — "untreated injuries can scar into permanent trait
tradeoffs"), and **async ghost defences**, which the roadmap has always marked
multiplayer-later.

## Session 24 — Chaos-breeding ✅

Ranch breeding pairs two **animals** of one species and produces a predictable
hybrid of their stats. The Chaos Vat is the other thing: two finished
**chimeras** go in and a genome neither of them was comes out.

### The problem is economic, not genetic
A chimera costs vault tokens permanently, and — unlike livestock — carries no
upkeep. So an offspring bought with only money and time is a duplication
glitch: breed two, breed the two you got, field an army you never paid for.

The price is therefore paid in **grades**, which is this game's real power
currency. Both parents permanently drop one grade on every part. A five-socket
pair gives up ten grade steps and returns five, so the exchange is strictly
deflationary and a line running on its own output slides down the ladder:

| generation | child power vs founders |
|---|---|
| 1 | 96% |
| 3 | 85% |
| 6 | 80% |

Six generations took a pair of prismatic founders to a roster averaging
standard/prime. The only way back up is crossing freshly-raised, well-graded
stock back in — which is exactly the ranch loop the whole game is built on.

**One ordering detail is load-bearing** and now has a comment and an assertion
holding it in place: the child is conceived from the parents *before* they pay.
Degrade first and the offspring inherits the damage, the operation becomes
strictly destructive, and nobody would ever use the vat.

### Why you would do it anyway
**The vat does not read your permits.** Measured over 200 gestations:

| | |
|---|---|
| child beats its best parent | 7–16% (max seen: 130%) |
| carries a part from neither parent | 54% |
| gains a socket neither parent had | 19% |
| comes out on a frame neither parent used | 7% |

That socket clause is the one that makes this more than recombination — a
second organ bay before you own Theater Tier II. It measured **zero** before I
added it, because the union of two five-socket parents is, inevitably, five
sockets. The wild cards draw from the **Splice-Dex**, so chaos is always
anatomy you have already seen and never a gift from the end of the game.

An emergent nicety worth recording: prismatic parents beat their best parent
only 7% of the time against prime's 16%, because prismatic can only degrade.
**Chaos-breeding is for the middle of your roster, not the top.**

### Kept honest
~30 new smoke assertions, each verified to fail when the code it guards is
broken. Four needed fixing rather than the code: my fixture gave both parents
identical sockets (so the carry-over rule never ran), granted the full parts
list as the Dex (so the wild-card pool was untestable), and left the
cancel-refund check loose enough to pass either way. Browser pass at 380 and
320px: the two donor pickers, the price warning, sealing, the countdown,
decanting into the Pens, and a v16 save migrated live. No console errors.

Save **v17**; `sw` cache `spliceworld-v17-chaos`.

### Next session's first task
The post-v0.1 backlog is empty. Still unbuilt from the main spec: **chimera
extraction** (§3.3 — "chimeras can also be extracted, returns a subset of
parts, one grade degraded"), which is the other way to recycle a chimera and
would pair naturally with the vat; and **temperament** (§3.5), which every
chimera carries as `null` and nothing has ever set.

## Session 23 — The Jobs board ✅

The complaint was "I keep losing so I have no money to get new animals to
breed." That is not a difficulty problem, it is a **structural** one, and
measuring it first made the shape of the fix obvious.

### What the numbers said
A player holding no nodes has:

| | |
|---|---|
| net income | **$22/day** (a $40 stipend minus $18 upkeep) |
| Mail-Order catalog | **exactly two species** — Goat and Ram |
| route to Water anatomy | none |
| route to Air anatomy | none |

Every Water and Air species is gated behind `checkpoint`, `precinct` or
`guard_post`. So a losing player cannot obtain the counter-class anatomy the
class triangle says they need in order to stop losing. A spiral with no floor.

### The board
Seven heists, on real-world timers, paying money **and livestock**. Four rules,
all load-bearing and all asserted in smoke:

1. **Something is always runnable** — no territory, no notoriety, no chimera,
   no particular anatomy. Three of the seven can be run by going yourself.
2. **Failure never costs a creature.** Time and a bruise, nothing else. You
   cannot punish a losing player for trying to stop losing.
3. **`demands` improve the odds; they never gate the job.** Requiring Aquatic
   anatomy before you may rob the aquarium that would *give* you Aquatic
   anatomy is the same circle in a smaller hat. A plain goat chimera robs the
   aquarium at 62%; a shark build does it at 95%.
4. **Heat is the price** — and a mechanic, not a nerf. Trimming payouts to cap
   the ceiling would have punished exactly the broke player this board is for.

### Two tuning passes worth recording
**Heat had to become exponential.** Linear decay is bang-bang: heat either
drains to zero or pins at the cap depending on which side of the drain rate
your job rate happens to sit, with no useful middle. A half-life gives a smooth
equilibrium that scales with how hard you push. Measured at launch:

| cadence | heat | odds | 7-day take |
|---|---|---|---|
| once a day | 6 | 70% | $889 |
| three times a day | 23 | 63% | $1,751 |
| cycling all evening | 32 | 60% | $2,974 |

Diminishing returns for the grinder, nothing at all for the casual player, and
full territory ($1,575/week) is still passive and still gates the catalog, the
facility tiers and the rivals.

**The loot lists had to be trimmed.** My first draft let the aquarium yield
Octopus and the reptile house yield Crocodile — both `guard_post` fauna — and a
smoke assertion caught that conquest was then adding almost nothing to the
catalog. Jobs now hand over the **entry** animal of each class (Frog, Bat,
Eagle, Cobra) and conquest keeps the good stuff. Over the whole campaign, 60%
of the catalog is still beyond any job, and nothing stealable is within 70% of
the top price.

### Does it work?
A broke, node-less player with one plain goat chimera, checking in once a day,
has **$889 and four animals after a week** against $150 and no options before.
Checking in three times a day they have Water and Air stock inside two days —
which is to say, the game becomes playable again from a standing start.

25 new smoke assertions, each verified to fail when the code it guards is
broken. Browser pass at 380 and 320px: the board above the map, the crew sheet
showing per-candidate odds *and why*, a job in flight, a warp to the report,
the stolen animal in the pens, and a v15 save migrated live. No console errors.
One UI fix along the way: seven four-line rows turned the board into a wall, so
the blurbs moved to the crew sheet where they are read at the decision point.

Save **v16**; `sw` cache `spliceworld-v16-jobs`.

### Next session's first task
Chaos-breeding of chimeras. *(Shipped in Session 24.)*

## Session 22 — The monologue pass ✅

§3.8 has said this since the roadmap was written: *"Player profile uses the
same schema (name your geneticist, pick a philosophy tagline) — the villain-
monologue feature drops in later with zero refactoring."* Later arrived, and
it did drop in without a refactor, which is the nicest thing you can say about
a schema you wrote nineteen sessions ago.

### You are now somebody
A **Your Dossier** card sits next to the Rival Labs — deliberately the same
furniture, because the player is a villain in the same schema. It carries a
title, a name, a lab and a **philosophy**: five voices (Improver, Collector,
Showman, Naturalist, Engineer), each with its own tagline and its own set of
monologue slots.

**A philosophy is narrative only, and smoke enforces it** — it asserts a
philosophy object carries exactly `id / name / tagline / blurb / monologue` and
nothing else. Anatomy is where this game keeps its mechanics; a stat bonus
hiding inside a flavour menu would be the exact invisible modifier the class
triangle was built to replace.

**Names are rolled, not typed.** No screen in this game may render a native
form control, and on a phone a seeded generator beats a keyboard anyway: the
picker offers six candidates from ~2,300 with a re-roll, and the same roll
always offers the same six so a reload mid-choice is safe.

### A duel is now a conversation
The rival opens, you answer, and both lines are attributed by name — a log of
anonymous quotation marks tells you nothing about who is gloating. The exchange
is kept as `battle.opening` as well as in the log, because a story beat you can
only find by opening a log overlay is a story beat nobody reads: it takes over
the message box before turn 1 and taps away. A patrol gets none of this; you do
not monologue at a riot squad.

### Every slot has a caller now
`dissectionTaunt` had been sitting in `rivals.json` for **three sessions with no
caller** — written, shipped, never once seen by a player. So the pass added the
slots the events actually needed and wired all of them:

| slot | fires |
|---|---|
| `intro` / `victory` / `defeat` | the duel, both voices |
| `dissectionTaunt` | a rival takes one of your chimeras |
| `dissectionDone` | the rescue window closes on it |
| `defection` | you rehabilitate one of *their* specimens |
| `rematch` | they iterate after another defeat |
| `conquest` / `capture` / `rehab` / `graduation` | your voice, in the news wire |

And the assertion that stops it happening again: **every monologue slot must be
reached by a caller in the source**, checked statically. Two lines were already
dead when I wrote it — the player's `rehab` slot and `startRehab`'s own news
line, which the War Room was dropping on the floor.

### Two bugs found along the way
- **`campaign/rehab.js` and `campaign/contest.js` were never added to the
  service worker precache** — shipped in the last two sessions, and the offline
  shell would have failed on both. The existing assertion only checked
  *precached → exists*; it now checks both directions, and the reverse check is
  the one that bites.
- Three of my own new assertions were **vacuous**: half these lines open with
  `{creature}`, so "text before the first placeholder" was the empty string and
  `includes('')` is always true. Replaced with a fragment helper that takes the
  longest literal chunk and asserts it found one.

Also worth recording: the browser QA was reading a **stale `battle/ui.js`** out
of Chromium's HTTP cache for part of this session. Not a product bug — the
service worker is network-first — but the QA harness now disables the HTTP
cache, and the previous two sessions' browser results were re-run and confirmed
under it.

25 new smoke assertions, each verified to fail when the code it guards is
broken. Save **v15**; `sw` cache `spliceworld-v15-monologue`.

### Next session's first task
The post-v0.1 backlog is down to chaos-breeding of chimeras and async ghost
defences. Neither is started; both want a design conversation first.

## Session 21 — Region contestation ✅

Conquest was one-way. You took a node, it paid income, and that was the end of
the story — territory was a number that only went up, which is exactly the
shape endless mode goes stale in (§8, risk 5). The coalition now comes back
for it.

### Two rules, both load-bearing
- **The schedule is a timestamp, not a per-tick roll.** Rolling on each tick
  would mean a player who opens the app ten times an evening gets attacked ten
  times as often — the frequency would measure their habits, not the world.
  Smoke asserts that fifty ticks inside the window open nothing.
- **The window starts when you SEE it.** Come back from a week away and the
  convoy is arriving *now*, with your full 18 hours ahead of you. Losing a node
  to a window you were never shown is the kind of surprise the rescue-window
  house rule exists to forbid. A week away produces exactly one counter-
  offensive, not fifty.

### The fight
The defence is the node's **own garrison**, escalated — no new encounter data,
which is the whole reason this can be the endless-mode content engine. The
escalation grows every time you hold the same place, so the ramp is opt-in and
self-paced instead of front-loaded.

**The escalation had to become a continuous dial.** The first draft stepped the
authored tier by one and added a reinforcement wave. Measured against the
harness's yardstick team of three at prismatic, that was catastrophic:

| node | assault | +1 tier & +1 wave | +10%, same garrison |
|---|---|---|---|
| Old Barn | 100% | 25% | 100% |
| Downtown | 100% | 0% | 98% |
| Checkpoint | 93% | 22% | 88% |
| Precinct HQ | 30% | 0% | 12% |
| Guard Post | 55% | 3% | 42% |

The tier ladder is a ladder of *content* and its rungs are deliberately uneven,
so it is the wrong dial for "the same fight, but harder": +1 tier on an
already-top-tier boss is a wall while +1 on a mid encounter is a shrug. The
engine's `tierScaleFor` now honours a `scaleOverride`, and a defence is the
authored scale × 1.10, +0.10 per successful defence.

**Node choice went uniform, too.** Weighting it by income reads beautifully —
"they go for the throat" — and plays badly: your richest node is the commander's
HQ, which is also the hardest fight on the ladder, so almost every counter-
offensive landed on the one you were least able to answer.

### Stakes
Contested income is **suspended** — that is the sting, and it is why answering
beats ignoring even when you could retake the node later. Holding the line pays
a 1.6× purse, notoriety, and **the wreckage**: one vehicle from the garrison
goes to Containment, because a conquest reward has to expand what you can
*build* with (Law 2). A garrison of people leaves nothing behind, which is
correct; a commander does, once you follow his transform, so what you impound
at the Precinct is the Clampdown 9000 you actually beat.

Lose the defence, or let the window close, and the node drops back onto the map
as an ordinary objective. A setback, never a deletion.

### Kept honest
25 new smoke assertions, every one verified to fail when the code it guards is
broken. Three of them didn't discriminate on the first pass — the concurrency
cap was never actually tested, the wreckage transform chain was never reached,
and the Splice-Dex assertion was already satisfied by the conquest that set the
fixture up. Fixed the tests, not the code. Browser pass at 380 and 320px: the
alert card, the map state, the suspended-income line, the briefing quoting
110% strength, a real defence launching into the arena at `enemyScale 1.595`,
and the window closing to take the node. v13 → v14 migrated live, no console
errors.

Save **v14**. `sw` cache `spliceworld-v14-contest`.

### Next session's first task
The monologue/story pass on the rival profile schema. *(Shipped in Session 22.)*

## Session 20 — Rehabilitation ✅

§3.6 always promised a captured chimera two futures — "salvage its engineered
parts **or**, post-v0.1, rehabilitate it into your roster." Only the bandsaw
was built. Now the other one is.

### The fork
A Containment bay shows both offers with their real numbers before any money
moves:

| | costs | yields |
|---|---|---|
| **Salvage** | nothing, instantly | its parts, at the grades its old lab raised |
| **Rehabilitate** | a fee, a real-world clock, and those parts | the whole creature |

Picking one forecloses the other: a specimen in the programme cannot also be
dismantled, and pulling out returns it to the bench but not the fee.

### It is a facility purchase, not a new system
The whole feature is gated by a **Containment track in `facility.json`** — the
same shape the Surgery Theater already uses, so `nextUpgrade`/`buyUpgrade` and
the Ranch's Facility card picked it up with zero engine edits. Tier II (the
Reorientation Wing, $700, needs the Checkpoint — exactly when rival chimeras
first become capturable) unlocks it; Tier III (the Enrichment Annexe, $1800,
needs the Precinct) halves the clock and takes a third off the fee. `grants`
carries `rehab` / `hourScale` / `feeScale`; `tuning` carries the rest.

### Two knobs, deliberately separate
- **The clock releases it.** Length scales off the specimen's power and
  instability. Enrol one and forget about it and it still graduates — bond 0,
  and it will freelance on you until you train it.
- **The sessions decide who walks out.** Each buys bond and shaves
  instability.

The first draft let sessions take hours off the clock *as well*, which quietly
made the **shortest** programmes — the scrappiest, easiest specimens — the ones
you could invest in least, because the curriculum no longer fit inside them.
Smoke caught it on session 4. The gap between sessions is now a share of the
programme's own length, so the whole curriculum always fits however short the
programme is, and the clock never moves.

### What graduates
A real chimera, not a trophy. It keeps its name (it was somebody before you met
it), its chassis, and its grades; its parts become vault-shaped tokens whose
lineage names the specimen, so it extracts and salvages later like anything you
built. It arrives **settled** — the programme was the settling — and **wary**:
its old instability plus a wariness penalty, minus whatever the sessions bought.

The pitch is that it is off-menu. The acceptance test rehabilitates Professor
Trench's L-frame specimen and then asserts the player's own Tier I Theater
would refuse to assemble it.

### Kept honest
16 new smoke assertions, every one verified to **fail** when the code it guards
is broken — including the two-organ socket guard, which no rival build
exercises, so it got a fixture of its own. Browser pass at 380 and 320px: the
fork, the countdown, an enrichment session, a reload mid-programme, a warp past
the deadline into the Pens, and a v12 save migrated live (legacy bays gain ids
and still salvage). One real bug found and fixed: the "needs the Reorientation
Wing" pill inherited `flex: 0 0 auto` from the node tags and walked the page
sideways at 380px.

Save **v13**. `sw` cache `spliceworld-v13-rehab`.

### Next session's first task
Region contestation — the coalition counter-attacking a held node. *(Shipped
in Session 21.)*

## Session 19b — Colour tokens, five schemes, and Biohazard shipped ✅

Every colour in the game is now a semantic token. 83 hardcoded hexes had crept
into `style.css` over eighteen sessions; they are all gone, replaced by a
palette of surfaces (ink / panel / panel-2 / well), roles (danger / warn / hp /
sta) and the three class colours. `--goo` and `--zap` survive as aliases so 200
existing rules did not need rewriting.

**A scheme is one block of variables.** Five ship in `style.css`:

| id | character |
|---|---|
| `lab` | today's palette — indigo, acid green, violet |
| `biohazard` | charcoal, toxic lime, hazard amber |
| `vivarium` | sea-navy, aqua, hot magenta |
| `blueprint` | slate, cyan, warm cream on ochre |
| `saturday` | warm plum, tangerine, mint |

**Biohazard is the shipped scheme.** It lives in `:root` rather than behind an
attribute, so a fresh load paints it before any JS runs and the manifest's
`theme_color` has something true to point at. The old indigo moved to
`[data-theme="lab"]`, and `settings.theme` / `?theme=` still reach all five —
the default deliberately is *not* recorded into saves, so changing it stays a
one-line change rather than something every existing lab is pinned against.

One rule the schemes are built around: the **class colours stay
distinguishable in every one**. Ground/Water/Air is a mechanic, so it never
collapses into a scheme's accent. That is also the argument against keeping
`lab`: its violet is both the brand's second colour *and* the Air class.

### Next session's first task
The remaining backlog: rehabilitation of captured chimeras, region
contestation, the monologue pass.

## Session 19 — The arena is one screen ✅

The complaint was that a fight was a scrolling column of panels, not a fight.
It is now laid out the way turn-based creature battles have been laid out since
1996.

### Staging
- Foe **up and to the right**, you **down and to the left**, each on a lit
  platform. Both **face each other**: everything is drawn facing right, so the
  foe's zoom wrapper is mirrored — and because the sprite is that wrapper's
  child, one set of keyframes reads correctly on both sides (three flipped
  keyframe copies deleted).
- HP boxes are **overlaid on the field** in the opposite corners, Pokémon-style:
  name, class chip, remaining-fighter pips, HP bar, status as icons. Yours adds
  stamina, and the Containment Cannon bar only when there is something to
  capture.
- A zoom wrapper crops the renderer's generous viewBox padding so a chimera
  fills its slot — and enemy *units*, whose viewBox is already tight, are told
  apart by a `kind-` class so a Riot Squad does not get its helmet cropped off.

### One screen, no scrolling
`body.in-battle` locks the shell to `100dvh`, hides the tagline, shrinks the
header and tabs, and lets the stage flex. Everything that used to be a stacked
panel is now an overlay or one tap away:
- the **battle log** moved behind a ▤ button on the message box,
- the **team tray** became pips on your HP box,
- **moves past four** live behind a "More moves" cell that opens the existing
  picker sheet, with the same effectiveness badges.

Verified to fit with the command menu fully on screen at **320×568, 360×640,
390×780 and 412×915** — the stage flexes from 279px to 594px.

### The command menu
A 2×2 of moves (name, power, cost, and what it will actually do to the fighter
in front of you) over a utility row of Breath / Switch / Retreat / Cannon.
`pendingReplace` swaps the grid for the bench; a charging move gets its own
release cell.

### Verified
`node tools/smoke.js` and `node tools/bounds.js` green (the engine is
untouched — this is a renderer change). CDP: a patrol and a rival duel end to
end, floats and KO animation firing, the More-moves sheet, the log sheet,
`in-battle` cleanly removed when the fight ends or you change tabs, and no
console errors at any of the four viewports.

### Next
Colour schemes: five palettes for the whole game, to pick from.

## Session 18 — Variants via mutation ✅

The third kind of mutation, deferred since M6 with a comment in `breeding.js`
that said so. §3.2: *"very rarely a variant species (Alpine Ram from Ram,
Abyssal Shark from Shark) — variants are the cheap roster multiplier."*

### Six species for six JSON objects
A variant declares `variantOf` and **inherits its base's anatomy** through
`tools/gen-parts.js` — same shape families, same signature ability — while
carrying its own palette, tags, thermal band, set bonus and `statMult`. Roster
25 → **31 species, 148 → 182 parts**, no new shape code.

| variant | from | it becomes | it gives up |
|---|---|---|---|
| Alpine Ram | Ram | +50% armour, +30% HP, Armored | speed |
| Abyssal Shark | Shark | +50% armour, +30% power | speed, regen |
| Thunderhead Eagle | Eagle | **Electric on every strike** | a quarter of its HP |
| Glider Skunk | Skunk | a patagium: its limbs vote **Air** | power, HP, armour |
| Iron Tortoise | Tortoise | double armour, +40% HP | half its speed |
| Pale Cobra | Cobra | +35% power | HP and armour |

### The sidegrade contract
A variant that is better at everything makes its base **dead content** the moment
you breed one. So smoke asserts every variant gives something up *and* gains
something, and measures it: purebred variant vs purebred base at apex, team of
three, gave Ram 62% / Alpine 64%, Shark 73% / Abyssal 73%, Cobra 3% / Pale 2%.

Two failed that bar on the first pass and were re-tuned rather than shipped:
- **Alpine Ram at 48% vs 62%** — Wall role × `statMult` double-dipped the same
  stat, so it hit softer *and* slower. It is a Punisher now, with its damage
  back at parity and armour/HP as the actual trade.
- **Glider Skunk at 0% everywhere** — a blanket `moveTag: Gas` put Gas on every
  damaging move, and Gas does **zero** to vehicles, which are half the roster.
  Its real mutation is the patagium; Gas stayed on the Stink Gland where it
  belongs. It sits at 90% now — below the Eagle among Air builds, which is the
  honest comparison once a variant changes class.

### Bred, never bought
`mailOrderPrice: null` on all six, asserted against the live catalog rule. They
arrive as the rarest branch of the existing mutation roll (30% of the 8% that
fires, and only where the stock has a variant to become) — measured at **under
10% of eggs from ordinary parents over 400 rolls**.

Then heredity does the work the roadmap wanted: **a variant breeds true.** Two
Alpine Rams give an Alpine Ram >70% of the time; a cross with a plain Ram gives
both, so a lucky mutant is worth crossing back into a good line rather than
kept in a corner. `canBreed` compares **base stock**, so an Alpine Ram is still
a ram.

### A regression this phase surfaced
The generic forelimb and hindlimb abilities shared a name (`Goat Strike`), and
last session's duplicate-move guard matched on name alone — so **every species
had been quietly losing its Ground-tagged kick**. Hindlimbs got their own name
(`Goat Kick`), the guard now matches the whole move, and smoke asserts arms and
legs are different moves for every species.

### It also fixed a structural shortage
Air had **four parts in the entire game** — flagged twice in earlier sessions.
The Glider Skunk's patagium and the Thunderhead's wings take it to **eight**.

### Verified
`node tools/smoke.js` green with a new variants block: the sidegrade contract,
anatomy inheritance, never-in-the-catalog, lineage helpers, the picker and the
breeding rule agreeing on who may pair, true-breeding rates, mutation rarity,
the Dex trophy firing once, variant extraction, and the move-name regression.
Four assertions deliberately broken to confirm they bite. `bounds` clean, the
difficulty curve unmoved by a 24% bigger roster (33/47/62/75), `--plant` caught.

CDP at 380px: v11→v12 migration, the Dex trophy case locked (0/6) then unlocked,
a variant pair breeding and hatching, both ceremonies (**NEW VARIANT SPECIES**
and **THE LINE HOLDS**), the incubator naming base stock so the hatch is not
spoiled, and extraction yielding Alpine Ram parts.

### Known issues
- A variant that changes class changes matchups by a lot — the triangle doing
  its job, but it means Glider Skunk vs Skunk is not a like-for-like comparison.
  The AI director does read such a stable as Air and answers it.
- Pale Cobra inherits the cobra's limbless corner: both are weak purebreds.

### Next session's first task
Open. Remaining backlog: rehabilitation of captured chimeras, region
contestation, and the monologue/story pass.

## Session 17 — Theater Tier II, and a Facility to buy it from ✅

ROADMAP §3.4 has always said "Organ ×1, **×2 at Theater Tier 2**", and §3.10 has
always said upgrades are menu purchases. Both landed together, because a second
organ bay you are simply handed is not an upgrade — it is a balance change.

### Socket ids, not slot types
The genome was `{ frame, parts: { slot: partId } }`, so a second organ had
nowhere to go. Now `parts` is keyed by **socket id**: usually the same string as
the slot type, except where a frame offers more than one bay. `organ2` resolves
to slot type `organ` via `slotOfSocket()`.

The payoff is that **every genome ever saved is still a valid genome** — old
saves simply never mention `organ2`. `validateGenome`, `validateSplice` and
`spliceChimera` all moved to socket ids; `spliceChimera` in particular now keys
`chimera.tokens` by the socket the player *chose*, not the part's slot, or two
organs would quietly collapse into one bay.

### A Facility, not a hardcoded tier
`data/facility.json` declares tracks of levels, each carrying `grants`. The
Surgery Theater asks what frames and sockets it may build with; it does not
know what a "tier" is. Adding Tier III, or the Gene Scanner and Extractor
tracks §3.10 names, is a JSON edit.

- **Tier I — Card Table & Optimism**: S and M frames, six bays.
- **Tier II — The Rumbler Rig** ($900, requires holding the Highway
  Checkpoint): the **L-class chassis** and the **second organ bay**.

Gated on money **and** territory, because Law 2 says conquest must expand
creation. All the money in the world will not skip the objective, and the
objective will not skip the money — both asserted.

### Never take a frame away
The L frame used to be free to everyone. Rather than repossess it, the v11
migration **grandfathers** any save that has ever built on one straight to Tier
II. Verified in the browser both ways: a v10 save with an L chimera lands on
Tier II, one without lands on Tier I.

### What the money buys, measured
+5pp at standard, **+9pp at prime and apex**, +4pp at prismatic (team of three,
median build) — a real upgrade that does not break the curve the last session
built. No new degenerate builds at any grade. On one creature: an apex gorilla
Rumbler goes 146→155 HP and 72→86 stamina with a wolf organ in the second bay,
for 5 more mass.

Two bays of the *same* organ stack their stats but no longer produce two
identical move buttons — Tier II made that possible for the first time.

### Details that would have been bugs
- The physiology panel's Chassis row counts the bays you can actually fill, so
  it says `6/7` at Tier II instead of quietly congratulating you at `6/6`.
- `tools/bounds.js` now checks every socket a slot can occupy, not one per slot
  type, so a badly-placed future bay is caught the same way a cropped tail was.
- A draft holding a locked frame or bay corrects itself silently instead of
  erroring at the player.

### Verified
`node tools/smoke.js` green with a new Tier II block — socket/slot resolution,
every frame carrying the bay, the two-part gate, the Theater refusing the
Rumbler *by name* and the second bay *separately*, a seven-socket splice that
renders, and the stat/move contract. Four assertions deliberately broken to
confirm they bite. `node tools/bounds.js` clean; `--plant` still caught.

CDP at 380px: both migration paths, the locked Facility card naming both
blockers, the purchase (funds charged, news line, track maxed), the Theater at
Tier I with the Rumbler struck through, then Tier II with seven bays — filled
all seven, spliced, and the creature renders with **both organ glyphs visible**.

### Known issues
- The Facility has exactly one track. Gene Scanner, Extractor efficiency,
  Infirmary speed and Containment Cannon mk2 are all the same shape when their
  systems are ready for them.
- `organ2` is the only extra bay; a Tier III with a second hide or forelimb pair
  would need socket geometry, not new plumbing.

### Next session's first task
Open. The remaining backlog is variants via mutation, rehabilitation of
captured chimeras, and region contestation.

## Session 16 — AI Director: the world studies you ✅

The tracking stub has been collecting `directorStats` since M0 on the promise
that something would eventually read it. This is that session.

### What it reads
Three inputs, in rising order of how much they sting:
1. **your live stable** — and per *creature*, by the same majority vote the
   battle engine uses, not per part. That distinction is the whole mechanic:
   ~32 parts vote Ground against Air's 4, so a part-count read calls every
   stable "Ground" and diversifying buys you nothing. (`rivals.js` had the
   same bug; both now share one definition.)
2. **your splice history** (`directorStats.partUse`), for tags.
3. **every dissection you let complete** — weighted as exactly one creature
   you are still fielding. Enough to tip a balanced stable back into being
   legible; not so much that a single loss is a permanent tax.

### What it does
`data/director.json` declares seven counter-rules — what each *reads* (player
tags and/or a class) and which roster units answer it. The director rewrites
**one wave slot**, under hard constraints found by measuring, not by guessing:

- **Never the opening beat, the final wave, or anything that transforms.** The
  first draft cheerfully swapped Captain Clampdown out of his own boss fight.
- **Never a mercy rule.** It replaces the *flimsiest* expendable slot and only
  with something at least as heavy; if nothing there is expendable it sends an
  **extra** wave instead. The first draft made `air_patrol` go 23% → 90% for an
  Armored build by replacing the helicopter with a counter that was weaker.
- **A budget, not a tier threshold.** It starts with one encounter — the
  hardest, where the budget is — and reaches further down as you take territory
  and lose creatures. Tiers are lumpy (four encounters share tier 3) and
  crossing one wholesale turned a pressure into a **-22pp wall**.

### Measured
Tax on the median build, all-Ground stable, team of 3, apex: **-2pp** early
(1 encounter adapted) rising to **-20pp** deep in a campaign with dissections on
file (6 adapted). Against the stable it actually read, on the encounter it
rewrote: Ground 98% → 75%, Water 35% → 10% on `military_response`.

**The escape hatch works, and it is the point:**

| stable | reads | tax |
|---|---|---|
| committed to one class | that class | **-13 to -16pp** |
| one of each | nothing — no dominant class | **-2pp** |
| one of each, after losing one | the dissected class | **-16pp** |
| pivoted away after the loss | nothing again | **-2pp** |

### Legible by construction (Law 4)
A director you cannot see is a difficulty knob. So: a **dossier** in the War
Room showing what they have filed on you and whether they are acting on it, an
**intel line** in the briefing naming the swap before you commit a team, and a
**news wire** item the first time each countermeasure reaches the field
("County leases a helicopter. The invoice line reads 'anti-goat measures.'").

### Save v10
`directorStats.announced` so a rule only makes the papers once. Additive; the
rest of `directorStats` is untouched and its history is exactly what the
director reads. v1→v10 chain tested.

### Verified
`node tools/smoke.js` green with a new director block — gating, the per-creature
class read, the escape hatch, the dissection weighting, reach growth, boss
protection, the never-a-mercy-rule contract (with a synthetic stacked encounter,
because the live roster rarely exercises it), one-shot news, and that being
predictable actually costs you. Three assertions deliberately broken to confirm
they bite. CDP at 380px: v9 → v10 migration, dossier, intel line, the swapped
wave reaching the battle, the news item, and all four escape-hatch states.

### Known issues
- The director only ever swaps one slot; multi-slot pressure and per-*unit*
  counter-loadouts (the roadmap's "flak trucks and net batteries") are still
  a single unit each.
- Rivals still counter-bias through their own path rather than the director's;
  they now share the class read, which is the first half of merging them.

### Next session's first task
Open. The audit's remaining backlog is Theater Tier 2 / L-frame slots, variants
via mutation, and region contestation.

## Session 15 — Balance pass: the curve that was never there ✅

The prismatic complaint carried for three sessions turned out to be the small
half of the problem. Fixing the measurement came first.

### The harness was measuring the wrong game
`tools/sim.js` fought every encounter with **one** chimera. The game hands you
**three**. Two different games:

| | solo | team of 3 |
|---|---|---|
| standard grade, median | 7% | **69%** |
| every encounter but two | 0% | **100%** |

So the previous sessions' notes were both wrong: prismatic wasn't the problem
(the *whole ladder* was free), and **seven of the eight `[TRASH]` builds were a
measurement artifact**, not dead content. New `--team=N` flag; three is now the
default for encounter tuning, solo stays available for comparing builds.

### The real bug: frames carried the creature
A 1-part L frame had **109 HP**; filling all six sockets bought **8 more** — and
cost 7 regen, because every part adds metabolic draw. The dominant strategy was
*biggest chassis, fewest parts*, which is exactly what the physiology panel warns
against. The panel was right and the mechanics were wrong.

Health now lives in the anatomy. Frame HP S/M/L 55/70/105 → **22/30/42**; every
slot carries real HP (hide 5 → 20, head 4 → 12, and so on) via `tools/gen-parts.js`,
so all 148 parts were regenerated rather than hand-edited. Same L frame today:
**54 HP bare, 106 HP full.** Filling sockets nearly doubles you.

### A difficulty curve, at last
Each encounter declares a `tier`; `tierScale` in `enemies.json` multiplies unit
stats at battle time. One authored roster now covers the whole campaign — a Riot
Squad at the National Guard Post is the same unit, three tiers of budget later.
**Tier 1 is scaled *below* the authored stats on purpose**: a new player fields
exactly one chimera of standard parts, and losing it means a capture.

### The grade ladder is a staircase
1 / 1.25 / 1.5 / **2.0** → 1 / 1.2 / 1.4 / **1.65**, and the move bonus 15% → 12%
per tier so grades stop double-dipping. Prismatic was a leap that turned every
wall into a formality in one husbandry tier.

### Rivals were the easiest content on the ladder
Tuned against a lone chimera, they folded against a real team. Power, team size
and grade ladders raised; `powerCap` lifted so rematches still iterate.

### Measured result (team of 3, median build)

| | std | prime | apex | prismatic |
|---|---|---|---|---|
| **overall** | 33% | 45% | 58% | 75% |
| tutorial patrol | 100% | 100% | 100% | 100% |
| checkpoint / air / harbor / rescue | 0–80% | 60–100% | 100% | 100% |
| Precinct boss | 0% | 0% | 40% | 100% |
| military response | 0% | 0% | 40% | 100% |
| rivals | 0% | 0% | 0% | 0–20% |

Every grade opens a new band; rivals sit above the human roster. The triangle
still decides them — at prismatic, counter ≈ 87–100%, mirror ≈ 37–67%, wrong
class ≈ 0–13%.

**Degenerate builds: 7 OP + 8 TRASH → 1 OP (at standard only) + 0 TRASH.**
The one survivor is a light 3-part build 66% vs a 32% peer median — a wide
spread at the lowest grade is build quality mattering, not a defect.

### Guarded
Smoke now asserts the shape, not just the plumbing: the grade ladder is evenly
stepped, the curve only rises, tier 1 is a tutorial band, a tier-less encounter
fights at authored stats, rivals are never tier-scaled, **a full build is worth
at least 1.6× a bare frame**, and the sim's own ordering (tutorial winnable at
standard, boss not; prismatic answers the boss; rivals harder than the boss).
Three assertions were deliberately broken to confirm they bite.

### Verified
`node tools/smoke.js` green in 1.7s. `node tools/sim.js --plant` still caught.
CDP at 380px: a v8 save migrates to v9 and plays; a fresh save's guided first
splice (94 HP) beats the tier-1 patrol (38 HP) and takes the node; the Theater
shows an empty M slab at 30 HP against 94 HP fully built. No console errors.

### Next session's first task
AI director — the counter-bias plumbing already works for rivals; generalise it
to the human roster.

## Session 14 — Battle overhaul: turns you can actually see ✅

The complaint was exact: *"there isn't obvious turns. I just press attacks and
get attacked at the same time."* True — the engine resolved a whole round in one
synchronous call and the arena printed the receipt. Fixed at the seam, not with
a rewrite.

### `step()` now returns a replayable stream
- Every event carries `{ text, kind, actor, target, amount, mult, snap }` where
  **`snap` is a frozen snapshot of the battle at that instant** — both fighters'
  HP/stamina/status/stages, the bench, waves left, cannon charge.
- One helper (`makeEvents`) wraps the log, so ~64 `events.push('…')` call sites
  kept working untouched; only the beats worth animating got annotated.
- The engine stays synchronous and DOM-free — `tools/sim.js` is unaffected.
- New export `turnForecast(battle)` so the UI can say who strikes first *before*
  you commit to a move.

### The arena is a player, not a printer
- Beats replay on a timer (620ms for a hit, 900ms for a KO, 1.1s for a rival's
  monologue), driving the HUD **from each snapshot** rather than from live state.
- A **phase strip** names whose beat it is — `YOUR MOVE` / `ENEMY MOVE` — and the
  acting fighter's panel takes the spotlight. That is the fix for "no obvious turns".
- Floating damage numbers, coloured by effectiveness (crit gold, resisted grey,
  MISS / NO EFFECT). Lunge, hit-shake, KO flop, wave-in slide, buff/debuff pulse.
- Actions lock during playback with **▶ tap to skip** — an immediate flush that
  runs every remaining beat at once, so skipping never changes the outcome.
- Ten combat stingers added to the WebAudio synth (hit / bigHit / weakHit / miss /
  buff / debuff / ko / waveIn).

### HUD rebuilt
- Turn badge, encounter title, RIVAL DUEL / RESCUE RAID mode tag.
- Class chips on **both** fighters, stamina bar on the enemy too, wave pips,
  status chips (venom stacks, sleep, stun, trapped, guard, stage changes),
  a **team tray** with live HP for the bench.
- **Per-move effectiveness against the fighter in front of you**: `×1.5`,
  `no effect`, `armor ✗`, `⚡ first`, `2-turn`. The tag chart and the class
  triangle stop being lore you have to memorise.
- `prefers-reduced-motion` resolves the round instantly with no floats and no
  animation classes — verified in the browser, not assumed.

### Verified
- `node tools/smoke.js` green with a new block asserting the stream's shape:
  every event has text/kind/snap, snapshots are frozen **copies** (test bites if
  `copyStatus` is removed), a KO beat shows an empty bar, and the stream and the
  log never disagree. Two assertions deliberately broken to confirm they fail.
- `node tools/sim.js` unchanged: 1320 battles. `--plant` still caught.
- CDP at 380px: beats arrive one at a time with correct phase labels, floats and
  sprite animations fire, skip flushes in ~20ms, ten log kinds observed across a
  boss fight, all six tabs clean on a fresh save. No console errors, no overflow.

### Known issues
- Prismatic balance pass still pending — **next**.
- Enemy AI is still "mild preference for damage"; it will get smarter with the
  director.

### Next session's first task
The balance pass (prismatic tier + the seven `[TRASH]` purebred builds), then the
AI director.

## Session 13 — Rival Geneticists ✅

The audit's #1 deferred item, and the reason Wave 1's class triangle exists.

### Rivals field chimeras, not stat blocks
- `campaign/rivals.js` builds each rival's team from **real parts** and runs it
  through **`splice/physiology.js` — the player's own physiology**. Their HP, tags
  and elemental class are earned by anatomy, exactly like yours. A rival who fields
  Water is Water *because of the gills*.
- `battle/engine.js` grew two small seams: `unitFromGenome()` (genome → a record in
  the `enemies.json` unit shape) and `unitFor()` (a wave entry may be an id *or* an
  inline record). Everything downstream — capture, containment, salvage, knockback,
  the arena — works unchanged. Move-building is now shared (`movesFromTokens`) so
  a rival's chimera and yours can never drift apart.
- The arena draws rival chimeras from their genome. **Zero new art.**

### Three rivals, one ladder
- Dr. Mantissa (Ground, insects) → Baroness Vesper Aloft (Air) → Prof. Abyssa
  Trench (Water). Each one answers the class you just farmed off the last.
- **Gates follow counter-part availability**: you are never asked to beat a class
  before the anatomy that answers it is obtainable. Asserted in smoke against the
  *real* `faunaUnlocked` rule — the test bites if a gate is moved.
- Measured triangle (40 seeds/cell, 1 chimera vs their whole team):

  | build | Mantissa (Gnd) | Aloft (Air) | Trench (Wtr) |
  |---|---|---|---|
  | Ground | 83% | **10%** | **85%** |
  | Air | **98%** | 15% | **0%** |
  | Water | 15% | **95%** | 78% |

  Bring the counter and you win; bring the wrong class and you do not.

### They iterate, and they read you
- Every defeat raises their grade ladder, power scale, team size and purse.
- `counterBias` rivals read your stable (the `directorStats` idea, finally acting)
  and build the class that beats it — an all-Air stable makes Aloft field Water.
  Mantissa, the tutorial rival, stays honest.
- Monologue slots per §3.8 (intro / midFight / defeat / victory / dissectionTaunt)
  as data; the engine only relays `encounter.barks`, so any encounter can have them.

### The payoff loop
- Cannon a rival's chimera → Containment → salvage yields **their parts at the
  grades they actually raised**. Prismatic rival parts are a real prize, and the
  only way to get some anatomy early. Verified end-to-end in smoke.

### Save v9
- `campaign.rivals` per-rival records; containment bays carry an optional inline
  `unit` for generated specimens. Additive — old bays still resolve by `unitId`.
  v1→v9 chain tested.

### Verified
- `node tools/smoke.js` green, with ~35 new rival assertions (three checked to
  fail when deliberately broken). `node tools/sim.js` now fights rivals too: 1320
  battles, 11 encounters.
- CDP pass at 380px on a **migrated v8 save**: cards render with procedural
  portraits, gates read correctly, challenge → briefing → duel → aftermath →
  reload all clean; 0 native controls, no overflow, no console errors.

### Known issues
- Prismatic grade still flags OP builds — the balance pass is now two sessions
  overdue and should come before Wave 2 content.
- Rivals have no Splice-Dex page yet.

### Next session's first task
Either the prismatic balance pass, or AI director activation (rivals already prove
the counter-bias plumbing works; the director generalises it to normal encounters).

## Session 12 — In-game pickers: no more OS dropdowns ✅

Wave 1 pushed the last native `<select>` past its limit — a 25-species catalog on
Android opened the platform's grey scroll wheel over the game. Every native form
control is now gone from the build.

### `ui/picker.js` — one component, every choice
- `pickerField()` renders a **button** styled as a form field (label, value, hint,
  owned-count, caret). `openPicker()` opens a full-screen bottom sheet drawn with
  the game's own panels: grouped rows, sub-lines, class marks, grade badges.
- Closes on pick, backdrop tap, or **Escape**; scrolls the current selection into
  view; never leaves a listener behind. `toggleRow()` replaces checkboxes.
- Presentation only — callers own their state, so nothing about the save changed.
  **`SAVE_VERSION` stays at 8.**

### Converted
- **Theater**: 6 slot sockets — grouped by species, best grade first, with the
  ability and donor on each row.
- **Ranch**: Mail-Order Menagerie, now **grouped by elemental class** with price,
  role, tags and daily upkeep per row (and prices in red when you can't afford
  them); both Breeding Pen parents, grouped by species with stage and condition.
- **War Room**: strike-team checkboxes → toggle rows, now showing each chimera's
  class icon — plus a new **"Opposition:"** line naming the classes you're about
  to walk into, and a *"type advantage here"* note on the members who counter
  them. The triangle is finally visible at the moment you pick a team.

### Guarded
- Smoke now greps every UI module for `<select>`, `<input>` and `<textarea>` and
  fails if one comes back — plus asserts the `#picker` host exists and the service
  worker precaches the module. The rule is enforced, not remembered.
- Two robustness fixes found while testing hand-edited saves: a retired part id no
  longer crashes `combatantFromChimera` (matching the guard physiology already
  had), and a chimera missing `instability`/`bond` reads as 0 instead of `NaN%`.

### Verified
- CDP pass at 380px: **0 native controls anywhere**, no horizontal overflow, no
  console errors, sheets open/pick/escape/backdrop-close correctly, breeding runs
  end-to-end through the new pickers and the egg survives a reload.
- `node tools/smoke.js` green (now with the no-native-controls guard);
  `node tools/sim.js` unchanged at 960 battles.

### Known issues
- Prismatic grade still flags 15 OP builds of 40 — top tier wants a balance pass
  before Wave 2 (carried over from Session 11).
- Seven purebred aquatic/insect builds still flag `[TRASH]`; they're waiting on the
  Theater Tier 2 slots, not on the UI.

### Next session's first task
Rival geneticists (audit's #1 deferred item) — now that there's a real part pool
and a class triangle for them to build against.

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
