// R100 — THE SAVE OUTLIVES THE BROWSER'S SPRING CLEANING.
//
// `SAVE_VERSION` and the migration table protect a save from THIS CODE
// changing under it. R54 gave it a door out of the browser entirely. Neither
// protects it from the browser deciding, on its own, that this site is not
// important enough to keep.
//
// WHAT THIS DOES AND DOES NOT SURVIVE, corrected — the first version of this
// note claimed iOS clears localStorage after seven days "and a TWA wrapper
// does not change that", and that is wrong in both directions. Safari's
// seven-day sweep takes ALL script-writable storage together — localStorage,
// IndexedDB, Cache Storage, the service worker registration — so a backup in
// IndexedDB does not survive it and never could. What the sweep exempts is the
// case R100 is actually about: a site installed to the Home Screen, and an
// Android TWA, which is not subject to it at all.
//
// So the honest bill is narrower and still worth paying:
//   - A localStorage QUOTA FAILURE. `saveGame` catches it, returns false, and
//     none of main.js's four call sites reads the result — R91 found that and
//     it is still true. The save reaches IndexedDB even when the 5 MB cap
//     refuses it, because IndexedDB's quota is a share of free disk instead.
//   - EVICTION THAT TAKES WEB STORAGE FIRST. Under pressure, engines drop the
//     small synchronous store before the big asynchronous one.
//   - It does NOT survive a person clearing site data, which takes everything
//     an origin owns, and should not: that is someone asking to start over.
//
// THE ENTRY'S OWN REASON WAS STALE. It inherited R91's note that four campaigns
// cross the 5 MB localStorage quota "around day 124" — measured when a day-180
// save was 1,843 KB. R91's own milestone then cut it to 170 KB. Re-derived on
// today's tree: four slots cross 5 MB around day 1,352, one reaches 2 MB around
// day 2,163. So the quota is not close, and the reason to write twice is the
// list above rather than the one the entry gave.
//
// SO localStorage STAYS THE SOURCE OF TRUTH. It is synchronous, which is what
// `saveGame` is and what every one of its call sites assumes; making the save
// path async to chase a durability win would put a rewrite through the one
// system CLAUDE.md calls sacred. IndexedDB is a BACKUP written alongside it and
// read only when localStorage comes up empty — the exact shape of the failure
// this is for. A save is never loaded from here while localStorage has one, so
// a bug in this file cannot produce a stale save; the worst it can do is fail
// to help.
//
// IT IS ALSO A NO-OP WHERE THERE IS NO IndexedDB — Node, a private window, a
// browser that refuses the database. Every function resolves rather than
// throwing, and the caller is written to carry on without it, because a backup
// that can break the thing it is backing up is worse than no backup.

const DB = 'spliceworld';
const STORE = 'saves';
const VERSION = 1;

// Nothing here is awaited on the boot path except `recover`, and that only
// when localStorage has already come up empty.
function open() {
  const idb = globalThis.indexedDB;
  if (!idb) return Promise.resolve(null);
  return new Promise((resolve) => {
    let req;
    try {
      req = idb.open(DB, VERSION);
    } catch {
      resolve(null);            // Firefox private mode throws on open
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

function tx(db, mode, run) {
  return new Promise((resolve) => {
    let t;
    try {
      t = db.transaction(STORE, mode);
    } catch {
      resolve(null);
      return;
    }
    let out = null;
    const req = run(t.objectStore(STORE));
    if (req) req.onsuccess = () => { out = req.result; };
    t.oncomplete = () => resolve(out);
    t.onerror = () => resolve(null);
    t.onabort = () => resolve(null);
  });
}

// Write-through, and the caller does not wait for it. A failure here is
// invisible on purpose: the real save already succeeded in localStorage, and a
// toast about a backup nobody asked for would be noise at best.
export async function mirror(key, raw) {
  const db = await open();
  if (!db) return false;
  try {
    // `stampedAt` is not decoration — `recover` needs to know whether what it
    // found is worth restoring, and a save has no timestamp of its own that
    // survives being a string.
    const ok = await tx(db, 'readwrite', (store) => store.put({ raw, stampedAt: Date.now() }, key));
    return ok !== null;
  } finally {
    db.close();
  }
}

// Read, for the one moment it is wanted: localStorage said there is nothing
// here. Returns the raw string exactly as it went in, or null.
export async function recover(key) {
  const db = await open();
  if (!db) return null;
  try {
    const row = await tx(db, 'readonly', (store) => store.get(key));
    return typeof row?.raw === 'string' ? row.raw : null;
  } finally {
    db.close();
  }
}

// A deleted lab is deleted in both places, or the next eviction resurrects it
// — which is the one way this file could actually lose a player something they
// meant to do.
export async function forget(key) {
  const db = await open();
  if (!db) return false;
  try {
    const ok = await tx(db, 'readwrite', (store) => store.delete(key));
    return ok !== null;
  } finally {
    db.close();
  }
}
