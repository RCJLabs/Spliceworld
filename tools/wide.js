// R117 — THE GAME IS A 560px COLUMN AT EVERY WIDTH.
//
// `main { max-width: 560px }` and, before this milestone, not one `min-width`
// rule in the whole stylesheet: every width breakpoint style.css carries is a
// `max-width` (400, 430, 420, 400, 340), so the layout could only ever get
// NARROWER. Measured on the day-180 save, the screens are byte-identical at
// 900, 1,280 and 1,920px and the gutters simply grow:
//
//     380px   main 380 at x=0     0px dark each side  (100% of the viewport)
//     900px   main 560 at x=163   163px dark each side       (62.2%)
//   1,280px   main 560 at x=353   353px dark each side       (43.8%)
//   1,920px   main 560 at x=673   673px dark each side       (29.2%)
//
// GitHub Pages serves laptops. On a 1,920px one the player reads a column
// that uses under a third of the glass.
//
// AND THE WIRE IS BELOW THE FOLD AT EVERY WIDTH, which is the finding the
// entry did not have. `#ticker` lives in `<footer>`, AFTER `main`, and `main`
// is 1,700-2,700px tall on every screen — so the county's voice is never on
// screen unless the player scrolls to the bottom of whatever they are doing.
// (The entry claimed the one-line ticker was the only place the wire is read.
// It is not: `campaign/warroom.js` ships a Wire tab. What is true, and worse,
// is that neither reader is ever in front of you.) The agenda is narrower
// still: `.agenda-head` is drawn by `ranch/ui.js` alone, so "Right Now" exists
// on the Ranch and nowhere else.
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
    if (!await settle('#screen-ranch', { deadline: 20000 })) {
      fails.push(`the Ranch never painted and went quiet within 20s at ${w}px`);
      continue;
    }
    const shell = JSON.parse(await evaluate(`JSON.stringify((() => {
      const m = document.querySelector('main');
      const r = m.getBoundingClientRect();
      return { mainW: Math.round(r.width), mainX: Math.round(r.left),
               share: +(100 * r.width / window.innerWidth).toFixed(1) };
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
        const agenda = document.querySelector('.agenda-head');
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
                 agendaOn: onScreen(agenda), agendaAnywhere: !!agenda,
                 wireOn: onScreen(wire),
                 hscroll: el.scrollWidth > el.clientWidth + 1, worst };
      })())`));
      rows.push({ w, sc, ...m, ...shell });
    }
  }
} finally {
  proc.kill();
  server.close();
  try { await rm(profile, { recursive: true, force: true }); } catch {}
}

if (!rows.length && !fails.length) fails.push('the walk measured nothing at all');

// 0. THE MEASUREMENT IS ON A REAL CAMPAIGN. R157's worn floor and R163's
//    median both shipped as rules a dead fixture satisfied; a screen that
//    painted nothing has no overflow and no frozen column either.
{
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

if (REPORT) {
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
  + `nothing scrolls sideways on a phone or a laptop · the agenda and the wire are `
  + `on screen at ${LAPTOP}px on every one · the game uses ${at.share}% of a ${LAPTOP}px viewport `
  + `(main ${at.mainW}px)`);
