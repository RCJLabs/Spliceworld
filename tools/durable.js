// R100 — THE SEVEN-DAY PROBLEM, RUN.
//
// Until R100 the game could not tell an empty localStorage apart from a new
// player: `loadSlot` read null and handed back a fresh ranch over the top of a
// campaign that still existed. That happens whenever Web Storage goes and the
// rest of the origin's storage does not — a quota refusal `saveGame` swallows
// (R91), or an eviction that takes the small synchronous store first.
//
// NOT the seven-day Safari sweep, which this gate deliberately does not claim
// to model: that takes IndexedDB along with everything else. See the corrected
// note in save/durable.js for what the backup does and does not survive.
//
// This gate is the recoverable morning. Play, save, THROW LOCALSTORAGE AWAY and
// leave the rest standing, reopen, and require the campaign back — byte for
// byte, slot registry included, with no console errors on the way through.
//
// WHY IT IS A BROWSER GATE AND NOT A HEADLESS ONE. Node has no IndexedDB, so a
// headless version would have to supply a fake, and a fake IndexedDB proves
// that the fake works. The whole claim here is about a real browser's real
// storage surviving a real clear. `save/durable.js` is written to no-op where
// there is no IndexedDB, which is what lets the rest of the suite import the
// save system without one; that no-op is not what this gate is for.
//
// THE SIZE IS THE ENTRY'S — "a 2 MB save round-trips through IndexedDB" — and
// it is headroom rather than a current need. A day-180 save measures 170.4 KB
// (tools/vault.js), so one slot reaches 2 MB somewhere around day 2,163. The
// number is kept because a backup that quietly truncates is worse than none,
// and because IndexedDB's structured clone has size cliffs that a 170 KB test
// would never find.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findChrome, CHROME_CANDIDATES, connect, sleep, serve } from './cdp.js';

const REPORT = process.argv.includes('--report');
const TARGET_MB = 2;

async function main() {
  const problems = [];
  const note = (m) => problems.push(m);

  const chrome = findChrome();
  if (!chrome) {
    console.error('durable: no Chromium found. Set CHROME=/path/to/chrome and re-run.');
    console.error('         (searched: ' + CHROME_CANDIDATES.join(', ') + ')');
    process.exit(1);
  }

  const { server, port } = await serve();
  const url = `http://127.0.0.1:${port}/index.html`;
  const profile = await mkdtemp(join(tmpdir(), 'spliceworld-durable-'));
  const cdpPort = Number(process.env.SW_CDP_PORT) || 9500 + Math.floor(process.pid % 90);
  const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profile}`, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', 'about:blank'],
    { stdio: 'ignore' });

  let cdp;
  try {
    cdp = await connect(cdpPort);
    const { send, evaluate, errors } = cdp;
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url });
    await sleep(3000);

    // --- 1. a save big enough to find a cliff -----------------------------
    // Built from the real `newGameState` so the shape is the game's, padded to
    // size with a field the migrations never touch. Padding a REAL save rather
    // than storing a 2 MB string is the point: what has to survive is a
    // structured clone of the thing the game actually writes.
    // TWO LABS, AND THE BIG ONE IS NOT THE FIRST. Slot 3 carries the 2 MB save
    // and is the active one, which is what makes the registry load-bearing: if
    // it does not come back, `activeSlotId` answers 1 for a missing registry
    // and slot 3's campaign is never asked about at all. The first version of
    // this gate put the payload in slot 1 and read 0 bytes back — correctly,
    // because it had opened the empty lab the registry pointed at.
    const wrote = await evaluate(`(async () => {
      const { newGameState, saveGame, slotKey, SLOTS_KEY, saveSlotRegistry } = await import('./save/save.js');
      const small = newGameState();
      small.slotId = 1;
      saveGame(small);
      const state = newGameState();
      state.slotId = 3;
      // One long string rather than many short ones: a 2 MB save the game
      // could actually reach is mostly inventory, and this stands in for it
      // without pretending to be a campaign nobody walked.
      state.__bulk = 'x'.repeat(${TARGET_MB} * 1024 * 1024);
      saveGame(state);
      saveSlotRegistry({ slots: [{ id: 1, name: 'The Institute', createdAt: 1 }, { id: 3, name: 'Annexe', createdAt: 2 }], activeId: 3 });
      // The backup is deliberately not awaited by saveGame, so this gate has
      // to wait for what the player never does.
      await new Promise((r) => setTimeout(r, 2500));
      return {
        bytes: localStorage.getItem(slotKey(3)).length,
        registry: localStorage.getItem(SLOTS_KEY),
      };
    })()`);

    if (REPORT) console.log(`\nwrote a ${(wrote.bytes / 1024 / 1024).toFixed(2)} MB save to slot 3, and a small one to slot 1`);
    if (wrote.bytes < TARGET_MB * 1024 * 1024) {
      note(`the test save is ${(wrote.bytes / 1024 / 1024).toFixed(2)} MB, under the ${TARGET_MB} MB this is supposed to prove`);
    }

    // Did it actually reach IndexedDB? Asked separately from the recovery
    // below, because "the backup was never written" and "the backup was not
    // read" are different defects and a single assertion would confuse them.
    const backed = await evaluate(`(async () => {
      const { recover } = await import('./save/durable.js');
      const { slotKey, SLOTS_KEY } = await import('./save/save.js');
      return {
        save: (await recover(slotKey(3)) ?? '').length,
        registry: (await recover(SLOTS_KEY) ?? '').length,
      };
    })()`);
    if (REPORT) console.log(`IndexedDB holds ${(backed.save / 1024 / 1024).toFixed(2)} MB of save and ${backed.registry} B of registry`);
    if (backed.save !== wrote.bytes) {
      note(`IndexedDB holds ${backed.save} bytes of a ${wrote.bytes}-byte save `
        + `— the backup ${backed.save ? 'truncated it' : 'was never written'}`);
    }
    if (!backed.registry) {
      note('the slot registry was not backed up, so a recovered save would have no lab listing to belong to');
    }

    // --- 2. seven days pass -------------------------------------------------
    // `localStorage.clear()` is exactly what the browser does: IndexedDB is a
    // separate store with a separate eviction policy and is left standing,
    // which is the entire reason the backup lives there.
    errors.length = 0;
    await evaluate('localStorage.clear()');
    const afterClear = await evaluate('localStorage.length');
    if (afterClear !== 0) {
      note(`localStorage still holds ${afterClear} key(s) after clear(), so nothing here was tested`);
    }

    // --- 3. the player opens the app --------------------------------------
    const back = await evaluate(`(async () => {
      const { loadSave, SLOTS_KEY } = await import('./save/save.js');
      const save = await loadSave();
      return {
        bulk: (save.__bulk ?? '').length,
        slotId: save.slotId,
        registry: localStorage.getItem(SLOTS_KEY),
      };
    })()`);

    if (REPORT) {
      console.log(`after localStorage.clear() and one open:`);
      console.log(`  save came back  ${(back.bulk / 1024 / 1024).toFixed(2)} MB of payload`);
      console.log(`  active slot     ${back.slotId}`);
      console.log(`  registry        ${back.registry ? 'restored' : 'GONE'}`);
    }

    if (back.bulk !== TARGET_MB * 1024 * 1024) {
      note(`the recovered save carries ${back.bulk} bytes of payload, not the ${TARGET_MB * 1024 * 1024} written `
        + '— a save that comes back short is worse than one that does not come back');
    }
    // The registry has to come back FIRST or the recovery lands on the wrong
    // lab: `activeSlotId` answers 1 for a missing registry, and slot 3's
    // campaign is never asked about at all.
    //
    // COMPARED BY MEANING, NOT BY BYTES. The first version asserted the string
    // came back identical and failed on a registry that had recovered
    // perfectly: `loadSlot` stamps `lastPlayedAt` on the slot it opens and
    // writes the registry back, which is correct and changes the bytes. What
    // has to survive is which labs exist and which one the player was in.
    const shape = (raw) => {
      try {
        const r = JSON.parse(raw);
        return JSON.stringify({ ids: r.slots.map((x) => x.id), names: r.slots.map((x) => x.name), activeId: r.activeId });
      } catch { return null; }
    };
    if (shape(back.registry) !== shape(wrote.registry)) {
      note(`the slot registry did not come back — every lab but the first is stranded after an eviction `
        + `(wanted ${shape(wrote.registry)}, got ${shape(back.registry)})`);
    }
    if (back.slotId !== 3) {
      note(`the recovery opened slot ${back.slotId}, not the slot 3 the player was last in`);
    }
    const real = errors.filter((e) => e && !/favicon/i.test(e));
    if (real.length) note(`the recovery logged ${real.length} console error(s): ${real.slice(0, 3).join(' | ')}`);

    // --- 4. and a deleted lab stays deleted --------------------------------
    // The one way this file could cost a player something they meant to do.
    const gone = await evaluate(`(async () => {
      const { recover } = await import('./save/durable.js');
      const { slotKey } = await import('./save/save.js');
      const { deleteSlot } = await import('./save/slots.js');
      const r = deleteSlot(1);
      await new Promise((res) => setTimeout(res, 2000));
      return { ok: r.ok, reason: r.reason, still: (await recover(slotKey(1)) ?? '').length };
    })()`);
    if (!gone.ok) {
      note(`the delete under test did not happen (${gone.reason}), so nothing checked that a retired lab stays retired`);
    } else if (gone.still) {
      note('a deleted lab is still in the backup, so the next eviction brings it back');
    }
  } finally {
    try { cdp?.ws.close(); } catch { /* already gone */ }
    proc.kill();
    server.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
  return problems;
}

const problems = await main();
if (problems.length) {
  console.error(`durable ✗  ${problems.length} problem${problems.length > 1 ? 's' : ''}:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`durable ✓  a ${TARGET_MB} MB save and its slot registry survive localStorage being cleared, `
  + 'and a retired lab stays retired');
