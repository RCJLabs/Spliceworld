// R89 — HOW TALL IS THIS SCREEN AFTER A HUNDRED AND EIGHTY DAYS?
//
// Every height this project has quoted at scale — R44's 10,470 px for nine
// chimeras, R46's Ranch, R89's own 12,554 — was measured by hand, once, and
// then went stale while the screen kept growing. The Pens card has gained a
// stance row, a tier chip, a "why" and a "lever" since that number was
// written, and nothing noticed: measured here at 380 px on the day-180 save,
// it is 16,657 px for NINE chimeras, worse than the audit's figure for ten.
//
// So the budget is a gate rather than a note. It runs the same seeded
// 180-day walk the balance harness runs, opens the game on the save that
// walk ends with, and measures.
//
// TALLEST REACHABLE, NOT "EXPANDED". "Expanded" stops being a well-defined
// number the moment a screen only lets one card open at a time — which is
// exactly the fix R89 proposes, so a gate written against "expanded" would
// have to be rewritten by the change it exists to verify. Instead: open each
// fold in turn and keep the largest height seen. That is the honest question
// either way — how tall can a player make this screen — and it is stable
// across both designs.
import { mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sleep, serve, findChrome, connect } from './cdp.js';
import { walkedSave } from './fixtures.js';

const VIEWPORT = 380;
const REPORT = process.argv.includes('--report');

// The two the milestone promises, and a ratchet on everything else so a
// screen R89 does not touch cannot quietly grow into the space R89 frees.
// Ratchets sit just above today's measurement — the R81/R121 rule: a ceiling
// resting on the number means creep fails rather than accumulating.
const BUDGET = {
  // R91 RE-RATCHETS: 12500 -> 12700, measured at 12623. Not a regression in
  // the card — the walk simply keeps SEVENTEEN animals now where it kept
  // sixteen, and this screen is one card per animal at ~742px each. Capping
  // the vault changed what a campaign does with its pens, so the number
  // moved by exactly one animal. The Ranch is still one card per animal and
  // still 16 phone screens; that is R46's shape and nobody has fixed it.
  ranch:          { folded: 3400,  tallest: 12700 },
  pens:           { folded: 2000,  tallest: 4000 },   // R89's criterion
  theater:        { folded: 1900,  tallest: 1900 },
  // R91 — THE VAULT HAS A NUMBER FOR THE FIRST TIME. R89 left this `null`
  // because there was nothing honest to ratchet against: the screen listed
  // 9,451 part tokens and would list a hundred thousand if the campaign ran
  // long enough. It lists 299 now and cannot list more than 400, so a
  // ceiling finally means something.
  //
  // 30,156px is still thirty-nine phone screens with every species bay
  // open, and this milestone did not fix that — it made it FINITE. The fix
  // is R89's, applied here: one bay open at a time. That is a real piece of
  // work (this screen folds with `<details>`, and `bindFolds`' exclusive
  // list wants buttons) and it is not in R91's criterion, so it is written
  // down rather than smuggled in.
  vault:          { folded: 1900,  tallest: 31000 },
  'dex:roster':   { folded: 3100,  tallest: 3100 },
  'dex:variants': { folded: 1100,  tallest: 1100 },
  'dex:combos':   { folded: 1900,  tallest: 1900 },
  'dex:genes':    { folded: 1100,  tallest: 1100 },
  // R89's criterion names 2,500 for the Foes tab, and that is a budget on
  // how it PRESENTS: 4,113px shut was five and a half screens of reference
  // material nobody had asked for. Folded it is 664.
  //
  // Its fully-open height is a ratchet rather than the same 2,500, and the
  // reason is not that 2,500 was inconvenient. The field guide is a gallery
  // you look things up in — four class bands you may well want open together
  // to compare — so the one-card-at-a-time rule that makes the Pens' tallest
  // meaningful would make this tab worse to use. Folding it added chrome and
  // pushed the everything-open height from 4,113 to 5,702; that is the price
  // of the fold, it is paid only by a player who deliberately opened all
  // four, and the ceiling below stops it growing further.
  'dex:foes':     { folded: 2500,  tallest: 6000 },
};

// R90 — one walked-save recipe, in tools/fixtures.js, and cached on disk.
// The walk costs about fifteen seconds and is deterministic from its seed;
// the battery runs this gate once per break aimed at it, and was paying for
// the same fifteen seconds every time. The guides-dismissed rule lives there
// too, because a fixture that forgets it measures the guide DIALOG.
const save = await walkedSave();
save.lastTickAt = Date.now();

const { server, port } = await serve();
const chrome = findChrome();
if (!chrome) {
  console.log('height —  no Chromium on this machine, skipping');
  server.close();
  process.exit(0);
}
const profile = await mkdtemp(join(tmpdir(), 'sw-height-'));
const cdpPort = 9100 + (process.pid % 200);
const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${profile}`, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', 'about:blank'], { stdio: 'ignore' });

const problems = [];
const rows = [];
try {
  const { send, evaluate } = await connect(cdpPort);
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setBypassServiceWorker', { bypass: true });
  await send('Emulation.setDeviceMetricsOverride', { width: VIEWPORT, height: 780, deviceScaleFactor: 1, mobile: true });
  const url = `http://127.0.0.1:${port}/index.html`;
  await send('Page.navigate', { url });
  await sleep(1000);
  await evaluate(`localStorage.setItem('spliceworld_save', ${JSON.stringify(JSON.stringify(save))})`);
  await send('Page.navigate', { url });
  await sleep(5000);

  const heightOf = async (sel) => Number(await evaluate(`Math.round(document.querySelector('${sel}')?.scrollHeight ?? 0)`));

  // Open one closed thing, anywhere in the screen; report whether it found
  // one. A fold click rerenders, so this is a loop and not a forEach.
  const openOne = async (sel) => Number(await evaluate(`(() => {
    const b = document.querySelector('${sel} button[data-fold][aria-expanded="false"]');
    if (b) { b.click(); return 1; }
    const d = document.querySelector('${sel} details:not([open])');
    if (d) { d.open = true; return 1; }
    return 0;
  })()`));

  // R89 — AND THE TABS INSIDE, or this measures the wrong maximum. The first
  // version opened every fold and stopped, which on the new Pens card meant
  // it only ever saw the Overview tab: 1,742px, while Moves is 1,919. A gate
  // that reports the shortest of four faces as "the tallest" is a gate that
  // would let the tall one grow.
  //
  // The screen's OWN sub-tab bar is excluded — that is the outer loop's job,
  // and cycling it here would measure the Dex's five tabs five times each.
  const innerTabs = async (sel) => JSON.parse(await evaluate(`JSON.stringify(
    [...document.querySelectorAll('${sel} nav.subtabs')]
      .filter((n) => n.id !== 'dex-subtabs')
      .flatMap((n) => [...n.querySelectorAll('button')].map((b) => b.getAttribute(b.getAttributeNames().find((a) => a.startsWith('data-')) ?? 'x')))
      .filter(Boolean))`));

  const acrossTabs = async (sel) => {
    let tallest = await heightOf(sel);
    const tabs = await innerTabs(sel);
    for (const t of tabs) {
      const clicked = await evaluate(`(() => { const b = document.querySelector('${sel} nav.subtabs:not(#dex-subtabs) button[data-pen-tab="${t}"]'); if (b) { b.click(); return 1; } return 0; })()`);
      if (!Number(clicked)) continue;
      await sleep(320);
      tallest = Math.max(tallest, await heightOf(sel));
    }
    return tallest;
  };

  const tallestOf = async (sel, cap = 40) => {
    let tallest = await acrossTabs(sel);
    for (let i = 0; i < cap; i++) {
      if (!await openOne(sel)) break;
      await sleep(240);
      tallest = Math.max(tallest, await acrossTabs(sel));
    }
    return tallest;
  };

  const show = async (screen) => {
    await evaluate(`document.querySelector('[data-screen="${screen}"]')?.click()`);
    await sleep(2000);
  };

  for (const screen of ['ranch', 'pens', 'theater', 'vault']) {
    await show(screen);
    const sel = `#screen-${screen}`;
    const folded = await heightOf(sel);
    const tallest = BUDGET[screen]?.tallest === null ? null : await tallestOf(sel);
    rows.push({ id: screen, folded, tallest });
  }
  await show('dex');
  for (const tab of ['roster', 'variants', 'combos', 'genes', 'foes']) {
    await evaluate(`document.querySelector('#screen-dex [data-dex-tab="${tab}"]')?.click()`);
    await sleep(1700);
    const folded = await heightOf('#screen-dex');
    const tallest = await tallestOf('#screen-dex');
    rows.push({ id: `dex:${tab}`, folded, tallest });
  }
} finally {
  proc.kill();
  server.close();
  await sleep(300);
  try { await rm(profile, { recursive: true, force: true }); } catch { /* the OS will get it */ }
}

for (const r of rows) {
  const b = BUDGET[r.id];
  if (!b) { problems.push(`${r.id} has no height budget — a new screen has to declare one`); continue; }
  if (r.folded > b.folded) {
    problems.push(`${r.id} is ${r.folded}px shut, over its ${b.folded}px budget (${(r.folded / 780).toFixed(1)} phone screens before anything is opened)`);
  }
  if (b.tallest !== null && r.tallest > b.tallest) {
    problems.push(`${r.id} reaches ${r.tallest}px when opened, over its ${b.tallest}px budget (${(r.tallest / 780).toFixed(1)} phone screens)`);
  }
}
if (REPORT) {
  console.log(`  screen          shut     tallest   budget`);
  for (const r of rows) {
    const b = BUDGET[r.id] ?? {};
    console.log(`  ${r.id.padEnd(14)} ${String(r.folded).padStart(5)}   ${String(r.tallest ?? '—').padStart(9)}   ${b.folded ?? '?'} / ${b.tallest ?? '—'}`);
  }
  console.log('');
}
if (problems.length) {
  console.error(`height ✗  ${problems.length} screen${problems.length === 1 ? '' : 's'} over budget on the day-180 save`);
  for (const p of problems) console.error(`  · ${p}`);
  process.exit(1);
}
console.log(`height ✓  ${rows.length} screens on the day-180 save at ${VIEWPORT}px, every one inside its budget`
  + ` · Pens ${rows.find((r) => r.id === 'pens')?.tallest}px at its tallest, Foes ${rows.find((r) => r.id === 'dex:foes')?.folded}px shut`);
