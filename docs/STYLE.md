# style.css, explained

The reasoning behind some of `style.css`'s rules, moved out of the file every
player downloads before the game can paint (R208, which paid for its own CSS
this way, as R117 did for the width story). Each section names the rule it
explains; the stylesheet keeps a one-line pointer here.

## R113 — the cutout and the rounded corners

`viewport-fit=cover` in index.html lets the page paint under a notch and a
home indicator; these insets are what stop it painting the GAME there. The
header, main and footer each add `env(safe-area-inset-*)` to the padding
they already had, so on a phone with no cutout every value resolves to 0 and
nothing moves. The arena carries its own pair because `body.in-battle`
overrides both.

Every inset reads `var(--safe-*, env(safe-area-inset-*))`. The env is the
real thing and is what ships; the variable exists so tools/a11y.js can set a
47px cutout and measure that the header actually clears it, which a headless
desktop browser has no notch to produce on its own. A rule nobody can test
is a rule nobody knows works.

The other half is in tools/smoke.js, because the simulation passes whether
or not the env behind the variable ever resolves - and it resolves to ZERO
on every device without `viewport-fit=cover`. Smoke reads the shell for that
attribute and this file for the var() form. See ROADMAP R113.

## R113 — the 12px type floor

Nothing in this file may declare a font-size under 0.75rem. 78 rules did,
the worst at 0.52rem (8.32px), and 58% of the text on a fresh screen was
under 12px. tools/a11y.js measures the COMPUTED size on every text node,
on every screen, in every theme, so a new rule under the floor fails the
build rather than waiting for somebody to squint at it.

The hierarchy that size used to carry is carried by colour, weight and
style instead - .lineage is italic and muted, .fine-print is muted, a
badge is a filled pill. Those still read at 12px; 8.32px did not read at
all. See ROADMAP R113.

## R73 — focus you can actually see

There was exactly one `outline: none` in the file (on the Dex cell) and
nothing anywhere that put a ring back, so a keyboard user moved through
the game with no idea where they were — the browser default was the only
indicator and one rule had already killed it locally.

`:focus-visible` rather than `:focus`, so a mouse or thumb never sees it
and a keyboard always does. Two-tone — a dark outline under a bright one
— because the accent sits on both light panels and dark wells across five
themes, and a single-colour ring disappears on one of them. `outline`,
not `box-shadow`, so it survives Windows High Contrast.

## R73 — the 40px floor

This ships as a TWA, so every control is a thumb target before it is
anything else. Measured at 380px before this rule: 21 of 46 distinct
controls came in under 40px, the worst a 15x21 rename button.

Stated ONCE, here, rather than as a min-height added to fifteen
individual selectors — that version fixes the fifteen that exist and
misses the sixteenth somebody adds next phase, which is the whole reason
the floor was 15px in the first place. `box-sizing` and the flex
centring come with it, because a min-height without them buys a 40px box
with the label still painted at the top of it.

`summary` keeps `display: list-item` (a flex summary drops the
disclosure triangle in Chromium) and reaches the floor on padding
instead. Anything genuinely inline inside running text opts out below.

## R113 — the arena pays for the type floor out of its chrome

This is the one screen in the game that does not scroll: `100dvh` with
`overflow: hidden`, so every pixel the 12px floor added to the tab bar, the
ticker and the unit tiles had to come off something or be clipped. It was
clipped - 30px of the arena's own content, measured.
The 30px comes back from PADDING AND GAPS, not from `.stage`, whose
`min-height` is the creature you are looking at. Header 6->4, main 8/6->6/4,
footer 12->8, the column gap 8->6 and each unit tile 8->6. Nothing the
player reads got smaller; the space around it did. See ROADMAP R113.

## R125 — the tier letter

Six bands, so six colours would be six chances to fail the contrast
floor and six things to tell apart at a glance on a phone. Instead the
chip is one shape with a role colour: the bottom two read as a problem,
the middle two are neutral, and the top two use the two accents the
scheme already spends its boldness on. Every pairing here is a token
pair the stylesheet already ships and the a11y gate already measures.

`min-width` rather than fixed: a single letter in a circle looks like a
typo when the row beside it is 40px tall, and the tier chip sits in a
fold summary that a thumb has to hit.

## R124 — the animal card stretches its column

`align-items: flex-start` top-aligns the portrait beside the text in the ROW layout. Turning the card into a COLUMN changes what that property means — the cross axis is now horizontal, so it stops the info block stretching and every child shrink-wraps to its own content. The widest child is the Extract button, whose label carries the animal's NAME, so each card in the list ends at a different place: read off a 411px-wide phone, two cards of identical width ended about 70px apart. Stretch is what a column wants; the portrait keeps centring itself with its own `align-self`.

Invisible at 380px, which is why no gate had ever seen it: down there the text's max-content already exceeds the line, so `fit-content` clamps to full width and the bug has nowhere to show. A band measured only at its narrow end is a band measured once.

## R122 — `.sheet` is a card

R122 — `.sheet` had no rule at all. Two dialogs wear it (the Pens' repertoire picker and the arena's move readout) and both were therefore transparent, showing the screen behind them through their own text — the same defect as the founding card, on a screen nobody had reported. A card is a card: its own ground, its own edge, and its own scroll, because the fixed overlay it sits in does not scroll. `.move-sheet` still sets its own padding; this is only what every card in the game already has.

## R113 — a held node wraps its row

R113: a HELD node puts three children in this row — the description, the HELD tag and the Spar button — where every other status puts two, and the button is `flex: 0 0 auto`. At 150% text the row ran 86px past its card rather than giving way. Wrapping costs nothing at 100%, where it already fits, and at 150% the tag and the button drop under the description instead of squeezing it.

`.encounter > div { flex: 1 1 auto; min-width: 0 }` was shipped beside this and then taken back out: measured against the exact stylesheet of the commit before, EITHER one alone brings the row from 86px over to 12px inside. Two rules for one defect means a break aimed at either is caught by the other, which is a rule nothing can go red for. Wrapping is the one kept because it is one declaration and because it keeps the description readable rather than shrinking it.

## R117 — wide screens

R117 — WIDE SCREENS: the first `min-width` rules this file has carried. Every width breakpoint before this was a `max-width` (400, 430, 420, 400, 340), so the layout could only get narrower than its 560px column, and at 1,280px the game used 43.8% of the glass with the agenda drawn on one screen of six and the wire in a footer below the fold. The argument is in ui/rail.js and ROADMAP R117; what a reader of this file needs is that at 900px the shell becomes a two-column grid AND becomes fixed-height, the way `body.in-battle` already is on a phone — that second half is what keeps the rail's foot in the glass without a magic number.

## R73 — the one band that fills its row with a colour

R73 follow-up — the one band that fills its whole row with a colour, and the only place in the file that hardcoded a hex for text. Measured white on `--danger-2` across the five themes: 3.96 / 2.78 / 4.18 / 4.01 / 3.62, below AA in every one, worst on the theme whose danger red is lightest. Nothing light passes on this background — the ceiling for white is about 4.15 — so the text goes dark instead, on the token that is near-black in every scheme.

## R204 — a cell waiting for its creature holds its box

R204 — a cell still waiting for its creature holds the creature's box. Every portrait the Dex defers is drawn in the renderer's 460x440 viewBox at the cell's full width, so this is the drawn height exactly, and the roster is the same height before a scroll as after one. Without it the 28 cells past the ninth were 0px of art until they drew: the screen grew 854px under a scrolling thumb, and the height gate measured a page nobody scrolls to.

## R131 — the bay head is a button

R131 — the bay head is a real button now, on the same `data-fold` contract as every other fold in the game, so `bindFolds` can keep one open and both browser gates can find it. Styled to sit exactly where the `<summary>` sat: this is the shut Vault's whole height, forty-one of them, and the budget has 120px of headroom. `min-height` is R73's 40px floor, which the 35px summary never had to clear because it was not a control.

## R124 — stretch, not flex-start

R124 — stretch, not flex-start. In a column, flex-start shrink-wraps every child to its own text: measured at 380px, four option rows of identical width held main blocks 83, 94, 123 and 81px wide. Nothing shows today because those blocks carry no background and their text is left-aligned anyway — but it is why `margin-left: auto` on the price would quietly do nothing, and it is the same rule the ranch cards broke visibly. Row height and text position are unchanged by this.

## R73 — a full-width button's label starts at the left

R73's global `button { justify-content: center }` exists so a shrink-wrapped label sits in the middle of its 40px target. This row fills its line, so centring slides its content by half of whatever slack the row's own text leaves: measured on the briefing, three roster rows started their tick 82px in and a fourth, whose label wrapped, started at 12px. That is the ragged left edge reported from a phone. Third leak of this rule — R122 fixed `.lab-pick` the same way.

## R73 — the smallest control in the game

R73 — this sat at 15x21, the smallest control in the game, and it opens a destructive-ish flow (renaming a creature you have grown attached to). It lives INSIDE an <h4>, so it cannot take a 40px box in the flow without pushing the name off its own line: the visible pencil stays small and the TOUCH area is grown around it with a negative margin, which is the one place that trick is the right answer rather than a dodge.

## The warn ground's fine print

Measured at 380px: `.fine-print`'s muted grey on the warn ground came out at 3.42:1, under AA for text this size, on the one panel in the game that explains how not to lose a creature. `--text` is the readable foreground in every theme and the ground is `--warn-dim` in every theme, so pairing them holds across all five; the hierarchy is carried by size and weight rather than by dimming the thing that has to be read.

## Two cells: the icon, then the sentence

Two cells: the icon, then the whole sentence. Grid rather than flex, because a flex row lays out TEXT NODES as items too — it held four of them (the icon, a space, <b>Bear</b>, ", fully grown...") with 5px between each, so the screen read "Bear , fully grown" and a two-word species name took a column of its own with the rest of its sentence stranded beside it. One cell means the sentence wraps like prose and keeps its own punctuation.

## R182 — a part's own render control

R182 — a part's own render control. Pushed to the row's far end so the price lines up down a bay; muted, because it is the quiet way out and not the thing the row is about. The row does not wrap and gives up its block padding to the button, whose 40px floor is then the row's height: a wrapping row put the button on a line of its own and cost an open bay ~200px, which the height gate caught at 4,361 against 4,200.

## R99 found this leak on `.lab-pick` and called it

R99 found this leak on `.lab-pick` and called it the only instance in the game; it was the only instance until this row became a button. R73's global `button { justify-content: center }` centres a shrink-wrapped label inside its 40px target, and a full-width flex row inherits it — the a11y gate measured this one starting 98px into its own 348px line. A ragged left edge on a list you scan by name.

## R103 — the telegraph is a line the arena

R103 — the telegraph is a line the arena did not used to carry, and the arena is height-locked (`body.in-battle` is 100dvh with overflow hidden), so on the shortest phone the space has to come from somewhere. It comes from the stage, which is the one part of the fight that scales: the creatures get smaller, nothing gets cut off. Measured at 380x640, the line costs 38px and this gives back 40.

## R113 - `flex

R113 - `flex: 1 1 auto` -> `1 1 0`. A flexible element in a height-locked column should take what the others leave, and with an `auto` basis this one took its CONTENT height instead. It was not what pinned the stage at 280px - the `min-height: 760px` query below was - but it is the rule that makes the column shrink predictably now that the floor has room.

## R75 — was `infinite`

R75 — was `infinite`. The element is replaced by the poof at 0.55 × CEREMONY_MS (1155 ms), so nine iterations of 0.14 s cover the whole window with room to spare and the animation can no longer outlive the thing it decorates — an infinite animation that happens to be cut short by a setTimeout is a bounded animation with the bound written somewhere else.

## R73 — every disabled opacity above was raised to

R73 — every disabled opacity above was raised to 0.6. A disabled control is exempt from WCAG contrast, but its LABEL is usually the sentence that explains why it is disabled ("None in the vault", "the pens are full"), which is precisely the moment a player needs to read it. Measured: the primary button sat at 2.35:1 against its own surface.

## R88 — "Send them without me"

R88 — "Send them without me". Deliberately NOT a second big-btn: Launch is the decision, this is the shortcut past a decision already made, and a briefing with two equally loud buttons on it is a briefing that has stopped recommending anything. Full width so a thumb cannot miss it, quieter ink so the eye still lands on Launch first.

## Two columns well before 360px

Two columns well before 360px. Four fitted while the numbers were small, but a fully conquered map reads "+$2385/day" beside "128W-12L" and at 380px those two collide into each other mid-glyph — which every assertion in the suite happily reported as four cells of equal height. Screenshots catch what getBoundingClientRect does not.

## R113 - 280px -> 260px

R113 - 280px -> 260px. THIS is the floor the arena was resting on, not the base rule: the gate measures at 780dvh, so this query applies and pinned the stage at exactly 280px through three fixes aimed at the wrong number. With 12px type the chrome above and below is taller, and 280 is 14px more than a 780px phone has left to give.

## R75 — the graduation ceremony's three were missing

R75 — the graduation ceremony's three were missing: a player who has asked their OS to stop moving things still got a shaking portrait, a flashing card and an expanding puff. Safe to disable outright because the ceremony advances on setTimeout, not on animationend, so the results still arrive on time with nothing moving.

## R51 — the third state of a field-guide cell

R51 — the third state of a field-guide cell. "Logged" is a sighting and a unit logs itself just as readily while beating you, so a beaten one is marked rather than merely present. The border carries it: the grid is 100px cells at 380px and a badge would cost a row of height across all forty.

## Lifted from #ff4fa3 by R122's contrast floor

Lifted from #ff4fa3 by R122's contrast floor: the field-note title is accent-2 on panel-2, which was 4.32:1 — under 4.5 and the only theme where it was. This clears 4.73 there and 4.64 on accent-2-dim, and dark text over the fill goes 6.09 -> 6.67, so it is better in both directions.

## R73 follow-up

R73 follow-up: was `var(--accent-2)` while `--cls-air` sits defined and unused in all five theme blocks — its two neighbours use their own class colour and Air borrowed the amber accent, so the one class the triangle makes hardest to read was also the one drawn in another role's colour.

## Semantic palette: BIOHAZARD, the shipped scheme.

A containment facility that has stopped filing paperwork: charcoal so dark it reads as unlit, with toxic lime and hazard amber doing all the talking. The alternates live in [data-theme] blocks below.

Surfaces run ink (page) -> panel (card) -> panel-2 (raised) -> well (sunken). accent is the brand/action colour, accent-2 the secondary. danger/warn/hp/sta are role colours; the three class colours belong to the elemental triangle and should stay distinguishable in any scheme.

## Colour schemes

Each scheme overrides the semantic tokens above and nothing else. The three class colours stay deliberately distinguishable in every one: the elemental triangle is a mechanic, not decoration, so Ground/Water/Air must never blend into a scheme's accent.

## Arena: one screen, no scrolling

Laid out the way turn-based creature battles have been laid out since 1996 — foe up-and-right, you down-and-left, both facing each other, a message box under the field and the command menu under that. The shell goes fixed-height in battle mode so nothing can push the menu off.

## In-game pickers (replaces every native <select>/<input>)

Nothing in this game may hand the player an OS dropdown: the Android wheel and the iOS action sheet both break the Saturday-morning frame. Fields below are buttons; the sheet is drawn with the game's own chrome.

## War Room sub-navigation

Thirteen cards in one column became five views behind a tab bar. It is sticky so a long view (the wire, the labs) can still be navigated from anywhere in it, and it is deliberately quieter than the main tabs — a second row of chrome as loud as the first would read as a second app.

## A4: the Right Now panel

A list of what is actually open, grouped by what KIND of thing it is. Rows are buttons because every one of them goes somewhere; they are full-width and stacked so the panel reads the same at 380px as it does on a desktop, which is where it will mostly be read.

## R33: the chimera dossier

Everything physiology knows, folded into the pens card. Shut by default: the card already carries a portrait, temperament, obedience, four move slots and a parts manifest, and at 380px a ninth block open-by-default pushes the buttons off the first screen. The summary line carries class, flight and speed — the three facts worth a glance without opening it.

## R35: the matchup layer on the briefing

The class triangle was the only matchup the briefing showed. The tag chart is live in 96% of encounters and worth 4-7pp, and it was invisible on the screen where a team gets picked. Wins and losses read differently at a glance, because a briefing that only lists upsides is a brochure.

## R36: the species cell is a button now

The 34 base species carried a name, a role and a count — strictly less than the Dex showed for a variant of the same animal. The cell gains its tags (what variants and the field guide already show) and opens a sheet for the rest, because a 100px grid column cannot hold a set bonus and its effect. Inherits .dex-cell; this is the affordance only.

## R37: why you are losing

The two losing bands used to carry a constant prescription apiece, and "bring more creatures" was unfollowable for anyone already at the cap of three. The replacement is measured per matchup, so it earns a line of its own under the verdict rather than being folded into the band text.

## R41: veterancy, the Sparring Ring, and names

Levels are what a creature has been through; the chip and bar sit beside the chassis line so building and seasoning read as the two halves of the same creature. The rename pencil is quiet — the name is the feature.

## R179 — the expedition launcher's three chip rows

R179 — the expedition launcher's three chip rows. A gap rather than a margin, so the wrap at 380px cannot put two chips flush against each other: `tools/a11y.js` measures the gutter between neighbouring controls and 0px is a thumb hitting the wrong one.

## Four fixed columns

Four fixed columns, not auto-fit. auto-fit at minmax(90px) drops to three at 380px and leaves Record dangling alone on a second row with an empty half beside it — which became conspicuous the moment this card went permanently above the War Room's tabs.

## R208 — the slab

R208 — the slab: a chosen part drops into its socket. And IT'S ALIVE (splice/alive-ui.js): each beat a delayed animation, the scene ended by a timer, so the reduced-motion block can stop them all; `.is-still` is the frame it holds instead.

## The creature renderer pads its viewBox generously

The creature renderer pads its viewBox generously, so the zoom wrapper crops that back out. It also owns the FACING: everything is drawn facing right, so the foe's wrapper is mirrored — and because the sprite is its child, one set of keyframes then reads correctly on both sides.

## R206 — a hide whose colours shift

R206 — a hide whose colours shift: the cuttlefish's mantle. Its patches carry `anim` in data, the renderer writes it as a class, and the three layers fade on staggered clocks so the coat moves through its palette. Off under reduced motion, where each patch holds its own opacity.

## R103 — what the opposition has committed to

R103 — what the opposition has committed to. One line, directly above the buttons that answer it, because a telegraph the player has to look for is a telegraph nobody reads. Never below the 12px floor: it is the newest text in the game and it is not going to be the smallest.

## Region contestation (§3.9)

The coalition coming back for a node reads in the same visual language as a dissection countdown — red, a live clock, one button — because it is the same kind of thing: a window you can answer or lose.

## The five-region map (R26)

Each strip is its own card. A locked one keeps its name and its price of entry but folds its nodes away, so the region you are actually fighting in is never buried under three you cannot reach.

## R45 — completion stays above the tab bar

R45 — completion stays above the tab bar, because "how much of this have I found" is the whole reason the Dex is a screen and not a menu. Chips wrap rather than scroll: eight of them at 380px is three rows, and a row you have to swipe sideways is a row nobody reads.

## Containment & Rehabilitation (§3.6)

A bay is a fork, not a button: salvage and rehabilitation sit side by side with their real numbers so the choice is legible before any money moves (Law 4). Amber is the bandsaw, lime is the ball pit.

## Jobs board

Non-combat work. It sits above the map and reads in the game's "money" colour rather than its "war" colour, because the whole point is that this is the route that does not involve losing a fight.

## R38: what is holding a grade down

The forecast was one word for an animal with three inputs. The headroom chip is the hook that makes a card worth reading twice; the outlook line under it is what the player acts on.

## R129 — the release banner

R129 — the release banner, borrowing the dominion card's shape because it is the same kind of sentence: a standing state the wire announced once. `--warn` rather than `--accent` so the two never read as one event when a player holds the county and opens the doors in the same session.

## R44: the Pens fold

A stable is a list you scan before it is a creature you open. The shut row carries the clocks that cost you something when they run out — R15's rule, on the screen that grew past the War Room.

## The first screen a new player sees

The first screen a new player sees. It is a locked dialog: there is no game behind it to go back to, because the ranch has no animals until a lab is picked. Sized for the 380px phone first — five cards is a scroll, and the scroll is inside the panel rather than the page.

## R105 — the county calendar

R105 — the county calendar. The sky is an overlay INSIDE the header, never a theme token: five themes ship and a dusk that reached into the palette would make Blueprint at 7 p.m. a sixth theme nobody designed. Every theme keeps its own colours and simply has an evening.
