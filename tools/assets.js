// R100 — THE PLAY LISTING'S RASTER ART, PRODUCED RATHER THAN KEPT.
//
// `docs/TWA.md` wanted a 512x512 PNG of the icon and phone-aspect screenshots,
// because Play requires raster store art even though the TWA itself uses the
// manifest's SVG. CLAUDE.md says procedural SVG only, no image files — and
// that rule is about what the GAME draws, not about what a storefront wants in
// its metadata. Both can be true: nothing raster is committed, and the assets
// exist on demand.
//
// So this generates them into `dist/store/`, which is ignored. The checklist
// box stops being "remember to export a PNG from something" — an instruction
// to a human, and the weakest rule this repo has — and becomes one command
// whose output is reproducible from the same icon.svg the app ships.
//
// The renderer is the Chromium the browser gates already use. A PNG of an SVG
// is exactly a screenshot of that SVG at a known size, so there is no image
// library here and no dependency added; `--headless=new` can encode a PNG and
// that is the whole trick.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome, CHROME_CANDIDATES, connect, sleep, serve } from './cdp.js';
import { walkedSave } from './fixtures.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'dist', 'store');

// Play's own requirements: a 512x512 icon, and screenshots between 320 and
// 3840px on a side. 1080x1920 is an ordinary phone and is what the layout is
// designed against at 380 CSS px with a 3x scale factor -- see tools/a11y.js
// and tools/height.js, which measure the same width.
const ICON_PX = 512;
const SHOT = { width: 360, height: 640, scale: 3 };

// A PLAYED SAVE, NOT A FRESH ONE, and the first version of this did not have
// one. R119 puts a founding-lab choice in front of a new player, so all five
// screenshots came out byte-identical — 259,973 bytes of the same overlay,
// which is a listing that shows the game's setup dialog five times. The walked
// day-180 fixture is the same one tools/height.js photographs the layout with,
// so the store sees a ranch with animals in it.

// One per screen the store listing should show. `tab` is where to click first,
// because a screenshot of the Ranch five times over sells nothing.
const SHOTS = [
  { name: '1-ranch', tab: null },
  { name: '2-pens', tab: 'pens' },
  { name: '3-splice', tab: 'theater' },
  { name: '4-war', tab: 'battle' },
  { name: '5-dex', tab: 'dex' },
];

async function main() {
  const chrome = findChrome();
  if (!chrome) {
    console.error('assets: no Chromium found. Set CHROME=/path/to/chrome and re-run.');
    console.error('        (searched: ' + CHROME_CANDIDATES.join(', ') + ')');
    process.exit(1);
  }
  await mkdir(OUT, { recursive: true });

  const { server, port } = await serve();
  const profile = await mkdtemp(join(tmpdir(), 'spliceworld-assets-'));
  const cdpPort = Number(process.env.SW_CDP_PORT) || 9400 + Math.floor(process.pid % 90);
  const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profile}`, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    // The store art must not carry the service worker's idea of the build.
    '--disable-features=ServiceWorker', 'about:blank'], { stdio: 'ignore' });

  const made = [];
  let cdp;
  try {
    cdp = await connect(cdpPort);
    const { send, evaluate } = cdp;
    await send('Runtime.enable');
    await send('Page.enable');

    // --- the icon ----------------------------------------------------------
    // Served from a data: URL rather than the file, so the capture is of the
    // icon alone with nothing of the page around it.
    const svg = readFileSync(join(root, 'icon.svg'), 'utf8');
    await send('Emulation.setDeviceMetricsOverride', { width: ICON_PX, height: ICON_PX, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', {
      url: 'data:text/html,' + encodeURIComponent(
        `<style>html,body{margin:0;padding:0;background:transparent}svg{display:block;width:${ICON_PX}px;height:${ICON_PX}px}</style>${svg}`),
    });
    await sleep(700);
    const icon = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(OUT, `icon-${ICON_PX}.png`), Buffer.from(icon.result.data, 'base64'));
    made.push(`icon-${ICON_PX}.png`);

    // --- the screens -------------------------------------------------------
    await send('Emulation.setDeviceMetricsOverride', {
      width: SHOT.width, height: SHOT.height, deviceScaleFactor: SHOT.scale, mobile: true,
    });
    const url = `http://127.0.0.1:${port}/index.html`;
    await send('Page.navigate', { url });
    await sleep(1200);
    await evaluate(`localStorage.setItem('spliceworld_save', ${JSON.stringify(JSON.stringify(save))})`);

    for (const shot of SHOTS) {
      await send('Page.navigate', { url });
      await sleep(3200);
      // R107's welcome-back digest sits over the top of whatever screen opens,
      // and a store listing wants the game rather than the card that explains
      // what happened while you were out. Dismissed the way a player does.
      await evaluate(`(() => {
        const b = document.querySelector('#welcome button');
        if (b) { b.click(); return true; }
        return false;
      })()`);
      await sleep(900);
      if (shot.tab) {
        // Same selector the handler gate uses, so a renamed tab breaks this
        // the way it breaks everything else rather than silently producing
        // four pictures of the Ranch.
        const clicked = await evaluate(
          `(() => { const b = document.querySelector('[data-screen="${shot.tab}"]'); if (!b) return false; b.click(); return true; })()`);
        if (!clicked) {
          console.error(`assets ✗  no tab called "${shot.tab}" — the screen ids have moved`);
          process.exitCode = 1;
          continue;
        }
        await sleep(2200);
      }
      const png = await send('Page.captureScreenshot', { format: 'png' });
      await writeFile(join(OUT, `${shot.name}.png`), Buffer.from(png.result.data, 'base64'));
      made.push(`${shot.name}.png`);
    }
  } finally {
    try { cdp?.ws.close(); } catch { /* already gone */ }
    proc.kill();
    server.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
  return made;
}

// The walk costs about fifteen seconds and is deterministic from its seed, so
// the same command produces the same listing twice.
const save = await walkedSave();

const made = await main();
console.log(`assets ✓  ${made.length} file(s) in dist/store/ — ${made.join(', ')}`);
console.log('        (generated, never committed: CLAUDE.md keeps raster art out of the repo)');
