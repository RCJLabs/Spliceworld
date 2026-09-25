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

// R117 — WHAT DOES THE GAME LOOK LIKE ON A LAPTOP? The same question HEIGHT
// asks about a phone, in the other axis and at the other end of the range.
// Every width rule the stylesheet carried was a `max-width`, so the layout
// could only get narrower than its 560px column: 43.8% of a 1,280px viewport
// used, the agenda drawn on one screen of six, and the wire in a footer
// 1,700-2,700px below the fold at every width including 380. None of it was
// visible to any gate, because every gate this project owns measures a phone.
const WIDE = ['node', 'tools/wide.js'];

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

// R118 — THE GENE PROBE, in the two lanes its rules live in. Lane A carries
// the discriminator (re-seeding must NOT hold a direction), the salt-count
// floor and the declare-yourself table; lane C carries `venom_gland`, which
// is the gene the old ratio bar could not resolve and the one a regression
// here would quieten first. Named separately from FACILITY and SHARD_A for
// R129's reason: a break that aims at one block should not read as another.
const GENEPROBE_A = ['node', '-e',
  "process.env.SW_SHARD = 'a'; await import('./tools/smoke.js');"];
const GENEPROBE_C = ['node', '-e',
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
// R108 — shard a, per SHARD_OF. The `card` block is cheap in itself (one
// splice, one scripted fight, the rest string work) but a break pays the
// whole lane, and shard a is the most expensive of the four. Named for the
// LANE and not for the block, which is the rule the note below states.
const SHARD_A = ['node', '-e',
  "process.env.SW_SHARD = 'a'; await import('./tools/smoke.js');"];

const SHARD_B = ['node', '-e',
  "process.env.SW_SHARD = 'b'; await import('./tools/smoke.js');"];

// Shard d, per SHARD_OF. R145 opened this lane (a fight ends, and it ends the
// right way: six seeds x 3,536 scripted fights, median 9 on every one, against
// two on seed 11 that never ended at all before it) and named the constant
// TURNS after that one block.
//
// R171 — RENAMED FOR THE LANE, which is the rule SHARD_B states four lines up
// and this constant was the counter-example to. A second milestone now aims at
// shard d — the eager-graph budgets live in the `wire` block — and `gate:
// TURNS` on a break about kilobytes of comments would read as a mistake.
const SHARD_D = ['node', '-e',
  "process.env.SW_SHARD = 'd'; await import('./tools/smoke.js');"];

// R91 — THE VAULT HAS A BOTTOM, AND THE THEATER HAS ONE TABLE. Every list in
// this game was bounded except the ones that mattered: the day-180 save was
// 1.8 MB, 95.5% of it inventory, and four save slots share one 5 MB quota, so
// four campaigns crossed it around day 124 while `saveGame` swallowed the
// failure. The gate asks three things of one seeded walk — weight, a stated
// bound for every array, and whether a chimera lives longer than an evening.
const VAULT = ['node', 'tools/vault.js'];

// R100 — THE THREE RULES THE TWA NEEDED, AND NONE OF THEM COULD BE RUN BEFORE.
//
// OFFLINE is the one path every other browser gate deliberately bypasses:
// a11y, height and boot all set `Network.setBypassServiceWorker`, on purpose,
// because they measure what the SITE costs and a cache would make that a lie.
// So the code that decides whether the app opens on a train had never been
// executed by anything. Its rule is a slope — with the app already cached, how
// long it takes to open must not depend on the network.
//
// DURABLE is the seven-day problem: iOS clears localStorage after a week
// unopened, and until R100 `loadSlot` could not tell that apart from a new
// player. It plays, saves, throws localStorage away and requires 2 MB back.
//
// CACHEBUMP is the box that stopped being a box. `CACHE` carries a hash of the
// shell, so a release that changes a precached file and forgets the bump goes
// red. Under cache-first that mistake no longer drains in ten minutes. (Named
// for what it checks rather than for the tool: `RELEASE` above is R129's
// breakout release and got there first.)
const OFFLINE = ['node', 'tools/offline.js'];
const DURABLE = ['node', 'tools/durable.js'];
const CACHEBUMP = ['node', 'tools/release.js'];

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
const DIET = ['node', 'tools/diet.js'];
// R115 — the service worker against a stubbed cache, and the coverage merge
// against itself. Both are arithmetic and both run in under a second, which
// is the only reason a gate this load-bearing can afford eight breaks.
const WORKER = ['node', 'tools/worker.js'];
const COVSELF = ['node', 'tools/coverage.js', '--self'];

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
    // R116 — AND THE PROBE NEEDS A CREW NOW. Every job left on the board
    // requires one (the three that needed nobody carried anywhere became
    // standing contracts), so a fixture with an empty roster launches
    // NOTHING, the row correctly does not appear, and the hint check reads
    // an empty string and fails on a rule that is working. Zero is the right
    // answer to the wrong question: this block exists to prove the row's
    // number is the number that launches, and at zero there is no number.
    s2.chimeras = [{ id: 'c0', name: 'Chompers', tokens: {}, frame: 'M', settleUntil: 0, bond: 50, xp: 0 }];
    let launches = 0;
    for (const op of operationList(content)) {
      const probe = JSON.parse(JSON.stringify(s2));
      if (startOperation(probe, op.id, 'c0', content, t0).ok) launches++;
    }
    const claimed = runnableOps(s2, content, t0).length;
    if (claimed !== launches) {
      bad.push('the job row claims ' + claimed + ' runnable, ' + launches + ' actually launch');
    }
    const hint = (agenda(s2, content, t0).find((r) => r.id === 'job') ?? {}).hint ?? '';
    if (!hint.includes(String(launches))) bad.push('and the hint does not say ' + launches + ': ' + hint);
  }

  // 3b. R116 — AND ZERO IS A NUMBER THE ROW HAS TO GET RIGHT TOO.
  //
  // Rule 3 above proves the row counts correctly when a job CAN start. It
  // cannot prove the row refuses when one cannot, and after R116 that half
  // stopped being covered at all: every job left on the board requires a
  // crew, so the fixture's one free creature makes the go-yourself lane and
  // the send-a-creature lane agree on every op, and a rule that only ever
  // asks a permissive fixture agrees with a broken one.
  //
  // Measured: break 106 (\`runnableOps\` counts lanes again instead of asking
  // \`opOdds().blocked\`) went MISSED against rule 3 alone, because clean and
  // broken both answered 4. With the only crew already carrying a job the
  // two answers separate — clean says 0, lanes-only says 3 — which is the
  // defect the break is named for: a row that promises jobs that will not
  // start. The bucket holds 3 charges, so spending one leaves the board
  // runnable and the rule is measuring the crew check rather than the pace.
  {
    const s3 = { ...newGameState(), seed: 4242 };
    foundLab(s3, content, 'bramble_barn', t0);
    s3.chimeras = [{ id: 'c0', name: 'Chompers', tokens: {}, frame: 'M', settleUntil: 0, bond: 50, xp: 0 }];
    const first = operationList(content)
      .find((op) => startOperation(JSON.parse(JSON.stringify(s3)), op.id, 'c0', content, t0).ok);
    if (!first) {
      bad.push('the zero-crew fixture could not start a single job to occupy the crew with');
    } else {
      startOperation(s3, first.id, 'c0', content, t0);
      let busyLaunches = 0;
      for (const op of operationList(content)) {
        const probe = JSON.parse(JSON.stringify(s3));
        if (startOperation(probe, op.id, 'c0', content, t0).ok) busyLaunches++;
      }
      const busyClaimed = runnableOps(s3, content, t0).length;
      if (busyClaimed !== busyLaunches) {
        bad.push('with its only crew already carrying a job the row claims '
          + busyClaimed + ' runnable, ' + busyLaunches + ' actually launch');
      }
    }
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
  // R109 — the LAB, not three keywords. This matched BREAKOUT, misplaced or
  // unaccounted until the escape event became a pool of twenty-six and the
  // cursor handed back a phrasing using none of those words. Every phrasing in
  // that pool names the lab, and the lab's NAME is only on the news burst, so
  // it is resolved through content from the board entry. Same fix as the twin
  // in tools/smoke.js.
  const looseLabs = [...new Set(jump.campaign.loose
    .map((e) => content.rivals[e.rivalId]?.name).filter(Boolean))];
  if (!looseLabs.length) fail('the board names no lab it lost a specimen from');
  if (!jump.news.some((n) => looseLabs.some((lab) => n.includes(lab)))) {
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
  // R109 — the creature's NAME, not two keywords. The bagging event is a pool
  // of twenty-two now and only two of them say THWOOMP; every one names the
  // animal, which is what "the wire said it was bagged" actually means. Same
  // fix as the twin in tools/smoke.js.
  const bagged = s.campaign.containment[0]?.unit?.name;
  if (!bagged) fail('the bay does not know what is in it');
  if (!s.news.some((n) => n.includes(bagged))) fail('the wire did not say it was bagged');

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
  // numbers are in tools/diet.js.
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
    n: 151, gate: DIET, name: 'the planner stops weighing combos, so a campaign never discovers one again',
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
    n: 152, gate: DIET, name: 'the Wing and the vat take every stall again, and the Surgery Theater never gets one',
    file: 'tools/sim.js',
    anchor: 'const clockRoom = (state, content) => stableRoom(state, content).free > THEATER_STALLS;',
    to: 'const clockRoom = () => true;',
  },
  {
    // R154 — the paddock stops buying stable room, and "Expand the pens" goes
    // back to meaning only livestock. Aimed at the derivation rather than at
    // the data, because a ratio of zero would read as a content choice.
    n: 251, gate: DIET, name: 'a pen stops buying a stall, so the Pens screen and the pen button mean different things again',
    file: 'splice/facility.js',
    anchor: '  return (state.ranch?.penCapacity ?? 0) - (meta.freePens ?? 0);',
    to: '  return 0;',
  },
  {
    // R154 — the room is bought and nothing stands in it. The cap still grows,
    // so the first half of the rule passes and only the second catches this:
    // a stall the roster never fills is the feature shipping as a number on a
    // screen. R157 could not write this break at all — at a fixed grant the
    // walker lands in the same place whichever way the constant reads.
    n: 252, gate: DIET, name: 'the stable grows and the roster does not, so a bought stall stands empty',
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
  // --- gate: empire (R155 — the reserve exemption) -------------------------
  {
    // R155's CRITERION, and the break its roadmap entry said twice could not
    // be written. Drift-tending goes back to asking the walk's cash reserve
    // before spending five dollars on a creature the Pens is already painting
    // a warning on. Nothing is LOST when it does — 0 across 21 seeds, which is
    // why `feral.lost` could not gate this and why R155 sat blocked for two
    // milestones — but the walker holds a warned creature for 18 consecutive
    // hours of its 24-hour window on seed 7, and `feral.heldHours` says so.
    //
    // Aimed at the reserve read rather than at the loop, because the loop is
    // not what was wrong: R138's policy trains the drifting creature and
    // always did. The defect was one word of reuse — the same `canSpend` that
    // correctly refuses a gantry also refused the one purchase that cannot
    // wait. `state.funds < TRAINING.cost` is the floor that replaced it, so
    // the patch swaps a floor for a buffer and nothing else.
    //
    // THE SEED IS PART OF THE BREAK, AND THE SEED WENT STALE. Seed 2026 reads
    // 0h with the reserve check and 0h without it, so a rule on 2026 alone is
    // green either way — which is exactly the vacuous gate R155 warned about.
    // R155 aimed this at seed 7's 18h; five milestones later seed 7 read 0h
    // BOTH WAYS and this break came back MISSED, on the branch and on `main`
    // alike. A sixteen-seed census with the reserve check restored found the
    // defect had moved rather than gone: 314 holds 16h, 42 holds 10h, 9001
    // holds 8h, 21 holds 2h, everything else 0. Seed 314 joined EMPIRE_SEEDS
    // and the rule takes the max across all five walks.
    //
    // The general lesson is worth more than the seed: A BREAK AIMED AT ONE
    // SEED IS AIMED AT ONE CAMPAIGN'S WEATHER, and the weather moves every
    // time the economy does. Nothing warns you — the break just stops being a
    // break. Only the five-milestone rot check found this.
    n: 255, gate: EMPIRE, name: 'the cash reserve goes back to refusing the five dollars that keeps a creature',
    file: 'tools/sim.js',
    anchor: '      if (state.funds < TRAINING.cost) break;',
    to: '      if (!canSpend(TRAINING.cost)) break;',
  },
  // --- gate: empire (R163 — the vat's brake) -------------------------------
  {
    // RESTORED BY R165, aimed at a seed where it reproduces.
    //
    // R163 shipped VAT_KEEP_DAYS = 14 against a conveyor: 120 gestations, a
    // median chimera life of 2.5 days under R135's floor of 5. R147 retired
    // this break when it went MISSED, having measured the brake on the three
    // EMPIRE seeds and found it made no difference — 40.9, 71.1 and 67.5 days
    // with it, 53.0, 65.1 and 63.7 without.
    //
    // That was the wrong conclusion from too small a sample, and R165 says so
    // with twelve seeds. On seed 11 the brake is doing all of the work:
    //
    //           median life    vat gestations    made
    //   KEEP=14      6.8d           6             65
    //   KEEP=2       2.0d         443            737
    //
    // 443 gestations against the 120 R163 was fixing. Seed 11 is now in
    // EMPIRE_SEEDS, so this break lands on a campaign that can feel it and the
    // churn rule goes red. A break is only as good as the seed it is asked on.
    n: 268, gate: EMPIRE, name: 'the decant goes back on the general dismantle floor, and the vat is a conveyor again',
    file: 'tools/sim.js',
    anchor: '      const VAT_KEEP_DAYS = 14;',
    to: '      const VAT_KEEP_DAYS = 2;',
  },
  // --- gate: turns (R145 — a fight ends, and it ends the right way) --------
  {
    // TAKE THE CAP OFF. This does not restore the old code exactly — it moves
    // the limit out of reach, which is the same thing from the fight's point
    // of view and keeps the patch to one token.
    //
    // WHICH RULE CATCHES IT IS THE POINT. `max <= TURN_LIMIT` reads the
    // constant, so raising the constant satisfies it — the rule that goes red
    // is `stalls === 0`, because the two grind-locked fights on sample seed 11
    // run the harness's own 300-turn guard out and come back with no verdict.
    // A gate that checked only the limit it was handed would be green here,
    // which is why R145 asserts both halves.
    n: 269, gate: SHARD_D, name: 'the engine loses its turn cap and two fights stop ending',
    file: 'battle/engine.js',
    anchor: 'export const TURN_LIMIT = 60;',
    to: 'export const TURN_LIMIT = 6000;',
  },
  {
    // A FIGHT THAT ENDS WITH NO VERDICT. The plausible half-fix: stop the
    // fight, forget to say who won. `over` is true so nothing loops forever
    // and the turn count looks healthy, but `outcome` stays null — which
    // `scriptedBattle` reports as a stall and the War Room reports to the
    // player as "Defeat." This is the shape of the bug R145 found, reached by
    // a different route, and it goes red on the FIRST seed rather than the
    // second: every seed has a fight that reaches the limit.
    n: 270, gate: SHARD_D, name: 'the called fight stops without saying who won',
    file: 'battle/engine.js',
    anchor: "  battle.outcome = won ? 'win' : 'loss';",
    to: '  battle.over = true;',
  },
  {
    // R164 — INVERT THE BAND RULE. The census's `bands` reports win rate by
    // fight length, and the rule says the longest band wins at least as often
    // as the whole census. Compare against the WRONG side and the assertion
    // becomes "the longest fights must lose more than average", which is what
    // R145 believed and filed as fact.
    //
    // The break exists because the defect this milestone found was a CLAIM, not
    // a behaviour: the tail was measured correctly and then explained with a
    // mechanism nobody tested. A rule about a shape needs a break that proves
    // the rule can tell the shape apart from its opposite.
    n: 274, gate: SHARD_D, name: 'the band rule reads the comparison backwards, and a losing grind passes',
    file: 'tools/smoke.js',
    anchor: '    assert.ok(long.winPct >= c.winPct,',
    to: '    assert.ok(long.winPct <= c.winPct,',
  },
  // --- gate: coverage (R147 — the bay nobody filled) -----------------------
  {
    // THE PLANNER GOES BACK TO A PRIVATE COPY OF THE SOCKET LIST. This is the
    // defect exactly as it shipped: CHASSIS_SLOTS has six entries and no
    // `organ2`, so the Surgery Theater's second organ bay is invisible to the
    // balance model while Tier II sells it in every campaign. The coverage
    // gate's socket rule goes red with "dead bay: the Surgery Theater sells
    // organ2 and not one of the 96 chimeras these campaigns kept is wearing
    // it".
    //
    // R157's lesson is the reason this break exists rather than a comment: one
    // constant with three readers goes stale in two of them, and the only way
    // to keep the planner honest is to make a private copy FAIL.
    n: 272, gate: DIET, name: 'the build planner keeps its own socket list again, and the second organ bay dies',
    file: 'tools/sim.js',
    anchor: '    const granted = theaterGrants(state, content, frameId).sockets;',
    to: "    const granted = ['head', 'forelimbs', 'hindlimbs', 'tail', 'hide', 'organ'];",
  },
  {
    // THE OTHER HALF, AND THE SUBTLER ONE. Leave the grant in place but match
    // sockets by name instead of by the slot they accept: `organ2` is then
    // never chosen for an organ part, because the socket id and the part's
    // slot differ by one character. The list is right and the fill is wrong —
    // which is how the original could have been "fixed" by adding organ2 to
    // CHASSIS_SLOTS and still shipped a dead bay.
    n: 273, gate: DIET, name: 'sockets are matched by name rather than by the slot they take',
    file: 'tools/sim.js',
    anchor: '        const socketId = granted.find((sid) => slotOfSocket(sid) === part.slot && !slots[sid]);',
    to: '        const socketId = granted.find((sid) => sid === part.slot && !slots[sid]);',
  },
  {
    // THE VERDICT READS A FIELD THAT DOES NOT EXIST. `hpMax` for `maxHp` — my
    // own slip, in the calibration that chose 60, and it is invisible to every
    // rule about how LONG a fight is: `mine` is NaN, so `ours >= them` is
    // always false and every called fight is a loss, including the one where
    // the opposition is already at zero health. The census recomputes the
    // verdict from the field the call read and `misjudged` goes non-zero.
    //
    // Worth a break of its own because it is the failure a turn cap invites:
    // three rules can prove every fight terminates while the thing it
    // terminates into is wrong.
    n: 271, gate: SHARD_D, name: 'the called verdict compares NaN and hands every grind to the opposition',
    file: 'battle/engine.js',
    anchor: '  const mine = team.reduce((s, c) => s + c.maxHp, 0);',
    to: '  const mine = team.reduce((s, c) => s + c.hpMax, 0);',
  },
  // --- gate: empire (R142 — the ratio the harness prints) ------------------
  {
    // R142's whole deliverable is that the care:splice ratio stops being a
    // number in prose and becomes a fact the walk computes. The entry's
    // "1,178 : 1" went stale to 675 : 1 without anything noticing, because a
    // ratio nobody prints goes stale silently — so freeze the report to a
    // constant and the rule has to say so. This is R160's lesson in one line:
    // an instrument that reads the same thing whatever happens is worse than
    // no instrument, because it looks like evidence.
    //
    // Recorded honestly: this is the break that MY rules catch alone. Two
    // aimed at the splice FLOOR were tried first and both are already caught
    // upstream — stopping the walker splicing trips R119's day-one chimera
    // rule, and dropping R92's Theater stall reservation trips R154's herd
    // bound. That is the right answer for the codebase, and it leaves the
    // floor covered by construction rather than unguarded.
    n: 267, gate: EMPIRE, name: 'the care:splice ratio becomes a constant and stops tracking the campaign',
    file: 'tools/sim.js',
    anchor: '        carePerSplice: splices ? Math.round((verbs.care ?? 0) / splices) : null,',
    to: '        carePerSplice: 675,',
  },
  // --- gate: empire (R139 — the Wing's funnel, not its ratio) --------------
  //
  // R139 was filed on one number — "5,989 bagged, 86 rehabilitated, 1.4%" —
  // and every word of the diagnosis around it was wrong. The Wing graduates
  // EVERY programme it starts; what the ratio measured is that `bagged` was
  // never a queue. These two aim at the halves of that correction that
  // nothing else in the tree asserts.
  //
  // Worth recording honestly: the finish-rate rule (`graduated === enrolled`)
  // could NOT get a break of its own. Both engine regressions tried for it —
  // nothing ever graduating, and a graduate never joining the roster — are
  // already caught by R8's own unit tests, which is the right answer for the
  // codebase and leaves that rule double-covered rather than unguarded.
  {
    // The claim the whole correction rests on: the board is FULL, so the ~96%
    // the Wing never reformed is what it declined rather than what it failed
    // to reach. Inflate the cap and the board can never fill, which is the
    // shape a well-meaning "give the player more room" change has — and it
    // would quietly turn the entry's story back into a true one.
    n: 265, gate: EMPIRE, name: 'the bay board can never fill, so the Wing looks starved again',
    file: 'data/facility.json',
    anchor: '            "bays": 40',
    to: '            "bays": 4000',
  },
  {
    // R95's choice, which is the other reason the funnel narrows: salvage is
    // the only door the eight enemy-tech parts come through, so a campaign
    // that enrols everything is a campaign for which those parts do not
    // exist. Remove the branch and the walker stops picking.
    n: 266, gate: EMPIRE, name: 'the walker enrols everything, so salvage stops being a choice anybody makes',
    file: 'tools/sim.js',
    anchor: "    if (carriesNew) {\n      if (salvageUnit(state, entry.id, content, now).ok) did('salvage', { unit: entry.unitId });\n      continue;\n    }\n",
    to: '',
  },
  // --- gate: suite (R160 — the budget is denominated in the walk cache) ----
  //
  // R156's two breaks lived here and both aimed at `tools/probe.js`, which
  // R160 deleted: twenty runs of byte-identical work put the probe's
  // correlation with that work at r = 0.001, and it read 95ms through a suite
  // that swung from 728 to 929. A break aimed at a deleted instrument is the
  // stalest kind of anchor, so they go with it. These three aim at the two
  // terms that replaced it.
  {
    // THE CACHE HAS TO LAND. R132 made the write atomic — write to a temp
    // file, then rename — and the rename is the half that can be dropped by
    // somebody tidying. Drop it and nothing is ever cached: every run rebuilds
    // all thirteen walks, pays 200 CPU-seconds for work it already did, and
    // the allowance reads zero because nothing appeared during the run. The
    // budget would then fail for a reason it could not name, which is the
    // failure R151 through R158 spent four milestones chasing.
    n: 260, gate: SUITE, name: 'the walk cache is never written, so every run rebuilds what it already had',
    file: 'tools/fixtures.js',
    anchor: '  renameSync(tmp, file);',
    to: '',
  },
  {
    // AND THE BUDGET HAS TO BITE. R90 shards smoke four ways and the whole
    // design rests on one predicate; fail it open and every shard runs the
    // whole file. Nothing goes red on its own — every assertion still passes,
    // four times over — and the suite silently costs double. That is the
    // exact shape R90 named as the dangerous one, and the budget is the only
    // thing in the tree that can see it. Measured at 1621 against 820.
    n: 261, gate: SUITE, name: 'the shard filter fails open, so all four shards run the whole of smoke',
    file: 'tools/smoke.js',
    anchor: '  return !SHARD || SHARD_OF[name] === SHARD;',
    to: '  return true;',
  },
  {
    // THE ONE THAT PROVES THE TIGHTENING BOUGHT SOMETHING. Sampling is the
    // realistic way this suite gets expensive — a session wants a steadier
    // number and multiplies the seeds — and it is invisible, because a bigger
    // sample makes every gate MORE right. Measured at 1070: over R160's 820
    // by 30%, and comfortably UNDER R158's 1100, which would have waved it
    // through. A budget with 51% of slack in it is a budget that only catches
    // what nobody would have shipped anyway.
    n: 262, gate: SUITE, name: 'the balance sweep quadruples its sampling, and the old budget had room for it',
    file: 'tools/smoke.js',
    anchor: '      balanceTasks.push({ builds: 40, seedsPer: 8, teamSize: 3, grade, seed: poolSeed });',
    to: '      balanceTasks.push({ builds: 40, seedsPer: 32, teamSize: 3, grade, seed: poolSeed });',
  },
  // --- gate: facility (R159 — a slow box is not a broken screen) -----------
  //
  // R159's evidence was gathered under 40 CPU burners on four cores, which is
  // not a state a battery on an idle box can produce. That is exactly why the
  // decision lives in `tools/settling.js` as a pure function: weather cannot
  // be a fixture, so the rule it feeds would have had nothing to look at.
  {
    // A starved run goes back to blaming the screen. This is the sentence the
    // milestone exists to stop printing — "its height budget is being met by a
    // screen nobody can open", about a screen that was fine and a box that was
    // busy — and a 47-minute battery that says it at random is a battery
    // nobody trusts the fifth time.
    n: 263, gate: FACILITY, name: 'a starved height run goes back to reporting a screen nobody can open',
    file: 'tools/settling.js',
    anchor: '  if (moved) {',
    to: '  if (false) {',
  },
  {
    // And the dangerous direction, which is the one worth more. R131 built the
    // `opens` count because every other height rule fails upwards: a screen
    // the walk cannot get into reports a comfortable number and passes. If
    // every short walk is excused as a slow box then that hole is back, and
    // this time with a reassuring explanation printed over it.
    n: 264, gate: FACILITY, name: 'a screen nobody can open is excused as a slow box, and R131 is undone',
    file: 'tools/settling.js',
    anchor: '    kind: UNOPENABLE,',
    to: '    kind: STALLED,',
  },
  // --- gate: facility (R161 — a refusal is not a ceremony) -----------------
  {
    // The Pens goes back to offering a graduation the vault will refuse. This
    // is the half the player pressed: R91 built the refusal and nothing ever
    // asked it, so the button was armed on a full shelf and the ceremony that
    // followed could not finish.
    //
    // Aimed at the PREDICATE rather than at the `disabled` attribute, because
    // the defect was never a missing attribute — it was a control that did not
    // ask the question the engine answers (R49).
    n: 258, gate: FACILITY, name: 'the Extract button stops asking whether the vault can take the yield',
    file: 'ranch/ui.js',
    anchor: '            const fit = extractionFit(state, animal, content);',
    to: '            const fit = { fits: true, yields: 0, room: 0, msg: null };',
  },
  {
    // And the belt behind that pair of braces: the ceremony plays for a
    // refusal again. `showResults` then reads `result.tokens.map` on a result
    // that has none, the overlay is stranded with its own buttons already
    // removed, and the only way out is closing the app. That is exactly what
    // was reported from play, twice, because a full vault stays full.
    n: 259, gate: FACILITY, name: 'a refused graduation plays the whole ceremony and strands the overlay',
    file: 'splice/extract-ui.js',
    anchor: '    if (!result.ok) return showRefusal(overlay, result, onDone);',
    to: '',
  },
  {
    // R157 — the other half of 152. THEATER_STALLS reserves the room; this is
    // the rule that stops the splice policy taking it. Break it and the walker
    // splices to the whole grant, both clocks starve, and coverage says so.
    n: 249, gate: DIET, name: 'the splice policy takes the whole grant again, so the vat and the Wing never get a stall',
    file: 'tools/sim.js',
    anchor: '      const cap = Math.min(room.cap - THEATER_STALLS, opts.stableCap ?? Infinity);',
    to: '      const cap = Math.min(room.cap, opts.stableCap ?? Infinity);',
  },
  {
    n: 153, gate: DIET, name: 'the walker stops running the Resequencer, so what a vial is worth goes back to being unmeasured',
    file: 'tools/sim.js',
    anchor: "      did('resequence', { species: best.species, stars: best.stars });",
    to: '      void 0;',
  },
  {
    n: 154, gate: DIET, name: 'the chaos vat goes back to being the one agenda row with nothing behind it',
    file: 'tools/sim.js',
    anchor: "        if (startVat(state, a.id, b.id, content, now).ok) { did('vat', { sire: a.id, dam: b.id }); ran = true; }",
    to: '        ran = true;',
  },
  {
    n: 155, gate: DIET, name: 'a moveset retrain stops being logged, so four slots are exercised and nothing says so',
    file: 'tools/sim.js',
    anchor: "      if (setMoveset(state, c.id, pick, known, now, content).ok) did('moveset', { who: c.id });",
    to: '      setMoveset(state, c.id, pick, known, now, content);',
  },
  {
    n: 156, gate: DIET, name: 'an agenda row is added that no walker verb answers, and the coverage rule lets it through',
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
    //
    // R113 — AND THE PATCH NOW HAS TO TAKE THE WRAP OFF THE ROW, because
    // this break went MISSED on R113's full battery with nothing about the
    // gate, the rule or the markup changed. `.encounter` gained
    // `flex-wrap: wrap` for a held node row at 150% text, and that one
    // declaration fixes R86's defect too: measured with the button put back,
    // the row runs 110px past its card at `nowrap` and sits 15px INSIDE it
    // at `wrap`. The defect is structurally unreachable now, which is the
    // right outcome for the game and the wrong one for a break — so the
    // patch reconstructs the geometry the stylesheet forbids, and says so.
    // R86's markup stays because a full-width button under the row reads
    // better than one wrapped onto a second flex line; it is a layout
    // decision now rather than a bug fix.
    n: 181, gate: A11Y, name: 'the egg\'s Hurry button goes back into a row that cannot wrap, and off the side of the phone',
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
      </div><style>.encounter { flex-wrap: nowrap; }</style>\`;`,
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
    if (r.ok) cue('splice');
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
    // under the card — so the patch now carries both past the roster. R104
    // closed it with a second bracket: the screen is painted by a call now,
    // not by an assignment.
    anchor: `    facilityCard(state, content, 'pens') +
    // R135 — the Pens hosts the Dismantle button and sells nothing that
    // speeds it up. One line, under the card that sells the machine this
    // screen DOES own, pointing at the one it does not.
    tablePointer(state, content) +
    (cards ||
      \`<section class="card"><p class="ranch-msg">No chimeras yet. The Splice tab accepts walk-ins.</p></section>\`));`,
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
    // R104 renamed the query: a patched screen asks for what is NOT yet
    // bound, or a kept node gets its listener twice.
    anchor: "  unbound(root, 'button[data-treat]').forEach((btn) => {",
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
    // R93 — re-aimed. The line was `waves: [loose.unit]`; a loose entry is now
    // a leader plus a pack and every reader goes through `packOf`.
    anchor: '    waves: packOf(loose),',
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

  // R167 — the description half goes back into the eager module, which is
  // exactly the state R93 paid two cap raises for. Aimed at BOOT rather than
  // the eager-JS cap because first paint is the budget a player feels.
  {
    n: 283, gate: BOOT, name: 'the move descriptions go back into the eager graph',
    // Aimed at an EAGER importer, because that is the only way the split can
    // be undone: battle/ui.js is lazy, so importing move-text there changes
    // nothing. statblock.js is compiled before the first paint.
    file: 'battle/statblock.js',
    anchor: "import { MOVE_SLOTS, activeMoves, defaultPick, partMoveId, comboMoveId } from './moves.js';",
    to: "import { MOVE_SLOTS, activeMoves, defaultPick, partMoveId, comboMoveId } from './moves.js';\n"
      + "import { moveSummary } from './move-text.js';\nexport const __r167 = moveSummary;",
  },
  // R104 — the shell repaints on a change. Four breaks, one per rule the
  // milestone added, each aimed at the mechanism rather than at the symptom:
  // the gate that reads them is the same a11y run, so a break that only
  // slowed the screen down would go green and prove nothing.
  {
    n: 287, gate: A11Y, name: 'the tick repaints whether or not anything moved',
    file: 'main.js',
    anchor: 'const changed = force || Object.keys(moved).length > 0;',
    to: 'const changed = true;',
  },
  {
    n: 288, gate: A11Y, name: 'a screen you left keeps its DOM for the session',
    file: 'main.js',
    anchor: 'if (s !== name && el.childElementCount) el.replaceChildren();',
    to: '// left standing',
  },
  {
    n: 289, gate: A11Y, name: 'one tap rebuilds every card again',
    // Aimed at the KEY, not at paintScreen itself: a diff that cannot tell
    // two cards apart matches them positionally, and every card after the
    // one that changed shifts and is replaced. That is the failure this is
    // actually likely to regress into.
    file: 'ui/patch.js',
    anchor: "const keyOf = (el) => el.querySelector?.('[data-fold]')?.dataset.fold",
    to: 'const keyOf = (el) => (el ? null : null) ??',
  },
  {
    n: 290, gate: A11Y, name: 'the Dex paints every portrait before anyone scrolls',
    file: 'splice/dex-ui.js',
    anchor: 'const DEX_EAGER_CELLS = 9;',
    to: 'const DEX_EAGER_CELLS = 99;',
  },
  // R107 — welcome back. Four breaks, one per thing the milestone claims:
  // the counters that let the report see an event that resolved inside the
  // gap, the six-hour floor, the one-line-per-category rule, and the card
  // actually reaching the glass.
  //
  // Break 291 is the one worth reading. `contestCount` is what R107 added to
  // the snapshot precisely because `contested` ends a week where it started
  // on three seeds in five; take it out again and the gate must notice that
  // the week of siege has gone quiet, which is the whole premise.
  {
    n: 291, gate: SHARD_D, name: 'the report goes back to reading levels, so a week of convoys is silent',
    file: 'campaign/world.js',
    anchor: '    contestCount: c.contestCount ?? 0,',
    to: '    contestCount: 0,',
  },
  {
    // The threshold is about TIME. An hour away already moves funds, so a
    // digest keyed on "did the report say anything" fires on a coffee break;
    // dropping the floor to a minute is that mistake made concrete.
    n: 292, gate: SHARD_D, name: 'the welcome-back card starts firing on a coffee break',
    file: 'campaign/digest.js',
    anchor: 'export const AWAY_MIN_MS = 6 * 3600000;',
    to: 'export const AWAY_MIN_MS = 60 * 1000;',
  },
  {
    // A line for a category that did not move is the wire again: twelve
    // headings, most of them zero. The rule is one line per thing that
    // CHANGED, and this removes the check that enforces it.
    n: 293, gate: SHARD_D, name: 'the digest starts reporting categories that did not move',
    file: 'campaign/digest.js',
    anchor: '    if (a === b) continue;',
    to: '    if (false) continue;',
  },
  {
    // And the card itself. The a11y clause exists because this feature
    // shipped once with the gate unable to see it at all.
    n: 294, gate: A11Y, name: 'a week away opens the app with nothing to show for it',
    file: 'main.js',
    anchor: '  if (gap.dt >= 6 * 3600000) {',
    to: '  if (false) {',
  },
  // R168 — the suite's two budgets. The seconds one is now the gross catcher
  // and the shares one is the precise, host-invariant one; both need a break
  // that reaches them, and neither can be a five-minute `npm test` per break.
  {
    // THE BAND STOPS BEING A BAND. At 60pp nothing can ever be outside it,
    // which is the shape every budget takes on the day somebody widens it to
    // stop a red rather than to describe a measurement.
    n: 295, gate: SHARD_D, name: 'the share band widens until no job can ever be outside it',
    file: 'tools/shares.js',
    anchor: 'export const SHARE_BAND = 6;',
    to: 'export const SHARE_BAND = 60;',
  },
  {
    // AND THE TABLE STOPS DESCRIBING THE SUITE. Shares of one run cannot sum
    // past 100; this break is the exact mistake the rule caught on its first
    // run, when the first draft of the table was rounded to whole percent.
    n: 296, gate: SHARD_D, name: 'the declared shares stop adding up to one suite',
    file: 'tools/shares.js',
    anchor: "  'smoke:a': 28.3,",
    to: "  'smoke:a': 58.3,",
  },

  // R169 — the first paint carries functions no boot calls. Three breaks:
  // the defect the rule exists for, and the two ways the measurement can
  // quietly stop measuring. The second and third aim at the PROBE rather
  // than at the game, which is the only honest way to test an instrument —
  // a budget computed wrong reads green forever, and R168's break 240 is
  // what that costs when nobody checks.
  {
    // The whole of R169, run backwards. `splice/theater.js` is 19.5 KB of
    // splicing machinery and boot calls `isSettled` — 73 bytes — and nothing
    // else, which is why the settling clock moved to `splice/chimera.js`.
    // Point one eager reader back at the Theater and 13.4 KB of functions no
    // boot calls come with it. R121's module rule stays GREEN through this,
    // because theater.js does run a function: that is the blind spot, and
    // this is the break that proves the byte budget covers it.
    n: 297, gate: BOOT, name: 'a 19 KB module comes back into the first paint to supply one 73-byte predicate',
    file: 'battle/statblock.js',
    anchor: "import { isSettled } from '../splice/chimera.js';",
    to: "import { isSettled } from '../splice/theater.js';",
  },
  // R94 — the ladder is a ratchet. Both breaks aim at the defect that was
  // actually shipped for six milestones, not one imagined for the occasion:
  // Threat Generation read the live notoriety meter, so holding a Task Force
  // raid could de-escalate the whole world.
  {
    // THE DEFECT ITSELF. Point the ladder back at the meter and the world
    // starts forgetting you again: 82 drops over seven campaigns, and one
    // seed finishing as a "Local Nuisance" having held 40 raids. Caught by
    // the drop count, which is a TRAJECTORY — no single state can show a
    // number going backwards, which is why the walk counts them.
    n: 302, gate: EMPIRE, name: 'the Threat Gen ladder reads the live meter again, and winning calms the world down',
    file: 'campaign/map.js',
    anchor: '  const notoriety = notorietyMark(state);',
    to: '  const notoriety = state.campaign?.notoriety ?? 0;',
  },
  {
    // AND THE HALF THAT MAKES IT A RATCHET RATHER THAN A SECOND METER. Drop
    // the peak from the mark and `notorietyMark` is just `notoriety` wearing
    // a different name — every reader de-escalates again, and the Task Force
    // trigger goes back to being something a spend can race, which is the
    // clause R94's entry put in its own scope.
    n: 303, gate: EMPIRE, name: 'the high-water mark stops counting, so the mark is just the meter again',
    file: 'campaign/map.js',
    anchor: '  return Math.max(cam.notorietyPeak ?? 0, cam.notoriety ?? 0);',
    to: '  return cam.notoriety ?? 0;',
  },

  // R170 — the suite's two host-invariant rules, and both breaks aim at a
  // defect that actually happened rather than one imagined for the occasion.
  {
    // THE ONE R170 SHIPPED. `tools/pool.js` ends the balance sweep with
    // `w.terminate()`, which runs no exit handler, so the worker flushes its
    // count per task instead. Take that away and the sweep — 404,736 of the
    // suite's 855,308 fights — writes nothing, and the count reads 450,572
    // with break 262 applied exactly as it does without it. Caught by the
    // FLOOR, because a blind counter's number falls, and no ceiling has ever
    // been able to see that.
    n: 300, gate: SUITE, name: 'the balance sweep stops writing down the fights it flew, and the count reads clean',
    file: 'tools/sim-worker.js',
    anchor: '    flushFlown();',
    to: '    void flushFlown;',
  },
  {
    // R170 lifted the share rule's `rebuilt === 0` guard — which had kept it
    // from ever running under the battery — by taking `walks` out of the
    // table instead, since that is where the whole cold-run distortion lives.
    // Put `walks` back and the exclusion stops being load-bearing: on the
    // cold run every break gets, rebuilds take that job to 24.9% of a suite
    // where it is declared at 4.1%.
    n: 301, gate: SUITE, name: 'the walks job rejoins the share table, and a cold run reads its cache as a regression',
    file: 'tools/shares.js',
    anchor: "  handlers: 5.2, vault: 2.8, scopecheck: 0.2,",
    to: "  handlers: 5.2, vault: 2.8, scopecheck: 0.2, walks: 4.1,",
  },

  // R102 — the run boundary. Both breaks aim at the two ways a legacy system
  // fails, and they are opposite: carrying nothing makes the ceremony a lie,
  // carrying more than one makes it a save editor.
  {
    // NOTHING CROSSES. `applyLegacy` stops writing the pick, so the ceremony
    // offers a choice, takes it, and hands back the same empty run it always
    // did — which is the state this game was in before R102 and is invisible
    // from the outside: the dialog still says the right words.
    n: 311, gate: SHARD_B, name: 'the legacy is offered and then dropped, so the ceremony is a lie',
    file: 'campaign/legacy.js',
    anchor: '      out.chimeras = [carryChimera(source, content, now)];',
    to: '      out.chimeras = [];',
  },
  {
    // AND THE CEILING. A second pick replaces the first instead of being
    // refused, which is how "carry exactly one thing" becomes "carry one thing
    // per visit to this dialog" — a save editor with a ceremony around it.
    // Caught by the gate that takes two picks in a row and expects the FIRST
    // to still be the answer.
    n: 312, gate: SHARD_B, name: 'a second legacy pick overwrites the first, so exactly one becomes one at a time',
    file: 'campaign/legacy.js',
    anchor: '  if (taken >= (t.maxPicks ?? 1)) return fresh;',
    to: '  if (false) return fresh;',
  },

  // R172 — the three rules the crossing's price rests on, one break each.
  {
    // THE LIST THAT DID NOT CHECK ITSELF, which is the defect R102 actually
    // shipped: four of its six field names were not fields at all, and
    // nothing could tell because a list of strings is compared to nothing.
    // Dropping the real settle clock out of the table reproduces exactly
    // that — a creature arriving mid-settle on the old run's clock, up to
    // 38.4 days into a run that has not started. Caught by the rule that
    // reads a WALKED creature's own keys and requires the table to name
    // every one of them.
    n: 313, gate: SHARD_B, name: 'a clock a real chimera holds drops out of CARRY_CLOCKS, so the old run\'s time crosses',
    file: 'campaign/legacy.js',
    anchor: '  settleUntil: (now) => now,      // and it is not still settling from last time',
    to: '',
  },
  {
    // AND THE TABLE STOPS BEING APPLIED. Rule 6 says the list is complete;
    // this is the other half, because a complete list nobody reads is the
    // same bug with better documentation.
    n: 314, gate: SHARD_B, name: 'the crossing stops re-stamping its clocks, so a veteran arrives on last run\'s calendar',
    file: 'campaign/legacy.js',
    anchor: '  for (const [key, stamp] of Object.entries(CARRY_CLOCKS)) c[key] = stamp(now);',
    to: '',
  },
  {
    // THE PRICE ITSELF. Skip the grade reset and the creature arrives at the
    // grades a finished county paid for: measured across nine seeds, A1's
    // wall goes from a median 0% back to a median 81% with ONE body against
    // the second node — the invariant R106 and R119 were each built around,
    // and the one R119 rejected its own tuning for taking to 46%. Caught
    // twice over: by the rule that reads the arriving tokens' grades, and by
    // the wall itself.
    n: 315, gate: SHARD_B, name: 'a carried veteran keeps its grades, so the second run walks the wall on day one',
    file: 'campaign/legacy.js',
    anchor: '  if (t.cost?.resetsGrades) {',
    to: '  if (false) {',
  },

  // R105 — the county calendar. One break per clause of the Done-when.
  {
    // THE SKY STOPS BEING A CLOCK. Pin the hour and every moment of the day
    // renders the same header — which is the state the whole entry describes
    // ("the Ranch at 3 a.m. is the Ranch at 3 p.m."), reintroduced. Caught by
    // the 24-hour sweep rather than by a single pair, because a two-state
    // day-and-night sky would pass a 3 a.m. / 3 p.m. comparison.
    n: 316, gate: SHARD_B, name: 'the sky stops reading the hour, so every moment of the day looks the same',
    file: 'campaign/calendar.js',
    anchor: '  const hour = local.getHours() + local.getMinutes() / 60;',
    to: '  const hour = 12;',
  },
  {
    // HUSBANDRY BECOMES POWER. The one line the entry drew, and the easiest
    // to cross by accident: a season that scales a stat is a difficulty
    // setting the player did not choose and cannot see coming. The break adds
    // the key to the DATA, because that is where somebody would add it.
    n: 317, gate: SHARD_B, name: 'a season scales a stat, so the calendar quietly becomes a difficulty dial',
    file: 'data/calendar.json',
    anchor: '      "decayScale": 0.95,',
    to: '      "decayScale": 0.95,\n      "powerScale": 1.1,',
  },
  {
    // THE CATALOGUE LEARNS TO READ A CLOCK AGAIN. R105 built a seasonal shelf,
    // measured it against R142's splice floor, and took it out — but the way
    // it FAILED is the thing worth guarding: `catalogFor` grew a `now`
    // parameter, every caller but one kept passing nothing, and the default
    // was `Date.now()`. A simulated campaign running at the 2026 epoch was
    // shopping from whatever season it happened to be in real life, which is
    // a seeded walk quietly reading the wall clock. Caught by the rule that
    // requires the function to take no moment at all.
    n: 318, gate: SHARD_B, name: 'the catalogue takes a moment again, so a seeded walk can read the wall clock',
    file: 'ranch/ranch.js',
    anchor: 'export function catalogFor(state, content) {',
    to: 'export function catalogFor(state, content, now = Date.now()) {',
  },
  {
    // THE YEAR STOPS TURNING OVER. Season zero forever: every husbandry
    // multiplier freezes at Splicetember's, the catalogue never rotates, and
    // nothing on any screen is visibly wrong. This is the failure the walk's
    // `seasonsSeen` exists for — it is invisible to every other gate, and it
    // is the shape of the bug the walker actually had before this milestone
    // stamped `createdAt`.
    n: 319, gate: SHARD_B, name: 'the calendar never turns over, so a 180-day campaign lives in one season',
    file: 'campaign/calendar.js',
    anchor: '  const index = order.length ? Math.floor(elapsed / span) % order.length : 0;',
    to: '  const index = 0;',
  },

  // R108 — the five rules of the card, one break each. Every one of these is
  // a shape the milestone could have shipped: the first two ARE shapes it
  // shipped and the gate caught.
  {
    // THE SOCKETS GET TIDIED, and the creature comes back with the same five
    // stats and a different moveset. This is R108's own first defect,
    // restored: `movesFromTokens` walks the tokens in the order it is given
    // them, so a canonical sort is a silent re-roll of which four moves a
    // visitor can press. Nothing on the card looks wrong.
    n: 320, gate: SHARD_A, name: 'the card tidies its sockets, so a creature comes back with a different moveset',
    file: 'splice/card.js',
    anchor: 'const socketOrder = (tokens) => Object.keys(tokens ?? {});',
    to: 'const socketOrder = (tokens) => Object.keys(tokens ?? {}).sort();',
  },
  {
    // THE SECOND DOOR IS NOT ON THE CARD. The code still exists, still
    // decodes, still round-trips in isolation — it is simply not printed, so
    // the player holding the picture cannot read it to anybody. A feature
    // that is only reachable from a function nobody calls is not shipped.
    n: 321, gate: SHARD_A, name: 'the genome code stops being printed on the card, so only the file works',
    file: 'splice/card.js',
    anchor: '    + text(516, 11, p.rule, code)',
    to: '    + text(516, 11, p.rule, \'\')',
  },
  {
    // A PART NOBODY HAS IS WAVED THROUGH. The refusal goes, and an id that
    // does not exist reaches `unitFromGenome`, which reads
    // `content.parts[partId].species` — so a stranger\'s typo stops being a
    // sentence a player can act on and becomes a throw inside the War Room\'s
    // render. The third clause of the criterion, exactly.
    n: 322, gate: SHARD_A, name: 'a card naming a part nobody has is accepted, so a stranger can crash the War Room',
    file: 'splice/card.js',
    anchor: "      return no(content, 'badPart', { partId, socket });",
    to: '      partId;',
  },
  {
    // THE EXHIBITION PAYS. One number, and the friendly becomes a farm: a
    // visitor is a unit whose stats a STRANGER chose, so an exhibition with a
    // purse is an income any player can print by editing a file. "No stakes"
    // is the whole promise of the fight.
    n: 323, gate: SHARD_A, name: 'the exhibition grows a purse, so somebody else\'s creature becomes an income',
    file: 'campaign/visiting.js',
    anchor: '    reward: 0,',
    to: '    reward: 500,',
  },
  {
    // THE CARD STOPS ESCAPING WHAT IT DRAWS. R108 aimed this at the private
    // escaper this file used to keep; R114 collapsed five of those into one,
    // so it now aims at the CALL instead — which is the more durable target
    // anyway, because the next milestone to move the implementation will not
    // move the fact that the card's own label is escaped before it is drawn.
    n: 324, gate: SHARD_A, name: 'the card stops escaping what it draws, so a stranger names a creature <script>',
    file: 'splice/card.js',
    anchor: '    + `role="img" aria-label="Specimen card: ${esc(name)}">`',
    to: '    + `role="img" aria-label="Specimen card: ${name}">`',
  },

  // R109 — the four rules of the voice, one break each. The first two are
  // shapes the tree actually shipped; the gate is what found them.
  {
    // THE CURSOR STOPS ADVANCING. Every pool answers with the line its seed
    // opened on, forever — which is what the wire did before this milestone,
    // and it is invisible unless something counts: no error, no warning,
    // every sentence in the game still perfectly good English.
    n: 325, gate: SHARD_D, name: 'the pool cursor stops advancing, so every event says one sentence for the life of the save',
    file: 'campaign/monologue.js',
    anchor: '  const at = state?.wireAt?.[key] ?? 0;',
    to: '  const at = 0;',
  },
  {
    // A SENTENCE GOES BACK INTO AN ENGINE MODULE. This is the exact line
    // R109 found 724 tellings of — a quarter of the game's voice written
    // where no pool can reach it and no rewrite is a data edit.
    n: 326, gate: SHARD_D, name: 'a wire sentence is written in an engine module again, out of reach of any pool',
    file: 'campaign/campaign.js',
    anchor: "      if (!extra.success) emitNews(state, content, 'op_failed', { op: extra.name });",
    to: "      if (!extra.success) pushNews(state, `${extra.name} came to nothing, which happens.`);",
  },
  // R116 — BREAK 327 RETIRED, BECAUSE IT COULD NEVER HAVE FIRED.
  //
  // It read: "a job stops rotating its headline, so one sentence is 5% of the
  // wire again", and patched `pickPooled(state, 'op:'+op.id, op.news)` to
  // `Array.isArray(op.news) ? op.news[0] : op.news`. Its note said "the pool
  // is still authored; it is simply not read."
  //
  // The pool is not authored. EVERY `news` in data/operations.json is a
  // single string — seven jobs, seven sentences — and `pickPooled` on a
  // one-item list returns that item, so the patch and the original compute
  // the same value. Even the cursor is inert: `wireAt` advances by
  // `(at + 1) % 1`, which is zero. It is a perfect no-op, and `--anchors`
  // could not say so because the anchor matched perfectly; only the meaning
  // was empty. No commit touching that data file in the last 25 has ever
  // carried an array there, so this was not something R116 broke.
  //
  // It is not re-aimable either. `node_seized` (3 phrasings) is the ONLY
  // multi-line pool in the game, and smoke.js already asserts its rotation by
  // name — "the pool actually varies" — while break 325 above kills rotation
  // globally at `wireAt` and is caught. The rule is covered twice over; what
  // 327 added was coverage of a mechanism the content never had.
  //
  // What it found instead is a CONTENT gap, and a real one: 542 launches
  // across four board jobs with one sentence each means job news repeats
  // verbatim for a whole campaign, which is the complaint R109 exists to
  // answer. Filed as R183 rather than papered over with a break that passes.
  //
  // R183 SHIPPED THE CONTENT AND THE RULE RETURNED AS BREAK 399, where it
  // goes red on demand. The id stays retired: 327's history is "could never
  // fire", and a number carrying that should not be quietly reissued.
  {
    // AN EVENT LOSES ITS EMITTER. The pool stays in news.json, fully
    // authored, and nothing in the game can ever say it — R57/R58's shape,
    // which this project has now found six times.
    n: 328, gate: SHARD_D, name: 'an authored event loses its emitter, so a whole pool becomes unsayable',
    file: 'campaign/campaign.js',
    anchor: "      } else emitNews(state, content, 'op_paid', { op: extra.name, funds: extra.funds });",
    to: '      } else pushNews(state, null);',
  },
  // R174 — one filler, one contract.
  {
    // A SEVENTH FILLER APPEARS. The case the gate is for: somebody needs to
    // fill a placeholder, writes the four-line replace rather than importing
    // one, and the tree quietly has two rules again.
    n: 338, gate: SHARD_B, name: 'a module grows its own placeholder filler again, and the tree has two rules',
    file: 'splice/vault.js',
    anchor: 'export function vaultRoom(state, content) {',
    to: "const R174_BREAK = (t, v) => t.replace(/\\{(\\w+)\\}/g, (w, k) => (v[k] != null ? String(v[k]) : w));\nexport function vaultRoom(state, content) {",
  },
  {
    // THE CONTRACT BREAKS THE WAY card.js BROKE IT: an unfilled placeholder is
    // deleted instead of left alone. This is the defect R174 found shipped, on
    // the one artefact handed to another person.
    n: 339, gate: SHARD_B, name: 'the one filler goes back to deleting a placeholder nobody filled',
    file: 'util/text.js',
    anchor: '    vars[key] != null ? String(vars[key]) : whole',
    to: "    vars[key] != null ? String(vars[key]) : ''",
  },
  {
    // AND THE OTHER WAY IT BROKE: a null counted as a value, so "null" printed
    // into a battle line. A truthiness check would also swallow a zero, which
    // is why the contract tests both.
    n: 340, gate: SHARD_B, name: 'a null counts as a value again, and the word null prints into a sentence',
    file: 'util/text.js',
    anchor: '    vars[key] != null ? String(vars[key]) : whole',
    to: '    vars[key] !== undefined ? String(vars[key]) : whole',
  },

  // R177's break 347 lived here, and R186 retired it on the instruction R180
  // left beside the census in tools/reach.js. It deleted the walker's
  // pair-sort toward lines that still owe the Dex a variant. The census it
  // relied on read 11 lines missed at R177, 6 at R116 and 3 at R180. On
  // R186's tree it reads 0 of 78, clean AND broken: every seed reaches all six
  // lines either way, and part reach moves by noise (256.0 against 255.2). The
  // game grew out of needing the steer. The Incubator door itself is held by
  // 159, 162 and 193, all caught, so re-aiming this break would only duplicate
  // them.

  // R114 — a save is untrusted input.
  {
    // A SIXTH ESCAPER APPEARS. The case the count is for: somebody needs to
    // print a name, writes the four-line replace rather than importing one,
    // and the tree quietly has two rules about markup again — which is how it
    // came to have five, one of them missing two characters.
    n: 341, gate: SHARD_B, name: 'a module grows its own escaper again, and the tree has two rules about markup',
    file: 'splice/vault.js',
    anchor: 'export function vaultRoom(state, content) {',
    to: "const R114_BREAK = (v) => String(v ?? '').replace(/[&<>\"']/g, (c) => c);\nexport function vaultRoom(state, content) {",
  },
  {
    // AND IT GOES BACK TO BEING THE WEAK ONE. This is the exact rule the copy
    // with 26 callers had: the ampersand, the less-than and the double quote,
    // and neither `>` nor `'`. A name in a single-quoted attribute walks
    // straight out of it.
    n: 342, gate: SHARD_B, name: "the one escaper stops escaping the apostrophe, and a name leaves its attribute",
    file: 'util/text.js',
    anchor: "  return String(v ?? '').replace(/[&<>\"']/g, (c) => ENTITY[c]);",
    to: "  return String(v ?? '').replace(/[&<\"]/g, (c) => ENTITY[c]);",
  },
  {
    n: 343, gate: SHARD_B, name: 'the import stops cleaning what it was handed, and a tag reaches the screen',
    file: 'save/slots.js',
    anchor: '    const { save: sound, repairs } = cleanSave(structuredClone(save));',
    to: '    const sound = structuredClone(save); const repairs = [];',
  },
  {
    // THE SHAPE WALK STOPS RECURSING. Top level only — which LOOKS thorough,
    // passes `chimeras: "hello"`, and leaves `campaign.captives: null` to take
    // out the War Room. The fuzz found this one inside a minute the first time
    // it ran, and it is the reason the fuzz is in the gate rather than a list
    // of cases somebody thought of.
    n: 344, gate: SHARD_B, name: 'the shape repair stops recursing, and a broken field one level in still loads',
    file: 'save/schema.js',
    anchor: '        } else shape(wantAt, gotAt, at);',
    to: '        }',
  },
  {
    // AND THE THIRD ENTRANCE FORGETS AGAIN. `renameSlot` is where the rule was
    // missing for the whole of its life; this is that state restored.
    n: 345, gate: SHARD_B, name: 'renaming a lab stops narrowing what was typed, the way it never did',
    file: 'save/slots.js',
    anchor: '  entry.name = safeText(name, 40) || null;',
    to: '  entry.name = name.trim().slice(0, 40) || null;',
  },

  {
    // THE REPAIR EATS THE SPLICE-DEX. This is the defect R114 shipped into its
    // own working tree and did not catch for two hours: pruning keyed by bare
    // key name rather than by path, so `dex.parts` (part ids, strings) was
    // pruned alongside `inventory.parts` (objects) and 227 entries went on
    // every load. The Ascent rule broken by the thing written to keep it.
    n: 346, gate: SHARD_B, name: 'the shape repair prunes by key name again, and a played save loses its Dex',
    file: 'save/schema.js',
    anchor: "        if (!ROW_LISTS.has(at)) continue;",
    to: "        if (![...ROW_LISTS].some((r) => r.split('.').pop() === key)) continue;",
  },

  // R111 — a creature's voice, and the three controls over it.
  {
    // THE VOICE STOPS READING THE ANATOMY. Every head takes the fallback, so
    // every creature in the county has the same waveform — which is the state
    // the milestone was filed about, one property at a time. The axis floors
    // are the only clause that sees it: the specs still DIFFER (the pitch
    // jitter alone guarantees that), so "two genomes, two specs" stays green
    // while three of the four mappings stand still.
    n: 348, gate: SHARD_D, name: 'every head takes the fallback waveform, and the county speaks with one voice',
    file: 'audio/voice.js',
    anchor: '    const wave = tuning.wave?.byTag?.[tag];',
    to: '    const wave = null;',
  },
  {
    // AND THE VOICE DRIFTS. Seeded on the call rather than on the creature,
    // which is the difference between a voice and a noise: a player cannot
    // learn which chimera just went down if it sounds different each time.
    n: 349, gate: SHARD_D, name: 'the pitch jitter stops being seeded on the creature, and a voice drifts',
    file: 'audio/voice.js',
    anchor: "  const jitter = spread ? ((hashString(String(chimera?.id ?? '')) % (spread * 2)) - spread) : 0;",
    to: '  const jitter = spread ? Math.floor(Math.random() * spread) : 0;',
  },
  {
    // THE FILE IS LOADED AND NEVER INDEXED. This is the defect R111 shipped
    // into its own working tree: `data/voice.json` reached the browser, the
    // whitelist in `indexContent` did not name it, `content.voice` came back
    // undefined and every spec ran on the module's own fallbacks. It LOOKED
    // like it worked. R41's training.json, a third time — R102 and R108 each
    // paid it once between.
    n: 350, gate: SHARD_D, name: 'the voice tuning is fetched and never indexed, so every spec runs on fallbacks',
    file: 'render/renderer.js',
    anchor: '    voice: raw.voice ?? {},',
    to: '',
  },
  {
    // THE VOLUME CONTROL CONTROLS NOTHING. The panel renders it, the save
    // keeps it, the synth ignores it — a setting that is a decoration, which
    // is exactly what a source-only gate would have certified.
    n: 351, gate: SHARD_D, name: 'the volume setting stops reaching the synth, and every stinger is full volume',
    file: 'audio/sfx.js',
    anchor: '  const level = Math.max(0.0001, vol * volume);',
    to: '  const level = vol;',
  },
  {
    // THE BED RESTARTS ON EVERY NAVIGATION. `showScreen` calls this on each
    // one, so the room tone becomes a click track: the failure is not silence,
    // it is a noise that arrives every time you touch the tab bar.
    n: 352, gate: SHARD_D, name: 'the room tone restarts on every navigation instead of holding',
    file: 'audio/room.js',
    anchor: '  if (bed?.screen === screen) return;',
    to: '  if (false) return;',
  },
  {
    // THE MUTE STOPS REACHING THE PHONE. One switch for the whole device is
    // the rule; this is the version where a muted game still buzzes in a
    // meeting, which is the worst failure in this milestone.
    n: 353, gate: SHARD_D, name: 'a muted game still shakes the phone on every KO',
    file: 'audio/sfx.js',
    anchor: '  if (!haptics || muted) return Promise.resolve();',
    to: '  if (!haptics) return;',
  },
  {
    // A PREFERENCE THAT DOES NOT SURVIVE THE RELOAD. The toggle works, the
    // synth is told, and the next time the player opens the game it is back
    // where it started — which is the shape of bug nobody files because it
    // looks like they misremembered.
    n: 354, gate: SHARD_D, name: 'the haptics toggle stops writing the save, and the setting forgets itself',
    file: 'save/settings-ui.js',
    anchor: '      state.settings.haptics = state.settings.haptics === false;\n      sfx.applyAudioSettings(state.settings);\n      ctx.save();',
    to: '      state.settings.haptics = state.settings.haptics === false;\n      sfx.applyAudioSettings(state.settings);',
  },
  {
    // AND THE SHELL GOES BACK TO APPLYING THE MUTE AND NOTHING ELSE. This is
    // the pre-R111 shell exactly: three of the four preferences are honoured
    // only once the panel has been opened, so a player who set the volume
    // last session gets full volume until they go looking for the gear.
    //
    // R176 — RE-AIMED, NOT RETIRED. The call moved from the boot into the
    // loader when the synth stopped being compiled on boot; the defect it
    // describes is unchanged and so is the rule. Break 407 beside it takes
    // the call away entirely; this one keeps a call and narrows it, which is
    // the version that actually shipped once.
    n: 355, gate: SHARD_D, name: 'the shell applies the mute and forgets the other three preferences',
    file: 'main.js',
    anchor: '  .then((m) => { m.applyAudioSettings(state.settings); return m; })',
    to: '  .then((m) => { m.setMuted(state.settings.muted); return m; })',
  },
  {
    // AND THE ORGAN GOES BACK TO BEING TWO ORGANS. This is not a hypothetical:
    // it is the code R111 shipped in its own first draft. Every organ in the
    // game declares a `phys.draw` of 2 or 3 — 42 of 43 declare 3 — so reading
    // the draw alone gives the entire catalogue TWO modulation depths, under a
    // comment promising that every organ differs. The whole-spec count sees
    // nothing (the pitch jitter keeps 41 of 41 distinct); only the mod floor
    // does.
    n: 356, gate: SHARD_D, name: 'the organ wobble goes back to reading the draw alone, and 43 organs become 2',
    file: 'audio/voice.js',
    anchor: '  const within = ((hashString(organ) % 1000) / 1000 - 0.5) * spread;',
    to: '  const within = 0;',
  },
  {
    // AND THE SLOTS STOP BEING EMPTIED. `state.battle = []` is TRUTHY, so the
    // War Room's `if (state.battle)` hands it to `renderArena`, which reads
    // `.player.team` off nothing and takes the screen down. R114's fuzz never
    // reached this field until R111 added three keys to `settings` and shifted
    // its path sampling — which is the argument for a fuzz over a list of
    // cases somebody thought of, made by the fuzz itself.
    n: 357, gate: SHARD_B, name: 'a save whose battle slot holds a list still reaches the arena renderer',
    file: 'save/schema.js',
    anchor: "      if (OBJECT_SLOTS.has(at)) {",
    to: "      if (false) {",
  },
  // R178 — the release gate joins a tier.
  {
    // ONE APOSTROPHE, AND THE APP CACHES NOTHING. This is not a hypothetical:
    // it is the tree R111 ran `npm test` on, green, one command before
    // `tools/release.js` said otherwise by hand. `SHELL` is read by pairing
    // quotes, so "budget's" opens a string that swallows the rest of the line
    // and shifts every pair after it — 38 fragments that are not files, and
    // `install()` is all-or-nothing.
    //
    // Aimed at CACHEBUMP because that is the gate this milestone put into
    // BASELINE; before R178 this break had nothing in either tier to fire.
    n: 358, gate: CACHEBUMP, name: 'an apostrophe in an sw.js comment empties the precache and no tier notices',
    file: 'sw.js',
    anchor: '  // R111: the room tone and the haptics. Lazy, to keep them out of the eager',
    to: "  // R111: the room tone and the haptics, lazy for the eager budget's sake",
  },
  {
    // THE SAME APOSTROPHE, AIMED AT THE OTHER TIER. 358 proves `--baseline`
    // sees it; this proves `npm test` does, because R178's point is that the
    // defect must not be able to cross EITHER of them.
    //
    // The first draft of this break disabled smoke's new rule instead — and
    // went MISSED, correctly: blinding a gate on a clean tree makes nothing
    // red. A break has to introduce the defect, not remove the rule that
    // catches it. Note what this one demonstrates in passing: the weaker
    // regex two lines above the new assertion stays GREEN on this tree, so
    // the red comes entirely from reading the shell as shipped.
    n: 359, gate: SHARD_A, name: 'an apostrophe in an sw.js comment, and the suite is the tier that has to see it',
    file: 'sw.js',
    anchor: '  // R111: the room tone and the haptics. Lazy, to keep them out of the eager',
    to: "  // R111: the room tone and the haptics, lazy for the budget's sake",
  },

  // R112 — the Yearbook, and the rule that a counter is either on it or gone.
  {
    // A COUNTER LOSES ITS ROW. `inventory.tokenCount` stops being covered by
    // any `from` in the data file — it is still written on every extraction
    // and now appears on no screen, which is the exact state the milestone
    // found twenty counters in.
    n: 360, gate: SHARD_A, name: 'a counter drops off the Yearbook and nothing notices',
    file: 'data/yearbook.json',
    anchor: '"from": "inventory.tokenCount",',
    to: '"from": "inventory.vials",',
  },
  {
    // `spliceCount` COMES BACK. A new counter declared in `newGameState` with
    // no row is the general case; this is the specific one the milestone
    // retired, and it must not be re-addable in silence.
    n: 361, gate: SHARD_A, name: 'a counter is added to the save with no Yearbook row',
    file: 'save/save.js',
    anchor: '    createdAt: Date.now(),',
    to: '    createdAt: Date.now(),\n    spliceCount: 0,',
  },
  {
    // THE CEREMONY STOPS OFFERING A NAME, which is the pre-R112 game: the
    // only route to a name is War Room -> Labs -> the dossier, and the walk
    // has to be the thing that says so.
    n: 362, gate: SHARD_A, name: 'the first decant stops offering a name on the door',
    file: 'splice/theater-ui.js',
    anchor: '    const named = !!state.profile?.named;',
    to: '    const named = true;',
  },
  {
    // THE RUN BOUNDARY STOPS READING THE YEARBOOK. R102's confirmation goes
    // back to five list lengths — what is on the shelf rather than what the
    // run was — while every caller still passes `content` and looks correct.
    n: 363, gate: SHARD_A, name: 'the relocation confirmation stops reading the Yearbook',
    file: 'save/slots.js',
    anchor: '    lifetime: content ? yearbookHeadline(state, content, now) : [],',
    to: '    lifetime: [],',
  },
  {
    // A `derive` NAMES SOMETHING THE MODULE DOES NOT OFFER. One letter in a
    // data file, and the row reads a dash forever with nothing to say it is
    // broken — the failure mode a data-driven screen is most exposed to.
    n: 364, gate: SHARD_A, name: 'a Yearbook row derives a statistic nobody wrote',
    file: 'data/yearbook.json',
    anchor: '"derive": "longestServing",',
    to: '"derive": "longestServed",',
  },
  {
    // THE TAB LEAVES THE BAR. The rows still exist and the module still
    // works; there is simply no way to reach any of it, which is R45's
    // lesson and the whole shape of what R112 was fixing.
    n: 365, gate: SHARD_A, name: 'the Yearbook tab disappears from the Dex bar',
    file: 'splice/dex-ui.js',
    anchor: "  { id: 'yearbook', icon: 'book', label: 'Yearbook' },",
    to: '',
  },

  // R113 — the type floor, the cutout, 150% text, and both save shapes.
  {
    // A SENTENCE GOES BACK UNDER THE FLOOR, at exactly the size it was before
    // this milestone: `.fine-print` shipped at 0.72rem and printed 191 times
    // on the fresh screens alone. The browser gate judges the COMPUTED size on
    // the element that owns the words, so this is the half of the rule that
    // sees a nested shrink the stylesheet cannot be read for.
    n: 366, gate: A11Y, name: 'the fine print goes back under the 12px type floor',
    file: 'style.css',
    anchor: '.fine-print { font-size: 0.75rem; color: var(--muted); }',
    to: '.fine-print { font-size: 0.72rem; color: var(--muted); }',
  },
  {
    // …AND THE SAME DEFECT SOMEWHERE THE WALK CANNOT GO. The boot failure card
    // is drawn when the game cannot start, which is not a state any browser
    // gate reaches on a working tree — so a 10.9px rule in it is invisible to
    // the pass above and still a 10.9px sentence to whoever is reading it at
    // the worst possible moment. The stylesheet read is what catches this one.
    n: 367, gate: SHARD_A, name: 'a screen the walk never renders drops under the type floor',
    file: 'style.css',
    anchor: '.boot-fail-card code { background: var(--well); padding: 1px 4px; border-radius: 4px; font-size: 0.82rem; }',
    to: '.boot-fail-card code { background: var(--well); padding: 1px 4px; border-radius: 4px; font-size: 0.68rem; }',
  },
  {
    // THE INSETS GO INERT, and every one of them still reads as correct. This
    // is R73's `var(--bg)` one level up: `env(safe-area-inset-*)` resolves to
    // zero on every device unless the viewport says `viewport-fit=cover`, and
    // the browser gate SIMULATES the notch through `--safe-top`, so it passes
    // either way. Only the shell can be asked this question.
    n: 368, gate: SHARD_A, name: 'the viewport stops covering the cutout, and fourteen insets resolve to zero',
    file: 'index.html',
    anchor: '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    to: '<meta name="viewport" content="width=device-width, initial-scale=1">',
  },
  {
    // AND THE OTHER DIRECTION: an inset written bare, so the browser gate can
    // no longer simulate it. Aimed at the in-battle FOOTER, which the cutout
    // probe does not measure — the probe asks about the header, because that
    // is where a notch is. A bare `env()` there is a rule with no test.
    n: 369, gate: SHARD_A, name: 'an inset is written bare, where no browser gate can simulate it',
    file: 'style.css',
    anchor: 'calc(2px + var(--safe-bottom, env(safe-area-inset-bottom)))',
    to: 'calc(2px + env(safe-area-inset-bottom))',
  },
  {
    // THE HEADER STOPS CLEARING THE NOTCH. The rule is still in the file on
    // three edges and the shell still says `viewport-fit=cover`, so every
    // static read of this tree passes; what is gone is the one inset a phone
    // with a cutout actually needs, and only a browser with a simulated notch
    // in it can say so.
    n: 370, gate: A11Y, name: 'the header stops padding for the cutout it paints under',
    file: 'style.css',
    anchor: 'padding: calc(14px + var(--safe-top, env(safe-area-inset-top))) calc(12px + var(--safe-right, env(safe-area-inset-right))) 4px',
    to: 'padding: 14px calc(12px + var(--safe-right, env(safe-area-inset-right))) 4px',
  },
  {
    // THE ARENA STOPS FITTING, which is what the type floor cost. Raising 78
    // declarations to 12px broke exactly one screen — the one that does not
    // scroll — and the fix was this query, not the three other things that
    // were tried first. Put 280 back and the battle column overruns again.
    n: 371, gate: A11Y, name: 'the stage takes its 20px back and the arena stops fitting the phone',
    file: 'style.css',
    anchor: '@media (min-height: 760px) { .stage { min-height: 260px; } .mv { min-height: 54px; } }',
    to: '@media (min-height: 760px) { .stage { min-height: 280px; } .mv { min-height: 54px; } }',
  },
  {
    // A READER TURNS THE TEXT UP AND A ROW WALKS OFF THE CARD. `.encounter` is
    // a flex row and a HELD node puts three children in it; the Spar button is
    // `flex: 0 0 auto`, so without the wrap the row ran 86px past its card at
    // 150%. It fits perfectly at 100%, which is why one reading at one size on
    // one screen reported this layout as clean.
    // R187 — MISSED in R180's rot check and caught in R186's, with nothing
    // about the rule changed: whether the day-180 walk left a held node whose
    // row overflows was the whole answer. It is now held by a11y's 1h2 pass,
    // which holds EVERY node in each of the three Spar states and reads 154px
    // on this break ("no-one fit") where the walk's lap reads 86. BLIND AGAIN
    // IF the Spar button grows a fourth state 1h2 does not build.
    n: 372, gate: A11Y, name: 'a held node row stops wrapping, and runs off the card at 150% text',
    file: 'style.css',
    anchor: '  flex-wrap: wrap;\n  justify-content: space-between;\n  align-items: center;\n  gap: 8px;\n  padding: 8px 9px;',
    to: '  justify-content: space-between;\n  align-items: center;\n  gap: 8px;\n  padding: 8px 9px;',
  },
  {
    // A COLOUR ONLY A NEW PLAYER EVER SEES. `.locked-tag` is printed by a
    // save with no territory taken, which the gate's mid-game fixture does not
    // have — so this one is caught by the FRESH pass or by nothing. 1.32:1.
    n: 373, gate: A11Y, name: 'a tag only a fresh save prints loses its contrast',
    file: 'style.css',
    anchor: '.locked-tag { background: var(--panel-2); color: var(--muted); border: 1px solid var(--line); }',
    to: '.locked-tag { background: var(--panel-2); color: var(--line); border: 1px solid var(--line); }',
  },
  {
    // AND ONE ONLY A LONG CAMPAIGN EVER SEES. An S-tier chimera is 180 days of
    // work; nothing shorter than that puts this badge on a screen. 1.15:1, and
    // caught by the DAY-180 pass or by nothing.
    n: 374, gate: A11Y, name: 'a badge only a day-180 save prints loses its contrast',
    file: 'style.css',
    anchor: '.tier-S { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }',
    to: '.tier-S { background: var(--accent); color: var(--text); border-color: var(--accent); }',
  },

  // R115 — the worker, and the merge that reads what the gates ran.
  {
    // A 502 BRICKS THE APP UNTIL THE NEXT RELEASE. The background revalidation
    // writes whatever comes back, so one proxy error page lands in the cache
    // under `index.html` and every cold open after it serves the error — with
    // no network needed to keep serving it. The cache-first read still works,
    // the offline open still works, and the app is dead.
    n: 375, gate: WORKER, name: 'a proxy error page is cached over the shell and the app never recovers',
    file: 'sw.js',
    anchor: '    if (response && response.ok) {\n      const copy = response.clone();\n      return caches.open(CACHE).then((cache) => cache.put(request, copy)).then(() => response);',
    to: '    if (response) {\n      const copy = response.clone();\n      return caches.open(CACHE).then((cache) => cache.put(request, copy)).then(() => response);',
  },
  {
    // THE REVALIDATION STOPS BEING CONDITIONAL. R100's whole argument for
    // checking after the paint rather than before it is that the check costs
    // one 304. Drop `no-cache` and it is a full download of every shell entry
    // on every visit, silently — the page still paints from cache, so nothing
    // a user or a screenshot can see says so.
    n: 376, gate: WORKER, name: 'the background check refetches the whole shell instead of asking if it changed',
    file: 'sw.js',
    anchor: "const revalidate = (request) => fetch(request, { cache: 'no-cache' })",
    to: 'const revalidate = (request) => fetch(request)',
  },
  {
    // THE OLD CACHES ARE NEVER SWEPT. Every `CACHE` bump leaves its
    // predecessor on disk forever, which on a phone is the app quietly growing
    // without limit — and nothing about the current release looks wrong.
    n: 377, gate: WORKER, name: 'activate stops evicting the caches it replaced, so every release leaks one',
    file: 'sw.js',
    anchor: 'Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))',
    to: 'Promise.all(keys.filter((k) => k === null).map((k) => caches.delete(k)))',
  },
  {
    // THE NEW WORKER WAITS FOR EVERY TAB TO CLOSE. Without `skipWaiting` a
    // release reaches a player who keeps the app open only when they finally
    // shut every copy of it — which, for a TWA on a phone, can be never.
    n: 378, gate: WORKER, name: 'a new build sits in waiting instead of taking over',
    file: 'sw.js',
    anchor: '.then(() => self.skipWaiting())',
    to: '.then(() => undefined)',
  },
  {
    // A POST GOES THROUGH THE CACHE. `caches.match` on a non-GET is a
    // guaranteed miss, so it falls to the network path — and then tries to
    // `cache.put` the response, which throws on any method but GET. The
    // failure is asynchronous and swallowed, so it shows up as nothing at all.
    n: 379, gate: WORKER, name: 'the worker stops passing non-GET requests straight through',
    file: 'sw.js',
    anchor: "  if (event.request.method !== 'GET') return;",
    to: "  if (event.request.method === 'NEVER') return;",
  },
  {
    // THE QUERY STAYS ON THE PATH — the defect this milestone shipped and then
    // found. tools/handlers.js imports each screen module as `…/ui.js?run=230`
    // so every surface renders fresh; keeping the query means `readSrc` misses
    // and the whole lane is discarded. It cost 307 lines and eight functions
    // read as dead that run on every suite, and nothing about the gate's own
    // output looked wrong — it simply reported more work to do.
    n: 380, gate: COVSELF, name: 'a cache-busted import is filed under a path no file has, and its lane is dropped',
    file: 'tools/coverage.js',
    anchor: "const rel = r.url.slice(`file://${root}/`.length).replace(/[?#].*$/, '');",
    to: 'const rel = r.url.slice(`file://${root}/`.length);',
  },
  {
    // AN UNRUN BRANCH READS AS RUN. V8 says "this block did not execute" with
    // a zero-count range INSIDE a called function's range, so within one
    // process the inner range has to overwrite its parent. Take the max here
    // instead and every function that was called anywhere reads as fully
    // covered: the first draft of this merge reported the tree 0.0% dead.
    n: 381, gate: COVSELF, name: 'a dead branch inside a live function is painted with its parent count',
    file: 'tools/coverage.js',
    anchor: 'for (let i = rg.startOffset; i < rg.endOffset && i < local.length; i++) local[i] = rg.count;',
    to: 'for (let i = rg.startOffset; i < rg.endOffset && i < local.length; i++) local[i] = Math.max(local[i], rg.count);',
  },
  {
    // AND ACROSS PROCESSES THE LAST LANE WINS. Thirty-seven processes report on
    // the same files; a lane that imported a module without calling into it
    // would erase the lane that exercised it, and which one that is depends on
    // directory order. Green or red by filesystem enumeration is not a gate.
    n: 382, gate: COVSELF, name: 'a lane that skipped a function erases the lane that ran it',
    file: 'tools/coverage.js',
    anchor: 'arr[i] = arr[i] === -1 ? local[i] : Math.max(arr[i], local[i]);',
    to: 'arr[i] = local[i];',
  },

  // R116 — the board has a pace, a mix, and a half that is not a tap.
  {
    // THE BUCKET STOPS REFUSING. Every other rule about the board still
    // holds — jobs cost money, lanes are limited, heat still climbs — and
    // the launch rate goes straight back to the metronome this milestone
    // was written to break: seven independent cooldowns summing to 10.05 a
    // day that no constant can move.
    //
    // AIMED AT THE ARITHMETIC, AND TWO EARLIER DRAFTS WERE NOT. Patching
    // either REFUSAL comes back MISSED, and the reason is worth keeping: the
    // bucket is guarded twice — `runnableOps` returns an empty list and
    // `startOperation` refuses by name — so removing one leaves the other
    // holding the pace. That redundancy is deliberate (a player can tap a
    // board rendered before the bucket emptied) but it means no single
    // refusal is load-bearing, and a break has to patch the line that
    // actually decides the number. `outstanding` is that line: it is how
    // many refills are still owed, and without it the bucket reads full
    // forever however recently it was spent.
    n: 383, gate: SHARD_D, name: 'the bucket stops reading its own refill clock, and the board is always full',
    file: 'campaign/operations.js',
    anchor: '  const outstanding = Math.max(0, Math.ceil((refillAt - now) / regen));',
    to: '  const outstanding = 0;',
  },
  {
    // …AND THE SAME DEFECT FROM THE OTHER END. The check stays, the spend
    // does not, so the bucket reads full forever. A pace that is enforced
    // but never paid for is not a pace, and a gate that only watched the
    // refusal would call this clean.
    n: 384, gate: SHARD_D, name: 'a launch never spends the lead it used, so the bucket never empties',
    file: 'campaign/operations.js',
    anchor: '  state.campaign.boardRefillAt = Math.max(refillAt, now) + regen;',
    to: '  state.campaign.boardRefillAt = Math.max(refillAt, now);',
  },
  {
    // THE WALKER STOPS CARRYING ANYBODY — the defect this whole milestone
    // was found by. One argument. `opOdds` blocks a crew-required job with
    // no rider, so the four jobs that read a chimera's tags and class go
    // back to running ZERO times in 180 days, and the harness goes back to
    // reporting that as a fact about the game.
    n: 385, gate: SHARD_D, name: 'the walker passes null as the crew again, and the crewed half of the board dies',
    file: 'tools/sim.js',
    anchor: 'const started = op && startOperation(state, op.id, best.rider?.id ?? null, content, now);',
    to: 'const started = op && startOperation(state, op.id, null, content, now);',
  },
  {
    // CHARGES SET THE PACE; COOLDOWNS SET THE SPREAD. Take the per-job
    // cooldown away and the pace rule still passes — the bucket is doing
    // its job — while the single best-value job takes every charge the
    // board has. That is the metronome again wearing a different hat, and
    // only the MIX rule sees it.
    n: 386, gate: SHARD_D, name: 'a job never goes quiet, so the best one takes the whole board',
    file: 'campaign/operations.js',
    anchor: "  state.campaign.opCooldowns[opId] = endedAt + Math.round((op?.cooldownHours ?? 6) * HOUR);",
    to: '  state.campaign.opCooldowns[opId] = endedAt;',
  },
  {
    // THE RETAINER PAYS NOTHING. A4's floor is that a player with no
    // territory, no money and no creatures still has a way back, and since
    // this milestone that way is a standing arrangement rather than a job
    // they can tap. Money in, or the floor is a button that does nothing.
    n: 387, gate: SHARD_B, name: 'a standing arrangement stops paying, and a lab with nothing has no way back',
    file: 'campaign/operations.js',
    anchor: '  if (paid > 0) state.funds = (state.funds ?? 0) + paid;',
    to: '  if (paid > 0) state.funds = (state.funds ?? 0);',
  },
  {
    // AND THE LEDGER LINE STOPS REACHING THE WIRE. This one is here because
    // it is the coupling the milestone did not predict: taking three jobs
    // off the board silenced their headline pools, and the county's voice
    // fell from 411 distinct phrasings to 381, under R109's floor of 400.
    // The daily line is what pays that back, so a gate that watched only
    // the board would never know the wire depended on it.
    // R187 — MISSED in R180's rot check and again in R186's full battery:
    // the county says 446 phrasings with the line and 423 without it, and the
    // floor is 400. It is now held where the line is written — a week on a
    // retainer files eight, a second visit the same day none — in the
    // Operations block, which runs in every shard. BLIND AGAIN IF a contract
    // starts filing its line by some route other than `settleContracts`.
    n: 388, gate: SHARD_D, name: 'the retainer stops filing its daily line, and the county runs out of things to say',
    file: 'campaign/operations.js',
    anchor: '    if (headline) news.push(headline);\n  }\n  c.saidOn = day;',
    to: '    if (headline) news.length = news.length;\n  }\n  c.saidOn = day;',
  },
  {
    // THE ONBOARDING WALKS THE RIVAL MAP RAW AGAIN — the line R116 found by
    // accident. `campaign.rivals` is untrusted input, and `Object.values` of
    // it hands the predicate whatever is in the save: a null entry and the
    // Ranch stops rendering. This is not a new rule, it is R114's fuzz doing
    // its job, and it only fired because R116 added a key to `campaign` and
    // moved the seeded sample onto `campaign.rivals.mantissa`. The break is
    // here so the next shift in that sample is not what re-finds it: every
    // other reader in the game goes through `rivalRecord`, which defaults a
    // missing or junk record, and this one now does too.
    // R187 — caught in R186's battery by a lottery with 12% odds: the fuzz's
    // 200 draws over 560 paths land a `null` on a rival record with p = 6.4e-4
    // each. It is now held by smoke's 6d, which junks every record map a
    // day-180 save carries, at a real key and at one nobody names, and fails
    // on this break with the fuzz switched off. BLIND AGAIN IF a save stops
    // carrying its records as an id-keyed map (467 holds the detector).
    n: 389, gate: SHARD_B, name: 'the guide reads the rival map raw, and one junk record stops the Ranch rendering',
    file: 'ranch/onboarding.js',
    anchor: '  rivalBeaten: (state, content) => rivalStatus(state, content).some((r) => r.record.defeats > 0),',
    to: '  rivalBeaten: (state) => Object.values(state.campaign.rivals ?? {}).some((r) => (r.defeats ?? 0) > 0),',
  },

  // R175 — the stable says how big it is and what makes it bigger.
  {
    // THE MAIN SCREEN STOPS SAYING HOW FULL THE STABLE IS, which is the state
    // the milestone was reported from: the only capacity readout on the Ranch
    // was `Pens`, and that is the ANIMAL herd.
    n: 335, gate: SHARD_B, name: 'the Ranch stops saying how full the stable is, leaving only the animal pens',
    file: 'ranch/ui.js',
    anchor: '<div><span class="econ-label">Stable</span>',
    to: '<div hidden><span class="econ-lbl">Stable</span>',
  },
  {
    // THE BUTTON GOES BACK TO NOT SAYING WHAT THE PRESS BUYS. R154 made a pen
    // house a chimera and the control never mentioned it, which is why the
    // purchase read as doing nothing to the roster.
    n: 336, gate: SHARD_B, name: 'the pen button stops saying when the next press buys a chimera stall',
    file: 'ranch/ui.js',
    anchor: "${stallNext ? ` · ${stallChip}` : ''}",
    to: '',
  },
  {
    // A REFUSAL NAMES ONE DOOR AGAIN. Exactly R154's leftover: the vat told a
    // player at capacity to expand a Theater they may already have bought.
    n: 337, gate: SHARD_B, name: 'the chaos vat goes back to naming only the Theater when the stable is full',
    file: 'splice/chaos.js',
    anchor: "${fill(content.copy?.stable?.levers, stallRule(content))}",
    to: 'Expand the Surgery Theater.',
  },

  // R110 — copy is data. One break per clause of the new rule.
  {
    // A NEW SCREEN IS BORN WITH PROSE IN IT. The case that matters most: every
    // one of the 59 entries in the ledger was once somebody adding "just one
    // sentence" to a module, and nothing ever said no.
    n: 330, gate: SCOPE, name: 'a module with no copy budget grows a sentence, and nothing says no',
    file: 'ui/tabs.js',
    anchor: 'export function bindSubtabs(root, attr, onPick) {',
    to: "const R110_BREAK = 'The county has been advised to carry on normally.';\nexport function bindSubtabs(root, attr, onPick) {",
  },
  {
    // AND THE LEDGER DRIFTS. Exactness is the property: "at most" lets prose
    // accumulate up to the number, and a budget nobody has to re-derive is the
    // shape of R157's worn floor, which stopped moving with the statistic it
    // guarded and missed the break it was written for.
    n: 331, gate: SCOPE, name: 'prose goes back into a budgeted module, and the ledger does not notice',
    file: 'splice/vault.js',
    anchor: 'export function vaultRoom(state, content) {',
    to: "const R110_BREAK2 = 'one more sentence nobody declared anywhere';\nexport function vaultRoom(state, content) {",
  },
  {
    // COPY NOBODY CAN REACH. R57/R58's shape, which this project has now found
    // seven times — most recently in R109's own content, one commit old.
    n: 332, gate: SHARD_D, name: 'a sentence is authored into data/copy.json that no module ever asks for',
    file: 'data/copy.json',
    anchor: '"awakened": "{name} is rudely awakened.",',
    to: '"awakened": "{name} is rudely awakened.",\n    "unreachable": "Nobody will ever read this sentence.",',
  },
  {
    // AND THE OTHER DIRECTION: a reader asking for copy nobody wrote. `copy`
    // returns null, the event carries no text, and the fight goes quiet at the
    // moment it should be loudest.
    n: 333, gate: SHARD_D, name: 'the engine asks for a copy id nobody wrote, and the beat goes silent',
    file: 'battle/engine.js',
    anchor: "copy(content, 'battle.retreat')",
    to: "copy(content, 'battle.retreat_typo')",
  },
  {
    // THE TONE GATE READS NOTHING AND REPORTS CLEAN. This is the defect R110
    // found in the gate itself: it carried its own comment stripper and its own
    // string regex, so what it actually read was unknown. The coverage floor is
    // what makes "zero death language" mean the tree rather than a fraction.
    n: 334, gate: FACILITY, name: 'the tone gate stops reading the modules and still says zero death language',
    file: 'tools/smoke.js',
    anchor: '      for (const { text: lit } of stringLiterals(text)) {',
    to: '      for (const { text: lit } of []) {',
  },
  {
    // A POOL'S PATH STOPS RESOLVING. `voice-pools.json` is keyed by the path
    // into the indexed content, so a typo is not an error — the merge simply
    // skips it and twenty-seven authored phrasings are never said by anything.
    // That is R41's training.json bug in a new file: content added, fetched,
    // and silently dropped. The section-reach gate has to see it.
    n: 329, gate: SHARD_D, name: 'a pool is keyed to a path that does not exist, and its phrasings are silently dropped',
    file: 'data/voice-pools.json',
    anchor: '"news.spar_done.lines": [',
    to: '"news.spar_done.linez": [',
  },

  // R171 — the two halves of the entry's Done-when, one break each.
  {
    // FIFTEEN KILOBYTES OF COMMENTS, which is the number the entry names. The
    // padding is built rather than typed: a literal would put 15 KB of filler
    // in this file to prove that 15 KB of filler is catchable, which is the
    // joke writing itself. `PROSE_CAP` has 10.3 KB of headroom, so this clears
    // it by half again and no more — a break that overshoots by an order of
    // magnitude proves the gate fires, not that it fires at the right place.
    n: 309, gate: SHARD_D, name: 'fifteen kilobytes of comments ride into the boot graph and no budget notices',
    file: 'campaign/map.js',
    anchor: 'export function threatGen(state, content) {',
    to: `${'// R171 break: a paragraph nobody asked for, two hundred and thirty times.\n'.repeat(230)}`
      + 'export function threatGen(state, content) {',
  },
  {
    // AND THE OTHER HALF: KB_CAP still does the job it was written for. Its own
    // note names this exact regression — "putting `import { renderWarRoomScreen }`
    // back at the top of main.js costs 8 modules at once" — and until R171 the
    // cap that would have caught it was also absorbing every paragraph anybody
    // wrote. Now it is code alone, so this is the only kind of thing that moves
    // it, and the break proves the split did not cost the original rule.
    n: 310, gate: SHARD_D, name: 'the War Room rejoins the eager graph, and the code budget sleeps through it',
    file: 'main.js',
    anchor: "  battle: lazy(() => import('./campaign/ui.js'), 'renderWarRoomScreen'),",
    to: "  battle: { render: (await import('./campaign/ui.js')).renderWarRoomScreen },",
  },

  // R100 — the worker, the backup and the release discipline. Every one of
  // these aims at the behaviour that actually shipped for sixty milestones,
  // not at a defect invented for the occasion.
  {
    // THE DEFECT ITSELF, and it is the M7 service worker verbatim. Serve the
    // shell from the network first and a cached app waits on 85 round trips
    // for bytes already on the device: 2,431ms at +150ms of latency against
    // 12,155ms at +800ms, a slope of 9,725ms where cache-first reads 47ms.
    // Caught by the SLOPE, not the stopwatch — the absolute number moves with
    // the host and the ratio does not.
    n: 304, gate: OFFLINE, name: 'the worker asks the network first again, so a cached app waits on a slow one',
    file: 'sw.js',
    anchor: '      if (cached) {',
    to: '      if (false) {',
  },
  {
    // AND THE HALF THAT MAKES IT CACHE-FIRST RATHER THAN CACHE-ONLY. Drop the
    // background revalidation and the app is fast and permanently stale: it
    // would pass the slope rule and fail the players, which is why R122b's
    // deploy check in tools/boot.js is a separate rule and stays one.
    n: 305, gate: BOOT, name: 'the shell stops revalidating behind the response, so a cached app never updates',
    file: 'sw.js',
    anchor: '        event.waitUntil(revalidate(event.request));',
    to: '        void revalidate;',
  },
  {
    // A save is written to localStorage and nowhere else, which is where this
    // game was until R100. The gate clears localStorage the way iOS does and
    // finds an empty ranch on top of a campaign that still existed.
    n: 306, gate: DURABLE, name: 'the save stops being backed up, so seven days away costs the campaign',
    file: 'save/save.js',
    anchor: '  mirrorSave(key, raw);',
    to: '  void mirrorSave;',
  },
  {
    // THE HALF THAT IS EASY TO FORGET, and the gate found it live: the SAVE
    // comes back and the REGISTRY does not, so `activeSlotId` answers 1 and
    // every lab but the first is stranded. It read 0 bytes of a 2 MB payload
    // by opening the empty slot the missing registry pointed at.
    n: 307, gate: DURABLE, name: 'the slot registry is not restored, so every lab but the first is stranded',
    file: 'save/save.js',
    anchor: '      if (raw) storage.setItem(SLOTS_KEY, raw);',
    to: '      if (false) storage.setItem(SLOTS_KEY, raw);',
  },
  {
    // THE MISTAKE ITSELF: a precached file is edited and nobody bumps CACHE.
    // Under network-first that cost ten minutes; under cache-first the browser
    // that already has the app never asks again, so it is permanent.
    //
    // The first version of this break edited `tools/release.js` to make its
    // own comparison trivially true, and went MISSED — correctly, and it was
    // a badly written break rather than a finding. NO GATE CATCHES ITS OWN
    // DISABLING; what a break has to simulate is the defect in the SHIPPED
    // code, which is this.
    n: 308, gate: CACHEBUMP, name: 'a precached file changes and CACHE does not, so a stale build ships forever',
    file: 'manifest.webmanifest',
    anchor: '  "orientation": "portrait",',
    to: '  "orientation": "any",',
  },

  // A THIRD BREAK WAS WRITTEN HERE AND DELETED, which is worth a sentence.
  // It dropped the nesting filter in the dead-byte walk, on the assumption
  // that counting every inner function on top of the outer one that
  // contains it would inflate the number past the budget. It MISSED: the
  // total goes 160.3 -> 163.8, because V8 reports no coverage at all for
  // functions nested inside a function that was never called, so the filter
  // only ever removes dead helpers sitting inside LIVE ones. 3.5 KB is
  // below what a budget sized for module-scale events can see, and
  // tightening the budget to make the break fire would be tuning the gate
  // to its own test. The filter stays because it is correct; it is not
  // claimed to be gated. See ROADMAP R169.
  {
    // The two boots are a union, not a sequence: `splice/extract.js` runs
    // ten of its fourteen functions drawing a herd and none at all for a
    // player who has none yet, so a function live in EITHER is live. Take
    // the merge away and the fresh boot's idle half is counted as dead.
    n: 299, gate: BOOT, name: 'the second first paint stops counting, so a module that only runs for a player with a herd reads dead',
    file: 'tools/boot.js',
    anchor: "          mine.set(key, { start: at.startOffset, end: at.endOffset, ran: (mine.get(key)?.ran ?? false) || lit });",
    to: "          mine.set(key, { start: at.startOffset, end: at.endOffset, ran: lit });",
  },

  // R96 — a creature that shows what it is. Three breaks, one per rule the
  // milestone added: the posture data that makes two temperaments two
  // animals, the mark that puts a scar ON the creature rather than in the
  // caption beside it, and the off switch that stops it breathing when the
  // player has asked their OS to stop moving things.
  {
    n: 284, gate: EMPIRE, name: 'temperament goes back to being a caption',
    // Aimed at the DATA, not the renderer: posture is content, and the way it
    // breaks in practice is a band nobody authored, not a function nobody
    // called.
    file: 'data/temperament.json',
    anchor: '"posture": {', to: '"postureRetired": {',
  },
  {
    n: 285, gate: EMPIRE, name: 'a scar is authored with no mark to draw',
    // The exact defect this milestone shipped and its own gate caught: a
    // `mark` value with no geometry behind it draws nothing and says nothing.
    file: 'data/scars.json',
    anchor: '"id": "brine_grudge",\n      "mark": "patch",',
    to: '"id": "brine_grudge",',
  },
  {
    n: 286, gate: A11Y, name: 'the idle layer keeps breathing under reduced motion',
    file: 'style.css',
    anchor: '.sw-idle { animation: none; }',
    to: '/* .sw-idle { animation: none; } */',
  },

  // R93 — the late game has stakes. Four breaks: the tuning that makes a pack
  // a pack, the threshold that decides whether one ever forms, the
  // counter-bias that makes it the lab's answer rather than more bodies, and
  // the tally its size is keyed on. Each aims at a different way the hunt
  // could quietly go back to being a formality.
  {
    // The ceiling drops to one and every escapee is solo again — which is
    // exactly the shipped game before this milestone, at 99.0% won.
    n: 279, gate: EMPIRE, name: 'the pack is capped at one and the hunt is a formality again',
    file: 'data/breakout.json', anchor: '"maxSize": 3,', to: '"maxSize": 1,',
  },
  {
    // Packs shipped, tested, and never actually formed. R93's first draft
    // keyed on rival DEFEATS and failed exactly this way on two of six seeds:
    // defeats top out at 2-6 over a campaign and the threshold was 3.
    n: 280, gate: EMPIRE, name: 'the pack threshold is raised past what a campaign ever reaches',
    file: 'data/breakout.json', anchor: '"afterEscapes": 25,', to: '"afterEscapes": 9999,',
  },
  {
    // The extras stop carrying R27's dossier, so a pack is more bodies rather
    // than the lab's considered answer. The entry asked for the counter-bias
    // by name; this says it is still wired.
    n: 281, gate: EMPIRE, name: 'a pack stops answering your stable and is just more bodies',
    file: 'campaign/breakout.js',
    anchor: '      counter: dossier?.counterClass ?? null,',
    to: '      counter: null,',
  },
  {
    // The tally counts bodies again. It compounds — pairs to triples to
    // triples-everywhere in about thirty days — and measured 53.2% won with a
    // third more hunts, because a lost hunt leaves the pack on the board to be
    // fought again. Aimed at the direction the defect goes, not only at its
    // absence.
    n: 282, gate: EMPIRE, name: 'the escape tally counts bodies again and the escalation runs away',
    file: 'campaign/breakout.js',
    anchor: '  cam.escapesByLab[rivalId] = (cam.escapesByLab[rivalId] ?? 0) + 1;',
    to: '  cam.escapesByLab[rivalId] = (cam.escapesByLab[rivalId] ?? 0) + 3;',
  },
  // R166 — the queue. Four rules, four breaks. Each aims at a DIFFERENT way
  // the roadmap can lie about what is built, because the one that actually
  // happened (a sentence in §9.18 calling fifteen shipped entries queued)
  // would have been caught by exactly one of them.
  {
    // The R88 shape: an entry written twice — an audit line and its log line
    // — that disagree. R88 carried both answers for fifty-four sessions.
    n: 275, gate: ROADMAP, name: "an entry's two lines disagree about whether it shipped",
    file: 'ROADMAP.md',
    anchor: '- **R88 — Send them, instead of watching them.** ✅',
    to: '- **R88 — Send them, instead of watching them.**',
  },
  {
    // §9.0 is the queue a session reads. A tick added without the list being
    // told is the drift that makes it worth reading at all.
    // R116 — AND THIS BREAK MUST BE RE-AIMED THE DAY ITS TARGET SHIPS, which
    // is the trap R167 wrote up in 277 below and this one still walked into.
    // It pointed at R116 while R116 was queued. R116 shipping left the anchor
    // matching perfectly and the PATCH meaningless: appending a second tick to
    // an entry that is already, correctly, ticked and already gone from §9.0
    // leaves a consistent document, so the gate passed and the break went
    // MISSED in R116's own full battery.
    //
    // `--anchors` CANNOT catch this, which is the whole danger and the reason
    // this note is long: a stale anchor is loud, a stale MEANING behind a live
    // anchor is silent. 277 escaped it by patching the LIST instead of a named
    // entry; this rule cannot, because the failure it models is exactly "an
    // ENTRY says shipped while the queue still lists it", so it has to name
    // one.
    //
    // R188 — AND IT HAPPENED AGAIN. The line above said "whoever ships R181:
    // move this"; R181 shipped and nobody did, and R188's full battery read
    // 276 MISSED for the reason R116 already wrote down. It now aims at R184,
    // the longest-queued entry, and `--anchors` has learned to say so when an
    // append-style break's target already carries the append — so the next
    // milestone that ships R184 is told the day it ticks it.
    //
    // R184 shipped and was told before it ticked anything: re-aimed at R186.
    // R186 did the same before its own tick: re-aimed at R187, the queue's
    // head once R186 and the R191 it folded in have both left it. R187 did
    // it again before ticking itself: re-aimed at R189, the head after it.
    // R189 likewise, before its own tick: re-aimed at R190.
    n: 276, gate: ROADMAP, name: 'an entry is ticked shipped and the queue is not told',
    file: 'ROADMAP.md',
    anchor: "- **R190 — Doc Sutures is never the walker's vet.**",
    to: "- **R190 — Doc Sutures is never the walker's vet.** ✅",
  },
  {
    // The other direction: the count beside the list stops matching the list.
    // Typed numbers are exactly what R77 was filed for.
    //
    // R167 — this anchored on the literal '**19 entries queued.**' and went
    // stale the first time a milestone shipped, which is the one thing an
    // anchor may not do: --anchors caught it, but a break that needs editing
    // every session is a break that will one day be edited wrong. So it
    // patches the LIST instead, past a prefix no count can move, and breaks
    // the same rule both ways at once — the list is one longer than the
    // stated size, and R999 is not an entry §9 has.
    n: 277, gate: ROADMAP, name: 'the queue states a size the list does not have',
    file: 'ROADMAP.md', anchor: ' entries queued.**', to: ' entries queued.** R999,',
  },
  {
    // The defect itself: a paragraph somewhere else in the document calls a
    // shipped entry unshipped, and a session picks it up and builds it again.
    n: 278, gate: ROADMAP, name: 'a paragraph calls a shipped entry unshipped',
    file: 'ROADMAP.md',
    anchor: '**Read the queue before the findings.** The queue was long and nothing had',
    to: '**Read the queue before the findings.** R54 and R88 are unshipped. The queue was long and nothing had',
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
    // R100 — RE-ANCHORED, because the defect moved house rather than going
    // away. R122b's finding is that a plain `fetch` reads through the
    // BROWSER's HTTP cache, and Pages serves the shell with max-age=600, so a
    // stale copy gets written into a freshly-named cache where it outlives the
    // ten minutes. Under the old network-first worker that happened on the
    // fetch path, which is where this break used to point.
    //
    // ITS TRUE HOME UNDER CACHE-FIRST IS `revalidate`, AND THAT TOOK TWO
    // WRONG ANCHORS TO ESTABLISH. The obvious candidate was `install`, which
    // is how a bumped deploy is delivered — but pointed there the break went
    // MISSED twice, including after the gate's two legs were reordered so
    // install ran against an HTTP cache that still held the old file. The
    // measurement says what the reasoning did not: `cache: 'reload'` on
    // install is BELT AND BRACES. Whatever a stale install caches, the
    // background revalidation replaces on the next open, so the two paths
    // cannot be told apart from outside. It stays in `install` because it is
    // correct and free; it is simply not the thing a break can aim at.
    //
    // The revalidation IS load-bearing, and its freshness with it: read that
    // through the browser's HTTP cache and every correction is up to ten
    // minutes stale, which is R122b's finding verbatim at its new address.
    n: 112, gate: BOOT, name: 'the service worker reads through the HTTP cache again, so a deploy never reaches a phone that already has the app',
    file: 'sw.js',
    anchor: "const revalidate = (request) => fetch(request, { cache: 'no-cache' })",
    to: 'const revalidate = (request) => fetch(request)',
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
    // R179 — re-aimed. `!isInjured(c, now)` became `here(state, c, now)`, the
    // one predicate the three War Room readers share, because a party in the
    // field has to be excluded everywhere a bruise is. The break is the same
    // defect it always was: drop the fitness half and the suggestion fields
    // creatures the Infirmary is holding — and now also creatures who are in
    // the Drowned Quarter.
    anchor: '  const fit = (state.chimeras ?? []).filter((c) => here(state, c, now) && isSettled(c, now));',
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
    anchor: "  'ui/theme.js': 'main.js reads BASE_THEME and THEMES on the first frame; it calls nothing',",
    to: "  'ui/theme.js': 'main.js reads BASE_THEME and THEMES on the first frame; it calls nothing',\n  'ranch/agenda.js': 'stale excuse for a module that is on the first screen',",
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
    // R110 RE-AIMED THIS. It used to patch `stanceLine` to prefer a
    // STANCE_LINES constant over the file — and that constant is gone, because
    // it mirrored all ten lines of stance.json behind a smoke assertion
    // holding the two equal. A mirror that is gated to be identical is not a
    // safety net, it is a second place to edit. The break the rule is actually
    // about is the same one: the engine stops reading the file and says its
    // own sentence instead.
    n: 97, gate: STANCE, name: "the stance's sentences go back to being literals the data cannot reach",
    file: 'battle/engine.js',
    anchor: "  return fill(content?.stanceLines?.[key] ?? '', vars) ?? '';",
    to: "  return fill(key === 'brace' ? '{name} sets its feet and braces.' : (content?.stanceLines?.[key] ?? ''), vars) ?? '';",
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
    //
    // R94 — RE-ANCHORED, and onto a bigger target. The five lists this used
    // to remove one of are one `SPECIMEN(...)` spread now, so the break takes
    // the whole record's shape off the loose board instead of a single line.
    // Same rule, same red; the anchor moved because the table stopped being
    // three hand-typed copies of one shape.
    n: 191, gate: VAULT, name: 'the loose board\'s lists go back to having no stated bound',
    file: 'tools/vault.js',
    anchor: "  ...SPECIMEN('campaign.loose[].unit'),",
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
    // R186 re-aimed: the variant rule is now one tier rule (`commonOnly`),
    // so the break lets the variants back through it and nothing else.
    anchor: '    if (!commonOnly(part, content)) continue;',
    to: '    if (!commonOnly(part, content) && !content.species[part.species]?.variantOf) continue;',
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
    // spread), so the anchor follows the number it sits beside, and R186
    // moved it again for R182's least-missed card. R187 restated it as a
    // bound measured on the worst case, so it should now move only when a
    // species ships. What the break aims at is `opens`, which is untouched.
    n: 199, gate: HEIGHT, name: 'the height gate stops asking whether a folding screen still opens',
    file: 'tools/height.js',
    anchor: '  vault:          { folded: 3300,  tallest: 4440, opens: 20 },',
    to: '  vault:          { folded: 3300,  tallest: 4440 },',
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
    // R181 re-aimed: the wage line now follows these two, so the break
    // deletes exactly them and leaves the payroll standing.
    anchor: `    + chimeraUpkeepPerDay(state, content)
    + territoryUpkeepPerDay(state, content)
    + facilityUpkeepPerDay(state, content)
`,
    to: `    + chimeraUpkeepPerDay(state, content)
`,
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
    // R147 RE-AIMED THIS, and `--anchors` is why it was noticed. The planner
    // used to test `chassis.includes(part.slot)` inside the fill loop; it now
    // filters the granted socket list by the frame's own slots once, before
    // filling. Same rule, one level up — so the break drops the filter instead
    // of the guard, and a hindlimb part finds a `hindlimbs` socket on a Kite
    // that has none. `validateSplice` then refuses the frame exactly as R141
    // measured. A break whose anchor rots into nothing is a gate that has
    // quietly stopped being tested.
    // R147 RE-AIMED THIS TWICE, and the second time is the instructive one.
    // It was pointed at a filter the planner applied over the granted socket
    // list — and `theaterGrants(state, content, frameId)` had ALREADY filtered
    // by the frame's slots. Two guards, either one holding alone, and the
    // break aimed at the redundant one, so it patched a line that could not
    // change an answer: the Kite census read byte-identical with it applied.
    // The redundant filter is gone and this aims at the guard that remains.
    //
    // TWO WAYS A BREAK ROTS. `--anchors` catches the first in a second — the
    // anchor stops matching. Only a full run catches the second: the anchor
    // matches, the patch applies, and the defect no longer manifests.
    n: 231, gate: KITE, name: 'the planner dresses every chassis from the whole vault, and the Kite is refused for owning a leg',
    file: 'splice/facility.js',
    anchor: '    sockets: frameSlots ? sockets.filter((s) => frameSlots.includes(slotOfSocket(s))) : sockets,',
    to: '    sockets,',
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
    // The pull goes away and the Theater reaches for the same best-graded part
    // every time, which is the 43% R140 started from.
    //
    // R158 RE-AIMS THIS FROM REACH TO BULK, and it is the same patch — what
    // changed is which rule is asked to notice. As a REACH break it needed a
    // whole campaign's worn total to fall under a floor, and measured at 21
    // seeds the pull is worth 20.8 parts against a standard error of 9.1 at
    // the seven seeds that gate used: ONE sigma. That is why it went MISSED
    // under R157 and again under R154, and why the floor was re-typed twice
    // chasing it.
    //
    // `bestSplice` is this function, and smoke already asserts its tie-break
    // directly on two hand-built parts: same grade, one already built with,
    // the Theater takes the other. Deterministic, no walk, no sample. It
    // fails with the exact sentence "with both at Standard and bear_head
    // already built with, the Theater reaches for tiger_head", which is the
    // defect said out loud rather than inferred from a percentage.
    n: 245, gate: BULK, name: 'a part you have never built with stops breaking a tie, and the Theater re-picks its favourite',
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

  // --- gate: wide (R117 — the game on a laptop) ----------------------------
  {
    // RULE 5, AND THE COMPLAINT ITSELF. `main` goes back to the 560px cap it
    // carried at every width, so the two-column shell is still there and the
    // rail still works — and the game is a narrow ribbon with 353px of dark
    // on either side again. Aimed at the override rather than at the base
    // rule, because that is the shape the regression takes: somebody tidies
    // away a `max-width: none` that looks redundant.
    n: 390, gate: WIDE, name: 'the column goes back to 560px on a laptop, and the glass is 44% used',
    file: 'style.css',
    anchor: '    grid-area: main;\n    max-width: none;',
    to: '    grid-area: main;\n    max-width: 560px;',
  },
  {
    // RULES 3 AND 4. The rail is imported, the media query matches, the host
    // is there — and nothing is drawn into it. This is the failure mode a
    // lazy panel actually has, and it is SILENT: no error, no empty box, just
    // a column of dark where the agenda and the wire were. Five screens lose
    // an agenda they never had before this milestone, and the Ranch loses one
    // too, because its own card stands down at this width.
    n: 391, gate: WIDE, name: 'the rail renders nothing, and the agenda and the wire are off screen again',
    file: 'main.js',
    anchor: '  if (rail) { rail(host, ctx, wireLines()); return; }',
    to: '  if (rail) { return; }',
  },
  {
    // RULE 4 ON ITS OWN. The shell stops being fixed-height and goes back to
    // a page that scrolls, which is what it was before this milestone: the
    // rail then stretches down a grid row as tall as the screen beside it —
    // 1,700 to 2,700px — and the wire, pinned to its foot, is nowhere near
    // the glass. That is the mechanism the whole layout rests on, and it is
    // one property of one rule.
    //
    // THE BREAK THIS REPLACES was `.rail-agenda { flex: 0 0 auto }` — take
    // the agenda's own scroll away and let it push the wire out — and it
    // went MISSED at R117: on the day-180 fixture the agenda is about 700px
    // and the rail's row is about 750, so it fits and the wire stays on
    // screen. The rule is right and the break was not: a fixture where it
    // would fire is a fixture with a longer agenda, which is not a thing
    // this gate gets to choose. Recorded rather than deleted, because the
    // next person to look at `.rail-agenda` should know it was tried.
    n: 392, gate: WIDE, name: 'the shell stops being fixed-height, and the wire falls down a 2,400px rail',
    file: 'style.css',
    anchor: '    height: 100dvh;\n    min-height: 0;\n    overflow: hidden;',
    to: '    min-height: 100vh;',
  },
  {
    // RULE 1, AND THE 380px FLOOR THE CRITERION NAMES. The six-tab bar loses
    // the class that gives it a second row, so YEARBOOK is back in a 52px
    // cell and the Dex runs off the right of a phone. Aimed at `ui/tabs.js`
    // rather than at the stylesheet because the bar is the thing that knows
    // how many tabs it has — and because a milestone that adds a seventh Dex
    // tab will touch this line.
    n: 393, gate: WIDE, name: 'a six-tab bar goes back to one row, and the Dex runs off a 380px phone',
    file: 'ui/tabs.js',
    anchor: "    <nav class=\"subtabs${tabs.length > 5 ? ' is-crowded' : ''}\"",
    to: '    <nav class="subtabs"',
  },
  {
    // RULE 0, WHICH IS THE ONE THAT KEEPS THE OTHER FIVE HONEST. The walk
    // writes the campaign to a key the game does not read, so every screen
    // measured is a FRESH save — short, mostly empty, and passing rules 1
    // through 5 by having almost no layout to get wrong. R157's worn floor
    // and R163's median both shipped as rules a dead fixture satisfied; this
    // is that failure aimed at this gate, and it has to be caught by the
    // "tallest screen" check rather than by luck.
    n: 394, gate: WIDE, name: 'the width gate measures a fresh save and every rule passes on an empty game',
    file: 'tools/wide.js',
    anchor: "  await evaluate(`localStorage.setItem('spliceworld_save', ${JSON.stringify(JSON.stringify(save))})`);",
    to: "  await evaluate(`localStorage.setItem('spliceworld_notasave', ${JSON.stringify(JSON.stringify(save))})`);",
  },

  // --- gate: the gene probe (R118 — which way, not how far) ----------------
  {
    // THE EFFECT GOES BACK TO UNSIGNED, which is the shape the probe had for
    // fifteen milestones and the one a tidy-up would restore: `Math.abs` on
    // both halves reads like harmless normalisation. It is the whole rule.
    // Every direction becomes positive, so every gene "holds one direction"
    // for free — AND SO DOES THE CONTROL, which is what makes this catchable
    // rather than silently weaker. Rule 1 is the tripwire under rule 2.
    n: 395, gate: GENEPROBE_A, name: 'the gene effect goes unsigned again, so re-seeding holds a direction too',
    file: 'tools/smoke.js',
    anchor: '    return { turns: (gt - pt) / pt, left: (gh - ph) / ph };',
    to: '    return { turns: Math.abs((gt - pt) / pt), left: Math.abs((gh - ph) / ph) };',
  },
  {
    // THE SALT LIST GOES BACK TO R90's TWO FAMILIES. This break is the reason
    // `GENE_MIN_SALTS` exists: written first, it found that cutting the list
    // to two left every other assertion GREEN — the control is same-signed on
    // turns across t24 and q7, and only `left` was saving it. The gate could
    // not defend its own sample size, which is 50% odds that a dead gene
    // holds a direction by luck rather than 3%.
    n: 396, gate: GENEPROBE_A, name: 'the sign test drops to two salts, where a dead gene passes half the time',
    file: 'tools/smoke.js',
    anchor: "    : ['t24', 'q7', 'z1', 'm5', 'k9', 'w3'];",
    to: "    : ['t24', 'q7'];",
  },
  {
    // A GENE STOPS BEING DECLARED, so it runs in no lane at all and the block
    // gets quietly cheaper and emptier — R90's union failure one level down,
    // in a table that had no such check before this milestone.
    n: 397, gate: GENEPROBE_A, name: 'a gene names no shard, so nothing measures it and the block gets cheaper',
    file: 'tools/smoke.js',
    anchor: "    glassjaw: 'c', venomgland: 'c', barbedskin: 'c',",
    to: "    glassjaw: 'c', barbedskin: 'c',",
  },
  {
    // AND THE GAME ITSELF: a gene's stat bonus stops reaching the creature.
    // `splice/physiology.js` is where a trait becomes numbers, so this is the
    // regression the probe exists for rather than one aimed at the probe.
    // Eight of the twelve genes are stat-only — they go to nothing, and a
    // gene that does nothing cannot hold a direction.
    n: 398, gate: GENEPROBE_C, name: "a gene's stat bonus stops reaching the creature, and eight genes go quiet",
    file: 'splice/physiology.js',
    anchor: '      for (const [stat, v] of Object.entries(content.traits?.[traitId]?.statBonus ?? {})) {',
    to: '      for (const [stat, v] of Object.entries({})) {',
  },

  // --- gate: the job headline (R183 — one sentence, 542 launches) ----------
  //
  // BREAK 327, BACK, AND MEANING SOMETHING THIS TIME. R116 retired it as a
  // perfect no-op: it patched `pickPooled` on `op.news` to take the first
  // entry, and every `news` in the data was a single STRING, so the patch and
  // the original computed the same value. The id stays retired — the rule
  // returns here rather than reusing a number whose history says "could never
  // fire". Now that the four board jobs carry pools, the same patch takes a
  // job back to one sentence and the 1% rule says so.
  {
    // THE SUCCESS HEADLINE, which is the line the entry is about: the walker
    // launches 542 jobs in 180 days and every win says its job's line, so
    // freezing the pool puts one sentence at ~3.4% of everything the county
    // says. Caught by the 1% rule, not by rule 2's 5% ceiling — which is the
    // whole reason this milestone wrote a tighter one.
    n: 399, gate: SHARD_D, name: 'a job stops rotating its headline, so one sentence is 3% of the wire again',
    file: 'campaign/operations.js',
    anchor: '    const headline = pickPooled(state, `op:${op.id}`, op.news);',
    to: '    const headline = Array.isArray(op.news) ? op.news[0] : op.news;',
  },
  {
    // AND THE SECOND READER, which R183's entry did not know about. The same
    // pool is read from TWO places — a job's success, and a retainer's daily
    // ledger line in `settleContracts`, which alternates with `op_contract`.
    // The entry described one call site and named the petting zoo as its
    // example; the petting zoo is never launched by the walker at all, and
    // what it actually says comes through THIS line. A rule that only covered
    // the success path would have left the contract half frozen and green.
    n: 400, gate: SHARD_D, name: "a retainer's ledger line stops rotating, and the quiet half of the board repeats",
    file: 'campaign/operations.js',
    anchor: '      ? fill(pickPooled(state, `op:${op.id}`, op.news), { op: op.name })',
    to: '      ? fill(Array.isArray(op.news) ? op.news[0] : op.news, { op: op.name })',
  },
  {
    // THE AUTHORING HALF, and it needs its own break because the WALK cannot
    // see it. Break 329 catches a pool whose path stops resolving, via the
    // section-reach gate; it does NOT catch a pool that is merely trimmed,
    // because the reach gate matches the authored block as a prefix or suffix
    // of the live array and a shorter block still matches. So: cut two lines
    // out of a job's pool as somebody tidying near-duplicates would, leaving
    // three headlines where the rule asks four. Nothing else in the tree goes
    // red on this.
    n: 401, gate: SHARD_D, name: 'a job pool is trimmed to three headlines, under the count the 1% rule needs',
    file: 'data/voice-pools.json',
    anchor: '    "Reptile house completes a full recount and arrives at a different, worse number.",\n'
      + '    "Reptile house reports one vivarium empty and its catch entirely undamaged.",\n'
      + '    "Keeper insists the reptile house door was shut. The door agrees, in writing.",',
    to: '    "Reptile house completes a full recount and arrives at a different, worse number.",',
  },
  // --- gate: the Dex tab list (R185 — five of six, one level down) ---------
  {
    // THE BREAK THE ENTRY ASKED FOR: a seventh tab lands and the table does
    // not name it. Before this milestone the walk carried a literal list, so
    // a new tab was simply not measured and the gate stayed green — which is
    // how the Yearbook went five milestones with no folded budget, no tallest
    // budget and no word budget. Now the list comes off the bar, so a tab
    // nobody budgeted is a tab the gate names.
    n: 402, gate: HEIGHT, name: 'a seventh Dex tab ships with no height budget and the gate never notices',
    file: 'splice/dex-ui.js',
    anchor: "  { id: 'yearbook', icon: 'book', label: 'Yearbook' },",
    to: "  { id: 'yearbook', icon: 'book', label: 'Yearbook' },\n"
      + "  { id: 'ledger', icon: 'book', label: 'Ledger' },",
  },
  {
    // AND THE OTHER DIRECTION — the list goes back to being typed here. This
    // is the defect exactly as it shipped: five ids in a file that is not the
    // screen, and a sixth tab on the screen that nothing walks. Caught by the
    // UNION rather than by the budget rule, because the budget rule only ever
    // sees what the walk reached: `dex:yearbook` declares a budget and no row
    // comes back for it.
    n: 403, gate: HEIGHT, name: 'the Dex tab list goes back to a literal, and the sixth tab is unmeasured again',
    file: 'tools/height.js',
    anchor: "  const dexTabs = JSON.parse(await evaluate(`JSON.stringify(",
    to: "  const dexTabs = ['roster', 'variants', 'combos', 'genes', 'foes']; void JSON.parse(await evaluate(`JSON.stringify(",
  },
  {
    // AND THE READ ITSELF GOING BLIND, which is the hazard a DOM-read list
    // adds that a literal did not have. One character in the selector and the
    // query matches nothing: the loop walks no tab, every Dex budget goes
    // unchecked, and without the floor below the gate would report a clean
    // run having measured nothing at all. That is the failure shape this
    // project has shipped more than any other — a rule with nothing to look
    // at passes.
    n: 404, gate: HEIGHT, name: 'the Dex tab selector matches nothing, and the walk measures no tab at all',
    file: 'tools/height.js',
    anchor: "    [...document.querySelectorAll('#screen-dex nav.subtabs#dex-subtabs button[data-dex-tab]')]",
    to: "    [...document.querySelectorAll('#screen-dex nav.subtabs#dex-subtabs button[data-dex-tabs]')]",
  },
  // --- gate: the synth is not compiled on boot (R176) ---------------------
  {
    // THE MODULE COMES BACK. A static import in main.js is all it ever took:
    // the whole eviction is that `watchSignals` and `cuesFor` moved out, and
    // one `import * as sfx` puts 9.5 KB of oscillators back in front of the
    // first paint. Caught by MODULE_CAP, which is the number this milestone
    // paid back to 49.
    n: 405, gate: SHARD_D, name: 'the synth is statically imported again, and the boot compiles 9.5 KB it cannot use',
    file: 'main.js',
    anchor: "import { watchSignals, cuesFor, tickWorld",
    to: "import * as sfx from './audio/sfx.js';\nimport { watchSignals, cuesFor, tickWorld",
  },
  {
    // THE ONE THIS MILESTONE NEARLY SHIPPED. Gate the cue path on the
    // gesture and the lazy load looks perfect: stingers are inaudible before
    // a gesture anyway, so nothing sounds different. What dies is the BUZZ —
    // `buzz` never checks the context, so a job that came back while you were
    // away shakes the phone today and would stop. Every other rule in the
    // file stays green through it, which is why R176 wrote one that does not.
    n: 406, gate: SHARD_D, name: 'the cue path waits for a gesture, and the phone stops buzzing for a job that came back',
    file: 'main.js',
    anchor: "    audio().then((m) => { m?.play(cue); m?.buzz(cue, content); });",
    to: "    if (audioOpen) audio().then((m) => { m?.play(cue); m?.buzz(cue, content); });",
  },
  {
    // AND THE PREFERENCES STOP RIDING IN. R111's rule was "the boot applies
    // every audio preference, not just the mute"; R176 moved WHEN without
    // moving WHETHER. Drop the call from the loader and the volume, the
    // ambience toggle and the haptics toggle are all honoured only once the
    // panel has been opened — the exact defect R111 was filed about, back
    // through a door R176 opened.
    n: 407, gate: SHARD_D, name: 'the synth arrives without the settings, and three preferences wait for the panel',
    file: 'main.js',
    anchor: "  .then((m) => { m.applyAudioSettings(state.settings); return m; })",
    to: "  .then((m) => m)",
  },
  // --- gate: expeditions, and the tier money cannot buy (R179) -----------
  {
    // THE WHOLE MILESTONE, UNDONE BY ONE JSON EDIT. An uncommon with a price
    // is orderable from the catalog on day one, and the expedition becomes a
    // slower way to get something the shop already sells. The tier and the
    // price are one fact and smoke asserts it in BOTH directions, which is
    // why this patch — a number where a null was — goes red rather than
    // quietly making the Manta a goat.
    n: 408, gate: SHARD_D, name: 'an uncommon is given a catalog price, and the only unbuyable animal goes on sale',
    file: 'data/species.json',
    anchor: `      "archetype": "ray",
      "diet": "Plankton, by the cubic metre",
      "feedCost": 7,
      "upkeepPerDay": 7,
      "mailOrderPrice": null,`,
    to: `      "archetype": "ray",
      "diet": "Plankton, by the cubic metre",
      "feedCost": 7,
      "upkeepPerDay": 7,
      "mailOrderPrice": 900,`,
  },
  {
    // THE DECISION EVAPORATES. `rarityFloor` is the only thing that makes
    // "which region, how long, with whom" a question: without it the
    // shortest one-crew trip can roll everything the longest full-crew one
    // can, so the answer is always the cheapest trip repeated. That is the
    // jobs-board defect R116 spent a milestone undoing, rebuilt at the other
    // end of the county — and it looks like a tidy-up in the diff.
    n: 409, gate: SHARD_D, name: 'the rarity floor is emptied, and the shortest trip reaches everything the longest does',
    file: 'data/regions.json',
    anchor: `    "rarityFloor": {
      "uncommon": {
        "hours": 24,
        "crew": 2
      },
      "rare": {
        "hours": 48,
        "crew": 2
      },
      "unique": {
        "hours": 48,
        "crew": 3
      }
    }`,
    to: `    "rarityFloor": {}`,
  },
  {
    // THE PRICE BECOMES IMAGINARY. An expedition is paid for in crew, and
    // the board is one of the five readers that has to agree they are gone.
    // Drop the exclusion here and the same creature is counted abroad by the
    // War Room and available by the Jobs board, so a player sends three
    // creatures into the Drowned Quarter and loses nothing at all.
    n: 410, gate: SHARD_D, name: 'the board counts the party in the field as crew, and an expedition costs nothing',
    file: 'campaign/operations.js',
    anchor: '  const away = expeditionCrew(state);\n  const fit = state.chimeras.filter((c) => !away.has(c.id) && !(c.injury && now < c.injury.until)).length;',
    to: '  const fit = state.chimeras.filter((c) => !(c.injury && now < c.injury.until)).length;',
  },
  {
    // A RECALL BECOMES FREE. The cooldown is the van unpacking, and it is
    // what stops a player calling a party home the moment the odds look
    // wrong and re-rolling immediately — which would make the sealed outcome
    // pointless, because you would simply relaunch until you liked it.
    // Deleting one line leaves a recall that looks correct: the field
    // empties, the crew are free, and nothing says the trip cost anything.
    n: 411, gate: SHARD_D, name: 'a recall skips the cooldown, and the sealed outcome can be re-rolled on demand',
    file: 'campaign/expedition.js',
    anchor: `  state.campaign.expedition = null;
  state.campaign.expeditionReadyAt = now + Math.round(expTuning(content).cooldownHours * HOUR);
  return { ok: true, msg: content.copy?.expedition?.recalled };`,
    to: `  state.campaign.expedition = null;
  return { ok: true, msg: content.copy?.expedition?.recalled };`,
  },
  {
    // THE WALKER STOPS RUNNING THE VERB. The policy sends the bench and
    // keeps the A-team home, so one comparison decides whether a campaign
    // ever mounts an expedition at all — and with it, whether anything
    // behind one is reachable content or a species nobody will ever hold.
    // This is the shape R95 built the reach gate for: not an error, just a
    // branch that stops being taken, and a Dex entry that stays grey.
    n: 412, gate: REACH, name: 'the walker keeps its whole roster home, and the only expedition-only species is never held',
    file: 'tools/sim.js',
    anchor: '    const spare = bench.slice(0, Math.max(0, bench.length - fullTeam()));',
    to: '    const spare = bench.slice(0, Math.max(0, bench.length - fullTeam() - 99));',
  },
  // R180 — the mission board. One break per rule the milestone added, and
  // every one of them aims at a line that would look like a reasonable edit
  // to somebody who had not read the note.
  {
    n: 413, gate: SHARD_A, name: 'a conscript is restored rather than re-derived, and a caught creature fights with numbers the engine has retired',
    file: 'campaign/rivals.js',
    // A MULTI-LINE ANCHOR, because the single-line one did not bite. The
    // first cut inserted `powerScale: 1` beside `name:` — earlier in the
    // same object literal than the real `powerScale,` key, so the later one
    // won and the break was a no-op that reported MISSED. `      powerScale,`
    // on its own appears twice in this file, so the anchor carries enough of
    // the conscript's call to be unique.
    anchor: "      name: taken.name || 'Reassigned Specimen',\n      frame: taken.frame,\n      tokens,\n      powerScale,",
    to: "      name: taken.name || 'Reassigned Specimen',\n      frame: taken.frame,\n      tokens,\n      powerScale: 1,",
  },
  {
    n: 414, gate: SHARD_A, name: 'the lab forgets what it took, and a sabotage that cost you a creature costs them nothing',
    file: 'campaign/rivals.js',
    anchor: '  for (const [n, taken] of conscriptsOf(state, rival.id).entries()) {',
    to: '  for (const [n, taken] of [].entries()) {',
  },
  {
    n: 415, gate: SHARD_A, name: 'renewal hands the specimen back, and the loudest mission in the game costs nothing',
    file: 'campaign/caper.js',
    // R189 re-aimed: the creature branch now follows the agent's, so the
    // line opens with `} else`. Same edit, same rule.
    anchor: "  } else if (mission.alwaysSpends) fate = 'released';",
    to: "  } else if (false) fate = 'released';",
  },
  {
    n: 416, gate: SHARD_A, name: 'armour stops cancelling camouflage, and a plated bruiser is as quiet as a chameleon',
    file: 'campaign/caper.js',
    anchor: "  const camo = hidden ? clamp01(camoParts / Math.max(1, a.camoCeil)) : 0;",
    to: "  const camo = clamp01(camoParts / Math.max(1, a.camoCeil));",
  },
  {
    n: 417, gate: SHARD_A, name: 'the mass scale goes back to the guess, and every creature in the game reads zero on a third of the blend',
    file: 'data/missions.json',
    // Aimed at the CEILING, not the floor. R180's first cut aimed this at
    // massFloor and the break was MISSED: real builds run 88 to 216, so with
    // the ceiling still at 165 the term kept discriminating and the gate was
    // right not to complain. 68 is the number from the pre-measurement guess,
    // and it is the one that put every creature in the game under the floor
    // and read zero for all of them.
    anchor: '      "massCeil": 165',
    to: '      "massCeil": 68',
  },
  {
    n: 418, gate: SHARD_A, name: 'the outcome is rolled at the tick instead of sealed at launch, and a reload re-rolls a job that went badly',
    file: 'campaign/mission.js',
    anchor: '  const out = run.outcome ?? {};',
    to: '  const out = {};',
  },
  // R180, second pass — the four rules the first pass did not have.
  {
    // The walker goes back to scoring odds per hour, which is arithmetically
    // incapable of picking anything but the shortest run of the shortest
    // mission. Two of three missions become unreachable and the new reach
    // rule in the `empire` block says so. This is the break that did not
    // exist while the defect was live, which is the whole point of writing it.
    n: 419, gate: SHARD_A, name: 'the walker scores capers on odds per hour again, and runs nothing but the short espionage',
    file: 'tools/sim.js',
    anchor: '      const hours = mission ? Math.min(...missionHours(mission)) : 0;',
    to: '      const hours = mission ? Math.max(...missionHours(mission)) * 99 : 0;',
  },
  {
    // Renewal goes back to resting for the board's own eleven hours. The
    // walker then runs it twelve to nineteen times a campaign, the ranch
    // launders its weakest animal for cash on a loop, and R93's late-game
    // ceiling catches it at 90.5% of post-dominion defences held.
    n: 420, gate: SHARD_A, name: 'renewal rests as briefly as a burglary, and selling your worst animal becomes the answer to being broke',
    file: 'data/missions.json',
    anchor: '      "cooldownHours": 336,',
    to: '      "cooldownHours": 11,',
  },
  {
    // The trim comes off and a lab holds every creature it has ever taken.
    //
    // AIMED AT SHARD A, NOT AT `tools/vault.js`, AND THE FIRST CUT WAS AIMED
    // WRONG. The vault gate is where the real defect was found, so pointing
    // the break at it looked obvious — and it went MISSED, because that gate
    // reads a day-180 WALK and a walk produces nought to two conscripts. An
    // array under its bound is an array under its bound whether or not
    // anything trims it. The rule that can see this is the fixture in the
    // `capers` block, which puts five through the tick on purpose.
    n: 421, gate: SHARD_A, name: 'a lab keeps every creature it ever took, and the save array has no ceiling',
    file: 'campaign/mission.js',
    anchor: '    record.conscripts = [...(record.conscripts ?? []), out.conscript].slice(-cap);',
    to: '    record.conscripts = [...(record.conscripts ?? []), out.conscript];',
  },
  {
    // `?? []` back in place of the array check. It reads as a guard and is
    // not one: a `conscripts` field that is PRESENT and not an array sails
    // through it and reaches `.entries()`. R114's fuzzer is what caught this
    // for real, on a save nobody would write by hand except an attacker.
    n: 422, gate: SHARD_A, name: 'a conscripts field that is a string passes for an array, and a hand-edited save takes down the battle render',
    file: 'campaign/mission.js',
    anchor: '  const c = state.campaign?.rivals?.[rivalId]?.conscripts;\n  return Array.isArray(c) ? c : [];',
    to: '  const c = state.campaign?.rivals?.[rivalId]?.conscripts;\n  return c ?? [];',
  },
  // R181 — the payroll. One break per rule the `hires` block adds, all in
  // shard D because that is where the block runs.
  {
    // The hand's relief comes off the drift. Everything else about the hire
    // still works — the wage is billed, the tallies count — which is the
    // shape of the real defect: a henchman on the books who does nothing.
    n: 423, gate: SHARD_D, name: 'the hand is paid and does nothing, and a week with a hand costs the herd the same week as without one',
    file: 'ranch/ranch.js',
    anchor: '      animal.condition - drift * (owned / HOUR - 24 * fed * (hand?.h.rate ?? 0))',
    to: '      animal.condition - drift * (owned / HOUR)',
  },
  {
    // The wage is billed from the day of hiring instead of from the start of
    // the window. One call for a week pays a week; 168 calls pay 84 weeks.
    // The settle stops being arithmetic, which is the first clause of the
    // criterion going false without anything looking wrong on one tick.
    n: 424, gate: SHARD_D, name: 'the wage is billed from the hire date on every tick, and a week in 168 visits costs 84 weeks',
    file: 'ranch/ranch.js',
    anchor: 'upkeep += wageOf(state, content, rec) * ownedMs(rec.at) / DAY;',
    to: 'upkeep += wageOf(state, content, rec) * (now - rec.at) / DAY;',
  },
  {
    // The wage stops reading the operation: R152's defect, on the payroll.
    n: 425, gate: SHARD_D, name: 'the wage is a flat fee again, and a hand costs the county the same as a barn',
    file: 'ranch/ranch.js',
    anchor: 'Math.max(content.henchmenMeta?.minSize ?? 0, size)',
    to: '(content.henchmenMeta?.minSize ?? 0)',
  },
  {
    // Mopsy reaches every pen, still for free, at Gristle's price. Nothing
    // in the engine is wrong; one number in the JSON made a hire a trap.
    n: 426, gate: SHARD_D, name: 'the frugal hand reaches every pen, and the one who overfeeds becomes a trap with a name',
    file: 'data/henchmen.json',
    anchor: '"reach": 8,',
    to: '"reach": 40,',
  },
  {
    // The fussiest vet stops refusing. Now two vets at one price halve the
    // same clocks and one of them sends a bill: strictly worse, and the
    // quirk that made the choice is gone from the digest as well.
    n: 427, gate: SHARD_D, name: 'the vet who refuses the unstable treats everyone, and the one who bills is simply worse',
    file: 'ranch/ranch.js',
    anchor: '    if (c.instability > vet.h.ceiling) {',
    to: '    if (false) {',
  },
  {
    // The report keeps the flattering half. The refusals still happen and
    // the tally still counts them; the welcome-back card just stops saying.
    n: 428, gate: SHARD_D, name: "the vet's report brags about the hours and leaves out who was turned away",
    file: 'data/henchmen.json',
    anchor: ', and turned away {missed} hours of patients as too unstable to touch.',
    to: '.',
  },
  {
    // One slot holds two hires. "Slots are few" becomes one more than said.
    n: 429, gate: SHARD_D, name: 'a full payroll takes one more hire than it has slots for',
    file: 'campaign/staff.js',
    anchor: "  if (hiredOf(state).length >= slotsOf(state, content)) return copy(content, 'staff.no_slot');",
    to: "  if (hiredOf(state).length > slotsOf(state, content)) return copy(content, 'staff.no_slot');",
  },
  {
    // The load path stops repairing a hire's numbers, and a hand-edited `at`
    // multiplies NaN into every animal on the next tick.
    n: 430, gate: SHARD_D, name: "a hire with a string for a start date loads as it is, and the next tick turns the herd into NaN",
    file: 'save/schema.js',
    anchor: 'if (!Number.isFinite(r[k])) { r[k] = 0;',
    to: 'if (false) { r[k] = 0;',
  },
  // R188 — the walker runs the payroll. The first four are the `contest`
  // block's R188 rule in shard B; the fifth is the splice ceiling R188
  // re-derived in the `empire` block.
  {
    // The default goes back to R181's: nobody is ever hired, every walk ends
    // with an empty payroll, and no campaign number knows what one is worth.
    n: 431, gate: SHARD_B, name: 'the walker never hires, and no campaign ever finds out what a henchman is worth',
    file: 'tools/sim.js',
    anchor: 'stopAtDominion = true, priceBeats = false, from = null, hire: hires = true } = {}) {',
    to: 'stopAtDominion = true, priceBeats = false, from = null, hire: hires = false } = {}) {',
  },
  {
    // Rule 0 comes off, and the walker hires on its first visit — before the
    // game has introduced the payroll at all. The introduction is marked by
    // the walk loop, not by this rule, which is the only reason it can fail.
    n: 432, gate: SHARD_B, name: 'the walker hires before the game has told anybody they can',
    file: 'tools/sim.js',
    anchor: '  if (!introduced) return;',
    to: '  if (false) return;',
  },
  {
    // Rule 3 comes off: the hand hired for a three-animal herd keeps the job
    // when the herd is twenty, and ends with more meals missed than given.
    // R190 split rule 3 into a coverage half and a bill half (`worse`), so
    // this aims at the coverage half alone: the vet's rule is untouched and
    // only the hand's swap stops.
    n: 433, gate: SHARD_B, name: 'a hand hired for a small herd keeps the job long after the herd has outgrown her',
    file: 'tools/sim.js',
    anchor: '  const worse = (held, want) => (bill(held) === null ? coverage(held) < coverage(want)',
    to: '  const worse = (held, want) => (bill(held) === null ? false',
  },
  {
    // The payroll priced twenty times over. Every R181 rule still holds —
    // it doubles with the operation, the card and the clock agree — which is
    // why only the day-180 bill on a real campaign can see it.
    n: 434, gate: SHARD_B, name: 'the payroll is priced twenty times over and outweighs the empire it staffs',
    file: 'ranch/ranch.js',
    anchor: 'Math.max(content.henchmenMeta?.minSize ?? 0, size);',
    to: 'Math.max(content.henchmenMeta?.minSize ?? 0, size) * 20;',
  },
  {
    // The walker dismantles its weakest creature every time a better build
    // is possible at any price — R135's rebuild loop. The per-seed ceiling
    // R188 moved to double the design number is the rule aimed at this, and
    // the churn floor beside it sees it too.
    n: 435, gate: EMPIRE, name: 'the walker rebuilds its roster every visit, and the Theater becomes a conveyor belt',
    file: 'tools/sim.js',
    anchor: '        if (plan.score > quality(weakest) + burned) {',
    to: '        if (true) {',
  },
  // R182 — THE VAULT'S WAY OUT. A full shelf with nothing `surplusParts` may
  // offer and no shelf left to buy used to have no move at all; the Vault now
  // gives every part its own render control and lists the least missed first,
  // and the walker takes exactly what the next graduation is short. The rule
  // lives in the `shelf` block of tools/smoke.js, which BUILDS the dead end
  // because every walk the suite reads either stops at dominion or is a saved
  // state. 441-443 are the walker's policy, one clause each.
  {
    n: 436, gate: SHARD_D, name: 'a full shelf with nothing to spare offers the player nothing to press',
    file: 'splice/vault-ui.js',
    anchor: '  const spare = pressure.tight && !surplus.length ? leastMissed(state, content, 3) : [];',
    to: '  const spare = [];',
  },
  {
    n: 437, gate: SHARD_D, name: 'the bays list every part and let the player render none of them',
    file: 'splice/vault-ui.js',
    anchor: "    .map(tokenRow).join('')).join('');",
    to: "    .map((t) => tokenRow(t).replace(/<button[\\s\\S]*<\\/button>/, '')).join('')).join('');",
  },
  {
    n: 438, gate: SHARD_D, name: 'the least-missed list offers the best parts on the shelf first',
    file: 'splice/shelf.js',
    anchor: '  return renderOrder(state, state.inventory.parts.filter((t) => content.parts?.[t.partId])).slice(0, want);',
    to: '  return renderOrder(state, state.inventory.parts.filter((t) => content.parts?.[t.partId])).reverse().slice(0, want);',
  },
  {
    n: 439, gate: SHARD_D, name: 'the refusal goes back to selling shelf space that may not exist',
    file: 'splice/extract.js',
    anchor: '      + `${yields}. Render something down on the Vault.` };',
    to: '      + `${yields}. Render something down, or buy shelf space from the Extractor.` };',
  },
  {
    n: 440, gate: SHARD_D, name: 'a shelf at its last level still tells the player to buy more',
    file: 'splice/vault-ui.js',
    anchor: "          ? (shelfForSale(state, content) ? copy(content, 'vault.full_buy') : copy(content, 'vault.full_last'))",
    to: "          ? (true ? copy(content, 'vault.full_buy') : copy(content, 'vault.full_last'))",
  },
  {
    n: 441, gate: SHARD_D, name: 'the walker never takes the Vault\'s way out, and seed 4242 refuses every graduation again',
    file: 'tools/sim.js',
    anchor: '  if (fit.fits || surplusParts(state, content).length || (shelf && state.funds - shelf.level.cost >= reserve)) return null;',
    to: '  if (fit || surplusParts(state, content).length || (shelf && state.funds - shelf.level.cost >= reserve)) return null;',
  },
  {
    n: 442, gate: SHARD_D, name: 'the walker clears twice what the goat needs, and eats the collection a graduation at a time',
    file: 'tools/sim.js',
    anchor: '  return renderDown(state, content, leastMissed(state, content, fit.short).map((t) => t.id));',
    to: '  return renderDown(state, content, leastMissed(state, content, fit.short * 2).map((t) => t.id));',
  },
  {
    // R191 (folded into R186) — RE-AIMED, because the rule it broke changed.
    // R182's walker waited on ANY shelf for sale; R191 found that on a shelf
    // the walker could never afford that wait never ended (seed 808: 98 head
    // against a ceiling of 80). The defect worth a break now is that wait
    // coming back — saving for a shelf this visit cannot pay for, and
    // refusing every graduation while it does.
    n: 443, gate: SHARD_D, name: 'the walker waits on a shelf it cannot afford, and graduation stops for good',
    file: 'tools/sim.js',
    anchor: '  if (fit.fits || surplusParts(state, content).length || (shelf && state.funds - shelf.level.cost >= reserve)) return null;',
    to: '  if (fit.fits || surplusParts(state, content).length || shelf) return null;',
  },
  {
    n: 444, gate: HANDLERS, name: 'every part row paints a render button and nothing listens to it',
    file: 'splice/vault-ui.js',
    anchor: "  root.querySelectorAll('button[data-render-part]').forEach((btn) => {",
    to: "  root.querySelectorAll('button[data-render-nothing]').forEach((btn) => {",
  },
  {
    n: 445, gate: REACH, name: 'graduation stops, and the herd a campaign ends on runs past the vault gate\'s ceiling',
    file: 'tools/sim.js',
    anchor: "    if (donor && extractAnimal(state, donor.id, content, now).ok) did('graduate', { species: donor.species });",
    to: "    if (false && donor && extractAnimal(state, donor.id, content, now).ok) did('graduate', { species: donor.species });",
  },
  // R184 — THE ROOM INSIDE `main`. The Pens puts the open card beside the
  // list at 1,200px and up, and the arena sizes its creatures by the stage's
  // height as well as its width. Both are asked by `tools/wide.js`'s in-use
  // pass, which loads the walked campaign with a pen open and a fight running
  // — R117 only ever measured the screens at rest.
  {
    n: 446, gate: WIDE, name: 'the Pens goes back to one column on a laptop, and the open card sits above the list again',
    file: 'style.css',
    anchor: '  #screen-pens:has(> .pen-fold.is-open) {',
    to: '  #screen-pens:has(> .pen-fold.is-open):not(*) {',
  },
  {
    n: 447, gate: WIDE, name: 'the arena sizes your creature by the stage\'s width alone, and it swallows the stage',
    file: 'style.css',
    anchor: '.slot-me { left: 0%; bottom: 4%; width: min(52%, 38cqh); }',
    to: '.slot-me { left: 0%; bottom: 4%; width: 52%; }',
  },
  {
    n: 448, gate: WIDE, name: 'the stage stops being a container, and its height units read the viewport instead',
    file: 'style.css',
    anchor: '  container-type: size;',
    to: '  container-type: normal;',
  },
  {
    n: 449, gate: WIDE, name: 'the in-use pass loads the resting save, and measures a Pens with nothing open and a War Room with no fight',
    file: 'tools/wide.js',
    anchor: "  await evaluate(`localStorage.setItem('spliceworld_save', ${JSON.stringify(JSON.stringify(play))})`);",
    to: "  await evaluate(`localStorage.setItem('spliceworld_save', ${JSON.stringify(JSON.stringify(save))})`);",
  },
  {
    n: 450, gate: WIDE, name: 'the open card grows its own row, and the list starts underneath it again',
    file: 'style.css',
    anchor: '    margin-bottom: -9999px;',
    to: '    margin-bottom: 0;',
  },
  // R186 — THE RARE, THE UNIQUE, AND THE RUN THAT REMEMBERS ONE. Every
  // clause of the Done-when gets a break, and every one lands in the `tiers`
  // block (shard d) unless a stricter older gate reaches it first.
  {
    // The unique's door is the rare's door: a full crew stops mattering, and
    // a tier that shares its floor with the one below is not a tier.
    n: 451, gate: SHARD_D, name: 'the unique floor asks for two crew, the same door as the rare',
    file: 'data/regions.json',
    anchor: '        "crew": 3',
    to: '        "crew": 2',
  },
  {
    // Once per run stops being once: a found unique stays on the table, so a
    // second sealed trip can name her again.
    n: 452, gate: SHARD_D, name: 'a unique already found this run is still on the table',
    file: 'campaign/outfit.js',
    anchor: '    if (found.has(f.species)) return false;',
    to: '    if (found.size < 0) return false;',
  },
  {
    // She comes home off the stock-name list, like a goat.
    n: 453, gate: SHARD_D, name: 'the unique arrives under a stock name instead of her own',
    file: 'campaign/expedition.js',
    anchor: '      animal.name = String(legend.name);',
    to: '      void legend.name;',
  },
  {
    // The relocation carries earlier legends and drops this run's, so the
    // one the player just found is gone on the far side.
    n: 454, gate: SHARD_D, name: 'relocating forgets the unique this run found',
    file: 'save/slots.js',
    anchor: '  fresh.legends = [...(fresh.legends ?? []), ...structuredClone(state?.campaign?.legendsFound ?? [])].slice(-LEGENDS_KEPT);',
    to: '  fresh.legends = [...(fresh.legends ?? [])].slice(-LEGENDS_KEPT);',
  },
  {
    // Folded in once and then dropped: the second relocation starts empty.
    n: 455, gate: SHARD_D, name: 'legends are not carried, so the lab after next has never heard of her',
    file: 'save/slots.js',
    anchor: "export const CARRIED_ACROSS_RUNS = ['settings', 'guidesSeen', 'ui', 'legends'];",
    to: "export const CARRIED_ACROSS_RUNS = ['settings', 'guidesSeen', 'ui'];",
  },
  {
    // The record crosses and nobody says her name out loud.
    n: 456, gate: SHARD_D, name: 'the new lab\'s wire never mentions the legend it inherited',
    file: 'campaign/legacy.js',
    anchor: "  emitNews(state, content, 'legend_recalled', { creature: last.name, lab, region });",
    to: '  void lab; void region;',
  },
  {
    // The Yearbook row reads blank for a player who has one.
    n: 457, gate: SHARD_D, name: 'the Yearbook legend row reads nothing whoever was found',
    file: 'save/yearbook.js',
    anchor: '    if (!last?.name) return null;',
    to: '    return null;',
  },
  {
    // A founding animal of HER — a second copy of somebody.
    n: 458, gate: SHARD_D, name: 'the relocation offers the unique as a bloodline',
    file: 'campaign/legacy.js',
    anchor: "      if (content?.species?.[a.species]?.rarity === 'unique') continue;",
    to: "      if (content?.species?.[a.species]?.rarity === 'unicorn') continue;",
  },
  {
    // The keyword ships and does nothing: R20's decoration check.
    n: 459, gate: SHARD_D, name: 'Latch is on the lamprey\'s head and heals nobody',
    file: 'battle/engine.js',
    anchor: '    if (move.keywords.latch && atk.hp > 0 && atk.hp < atk.maxHp) {',
    to: '    if (move.keywords.latchNever && atk.hp > 0 && atk.hp < atk.maxHp) {',
  },
  {
    // R129's leak again, one tier up: a rival wears Mother Clinker's head
    // and salvage hands it over without the animal.
    n: 460, gate: SHARD_D, name: 'rivals wear anatomy above common again, a second door the trip was meant to be the only one of',
    file: 'campaign/rivals.js',
    anchor: "const commonOnly = (part, content) => (content.species[part.species]?.rarity ?? 'common') === 'common';",
    to: 'const commonOnly = () => true;',
  },
  {
    // Power creep wearing a costume. Measured: the rare tier wins 42.3% at
    // standard against the commons' 32.5 and 80.8% at apex against 58.8 —
    // and 80.8 is still UNDER the best common's 86.5, which is why the rule
    // compares tiers rather than asking for a new top of the chart.
    n: 461, gate: SHARD_D, name: 'the lamprey\'s set bonus triples its power and its health',
    file: 'data/species.json',
    anchor: '          "keywords": {\n            "latch": 1.5\n          }',
    to: '          "stats": {\n            "power": 3,\n            "hp": 3\n          },\n          "keywords": {\n            "latch": 1.5\n          }',
  },
  {
    // The rare and the unique both ask for 48 hours, and no trip lasts that
    // long: the floor is a wall with no door in it.
    n: 462, gate: SHARD_D, name: 'the 48-hour trip is withdrawn while two tiers still ask for it',
    file: 'data/regions.json',
    anchor: '      24,\n      48\n    ],',
    to: '      24\n    ],',
  },
  {
    // R191's other half: saving is still the right answer when this visit
    // can pay, and a walker that renders anyway eats the collection for a
    // shelf it was about to buy.
    n: 463, gate: SHARD_D, name: 'the walker renders parts while a shelf it can afford is for sale',
    file: 'tools/sim.js',
    anchor: '  if (fit.fits || surplusParts(state, content).length || (shelf && state.funds - shelf.level.cost >= reserve)) return null;',
    to: '  if (fit.fits || surplusParts(state, content).length) return null;',
  },
  {
    // R186 — found by R186's own full battery. The width gate clicked a tab
    // as soon as `main` held still, and `main` holds still before boot binds
    // a single tab, so a busy box read a screen that never opened as one
    // that "never went quiet". The gate now waits for a visible screen and
    // checks, on a shell with scripts off, that nothing earlier passes.
    n: 464, gate: WIDE, name: 'the width gate clicks tabs as soon as the static shell holds still',
    file: 'tools/wide.js',
    anchor: "  const BOOTED = 'main > .screen:not([hidden])';",
    to: "  const BOOTED = 'main';",
  },
  // R187 — THE GATES THAT MEASURE A FIXTURE INSTEAD OF A BOUND. Each rule
  // below was rewritten to BUILD the state it guards rather than wait for the
  // day-180 walk to produce it, and each of these proves the rewrite holds
  // on a state the walk does not reach.
  {
    // THE VAULT'S BOUND SEES WHAT THE WALK CANNOT. The day-180 shelf has
    // nothing spare, so it never shows the render-duplicates row; only the
    // worst-case pass's `spares` shelf does. A row that starts listing every
    // duplicate it offers adds sixty token lines there and none on the walk,
    // so the day-180 budget stays green and the bound is the only witness.
    // BLIND AGAIN IF the worst-case pass stops building a `spares` shelf.
    n: 465, gate: HEIGHT, name: 'the render-duplicates row lists every duplicate, on a shelf the day-180 walk never holds',
    file: 'splice/vault-ui.js',
    anchor: '      <p class="fine-print">Duplicates only, worst grade first — never the last of an anatomy and never one carrying a gene. The vat pays cash and asks nothing.</p>` : \'\'}',
    to: '      <p class="fine-print">Duplicates only, worst grade first — never the last of an anatomy and never one carrying a gene. The vat pays cash and asks nothing.</p><ul class="token-list">${surplus.map(tokenRow).join(\'\')}</ul>` : \'\'}',
  },
  {
    // THE HELD-ROW PASS OPENS WHAT IT MEASURES. A held row inside a shut
    // region card is in the DOM with no box, CONTAINED skips it, and the first
    // draft of this pass counted every row while measuring none. The pass now
    // counts rows with a box, so shutting the cards is a note, not a pass.
    // BLIND AGAIN IF the count goes back to reading the DOM rather than the
    // screen.
    n: 466, gate: A11Y, name: 'the held-row worst case leaves every region card shut and measures rows with no box',
    file: 'tools/a11y.js',
    anchor: "            ...Object.fromEntries(Object.keys(worstContent.regions ?? {}).map((id) => [`region:${id}`, false])) } };",
    to: "            ...Object.fromEntries(Object.keys(worstContent.regions ?? {}).map((id) => [`region:${id}`, true])) } };",
  },
  {
    // THE RECORD-MAP PASS HAS TO FIND A MAP. A detector that stops looking
    // below the top level finds nothing (a day-180 save carries no record map
    // at its root; `campaign.rivals` is one level down), junks nothing, and
    // would pass: the lottery it replaced, wearing a deterministic face. The
    // count is asserted, so it cannot. The first aim of this break inverted
    // the test instead and went MISSED, because an inverted detector finds
    // OTHER objects and junks those harmlessly: a break has to remove what
    // the rule sees, not redirect it. BLIND AGAIN IF a save carries its
    // records in some shape other than an id-keyed object.
    n: 467, gate: SHARD_B, name: 'the record-map pass stops looking below the top of the save, and finds nothing to junk',
    file: 'tools/smoke.js',
    anchor: '        if (vals.length && vals.every(isRecord)) maps.push(at);\n        walk(v, at);',
    to: '        if (vals.length && vals.every(isRecord)) maps.push(at);',
  },
  {
    // A MONTH AWAY BURIES THE WIRE. The retainer's line is once a day and
    // capped, because a player back after two months should hear that the
    // arrangement ran, not fifty-three copies of it. Nothing on the walk is
    // ever away that long, so only the long-absence assertion sees the cap.
    // BLIND AGAIN IF that assertion's absence shrinks under the cap.
    n: 468, gate: SHARD_B, name: 'a long absence files a ledger line for every day away and buries the wire',
    file: 'campaign/operations.js',
    anchor: '  for (let d = last + 1; d <= day && news.length < CONTRACT_LINES_MAX; d++) {',
    to: '  for (let d = last + 1; d <= day; d++) {',
  },
  {
    // R189 — THE AGENT'S ODDS ARE ITS STATED APTITUDE, AND NOTHING ELSE. A
    // perfect score is the strictly-better agent the criterion forbids: it
    // ties the best infiltrator the anatomy can make on every job, so the
    // gate's search-found ceiling and the formula both go red.
    // BLIND AGAIN IF the best build the search finds scores under 1.0, so a
    // perfect agent beats it and the `agent < best` clause is the only one
    // left asking — or if clause 4 stops recomputing the formula.
    n: 469, gate: SHARD_A, name: 'an agent brings a perfect score to every job, whatever the file says',
    file: 'campaign/caper.js',
    anchor: '  const apt = agent ? { score: clamp01(agent.aptitude) } : chimera ? missionAptitude(content, chimera) : { score: 0 };',
    to: '  const apt = agent ? { score: 1 } : chimera ? missionAptitude(content, chimera) : { score: 0 };',
  },
  {
    // R189 — THE RISK IS THE FILE'S. A catch rate typed into the engine
    // agrees with sabotage's 0.4 by coincidence and with nothing else; the
    // gate re-runs the job at catchOnFail 0 and expects the agent home.
    // BLIND AGAIN IF clause 5 only tests the shipped 0.4, where the literal
    // and the file agree.
    n: 470, gate: SHARD_A, name: 'a lab catches an agent at the rate it always catches, whatever the mission says',
    file: 'campaign/caper.js',
    anchor: "    if (!success && risk.risk === 'poached' && rng() < (risk.catchOnFail ?? 0)) fate = 'poached';",
    to: "    if (!success && risk.risk === 'poached' && rng() < 0.4) fate = 'poached';",
  },
  {
    // R189 — A HELD AGENT IS HELD. Dropping the clock keeps the tally
    // honest (the hours are still counted) and frees the agent at once,
    // which is the one thing detention exists to stop.
    // BLIND AGAIN IF clause 5 stops reading `detainedUntil` or stops trying
    // to send the agent before the hours are up.
    n: 471, gate: SHARD_A, name: 'a held agent walks straight out of the cell and back onto the board',
    file: 'campaign/mission.js',
    anchor: "    if (result.fate === 'detained') Object.assign(rec, { detainedUntil: out.freeAt, missed: (+rec.missed || 0) + (+out.detainHours || 0) });",
    to: "    if (result.fate === 'detained') Object.assign(rec, { missed: (+rec.missed || 0) + (+out.detainHours || 0) });",
  },
  {
    // R189 — A POACHED AGENT IS THE LAB'S FOR THE FILE'S DAYS. Reading the
    // book as empty lets the player hire them straight back, and the price
    // of a caught sabotage is a button press.
    // BLIND AGAIN IF clause 5 asks `hireBlock` only after the days are up.
    n: 472, gate: SHARD_A, name: 'the lab that hired an agent away hands them straight back',
    file: 'campaign/staff.js',
    anchor: '  const gone = poachedOf(state, id);',
    to: '  const gone = null;',
  },
  {
    // R189 — A MISSION THAT SPENDS ITS SPECIMEN TAKES NO AGENT. Written into
    // the data rather than the engine: renewal grows an `agent` block, and
    // the engine would happily send somebody with nothing to leave behind.
    // BLIND AGAIN IF clause 1 stops checking `alwaysSpends` against `agent`.
    n: 473, gate: SHARD_A, name: 'renewal takes an agent, and leaves nobody behind',
    file: 'data/missions.json',
    anchor: '      "alwaysSpends": true,',
    to: '      "alwaysSpends": true,\n      "agent": {\n        "risk": "detained",\n        "detainHours": 24\n      },',
  },
  {
    // R189 — AN AGENT'S QUIRK COSTS MONEY, SO ITS LINE SAYS HOW MUCH. R181's
    // digest clause, reached for an agent only because the week now carries
    // a job: without one the agent has no line at all to be wrong in.
    // BLIND AGAIN IF the week-away fixture stops sending the agent, or sends
    // it on a job that can poach it off the books before it reports.
    n: 474, gate: SHARD_D, name: "an agent's report stops saying what the sandwiches cost",
    file: 'data/henchmen.json',
    anchor: 'Sandwiches billed: {billed}.',
    to: 'Sandwiches billed: plenty.',
  },
  {
    // R189 — THE CARD OFFERS THE AGENT. An engine nobody can reach from the
    // War Room is the mission board's R95 lesson again; the handler gate is
    // the rule that sees a control no surface paints.
    // BLIND AGAIN IF the handler fixture stops hiring an agent (a hand
    // there paints the payroll's verbs and not this one).
    n: 475, gate: HANDLERS, name: 'the mission card stops offering an agent, so nobody can pick one',
    file: 'campaign/ui.js',
    anchor: '  const agents = mission.agent ? missionAgents(state, content, t) : [];',
    to: '  const agents = [];',
  },
  {
    // R189 — THE LOAD PATH REPAIRS THE POACHED BOOK. An entry with no time
    // is not a non-compete; kept, it rides the save forever and a reader
    // that forgets to check it holds an agent on a string.
    // BLIND AGAIN IF clause 8 stops asserting the book's shape after
    // `cleanSave`, and only asks that nothing threw.
    n: 476, gate: SHARD_A, name: "a save's junk poached book is carried into the game rather than repaired",
    file: 'save/schema.js',
    anchor: "        if (!e || typeof e !== 'object' || !Number.isFinite(e.until)) {",
    to: '        if (!e) {',
  },
  {
    // R190 — A VET IS PRICED ON ITS FEE AS WELL AS ITS REFUSALS. Dropping the
    // fee half makes the vet who treats everybody free, and Nurse Gauze takes
    // the slot on every seed for the $20 an hour the census measured.
    // BLIND AGAIN IF the unit clause stops recomputing the bill for a vet
    // with a fee.
    n: 477, gate: SHARD_B, name: "a vet's bill forgets the vet's own fee, so the dearest one reads as free",
    file: 'tools/sim.js',
    anchor: '  return cov * (h.fee ?? 0) / rate + (1 - cov) * refusalPrice(content, state, rate);',
    to: '  return (1 - cov) * refusalPrice(content, state, rate);',
  },
  {
    // R190 — THE INFIRMARY'S HOURLY RATE IS READ, NOT TYPED. Eighteen agrees
    // with data/rush.json today and with nothing after the next repricing;
    // the gate doubles the rate in a copy of the content and expects the bill
    // for a refusal to follow.
    // BLIND AGAIN IF the "dearer hour" clause is dropped, since at the shipped
    // price the literal and the file agree on every ward.
    n: 478, gate: SHARD_B, name: "the walker types the Infirmary's hourly rate, so repricing it moves no bill",
    file: 'tools/sim.js',
    anchor: '  return (t.base / (WALK_INJURY_HOURS * g.healScale) + t.perHour * (1 - 1 / rate)) * g.treatScale;',
    to: '  return (t.base / (WALK_INJURY_HOURS * g.healScale) + 18 * (1 - 1 / rate)) * g.treatScale;',
  },
  {
    // R190 — THE DEFECT ITSELF: the walker ranks vets by how many patients
    // each would touch, and Doc Sutures is nobody's vet again. SMOKE CANNOT
    // SEE THIS ONE: on all four of its seeds the bill's first pick is Nurse
    // Gauze too, so coverage-first hires the same vet on the same day and the
    // walks are identical to dominion. The seven full campaigns can, since
    // Doc holds four of them at day 180.
    // BLIND AGAIN IF Doc's ceiling reaches 100 in the data — then he covers
    // everybody, wins on coverage too, and this stops being a defect.
    n: 479, gate: DIET, name: 'the walker hires the vet who touches the most patients again, whatever the refusals would cost',
    file: 'tools/sim.js',
    anchor: '    .sort((a, b) => (bill(a) ?? 0) - (bill(b) ?? 0) || coverage(b) - coverage(a) || (a.fee ?? 0) - (b.fee ?? 0))[0] ?? null;',
    to: '    .sort((a, b) => coverage(b) - coverage(a) || (a.fee ?? 0) - (b.fee ?? 0))[0] ?? null;',
  },
  {
    // R190 — A REFUSED PATIENT IS A VISIT, NOT ONLY HOURS. The call-out is
    // most of what the Infirmary charges for a three-hour clock, and it is
    // the half of the price that makes Nurse Gauze the cheaper vet on a
    // young ranch; without it Doc wins everywhere by construction ($9 a
    // refused clock-hour against her $10), which is the answer R190 wanted
    // and the reason it had to be checked.
    // BLIND AGAIN IF the unit clause stops recomputing the bill with the
    // call-out in it, and the "dearer call-out" clause is dropped.
    n: 480, gate: SHARD_B, name: "a refusal is priced on the Infirmary's hours alone, so its call-out is free",
    file: 'tools/sim.js',
    anchor: '  return (t.base / (WALK_INJURY_HOURS * g.healScale) + t.perHour * (1 - 1 / rate)) * g.treatScale;',
    to: '  return (t.perHour * (1 - 1 / rate)) * g.treatScale;',
  },
  {
    // R190 — THE TIER IS HALF THE PRICE. A tier-IV Infirmary charges 35% of a
    // tier-I one; a bill that ignores the discount prices every late refusal
    // at the first tier's rate and hands the late ranch back to Gauze.
    // BLIND AGAIN IF the unit clause checks only a tier-I ward, where the
    // discount is 1 and the break changes nothing.
    n: 481, gate: SHARD_B, name: "the bill charges a late refusal the first tier's price, whatever Infirmary the ranch has built",
    file: 'tools/sim.js',
    anchor: '  return (t.base / (WALK_INJURY_HOURS * g.healScale) + t.perHour * (1 - 1 / rate)) * g.treatScale;',
    to: '  return (t.base / (WALK_INJURY_HOURS * g.healScale) + t.perHour * (1 - 1 / rate));',
  },
  {
    // R190 — RULE 3b: A VET IS RE-CHOSEN WHEN THE PRICE MOVES. Without it
    // the walker follows the cheaper bill daily, and a late roster sitting at
    // the break-even swaps vets 32 times in a campaign (seed 2026). Caught
    // twice: smoke's seed 7 swaps five times before dominion, and the diet
    // gate reads seed 2026's whole hire log.
    // BLIND AGAIN IF both clauses stop comparing consecutive vet hires'
    // tiers, or the diet gate stops walking seed 2026 itself (a cached save
    // carries no hire log).
    n: 482, gate: DIET, name: 'the walker re-hires its vet whenever one patient crosses the ceiling',
    file: 'tools/sim.js',
    anchor: '    : (state.__walkVetTier ?? tier) !== tier && bill(held) > bill(want));',
    to: '    : bill(held) > bill(want));',
  },
  {
    // R190 — THE CLOCK THE CALL-OUT IS SPREAD OVER IS THE ENGINE'S. The walker
    // types the battle engine's mean injury clock, so the gate inflicts
    // eighty injuries through `finishBattle` and holds the two together.
    // BLIND AGAIN IF the probe reuses a creature id (the injury stream is
    // keyed on the creature, so every roll would be the same one) or the
    // tolerance widens past the gap between 2 and 3 hours.
    n: 483, gate: SHARD_B, name: "the walker's injury clock drifts from the battle engine's, and the call-out is spread over the wrong hours",
    file: 'tools/sim.js',
    anchor: 'export const WALK_INJURY_HOURS = 3;',
    to: 'export const WALK_INJURY_HOURS = 2;',
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
    // R188 — A LIVE ANCHOR WITH A DEAD MEANING. A break that APPENDS to its
    // anchor (a tick after a title, a clause after a line) is a no-op once
    // the file already carries what it appends: 276 did exactly that from the
    // day its target shipped until a full battery noticed, and this check is what the note on
    // it said could not exist.
    else if (b.to.startsWith(b.anchor) && b.to.length > b.anchor.length && src.includes(b.to)) {
      stale.push(`${b.n}: ${b.file} already says what this break appends — its target has moved — ${b.name}`);
    }
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

// R178 — THE THREE SHIP GATES JOIN THE LIST, AND THEY WERE THE ONLY THREE
// MISSING. R100 built `offline.js`, `durable.js` and `release.js` and wired
// each one to a break, which proves a gate goes RED on demand — and never put
// any of them here, which is the half that proves it is GREEN on a clean tree.
// So the whole TWA story was verified in one direction only, and for eight
// milestones the per-milestone tier could not see it at all.
//
// Found the way these things are always found: `npm test` came back green on a
// tree whose service worker cached NOTHING, because one apostrophe inside an
// sw.js comment ("the eager budget's sake") split the SHELL literal and left
// 38 fragments that are not files. `install()` is all-or-nothing, so the app
// would have shipped with no offline story whatever. `--baseline` passed that
// tree too; only `node tools/release.js`, run by hand, said a word.
//
// They cost 72 CPU-seconds between them — release 0.0s, durable 8.1s, offline
// 63.9s — against a baseline that already spends about 1,700 across four
// lanes. That is the whole argument: the cheapest three gates in the tree were
// the three nobody ran.
// R117 — WIDE joins on the day it is written, which is R178's finding applied
// before it can bite again: `release`, the offline cold open and the IndexedDB
// round-trip were wired to breaks but to NEITHER tier, so the whole TWA story
// was only ever checked in the go-red direction and a real regression sat on
// `main` until somebody ran the gate by hand. A gate that no tier runs is a
// gate that has never passed.
const BASELINE = [SCOPE, HANDLERS, WORKER, COVSELF, TWICE, CONTEST, RETIRED, BREAKOUT, WALK, ROADMAP, A11Y, BOOT, SMOKE_PAIR, GRADE, FERAL, RUSH, RAID, OPENING, STANCE, FOUNDING, SITTING, SENT, SQUAD, OUTLOOK, TIER, CLAWS, GENPARTS, SAVES, GENSAVES, STALE, HEIGHT, WIDE, UNION, FACILITY, VAULT, TABLE, DIET, CACHEBUMP, OFFLINE, DURABLE];

const baselineLabel = (gate) => (
  gate === CACHEBUMP ? 'the worker precaches a shell that is actually there'
    : gate === OFFLINE ? 'a cached game opens on a train'
    : gate === DURABLE ? 'a 2 MB save survives localStorage being emptied'
    : gate === TWICE ? 'walkSurfaces twice in one process'
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
                : gate === WIDE ? 'the agenda and the wire are on a laptop screen, and the game uses it'
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
