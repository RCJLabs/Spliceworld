# data/cosmetics.json

R214: dress for villainy. Two chimeras built from the same parts used to be identical, and nothing a player owned said "mine". Now a chimera can wear a dye and accessories, chosen from its card in the Pens. Read by `splice/wardrobe.js` (what the lab has earned, and putting it on) and by `render/cosmetics.js` (drawing it), both lazy; the portrait door, `chimeraPortrait` in `render/ribbons.js`, passes the look to the renderer, so it shows wherever the creature is drawn: the Pens, the arena, the specimen card and the fair. This file rides the second round (`LATE` in data/loader.js); until it lands a creature draws in its dye and without its accessories, and the wardrobe is not offered.

A LOOK NEVER BECOMES A NUMBER. A chimera's `look` is `{ dye, wear }`, and nothing in the battle, the physiology, the letter grade or the economy reads it. Smoke holds the tree to that by name (only the wardrobe, the drawing and the Pens may read `.look`), and `node tools/sim.js --cosmetics` fights every sampled build, every species' purebred among them, against every encounter twice on one seed, as built and dressed in a dye and an accessory in every slot, and compares the whole battle state after every step, the physiology, the letter and the upkeep. A row here carries no stat, and smoke refuses one that tries.

A LOOK IS READ, NEVER TRUSTED (R114). A dye that names no species with a palette is ignored; a worn id that names no row is skipped, and only the first in each slot is drawn. A look with nothing in it is deleted, so a natural creature saves exactly as it did before.

## dyes

A dye is a species' palette (`primary`, `secondary`, `accent` in species.json) laid over every part and the torso in place of their own. A species becomes a dye the first time an animal of it graduates (`extractAnimal` in splice/extract.js adds it to `wardrobe.dyes`). The v67 migration grants a lab every species whose essence it already holds, in a vial or as a part's donor, because nothing before then wrote graduations down. `label` names a dye in the picker (`{species}` is the species' name); `natural` and `naturalSub` are the option that takes a dye off.

## anchors

Where on a head each accessory sits, and how it is sized. Every generated head declares three points in its own space (`anchors` in data/parts-shapes.json, from `HEAD_ANCHORS` in tools/shapes.js): `crown`, the top of the skull with its half-width; `eye`, the near eye with its radius; `neck`, under the jaw. A hand-made head with none hangs all three off its near eye. An accessory's shapes are drawn for a head whose anchor size is `unit`, and scaled to this head's, clamped to `min` and `max`; `from` sizes an anchor by another one, so a bow tie grows with the skull rather than with the throat.

## unlocks

What each `unlock.kind` says on a chip the creature cannot wear yet. Four kinds are lab-wide and read the save's own progress: `notoriety` (the high-water mark, `campaign.notorietyPeak`), `commissions` (filled), `ribbons` (worn by the stable now) and `gauntlet` (exhibitions beaten). Once earned an accessory is kept in `wardrobe.unlocked`, so a ribbon that leaves with its winner does not take the bow tie with it. The fifth, `tier`, is a creature's own: it may wear the row while its letter is at least `tier`. A kind the wardrobe does not know is never earned, so a typo locks one row rather than unlocking everything.

## accessories

One row each, and a new accessory is one more row. `anchor` is where it sits; `layer` is `back` for something drawn behind the torso (the cape) and front otherwise. One accessory per anchor and layer: a hat replaces a hat, and a bow tie and a cape can be worn together. `shapes` use the renderer's own vocabulary (data/notes/parts-shapes.md), in the anchor's space at `unit` size; colours are literal, or the same `@` tokens a part uses, resolved against the creature's dye or its head's palette.
