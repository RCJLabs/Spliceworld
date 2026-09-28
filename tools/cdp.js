// R81 — the headless-Chromium driver, lifted out of tools/a11y.js so a second
// gate can use it without a second copy.
//
// R73 wrote this rather than taking Playwright, because CLAUDE.md says no
// dependencies and CDP is just JSON over one socket: Node 22 ships a global
// WebSocket and fetch, so the whole driver is forty lines instead of a
// node_modules tree. It stayed forty lines. What R81 needed was a way to
// measure what the browser FETCHES and when, which is a different question
// from what it draws — so the driver moved here and both gates import it.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// R201 — WHAT A SCREEN SAYS WHILE IT IS STILL ON ITS WAY, in one place. Five
// of the six screens lazy-load, and while the module is fetched `lazy()` in
// main.js paints one card into the screen. It is visible, it is not empty,
// and it does not change, so a wait that asks only those three things takes
// it for a painted screen. R200 found that in the wide gate (a red on its own
// baseline); R201 found it in the height gate (39 reds with the lazy modules
// 800ms slow) and in the keyboard gate's War Room (two). Every browser gate
// reads the card from here, and here reads it from main.js, so a reworded card
// is still the card. `null` when `lazy()` no longer paints one this can find,
// and a gate that gets `null` has to say so and go red: a wait that cannot
// refuse the card is the wait R200 found.
export function warmingCard() {
  let src;
  try { src = readFileSync(join(root, 'main.js'), 'utf8'); } catch { return null; }
  return src.match(/function lazy\([\s\S]*?root\.innerHTML = '([^']+)';/)?.[1] ?? null;
}

// --- a static server, so the gate needs nothing running ---------------------
export const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
};
export function serve() {
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
export const CHROME_CANDIDATES = [
  process.env.CHROME,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].filter(Boolean);

export function findChrome() {
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
export async function connect(port) {
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

