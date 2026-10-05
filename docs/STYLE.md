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
