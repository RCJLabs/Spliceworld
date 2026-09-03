// R73 — the accessibility floor, measured in a real browser.
//
// This ships as a TWA, so a control that is 28px tall is a control a thumb
// misses. Sizes are the one thing no static check can honestly assert: they
// come out of the cascade, the font, the flex row and the viewport together,
// and a rule that says `padding: 6px` tells you nothing about the box it
// produces. So this drives headless Chromium over CDP, walks every screen,
// subtab, fold and dialog at 380px, and reads getBoundingClientRect off
// every interactive element it can reach.
//
// NO DEPENDENCIES, per CLAUDE.md — which the acceptance criterion's word
// "Playwright" would have cost us. Node 22 ships a global WebSocket and
// fetch, and CDP is just JSON over one socket, so the driver is forty lines
// here rather than a node_modules tree. The static half of the criterion
// (focus ring, live region, dialog, aria-current) is asserted too, because
// a gate that measured boxes and ignored semantics would pass a game no
// keyboard could play.
//
//   node tools/a11y.js            # fails below the floor
//   node tools/a11y.js --report   # prints every control, smallest first
//
// It serves the repo itself and launches its own browser, so it needs no
// arguments and no running server. CHROME=/path/to/chrome overrides the
// browser search.

import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FLOOR = 40;          // px, both dimensions
const VIEWPORT = 380;      // px, the reference phone width
const REPORT = process.argv.includes('--report');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- a static server, so the gate needs nothing running ---------------------
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
};
function serve() {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(req.url.split('?')[0]);
    const file = join(root, path === '/' ? '/index.html' : path);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404).end('not found'); }
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port })));
}

// --- the browser ------------------------------------------------------------
const CHROME_CANDIDATES = [
  process.env.CHROME,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].filter(Boolean);

function findChrome() {
  const hit = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (hit) return hit;
  // Any Playwright-managed build, whatever version suffix it carries.
  try {
    for (const name of readdirSync('/opt/pw-browsers')) {
      const p = join('/opt/pw-browsers', name, 'chrome-linux', 'chrome');
      if (existsSync(p)) return p;
    }
  } catch { /* no such directory — fall through to the caller's error */ }
  return null;
}

// --- CDP over the built-in WebSocket ---------------------------------------
async function connect(port) {
  let info = null;
  for (let i = 0; i < 60 && !info; i++) {
    try { info = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); }
    catch { await sleep(250); }
  }
  if (!info) throw new Error('the browser never opened a debugging port');
  const page = info.find((t) => t.type === 'page' && t.webSocketDebuggerUrl) ?? info[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    }
  });
  await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }); });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    const bad = r.result?.exceptionDetails;
    if (bad) throw new Error(bad.exception?.description ?? bad.text);
    return r.result?.result?.value;
  };
  return { ws, send, evaluate, errors };
}

// --- a save with something on every screen ----------------------------------
async function fixtureSave() {
  const { indexContent } = await import('../render/renderer.js');
  const { newGameState, SAVE_VERSION } = await import('../save/save.js');
  const { spliceChimera } = await import('../splice/theater.js');
  const { createAnimal } = await import('../ranch/ranch.js');
  const readJSON = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
  const files = ['frames', 'parts', 'species', 'combos', 'enemies', 'keywords', 'regions', 'traits',
    'classes', 'rivals', 'director', 'facility', 'philosophies', 'operations', 'chaos', 'temperament',
    'scars', 'guides', 'resequencer', 'training', 'gauntlet', 'news'];
  const content = indexContent(Object.fromEntries(files.map((n) => [n, readJSON(`data/${n}.json`)])));
  const now = Date.now();
  const s = { ...newGameState(), seed: 4242, funds: 20000, saveVersion: SAVE_VERSION };
  s.facility = { theater: 2 };
  s.lastTickAt = now;
  const grades = { cobra_head: 'apex', bear_forelimbs: 'standard', goat_hindlimbs: 'prime',
    cobra_organ: 'standard', bear_hide: 'standard', goat_tail: 'standard' };
  for (const [pid, grade] of Object.entries(grades)) {
    s.inventory.parts.push({ id: `a11y-${pid}`, partId: pid, grade,
      donor: { name: 'Donor', species: pid.split('_')[0], stars: 3, extractedAt: now } });
  }
  const used = new Set();
  const slots = Object.fromEntries(Object.keys(grades).map((pid) => {
    const slot = content.parts[pid].slot;
    let socket = slot; let n = 2;
    while (used.has(socket)) socket = `${slot}${n++}`;
    used.add(socket);
    return [socket, `a11y-${pid}`];
  }));
  const made = spliceChimera(s, 'M', slots, content, now);
  if (!made.ok) throw new Error(`fixture splice failed: ${made.msg}`);
  for (const [pid, grade] of [['goat_head', 'standard'], ['bear_organ', 'prime'], ['cobra_tail', 'apex']]) {
    s.inventory.parts.push({ id: `a11y-spare-${pid}`, partId: pid, grade,
      donor: { name: 'Spare', species: pid.split('_')[0], stars: 2, extractedAt: now } });
  }
  s.ranch = { ...s.ranch, stock: [], penCapacity: 8, animalCount: 0, seeded: true };
  for (const sp of ['goat', 'bear', 'cobra']) s.ranch.stock.push(createAnimal(s, sp, content, now));
  s.dex = { parts: Object.keys(content.parts).slice(0, 8), enemies: Object.keys(content.enemies).slice(0, 4),
    beaten: Object.keys(content.enemies).slice(0, 2), traits: Object.keys(content.traits ?? {}).slice(0, 2), variants: [] };
  s.discoveredCombos = Object.keys(content.combos).slice(0, 3);
  s.chimeras[0].settleUntil = now - 1000;
  return JSON.stringify(s);
}

// --- what counts as a control ----------------------------------------------
const MEASURE = `(() => {
  const SEL = 'button, a[href], input:not([type="hidden"]), select, textarea, summary,'
    + ' label[for], [tabindex]:not([tabindex="-1"]), [role="button"]';
  const out = [];
  for (const el of document.querySelectorAll(SEL)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    out.push({
      tag: el.tagName.toLowerCase(),
      cls: (typeof el.className === 'string' ? el.className : '').trim().slice(0, 40),
      id: el.id || '',
      label: (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 30),
      w: Math.round(r.width * 10) / 10,
      h: Math.round(r.height * 10) / 10,
    });
  }
  return out;
})()`;

const OPEN_EVERYTHING = `[...document.querySelectorAll('details')].forEach((d) => { d.open = true; });
  [...document.querySelectorAll('.fold-toggle,[data-fold]')].forEach((b) => b.click());`;

async function main() {
  const chrome = findChrome();
  if (!chrome) {
    console.error('a11y: no Chromium found. Set CHROME=/path/to/chrome and re-run.');
    console.error('       (searched: ' + CHROME_CANDIDATES.join(', ') + ')');
    process.exit(2);
  }
  const { server, port } = await serve();
  const profile = await mkdtemp(join(tmpdir(), 'spliceworld-a11y-'));
  const cdpPort = 9500 + Math.floor(process.pid % 400);
  const proc = spawn(chrome, [
    '--headless=new', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profile}`,
    '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', 'about:blank',
  ], { stdio: 'ignore' });

  const problems = [];
  const note = (msg) => problems.push(msg);
  let cdp;
  try {
    cdp = await connect(cdpPort);
    const { send, evaluate, errors } = cdp;
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Network.enable');
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    // The service worker caches the whole shell; without this a run measures
    // the PREVIOUS build's CSS and reports a floor it never actually met.
    await send('Network.setBypassServiceWorker', { bypass: true });
    await send('Emulation.setDeviceMetricsOverride', { width: VIEWPORT, height: 780, deviceScaleFactor: 1, mobile: true });

    const tap = async (key, code, vk) => {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    };

    const url = `http://127.0.0.1:${port}/index.html`;
    await send('Page.navigate', { url });
    await sleep(900);
    await evaluate(`localStorage.setItem('spliceworld_save', ${JSON.stringify(await fixtureSave())})`);
    errors.length = 0;
    await send('Page.navigate', { url });
    await sleep(2200);

    // ---- 1. every control clears the floor, on every view ------------------
    const seen = new Map();
    const collect = async (where) => {
      for (const c of await evaluate(MEASURE)) {
        const key = `${c.tag}.${c.cls}#${c.id}|${c.w}x${c.h}`;
        if (!seen.has(key)) seen.set(key, { ...c, where });
      }
    };
    await collect('shell');
    const screens = await evaluate(`[...document.querySelectorAll('#tabs button')].map((b) => b.dataset.screen)`);
    for (const s of screens) {
      await evaluate(`document.querySelector('#tabs button[data-screen="${s}"]').click()`);
      await sleep(600);
      await evaluate(OPEN_EVERYTHING);
      await sleep(400);
      await collect(s);
      const subs = await evaluate(`[...document.querySelectorAll('button[data-dex-tab]')].map((b) => b.dataset.dexTab)`);
      for (const sub of subs ?? []) {
        await evaluate(`document.querySelector('button[data-dex-tab="${sub}"]').click()`);
        await sleep(350);
        await collect(`${s}/${sub}`);
      }
    }
    // The dialogs, which no screen walk reaches.
    await evaluate(`document.querySelector('#settings').click()`);
    await sleep(500);
    await collect('settings');
    await evaluate(`document.querySelector('#set-close')?.click()`);
    await sleep(300);

    // ---- 1d. every theme, not just the shipped one. The floor is a layout
    //      property and does not move between colour schemes, but the
    //      stylesheet has five of them and a rule that only ever ran under
    //      one is a rule measured once. This caught nothing on its first
    //      run — which is the point: the gap it closes was found by an audit
    //      reading the other four by hand, after this gate had already
    //      passed.
    for (const theme of ['lab', 'vivarium', 'blueprint', 'saturday']) {
      await evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}`);
      await sleep(250);
      await collect(`theme:${theme}`);
    }
    await evaluate(`delete document.documentElement.dataset.theme`);
    await sleep(200);

    const controls = [...seen.values()].sort((a, b) => Math.min(a.h, a.w) - Math.min(b.h, b.w));
    const under = controls.filter((c) => c.h < FLOOR || c.w < FLOOR);
    if (REPORT) {
      for (const c of controls) {
        console.log(`  ${String(c.h).padStart(6)}h ${String(c.w).padStart(7)}w  ${c.where.padEnd(14)} ${c.tag}${c.id ? '#' + c.id : ''}${c.cls ? '.' + c.cls : ''}  "${c.label}"`);
      }
      console.log('');
    }
    for (const c of under) {
      note(`${c.where}: ${c.tag}${c.id ? '#' + c.id : ''}${c.cls ? '.' + c.cls : ''} "${c.label}" is ${c.w}x${c.h}, under the ${FLOOR}px floor`);
    }

    // ---- 2. focus is visible -----------------------------------------------
    // Pressed, not called. `:focus-visible` deliberately does NOT match a
    // programmatic .focus() once the page has seen a click, so measuring
    // after `el.focus()` reports "no ring" on a page whose ring is fine —
    // the first version of this check did exactly that. A real Tab is also
    // simply the thing being tested: what a keyboard user sees.
    await evaluate(`document.body.focus()`);
    await tap('Tab', 'Tab', 9);
    await sleep(200);
    const ring = await evaluate(`(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return { none: true };
      const cs = getComputedStyle(el);
      return { who: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).slice(0, 24) : ''),
               style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) || 0 };
    })()`);
    if (ring.none) note('pressing Tab from the top of the document focused nothing');
    else if (ring.style === 'none' || ring.width < 1) {
      note(`focus is invisible: after Tab, ${ring.who} computes outline "${ring.style}" at ${ring.width}px`);
    }

    // ---- 3. the wire is a live region --------------------------------------
    const wire = await evaluate(`(() => {
      const t = document.getElementById('ticker');
      return t ? { live: t.getAttribute('aria-live'), role: t.getAttribute('role') } : null;
    })()`);
    if (!wire || !wire.live) note('the news wire is not a live region, so it never reaches a screen reader');

    // ---- 4. the nav says which screen you are on ---------------------------
    const current = await evaluate(`[...document.querySelectorAll('#tabs button')].filter((b) => b.getAttribute('aria-current')).length`);
    if (current !== 1) note(`exactly one nav button should carry aria-current; ${current} do`);

    // ---- 5. the overlay is a dialog: named, focused, escapable, restoring ---
    await evaluate(`document.querySelector('#settings').focus(); document.querySelector('#settings').click()`);
    await sleep(500);
    const dlg = await evaluate(`(() => {
      const o = document.getElementById('overlay');
      return { role: o.getAttribute('role'), modal: o.getAttribute('aria-modal'),
               label: o.getAttribute('aria-label'), focusInside: o.contains(document.activeElement) };
    })()`);
    if (dlg.role !== 'dialog') note('the overlay is not role="dialog"');
    if (dlg.modal !== 'true') note('the overlay is not aria-modal');
    if (!dlg.label) note('the overlay opens with no accessible name');
    if (!dlg.focusInside) note('opening the overlay leaves focus outside it');
    await tap('Escape', 'Escape', 27);
    await sleep(400);
    const after = await evaluate(`(() => ({ hidden: document.getElementById('overlay').hidden, focus: document.activeElement?.id || '' }))()`);
    if (!after.hidden) note('Escape does not close the overlay');
    if (after.focus !== 'settings') note(`closing the overlay does not restore focus to its opener (landed on "${after.focus}")`);

    // ---- 5b. the picker sheet is the game's OTHER modal, and it claimed to
    //      be a dialog long before it behaved like one.
    await evaluate(`document.querySelector('#tabs button[data-screen="ranch"]').click()`);
    await sleep(600);
    const openedPicker = await evaluate(`(() => {
      const b = document.querySelector('.pick-button:not([disabled])');
      if (!b) return false;
      b.focus(); b.click(); return true;
    })()`);
    if (openedPicker) {
      await sleep(450);
      const sheet = await evaluate(`(() => {
        const h = document.getElementById('picker');
        const d = h?.querySelector('[role="dialog"]');
        return { open: !h?.hidden, labelled: !!d?.getAttribute('aria-label'),
                 focusInside: !!h && h.contains(document.activeElement) };
      })()`);
      if (!sheet.open) note('the picker did not open');
      else {
        if (!sheet.labelled) note('the picker sheet has no accessible name');
        if (!sheet.focusInside) note('opening the picker leaves focus outside the sheet');
        await tap('Escape', 'Escape', 27);
        await sleep(350);
        const shut = await evaluate(`(() => ({ hidden: document.getElementById('picker').hidden,
          focusReturned: document.activeElement?.classList?.contains('pick-button') ?? false }))()`);
        if (!shut.hidden) note('Escape does not close the picker');
        if (!shut.focusReturned) note('closing the picker does not restore focus to the control that opened it');
      }
    }

    // ---- 6. nothing narrated an error along the way ------------------------
    for (const e of [...new Set(errors)]) note(`console error during the walk: ${e}`);

    console.log(`a11y: ${controls.length} distinct controls measured at ${VIEWPORT}px across ${screens.length + 2} views`);
  } finally {
    try { cdp?.ws.close(); } catch { /* already gone */ }
    proc.kill();
    server.close();
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }

  if (problems.length) {
    console.error(`\na11y ✗  ${problems.length} problem${problems.length === 1 ? '' : 's'}`);
    for (const p of problems) console.error(`  · ${p}`);
    process.exit(1);
  }
  console.log(`a11y ✓  every control clears ${FLOOR}px · focus visible · wire live · nav current · overlay is a dialog`);
}

await main();
