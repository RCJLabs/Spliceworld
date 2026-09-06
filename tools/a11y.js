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

import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
// R81 — the driver moved to its own module so tools/boot.js could use it too.
import { sleep, serve, findChrome, connect, CHROME_CANDIDATES } from './cdp.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FLOOR = 40;          // px, both dimensions
const GUTTER = 6;          // px, between two adjacent controls
const VIEWPORT = 380;      // px, the reference phone width
const REPORT = process.argv.includes('--report');

// --- a save with something on every screen ----------------------------------
export async function fixtureSave() {
  const { indexContent } = await import('../render/renderer.js');
  const { newGameState, SAVE_VERSION } = await import('../save/save.js');
  const { spliceChimera } = await import('../splice/theater.js');
  const { createAnimal } = await import('../ranch/ranch.js');
  const readJSON = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
  // R85: the list the game itself loads, rather than a sixth copy of it. A
  // Node tool reads every file off disk, so it gets the geometry the browser
  // fetches after its first paint (R81) in the same round.
  const { CONTENT_FILES: files } = await import('../data/loader.js');
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
  // R85 — a second creature, pacing its pen, so this gate measures the one
  // alert on the Pens whose countdown ends with the roster one shorter. The
  // band, the badge on the shut row and the open card's explanation are all
  // new controls and new text at 380px, and a fixture that cannot reach them
  // would leave the newest thing on the screen the only unmeasured thing on
  // it. Built by hand rather than by waiting: `agitatedAt` is what the tick
  // stamps, and this gate is about the pixels, not the clock.
  {
    const twin = JSON.parse(JSON.stringify(s.chimeras[0]));
    twin.id = 'a11y-feral';
    twin.name = 'Chompers';
    twin.instability = 100;
    twin.bond = 0;
    // Every one of these, because `lastAttended` takes the MAX of the three
    // — a creature is attended by being made, so a twin cloned from a
    // chimera spliced this second is not neglected however far back its
    // other stamps go. The first draft set only two of them and the gate
    // passed on a card with no alert on it at all.
    twin.createdAt = now - 80 * 3600000;
    twin.settleUntil = now - 79 * 3600000;
    twin.lastAttendedAt = now - 80 * 3600000;
    twin.lastTrainedAt = now - 80 * 3600000;
    twin.agitatedAt = now - 3 * 3600000;
    s.chimeras.push(twin);
  }
  // R86 — three clocks still running, so the Hurry buttons are measured at
  // 380px on each of the three screens that draw one: a settling chimera on
  // the Pens, an incubating egg on the Ranch, and a tank mid-run in the Vault.
  {
    const fresh = JSON.parse(JSON.stringify(s.chimeras[0]));
    fresh.id = 'a11y-settling';
    fresh.name = 'Newcomer';
    fresh.settleUntil = now + 2 * 3600000;
    fresh.temperament = null;
    fresh.agitatedAt = null;
    s.chimeras.push(fresh);
    const lineage = (name) => ({ name, stars: 3, sire: { name: 'Gran', stars: 2 }, dam: { name: 'Nan', stars: 2 } });
    s.ranch.eggs = [{ id: 'a11y-egg', species: 'goat', variant: null, variantNote: null, sex: 'F',
      laidAt: now - 3600000, hatchAt: now + 3600000, mutationNote: null, genotype: {},
      potential: { hp: 3, power: 3, armor: 3, speed: 3, stamina: 3 },
      parents: { sire: lineage('Bullseye'), dam: lineage('Bessie') } }];
    s.ranch.eggCount = 1;
    const potential = { hp: 3, power: 3, armor: 3, speed: 3, stamina: 3 };
    s.resequencer = { vialId: 'a11y-vial', species: 'goat', donorName: 'Vialed', stars: 3,
      startedAt: now - 3600000, until: now + 3600000, penFullSaid: false,
      sample: { potential, genotype: {} },
      outcome: { succeeded: true, mutated: false, potential, genotype: {}, mutationNote: null } };
  }
  // R82 — one loose specimen, so the Labs tab paints its Hunt button and
  // this gate measures it like every other control. Built the way the world
  // builds one: a lab that has lost to you, and a clock dated far enough
  // back that the first escape is already overdue.
  s.campaign.heldNodes = ['barn_perimeter', 'downtown'];
  s.campaign.notoriety = 9999;
  // R87 — a raid at the gate, so the Task Force alert is measured at 380px
  // like every other control. It sits above the subtab bar with the
  // counter-offensives, which is the one place R15 says a billing countdown
  // has to be.
  // …and the county, because the Task Force only comes for a player it is in
  // range of. Two held nodes is not in range, so the first tick stood the
  // raid down and the gate measured ONE FEWER control than before rather
  // than one more — which is how this was caught.
  s.dominionAt = now - 24 * 3600000;
  s.campaign.nextRaidAt = now;
  s.campaign.raid = { id: 'raid-0', encounterId: 'military_response', scheduledAt: now,
    startedAt: now, deadline: now + 4 * 3600000, escalation: 1.15 };
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

// R122 — CAN YOU READ IT. The founding screen shipped with its species
// names at 1.1:1 — near-black on near-black, because `--ink` is the PAGE
// colour and I used it as a text colour, and because the card wore a class
// (`panel`) that this stylesheet does not define, so it had no background
// of its own and the Ranch showed through the words.
//
// Neither of those is visible to a static check. The CSS gate asserts that
// every `var()` names a property that EXISTS, and both of these did; the
// class was a real token name in the wrong slot. What is left is to ask the
// browser the only question that matters — what colour is this text, and
// what colour is actually behind it — which means compositing every
// translucent ancestor down to the page the way the screen does. A card
// with no background is transparent, so it contributes nothing, and its
// text is measured against whatever it is really lying on.
//
// WCAG's own thresholds: 4.5:1 for body text, 3:1 once type is large
// (24px, or 18.66px bold). There is exactly one exemption — a background
// this cannot decompose into colours at all — and the run prints every
// element that takes it, because an exemption nobody can see is one that
// grows. Today none do.
const CONTRAST = `(() => {
  const parse = (c) => {
    const m = String(c).match(/[\\d.]+/g) || [];
    return { r: +m[0] || 0, g: +m[1] || 0, b: +m[2] || 0, a: m[3] === undefined ? 1 : +m[3] };
  };
  const over = (fg, bg) => ({
    r: fg.a * fg.r + (1 - fg.a) * bg.r,
    g: fg.a * fg.g + (1 - fg.a) * bg.g,
    b: fg.a * fg.b + (1 - fg.a) * bg.b, a: 1,
  });
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  // Every colour one element can put behind its text: its background-colour,
  // plus each stop of any gradient painted over that. Returns null when the
  // image is something with no colours to read.
  const layersOf = (cs) => {
    const img = cs.backgroundImage;
    const out = [];
    const bg = parse(cs.backgroundColor);
    if (bg.a > 0) out.push(bg);
    if (img !== 'none') {
      if (/url\\(/.test(img)) return null;
      const stops = img.match(/rgba?\\([^)]*\\)/g) || [];
      if (!stops.length && !out.length) return null;
      for (const c of stops) { const p = parse(c); if (p.a > 0) out.push(p); }
    }
    return out;
  };
  // The grounds this text could be sitting on. Walked up until something
  // fully covers what is under it — an opaque background-colour with no
  // image over it — because past that point nothing below can show through.
  const behind = (el) => {
    const levels = [];
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const layers = layersOf(cs);
      if (layers === null) return null;
      if (layers.length) levels.push(layers);
      if (cs.backgroundImage === 'none' && parse(cs.backgroundColor).a === 1) break;
    }
    // Composite from the page upward. A level with several candidate stops
    // multiplies the outcomes, so the walk keeps every possibility and the
    // caller judges the worst — capped, because a stack of five-stop
    // gradients is a combinatorial answer nobody needs.
    let accs = [{ r: 255, g: 255, b: 255, a: 1 }];
    for (let i = levels.length - 1; i >= 0; i--) {
      const next = [];
      for (const acc of accs) for (const layer of levels[i]) next.push(over(layer, acc));
      accs = next.slice(0, 24);
    }
    return accs;
  };
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    // Only the element that OWNS the text, so a sentence is judged once
    // rather than once per wrapper it happens to sit inside.
    const txt = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
    if (!txt) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    const fg = parse(cs.color);
    const grounds = behind(el);
    const px = parseFloat(cs.fontSize);
    const name = el.tagName.toLowerCase()
      + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/).join('.') : '');
    if (!grounds) { out.push({ sel: name, txt: txt.replace(/\\s+/g, ' ').slice(0, 34), unmeasured: true }); continue; }
    // The worst ground it passes over: text that is legible on four stops of
    // five is text you cannot read a fifth of.
    let bg = grounds[0];
    let worst = Infinity;
    for (const g of grounds) { const n = ratio(over(fg, g), g); if (n < worst) { worst = n; bg = g; } }
    const large = px >= 24 || (px >= 18.66 && +cs.fontWeight >= 700);
    out.push({
      sel: name,
      txt: txt.replace(/\\s+/g, ' ').slice(0, 34),
      ratio: Math.round(worst * 100) / 100,
      need: large ? 3 : 4.5,
      color: cs.color,
      bg: 'rgb(' + [bg.r, bg.g, bg.b].map(Math.round).join(', ') + ')',
    });
  }
  return out;
})()`;

// R122 — A DIALOG CARD PAINTS ITS OWN BACKGROUND. The founding card said
// `class="panel founding"`, and `panel` is a colour TOKEN, not a class in
// this stylesheet — so the card was `rgba(0, 0, 0, 0)` and the Ranch behind
// it read through the words. What made that hard to see afterwards is that
// the scrim was darkened in the same milestone, and either fix alone hides
// the other: a break that reverts one still passes.
//
// So the rule is stated where it is actually true — a card is a card, and a
// card that borrows its ground from whatever scrim happens to be behind it
// today is one stylesheet edit from being unreadable. Every element child of
// a visible modal that OWNS TEXT must have an opaque background colour of
// its own. A backdrop owns no text and is exempt without being named.
const MODAL_CARDS = `(() => {
  const out = [];
  for (const id of ['overlay', 'picker']) {
    const host = document.getElementById(id);
    if (!host || host.hidden) continue;
    for (const card of host.children) {
      const holdsText = [...card.querySelectorAll('*'), card].some((el) =>
        [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
      if (!holdsText) continue;
      const cs = getComputedStyle(card);
      const m = cs.backgroundColor.match(/[0-9.]+/g) || [];
      const alpha = m[3] === undefined ? 1 : +m[3];
      out.push({ host: id, opaque: alpha === 1,
                 sel: (typeof card.className === 'string' ? card.className.trim() : '') || card.tagName.toLowerCase(),
                 bg: cs.backgroundColor });
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
    const fixture = await fixtureSave();
    await evaluate(`localStorage.setItem('spliceworld_save', ${JSON.stringify(fixture)})`);
    errors.length = 0;
    await send('Page.navigate', { url });
    await sleep(2200);

    // ---- 1. every control clears the floor, on every view ------------------
    const seen = new Map();
    const pairs = new Map();
    const dim = new Map();
    const unpainted = new Map();
    const seeThrough = new Map();
    const cards = new Map();
    const views = new Set();
    const collect = async (where) => {
      views.add(where);
      for (const c of await evaluate(MODAL_CARDS)) {
        cards.set(`${c.host}|${c.sel}`, { ...c, where });
        if (!c.opaque) seeThrough.set(`${c.host}|${c.sel}`, { ...c, where });
      }
      for (const t of await evaluate(CONTRAST)) {
        if (t.unmeasured) { unpainted.set(t.sel, { ...t, where }); continue; }
        // Keyed by what is WRONG (this selector, this pair of colours) and
        // not by the sentence, so one bad rule reports once however many
        // species names it paints.
        const key = `${t.sel}|${t.color}|${t.bg}`;
        if (!dim.has(key) || dim.get(key).ratio > t.ratio) dim.set(key, { ...t, where });
      }
      for (const c of await evaluate(MEASURE)) {
        const key = `${c.tag}.${c.cls}#${c.id}|${c.w}x${c.h}`;
        if (!seen.has(key)) seen.set(key, { ...c, where });
      }
      for (const p of await evaluate(GAPS)) {
        const key = `${p.a}|${p.b}`;
        if (!pairs.has(key) || pairs.get(key).gap > p.gap) pairs.set(key, { ...p, where });
      }
    };
    // R122 — the founding picker, which needs an EMPTY browser to exist:
    // it is the screen a player sees before they have a save, so the
    // fixture that makes every other view reachable is exactly what hides
    // it. Cleared, measured, then the fixture is put back.
    const foundingPass = async () => {
      await evaluate(`localStorage.clear()`);
      await send('Page.navigate', { url });
      await sleep(2200);
      if (!await evaluate(`!document.querySelector('#overlay').hidden && !!document.querySelector('.founding')`)) {
        note('a fresh browser did not reach the founding picker, so nothing measured the first screen of the game');
      } else {
        await collect('founding');
        // It has to fit the phone as well as read on it: .overlay is
        // `position: fixed` and does not scroll, so a card taller than the
        // viewport does not go below the fold, it goes away.
        const spill = await evaluate(`(() => { const p = document.querySelector('.founding'); const b = p.getBoundingClientRect();
          return Math.round(Math.max(0, b.bottom - innerHeight) + Math.max(0, -b.top)); })()`);
        if (spill > 1) note(`founding: the picker overflows the viewport by ${spill}px, and a fixed overlay does not scroll`);
      }
      await evaluate(`localStorage.setItem('spliceworld_save', ${JSON.stringify(fixture)})`);
      await send('Page.navigate', { url });
      await sleep(2200);
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

    await foundingPass();
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

    // R122 — the readings are taken here but JUDGED at the end of the run,
    // because `collect` is called again further down: the keyboard walk opens
    // the move readout, which is a whole dialog no measurement had ever
    // reached. Reporting here read the maps before that view was in them.

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
          // R122 — the walk has opened this sheet since R80 and never
          // measured it. It is a dialog like any other: its card has to
          // paint its own ground and its words have to clear the floor.
          if (sheet.open && sheet.isMove) await collect('move-sheet');
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


    // ---- everything measured across every view, now that the walk is done -
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

    // ---- 1f. and every word of it can be read off the screen -------------
    const contrast = [...dim.values()].sort((a, b) => a.ratio - b.ratio);
    if (REPORT) {
      for (const t of contrast.slice(0, 30)) {
        console.log(`  ${String(t.ratio).padStart(7)}:1  ${t.where.padEnd(14)} ${t.sel}  "${t.txt}"  ${t.color} on ${t.bg}`);
      }
      console.log('');
    }
    for (const t of contrast.filter((x) => x.ratio < x.need)) {
      note(`${t.where}: ${t.sel} "${t.txt}" reads ${t.ratio}:1 against what is behind it, under the ${t.need}:1 floor (${t.color} on ${t.bg})`);
    }
    if (REPORT) {
      for (const c of cards.values()) {
        console.log(`  ${c.opaque ? 'opaque' : '  SEE-THROUGH'}  ${c.where.padEnd(14)} #${c.host} .${c.sel}  ${c.bg}`);
      }
      console.log('');
    }
    for (const c of seeThrough.values()) {
      note(`${c.where}: the #${c.host} card .${c.sel.split(/\s+/).join('.')} has no background of its own (${c.bg}), so it shows whatever is behind the dialog`);
    }
    for (const t of unpainted.values()) {
      console.log(`a11y ~  ${t.where}: ${t.sel} "${t.txt}" sits on a painted background, so its contrast is not a number this can read`);
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
  console.log(`a11y ✓  every control clears ${FLOOR}px and sits ${GUTTER}px from its neighbour · every word clears the contrast floor · every dialog card paints its own ground · focus visible · focus survives a repaint · wire live · nav current · both modals are dialogs · the game is playable from the keyboard`);
}

// R88 — only when RUN, not when imported. This module owns the one fixture
// recipe in the repo (a lab, three chimeras, every clock running), and any
// probe that wants it had to either duplicate it or accidentally run the
// whole gate to get it. I did the latter once by mistake this session.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
