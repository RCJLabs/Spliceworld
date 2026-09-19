// R115 — THE SERVICE WORKER, RUN.
//
// `sw.js` is the only shipped module nothing in this repo has ever loaded.
// `tools/offline.js` proves the game opens cold THROUGH it, which is the right
// question and a coarse one: it sees the worker's verdict, never its branches.
// The three rules below are all branches — what happens when the network
// answers 502, when it does not answer at all, and what a non-GET does — and
// each of them is a way to brick the app on a phone that then cannot be told
// otherwise, because the broken copy is the one serving the next open.
//
// So the worker is loaded in Node against a stubbed `caches`, `fetch` and
// `self`. No browser: this is arithmetic over promises, and it runs in a
// second. `tools/offline.js` keeps the end-to-end question.
//
//   node tools/worker.js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(dirname(fileURLToPath(import.meta.url))), '');

// --- the stub ---------------------------------------------------------------
// A Cache that remembers what was put in it, and a CacheStorage over several.
const makeCache = (seed = {}) => {
  const store = new Map(Object.entries(seed));
  return {
    store,
    async match(req) { return store.get(String(req.url ?? req)) ?? undefined; },
    async put(req, res) { store.set(String(req.url ?? req), res); },
    async addAll(reqs) { for (const r of reqs) store.set(String(r.url ?? r), { ok: true, body: 'precached' }); },
  };
};

const listeners = {};
const caches = {
  open: async (name) => (caches._all[name] ??= makeCache()),
  match: async (req) => {
    for (const c of Object.values(caches._all)) {
      const hit = await c.match(req);
      if (hit) return hit;
    }
    return undefined;
  },
  keys: async () => Object.keys(caches._all),
  delete: async (name) => { delete caches._all[name]; return true; },
  _all: {},
};

let claimed = false;
let skipped = false;
const fetches = [];
let nextResponse = () => ({ ok: true, body: 'network', clone: () => ({ ok: true, body: 'network' }) });

globalThis.self = {
  addEventListener: (kind, fn) => { listeners[kind] = fn; },
  skipWaiting: async () => { skipped = true; },
  clients: { claim: async () => { claimed = true; } },
};
globalThis.caches = caches;
globalThis.fetch = async (req, opts) => {
  fetches.push({ url: String(req.url ?? req), cache: opts?.cache });
  return nextResponse(String(req.url ?? req));
};

// `new Request('.')` is legal in a worker, which resolves it against its own
// scope; Node's global Request wants an absolute URL and throws on it. The stub
// keeps the path verbatim, which is also what the cache keys on.
globalThis.Request = class {
  constructor(url, opts = {}) {
    this.url = String(url);
    this.method = opts.method ?? 'GET';
    this.cache = opts.cache;
  }
};

// The worker registers its three handlers at import time.
await import('../sw.js');
const CACHE = readFileSync(join(root, 'sw.js'), 'utf8').match(/const CACHE = '([^']+)'/)[1];
assert.deepEqual(Object.keys(listeners).sort(), ['activate', 'fetch', 'install'],
  'the worker registers install, activate and fetch');

// --- helpers ----------------------------------------------------------------
const fire = async (kind, event) => {
  const waits = [];
  let answered = null;
  listeners[kind]({
    ...event,
    waitUntil: (p) => waits.push(p),
    respondWith: (p) => { answered = p; },
  });
  const response = answered ? await answered : null;
  await Promise.all(waits);
  return response;
};
const req = (url, method = 'GET') => ({ url, method });

// --- 1. install precaches the whole shell ----------------------------------
await fire('install', {});
const shell = readFileSync(join(root, 'sw.js'), 'utf8')
  .match(/const SHELL = \[([\s\S]*?)\];/)[1]
  .match(/'([^']+)'/g).map((s) => s.slice(1, -1));
const cache = await caches.open(CACHE);
assert.equal(cache.store.size, shell.length,
  `install precaches every one of the ${shell.length} shell entries (cached ${cache.store.size})`);
assert.ok(skipped, 'and takes over rather than waiting for every tab to close');

// --- 2. activate evicts every cache but this build's ------------------------
caches._all['spliceworld-v1-deadbeef'] = makeCache({ 'index.html': { ok: true } });
await fire('activate', {});
assert.deepEqual(await caches.keys(), [CACHE],
  'activate deletes every cache that is not this build');
assert.ok(claimed, 'and claims the open pages');

// --- 3. a cached shell entry is answered from cache, and revalidated --------
fetches.length = 0;
const cached = await fire('fetch', { request: req('index.html') });
assert.equal(cached.body, 'precached', 'a precached entry is answered from the cache, not the network');
assert.equal(fetches.length, 1, 'and exactly one revalidation goes out behind it');
assert.equal(fetches[0].cache, 'no-cache',
  "the revalidation is conditional — a plain fetch reads the browser's HTTP cache and R122b's stale shell comes back");

// --- 4. AN ERROR PAGE NEVER OVERWRITES A GOOD CACHED COPY -------------------
// The rule that matters most: a 502 from a proxy is not a new build, and
// caching it bricks the app until the next CACHE bump — on a phone that then
// serves the broken copy to its own next open.
//
// Asserted as UNCHANGED rather than as a literal, because the pass above
// revalidated successfully and its 200 correctly replaced what install had
// written. The first draft of this test compared against 'precached' and went
// red on the worker doing exactly the right thing.
const before502 = (await (await caches.open(CACHE)).match(req('index.html'))).body;
nextResponse = () => ({ ok: false, status: 502, body: 'proxy error', clone: () => ({ ok: false, status: 502, body: 'proxy error' }) });
const served502 = await fire('fetch', { request: req('index.html') });
assert.equal(served502.body, before502, 'a 502 behind a cached entry never reaches the page');
assert.equal((await (await caches.open(CACHE)).match(req('index.html'))).body, before502,
  'and never overwrites the good cached copy');

// --- 5. offline leaves the cached copy answering ----------------------------
nextResponse = () => { throw new TypeError('Failed to fetch'); };
const offline = await fire('fetch', { request: req('index.html') });
assert.equal(offline.body, before502, 'offline, the cached copy is still the answer');
assert.equal((await (await caches.open(CACHE)).match(req('index.html'))).body, before502,
  'and a failed revalidation writes nothing');

// --- 6. a non-GET is not the worker's business ------------------------------
fetches.length = 0;
const posted = await fire('fetch', { request: req('index.html', 'POST') });
assert.equal(posted, null, 'a non-GET is passed straight through — the worker does not answer it');
assert.equal(fetches.length, 0, 'and nothing is fetched on its behalf');

// --- 7. something not in the shell goes to the network first ----------------
nextResponse = () => ({ ok: true, body: 'fresh', clone: () => ({ ok: true, body: 'fresh' }) });
const uncached = await fire('fetch', { request: req('data/late-only.json') });
assert.equal(uncached.body, 'fresh',
  'anything not precached is new since the release or not ours, and the network is the first question');
assert.equal((await (await caches.open(CACHE)).match(req('data/late-only.json'))).body, 'fresh',
  'and it joins the cache once it answers');

console.log(`worker ✓  ${shell.length} shell entries precached · every cache but this build evicted`
  + ' · a shell hit answers from cache and revalidates conditionally · a 502 never overwrites a good copy'
  + ' · offline still answers · a non-GET is passed through · anything else goes to the network first');
