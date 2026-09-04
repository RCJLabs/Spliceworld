// R76 — EVERY data-* HANDLER HAS BEEN FIRED ONCE.
//
// R75 built the first version of this inline in the smoke suite: render each
// of the six screens once, fire the handlers that render bound, assert none
// throws. It fired 70 handlers — its own printed number — and most of the
// game's interactive surface was out of its reach, because most of that
// surface is not on a screen's first paint: it is behind a sub-tab, a
// briefing, an overlay, a picker sheet, the arena, or the settings panel.
// Everything behind a click was still dead code.
//
// This walks SURFACES instead. A surface is a screen, a sub-tab, or whatever
// a named `path` of clicks reaches; `fanout` turns one control into one
// surface per instance, so a seventh Dex tab is walked the day it lands.
//
// Each handler is fired against a screen rendered FRESH for it. Firing a
// whole snapshot in sequence is a different and worse test: the third handler
// runs against whatever the first two did to the state, and a handler that
// re-renders leaves everything after it holding elements that no longer
// exist. That is not a bug in the game — it showed up as `#wr-launch`
// reading `draftTarget.kind` after `#wr-back` had cleared it, a sequence no
// player can produce.
//
// THE CRITERION is coverage, not just absence of throws, and it is two
// claims rather than one: every `data-*` something SELECTS on must have had a
// handler bound by that selector run, and every `data-*` that is only ever a
// PARAMETER (read off `dataset` by a handler bound to a sibling attribute)
// must have been carried by an element that fired. The denominator comes from
// the painted HTML AND from the source, so a control that no surface renders
// still counts against us rather than quietly leaving the set.
//
//   node tools/handlers.js            # exit 1 on a throw or a gap
//   node tools/handlers.js --report   # every surface and what it fired
//
// It lives here rather than in the suite so a break battery can aim at it in
// seconds instead of running five minutes of balance sims to reach it.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { indexContent } from '../render/renderer.js';
import { newGameState } from '../save/save.js';
import { createAnimal } from '../ranch/ranch.js';
import { spliceChimera } from '../splice/theater.js';
import { createBattle } from '../battle/engine.js';
import { recordingRoot, installDom, memoryStorage, fakeEvent, attrsOfFire, dataAttrsIn } from './domstub.js';
import { moduleFiles } from './scopecheck.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOUR = 3600000;
const t0 = 1700000000000;

const CONTENT_FILES = ['frames', 'parts', 'species', 'combos', 'enemies', 'keywords', 'regions',
  'traits', 'classes', 'rivals', 'director', 'facility', 'philosophies', 'operations', 'chaos',
  'temperament', 'scars', 'guides', 'resequencer', 'training', 'gauntlet', 'news', 'breakout'];

export function loadContent() {
  const readJSON = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
  return indexContent(Object.fromEntries(CONTENT_FILES.map((n) => [n, readJSON(`data/${n}.json`)])));
}

// The screens the shell actually renders, read from `main.js` rather than
// restated. R39: two gates needed this list, one derived it and one typed
// it out, and the typed one was missing the Vault.
export function shellScreenMap() {
  const shell = readFileSync(join(root, 'main.js'), 'utf8');
  const block = shell.slice(shell.indexOf('const SCREENS = {'));
  const body = block.slice(0, block.indexOf('};'));
  const out = [];
  // R74 — a screen is now painted by one of two things, and this list is
  // still derived rather than typed out (R39's rule, which is why every gate
  // downstream keeps working when a seventh screen arrives): a statically
  // imported render function, or a `lazy()` loader that names its module and
  // its export inline. `lazy` travels with each entry so a gate can assert
  // WHICH screens are deferred, not merely that the map parses.
  for (const line of body.split('\n')) {
    const eager = line.match(/^\s{2}(\w+): \(root\) => (\w+)\(/);
    if (eager) {
      const [, screen, fn] = eager;
      // …and on to the module that exports it, so a gate can ask what that
      // file does rather than what a list says about it.
      const imp = shell.match(new RegExp(`import \\{[^}]*\\b${fn}\\b[^}]*\\} from '([^']+)'`));
      out.push({ screen, fn, file: imp ? imp[1].replace(/^\.\//, '') : null, lazy: false });
      continue;
    }
    const deferred = line.match(/^\s{2}(\w+): lazy\(\(\) => import\('([^']+)'\), '(\w+)'\)/);
    if (deferred) {
      const [, screen, spec, fn] = deferred;
      out.push({ screen, fn, file: spec.replace(/^\.\//, ''), lazy: true });
    }
  }
  return out;
}

// The cache-buster's counter lives OUTSIDE walkSurfaces on purpose. Reset per
// call, run 2 re-imports run 1's exact URLs — `campaign/ui.js?run=0` and the
// rest — and inherits each instance's leftover `warTab`, so a second walk in
// one process reported 54 handlers "vanished" that were fine. A module
// instance this walk has used must never be handed to another walk.
let runNonce = 0;

export async function walkSurfaces(content = loadContent(), { report = false } = {}) {
  const { renderArena } = await import('../battle/ui.js');
  const { openSettings } = await import('../save/settings-ui.js');
  const { WAR_TABS } = await import('../campaign/warroom.js');
  const { operationList } = await import('../campaign/operations.js');
  const { rivalTeam, rivalList } = await import('../campaign/rivals.js');
  const { tickBreakouts } = await import('../campaign/breakout.js');

  // ONE SAVE WITH EVERY CONTROL ALIVE AT ONCE. A surface the fixture cannot
  // reach is a surface the gate cannot press, so this state deliberately holds
  // a bit of everything: parts to splice, a settled chimera, an injured one,
  // livestock, an egg, a vial, held and contested and takeable nodes, a
  // captive, two containment bays (one plain, one mid-rehab), a job in the
  // field, an unread job report, dominion for the Gauntlet, and the notoriety
  // that unlocks the first rival.
  const fixture = (now) => {
    const s = { ...newGameState(), seed: 4242, funds: 20000 };
    // Every track built out. The Reorientation Wing in particular: without it
    // the Containment bay renders "needs the Reorientation Wing" instead of
    // the Rehabilitate button, and the gate cannot press what is not drawn.
    s.facility = { theater: 2, containment: 2, incubator: 2, extractor: 2, scanner: 2, infirmary: 2 };
    s.lastTickAt = t0;
    const grades = { cobra_head: 'apex', bear_forelimbs: 'standard', goat_hindlimbs: 'prime',
      cobra_organ: 'standard', bear_hide: 'standard', goat_tail: 'standard' };
    for (const [pid, g] of Object.entries(grades)) {
      s.inventory.parts.push({ id: `h-${pid}`, partId: pid, grade: g,
        donor: { name: 'Donor', species: pid.split('_')[0], stars: 3, extractedAt: t0 } });
    }
    const used = new Set();
    const slots = Object.fromEntries(Object.keys(grades).map((pid) => {
      const slot = content.parts[pid].slot;
      let socket = slot; let n = 2;
      while (used.has(socket)) socket = `${slot}${n++}`;
      used.add(socket);
      return [socket, `h-${pid}`];
    }));
    const made = spliceChimera(s, 'M', slots, content, t0);
    if (!made.ok) throw new Error(`handler-gate fixture splices: ${made.msg}`);
    for (const [pid, g] of [['goat_head', 'standard'], ['bear_organ', 'prime']]) {
      s.inventory.parts.push({ id: `h-sp-${pid}`, partId: pid, grade: g,
        donor: { name: 'Spare', species: pid.split('_')[0], stars: 2, extractedAt: t0 } });
    }
    s.ranch = { ...s.ranch, stock: [], penCapacity: 8, animalCount: 0, seeded: true };
    for (const sp of ['goat', 'bear', 'cobra']) s.ranch.stock.push(createAnimal(s, sp, content, t0));
    s.dex = { parts: Object.keys(content.parts).slice(0, 8),
      enemies: Object.keys(content.enemies).slice(0, 4),
      beaten: Object.keys(content.enemies).slice(0, 2), traits: [], variants: [] };
    s.discoveredCombos = Object.keys(content.combos).slice(0, 3);
    s.chimeras[0].settleUntil = t0 - 1000;

    // A second chimera, hurt, so the Infirmary's Treat button renders.
    const hurt = structuredClone(s.chimeras[0]);
    hurt.id = 'h-hurt';
    hurt.name = 'Patient';
    hurt.injury = { name: 'Bent Whiskers', until: now + 2 * HOUR };
    s.chimeras.push(hurt);
    s.chimeraCount = s.chimeras.length;

    // A vial, so the Resequencer has something to run.
    s.inventory.vials = [{ id: 'h-vial', species: 'goat', donorName: 'Bessie', stars: 4,
      potential: { hp: 3, power: 3, armor: 3, speed: 3, stamina: 3 }, genotype: {} }];

    // An egg on the incubator, ready to hatch. Shaped the way `breedPair`
    // shapes one — two generations of lineage, no deeper — because the
    // incubator card renders the grandparents and an invented egg would test
    // a card the game never draws.
    const lineage = (name) => ({ name, stars: 3, sire: { name: 'Gran', stars: 2 }, dam: { name: 'Nan', stars: 2 } });
    s.ranch.eggs = [{ id: 'h-egg', species: 'goat', variant: null, variantNote: null, sex: 'F',
      laidAt: t0, hatchAt: now - 1000, mutationNote: null,
      genotype: {}, potential: { hp: 3, power: 3, armor: 3, speed: 3, stamina: 3 },
      parents: { sire: lineage('Bullseye'), dam: lineage('Bessie') } }];

    // The map, wide open: hold everything but the last node of the first
    // region (so exactly one is takeable), contest one, and take a prisoner.
    const regions = Object.values(content.regions);
    const nodes = regions.flatMap((r) => r.nodes).filter((nd) => content.encounters[nd.encounter]);
    const lastOfFirst = regions[0].nodes[regions[0].nodes.length - 1].id;
    s.campaign.heldNodes = nodes.map((nd) => nd.id).filter((id) => id !== lastOfFirst);
    s.campaign.notoriety = 9999;
    s.campaign.contested = [{ nodeId: s.campaign.heldNodes[0], startedAt: t0,
      scheduledAt: t0, deadline: now + 3 * HOUR, gen: 1 }];
    s.campaign.captives = [{ id: 'h-cap', chimera: structuredClone(s.chimeras[0]),
      capturedAt: t0, deadline: now + 5 * HOUR, captor: null }];
    s.dominionAt = t0;
    s.gauntletBeaten = [];

    // Two bays: one waiting on a decision, one already in a programme, so
    // Salvage, Rehabilitate, Enrichment session and End programme all render.
    //
    // The specimen has to be a GENERATED one — a rival's chimera, which
    // carries a genome — not an `enemies.json` unit. Measured: 0 of the 42
    // authored units are rehabilitable, because every one of them is a squad
    // or a machine and "is not, in the end, an animal". A bay stocked from
    // the catalogue renders "Salvage" and nothing else, and the Rehabilitate
    // button this gate is meant to press would never be drawn.
    const rivalUnit = rivalTeam(s, rivalList(content)[0], content).team[0];
    s.campaign.containment = [
      { id: 'h-bay-1', unitId: rivalUnit.id, unit: rivalUnit, capturedAt: t0, rehab: null },
      { id: 'h-bay-2', unitId: rivalUnit.id, unit: rivalUnit, capturedAt: t0,
        rehab: { startedAt: t0, until: now + HOUR, bond: 40, instability: 20,
          sessions: 1, lastSessionAt: t0 - 4 * HOUR } },
    ];

    // R82 — one loose specimen on the board, so the Labs tab paints its
    // Hunt button and this walk can press it. The fixture builds it the way
    // the world does rather than hand-rolling a unit: `tickBreakouts` needs
    // a lab that has lost to you, so the record says one has.
    s.campaign.rivals = { ...(s.campaign.rivals ?? {}),
      [rivalList(content)[0].id]: { defeats: 2, losses: 0, lastMetAt: t0 } };
    // Dated a day BEFORE the fixture's clock so the first escape is already
    // overdue by `now`: the tuning's opening delay is five hours and the
    // fixture only runs three, so arming from `t0` would leave the board
    // empty and the Hunt button unpainted.
    tickBreakouts(s, content, now, t0 - 24 * HOUR);

    // A job in the field and an unread report from the last one.
    const op = operationList(content)[0];
    s.campaign.operations = [{ opId: op.id, chimeraId: null, startedAt: t0,
      until: now + HOUR, chance: 0.5,
      outcome: { success: true, funds: 120, species: null, injuryRoll: 0.9 } }];
    s.campaign.opReport = { opId: op.id, success: true, funds: 120, species: null,
      chimeraName: null, injured: false };
    return s;
  };

  // The surfaces. A screen is one; so is every sub-tab, the briefing behind a
  // node, the arena behind a launch, the settings panel behind the gear, and
  // the picker sheet behind a field. `path` names the controls to press to
  // GET there — the gate's own answer to "what prior click would be needed".
  const SURFACES = [];
  for (const { screen, fn, file } of shellScreenMap()) {
    // The War Room's tab is PINNED rather than inherited. Leaving it to
    // module state made the whole walk a function of what ran before it: a
    // second walk in one process rendered Labs here and reported 54 handlers
    // "vanished" that were fine.
    SURFACES.push({ name: screen, file, fn, path: [], subtab: screen === 'battle' ? 'map' : null });
  }
  for (const tab of WAR_TABS) {
    SURFACES.push({ name: `battle:${tab.id}`, file: 'campaign/ui.js', fn: 'renderWarRoomScreen',
      subtab: tab.id, path: [] });
  }
  // The Dex keeps its tab list module-private, so the gate reaches the other
  // tabs the way a player does — by pressing each one in the bar. `fanout`
  // means "one surface per control matching this", counted at run time, so a
  // seventh tab is walked the day it lands.
  SURFACES.push({ name: 'dex', file: 'splice/dex-ui.js', fn: 'renderDexScreen',
    path: [], fanout: '[data-dex-tab]' });
  SURFACES.push({ name: 'battle:briefing', file: 'campaign/ui.js', fn: 'renderWarRoomScreen',
    subtab: 'map', path: [{ sel: '[data-node]' }] });
  SURFACES.push({ name: 'battle:spar-briefing', file: 'campaign/ui.js', fn: 'renderWarRoomScreen',
    subtab: 'map', path: [{ sel: '[data-spar]' }] });
  // R82: the briefing behind a loose specimen. It lives on the Labs tab, not
  // the map, which is exactly the reachability the walk exists to prove — a
  // Hunt button nothing can press is a fight nobody can have.
  SURFACES.push({ name: 'battle:loose-briefing', file: 'campaign/ui.js', fn: 'renderWarRoomScreen',
    subtab: 'labs', path: [{ sel: '[data-breakout]' }] });
  // A picker sheet per field, on every screen that has one. `path` stays
  // EMPTY here: the fanout is what presses the field, and a surface that
  // consumed its own control in the path would probe zero of them.
  for (const [name, file, fn] of [
    ['ranch', 'ranch/ui.js', 'renderRanchScreen'],
    ['theater', 'splice/theater-ui.js', 'renderTheaterScreen'],
    ['pens', 'splice/pens-ui.js', 'renderPensScreen'],
    // (No Vault entry: the Gene Vault has no picker field. The fanout check
    // below says so out loud rather than quietly walking an empty family.)
  ]) {
    SURFACES.push({ name: `${name}:picker`, file, fn, path: [], fanout: '[data-picker]' });
  }

  const overlay = recordingRoot();
  const picker = recordingRoot();
  const docBound = [];   // listeners bound on `document` itself — see installDom
  // TWO slots, one of them not the active one, so the settings panel draws
  // Switch and Delete. With the default single-slot registry those two
  // controls do not exist and "every control fired" would be true of a
  // screen that renders half of itself.
  const storage = memoryStorage({
    spliceworld_slots: JSON.stringify({ activeId: 1, slots: [
      { id: 1, name: null, createdAt: t0, lastPlayedAt: t0 },
      { id: 2, name: 'Annex', createdAt: t0, lastPlayedAt: t0 },
    ] }),
  });
  const restoreDom = installDom({ overlay, picker, docBound, storage });

  const now = t0 + 3 * HOUR;
  const painted = new Set();
  const fired = new Set();              // attributes a fired element CARRIED
  const firedBySelector = new Set();    // attributes a handler was BOUND BY
  const failures = [];
  let totalFired = 0;

  // A handler's identity across renders: what it listens for, what selected
  // it, what it carries, and which of its identical siblings it is.
  const keysOf = (list) => {
    const seen = new Map();
    return list.map((h) => {
      const base = `${h.type}|${h.sel}|${JSON.stringify(h.el?.dataset ?? {})}`;
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      return `${base}#${n}`;
    });
  };
  const selectorAttr = (sel) => String(sel).match(/\[data-([\w-]+)/)?.[1] ?? null;

  // One handler, fired against a screen rendered FRESH for it. Firing a whole
  // snapshot in sequence is not the same test: the third handler runs against
  // whatever the first two did to the state, and a handler that re-renders
  // leaves every handler after it holding an element that no longer exists.
  // That is not a bug in the game — it is a bug in the harness, and it showed
  // up as `#wr-launch` reading `draftTarget.kind` after `#wr-back` had cleared
  // it, a sequence no player can produce.
  const runSurface = async (surface, plannedKey) => {
    const state = fixture(now);
    // A FRESH MODULE INSTANCE, not just a fresh state. `campaign/ui.js` keeps
    // `warTab`, `draftTarget` and `draftTeam` at module scope; firing the
    // Jobs tab on one pass left every later pass rendering Jobs, so `live`
    // collapsed from 72 handlers to 17 and the loop walked off the end —
    // silently, because a missing index just returned. 57 of the War Room's
    // 72 handlers were never fired at all, including every Spar button and
    // Assault, Defend and Rescue. The audit measured it; the fix is that a
    // run gets its own copy of the module and cannot inherit yesterday.
    const mod = await import(`../${surface.file}?run=${runNonce++}`);
    storage.reset();
    // The overlay and the picker are shared hosts, so a surface that does not
    // reset them inherits every binding the last one left behind and fires
    // handlers whose elements no longer exist.
    overlay.bound.length = 0;
    picker.bound.length = 0;
    docBound.length = 0;
    const root = recordingRoot();
    let pending = surface.subtab ?? null;
    const ctx = {
      state, content, now: () => now, save: () => {}, refreshTicker: () => {},
      pushNews: () => {}, onExtract: () => {}, goto: () => {}, applyTheme: () => {},
      takeSubtab: () => { const v = pending; pending = null; return v; },
    };
    let live;
    if (surface.settings) {
      const before = overlay.bound.length;
      openSettings(overlay.host, ctx);
      live = overlay.bound.slice(before);
    } else if (surface.arena) {
      state.battle = surface.arena(state);
      renderArena(root.host, ctx, () => {});
      live = root.bound.slice();
    } else {
      mod[surface.fn](root.host, ctx);
      // Every fold open, or the handlers behind them are never bound at all.
      // R72's fixture forced this with a Proxy on `ui.collapsed`; that state
      // then failed `structuredClone` the moment a handler tried to copy the
      // save (New slot did), which is a harness artefact masquerading as a
      // bug. So it is done the way a player does it: render, read the fold
      // ids the screen actually painted, open those, render again — and
      // repeat, because a fold can hold another fold.
      for (let pass = 0; pass < 4; pass++) {
        const ids = [...String(root.host.innerHTML).matchAll(/data-fold="([^"]*)"/g)].map((m) => m[1]);
        state.ui ??= {};
        state.ui.collapsed ??= {};
        let opened = 0;
        for (const id of ids) {
          if (state.ui.collapsed[id] !== false) { state.ui.collapsed[id] = false; opened++; }
        }
        if (!opened) break;
        mod[surface.fn](root.host, ctx);
      }
      live = root.bound.slice();
    }
    for (const step of surface.path) {
      const hits = live.filter((h) => String(h.sel).includes(step.sel));
      const pre = hits[step.nth ?? 0];
      if (!pre) return { live, root, ctx, missing: `${step.sel}[${step.nth ?? 0}]` };
      const before = root.bound.length;
      const pickedBefore = picker.bound.length;
      const overlayBefore = overlay.bound.length;
      const docBefore = docBound.length;
      const preCarried = attrsOfFire(pre);
      for (const a of preCarried) fired.add(a);
      const preSel = selectorAttr(pre.sel);
      if (preSel && preCarried.has(preSel)) firedBySelector.add(preSel);
      try { pre.fn(fakeEvent(pre.el)); } catch (err) {
        failures.push(`${surface.name}: path ${step.sel} threw ${err.constructor.name}: ${err.message}`);
        return { live, root, ctx };
      }
      // Where the live handlers came from decides where the surface now IS:
      // a control that opens a sheet moves it into the picker or the overlay.
      const grown = root.bound.slice(before);
      const intoPicker = picker.bound.slice(pickedBefore);
      const intoOverlay = overlay.bound.slice(overlayBefore);
      const intoDoc = docBound.slice(docBefore);
      live = (intoPicker.length ? intoPicker
        : intoOverlay.length ? intoOverlay
          : grown.length ? grown : live).concat(intoDoc);
    }
    if (plannedKey === null) return { live, root, ctx, keys: keysOf(live) };
    // Found by KEY, not by index. If the handler the probe saw is not here,
    // that is a failure and not a shrug — the silent `return` this replaces
    // is exactly how 57 handlers went unfired without a word.
    const keys = keysOf(live);
    const at = keys.indexOf(plannedKey);
    if (at === -1) {
      failures.push(`${surface.name}: the handler ${plannedKey} vanished between renders — the walk is not reproducible`);
      return { live, root, ctx, keys };
    }
    const h = live[at];
    const carried = attrsOfFire(h);
    for (const a of carried) fired.add(a);
    // A control counts as PRESSED only when the element the handler ran on
    // actually carried the attribute it was selected by. Crediting the
    // selector alone let a bind against a control the screen had stopped
    // painting read as coverage.
    const bySel = selectorAttr(h.sel);
    if (bySel && carried.has(bySel)) firedBySelector.add(bySel);
    totalFired++;
    try { h.fn(fakeEvent(h.el)); } catch (err) {
      failures.push(`${surface.name}: ${h.sel} [${h.type}] threw ${err.constructor.name}: ${err.message}`);
    }
    return { live, root, ctx, keys };
  };

  try {
    SURFACES.push({ name: 'settings', settings: true, file: 'save/settings-ui.js', fn: 'openSettings', path: [] });
    // The move sheet is behind a LONG PRESS, which is a `contextmenu` handler
    // sharing its selector with the tap handler — so the fanout walks both
    // and one of them opens the sheet into the overlay.
    SURFACES.push({ name: 'arena:sheet', file: 'battle/ui.js', fn: 'renderArena', path: [],
      fanout: '[data-detail]',
      arena: (state) => createBattle(state.chimeras.slice(0, 1), content.encounters.patrol_1,
        content, 7, t0, { kind: 'assault', nodeId: state.campaign.heldNodes[0] }),
    });
    SURFACES.push({
      name: 'arena', file: 'battle/ui.js', fn: 'renderArena', path: [],
      arena: (state) => createBattle(state.chimeras.slice(0, 1), content.encounters.patrol_1,
        content, 7, t0, { kind: 'assault', nodeId: state.campaign.heldNodes[0] }),
    });

    // `fanout` expands before the walk: probe the surface once, count the
    // controls it names, and queue one derived surface per control.
    for (const surface of SURFACES.filter((f) => f.fanout)) {
      const probe = await runSurface(surface, null);
      const n = probe.live.filter((h) => String(h.sel).includes(surface.fanout)).length;
      if (!n) failures.push(`${surface.name}: fanout ${surface.fanout} matched nothing — the whole family is gone`);
      for (let k = 0; k < n; k++) {
        SURFACES.push({ ...surface, fanout: null, name: `${surface.name}#${k}`,
          path: [...surface.path.filter((p) => p.sel !== surface.fanout), { sel: surface.fanout, nth: k }] });
      }
    }

    for (const surface of SURFACES) {
      if (surface.fanout) continue;                    // the probe stands in for it
      const probe = await runSurface(surface, null);
      for (const a of probe.root.painted) painted.add(a);
      for (const a of overlay.painted) painted.add(a);
      for (const a of picker.painted) painted.add(a);
      if (probe.missing) {
        failures.push(`${surface.name}: cannot reach ${probe.missing} — the fixture no longer renders it`);
        continue;
      }
      // A surface that binds nothing is a surface that proves nothing, and a
      // global floor cannot see it: the arena alone satisfied every one.
      if (!probe.keys.length) {
        failures.push(`${surface.name}: binds no handlers at all`);
        continue;
      }
      for (const key of probe.keys) {
        const after = await runSurface(surface, key);
        for (const a of after.root.painted) painted.add(a);
        for (const a of overlay.painted) painted.add(a);
        for (const a of picker.painted) painted.add(a);
      }
    }
  } finally {
    restoreDom();
  }


  // THE CRITERION. Every `data-*` the game paints has had a handler run
  // holding it. The denominator comes from the painted HTML and from the
  // source, so a control that no surface renders still counts against us
  // rather than quietly leaving the set.
  const inSource = new Set();
  const literalSelector = new Set();
  for (const f of [...moduleFiles(root), join(root, 'index.html')]) {
    const rel = relative(root, f).replaceAll('\\', '/');
    if (rel.startsWith('tools/')) continue;
    const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
    for (const a of dataAttrsIn(src)) inSource.add(a);
    // `ui/tabs.js` writes EVERY sub-tab button as `data-${attr}=`, which the
    // regex above is structurally unable to see. Those attributes were in the
    // denominator only because the walk itself painted them — so deleting a
    // sub-tab bar removed the attribute AND the surface that pressed it in
    // one move, and the criterion was satisfied by a smaller world. The names
    // are right there in the call, so they are read from the call.
    for (const m of src.matchAll(/attr:\s*'([\w-]+)'/g)) inSource.add(m[1]);
    // A SELECTOR is a source of truth too. `[data-switch-slot]` has no `=`,
    // so the paint-shaped regex above cannot see it — which meant deleting
    // the Switch button removed the attribute from the denominator along
    // with its own coverage, and the gate went green on a dead binder.
    for (const m of src.matchAll(/\[data-([a-z][\w-]*)[\]~^$*|=]/g)) {
      inSource.add(m[1]);
      literalSelector.add(m[1]);
    }
  }

  // Two kinds of exemption, kept apart because they are not the same claim.
  //
  // MARKERS are not controls at all: an attribute carried so the stylesheet
  // or a sibling handler can find the row, with nothing listening for it. The
  // gate PROVES that below rather than taking the comment's word — a marker
  // that quietly grows a handler is a hole with a comment on it.
  // The stated reason used to be that a stylesheet or a sibling handler finds
  // the row by these. Neither is true: the dismiss button carries its own
  // `data-dismiss-guide`, each slot button carries its own `data-*-slot`, and
  // neither name appears in style.css. They are simply unused — which is a
  // fine reason to exempt them, and the only honest one to write down.
  const MARKERS = {
    guide: 'painted on the field-note <section> and read by nothing; the dismiss button carries its own id',
    slot: 'painted on the slot <li> and read by nothing; Switch, Rename and Delete each carry their own id',
  };
  // ELSEWHERE is a real control that no screen render binds, so this walk
  // cannot reach it — and something else must. `data-screen` is the shell's
  // own nav, bound once in `main.js` at boot; `tools/a11y.js` clicks all six
  // tabs in a real browser at 380px, which is a better test of it than a stub
  // would be. Listing it here is an admission, not a dismissal.
  const ELSEWHERE = {
    screen: 'index.html nav, bound in main.js at boot — exercised by tools/a11y.js in a real browser',
  };

  // The proof. A literal reader is `dataset.thing` or a `[data-thing]`
  // selector; the tree also builds selectors dynamically (`[data-${attr}]` in
  // campaign/ui.js and ui/tabs.js), which no static check can resolve — those
  // attributes are all covered by the walk, so a marker cannot hide there.
  for (const [attr, why] of Object.entries(MARKERS)) {
    const camelAttr = attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const readers = [];
    // The same files the denominator reads, plus the stylesheet — the claim
    // being policed is "nothing reads this", and a CSS rule is a reader.
    for (const f of [...moduleFiles(root), join(root, 'index.html'), join(root, 'style.css')]) {
      const rel = relative(root, f).replaceAll('\\', '/');
      if (rel.startsWith('tools/')) continue;
      const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
      if (new RegExp(`dataset\\.${camelAttr}\\b|\\[data-${attr}[\\]~^$*|=]`).test(src)) readers.push(rel);
    }
    if (readers.length) {
      failures.push(`data-${attr} is listed as a marker (${why}) but ${readers.join(', ')} reads it — it is a control`);
    }
  }

  const denominator = new Set([...inSource, ...painted]);
  for (const m of [...Object.keys(MARKERS), ...Object.keys(ELSEWHERE)]) denominator.delete(m);
  // Two claims, not one, because they are not the same strength — the audit
  // was right that "every data-* handler has been fired" read stronger than
  // the code proved. An attribute is either:
  //
  //   a CONTROL — something binds a handler by `[data-x]`, so a handler bound
  //     BY THAT SELECTOR has to have run; or
  //   a PARAMETER — nothing ever selects on it. It rides on a control and is
  //     read off `dataset`, so it is covered when a fired element carried it.
  //
  // Seven of the 41 are parameters (`animal`, `care`, `egg`, `track`,
  // `subtab`, `frame`, `value`). Saying which is which is the honest version
  // of "41 of 41".
  const missed = [...denominator].filter((a) => {
    if (firedBySelector.has(a)) return false;      // a control, and it was pressed
    if (literalSelector.has(a)) return true;       // a control, and it was NOT
    return !fired.has(a);                          // a parameter, never carried
  }).sort();
  const controls = [...denominator].filter((a) => firedBySelector.has(a) || literalSelector.has(a)).sort();
  const parameters = [...denominator].filter((a) => !controls.includes(a)).sort();

  if (report) {
    for (const a of [...denominator].sort()) console.log(`  ${fired.has(a) ? '✓' : '·'} data-${a}`);
    for (const [m, why] of Object.entries(MARKERS)) console.log(`  – data-${m}  (marker: ${why})`);
    for (const [m, why] of Object.entries(ELSEWHERE)) console.log(`  – data-${m}  (elsewhere: ${why})`);
  }
  return {
    failures: [...new Set(failures)],
    totalFired,
    surfaces: SURFACES.filter((f) => !f.fanout).length,
    denominator: [...denominator].sort(),
    controls,
    parameters,
    fired: [...fired].sort(),
    missed,
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const started = Date.now();
  const r = await walkSurfaces(loadContent(), { report: process.argv.includes('--report') });
  for (const f of r.failures) console.error(`handlers ✗  ${f}`);
  for (const m of r.missed) console.error(`handlers ✗  data-${m} is painted and nothing ever fired for it`);
  const bad = r.failures.length + r.missed.length;
  if (bad) { console.error(`\nhandlers ✗  ${bad} problem${bad === 1 ? '' : 's'} (${Date.now() - started}ms)`); process.exit(1); }
  console.log(`handlers ✓  ${r.totalFired} fired across ${r.surfaces} surfaces · ${r.controls.length} controls pressed, ${r.parameters.length} parameters carried (${Date.now() - started}ms)`);
}
