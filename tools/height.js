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
import { join, dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sleep, serve, findChrome, connect } from './cdp.js';
import { walkedSave } from './fixtures.js';

const VIEWPORT = 380;
const REPORT = process.argv.includes('--report');

// The two the milestone promises, and a ratchet on everything else so a
// screen R89 does not touch cannot quietly grow into the space R89 frees.
// Ratchets sit just above today's measurement — the R81/R121 rule: a ceiling
// resting on the number means creep fails rather than accumulating.
// R92 — how many rows the Vault can ever hold, read from the Extractor
// track's top grant rather than typed. The screen lists one line per part
// and one per vial, so this is the shape of the tallest Vault a save can
// reach (R61: derive the number, never re-type it).
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const VAULT_CAP = JSON.parse(readFileSync(join(root, 'data', 'facility.json'), 'utf8'))
  .tracks.find((t) => t.id === 'extractor').levels
  .reduce((m, l) => ({
    parts: Math.max(m.parts, l.grants.vaultParts ?? 0),
    vials: Math.max(m.vials, l.grants.vaultVials ?? 0),
  }), { parts: 0, vials: 0 });
const VAULT_ROWS = VAULT_CAP.parts + VAULT_CAP.vials;

const BUDGET = {
  // R91 RE-RATCHETS: 12500 -> 12700, measured at 12623. Not a regression in
  // the card — the walk simply keeps SEVENTEEN animals now where it kept
  // sixteen, and this screen is one card per animal at ~742px each. Capping
  // the vault changed what a campaign does with its pens, so the number
  // moved by exactly one animal. The Ranch is still one card per animal and
  // still 16 phone screens; that is R46's shape and nobody has fixed it.
  //
  // R95 RE-RATCHETS AGAIN, AND THIS TIME BOTH HALVES: 3400 -> 3650 shut,
  // measured at 3572, and 12700 -> 14800 open, measured at 14537. Same cause
  // as R91's and larger: a campaign that is still collecting keeps TWENTY
  // animals where it kept seventeen, because a pen for a species you have
  // never held is worth buying and the Dex is not finished until day 180.
  // Three more animals is three more cards open and three more folded rows
  // shut, which is exactly the arithmetic above and nothing else.
  //
  // The shut number is the one that should worry somebody: 3,572px is 4.6
  // phone screens before the player opens anything, and it grows with the
  // herd because the folded card is per-animal. That is R46's shape, it has
  // been the tallest screen in the game since R89 measured it, and paginating
  // the Ranch is the fix nobody has written. Ratcheting is not fixing it —
  // it is refusing to let it creep any further while it waits.
  ranch:          { folded: 3650,  tallest: 14800 },
  pens:           { folded: 2000,  tallest: 4000 },   // R89's criterion
  theater:        { folded: 1900,  tallest: 1900 },
  // R92 — THE VAULT'S HEIGHT IS DERIVED, NOT RATCHETED.
  //
  // R89 left this `null` because there was nothing honest to ratchet
  // against: the screen listed 9,451 tokens and would list a hundred
  // thousand if the campaign ran long enough. R91 capped the vault and gave
  // it 29,000; R92's fuller walk pushed it to 31,992 and I was about to type
  // 32,500. A ratchet that moves every milestone is not a ratchet, it is a
  // number being dragged along behind the thing it was supposed to hold.
  //
  // The screen is one row per holding and the holdings are capped now, so
  // the budget is a STATEMENT ABOUT THE SHAPE: rows times the height of a
  // row. It only moves when somebody deliberately sells more shelf space,
  // which is a design decision rather than drift — and if a row gets taller,
  // this fails, which is the thing worth catching.
  //
  // 68px per row measured on the day-180 save (31,992px across 473 rows),
  // with a tenth for the chrome the species bays put around them.
  // R95: 1900 -> 2400 shut, measured at 2346. The shut Vault summarises what
  // is on the shelf, and a campaign that reaches 233 of 244 parts has more
  // kinds of thing to summarise than one that reached 118. The open height
  // is derived and did not move.
  vault:          { folded: 2400,  tallest: Math.round(VAULT_ROWS * 68 * 1.1) },
  'dex:roster':   { folded: 3100,  tallest: 3100 },
  'dex:variants': { folded: 1100,  tallest: 1100 },
  // R95: 1900 -> 2350, measured at 2293. The tab lists what you have found,
  // and a campaign now finds a median EIGHT combos where it found two — the
  // milestone's own success arriving on a screen with no fold. Folding the
  // Combos tab is owed alongside the Vault's.
  'dex:combos':   { folded: 2350,  tallest: 2350 },
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
  // R97: 6000 -> 6100 open, measured at 6042. The tab gained a section that
  // did not exist when R89 set this — one fold listing what each rival lab
  // has fielded against you. Written as a LIST rather than the gallery the
  // rest of the tab uses, because a lab's specimen is a different creature
  // every duel and there is no portrait to draw: five cells measured 858px,
  // five lines 200px, and the 42px that remain are the fold's own header.
  //
  // The number this milestone is judged on is the OTHER one. R97's criterion
  // is "Foes under two screens folded"; it is 764px shut, against 1,560.
  'dex:foes':     { folded: 2500,  tallest: 6100 },
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
