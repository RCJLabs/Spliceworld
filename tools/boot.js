// R81 — WHAT THE GAME DOWNLOADS BEFORE IT SHOWS YOU ANYTHING.
//
// R74 capped the eager JS by walking the import graph on disk, which is a
// fair proxy and not the thing itself. This is the thing itself: a real
// browser, a real service, and the network log in order, split at the
// moment the first pixel of the game lands.
//
// The measurement that put R81 in the queue: `parts[].shapes` was 69% of
// data/parts.json and `units[].shapes` 73% of data/enemies.json — 400 KB
// between them, HALF of everything the game downloads, read by exactly one
// module (render/renderer.js) and needed by nothing that happens before a
// creature is on screen. Both now ship as their own file and are fetched
// after the first paint. This gate is what stops them coming back.
//
// THE LINE IS "THE GAME IS ON SCREEN", NOT firstContentfulPaint. The first
// version of this gate split on FCP and PASSED ON THE OLD BEHAVIOUR: the
// shell's header and tab bar are static HTML, so FCP fires long before any
// content is fetched at all, and 400 KB of geometry landing in the same
// round as everything else still counted as "after the paint". A gate that
// cannot tell the two apart proves nothing. So the split is the moment a
// screen first has a game in it — recorded by an observer injected before
// the document runs, on the same `performance.now()` clock the resource
// timings use, so there is no clock conversion to get wrong.
//
// It asserts three things, in the order they matter:
//   1. No geometry is requested before the game is on screen.
//   2. The geometry does arrive afterwards — a gate that passed because the
//      pictures were simply gone would be worse than no gate.
//   3. The bytes ahead of that moment stay under a budget.
//
//   node tools/boot.js            # fails over budget
//   node tools/boot.js --report   # prints the whole waterfall
//
// NO DEPENDENCIES, per CLAUDE.md — the CDP driver is tools/cdp.js, which R73
// wrote rather than taking Playwright.

import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sleep, serve, findChrome, connect, CHROME_CANDIDATES, MIME } from './cdp.js';

// R122b's freshness check serves the repo itself, with the headers GitHub
// Pages sends. `serve()` cannot be reused for it: it deliberately sends no
// cache headers, which is the one condition this has to reproduce.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const REPORT = process.argv.includes('--report');

// The budget is what the game costs to put on screen: every module main.js
// compiles, plus the content that decides what things ARE. A ceiling with
// room in it, not a fingerprint — a gate that fails when somebody adds a
// species is a gate people learn to raise without reading. What it must
// catch is a whole class of file coming back in front of the player, which
// is what happened here and cost 400 KB.
// R119 raises it 1100 -> 1106, measured at 1102. This gate loads a FRESH
// save, and on a fresh save the founding choice IS the first paint: the
// player has no herd and no other screen to be on. So `ranch/founding-ui.js`
// (4.4 KB) and `data/starters.json` are the thing being looked at rather
// than weight in front of it — and the module is fetched on that first-ever
// open only, never again for that save. What the gate exists to catch is
// unchanged: a whole CLASS of file arriving in front of the player, the way
// the shape files once did at 400 KB.
const FIRST_PAINT_KB = 1106;

// Anything matching this is geometry, and geometry is never allowed in
// front of the game.
const GEOMETRY = /-shapes\.json(\?|$)/;

// Injected before anything else runs. Records the instant a screen first
// has something in it, which is the instant the player has a game to look
// at rather than a header.
const WATCH_FIRST_RENDER = `(() => {
  window.__gameAt = null;
  const done = () => {
    if (window.__gameAt !== null) return false;
    const painted = [...document.querySelectorAll('.screen')].some((s) => s.innerHTML.trim());
    if (painted) { window.__gameAt = performance.now(); return true; }
    return false;
  };
  const start = () => {
    if (done()) return;
    const obs = new MutationObserver(() => { if (done()) obs.disconnect(); });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})()`;

// R122b — DOES A DEPLOY REACH A PHONE THAT ALREADY HAS THE APP?
//
// R122 shipped, GitHub Pages deployed it, and the reporter's phone kept
// showing the broken screen. The service worker calls itself network-first,
// but a plain `fetch(request)` READS THROUGH THE BROWSER'S HTTP CACHE, and
// Pages serves the shell with `Cache-Control: max-age=600` — so it returned
// the old file believing it had gone to the network, and then wrote that
// stale copy into the freshly-named cache, where it outlived the ten
// minutes. Nothing in the suite could see it: every other browser gate
// bypasses the service worker on purpose, so the one code path that decides
// whether a build reaches a player had never been run.
//
// This runs it. A server that sends exactly what Pages sends, a fresh
// profile so the worker installs from scratch, the app opened twice so it
// takes control, then the stylesheet CHANGED — served from memory, so the
// working tree is never touched — and the app reopened the way a player
// reopens it. The marker is a custom property on `body` so the check does
// not depend on which screen happens to be up.
//
// One trap this cost an hour of: `Page.navigate` to an identical URL is not
// a reload and re-requests nothing, so the first version of this reported
// BOTH workers as broken. Leaving the page and coming back is the honest
// simulation of reopening the app.
const MARKER = '\n:root{--deploy-marker:7}\n';

async function deployReaches(note) {
  const chrome = findChrome();
  let override = null;
  const srv = createServer(async (req, res) => {
    const path = decodeURIComponent(req.url.split('?')[0]);
    const file = join(root, path === '/' ? '/index.html' : path);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    try {
      let body = await readFile(file);
      if (override && path.endsWith('style.css')) body = Buffer.concat([body, Buffer.from(override)]);
      res.writeHead(200, {
        'content-type': MIME[extname(file)] ?? 'application/octet-stream',
        'cache-control': 'max-age=600',      // what GitHub Pages sends
      });
      res.end(body);
    } catch { res.writeHead(404).end('not found'); }
  });
  const port = await new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));
  const profile = await mkdtemp(join(tmpdir(), 'spliceworld-deploy-'));
  const cdpPort = 9600 + Math.floor(process.pid % 90);
  const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profile}`, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', 'about:blank'],
    { stdio: 'ignore' });
  let cdp;
  try {
    cdp = await connect(cdpPort);
    const { send, evaluate } = cdp;
    await send('Runtime.enable');
    await send('Page.enable');
    const url = `http://127.0.0.1:${port}/index.html`;
    await send('Page.navigate', { url }); await sleep(2600);
    await send('Page.navigate', { url }); await sleep(2600);
    if (!await evaluate('!!navigator.serviceWorker.controller')) {
      note('the service worker never took control, so nothing measured whether a deploy reaches a player');
      return;
    }
    override = MARKER;                        // the deploy
    await send('Page.navigate', { url: 'about:blank' }); await sleep(500);
    await send('Page.navigate', { url }); await sleep(3200);
    const got = await evaluate(`getComputedStyle(document.body).getPropertyValue('--deploy-marker').trim()`);
    if (got !== '7') {
      note('a new build does NOT reach a browser that already has the app cached — the service worker is serving the previous deploy');
    }
  } finally {
    try { cdp?.ws.close(); } catch { /* already gone */ }
    proc.kill();
    srv.close();
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

async function main() {
  const chrome = findChrome();
  if (!chrome) {
    console.error('boot: no Chromium found. Set CHROME=/path/to/chrome and re-run.');
    console.error('       (searched: ' + CHROME_CANDIDATES.join(', ') + ')');
    process.exit(2);
  }
  const { server, port } = await serve();
  const profile = await mkdtemp(join(tmpdir(), 'spliceworld-boot-'));
  const cdpPort = 9900 + Math.floor(process.pid % 90);
  const proc = spawn(chrome, [
    '--headless=new', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profile}`,
    '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', 'about:blank',
  ], { stdio: 'ignore' });

  const problems = [];
  const note = (m) => problems.push(m);
  let cdp;
  try {
    cdp = await connect(cdpPort);
    const { send, evaluate } = cdp;
    await send('Page.enable');
    await send('Network.enable');
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    // The service worker precaches the whole shell; measuring through it
    // would measure the cache rather than what a first visit costs.
    await send('Network.setBypassServiceWorker', { bypass: true });
    await send('Emulation.setDeviceMetricsOverride', { width: 380, height: 780, deviceScaleFactor: 1, mobile: true });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: WATCH_FIRST_RENDER });

    const url = `http://127.0.0.1:${port}/index.html`;
    await send('Page.navigate', { url });
    // Long enough for the deferred second round to land as well, because
    // assertion 2 needs to see it arrive.
    await sleep(4000);

    // Read the waterfall out of the page rather than off the wire, so the
    // request times and the render time are the same clock by construction.
    const seen = await evaluate(`(() => ({
      gameAt: window.__gameAt,
      resources: performance.getEntriesByType('resource').map((e) => ({
        name: e.name, at: e.startTime, bytes: e.transferSize || e.encodedBodySize || 0,
      })),
      documentBytes: (performance.getEntriesByType('navigation')[0]?.transferSize) || 0,
    }))()`);

    if (seen.gameAt === null || seen.gameAt === undefined) {
      note('no screen ever painted, so nothing here was measured');
    } else {
      const gameAt = seen.gameAt;
      const before = seen.resources.filter((r) => r.at <= gameAt);
      const after = seen.resources.filter((r) => r.at > gameAt);
      const kb = (list) => list.reduce((n, r) => n + r.bytes, 0) / 1024;
      const beforeKb = kb(before) + seen.documentBytes / 1024;

      // 1. no geometry in front of the game
      for (const r of before.filter((r) => GEOMETRY.test(r.name))) {
        note(`${r.name.split('/').pop()} is fetched BEFORE the game is on screen`);
      }
      // 2. …and it does arrive afterwards
      const landed = after.filter((r) => GEOMETRY.test(r.name));
      if (!landed.length) {
        note('no geometry was fetched at all — the creatures never arrive, so clause 1 would pass for the wrong reason');
      }
      // 3. the budget
      if (beforeKb > FIRST_PAINT_KB) {
        note(`the game waits on ${beforeKb.toFixed(0)} KB to reach the screen, over the budget of ${FIRST_PAINT_KB} KB`);
      }

      if (REPORT) {
        for (const r of [...seen.resources].sort((a, b) => a.at - b.at)) {
          console.log(`  ${r.at <= gameAt ? 'before' : ' after'}  ${(r.bytes / 1024).toFixed(1).padStart(8)} KB  `
            + `${r.at.toFixed(0).padStart(5)}ms  ${r.name.replace(/^http:\/\/[^/]+\//, '')}`);
        }
        console.log('');
      }
      console.log(`boot: ${before.length + 1} requests and ${beforeKb.toFixed(0)} KB to put the game on screen `
        + `(at ${gameAt.toFixed(0)}ms), ${after.length} and ${kb(after).toFixed(0)} KB after it`);
      console.log(`boot: deferred — ${landed.map((r) => r.name.split('/').pop()).join(', ') || 'nothing'}`);
    }

    // And the shell that paints has to be a working one, not an error card.
    const alive = await evaluate(`!!document.querySelector('#screen-ranch')?.innerHTML.trim()`);
    if (!alive) note('the Ranch painted nothing, so the boot this measured is not a working one');
  } finally {
    try { cdp?.ws.close(); } catch { /* already gone */ }
    proc.kill();
    server.close();
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }

  if (problems.length) {
    console.error(`\nboot ✗  ${problems.length} problem${problems.length === 1 ? '' : 's'}`);
    for (const p of problems) console.error(`  · ${p}`);
    process.exit(1);
  }
  await deployReaches((m) => problems.push(m));
  if (problems.length) {
    console.error(`\nboot ✗  ${problems.length} problem${problems.length === 1 ? '' : 's'}`);
    for (const p of problems) console.error(`  · ${p}`);
    process.exit(1);
  }
  console.log(`boot ✓  no geometry in front of the game, under ${FIRST_PAINT_KB} KB to put it on screen, and a new build reaches a phone that already has the old one`);
}

await main();
