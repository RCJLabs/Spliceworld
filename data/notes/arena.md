# data/arena.json

R209: what a fight LOOKS like. The arena drew every move as the same lunge and shake, every fight in front of the same gradient and every knockout as the same flop; this file is the effect a move's tags make, the scenery a fight is held in and the way a fighter leaves. Read by exactly one module, `battle/stagecraft.js`, which turns a beat from the engine into markup and keyframes and never touches the page, and played by `battle/ui.js`. It is drawing, so it rides the deferred geometry round with the shape files (`GEOMETRY` in data/loader.js) and costs the first paint nothing; until it lands the arena fights on its plain stage, the way a portrait waits on its shapes.

Everything here is a row. A new tag's effect, a new region's backdrop and a new unit's exit are each one entry, and `tools/smoke.js` proves it by adding one of each to a copy of the content and asking the arena about them by name it has never been told.

## motions

Every animation the arena plays, as keyframes in a small vocabulary: `x`/`y` in percent of the element, `dx`/`dy` in pixels, `r` in degrees, `s` (or `sx`/`sy`) as scale, `o` as opacity and `at` as the offset. Every frame writes the same transform list, so any two interpolate. `ms` is the length at 1x battle speed (the arena divides by the player's speed) and `fill: forwards` holds the last frame, which is what an exit wants and an effect does not. Horizontal values turn with the side: drawn as if the action goes left to right, mirrored when it goes the other way, so "away" in an exit is away from the other fighter on either side of the stage.

These are Web Animations rather than CSS, so the stylesheet's reduced-motion block cannot switch them off. The arena's one `play` function checks the preference itself, and the smoke suite refuses any `.animate(` call in the game that is not behind that check (R99's rule, for motion the R99 rule could not see). Under reduced motion a round is flushed in one frame anyway, so nothing here is even built.

## effects

Keyed by move tag, plus `plain` for a move with none. A move with two tags draws both, layered. Shapes are the renderer's own format in a -100..100 box laid over the target, drawn as if the move arrives from the left. A hit is drawn whole, a hit the target was immune to is drawn faint, and a miss goes wide. Smoke reads the tags off every move in parts.json, enemies.json and combos.json (and the tag chart), so a tag that ships on a move without a row here fails the build.

The `shake` key names the motion the whole stage plays on a crit: the engine's own (a cornered Brave creature, now on the beat as `crit`) and the arena's (any hit better than even, which the floating number has called a crit since M2).

## backdrops

Keyed by REGION ID, so a sixth region's scenery is a row with that region's id and nothing else; `backdropByKind` names the ones a fight's kind decides instead (the Gauntlet's hangar), and `homeBackdrop` is where everything with no node is held: a raid on the ranch, a rival calling round, a breakout. Drawn in a 480x270 box sliced to the stage and anchored at the floor, so a short phone loses sky rather than ground, and a wide one loses the sides. Keep the detail between x 60 and 420 and below y 60: the stage title sits over the top band and a 380px phone crops about forty units from each side. Every colour carries its own opacity so the scenery sits back in all five themes rather than competing with the fighters.

## exits

How a knockout leaves. Every unit in enemies.json names one as `exit`, beside the `koLine` it acts out, and `chimeraExit` is the one every chimera takes: yours, a rival's, a feral's. A chimera curls up for a nap. `motion` moves the fighter; `prop` is what it brings (a canopy, a hook, smoke on the floor) with a motion of its own, and it either `rides` with the fighter or stays where it fell. A prop that `turns` (speed lines) is mirrored with the direction of travel.

`cues` are the words in a line that can only mean this exit: "parachute", "loudly", "deflat", "sink", "hoist", "nap". Smoke reads every unit's line for them, so a unit whose line says it parachutes and whose exit says otherwise fails, and so does an exit nobody takes. A line with no cue is matched by hand: the Fire Brigade waves and goes back to its pancake breakfast, which is an `exeunt`, and no word list should pretend to know that.
