// R101 — THE MIGRATED SAVE, IN A REAL BROWSER.
//
// Every browser gate in this repo seeds a save at the CURRENT version, so
// none of them has ever taken the migration path — and after R101 that path
// has something new in it: `migrate` is async and fetches
// `save/migrations.js` over the network the first time a stale save is
// opened. A missing file, a bad specifier or a promise nobody awaited would
// all look identical to a working build in every other gate, and would
// strand exactly the player this whole system exists to protect: the one
// coming back to an old save after an update.
//
// So this one seeds a REAL save of an old version — the same fixtures
// `tools/saves.js` uses, taken from the commit where that version was
// current — opens the game on it, and asks the three questions a returning
// player would: did it come up, did it come up without errors, and is the
// save now current in storage.
import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sleep, serve, findChrome, connect } from './cdp.js';
import { SAVE_VERSION } from '../save/save.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// The oldest save that can exist, the two eras that reshaped the ranch and
// the campaign, and the one immediately before today — rather than all 45,
// which would spend four minutes to re-answer the same question.
const VERSIONS = [1, 20, 30, SAVE_VERSION - 1];

const { server, port } = await serve();
const chrome = findChrome();
if (!chrome) {
  console.log('stale —  no Chromium on this machine, skipping');
  server.close();
  process.exit(0);
}
const profile = await mkdtemp(join(tmpdir(), 'sw-stale-'));
const cdpPort = 9500 + (process.pid % 300);
const proc = spawn(chrome, [
  '--headless=new', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profile}`,
  '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', 'about:blank',
], { stdio: 'ignore' });

const problems = [];
try {
  const { send, evaluate, errors } = await connect(cdpPort);
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Network.setBypassServiceWorker', { bypass: true });
  const url = `http://127.0.0.1:${port}/index.html`;
  await send('Page.navigate', { url });
  await sleep(900);

  for (const v of VERSIONS) {
    const fixture = readFileSync(join(root, 'tools', 'saves', `v${v}.json`), 'utf8');
    await evaluate(`localStorage.clear()`);
    await evaluate(`localStorage.setItem('spliceworld_save', ${JSON.stringify(fixture)})`);
    errors.length = 0;
    await send('Page.navigate', { url });
    await sleep(2400);

    for (const e of errors) problems.push(`a v${v} save logs an error on open: ${String(e).slice(0, 160)}`);
    const painted = await evaluate(`!!document.querySelector('#screen-ranch')?.innerHTML.trim()`);
    if (!painted) problems.push(`a v${v} save opens on a blank ranch — the migration never delivered a save the screen could paint`);
    const stored = await evaluate(`(() => { try { return JSON.parse(localStorage.getItem('spliceworld_save')).saveVersion; } catch { return null; } })()`);
    if (stored !== SAVE_VERSION) {
      problems.push(`a v${v} save is still at v${stored ?? 'nothing'} in storage after opening, not v${SAVE_VERSION}`);
    }
  }
} finally {
  proc.kill();
  server.close();
  // Cleanup must never become the verdict. Chromium can still be letting go
  // of its profile directory when we get here, and an ENOTEMPTY thrown from
  // this block replaces the answer with a housekeeping error — which is how
  // a run that had actually FOUND the bug reported a tidying failure
  // instead. Best effort, after a beat, and silent either way.
  await sleep(300);
  try { await rm(profile, { recursive: true, force: true }); } catch { /* the OS will get it */ }
}

if (problems.length) {
  console.error(`stale ✗  ${problems.length} problem${problems.length === 1 ? '' : 's'}`);
  for (const p of problems) console.error(`  · ${p}`);
  process.exit(1);
}
console.log(`stale ✓  a real save of v${VERSIONS.join(', v')} opens the game, paints the ranch,`
  + ` logs nothing, and is v${SAVE_VERSION} in storage afterwards`);
