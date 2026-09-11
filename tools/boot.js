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
import { readFileSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sleep, serve, findChrome, connect, CHROME_CANDIDATES, MIME } from './cdp.js';
import { fixtureSave } from './a11y.js';

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
// R121 BRINGS IT DOWN: 1106 -> 1055, measured at 1050. Deferring the Vault,
// the Theater and the extraction sequence took 26 KB of screen chrome and
// three requests out from in front of the player. Same rule as ever — the
// ceiling sits just above the measurement, so creep fails.
// R101 BRINGS IT DOWN AGAIN: 1055 -> 1020, measured at 1016. Splitting
// save.js took 37 KB of migration table and slot machinery out from in
// front of the player. Same rule as ever — the ceiling sits just above
// the measurement, so creep fails.
// R91 RAISES IT: 1020 -> 1050, measured at 1045. The vault gained a bottom,
// which is a system rather than chrome: `splice/vault.js` (8.6 KB) is the
// one door everything that puts a part on a shelf goes through, and
// `splice/extract.js` — eager since M2, because the Ranch's graduation
// forecast reads `gradeFor` on the first frame — imports it directly. There
// is no honest deferral: a dynamic import there would make `extractAnimal`
// async and ripple through every caller of a function that has been
// synchronous since the second milestone, to move 9 KB.
//
// The rest is the capacity rules themselves, spread across facility.js,
// theater.js, campaign.js and rehab.js, plus `splice/grades.js` — the grade
// staircase, split out of extract.js so the vault can price a rendering
// without importing the Extractor that imports it.
//
// R97 RAISES IT: 1050 -> 1055, measured at 1052. `campaign/rivals.js` gains
// `dexKeyFor` and `labOfDexKey` and `campaign/campaign.js` the recorder that
// uses them, both eager because `resolveBattle` is — the Dex is written the
// moment a fight ends, not when the Dex is opened. Two kilobytes of engine,
// and it is the trade this gate should want: the save every player carries
// on every load went from 143.9 KB to 134.6 KB, because it stopped keeping a
// page per duel.
//
// Same rule as ever: the ceiling sits just above the measurement, so creep
// fails. What this gate exists to catch is unchanged — a whole CLASS of file
// arriving in front of the player, the way the shape files once did at
// 400 KB.
//
// R128 RAISES IT: 1055 -> 1060, measured at 1057. `ui/facility-card.js` is
// 6.1 KB where the Ranch's private copy was 2.0, and the 4 KB is the three
// things the entry asked for: a card that takes the screen it is drawn on
// (five screens share one implementation now, where one screen had a copy
// nobody else could use), a buy row that says what the money BUYS from the
// grants rather than only its price, and the roll-up that stops a player who
// learned to buy upgrades on the Ranch finding them simply gone.
//
// It is eager for one reason and it is the right one: the Ranch is the only
// screen the shell paints without a dynamic import, and the Ranch is one of
// the five that draws a track. The other four pick the module up lazily,
// after it is already in memory.
//
// THIS IS THE THIRD RAISE IN THREE MILESTONES AND THAT IS WORTH SAYING OUT
// LOUD: 1050 -> 1055 -> 1060, each for a system rather than chrome, each
// measured. The next milestone that wants one should be made to bring the
// number DOWN instead — R101 and R121 both did, by 35 and 51 KB, and the
// same deferral work is still available (the Vault and the Theater screens
// are lazy; `campaign/map.js` and `campaign/campaign.js` are not).
//
// R129 RAISES IT: 1060 -> 1070, measured at 1068. The note above asked the
// next milestone that wanted a raise to bring the number DOWN instead, so
// this one owes an accounting rather than an argument.
//
// WHAT IT COST. 6.4 KB of eager JS and 1.8 KB of data. Every kilobyte of the
// JS is in the world tick — `campaign/world.js` runs `tickBreakouts` on the
// first frame, so the release, the pacing switch and the wild-anatomy
// widening in `campaign/rivals.js` are eager by this file's own rule (a
// module belongs here only if booting RUNS it), and all four modules were
// already in the graph for R82's reasons.
//
// WHY THE DEFERRAL THE OLD NOTE NAMED IS NOT AVAILABLE. Both candidates were
// re-checked this session and both are honest: `campaign/map.js` is imported
// by `ranch/agenda.js` and `ranch/onboarding.js`, which ARE the Ranch's first
// paint, and `campaign/campaign.js` owns `tickCampaign`. R121's rule has
// already collected the easy screens — the graph is 48 modules and every one
// of them runs.
//
// SO HERE IS THE MEASUREMENT THE NEXT PHASE SHOULD SPEND, taken this
// session: `data/*.json` carries 54.1 KB of `_doc` prose — developer notes
// the game never reads, downloaded by every player on every cold boot. That
// is five times what R129 added and eight times what R128 did, it is the
// same class of finding as R81's 400 KB of geometry (a whole category of
// bytes in front of a player who has no use for them), and it is the last
// big one left in the first paint. It is a phase and not a `sed` because
// `tools/gen-parts.js` regenerates `data/parts.json` from its own `_doc` and
// eight source comments cross-reference notes by filename, so it needs a
// home, a gate, and R127's generator kept exact. ROADMAP R130.
//
// R131 RAISED IT AGAIN: 1070 -> 1080, measured at 1075, and both that note
// and R129's said the same thing — the payment is `data/*.json`'s `_doc`,
// not this ceiling.
//
// R130 COLLECTS IT: 1080 -> 1025, MEASURED AT 1021, and the first paint has
// not been this small since R121. 53.8 KB of developer prose left the CORE
// payload (401.1 KB -> 347.3) without one word leaving the repository: the
// notes are `data/notes/<name>.md`, which is also what keeps them off the
// wire, since the precache rule ships `.js|.json|.css|.html|.webmanifest`
// and nothing else. Markdown is the mechanism, not a preference.
//
// This is R81's finding pointed at the last big class of bytes in front of
// the first paint. What it cost: `tools/gen-parts.js` stopped writing a
// `_doc` — and lost the loop where it read its own prose back in order to
// rewrite it, which had piled twenty-one copies of one paragraph into the
// file before anybody looked — and smoke gained three rules so it cannot
// come back.
//
// The rule found two things this milestone was not looking for: `tiers.json`
// carrying 365 characters under `_comment`, and one facility track carrying
// 190 under `_screenNote` — two other spellings of the same idea, one of
// them on a data file that had no note at all. The gate matches any
// underscore-prefixed string over 120 characters for exactly that reason.
// R135: 1025 -> 1030, measured at 1025.0 — a knife edge, which is exactly
// what R81's note below says a budget must not sit on. Two kilobytes bought
// the Surgery Theater's clock the units it needed (a Tier II table is half
// an hour and every message rounded to whole hours) and a pointer on the
// screen where the wait is felt; see the KB_CAP note in tools/smoke.js for
// why both land on the eager side.
//
// R149: 1030 -> 1035, measured at 1030.112. AND THIS IS THE SIXTH RAISE, so
// read R121's note below before reaching for a seventh — a budget defended
// case by case is not a budget, it is a queue, and this entry is the queue.
// What it bought was small and real: fifteen `Aimed` tags, one chart row and
// two part tags, 647 bytes of content that made Camo a decision instead of a
// penalty. What it did NOT buy is any more room than that; R149 inherited
// 1.44 KB of headroom and spent 1.55 KB.
//
// The honest fix was measured and deferred, not overlooked, and it is priced
// here so the next milestone does not have to rediscover it:
//
//   · 8.5 KB — drop `"tags": []` and `"keywords": {}` from the data files
//     wherever they are empty (237 + 90 in parts.json alone). Changes no
//     content whatsoever; costs a read-site audit, because every consumer
//     then has to tolerate an absent key rather than an empty one.
//   · 45 KB — take `enemies.json` out of the eager graph, which is R81's
//     geometry move pointed at the other big data file. Enemy stats are
//     reached from the War Room and the battle, and R74 already made both
//     lazy; what stops it today is that `data/loader.js` fetches every
//     content file as one bundle before the first paint.
//
// Either one ends this queue. A seventh raise just lengthens it.
//
// R140: 1035 -> 1036, measured at 1035.4, AND THIS IS THAT SEVENTH RAISE.
// Taken deliberately and with the alternative costed rather than waved at,
// because the note above exists to stop exactly this from happening quietly:
//
//   · What it bought: `tickWorld` records `dex.worn` — ten lines in
//     `campaign/world.js`. That is the whole of R140's boot-path cost, and it
//     is what turns "you collect 95% and build with 43%" from a claim nobody
//     could check into a number the reach gate holds at 50%.
//   · Why it was not paid from the queue: the empty-keys option is 7.0 KB
//     today, not the 8.5 the note estimated — re-counted, 286 `"tags": []`
//     and 129 `"keywords": {}` across five data files. It is still eleven
//     times what this raise needs. What stops it is the read-site audit the
//     note names: ~20 sites do a bare `part.tags.join(...)` with no fallback,
//     across physiology, statblock and the director, and rewriting those
//     inside an unrelated milestone is how a content-reach change ships a
//     battle-maths regression.
//
// So it is filed instead of fudged: ROADMAP R153 carries both options with
// today's prices, and this budget should come DOWN when it lands rather than
// stay wherever the last feature left it.
const FIRST_PAINT_KB = 1036;

// R101 — HOW MUCH OF THE SAVE SYSTEM DOES A PLAYER DOWNLOAD TO SEE A RANCH?
//
// `save/save.js` was 47.3 KB, and all of it eager, because `main.js` needs
// `loadSave` on the first frame. But over half that file is the migration
// table: forty-four steps, every one of which exists to move a save FROM a
// version the player is not on. A player whose save is current downloads
// all forty-four and runs none.
//
// The rest split the same way. Everything the slot picker, the export file
// and the new-run ceremony need is reached only from `save/settings-ui.js`,
// which R81 already made lazy — it was riding along in the eager graph
// purely because it shared a file with `loadSave`.
//
// So the budget is on the SAVE SYSTEM'S SHARE of the first paint, not on
// one filename: split it into three modules and the number is unchanged if
// main.js still eagerly imports all three. Measured at 11.0 KB after R101.
const SAVE_EAGER_KB = 15;


// R121 — THE RULE FOR WHAT THE FIRST PAINT CARRIES, and the reason it is
// here rather than in a comment.
//
// Five milestones running (R85, R86, R87, R119, and R120 before it turned
// around) each raised the eager-import cap by a few KB with a good local
// argument. Every one of those arguments was true. That is exactly the
// problem: a budget defended case by case is not a budget, it is a queue,
// and R87's own note called this out three phases before anybody acted on
// it. A number cannot fix that, because the next feature always has a
// reason. A RULE can.
//
// The rule is:
//
//     A module is allowed in the eager graph only if booting RUNS it.
//
// Not "if the first screen might need it", not "if it would be awkward to
// defer" — if a real boot, in a real browser, calls at least one function
// in it. That is a fact about the running game rather than an opinion about
// the architecture, so it cannot be argued up a milestone at a time. V8's
// precise coverage answers it directly.
//
// Measured on the tree that first ran this: SEVEN of 48 eager modules
// executed nothing at all. Three were SCREEN renderers sitting in main.js's
// own SCREENS table beside three that were already lazy — R74 deferred the
// War Room, the arena and the Dex on the principle that a tab you press is
// not the first paint, R120 deferred the Pens for the same reason, and both
// stopped short of the Vault and the Theater.
//
// ONE EXEMPTION, and it is a real one rather than an escape hatch: a module
// whose exports are CONSTANTS read at boot runs no function and is still
// needed. `applyTheme` reads `BASE_THEME` and `THEMES` on the first frame,
// so `ui/theme.js` never gets called and could never be deferred. Every
// entry here has to name what boot reads instead, which is the same shape
// as R50's MODULE_NOTES: an exemption you have to write a sentence for is
// one you notice yourself taking.
// The eager graph, walked the same way the KB cap in smoke walks it:
// STATIC imports only, because a dynamic import() is the whole point.
function eagerGraph(entry = 'main.js') {
  const seen = new Map();
  const walk = (rel) => {
    if (seen.has(rel)) return;
    let src;
    try { src = readFileSync(join(root, rel), 'utf8'); } catch { return; }
    seen.set(rel, statSync(join(root, rel)).size);
    for (const m of src.matchAll(/^\s*import\s(?:[\s\S]*?)from\s*['"](\.[^'"]+)['"]/gm)) {
      walk(relative(root, resolve(dirname(join(root, rel)), m[1])));
    }
    for (const m of src.matchAll(/^\s*import\s*['"](\.[^'"]+)['"]/gm)) {
      walk(relative(root, resolve(dirname(join(root, rel)), m[1])));
    }
  };
  walk(entry);
  return seen;
}

// Two categories, and both had to be earned by looking at every module the
// first run of this gate named rather than by waving at the list:
//
//   CONSTANTS AT BOOT — the module exports values, not behaviour, and the
//   first frame reads them. It can never be deferred and will never run a
//   function.
//
//   SYNCHRONOUS BY CONTRACT — the module is a leaf of `battle/` or the
//   campaign resolver, reached from code boot DOES run, and every call into
//   it is synchronous. Deferring it means making `resolveBattle` and the
//   creature statblock async, and CLAUDE.md's rule is that the balance
//   harness flies the same battle code the browser does, DOM-free and
//   without a build step. Trading that for 23 KB is the wrong trade, and
//   saying so here is cheaper than rediscovering it.
//
// Note what is NOT in this list: a screen. R74, R120 and R121 have each
// found one sitting eager, and no screen has ever had a reason to be.
const RUNS_NOTHING_BUT_BELONGS = {
  'ui/theme.js': 'applyTheme reads BASE_THEME and THEMES on the first frame; it calls nothing',
  'battle/moves.js': 'battle/statblock.js reads MOVE_SLOTS and activeMoves synchronously to describe a creature',
  'campaign/director.js': 'campaign.js calls directorNews inside resolveBattle, which the headless harness runs synchronously',
  'campaign/monologue.js': 'rivalLine and playerLine are read on the same synchronous battle-resolution path',
  // R91 — GRADES and GRADE_INDEX and nothing else. Two constants that half
  // the game reads synchronously to name a grade; the module has no code to
  // run. It exists apart from `splice/extract.js` so that `splice/vault.js`
  // can price a rendering without importing the Extractor that imports the
  // vault — a leaf both of them read, rather than a cycle.
  'splice/grades.js': 'extract.js and vault.js read GRADES and GRADE_INDEX synchronously to name and rank a grade',
};

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
  // R132 — see the note in tools/height.js. Two browsers run in this file,
  // so the assigned port covers both: base here and base + 1 below.
  const cdpPort = Number(process.env.SW_CDP_PORT) || 9600 + Math.floor(process.pid % 90);
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
  const cdpPort = (Number(process.env.SW_CDP_PORT) || 9899 + Math.floor(process.pid % 90)) + 1;
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
    // R121 — armed BEFORE the navigate, or the modules that run once at
    // boot are exactly the ones that go unrecorded.
    await send('Profiler.enable');
    await send('Profiler.startPreciseCoverage', { callCount: true, detailed: true });

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

    // ---- R121. every module boot compiles is a module boot RUNS ----------
    //
    // Read off the browser that just booted, so it is a fact rather than a
    // reading of the source. A module's top-level body always runs on
    // import — that is what importing IS — so the question asked is whether
    // any FUNCTION in it was called. Nothing called means nothing needed
    // it: the bytes were parsed and compiled in front of the player to sit
    // there.
    const ranAFunction = new Map();
    const harvest = async () => {
      const cov = (await send('Profiler.takePreciseCoverage'))?.result?.result ?? [];
      for (const script of cov) {
        if (!script.url.includes(`127.0.0.1:${port}/`)) continue;
        const file = script.url.split(`:${port}/`)[1]?.split('?')[0];
        if (!file || !file.endsWith('.js')) continue;
        // functionName '' is the module wrapper, which runs on import by
        // definition and therefore proves nothing.
        const ran = script.functions.some((f) => f.functionName !== '' && f.ranges.some((r) => r.count > 0));
        ranAFunction.set(file, (ranAFunction.get(file) ?? false) || ran);
      }
    };
    await harvest();

    // THE SECOND FIRST PAINT. Everything above this line booted an empty
    // browser, where the founding choice is the whole first screen — and a
    // returning player's first paint is a different one. Measuring only the
    // fresh boot condemns the wrong modules: `splice/extract.js` runs ten
    // of its fourteen functions drawing a herd that has animals in it, and
    // none at all for a player who has none yet. Both are the first paint,
    // so a module earns its place by running in EITHER.
    //
    // The fixture is the one `tools/a11y.js` owns rather than a second
    // recipe — R88 exported it for exactly this, after I once ran a whole
    // gate by accident just to get a save out of it.
    await evaluate(`localStorage.setItem('spliceworld_save', ${JSON.stringify(await fixtureSave())})`);
    await send('Page.navigate', { url: 'about:blank' });
    await sleep(300);
    await send('Page.navigate', { url });
    await sleep(3500);
    await harvest();
    if (!await evaluate(`!!document.querySelector('#screen-ranch')?.innerHTML.trim()`)) {
      note('the second boot, on a save with a herd in it, painted nothing — so half of this measurement is missing');
    }

    const eager = eagerGraph();

    // R101 — the save system's share of that graph. Derived from the same
    // walk the cap above uses, so a fourth save module cannot arrive
    // eagerly without this seeing it.
    {
      const saveFiles = [...eager].filter(([f]) => f.startsWith('save/'));
      const bytes = saveFiles.reduce((a, [, n]) => a + n, 0);
      const kb = bytes / 1024;
      if (kb > SAVE_EAGER_KB) {
        note(`the first paint carries ${kb.toFixed(1)} KB of the save system, over the budget of ${SAVE_EAGER_KB} KB`
          + ` (${saveFiles.map(([f, n]) => `${f} ${(n / 1024).toFixed(1)}KB`).join(', ')})`);
      } else {
        console.log(`boot: ${kb.toFixed(1)} KB of the save system is eager, under the ${SAVE_EAGER_KB} KB budget`);
      }
    }

    const idle = [];
    for (const file of eager.keys()) {
      if (file === 'main.js') continue;
      if (ranAFunction.get(file)) continue;
      // Never observed at all is not the same as observed doing nothing,
      // and reporting the two the same way is how a broken probe reads as
      // a clean tree.
      if (!ranAFunction.has(file)) {
        note(`${file} is imported eagerly but the browser never loaded it — this check measured nothing for it`);
        continue;
      }
      idle.push(file);
    }
    for (const file of idle) {
      if (file in RUNS_NOTHING_BUT_BELONGS) continue;
      const kb = (eager.get(file) / 1024).toFixed(1);
      note(`${file} (${kb} KB) is imported before the first paint and runs nothing during it`
        + ' — defer it, or name it in RUNS_NOTHING_BUT_BELONGS with what boot reads from it');
    }
    // An exemption for a module that DOES run is an exemption nobody needs,
    // and a stale one is how a list like this stops being read.
    for (const file of Object.keys(RUNS_NOTHING_BUT_BELONGS)) {
      if (!eager.has(file)) note(`RUNS_NOTHING_BUT_BELONGS names ${file}, which is not in the eager graph`);
      else if (ranAFunction.get(file)) note(`RUNS_NOTHING_BUT_BELONGS excuses ${file}, which runs during boot — drop the entry`);
    }
    if (REPORT) {
      const rows = [...eager.keys()].filter((f) => f !== 'main.js')
        .map((f) => ({ f, kb: eager.get(f) / 1024, ran: ranAFunction.get(f) }))
        .sort((a, b) => Number(a.ran) - Number(b.ran) || b.kb - a.kb);
      for (const r of rows) console.log(`  ${r.ran ? 'runs' : 'IDLE'}  ${r.kb.toFixed(1).padStart(7)} KB  ${r.f}`);
      console.log('');
    }
    const eagerKb = [...eager.values()].reduce((n, b) => n + b, 0) / 1024;
    console.log(`boot: ${eager.size} modules compiled eagerly (${eagerKb.toFixed(1)} KB), `
      + `${idle.length} of them running nothing on either first paint`);
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
  console.log(`boot ✓  no geometry in front of the game, under ${FIRST_PAINT_KB} KB to put it on screen, every eager module runs during boot, and a new build reaches a phone that already has the old one`);
}

await main();
