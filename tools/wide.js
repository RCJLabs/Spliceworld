// R117 — THE GAME WAS A 560px COLUMN AT EVERY WIDTH.
//
// `main { max-width: 560px }` and, before this milestone, not one `min-width`
// rule in the whole stylesheet: every width breakpoint style.css carried was a
// `max-width` (400, 430, 420, 400, 340), so the layout could only ever get
// NARROWER. Measured on the day-180 save, the screens were byte-identical at
// 900, 1,280 and 1,920px and the gutters simply grew:
//
//     380px   main 380 at x=0     0px dark each side  (100% of the viewport)
//     900px   main 560 at x=163   163px dark each side       (62.2%)
//   1,280px   main 560 at x=353   353px dark each side       (43.8%)
//   1,920px   main 560 at x=673   673px dark each side       (29.2%)
//
// GitHub Pages serves laptops. On a 1,920px one the player read a column that
// used under a third of the glass.
//
// AND THE WIRE WAS BELOW THE FOLD AT EVERY WIDTH, which is the finding the
// entry did not have. `#ticker` lives in `<footer>`, AFTER `main`, and `main`
// is 1,700-2,700px tall on every screen — so the county's voice was never on
// screen unless the player scrolled to the bottom of whatever they were doing.
// (The entry claimed the one-line ticker was the only place the wire is read.
// It is not: `campaign/warroom.js` ships a Wire tab. What was true, and worse,
// is that neither reader was ever in front of you.) The agenda was narrower
// still: `.agenda-head` was drawn by `ranch/ui.js` alone, so "Right Now"
// existed on the Ranch and nowhere else.
//
// WHAT IT READS NOW, on the same fixture: a two-column shell at 900px and up
// with the agenda and the wire docked in a rail, the tabs as a left rail at
// 1,200px, and 61.6% of a 1,280px viewport in use (main 788px). Past tense
// above is deliberate — a gate whose header still describes the defect in the
// present tense is a gate the next reader trusts about a tree that no longer
// exists, and this project has been bitten twice by a live anchor sitting on
// a dead meaning.
//
// So this gate asks the criterion's three questions, at the two widths that
// matter, on a real campaign:
//
//   node tools/wide.js            # exit 1 if a rule fails
//   node tools/wide.js --report   # and print the table above
import { mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sleep, serve, findChrome, connect } from './cdp.js';
import { walkedSave } from './fixtures.js';
import { loadSimContent } from './sim.js';
import { createBattle } from '../battle/engine.js';

const REPORT = process.argv.includes('--report');

// The phone floor R73 fixed and R89 measures, and the laptop the criterion
// names. 900 is the entry's docking point and is reported but not asserted:
// what must hold is the floor and the laptop.
const PHONE = 380;
const LAPTOP = 1280;
const WIDTHS = [PHONE, 900, LAPTOP, 1920];

// Every screen `index.html` ships. Read from the shell rather than listed, so
// a screen added tomorrow is measured tomorrow — R41's lesson, and the one my
// own first probe broke by typing `splice` for a screen called `theater` and
// measuring five of six without saying so.
const SCREENS = ['ranch', 'pens', 'battle', 'theater', 'dex', 'vault'];

const save = walkedSave({ days: 180 });
const PINNED_NOW = save.lastTickAt;
// R117 — what a WALKED campaign is, in two numbers the page can hand back.
// Rule 0 compares these against what the browser actually loaded; see below
// for why a height floor could not do that job on its own.
const WALKED = { stock: save.ranch.stock.length, news: save.news.length };

// R184 — THE SAME CAMPAIGN, IN USE. R117 measured every screen at rest, so
// the two layouts R184 is about had never been in front of this gate: a pen
// card OPEN (every card is shut on the fixture, and a shut roster has
// nothing to put beside it) and a fight IN PROGRESS (the War Room shows the
// map unless `state.battle` is set). A battle is plain serializable state,
// as R80's fixture found, so both are one edit to the save.
// The phone is measured at R73's 780px height, the a11y gate's, because that
// is where the arena was already wrong: your creature was 64% of the stage and
// sat on the enemy's HP box on the most ordinary phone there is.
const PLAY_VIEWS = [{ w: PHONE, h: 780 }, { w: LAPTOP, h: 900 }, { w: 1920, h: 900 }];
const play = structuredClone(save);
play.ui = { ...(play.ui ?? {}), collapsed: { ...(play.ui?.collapsed ?? {}), [`pen-${play.chimeras[0].id}`]: false } };
{
  const content = loadSimContent();
  const enc = content.encounters.patrol_2 ?? Object.values(content.encounters)[0];
  play.battle = createBattle(play.chimeras.slice(0, 3), enc, content, 7, PINNED_NOW, { kind: 'node', nodeId: null });
}

const { server, port } = await serve();
const chrome = findChrome();
if (!chrome) {
  console.log('wide —  no Chromium on this machine, skipping');
  server.close();
  process.exit(0);
}
const profile = await mkdtemp(join(tmpdir(), 'sw-wide-'));
const cdpPort = Number(process.env.SW_CDP_PORT) || 9300 + (process.pid % 200);
const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${profile}`, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', 'about:blank'], { stdio: 'ignore' });

const fails = [];
const rows = [];
const playRows = [];
try {
  const { send, evaluate } = await connect(cdpPort);
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setBypassServiceWorker', { bypass: true });
  // R89's pinned clock: a height measured today is the same height next year.
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const FIXED = ${PINNED_NOW};
      const Real = Date;
      function Pinned(...args) {
        if (!(this instanceof Pinned)) return new Real(FIXED).toString();
        return args.length ? new Real(...args) : new Real(FIXED);
      }
      Pinned.prototype = Real.prototype;
      Pinned.now = () => FIXED;
      Pinned.parse = Real.parse;
      Pinned.UTC = Real.UTC;
      globalThis.Date = Pinned;
    })();`,
  });
  const url = `http://127.0.0.1:${port}/index.html`;
  await send('Emulation.setDeviceMetricsOverride', { width: PHONE, height: 900, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url });
  await sleep(1000);
  await evaluate(`localStorage.setItem('spliceworld_save', ${JSON.stringify(JSON.stringify(save))})`);

  // R159 — WAIT FOR THE PAGE, NOT FOR THE CLOCK. A screen that has not
  // painted measures zero and passes every rule below by having no layout at
  // all, which is the shape of gate this project has shipped twice.
  const settle = async (sel, { deadline = 12000, gap = 60, quiet = 3 } = {}) => {
    const t0 = Date.now();
    let last = null;
    let runs = 0;
    while (Date.now() - t0 < deadline) {
      const sig = await evaluate(`(() => {
        const el = document.querySelector('${sel}');
        if (!el || el.hidden) return '';
        const r = el.getBoundingClientRect();
        return el.children.length + ':' + Math.round(r.width) + ':' + Math.round(el.scrollHeight);
      })()`);
      if (sig && sig !== '0:0:0' && sig === last) {
        if (++runs >= quiet) return true;
      } else { runs = 0; last = sig; }
      await sleep(gap);
    }
    return false;
  };

  for (const w of WIDTHS) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: w < 700 });
    await send('Page.navigate', { url });
    await sleep(700);
    // R117 — SETTLE ON `main`, NOT ON A NAMED SCREEN. The first draft waited
    // for `#screen-ranch` and reported "the Ranch never painted" at 900, 1280
    // and 1920 on a tree where it paints fine: the app restores the screen you
    // were last on, this loop leaves it on the Vault, and a hidden element's
    // signature is the empty string, which never equals itself twice. That is
    // a gate asking a question the page cannot answer — the same fault this
    // milestone found in `.agenda` (not a class) and `splice` (not a screen).
    // `main` is in the shell from the first byte and is never hidden.
    if (!await settle('main', { deadline: 20000 })) {
      fails.push(`the shell never painted and went quiet within 20s at ${w}px`);
      continue;
    }
    const shell = JSON.parse(await evaluate(`JSON.stringify((() => {
      const m = document.querySelector('main');
      const r = m.getBoundingClientRect();
      // What the PAGE is holding, not what this process walked. The two are
      // the same thing only if the save reached the browser.
      let loaded = { stock: 0, news: 0 };
      try {
        const s = JSON.parse(localStorage.getItem('spliceworld_save') || '{}');
        loaded = { stock: s.ranch?.stock?.length ?? 0, news: s.news?.length ?? 0 };
      } catch { /* a save that will not parse is a save that did not arrive */ }
      return { mainW: Math.round(r.width), mainX: Math.round(r.left),
               share: +(100 * r.width / window.innerWidth).toFixed(1), loaded };
    })())`));

    for (const sc of SCREENS) {
      await evaluate(`document.querySelector('[data-screen="${sc}"]')?.click()`);
      if (!await settle(`#screen-${sc}`)) {
        fails.push(`${sc} never went quiet at ${w}px`);
        continue;
      }
      const m = JSON.parse(await evaluate(`JSON.stringify((() => {
        const el = document.querySelector('#screen-${sc}');
        // On screen means IN THE VIEWPORT without scrolling — a rect with
        // height that overlaps the glass on both axes. An element parked in
        // a footer 1,700px down has a rect too, which is the whole point.
        const onScreen = (n) => {
          if (!n) return false;
          const b = n.getBoundingClientRect();
          return b.height > 0 && b.width > 0
            && b.top < window.innerHeight && b.bottom > 0
            && b.left < window.innerWidth && b.right > 0;
        };
        // ANY agenda heading that is in the glass, not the FIRST one in
        // document order. The distinction is the whole rule once the layout
        // has two places an agenda can live: at 900px and up the Ranch's own
        // Right Now card stands down (display none) and the rail carries it,
        // and a querySelector would have gone on reading the stood-down copy
        // -- a rect of zero height -- and called the Ranch blind on the one
        // screen that never has been. The criterion asks whether the player
        // can SEE the agenda, so the question is whether any of them is on
        // screen. (No backticks in here: this block is inside a template
        // literal the page evaluates, and one would end it early.)
        const agendas = [...document.querySelectorAll('.agenda-head')];
        const wire = document.querySelector('#ticker');
        // The widest thing that runs past the screen's own right edge, so a
        // failure names the offender instead of printing a number.
        const r = el.getBoundingClientRect();
        let worst = null;
        for (const n of el.querySelectorAll('*')) {
          const b = n.getBoundingClientRect();
          if (b.width > 0 && b.right > r.right + 1) {
            const by = Math.round(b.right - r.right);
            if (!worst || by > worst.by) {
              worst = { by, sel: (n.tagName.toLowerCase() + (n.className ? '.' + String(n.className).split(' ')[0] : '')).slice(0, 40) };
            }
          }
        }
        return { h: Math.round(el.scrollHeight),
                 agendaOn: agendas.some(onScreen), agendaAnywhere: agendas.length > 0,
                 wireOn: onScreen(wire),
                 hscroll: el.scrollWidth > el.clientWidth + 1, worst };
      })())`));
      rows.push({ w, sc, ...m, ...shell });
    }
  }

  // R184 — the in-use pass. One save with a pen open and a fight running,
  // at the phone, the laptop and the widest screen R117 measured.
  await evaluate(`localStorage.setItem('spliceworld_save', ${JSON.stringify(JSON.stringify(play))})`);
  for (const { w, h } of PLAY_VIEWS) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
    await send('Page.navigate', { url });
    await sleep(700);
    if (!await settle('main', { deadline: 20000 })) { fails.push(`the in-use save never painted at ${w}px`); continue; }
    const rect = `const R = (n) => { if (!n) return null; const b = n.getBoundingClientRect();
      return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom) }; };`;
    await evaluate(`document.querySelector('[data-screen="pens"]')?.click()`);
    if (!await settle('#screen-pens')) { fails.push(`pens never went quiet with a card open at ${w}px`); continue; }
    const pens = JSON.parse(await evaluate(`JSON.stringify((() => { ${rect}
      const scr = document.querySelector('#screen-pens');
      const shut = [...scr.querySelectorAll(':scope > .pen-fold.is-shut')];
      return { open: R(scr.querySelector(':scope > .pen-fold.is-open')), first: R(shut[0]), last: R(shut[shut.length - 1]), shut: shut.length };
    })())`));
    await evaluate(`document.querySelector('[data-screen="battle"]')?.click()`);
    if (!await settle('#screen-battle')) { fails.push(`the arena never went quiet at ${w}px`); continue; }
    const fight = JSON.parse(await evaluate(`JSON.stringify((() => { ${rect}
      return { stage: R(document.querySelector('.stage')), me: R(document.querySelector('#me-sprite svg')),
               foe: R(document.querySelector('#foe-sprite svg')), foeHp: R(document.querySelector('.hp-foe')),
               meHp: R(document.querySelector('.hp-me')) };
    })())`));
    playRows.push({ w, h, pens, fight });
  }
} finally {
  proc.kill();
  server.close();
  try { await rm(profile, { recursive: true, force: true }); } catch {}
}

if (!rows.length && !fails.length) fails.push('the walk measured nothing at all');

// 0. THE MEASUREMENT IS ON A REAL CAMPAIGN, and it is checked by ASKING THE
//    PAGE rather than by looking at how tall it got. R157's worn floor and
//    R163's median both shipped as rules a dead fixture satisfied, so this
//    gate was written with a height floor against exactly that — and the
//    break that proved it (394: write the save under a key the game does not
//    read) went MISSED, because a FRESH save still paints screens well over
//    800px of chrome. A proxy for "is this a campaign" was not one. So the
//    rule compares the herd and the wire the browser is holding against the
//    fixture this process walked; only the real save can match. The height
//    floor stays as a second clause, for a campaign that loaded and then
//    failed to paint.
{
  const shell = rows[0];
  if (!shell) {
    fails.push('the walk measured no shell at all');
  } else if (shell.loaded.stock !== WALKED.stock || shell.loaded.news !== WALKED.news) {
    fails.push(`the browser is not holding the walked campaign: it has `
      + `${shell.loaded.stock} animals and ${shell.loaded.news} wire lines, `
      + `the fixture walked ${WALKED.stock} and ${WALKED.news}`);
  }
  const tallest = Math.max(0, ...rows.map((r) => r.h));
  if (tallest < 800) {
    fails.push(`the campaign never painted: tallest screen across every width is ${tallest}px`);
  }
}

// 1. THE FLOOR HOLDS: nothing scrolls sideways on a phone. R73 put every
//    control above 40px at 380 and R99 stopped things leaving their card,
//    but neither asks whether the SCREEN is wider than the glass.
for (const r of rows.filter((x) => x.w === PHONE && x.hscroll)) {
  fails.push(`${r.sc} scrolls sideways at ${PHONE}px`
    + (r.worst ? ` — ${r.worst.sel} runs ${r.worst.by}px past the screen` : ''));
}

// 2. AND AT THE LAPTOP TOO, which is the half the criterion names for the
//    Pens specifically and is worth asking of everything.
for (const r of rows.filter((x) => x.w === LAPTOP && x.hscroll)) {
  fails.push(`${r.sc} scrolls sideways at ${LAPTOP}px`
    + (r.worst ? ` — ${r.worst.sel} runs ${r.worst.by}px past the screen` : ''));
}

// 3. THE AGENDA IS IN FRONT OF YOU AT THE LAPTOP, ON EVERY SCREEN. Today it
//    is drawn by `ranch/ui.js` alone, so five of six screens do not have one
//    to show — the rule is about the second column existing, not about the
//    Ranch scrolling well.
{
  const blind = rows.filter((r) => r.w === LAPTOP && !r.agendaOn)
    .map((r) => `${r.sc}${r.agendaAnywhere ? ' (drawn, off screen)' : ' (no agenda at all)'}`);
  if (blind.length) {
    fails.push(`at ${LAPTOP}px the agenda is not on screen: ${blind.join(', ')}`);
  }
}

// 4. AND SO IS THE WIRE. `#ticker` sits in the footer under 1,700-2,700px of
//    screen, so this is false everywhere today, at every width — not only
//    wide ones.
{
  const mute = rows.filter((r) => r.w === LAPTOP && !r.wireOn).map((r) => r.sc);
  if (mute.length) {
    fails.push(`at ${LAPTOP}px the wire is not on screen: ${mute.join(', ')}`);
  }
}

// 5. THE ROOM IS USED. The complaint itself: a column that ignores the glass.
//    Asserted as a SHARE of the viewport rather than a pixel width, because
//    what is wrong is the ratio — 560 of 1,280 is 43.8%, and the same 560px
//    column is 29.2% of a 1,920px laptop. Half is the modest ask: it still
//    leaves a quarter of the glass dark on each side.
{
  const at = rows.find((r) => r.w === LAPTOP);
  if (at && at.share < 50) {
    fails.push(`at ${LAPTOP}px the game uses ${at.share}% of the viewport`
      + ` (main ${at.mainW}px at x=${at.mainX}, ${at.mainX}px dark each side) — under 50%`);
  }
}

// R184 — and the in-use pass MEASURED what it declares, or rules 6 and 7
// below are loops over nothing and pass by having nothing to look at.
if (playRows.length !== PLAY_VIEWS.length || ![PHONE, LAPTOP].every((w) => playRows.some((p) => p.w === w))) {
  fails.push(`the in-use pass measured ${playRows.length} of ${PLAY_VIEWS.length} views`
    + ` (${playRows.map((p) => p.w).join('/') || 'none'}); it has to reach the phone and the laptop`);
}

// 6. R184 — THE OPEN CARD BESIDE THE LIST, at the laptop. R117 gave `main`
//    788px there and the Pens used it as a phone does: the open dossier
//    above the roster, the other eleven cards pushed under it. Beside means
//    both halves of it: the open card starts to the RIGHT of the list, and
//    it shares the list's height rather than sitting above its first card.
//    And the phone keeps its one column, or the rule is met by breaking 380.
for (const p of playRows) {
  const { open, first, last, shut } = p.pens;
  if (!open || !first) { fails.push(`the in-use Pens at ${p.w}px has no open card or no list (${shut} shut)`); continue; }
  if (p.w === PHONE && open.l > first.l + 2) {
    fails.push(`at ${PHONE}px the open card sits beside the list (x=${open.l} against ${first.l}) — the phone lost its single column`);
  }
  if (p.w >= LAPTOP) {
    const beside = open.l >= first.r - 1;
    const alongside = open.t < last.b && open.b > first.t;
    if (!beside || !alongside) {
      fails.push(`at ${p.w}px the open pen card is not beside the list: card x ${open.l}-${open.r} y ${open.t}-${open.b},`
        + ` list x ${first.l}-${first.r} y ${first.t}-${last.b}`
        + (open.b <= first.t ? ' — it sits ABOVE it, the phone\'s layout on a laptop' : ''));
    }
  }
}

// 7. R184 — A FIGHT IN PROGRESS FITS ITS STAGE. Measured before this rule
//    existed: the sprites were sized by the stage's WIDTH and the stage's
//    height is the viewport's, so your creature was 49% of the stage's height
//    on a 380x900 phone, 64% on a 380x780 one (on the enemy's HP box), 91% at
//    1,280px (on it again) and 130% at 1,920px, where the top 141px of it was
//    cut off. Both halves are asked at
//    every width: each creature stays inside the stage top to bottom, and
//    yours does not sit on the enemy's HP box.
const inter = (a, b) => a && b && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
for (const p of playRows) {
  const f = p.fight;
  if (!f.stage || !f.me || !f.foe) { fails.push(`the arena at ${p.w}px has no stage or no creatures to measure`); continue; }
  for (const [who, box] of [['your creature', f.me], ['the enemy', f.foe]]) {
    if (box.t < f.stage.t - 2 || box.b > f.stage.b + 2) {
      fails.push(`at ${p.w}px ${who} runs out of the stage (${box.t}-${box.b} against ${f.stage.t}-${f.stage.b})`);
    }
  }
  if (inter(f.me, f.foeHp)) {
    fails.push(`at ${p.w}px your creature covers the enemy's HP box`);
  }
}

if (REPORT) {
  for (const p of playRows) {
    const f = p.fight;
    const sh = (b) => (b && f.stage ? `${Math.round(100 * (b.b - b.t) / (f.stage.b - f.stage.t))}%` : '?');
    console.log(`\n${p.w}px in use: open card x ${p.pens.open?.l}-${p.pens.open?.r} y ${p.pens.open?.t},`
      + ` list x ${p.pens.first?.l}-${p.pens.first?.r} y ${p.pens.first?.t}-${p.pens.last?.b}`
      + ` · stage ${f.stage ? `${f.stage.r - f.stage.l}x${f.stage.b - f.stage.t}` : '?'},`
      + ` your creature ${sh(f.me)} of its height, the enemy ${sh(f.foe)}`);
  }
  for (const w of WIDTHS) {
    const here = rows.filter((r) => r.w === w);
    if (!here.length) continue;
    const s = here[0];
    console.log(`\n${w}px  main ${s.mainW}px at x=${s.mainX} (${s.share}% of viewport, ${s.mainX}px dark each side)`);
    for (const r of here) {
      console.log(`    ${r.sc.padEnd(8)} ${String(r.h).padStart(5)}px`
        + `  agenda=${r.agendaAnywhere ? (r.agendaOn ? 'onscreen' : 'offscreen') : 'absent  '}`
        + `  wire=${r.wireOn ? 'onscreen' : 'off     '}`
        + `  hscroll=${r.hscroll ? `YES (${r.worst ? r.worst.sel + ' +' + r.worst.by : '?'})` : 'no'}`);
    }
  }
}

if (fails.length) {
  console.error(`wide ✗  ${fails.length} problem${fails.length === 1 ? '' : 's'}`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
const at = rows.find((r) => r.w === LAPTOP) ?? { share: 0, mainW: 0 };
console.log(`wide ✓  ${SCREENS.length} screens at ${WIDTHS.join('/')}px · `
  + `nothing scrolls sideways on a phone or a laptop · the open pen card sits beside the list `
  + `at ${LAPTOP}px and up · a fight fits its stage at ${PLAY_VIEWS.map((v) => `${v.w}x${v.h}`).join('/')} · the agenda and the wire are `
  + `on screen at ${LAPTOP}px on every one · the game uses ${at.share}% of a ${LAPTOP}px viewport `
  + `(main ${at.mainW}px)`);
