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

`baseChance` plus `perAptitude` times the creature's score, plus `perHour` times the length, clamped between `minChance` and `maxChance`. A hopeless specimen on the shortest job still clears the floor and a perfect one on the longest still misses one time in ten, because a board that can be made certain is a board that stops being read. `cooldownHours` is one at a time, the same shape as `sparRefillAt`, `boardRefillAt` and `expeditionReadyAt`: a stamp in the past means ready now, so a save that has never seen the field behaves correctly the moment it is migrated. A MISSION MAY OVERRIDE IT, and renewal does — see below. The `aptitude` weights sum to 1 and the ceilings are what a real build actually reaches — `camoCeil` 3 rather than 6, because a chimera with three chameleon sockets is already an unusual animal and the term should saturate where the commitment stops paying.

## missions

`fundsPerHour` rises with the risk and so does `notoriety`: espionage is quiet and pays least, renewal is the loudest thing in the game and pays most. `consolation` is what a failure still pays, and it is HIGHEST on renewal — the creature is gone either way, so a failed renewal that paid nothing would be the one outcome in the game that takes everything and returns nothing.

`risk` names what a failure costs and is the whole design. **detained** is time: the creature spends `detainHours` helping the police with their enquiries and comes home with a stern letter. The hold rides the injury clock, so it is not free to go anywhere, but it is not a wound: no vet treats it, the Infirmary does not sell it and it cannot scar (R193, data/notes/scars.md). **conscripted** is the mirror of R8's Reorientation Wing pointed back at the player — they keep it, and `campaign/rivals.js` appends it to that lab's roster, so the next fight against them has your own animal in it. **released** is not a risk at all but a certainty, which is why `alwaysSpends` is a separate field: the creature leaves the roster whether the job lands or not and joins the loose board the breakout engine already runs (`maxLoose` is 4), where it can be hunted back.

A CONSCRIPT IS STORED AS A GENOME, NEVER AS A STAT BLOCK. R108's rule, and visiting.js gives the reason: a saved stat block is a promise about a fight the engine has stopped making, so a creature taken three balance passes ago would fight with numbers nothing else in the game still uses. `rivalTeam` re-derives it through `unitFromGenome` on every read, exactly like every other combatant.

`grants` is what a SUCCESS buys beyond money. **intel** opens that lab's dossier. **setback** takes one step back off their escalation, floored at the defeats they have actually taken, so the worst a saboteur can do is undo the last defeat's worth of anger — a rival cannot be ground down to nothing by a board that never risks a fight.

RENEWAL RESTS A FORTNIGHT, AND THAT NUMBER WAS MEASURED RATHER THAN CHOSEN. On the board's shared eleven hours the walker ran renewal 19 / 12 / 10 / 16 / 12 times across five 180-day campaigns, because "sell the animal you least want and splice a better one" is the obvious answer to being short of cash, and nothing stopped it being the answer every other day. That is not the price the brief describes. It is a roster upgrade with a cash bonus on it, and R93's late-game rule caught it: post-dominion defences are held 85.0% of the time on `60f5941`, the tree this milestone branched from, and 90.5% with renewal on the shared cooldown — over the 90% ceiling that rule exists to hold.

The cause is FREQUENCY, not the payout, and the isolation says so. Espionage and sabotage alone leave the late game exactly where they found it (83.7% held, against 85.0% before any of this existed — and the mid-milestone tree that had the engine but no walker policy reads the same 85.0%, byte for byte, because a system nothing reaches is a system that changes nothing); it is renewal that moves it. Sweeping the cooldown with everything else untouched:

    11h  (the board's own)   90.5% held    19/12/10/16/12 renewals
    120h (five days)         83.7% held      6/4/3/3/3
    336h (a fortnight)       85.6% held      4/2/2/1/2

A fortnight lands nearest where the rule was written, and it is the one that matches the brief: a city block is an event, not a chore. One to four a campaign is a decision the player weighs; nineteen is a routine. R190 found that catch was half a point wide: a change to the walker's vet policy moved the eleven-hour tree to 89.3% held, under the ceiling, and the break stopped being caught. The smoke gate now asks the frequency itself: no campaign runs a mission that spends its specimen more than eight times, twice the design. The override lives in data, so a fourth mission sets its own pace without an engine edit, and `missionCooldownMs` is its one home — R180 shipped the arithmetic written out twice, in the tick that ends a run and the recall that calls one off, which is exactly the R174 defect planted fresh and exactly where an override would have landed in one and not the other.

THE TONE IS LOAD-BEARING AND IS CHECKED. CLAUDE.md forbids death language, and this is the milestone most able to break it. A flattened city block is evacuated, condemned and rezoned; the only casualties are an insurance adjuster's afternoon and several municipal bylaws; buildings retire loudly the way vehicles already do. Every line goes through R110's tone gate, which reads `data/copy.json` and `data/news.json` rather than trusting the author.

## missions.espionage.agent

R189 — what a failure costs a HENCHMAN rather than a creature. Sabotage carries the same block with a different risk.


Per mission, a mission without an `agent` block does not take one, and says so in words (`copy.mission.agent_refused`); renewal has none, because `alwaysSpends` leaves the specimen behind and an agent has no genome to leave. The smoke gate refuses an `agent` block on an `alwaysSpends` mission.

**detained** is the agent's version of the creature's night in a cell, and it is longer on purpose: `detainHours` (24 on espionage, against the creature's 9) is long enough to miss the board's next window, and the agent stays on the books and on the wage while they help the police with their enquiries. **poached** is sabotage's price: on a caught failure (`catchOnFail`, the creature's 0.4) the lab hires the agent away. They leave your books, the slot opens, and `hireBlock` refuses them — naming the lab — until `poachDays` have run out. It is milder than conscription on purpose: a conscripted creature is gone for good and fights you next time; a poached agent is a week's non-compete.

EVERY CLOCK IS BUILT AT LAUNCH, the board's own rule. `freeAt` (when a held agent walks out, or a poached one's non-compete ends) and `expenses` are sealed into the outcome by `startMission`, so the eager tick only files them and a reload cannot re-roll an agent's bad night. Only an agent run carries those fields, so a creature's sealed record is the shape it was before R189.
