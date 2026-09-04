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
  const files = ['frames','parts','species','combos','enemies','keywords','regions','traits','classes',
    'rivals','director','facility','philosophies','operations','chaos','temperament','scars','guides',
    'resequencer','training','gauntlet','news'];
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
  const files = ['frames','parts','species','combos','enemies','keywords','regions','traits','classes',
    'rivals','director','facility','philosophies','operations','chaos','temperament','scars','guides',
    'resequencer','training','gauntlet','news'];
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
    n: 4, gate: SCOPE, name: 'a DOM global in a logic module the headless sim runs',
    file: 'battle/engine.js',
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
for (const gate of [SCOPE, HANDLERS, TWICE, CONTEST, RETIRED]) {
  const r = run(gate);
  const label = gate === TWICE ? 'walkSurfaces twice in one process'
    : gate === CONTEST ? 'a month away with a convoy at the gate'
      : gate === RETIRED ? 'a save read against a build that retired seven of its ids'
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
