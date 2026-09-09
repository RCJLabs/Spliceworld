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
  //
  // R128 COLLECTS WHAT R98 EARNED: 14800 -> 4450 open, measured at 4264.
  // R98 gave this screen the Pens' one-at-a-time rule and never brought the
  // ceiling down behind it — twenty animals that could all be open at once
  // became twenty that cannot, and 10,536px of budget went on standing
  // there permitting a screen the code no longer builds. A ceiling nothing
  // can reach is not a ratchet; it is a number waiting to excuse the next
  // regression. The shut half is untouched at 3,650 (measured 3,485) and is
  // still the one that should worry somebody: pagination is still unwritten.
  // R131 SETS THE CEILING RATHER THAN FOLLOWING IT: 3650 -> 2500 shut,
  // measured at 2,453 with a page of eight. Every ratchet above is the same
  // admission — the folded row is per ANIMAL, so the screen is a
  // multiplication and folding only divided the constant. 3,269px at four,
  // 7,438 at twelve, 11,607 at twenty before R98; 3,499 at twenty after it.
  //
  // THE NUMBER IS NOW ARITHMETIC ANYBODY CAN CHECK, which is the point:
  // 1,756px of Ranch chrome (the Path, Right Now, the facility card, the
  // Breeding Pen, the Incubator) plus eight rows at 87px. It does not move
  // when the herd grows, and the only things that can move it are a taller
  // row or a bigger page — both deliberate, both visible in a diff.
  //
  // I set this to 1,950 before measuring the chrome and it was a guess: the
  // chrome alone is 2.3 phone screens, so no page size could have met it.
  // The chrome is R47's territory and has not been re-measured since; that
  // is the next thing worth doing to this screen, not a smaller page.
  ranch:          { folded: 2500,  tallest: 4450, opens: 20 },
  pens:           { folded: 2000,  tallest: 4000, opens: 20 },   // R89's criterion
  // R128: 1900 -> 2080 open, measured at 1998. The shut half does not move
  // (1,827 against 1,900) — what moved is that this screen HAS an open half
  // now. Its two numbers were equal because the Theater had no fold at all,
  // and a `tallest` that equals `folded` does not budget a fold, it forbids
  // one. The Surgery Theater's own upgrade card is the fold, which is the
  // entire milestone: the machine is bought on the screen it runs.
  theater:        { folded: 1900,  tallest: 2080, opens: 1 },
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
  // R128: 2400 -> 2560 shut, measured at 2456. The Extractor's card. Two of
  // that track's three grants are vault capacity, and this is the screen
  // where a player watches them run out — 56px of card header is what it
  // costs to be bought where it is felt. The derived open height is
  // untouched, because a fold adds nothing to a screen already 29,798px tall.
  // R131 — AND THE OPEN HALF STOPS BEING DERIVED FROM THE WHOLE SHELF.
  // `VAULT_ROWS * 68 * 1.1` was an honest description of a screen that could
  // put all 457 rows on at once: 41 bays of raw `<details>`, none of them
  // exclusive, 29,708px measured. A budget that tracks the shelf is a budget
  // that grows with the save, which is the thing this milestone exists to
  // stop. The bays are one-at-a-time on the project's own fold machinery
  // now and a bay shows a page, so the number is the shut shelf plus ONE
  // open page. Measured at 4,009 with pages of eight; 4,100 sits just above
  // it, and like the Ranch's it is arithmetic rather than a ratchet — the
  // shut shelf plus sixteen rows, whatever the shelf holds.
  //
  // The bay this exists for is the shark bay, and it is worth writing the
  // numbers down: on a day-180 save it holds 101 of the 337 parts AND 116
  // of the 120 vials. One summary line, 217 rows behind it. The first
  // version of this milestone paged the parts and left the vials, and the
  // gate measured that bay at 16,821px — the fix is not a smaller page, it
  // is that a list is a list.
  vault:          { folded: 2560,  tallest: 4100, opens: 20 },
  'dex:roster':   { folded: 3100,  tallest: 3100 },
  'dex:variants': { folded: 1100,  tallest: 1100 },
  // R95: 1900 -> 2350, measured at 2293. The tab lists what you have found,
  // and a campaign now finds a median EIGHT combos where it found two — the
  // milestone's own success arriving on a screen with no fold. Folding the
  // Combos tab is owed alongside the Vault's.
  'dex:combos':   { folded: 2350,  tallest: 2350 },
  // R129 FOLDS IT, WHICH BRINGS THE SHUT HALF DOWN AND BUDGETS THE FOLD:
  // 1100/1100 -> 400 shut (measured 291) and 1250 open (measured 1185).
  // Twelve genes could only be learned by breeding for them, so this tab
  // spent the game mostly unsequenced and its full shape was never measured
  // — the release hands the player genes through the Wing, a day-180 walk
  // now knows all twelve, and 219 words arrived on a screen with no fold.
  // Same answer R89 gave the Foes tab and for the same reason: the field
  // guide is looked things up in, not read, so the shut number is the one
  // that matters and the open one is a ratchet a reader pays deliberately.
  'dex:genes':    { folded: 400,   tallest: 1250, opens: 1 },
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
  'dex:foes':     { folded: 2500,  tallest: 6100, opens: 4 },
};

// R98 — AND WHAT IT SAYS, not only how tall it is.
//
// The two are the same question asked twice. A screen is expensive because
// it puts more in front of the player than they asked for, and height is
// only the part you can see from across the room — the Ranch is 14,450px
// open AND 1,686 words, for the one reason: twenty full dossiers stacked
// vertically with nothing closing the one you were not reading.
//
// Measured on the same day-180 save, at the same moment, in the same browser
// this gate has already started. A second tool would mean a second Chromium
// and forty seconds on a suite that has six to spare.
//
// `open` is what a player can have on screen at once — which is NOT the sum
// of every card, on a screen that keeps one card open at a time. That
// distinction is the whole finding: the Pens has ten folds and allows one,
// so opening everything you can reach costs 291 words; the Ranch has
// twenty-three and allows all of them.
const WORDS = {
  // 900 was a GUESS, written before the first run, and this milestone caught
  // itself making it twice (see the Combos tab below). Measured after the
  // one-at-a-time rule: 935, down from 1,686. The ratchet sits just above
  // the measurement, which is the R89/R91 convention and the only honest
  // thing to do with a number I invented — creep fails, and the screen
  // cannot drift back toward the wall it was.
  //
  // The Ranch is allowed more than the Pens for a reason that is not
  // slack: it holds twenty animals against the Pens' ten, and it is also
  // where the money, the catalogue, breeding, the incubator and the whole
  // facility tree live. R128 will take most of the facility off it.
  // R128 collects here too: 950 -> 810 open, measured at 768. Same cause as
  // the pixel ceiling above — R98's one-at-a-time rule made the 950 word
  // budget unreachable, and an unreachable budget measures nothing.
  ranch:          { folded: 700,  open: 810 },
  pens:           { folded: 300,  open: 400 },
  // R128: 300 -> 340 open, measured at 320. The upgrade card's twenty words
  // are the Tier II blurb and the grants line under it — what the gantry
  // costs and what it buys. The shut budget is unchanged at 300 (measured
  // 260), so the screen still has to summarise it in one line.
  theater:        { folded: 300,  open: 340 },
  // The Vault is a list of what you own, and R91 capped what that can be —
  // 400 parts and 120 vials, each a line. Its words are inventory rather
  // than prose, and the fold work it is owed is a height problem; a ratchet
  // keeps it from growing further meanwhile.
  vault:          { folded: 350,  open: 5000 },
  'dex:roster':   { folded: 400,  open: 400 },
  'dex:variants': { folded: 200,  open: 200 },
  // Measured at 527, and 350 was a guess I wrote before running it — a
  // budget invented rather than measured is how a gate fails on its first
  // run for a reason that has nothing to do with the milestone. The Combos
  // tab lists what you have found and R95 took that from two discoveries to
  // eight, so it grew for a good reason and has no fold to hide behind. A
  // ratchet stops the creep; folding it is owed alongside the Vault's.
  'dex:combos':   { folded: 550,  open: 550 },
  // R129: 200/200 -> 100 shut (measured 50) and 250 open (measured 221).
  // See the height note above — the words are the twelve descriptions, and
  // they are now behind the fold that holds them.
  'dex:genes':    { folded: 100,  open: 250 },
  'dex:foes':     { folded: 150,  open: 900 },
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
  // R98 — `innerText`, so it is what the player READS: hidden folds and
  // display:none contribute nothing, which is exactly the difference a fold
  // is there to make.
  const wordsOf = async (sel) => Number(await evaluate(
    `(document.querySelector('${sel}')?.innerText ?? '').split(/\\s+/).filter(Boolean).length`));

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

  // R131 — AND HOW MANY THINGS IT MANAGED TO OPEN, which this returned
  // nothing about for two years. A height gate only ever fails UPWARDS: a
  // screen that grows is caught, and a screen the walk can no longer open
  // reports a small number and passes. That is not hypothetical — R131's
  // first draft moved the Vault's rows behind the save while leaving the
  // bays as raw `<details>`, so `openOne` set `.open = true` on forty-one
  // empty shells and the gate reported 2,527px for a screen it could not
  // open at all. The break that replays it (198) went MISSED against the
  // budgets alone, which is how this rule got written.
  let opened = 0;
    // R131 — how many folds the screen paints BEFORE the walk touches it.
    // A screen that paints folds must declare how many the walk should get
    // into: that is what makes "the bays lost their `data-fold`" a failure
    // rather than a shorter screen.
    const foldsCount = async (sel) => Number(await evaluate(
      `document.querySelectorAll('${sel} button[data-fold]').length`));
  const tallestOf = async (sel, cap = 40) => {
    let tallest = await acrossTabs(sel);
    opened = 0;
    for (let i = 0; i < cap; i++) {
      if (!await openOne(sel)) break;
      opened += 1;
      await sleep(240);
      tallest = Math.max(tallest, await acrossTabs(sel));
    }
    return tallest;
  };

  const show = async (screen) => {
    await evaluate(`document.querySelector('[data-screen="${screen}"]')?.click()`);
    await sleep(2000);
  };

  // R128b — HOW FAR DOWN IS THE UPGRADE? Reported from play, on a build
  // whose four gates were all green: "I don't see the upgrades anywhere."
  // R128 moved each facility track to the screen its data names and
  // APPENDED it there, which put it last on every screen it reached —
  // 12th of 12 on the Pens, 2nd of 2 on the Vault, 4th of 4 on the Splice,
  // 10th of 10 in the War Room, between 1.9 and 3.2 phone screens down.
  // The Ranch card it replaced was 3rd of 25.
  //
  // Every assertion R128 wrote asked whether the card EXISTS. None asked
  // where, so a milestone about findability shipped the thing further from
  // the player than it found it. Two rules, because either alone has a hole:
  // pixels miss a short screen whose card is still dead last (the Pens
  // measured 1.9 screens down at 12 of 12), and position misses a screen
  // with two enormous cards above one small one.
  //
  // R99 CORRECTS THE POSITION HALF. It was `at * 2 > of` — "in the bottom
  // half" — and that is a KNIFE EDGE on the one screen whose card count moves
  // on its own: the War Room shows a raid card, a contest card and a captive
  // card only when the world has one, and `height.js` stamps the fixture with
  // `Date.now()`, so how many are up depends on how long since the walk. It
  // measured 5 of 10 when it was written and 6 of 11 on the next run, which
  // flipped a passing gate red for a reason that had nothing to do with
  // layout. A gate that depends on world state is a gate that fails at random.
  //
  // NEVER LAST is the rule that was actually meant, and it is not a knife
  // edge: it catches every appended card (12 of 12, 2 of 2, 4 of 4, 10 of 10)
  // and cannot be flipped by an alert card arriving above it. The pixel
  // budget covers the other case — not last, but still miles down.
  const facilityPlace = async (screen) => await evaluate(`(() => {
    const scr = document.querySelector('#screen-${screen}');
    const head = scr?.querySelector('[data-fold="facility-${screen}"]');
    if (!head) return 'null';
    const card = head.closest('.card');
    const cards = [...scr.querySelectorAll(':scope > .card, :scope > section')];
    return JSON.stringify({ at: cards.indexOf(card) + 1, of: cards.length,
      top: Math.round(card.getBoundingClientRect().top + window.scrollY) });
  })()`);
  const FACILITY_TOP = 780 * 2;  // two phone screens, and not one more

  for (const screen of ['ranch', 'pens', 'theater', 'vault']) {
    await show(screen);
    const sel = `#screen-${screen}`;
    const folded = await heightOf(sel);
    const foldsPainted = await foldsCount(sel);
    const wordsShut = await wordsOf(sel);
    // Measured SHUT and before `tallestOf` opens anything, which is the
    // state a player actually arrives in.
    const place = JSON.parse(await facilityPlace(screen));
    if (place) {
      if (place.of > 1 && place.at === place.of) {
        problems.push(`${screen} buries its facility card last of ${place.of} cards`
          + ' — an upgrade under everything else on the screen is one nobody scrolls to');
      }
      if (place.top > FACILITY_TOP) {
        problems.push(`${screen}'s facility card is ${place.top}px down (${(place.top / 780).toFixed(1)} phone`
          + ` screens), over the ${FACILITY_TOP}px it is allowed`);
      }
    }
    const tallest = BUDGET[screen]?.tallest === null ? null : await tallestOf(sel);
    // After `tallestOf`, which has opened everything the screen will allow.
    rows.push({ id: screen, folded, tallest, opened, foldsPainted, wordsShut, wordsOpen: await wordsOf(sel),
      facilityAt: place && `${place.at}/${place.of} @ ${place.top}px` });
  }
  // The War Room is not in the height table (its map is a canvas the budget
  // has never covered), but it draws a track, so it answers this rule too.
  {
    await show('battle');
    const place = JSON.parse(await facilityPlace('battle'));
    if (!place) problems.push('the War Room draws no facility card at all');
    else if (place.of > 1 && place.at === place.of) {
      problems.push(`battle buries its facility card last of ${place.of} cards`);
    }
    if (place && place.top > FACILITY_TOP) {
      problems.push(`battle's facility card is ${place.top}px down, over the ${FACILITY_TOP}px it is allowed`);
    }
  }
  await show('dex');
  for (const tab of ['roster', 'variants', 'combos', 'genes', 'foes']) {
    await evaluate(`document.querySelector('#screen-dex [data-dex-tab="${tab}"]')?.click()`);
    await sleep(1700);
    const folded = await heightOf('#screen-dex');
    const foldsPainted = await foldsCount('#screen-dex');
    const wordsShut = await wordsOf('#screen-dex');
    const tallest = await tallestOf('#screen-dex');
    rows.push({ id: `dex:${tab}`, folded, tallest, opened, foldsPainted, wordsShut, wordsOpen: await wordsOf('#screen-dex') });
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
  // R131 — AND THE SCREEN HAS TO STILL OPEN. Every rule above fails UPWARDS
  // only, so a screen the walk can no longer get into reports a comfortable
  // number and passes. `opens` is a declaration like the budgets, and it is
  // a COUNT rather than a flag for a reason I got wrong first: the flag
  // version was satisfied by the facility card alone, so the break that
  // takes the Vault's forty-one bays off `data-fold` still passed with one
  // fold walked. Measured (opened/painted): ranch 40/11, pens 40/11, vault
  // 40/42, foes 5/5, theater and genes 1/1 — the exclusive screens saturate
  // the walk's cap of 40 because each open shuts the last. The declared
  // numbers sit well under those and well over what a broken screen gives.
  if (r.foldsPainted > 0 && b.opens == null) {
    problems.push(`${r.id} paints ${r.foldsPainted} folds and declares no \`opens\` count`
      + ' — a screen with folds has to say how many the walk should get into');
  }
  if (b.opens != null) {
    if (r.opened < b.opens) {
      problems.push(`${r.id} declares ${b.opens} folds to walk and the gate got into ${r.opened}`
        + ' — its height budget is being met by a screen nobody can open');
    } else if (r.tallest <= r.folded) {
      problems.push(`${r.id} opened ${r.opened} thing${r.opened === 1 ? '' : 's'} and did not grow`
        + ` (${r.folded}px shut, ${r.tallest}px open) — the walk is opening empty containers`);
    }
  }
  const w = WORDS[r.id];
  if (!w) { problems.push(`${r.id} has no word budget — a new screen has to declare one`); continue; }
  if (r.wordsShut > w.folded) {
    problems.push(`${r.id} says ${r.wordsShut} words shut, over its ${w.folded}-word budget`
      + ' — that is what the player is handed before they ask for anything');
  }
  if (r.wordsOpen > w.open) {
    problems.push(`${r.id} says ${r.wordsOpen} words with everything it will let you open open,`
      + ` over its ${w.open}-word budget`);
  }
}
if (REPORT) {
  console.log(`  screen          shut     tallest   budget          words shut/open   budget    upgrade at`);
  for (const r of rows) {
    const b = BUDGET[r.id] ?? {};
    const w = WORDS[r.id] ?? {};
    console.log(`  ${r.id.padEnd(14)} ${String(r.folded).padStart(5)}   ${String(r.tallest ?? '—').padStart(9)}   ${
      `${b.folded ?? '?'} / ${b.tallest ?? '—'}`.padEnd(14)}  ${
      `${r.wordsShut} / ${r.wordsOpen}`.padStart(11)}   ${
      `${w.folded ?? '?'} / ${w.open ?? '?'}`.padEnd(9)}  ${
      `${r.opened}/${r.foldsPainted} folds`.padEnd(13)}  ${r.facilityAt ?? ''}`);
  }
  console.log('');
}
if (problems.length) {
  console.error(`height ✗  ${problems.length} screen${problems.length === 1 ? '' : 's'} over budget on the day-180 save`);
  for (const p of problems) console.error(`  · ${p}`);
  process.exit(1);
}
const opensRows = rows.filter((r) => BUDGET[r.id]?.opens);
console.log(`height ✓  ${rows.length} screens on the day-180 save at ${VIEWPORT}px, every one inside its budget`
  + ` · ${opensRows.length} of them still open, ${opensRows.reduce((n, r) => n + r.opened, 0)} folds walked`
  + ` · Pens ${rows.find((r) => r.id === 'pens')?.tallest}px at its tallest, Foes ${rows.find((r) => r.id === 'dex:foes')?.folded}px shut`);
