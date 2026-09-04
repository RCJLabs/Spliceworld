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
const GUTTER = 6;          // px, between two adjacent controls
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
    'scars', 'guides', 'resequencer', 'training', 'gauntlet', 'news', 'breakout'];
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
  // R82 — one loose specimen, so the Labs tab paints its Hunt button and
  // this gate measures it like every other control. Built the way the world
  // builds one: a lab that has lost to you, and a clock dated far enough
  // back that the first escape is already overdue.
  s.campaign.heldNodes = ['barn_perimeter', 'downtown'];
  s.campaign.notoriety = 9999;
  s.campaign.rivals = { mantissa: { defeats: 2, losses: 0, lastMetAt: now } };
  const { tickBreakouts } = await import('../campaign/breakout.js');
  tickBreakouts(s, content, now, now - 24 * 3600000);
  // R80 — a fight in progress, so the walk reaches the arena.
  //
  // The War Room renders the arena instead of the map whenever `state.battle`
  // is set, and a battle is plain serializable state, so a save is all it
  // takes. Until now no gate had ever measured the screen a player spends
  // most of their time on: `body.in-battle` reshapes the whole shell, the
  // command grid and the message box exist nowhere else, and the opening
  // exchange of a duel is the one moment the game takes the controls away
  // and asks for a press. A duel, specifically, because the opening only
  // exists when somebody is talking.
  const { rivalEncounter } = await import('../campaign/rivals.js');
  const { createBattle } = await import('../battle/engine.js');
  const { duelBarks } = await import('../campaign/monologue.js');
  const { rivalOf } = await import('../data/catalog.js');
  const rival = rivalOf(content, 'mantissa');
  s.battle = createBattle(s.chimeras.slice(0, 1), rivalEncounter(s, rival, content), content, 7, now, {
    kind: 'rival', rivalId: rival.id,
    playerBarks: duelBarks(s, content, rival),
    speakers: { enemy: rival.name, player: 'You' },
  });
  if (!s.battle.opening.length) throw new Error('fixture battle has no opening exchange to advance');
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

// R80 — how far apart two controls sit. A 40px target with another 40px
// target flush against it is two targets a thumb cannot tell apart, and the
// audit that filed R80 measured 5px between picker rows and 4px across the
// Dex subtab strip. Only pairs that actually crowd each other count: two
// boxes side by side are separated by the horizontal gap, two stacked by the
// vertical one, and a pair that shares neither axis is diagonal and needs no
// rule. Nesting is skipped — a <summary> inside its <details>, a button
// inside its label — because those are one target, not two.
const GAPS = `(() => {
  const SEL = 'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]),'
    + ' select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
  // A modal covers the page, so while one is up the only neighbours that
  // mean anything are its own — otherwise every row of the picker sheet
  // reads as 0px from whatever it happens to be lying on top of.
  const host = (!document.getElementById('picker')?.hidden && document.getElementById('picker'))
    || (!document.getElementById('overlay')?.hidden && document.getElementById('overlay'))
    || document;
  const els = [...host.querySelectorAll(SEL)].filter((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return (r.width || r.height) && cs.display !== 'none' && cs.visibility !== 'hidden';
  });
  const name = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
    + (typeof el.className === 'string' && el.className.trim()
      ? '.' + el.className.trim().split(/\\s+/)[0] : '');
  const out = [];
  for (let i = 0; i < els.length; i++) {
    for (let j = i + 1; j < els.length; j++) {
      const a = els[i], b = els[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const dx = Math.max(ra.left - rb.right, rb.left - ra.right);
      const dy = Math.max(ra.top - rb.bottom, rb.top - ra.bottom);
      if (dx >= 0 && dy >= 0) continue;         // diagonal neighbours
      const gap = dx < 0 && dy < 0 ? 0 : Math.max(dx, dy);
      out.push({ a: name(a), b: name(b), gap: Math.round(gap * 10) / 10 });
    }
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
    const pairs = new Map();
    const views = new Set();
    const collect = async (where) => {
      views.add(where);
      for (const c of await evaluate(MEASURE)) {
        const key = `${c.tag}.${c.cls}#${c.id}|${c.w}x${c.h}`;
        if (!seen.has(key)) seen.set(key, { ...c, where });
      }
      for (const p of await evaluate(GAPS)) {
        const key = `${p.a}|${p.b}`;
        if (!pairs.has(key) || pairs.get(key).gap > p.gap) pairs.set(key, { ...p, where });
      }
    };
    // R80 — the arena is the one screen that does not scroll
    // (`body.in-battle` sets `height: 100dvh; overflow: hidden`), so content
    // past the bottom of `<main>` is not "below the fold", it is gone.
    // Nothing else here can see that: a clipped control still reports a
    // full-size rect, so the 40px floor and the 6px gutter both pass on a
    // command grid the player cannot reach. Measured as OVERFLOW rather
    // than as a viewport test, because the shell is a flex column — squeeze
    // it and the stage gives way first, and every control stays nominally
    // on screen right up to the moment its own box is too small for it.
    //
    // This is what keeps the gutter fix honest: Retreat stopped crowding
    // the settings gear by taking ten more pixels of footer, and in a
    // locked-height layout ten pixels come out of something else.
    const arenaFits = async (where) => {
      const over = await evaluate(`(() => {
        if (!document.body.classList.contains('in-battle')) return null;
        const out = [];
        for (const sel of ['main', '#screen-battle', '.arena', '.cmd']) {
          const el = document.querySelector(sel);
          if (!el) continue;
          const spill = el.scrollHeight - el.clientHeight;
          if (spill > 1) out.push(sel + ' clips ' + Math.round(spill) + 'px of its own content');
        }
        return out;
      })()`);
      if (over === null) note(`${where}: the War Room did not enter battle mode, so nothing checked that the arena fits`);
      else for (const x of over) note(`${where}: the arena does not scroll, and ${x}`);
    };

    await collect('shell');
    const screens = await evaluate(`[...document.querySelectorAll('#tabs button')].map((b) => b.dataset.screen)`);
    for (const s of screens) {
      await evaluate(`document.querySelector('#tabs button[data-screen="${s}"]').click()`);
      await sleep(600);
      await evaluate(OPEN_EVERYTHING);
      await sleep(400);
      await collect(s);
      if (s === 'battle') await arenaFits('battle');
      const subs = await evaluate(`[...document.querySelectorAll('button[data-dex-tab]')].map((b) => b.dataset.dexTab)`);
      for (const sub of subs ?? []) {
        await evaluate(`document.querySelector('button[data-dex-tab="${sub}"]').click()`);
        await sleep(350);
        await collect(`${s}/${sub}`);
      }
    }
    // ---- 1b. …and the arena on a short phone. 780px lands in the
    //      `min-height: 760px` band (a roomier stage, taller move cells);
    //      640 lands in `max-height: 640px`, which exists precisely because
    //      the arena is height-locked and had to give something up. That
    //      band had never been rendered by any gate, so the rules written
    //      for the smallest phone the game supports were the rules nothing
    //      had measured.
    await send('Emulation.setDeviceMetricsOverride', { width: VIEWPORT, height: 640, deviceScaleFactor: 1, mobile: true });
    await evaluate(`document.querySelector('#tabs button[data-screen="battle"]').click()`);
    await sleep(700);
    await collect('battle@640');
    await arenaFits('battle@640');
    await send('Emulation.setDeviceMetricsOverride', { width: VIEWPORT, height: 780, deviceScaleFactor: 1, mobile: true });
    await sleep(300);

    // The dialogs, which no screen walk reaches.
    await evaluate(`document.querySelector('#settings').click()`);
    await sleep(500);
    await collect('settings');
    await evaluate(`document.querySelector('#set-close')?.click()`);
    await sleep(300);
    // ---- 1c. the picker sheet, which is a whole view of controls that no
    //      measurement had ever reached: it is the only way to choose
    //      anything in this game (a native <select> is banned on sight), and
    //      until R80 the gate opened it once, four sections below here,
    //      purely to check that it behaved like a dialog.
    await evaluate(`document.querySelector('#tabs button[data-screen="ranch"]').click()`);
    await sleep(600);
    if (await evaluate(`(() => { const b = document.querySelector('.pick-button:not([disabled])'); if (!b) return false; b.click(); return true; })()`)) {
      await sleep(450);
      await collect('picker');
      await evaluate(`document.querySelector('.pick-close')?.click()`);
      await sleep(300);
    } else note('no picker could be opened, so its rows were never measured');

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

    // ---- 1e. and no two of them are crowded together ----------------------
    const crowded = [...pairs.values()].sort((a, b) => a.gap - b.gap);
    if (REPORT) {
      for (const p of crowded.slice(0, 30)) {
        console.log(`  ${String(p.gap).padStart(6)}px  ${p.where.padEnd(14)} ${p.a}  |  ${p.b}`);
      }
      console.log('');
    }
    for (const p of crowded.filter((x) => x.gap < GUTTER)) {
      note(`${p.where}: ${p.a} sits ${p.gap}px from ${p.b}, under the ${GUTTER}px gutter`);
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

    // ---- 6. R80 — the whole app, played with a keyboard and nothing else ---
    //
    // Everything above this line measures what a keyboard user would find IF
    // they could get there, and every one of those checks navigates by
    // calling .click() — which is exactly the assumption R80 was filed
    // against. §6a to §6c get there instead: no .click() and no .focus(),
    // only Tab and Enter dispatched as real key events, which is the
    // criterion. §6d and §6e do open their sheet with a click, because what
    // they are asking about is what the KEYS do once it is open — whether
    // toggling a move says anything, and whether Enter on ✕ means yes or no
    // — and getting there is not the question.
    //
    // The 30-second repaint is switched off first. It is one of the things
    // under test — §6b fires it deliberately, on the app's own code path —
    // and left running it would land at an arbitrary moment inside a
    // two-hundred-press tab walk and make the result depend on how fast the
    // machine is. main.js starts exactly one interval, so this is a
    // scalpel rather than the blunt instrument it looks like.
    await evaluate(`for (let i = 1; i < 5000; i++) clearInterval(i);`);
    // Every element that takes focus reports itself, so a tab walk is N key
    // presses rather than N presses and N round trips to ask where we are.
    await evaluate(`(() => {
      window.__kbSeen = [];
      document.addEventListener('focusin', (e) => {
        const w = e.target?.dataset?.kbwalk;
        if (w) window.__kbSeen.push(w);
      });
    })()`);

    const press = async (key, code, vk, text, modifiers = 0) => {
      await send('Input.dispatchKeyEvent', {
        type: text ? 'keyDown' : 'rawKeyDown', key, code, modifiers,
        windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, text, unmodifiedText: text,
      });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    };
    // `text`, not a bare keyDown: a native button is activated by the
    // browser's default action on a character-bearing Enter, and a raw one
    // moves nothing.
    const enter = () => press('Enter', 'Enter', 13, '\r');
    // Back to the top of the tab order. `blur()` alone is not enough: it
    // clears document.activeElement but leaves Chrome's sequential focus
    // navigation starting point where it was, so the next Tab resumes in the
    // middle of the page. Focusing a body made programmatically focusable
    // moves the starting point too, which is what "from the top" means.
    const toTop = () => evaluate(`(() => { document.body.tabIndex = -1; document.body.focus(); })()`);
    const FOCUSED = `(() => {
      const el = document.activeElement;
      if (!el || el === document.body || el === document.documentElement) return null;
      return {
        tag: el.tagName.toLowerCase(), id: el.id || '',
        cls: (typeof el.className === 'string' ? el.className : '').trim().slice(0, 40),
        label: (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40),
        screen: el.closest('.screen')?.id ?? '',
      };
    })()`;
    const where = (f) => `${f.tag}${f.id ? '#' + f.id : ''} "${f.label}"`;
    // Open a screen the way a player without a mouse does: Tab to its nav
    // button and press Enter.
    const openScreen = async (name) => {
      await toTop();
      for (let i = 0; i < 14; i++) {
        await tap('Tab', 'Tab', 9);
        if (await evaluate(`document.activeElement?.dataset?.screen === ${JSON.stringify(name)}`)) {
          await enter();
          await sleep(700);
          return true;
        }
      }
      return false;
    };

    // 6a. Every screen is reachable, and once you are on it Tab reaches
    //     everything on it. The second half is the one that can only be
    //     asked in a browser: whether a control is in the tab order is a
    //     product of markup, `disabled`, `hidden`, layout and the cascade,
    //     and no static read of the source can answer it.
    let kbScreens = 0;
    let kbControls = 0;
    for (const s of screens) {
      await toTop();
      let steps = 0;
      for (let i = 1; i <= 14 && !steps; i++) {
        await tap('Tab', 'Tab', 9);
        if (await evaluate(`document.activeElement?.dataset?.screen === ${JSON.stringify(s)}`)) steps = i;
      }
      if (!steps) { note(`the "${s}" tab cannot be reached by Tab from the top of the document`); continue; }
      await enter();
      await sleep(700);
      if (!(await evaluate(`!document.getElementById('screen-${s}').hidden`))) {
        note(`pressing Enter on the "${s}" tab did not open it — the nav is pointer-only`);
        continue;
      }
      kbScreens += 1;

      const stamped = await evaluate(`(() => {
        const SEL = 'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]),'
          + ' select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
        let n = 0;
        for (const el of document.getElementById('screen-${s}').querySelectorAll(SEL)) {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          if ((r.width === 0 && r.height === 0) || cs.display === 'none' || cs.visibility === 'hidden') continue;
          el.dataset.kbwalk = String(++n);
        }
        return n;
      })()`);
      if (!stamped) { note(`the "${s}" screen paints no reachable control at all`); continue; }
      kbControls += stamped;
      await evaluate(`window.__kbSeen = []`);
      await toTop();
      let seen = 0;
      for (let i = 0; i < stamped + 80 && seen < stamped; i += 8) {
        for (let k = 0; k < 8; k++) await tap('Tab', 'Tab', 9);
        seen = await evaluate(`new Set(window.__kbSeen).size`);
      }
      if (seen < stamped) {
        const missed = await evaluate(`(() => {
          const got = new Set(window.__kbSeen);
          return [...document.querySelectorAll('#screen-${s} [data-kbwalk]')]
            .filter((el) => !got.has(el.dataset.kbwalk))
            .map((el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
              + (el.className ? '.' + String(el.className).trim().split(/\s+/)[0] : ''))
            .slice(0, 6);
        })()`);
        note(`${s}: Tab reaches ${seen} of ${stamped} controls — unreachable: ${missed.join(', ')}`);
      }
      await evaluate(`document.querySelectorAll('#screen-${s} [data-kbwalk]').forEach((el) => { delete el.dataset.kbwalk; })`);
    }

    // 6b. The repaint keeps the player where they were.
    //
    // This is R80's headline: every screen renders by replacing innerHTML
    // wholesale, and the shell repaints the active one every thirty seconds,
    // so a keyboard user was returned to the top of the document twice a
    // minute for the life of the game. Fired through `visibilitychange`
    // because that is the app's own tick — the same call the interval makes,
    // not a stand-in for it.
    await toTop();
    let held = null;
    for (let i = 0; i < 40 && !held; i++) {
      await tap('Tab', 'Tab', 9);
      const f = await evaluate(FOCUSED);
      if (f && f.screen && f.id !== 'settings') held = f;
    }
    if (!held) note('no control inside any screen can be reached by Tab');
    else {
      await evaluate(`window.__repaintProbe = document.querySelector('.screen:not([hidden]) *')`);
      if (await evaluate(`document.hidden`)) note('the page reports itself hidden, so the tick never runs and 7b proves nothing');
      await evaluate(`document.dispatchEvent(new Event('visibilitychange'))`);
      await sleep(600);
      if (await evaluate(`document.contains(window.__repaintProbe)`)) {
        note('the tick did not repaint the active screen, so the focus check proves nothing');
      }
      const after = await evaluate(FOCUSED);
      if (!after) note(`the 30-second repaint drops focus to the top of the document (was on ${where(held)})`);
      else if (after.tag !== held.tag || after.id !== held.id || after.label !== held.label) {
        note(`the repaint moved focus from ${where(held)} to ${where(after)}`);
      }
    }

    // 6b(ii). And the OTHER repaint the entry names: a subtab activation.
    //     `bindSubtabs` calls back into a full screen render, so pressing a
    //     Dex tab destroyed the very button that was pressed and left the
    //     player at the top of the document with a new tab open and no idea
    //     where they were. Same observer, different trigger — worth pressing
    //     because it is the one a player hits deliberately rather than
    //     having it happen to them.
    if (!(await openScreen('dex'))) note('the Dex tab cannot be opened from the keyboard');
    await toTop();
    let onSub = false;
    for (let i = 0; i < 40 && !onSub; i++) {
      await tap('Tab', 'Tab', 9);
      onSub = await evaluate(`(() => {
        const el = document.activeElement;
        return !!el?.dataset?.dexTab && !el.classList.contains('is-on');
      })()`);
    }
    if (!onSub) note('no Dex subtab can be reached by Tab');
    else {
      const asked = await evaluate(`document.activeElement.dataset.dexTab`);
      await enter();
      await sleep(600);
      const landed = await evaluate(`document.activeElement?.dataset?.dexTab ?? ''`);
      if (landed !== asked) {
        note(`activating the "${asked}" subtab moved focus off it (landed on "${landed || 'the top of the document'}")`);
      }
    }

    // 6c. The arena, played with a keyboard.
    //
    // The one screen a player spends most of their time on, and the one no
    // gate had ever entered: the fixture now carries a duel in progress, so
    // clicking the War Room tab renders the fight instead of the map. Under
    // reduced motion so a round resolves in one frame — the walk is asking
    // whether the keys do anything, not how long the animation is, and
    // reduced motion is the setting an accessibility gate should be
    // measuring anyway.
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    if (!(await openScreen('battle'))) note('the War Room tab cannot be reached by Tab');
    else {
      if (!(await evaluate(`!!document.getElementById('msg-next')`))) {
        note('the fixture duel is not showing its opening exchange, so the arena walk proves nothing');
      } else {
        // The opening exchange used to advance by clicking a <div>, so a
        // keyboard could not get past the first line of a duel and the fight
        // was over before it started.
        await toTop();
        let onNext = false;
        for (let i = 0; i < 60 && !onNext; i++) {
          await tap('Tab', 'Tab', 9);
          onNext = await evaluate(`document.activeElement?.id === 'msg-next'`);
        }
        if (!onNext) note('the opening exchange cannot be reached by Tab — the duel is unplayable from the keyboard');
        else {
          let lines = 0;
          for (let i = 0; i < 6 && (await evaluate(`!!document.getElementById('msg-next')`)); i++) {
            if (!(await evaluate(`document.activeElement?.id === 'msg-next'`))) {
              note('advancing the opening exchange loses focus, so the next line needs the mouse');
              break;
            }
            await enter();
            await sleep(350);
            lines += 1;
          }
          if (!lines) note('pressing Enter on the opening exchange did nothing');
          else if (await evaluate(`!!document.getElementById('msg-next')`)) {
            note(`the opening exchange did not end after ${lines} presses`);
          }
        }
        // The move sheet first, because it is a question about a move and a
        // punch may end the fight. Everything R30 wrote down — the
        // arithmetic, the tags spelled out, one sentence per keyword —
        // opened on a 350ms hold, and a keyboard has no hold.
        await toTop();
        let onAnyMove = false;
        for (let i = 0; i < 80 && !onAnyMove; i++) {
          await tap('Tab', 'Tab', 9);
          onAnyMove = await evaluate(`document.activeElement?.dataset?.detail !== undefined`);
        }
        if (!onAnyMove) note('no move with a readout can be reached by Tab');
        else {
          await press('?', 'Slash', 191, '?', 8);
          await sleep(400);
          const sheet = await evaluate(`(() => {
            const o = document.getElementById('overlay');
            return { open: !o.hidden, isMove: !!o.querySelector('.move-sheet'),
                     focusInside: o.contains(document.activeElement) };
          })()`);
          if (!sheet.open || !sheet.isMove) note('pressing ? on a move does not open its readout — the sheet is pointer-only');
          else if (!sheet.focusInside) note('the move readout opens with focus outside it');
          await tap('Escape', 'Escape', 27);
          await sleep(350);
        }

        // And then a punch, which is the game.
        await toTop();
        let onMove = false;
        for (let i = 0; i < 80 && !onMove; i++) {
          await tap('Tab', 'Tab', 9);
          onMove = await evaluate(`document.activeElement?.classList?.contains('mv') ?? false`);
        }
        if (!onMove) note('no attack in the arena can be reached by Tab');
        else {
          const before = await evaluate(`document.querySelector('.turn-badge')?.textContent ?? ''`);
          await enter();
          await sleep(1600);
          const badge = await evaluate(`document.querySelector('.turn-badge')?.textContent ?? ''`);
          if (badge === before) note(`pressing Enter on an attack did nothing — the arena is still on "${before}"`);
        }
      }
    }
    await send('Emulation.setEmulatedMedia', { features: [] });

    // 6d. Something actually speaks. A live region nobody writes to is a
    //     live region that announces nothing, so this drives the real path:
    //     open the retraining sheet, toggle a move, and read what the shell
    //     said. The counter is the one piece of feedback that sheet gives.
    const live = await evaluate(`(() => {
      const el = document.getElementById('announcer');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { role: el.getAttribute('role'), live: el.getAttribute('aria-live'),
               hidden: cs.display === 'none' || cs.visibility === 'hidden' };
    })()`);
    if (!live) note('there is no shell-level live region for panels to announce into');
    else {
      if (live.live !== 'polite') note('the shell live region is not aria-live="polite"');
      if (live.hidden) note('the shell live region is display:none or visibility:hidden, which takes it out of the accessibility tree');
    }
    await evaluate(`document.querySelector('#tabs button[data-screen="pens"]').click()`);
    await sleep(700);
    const openedRetrain = await evaluate(`(() => {
      const b = [...document.querySelectorAll('#screen-pens .care-train')]
        .find((x) => !x.disabled && /Retrain/.test(x.textContent));
      if (!b) return false;
      b.click(); return true;
    })()`);
    if (!openedRetrain) note('no retraining sheet could be opened, so nothing exercised the live region');
    else {
      await sleep(450);
      await evaluate(`document.getElementById('announcer').textContent = ''`);
      const toggled = await evaluate(`(() => {
        const b = document.querySelector('#overlay [data-toggle]:not([disabled])');
        if (!b) return false;
        b.click(); return true;
      })()`);
      await sleep(400);
      const said = await evaluate(`document.getElementById('announcer')?.textContent ?? ''`);
      if (!toggled) note('the retraining sheet paints no move to toggle');
      else if (!said.trim()) note('changing the move selection announces nothing — the slot counter is still silent');
      await tap('Escape', 'Escape', 27);
      await sleep(350);
    }

    // 6e. The rename sheet: Enter on Close must CANCEL.
    //     It was registered on `document` with no target check, so the two
    //     controls a keyboard user is most likely to be on — the field and
    //     the ✕ — both committed, and one of them means "no".
    await evaluate(`document.querySelector('#tabs button[data-screen="ranch"]').click()`);
    await sleep(700);
    await evaluate(OPEN_EVERYTHING);
    await sleep(400);
    const openedPrompt = await evaluate(`(() => {
      const b = document.querySelector('#screen-ranch .rename-btn:not([disabled])');
      if (!b) return false;
      b.focus(); b.click(); return true;
    })()`);
    if (!openedPrompt) note('no rename prompt could be opened, so its keyboard behaviour is untested');
    else {
      await sleep(400);
      const before = await evaluate(`document.querySelector('.prompt-input')?.value ?? ''`);
      await evaluate(`(() => { const i = document.querySelector('.prompt-input'); i.value = 'Keyboard Test'; })()`);
      await evaluate(`document.querySelector('#picker .pick-close').focus()`);
      await enter();
      await sleep(450);
      const out = await evaluate(`(() => ({
        hidden: document.getElementById('picker').hidden,
        renamed: document.body.innerHTML.includes('Keyboard Test'),
        focus: document.activeElement?.className ?? '',
      }))()`);
      if (!out.hidden) note('Enter on the rename sheet\'s Close button did not close it');
      if (out.renamed) note('Enter on the rename sheet\'s Close button COMMITS the rename instead of cancelling it');
      if (!String(out.focus).includes('rename-btn')) note(`closing the rename sheet does not restore focus to the control that opened it (landed on "${out.focus}")`);
      await evaluate(`(() => { if (!document.getElementById('picker').hidden) document.querySelector('#picker .pick-close')?.click(); })()`);
      await sleep(250);
      if (before === '') note('the rename prompt opened with no name in it');
    }


    // ---- 7. nothing narrated an error along the way ------------------------
    for (const e of [...new Set(errors)]) note(`console error during the walk: ${e}`);

    console.log(`a11y: ${controls.length} distinct controls measured at ${VIEWPORT}px across ${views.size} views`);
    console.log(`a11y: ${kbScreens}/${screens.length} screens opened, ${kbControls} controls tabbed to and a duel fought with Tab and Enter alone`);
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
  console.log(`a11y ✓  every control clears ${FLOOR}px and sits ${GUTTER}px from its neighbour · focus visible · focus survives a repaint · wire live · nav current · both modals are dialogs · the game is playable from the keyboard`);
}

await main();
