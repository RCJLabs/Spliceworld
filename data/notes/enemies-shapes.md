# data/enemies-shapes.json

R81: the drawing half of data/enemies.json, split out because it was 73% of the file and is read by exactly one module (render/renderer.js), from two screens that are both lazy. Keyed by unit id. NOT fetched before the first paint - data/loader.js pulls it in after the shell is on screen and merges it onto content.enemies[id].shapes. Unlike parts.json this file is HAND-AUTHORED: adding a unit means adding its stats here and its body there, and smoke asserts the two halves stay paired so a unit can never have one without the other.
