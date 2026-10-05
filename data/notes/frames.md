# data/frames.json

Frames = torsos. Each defines a size class, a torso drawing, a silhouette (clip target for hide overlays), and standardized attachment sockets. Any part fits any socket of its slot type. Socket = {x, y, angle, scale, shade?}. Part-local conventions: head faces +x with origin at the neck; limbs hang +y from origin at the shoulder/hip; tails extend -x from origin at the rump; hide draws in torso space (origin = torso center); organ draws at the belly socket. Torso shapes use the hide species' palette (@primary/@secondary/@accent) or a neutral gray when no hide is spliced. M3: phys = the frame's base mass and stat contributions before parts. M7.5 art: shadow = ground-contact ellipse drawn behind the creature; form = volume shading clipped to the silhouette (bottom occlusion + top rim light). Balance pass: frame hp was the bulk of a creature's health (S55/M70/L105), which made empty sockets strictly better — you kept the HP and dropped the metabolic draw. Health now comes from the parts you install; the frame contributes a chassis floor, its mass, and its socket count. organ2 is the second organ bay, unlocked by Surgery Theater Tier II (see facility.json). Every frame carries the socket; whether the player may fill it is a facility question, not a geometry one. A9: frames were a LADDER, not a lever — measured over 105 (node x archetype) cells, bigger was better in 92% of them and the S frame was strictly best in exactly none. The cause was that mass cost only turn order while hp/stamina/regen were unconditional, and the one categorical payoff for staying light — flight — was computed here and read by nothing. Two fixes: the Airborne DEFENDER tag now requires lift >= mass (see physiology.js), and the frame stat spread is compressed so the chassis is a floor rather than the bulk (L's free lunch over M went from +12hp/+10stamina to +6/+6). `slots` is the fourth lever and the one this file's own summary always claimed to have: a frame may declare which slot types its geometry supports, and the Theater intersects that with what the facility has installed. A frame with no `slots` supports all of them, so every save that predates the Kite is untouched. R32: the Scamper's mass dropped 40 -> 28. Once part mass expressed the animal (see species.json `bulk`), the small chassis was heavier than two entire eagles, so it — not the build — decided flight, and every purebred flier missed its own lift ceiling by one to four mass. The chassis is a FLOOR here for the same reason A9 made it a floor for hp.

## frames[].sockets

**The middle pair (R207).** A genome socket used to take exactly the part type
its name said, and `organ2` an organ. The Hexapod's `midlimbs` takes a
forelimb OR a hindlimb, so one creature can carry scythes, wings and goat legs
at once. `render/renderer.js` says so once, in `SOCKET_SLOTS`, and every "does
this part fit that socket" reads `socketFits`. That covers the renderer's
genome check, `validateSplice`, the Theater's pickers and the walker.

**A frame takes a socket only where it can draw it.** `frameHasSocket` reads a
frame's own positions: a genome socket draws into the frame positions the
renderer's LAYERS name for it, and the frame takes the socket only if it
defines every one of them. The Kite has no hindlimb positions, so it takes no
hindlimbs, which is what its `slots` list already said. Only the Hexapod has
`midlimb_near` and `midlimb_far`, so the Theater can grant `midlimbs` at Tier
III without it appearing on any other chassis. A new frame with a middle
pair is a data edit. `midlimbs` sits LAST in `SOCKETS`, so every list that
walks that one in order meets it after everything it already knew.
