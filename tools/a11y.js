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
import { readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
// R81 — the driver moved to its own module so tools/boot.js could use it too.
import { sleep, serve, findChrome, connect, CHROME_CANDIDATES } from './cdp.js';
// R115 — the boot-failure pass drives the future-save branch, which needs to
// know what "one version ahead" is. Read off the engine, never typed twice.
import { SAVE_VERSION } from '../save/save.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FLOOR = 40;          // px, both dimensions
// R113 - THE TYPE FLOOR. 12px is the smallest text this game is allowed to
// print, measured on the element that OWNS the sentence rather than on the
// stylesheet: a rule at 0.72rem is 11.52px only until something nests it
// inside a shrunken parent, and what a player squints at is the computed
// value. Rides the contrast walk, so it is checked on every screen, in every
// theme, at every save shape, for the cost of one extra field.
//
// Measured before it was written: 78 declarations in style.css under 12px,
// the worst of them `.mode-tag` at 8.32px. Flooring all 78 costs +15px on one
// screen (dex:foes) and breaks only the battle arena, which is the one screen
// that does not scroll - 7 failures, all there. See ROADMAP R113.
const TYPE_FLOOR = 12;     // px, the smallest computed font-size allowed
// R113 - the two things a phone does to a layout that a desktop headless
// browser never will: a reader who has turned their text up, and a cutout.
const TEXT_SCALE = 1.5;    // 150% text, the accessibility setting people use
const CUTOUT = 47;         // px, a notch the header has to clear
// R115 — `CEREMONY_MS` in splice/extract-ui.js is 2100. Waiting it out plus
// a margin is the whole trick: the results card does not exist until it ends.
const CEREMONY_WAIT = 3000;
const GUTTER = 6;          // px, between two adjacent controls
const RAG = 1;             // px, how far into its own line a full-width row may start
const BAND_TOP = 420;      // px, the wide end of the stylesheet's phone media query
// R104 — what a repaint is allowed to cost. Zero is not a stylistic choice:
// a tick that changed nothing has nothing to say, and every node it rewrites
// is a text selection lost, a scroll position dropped and a card's identity
// destroyed. The other three are budgets rather than zeroes because a screen
// legitimately keeps a shell, and the Dex legitimately draws SOME art.
const REPAINT_MUTATIONS = 0;
const LEFT_BEHIND = 50;
const DEX_FIRST_PAINT_KB = 100;
const VIEWPORT = 380;      // px, the reference phone width
const REPORT = process.argv.includes('--report');

// --- a save with something on every screen ----------------------------------
export async function fixtureSave() {
  // R90 — the laboratory itself comes from tools/fixtures.js, which
  // tools/handlers.js also builds from. The two gates had the same recipe
  // twice: same grade map, same socket-numbering loop, same herd, differing
  // by an id prefix. What stays here is what only THIS gate needs — the
  // feral twin for the Pens' alert, the understudy that gives the briefing a
  // choice, the three running clocks, the loose specimen, the raid.
  const { labCore } = await import('./fixtures.js');
  const now = Date.now();
  const { s, content } = await labCore({ now, prefix: 'a11y' });
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
    // R123 — a FOURTH, so the briefing has a choice to make. The suggestion
    // only appears when more creatures are fit than the team holds: with
    // exactly three there is nothing to choose, and a button that always
    // returns the same three is noise. Three chimeras is what this fixture
    // had, so the newest control in the game was unmeasurable on it.
    const spare = JSON.parse(JSON.stringify(s.chimeras[0]));
    spare.id = 'a11y-spare';
    spare.name = 'Understudy';
    spare.settleUntil = now - 1000;
    s.chimeras.push(spare);
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
  // R115 — A GESTATING VAT AND A BREEDABLE HERD, because two whole cards
  // were unreachable on this fixture and a rule with nothing to look at
  // passes. The vat's countdown (`vatRemainingMs`, and the second donor
  // picker behind it) and the breeding pen's two parent pickers had never
  // been rendered by any gate — not disabled, never drawn.
  //
  // Both are made by CALLING THE GAME rather than by hand-writing the state.
  // A vat's `conception` is sealed at the moment it starts so a reload
  // cannot reroll it; a fixture that forged one would be asserting against a
  // shape the game does not actually write, which is how a gate ends up
  // green on a save no player can have.
  {
    // The herd ships juvenile, and two consenting adults are what the pen
    // asks for. `growthHours.adult` is the threshold, so birth that far back.
    const { speciesOf: sp } = await import('../data/catalog.js');
    let adults = 0;
    for (const animal of s.ranch.stock) {
      if (adults >= 2) break;
      const hours = sp(content, animal.species)?.growthHours?.adult;
      if (!hours) continue;
      animal.birthAt = now - Math.round((hours + 1) * 3600000);
      adults += 1;
    }
    if (adults < 2) throw new Error(`the fixture could only age ${adults} animals to adulthood`);

    // …and a gestation running, started the way the Pens starts one.
    const { startVat } = await import('../splice/chaos.js');
    const settled = s.chimeras.filter((c) => c.settleUntil <= now);
    if (settled.length >= 2) {
      const started = startVat(s, settled[0].id, settled[1].id, content, now);
      if (!started.ok) throw new Error(`the fixture could not start a vat: ${started.msg}`);
      // Half-run, so the card shows a countdown rather than a decant.
      s.vat.startedAt = now - Math.round((s.vat.until - now) / 2);
    } else {
      throw new Error(`the fixture has ${settled.length} settled chimeras; a vat needs two`);
    }
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
  // R129 — EVERY lab beaten, not one, because the release is the newest
  // thing on this screen and a fixture that stops at one defeat would leave
  // it unmeasured. That is R99's lesson in one line: a rule with nothing to
  // look at passes. Finishing the ladder is also the honest board — the
  // release card, the wild specimens and their trait chips are what a player
  // who got this far actually opens the Labs tab onto.
  const { rivalList } = await import('../campaign/rivals.js');
  s.campaign.rivals = Object.fromEntries(
    rivalList(content).map((r) => [r.id, { defeats: 2, losses: 0, lastMetAt: now }])
  );
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
  const { duelBarks } = await import('../campaign/identity.js');
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
    if (!grounds) { out.push({ sel: name, txt: txt.replace(/\\s+/g, ' ').slice(0, 34), px, unmeasured: true }); continue; }
    // The worst ground it passes over: text that is legible on four stops of
    // five is text you cannot read a fifth of.
    let bg = grounds[0];
    let worst = Infinity;
    for (const g of grounds) { const n = ratio(over(fg, g), g); if (n < worst) { worst = n; bg = g; } }
    const large = px >= 24 || (px >= 18.66 && +cs.fontWeight >= 700);
    out.push({
      sel: name,
      txt: txt.replace(/\\s+/g, ' ').slice(0, 34),
      px,
      ratio: Math.round(worst * 100) / 100,
      need: large ? 3 : 4.5,
      color: cs.color,
      bg: 'rgb(' + [bg.r, bg.g, bg.b].map(Math.round).join(', ') + ')',
    });
  }
  return out;
})()`;

// R99 — WHAT THE WALK MUST HAVE ACTUALLY DRAWN.
//
// This whole milestone exists because coverage collapsed in silence: the
// fold walk stopped opening folds, `.feral-panel` stopped being rendered,
// and the contrast rule kept passing because it had nothing to look at. The
// run said "29 views" and that number went up over four milestones while the
// thing it was supposed to measure went dark.
//
// A count cannot catch that. A LIST can: these are states whose only proof
// of life is that something drew them, and a run that never reaches one has
// lost the reach rather than fixed the bug. Each is the deepest thing on its
// screen — the panel behind a fold, the tab behind a card, the board behind
// a battle — so between them they hold every kind of reach this gate has.
const LANDMARKS = {
  '.feral-panel': "the Pens' feral alert, behind a creature's fold",
  '.subtabs [data-pen-tab]': "the Pens' per-creature subtabs, which only exist inside an open card",
  '.subtabs [data-war-tab]': 'the War Room\'s tab bar, which the arena hides whenever a duel exists',
  '.dominion-card': 'the dominion banner, which needs a conquered county',
  '.encounter': 'an encounter row — an egg, a contest or a loose specimen',
};
const SAW = `(() => {
  const out = [];
  for (const sel of ${JSON.stringify(Object.keys(LANDMARKS))}) {
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      out.push(sel); break;
    }
  }
  return out;
})()`;

// R99 — AND DOES IT HOLD STILL WHEN ASKED TO? `prefers-reduced-motion` has
// been EMULATED in this file since R80 — purely to make a battle round
// resolve in one frame so the keyboard walk is quick — and nothing has ever
// asserted the result. The setting was a speed trick, not a measurement.
//
// Two halves, because neither alone is enough. This one reads the source:
// every selector that starts an animation or a transition must have an
// off-switch in a `prefers-reduced-motion` block. It catches the ten arena
// effects that only exist for four tenths of a second mid-fight, which no
// browser pass will ever have on screen when it looks.
const motionSwitches = () => {
  const css = readFileSync(join(root, 'style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const uncovered = [];
  // Everything a reduced-motion block turns off, by property.
  const off = { animation: new Set(), transition: new Set() };
  for (const m of css.matchAll(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/g)) {
    // Walk braces from the block's opening one so a nested rule ends where it
    // really ends rather than at the first `}` in the file.
    let depth = 0, i = m.index + m[0].length - 1, start = i + 1;
    for (; i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}' && --depth === 0) break;
    }
    for (const rule of css.slice(start, i).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      for (const prop of ['animation', 'transition']) {
        if (!new RegExp(`\\b${prop}\\s*:\\s*none`).test(rule[2])) continue;
        for (const sel of rule[1].split(',')) off[prop].add(sel.trim());
      }
    }
  }
  // Everything that MOVES, outside those blocks.
  const outside = css.replace(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\n\}/g, '')
    .replace(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^{}]*\{[^{}]*\}[^{}]*\}/g, '');
  for (const rule of outside.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sels = rule[1].split(',').map((x) => x.trim()).filter(Boolean);
    if (!sels.length || sels.some((x) => x.startsWith('@') || x.includes('%'))) continue;
    for (const [prop, re] of [['animation', /\banimation\s*:\s*([^;]+)/], ['transition', /\btransition\s*:\s*([^;]+)/]]) {
      const d = rule[2].match(re);
      if (!d || /^\s*none\b/.test(d[1])) continue;
      // A zero-duration transition does not move anything.
      if (prop === 'transition' && !/[0-9.]+m?s/.test(d[1])) continue;
      if (/\b0s\b/.test(d[1]) && !/[1-9][0-9.]*m?s/.test(d[1])) continue;
      for (const sel of sels) {
        if (off[prop].has(sel)) continue;
        uncovered.push({ sel, prop, value: d[1].trim().slice(0, 44) });
      }
    }
  }
  return uncovered;
};

// The other half, in the browser: with the media query on, nothing that is
// ACTUALLY ON SCREEN may still be moving. A source rule cannot see a duration
// that arrives from a variable, an inline style, or a selector nobody thought
// to grep for.
const STILL = `(() => {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const dur = (v) => Math.max(0, ...String(v).split(',').map((x) => parseFloat(x) || 0));
    const anim = cs.animationName !== 'none' && dur(cs.animationDuration) > 0;
    const trans = dur(cs.transitionDuration) > 0;
    if (!anim && !trans) continue;
    out.push({
      sel: el.tagName.toLowerCase()
        + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/).join('.') : ''),
      what: anim ? 'animation ' + cs.animationName + ' ' + cs.animationDuration
        : 'transition ' + cs.transitionProperty + ' ' + cs.transitionDuration,
    });
  }
  return out;
})()`;

// R99 — DOES IT STAY IN ITS CARD, AND ON THE PHONE?
//
// R86 shipped the egg's Hurry button inside `.encounter`, a flex line
// already holding a portrait, two lines of lineage and a countdown. The
// button ran 110px past the card and 98px past the viewport at 380px, and
// this gate passed it: a control that escapes its card still reports a
// full-size rect, so the 40px floor and the 6px gutter are both satisfied
// by a button half of which is off the screen. It was found by screenshot.
//
// Measured against the CARD rather than the viewport alone, because those
// are two different failures and only one of them is visible on a wide
// phone: a button that leaves its card but lands inside the window looks
// merely wrong, and the same button on a narrower device is gone.
//
// An ancestor that scrolls sideways is exempt by construction — a wide table
// inside `overflow-x: auto` is the fix for this problem, not an instance of
// it — and so is `overflow: hidden`, where the layout box overhangs but the
// paint does not.
const CONTAINED = `(() => {
  const SEL = 'button, a[href], input:not([type="hidden"]), select, textarea, summary,'
    + ' label[for], [tabindex]:not([tabindex="-1"]), [role="button"]';
  const out = [];
  const named = (el) => el.tagName.toLowerCase()
    + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/).join('.') : '');
  const owns = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const pool = new Set(document.querySelectorAll(SEL));
  for (const el of document.querySelectorAll('.card *')) if (owns(el)) pool.add(el);
  for (const el of pool) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue;
    const card = el.closest('.card');
    if (!card || card === el) continue;
    // Anything between here and the card that scrolls or clips sideways
    // makes an overhanging layout box legitimate.
    let scrolls = false;
    for (let n = el.parentElement; n && n !== card.parentElement; n = n.parentElement) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') { scrolls = true; break; }
    }
    if (scrolls) continue;
    const c = card.getBoundingClientRect();
    const right = Math.round(r.right - c.right);
    const left = Math.round(c.left - r.left);
    const past = Math.round(r.right - document.documentElement.clientWidth);
    if (right > 1 || left > 1 || past > 1) {
      out.push({ sel: named(el), card: named(card),
        label: (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 30),
        right: Math.max(0, right), left: Math.max(0, left), past: Math.max(0, past) });
    }
  }
  return out;
})()`;

// R99 — AND DOES IT SIT ON TOP OF ANOTHER CONTROL? R80 measured the GAP
// between two controls, which is a number that only means anything once they
// are apart: a negative gap is an overlap, and the pair rule reported the
// distance as though it were still a separation.
//
// Nesting is not overlap (a button inside its label is one target), and a
// modal covers the page on purpose, so while one is up only its own controls
// are compared — the same rule GAPS uses, for the same reason.
const OVERLAPS = `(() => {
  const SEL = 'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]),'
    + ' select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
  const modal = [...document.querySelectorAll('#overlay, #picker')].find((m) => m && !m.hidden);
  const root = modal || document;
  const named = (el) => el.tagName.toLowerCase()
    + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/).join('.') : '');
  const els = [...root.querySelectorAll(SEL)].filter((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width && r.height && cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity !== 0;
  });
  const out = [];
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
    const a = els[i], b = els[j];
    if (a.contains(b) || b.contains(a)) continue;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
    const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (ox > 1 && oy > 1) {
      out.push({ a: named(a), b: named(b), ox: Math.round(ox), oy: Math.round(oy),
        la: (a.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 22),
        lb: (b.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 22) });
    }
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

// R124 — A BOX THAT FILLS ITS LINE USES ALL OF IT.
//
// Reported from a phone: the briefing's roster rows had a ragged left edge,
// one row's tick 70px further in than the row above it. The cause is R73's
// global `button { justify-content: center }`, which exists so a
// shrink-wrapped label sits in the middle of its 40px target — and which
// centres a FULL-WIDTH row too, so its content slides by half of whatever
// slack that row's own text happens to leave. Change the text, move the
// tick. This rule has now leaked three times: R122 fixed it on `.lab-pick`,
// R124 on `.toggle-row`, and nothing in this file could see either.
//
// It is stated as the DEFECT and not as the cause. Checking for
// `justify-content: center` reads intent and gets it wrong both ways: the
// fold heads on every screen are centred full-width rows whose middle child
// takes `flex: 1`, so there is no slack to distribute and they start at +0,
// while a stray margin or an auto-margined first child would drift exactly
// the same way with `justify-content` perfectly innocent. So the question
// asked is the one a player can see — how far in does the first thing on
// this row begin — and the answer for a row that fills its line is zero.
//
// Only boxes that FILL their parent's content box: a shrink-wrapped control
// centres its label on purpose, and that is the rule working. Only boxes with
// more than one child, because a single centred child is a button.
//
// The column half below is the same sentence turned ninety degrees, and it
// is the half that had to be written differently — see the comment on it.
const RAGGED = `(() => {
  const out = [];
  const sig = (el) => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/).join('.') : '');
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display !== 'flex' && cs.display !== 'inline-flex') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const p = el.parentElement;
    if (!p) continue;
    const pcs = getComputedStyle(p);
    // clientWidth, not the bounding rect: the rect includes the parent's
    // border, and a 1px border each side is enough to make a row that fills
    // its line look 2px short of filling it.
    const inner = p.clientWidth - parseFloat(pcs.paddingLeft) - parseFloat(pcs.paddingRight);
    if (inner < 2 || r.width < inner - 1) continue;
    const kids = [...el.children].filter((c) => { const b = c.getBoundingClientRect(); return b.width > 0 || b.height > 0; });
    if (kids.length < 2) continue;
    const txt = (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 30);
    if (cs.flexDirection.startsWith('column')) {
      // The COLUMN half, and the one rule here read off the stylesheet
      // rather than off the pixels. In a column the cross axis is
      // horizontal, so any align-items but stretch shrink-wraps every child
      // to its own content and the card ends wherever its longest sentence
      // does. Whether that SHOWS depends entirely on whether today's text
      // happens to be longer than the line — which is luck, and on a real
      // save the luck ran out: two ranch cards of identical width ended
      // about 70px apart because one animal's name is shorter than the
      // other's.
      // A measurement would have called that green on this fixture.
      //
      // A child that sets its own 'align-self' has opted out and is not
      // evidence either way; a column where EVERY child has is a column
      // whose align-items decides nothing.
      const optedOut = kids.every((c) => { const a = getComputedStyle(c).alignSelf; return a && a !== 'auto' && a !== cs.alignItems; });
      if (!/stretch|normal/.test(cs.alignItems) && !optedOut) {
        out.push({ kind: 'column', sel: sig(el), n: 0, w: Math.round(r.width), how: cs.alignItems, txt });
      }
      continue;
    }
    const edge = r.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
    const start = Math.round(kids[0].getBoundingClientRect().left - edge);
    if (start > RAG_PX) {
      out.push({ kind: 'row', sel: sig(el), n: start, w: Math.round(r.width), how: cs.justifyContent, txt });
    }
  }
  return out;
})()`.replace('RAG_PX', String(RAG));

// R99 — THIS LINE MEASURED ALMOST NOTHING, AND SAID SO IN THE PASSING TENSE.
//
// `[...querySelectorAll('[data-fold]')].forEach((b) => b.click())` looks like
// "open everything". It is not, for two reasons that compound:
//
//   1. A fold's click handler calls `rerender()`, which reassigns the
//      screen's `innerHTML`. Every button in the captured list except the
//      first is detached by the time its turn comes, so those clicks land on
//      orphans and do nothing.
//   2. R89 gave the Pens (and R98 the Ranch) an EXCLUSIVE group: opening one
//      creature shuts the others. "Open everything" is a contradiction on
//      those screens even when the clicks land — at most one can be open.
//
// Measured on the Pens: five folds, and this left TWO open, neither of them
// the feral one. So `.feral-panel` — the panel R85 built and R122 fixed the
// contrast on — was never drawn while the gate was looking, and its 3.42:1
// body text passed every run. The contrast rule was right the whole time and
// had nothing to look at.
//
// A fold is therefore opened one at a time, re-queried after each rerender,
// and MEASURED IN ITS OWN PASS. `<details>` still opens in bulk because it
// has no handler and no group.
const OPEN_DETAILS = `[...document.querySelectorAll('details')].forEach((d) => { d.open = true; });`;

// The ids of the folds on the screen that is currently showing.
const FOLD_IDS = (screen) => `[...document.querySelectorAll('#screen-${screen} button[data-fold]')]`
  + `.map((b) => b.dataset.fold)`;

// Every subtab bar on the visible screen, by its attribute. The Dex's five
// were walked by name; the Pens' four and the War Room's five were not, and
// `ui/tabs.js` builds all three from one helper — so ask the DOM which
// `data-*-tab` attributes are actually present rather than naming them (R61).
const SUBTAB_ATTRS = (screen) => `(() => {
  const out = new Set();
  for (const el of document.querySelectorAll('#screen-${screen} button')) {
    for (const k of Object.keys(el.dataset)) if (/Tab$/.test(k)) out.add(k);
  }
  return [...out];
})()`;

async function main() {
  const chrome = findChrome();
  if (!chrome) {
    console.error('a11y: no Chromium found. Set CHROME=/path/to/chrome and re-run.');
    console.error('       (searched: ' + CHROME_CANDIDATES.join(', ') + ')');
    process.exit(2);
  }
  const { server, port } = await serve();
  const profile = await mkdtemp(join(tmpdir(), 'spliceworld-a11y-'));
  // R132 — see the note in tools/height.js: a parallel battery assigns ports.
  const cdpPort = Number(process.env.SW_CDP_PORT) || 9500 + Math.floor(process.pid % 400);
  const proc = spawn(chrome, [
    '--headless=new', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profile}`,
    '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', 'about:blank',
  ], { stdio: 'ignore' });

  const problems = [];
  const note = (msg) => problems.push(msg);
  let cdp;
  let snap = null;
  try {
    cdp = await connect(cdpPort);
    const { evaluate, errors } = cdp;
    // R115 — SNAPSHOT BEFORE EVERY NAVIGATION, because precise coverage lives
    // in the isolate and a reload throws away what the previous document ran.
    // One `takePreciseCoverage` at the end reports the LAST page load and
    // nothing else, and this walk reloads a dozen times — the founding pass,
    // the briefing pass and both save shapes each start with one. Every
    // snapshot is written as its own file and the merge takes the max, which
    // is the same thing it already does across the suite's processes.
    let covSnaps = 0;
    const snapCoverage = async () => {
      try {
        const cov = await cdp.send('Profiler.takePreciseCoverage');
        const origin = `http://127.0.0.1:${port}/`;
        const result = (cov.result?.result ?? [])
          .filter((r) => r.url.startsWith(origin))
          .map((r) => ({ ...r, url: `file://${join(root, r.url.slice(origin.length).split('?')[0])}` }));
        if (!result.length) return;
        writeFileSync(join(process.env.SW_COVERAGE, `coverage-a11y-${process.pid}-${covSnaps++}.json`),
          JSON.stringify({ result }));
      } catch { /* the page is between documents; the next snapshot catches it */ }
    };
    snap = snapCoverage;
    const send = process.env.SW_COVERAGE
      ? async (method, params) => {
        if (method === 'Page.navigate') await snapCoverage();
        return cdp.send(method, params);
      }
      : cdp.send;
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Network.enable');
    // R115 — AND THE ONLY PLACE THE SHIPPED SCREENS ACTUALLY RUN. Six modules
    // — `main.js`, the founding picker, the focus keeper, the sky, `sw.js` —
    // are never loaded by anything in Node, so a coverage merge taken from the
    // suite alone reports them as wholly dead and can say nothing about them.
    // This walk opens every screen on three saves; it is the browser half of
    // the merge, and it costs one CDP call at each end. Off unless asked.
    if (process.env.SW_COVERAGE) {
      await send('Profiler.enable');
      await send('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
    }
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
    const small = new Map();
    const unpainted = new Map();
    const seeThrough = new Map();
    const cards = new Map();
    const lists = new Map();
    const spills = new Map();
    const stacked = new Map();
    const saw = new Map();
    const views = new Set();
    const collect = async (where) => {
      views.add(where);
      for (const g of await evaluate(RAGGED)) {
        // Keyed by the rule that would fix it and not by the view, so one
        // leaked selector reports once however many screens render it.
        if (!lists.has(g.sel) || lists.get(g.sel).n < g.n) lists.set(g.sel, { ...g, where });
      }
      for (const sel of await evaluate(SAW)) if (!saw.has(sel)) saw.set(sel, where);
      for (const o of await evaluate(CONTAINED)) {
        // Keyed by the element, and the WORST spill wins: one rule leaks the
        // same button on every screen that draws it.
        const key = `${o.card}|${o.sel}|${o.label}`;
        const worst = Math.max(o.right, o.left, o.past);
        if (!spills.has(key) || spills.get(key).worst < worst) spills.set(key, { ...o, worst, where });
      }
      for (const o of await evaluate(OVERLAPS)) {
        const key = `${o.a}|${o.b}`;
        const area = o.ox * o.oy;
        if (!stacked.has(key) || stacked.get(key).area < area) stacked.set(key, { ...o, area, where });
      }
      for (const c of await evaluate(MODAL_CARDS)) {
        cards.set(`${c.host}|${c.sel}`, { ...c, where });
        if (!c.opaque) seeThrough.set(`${c.host}|${c.sel}`, { ...c, where });
      }
      for (const t of await evaluate(CONTRAST)) {
        // R113 - the type floor is judged on EVERY text node the walk sees,
        // including the ones whose contrast cannot be read off a painted
        // background. Being on a gradient is a reason not to know the ratio;
        // it is not a reason to be allowed to print 9px.
        if (t.px < TYPE_FLOOR) {
          const key = `${t.sel}|${t.px}`;
          if (!small.has(key)) small.set(key, { ...t, where });
        }
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
    // R99 — WALK THE SUBTABS THE SCREEN ACTUALLY HAS. This asked for
    // `data-dex-tab` by name, so the Dex's five tabs were measured and the
    // Pens' four and the War Room's five never were. All three come out of
    // `ui/tabs.js`'s one helper, so the DOM is asked which bars exist.
    const subtabPass = async (s, where) => {
      for (const attr of await evaluate(SUBTAB_ATTRS(s))) {
        const dash = attr.replace(/([A-Z])/g, '-$1').toLowerCase();
        const ids = await evaluate(`[...document.querySelectorAll('#screen-${s} button[data-${dash}]')]`
          + `.map((b) => b.dataset.${attr})`);
        for (const id of ids ?? []) {
          await evaluate(`document.querySelector('#screen-${s} button[data-${dash}="${id}"]')?.click()`);
          await sleep(320);
          await collect(`${where}/${id}`);
        }
      }
    };

    // R99 — ONE FOLD AT A TIME, RE-QUERIED. See OPEN_DETAILS above for why
    // the bulk version measured almost nothing. Each creature card carries
    // DIFFERENT alerts — the feral panel, the settling clock, the Infirmary
    // window — so every fold earns its own pass; the subtabs inside a card
    // are walked on the first card that has them, because R89 partitions one
    // template into all four and a second creature's Anatomy tab is the same
    // markup with different nouns.
    const foldPass = async (s, where = s) => {
      const ids = await evaluate(FOLD_IDS(s));
      let walkedSubtabs = false;
      for (const id of ids ?? []) {
        const opened = await evaluate(`(() => {
          const b = document.querySelector('#screen-${s} button[data-fold="${id}"]');
          if (!b) return false;
          if (b.getAttribute('aria-expanded') !== 'true') b.click();
          return true;
        })()`);
        if (!opened) continue;      // a rerender can retire a fold mid-walk
        await sleep(380);
        await evaluate(OPEN_DETAILS);
        await collect(`${where}#${id}`);
        if (!walkedSubtabs && (await evaluate(SUBTAB_ATTRS(s))).length) {
          await subtabPass(s, `${where}#${id}`);
          walkedSubtabs = true;
        }
      }
      return (ids ?? []).length;
    };

    // R122 — the founding picker, which needs an EMPTY browser to exist:
    // it is the screen a player sees before they have a save, so the
    // fixture that makes every other view reachable is exactly what hides
    // it. Cleared, measured, then the fixture is put back.
    const foundingPass = async () => {
      // R100 — AND THE BACKUP, or this is no longer an empty browser. Clearing
      // localStorage alone used to mean "new player"; since the durable save
      // it means "evicted player", and `loadSlot` correctly restores the
      // campaign from IndexedDB instead of showing the founding picker. This
      // gate went red on exactly that, which is the recovery path working.
      //
      // Both stores is also what a person means by "clear site data" — a
      // browser clears an origin's storage together — so this is the real
      // fresh-browser state rather than a convenience for the test.
      await evaluate(`(async () => {
        localStorage.clear();
        await new Promise((r) => { const q = indexedDB.deleteDatabase('spliceworld'); q.onsuccess = r; q.onerror = r; q.onblocked = r; });
      })()`);
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

    // R88 — THE BRIEFING WITH AN OFFER ON IT. "Send them without me" only
    // appears when the forecast calls the fight a walkover AND a team is
    // picked, and the fixture ships a duel already in progress so the arena
    // walk can reach it — which means the screen-by-screen walk lands in the
    // arena and never sees a briefing at all. R122's lesson exactly: the
    // newest control in the game was the one nothing measured. So the
    // fixture is written once more with no battle, the War Room is walked to
    // an offer, and the real fixture is put back.
    const briefingPass = async () => {
      const noFight = JSON.parse(fixture);
      noFight.battle = null;
      await evaluate(`localStorage.setItem('spliceworld_save', ${JSON.stringify(JSON.stringify(noFight))})`);
      await send('Page.navigate', { url });
      await sleep(2200);
      await evaluate(`document.querySelector('#tabs button[data-screen="battle"]').click()`);
      await sleep(700);
      // R99 — AND THE WAR ROOM ITSELF, which no run had ever drawn. The
      // fixture ships a duel in progress so the arena can be measured, and
      // `#screen-battle` renders the arena whenever one exists — so the map,
      // the jobs board, the Labs board, the bays and the wire, five tabs and
      // the biggest screen in the game, were never rendered while any gate
      // was looking. This is the one moment in the run when that screen is
      // the War Room, so it is walked here.
      await collect('warroom');
      await subtabPass('battle', 'warroom');
      await foldPass('battle', 'warroom');
      await evaluate(`document.querySelector('#screen-battle button[data-war-tab="map"]')?.click()`);
      await sleep(500);
      const opened = await evaluate(`(() => {
        const b = [...document.querySelectorAll('#screen-battle button')]
          .find((x) => /^\\s*(Spar|Assault)\\b/.test(x.textContent) && !x.disabled);
        if (!b) return false; b.click(); return true;
      })()`);
      if (!opened) {
        note('the War Room offered no target, so the briefing screen was never measured');
      } else {
        await sleep(600);
        // A briefing forecasts nothing until somebody is picked, and the
        // offer needs the forecast.
        for (let i = 0; i < 3; i++) {
          await evaluate(`(() => { const r = [...document.querySelectorAll('button[data-toggle]')].filter((b) => !b.disabled)[${i}]; if (r) r.click(); })()`);
          await sleep(450);
        }
        // R123 — press the suggestion, so the answer and its reason are
        // measured too. It rewrites the roster's ticks, which is a render:
        // the control that made it has to survive its own effect.
        if (await evaluate(`(() => { const b = document.querySelector('#wr-suggest'); if (!b) return false; b.click(); return true; })()`)) {
          await sleep(700);
          await collect('briefing/suggested');
          if (!await evaluate(`!!document.querySelector('.suggest-why')`)) {
            note('pressing the suggestion leaves no reason on the screen, so it picks without teaching');
          }
        } else {
          note('the briefing offers no suggestion, so R123 is unmeasured');
        }
        await collect('briefing');
        if (!await evaluate(`!!document.querySelector('#wr-send')`)) {
          note("a briefing the forecast calls a walkover does not offer 'Send them', so R88's control is unmeasured");
        }
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
    // R113 - AND IT SAYS WHAT THE COLUMN IS MADE OF. A failure that reports
    // "clips 14px" tells you the size of the problem and nothing about where
    // to take the 14px from; three separate fixes were aimed at this message
    // by guesswork and all three were no-ops. The breakdown is the diagnosis:
    // the chrome above and below, then every child of the arena with the
    // height it actually took.
    const arenaFits = async (where) => {
      const over = await evaluate(`(() => {
        if (!document.body.classList.contains('in-battle')) return null;
        const out = [];
        for (const sel of ['main', '#screen-battle', '.arena', '.cmd']) {
          const el = document.querySelector(sel);
          if (!el) continue;
          const spill = el.scrollHeight - el.clientHeight;
          if (spill > 1) {
            let why = '';
            if (sel === '.arena') {
              const kids = [...el.children].map((k) => (k.className || k.tagName).toString().trim().split(/\\s+/)[0]
                + ' ' + Math.round(k.getBoundingClientRect().height)).join(', ');
              const box = (q) => { const n = document.querySelector(q); return n ? Math.round(n.getBoundingClientRect().height) : 0; };
              why = ' [' + innerHeight + 'dvh = header ' + box('header') + ' + footer ' + box('footer')
                + ' + main ' + box('main') + '; column: ' + kids + ']';
            }
            out.push(sel + ' clips ' + Math.round(spill) + 'px of its own content' + why);
          }
        }
        return out;
      })()`);
      if (over === null) note(`${where}: the War Room did not enter battle mode, so nothing checked that the arena fits`);
      else for (const x of over) note(`${where}: the arena does not scroll, and ${x}`);
    };

    // ---- 1i. R113 - AND THE HEADER CLEARS A CUTOUT -----------------------
    //
    //      `viewport-fit=cover` lets the page paint under a notch; the insets
    //      are what stop it painting the GAME there. A headless desktop
    //      browser has no notch, so style.css reads each inset as
    //      `var(--safe-*, env(safe-area-inset-*))` - the env is what ships,
    //      the variable is what this sets. Asking whether the rule exists in
    //      the source would pass on a rule that resolves to nothing.
    {
      await evaluate(`document.documentElement.style.setProperty('--safe-top', '${CUTOUT}px')`);
      await sleep(300);
      const clears = await evaluate(`(() => {
        const header = document.querySelector('header');
        if (!header) return null;
        const cs = getComputedStyle(header);
        const box = header.getBoundingClientRect();
        // The header's CONTENT box, not its first child: the settings gear is
        // absolutely positioned at the top of the header and reports a rect
        // top of 0 whatever the padding does, which is a true fact about a
        // decoration and a useless one about the layout.
        const content = box.top + parseFloat(cs.paddingTop);
        // …and the in-flow children, which is what a player reads.
        const flowed = [...header.children]
          .filter((el) => getComputedStyle(el).position !== 'absolute')
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.height > 0);
        return {
          pad: parseFloat(cs.paddingTop),
          content: Math.round(content),
          first: flowed.length ? Math.round(Math.min(...flowed.map((r) => r.top))) : null,
        };
      })()`);
      if (!clears) note('there is no header, so nothing checked that it clears a cutout');
      else if (clears.content < CUTOUT) {
        note(`with a ${CUTOUT}px cutout the header's content box starts at ${clears.content}px, under the notch`
          + ` (padding-top resolved to ${clears.pad}px)`);
      } else if (clears.first !== null && clears.first < CUTOUT) {
        note(`with a ${CUTOUT}px cutout the header pads correctly but its first line still starts at ${clears.first}px`);
      }
      await evaluate(`document.documentElement.style.removeProperty('--safe-top')`);
      await sleep(200);
    }

    // R99 — the source half of the reduced-motion rule. No browser needed:
    // it asks whether every moving thing HAS an off-switch, which is the only
    // form of the question that can reach the ten arena effects that exist
    // for four tenths of a second in the middle of a fight.
    for (const m of motionSwitches()) {
      note(`style.css: \`${m.sel}\` sets ${m.prop}: ${m.value} and no `
        + '`prefers-reduced-motion: reduce` block turns it off — a player who asked their OS to stop'
        + ' moving things still gets this one');
    }

    // R115 — THE GRADUATION CEREMONY, PLAYED. `runExtraction` is reached by
    //      every gate that fires handlers; the three functions BEHIND it are
    //      reached by none. `tools/handlers.js` hands every screen an
    //      `onExtract` stub, which is the only honest thing it can do from
    //      Node — the ceremony is a lazy import, an overlay, a 2.1-second
    //      animation and a second card — so the first ceremony a new player
    //      sees had never run anywhere. 66 of this module's lines, measured.
    //
    //      It is also a screen, so it is COLLECTED as one: two cards with
    //      controls on them that no floor, gutter or contrast rule had ever
    //      been applied to.
    const ceremonyPass = async () => {
      await evaluate(`document.querySelector('#tabs button[data-screen="ranch"]')?.click()`);
      await sleep(600);
      // AN ANIMAL CARD HAS TO BE OPENED FIRST, and only one can be: R89 made
      // the roster's folds exclusive because nine open cards are 16,657px of
      // screen, and a shut card does not populate its body at all. The first
      // draft of this pass queried for the button on arrival, found zero —
      // not disabled, ABSENT — and reported that the Ranch had nobody to
      // graduate. It had eight, all of them shut.
      const folds = await evaluate(`[...document.querySelectorAll('#screen-ranch .fold-head[data-fold^="ranch-"]')].map((b) => b.dataset.fold)`);
      if (!folds.length) { note('the Ranch drew no animal cards, so the ceremony was never measured'); return; }
      let opened = false;
      for (const id of folds) {
        await evaluate(`document.querySelector('#screen-ranch .fold-head[data-fold="${id}"]')?.click()`);
        await sleep(450);
        // A full vault disables the button and says so in its own label, which
        // is R161's rule. That is a different screen; walk on to the next
        // animal rather than pressing a control the game has refused.
        opened = await evaluate(`(() => {
          const b = document.querySelector('#screen-ranch button.extract-btn:not([disabled])');
          if (!b) return false; b.click(); return true;
        })()`);
        if (opened) break;
      }
      if (!opened) {
        note(`no animal on the Ranch could be graduated (${folds.length} tried), so the ceremony was never measured`);
        return;
      }
      await sleep(900);
      if (!await evaluate(`!!document.querySelector('#overlay #grad-go')`)) {
        note('pressing Graduate did not open the ceremony, so nothing behind it ran');
        return;
      }
      await collect('ceremony/confirm');
      await evaluate(`document.querySelector('#overlay #grad-go').click()`);
      // The animation is presentation-only and 2.1s of it; the results card
      // is what the next assertion needs, so this waits it out rather than
      // racing it.
      await sleep(CEREMONY_WAIT);
      // A refusal is a different card with a different button. It is a real
      // screen too, and it is NOT the one this pass exists to reach, so say
      // so rather than reporting a ceremony that never played.
      if (await evaluate(`!!document.querySelector('#overlay #grad-back')`)) {
        note('the graduation was refused, so the ceremony and its results never played');
        await evaluate(`document.querySelector('#overlay #grad-back').click()`);
        return;
      }
      if (!await evaluate(`!!document.querySelector('#overlay #grad-done')`)) {
        note('the ceremony never reached its results card');
        return;
      }
      await collect('ceremony/results');
      await evaluate(`document.querySelector('#overlay #grad-done').click()`);
      await sleep(600);
      if (!await evaluate(`document.querySelector('#overlay').hidden`)) {
        note('collecting the essence left the ceremony overlay on screen');
      }
      // Put the fixture back: a graduation spends an animal and writes a save.
      await evaluate(`localStorage.setItem('spliceworld_save', ${JSON.stringify(fixture)})`);
      await send('Page.navigate', { url });
      await sleep(2200);
    };

    await foundingPass();
    await ceremonyPass();
    await briefingPass();
    await collect('shell');
    const screens = await evaluate(`[...document.querySelectorAll('#tabs button')].map((b) => b.dataset.screen)`);
    for (const s of screens) {
      await evaluate(`document.querySelector('#tabs button[data-screen="${s}"]').click()`);
      await sleep(600);
      await evaluate(OPEN_DETAILS);
      await sleep(400);
      await collect(s);
      if (s === 'battle') await arenaFits('battle');
      await subtabPass(s, s);
      await foldPass(s);
    }
    // ---- 1a2. R104 — WHAT DOES A REPAINT COST? Four numbers, one loop.
    //
    // The shell rebuilds the active screen from a string every 30 seconds
    // and after every tap, whether or not anything moved, and a hidden
    // screen keeps its DOM for the rest of the session. None of that is
    // visible to any rule the gate had: every screen looked right, and the
    // cost of keeping it right was unmeasured.
    //
    // Measured HERE rather than in a gate of its own because the browser is
    // already open on a save with something on every screen, which is the
    // expensive half of the question.
    const repaintPass = async () => {
      // (i) A TICK THAT CHANGES NOTHING MUST TOUCH NOTHING. The clock is not
      // pinned in this gate, so a second tick inside the same wall-clock
      // second is the honest form of "nothing moved": the save advances by
      // no elapsed time it can act on.
      await evaluate(`document.querySelector('#tabs button[data-screen="ranch"]').click()`);
      await sleep(500);
      const muts = Number(await evaluate(`(() => {
        let n = 0;
        const obs = new MutationObserver((rs) => {
          for (const r of rs) n += 1 + r.addedNodes.length + r.removedNodes.length;
        });
        obs.observe(document.querySelector('#screen-ranch'), {
          childList: true, subtree: true, attributes: true, characterData: true });
        document.dispatchEvent(new Event('visibilitychange'));
        return new Promise((res) => setTimeout(() => { obs.disconnect(); res(n); }, 350));
      })()`));
      if (muts > REPAINT_MUTATIONS) {
        note(`a tick that changed nothing rewrote ${muts} nodes on the Ranch (budget ${REPAINT_MUTATIONS})`
          + ' — the shell repaints on a timer rather than on a change');
      }

      // (ii) A TAP ON ONE CARD IS NOT A REASON TO REBUILD THE OTHERS. Node
      // identity, not HTML equality: a card rebuilt to the same string still
      // loses its selection, its scroll position and its focus.
      await evaluate(`document.querySelector('#tabs button[data-screen="pens"]').click()`);
      await sleep(600);
      // Held as REFERENCES, never as a marker attribute. Stamping the cards
      // with `data-r104` to find them afterwards is the same trap the fix
      // itself had to design around: the attribute lands in `outerHTML`, so
      // every stamped card differs from its freshly built markup and the
      // keyed paint replaces all of them. The gate then measures the damage
      // it did itself and reports the fix does not work.
      const identity = JSON.parse(await evaluate(`(() => {
        const r = document.querySelector('#screen-pens');
        window.__r104 = [...r.querySelectorAll('[data-fold]')]
          .map((b) => b.closest('section, article, div')).filter(Boolean);
        // The tapped card is SUPPOSED to be rebuilt - it is the one whose
        // markup changed. The rule is about the others.
        const tapped = r.querySelector('[data-fold]')?.closest('section, article, div');
        window.__r104 = window.__r104.filter((el) => el !== tapped);
        const before = window.__r104.length;
        r.querySelector('[data-fold]')?.click();
        return new Promise((res) => setTimeout(() => res(JSON.stringify({
          before, after: window.__r104.filter((el) => document.contains(el)).length,
        })), 450));
      })()`));
      if (identity.before > 1 && identity.after < identity.before) {
        note(`opening one pen destroyed ${identity.before - identity.after} of the ${identity.before} cards it did NOT touch`
          + ' — every card is rebuilt because one of them changed');
      }

      // (iii) A SCREEN YOU HAVE LEFT COSTS NOTHING. Every later style
      // recalculation walks what is still in the document, hidden or not.
      const leftBehind = [];
      for (const s of screens) {
        await evaluate(`document.querySelector('#tabs button[data-screen="${s}"]').click()`);
        await sleep(450);
        await evaluate(OPEN_DETAILS);
        await sleep(250);
        await evaluate(`document.querySelector('#tabs button[data-screen="ranch"]').click()`);
        await sleep(450);
        const left = Number(await evaluate(`document.querySelector('#screen-${s}')?.querySelectorAll('*').length ?? 0`));
        if (s !== 'ranch') leftBehind.push(left);
        if (s !== 'ranch' && left > LEFT_BEHIND) {
          note(`leaving ${s} left ${left} nodes in the document (budget ${LEFT_BEHIND})`);
        }
      }

      // (iv) THE FIRST PAINT OF A SCREEN IS WHAT THE PLAYER WAITS FOR. The
      // Dex is the one screen whose weight is art rather than text, so it is
      // the one that has to earn what it draws before it is looked at.
      await evaluate(`document.querySelector('#tabs button[data-screen="dex"]').click()`);
      // …ON THE TAB A PLAYER LANDS ON. The walk above visits every Dex
      // subtab and leaves the screen on the LAST one, so measuring here
      // without saying which view is meant measures whichever tab the
      // previous rule happened to finish on — which is how this clause went
      // green twice while the screen it names paints 274 KB.
      await sleep(250);
      await evaluate(`document.querySelector('#screen-dex #dex-subtabs button')?.click()`);
      // R159's rule, and this gate broke it on its first run: a 700ms sleep
      // measured the Dex mid-load — it is a LAZY screen, so what was on the
      // glass was still "Warming up the lab…" and the rule went green at
      // 1 KB against a screen that actually paints 274. Wait for the page.
      let dexKb = 0;
      for (let i = 0; i < 25; i++) {
        await sleep(200);
        const now = Number(await evaluate(
          `Math.round((document.querySelector('#screen-dex')?.innerHTML.length ?? 0) / 1024)`));
        if (now > 0 && now === dexKb) break;
        dexKb = now;
      }
      if (!dexKb) {
        note('the Dex never painted, so nothing measured what its first paint costs');
      } else if (dexKb > DEX_FIRST_PAINT_KB) {
        note(`the Dex paints ${dexKb} KB before the player has scrolled (budget ${DEX_FIRST_PAINT_KB} KB)`);
      }
      return { muts, identity, dexKb, leftBehind };
    };
    const repaint = await repaintPass();
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

    // ---- 1b2. R124 — the OTHER end of the phone band. The stylesheet's
    //      mobile rules live behind `@media (max-width: 420px)`, and every
    //      measurement in this file had only ever been taken at 380: the
    //      narrow end. That is one reading of a forty-pixel band, and the
    //      bug that prompted this ran the whole width of it — a ranch card
    //      that shrink-wraps to its own text is invisible at 380, where the
    //      text is already wider than the line, and plain at 411 on the
    //      phone it was photographed on.
    //
    //      Only the box rules are re-read up here. The 40px floor and the
    //      6px gutter are worst-case-at-the-narrowest properties and get
    //      no truer with more room; contrast does not move with width at
    //      all. Widening the whole walk would also make "76 controls at
    //      380px" a claim about two different pages.
    await send('Emulation.setDeviceMetricsOverride', { width: BAND_TOP, height: 780, deviceScaleFactor: 1, mobile: true });
    await sleep(350);
    for (const s of screens) {
      await evaluate(`document.querySelector('#tabs button[data-screen="${s}"]').click()`);
      await sleep(500);
      await evaluate(OPEN_DETAILS);
      await evaluate(`document.querySelector('#screen-${s} button[data-fold]')?.click()`);
      await sleep(350);
      views.add(`${s}@${BAND_TOP}`);
      for (const g of await evaluate(RAGGED)) {
        if (!lists.has(g.sel) || lists.get(g.sel).n < g.n) lists.set(g.sel, { ...g, where: `${s}@${BAND_TOP}` });
      }
    }
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

      // R99 — WITH A CARD OPEN. This stamped whatever fold state the earlier
      // passes happened to leave behind, which made the count a function of
      // what ran before it rather than of the screen. Most of this game's
      // controls live inside a fold — care buttons, move slots, the rename
      // sheet — so a keyboard walk over shut rows is a walk over the chrome.
      // Opened with a click on purpose: the question is whether TAB reaches
      // everything once the screen is in that state, not how it got there.
      await evaluate(`(() => {
        const b = document.querySelector('#screen-${s} button[data-fold]');
        if (b && b.getAttribute('aria-expanded') !== 'true') b.click();
      })()`);
      await sleep(420);

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
      if (await evaluate(`document.hidden`)) note('the page reports itself hidden, so the tick never runs and 7b proves nothing');
      // R104 — this rule used to prove the repaint happened by watching a
      // probe node DISAPPEAR, because every repaint replaced every node. Both
      // halves of that changed: the tick no longer paints a world that did
      // not move, and a paint now keeps the nodes whose markup is unchanged.
      // So the world is made to move TWO HOURS. Two minutes was the first
      // try and it proved the fix rather than the focus: the report fired,
      // the screen repainted, and the keyed paint correctly rewrote nothing,
      // leaving no mutation to observe. A repaint with no work in it cannot
      // lose anyone's focus — but it cannot demonstrate keeping it either, so
      // the clock moves far enough to change what the cards say. Nothing here
      // takes focus, which is the thing being measured.
      const painted = Number(await evaluate(`(() => {
        let n = 0;
        const obs = new MutationObserver((rs) => { n += rs.length; });
        obs.observe(document.querySelector('.screen:not([hidden])'),
          { childList: true, subtree: true, attributes: true, characterData: true });
        const R = Date.now.bind(Date); Date.now = () => R() + 2 * 3600000;
        document.dispatchEvent(new Event('visibilitychange'));
        return new Promise((res) => setTimeout(() => { obs.disconnect(); res(n); }, 500));
      })()`));
      await sleep(200);
      if (!painted) {
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
    // R99 — and with it on, nothing ON SCREEN may still be moving. The media
    // query has been emulated here since R80 and nothing ever read the
    // result; this is that emulation finally being asked a question.
    {
      const still = new Map();
      for (const s2 of ['ranch', 'pens', 'battle', 'vault', 'theater', 'dex']) {
        await evaluate(`document.querySelector('#tabs button[data-screen="${s2}"]').click()`);
        await sleep(450);
        for (const m of await evaluate(STILL)) still.set(`${m.sel}|${m.what}`, { ...m, where: s2 });
      }
      for (const m of still.values()) {
        note(`${m.where}: ${m.sel} still has ${m.what} with reduced motion asked for`);
      }
    }
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
    // R89 — the Retrain button moved twice: once behind the creature card's
    // fold, and once behind that card's Moves tab. Both are deliberate, and
    // both put it out of this walk's reach — which the gate said out loud
    // rather than quietly finding nothing to press. Open a creature, then
    // its Moves tab, the way a player does.
    await evaluate(`document.querySelector('#screen-pens button[data-fold]')?.click()`);
    await sleep(600);
    await evaluate(`document.querySelector('#screen-pens [data-pen-tab="moves"]')?.click()`);
    await sleep(600);
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
    // The rename sheet lives inside an animal's card, so open folds until one
    // appears rather than firing a single stale volley at all of them.
    await evaluate(OPEN_DETAILS);
    for (const id of await evaluate(FOLD_IDS('ranch')) ?? []) {
      await evaluate(`(() => { const b = document.querySelector('#screen-ranch button[data-fold="${id}"]');
        if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); })()`);
      await sleep(300);
      if (await evaluate(`!!document.querySelector('#screen-ranch .rename-btn:not([disabled])')`)) break;
    }
    await sleep(200);
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

    // 6f. R115 — AND THE HALF OF R80'S RULE NOBODY HAD RUN. The pass above
    //     proves Enter on ✕ CANCELS, which is the bug R80 fixed. It never
    //     proved the other direction: that the sheet's own commit button
    //     commits. `submit` in ui/picker.js, and every `onSubmit` behind it,
    //     had never been called by anything — so a rename sheet that silently
    //     dropped the name would have passed every gate in this repo.
    const commitPrompt = await evaluate(`(() => {
      const b = document.querySelector('#screen-ranch .rename-btn:not([disabled])');
      if (!b) return false; b.click(); return true;
    })()`);
    if (!commitPrompt) note('no rename prompt could be opened, so committing one is untested');
    else {
      await sleep(400);
      await evaluate(`(() => { const i = document.querySelector('.prompt-input'); if (i) i.value = 'Gerald Prime'; })()`);
      await evaluate(`document.querySelector('#picker #prompt-go')?.click()`);
      await sleep(600);
      const after = await evaluate(`(() => ({
        hidden: document.getElementById('picker').hidden,
        named: document.body.innerHTML.includes('Gerald Prime'),
      }))()`);
      if (!after.hidden) note('pressing the rename sheet\'s commit button left the sheet open');
      if (!after.named) note('pressing the rename sheet\'s commit button did not apply the new name');
    }

    // 6g. R115 — AND AN OPTION PICKER, COMMITTED. Same shape, other sheet:
    //     the walk opened pickers to measure them and never chose anything,
    //     so every `onPick` in the game — the vat's two donors, the breeding
    //     pen's two parents, the dossier's identity and philosophy, three in
    //     Settings — was a callback nothing had ever fired.
    //     EVERY PICKER, NOT THE FIRST ONE. The first draft opened one picker,
    //     committed it and stopped — and `breed-a`, `breed-b` and `vat-b`
    //     stayed uncalled through a fixture change made specifically to give
    //     them something to build from. Each of these is a LAZY option
    //     provider keyed by picker id: it runs when that picker opens and
    //     never otherwise, so "a pick was committed somewhere" covers exactly
    //     one of them. The walk has to open all of them.
    let picked = 0;
    let offered = 0;
    for (const screen of ['pens', 'ranch', 'theater', 'vault', 'dex']) {
      await evaluate(`document.querySelector('#tabs button[data-screen="${screen}"]')?.click()`);
      await sleep(500);
      await evaluate(OPEN_DETAILS);
      // Folds are exclusive on some screens, so each one is opened, its
      // pickers taken, and then the next — rather than opening all of them
      // and reading a screen that only ever had the last one showing.
      const folds = await evaluate(FOLD_IDS(screen)) ?? [];
      for (const id of [...folds, null]) {
        if (id) {
          await evaluate(`(() => { const b = document.querySelector('#screen-${screen} button[data-fold="${id}"]');
            if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); })()`);
          await sleep(250);
        }
        const ids = await evaluate(`[...document.querySelectorAll('#screen-${screen} button[data-picker]:not([disabled])')].map((b) => b.dataset.picker)`);
        for (const pid of ids) {
          if (!await evaluate(`(() => { const b = document.querySelector('#screen-${screen} button[data-picker="${pid}"]:not([disabled])');
            if (!b) return false; b.click(); return true; })()`)) continue;
          await sleep(450);
          offered += 1;
          const rows = await evaluate(`document.querySelectorAll('#picker .pick-row').length`);
          if (!rows) {
            // An empty sheet is a real state and not this one.
            await evaluate(`document.querySelector('#picker .pick-close')?.click()`);
            await sleep(200);
            continue;
          }
          await evaluate(`document.querySelector('#picker .pick-row').click()`);
          await sleep(500);
          if (!await evaluate(`document.getElementById('picker').hidden`)) {
            note(`${screen}/${pid}: choosing a row left the picker sheet open`);
            await evaluate(`document.querySelector('#picker .pick-close')?.click()`);
            await sleep(200);
          }
          picked += 1;
        }
      }
    }
    if (!picked) note(`no option picker on any screen offered a row to choose (${offered} opened), so nothing committed a pick`);

    // 6h. R115 — AND THE SETTINGS PANEL'S OWN FOUR, which are the only
    //     controls in the game that change how the game itself behaves:
    //     volume, battle speed, theme, and the lab's name. Every one of their
    //     `onPick`/`onSubmit` bodies writes to `state.settings`, calls
    //     `ctx.save()` and re-renders, and not one of them had ever been run
    //     — a theme picker that saved nothing would have passed every gate.
    //
    //     LAST IN THE WALK ON PURPOSE. Committing these changes the theme,
    //     the volume and the speed for real; anything measured afterwards
    //     would be measured under settings this pass chose.
    await evaluate(`document.querySelector('#settings').click()`);
    await sleep(500);
    //     THE PANEL DOES NOT USE `data-picker`. Screens wire their pickers
    //     through `bindPickers`, which reads that attribute; Settings wires
    //     four NAMED buttons by id and calls `openPicker`/`openPrompt`
    //     directly. The first draft of this pass queried the screen
    //     convention inside the panel and reported that it offered no picker
    //     at all. Two conventions for "a button that opens a picker" is worth
    //     a milestone of its own; this one just has to know about both.
    const setPickers = await evaluate(`[
      ...['#set-volume', '#set-theme', '#set-speed'],
      ...[...document.querySelectorAll('#overlay [data-rename-slot]')].slice(0, 1).map(() => '[data-rename-slot]'),
    ].filter((sel) => { const b = document.querySelector('#overlay ' + sel); return b && !b.disabled; })`);
    if (!setPickers.length) note('the settings panel offered none of its four choices, so none were committed');
    let committed = 0;
    for (const sel of setPickers) {
      await evaluate(`document.querySelector('#overlay ${sel}')?.click()`);
      await sleep(450);
      const kind = await evaluate(`(() => {
        if (document.querySelector('#picker .prompt-input')) return 'prompt';
        return document.querySelectorAll('#picker .pick-row').length ? 'rows' : 'empty';
      })()`);
      if (kind === 'prompt') {
        await evaluate(`(() => { const i = document.querySelector('#picker .prompt-input'); if (i) i.value = 'Coverage Lab'; })()`);
        await evaluate(`document.querySelector('#picker #prompt-go')?.click()`);
        committed += 1;
      } else if (kind === 'rows') {
        // The LAST row, not the first: the first is usually what is already
        // selected, and re-choosing it exercises the callback without
        // proving it changed anything.
        await evaluate(`(() => { const r = [...document.querySelectorAll('#picker .pick-row')]; r[r.length - 1].click(); })()`);
        committed += 1;
      } else {
        await evaluate(`document.querySelector('#picker .pick-close')?.click()`);
      }
      await sleep(500);
    }
    if (setPickers.length && committed < setPickers.length) {
      note(`${committed} of the settings panel's ${setPickers.length} pickers offered anything to choose`);
    }
    await evaluate(`document.querySelector('#set-close')?.click()`);
    await sleep(300);

    // 6i. R115 — THE BOOT-FAILURE CARD, AND THE ASCENT RULE IT ENFORCES.
    //     `renderBootFailure` replaces the whole body — R71's rule, so a
    //     half-live shell cannot leave tabs a player can tap that do nothing
    //     — and it had never run. It is the screen a player sees on the worst
    //     day the game has, and no floor, gutter or contrast rule had ever
    //     been applied to it.
    //
    //     Driven through the FUTURE-SAVE branch, which is the one worth
    //     proving: a save from a newer build must be REFUSED AND LEFT ALONE.
    //     That is the Ascent rule at the one moment it can be broken by
    //     accident, and this asserts it byte-for-byte rather than trusting
    //     that nothing in the failure path writes.
    //
    //     LAST IN THE WALK, because it destroys the document.
    {
      const future = JSON.parse(fixture);
      future.saveVersion = SAVE_VERSION + 1;
      const futureText = JSON.stringify(future);
      await evaluate(`localStorage.setItem('spliceworld_save', ${JSON.stringify(futureText)})`);
      await send('Page.navigate', { url });
      await sleep(2200);
      const boot = await evaluate(`(() => ({
        card: !!document.querySelector('.boot-fail-card'),
        heading: document.querySelector('.boot-fail-card h1')?.textContent ?? '',
        reload: !!document.getElementById('boot-reload'),
        shell: !!document.getElementById('tabs'),
        buttons: [...document.querySelectorAll('.boot-fail-card button')].map((b) => b.textContent.trim()),
        saved: localStorage.getItem('spliceworld_save'),
      }))()`);
      if (!boot.card) {
        note(`a save one version ahead did not reach the boot-failure card (heading "${boot.heading}")`);
      } else {
        await collect('boot-failure');
        if (!/newer build/i.test(boot.heading)) {
          note(`a save from a newer build reached the wrong failure card ("${boot.heading}")`);
        }
        if (!boot.reload) note('the boot-failure card offers no way to reload');
        if (boot.shell) note('the boot-failure card left the tab bar standing over a main that will never render');
        // R71: every failure offers a reload and NOTHING else. A reset here
        // is a second, worse way to lose a save on top of whatever already
        // went wrong.
        const offersReset = boot.buttons.filter((b) => /reset|new run|start over|clear/i.test(b));
        if (offersReset.length) {
          note(`the boot-failure card offers ${offersReset.join(', ')} — a reset here is a second way to lose the save`);
        }
        if (boot.saved !== futureText) {
          note('THE FUTURE SAVE WAS MODIFIED by a build that cannot read it — the Ascent rule is broken');
        }
      }
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

    // ---- 1d2. R113 - AND EVERY SAVE SHAPE, not just the one this gate
    //      builds. The lab fixture above is a mid-game save with everything
    //      alive, which is the right shape for measuring CONTROLS. It is the
    //      wrong shape for measuring TYPE AND COLOUR, because what a screen
    //      prints depends on what the save holds: a fresh save is all empty
    //      states and first-run prose, and a day-180 one is grades, badges and
    //      lists nothing else reaches. R113's criterion names both by name.
    //
    //      Only the CONTRAST walk is repeated - it carries the type floor too
    //      - because the 40px floor and the 6px gutter are properties of the
    //      stylesheet and do not move with the save. Two reloads and a lap of
    //      the tab bar each, rather than two more full walks.
    //      IT DOES NOT CALL `foundingPass`. The first draft did, to get past
    //      the picker, and `foundingPass` ends by writing the LAB FIXTURE back
    //      and reloading — so both passes measured the same mid-game save the
    //      walk had already measured, twice, and reported clean. The battery
    //      is what said so: a contrast break on `.tier-S`, a badge only a
    //      180-day campaign can print, went MISSED. Clearing both stores and
    //      pressing a lab is four lines; borrowing a helper that puts the
    //      state back was one, and it silently answered a different question.
    const shapeSeen = new Map();
    const shapePass = async (label, setup) => {
      // Both stores, per R100: localStorage alone means "evicted player" and
      // the campaign comes back out of IndexedDB.
      await evaluate(`(async () => {
        localStorage.clear();
        await new Promise((r) => { const q = indexedDB.deleteDatabase('spliceworld'); q.onsuccess = r; q.onerror = r; q.onblocked = r; });
      })()`);
      await setup();
      await send('Page.navigate', { url });
      await sleep(2200);
      // A save-less browser opens on the founding choice; pick a lab and take
      // whatever the first splice puts up, because what this pass is for is
      // the screens BEHIND that, which no other pass reaches on a fresh save.
      if (await evaluate(`!!document.querySelector('.founding .lab-pick')`)) {
        await evaluate(`document.querySelector('.founding .lab-pick').click()`);
        await sleep(1400);
        for (let i = 0; i < 3; i++) {
          if (await evaluate(`document.querySelector('#overlay').hidden`)) break;
          await evaluate(`(() => { const b = document.querySelector('#overlay button'); if (b) b.click(); })()`);
          await sleep(700);
        }
      }
      if (await evaluate(`!!document.querySelector('.founding')`)) {
        note(`${label}: the founding picker never closed, so nothing behind it was measured`);
        return;
      }
      const tabs = await evaluate(`[...document.querySelectorAll('#tabs button')].map((b) => b.dataset.screen)`);
      if (!tabs.length) { note(`${label}: the shell painted no tabs, so nothing was measured on it`); return; }
      const saw = new Set();
      for (const sc of tabs) {
        await evaluate(`document.querySelector('#tabs button[data-screen="${sc}"]')?.click()`);
        await sleep(500);
        await evaluate(OPEN_DETAILS);
        await sleep(300);
        for (const t of await evaluate(CONTRAST)) {
          saw.add(t.sel);
          if (t.px < TYPE_FLOOR) {
            const key = `${label}|${t.sel}|${t.px}`;
            if (!small.has(key)) small.set(key, { ...t, where: `${label}:${sc}` });
          }
          if (t.unmeasured) continue;
          const key = `${label}|${t.sel}|${t.color}|${t.bg}`;
          if (!dim.has(key) || dim.get(key).ratio > t.ratio) dim.set(key, { ...t, where: `${label}:${sc}` });
        }
      }
      shapeSeen.set(label, saw);
    };
    await shapePass('fresh', async () => {});
    {
      const { walkedSave } = await import('./fixtures.js');
      const day180 = walkedSave({ days: 180 });
      await shapePass('day180', async () => {
        await evaluate(`localStorage.setItem('spliceworld_save', ${JSON.stringify(JSON.stringify(day180))})`);
      });
    }
    // AND THE TWO SHAPES HAVE TO BE TWO SHAPES. This is the assertion the
    // first draft needed and did not have: if a save fails to load, or a
    // helper quietly puts another one back, both laps measure the same screens
    // and report clean for the wrong reason. A fresh save and a 180-day
    // campaign each print things the other never does — a locked node and an
    // S-tier badge are the extremes of it — so if either set is a subset of
    // the other, one of these passes did not happen.
    {
      const a = shapeSeen.get('fresh');
      const b = shapeSeen.get('day180');
      if (a && b) {
        const onlyA = [...a].filter((x) => !b.has(x));
        const onlyB = [...b].filter((x) => !a.has(x));
        if (!onlyA.length || !onlyB.length) {
          note(`the fresh and day-180 laps drew the same ${a.size} and ${b.size} selectors`
            + ` (${onlyA.length} and ${onlyB.length} of their own), so one of the two saves never loaded`);
        }
      }
    }

    // ---- 1h. R113 - AND IT SURVIVES A READER WHO TURNED THE TEXT UP ------
    //
    //      Everything in this stylesheet is sized in `rem`, so the OS text
    //      setting scales the whole layout rather than one paragraph of it.
    //      That is the right way round, and it is also the way that overflows.
    //      Measured by moving the root size and asking the SAME containment
    //      question the 100% pass asks.
    //
    //      IT IS A LAP OF THE TAB BAR, NOT ONE READING, and that is the whole
    //      value of it. The first draft of this probe scaled the text and
    //      measured whatever screen the walk happened to be standing on. It
    //      reported zero, which is how R113's entry came to record "150% text
    //      overflows nothing" as already true. It was not: a held node row on
    //      the War Room ran 86px past its card, because `.encounter` is a
    //      flex row that does not wrap and a held node puts THREE children in
    //      it. One screen out of six is not an answer about the layout.
    //
    //      Runs on the day-180 save the pass above just loaded - the busiest
    //      shape the game has, and the only one with held territory in it.
    {
      await evaluate(`document.documentElement.style.fontSize = '${16 * TEXT_SCALE}px'`);
      await sleep(400);
      const spilt = new Map();
      const tabs = await evaluate(`[...document.querySelectorAll('#tabs button')].map((b) => b.dataset.screen)`);
      for (const sc of tabs.length ? tabs : [null]) {
        if (sc) {
          await evaluate(`document.querySelector('#tabs button[data-screen="${sc}"]')?.click()`);
          await sleep(500);
          await evaluate(OPEN_DETAILS);
          await sleep(300);
        }
        for (const o of await evaluate(CONTAINED)) {
          const worst = Math.max(o.right, o.left, o.past);
          if (worst > 1) {
            const key = `${sc}|${o.sel}`;
            if (!spilt.has(key) || spilt.get(key).worst < worst) spilt.set(key, { ...o, sc, worst });
          }
        }
      }
      for (const o of [...spilt.values()].sort((a, b) => b.worst - a.worst)) {
        note(`at ${Math.round(TEXT_SCALE * 100)}% text on ${o.sc}: ${o.sel} "${o.label}"`
          + ` leaves its ${o.card} or the phone by ${Math.round(o.worst)}px`);
      }
      await evaluate(`document.documentElement.style.fontSize = ''`);
      await sleep(300);
    }

    // Nothing reads the DOM after this, so there is no need to navigate back.

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

    // ---- 1f2. R113 - and is big enough to read at all --------------------
    const tiny = [...small.values()].sort((a, b) => a.px - b.px);
    if (REPORT) {
      for (const t of tiny.slice(0, 40)) {
        console.log(`  ${String(t.px).padStart(6)}px  ${t.where.padEnd(14)} ${t.sel}  "${t.txt}"`);
      }
      console.log('');
    }
    for (const t of tiny) {
      note(`${t.where}: ${t.sel} "${t.txt}" prints at ${t.px}px, under the ${TYPE_FLOOR}px type floor`);
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

    // ---- 1g. and a box that fills its line uses all of it ----------------
    const ragged = [...lists.values()].sort((a, b) => b.n - a.n);
    if (REPORT) {
      for (const g of ragged.slice(0, 30)) {
        console.log(`  ${g.kind.padEnd(7)} +${String(g.n).padStart(4)}px  ${g.where.padEnd(14)} ${g.sel}  ${g.how}  "${g.txt}"`);
      }
      console.log('');
    }
    for (const g of ragged) {
      note(g.kind === 'row'
        ? `${g.where}: ${g.sel} fills its ${g.w}px line but starts its content ${g.n}px in ("${g.txt}") — a ragged left edge`
        : `${g.where}: ${g.sel} fills its ${g.w}px line as a column but leaves align-items "${g.how}", so every child shrink-wraps to its own text ("${g.txt}")`);
    }

    // ---- R99. Nothing leaves its card, and nothing sits on anything else.
    for (const o of [...spills.values()].sort((a, b) => b.worst - a.worst)) {
      const where = [o.right && `${o.right}px past its card`, o.left && `${o.left}px off its left edge`,
        o.past && `${o.past}px past the phone`].filter(Boolean).join(' and ');
      note(`${o.where}: ${o.sel} "${o.label}" escapes ${where} — a control that leaves its card`
        + ' still reports a full-size box, so the 40px floor and the 6px gutter both pass it');
    }
    for (const o of [...stacked.values()].sort((a, b) => b.area - a.area)) {
      note(`${o.where}: ${o.a} "${o.la}" sits on top of ${o.b} "${o.lb}" by ${o.ox}x${o.oy}px`
        + ' — two targets a thumb cannot tell apart, and the gutter rule reads the overlap as a separation');
    }

    // ---- R99. The walk has to have DRAWN the things it claims to measure.
    for (const [sel, what] of Object.entries(LANDMARKS)) {
      if (saw.has(sel)) continue;
      note(`nothing in the whole walk ever drew \`${sel}\` — ${what}. A rule with nothing`
        + ' to look at passes; that is how a 3.42:1 panel survived four milestones of green runs');
    }

    // ---- 7. nothing narrated an error along the way ------------------------
    for (const e of [...new Set(errors)]) note(`console error during the walk: ${e}`);

    if (REPORT) {
      // R99 — WHICH views, not how many. "29 views" read like coverage while
      // the feral panel went undrawn for four milestones; a list is the only
      // form of that number anybody can check.
      console.log(`  views walked (${views.size}):`);
      for (const v of [...views].sort()) console.log(`    ${v}`);
      console.log('');
    }
    // ---- 9. R107 — AND THE CARD THAT ONLY EXISTS AFTER A GAP.
    //
    // This gate's fixture is built at `Date.now()`, so its gap is zero and
    // the welcome-back card correctly never appears — which means the whole
    // feature shipped unmeasured on the only gate that looks at pixels. The
    // control count did not move when it landed, and that is the tell.
    //
    // So: the same fixture with its one clock wound back a week, loaded on
    // its own. Everything above measured the steady state; this measures the
    // arrival, which is the only state the card is ever in.
    //
    // LAST, because it RELOADS THE PAGE. Run in the middle it cost the
    // keyboard walk sixteen of its controls and broke two focus rules that
    // depend on where the walk had got to - a gate disturbing its own
    // fixture, which is the R104 lesson one floor down. Nothing follows it
    // but the report, so its reloads can reach nothing.
    //
    // The dismiss button is therefore NOT in the generic 40px sweep above,
    // which is why this block measures its height itself.
    {
      const week = JSON.parse(fixture);
      week.lastTickAt = Date.now() - 7 * 24 * 3600000;
      await evaluate(`localStorage.setItem('spliceworld_save', ${JSON.stringify(JSON.stringify(week))})`);
      await send('Page.navigate', { url });
      await sleep(2400);
      const card = JSON.parse(await evaluate(`(() => {
        const el = document.querySelector('#welcome');
        const btn = el?.querySelector('#welcome-dismiss');
        const r = btn?.getBoundingClientRect();
        return JSON.stringify({
          shown: !!el && !el.hidden,
          lines: el?.querySelectorAll('.welcome-lines li').length ?? 0,
          heading: el?.querySelector('h2')?.textContent ?? '',
          btnH: r ? Math.round(r.height) : 0,
          // It must sit ABOVE the screen it opened on, not inside it.
          inside: !!el?.closest('.screen'),
        });
      })()`));
      if (!card.shown) {
        note('a week away opens the app with no welcome-back card (R107)');
      } else {
        if (!card.lines) note('the welcome-back card is on screen with nothing in it');
        if (card.inside) note('the welcome-back card is inside a screen root, so leaving empties it');
        if (card.btnH && card.btnH < FLOOR) {
          note(`the welcome-back dismiss button is ${card.btnH}px, under the ${FLOOR}px floor`);
        }
        if (!/away/i.test(card.heading)) note(`the card does not say how long you were gone (${card.heading})`);
        // AND IT GOES AWAY WHEN ASKED, taking its focus somewhere real.
        const after = JSON.parse(await evaluate(`(() => {
          document.querySelector('#welcome-dismiss')?.click();
          return new Promise((res) => setTimeout(() => res(JSON.stringify({
            shown: !document.querySelector('#welcome')?.hidden,
            focus: document.activeElement?.tagName ?? 'NONE',
          })), 300));
        })()`));
        if (after.shown) note('the welcome-back card does not dismiss');
        if (after.focus === 'BODY' || after.focus === 'NONE') {
          note(`dismissing the welcome-back card drops focus to ${after.focus}`);
        }
        console.log(`a11y: a week away opens with a ${card.lines}-line welcome-back card, `
          + `dismissed to ${after.focus}`);
      }
      // Back to the steady-state save for everything after this.
      await evaluate(`localStorage.setItem('spliceworld_save', ${JSON.stringify(fixture)})`);
      await send('Page.navigate', { url });
      await sleep(2200);
    }

    // Say the four numbers even when they pass. A budget that only speaks
    // when it is broken cannot show it is still being measured, and these
    // four were 63, 5-of-5, 496 and 275 KB the day before this gate existed.
    console.log(`a11y: an unchanged tick rewrote ${repaint.muts} nodes; a tap on one pen card destroyed `
      + `${repaint.identity.before - repaint.identity.after} of the ${repaint.identity.before} it did not touch; `
      + `the worst screen left ${Math.max(0, ...repaint.leftBehind)} nodes behind; `
      + `the Dex paints ${repaint.dexKb} KB before a scroll`);

    console.log(`a11y: ${controls.length} distinct controls measured at ${VIEWPORT}px across ${views.size} views (boxes re-read at ${BAND_TOP}px, the top of the phone band)`);
    console.log(`a11y: ${kbScreens}/${screens.length} screens opened, ${kbControls} controls tabbed to and a duel fought with Tab and Enter alone`);
  } finally {
    if (process.env.SW_COVERAGE && cdp && snap) await snap();
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
  console.log(`a11y ✓  every control clears ${FLOOR}px and sits ${GUTTER}px from its neighbour · nothing sits on top of anything else · nothing leaves its card or the phone · every word clears the contrast floor, in every theme and on a fresh save and a day-180 one · nothing prints under ${TYPE_FLOOR}px · nothing leaves its card at ${Math.round(TEXT_SCALE * 100)}% text · the header clears a ${CUTOUT}px cutout · every full-width row starts at the left of it · every dialog card paints its own ground · an unchanged tick touches nothing · a tap rebuilds one card · a screen you left costs nothing · the Dex paints what you can see · a week away says what it did · focus visible · focus survives a repaint · wire live · nav current · both modals are dialogs · nothing moves when the OS asks it not to · the game is playable from the keyboard`);
}

// R88 — only when RUN, not when imported. This module owns the one fixture
// recipe in the repo (a lab, three chimeras, every clock running), and any
// probe that wants it had to either duplicate it or accidentally run the
// whole gate to get it. I did the latter once by mistake this session.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
