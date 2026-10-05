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
