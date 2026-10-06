# data/fair.json

R213: the County Fair. For `days` at each season's turn after the first (the calendar's 28-day seasons, counted from the save's birthday), the fair is in town: a race and a Best in Show, each entered once, against the county's livestock. Read by `campaign/fair.js` (lazy, with the War Room and the walker) and, for its window alone, by `fairWindow` in `campaign/calendar.js`, which is eager because the Ranch's agenda asks on the first frame. This file rides the second round (`LATE` in data/loader.js); until it lands there is no fair.

AN EVENT RUNS THE MOMENT IT IS ENTERED. One shot per event per fair: the result is computed, prizes are paid and ribbons pinned on the spot, and `campaign.fair` keeps that fair's two results for the card. Nothing waits on a tick, so a fair the player never visits simply passes. Every roll is keyed by the save's seed, the fair's number and the runner (a chimera's id, or a local's lane), so the same entries at the same fair replay the same result in any order.

RIBBONS LIVE ON THE CHIMERA, as `ribbons: [{ k, season, event, place }]`, newest first, at most `ribbons.keep`. Every screen that draws one of the player's chimeras draws it through `chimeraPortrait` in `render/ribbons.js`, which pins the newest three as rosettes; smoke holds every chimera portrait in the tree to that one door.

## days

How long the fair stays after each season's turn. The window opens at the turn (the fair is the turn) and closes `days` later.

## race

`entries` is how many of the player's chimeras may run, `lanes` the size of the field (the county fills the rest). A runner's time is `distance` over its pace, and its pace is its physiology's speed plus `base`, times the course's multiplier for its class, times the course's multiplier for its frame, times the square root of how much of the course's `stamina` its own stamina covers (capped at one), with a seeded stumble of up to `jitter` either way. `courses` is the list one course per fair is drawn from: a `class` map (Ground, Water, Air) and a `frame` map (by frame id), both defaulting to 1 for anything they do not name, so a new class or frame races at par until somebody writes it a terrain. `prizes` pays by place: cash, and a part of the catalogue at `part` grade where it says so. Only the player's chimeras are paid and ribboned.

## show

Best in Show. `weights` score a body: `grade` times its mean grade index, `set` if it is purebred, `variety` per species in it, `combo` per combo it carries, and `scar` against for every scar; the judge adds up to `jitter` either way. Measured over four 180-day walks with the walker entering its two best, it wins about seven shows in eight, by a point or two against prismatic county livestock by the last fair, and placed first to fifth in the race.

## locals

The county's entries: purebred catalogue animals (every species with a `mailOrderPrice`), named for an owner in `owners`. Each lane is the best of `picks` animals for this event and course, and every animal at a fair is the same grade, read off the `grades` ladder by the fair's number, so the county's breeders get better as the year goes on. Raising `picks` makes the county sharper; lengthening the ladder slows it down.

## ribbons

`keep` is how many a chimera wears in the save; the portrait pins the newest three. `places` colours a rosette by place, `color` its body and `edge` its outline and centre mark. A place this map does not name draws in grey.
