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

import { mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sleep, serve, findChrome, connect, CHROME_CANDIDATES } from './cdp.js';

const REPORT = process.argv.includes('--report');

// The budget is what the game costs to put on screen: every module main.js
// compiles, plus the content that decides what things ARE. A ceiling with
// room in it, not a fingerprint — a gate that fails when somebody adds a
// species is a gate people learn to raise without reading. What it must
// catch is a whole class of file coming back in front of the player, which
// is what happened here and cost 400 KB.
const FIRST_PAINT_KB = 1100;

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
  console.log(`boot ✓  no geometry in front of the game, and under ${FIRST_PAINT_KB} KB to put it on screen`);
}

await main();
