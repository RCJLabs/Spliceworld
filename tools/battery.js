// R76 — THE BREAK BATTERY. One deliberate break per gate; each must go RED.
//
// A gate that has never failed is a rumour. This copies the tree to a temp
// directory, injects one defect at a time, runs the gate it is aimed at, and
// asserts the gate REFUSES. Every previous milestone ran a battery like this
// by hand and wrote the score into PROGRESS.md; the audit's fair complaint
// was that a headline number nothing in the repo can reproduce is not
// evidence. So it is a tool now.
//
//   node tools/battery.js            # exit 1 if any break survives
//   node tools/battery.js --verbose  # the gate's own words for each
//
// Every patch is applied by UNIQUE ANCHOR: if the anchor text does not appear
// exactly once, the break reports BADANCH and is scored as a failure rather
// than a pass. That rule exists because a break once patched an identical
// earlier line and was quietly scored green.
//
// The baseline runs first. A gate that fails on everything "catches" every
// break for free, so the pristine tree has to pass before any of this counts.

import { cpSync, readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
// R86: break 50 used to hardcode the save version and went BADANCH on three
// milestones running. It is read off the source now, so bumping SAVE_VERSION
// moves the break with it.
import { SAVE_VERSION } from '../save/save.js';

const SRC = dirname(dirname(fileURLToPath(import.meta.url)));
const DIR = mkdtempSync(join(tmpdir(), 'sw-battery-'));
cpSync(SRC, DIR, {
  recursive: true,
  filter: (p) => !p.includes('/.git') && !p.includes('/node_modules'),
});

const SCOPE = ['node', 'tools/scopecheck.js'];
const HANDLERS = ['node', 'tools/handlers.js'];
// Two walks in one process must fire the same handlers. The gate's own result
// used to depend on what ran before it, which no single-run check can see.
const TWICE = ['node', '-e', `
  const { walkSurfaces, loadContent } = await import('./tools/handlers.js');
  const c = loadContent();
  const a = await walkSurfaces(c);
  const b = await walkSurfaces(c);
  if (a.totalFired !== b.totalFired || b.failures.length) {
    console.error('twice ✗  ' + a.totalFired + ' then ' + b.totalFired + ', ' + b.failures.length + ' failures');
    process.exit(1);
  }
  console.log('twice ✓  ' + a.totalFired + ' both times');
`];

// R80 — the keyboard gate. Slow (it launches a browser) and worth it: it is
// the only gate in the battery that presses keys, and the defects it exists
// to catch are all of the form "works with a mouse, does nothing without
// one", which no static read can see. If Chromium is missing it exits
// nonzero, the baseline below prints FAIL, and the battery says so rather
// than scoring seven breaks green for free.
const A11Y = ['node', 'tools/a11y.js'];

// R81 — the boot gate. The other browser gate asks what the game LOOKS like;
// this one asks what it costs to get there, which no static read can answer:
// the split between "before the game is on screen" and "after" is a fact
// about a running browser and nothing else.
const BOOT = ['node', 'tools/boot.js'];

// R84 — a grade sharpens and changes nothing else, as its own gate: what it
// guards is one rule over 244 parts and the smoke suite takes twelve minutes.
// Read through `movesFromTokens`, which is the function the Pens renders
// from, so what is checked is what the player is shown.
const GRADE = ['node', '-e', `
  const { readFileSync } = await import('node:fs');
  const { indexContent } = await import('./render/renderer.js');
  const { movesFromTokens } = await import('./battle/statblock.js');
  const { analyze } = await import('./splice/physiology.js');
  const { GRADES } = await import('./splice/extract.js');
  const J = (n) => JSON.parse(readFileSync('data/' + n + '.json', 'utf8'));
  const files = ['frames','parts','species','combos','enemies','keywords','classes','traits','parts-shapes','enemies-shapes'];
  const content = indexContent(Object.fromEntries(files.map((n) => [n, J(n)])));
  const bad = [];
  for (const part of Object.values(content.parts).filter((p) => p.move)) {
    const rows = GRADES.map((g, tier) => {
      const tokens = [{ id: 'g', partId: part.id, grade: g.id,
        donor: { name: 'D', species: part.species, stars: 3, extractedAt: 0 } }];
      return { tier, g: g.id, m: movesFromTokens(tokens, analyze('M', tokens, content), content)
        .find((x) => x.name === part.ability) };
    });
    if (rows.some((r) => !r.m)) { bad.push(part.id + ': the move vanishes at some grade'); continue; }
    const base = rows[0].m;
    const keys = (m) => JSON.stringify(Object.keys(m.keywords ?? {}).sort());
    for (const { tier, g, m } of rows) {
      if (m.name !== base.name || m.cost !== base.cost || m.acc !== base.acc || keys(m) !== keys(base)) {
        bad.push(part.id + ' @' + g + ': a grade changed something other than power');
      }
      if (m.power !== Math.round(part.move.power * (1 + tier * 0.12))) {
        bad.push(part.id + ' @' + g + ': power is ' + m.power + ', not 12% per tier');
      }
    }
  }
  if (bad.length) { console.error('grade ✗  ' + bad.length + ' — ' + bad.slice(0, 3).join('; ')); process.exit(1); }
  console.log('grade ✓  a grade sharpens, and changes nothing else');
`];

// R81 — the pairing, as its own gate rather than through the whole smoke
// suite: what it guards is one assertion and the suite takes ten minutes.
// `parts.json` says what a part IS and `parts-shapes.json` says what it looks
// like; enemies.json is HAND-AUTHORED, so adding a unit now means adding it
// in two places and this is what says so.
const SMOKE_PAIR = ['node', '-e', `
  const { readFileSync } = await import('node:fs');
  const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
  let bad = [];
  for (const [what, core, shapeFile, key] of [
    ['parts', 'data/parts.json', 'data/parts-shapes.json', 'parts'],
    ['units', 'data/enemies.json', 'data/enemies-shapes.json', 'units'],
  ]) {
    const list = J(core)[key];
    const { shapes } = J(shapeFile);
    const ids = new Set(list.map((x) => x.id));
    for (const x of list) if (!shapes[x.id]?.length) bad.push(what + ': ' + x.id + ' has no geometry');
    for (const id of Object.keys(shapes)) if (!ids.has(id)) bad.push(what + ': geometry for ' + id + ', which does not exist');
    for (const x of list) if ('shapes' in x) bad.push(what + ': ' + x.id + ' still carries geometry in ' + core);
  }
  if (bad.length) { console.error('pair ✗  ' + bad.slice(0, 4).join('; ')); process.exit(1); }
  console.log('pair ✓  every part and every unit has exactly one body');
`];

// R85 — a neglected creature is warned before it is taken, and the taking is
// a loan. Its own gate rather than the smoke suite's, for the usual reason:
// the suite takes twelve minutes and this is four assertions. Runs the same
// engine the Pens renders from, on the one clock.
const FERAL = ['node', '-e', `
  const { readFileSync } = await import('node:fs');
  const { indexContent } = await import('./render/renderer.js');
  const { CONTENT_FILES: files } = await import('./data/loader.js');
  const { newGameState } = await import('./save/save.js');
  const { spliceChimera } = await import('./splice/theater.js');
  const { feralTuning, feralStatus, attend, tickFeral } = await import('./splice/feral.js');
  const { impound } = await import('./campaign/rehab.js');
  const { agenda } = await import('./ranch/agenda.js');
  const R = (p) => JSON.parse(readFileSync('./data/' + p + '.json', 'utf8'));
  const content = indexContent(Object.fromEntries(files.map((n) => [n, R(n)])));
  const T = feralTuning(content), HR = 3600000, t0 = 1700000000000;
  const startsAt = t0 + T.neglectHours * HR, endsAt = startsAt + T.windowHours * HR;
  const mk = (seed) => {
    const s = { ...newGameState(), seed, funds: 99999 };
    s.inventory.parts = [{ id: 'k1', partId: 'bear_head', grade: 'prime',
      donor: { name: 'U', species: 'bear', stars: 4, extractedAt: t0 } }];
    const r = spliceChimera(s, 'M', { head: 'k1' }, content, t0);
    if (!r.ok) throw new Error('fixture: ' + r.msg);
    const ch = s.chimeras[0];
    ch.instability = T.instabilityAt; ch.bond = 0;
    return { s, ch };
  };
  const bad = [];
  // Built unstable is not a crime.
  { const { s, ch } = mk(1);
    if (feralStatus(ch, content, t0).atRisk) bad.push('a chimera is at risk the moment it is spliced');
    if (tickFeral(s, content, t0).gone.length) bad.push('and the tick takes it'); }
  // Bond past the floor is the durable answer.
  { const { s, ch } = mk(2); ch.bond = T.bondFloor;
    if (feralStatus(ch, content, endsAt * 2).atRisk) bad.push('a bonded creature can still go feral'); }
  // The deadline is scheduled, not rolled: many small ticks agree with one big one.
  { const one = mk(3); tickFeral(one.s, content, startsAt);
    if (one.ch.agitatedAt !== startsAt) bad.push('the tick does not open the window');
    // R9's exemption: a fortnight away must not cost an animal the player
    // was never given the chance to answer for. Ticked late on purpose —
    // at the moment the condition is met, opening on sight and back-dating
    // are the same number.
    const late = mk(3); const fortnight = t0 + 14 * 24 * HR;
    if (tickFeral(late.s, content, fortnight).gone.length) bad.push('two weeks away cost a creature');
    if (late.ch.agitatedAt !== fortnight) bad.push('the window does not open when the player looks');
    const many = mk(3); const step = (endsAt - t0) / 400; let lost = 0;
    for (let at = t0; at < endsAt; at += step) lost += tickFeral(many.s, content, at).gone.length;
    if (lost) bad.push('checking in often cost a creature — the window is a roll, not a deadline');
    if (Math.abs((many.ch.agitatedAt ?? 0) - startsAt) > step) bad.push('small ticks and one big tick disagree'); }
  // Attending clears it, and the player was told first.
  { const { s, ch } = mk(4); tickFeral(s, content, startsAt);
    if (!feralStatus(ch, content, startsAt).agitated) bad.push('a neglected creature is never warned');
    if (!agenda(s, content, startsAt).some((i) => i.id === 'settle')) bad.push('the agenda never says so');
    attend(ch, startsAt + HR);
    if (feralStatus(ch, content, startsAt + HR).atRisk) bad.push('working with it does not clear the warning');
    const r = tickFeral(s, content, startsAt + HR);
    if (ch.agitatedAt !== null || r.news.length !== 1) bad.push('and the tick neither clears it nor says so');
    if (tickFeral(s, content, endsAt + HR).gone.length) bad.push('it was taken anyway'); }
  // A missed window is a loan, not a loss.
  { const { s, ch } = mk(5); ch.xp = 4200; ch.moveset = ['a','b','c','d'];
    tickFeral(s, content, startsAt);
    const gone = tickFeral(s, content, endsAt).gone;
    if (gone.length !== 1) { bad.push('a missed window costs nothing'); }
    else { impound(s, gone[0], content, endsAt);
      const bay = s.campaign.containment[0];
      if (!bay || bay.chimera !== ch || bay.chimera.xp !== 4200 || bay.chimera.moveset.length !== 4) {
        bad.push('the bay does not hold the creature itself'); } } }
  if (bad.length) { console.error('feral ✗  ' + bad.join('; ')); process.exit(1); }
  console.log('feral ✓  warned, answerable, scheduled, and given back');
`];

// R86 — a rush buys time and nothing else. Its own gate, for the usual
// reason: the smoke suite takes twelve minutes and this is one save, two
// copies and a handful of comparisons. Same functions the buttons call.
const RUSH = ['node', '-e', `
  const { readFileSync } = await import('node:fs');
  const { indexContent } = await import('./render/renderer.js');
  const { CONTENT_FILES: files } = await import('./data/loader.js');
  const { newGameState } = await import('./save/save.js');
  const { spliceChimera } = await import('./splice/theater.js');
  const { startVat } = await import('./splice/chaos.js');
  const { tickWorld } = await import('./campaign/world.js');
  const { treatmentCost } = await import('./splice/scars.js');
  const { rush, rushable, rushPrice, RUSH_KINDS, rushLines } = await import('./splice/rush.js');
  const R = (p) => JSON.parse(readFileSync('./data/' + p + '.json', 'utf8'));
  const content = indexContent(Object.fromEntries(files.map((n) => [n, R(n)])));
  const t0 = 1700000000000, HR = 3600000;
  const s = { ...newGameState(), seed: 8601, funds: 50000 };
  s.facility = { theater: 2, containment: 1, incubator: 1, extractor: 1, scanner: 1, infirmary: 1 };
  s.lastTickAt = t0;
  const tok = (id, partId) => ({ id, partId, grade: 'prime', donor: { name: 'D', species: partId.split('_')[0], stars: 3, extractedAt: t0 } });
  s.inventory.parts.push(tok('a1','bear_head'), tok('a2','bear_organ'), tok('b1','goat_head'), tok('b2','goat_organ'), tok('c1','cobra_head'), tok('c2','wolf_tail'));
  for (const [h, o] of [['a1','a2'],['b1','b2']]) { const m = spliceChimera(s, 'M', { head: h, organ: o }, content, t0 - 10 * HR); if (!m.ok) throw new Error(m.msg); }
  for (const c of s.chimeras) { c.settleUntil = t0 - HR; c.bond = 50; }
  const mC = spliceChimera(s, 'M', { head: 'c1', tail: 'c2' }, content, t0); if (!mC.ok) throw new Error(mC.msg);
  const C = s.chimeras[2];
  const v = startVat(s, s.chimeras[0].id, s.chimeras[1].id, content, t0); if (!v.ok) throw new Error(v.msg);
  const base = structuredClone(s);
  const bad = [];
  if (JSON.stringify([...RUSH_KINDS].sort()) !== JSON.stringify(['egg','resequencer','settle','vat'])) bad.push('the registry is not exactly the four sealed clocks (' + RUSH_KINDS.join(',') + ')');
  { const t = structuredClone(base);
    for (const k of ['train','care','growth','rehab','job']) { const r = rush(t, k, C.id, content, t0); if (r.ok || r.msg !== rushLines(content).refusal) bad.push(k + ' is for sale'); }
    if (t.funds !== base.funds) bad.push('a refusal charged money'); }
  const t1 = t0 + 60000;
  const wait = structuredClone(base); tickWorld(wait, content, Math.max(base.vat.until, C.settleUntil) + 60000);
  const rushed = structuredClone(base); let spent = 0;
  for (const q of rushable(rushed, content, t1)) { const r = rush(rushed, q.kind, q.id, content, t1); if (!r.ok) bad.push(q.kind + ': ' + r.msg); else spent += r.cost; }
  if (base.funds - rushed.funds !== spent || spent <= 0) bad.push('the money did not move exactly once (' + (base.funds - rushed.funds) + ' vs ' + spent + ')');
  tickWorld(rushed, content, t1);
  const shape = (c) => c && JSON.stringify({ f: c.frame, t: Object.entries(c.tokens).map(([k, x]) => k + ':' + x.partId + '@' + x.grade), n: c.name, i: c.instability });
  const cw = wait.chimeras.find((c) => c.vatBorn), cr = rushed.chimeras.find((c) => c.vatBorn);
  if (!cw || !cr) bad.push('a vat did not decant');
  else if (shape(cw) !== shape(cr)) bad.push('the rushed vat decanted a DIFFERENT child');
  const tw = wait.chimeras.find((c) => c.id === C.id).temperament, tr = rushed.chimeras.find((c) => c.id === C.id).temperament;
  if (!tw || !tr || JSON.stringify(tw) !== JSON.stringify(tr)) bad.push('the rushed settle produced a different temperament');
  { const h = structuredClone(base); const ch = h.chimeras[0];
    for (const hrs of [0.5, 2, 6]) { ch.injury = { name: 'x', until: t0 + hrs * HR };
      if (treatmentCost(ch, content, t0) !== rushPrice(hrs * HR, content)) bad.push('treatment at ' + hrs + 'h is not the rush price'); } }
  { const p = structuredClone(base); p.funds = 10; const before = p.vat.until;
    const r = rush(p, 'vat', 'vat', content, t1); if (r.ok || p.funds !== 10 || p.vat.until !== before) bad.push('a rush went through with no money'); }
  if (bad.length) { console.error('rush ✗  ' + bad.join('; ')); process.exit(1); }
  console.log('rush ✓  four sealed clocks, one price — rushed and waited agree');
`];

const VERBOSE = process.argv.includes('--verbose');

// The R78 replay, at the unit level. A month away with a convoy already at
// the gate must still replay the month — a chaotic forty-day walk is where
// this was FOUND, but it is a bad place to keep it honest, and far too slow
// to aim a break at.
const CONTEST = ['node', '-e', `
  const { readFileSync } = await import('node:fs');
  const { indexContent } = await import('./render/renderer.js');
  const { tickContests } = await import('./campaign/contest.js');
  const { newGameState } = await import('./save/save.js');
  const R = (p) => JSON.parse(readFileSync('./data/' + p + '.json', 'utf8'));
  const { CONTENT_FILES: files } = await import('./data/loader.js');
  const content = indexContent(Object.fromEntries(files.map((n) => [n, R(n)])));
  const HOUR = 3600000, t0 = 1700000000000;
  const region = Object.values(content.regions)[0];
  const s = { ...newGameState(), seed: 5 };
  s.campaign.heldNodes = region.nodes.map((n) => n.id);
  s.campaign.notoriety = 9999;
  tickContests(s, content, t0, 2);
  tickContests(s, content, t0 + 10 * HOUR, 2);
  const open = s.campaign.contested[0];
  if (!open) { console.error('contest ✗  the fixture never opened a contest'); process.exit(1); }
  const count = s.campaign.contestCount;
  const back = t0 + (10 + 30 * 24) * HOUR;
  const res = tickContests(s, content, back, 2);
  const replayed = s.campaign.contestCount - count;
  const ordered = res.missed.every((m) => m.arrivedAt >= open.deadline && m.leftAt <= back);
  if (replayed < 10 || res.missed.length < 10 || !ordered) {
    console.error('contest ✗  replayed ' + replayed + ', missed ' + res.missed.length + ', ordered ' + ordered);
    process.exit(1);
  }
  console.log('contest ✓  ' + replayed + ' convoys replayed past the one at the gate');
`];


// R79 — the retired-content fixture, at the speed a battery can afford.
//
// smoke.js runs the full version (every screen, every Dex tab, the sim, the
// vault, the gauntlet, the campaign walk). This is the same shape trimmed to
// what a break needs to feel: retire a part, a grade, a species, a frame, an
// enemy, a class and a node, then render all six screens and fight one
// encounter whose first wave is gone.
const RETIRED = ['node', '-e', `
  const { readFileSync } = await import('node:fs');
  const { indexContent } = await import('./render/renderer.js');
  const { newGameState } = await import('./save/save.js');
  const { createAnimal } = await import('./ranch/ranch.js');
  const { spliceChimera } = await import('./splice/theater.js');
  const { shellScreenMap } = await import('./tools/handlers.js');
  const { makeSimChimera, scriptedBattle, STARTER_BUILD } = await import('./tools/sim.js');
  const { gauntletStages } = await import('./campaign/gauntlet.js');
  const { warTargetEncounter } = await import('./campaign/warroom.js');
  const { renderVaultScreen } = await import('./splice/vault-ui.js');
  const R = (p) => JSON.parse(readFileSync('./data/' + p + '.json', 'utf8'));
  const { CONTENT_FILES: files } = await import('./data/loader.js');
  const load = () => indexContent(Object.fromEntries(files.map((n) => [n, R(n)])));
  const content = load();
  const retired = load();
  const HOUR = 3600000, t0 = 1700000000000;
  const PART = 'bear_hide', GRADE = 'mythic', SPECIES = 'cobra', FRAME = 'M';
  const ENEMY = 'riot_squad', CLASS = 'water', NODE = 'downtown';
  delete retired.parts[PART];
  retired.classes.storm = { id: 'storm', name: 'Storm', icon: 'lightning', cue: 'charged plating', beats: 'ground', color: '#e2703a' };
  retired.parts.goat_head.classAffinity = 'storm';
  retired.parts.goat_hindlimbs.classAffinity = 'storm';
  retired.species.goat.class = 'storm';
  delete retired.species[SPECIES];
  delete retired.frames[FRAME];
  delete retired.enemies[ENEMY];
  delete retired.classes[CLASS];
  for (const rg of Object.values(retired.regions)) rg.nodes = (rg.nodes ?? []).filter((n) => n.id !== NODE);

  const fail = (msg) => { console.error('retired ✗  ' + msg); process.exit(1); };
  const mk = () => {
    const s = { ...newGameState(), seed: 4242, funds: 20000 };
    s.facility = { theater: 2 };
    s.lastTickAt = t0;
    const grades = { cobra_head: 'apex', bear_forelimbs: 'standard', goat_hindlimbs: 'prime',
      cobra_organ: 'standard', bear_hide: 'standard', goat_tail: 'standard' };
    for (const pid of Object.keys(grades)) {
      s.inventory.parts.push({ id: 'r-' + pid, partId: pid, grade: grades[pid],
        donor: { name: 'D', species: pid.split('_')[0], stars: 3, extractedAt: t0 } });
    }
    const used = new Set(), slots = {};
    for (const pid of Object.keys(grades)) {
      const slot = content.parts[pid].slot;
      let sock = slot, n = 2;
      while (used.has(sock)) sock = slot + (n++);
      used.add(sock);
      slots[sock] = 'r-' + pid;
    }
    const made = spliceChimera(s, FRAME, slots, content, t0);
    if (!made.ok) fail('the fixture no longer splices: ' + made.msg);
    // The splice SPENDS the six tokens, so the vault needs spares of its own
    // before anything can be stamped with the retired grade.
    for (const pid of ['goat_head', 'bear_organ', 'bear_hide']) {
      s.inventory.parts.push({ id: 'sp-' + pid, partId: pid, grade: 'prime',
        donor: { name: 'Spare', species: pid.split('_')[0], stars: 2, extractedAt: t0 } });
    }
    s.dex = { parts: [PART, 'goat_head'], enemies: [ENEMY], beaten: [ENEMY], traits: [], variants: [] };
    s.discoveredCombos = Object.keys(content.combos).slice(0, 3);
    s.campaign.containment = [{ id: 'bay', unitId: 'spec', rivalId: null, capturedAt: t0, rehab: null,
      unit: { id: 'spec', name: 'Specimen', class: CLASS, hp: 80, power: 20, armor: 6, speed: 5,
        stamina: 60, regen: 8, tier: 2, tags: [], moves: [], koLine: 'It ascends, grumbling.',
        genome: { frame: FRAME, parts: { head: 'goat_head', hide: PART } } } }];
    s.campaign.heldNodes = [...(s.campaign.heldNodes ?? []), NODE];
    s.ranch = { ...s.ranch, stock: [], penCapacity: 8, animalCount: 0, seeded: true };
    for (const sp of ['goat', 'bear', SPECIES]) s.ranch.stock.push(createAnimal(s, sp, content, t0));
    s.inventory.vials = [{ id: 'v1', species: SPECIES, donorName: 'Kevin', stars: 4 }];
    s.resequencer = { vialId: 'v1', species: SPECIES, donorName: 'Kevin', stars: 4, until: t0 + 5 * HOUR };
    s.chimeras[0].tokens.head.grade = GRADE;
    s.inventory.parts[0].grade = GRADE;
    s.ui = { ...s.ui, collapsed: new Proxy({}, { get: () => false }) };
    return s;
  };
  const el = () => ({
    innerHTML: '', textContent: '', hidden: false, dataset: {}, style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, appendChild() {}, remove() {},
    querySelector: () => el(), querySelectorAll: () => [], focus() {}, click() {},
    getAttribute: () => null, setAttribute() {}, insertAdjacentHTML() {},
    closest: () => null, scrollIntoView() {},
  });
  const noted = [];
  const realError = console.error;
  console.error = (...a) => noted.push(a.join(' '));
  const ctx = { state: mk(), content: retired, now: () => t0 + 3 * HOUR, save: () => {},
    refreshTicker: () => {}, pushNews: () => {}, onExtract: () => {}, goto: () => {}, applyTheme: () => {} };
  let screens = 0;
  try {
    for (const sc of shellScreenMap()) {
      const mod = await import('./' + sc.file);
      const host = el();
      try { mod[sc.fn](host, ctx); } catch (e) { console.error = realError; fail(sc.screen + ' threw: ' + e.message); }
      const html = String(host.innerHTML);
      if (!html.length) { console.error = realError; fail(sc.screen + ' rendered nothing'); }
      for (const leak of ['undefined', 'NaN', '[object Object]']) {
        if (html.includes(leak)) { console.error = realError; fail(sc.screen + ' leaks "' + leak + '"'); }
      }
      screens++;
    }
  } finally { console.error = realError; }
  if (noted.length) fail('a screen narrated to the console: ' + noted[0]);

  // The War Room renders ONE sub-tab at a time, so the loop above only ever
  // saw its default. The rival cards — the one place a class id is read off
  // a rival record — live on Labs.
  const { WAR_TABS } = await import('./campaign/warroom.js');
  const { renderWarRoomScreen } = await import('./campaign/ui.js');
  for (const tab of WAR_TABS) {
    const host = el();
    try {
      renderWarRoomScreen(host, { state: mk(), content: retired, now: () => t0 + 3 * HOUR,
        save: () => {}, refreshTicker: () => {}, pushNews: () => {}, goto: () => {},
        takeSubtab: () => tab.id });
    } catch (e) { fail('war/' + tab.id + ' threw: ' + e.message); }
    const html = String(host.innerHTML);
    for (const leak of ['undefined', 'NaN', '[object Object]']) {
      if (html.includes(leak)) fail('war/' + tab.id + ' leaks "' + leak + '"');
    }
  }

  // The stand-ins must be the shape they stand in for — a field they lack is
  // the crash they exist to prevent, and a field they INVENT is a claim.
  const { speciesOf, frameOf, isRetired } = await import('./data/catalog.js');
  for (const [what, stand, records, exempt] of [
    ['species', speciesOf(retired, SPECIES), content.species, []],
    ['frame', frameOf(retired, FRAME), content.frames, ['torso', 'silhouette', 'shadow']],
  ]) {
    if (!isRetired(stand)) fail('the ' + what + ' stand-in does not say it is one');
    const all = Object.values(records);
    const every = Object.keys(all[0]).filter((k) => all.every((r) => k in r));
    const any = new Set(all.flatMap((r) => Object.keys(r)));
    const missing = every.filter((k) => !(k in stand) && !exempt.includes(k));
    if (missing.length) fail('the ' + what + ' stand-in is missing ' + missing.join(', '));
    const invented = Object.keys(stand).filter((k) => k !== 'retired' && !any.has(k));
    if (invented.length) fail('the ' + what + ' stand-in invents ' + invented.join(', '));
  }
  if (frameOf(retired, FRAME).slots !== undefined) fail('the retired chassis declares a slot whitelist');
  if (Array.isArray(frameOf(retired, FRAME).sockets)) fail('the retired chassis sockets are an array, not an object');

  const holed = { id: 'holed', name: 'Holed', waves: [ENEMY, 'net_trooper'], reward: 10, tier: 1 };
  const out = scriptedBattle(makeSimChimera('L', STARTER_BUILD.partIds, 'prime', retired), holed, retired, 4242, 1);
  if (!['win', 'loss', 'stall'].includes(out.outcome)) fail('a fight with a retired wave reached no outcome');

  const bossGone = { ...retired, gauntlet: [
    { id: 'g_dead', unitId: ENEMY, name: 'X', escorts: ['net_trooper'], reward: 1 },
    { id: 'g_live', unitId: 'net_trooper', name: 'Y', escorts: [ENEMY], reward: 1 } ] };
  const stages = gauntletStages(bossGone);
  if (stages.length !== 1 || stages[0].id !== 'g_live') fail('a boss-less gauntlet stage is still on the card');
  if (stages[0].escorts.includes(ENEMY)) fail('a retired escort is still on the card');

  const holedContent = { ...retired, encounters: { ...retired.encounters, holed,
    empty: { id: 'empty', name: 'Empty', waves: [ENEMY], reward: 1, tier: 1 } } };
  const st = mk();
  const one = warTargetEncounter(st, { kind: 'node', encounterId: 'holed' }, holedContent, t0);
  if (!one || one.waves.length !== 1 || one.waves[0] !== 'net_trooper') fail('the briefing still lists a retired wave');
  if (warTargetEncounter(st, { kind: 'node', encounterId: 'empty' }, holedContent, t0) !== null) {
    fail('an encounter with no opposition left is still offered');
  }

  const vroot = { innerHTML: '', querySelectorAll: () => [], querySelector: () => null };
  const vst = mk();
  vst.inventory.parts.push({ id: 'vt', partId: 'cobra_head', grade: 'apex',
    donor: { name: 'Kevin', species: SPECIES, stars: 4, extractedAt: t0 } });
  renderVaultScreen(vroot, { state: vst, content: retired, now: () => t0 + HOUR, save: () => {} });
  if (!/Cobra Head/.test(vroot.innerHTML)) fail('the vault dropped a token whose donor species was retired');
  if (/data-reseq="v1"/.test(vroot.innerHTML)) fail('a vial with no species left still offers a Resequence button');

  console.log('retired ✓  ' + screens + ' screens, the sim, the gauntlet, the briefing and the vault');
`];


// R82 — the breakout, end to end at battery speed: a lab loses a specimen,
// it lands on a standing board, a win closes the entry, and the capture
// route is the one every other prize takes.
const BREAKOUT = ['node', '-e', `
  const { readFileSync } = await import('node:fs');
  const { indexContent } = await import('./render/renderer.js');
  const { newGameState } = await import('./save/save.js');
  const { tickWorld } = await import('./campaign/world.js');
  const { warTargetEncounter } = await import('./campaign/warroom.js');
  const { looseSpecimens, breakoutEligible, tickBreakouts } = await import('./campaign/breakout.js');
  const { createBattle, step, playerActions } = await import('./battle/engine.js');
  const { resolveBattle } = await import('./campaign/campaign.js');
  const { rehabPlan, startRehab, tickRehab } = await import('./campaign/rehab.js');
  const { makeSimChimera, STARTER_BUILD } = await import('./tools/sim.js');
  const R = (p) => JSON.parse(readFileSync('./data/' + p + '.json', 'utf8'));
  const { CONTENT_FILES: files } = await import('./data/loader.js');
  const content = indexContent(Object.fromEntries(files.map((n) => [n, R(n)])));
  const HOUR = 3600000, t0 = 1700000000000;
  const fail = (m) => { console.error('breakout ✗  ' + m); process.exit(1); };

  const armed = () => {
    const s = { ...newGameState(), seed: 4242, funds: 60000 };
    s.lastTickAt = t0;
    s.facility = { theater: 2, containment: 3, infirmary: 1, incubator: 1, extractor: 1, scanner: 1 };
    s.campaign.rivals = { mantissa: { defeats: 3, losses: 0, lastMetAt: null } };
    for (let i = 0; i < 3; i++) {
      const c = makeSimChimera('L', STARTER_BUILD.partIds, 'prismatic', content);
      c.id = 'b' + i; c.name = 'Hero ' + i; c.settleUntil = 0; c.bond = 80; c.xp = 4000;
      s.chimeras.push(c);
    }
    return s;
  };

  // Nothing gets out until a lab has been rattled, and no clock runs behind
  // the gate.
  const fresh = { ...newGameState(), seed: 1 };
  if (breakoutEligible(fresh, content)) fail('something is loose before any rival has lost to you');
  tickBreakouts(fresh, content, t0 + 900 * HOUR);
  if (fresh.campaign.nextBreakAt !== null) fail('a clock is running behind the eligibility gate');

  // A fortnight away is replayed, not skipped.
  const jump = armed();
  tickWorld(jump, content, t0 + 24 * 14 * HOUR);
  const stepped = armed();
  for (let h = 2; h <= 24 * 14; h += 2) tickWorld(stepped, content, t0 + h * HOUR);
  if (!jump.campaign.loose.length) fail('a fortnight away put nothing on the board');
  const a = jump.campaign.loose.map((e) => e.unit.name).join(',');
  const b = stepped.campaign.loose.map((e) => e.unit.name).join(',');
  if (a !== b) fail('one jump replays to a different board than stepping there (' + a + ' vs ' + b + ')');
  if (!jump.news.some((n) => /BREAKOUT|misplaced|unaccounted/i.test(n))) {
    fail('an escape nobody was there for said nothing on the wire');
  }

  // No clock on a loose specimen: a hundred days later it is still there.
  const patient = armed();
  tickWorld(patient, content, t0 + 24 * 7 * HOUR);
  const before = patient.campaign.loose.map((e) => e.id + ':' + e.unit.hp).join(',');
  tickWorld(patient, content, t0 + 24 * 107 * HOUR);
  const still = patient.campaign.loose.map((e) => e.id + ':' + e.unit.hp).join(',');
  if (!before.length || !still.startsWith(before)) {
    fail('the board did not keep what was on it (' + before + ' -> ' + still + ')');
  }

  // The criterion: fight it, bag it, and the Wing puts it on the roster.
  const s = armed();
  tickWorld(s, content, t0 + 24 * 7 * HOUR);
  const esc = looseSpecimens(s)[0];
  if (!esc) fail('nothing to hunt');
  if (!esc.unit.capturable || !esc.unit.genome) fail('the escapee is not a capturable chimera');
  const now = t0 + 24 * 7 * HOUR;
  const enc = warTargetEncounter(s, { kind: 'breakout', breakoutId: esc.id }, content, now);
  if (!enc || enc.waves.length !== 1 || enc.waves[0].id !== esc.unit.id) {
    fail('the briefing is not the specimen on the board');
  }
  const boardBefore = looseSpecimens(s).length;
  const battle = createBattle(s.chimeras.slice(0, 3), enc, content, 99, now, {
    kind: 'breakout', breakoutId: esc.id, rivalId: esc.rivalId, looseUnitId: esc.unit.id, waveIds: [],
  });
  battle.enemy.active.hp = Math.floor(battle.enemy.active.maxHp * 0.3);
  battle.cannon.charge = 100;
  const cap = playerActions(battle).find((x) => x.type === 'capture');
  if (!cap) fail('the cannon does not offer itself at a weakened escapee');
  step(battle, cap, content);
  let guard = 0;
  while (!battle.over && guard++ < 200) {
    battle.enemy.active.hp = 0;
    step(battle, playerActions(battle)[0] ?? { type: 'rest' }, content);
  }
  const detail = resolveBattle(s, battle, content, now);
  if (detail.outcome !== 'win') fail('the fight did not resolve as a win');
  if (looseSpecimens(s).length !== boardBefore - 1) fail('a win did not close the entry on the board');
  if (s.campaign.containment.length !== 1) fail('the bagged specimen did not reach a bay');
  if (!s.news.some((n) => /THWOOMP|impounded/.test(n))) fail('the wire did not say it was bagged');

  // Bagged in a LOST fight still closes the entry — one wave makes that
  // unreachable in play, so the contract is checked directly.
  const { resolveBreakout } = await import('./campaign/breakout.js');
  const spare = looseSpecimens(s)[0];
  if (spare) {
    if (resolveBreakout(s, content, spare.id, 'loss').cleared) fail('a plain loss closed the entry');
    if (!resolveBreakout(s, content, spare.id, 'loss', true).cleared) {
      fail('a specimen bagged in a lost fight was left on the board');
    }
    if (looseSpecimens(s).some((e) => e.id === spare.id)) fail('it is in a bay and still at large');
  }

  const bay = s.campaign.containment[0];
  const plan = rehabPlan(s, bay, content);
  if (!plan.possible) fail('an escapee is not a candidate for the Wing: ' + plan.reason);
  if (!startRehab(s, bay.id, content, now).ok) fail('it does not enrol');
  tickRehab(s, content, now + (plan.hours + 1) * HOUR);
  const mine = s.chimeras.find((c) => c.rehabilitated);
  if (!mine) fail('it never joined the roster');
  if (mine.name !== esc.unit.name) fail('it joined as somebody else');
  if (mine.frame !== esc.unit.genome.frame) fail('it joined on a different chassis');
  if (!Object.values(mine.tokens).some((tk) => tk.grade !== 'standard')) {
    fail('it joined at the shop floor grade rather than its old lab\\'s');
  }
  console.log('breakout ✓  escaped, waited, hunted, bagged and on the roster as ' + mine.name);
`];


// R83 — the walk fights the whole game, at battery speed.
//
// smoke runs this over four seeds to dominion; a 45-day walk on one seed
// costs about a second and still contains duels, hunts, a bought lab and a
// filled bay. What is being defended is coverage: before R83 the walk had
// never fought a rival in 180 days, and no gate noticed for eighty
// milestones because none of them asked.
const WALK = ['node', '-e', `
  const { readFileSync } = await import('node:fs');
  const { indexContent } = await import('./render/renderer.js');
  const { campaignWalk } = await import('./tools/sim.js');
  const R = (p) => JSON.parse(readFileSync('./data/' + p + '.json', 'utf8'));
  const { CONTENT_FILES: files } = await import('./data/loader.js');
  const content = indexContent(Object.fromEntries(files.map((n) => [n, R(n)])));
  const fail = (m) => { console.error('walk ✗  ' + m); process.exit(1); };
  const w = campaignWalk(content, { seed: 4242, days: 45, stopAtDominion: false });
  for (const kind of ['assault', 'defend', 'sparring', 'rival', 'breakout']) {
    if (!(w.fights?.[kind] > 0)) fail('the walk never fought a "' + kind + '" (' + JSON.stringify(w.fights) + ')');
  }
  if (w.duels < 3) fail('the ladder is barely touched (' + w.duels + ' duels)');
  if (!(w.rushes > 0)) fail('the walk never paid to hurry a clock (R86)');
  if (w.breakouts < 15) fail('the loose board is barely hunted (' + w.breakouts + ')');
  // Not the bay count: a held defence impounds wreckage, so bays fill
  // whether or not the cannon ever fires. Count what the cannon bagged.
  if (w.bagged < 10) fail('the Containment Cannon is not being fired (' + w.bagged + ' bagged)');
  const levels = Object.values(w.facility ?? {}).reduce((a, b) => a + b, 0);
  if (levels < 12) fail('the lab is never bought (summed track levels ' + levels + ')');
  console.log('walk ✓  ' + w.duels + ' duels, ' + w.breakouts + ' hunts, ' + w.bagged
    + ' bagged, lab at ' + levels + ' over 45 days');
`];

const ROADMAP = ['node', 'tools/roadmap.js'];

const BREAKS = [
  // --- gate: scopecheck (a free identifier fails the build) ----------------
  {
    n: 1, gate: SCOPE, name: 'R60, replayed: opOdds trimmed from the import, two call sites live',
    file: 'campaign/ui.js',
    anchor: '  operationList, freeCrew, startOperation, abortOperation, opOdds,',
    to: '  operationList, freeCrew, startOperation, abortOperation,',
  },
  {
    n: 2, gate: SCOPE, name: 'A1, replayed: infirmaryGrants unbound behind an ??= that never runs',
    file: 'campaign/campaign.js',
    anchor: "import { infirmaryGrants } from '../splice/facility.js';\n",
    to: '',
  },
  {
    n: 3, gate: SCOPE, name: 'a typo inside a template interpolation',
    file: 'ranch/ui.js',
    anchor: '<p class="ranch-msg">${lastMsg}</p>',
    to: '<p class="ranch-msg">${lastMsgg}</p>',
  },
  {
    // R81 moved this one: `isInjured` went to battle/statblock.js with the
    // rest of what a creature IS. The break follows it, because the module
    // it guards is still the one the headless sim runs.
    n: 4, gate: SCOPE, name: 'a DOM global in a logic module the headless sim runs',
    file: 'battle/statblock.js',
    anchor: 'export function isInjured(chimera, now) {',
    to: 'export function isInjured(chimera, now) {\n  if (document.hidden) return false;',
  },
  {
    n: 5, gate: SCOPE, name: 'a helper renamed at its definition but not at its call site',
    file: 'campaign/warroom.js',
    anchor: 'export function sparVerdict(state, content, now) {',
    to: 'export function sparVerdictRenamed(state, content, now) {',
  },
  {
    n: 6, gate: SCOPE, name: 'the tokenizer stops seeing template interpolations',
    file: 'tools/scopecheck.js',
    anchor: "        if (c === '$' && src[i + 1] === '{') {",
    to: "        if (false && c === '$' && src[i + 1] === '{') {",
    expect: 'corpus',
  },
  {
    n: 7, gate: SCOPE, name: 'the tokenizer stops treating regex literals as regex',
    file: 'tools/scopecheck.js',
    anchor: '      if (regexOk) {',
    to: '      if (false && regexOk) {',
    expect: 'corpus',
  },

  // --- gate: handlers (every data-* handler has been fired once) -----------
  {
    n: 8, gate: HANDLERS, name: 'a new control is painted and nothing binds it',
    file: 'ranch/ui.js',
    anchor: '<p class="ranch-msg">${lastMsg}</p>',
    to: '<p class="ranch-msg" data-nudge="1">${lastMsg}</p>',
  },
  {
    n: 9, gate: HANDLERS, name: 'an existing binder is deleted, leaving a dead button',
    file: 'splice/pens-ui.js',
    anchor: "  root.querySelectorAll('button[data-treat]').forEach((btn) => {",
    to: "  [].forEach((btn) => {",
  },
  {
    n: 10, gate: HANDLERS, name: 'a handler body reads a name that does not exist',
    file: 'campaign/ui.js',
    anchor: '  bayAction(\'salvage\', (id) => salvageUnit(state, id, content, ctx.now()));',
    to: '  bayAction(\'salvage\', (id) => salvageUnitTypo(state, id, content, ctx.now()));',
  },
  {
    n: 11, gate: HANDLERS, name: 'a control stops being rendered at all',
    file: 'campaign/ui.js',
    anchor: '<button type="button" data-salvage="${entry.id}">',
    to: '<button type="button" data-salvag="${entry.id}">',
  },
  {
    n: 12, gate: HANDLERS, name: 'the stub stops resolving descendant selectors, so the frame chooser binds nothing',
    file: 'tools/domstub.js',
    anchor: '      let ok = true;',
    to: '      let ok = steps.length === 1;',
  },
  {
    n: 13, gate: HANDLERS, name: 'a surface goes unreachable — the briefing loses its way in',
    file: 'campaign/ui.js',
    anchor: '<button type="button" data-node="${node.id}"',
    to: '<button type="button" data-nodex="${node.id}"',
  },
  {
    n: 14, gate: HANDLERS, name: 'a marker grows a handler and stays on the exempt list',
    file: 'ui/cards.js',
    anchor: '      dismissGuide(ctx.state, btn.dataset.dismissGuide);',
    to: '      dismissGuide(ctx.state, btn.dataset.dismissGuide ?? btn.dataset.guide);',
  },
  {
    n: 15, gate: SCOPE, name: 'the link pass stops seeing `export const`',
    file: 'tools/scopecheck.js',
    anchor: "    if (nx.type === 'name' && ['const', 'let', 'var'].includes(nx.value)) {",
    to: "    if (false && nx.type === 'name' && ['const', 'let', 'var'].includes(nx.value)) {",
    expect: 'corpus',
  },
  {
    n: 16, gate: SCOPE, name: 'a keyword after a dot stops being treated as a property',
    file: 'tools/scopecheck.js',
    anchor: "    if (before?.type === 'punct' && ['.', '?.'].includes(before.value)) continue;",
    to: '',
  },
  {
    n: 17, gate: HANDLERS, name: 'a control stops being painted but its binder stays',
    file: 'save/settings-ui.js',
    anchor: '${active ? \'\' : `<button type="button" class="care-train" data-switch-slot="${slot.id}">Switch</button>`}',
    to: "''",
  },
  {
    n: 18, gate: HANDLERS, name: 'the War Room sub-tab bar disappears, taking its attribute with it',
    file: 'campaign/ui.js',
    anchor: 'function warSubtabBar(state) {',
    to: 'function warSubtabBar(state) {\n  if (state) return \'\';',
  },
  {
    n: 19, gate: TWICE, name: 'the walk stops being reproducible across two runs',
    file: 'tools/handlers.js',
    anchor: 'const mod = await import(`../${surface.file}?run=${runNonce++}`);',
    to: 'const mod = await import(`../${surface.file}`);',
  },
  {
    n: 20, gate: CONTEST, name: 'an expiry can no longer free the slot during the replay (the R78 bug itself)',
    file: 'campaign/contest.js',
    anchor: '    const expiring = cam.contested.find((c) => c.deadline <= now) ?? null;',
    to: '    const expiring = null;',
  },
  {
    n: 21, gate: CONTEST, name: 'a contest expires at `now` rather than at its own deadline',
    file: 'campaign/contest.js',
    anchor: '      scheduleNext(state, content, expiring.deadline);',
    to: '      scheduleNext(state, content, now);',
  },

  // --- gate: retired (a save read against a build that retired its ids) ----
  {
    n: 22, gate: RETIRED, name: 'a species read goes bare again — the daily upkeep bill',
    file: 'ranch/ranch.js',
    anchor: '    (sum, a) => sum + speciesOf(content, a.species).upkeepPerDay, 0',
    to: '    (sum, a) => sum + content.species[a.species].upkeepPerDay, 0',
  },
  {
    n: 23, gate: RETIRED, name: 'the frame read goes bare again — physiology, on the battle and sim paths',
    file: 'splice/physiology.js',
    anchor: '  const frame = frameOf(content, frameId);',
    to: '  const frame = content.frames[frameId];',
  },
  {
    n: 24, gate: RETIRED, name: 'the thermal band stops skipping a species nobody can name',
    file: 'splice/physiology.js',
    anchor: '    const band = content.species[sp]?.thermal;',
    to: '    const band = content.species[sp].thermal;',
  },
  {
    n: 25, gate: RETIRED, name: 'creaturePortrait stops softening, so a retired chassis throws on paint',
    file: 'render/renderer.js',
    anchor: '  const drawable = drawableGenome(genome, content);',
    to: '  const drawable = genome;',
  },
  {
    n: 26, gate: RETIRED, name: 'a wave naming a retired unit reaches combatantFromUnit undefined again',
    file: 'battle/engine.js',
    anchor: '  return combatantFromUnit(unitFor(content, ref) ?? ABSENT_UNIT, scale);',
    to: '  return combatantFromUnit(unitFor(content, ref), scale);',
  },
  {
    n: 27, gate: RETIRED, name: 'the Pens name the chassis bare again',
    file: 'splice/pens-ui.js',
    anchor: '${frameOf(content, ch.frame).name} · instability',
    to: '${content.frames[ch.frame].name} · instability',
  },
  {
    n: 28, gate: RETIRED, name: 'a gauntlet stage keeps a boss the build no longer has',
    file: 'campaign/gauntlet.js',
    anchor: '    .filter((stage) => content.enemies?.[stage.unitId])',
    to: '    .filter(() => true)',
  },
  {
    n: 29, gate: RETIRED, name: 'the briefing stops filtering, so it shows a fight the battle will not be',
    file: 'campaign/warroom.js',
    anchor: '  const waves = liveWaves(encounter.waves, content);',
    to: '  const waves = encounter.waves ?? [];',
  },
  {
    n: 30, gate: RETIRED, name: 'the vault goes back to deleting holdings it cannot name',
    file: 'splice/vault-ui.js',
    anchor: '    if (known) bay(known.species).tokens.push(token);',
    to: '    if (known && content.species[known.species]) bay(known.species).tokens.push(token);',
  },
  {
    // Re-aimed. The first draft reverted `classOf` back to a bare read and
    // MISSED: the banner is wrapped in `${cls ? … : ''}`, so an undefined
    // `cls` simply printed nothing. The guard that actually carries the
    // weight is the conditional, so that is what the break removes — and
    // the rival it fires on (`trench`, a Water school) is only reachable
    // because the fixture now walks all five War Room sub-tabs.
    n: 31, gate: RETIRED, name: 'the rival card names a class school the build retired',
    file: 'campaign/ui.js',
    anchor: "          ${cls ? `<p class=\"class-banner class-${rival.classBias}\">",
    to: "          ${true ? `<p class=\"class-banner class-${rival.classBias}\">",
  },
  {
    n: 32, gate: RETIRED, name: 'a bay names a class off a foe frozen into the save',
    file: 'campaign/ui.js',
    anchor: '  const cls = classOf(content, unit.class);',
    to: '  const cls = unit.class ? { icon: content.classes[unit.class].icon, name: content.classes[unit.class].name } : null;',
  },
  {
    n: 33, gate: RETIRED, name: 'a retired species stops standing in, so the egg card has nothing to name',
    file: 'data/catalog.js',
    anchor: '  return content?.species?.[id] ?? retiredSpecies(id);',
    to: '  return content?.species?.[id];',
  },
  {
    // Both of these were live in the first draft of R79 and NO gate saw
    // them: the retired chassis declared `slots: []`, which reads as "this
    // chassis accepts nothing" rather than "nothing is known about it", and
    // its sockets were an array where the renderer indexes by name.
    n: 34, gate: RETIRED, name: 'the retired chassis claims a slot whitelist it cannot have',
    file: 'data/catalog.js',
    anchor: '      sockets: Object.freeze({}),',
    to: '      sockets: Object.freeze({}),\n      slots: Object.freeze([]),',
  },
  {
    n: 35, gate: RETIRED, name: 'a stand-in drops a field every shipped record carries',
    file: 'data/catalog.js',
    anchor: '      upkeepPerDay: 0,\n',
    to: '',
  },

  // --- gate: breakout (a specimen escapes, waits, is hunted, joins) -------
  {
    // The R78 slip, in its new home: arming the clock at `now` and returning
    // means a month away produced nothing, and the board that comes back
    // looks perfectly plausible while being empty.
    n: 36, gate: BREAKOUT, name: 'the escape clock arms at the wrong end of a month away',
    file: 'campaign/breakout.js',
    anchor: '    cam.nextBreakAt = since + Math.round((t.firstDelayHours ?? 5) * HOUR);',
    to: '    cam.nextBreakAt = now + Math.round((t.firstDelayHours ?? 5) * HOUR);\n    return { escaped };',
  },
  {
    n: 37, gate: BREAKOUT, name: 'the schedule advances from the wrong instant, so the replay drifts',
    file: 'campaign/breakout.js',
    anchor: '    scheduleNext(state, content, due);\n  }\n  return { escaped };',
    to: '    scheduleNext(state, content, now);\n  }\n  return { escaped };',
  },
  {
    n: 38, gate: BREAKOUT, name: 'nothing gates the escapes, so a save that beat nobody still loses specimens',
    file: 'campaign/breakout.js',
    anchor: '  return beaten >= (t.startsAfterDefeats ?? 1);',
    to: '  return true;',
  },
  {
    n: 39, gate: BREAKOUT, name: 'a win no longer closes the entry on the board',
    file: 'campaign/breakout.js',
    anchor: '  state.campaign.loose = looseSpecimens(state).filter((s) => s !== loose);',
    to: '',
  },
  {
    n: 40, gate: BREAKOUT, name: 'the escapee stops being a chimera, so the Wing will not take it',
    file: 'campaign/rivals.js',
    anchor: '      powerScale,\n      koLine: `${name} folds neatly',
    to: '      powerScale,\n      capturable: false,\n      koLine: `${name} folds neatly',
  },
  {
    n: 41, gate: BREAKOUT, name: 'the briefing stops being the specimen on the board',
    file: 'campaign/breakout.js',
    anchor: '    waves: [loose.unit],',
    to: "    waves: ['riot_squad'],",
  },
  // --- gate: roadmap (the design doc describes the shipped game) -----------
  {
    // The shape R77 found: a number in the spec drifts from the data and
    // nothing can fail, because prose does not run.
    n: 49, gate: ROADMAP, name: 'a number the roadmap states drifts from the data',
    file: 'ROADMAP.md', anchor: '- frames: 4', to: '- frames: 3',
  },
  {
    n: 50, gate: ROADMAP, name: 'SAVE_VERSION goes stale in the spec',
    file: 'ROADMAP.md', anchor: `- save version: ${SAVE_VERSION}`, to: `- save version: ${SAVE_VERSION - 1}`,
  },
  {
    // R86 closed the last of R77's three gaps, so there is no absent mechanic
    // left to describe as shipped. The break keeps its meaning by CREATING
    // one: the live spec is made to claim Gene Juice — a mechanic the
    // roadmap gate probes the code for and will not find — with no "queued
    // as" pointer beside it. That is the exact defect R77 was filed for.
    n: 51, gate: ROADMAP, name: 'a designed-but-absent mechanic is described as if it works',
    file: 'ROADMAP.md',
    anchor: '**Paying a clock to hurry (R86).** Every *sealed* clock',
    to: '**Gene Juice skips any timer, and paying a clock to hurry (R86).** Every *sealed* clock',
  },
  {
    // R86 closed the last queued gap, so the break creates one: the live spec
    // is made to name an absent mechanic AND point it at a phase the roadmap
    // does not carry. The pointer is the half this break is about.
    n: 52, gate: ROADMAP, name: 'a named gap points at a phase the roadmap does not carry',
    file: 'ROADMAP.md',
    anchor: '**Paying a clock to hurry (R86).** Every *sealed* clock',
    // R999, not R99: the fifth audit queued R87–R101, so a two-digit fake
    // would have pointed at a phase the roadmap now carries and MISSED.
    to: '**Gene Juice is not shipped — queued as R999.** **Paying a clock to hurry (R86).** Every *sealed* clock',
  },
  {
    n: 53, gate: ROADMAP, name: 'the measured-numbers block is deleted outright',
    file: 'ROADMAP.md',
    anchor: '### 4.0 Shipped, as measured',
    to: '### 4.0b Retired',
  },

  // --- gate: walk (the walk fights the whole game) -------------------------
  {
    // The hole R83 closed, put back: the walker stops challenging rivals.
    // It cost eighty milestones to notice the first time.
    n: 44, gate: WALK, name: 'the walk stops fighting the rival ladder',
    file: 'tools/sim.js',
    anchor: '  if (has(\'assault\') && now - (state.__walkLastDuel ?? -7 * WALK_DAY) >= 7 * WALK_DAY) {',
    to: '  if (false) {',
  },
  {
    n: 45, gate: WALK, name: 'the walk stops hunting the loose board',
    file: 'tools/sim.js',
    anchor: '  for (const esc of has(\'assault\') ? [...looseSpecimens(state)].slice(0, 1) : []) {',
    to: '  for (const esc of []) {',
  },
  {
    n: 46, gate: WALK, name: 'the walk stops firing the Containment Cannon',
    file: 'tools/sim.js',
    anchor: '    const bag = offered.find((a) => a.type === \'capture\');',
    to: '    const bag = null;',
  },
  {
    n: 47, gate: WALK, name: 'the walk stops buying the lab',
    file: 'tools/sim.js',
    anchor: '    if (pick2 && buyUpgrade(state, content, pick2.id).ok) acted++;',
    to: '    if (false && pick2) acted++;',
  },
  {
    // The product bug R83 found: the agenda row that offers a lab upgrade
    // read `up.cost`, which `nextUpgrade` does not return. Dead since A4.
    n: 48, gate: WALK, name: 'the "buy a lab upgrade" agenda row goes back to reading a field that does not exist',
    file: 'ranch/agenda.js',
    anchor: '    ready: (state, content) => tracks(content).some((t) => nextUpgrade(state, content, t.id)?.affordable),',
    to: '    ready: (state, content) => tracks(content).some((t) => {\n      const up = nextUpgrade(state, content, t.id);\n      return up && !up.locked && state.funds >= up.cost;\n    }),',
  },
  {
    n: 43, gate: BREAKOUT, name: 'a specimen bagged in a lost fight is left on the board as well as in the bay',
    file: 'campaign/breakout.js',
    anchor: "  if (!loose || (outcome !== 'win' && !captured)) return { cleared: false, creature: null, lab: null };",
    to: "  if (!loose || outcome !== 'win') return { cleared: false, creature: null, lab: null };",
    expect: 'contract',
  },
  {
    // R81's own near-miss, as a break: nine exports moved out of the engine
    // and the static pass caught every stale call site but the five dynamic
    // ones. Only a ten-minute smoke run found it; now scopecheck does.
    n: 65, gate: SCOPE, name: 'a dynamic import asks a module for a name it does not export',
    file: 'tools/smoke.js',
    anchor: "  const { obedienceIgnoreChance, obediencePercent } = await import('../battle/statblock.js');",
    to: "  const { obedienceIgnoreChance, obediencePercent } = await import('../battle/engine.js');",
  },

  // --- gate: grade (a grade sharpens and does not upgrade) -----------------
  {
    // The thing R84 decided against, shipped: an Apex part gains a keyword.
    n: 66, gate: GRADE, name: 'an Apex part gains an ability its Standard version did not have',
    file: 'battle/statblock.js',
    anchor: `      keywords,\n      // R30: identity is where the move came from`,
    to: `      keywords: gradeIndexOf(token.grade) >= 2 ? { ...keywords, ignoreArmor: 1 } : keywords,\n      // R30: identity is where the move came from`,
  },
  {
    n: 67, gate: GRADE, name: 'a grade quietly stops sharpening the move at all',
    file: 'battle/statblock.js',
    anchor: '    const gradeBonus = 1 + gradeIndexOf(token.grade) * GRADE_MOVE_BONUS;',
    to: '    const gradeBonus = 1;',
  },
  {
    n: 68, gate: GRADE, name: 'the sharpening is retuned without the roadmap being told',
    file: 'battle/statblock.js',
    anchor: 'export const GRADE_MOVE_BONUS = 0.12;',
    to: 'export const GRADE_MOVE_BONUS = 0.2;',
  },

  // --- gate: feral (the top of the scale costs something, and lends it) ----
  {
    // The snapshot rule this was NOT built as: unstable and unbonded is
    // enough, so the six-species chimera the game exists to let you build
    // goes to Containment the day it is made.
    n: 69, gate: FERAL, name: 'the trigger forgets the calendar and fires on anatomy alone',
    file: 'splice/feral.js',
    anchor: '  const atRisk = unstable && unbonded && neglected;',
    to: '  const atRisk = unstable && unbonded;',
  },
  {
    // R9's rule, broken the way it is usually broken: a roll per tick, so
    // the player who checks in often loses creatures the one who does not
    // keeps.
    n: 70, gate: FERAL, name: 'the window becomes a per-tick roll instead of a deadline',
    file: 'splice/feral.js',
    anchor: '    if (now >= chimera.agitatedAt + t.windowHours * HOUR) {',
    to: '    if ((now / HOUR | 0) % 3 === 0) {',
  },
  {
    // The whole answer, gone: you can train it, fight with it and treat it
    // all week, and the clock never notices.
    n: 71, gate: FERAL, name: 'attending a creature stops counting as attending to it',
    file: 'splice/feral.js',
    anchor: '  chimera.lastAttendedAt = now;',
    to: '',
  },
  {
    // Zero death language and Law 3, in one line: the bay stops holding the
    // creature and starts holding a description of it, so what the Wing
    // hands back is a stranger with the same name.
    n: 72, gate: FERAL, name: 'the Containment bay keeps a copy of the creature instead of the creature',
    file: 'campaign/rehab.js',
    anchor: '    chimera,\n    unit: unitFromGenome({',
    to: '    chimera: { ...chimera, xp: 0, moveset: [] },\n    unit: unitFromGenome({',
  },
  {
    // R15, with the stakes turned up: the countdown runs, and the screen
    // whose job is to say what is open says nothing.
    n: 73, gate: FERAL, name: 'the agenda stops surfacing the one clock that costs a creature',
    file: 'ranch/agenda.js',
    anchor: "      (state.chimeras ?? []).some((c) => feralStatus(c, content, now).agitated),",
    to: '      false,',
  },
  {
    // R9's exemption removed: the window is back-dated to the moment the
    // condition was met, so a fortnight away ends with the creature in a
    // bay it was never given the chance to stay out of. This is the reading
    // an earlier draft of feral.js's own comment described, which is why it
    // is worth a break rather than a note.
    n: 74, gate: FERAL, name: 'the window stops opening on sight, so being away costs a creature',
    file: 'splice/feral.js',
    anchor: '      chimera.agitatedAt = now;',
    to: '      chimera.agitatedAt = lastAttended(chimera) + t.neglectHours * HOUR;',
  },

  // --- gate: rush (a rush buys time and nothing else) ----------------------
  {
    n: 75, gate: RUSH, name: 'a rush moves the clock and forgets to charge for it',
    file: 'splice/rush.js',
    anchor: '  state.funds -= price;\n  def.set(target, now);',
    to: '  def.set(target, now);',
  },
  {
    // The thing the whole design refuses: a cooldown you can buy is bond you
    // can buy.
    n: 76, gate: RUSH, name: 'a training cooldown quietly joins the registry',
    file: 'splice/rush.js',
    anchor: 'const RUSHABLE = {\n  settle: {',
    to: "const RUSHABLE = {\n  train: { list: (s) => (s.chimeras ?? []).map((c) => c.id), find: (s, id) => (s.chimeras ?? []).find((c) => c.id === id) ?? null, name: (t) => t.name, until: (t) => (t.lastTrainedAt ?? 0) + 15 * HOUR, set: (t, now) => { t.lastTrainedAt = now - 15 * HOUR; } },\n  settle: {",
  },
  {
    n: 77, gate: RUSH, name: 'the Infirmary grows its own price and drifts from the rush',
    file: 'splice/scars.js',
    anchor: '  return rushPrice(chimera.injury.until - now, content, scale);',
    to: '  return Math.round((30 + Math.max(0, (chimera.injury.until - now) / HOUR) * 18) * scale);',
  },
  {
    // Zero death language has a cousin here: a rush that changes what comes
    // out is a slot machine with a receipt. The vat is sealed at conception;
    // this break makes the rush re-open it.
    n: 78, gate: RUSH, name: 'rushing the vat quietly changes what it decants',
    file: 'splice/rush.js',
    anchor: "    name: (target) => target.parentNames?.join(' × ') ?? 'the vat',\n    until: (target) => target.until ?? 0,\n    set: (target, now) => { target.until = now; },",
    to: "    name: (target) => target.parentNames?.join(' × ') ?? 'the vat',\n    until: (target) => target.until ?? 0,\n    set: (target, now) => { target.until = now; target.conception = { ...target.conception, parts: Object.fromEntries(Object.entries(target.conception.parts).slice(0, 1)) }; },",
  },
  {
    // R83's rule, pointed at the new purchase: a system the walker never
    // uses is one the yardstick cannot see.
    n: 79, gate: WALK, name: 'the walker stops paying to hurry, and the yardstick goes blind to it',
    file: 'tools/sim.js',
    anchor: '  for (const q of rushable(state, content, now)) {',
    to: '  for (const q of []) {',
  },

  // --- gate: boot (the game reaches the screen without its pictures) -------
  {
    n: 61, gate: BOOT, name: 'the geometry goes back into the round the first paint waits on',
    file: 'data/loader.js',
    anchor: "  const loaded = await Promise.all(CORE.map((name) => grab(base, name)));\n  return indexContent(Object.fromEntries(CORE.map((name, i) => [name, loaded[i]])));",
    to: "  const all = [...CORE, ...GEOMETRY];\n  const loaded = await Promise.all(all.map((name) => grab(base, name)));\n  return indexContent(Object.fromEntries(all.map((name, i) => [name, loaded[i]])));",
  },
  {
    n: 62, gate: BOOT, name: 'the second round is fired inside the same block as the first paint',
    file: 'main.js',
    anchor: '  requestAnimationFrame(() => setTimeout(() => {',
    to: '  (() => (() => {',
  },
  {
    n: 63, gate: BOOT, name: 'the geometry is never fetched at all, so the creatures never arrive',
    file: 'main.js',
    anchor: '    loadShapes(content).then((ok) => {',
    to: '    Promise.resolve(false).then((ok) => {',
  },
  {
    // The product bug this would be: a part with stats and no body. The
    // renderer draws "developing" forever and nobody notices until a player
    // opens a fold.
    n: 64, gate: SMOKE_PAIR, name: 'a part loses its geometry, so the game can name it and not draw it',
    file: 'data/parts-shapes.json',
    anchor: '  "shapes": {\n    "bear_head": [',
    to: '  "shapes": {\n    "bear_head_TYPO": [',
  },

  // --- gate: a11y (the game is playable without a mouse) -------------------
  {
    n: 54, gate: A11Y, name: 'the focus keeper is not installed, so every repaint drops the player at the top',
    file: 'main.js',
    anchor: "  installFocusKeeper([...Object.keys(SCREENS).map((s) => $(`#screen-${s}`)), $('#overlay')].filter(Boolean));",
    to: '  void installFocusKeeper;',
  },
  {
    n: 55, gate: A11Y, name: 'the opening exchange of a duel goes back to being a div you click',
    file: 'battle/ui.js',
    anchor: `\${opening ? '<button type="button" class="msg-next" id="msg-next" aria-label="Continue">&#9654;</button>' : ''}`,
    to: `\${opening ? '<div class="msg-next" id="msg-next">&#9654;</div>' : ''}`,
  },
  {
    n: 56, gate: A11Y, name: 'the move readout loses its key and is a long press again',
    file: 'battle/ui.js',
    anchor: "      if (e.key !== '?') return;",
    to: "      if (e.key !== 'Unidentified') return;",
  },
  {
    n: 57, gate: A11Y, name: 'the retraining counter changes in silence',
    file: 'splice/pens-ui.js',
    anchor: '            announce(`${chosen.size} of ${MOVE_SLOTS} move slots filled`);',
    to: '            void announce;',
  },
  {
    n: 58, gate: A11Y, name: "Enter goes back on the document, so the rename sheet's Close button commits",
    file: 'ui/picker.js',
    anchor: "  input.addEventListener('keydown', (e) => {\n    if (e.key !== 'Enter') return;\n    e.preventDefault();\n    submit();\n  });",
    to: "  document.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });",
  },
  {
    n: 59, gate: A11Y, name: 'a nav tab stops being a button, so the keyboard cannot reach that screen',
    file: 'index.html',
    anchor: '    <button type="button" data-screen="dex">Dex</button>',
    to: '    <div data-screen="dex" role="button">Dex</div>',
  },
  {
    n: 60, gate: A11Y, name: 'the subtab strip crowds its buttons back together',
    file: 'style.css',
    anchor: '  gap: 6px;  /* R80 — the tightest strip in the game was the one with the most buttons in it. */',
    to: '  gap: 3px;',
  },
  {
    n: 42, gate: BREAKOUT, name: 'a loose specimen grows a deadline and wanders off while you are away',
    file: 'campaign/breakout.js',
    anchor: '    const rival = labFor(state, content, cam.breakoutCount);',
    to: '    cam.loose = cam.loose.filter((e) => due - e.escapedAt < 48 * HOUR);\n    const rival = labFor(state, content, cam.breakoutCount);',
  },
];

const pristine = {};
const restore = (file) => {
  pristine[file] ??= readFileSync(join(SRC, file), 'utf8');
  writeFileSync(join(DIR, file), pristine[file]);
};

const run = (gate) => {
  try {
    const out = execFileSync(gate[0], gate.slice(1), { cwd: DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
};

// The battery is worthless if the pristine tree does not pass, so prove that
// first — a gate that fails on everything "catches" every break for free.
console.log('baseline (pristine tree):');
for (const gate of [SCOPE, HANDLERS, TWICE, CONTEST, RETIRED, BREAKOUT, WALK, ROADMAP, A11Y, BOOT, SMOKE_PAIR, GRADE, FERAL, RUSH]) {
  const r = run(gate);
  const label = gate === TWICE ? 'walkSurfaces twice in one process'
    : gate === CONTEST ? 'a month away with a convoy at the gate'
      : gate === RETIRED ? 'a save read against a build that retired seven of its ids'
        : gate === BREAKOUT ? 'a specimen escapes, waits, is hunted and joins the roster'
          : gate === WALK ? 'the walk fights rivals, hunts the board and builds the lab'
            : gate === A11Y ? 'the whole game opened, tabbed and fought with a keyboard'
              : gate === BOOT ? 'the game on screen without the 400 KB of pictures'
                : gate === SMOKE_PAIR ? 'both halves of every part and every unit'
                  : gate === GRADE ? 'every part at every grade, sharpened and nothing more'
                    : gate === FERAL ? 'a neglected creature warned, answered, and given back'
                      : gate === RUSH ? 'a rush buys time and nothing else'
                        : gate.join(' ');
  console.log(`  ${r.ok ? 'PASS' : 'FAIL'} ${label}${r.ok ? '' : '\n' + r.out.split('\n').slice(0, 4).map((l) => '    ' + l).join('\n')}`);
  if (!r.ok) process.exitCode = 1;
}

console.log('\nbreaks:');
const results = [];
for (const b of BREAKS) {
  restore(b.file);
  const path = join(DIR, b.file);
  const src = readFileSync(path, 'utf8');
  const hits = src.split(b.anchor).length - 1;
  if (hits !== 1) {
    console.log(`  ${String(b.n).padStart(2)}. BADANCH (${hits} matches) — ${b.name}`);
    results.push({ ...b, verdict: 'BADANCH' });
    continue;
  }
  writeFileSync(path, src.replace(b.anchor, b.to));
  const r = run(b.gate);
  restore(b.file);
  const first = r.out.split('\n').find((l) => l.trim() && !l.startsWith('scopecheck: ')) ?? '';
  const verdict = r.ok ? 'MISSED' : 'caught';
  results.push({ ...b, verdict, line: first.trim() });
  console.log(`  ${String(b.n).padStart(2)}. ${verdict === 'caught' ? '✓ caught' : '✗ MISSED'}  ${b.name}`);
  if (verdict === 'caught' && VERBOSE) console.log(`        → ${first.trim().slice(0, 140)}`);
}

const missed = results.filter((r) => r.verdict !== 'caught');
console.log(`\n${results.length} breaks · ${results.length - missed.length} caught · ${missed.length} missed`);
for (const m of missed) console.log(`  ${m.verdict} ${m.n}: ${m.name}`);
rmSync(DIR, { recursive: true, force: true });
if (missed.length) process.exitCode = 1;
