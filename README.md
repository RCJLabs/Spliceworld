# Spliceworld

Cartoony mad-geneticist ranch/splice/battle game. Breed stock, extract essence, splice chimeras, conquer the world (gleefully, zero gore). Browser game: vanilla ES modules, no framework, no build step, procedural SVG only.

Design doc: [ROADMAP.md](ROADMAP.md) · Working agreement: [CLAUDE.md](CLAUDE.md) · Session log: [PROGRESS.md](PROGRESS.md)

## Run it

```
python3 -m http.server 8000    # or: npm run serve
# open http://localhost:8000
```

ES modules + fetch need a server; opening `index.html` from disk won't load. Deploy is push-to-main → GitHub Pages.

## Check it

```
node tools/smoke.js            # or: npm run smoke
```

Headless data/renderer/save/RNG sanity checks — the renderer is DOM-free on purpose so the M4.5 balance harness can reuse battle-adjacent code in Node. `tools/gallery.html` (served) renders every purebred, frame, and the acceptance creature for visual QA.

## Layout

```
index.html, style.css, main.js   app shell + M0 dev harness (grows into Surgery Theater)
render/renderer.js               genome → SVG string; interprets shape specs from data
save/save.js                     SAVE_VERSION-gated localStorage saves + migrations
util/rng.js                      mulberry32 seeded RNG streams
data/*.json                      ALL content: frames, species, parts (shapes included)
data/loader.js                   browser fetch wrapper
tools/                           dev-only: smoke test, part gallery
```

## The one rule that matters

**All content is data.** A creature is a genome (`{frame, parts}`), parts are JSON shape specs, frames define standardized sockets, and any part fits any socket of its slot. Adding a species = adding JSON. If adding content ever requires touching engine code, the engine is wrong — fix the engine. Part-local drawing conventions are documented in `data/frames.json` (`_doc`).
