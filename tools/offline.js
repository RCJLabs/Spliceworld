// R100 — THE APP ASKS 85 TIMES FOR BYTES IT ALREADY HAS.
//
// `sw.js` called itself "network-first with cache fallback" from M7 to R100,
// and for a browser that already has the app that is the wrong way round. What
// the R100 entry got wrong is WHERE that hurts. Measured on the tree this gate
// was written against, cold open, app already cached, timed to the moment a
// screen first holds a game:
//
//     wire cut      125ms     0 requests reached the server
//     server +0ms   200ms    85
//     server +50ms  891ms    85
//     server +150ms 2414ms   85
//     server +300ms 4683ms   85
//     server +800ms 12162ms  85
//
// OFFLINE IS THE CASE NETWORK-FIRST ACCIDENTALLY HANDLED. A dead port refuses
// instantly, so all 85 failures cost 125ms between them and the cache answers.
// The entry's Done-when — "opens offline in under a second" — therefore PASSED
// on the unfixed tree, which is how a criterion can be true and useless at once.
//
// The defect is the ordinary case: a phone with a signal, where a request does
// not fail, it WAITS. At 300ms of latency the app took 4.7 seconds to show a
// game it had on disk the whole time, 37x slower than with the wire cut.
//
// SO THE RULE HERE IS A SLOPE, NOT A STOPWATCH. "Under a second" is a fact
// about this box as much as about this code, and R151 spent a milestone
// learning what wall-clock budgets do when the host has an opinion. The rule
// that cannot drift is: WITH THE APP ALREADY CACHED, HOW LONG IT TAKES TO OPEN
// DOES NOT DEPEND ON THE NETWORK. Open it at +150ms and again at +800ms; if the
// shell is being waited on the second is far slower, and if it is not, the two
// are the same number. Network-first reads 2,384ms against 12,162ms.
//
// COUNTING REQUESTS WAS TRIED FIRST AND IS THE WRONG INSTRUMENT. The obvious
// rule — no request reaches the server before the first paint — cannot tell a
// blocking fetch from a background revalidation, because both land inside the
// same window and the revalidation is the entire point of the strategy. It
// reported 12 "blocking" requests against a 216ms open at +150ms of latency,
// which is arithmetically impossible: twelve serial round trips do not fit in
// 216ms. A slope has no such ambiguity — a request nobody awaited cannot make
// the open slower, whatever it costs.
//
// The entry's own second is kept as well, measured at the latency where it
// bites rather than at the one where it cannot.
//
// HOW OFFLINE IS SIMULATED, and why it is not `Network.emulateNetworkConditions`.
// It was, first, and it measured nothing: 800ms of emulated latency changed the
// open by 40ms, because the CDP Network domain is attached to the PAGE target
// and the worker's own fetches are made somewhere it does not reach. The
// latency is in the SERVER here, where nothing can route around it. For the
// offline leg the server is CLOSED outright — not throttled, closed — so if a
// pixel arrives it came out of Cache Storage, there being nowhere else left.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome, CHROME_CANDIDATES, connect, sleep, MIME } from './cdp.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');

// The entry's own number, kept because it is the Done-when. It is checked at
// LAG_MS, not at zero and not offline — see the note above.
const OPEN_BUDGET_MS = 1000;

// An ordinary mobile round trip, not a bad one. The gate should fail on the
// connection most players actually have, so that passing means something.
const LAG_MS = 150;

// The second reading, six times worse, which is a tunnel rather than a train.
const SLOW_MS = 800;

// How much of that 650ms difference is allowed to reach the player. Generous
// on purpose: a cache-first shell measures single digits here and a
// network-first one measures about 9,700ms, so anything in between is a fault
// and there is no need to be clever about where the line sits.
const SLOPE_MS = 400;

// `Page.navigate` to about:blank and back reuses the page's compiled modules
// and its warm heap, which is a RETURN rather than an open. Every measurement
// below goes through a blank tab first for that reason.
const BLANK = 'about:blank';

const WATCH_FIRST_RENDER = `(() => {
  window.__navAt = performance.now();
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
  const problems = [];
  const note = (m) => problems.push(m);

  const chrome = findChrome();
  if (!chrome) {
    console.error('offline: no Chromium found. Set CHROME=/path/to/chrome and re-run.');
    console.error('         (searched: ' + CHROME_CANDIDATES.join(', ') + ')');
    process.exit(1);
  }

  // Exactly what GitHub Pages sends. The ten minutes of `max-age` is what
  // R122b's whole finding turned on, and a gate served without it would be
  // measuring a site nobody visits.
  let lag = 0;
  let hits = 0;
  const srv = createServer(async (req, res) => {
    const path = decodeURIComponent(req.url.split('?')[0]);
    hits += 1;
    if (lag) await sleep(lag);
    const file = join(root, path === '/' ? '/index.html' : path);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        'content-type': MIME[extname(file)] ?? 'application/octet-stream',
        'cache-control': 'max-age=600',
      });
      res.end(body);
    } catch { res.writeHead(404).end('not found'); }
  });
  const port = await new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));
  const url = `http://127.0.0.1:${port}/index.html`;

  const profile = await mkdtemp(join(tmpdir(), 'spliceworld-offline-'));
  const cdpPort = Number(process.env.SW_CDP_PORT) || 9700 + Math.floor(process.pid % 90);
  const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profile}`, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', BLANK],
    { stdio: 'ignore' });

  let cdp;
  let serverClosed = false;
  try {
    cdp = await connect(cdpPort);
    const { send, evaluate, errors } = cdp;
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 380, height: 780, deviceScaleFactor: 1, mobile: true });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: WATCH_FIRST_RENDER });

    // One open to install the worker, a second for it to take control.
    await send('Page.navigate', { url }); await sleep(3000);
    await send('Page.navigate', { url }); await sleep(3000);
    if (!await evaluate('!!navigator.serviceWorker.controller')) {
      note('the service worker never took control, so nothing here measured a cached open');
      return problems;
    }
    // And it has to have finished filling the cache, or every number below is
    // about an install race rather than about a fetch strategy.
    const cached = await evaluate(`(async () => {
      const keys = await caches.keys();
      let n = 0;
      for (const k of keys) n += (await (await caches.open(k)).keys()).length;
      return n;
    })()`);
    if (!cached) {
      note('the worker controls the page but its cache is empty, so there is nothing to open from');
      return problems;
    }

    // One cold open, timed, at a stated server latency. `hits` is reported
    // rather than asserted on — see the note above for why counting them is
    // the wrong instrument.
    const openOnce = async (atLag) => {
      lag = atLag;
      await send('Page.navigate', { url: BLANK }); await sleep(400);
      hits = 0;
      errors.length = 0;
      await send('Page.navigate', { url });
      // Long enough for the WORST case to finish, or a slow open would be
      // recorded as no open at all and the slope would read as a pass.
      await sleep(Math.max(12000, atLag * 40));
      const gameAt = await evaluate('window.__gameAt');
      const navAt = await evaluate('window.__navAt');
      return { ms: gameAt == null ? null : gameAt - navAt, touched: hits };
    };

    // --- 1. the ordinary case: cached app, unremarkable mobile latency -----
    const fast = await openOnce(LAG_MS);
    const fastErrors = errors.filter((e) => e && !/favicon/i.test(e));

    // --- 2. the same open, six times further from the server ---------------
    const slow = await openOnce(SLOW_MS);

    // --- 3. the wire cut ---------------------------------------------------
    // Belt and braces, and they catch different lies: the CDP override stops
    // the browser trying, closing the server stops anything succeeding if it
    // does. With only the first, a pass proves a request was refused; with
    // only the second, it proves nothing about DNS or the HTTP cache.
    await send('Network.enable');
    await send('Network.emulateNetworkConditions', {
      offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0,
    });
    await new Promise((r) => srv.close(r));
    serverClosed = true;
    const dark = await openOnce(0);
    const darkErrors = errors.filter((e) => e && !/favicon/i.test(e));

    const show = (r) => (r.ms === null ? 'NEVER PAINTED' : r.ms.toFixed(0) + 'ms');
    if (REPORT) {
      console.log('\ncold open, app already cached:');
      console.log(`  server +${LAG_MS}ms  ${show(fast).padStart(13)}   ${fast.touched} request(s) reached the server`);
      console.log(`  server +${SLOW_MS}ms  ${show(slow).padStart(13)}   ${slow.touched}`);
      console.log(`  wire cut       ${show(dark).padStart(13)}   ${dark.touched}`);
      console.log(`  budget         ${OPEN_BUDGET_MS}ms at +${LAG_MS}ms, and at most `
        + `${SLOPE_MS}ms of the gap between +${LAG_MS}ms and +${SLOW_MS}ms`);
    }

    // THE SLOPE. A cached shell is not waited on, so six times the latency is
    // the same open; this is the assertion that does not move with the host.
    if (fast.ms !== null && slow.ms !== null && slow.ms - fast.ms > SLOPE_MS) {
      note(`going from +${LAG_MS}ms to +${SLOW_MS}ms of server latency costs the player `
        + `${(slow.ms - fast.ms).toFixed(0)}ms of open time (${show(fast)} to ${show(slow)}) on an app that `
        + `is already cached — the worker is asking the network before it will use the cache`);
    }
    // AND THE ENTRY'S OWN SECOND, at the latency where it means something.
    if (fast.ms === null) {
      note(`the game never reached the screen with the server at +${LAG_MS}ms`);
    } else if (fast.ms > OPEN_BUDGET_MS) {
      note(`the app takes ${fast.ms.toFixed(0)}ms to open at +${LAG_MS}ms of latency, `
        + `over the ${OPEN_BUDGET_MS}ms budget`);
    }
    if (slow.ms === null) note(`the game never reached the screen with the server at +${SLOW_MS}ms`);
    // And it must still work with nothing there at all, which is the clause the
    // entry actually wrote and the one case that already passed.
    if (dark.ms === null) {
      note('the game never reached the screen with the server closed');
    } else if (dark.ms > OPEN_BUDGET_MS) {
      note(`the app takes ${dark.ms.toFixed(0)}ms to open with the server closed, over the ${OPEN_BUDGET_MS}ms budget`);
    }
    // A screen that painted with half its data missing is not an open. R99's
    // rule, applied to the one path no other browser gate runs.
    for (const [when, list] of [[`+${LAG_MS}ms`, fastErrors], ['offline', darkErrors]]) {
      if (list.length) note(`the ${when} open logged ${list.length} console error(s): ${list.slice(0, 3).join(' | ')}`);
    }
  } finally {
    try { cdp?.ws.close(); } catch { /* already gone */ }
    proc.kill();
    if (!serverClosed) srv.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
  return problems;
}

const problems = await main();
if (problems.length) {
  console.error(`offline ✗  ${problems.length} problem${problems.length > 1 ? 's' : ''}:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`offline ✓  a cached shell is never waited on — the game opens under ${OPEN_BUDGET_MS}ms `
  + `at +${LAG_MS}ms, at +${SLOW_MS}ms and with the server closed`);
