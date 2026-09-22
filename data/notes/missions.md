# data/missions.json

R180 — THREE WAYS TO USE A RIVAL WITHOUT FIGHTING THEM. Before this milestone the ladder was five labs the player could only ever FIGHT: the War Room dispatched seven target kinds and every one was a battle, and a rival's record on the save held `defeats`, `losses` and `lastMetAt` and nothing else. A mission is the other verb. One creature goes out against one lab for real-world hours, the outcome is seeded and sealed at launch like every other timed thing here, and what makes it a decision rather than a dice roll is that the three missions charge three different prices — time, the creature if it goes wrong, and the creature regardless.

WHAT THE ODDS ARE MADE OF, and why it is not power. `aptitude` blends three terms the fight under-rewards: Camo, speed, and low mass, inverted so heavy is bad. Camo is the rarest real tag in the game — six parts carry it and all six are chameleon sockets — so an infiltrator is a commitment to one species rather than a stat you happen to have. The armour interaction is not written in the engine and does not need to be: `camoTags` in splice/physiology.js already strips Camo outright when armor > 0, so a plated creature reads zero on the first term by a rule that shipped with R32. You cannot be armoured and hidden. That is what makes this a REASON TO BUILD the animals R148 and R149 shipped without one, rather than a second use for the animal you already fight with.

MEASURED, AND THE FIRST DRAFT WAS DECORATION. The ceilings shipped in the first cut were guesses and all three were wrong against real anatomy: mass across the 39 purebred builds runs 88 to 216 and the file said 14 to 68, so the mass term read zero for every creature in the game; speed runs 1 to 13 and the ceiling was 34. Worse, the camo term could never fire at all — ALL 43 HIDES IN THE GAME CARRY ARMOUR, and `camoTags` strips Camo the moment armour is above zero, so half the blend was permanently dead. The measured spread between a chameleon and a rhino was 5.3 points of aptitude and 2.2 of odds, which is not a decision, it is a rounding error.

The ceilings are now taken from the distribution (camo 4, speed 12, mass 95 to 165) and the numbers are these:

    INFILTRATOR chameleon, no hide   0.883   70.3% at 12h
    chameleon wearing its own hide   0.369   48.7%
    tiger, no hide                   0.260   44.1%
    BRUISER rhino, full              0.050   35.3%

THE INFILTRATOR WEARS NOTHING, and that is the whole build. Since every hide carries armour, the only way to be hidden is to leave the hide socket EMPTY — so the best specimen for this job is a creature that gave up its armour entirely, and putting the chameleon's own hide back on costs 21.6 points of odds. Nothing in this module enforces that; it falls out of a rule R32 shipped and nobody has touched since. A gate below locks the ORDERING rather than the numbers, because the ordering is the design and the numbers are calibration.

## tuning

`baseChance` plus `perAptitude` times the creature's score, plus `perHour` times the length, clamped between `minChance` and `maxChance`. A hopeless specimen on the shortest job still clears the floor and a perfect one on the longest still misses one time in ten, because a board that can be made certain is a board that stops being read. `cooldownHours` is one at a time, the same shape as `sparRefillAt`, `boardRefillAt` and `expeditionReadyAt`: a stamp in the past means ready now, so a save that has never seen the field behaves correctly the moment it is migrated. The `aptitude` weights sum to 1 and the ceilings are what a real build actually reaches — `camoCeil` 3 rather than 6, because a chimera with three chameleon sockets is already an unusual animal and the term should saturate where the commitment stops paying.

## missions

`fundsPerHour` rises with the risk and so does `notoriety`: espionage is quiet and pays least, renewal is the loudest thing in the game and pays most. `consolation` is what a failure still pays, and it is HIGHEST on renewal — the creature is gone either way, so a failed renewal that paid nothing would be the one outcome in the game that takes everything and returns nothing.

`risk` names what a failure costs and is the whole design. **detained** is time: the creature comes home with an injury clock and a stern letter. **conscripted** is the mirror of R8's Reorientation Wing pointed back at the player — they keep it, and `campaign/rivals.js` appends it to that lab's roster, so the next fight against them has your own animal in it. **released** is not a risk at all but a certainty, which is why `alwaysSpends` is a separate field: the creature leaves the roster whether the job lands or not and joins the loose board the breakout engine already runs (`maxLoose` is 4), where it can be hunted back.

A CONSCRIPT IS STORED AS A GENOME, NEVER AS A STAT BLOCK. R108's rule, and visiting.js gives the reason: a saved stat block is a promise about a fight the engine has stopped making, so a creature taken three balance passes ago would fight with numbers nothing else in the game still uses. `rivalTeam` re-derives it through `unitFromGenome` on every read, exactly like every other combatant.

`grants` is what a SUCCESS buys beyond money. **intel** opens that lab's dossier. **setback** takes one step back off their escalation, floored at the defeats they have actually taken, so the worst a saboteur can do is undo the last defeat's worth of anger — a rival cannot be ground down to nothing by a board that never risks a fight.

THE TONE IS LOAD-BEARING AND IS CHECKED. CLAUDE.md forbids death language, and this is the milestone most able to break it. A flattened city block is evacuated, condemned and rezoned; the only casualties are an insurance adjuster's afternoon and several municipal bylaws; buildings retire loudly the way vehicles already do. Every line goes through R110's tone gate, which reads `data/copy.json` and `data/news.json` rather than trusting the author.
