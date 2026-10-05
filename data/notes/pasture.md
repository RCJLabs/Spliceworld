# data/pasture.json

R210: the Ranch's pasture, the field under the sky R105 paints in the header. Read by one module, `ranch/pasture.js`, which `main.js` fetches after the first paint (beside `ui/sky.js`) and whose `pastureMarkup` it hands to the Ranch as `ctx.pasture`. This file rides the deferred geometry round (`GEOMETRY` in data/loader.js), so neither the module nor its drawing is anything a player waits on to see the game; until both land the Ranch is drawn exactly as it was.

Everything is drawn in one 400x160 box, the pasture's own 5:2 aspect, so the scene and the buttons standing on it always agree about where the ground is. A phone shows the whole of it at full width; from 560px up it stops growing and sits centred.

## spots

Where the animals stand, as percentages of the pasture: `x` is the middle of the animal, `y` its feet, `w` its width. ONE ROW, ON PURPOSE. Every animal is a button, and the a11y gate holds every control to 40px and 6px of air from its neighbour; at 380px a 14%-wide animal is 50px, and a second row would put buttons on top of buttons. Six spots at 16.5% apart leave 9px between them. The y alternates by five points so the row reads as a herd rather than a queue. `cap` is how many stand out here (never more than there are spots, and never more than the Ranch's page of eight, so every animal in the field is one whose card is on the screen below it); the rest are counted in a line under the picture.

The animals are the Ranch roster's own first rows, in its own order: the ones ready to graduate, then the ones that need care. What is out in the field is what the list below would put first.

## viewBox

The crop each animal is drawn in. A portrait's crop leaves room above the head for things the pasture does not have, which made every animal half its button.

## seasons

Keyed by the season ids in data/calendar.json. `palette` is what the land is painted with: `@primary` the field, `@secondary` the far hills, `@accent` the season's own detail. `shapes` is that detail (flowers, dry grass, falling leaves, snow on the ground and the barn roof). A season this file has not drawn falls back to its first entry rather than drawing nothing.

## weather

Keyed by the weather ids in data/calendar.json; smoke holds the two lists equal. Shapes carry `anim` (R206's field), which the renderer writes as a class: `pasture-fall`, `pasture-drift` and `pasture-shimmer` are in style.css with their reduced-motion off-switch beside them. The weather is drawn IN FRONT of the animals, with the hour's dark and the lamps' light, so a downpour falls on the goats and night darkens them too.

## lampBands

The sky bands (data/calendar.json's `sky.bands`) in which the lamps are lit. The tint over the scene is the sky's own, from `skyOf`, so the pasture and the header can never disagree about what time it is.

## eggSlots

One glow in the barn's round window per egg in the incubator, up to three.

## fedHours

How long after a feed an animal is still munching (a small bob and a tuft of hay at its feet), and `groomedHours` how long after grooming it shines (a sparkle). Care is shown, never asked for: the Ranch's roster is where the buttons are.
