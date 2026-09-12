// R76 — THE BREAK BATTERY. One deliberate break per gate; each must go RED.
//
// A gate that has never failed is a rumour. This copies the tree to a temp
// directory, injects one defect at a time, runs the gate it is aimed at, and
// asserts the gate REFUSES. Every previous milestone ran a battery like this
// by hand and wrote the score into PROGRESS.md; the audit's fair complaint
// was that a headline number nothing in the repo can reproduce is not
// evidence. So it is a tool now.
//
//   node tools/battery.js            # exit 1 if any break survives (~47 min)
//   node tools/battery.js --anchors  # every anchor still matches (~1 sec)
//   node tools/battery.js --baseline # every gate green on a clean tree (~7 min)
//   node tools/battery.js --only 1,2 # these breaks and nothing else
//   node tools/battery.js --verbose  # the gate's own words for each
//   SW_BATTERY_JOBS=1 node ...       # one worker, for a machine under load
//
// WHAT TO RUN WHEN. The full battery is a forty-seven minute answer to a
// question that changes slowly: do the gates still catch defects? Gates
// change when a milestone writes one. What changes EVERY session is whether
// this milestone broke a gate — which the baseline answers in seven minutes
// — and whether it moved a line a break aims at, which `--anchors` answers
// in one second. R133 is the worked example: its only two real findings were
// a gate the baseline caught and an anchor `--anchors` would have caught,
// and the other 203 breaks were green twice for forty minutes each time.
//
// Every patch is applied by UNIQUE ANCHOR: if the anchor text does not appear
// exactly once, the break reports BADANCH and is scored as a failure rather
// than a pass. That rule exists because a break once patched an identical
// earlier line and was quietly scored green.
//
// The baseline runs first. A gate that fails on everything "catches" every
// break for free, so the pristine tree has to pass before any of this counts.

import { cpSync, readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir, cpus } from 'node:os';

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
// R86: break 50 used to hardcode the save version and went BADANCH on three
// milestones running. It is read off the source now, so bumping SAVE_VERSION
// moves the break with it.
import { SAVE_VERSION } from '../save/save.js';

const SRC = dirname(dirname(fileURLToPath(import.meta.url)));

// R132 — ONE TREE PER WORKER, because the whole battery is 202 sequential
// edits to the same files and that is the only reason it ran serially. The
// run costs a bit over two HOURS of CPU — 124m54s of it, measured — and most
// of that is the breaks aimed at browser gates: each launches Chrome and
// renders a 180-day save at 70-90 seconds, one after another, on a machine
// with four cores sitting mostly idle. Four workers put the same work on the
// clock in 46m20s.
//
// Do not read a speedup off the summary line: what is parallel here is the
// WAITING. The CPU total barely moves, so a machine with one core free is a
// machine that should run `SW_BATTERY_JOBS=1` and expect the old two hours.
//
// A copy is 5.3 MB, so the tree is the cheap part. What each worker needs to
// itself is the files it patches and a debugging port — the walk cache is
// keyed by a hash of the source, so two workers with different patches write
// different cache files and never collide, and `serve()` already binds an
// ephemeral port. The pid-derived debugging ports the browser gates used were
// the one real hazard: unique per RUN and therefore not unique per WORKER, so
// each gate now takes `SW_CDP_PORT` and the pool hands out a distinct one.
const JOBS = Math.max(1, Number(process.env.SW_BATTERY_JOBS) || Math.min(4, cpus().length));
const DIRS = Array.from({ length: JOBS }, () => {
  const d = mkdtempSync(join(tmpdir(), 'sw-battery-'));
  cpSync(SRC, d, {
    recursive: true,
    filter: (p) => !p.includes('/.git') && !p.includes('/node_modules'),
  });
  return d;
});
// Distinct CDP ports, ten apart because tools/boot.js runs two browsers and
// takes `base` and `base + 1`.
const PORTS = DIRS.map((_, i) => 9100 + i * 10);

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

// R124 — EVERY OUTLOOK SENTENCE IS A SENTENCE. Reported from a phone: a
// Cobra at adult and condition 89 read "Prime once Meatball is ."
//
// `needsAge` and `needsCondition` each mean "strictly necessary", so when
// EITHER lever alone reaches the ceiling neither one is, and the clause
// listing what is needed had nothing to put in it. The arithmetic was right
// and the wording had no shape for its answer.
//
// The smoke suite already had five assertions about this sentence and all
// five missed it, because each picks a fixture and reads what it says — and
// the hole is a COMBINATION of stage, condition and genes, not an animal.
// So this walks the space: three starter animals, five gene levels, seven
// points of growth, the whole condition range. 10,605 sentences, of which
// 150 took the missing branch.
//
// It asks about SHAPE, not wording. Nothing else in the game writes " ." or
// a dangling "and .", so an empty slot cannot hide behind a rephrasing —
// and the sentence stays free to be rewritten.
const OUTLOOK = ['node', '-e', `
  const { readFileSync } = await import('node:fs');
  const { indexContent } = await import('./render/renderer.js');
  const { CONTENT_FILES } = await import('./data/loader.js');
  const { newGameState } = await import('./save/save.js');
  const { ensureRanchSeeded, STATS } = await import('./ranch/ranch.js');
  const { gradeOutlook, outlookLine } = await import('./splice/extract.js');
  const raw = {};
  for (const f of CONTENT_FILES) raw[f] = JSON.parse(readFileSync('data/' + f + '.json', 'utf8'));
  const content = indexContent(raw);
  const HOURS = 3600000;
  const t0 = Date.UTC(2025, 0, 1);
  const st = { ...newGameState(), seed: 7 };
  ensureRanchSeeded(st, content, t0);
  const lines = [];
  for (const a of st.ranch.stock) {
    const grow = content.species[a.species].growthHours;
    for (const g of [1, 2, 3, 4, 5]) {
      const potential = Object.fromEntries(STATS.map((k) => [k, g]));
      for (const age of [0, 1, grow.adult - 1, grow.adult, grow.prime - 1, grow.prime, grow.prime + 200]) {
        for (let cond = 0; cond <= 100; cond++) {
          const o = gradeOutlook({ ...a, potential, birthAt: t0 - age * HOURS, condition: cond }, content, t0, st);
          lines.push(outlookLine(o, a.name));
        }
      }
    }
  }
  const bad = [];
  if (lines.length < 10000) bad.push('the sweep collapsed to ' + lines.length + ' sentences');
  const hollow = lines.filter((l) => / \\.|\\band\\s*\\.|,\\s*\\.|\\(\\)|  /.test(l));
  if (hollow.length) bad.push(hollow.length + ' of ' + lines.length + ' sentences have an empty slot, e.g. "' + hollow[0] + '"');
  const unstopped = lines.filter((l) => !l.endsWith('.'));
  if (unstopped.length) bad.push(unstopped.length + ' sentences do not end, e.g. "' + unstopped[0] + '"');
  const either = lines.filter((l) => /either way/.test(l));
  if (either.length < 100) bad.push('the "either way" wording is unreachable (' + either.length + ' of ' + lines.length + ')');
  if (bad.length) { console.error('outlook ✗  ' + bad.join('; ')); process.exit(1); }
  console.log('outlook ✓  ' + lines.length + ' sentences across every stage, condition and gene level, every slot filled');
`];

// R127 — IS THE DATA WHAT THE GENERATOR PRODUCES? For four phases it was
// not. `data/parts.json` has said since R20 that hand-authored content lives
// in the generator "because a generator that reverts four phases of tuning
// the next time somebody runs it is a trap" — and forty parts had been tuned
// straight into the JSON since, so running it reverted thirty-five named
// tail abilities, three active hides, a heron's power and the goat's Iron
// Gut passive, which the emitted object had no key for at all.
//
// Nothing could say so, because the only way to find out was to run the
// generator and thereby destroy the evidence. `--check` computes the same
// output and COMPARES it, so the question can be asked without paying for
// the answer. R126 is why it matters beyond tidiness: a hand edit to claw
// geometry and the shape library silently disagreed about thirteen parts,
// and no gate in the suite could tell that apart from a deliberate change.
const GENPARTS = ['node', 'tools/gen-parts.js', '--check'];

// R101 — A REAL SAVE OF EVERY VERSION, NOT A SIX-KEY STUB. The chain was
// only ever walked from a hand-written object with six keys, or from a
// CURRENT-shaped save with its version number written backwards — which is
// worse, because a migration that fails to create a field passes anyway
// when the field was already there. `tools/saves.js` walks a real save of
// each of v1-v45, taken from the commit where that version was current, and
// requires each to land on the shape a new game has.
const SAVES = ['node', 'tools/saves.js'];

// R101 — and the fixtures themselves are generated, not authored, so the
// same question R127 asked of the parts data gets asked of them: is what is
// on disk what that version's own code produces?
const GENSAVES = ['node', 'tools/gen-saves.js', '--check'];

// R101 — AND THE MIGRATED SAVE, IN A REAL BROWSER. Every other browser gate
// seeds a save at the current version, so none of them takes the migration
// path — which after R101 fetches a module over the network. The failure it
// exists to catch is invisible to the obvious checks: when the import 404s,
// `loadSlot`'s catch starts a FRESH game and saves it, so the ranch paints
// and storage reads v45 while the player's actual save has been set aside.
// Only the console tells you. That is why this gate reads the console.
const STALE = ['node', 'tools/stale.js'];

// R89 — HOW TALL IS THE SCREEN AFTER A HUNDRED AND EIGHTY DAYS? Every height
// this project quoted at scale was measured by hand once and then went stale
// while the screen kept growing: the roadmap recorded 12,554px of Pens for
// ten chimeras and it was 16,657 for nine. A budget nobody runs is a note.
const HEIGHT = ['node', 'tools/height.js'];

// R90 — THE SUITE ITSELF, UNDER ITS OWN BUDGET. npm test was 621s; it is
// 172s. Most of that came from deleting duplicated work rather than from
// parallelism, and both are easy to undo by accident: an unguarded block
// runs in all four shards, and a guard naming a shard nobody owns runs in
// none. The second failure is the dangerous one — the suite gets faster and
// greener while testing less.
const SUITE = ['node', 'tools/suite.js'];

// The union gate lives inside smoke and needs no heavy block to run, so the
// battery can aim at it in seconds rather than three minutes.
const UNION = ['node', 'tools/smoke.js'];

// R128 — EVERY FACILITY TRACK IS BOUGHT WHERE ITS SYSTEM LIVES. Reported from
// play: the Surgery Theater's only upgrade was unfindable. Each track in
// facility.json has carried a `screen` since it was written and nothing read
// it — so nothing validated it either, and one of the six pointed at
// `extract`, which is not a screen. The block asks four things: every track
// names a screen the shell renders, every screen named draws its own and
// only its own, the Theater renders for real, and every screen that draws
// the card binds the fold and the button. Sharded, because the whole smoke
// is two minutes and this block is twelve seconds of it.
//
// SW_SHARD takes the LANE, not the block name. This said `team` for a
// milestone, and `inShard('team')` compares SHARD_OF['team'] — which is 'c'
// — against the string 'team', so the block it was aiming at was the one
// thing this gate never ran. It was still red on R128's breaks, because the
// unsharded assertions caught them, which is exactly why the mistake
// survived: a gate that runs the wrong subject and still fails teaches you
// nothing. The same slip cost this session an hour on `SW_SHARD=fired`.
const FACILITY = ['node', '-e',
  "process.env.SW_SHARD = 'c'; await import('./tools/smoke.js');"];

// R129 — the release block: the phase fires, the anatomy widens, the trait
// rides out through the Wing into the Vault. Shard a, per SHARD_OF.
const RELEASE = ['node', '-e',
  "process.env.SW_SHARD = 'a'; await import('./tools/smoke.js');"];

// R148 — THE CHASSIS LADDER. Three six-bay frames level across the live band
// (1.0pp apart, from 5.2), the Rumbler +2.3pp in a grind and +0.0pp in a
// dash. Shard b, per SHARD_OF.
const BULK = ['node', '-e',
  "process.env.SW_SHARD = 'b'; await import('./tools/smoke.js');"];

// R141 — THE KITE FRAME IS THE ONLY WAY TO FLY SOMETHING HEAVY. Eight bodies
// fly on it and on nothing else, they are worth 14.8pp more there than on a
// Scamper against a wall that swings low, and 0.9pp LESS against one that
// shoots. Shard a, per SHARD_OF — the same lane as RELEASE, and a separate
// name because a break that aims at one block should not read as the other.
const KITE = ['node', '-e',
  "process.env.SW_SHARD = 'a'; await import('./tools/smoke.js');"];

// R149 — CAMO IS A DECISION, NOT A LABEL. It shipped with exactly one chart
// row and that row was a punishment (Sonic x1.5), so six chameleon parts were
// priced below zero — the same defect R141 found in Ground. It now answers
// the 22% of coalition damage that has to AIM, and it is stripped off anything
// wearing a plate, so the hide bay is the price. Shard a, per SHARD_OF.
const CAMO = ['node', '-e',
  "process.env.SW_SHARD = 'a'; await import('./tools/smoke.js');"];

// R143 — AN EMPIRE HAS RUNNING COSTS. R25 pointed the upkeep economy at
// livestock and nothing ever pointed it at territory or at the plant, so
// income scaled with conquest and outgo did not — the empire's share of its
// own gross ROSE as it grew, 28-67% on day ten against 76-85% from day twenty
// on. Three 180-day walks; shard a, per SHARD_OF.
const EMPIRE = ['node', '-e',
  "process.env.SW_SHARD = 'a'; await import('./tools/smoke.js');"];

// R144 — EVERY REGION ASKS A QUESTION AT THE GRADE AND TEAM IT DECLARES.
// Six archetypes against five first nodes; cheap, no walks. Shard b.
// R144 named this REGIONS after the one block it then aimed at; R150 aims at
// a second block in the same lane, so it is named for the LANE. A gate
// constant named after one of its blocks is how a reader comes to think the
// lane holds one thing — which is the same mistake, one level up, as the
// duplicate shard key R144 shipped and caught.
const SHARD_B = ['node', '-e',
  "process.env.SW_SHARD = 'b'; await import('./tools/smoke.js');"];

// R91 — THE VAULT HAS A BOTTOM, AND THE THEATER HAS ONE TABLE. Every list in
// this game was bounded except the ones that mattered: the day-180 save was
// 1.8 MB, 95.5% of it inventory, and four save slots share one 5 MB quota, so
// four campaigns crossed it around day 124 while `saveGame` swallowed the
// failure. The gate asks three things of one seeded walk — weight, a stated
// bound for every array, and whether a chimera lives longer than an evening.
const VAULT = ['node', 'tools/vault.js'];

// R91 — THE SURGERY THEATER DOES ONE OPERATION AT A TIME.
//
// This gate exists because break 145 went MISSED against `tools/vault.js`,
// and the miss was informative rather than a mis-aimed break: with the table
// never occupied, the walk's median chimera life BARELY MOVED. The table is
// not what stops the churn — the replacement margin is, because the walker
// will not take a creature apart unless the new build beats the grades a
// dismantle burns. The table is a real rule and it is what a PLAYER feels
// (you cannot build one, look at it, and scrap it in the same minute), but
// no measurement of a finished save can see it. So it gets an assertion of
// its own, the way the pairing did in R81: what it guards is a handful of
// refusals and the suite takes three minutes.
// R92 — DOES THE YARDSTICK PLAY THE WHOLE GAME? Every balance number this
// project states comes out of one walk, so a system that walk never touches
// is a system whose balance has never been measured. Four of the eight R92
// named had quietly been closed by other milestones and nobody noticed,
// because there was nothing watching either way.
const COVERAGE = ['node', 'tools/coverage.js'];

// R95 — CAN A PLAYER ACTUALLY GET TO THE CONTENT? Three rules of one gate:
// every species is reachable by a mechanism that resolves, a 180-day walk
// sees 95% of the part list across seven seeds, and every encounter names
// the grade it takes when the player's own is not enough.
const REACH = ['node', 'tools/reach.js'];

const TABLE = ['node', '-e', `
  const { readFileSync } = await import('node:fs');
  const { indexContent } = await import('./render/renderer.js');
  const { newGameState } = await import('./save/save.js');
  const { spliceChimera } = await import('./splice/theater.js');
  const { extractChimera } = await import('./splice/extract.js');
  const { theaterBusyFor } = await import('./splice/facility.js');
  const { CONTENT_FILES } = await import('./data/loader.js');
  const content = indexContent(Object.fromEntries(CONTENT_FILES.map((n) =>
    [n, JSON.parse(readFileSync('data/' + n + '.json', 'utf8'))])));
  const HR = 3600000, t0 = 1750000000000;
  const bad = [];
  const lab = (tier) => {
    const s = { ...newGameState(), seed: 7, funds: 99999 };
    s.facility = { theater: tier };
    for (const [i, pid] of ['goat_head', 'bear_head', 'cobra_head'].entries()) {
      s.inventory.parts.push({ id: 'h' + i, partId: pid, grade: 'standard', traits: [],
        donor: { name: 'D', species: pid.split('_')[0], stars: 3, extractedAt: 0 } });
    }
    return s;
  };

  // One operation, then the door is shut.
  const s = lab(2);
  if (!spliceChimera(s, 'M', { head: 'h0' }, content, t0).ok) bad.push('the first splice was refused');
  const second = spliceChimera(s, 'M', { head: 'h1' }, content, t0);
  if (second.ok) bad.push('a second splice went through in the same instant');
  else if (!/table is still occupied/.test(second.msg)) bad.push('refused for the wrong reason: ' + second.msg);
  // A dismantle is the same table.
  const un = extractChimera(s, s.chimeras[0].id, content, t0);
  if (un.ok) bad.push('a dismantle went through while the table was occupied');

  // It is a WAIT, never a wall: past the clock, both work again.
  const later = t0 + theaterBusyFor(s, content) + HR;
  if (!spliceChimera(s, 'M', { head: 'h1' }, content, later).ok) bad.push('the table never came free');

  // And a better Theater turns it round faster, which is what the track sells.
  const slow = theaterBusyFor(lab(1), content), fast = theaterBusyFor(lab(2), content);
  if (!(fast < slow)) bad.push('tier 2 does not clear the table faster than tier 1 (' + fast + ' vs ' + slow + ')');
  if (!(slow > 0)) bad.push('the table is not occupied at all');

  // R135 — AND TAKING ONE APART IS CHEAPER THAN BUILDING ONE, at every tier.
  // The two used to be one number, and the ORDERING is the rule rather than
  // either number, so a future rebalance moves them without moving this.
  //
  // A correction worth keeping, because I got it wrong mid-milestone: a
  // 30-minute splice does NOT collapse the game on its own. Measured on the
  // shipped vault and stable it leaves median chimera life at 62.7 days,
  // against 74.8 with the split clocks and a floor of 5. The 2.0-day
  // collapse — 460 creatures built to keep 12 — needed a fast splice AND the
  // enlarged shelves I had raised in the same sitting: a full vault and a
  // full stable are what stop you rebuilding, and I had just removed both
  // brakes and then blamed the accelerator. That is why there is no break
  // here for it; it takes two anchors, like R133's chrome budget.
  for (const tier of [1, 2]) {
    const un = theaterBusyFor(lab(tier), content, 'dismantle');
    const build = theaterBusyFor(lab(tier), content);
    if (!(un < build)) bad.push('tier ' + tier + ': a dismantle costs the table as much as a splice (' + un + ' vs ' + build + ')');
    if (!(un > 0)) bad.push('tier ' + tier + ': a dismantle does not occupy the table at all');
  }
  // And the dismantle actually USES its own clock rather than the splice's.
  {
    const s2 = lab(2);
    spliceChimera(s2, 'M', { head: 'h2' }, content, t0);
    const held = s2.theater.busyUntil - t0;
    const d = lab(2);
    spliceChimera(d, 'M', { head: 'h2' }, content, t0);
    const freeAt = d.theater.busyUntil;
    extractChimera(d, d.chimeras[0].id, content, freeAt);
    if (!(d.theater.busyUntil - freeAt < held)) {
      bad.push('a dismantle occupies the table for the splice clock, not its own');
    }
  }

  if (bad.length) { console.error('table ✗  ' + bad.join('; ')); process.exit(1); }
  console.log('table ✓  one operation at a time, a splice ' + (slow / HR) + 'h at tier 1 and ' + (fast / HR)
    + 'h at tier 2, a dismantle ' + (theaterBusyFor(lab(1), content, 'dismantle') / HR) + 'h and '
    + (theaterBusyFor(lab(2), content, 'dismantle') / HR) + 'h, and always a wait rather than a wall');
`];

// R126 — CLAWS POINT WHERE THE CREATURE IS GOING. Reported from a phone:
// "claws are on backwards". They were. Every part is drawn in a local space
// where the head faces +x (data/notes/frames.md), and the `paw` archetype built
// its claws as near-equilateral triangles whose only visible point hung
// down and BACKWARD, marching back across the toe pad (x = 15, 6, -3) so the
// last one dangled off the heel. Twenty limbs, and not one forward claw
// among them.
//
// The invariant is about the shape rather than about a coordinate anybody
// typed: a claw is a triangle, its APEX is the vertex opposite its shortest
// edge, and that apex must sit forward of the base it grows from. Stated
// that way it survives the claws being moved, resized or restyled, and it
// cannot be satisfied by a blunt wedge that happens to lean the right way.
//
// The tolerance follows the anatomy rather than being a blanket allowance,
// and the battery is why: the first version let any foot keep one backward
// claw, so flipping a single claw on a three-clawed tiger paw slipped
// straight through and break 131 came back MISSED.
//
// A PAW has no hallux. Its claws are @white and every one of them must
// point forward. A TALON or a STILT does have one — a raptor's hallux and a
// wader's back toe are real anatomy — and those toes are @accent, so at
// most one of them may face backwards. Two different rules because they are
// two different feet.
const CLAWS = ['node', '-e', `
  const { readFileSync } = await import('node:fs');
  const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
  const shapes = J('data/parts-shapes.json').shapes;
  const parts = J('data/parts.json').parts;
  const limbs = parts.filter((p) => p.slot === 'forelimbs' || p.slot === 'hindlimbs');
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const bad = [];
  const paw = [];
  let feet = 0, claws = 0;
  for (const part of limbs) {
    const list = shapes[part.id] || [];
    let fwd = 0, back = 0;
    for (const sh of list) {
      if (sh.type !== 'polygon' || typeof sh.points !== 'string') continue;
      const v = sh.points.trim().split(/\\s+/).map((q) => q.split(',').map(Number));
      if (v.length !== 3) continue;
      const e = [dist(v[0], v[1]), dist(v[1], v[2]), dist(v[2], v[0])];
      const short = e.indexOf(Math.min.apply(null, e));
      const apex = v[(short + 2) % 3];
      const b0 = v[short], b1 = v[(short + 1) % 3];
      const forward = apex[0] > (b0[0] + b1[0]) / 2;
      if (forward) fwd++; else back++;
      if (!forward && sh.fill === '@white') paw.push(part.id);
    }
    if (fwd + back === 0) continue;
    feet++; claws += fwd + back;
    if (back > 1 || (back > 0 && back >= fwd)) bad.push(part.id + ' (' + fwd + ' forward, ' + back + ' back)');
  }
  if (!feet) { console.error('claws x  no clawed limb was examined at all'); process.exit(1); }
  if (bad.length) {
    console.error('claws x  ' + bad.length + ' limb(s) face backwards: ' + bad.slice(0, 4).join('; '));
    process.exit(1);
  }
  if (paw.length) {
    const uniq = paw.filter((v, i, a) => a.indexOf(v) === i);
    console.error('claws x  a paw has no hallux, but ' + uniq.length + ' carries a backward claw: ' + uniq.slice(0, 4).join(', '));
    process.exit(1);
  }
  console.log('claws ok  ' + claws + ' claws across ' + feet + ' clawed limbs, every foot forward-heavy');
`];

// R125 — does the letter predict the fight? The tier claims an A wins more
// than a B, which is a claim about the battle engine rather than about the
// scoring code, so the only instrument that can settle it is the engine. Its
// own file because it fights 62,400 battles to answer, and because it is held
// out on purpose: the model was fitted on one seeded population and this
// grades a different one. The note at the top of tools/tierbench.js says why
// the bar is monotonicity rather than separation.
const TIER = ['node', 'tools/tierbench.js'];

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
    s.theater = { busyUntil: 0 };
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
  // R91 — the Surgery Theater does one operation at a time. This gate is
  // about what a RUSH buys, not about how often the table turns over, so it
  // clears the table between fixtures the way tools/smoke.js's clearTable
  // does. Break 145 is what proves the table is still being occupied.
  for (const [h, o] of [['a1','a2'],['b1','b2']]) { s.theater = { busyUntil: 0 }; const m = spliceChimera(s, 'M', { head: h, organ: o }, content, t0 - 10 * HR); if (!m.ok) throw new Error(m.msg); }
  for (const c of s.chimeras) { c.settleUntil = t0 - HR; c.bond = 50; }
  s.theater = { busyUntil: 0 };
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

// R103 — the opposition commits before you answer. Its own gate for the
// usual reason: the smoke suite takes nine minutes and this is three
// battles and six rules, all of them the ones that turn two dead buttons
// into decisions. Six breaks aim here.
const STANCE = ['node', '-e', `
  const { readFileSync } = await import('node:fs');
  const { indexContent } = await import('./render/renderer.js');
  const { CONTENT_FILES: files } = await import('./data/loader.js');
  const { createBattle, step, playerActions, playerActive, intentOf, stanceTuning, bracePreview, braceTitle } = await import('./battle/engine.js');
  const { choosePlayerAction } = await import('./battle/ai.js');
  const { makeSimChimera, sampleBuilds } = await import('./tools/sim.js');
  const { analyze } = await import('./splice/physiology.js');
  const { rngStream } = await import('./util/rng.js');
  const R = (p) => JSON.parse(readFileSync('./data/' + p + '.json', 'utf8'));
  const content = indexContent(Object.fromEntries(files.map((n) => [n, R(n)])));
  const t0 = 1700000000000;
  const T = stanceTuning(content);
  const bad = [];

  // 0. THE DATA WINS — and this is checked against the ENGINE'S FALLBACKS,
  //    not against the merged tuning. The first draft compared
  //    stanceTuning(content) to stance.json, but that call spreads
  //    content.stanceMeta over the defaults and stanceMeta IS the shipped
  //    tuning: it was comparing the file with itself and could not disagree.
  //    Break 94 walked through it. stanceTuning(null) is the fallback set.
  {
    const D = stanceTuning(null);
    for (const [k, v] of Object.entries(R('stance').tuning)) {
      if (D[k] !== v) bad.push('the engine fallback ' + k + ' is ' + D[k] + ', the data ships ' + v);
      if (T[k] !== v) bad.push('the merged ' + k + ' is ' + T[k] + ', the data ships ' + v);
    }
  }

  const builds = sampleBuilds(content, 40, 2026).map((b) => makeSimChimera(b.frame, b.partIds, 'prime', content));
  const classOf = (c) => analyze(c.frame, Object.values(c.tokens), content).creatureClass ?? null;
  const fight = (team, enc, seed = 5) => createBattle(team, content.encounters[enc], content, seed, t0);

  // 1. the intent is decided before the player acts, and it is what lands
  {
    const b = fight([builds[0], { ...builds[0], id: 'b1' }], 'patrol_2');
    const intent = intentOf(b, content);
    if (!intent || intent.index < 0) bad.push('nothing was telegraphed');
    else {
      const named = b.enemy.active.moves[intent.index].name;
      if (intent.name !== named) bad.push('the telegraph names a different move than it holds');
      step(b, playerActions(b).find((a) => a.type === 'rest'), content);
      if (!b.log.some((l) => l.includes(named))) bad.push('the move it announced is not the move it used');
    }
  }

  // 2. a brace answers a telegraph, costs stamina, and never twice running
  {
    const b = fight([builds[2], { ...builds[2], id: 'c1' }], 'patrol_2');
    intentOf(b, content);
    const me = playerActive(b);
    const before = me.stamina;
    step(b, playerActions(b).find((a) => a.type === 'rest'), content);
    if (!b.log.some((l) => /braces/.test(l))) bad.push('bracing against a telegraph did not brace');
    if (me.stamina >= before) bad.push('the brace did not cost stamina (' + before + ' -> ' + me.stamina + ')');

    const quiet = fight([builds[2], { ...builds[2], id: 'c2' }], 'patrol_2');
    intentOf(quiet, content);
    quiet.intent = { index: -1, name: 'Catch Breath', power: 0, tags: [], creatureClass: null, priority: false, ignoreGuard: false };
    const q = playerActive(quiet);
    step(quiet, playerActions(quiet).find((a) => a.type === 'rest'), content);
    if (q.status.guard) bad.push('a brace was granted with nothing telegraphed');
  }

  // 3. the brace is worth what it claims
  {
    const hit = (braced) => {
      const b = fight([builds[3], { ...builds[3], id: 'd1' }], 'patrol_2');
      intentOf(b, content);
      const hp = playerActive(b).hp;
      step(b, braced ? playerActions(b).find((a) => a.type === 'rest') : playerActions(b).find((a) => a.type === 'move'), content);
      return hp - playerActive(b).hp;
    };
    const open = hit(false), guarded = hit(true);
    if (!(guarded < open)) bad.push('a braced creature does not take less (' + guarded + ' vs ' + open + ')');
    if (!(guarded > 0)) bad.push('a brace is immunity, not mitigation');
  }

  // 4. THE COUNTER-SWITCH READS THE CLASS TRIANGLE AND NOTHING ELSE.
  //
  //    Read off the free hit's OWN line. The first draft scanned the log for
  //    /comes in|free/ — a sentence stance.json shipped and the engine never
  //    spoke — so it matched nothing on the pristine tree and nothing on the
  //    broken one either, and break 93 (fire for anybody) was missed. A free
  //    hit that arrives as an ordinary attack line is also indistinguishable
  //    to the PLAYER from the switch just not costing a turn, so the line is
  //    not merely for the gate.
  {
    const mark = (log) => log.filter((l) => /comes in on the turn/.test(l)).length;
    const beats = Object.fromEntries(Object.values(content.classes).map((c) => [c.beats, c.id]));
    const b0 = fight([builds[0], { ...builds[0], id: 'z' }], 'patrol_2');
    const li = intentOf(b0, content);
    const counterClass = beats[li.creatureClass];

    // The one that DOES answer it: the free hit fires and says so.
    const right = counterClass ? builds.find((c) => classOf(c) === counterClass) : null;
    if (!right) bad.push('the pool holds no ' + counterClass + ' build to answer a ' + li.creatureClass + ' attacker');
    else {
      const b = fight([builds[0], right], 'patrol_2');
      const i2 = intentOf(b, content);
      if (beats[i2.creatureClass] !== classOf(right)) bad.push('the fixture no longer reaches a counter-class switch');
      else {
        // Held by REFERENCE, not by reading b.enemy.active again: the free
        // hit can graduate the thing it hits, and then the field holds the
        // next wave at full health and 'took no damage' reads backwards.
        const foe0 = b.enemy.active;
        const foeHp = foe0.hp;
        step(b, playerActions(b).find((a) => a.type === 'switch'), content);
        if (!mark(b.log)) bad.push('the counter-class switch came in and nothing happened');
        if (foe0.hp >= foeHp) bad.push('the free hit landed no damage (' + foeHp + ' -> ' + foe0.hp + ')');
      }
    }

    // The one that does NOT: no free hit, and nothing said.
    const wrong = builds.find((c) => classOf(c) && classOf(c) !== counterClass);
    if (!wrong) bad.push('the pool holds no non-countering build');
    else {
      const b = fight([builds[0], wrong], 'patrol_2');
      intentOf(b, content);
      step(b, playerActions(b).find((a) => a.type === 'switch'), content);
      if (mark(b.log)) bad.push('a switch that answers nothing took tempo it did not earn');
    }
  }

  // 5. the pilot can SEE the telegraph. This is the assertion that catches
  //    the bug that made the whole milestone invisible: step consumes and
  //    clears the intent, so a pilot reading the field directly gets null
  //    every turn and never braces or counter-switches at all.
  {
    let braces = 0, switches = 0, moves = 0, turns = 0;
    for (const encId of ['patrol_2', 'checkpoint', 'boss_clampdown']) {
      const team = Object.keys(content.classes).slice(0, 3).map((cls, i) => {
        const c = builds.find((x) => classOf(x) === cls) ?? builds[i];
        return { ...c, id: c.id + '#' + i };
      });
      const b = fight(team, encId, 11);
      let g = 0;
      while (!b.over && g++ < 200) {
        const acts = playerActions(b);
        if (!acts.length) break;
        const rel = acts.find((a) => a.type === 'release');
        const action = rel ?? (b.pendingReplace ? acts[0]
          : choosePlayerAction(b, acts, content, 1, () => rngStream(b.seed, 'gate', b.rollCount++)()));
        if (!rel && !b.pendingReplace) {
          turns++;
          if (action.type === 'rest') braces++;
          else if (action.type === 'switch') switches++;
          else if (action.type === 'move') moves++;
        }
        step(b, action, content);
      }
    }
    if (turns < 20) bad.push('the pilot did not play a real fight (' + turns + ' turns)');
    if (!moves) bad.push('the pilot never attacks');
    if (braces + switches === 0) {
      bad.push('the pilot never braces or switches over ' + turns + ' turns — it cannot see the telegraph');
    }

    // …AND ITS ANSWER CHANGES WITH THE QUESTION. Counting braces was not
    // enough: a pilot blind to the intent still switches for every other
    // reason it switches and still rests when it is starving, so the count
    // stayed positive and break 95 was missed. Ask the same turn twice —
    // once against what is really coming, once against a foe that is
    // catching its breath — with the same rolls. A pilot that cannot see
    // the telegraph gives the identical answer every single time.
    let asked = 0, differed = 0;
    for (const encId of ['patrol_2', 'checkpoint', 'boss_clampdown']) {
      const team = Object.keys(content.classes).slice(0, 3).map((cls, i) => {
        const c = builds.find((x) => classOf(x) === cls) ?? builds[i];
        return { ...c, id: c.id + '@' + i };
      });
      const b = fight(team, encId, 11);
      let g = 0;
      while (!b.over && g++ < 200) {
        const acts = playerActions(b);
        if (!acts.length) break;
        const rel = acts.find((a) => a.type === 'release');
        let action;
        if (rel || b.pendingReplace) action = rel ?? acts[0];
        else {
          // NOT PLANTED FIRST. The draft called intentOf here before asking
          // the pilot anything, which WROTE the intent onto the battle —
          // handing a pilot that reads the field directly the very thing
          // the break takes away, and break 95 was missed a second time.
          // The pristine pilot plants its own by asking; a blind one leaves
          // the field as 'step' left it, which is empty.
          const same = (x, y) => x.type === y.type && x.index === y.index;
          const withIt = choosePlayerAction(b, acts, content, 1, () => 0.5);
          const real = b.intent;
          b.intent = { index: -1, name: 'Catch Breath', power: 0, tags: [], creatureClass: null, priority: false, ignoreGuard: false };
          const without = choosePlayerAction(b, acts, content, 1, () => 0.5);
          b.intent = real;
          asked++;
          if (!same(withIt, without)) differed++;
          action = withIt;
        }
        step(b, action, content);
      }
    }
    if (asked < 20) bad.push('the differential probe played too little (' + asked + ' turns)');
    else if (!differed) {
      bad.push('the pilot answers ' + asked + ' turns identically whether or not a blow is telegraphed — it cannot see it');
    }
  }

  // 6. THE BUTTON'S PROMISE IS THE RESOLUTION. The tooltip is built from
  //    the same preview 'step' resolves, so the percentage and the price it
  //    quotes are the ones that land. The first draft promised stamina BACK
  //    from a brace that spends a quarter of it, and nothing in the suite
  //    disagreed — a lie on the one button this milestone exists to make
  //    worth pressing.
  {
    const b = fight([builds[2], { ...builds[2], id: 'p1' }], 'patrol_2');
    const intent = intentOf(b, content);
    const me = playerActive(b);
    const p = bracePreview(me, intent, content);
    const title = braceTitle(me, intent, content);
    if (!p.braced) bad.push('the fixture no longer reaches a live brace');
    else {
      if (!title.includes(Math.round(p.absorb * 100) + '%')) bad.push('the button does not quote the absorb it gets: ' + title);
      if (!title.includes(String(p.cost))) bad.push('the button does not quote the stamina it spends: ' + title);
      const before = me.stamina;
      step(b, playerActions(b).find((a) => a.type === 'rest'), content);
      if (before - me.stamina !== p.cost) bad.push('the brace cost ' + (before - me.stamina) + ', the button said ' + p.cost);
    }
    const quiet = fight([builds[2], { ...builds[2], id: 'p2' }], 'patrol_2');
    intentOf(quiet, content);
    quiet.intent = { index: -1, name: 'Catch Breath', power: 0, tags: [], creatureClass: null, priority: false, ignoreGuard: false };
    const qt = braceTitle(playerActive(quiet), quiet.intent, content);
    if (/%/.test(qt)) bad.push('the button promises mitigation with nothing telegraphed: ' + qt);
  }

  // 7. THE LINES ARE THE SHIPPED LINES. 'stance.json' carried a 'lines'
  //    block nobody read while the engine spoke literals — content that says
  //    one thing and an engine that says another is R9's rule, and this is
  //    the third time it has been paid for.
  {
    const retuned = { ...content, stanceLines: { ...content.stanceLines, brace: '{name} DIGS IN for {cost}.' } };
    const b = fight([builds[2], { ...builds[2], id: 'l1' }], 'patrol_2');
    intentOf(b, retuned);
    step(b, playerActions(b).find((a) => a.type === 'rest'), retuned);
    if (!b.log.some((l) => /DIGS IN/.test(l))) bad.push('the engine does not speak the line the data ships');
    for (const k of ['brace', 'breath', 'absorbed', 'braceLive', 'braceIdle']) {
      if (!content.stanceLines?.[k]) bad.push('stance.json ships no "' + k + '" line');
    }
  }

  // 8. ONE READER. The tuning and the lines are read in battle/engine.js and
  //    indexed in render/renderer.js; everywhere else asks. The pilot kept
  //    its own copy of the table AND its own copy of the brace predicate,
  //    and the predicate was already a condition short of the engine's —
  //    it scored a brace for a creature with nothing left to swing, where
  //    the engine simply catches its breath (R61).
  for (const mod of ['battle/ai.js', 'battle/ui.js', 'tools/sim.js']) {
    if (/stanceMeta|stanceLines/.test(readFileSync('./' + mod, 'utf8'))) {
      bad.push(mod + ' reads the stance data behind the engine');
    }
  }

  if (bad.length) { console.error('stance ✗  ' + bad.join('; ')); process.exit(1); }
  console.log('stance ✓  the enemy commits first, a brace answers it and says what it costs, the counter-class comes in free');
`];

// R123 — WHO SHOULD I SEND. Asked for directly, and measured before a line
// was written, because the obvious answer is wrong twice over.
//
// Ranking creatures by their SOLO forecast ranks nobody: one creature
// against a multi-wave encounter is 0% for the structural reason
// forecast.js documents ("Bodies, not numbers"), so every score ties and a
// stable sort hands back the roster in its existing order.
//
// And raw strength is the wrong signal. On a class-mixed roster of nine,
// across the 13 of 14 encounters where the pick changes the outcome (mean
// spread 76pp), picking by strength lands 17.3pp off the best team — the
// same as doing nothing — while picking by the CLASS TRIANGLE lands 8.7pp
// off. The triangle is the game's own thesis and it is what carries this.
//
// A shortlist closes the rest: forecast the best few teams by that score and
// take the winner. Measured, top-8 lands 2.9pp off brute force at eight
// forecasts, where the briefing already pays for one.
//
// This gate holds the suggestion to a BAR, not to that number: within 5pp of
// the best, at least 8pp better than the roster's own order, inside its
// stated budget, never fielding a creature that cannot fight, and seeded.
const SQUAD = ['node', '-e', `
  const { readFileSync } = await import('node:fs');
  const { indexContent } = await import('./render/renderer.js');
  const { CONTENT_FILES: files } = await import('./data/loader.js');
  const { newGameState } = await import('./save/save.js');
  const { forecast } = await import('./battle/forecast.js');
  const { suggestTeam, TEAM_SIZE } = await import('./campaign/warroom.js');
  const { combatantFromChimera } = await import('./battle/engine.js');
  const { makeSimChimera, sampleBuilds } = await import('./tools/sim.js');
  const R = (p) => JSON.parse(readFileSync('./data/' + p + '.json', 'utf8'));
  const content = indexContent(Object.fromEntries(files.map((n) => [n, R(n)])));
  const t0 = 1700000000000;
  const bad = [];

  // THE TRUTH IS MEASURED AT 24 RUNS, not the 6 the first draft used. A noisy
  // truth is full of accidental ties, and a suggestion scores 0.0pp against
  // one whatever it picks. At 24 the same suggestion measured 3.0pp off.
  const TRUTH_RUNS = 24;
  const combos3 = (a) => { const o = []; for (let i=0;i<a.length;i++) for (let j=i+1;j<a.length;j++) for (let k=j+1;k<a.length;k++) o.push([a[i],a[j],a[k]]); return o; };
  const pool = sampleBuilds(content, 7, 11);
  const clsOf = (b, i) => combatantFromChimera({ ...makeSimChimera(b.frame, b.partIds, 'standard', content), id: 'p'+i, name: 'P' }, content, t0).creatureClass;
  const byClass = {};
  pool.forEach((b, i) => { const k = clsOf(b, i); if (k) (byClass[k] = byClass[k] || []).push(b); });
  const keys = Object.keys(byClass);
  // THREE ROSTERS, because one is how a 9.5pp algorithm passed. The first
  // draft of this gate used a single fixture, cleared its own 5pp bar on it,
  // and was 9.5pp off on the very next roster I tried by hand.
  const rosterAt = (off) => {
    const mixed = [];
    for (let r = off; mixed.length < 9; r++) for (const k of keys) { if (mixed.length < 9 && byClass[k][r]) mixed.push(byClass[k][r]); }
    return mixed.map((b, i) => ({ ...makeSimChimera(b.frame, b.partIds, i % 3 === 0 ? 'prime' : 'standard', content), id: 'r'+i, name: 'R'+i }));
  };

  let sumSug = 0, sumRoster = 0, rosters = 0, worstRoster = 0, worstBudget = 0;
  for (const off of [0, 1, 2]) {
    const roster = rosterAt(off);
    const state = { ...newGameState(), seed: 4242, chimeras: roster };
    let gapS = 0, gapR = 0, n = 0;
    // TWELVE encounters, not five. At five this gate reported 5.2pp mean and
    // 7.3pp worst while a wider sample of the same code measured 2.0 and 2.8:
    // encounters 0-4 happen to be the ones this heuristic finds hardest, so a
    // five-encounter slice was measuring the slice rather than the algorithm.
    for (const enc of Object.values(content.encounters).slice(0, 12)) {
      const truth = combos3(roster).map((t) => ({ t, wr: forecast(t, enc, content, 4242, t0, { runs: TRUTH_RUNS }).winRate }));
      truth.sort((a, b) => b.wr - a.wr);
      const best = truth[0].wr;
      if (best === truth[truth.length - 1].wr) continue;
      n++;
      const wrOf = (team) => (truth.find((s) => team.every((c) => s.t.some((x) => x.id === c.id))) || { wr: 0 }).wr;

      const out = suggestTeam(state, enc, content, t0);
      if (!out || !Array.isArray(out.team)) { bad.push('suggestTeam returned no team'); break; }
      if (out.team.length !== TEAM_SIZE) bad.push('a suggestion of ' + out.team.length + ' where the cap is ' + TEAM_SIZE);
      if (new Set(out.team.map((c) => c.id)).size !== out.team.length) bad.push('the same creature suggested twice');
      if (!out.why) bad.push('the suggestion does not say why, so it picks without teaching');
      worstBudget = Math.max(worstBudget, out.forecasts || 0);

      const again = suggestTeam(state, enc, content, t0);
      if (again.team.map((c) => c.id).join() !== out.team.map((c) => c.id).join()) {
        bad.push('two suggestions for the same briefing disagree');
      }
      gapS += best - wrOf(out.team);
      gapR += best - wrOf(roster.slice(0, 3));
    }
    if (!n) continue;
    sumSug += gapS / n; sumRoster += gapR / n; rosters++;
    worstRoster = Math.max(worstRoster, 100 * gapS / n);
  }

  if (rosters < 3) { bad.push('only ' + rosters + ' rosters had a pick worth making, so the spread is untested'); }
  else {
    const sug = 100 * sumSug / rosters;
    const doNothing = 100 * sumRoster / rosters;
    if (sug > 4) bad.push('the suggestion lands ' + sug.toFixed(1) + 'pp off the best team; the bar is 4');
    if (worstRoster > 5) bad.push('on its worst roster it lands ' + worstRoster.toFixed(1) + 'pp off; the bar is 5');
    if (doNothing - sug < 8) bad.push('it beats the roster order by only ' + (doNothing - sug).toFixed(1) + 'pp; the bar is 8');
    if (worstBudget > 12) bad.push('it spent ' + worstBudget + ' forecasts; the budget is 12');
    if (worstBudget === 0) bad.push('it reports no forecasts at all, so the budget clause proves nothing');
  }

  // IT NEVER FIELDS SOMEBODY WHO CANNOT FIGHT.
  {
    const roster = rosterAt(0);
    const hurt = { ...newGameState(), seed: 4242, chimeras: roster.map((c, i) => (i < 6 ? { ...c, injury: { name: 'Sprained Everything', until: t0 + 3600000 } } : { ...c })) };
    const out = suggestTeam(hurt, Object.values(content.encounters)[0], content, t0);
    const fit = new Set(['r6', 'r7', 'r8']);
    for (const c of out.team || []) if (!fit.has(c.id)) bad.push('the suggestion fields ' + c.id + ', which is in the Infirmary');
  }

  if (bad.length) { console.error('squad ✗  ' + bad.join('; ')); process.exit(1); }
  console.log('squad ✓  across three rosters the suggestion beats the roster order, lands near the best team, and never fields the injured');
`];

// R88 — a fight whose outcome was never in doubt should not cost the same
// attention as a duel. Measured on three 180-day walks before a line was
// written: 1,013 fights and ~177 MINUTES of beat replay per campaign, of
// which sparring alone is 543 fights at a 100% win rate.
//
// The roadmap proposed gating on "forecast >= 95% AND the fight is a spar,
// a hunt or a known rescue". Both halves were wrong. 95% is a number I made
// up when the game already ships the vocabulary — `walkover`, floor 0.90 —
// and R61 says the canonical predicate wins. And gating on KIND forfeits
// honest saving for no safety: sampled on the walk's real fights, a
// walkover DEFENCE won 38/39 and a walkover ASSAULT 12/12, exactly as
// certain as a spar. Across every kind, 451 sampled walkovers won 449.
//
// So the band decides, and the one kind that always plays is the rival
// duel — which is the criterion's own second clause, not a safety rule.
const SENT = ['node', '-e', `
  const { readFileSync } = await import('node:fs');
  const { indexContent } = await import('./render/renderer.js');
  const { CONTENT_FILES: files } = await import('./data/loader.js');
  const { createBattle, step } = await import('./battle/engine.js');
  const { pilotAction } = await import('./battle/autoplay.js');
  const { autoResolve, canSend, beatCost } = await import('./battle/autoplay.js');
  const { bandFor } = await import('./battle/forecast.js');
  const R = (p) => JSON.parse(readFileSync('./data/' + p + '.json', 'utf8'));
  const content = indexContent(Object.fromEntries(files.map((n) => [n, R(n)])));
  const { makeSimChimera, STARTER_BUILD } = await import('./tools/sim.js');
  const bad = [];
  const t0 = 1700000000000;

  const team = () => [0, 1, 2].map((i) => {
    const c = makeSimChimera(STARTER_BUILD.frame, STARTER_BUILD.partIds, 'prime', content);
    return { ...c, id: 'sent' + i, name: 'Sent ' + i };
  });
  const enc = Object.values(content.encounters)[0];

  // 1. SENDING IS NOT A SHORTCUT. The same battle, resolved by the autopilot
  //    and by a hand-rolled copy of the same loop, has to land on the same
  //    outcome, the same turn and the same log — otherwise \\'send them\\' is
  //    a second combat model wearing the first one's name.
  {
    const a = createBattle(team(), enc, content, 4242, t0);
    const b = createBattle(team(), enc, content, 4242, t0);
    autoResolve(a, content);
    let guard = 0;
    while (!b.over && guard++ < 400) {
      const act = pilotAction(b, content);
      if (!act) break;
      step(b, act, content);
    }
    if (a.outcome !== b.outcome) bad.push('sent says ' + a.outcome + ', flown says ' + b.outcome);
    if (a.turn !== b.turn) bad.push('sent ends on turn ' + a.turn + ', flown on ' + b.turn);
    if (a.log.join('|') !== b.log.join('|')) bad.push('the sent fight and the flown fight tell different stories');
  }

  // 2. AND IT IS SEEDED. Two sends of the same seed agree; a different seed
  //    is allowed to differ, or the gate would pass on a constant.
  {
    const a = createBattle(team(), enc, content, 99, t0);
    const b = createBattle(team(), enc, content, 99, t0);
    autoResolve(a, content); autoResolve(b, content);
    if (a.log.join('|') !== b.log.join('|')) bad.push('two sends of seed 99 disagree');
  }

  // 3. THE BAND DECIDES, NOT THE KIND. \\'canSend\\' reads the forecast the
  //    briefing has already paid for (R74: nobody runs 32 battles twice).
  {
    const wo = { band: bandFor(0.97), winRate: 0.97 };
    const even = { band: bandFor(0.5), winRate: 0.5 };
    for (const kind of ['sparring', 'breakout', 'rescue', 'defend', 'assault', 'raid']) {
      if (!canSend(wo, { kind })) bad.push('a walkover ' + kind + ' cannot be sent, though it is as certain as a spar');
      if (canSend(even, { kind })) bad.push('an even ' + kind + ' can be sent, and its outcome is in doubt');
    }
    // 4. A RIVAL DUEL ALWAYS PLAYS.
    if (canSend(wo, { kind: 'rival' })) bad.push('a rival duel can be skipped, and the duels are the set-pieces');
    if (canSend(null, { kind: 'sparring' })) bad.push('a fight with no forecast at all can be sent');
  }

  // 5. THE SAVING IS REAL, on the walk's own diet rather than on a bench.
  {
    const { loadSimContent, campaignWalk } = await import('./tools/sim.js');
    const c2 = loadSimContent();
    let total = 0;
    let sendable = 0;
    for (const seed of [2026, 808]) {
      const w = campaignWalk(c2, { seed, days: 120, stopAtDominion: false, priceBeats: true });
      for (const e of w.log) {
        if (e.beats === undefined) continue;
        total += e.beats;
        if (e.sendable) sendable += e.beats;
      }
    }
    if (!total) { bad.push('the walk recorded no beats at all, so nothing measured the saving'); }
    else {
      const pct = Math.round(100 * sendable / total);
      if (pct < 60) bad.push('only ' + pct + '% of the beats a walk replays can be sent; the floor is 60%');
      if (pct >= 100) bad.push('every beat is sendable, which means the rule is not discriminating');
    }
  }

  // 6. ONE BEAT TABLE. The saving above is arithmetic in milliseconds, and
  //    it is arithmetic about a fiction the moment the arena plays beats at
  //    lengths the harness is not counting. So the rule is not "the two
  //    tables agree" — comparing a copy with its original is the vacuous
  //    assertion R103 shipped three of — it is that there is only ONE.
  {
    const ui = readFileSync('./battle/ui.js', 'utf8');
    if (/const BEAT\\s*=\\s*\\{/.test(ui)) bad.push('battle/ui.js keeps a second beat table, so the arena and the harness can drift');
    if (!/beatCost/.test(ui)) bad.push('the arena does not use beatCost, so the saving is measured against a table nothing plays');
    if (beatCost({ kind: 'damage' }) === beatCost({ kind: 'bark' })) bad.push('every beat costs the same, so there is no cost model to speak of');
    if (beatCost({ kind: 'nonsense' }) !== beatCost({ kind: 'info' })) bad.push('an unknown beat kind does not fall back to the info length');
  }

  if (bad.length) { console.error('sent \\u2717  ' + bad.join('; ')); process.exit(1); }
  console.log('sent \\u2713  a send is the same fight flown by the autopilot, the band decides it, and a duel always plays');
`];

// R120 — the agenda says how much is waiting. Its own gate: no campaign walk
// here, because the rules that can silently stop being true are about what
// the ROWS say, and those are one fresh save and a read.
const SITTING = ['node', '-e', `
  const { readFileSync } = await import('node:fs');
  const { indexContent } = await import('./render/renderer.js');
  const { CONTENT_FILES: files } = await import('./data/loader.js');
  const { newGameState } = await import('./save/save.js');
  const { foundLab } = await import('./ranch/ranch.js');
  const { AGENDA, agenda } = await import('./ranch/agenda.js');
  const { runnableOps, startOperation, operationList } = await import('./campaign/operations.js');
  const R = (p) => JSON.parse(readFileSync('./data/' + p + '.json', 'utf8'));
  const content = indexContent(Object.fromEntries(files.map((n) => [n, R(n)])));
  const t0 = 1700000000000;
  const bad = [];

  // 1. EVERY ROW READS THE SAVE. R48's rule applied to all of them rather
  //    than the seven that happened to need it.
  const fixed = AGENDA.filter((row) => typeof row.hint !== 'function').map((r) => r.id);
  if (fixed.length) bad.push(fixed.length + ' rows are fixed sentences: ' + fixed.join(' '));

  // 2. AND SAYS A NUMBER. A function hint that returns the same words
  //    whatever the save holds is a fixed sentence wearing a callback.
  {
    const lean = { ...newGameState(), seed: 4242 };
    foundLab(lean, content, 'bramble_barn', t0);
    const fat = JSON.parse(JSON.stringify(lean));
    fat.funds = 999999;
    fat.ranch.penCapacity = 40;
    for (let i = 0; i < 6; i++) {
      fat.ranch.stock.push(JSON.parse(JSON.stringify(lean.ranch.stock[0])));
      fat.ranch.stock[fat.ranch.stock.length - 1].id = 'extra' + i;
    }
    const say = (state, id) => (agenda(state, content, t0).find((r) => r.id === id) ?? {}).hint;
    for (const id of ['care', 'buy', 'pens']) {
      const a = say(lean, id);
      const b = say(fat, id);
      if (!a || !b) { bad.push('the ' + id + ' row did not appear on both fixtures'); continue; }
      if (a === b) bad.push('the ' + id + ' row reads identically at 3 animals and at 9');
      if (!/[0-9]/.test(a)) bad.push('the ' + id + ' row says no number: ' + a);
    }
  }

  // 3. THE JOB COUNT IS THE NUMBER THAT LAUNCHES. laneFree alone said
  //    seven where three start; requiring a rider said one. The row and its
  //    hint both read runnableOps, and this is what holds it to the truth.
  {
    const s2 = { ...newGameState(), seed: 4242 };
    foundLab(s2, content, 'bramble_barn', t0);
    let launches = 0;
    for (const op of operationList(content)) {
      const probe = JSON.parse(JSON.stringify(s2));
      if (startOperation(probe, op.id, null, content, t0).ok) launches++;
    }
    const claimed = runnableOps(s2, content, t0).length;
    if (claimed !== launches) {
      bad.push('the job row claims ' + claimed + ' runnable, ' + launches + ' actually launch');
    }
    const hint = (agenda(s2, content, t0).find((r) => r.id === 'job') ?? {}).hint ?? '';
    if (!hint.includes(String(launches))) bad.push('and the hint does not say ' + launches + ': ' + hint);
  }

  if (bad.length) { console.error('sitting \u2717  ' + bad.join('; ')); process.exit(1); }
  console.log('sitting \u2713  every row reads the save, says a number, and the job count is the number that launches');
`];

// R119 — the first splice has a decision in it. Its own gate: five foundings
// and six rules, none of which the nine-minute suite needs to be run for.
const FOUNDING = ['node', '-e', `
  const { readFileSync } = await import('node:fs');
  const { indexContent } = await import('./render/renderer.js');
  const { CONTENT_FILES: files } = await import('./data/loader.js');
  const { newGameState } = await import('./save/save.js');
  const { foundLab, needsFounding, ensureRanchSeeded, ageStage } = await import('./ranch/ranch.js');
  const { extractAnimal } = await import('./splice/extract.js');
  const { spliceChimera } = await import('./splice/theater.js');
  const { agenda } = await import('./ranch/agenda.js');
  const R = (p) => JSON.parse(readFileSync('./data/' + p + '.json', 'utf8'));
  const content = indexContent(Object.fromEntries(files.map((n) => [n, R(n)])));
  const t0 = 1700000000000;
  const bad = [];
  const labs = content.starterLabs ?? [];

  if (labs.length < 5) bad.push('only ' + labs.length + ' founding labs');

  // 1. a fresh save is WAITING; a save with a herd never is
  {
    const fresh = { ...newGameState(), seed: 4242 };
    if (!needsFounding(fresh, content)) bad.push('a brand-new save is not asked to choose a lab');
    if (fresh.ranch.stock.length) bad.push('and it already owns animals');
    const old = { ...newGameState(), seed: 4242 };
    ensureRanchSeeded(old, content, t0);
    if (needsFounding(old, content)) bad.push('a save that already has a herd is asked to choose again');
  }

  // 2. every lab: three animals, exactly one grown, two species in the vault,
  //    and a first chimera that is actually a MIX
  const worn = [];
  const herds = [];
  for (const lab of labs) {
    const s = { ...newGameState(), seed: 4242 };
    foundLab(s, content, lab.id, t0);
    herds.push(s.ranch.stock.map((a) => a.species).sort().join(','));
    if (s.ranch.stock.length !== 3) bad.push(lab.id + ' seeds ' + s.ranch.stock.length + ' animals, not 3');
    const grown = s.ranch.stock.filter((a) => ageStage(a, content, t0) !== 'juvenile').length;
    if (grown !== 1) bad.push(lab.id + ' seeds ' + grown + ' grown donors, not 1');
    for (const a of [...s.ranch.stock]) {
      if (ageStage(a, content, t0) !== 'juvenile') extractAnimal(s, a.id, content, t0);
    }
    const vault = new Set(s.inventory.parts.map((p) => content.parts[p.partId]?.species));
    if (vault.size < 2) bad.push(lab.id + ' offers ' + vault.size + ' species to splice from');
    const bySlot = {};
    for (const p of s.inventory.parts) {
      const sl = content.parts[p.partId]?.slot;
      if (sl && !bySlot[sl]) bySlot[sl] = p.id;
    }
    s.theater = { busyUntil: 0 };  // R91 — see the note on the rush gate above.
    const made = spliceChimera(s, 'M', bySlot, content, t0);
    if (!made.ok) { bad.push(lab.id + ' cannot splice on day one: ' + made.msg); continue; }
    const c = s.chimeras[s.chimeras.length - 1];
    const mix = new Set(Object.values(c.tokens ?? {}).map((tk) => content.parts[tk.partId]?.species));
    if (mix.size < 2) bad.push(lab.id + ' builds a PUREBRED first creature');
    worn.push([...mix].sort().join('+'));
  }
  if (new Set(worn).size !== worn.length) bad.push('two labs produce the same first creature');
  // …AND THE ANIMALS DIFFER, not just the chimera. The crate alone can carry
  // "is a mix" and "is distinct", so a herd that went back to a literal
  // passed every other rule here — five labs handing out the same three
  // animals is a cosmetic choice with five labels on it.
  if (new Set(herds).size !== herds.length) {
    bad.push(labs.length + ' labs seed only ' + new Set(herds).size + ' distinct herds');
  }

  // 3. the crate holds no head, and cannot be spliced alone
  for (const lab of labs) {
    for (const pid of lab.crate ?? []) {
      if (content.parts[pid]?.slot === 'head') bad.push(lab.id + " crate holds a head");
      if (content.parts[pid]?.species === lab.donor) bad.push(lab.id + ' crate is the donor species');
    }
  }
  {
    const s = { ...newGameState(), seed: 4242 };
    foundLab(s, content, labs[0].id, t0);
    const only = {};
    for (const p of s.inventory.parts) only[content.parts[p.partId].slot] = p.id;
    s.theater = { busyUntil: 0 };
    if (spliceChimera(s, 'M', only, content, t0).ok) bad.push('the crate alone makes a chimera');
    if (agenda(s, content, t0).some((i) => i.id === 'splice')) {
      bad.push('the agenda offers a splice there is no head for');
    }
  }

  if (bad.length) { console.error('founding \u2717  ' + bad.join('; ')); process.exit(1); }
  console.log('founding \u2713  ' + labs.length + ' labs, every one a real choice, a real mix and no head in the crate');
`];

// R106 — the opening tells the truth about the wall it walks you into. Its
// own gate for the usual reason: the smoke suite takes nine minutes and this
// is one fresh save and four assertions, all of them on the one row that has
// ever pointed a new player at a fight nobody can win.
const OPENING = ['node', '-e', `
  const { readFileSync } = await import('node:fs');
  const { indexContent } = await import('./render/renderer.js');
  const { CONTENT_FILES: files } = await import('./data/loader.js');
  const { newGameState } = await import('./save/save.js');
  const { ensureRanchSeeded } = await import('./ranch/ranch.js');
  const { extractAnimal, GRADES, gradeFor } = await import('./splice/extract.js');
  const { spliceChimera } = await import('./splice/theater.js');
  const { agenda } = await import('./ranch/agenda.js');
  const { onboardingSteps } = await import('./ranch/onboarding.js');
  const { regionStates } = await import('./campaign/map.js');
  const { fitToFight } = await import('./battle/statblock.js');
  const R = (p) => JSON.parse(readFileSync('./data/' + p + '.json', 'utf8'));
  const content = indexContent(Object.fromEntries(files.map((n) => [n, R(n)])));
  const t0 = 1700000000000;
  // R133 — the stood-down line counts open nodes now instead of repeating a
  // fixed sentence, which is R120's own rule ("not the same sentence whether
  // one thing or twenty are waiting"). This gate kept a SECOND copy of the
  // constant that tools/smoke.js keeps, and updating one and not the other
  // is how a baseline goes red an hour after a green suite.
  const PLAIN = /^\\d+ nodes? you can take right now\\.$/;
  const openTo = (n) => {
    const s = { ...newGameState(), seed: 4242 };
    ensureRanchSeeded(s, content, t0);
    s.lastTickAt = t0;
    for (const a of [...s.ranch.stock].slice(0, n)) extractAnimal(s, a.id, content, t0);
    for (let made = 0; made < n; made++) {
      const head = s.inventory.parts.find((p) => content.parts[p.partId].slot === 'head');
      if (!head) break;
      const sp = content.parts[head.partId].species;
      const slots = { head: head.id }; const used = new Set([head.id]);
      for (const slot of ['forelimbs', 'hindlimbs', 'tail', 'hide', 'organ']) {
        const p = s.inventory.parts.find((x) => !used.has(x.id) && content.parts[x.partId].slot === slot && content.parts[x.partId].species === sp);
        if (p) { slots[slot] = p.id; used.add(p.id); }
      }
      s.theater = { busyUntil: 0 };
      spliceChimera(s, 'M', slots, content, t0);
    }
    for (const c of s.chimeras) c.settleUntil = t0;
    s.campaign.heldNodes = ['barn_perimeter'];
    return s;
  };
  const rowOf = (s) => agenda(s, content, t0).find((r) => r.id === 'assault');
  const bodiesOf = (s) => {
    const front = regionStates(s, content).flatMap((r) => r.nodes).find((n) => n.status === 'available');
    const enc = front ? content.encounters[front.node.encounter] : null;
    return (enc?.waves ?? []).filter((w) => content.enemies[w]).length;
  };
  const bad = [];
  const one = openTo(1), three = openTo(3);
  if (three.chimeras.length !== 3) bad.push('three starters did not make three chimeras');
  if (bodiesOf(one) !== 3) bad.push('the second node no longer fields three (' + bodiesOf(one) + ')');
  if (!rowOf(one)) bad.push('the row is not offered to an outnumbered player — a forecast is not a gate');
  {
    const hint = rowOf(one).hint;
    const said = (hint.match(/\\d+/g) ?? []).map(Number);
    const team = fitToFight(one, t0).length;
    if (PLAIN.test(hint)) bad.push('outnumbered, the row still stands down');
    if (!said.includes(bodiesOf(one)) || !said.includes(team)) bad.push('the row does not state the true bodies and team: "' + hint + '"');
    if (!/health bar/.test(hint)) bad.push('the row does not say it in A1 terms');
  }
  if (!PLAIN.test(rowOf(three).hint)) bad.push('the row cries wall at a team that can take the node: "' + rowOf(three).hint + '"');
  // R79 — a wave list outlives the roster it names. Drop a unit the front
  // node still lists and the count has to follow, or the row tells a new
  // player to bring a body for an opponent that no longer exists. The
  // shipped waves are all present, so this case is unreachable without
  // taking one away on purpose: break 88 went MISSED until this existed.
  {
    const s0 = openTo(1);
    const front = regionStates(s0, content).flatMap((r) => r.nodes).find((n) => n.status === 'available');
    const waves = content.encounters[front.node.encounter].waves;
    const thinned = { ...content, enemies: { ...content.enemies } };
    delete thinned.enemies[waves[0]];
    const lead = (h) => (h.match(/\\d+/g) ?? []).map(Number)[0];
    const full = agenda(s0, content, t0).find((r) => r.id === 'assault').hint;
    const thin = agenda(s0, thinned, t0).find((r) => r.id === 'assault').hint;
    // The LEADING number, against the same sentence on the full roster.
    // Asking only "does 2 appear anywhere" passed on the broken build: with
    // the filter gone the row reads "3 health bars against 1 — 2 more bodies
    // first", and the shortfall supplied the 2. A number that any number in
    // the sentence can satisfy is not an assertion.
    if (!(lead(thin) < lead(full))) {
      bad.push('a retired unit still counts as a body: "' + thin + '" against "' + full + '"');
    }
  }
  {
    const step = onboardingSteps(openTo(0), content, t0).find((x) => x.label === 'Build a stable of three');
    const spare = openTo(0).ranch.stock[0];
    if (!step) bad.push('the Path lost its sixth step');
    else if (!step.hint.includes(gradeFor(spare, content, t0, openTo(0)).name)) {
      bad.push('the Path does not say what the starters grade at today: "' + step.hint + '"');
    }
  }
  if (bad.length) { console.error('opening ✗  ' + bad.join('; ')); process.exit(1); }
  console.log('opening ✓  the second node fields three, and the row says so');
`];

// R87 — the Compliance Task Force: a stake, a sink and a ceiling. Its own
// gate for the usual reason — the smoke suite takes twelve minutes and this
// is one save and six assertions, all of them on the rules that make a raid
// fair rather than punishing.
const RAID = ['node', '-e', `
  const { readFileSync } = await import('node:fs');
  const { indexContent } = await import('./render/renderer.js');
  const { CONTENT_FILES: files } = await import('./data/loader.js');
  const { newGameState } = await import('./save/save.js');
  const { tickWorld } = await import('./campaign/world.js');
  const tf = await import('./campaign/taskforce.js');
  const R = (p) => JSON.parse(readFileSync('./data/' + p + '.json', 'utf8'));
  const content = indexContent(Object.fromEntries(files.map((n) => [n, R(n)])));
  const T = tf.taskforceTuning(content);
  const t0 = 1700000000000, HR = 3600000;
  const mk = () => {
    const s = { ...newGameState(), seed: 8701, funds: 100000 };
    s.lastTickAt = t0; s.dominionAt = t0 - 24 * HR;
    s.campaign.notoriety = 4000;
    s.ranch.stock = [{ id: 'a1', name: 'Bessie' }, { id: 'a2', name: 'Gordon' }, { id: 'a3', name: 'Pickles' }];
    s.chimeras = [{ id: 'c0', name: 'Chompers', tokens: {}, frame: 'M', settleUntil: 0, bond: 50, xp: 0 }];
    return s;
  };
  const bad = [];
  { const s = mk(); tickWorld(s, content, t0 + 60000);
    if (s.campaign.notoriety !== T.notorietyCap) bad.push('notoriety is not capped (' + s.campaign.notoriety + ')'); }
  // R9: a schedule, not a roll.
  { const a = mk(); tickWorld(a, content, t0 + 60000); const at = a.campaign.nextRaidAt;
    const b = mk(); tickWorld(b, content, t0 + 60000);
    let early = 0; const step = (at - t0 - 60000) / 300;
    for (let x = t0 + 60000; x < at; x += step) { tickWorld(b, content, x); if (b.campaign.raid) early++; }
    if (early) bad.push('checking in often summoned a raid early');
    if (b.campaign.nextRaidAt !== at) bad.push('the schedule moved under many small ticks'); }
  // R9's exemption: the window opens on sight.
  { const s = mk(); tickWorld(s, content, t0 + 60000);
    const away = t0 + 14 * 24 * HR; tickWorld(s, content, away);
    const raid = tf.activeRaid(s);
    if (!raid) bad.push('a fortnight away met no raid at all');
    else if (raid.startedAt !== away) bad.push('the window did not open on sight');
    else if (tf.raidRemainingMs(raid, away) !== T.windowHours * HR) bad.push('and it was not the full window');
    if ((s.campaign.leviedTotal ?? 0) > 0) bad.push('a fortnight away was levied'); }
  // The levy takes money and livestock and NEVER a creature.
  { const s = mk(); tickWorld(s, content, t0 + 60000); tickWorld(s, content, t0 + 20 * HR);
    const raid = tf.activeRaid(s); const q = tf.levyOf(s, content);
    const chim = s.chimeras.length, stock = s.ranch.stock.length;
    tickWorld(s, content, raid.deadline + 60000);
    if (!(s.campaign.leviedTotal > 0)) bad.push('a missed window cost nothing');
    if (s.chimeras.length !== chim) bad.push('the State took a CREATURE');
    if (s.ranch.stock.length !== stock - q.stock) bad.push('the herd is wrong'); }
  // Winning buys quiet; losing costs the same as not turning up.
  { const s = mk(); tickWorld(s, content, t0 + 60000); tickWorld(s, content, t0 + 20 * HR);
    const raid = tf.activeRaid(s); const n0 = s.campaign.notoriety, f0 = s.funds;
    tf.resolveRaid(s, content, raid.id, 'win', raid.startedAt + HR);
    if (s.funds !== f0) bad.push('a held raid was levied anyway');
    if (s.campaign.notoriety !== n0 - T.notorietyRelief) bad.push('winning bought no quiet');
    const l = mk(); tickWorld(l, content, t0 + 60000); tickWorld(l, content, t0 + 20 * HR);
    const r2 = tf.activeRaid(l); const lf = l.funds;
    tf.resolveRaid(l, content, r2.id, 'loss', r2.startedAt + HR);
    if (!(l.funds < lf)) bad.push('losing on purpose was cheaper than turning up'); }
  // Out of range, nothing runs.
  { const s = mk(); s.dominionAt = null; s.campaign.notoriety = 10; s.campaign.heldNodes = [];
    tickWorld(s, content, t0 + 60000);
    if (s.campaign.nextRaidAt != null || tf.activeRaid(s)) bad.push('a player who has provoked nobody was raided'); }
  if (bad.length) { console.error('raid ✗  ' + bad.join('; ')); process.exit(1); }
  console.log('raid ✓  scheduled, opened on sight, levied in money and never in creatures');
`];

const VERBOSE = process.argv.includes('--verbose');
// R91 — run the baseline pass and stop. The baseline is the fast half (every
// gate once, on a pristine copy) and the breaks are the hour; when a change
// moves a gate rather than a break, the whole hour is spent re-learning
// something the first three minutes already said. Needed it twice in one
// milestone, which is the bar for a flag.
const BASELINE_ONLY = process.argv.includes('--baseline');
// R95 — run these breaks and nothing else: `--only 158,159,163`. Same
// argument as `--baseline` above, one level finer. A milestone that adds
// seven breaks needs to know each one goes red BEFORE it spends the hour
// proving the other hundred and fifty-seven still do, and aiming a break is
// iterative: the first anchor is often in the wrong place, and the loop that
// tells you so must not be an hour long. Needed it three times in one
// milestone, which is this file's own bar for a flag.
const ONLY = (() => {
  const i = process.argv.indexOf('--only');
  if (i < 0) return null;
  return new Set(String(process.argv[i + 1] ?? '').split(',').map((n) => Number(n.trim())));
})();

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
    s.theater = { busyUntil: 0 };
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
  // R150 — THE KITE CLAUSE IS GONE FROM HERE, and the second walk with it.
  // R141 asked this seed for a Kite, R144 added seed 7 to make the sample
  // honest, and seed 7 is one of the seeds that has NEVER built one — at 45
  // days or at 180. The pair passed on 4242 alone, so the fix bought three
  // seconds of walking and no coverage at all.
  // Measured across sixteen seeds: 31% of 45-day walks build a Kite, and
  // never more than one. What R141 actually fixed — the planner refusing the
  // frame for owning a leg, and returning on the first chassis that
  // validated — is now asserted deterministically in smoke's shard a, by
  // asking \`bestSplice\` which frame it picks in front of a wall that swings.
  // R148 — and a Rumbler. Measured on this seed and window: 5 of 17 splices.
  if (!(w.framesBuilt?.L > 0)) fail('the walk never builds a Rumbler (' + JSON.stringify(w.framesBuilt) + ')');
  console.log('walk ✓  ' + w.duels + ' duels, ' + w.breakouts + ' hunts, ' + w.bagged
    + ' bagged, lab at ' + levels + ', frames ' + JSON.stringify(w.framesBuilt) + ' over 45 days');
`];

const ROADMAP = ['node', 'tools/roadmap.js'];

const BREAKS = [
  // R93b's break 157 lived here and R95 retired it. The planner boosting
  // combos it has already discovered was worth 16.5pp when a campaign could
  // assemble nine of the 27 (71.4% against 54.9%); with twenty-five
  // assemblable it is worth 5.1pp (32.6% against 27.5%) and the per-seed
  // results cross over. The fix is still in `tools/sim.js` and still right —
  // what is gone is the gate's ability to see it, and a break that only goes
  // red by luck teaches this battery to lie about its own coverage. The
  // numbers are in tools/coverage.js.
  {
    // RULE 1 — the route table. A species nobody can obtain is content that
    // does not exist, and the only reason none ships today is that nothing
    // was checking.
    n: 158, gate: REACH, name: 'a species is taken out of the catalogue with no other way in, so six parts stop existing',
    file: 'data/species.json',
    anchor: '"mailOrderPrice": 420',
    to: '"mailOrderPrice": null',
  },
  {
    n: 159, gate: REACH, name: 'a variant loses the base species it is supposed to mutate off',
    file: 'data/species.json',
    anchor: '"variantOf": "ram"',
    to: '"variantOf": "aurochs"',
  },
  {
    // RULE 2 — reach. Each of these three is a door R95 opened, and closing
    // any one of them puts the median campaign back under the floor.
    // RE-AIMED. This first read `const fresh = []`, which came back MISSED:
    // never-held is a SUBSET of owes-the-Dex-a-part, so emptying it changed
    // which collectible the walker bought and not whether it collected. What
    // R95 actually added is the ORDER, so the break takes the whole of it and
    // puts back the rule that shipped before — best answer in the demanded
    // class, else the cheapest thing on the list.
    n: 160, gate: REACH, name: 'the walker goes back to the best answer in the demanded class, and stops collecting',
    file: 'tools/sim.js',
    anchor: `    const pickSp = freshAnswers.length ? best(freshAnswers)
      : fresh.length ? best(fresh)
      : mates.length ? mates[0]
      : incomplete.length ? incomplete[0]
      : answers.length ? best(answers)
      : affordable[0];`,
    to: '    const pickSp = answers.length ? best(answers) : affordable[0];',
  },
  {
    n: 161, gate: REACH, name: 'every captive goes to the Wing, so the eight enemy-tech parts have no door at all',
    file: 'tools/sim.js',
    anchor: '    if (carriesNew) {',
    to: '    if (false && carriesNew) {',
  },
  {
    n: 162, gate: REACH, name: 'the buyer locks the breeder out again, and the six variant lines are never rolled for',
    file: 'tools/sim.js',
    anchor: '  const herdRoom = Math.min(state.ranch.penCapacity, chasing ? WORKING_HERD : HERD_CAP)',
    to: '  const herdRoom = Math.min(state.ranch.penCapacity, chasing ? HERD_CAP : HERD_CAP)',
  },
  {
    // RULE 3 — the wall quotes its price. Ten of thirty-one encounters cannot
    // be won at Standard by any shipped build; the briefing has to say which
    // grade clears it rather than "not strong enough yet".
    n: 163, gate: REACH, name: 'the briefing goes back to naming no grade, so a wall never says what it costs',
    file: 'battle/forecast.js',
    anchor: '    if (lifted.band.floor < EVEN_FLOOR) continue;',
    to: '    if (true) continue;',
  },
  {
    n: 151, gate: COVERAGE, name: 'the planner stops weighing combos, so a campaign never discovers one again',
    file: 'tools/sim.js',
    anchor: '  const rank = (t) => (completable.has(t.partId) ? 30 : 0)',
    to: '  const rank = (t) => (false ? 30 : 0)',
  },
  {
    // R157 re-aimed this. It used to zero THEATER_STALLS, which now has THREE
    // readers -- the two clocks and the splice ceiling -- so zeroing it took
    // the reservation away AND raised the ceiling from nine to twelve, the two
    // cancelled, and the break came back MISSED. It aims at the clocks' own
    // predicate instead, which is the rule its name describes.
    n: 152, gate: COVERAGE, name: 'the Wing and the vat take every stall again, and the Surgery Theater never gets one',
    file: 'tools/sim.js',
    anchor: 'const clockRoom = (state, content) => stableRoom(state, content).free > THEATER_STALLS;',
    to: 'const clockRoom = () => true;',
  },
  {
    // R154 — the paddock stops buying stable room, and "Expand the pens" goes
    // back to meaning only livestock. Aimed at the derivation rather than at
    // the data, because a ratio of zero would read as a content choice.
    n: 251, gate: COVERAGE, name: 'a pen stops buying a stall, so the Pens screen and the pen button mean different things again',
    file: 'splice/facility.js',
    anchor: '  const past = (state.ranch?.penCapacity ?? 0) - (meta.freePens ?? 0);',
    to: '  const past = 0;',
  },
  {
    // R154 — the room is bought and nothing stands in it. The cap still grows,
    // so the first half of the rule passes and only the second catches this:
    // a stall the roster never fills is the feature shipping as a number on a
    // screen. R157 could not write this break at all — at a fixed grant the
    // walker lands in the same place whichever way the constant reads.
    n: 252, gate: COVERAGE, name: 'the stable grows and the roster does not, so a bought stall stands empty',
    file: 'tools/sim.js',
    anchor: '      const cap = Math.min(room.cap - THEATER_STALLS, opts.stableCap ?? Infinity);',
    to: '      const cap = Math.min(12 - THEATER_STALLS, opts.stableCap ?? Infinity);',
  },
  {
    // R154 — the Pens' budgets go back to the Theater's grant alone, which is
    // what they were worth before a pen bought stable room. The screen is one
    // folded card per chimera and the walk now keeps sixteen, so a budget cut
    // to twelve cards is 1,640px against 1,923 and the gate says so. The break
    // exists because a DERIVED budget can rot in a way a typed one cannot:
    // nothing else in this file would notice the stall term going away, and a
    // budget that stopped tracking the stable would simply be too tight and
    // get bumped back by hand — which is the number-dragged-behind-the-thing
    // R92 named, arriving by the back door.
    n: 253, gate: HEIGHT, name: "the Pens' budget stops counting the stalls a pen buys",
    file: 'tools/height.js',
    anchor: '  + Math.floor((TUNING.penMaxCapacity - (FACILITY.stalls?.freePens ?? 0))',
    to: '  + 0 * Math.floor((TUNING.penMaxCapacity - (FACILITY.stalls?.freePens ?? 0))',
  },
  {
    // R154 — and the other failure a derivation can have, which is the one
    // that does NOT announce itself. `undefined - freePens` is NaN, NaN
    // propagates through the multiply, and `1923 > NaN` is false: every
    // height and word comparison on this screen passes, in silence, forever.
    // Aimed at the measured constant rather than at the tuning it multiplies,
    // so the patch is one token and the gate has to catch the value rather
    // than the missing import.
    n: 254, gate: HEIGHT, name: 'a Pens budget arrives NaN, and every comparison on the screen quietly passes',
    file: 'tools/height.js',
    anchor: 'const PEN_CHROME = { px: 560, words: 78 };',
    to: 'const PEN_CHROME = { px: NaN, words: 78 };',
  },
  {
    // R157 — the other half of 152. THEATER_STALLS reserves the room; this is
    // the rule that stops the splice policy taking it. Break it and the walker
    // splices to the whole grant, both clocks starve, and coverage says so.
    n: 249, gate: COVERAGE, name: 'the splice policy takes the whole grant again, so the vat and the Wing never get a stall',
    file: 'tools/sim.js',
    anchor: '      const cap = Math.min(room.cap - THEATER_STALLS, opts.stableCap ?? Infinity);',
    to: '      const cap = Math.min(room.cap, opts.stableCap ?? Infinity);',
  },
  {
    n: 153, gate: COVERAGE, name: 'the walker stops running the Resequencer, so what a vial is worth goes back to being unmeasured',
    file: 'tools/sim.js',
    anchor: "      did('resequence', { species: best.species, stars: best.stars });",
    to: '      void 0;',
  },
  {
    n: 154, gate: COVERAGE, name: 'the chaos vat goes back to being the one agenda row with nothing behind it',
    file: 'tools/sim.js',
    anchor: "        if (startVat(state, a.id, b.id, content, now).ok) { did('vat', { sire: a.id, dam: b.id }); ran = true; }",
    to: '        ran = true;',
  },
  {
    n: 155, gate: COVERAGE, name: 'a moveset retrain stops being logged, so four slots are exercised and nothing says so',
    file: 'tools/sim.js',
    anchor: "      if (setMoveset(state, c.id, pick, known, now, content).ok) did('moveset', { who: c.id });",
    to: '      setMoveset(state, c.id, pick, known, now, content);',
  },
  {
    n: 156, gate: COVERAGE, name: 'an agenda row is added that no walker verb answers, and the coverage rule lets it through',
    file: 'ranch/agenda.js',
    anchor: "    id: 'pens', kind: 'spend', screen: 'ranch', label: 'Expand the pens',",
    to: "    id: 'audit', kind: 'spend', screen: 'ranch', label: 'Audit the paperwork',\n    hint: () => 'x', ready: () => true,\n  },\n  {\n    id: 'pens', kind: 'spend', screen: 'ranch', label: 'Expand the pens',",
  },
  {
    n: 143, gate: VAULT, name: 'the vault stops having a capacity, so a campaign hoards nine thousand parts again',
    file: 'splice/vault.js',
    anchor: '  return { parts: g.vaultParts, vials: g.vaultVials };',
    to: '  return { parts: Infinity, vials: Infinity };',
  },
  {
    n: 144, gate: VAULT, name: 'the containment board goes back to being an append-only ledger of every capture ever',
    file: 'campaign/rehab.js',
    anchor: '  const cap = rehabGrants(state, content).bays;',
    to: '  const cap = Infinity;',
  },
  {
    n: 145, gate: TABLE, name: 'the Theater table is never occupied, so a creature can be built and scrapped in the same minute',
    file: 'splice/facility.js',
    // R135 gave `occupyTheater` a `kind`, so the anchor moved with it.
    anchor: '  state.theater.busyUntil = now + theaterBusyFor(state, content, kind);',
    to: '  state.theater.busyUntil = now;',
  },
  {
    n: 146, gate: VAULT, name: 'the stable stops having a size, so nothing bounds how many creatures a save carries',
    file: 'splice/facility.js',
    // R154 added the paddock's half to this line; the rule is unchanged and
    // the anchor follows it rather than being retired.
    anchor: '  const cap = theaterGrants(state, content).stable + stallsFromPens(state, content);',
    to: '  const cap = Infinity;',
  },
  {
    n: 147, gate: VAULT, name: 'a vial never retires, so the rack grows for as long as the player extracts',
    file: 'splice/vault.js',
    anchor: '  while (inv.vials.length > cap) {',
    to: '  while (false) {',
  },
  {
    n: 148, gate: VAULT, name: 'the walker goes back to swapping creatures on any improvement, ignoring the grades a dismantle burns',
    file: 'tools/sim.js',
    anchor: '        if (plan.score > quality(weakest) + burned) {',
    to: '        if (plan.score > quality(weakest)) {',
  },
  {
    // The first version of this break disabled the REPORTER in tools/vault.js
    // and went MISSED, correctly: with every array declared there was nothing
    // to report, so silencing the report changed nothing. What the rule
    // actually guards is a new unbounded list arriving in the save, so that
    // is what the break does — the failure mode R50 was written for, in the
    // file where a save's shape is decided.
    n: 149, gate: VAULT, name: 'a new unbounded list joins the save shape, and the declare-yourself rule lets it through',
    file: 'save/save.js',
    anchor: '    discoveredCombos: [],',
    to: '    discoveredCombos: [],\n    auditTrail: [],',
  },
  {
    // R98 — the Ranch loses the rule the Pens has had since R89 and goes
    // back to twenty-three folds open at once: 935 words becomes 1,686 and
    // 4,852px becomes 14,450. One argument, and it is the whole screen.
    n: 169, gate: HEIGHT, name: 'every Ranch card can be open at once again, and the screen is twenty dossiers deep',
    file: 'ranch/ui.js',
    anchor: '    { exclusive: state.ranch.stock.map((animal) => `ranch-${animal.id}`) });',
    to: '    {});',
  },
  {
    // R98 — the shared fold helper stops shutting the others, which breaks
    // the rule for the Pens as well as the Ranch. Aimed at `ui/cards.js`
    // rather than either caller, because that is where "at most one" lives.
    n: 170, gate: HEIGHT, name: 'opening one fold stops shutting its group, so at-most-one becomes any-number',
    file: 'ui/cards.js',
    anchor: '        for (const other of exclusive) if (other !== id) state.ui.collapsed[other] = true;',
    to: '        for (const other of []) state.ui.collapsed[other] = true;',
  },
  {
    // R98 — a screen ships with no word budget at all. The height half of
    // this gate has refused an undeclared screen since R89; the word half
    // has to refuse one too, or a new screen arrives measured on one axis.
    // RE-AIMED. This first removed the GUARD — `WORDS[r.id] ?? Infinity` —
    // and went MISSED, because every screen currently declares a budget so
    // the fallback never fired. A break has to make the thing the rule
    // forbids actually happen: a screen with no entry at all.
    n: 171, gate: HEIGHT, name: 'a screen can ship without declaring what it is allowed to say',
    file: 'tools/height.js',
    anchor: "  'dex:genes':    { folded: 100,  open: 250 },",
    to: '',
  },
  // --- gate: a11y (R99 — the two defects the entry names, replayed) --------
  {
    // R99's CRITERION, half one. The feral panel's body text goes back to
    // `--muted` on the warn ground: 3.42:1, under AA, on the one panel that
    // explains how not to lose a creature. It passed every run for four
    // milestones — not because the contrast rule was wrong but because the
    // fold walk never drew the panel.
    n: 180, gate: A11Y, name: 'the feral panel is dim again, on the card that explains how not to lose a creature',
    file: 'style.css',
    anchor: '.feral-panel .fine-print { color: var(--text); }',
    to: '.feral-panel .fine-print { color: var(--muted); }',
  },
  {
    // R99's CRITERION, half two. The egg's Hurry button goes back inside
    // `.encounter`, the flex line R86 found it overflowing: 110px past its
    // card and 98px past the phone. A control that leaves its card still
    // reports a full-size rect, so the 40px floor and the 6px gutter both
    // pass it — which is why this shipped after a green run and was caught
    // by screenshot.
    n: 181, gate: A11Y, name: 'the egg\'s Hurry button goes back into its row, and off the side of the phone',
    file: 'ranch/ui.js',
    anchor: `      </div>
      \${
        // R86: under the row, not in it. \`.encounter\` is a flex line already
        // holding a portrait, two lines of lineage and the countdown, and a
        // full-width button dropped into it overlapped the text and ran past
        // the card at 380px — measured, after the a11y gate had passed it,
        // because that gate checks size and gutter and not overlap.
        t < egg.hatchAt ? \`<div class="egg-rush">\${rushButton(rushQuote(state, 'egg', egg.id, content, t))}</div>\` : ''
      }\`;`,
    to: `        \${t < egg.hatchAt ? rushButton(rushQuote(state, 'egg', egg.id, content, t)) : ''}
      </div>\`;`,
  },
  {
    // R99 — THE REACH COLLAPSES IN SILENCE, which is the whole reason this
    // milestone existed. The fold walk stops re-querying and every pass
    // toggles the FIRST fold instead of its own, which is what the old
    // one-shot `forEach(click)` did once the first click rerendered the
    // screen. No rule breaks; the gate simply stops seeing. Caught only
    // because the walk now has to prove what it drew.
    n: 182, gate: A11Y, name: 'the fold walk stops re-querying, so the gate goes quietly blind again',
    file: 'tools/a11y.js',
    anchor: `          const b = document.querySelector('#screen-\${s} button[data-fold="\${id}"]');`,
    to: `          const b = document.querySelector('#screen-\${s} button[data-fold]');`,
  },
  {
    // R99 — two controls sit on top of each other. R80's gutter rule reads
    // the overlap as a separation and reports the distance as though they
    // were still apart.
    n: 183, gate: A11Y, name: 'alternate subtabs slide onto their neighbours, and the gutter rule calls it a gap',
    file: 'style.css',
    anchor: '  gap: 6px;  /* R80 — the tightest strip in the game was the one with the most buttons in it. */',
    to: '  gap: 6px;\n}\n.subtabs button:nth-child(even) { left: -26px;',
  },
  {
    // R99 — the two transitions lose their off-switch. The arena's ground
    // washes colour on a crit and both sprite slots fade in, for a player who
    // asked their OS to stop moving things. Caught twice over: by the source
    // rule and by the browser with the media query on.
    n: 184, gate: A11Y, name: 'the arena moves again for a player who asked it not to',
    file: 'style.css',
    anchor: '  .stage, .slot { transition: none; }',
    to: '',
  },
  {
    // R99 — and one KEYFRAME loses its off-switch, which only the source half
    // can see: `.poof` exists for nine tenths of a second in the middle of a
    // graduation, and no browser pass will ever have it on screen when it
    // looks. This is the break that proves the source rule earns its place.
    n: 185, gate: A11Y, name: 'a graduation animation loses its off-switch, where no browser pass can see it',
    file: 'style.css',
    anchor: '  .grad-shake, .grad-flash, .poof { animation: none; }',
    to: '  .grad-shake, .grad-flash { animation: none; }',
  },
  // --- gate: facility (every track is bought where its system lives) ------
  {
    // R128 — the exact bug the entry's own proposal would have shipped. The
    // Extractor's `screen` said `extract` from the day it was written, and
    // routing tracks by that field without checking it first would have put
    // one on a screen the shell has never rendered.
    n: 172, gate: FACILITY, name: 'a facility track points at a screen that does not exist, and is bought nowhere',
    file: 'data/facility.json',
    anchor: '      "screen": "vault",',
    to: '      "screen": "extract",',
  },
  {
    // R128 — the card is a fold, and the Theater had never bound one, so it
    // shipped a header nothing listened to until assertion 4 said so. This
    // is the miss replayed: visible, unopenable, and worse than hidden
    // because it looks like it works.
    n: 173, gate: FACILITY, name: 'the Theater draws its upgrade card and binds no fold, so the header is dead',
    file: 'splice/theater-ui.js',
    anchor: '  bindFolds(root, ctx, () => renderTheaterScreen(root, ctx));',
    to: '',
  },
  {
    // R128 — the other half of the same miss. Moving the `upgrade` branch out
    // of the Ranch's `data-act` loop without adding the shared binder left a
    // live-looking buy button on the ONE screen where it had always worked.
    n: 174, gate: FACILITY, name: 'the Ranch keeps the buy button and loses the handler behind it',
    file: 'ranch/ui.js',
    anchor: `  bindFacility(root, ctx, again, (r) => {
    if (r.ok) sfx.play('splice');
    lastMsg = r.msg;
  });`,
    to: '',
  },
  {
    // R128 — the card stops reading the field this milestone exists to read.
    // Every screen draws all six again, which is the pre-R128 Ranch card
    // five times over: the Surgery Theater's upgrade is on the Pens, the
    // Infirmary's is in the Vault, and none of them is where its system is.
    n: 175, gate: FACILITY, name: 'every screen draws every track again, so no upgrade is where its machine is',
    file: 'ui/facility-card.js',
    anchor: '  return tracks(content).filter((t) => t.screen === screen);',
    to: '  return tracks(content);',
  },
  {
    // R128b — the four breaks below are the report from play, replayed. Every
    // gate R128 wrote was green when a player opened the game and could not
    // find the upgrades, because all four assertions asked whether the card
    // EXISTS and none asked where it was, what it was called, or whether the
    // sentence pointing at it was still true.
    //
    // The card goes back to being APPENDED, which is where R128 shipped it:
    // 12th of 12 cards on the Pens and 1.9 phone screens down, on a screen
    // whose whole point was that a creature costs a row.
    n: 176, gate: HEIGHT, name: 'the upgrade card is appended again, so it is the last thing on the screen',
    file: 'splice/pens-ui.js',
    // R135 moved the anchor by one line — the Pens gained `tablePointer`
    // under the card — so the patch now carries both past the roster.
    anchor: `    facilityCard(state, content, 'pens') +
    // R135 — the Pens hosts the Dismantle button and sells nothing that
    // speeds it up. One line, under the card that sells the machine this
    // screen DOES own, pointing at the one it does not.
    tablePointer(state, content) +
    (cards ||
      \`<section class="card"><p class="ranch-msg">No chimeras yet. The Splice tab accepts walk-ins.</p></section>\`);`,
    to: `    (cards ||
      \`<section class="card"><p class="ranch-msg">No chimeras yet. The Splice tab accepts walk-ins.</p></section>\`) +
    facilityCard(state, content, 'pens') +
    tablePointer(state, content);`,
  },
  {
    // R128b — the roll-up's links lose their rule and become grey buttons
    // wedged mid-sentence. This is the exact defect that shipped: I invented
    // `linkish`, never wrote the CSS, and nothing noticed, because an
    // unstyled class is not an error — it is a default button.
    n: 177, gate: FACILITY, name: 'the roll-up paints a class with no rule, and four links render as grey chips',
    file: 'ui/facility-card.js',
    anchor: 'class="facility-goto" data-goto="${s}"',
    to: 'class="linkish" data-goto="${s}"',
  },
  {
    // R128b — the roll-up says `theater` and `battle` at the player again.
    // Neither is a word this game shows anybody: those tabs read Splice and
    // War, so the sentence sends someone looking for a tab that is not there.
    n: 178, gate: FACILITY, name: 'the roll-up names screens by their internal ids, and points at tabs that do not exist',
    file: 'ui/facility-card.js',
    anchor: '>${screenName(s)}</button>',
    to: '>${s}</button>',
  },
  {
    // R128b — the card is titled after the LEVEL again. A player on the
    // Splice screen reads "Tier I — Card Table & Optimism" and has no reason
    // to think that row is the Surgery Theater's upgrade; the machine is
    // what they came looking for, so the machine is the heading.
    n: 179, gate: FACILITY, name: 'the card is titled after the level it owns instead of the machine it sells',
    file: 'ui/facility-card.js',
    anchor: '  const name = solo ? solo.name : \'Facility\';',
    to: '  const name = solo ? (level ?? solo.name) : \'Facility\';',
  },
  {
    // R97 — the Dex stops keying generated specimens by lab. A rival mints a
    // fresh one every duel, so filing them raw put 253 entries in a save
    // that has 42 authored units, and none of them was ever rendered.
    n: 165, gate: VAULT, name: 'every generated specimen files under its own id again, one Dex page per duel',
    file: 'campaign/rivals.js',
    anchor: '  if (content.enemies?.[unitId]) return unitId;',
    to: '  if (unitId) return unitId;',
  },
  {
    // R97 — the migration collapses the old ids and forgets to count them, so
    // a player who had met ninety-four of Mantissa's creatures arrives on the
    // new save having met none. Deleting a number somebody earned is worse
    // than leaving the mess alone.
    n: 166, gate: UNION, name: 'the migration collapses the old ids and drops the count of what it collapsed',
    file: 'save/migrations.js',
    anchor: '      if (m) save.dex.sightings[`lab:${m[1]}`] = (save.dex.sightings[`lab:${m[1]}`] ?? 0) + 1;',
    to: '      if (false && m) save.dex.sightings.never = 1;',
  },
  {
    // R97 — the Foes row goes back to counting the raw list against the
    // authored total, which is how it came to read "253/42 logged" with the
    // aggregate hiding it behind a Math.min.
    n: 167, gate: UNION, name: 'the Foes counter counts the raw list again, and can read past its own maximum',
    file: 'splice/dexentry.js',
    anchor: '      found: (dex.enemies ?? []).filter((id) => content.enemies[id] || labOfDexKey(id)).length,',
    to: '      found: (dex.enemies ?? []).length,',
  },
  {
    // R97 — a lab the build no longer ships starts being filed anyway, under
    // a key nothing can describe. R72's rule reaching the Dex: ignore what the
    // build does not have rather than inventing a page for it.
    n: 168, gate: UNION, name: 'a retired lab is filed anyway, under a key no screen can resolve',
    file: 'campaign/rivals.js',
    anchor: `  // A retired rival, or an id nobody has thought of. Absent beats miscounted.
  return null;`,
    to: '  return unitId;',
  },
  // R135 RETIRES BREAK 164, and the measurement is the reason.
  //
  // It removed the walker's minimum-tenure guard in tools/sim.js, and on
  // main that produced R95's conveyor belt: median chimera life 2.92 days
  // against a floor of 5, caught. On R135's tree the same patch leaves it at
  // 13.3 days and the gate passes, so the break stopped biting — the full
  // battery caught that, which is what trigger #1 is for.
  //
  // WHY, measured four ways. A dismantle at 3h clears a slot quickly and
  // then the walker waits 20h to splice, so CREATING became the only
  // throttle — and a stronger one than the old shared clock. Nothing on the
  // dismantle side can make a conveyor belt any more: a FREE dismantle with
  // the tenure guard also gone measures 87.2 days, longer still, because
  // fewer creatures get made at all.
  //
  //   main + no tenure guard            2.92 days   (gate fails — caught)
  //   R135 + no tenure guard           13.3  days   (gate passes — missed)
  //   R135 + free dismantle, no guard  87.2  days
  //   R135 + a 30-minute SPLICE        62.7  days
  //   …and the same with the vault +50% and the stable 8/16
  //                                     2.0  days
  //
  // So the churn rule is still true and still worth having — R135 moved it
  // from 48.5 days to 74.8 — but its falsifier is now a TWO-place change: a
  // cheap splice AND room to put the output. A break is one anchor, so it is
  // not battery-reachable, which is the third rule in this repo with that
  // shape (see R133's chrome budget and the note in splice/facility.js).
  // Retired rather than left MISSED, and rather than left green against a
  // defect the game no longer has.
  {
    n: 150, gate: VAULT, name: 'a save that predates the cap is pruned instead of paid, so nine thousand parts are deleted in silence',
    file: 'splice/vault.js',
    anchor: '  const going = surplusParts(state, content, over);',
    to: '  const going = state.inventory.parts.slice(0, over);',
  },
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
    to: '    cam.nextBreakAt = now + Math.round((t.firstDelayHours ?? 5) * HOUR);\n    return { escaped, released: null };',
  },
  {
    n: 37, gate: BREAKOUT, name: 'the schedule advances from the wrong instant, so the replay drifts',
    file: 'campaign/breakout.js',
    anchor: '    scheduleNext(state, content, due);\n  }\n  return { escaped, released:',
    to: '    scheduleNext(state, content, now);\n  }\n  return { escaped, released:',
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
    // R88 — repointed. The line lived in tools/sim.js's own autoplay loop
    // until that loop moved into battle/autoplay.js so the GAME could press
    // it too. Same behaviour, same break, new address; the battery reported
    // BADANCH rather than passing, which is the whole reason it checks.
    n: 46, gate: WALK, name: 'the walk stops firing the Containment Cannon',
    file: 'battle/autoplay.js',
    anchor: "    const bag = capture ? offered.find((a) => a.type === 'capture') : null;",
    to: '    const bag = null;',
  },
  {
    n: 47, gate: WALK, name: 'the walk stops buying the lab',
    file: 'tools/sim.js',
    anchor: "    if (pick2 && buyUpgrade(state, content, pick2.id).ok) did('facility', { track: pick2.id });",
    to: '    if (false && pick2) { /* the lab stops being bought */ }',
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

  // --- gate: raid (the State comes for the ranch, fairly) ------------------
  {
    // R9's first rule, broken the way it is always broken: a roll per tick,
    // so the player who checks in often is raided more often.
    n: 80, gate: RAID, name: 'the raid schedule becomes a per-tick roll',
    file: 'campaign/taskforce.js',
    anchor: '  if (now < cam.nextRaidAt) return { news, levied };',
    to: '  if (now < cam.nextRaidAt && ((now / 60000 | 0) % 7) !== 0) return { news, levied };',
  },
  {
    // R9's exemption removed: the window is back-dated to when they were
    // scheduled, so a fortnight away arrives to find the levy already taken.
    n: 81, gate: RAID, name: 'the window stops opening on sight, so being away is billed',
    file: 'campaign/taskforce.js',
    anchor: '    startedAt: now,\n    deadline: now + Math.round(t.windowHours * HOUR),',
    to: '    startedAt: cam.nextRaidAt,\n    deadline: cam.nextRaidAt + Math.round(t.windowHours * HOUR),',
  },
  {
    // The one thing the design refuses. Zero death language and Law 3 in one
    // line: procurement takes money and livestock, never a creature.
    n: 82, gate: RAID, name: 'the levy starts taking creatures as well',
    file: 'campaign/taskforce.js',
    anchor: '  state.campaign.raid = null;\n  state.campaign.raidCount',
    to: '  state.chimeras = (state.chimeras ?? []).slice(1);\n  state.campaign.raid = null;\n  state.campaign.raidCount',
  },
  {
    n: 83, gate: RAID, name: 'the notoriety ceiling stops holding',
    file: 'campaign/taskforce.js',
    anchor: '  if (before <= t.notorietyCap) return false;',
    to: '  if (before <= t.notorietyCap * 100) return false;',
  },
  {
    // Winning has to buy something, or the raid is a tax with a fight
    // attached rather than a rhythm the player manages.
    n: 84, gate: RAID, name: 'holding the ranch stops buying any quiet',
    file: 'campaign/taskforce.js',
    anchor: '  cam.notoriety = Math.max(0, (cam.notoriety ?? 0) - t.notorietyRelief);',
    to: '  cam.notoriety = Math.max(0, cam.notoriety ?? 0);',
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
    n: 107, gate: A11Y, name: 'the founding card wears a colour token as a class name again, so it has no background and the Ranch reads through it',
    file: 'ranch/founding-ui.js',
    anchor: '    <div class="card founding">',
    to: '    <div class="panel founding">',
  },
  {
    n: 108, gate: A11Y, name: 'a species name on the founding screen goes back to page-colour on a panel',
    file: 'style.css',
    anchor: '.lab-name { font-weight: 700; font-size: 0.95rem; color: var(--text); }',
    to: '.lab-name { font-weight: 700; font-size: 0.95rem; color: var(--ink); }',
  },
  {
    n: 109, gate: A11Y, name: "the enemy's committed move is painted the colour of the page again",
    file: 'style.css',
    anchor: '.intent strong { color: var(--text); }',
    to: '.intent strong { color: var(--ink); }',
  },
  {
    n: 110, gate: A11Y, name: 'the field-note title drops back under the floor in one theme and no other',
    file: 'style.css',
    anchor: '  --accent-2: #ff61ac; --on-accent-2: #2b0417; --accent-2-dim: #5c1440;',
    to: '  --accent-2: #ff4fa3; --on-accent-2: #2b0417; --accent-2-dim: #5c1440;',
  },
  {
    n: 111, gate: A11Y, name: 'the move readout goes back to having no ground, so the arena shows through its own text',
    file: 'style.css',
    anchor: `.sheet {
  width: 100%;
  max-width: 440px;
  max-height: 86vh;
  overflow-y: auto;
  background: var(--panel);`,
    to: `.sheet {
  width: 100%;
  max-width: 440px;
  max-height: 86vh;
  overflow-y: auto;`,
  },
  {
    n: 112, gate: BOOT, name: 'the service worker reads through the HTTP cache again, so a deploy never reaches a phone that already has the app',
    file: 'sw.js',
    anchor: "    fetch(event.request, { cache: 'no-cache' })",
    to: '    fetch(event.request)',
  },
  {
    n: 113, gate: SENT, name: 'the send stops reading the band, so a coin-flip fight is offered as a certainty',
    file: 'battle/autoplay.js',
    anchor: "  return fc.band.id === 'walkover';",
    to: '  return true;',
  },
  {
    n: 114, gate: SENT, name: 'a rival duel becomes skippable, and the duels are the set-pieces',
    file: 'battle/autoplay.js',
    anchor: "  if (context.kind === 'rival') return false;",
    to: '  if (context.kind === null) return false;',
  },
  {
    n: 115, gate: SENT, name: 'the autopilot stops flying and just presses the first thing on the list',
    file: 'battle/autoplay.js',
    anchor: '    const action = bag ?? pilotAction(battle, content);',
    to: '    const action = bag ?? offered[0];',
  },
  {
    n: 116, gate: SENT, name: 'the arena grows a second beat table, so it can pace a fight the harness is not pricing',
    file: 'battle/ui.js',
    anchor: "import { beatCost } from './autoplay.js';",
    to: "import { beatCost } from './autoplay.js';\nconst BEAT = { damage: 620 };",
  },
  {
    n: 117, gate: A11Y, name: 'the briefing stops offering to send them, so the saving is theoretical',
    file: 'campaign/ui.js',
    anchor: '      ${canSend(fc, draftTarget) && draftTeam.length ? `',
    to: '      ${false && canSend(fc, draftTarget) && draftTeam.length ? `',
  },
  {
    n: 118, gate: SQUAD, name: 'the suggestion stops reading the class triangle, so it picks the three biggest instead',
    file: 'campaign/warroom.js',
    anchor: `  let edge = 0;
  for (const fc of foeClasses) {`,
    to: `  let edge = 0;
  for (const fc of []) {`,
  },
  {
    n: 119, gate: SQUAD, name: 'the suggestion stops forecasting its own shortlist and trusts the heuristic',
    file: 'campaign/warroom.js',
    anchor: 'export function suggestTeam(state, encounter, content, now, { budget = 12 } = {}) {',
    to: 'export function suggestTeam(state, encounter, content, now, { budget = 1 } = {}) {',
  },
  {
    n: 120, gate: SQUAD, name: 'the suggestion fields creatures who are in the Infirmary',
    file: 'campaign/warroom.js',
    anchor: '  const fit = (state.chimeras ?? []).filter((c) => !isInjured(c, now) && isSettled(c, now));',
    to: '  const fit = (state.chimeras ?? []).filter((c) => isSettled(c, now));',
  },
  {
    n: 121, gate: A11Y, name: 'the briefing stops offering to pick a team, so the answer is unreachable',
    file: 'campaign/ui.js',
    anchor: '      ${fitToFight(state, ctx.now()).length > TEAM_CAP ? `',
    to: '      ${false && fitToFight(state, ctx.now()).length > TEAM_CAP ? `',
  },
  {
    n: 141, gate: UNION, name: 'a block is guarded under a shard name nobody owns, so it runs in none of them and the suite gets faster by testing less',
    file: 'tools/smoke.js',
    anchor: "if (inShard('fired')) {",
    to: "if (inShard('fired2')) {",
  },
  {
    n: 142, gate: UNION, name: 'a shard entry loses its block, so the table promises coverage the file no longer has',
    file: 'tools/smoke.js',
    anchor: "  curve: 'a', regions: 'c', preview: 'b', spar: 'd',",
    to: "  curve: 'a', regions: 'c', preview: 'b', spar: 'd', ghost: 'a',",
  },
  {
    n: 139, gate: HEIGHT, name: 'the creature cards stop being exclusive, so nine open at once and the Pens is twenty-one screens again',
    file: 'splice/pens-ui.js',
    anchor: "{ exclusive: state.chimeras.map((ch) => `pen-${ch.id}`) });",
    to: '{ exclusive: [] });',
  },
  {
    n: 140, gate: HEIGHT, name: 'a band of the enemy field guide opens itself, and the Foes tab is five screens of unasked-for reference again',
    file: 'splice/dex-ui.js',
    // R136 made the default a parameter, so the anchor moved to it. Same
    // defect: every band of the field guide arrives open.
    anchor: 'function classFold(id, title, badge, summary, body, state, openByDefault = false) {',
    to: 'function classFold(id, title, badge, summary, body, state, openByDefault = true) {',
  },
  {
    n: 138, gate: STALE, name: 'the lazy migration module is fetched from a path that is not there, and a returning player is quietly handed a new ranch',
    file: 'save/save.js',
    anchor: "await import('./migrations.js')",
    to: "await import('./migrationz.js')",
  },
  {
    // RE-AIMED BY R97, AND THE REASON IS THE FINDING. This pointed at v34's
    // `save.dex.beaten ??= []` and went MISSED: R97's v47 migration rewrites
    // `dex.beaten` on the way past, so a save that arrives without the field
    // leaves with it anyway and the chain heals the broken link behind it.
    // That is benign for the player and fatal for the break — a canary two
    // migrations create is not a canary. `theater` is written once, in 46,
    // and read by the Surgery Theater's one-operation rule.
    n: 134, gate: SAVES, name: 'a migration stops creating the field it exists to add, and every older save arrives missing it',
    file: 'save/migrations.js',
    anchor: '    save.theater ??= { busyUntil: 0 };',
    to: '    save.theatre ??= { busyUntil: 0 };',
  },
  {
    n: 135, gate: SAVES, name: 'a fixture stops being a save of the version it stands for, so it tests the wrong step',
    file: 'tools/saves/v30.json',
    anchor: '  "saveVersion": 30,',
    to: '  "saveVersion": 31,',
  },
  {
    n: 136, gate: GENSAVES, name: 'a fixture is hand-edited instead of taken from the version that wrote it',
    file: 'tools/saves/v30.json',
    anchor: '  "funds": 300,',
    to: '  "funds": 301,',
  },
  {
    n: 137, gate: BOOT, name: 'the migration table goes back to a static import, so every player downloads forty-four steps to run none',
    file: 'save/save.js',
    anchor: "import { newWorldSeed } from '../util/rng.js';",
    to: "import { newWorldSeed } from '../util/rng.js';\nimport { migrations as eagerAgain } from './migrations.js';\nvoid eagerAgain;",
  },
  {
    n: 132, gate: GENPARTS, name: 'a part is tuned in the data and not in the generator, so the next regeneration reverts it',
    file: 'data/parts.json',
    anchor: '"ability": "Log Roll"',
    to: '"ability": "Barrel Roll"',
  },
  {
    n: 133, gate: GENPARTS, name: 'the hand-tuned table loses an entry, so the generator goes back to the family-generic name',
    file: 'tools/gen-parts.js',
    anchor: "  crocodile_tail: { ability: 'Log Roll'",
    to: "  crocodile_tail_disabled: { ability: 'Log Roll'",
  },
  {
    n: 131, gate: CLAWS, name: 'a paw is regenerated with the old backward claw, and every big cat is on its feet the wrong way',
    file: 'data/parts-shapes.json',
    anchor: '"points": "13.55,55 14.55,65 28.55,61"',
    to: '"points": "15,55 27,58 18,68"',
  },
  {
    n: 128, gate: TIER, name: 'the tier stops reading part grades, so a whole lever goes invisible to it',
    file: 'data/tiers.json',
    anchor: '"gradeMult": 0.161198,',
    to: '"gradeMult": 0.0,',
  },
  {
    n: 129, gate: TIER, name: 'the top band is cut so low that most of the roster grades S',
    file: 'data/tiers.json',
    anchor: '{ "id": "S", "name": "S", "min": 0.40,  "blurb": "the good stuff", "measured": 0.405 }',
    to: '{ "id": "S", "name": "S", "min": 0.08,  "blurb": "the good stuff", "measured": 0.405 }',
  },
  {
    n: 130, gate: TIER, name: 'the tier stops reading the bulk a creature carries, so traits reach it through one fewer stat',
    file: 'splice/tier.js',
    anchor: '    hp: stats.hp ?? 0,',
    to: '    hp: 0,',
  },
  {
    // Re-adds the STATIC import rather than stubbing the screen: stubbing it
    // takes theater-ui.js out of the graph altogether and the gate goes
    // green for the wrong reason, which is what the first draft of this
    // break did.
    n: 125, gate: BOOT, name: 'a screen goes back to being imported eagerly, so its chrome compiles in front of the Ranch',
    file: 'main.js',
    anchor: "import { renderRanchScreen } from './ranch/ui.js';",
    to: "import { renderRanchScreen } from './ranch/ui.js';\nimport { renderTheaterScreen } from './splice/theater-ui.js';\nvoid renderTheaterScreen;",
  },
  {
    n: 126, gate: BOOT, name: 'an exemption is kept for a module that does run, so the list stops meaning anything',
    file: 'tools/boot.js',
    anchor: "  'ui/theme.js': 'applyTheme reads BASE_THEME and THEMES on the first frame; it calls nothing',",
    to: "  'ui/theme.js': 'applyTheme reads BASE_THEME and THEMES on the first frame; it calls nothing',\n  'ranch/agenda.js': 'stale excuse for a module that is on the first screen',",
  },
  {
    n: 127, gate: BOOT, name: 'coverage is armed after the navigate, so the modules that only run at boot read as idle',
    file: 'tools/boot.js',
    anchor: "    await send('Profiler.startPreciseCoverage', { callCount: true, detailed: true });",
    to: '    void 0;',
  },
  {
    n: 122, gate: A11Y, name: "R73's centring leaks onto a full-width row again, so its content drifts with its own text",
    file: 'style.css',
    anchor: '  justify-content: flex-start;\n  gap: 9px;',
    to: '  gap: 9px;',
  },
  {
    n: 123, gate: A11Y, name: 'a ranch card goes back to shrink-wrapping, so every card ends where its animal name does',
    file: 'style.css',
    anchor: '  .animal-card { flex-direction: column; align-items: stretch; }',
    to: '  .animal-card { flex-direction: column; }',
  },
  {
    n: 124, gate: OUTLOOK, name: 'the outlook loses the sentence for "either lever alone", and reads "Prime once Meatball is ."',
    file: 'splice/extract.js',
    anchor: `  if (!need) {\n    return \`\${best.name} either way — condition \${conditionNeeded}+ now, or \${hours}h more growing.\`;\n  }`,
    to: '  void need;',
  },
  {
    n: 42, gate: BREAKOUT, name: 'a loose specimen grows a deadline and wanders off while you are away',
    file: 'campaign/breakout.js',
    anchor: '    const rival = labFor(state, content, cam.breakoutCount);',
    to: '    cam.loose = cam.loose.filter((e) => due - e.escapedAt < 48 * HOUR);\n    const rival = labFor(state, content, cam.breakoutCount);',
  },

  {
    // R133 re-aims this. It used to anchor on the fixed reward sentence the
    // no-wall branch returned, and R133 replaced that with a count — so the
    // anchor stopped existing and the break went BADANCH, which is exactly
    // the failure mode BADANCH is FOR. Same defect, current spelling: the
    // row never sees a wall, so the opening stands down against three.
    n: 85, gate: OPENING, name: 'the assault row never sees the wall, so the opening hides it',
    file: 'ranch/agenda.js',
    anchor: "      const wall = assaultWall(state, content, now);\n      const open = reachableEncounterIds(state, content).length;",
    to: "      const wall = null;\n      const open = reachableEncounterIds(state, content).length;",
  },
  {
    n: 86, gate: OPENING, name: 'the wall counts every chimera instead of the ones that can fight',
    file: 'ranch/agenda.js',
    anchor: '  const team = fit(state, now).length;\n  const front = regionStates(state, content)',
    to: '  const team = (state.chimeras ?? []).length + 1;\n  const front = regionStates(state, content)',
  },
  {
    n: 87, gate: OPENING, name: 'the wall cries out at a team that can already take the node',
    file: 'ranch/agenda.js',
    anchor: '  if (!bodies || bodies <= team) return null;',
    to: '  if (!bodies) return null;',
  },
  {
    n: 88, gate: OPENING, name: 'a retired unit still counts as a body, so the row overstates the wall',
    file: 'ranch/agenda.js',
    anchor: "  const bodies = (encounter?.waves ?? []).filter((w) => enemyOf(content, w)).length;",
    to: "  const bodies = (encounter?.waves ?? []).length;",
  },
  {
    n: 89, gate: OPENING, name: "the Path stops saying what the starters grade at, so it contradicts the Ranch card",
    file: 'ranch/onboarding.js',
    anchor: "          ? `Graduate ${spareNames}${spareSuffix} and splice them`",
    to: "          ? `Graduate ${spareNames} and splice them`",
  },

  {
    n: 90, gate: STANCE, name: 'the opposition goes back to choosing after the player has committed',
    file: 'battle/engine.js',
    anchor: '  const intent = intentOf(battle, content);\n  battle.intent = null;   // consumed; the next turn plans its own',
    to: '  const intent = null;\n  battle.intent = null;',
  },
  {
    n: 91, gate: STANCE, name: 'a brace is granted with nothing telegraphed, so standing still is free again',
    file: 'battle/engine.js',
    anchor: '  const braced = telegraphed && couldHaveAttacked && me.stamina >= cost && !me.status.justBraced;',
    to: '  const braced = true;',
  },
  {
    n: 92, gate: STANCE, name: 'the brace stops costing stamina, so every incidental rest is mitigation',
    file: 'battle/engine.js',
    anchor: "  const cost = Math.round(me.staminaMax * stance.braceCost);",
    to: "  const cost = 0;",
  },
  {
    n: 93, gate: STANCE, name: 'the counter-switch stops reading the class triangle and fires for anybody',
    file: 'battle/engine.js',
    anchor: '    const counters = intent && incoming.creatureClass && intent.creatureClass\n      && classMultiplier(incoming.creatureClass, intent.creatureClass, content) === rules.advantage;',
    to: '    const counters = !!intent;',
  },
  {
    n: 94, gate: STANCE, name: "the engine's stance defaults drift from the shipped data",
    file: 'battle/engine.js',
    anchor: 'const STANCE_DEFAULTS = { absorb: 0.45, stamina: 0.35, counterPower: 1, braceCost: 0.25 };',
    to: 'const STANCE_DEFAULTS = { absorb: 0.6, stamina: 0.35, counterPower: 1, braceCost: 0.25 };',
  },
  {
    n: 95, gate: STANCE, name: 'the pilot reads the intent off the battle again, where step has already cleared it',
    file: 'battle/ai.js',
    anchor: '  const intent = intentOf(battle, content);',
    to: '  const intent = battle.intent ?? null;',
  },
  {
    n: 104, gate: SITTING, name: 'a row goes back to a fixed sentence that cannot say how much is waiting',
    file: 'ranch/agenda.js',
    // R154 turned this hint into a block that counts pens AND stalls, so the
    // anchor moved with it. The rule is the same one: a row that cannot say
    // how much is waiting is a row that stopped reading the save.
    anchor: '      const room = stableRoom(state, content);',
    to: "      return 'Room for more stock, which is room for more parts.';\n      const room = stableRoom(state, content);",
  },
  {
    n: 105, gate: SITTING, name: 'the care row stops counting and reads the same at three animals and nine',
    file: 'ranch/agenda.js',
    anchor: "      return `${ready} thing${ready === 1 ? '' : 's'} to do for ${animals} animal${",
    to: "      return `${0} thing${'s'} to do for ${0} animal${",
  },
  {
    n: 106, gate: SITTING, name: 'the job row counts lanes again, so it promises jobs that will not start',
    file: 'campaign/operations.js',
    anchor: '    const riders = [null, crew ?? freeCrew(state, now)[0] ?? null];',
    to: '    return laneFree(state, content, now, op, null);\n    const riders = [null, crew ?? freeCrew(state, now)[0] ?? null];',
  },
  {
    n: 99, gate: FOUNDING, name: 'the starter herd goes back to being a literal, so every player builds the same creature',
    file: 'ranch/ranch.js',
    anchor: '  const herd = lab ? [lab.pair, lab.pair, lab.donor] : [\'goat\', \'goat\', \'bear\'];',
    to: "  const herd = ['goat', 'goat', 'bear'];",
  },
  {
    n: 100, gate: FOUNDING, name: 'the founding crate is never delivered, so the first splice is a purebred again',
    file: 'ranch/ranch.js',
    anchor: '  for (const partId of lab?.crate ?? []) {',
    to: '  for (const partId of []) {',
  },
  {
    n: 101, gate: FOUNDING, name: 'a brand-new save stops being asked which laboratory it is',
    file: 'ranch/ranch.js',
    anchor: '  return (content?.starterLabs?.length ?? 0) > 0;',
    to: '  return false;',
  },
  {
    n: 102, gate: FOUNDING, name: 'a crate grows a head, so it can be spliced alone on day one',
    file: 'data/starters.json',
    anchor: '"eagle_forelimbs",',
    to: '"eagle_head",',
  },
  {
    n: 103, gate: FOUNDING, name: 'the agenda points at a splice the Theater will refuse',
    file: 'ranch/agenda.js',
    anchor: "    ready: (state, content) => (state.inventory.parts ?? [])\n      .some((p) => content?.parts?.[p.partId]?.slot === 'head'),",
    to: '    ready: (state) => (state.inventory.parts ?? []).length > 0,',
  },
  {
    n: 96, gate: STANCE, name: 'the Brace button promises mitigation it will not get',
    file: 'battle/engine.js',
    anchor: "  if (!p.braced) return stanceLine(content, p.why, { gain: p.gain });",
    to: "  if (!p.braced) return stanceLine(content, 'braceLive', { pct: Math.round(p.absorb * 100), move: intent?.name, cost: p.cost });",
  },
  {
    n: 97, gate: STANCE, name: "the stance's sentences go back to being literals the data cannot reach",
    file: 'battle/engine.js',
    anchor: "  const raw = content?.stanceLines?.[key] ?? STANCE_LINES[key] ?? '';",
    to: "  const raw = STANCE_LINES[key] ?? '';",
  },
  {
    n: 98, gate: STANCE, name: 'the pilot keeps a second copy of the stance table',
    file: 'battle/ai.js',
    anchor: '  const stance = stanceTuning(content);',
    to: '  const stance = { absorb: 0.45, counterPower: 1, braceCost: 0.25, ...(content?.stanceMeta ?? {}) };',
  },

  // --- gate: release (R129 — the last lab falls open) --------------------
  //
  // The ladder's fifth rung was the one with no consequence. Five breaks,
  // one per clause of the criterion: the phase fires, the anatomy widens,
  // the trait exists, the trait REACHES the vault, and the board says which
  // era it is in. The fourth is the one that matters most — a trait that
  // dies at the Wing's door is decoration on a creature the player scraps,
  // which is the state the game shipped in for six milestones.
  {
    n: 186, gate: RELEASE, name: 'beating the fifth lab does nothing, the way it did for six milestones',
    file: 'campaign/breakout.js',
    anchor: '  if (!cam.released && ladderFinished(state, content)) {',
    to: '  if (false && !cam.released && ladderFinished(state, content)) {',
  },
  {
    // Every escapee is its lab's taste again, so 20 of 41 species can never
    // be met in the wild however many get out — the ceiling the measurement
    // found, and the one "more escapees" would never have moved.
    n: 187, gate: RELEASE, name: 'the doors stay shut: a released specimen is still only its own lab palette',
    file: 'campaign/rivals.js',
    anchor: '  if (wild) parts = openTheDoors(parts, content, rng, wild.socketChance ?? 0.45);',
    to: '  if (false && wild) parts = openTheDoors(parts, content, rng, 0);',
  },
  {
    // Law 2 goes out. The release still happens and the anatomy still
    // widens, so the board LOOKS right — and there is no longer any reason
    // to bag one, which is the whole point of the milestone.
    n: 188, gate: RELEASE, name: 'nothing that gets out carries a gene, so capture is a dead end again',
    file: 'campaign/rivals.js',
    anchor: '  const trait = wild && rng() < (wild.traitChance ?? 0.6)',
    to: '  const trait = false && rng() < 1',
  },
  {
    // The subtle one, and the one the game actually shipped: the programme
    // mints tokens off the GENOME, and the trait is on the unit. Everything
    // upstream stays green — the specimen carries the gene right up to the
    // moment it walks out without it.
    n: 189, gate: RELEASE, name: 'the Wing drops the gene at the door, and a graduate is worse than what you can build',
    file: 'campaign/rehab.js',
    anchor: '    const traits = (unit.traits ?? []).filter((tr) =>',
    to: '    const traits = [].filter((tr) =>',
  },
  {
    // R40's lesson, re-learned: the wire says it once. A player who was away
    // meets a board of nine and reads it as R82's drip.
    n: 190, gate: RELEASE, name: 'the Labs board stops saying the county is open, so only the wire ever said it',
    file: 'campaign/ui.js',
    anchor: '  const releaseCard = openDoors',
    to: '  const releaseCard = false',
  },
  {
    // R91's rule, pointed at the board the release fills. The loose lists
    // were invisible for six milestones because a walk always ended with an
    // empty board; stating no bound for them is how the save grows in a
    // place nobody is looking.
    n: 191, gate: VAULT, name: 'the loose board\'s lists go back to having no stated bound',
    file: 'tools/vault.js',
    anchor: "  'campaign.loose[].unit.moves':               { max: 16, by: 'one per socket, plus the combos an anatomy unlocks' },",
    to: '',
  },
  {
    // R129's OWN BUG, replayed. The wild draw goes back to every part in the
    // bestiary, which quietly makes the release a second door to the six
    // variant lines — 34 of the 244 parts that R95 built a milestone on
    // having exactly one. What found it live was break 162 going from caught
    // to MISSED; the rule is stated in the release block now, so it fails on
    // its own rather than only in combination with another break.
    n: 193, gate: RELEASE, name: 'the release smuggles the variant lines out, and the Incubator stops being their only door',
    file: 'campaign/rivals.js',
    anchor: '    if (content.species[part.species]?.variantOf) continue;',
    to: '',
  },
  // --- gate: R130, the notes are out of the browser's path ----------------
  {
    // Prose walks back into a file the loader fetches. This is the whole
    // point of the milestone and the cheapest thing in the world to undo —
    // somebody adds a helpful sentence to the object they are editing.
    n: 200, gate: UNION, name: 'a data file starts carrying developer prose again, and every player downloads it',
    file: 'data/breakout.json',
    anchor: '  "sightings": [',
    to: '  "_doc": "R82 — the Breakout. A rival lab that keeps losing to you starts losing other things: specimens, which accumulate on a standing board and wait for you to come and collect them.",\n  "sightings": [',
  },
  {
    // Under a different name, which is how the two this milestone found got
    // in: `_comment` on tiers.json and `_screenNote` on a facility track.
    // A rule that matched `_doc` by name would have shipped both.
    n: 201, gate: UNION, name: 'the prose comes back under a second spelling, the way `_comment` and `_screenNote` did',
    file: 'data/breakout.json',
    anchor: '  "sightings": [',
    to: '  "_note": "R82 — the Breakout. A rival lab that keeps losing to you starts losing other things: specimens, which accumulate on a standing board and wait for you to come and collect them.",\n  "sightings": [',
  },
  {
    // The gate that only asks "is there a note" would pass a stub. This one
    // asks whether the note points at something that exists — a section
    // documenting a key somebody renamed is worse than no section.
    n: 202, gate: UNION, name: "a note documents a key its data file no longer has",
    file: 'data/notes/breakout.md',
    anchor: '## release',
    to: '## releases',
  },
  {
    // THE POINTER BREAKS, which is the criterion's actual heart: "still
    // findable from the file it documents". A note that names the wrong file
    // has moved the prose out of the browser's path and out of everybody's
    // reach at the same time.
    //
    // Two of the four rules carry no break, and honestly rather than
    // silently: this battery patches file CONTENT, so it cannot delete a
    // note to prove the missing-file half, and it cannot shorten one enough
    // to trip the stub floor with a single anchored replacement. The first
    // version of this break patched the GATE instead (`const undocumented =
    // []`) and went MISSED, correctly — removing a check does not make
    // anything else fail.
    n: 203, gate: UNION, name: 'a note stops naming the file it documents, and points at nothing',
    file: 'data/notes/feral.md',
    anchor: '# data/feral.json',
    to: '# data/feral.js',
  },

  // --- gate: R131, the page that is the ceiling ---------------------------
  //
  // Five breaks, and the shape of them matters: two put the multiply back
  // (the screen grows with the save again), one loses animals off the end of
  // the pager, one buries an alert behind it, and one takes the Vault's bays
  // back to a fold the save cannot remember.
  {
    n: 194, gate: HEIGHT, name: 'the Ranch hands over the whole herd again, and grows a row per animal forever',
    file: 'ranch/ui.js',
    anchor: '  const page = paginate(ordered, state, RANCH_PAGE);',
    to: '  const page = { id: RANCH_PAGE, size: 999, total: ordered.length, shown: ordered.length, hidden: 0, rows: ordered };',
  },
  {
    // The Vault's half of the same thing, and the sharper one: the shark bay
    // alone is 101 parts and 116 vials, so one open bay was 16,821px.
    n: 195, gate: HEIGHT, name: 'a Vault bay pours its whole shelf out again, 217 rows behind one summary line',
    file: 'splice/vault-ui.js',
    anchor: '      const page = paginate(tokens, state, `vault-bay-${sp.id}`);',
    to: '      const page = { id: `vault-bay-${sp.id}`, size: 999, total: tokens.length, shown: tokens.length, hidden: 0, rows: tokens };',
  },
  {
    // A ceiling that loses rows is not a ceiling, it is a bug. Paging to the
    // end has to reach every animal — this caps the slice at one page
    // forever, which looks identical on the first screen.
    n: 196, gate: UNION, name: 'the pager stops revealing anything, so twelve animals are simply gone',
    file: 'ui/pager.js',
    anchor: '  const shown = Math.min(total, size * pagesShown(state, id));',
    to: '  const shown = Math.min(total, size);',
  },
  {
    // ALERTS NEVER HIDE. Paging in insertion order instead of band order
    // puts an animal that is losing grade behind nineteen calves — the rule
    // R98 wrote onto the shut row, undone by the thing that came after it.
    n: 197, gate: UNION, name: 'the Ranch pages in herd order, so the animal on a deadline falls off page one',
    file: 'ranch/ui.js',
    anchor: '  const ordered = banded(state.ranch.stock, RANCH_BANDS, bandOf).flatMap((b) => b.items);',
    to: '  const ordered = [...state.ranch.stock];',
  },
  {
    // Back to a fold the save cannot remember and `exclusive` cannot bound.
    // This is the one that would have shipped green: the height gate reaches
    // a native `<details>` by setting `.open = true`, so it reports a SHORT
    // screen while measuring one it can no longer open.
    n: 198, gate: HEIGHT, name: 'the Vault bays go back to a raw fold, and the gate measures a screen it cannot open',
    file: 'splice/vault-ui.js',
    anchor: '        <button type="button" class="bay-head" data-fold="vault-${sp.id}" aria-expanded="${open}">',
    to: '        <button type="button" class="bay-head" aria-expanded="${open}">',
  },
  {
    // R131 — AND THE RULE THAT CATCHES 198 HAS TO BE LOAD-BEARING ITSELF.
    // Dropping the `opens` declaration is how the hole comes back: the
    // budgets alone cannot tell a screen that shrank from a screen that
    // stopped opening, which is why 198 went MISSED the first time.
    // R143 moved `tallest` 4100 -> 4120 (the shelf summarises a different
    // spread), so the anchor follows the number it sits beside. What the
    // break aims at is `opens`, which is untouched.
    n: 199, gate: HEIGHT, name: 'the height gate stops asking whether a folding screen still opens',
    file: 'tools/height.js',
    anchor: '  vault:          { folded: 2560,  tallest: 4140, opens: 20 },',
    to: '  vault:          { folded: 2560,  tallest: 4140 },',
  },
  {
    // R137 — the five rows that point at the Ranch go back to navigating to
    // the Ranch, which is where the player already is: `showScreen` repaints
    // and nothing else, so half the panel is dead buttons again.
    n: 212, gate: FACILITY, name: 'half the agenda goes back to navigating to the screen it is drawn on',
    file: 'ranch/ui.js',
    anchor: "        ? ` data-open-fold=\"${i.opens}\"`",
    to: "        ? ` data-goto=\"${i.screen}\"`",
  },
  {
    // The other half of the rule, and R128b's lesson in one token: the row
    // declares a fold nothing paints. A declared id no screen draws is the
    // same dead button wearing an attribute — asking whether a thing EXISTS
    // is not asking whether it can be FOUND.
    n: 213, gate: FACILITY, name: 'an agenda row opens a fold the Ranch does not paint',
    file: 'ranch/agenda.js',
    anchor: "    opens: () => 'breeding-pen',",
    to: "    opens: () => 'breeding-pens',",
  },
  // R141 — THE KITE FRAME. Three breaks for three separate things that were
  // wrong, aimed at three different assertions, in three different files.
  {
    // The tag layer stops reaching the hit, so the whole chart is decoration
    // and flying stops paying: the Kite's own bodies fall from +13.9pp over a
    // Scamper to +5.5pp.
    //
    // My first attempt aimed at the DATA — one of the eight moves this
    // milestone tagged — and went MISSED, which is the entry's own lesson
    // twice over. The census floor is 7 against a measurement of 10, so no
    // single tag can move it, and a battery break is one anchor. The eight
    // tags are eight separate JSON sites with nothing in common to aim at;
    // what they have in common is the LINE THAT READS THEM. Note that this
    // is `step`'s call site, not `tagMultiplier` itself, so the direct-call
    // gate (`Ground misses Airborne`, in the common path) stays green and
    // this one has to do the catching.
    n: 214, gate: KITE, name: 'the hit stops reading the move\'s tags, so the chart is decoration and flying pays nothing',
    file: 'battle/engine.js',
    anchor: `  const { mult, ignoreArmor } = tagMultiplier(move.tags, def.tags, content.tagChart);
  if (move.power > 0 && mult === 0) {`,
    to: `  const { mult, ignoreArmor } = tagMultiplier([], def.tags, content.tagChart);
  if (move.power > 0 && mult === 0) {`,
  },
  {
    // The chassis stops being worth its missing bay. 8 hp instead of 24 —
    // still a frame, still flying, still the only thing that will lift a
    // bear — and the eight bodies that fly on it alone fall from +13.9pp
    // over a Scamper to +6.1pp. This is the assertion the milestone is
    // actually about: a frame that flies and loses is not a choice.
    n: 215, gate: KITE, name: 'the Kite chassis stops paying for the bay it does not have, so flying costs more than it returns',
    file: 'data/frames.json',
    anchor: `        "mass": 18,
        "hp": 24,`,
    to: `        "mass": 18,
        "hp": 8,`,
  },
  {
    // R148 — the Rumbler goes back to being the best chassis in the game.
    // Undoing one of the three repriced numbers is enough: 28 hp -> 36 puts
    // it 5pp clear of the other two over the live band, which is what "no
    // chassis is simply better" is there to refuse. Aimed at the spread
    // rather than the niche, because a frame that wins everywhere has no
    // niche to measure.
    n: 219, gate: BULK, name: 'the Rumbler is handed its old hp back, and is simply the best chassis again',
    file: 'data/frames.json',
    anchor: `        "mass": 400,
        "hp": 28,`,
    to: `        "mass": 400,
        "hp": 36,`,
  },
  {
    // R148 — and the walker loses the reason, so the tie goes back to the
    // iteration order and no campaign ever splices a Rumbler. WALK rather
    // than the smoke block: a 45-day seeded walk answers it in seconds.
    n: 220, gate: WALK, name: 'the plan stops reading how long the wall takes to clear, and the Rumbler is never picked',
    file: 'tools/sim.js',
    anchor: '        + blank + grindAgainst(content, frameId, wall);',
    to: '        + blank;',
  },
  {
    // R149 — THE DEFECT ITSELF, PUT BACK. Camo shipped with one chart row and
    // it was a penalty, which is a tag you are paid to avoid. Neutralising the
    // multiplier rather than deleting the row is the sharper break: the row is
    // still THERE, so anything that merely counts chart entries stays green
    // and the gate has to read the sign to catch it.
    n: 221, gate: CAMO, name: 'the tag that hides you stops hiding you, and six chameleon parts are a liability again',
    file: 'data/keywords.json',
    anchor: `      "attack": "Aimed",
      "defender": "Camo",
      "mult": 0,`,
    to: `      "attack": "Aimed",
      "defender": "Camo",
      "mult": 1,`,
  },
  {
    // R149 — and the other half: a tag you can CLAIM rather than earn. Without
    // the strip a creature wears full plate and is invisible at the same time,
    // so the hide bay stops being the price and Camo is a free stat. The
    // physiology is where this has to live — every screen, the battle and the
    // sim all read `analyze`, so a rule written anywhere else is a rule three
    // of the four callers do not have.
    n: 222, gate: CAMO, name: 'a creature in full plate is also invisible, and the bay stops being the price',
    file: 'splice/physiology.js',
    anchor: '  return armor > 0 ? list.filter((t) => t !== \'Camo\') : list;',
    to: '  return list;',
  },
  {
    // R149 — the third shape of the same mistake, pointed the other way: a
    // tag with an upside and no downside. Strip the echo and hiding costs
    // nothing but a bay you were free to leave empty anyway, and the gate's
    // trade has only one side left to measure.
    n: 223, gate: CAMO, name: 'nothing echoes through a hidden shape, and Camo becomes a free stat',
    file: 'data/keywords.json',
    anchor: `      "attack": "Sonic",
      "defender": "Camo",
      "mult": 1.5,`,
    to: `      "attack": "Sonic",
      "defender": "Camo",
      "mult": 1,`,
  },
  {
    // R143 — THE DEFECT ITSELF, PUT BACK. Territory free to hold is the half
    // that matters most: income scales with conquest, so an outgo that does
    // not is what let the late game bank 24-52 days of income with every
    // facility level already bought. Zeroing the fraction rather than
    // deleting the key is the sharper break — the field is still THERE, so
    // anything that merely checks for its presence stays green.
    n: 224, gate: EMPIRE, name: 'territory goes back to being free to hold, and conquest has no ceiling again',
    file: 'data/facility.json',
    anchor: '    "garrisonFraction": 0.08,',
    to: '    "garrisonFraction": 0,',
  },
  {
    // R143 — and the other half: $504,000 of plant that bills nothing per
    // day is a one-time sink, not an economy. Aimed at the DATA rather than
    // the default in splice/facility.js, because the data is what the game
    // reads and the default is only what it falls back to.
    n: 225, gate: EMPIRE, name: 'the facility stops costing anything to run, and the sink is one-time again',
    file: 'data/facility.json',
    anchor: '    "facilityRunningFraction": 0.0004',
    to: '    "facilityRunningFraction": 0',
  },
  {
    // R143 — the wiring, not the numbers. `upkeepPerDay` is what every screen
    // and the clock both read, so dropping the two new terms there leaves the
    // tuning in place and the ledger wrong: a break that changes a constant
    // proves the constant is read, and this one proves the SUM is.
    n: 226, gate: EMPIRE, name: 'the ledger stops adding territory and the plant, and only livestock is billed',
    file: 'ranch/ranch.js',
    anchor: `  return stockUpkeepPerDay(state, content)
    + chimeraUpkeepPerDay(state, content)
    + territoryUpkeepPerDay(state, content)
    + facilityUpkeepPerDay(state, content);`,
    to: `  return stockUpkeepPerDay(state, content)
    + chimeraUpkeepPerDay(state, content);`,
  },
  {
    // R144 — THE EXEMPTION WIDENS AND THE GATE STOPS ASKING ANYTHING. Exactly
    // one region has no `requires` and is therefore the entry point, and its
    // first node is exempt for three measured reasons (the only tier-1
    // encounter, R119's five starter labs, R29's guided first splice). Drop
    // the `.nodes[0]` clause and every region qualifies as an entry point, so
    // the rule skips all five and passes by having nothing to look at — which
    // is the failure mode this battery exists to catch.
    n: 227, gate: SHARD_B, name: 'the entry-point exemption widens to every region, and the rule looks at nothing',
    file: 'tools/smoke.js',
    anchor: '    if (!r.requires) { lines.push(`${r.id} exempt (entry point)`); continue; }',
    to: '    if (true) { lines.push(`${r.id} exempt (entry point)`); continue; }',
  },
  {
    // R144 — and the foundry wall goes back to contradicting its own
    // briefing. It reads "Gas does nothing to a machine ... they are Ground
    // class, so Air anatomy still flies over the top" while fielding one unit
    // of EACH class against a declared bench of two: every archetype scored
    // 0-25% and no anatomy answered it. Putting the crane and the quench rig
    // back is putting the lie back.
    n: 228, gate: SHARD_B, name: 'the foundry wall stops being what its own briefing says, and answers nobody',
    file: 'data/enemies.json',
    anchor: `      "waves": [
        "slag_hauler",
        "arc_welder_rig"
      ],`,
    to: `      "waves": [
        "quench_rig",
        "slag_hauler",
        "gantry_crane"
      ],`,
  },
  {
    // R144 — the gate's own reading of the wall. `benchTeam` is why the
    // seventh audit and this milestone's first draft both measured the wrong
    // fight: foundry_gate fields three units against a declared bench of two,
    // so a hardcoded team of three reads it at 100% for noise and the honest
    // team of two reads it at 0% for everybody. Force the three back and the
    // gate stops seeing the fight the player is actually sent to.
    n: 229, gate: SHARD_B, name: 'the region gate stops reading benchTeam, and measures a fight nobody is asked to have',
    file: 'tools/smoke.js',
    anchor: '    const team = node.benchTeam ?? r.benchTeam ?? 3;',
    to: '    const team = 3;',
  },
  {
    // R144 — THE DEFECT THIS MILESTONE ACTUALLY SHIPPED, put back. The new
    // block was first called `regions`, which R90's table had already bound
    // forty lines above. JS does not error on that; it takes the later entry.
    // So a block nobody had touched moved from shard c to shard b, and R90's
    // two union rules both stayed green — they read `Object.keys(SHARD_OF)`,
    // and a duplicate key is gone before `keys` can see it. The third rule
    // reads the table's source, which is the only place the second `regions:`
    // still exists.
    n: 230, gate: UNION, name: 'a block is assigned a shard twice, and the one nobody touched changes lanes silently',
    file: 'tools/smoke.js',
    anchor: "  walls: 'b',",
    to: "  regions: 'b',",
  },
  {
    // R141 — the per-encounter flight rule. A9 wrote it per-unit, R141 moved
    // it to the encounter, and the thing it now protects is that no WAVE is
    // fully blanked by a pair of wings. Sunken Marina is the closest to the
    // line at 82% of its damage travelling along the ground — two swimmers
    // and a bite — so one more tag on the harbour diver's net takes it to
    // 100% and a flier stands there untouched.
    // R149 gave that same net `Aimed`, so the break now SWAPS the tag rather
    // than adding one — and `--anchors` is what said so, in 0.3s, the first
    // time the milestone touched the file.
    n: 217, gate: FACILITY, name: 'a whole wave loses its answer to a flier, and the fight becomes a cutscene',
    file: 'data/enemies.json',
    anchor: `          "name": "Net Snag",
          "power": 22,
          "cost": 16,
          "acc": 95,
          "tags": [
            "Aimed"
          ],`,
    to: `          "name": "Net Snag",
          "power": 22,
          "cost": 16,
          "acc": 95,
          "tags": [
            "Ground"
          ],`,
  },
  {
    // R141 — and the other half of the rewritten region rule: a strip that
    // DECLARES an answer it does not have. This is the defect the old rule
    // could not see, and it was real for eighteen milestones — the Foundry
    // said `air` while the bench said `sonic` and air sat 31pp back. Pointing
    // it at `water` (25-30% there) is the same lie, louder.
    n: 218, gate: FACILITY, name: 'a region declares an answer that does not clear it, and nothing notices',
    file: 'data/regions.json',
    anchor: `      "answer": "air",
      "requires": {`,
    to: `      "answer": "water",
      "requires": {`,
  },
  {
    // And the walker goes back to taking the first frame that validates, in
    // the fixed order M, S, L, A — which is why six campaigns and 64 chimeras
    // contained no Kite at all.
    // R150 — RE-AIMED FROM WALK TO KITE. It was pointed at a 45-day seeded
    // walk because that answered in seconds; what it never was is reliable.
    // The walk it aimed at builds a Kite 31% of the time, so the break was
    // being caught by a coin toss that happened to land the same way twice.
    // The planner rule in shard a answers the same question with no seed at
    // all: measured, this patch makes it return M against the wall that made
    // it return A.
    n: 216, gate: KITE, name: 'the first frame that validates wins again, and a campaign can never build a Kite',
    file: 'tools/sim.js',
    anchor: '      if (!best || score > best.score) best = { frameId, slots, score, blank };',
    to: '      if (!best) best = { frameId, slots, score, blank };',
  },
  {
    // R150 — R141'S OTHER DEFECT, WHICH NO GATE HAS EVER HELD. `bestSplice`
    // filled `slots` from the whole vault without asking which sockets the
    // chassis actually has, so a hindlimb landed in `slots.hindlimbs` and
    // `validateSplice` refused the Kite outright — "The Kite Frame has no
    // hindlimbs to bolt that to" — for owning a leg. Six campaigns, 64
    // chimeras, no Kite.
    //
    // Nothing in the battery aimed at it: break 216 covered the ordering
    // half, and the frame-shopping half was only ever covered by a walker
    // census that had a 31% chance of noticing. Measured, this patch returns
    // L where the shipped engine returns A — and it is the reason the gate's
    // vault carries all six bays rather than the five the Kite can wear.
    n: 231, gate: KITE, name: 'the planner dresses every chassis from the whole vault, and the Kite is refused for owning a leg',
    file: 'tools/sim.js',
    anchor: '        if (!chassis.includes(part.slot)) continue;',
    to: '        if (false) continue;',
  },
  {
    // R150 — THE OTHER DIRECTION, which is the half that decides whether the
    // Kite is a choice or a default. The frame's credit is what the wall in
    // front of it actually throws along the ground: a wall that shoots blanks
    // nothing, so wings buy a lost socket and no protection. Stop reading the
    // wall's own moves and every wall looks like a wall that swings — the
    // planner then reaches for the Kite against a gunship, which is the
    // shape R141 was careful not to ship.
    n: 232, gate: KITE, name: 'the frame is credited for blanking a wall that never swings, so the Kite is picked against gunships',
    file: 'tools/sim.js',
    anchor: '      if ((move.tags ?? []).some((t) => dead.has(t))) blanked += power;',
    to: '      blanked += power;',
  },
  {
    // R150 — and the chassis loop's exemption widens to everything. The
    // Kite is left out of "every chassis gets worn by somebody" because it
    // is the one frame that trades a bay away, DERIVED from the socket list
    // rather than named — R144's rule, one block over. Widen the filter and
    // every frame qualifies as full-socket, which is a different claim
    // wearing the same words; the count below it is what says so.
    n: 233, gate: SHARD_B, name: 'the full-socket exemption widens to every chassis, and the loop stops meaning what it says',
    file: 'tools/smoke.js',
    anchor: '      .filter((id) => (content.frames[id].slots ?? new Array(SIX_BAYS)).length >= SIX_BAYS);',
    to: '      .filter((id) => (content.frames[id].slots ?? new Array(SIX_BAYS)).length >= 0);',
  },
  {
    // R146 — THE GAUNTLET STOPS BEING ENDGAME. Its gate is `!!state.dominionAt`
    // and that single fact is why the pacing table has exactly one exemption:
    // these walks stop at dominion, so the one system that OPENS at dominion
    // is the one they cannot time. Ungate it and the exemption is a lie in
    // both directions — the row becomes timeable, and the reason the rule
    // reads off the source stops being true. Also a real design change: four
    // exhibitions priced $55,000 and up, offered on day one.
    n: 235, gate: SHARD_B, name: 'the Gauntlet opens before the campaign is won, and the pacing exemption becomes a lie',
    file: 'campaign/gauntlet.js',
    anchor: '  let gate = !!state.dominionAt;',
    to: '  let gate = true;',
  },
  {
    // R146 — the walk stops marking first use, and the table has nothing to
    // read. This is the instrument itself, so the break is the milestone
    // undone: `at` goes back to five hand-written marks, four of which are
    // the same on every seed, and every question about pacing goes back to
    // being unanswerable. The floor below it is what makes an empty map a
    // failure rather than a clean run — R150's lesson, one milestone on.
    n: 236, gate: SHARD_B, name: 'the walk stops marking when each system was first used, and the pacing table reads an empty map',
    file: 'tools/sim.js',
    anchor: '    firstUse: (state.__walkLog ?? []).reduce((first, e) => {',
    to: '    firstUse: ([]).reduce((first, e) => {',
  },
  {
    // R146 — and the two systems that had no moment go back to having none.
    // Combos and traits are counted by scanning the finished state, which
    // says whether and never when; this milestone gave each an observation
    // at the tick. Stop the combo one firing and the table is one row
    // shorter — which nothing else would notice, because a combo is not an
    // agenda row and the row roll looks straight past it. That is why the
    // two are asserted by name.
    n: 237, gate: SHARD_B, name: 'the first combo goes back to being counted but never timed',
    file: 'tools/sim.js',
    anchor: '    if (!sawCombo && (state.discoveredCombos ?? []).length) {',
    to: '    if (false) {',
  },
  {
    // R138 — TRAINING GOES BACK TO BEING AFFECTION ONLY. Six campaigns, 62
    // creatures: 24 held EXACTLY ZERO xp, some of them 155 days old, because
    // xp had one source — a real fight — and you field your best three. The
    // game already had the verb for working with a creature you are NOT
    // fielding; it granted bond and could not level anything. Zero the number
    // and the bench is frozen again.
    n: 238, gate: KITE, name: 'a training session goes back to granting bond and nothing else, and the bench is frozen at level zero',
    file: 'data/training.json',
    anchor: '    "xpPerSession": 8,',
    to: '    "xpPerSession": 0,',
  },
  {
    // R138 — and the walker goes back to working only with its best. This
    // sorted DESCENDING for the whole of the project's history, so every
    // training session went to creatures that had already fought the most.
    // R92's note eleven lines below it saw the shape — "nine of which the
    // A-team policy never touches" — and fixed only the feral case.
    // The replacement here is the ORIGINAL line, so this break is the state
    // the tree was actually in rather than an invented one.
    n: 239, gate: KITE, name: 'the walker trains only the creatures that already fight, and nothing else ever levels',
    file: 'tools/sim.js',
    anchor: '    const byXp = [...state.chimeras].sort((x, y) => (y.xp ?? 0) - (x.xp ?? 0));',
    to: '    const byXp = [...state.chimeras].sort((x, y) => (y.xp ?? 0) - (x.xp ?? 0)).slice(0, 3);',
  },
  // R151 — THE SUITE'S OWN BUDGET, WHICH HAS NEVER HAD A BREAK AIMED AT IT.
  // `SUITE` has been declared in this file since R90 and no entry used it, so
  // for sixty milestones the one gate that watches what the test suite costs
  // was itself unwatched. It could not have had one: the budget was
  // wall-clock, and a break runs inside a battery that is already four trees
  // deep on four cores, so every break would have been "caught" by the
  // contention rather than by the defect. In CPU-seconds it does not matter
  // what else is on the box, which is what makes these two possible at all.
  //
  // Both breaks are PURE COST. Every assertion in the suite still passes
  // under them; the only thing that changes is the bill.
  {
    n: 240, gate: SUITE, name: 'the walk cache never hits, so the two gates that share seven campaigns walk fourteen',
    file: 'tools/fixtures.js',
    anchor: '  if (!fresh && existsSync(file)) {',
    to: '  if (fresh && existsSync(file)) {',
  },
  {
    // Every `inShard('...')` call and the whole SHARD_OF table stay in the
    // source, so smoke's own union rules still see exactly what they expect
    // and stay green. Nothing but the cost gate can notice this one — which
    // is the shape R90's comment describes and could never test.
    n: 241, gate: SUITE, name: 'the shard guard stops guarding, so every block runs in all four shards',
    file: 'tools/smoke.js',
    anchor: '  return !SHARD || SHARD_OF[name] === SHARD;',
    to: '  return true;',
  },
  // R152 — THE SHAPE OF THE ECONOMY, NOT ITS PRICES. R143 put territory and
  // the plant on the books and breaks 224-226 prove they are billed. Neither
  // of those can see what this milestone fixed: the share an empire KEEPS
  // climbing as it grows, stopped only by the map running out of nodes.
  {
    // The completion bonus goes back to being income nobody defends — 21% of
    // gross at full map, and the most competence-shaped money in the game.
    // `whole` is still computed, so anything that only checks the loop still
    // runs still sees it run.
    n: 242, gate: EMPIRE, name: 'the garrison stops billing the completion bonuses, so finishing a region is free to hold',
    file: 'splice/facility.js',
    anchor: '    if (whole) gross += region.completionBonus ?? 0;',
    to: '    if (whole) gross += 0;',
  },
  {
    // The fraction goes flat again, which is R143's shape: proportional
    // garrison over a fixed stable, so `kept` climbs toward 1 - fraction and
    // the next authored region raises it for free. Zeroed rather than
    // deleted, for break 224's reason — the field is still there.
    n: 243, gate: EMPIRE, name: 'the garrison fraction goes flat again, and a bigger map is a strictly better deal',
    file: 'data/facility.json',
    anchor: '    "garrisonPerNode": 0.0075,',
    to: '    "garrisonPerNode": 0,',
  },
  // R140 — WHAT YOU BUILD WITH, not just what you collect. R95's reach gate
  // has held parts SEEN at 95% since it was written and nothing measured the
  // other half: a median campaign put 43% of the list on a creature, and 34
  // parts went onto no creature in any seed while being seen in several.
  {
    // The tick stops recording, so `dex.worn` is never written and the reach
    // gate has nothing to read. Aimed at the VACUITY GUARD rather than the
    // floor: a percentage computed over an absent field reads as 0% and would
    // otherwise look like a catastrophic regression instead of a missing
    // field, which is the difference between a gate that tells you what broke
    // and one that tells you something broke.
    n: 244, gate: REACH, name: 'the world stops recording what went onto a creature, and the worn number has nothing to read',
    file: 'campaign/world.js',
    anchor: '        if (t?.partId && !known.has(t.partId)) { known.add(t.partId); worn.push(t.partId); }',
    to: '        if (false) { known.add(t.partId); worn.push(t.partId); }',
  },
  {
    // The pull goes away and the Theater reaches for the same best-graded
    // part every time, which is the 43% this milestone started from.
    n: 245, gate: REACH, name: 'a part you have never built with stops breaking a tie, and the campaign wears 54% instead of 60%',
    file: 'tools/sim.js',
    anchor: '    + (built.has(t.partId) ? 0 : 0.5);',
    to: '    + (built.has(t.partId) ? 0 : 0);',
  },
  {
    // The screen stops saying it. The walker's preference is only legitimate
    // if a player can see the same thing, so this is not cosmetic: it is the
    // difference between moving the game and moving the instrument.
    n: 246, gate: SHARD_B, name: 'the Theater stops marking a part you have never built with, and only the walker knows',
    file: 'splice/theater-ui.js',
    anchor: "                built.has(t.partId) ? '' : ' \\u00b7 never bolted on'}`,",
    to: "                built.has(t.partId) ? '' : ''}`,",
  },
  {
    // And the opposite failure, which no reach percentage can see: a pull big
    // enough to move the number is also big enough to take a Standard over an
    // Apex. R41's rule — grades season a build, they do not replace it — and
    // the only gate that can catch it is the one that asks directly.
    n: 247, gate: SHARD_B, name: 'the never-built-with pull outgrows a grade step, and a Standard beats an Apex',
    file: 'tools/sim.js',
    anchor: '    + (built.has(t.partId) ? 0 : 0.5);',
    to: '    + (built.has(t.partId) ? 0 : 5);',
  },
  {
    // R153 — THE DIRECTOR GOES BACK IN FRONT OF THE FIRST PAINT. Seven
    // dependency-free lines of `directorNews` held all 11.9 KB of
    // `campaign/director.js` in the eager graph, because a static import is
    // an eager one whatever you use from the module. Re-exporting the
    // director from `campaign.js` puts it straight back, which is the defect
    // in its purest form: nothing about the game changes, and the player
    // waits for 11.9 KB that runs nothing to reach the screen.
    n: 248, gate: BOOT, name: 'the whole AI director rides back into the boot graph on one re-export',
    file: 'campaign/campaign.js',
    anchor: 'export function directorNews(state, directed) {',
    to: "export * from './director.js';\nexport function directorNews(state, directed) {",
  },
  {
    // R136 — the Combos tab goes back to three flat lists, which is the
    // state it was in for six milestones: 2,403px and 529 words on a screen
    // the player looks things up in. Catches BOTH halves of the new budget —
    // the shut height and R131's `opens` count, since a band that is not a
    // fold is a band the walk cannot get into.
    n: 210, gate: HEIGHT, name: 'the Combos bands stop folding, and the last flat tab comes back',
    file: 'splice/dex-ui.js',
    anchor: '    ? classFold(`dex-combos-${id}`, label, `${list.length}`, summary(list.length),',
    to: '    ? bandHead(label, list.length) + ((label, summary) => `<ul class="token-list">',
  },
  {
    // The other half of R136's rule, as the one-token change somebody would
    // actually make: the bands arrive open. On any save past the opening
    // that is the whole tab back on the screen — the condition R133 had to
    // take off the Breeding Pen, in its cheapest possible spelling.
    n: 211, gate: HEIGHT, name: 'the combo bands arrive open, so the fold buys nothing',
    file: 'splice/dex-ui.js',
    anchor: 'const COMBO_BAND_OPEN = false;',
    to: 'const COMBO_BAND_OPEN = true;',
  },
  {
    // R135 — the dismantle goes back to costing what a splice costs, which
    // is the state this milestone was reported against: a player watching a
    // twenty-hour clock to take one creature apart.
    n: 207, gate: TABLE, name: 'a dismantle costs the table as much as building a creature does',
    file: 'splice/extract.js',
    anchor: "  occupyTheater(state, content, now, 'dismantle');",
    to: '  occupyTheater(state, content, now);',
  },
  {
    // R135 — the screen that hosts the wait stops naming the machine that
    // shortens it. This is the reported bug exactly: the Pens sells nothing
    // that speeds a dismantle up and never said where to look.
    n: 209, gate: FACILITY, name: 'the Pens stops pointing at the table it does not sell',
    file: 'ui/facility-card.js',
    anchor: "  const hours = up?.level?.grants?.dismantleHours;",
    to: '  const hours = null;',
  },
  {
    // R133 — the Breeding Pen goes back to opening itself whenever a pairing
    // exists, which is R47's rule and which on any save past the opening
    // means ALWAYS: the day-180 walk offers thirty-six pairings. Measured,
    // this trips BOTH the chrome rule (1,175 of 1,050) and the total (2,022
    // of 1,900) — see the note in tools/height.js about what that does and
    // does not prove about the chrome number.
    n: 204, gate: HEIGHT, name: 'the Breeding Pen opens itself again, and the screen grows by a card',
    file: 'ranch/ui.js',
    anchor: "  const breedingOpen = isOpen(state, 'breeding-pen', false);",
    to: "  const breedingOpen = isOpen(state, 'breeding-pen', canPair && !incubatorFull);",
  },
  {
    // Same rule, the other card, and the one that had no fold at all before
    // R133: arriving open, the money card puts two pickers and three
    // buttons in front of the herd.
    n: 205, gate: HEIGHT, name: 'the money card arrives open and the herd moves down the screen',
    file: 'ranch/ui.js',
    anchor: "  const moneyOpen = isOpen(state, 'slush-fund', false);",
    to: "  const moneyOpen = isOpen(state, 'slush-fund', true);",
  },
  {
    // R133 — the one-line rule. The lesson goes back onto the vat row, which
    // is the same thing `data/guides.json` already teaches under "The vat
    // crosses two chimeras". The row wraps to two lines and is then taller
    // than every row that did not, which is what the gate measures — no
    // constant to edit, so this cannot be met by moving a budget.
    //
    // R150 — THIS BREAK WENT MISSED, AND IT WAS RIGHT ALL ALONG. R143 capped
    // the agenda at three rows per kind; the vat row is fifth of five in
    // `work` on the day-180 save, so from that milestone onward this patch
    // changed a string the browser never received. The rule was intact — the
    // same lesson on a RENDERED row still went red — but its only live
    // target had walked off the screen, and nothing said so for two
    // milestones. `--anchors` cannot catch this: the anchor still matches,
    // it is the RENDERING that changed.
    // The gate now measures the hidden hints too, in a clone of a real row,
    // so the break is left exactly where R133 aimed it.
    n: 206, gate: HEIGHT, name: 'an agenda row teaches a lesson the field guide already gives',
    file: 'ranch/agenda.js',
    anchor: "      return `${seen.size} pairing${seen.size === 1 ? '' : 's'} the vat will take.`;",
    to: "      return `${seen.size} pairing${seen.size === 1 ? '' : 's'} the vat will take. Two go in, one genome out that neither of them was.`;",
  },
  {
    // R150 — and the rows past the cap go back to being unmeasurable. This
    // is the state the tree was in for two milestones: the probe reaches
    // only what rendered, so a hint can grow to any length as long as three
    // shorter ones sit above it. Aimed at the `spend` filter rather than at
    // the probe itself, because that is the shape the mistake actually takes
    // — a filter that looks reasonable and quietly empties the list.
    n: 234, gate: HEIGHT, name: 'the agenda rule stops reaching the rows past the cap, and measures an empty list',
    file: 'tools/height.js',
    anchor: "        .filter((i) => i.kind !== 'spend')",
    to: "        .filter((i) => i.kind === 'nothing')",
  },
  {
    // The migration forgets the phase, so a save from v47 arrives with
    // `released` undefined — and `!cam.released` is true for a county that
    // has already been opened, which fires the burst a second time.
    n: 192, gate: UNION, name: 'the v48 migration forgets the release, and an old save can open its doors twice',
    file: 'save/migrations.js',
    anchor: '    save.campaign.released ??= null;',
    to: '',
  },
];

const pristine = {};
const restore = (dir, file) => {
  pristine[file] ??= readFileSync(join(SRC, file), 'utf8');
  writeFileSync(join(dir, file), pristine[file]);
};

const run = (gate, dir, port) => new Promise((resolve) => {
  execFile(gate[0], gate.slice(1), {
    cwd: dir,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, SW_CDP_PORT: String(port) },
  }, (err, stdout, stderr) => {
    if (err) resolve({ ok: false, out: `${stdout ?? ''}${stderr ?? ''}` });
    else resolve({ ok: true, out: stdout });
  });
});

// Hand `items` out to the workers, each of which owns one tree and one port.
//
// Results come back in the order they were ASKED FOR, not the order they
// finished, and `report` is called in that same order the moment a result's
// whole prefix has landed. Both halves matter: a battery whose output
// shuffles between runs is one nobody can diff against the last one, and a
// battery that prints nothing for six minutes and then two hundred lines is
// one nobody can watch. So a finished break waits its turn to be printed —
// never to be RUN.
async function pool(items, work, report = () => {}) {
  const out = new Array(items.length);
  const done = new Array(items.length).fill(false);
  let next = 0;
  let printed = 0;
  const flush = () => {
    while (printed < items.length && done[printed]) report(out[printed], items[printed], printed++);
  };
  await Promise.all(DIRS.map((dir, w) => (async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await work(items[i], dir, PORTS[w], i);
      done[i] = true;
      flush();
    }
  })()));
  return out;
}

const cleanup = () => { for (const d of DIRS) rmSync(d, { recursive: true, force: true }); };

// R134 — EVERY ANCHOR STILL EXISTS, in about a second.
//
// A break that no longer matches its file is scored BADANCH, and finding
// that out costs forty-seven minutes because it is discovered in the middle
// of running two hundred gates. It does not have to be: an anchor check is a
// string search over files already on disk. Break 85 went stale in R133 —
// the milestone rewrote the sentence it aimed at — and the whole battery ran
// to tell me something `grep` knew before it started.
//
// This is the cheap half of the battery's value. The breaks prove the GATES
// still catch things, which changes slowly; the anchors prove the BREAKS
// still point at real code, which changes every time anybody edits a file a
// break aims at — which is to say, most milestones.
if (process.argv.includes('--anchors')) {
  const stale = [];
  for (const b of BREAKS) {
    let src;
    try { src = readFileSync(join(SRC, b.file), 'utf8'); } catch {
      stale.push(`${b.n}: ${b.file} is not there any more — ${b.name}`);
      continue;
    }
    const hits = src.split(b.anchor).length - 1;
    if (hits !== 1) stale.push(`${b.n}: ${hits} matches in ${b.file} — ${b.name}`);
  }
  cleanup();
  if (stale.length) {
    console.error(`battery ✗  ${stale.length} of ${BREAKS.length} breaks no longer aim at anything`);
    for (const line of stale) console.error(`  · ${line}`);
    process.exit(1);
  }
  console.log(`battery ✓  all ${BREAKS.length} anchors match exactly once`);
  process.exit(0);
}

const BASELINE = [SCOPE, HANDLERS, TWICE, CONTEST, RETIRED, BREAKOUT, WALK, ROADMAP, A11Y, BOOT, SMOKE_PAIR, GRADE, FERAL, RUSH, RAID, OPENING, STANCE, FOUNDING, SITTING, SENT, SQUAD, OUTLOOK, TIER, CLAWS, GENPARTS, SAVES, GENSAVES, STALE, HEIGHT, UNION, FACILITY, VAULT, TABLE, COVERAGE];

const baselineLabel = (gate) => (
  gate === TWICE ? 'walkSurfaces twice in one process'
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
                        : gate === RAID ? 'the State comes for the ranch, fairly'
                          : gate === OPENING ? 'the opening tells the truth about the wall'
                            : gate === STANCE ? 'the opposition commits before you answer'
              : gate === FOUNDING ? 'five laboratories, and a first splice worth making'
                : gate === SITTING ? 'the agenda says how much is waiting'
                : gate === SENT ? 'a certain fight can be sent instead of watched'
                : gate === SQUAD ? 'the briefing knows who to send'
                : gate === OUTLOOK ? 'every outlook sentence has something in every slot'
                : gate === TIER ? 'a higher letter is a creature that wins more'
                : gate === CLAWS ? 'every clawed foot points where the creature is going'
                : gate === GENPARTS ? 'the shipped parts are exactly what the generator produces'
                : gate === SAVES ? 'a real save of every version still migrates to the current one'
                : gate === GENSAVES ? 'every save fixture is what that version of the game actually wrote'
                : gate === STALE ? 'a real old save still opens the game in a browser, quietly'
                : gate === HEIGHT ? 'no screen outgrows its budget on a day-180 save'
                : gate === UNION ? 'every sharded block is owned by exactly one shard'
                : gate === FACILITY ? 'every facility track is bought where its system lives'
                : gate === TABLE ? 'the Surgery Theater does one operation at a time'
                              : gate.join(' ')
);

// The battery is worthless if the pristine tree does not pass, so prove that
// first — a gate that fails on everything "catches" every break for free.
console.log(`baseline (pristine tree, ${JOBS} at a time):`);
await pool(BASELINE, (gate, dir, port) => run(gate, dir, port), (r, gate) => {
  const label = baselineLabel(gate);
  console.log(`  ${r.ok ? 'PASS' : 'FAIL'} ${label}${r.ok ? '' : '\n' + r.out.split('\n').slice(0, 4).map((l) => '    ' + l).join('\n')}`);
  if (!r.ok) process.exitCode = 1;
});

if (BASELINE_ONLY) {
  cleanup();
  console.log(process.exitCode ? '\nbaseline ✗  a gate fails on a pristine tree' : '\nbaseline ✓  every gate passes on a pristine tree');
  process.exit(process.exitCode ?? 0);
}

console.log('\nbreaks:');
const picked = ONLY ? BREAKS.filter((b) => ONLY.has(b.n)) : BREAKS;
if (ONLY && picked.length !== ONLY.size) {
  const missing = [...ONLY].filter((n) => !BREAKS.some((b) => b.n === n));
  console.error(`battery ✗  no break numbered ${missing.join(', ')}`);
  cleanup();
  process.exit(1);
}
const results = await pool(picked, async (b, dir, port) => {
  // The worker owns its tree, so patch-run-restore is safe to do in place:
  // no other worker can see this file. Restore FIRST as well as last, because
  // a break that dies mid-run would otherwise leave its defect behind for the
  // next break this worker picks up.
  restore(dir, b.file);
  const path = join(dir, b.file);
  const src = readFileSync(path, 'utf8');
  const hits = src.split(b.anchor).length - 1;
  if (hits !== 1) return { ...b, verdict: 'BADANCH', hits };
  writeFileSync(path, src.replace(b.anchor, b.to));
  const r = await run(b.gate, dir, port);
  restore(dir, b.file);
  const first = r.out.split('\n').find((l) => l.trim() && !l.startsWith('scopecheck: ')) ?? '';
  return { ...b, verdict: r.ok ? 'MISSED' : 'caught', line: first.trim() };
}, (res) => {
  if (res.verdict === 'BADANCH') {
    console.log(`  ${String(res.n).padStart(2)}. BADANCH (${res.hits} matches) — ${res.name}`);
    return;
  }
  console.log(`  ${String(res.n).padStart(2)}. ${res.verdict === 'caught' ? '✓ caught' : '✗ MISSED'}  ${res.name}`);
  if (res.verdict === 'caught' && VERBOSE) console.log(`        → ${res.line.slice(0, 140)}`);
});

const missed = results.filter((r) => r.verdict !== 'caught');
console.log(`\n${results.length} breaks · ${results.length - missed.length} caught · ${missed.length} missed`);
for (const m of missed) console.log(`  ${m.verdict} ${m.n}: ${m.name}`);
cleanup();
if (missed.length) process.exitCode = 1;
