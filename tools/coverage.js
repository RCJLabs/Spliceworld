// R115 — CODE NO GATE HAS EVER RUN.
//
// Every other gate in this repo asks whether the game is RIGHT. This one asks
// a question none of them can: which of it has ever executed at all. A rule
// nothing runs is a rule nobody has tested, and the answer had never been
// written down — the sixth audit measured it once, by hand, and the number
// went stale the same week.
//
//   node tools/coverage.js              # collect and judge (~10 min)
//   node tools/coverage.js --use <dir>  # judge a directory somebody else filled
//   node tools/coverage.js --report     # print every miss, not only the failures
//
// TWO COLLECTORS, because neither can see what the other does. `NODE_V8_COVERAGE`
// covers everything the suite imports; it cannot load `main.js`, the founding
// picker, the focus keeper or the sky, because those only exist in a document.
// `tools/a11y.js` walks every screen on three saves and takes V8's own precise
// coverage through CDP, writing it in the same shape. One merge reads both.
//
// JUDGED ON NAMED FUNCTIONS ONLY. A merge over the whole tree finds 168
// never-called functions and 117 of them are anonymous — arrow formatters in a
// lookup table, a listener passed inline, an error handler assigned to
// `req.onerror`. Those are real misses and they are also unactionable noise:
// you cannot put "(anonymous)" on an allowlist and mean anything by it. What a
// person can act on is a function with a name, so that is the rule, and the
// report prints the anonymous count beside it so the exclusion stays visible.
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { moduleFiles } from './scopecheck.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const USE = process.argv[process.argv.indexOf('--use') + 1];

// ---------------------------------------------------------------------------
// THE ALLOWLIST. Every entry is a function this project has decided not to
// reach, and every entry says why. R112's dial list is the model: an exemption
// nobody has to justify is how a list becomes a dumping ground, so the reason
// is a required field and the gate counts the entries.
const ALLOWED = [
  {
    file: 'save/durable.js', fn: /^(req|t)\.on(error|blocked|abort)$/,
    why: 'IndexedDB failure modes — a quota refusal, an upgrade blocked by another tab, '
      + 'a transaction the browser aborts under memory pressure. None can be provoked in a '
      + 'headless Chromium without replacing IDB with a fake, at which point the thing under '
      + 'test is the fake. R100\'s durable gate proves the success path end to end, and every '
      + 'one of these resolves to null, which is the same answer as "no backup".',
  },
  {
    file: 'battle/ui.js', fn: 'STATUS_ICONS',
    why: 'The five status formatters — venom, sleep, stun, trapped, guard. Each runs only while '
      + 'a creature carries that status, and the walk fights ONE scripted duel; reaching all five '
      + 'means five more fights driven to five specific states, which is a balance harness rather '
      + 'than an accessibility walk. tools/sim.js fights thousands and asserts the statuses; what '
      + 'is unmeasured here is the glyph, not the mechanic.',
  },
  {
    file: /-ui\.js$|^campaign\/ui\.js$/, fn: /^(lastMsg|lastAftermath)$/,
    why: 'The result binder `bindFacility` takes on four screens. It fires only when a facility '
      + 'purchase SUCCEEDS, which spends money the fixture is holding for other cards and '
      + 'changes the tier every other assertion on that screen is written against. One callback '
      + 'shape in four places; R128 already gates that every track names a real screen.',
  },
  {
    file: 'main.js', fn: /^(tick|pushNews|goto)$/,
    why: 'Forwarding arrows in the ctx object the shell hands to screens — `goto: (n, s) => '
      + 'showScreen(n, s)`. V8 names the WRAPPER after its property key, so these read as '
      + 'uncalled while the functions they forward to run on every walk. An adapter with a '
      + 'covered target is not untested code; it is the same code counted at the wrong end.',
  },
  {
    file: /^(battle\/ui|main)\.js$/, fn: /^(document|el)\.addEventListener\.once$|^flash$/,
    why: 'Browser events a headless walk does not produce: an `animationend` that never fires '
      + 'because the gate runs under reduced motion (R99, deliberately), and the one-shot '
      + '`pointerdown` that unlocks audio, which needs a real user gesture rather than a '
      + 'synthesised click. Both are unreachable BECAUSE of rules this repo chose.',
  },
  {
    file: /^battle\/(autoplay|engine)\.js$/, fn: /^whatDecidedIt$|^get length$/,
    why: 'The aftermath line for a fight SENT rather than watched, and the `length` getter on the '
      + 'event log it reads. R88\'s "Send them without me" only appears when the forecast calls a '
      + 'fight a walkover, and the walk needs its one battle in progress for the arena. Sending it '
      + 'would spend the arena pass. One path, two ends of it: nothing else asks the log how long '
      + 'it is.',
  },
  {
    file: 'campaign/director.js', fn: 'alreadyCounters',
    why: 'MEASURED UNREACHABLE, not merely unreached. The director prefers to replace a slot that '
      + 'is not already an answer to this profile, and it expresses that preference inside a sort '
      + 'comparator. `expendable` keeps only slots with `i > 0 && i < waves.length - 1`, so a '
      + '3-wave encounter yields exactly one candidate and a 2-wave encounter none — and all 26 '
      + 'authored encounters have 2 or 3 waves (16 and 10). A one-element sort never calls its '
      + 'comparator. The rule comes alive the day somebody authors a 4-wave fight; until then it '
      + 'is content that does not exist, not code that is wrong.',
  },
  {
    file: 'render/renderer.js', fn: 'developingPortrait',
    why: 'The crate a creature stands in while its shapes are still in flight — drawn only when '
      + 'the genome is known and `hasGeometry` is false, which is true for exactly as long as one '
      + 'fetch. R81 made the shapes lazy on purpose and every gate waits for the page to settle '
      + '(R159, also on purpose), so the two rules this repo chose are what close the window. '
      + 'Reaching it means serving the shape files slowly, which is a network gate, not this one.',
  },
  {
    file: 'ranch/ui.js', fn: /^(showVariantCeremony|breed-b)$/,
    why: 'A variant hatch, and the second parent picker. A variant is a rare roll the fixture '
      + 'cannot force without writing the outcome by hand — which would assert against a shape '
      + 'the breeder does not produce — and the picker pass commits the FIRST row, which builds '
      + 'the first parent\'s options and never the second\'s.',
  },
];

// ---------------------------------------------------------------------------
function mergeDir(dir) {
  const paint = new Map();
  const fns = new Map();
  const srcCache = new Map();
  const readSrc = (rel) => {
    if (!srcCache.has(rel)) {
      srcCache.set(rel, existsSync(join(root, rel)) ? readFileSync(join(root, rel), 'utf8') : null);
    }
    return srcCache.get(rel);
  };
  let procs = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    let d;
    try { d = JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { continue; }
    procs += 1;
    for (const r of d.result ?? []) {
      if (!r.url.startsWith(`file://${root}`)) continue;
      // The QUERY COMES OFF FIRST. tools/handlers.js renders each surface
      // against a module imported fresh — `campaign/ui.js?run=230` — because a
      // handler fired against the state two earlier handlers already changed is
      // a sequence no player can produce (see its header). V8 reports each of
      // those 260-odd imports under its own url, and the first draft of this
      // merge kept the `?run=` on the path, failed to find the file, and threw
      // the whole lane away. The cost was not a rounding error: `programmeHtml`,
      // `signIn` and `beginFight` all RUN there, and all three were about to be
      // reported as dead code to go and reach.
      const rel = r.url.slice(`file://${root}/`.length).replace(/[?#].*$/, '');
      if (rel.includes('node_modules/') || !rel.endsWith('.js')) continue;
      const text = readSrc(rel);
      if (text === null) continue;
      if (!paint.has(rel)) paint.set(rel, new Int32Array(text.length).fill(-1));
      if (!fns.has(rel)) fns.set(rel, new Map());
      const arr = paint.get(rel);
      const seen = fns.get(rel);
      // WITHIN a process an inner range OVERWRITES its parent — that is what a
      // zero-count block inside a called function means. Only the merge ACROSS
      // processes takes the max. Doing both with max reports 0% dead, which is
      // how the first draft of this merge lied.
      const local = new Int32Array(text.length).fill(-1);
      for (const fn of r.functions) {
        const own = fn.ranges[0];
        const key = `${fn.functionName || ''}@${own.startOffset}`;
        seen.set(key, (seen.get(key) || false) || own.count > 0);
        for (const rg of fn.ranges) {
          for (let i = rg.startOffset; i < rg.endOffset && i < local.length; i++) local[i] = rg.count;
        }
      }
      for (let i = 0; i < local.length; i++) {
        if (local[i] === -1) continue;
        arr[i] = arr[i] === -1 ? local[i] : Math.max(arr[i], local[i]);
      }
    }
  }
  return { paint, fns, readSrc, procs };
}

// A line is CODE if it carries something that can execute. Blank lines, comment
// lines and lines that are only a closing bracket are not, and counting them
// would make the percentage a measure of formatting rather than of reach.
const isCode = (line) => {
  const t = line.trim();
  if (!t) return false;
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t === '*/') return false;
  return !['}', '};', '{', ')', ');', '],', '}),', '})', '],', ']'].includes(t);
};

export function judge(dir) {
  const { paint, fns, readSrc, procs } = mergeDir(dir);
  const shipped = moduleFiles()
    .map((p) => p.replace(`${root}/`, ''))
    .filter((p) => !p.startsWith('tools/'))
    .sort();

  const misses = [];
  let code = 0; let dead = 0; let anon = 0; let named = 0;
  for (const rel of shipped) {
    if (!paint.has(rel)) continue;
    const text = readSrc(rel);
    const lines = text.split('\n');
    let off = 0;
    const arr = paint.get(rel);
    for (const line of lines) {
      if (isCode(line)) {
        code += 1;
        let ran = false;
        for (let j = off; j < off + line.length; j++) if (arr[j] > 0) { ran = true; break; }
        if (!ran) dead += 1;
      }
      off += line.length + 1;
    }
    for (const [key, called] of fns.get(rel)) {
      if (called) continue;
      const i = key.lastIndexOf('@');
      const name = key.slice(0, i);
      if (!name) { anon += 1; continue; }
      named += 1;
      const lineNo = text.slice(0, +key.slice(i + 1)).split('\n').length;
      misses.push({ rel, name, line: lineNo, decl: (lines[lineNo - 1] ?? '').trim().slice(0, 72) });
    }
  }

  const unloaded = shipped.filter((p) => !paint.has(p));
  // Both fields take a string or a RegExp: one entry covers a rule, and a rule
  // that spans four screens should not need four entries to say so.
  const hit = (pat, value) => (pat instanceof RegExp ? pat.test(value) : pat === value);
  const excused = (m) => ALLOWED.find((a) => hit(a.file, m.rel) && hit(a.fn, m.name));
  const failures = misses.filter((m) => !excused(m)).sort((a, b) => a.rel.localeCompare(b.rel) || a.line - b.line);
  // An entry that excuses NOTHING is the rot this list exists to prevent: it
  // reads as a live argument for skipping something that has since been
  // reached, and the next person to shrink the list has to re-derive which
  // half of it still means anything. Deleting a used one goes red as a
  // failure; leaving a spent one goes red here.
  const idle = ALLOWED.filter((a) => !misses.some((m) => hit(a.file, m.rel) && hit(a.fn, m.name)));
  return { procs, shipped, code, dead, anon, named, misses, unloaded, failures, idle };
}

function collect() {
  const dir = mkdtempSync(join(tmpdir(), 'sw-coverage-'));
  console.log('coverage: running the suite under NODE_V8_COVERAGE…');
  execFileSync('node', ['tools/suite.js'], { cwd: root, stdio: 'inherit', env: { ...process.env, NODE_V8_COVERAGE: dir } });
  console.log('coverage: walking every screen with precise coverage on…');
  execFileSync('node', ['tools/a11y.js'], { cwd: root, stdio: 'inherit', env: { ...process.env, SW_COVERAGE: dir } });
  return dir;
}

// ---------------------------------------------------------------------------
// THE MERGE, CHECKED AGAINST ITSELF (`--self`). Collection is ten minutes of
// I/O and is proven by this gate's own green run; the MERGE is arithmetic, and
// arithmetic deserves arithmetic tests. Every case below is a defect this
// milestone actually shipped and then found, so a break aimed here is aimed at
// something that has already gone wrong once.
//
// It writes a two-process capture over a real module and reads the verdict
// back, which is why it needs no fixture on disk and runs in milliseconds.
function selfCheck() {
  const rel = 'util/text.js';
  const text = readFileSync(join(root, rel), 'utf8');
  const url = `file://${root}/${rel}`;
  const dir = mkdtempSync(join(tmpdir(), 'sw-coverage-self-'));
  const write = (name, result) => writeFileSync(join(dir, name), JSON.stringify({ result }));
  const fn = (functionName, ranges) => ({ functionName, isBlockCoverage: true, ranges });
  const bad = [];
  const say = (ok, what) => { if (!ok) bad.push(what); };

  // THE QUERY. tools/handlers.js imports a screen module as `…/ui.js?run=230`
  // so each surface renders fresh. Keeping the query on the path made every
  // one of those 260-odd imports miss `readSrc` and vanish; 307 lines and
  // eight functions read as dead that run on every suite.
  write('a.json', [{ scriptId: '1', url: `${url}?run=7`, functions: [
    fn('selfQuery', [{ startOffset: 0, endOffset: 40, count: 3 }]),
  ] }]);
  // WITHIN a process an inner range OVERWRITES its parent: a zero-count block
  // inside a called function is the only way V8 says "this branch did not
  // run". Taking the max here instead reported the whole tree 0.0% dead.
  write('b.json', [{ scriptId: '1', url, functions: [
    fn('selfOuter', [{ startOffset: 40, endOffset: 90, count: 1 },
      { startOffset: 50, endOffset: 70, count: 0 }]),
  ] }]);
  // ACROSS processes the max wins, or a lane that skipped a function would
  // erase the lane that ran it. TWO PAIRS, IN OPPOSITE ORDERS, because
  // `readdirSync` promises no ordering and the first draft of this case put
  // the larger count last — so an overwrite merge still landed on 4 and the
  // check passed while the arithmetic was wrong. Whichever way the directory
  // enumerates, one of these two pairs ends on its smaller count.
  write('c.json', [{ scriptId: '1', url, functions: [
    fn('selfShared', [{ startOffset: 90, endOffset: 120, count: 0 }]),
  ] }]);
  write('d.json', [{ scriptId: '1', url, functions: [
    fn('selfShared', [{ startOffset: 90, endOffset: 120, count: 4 }]),
  ] }]);
  write('e.json', [{ scriptId: '1', url, functions: [
    fn('selfMirror', [{ startOffset: 120, endOffset: 150, count: 4 }]),
  ] }]);
  write('f.json', [{ scriptId: '1', url, functions: [
    fn('selfMirror', [{ startOffset: 120, endOffset: 150, count: 0 }]),
  ] }]);

  const { paint, fns } = mergeDir(dir);
  rmSync(dir, { recursive: true, force: true });
  const arr = paint.get(rel);
  const seen = fns.get(rel);
  say(!!arr, 'a capture whose urls carry a `?query` never reached the file it belongs to');
  if (arr) {
    say(arr[10] === 3, 'a query-string url did not paint the module it is a copy of');
    say(arr[45] === 1, 'a called function did not paint as run');
    say(arr[60] === 0, 'an inner zero-count block did not overwrite its parent within one process');
    say(arr[100] === 4 && arr[130] === 4,
      'a function run in one process and skipped in another did not merge to the larger count');
  }
  say(seen?.get('selfQuery@0') === true, 'a function called under a `?query` url did not count as called');
  say(seen?.get('selfShared@90') === true && seen?.get('selfMirror@120') === true,
    'a function called in only one process did not count as called');
  say(seen?.get('selfOuter@40') === true, 'a function whose body has a dead branch did not count as called');

  // AND THE LIST ITSELF. An entry that excuses nothing is rot; an entry that
  // excuses something must stop it failing.
  const mine = [{ file: rel, name: 'selfDead', line: 1, decl: '' }];
  const probe = (list) => {
    const h = (pat, v) => (pat instanceof RegExp ? pat.test(v) : pat === v);
    const used = (a) => mine.some((m) => h(a.file, m.rel ?? rel) && h(a.fn, m.name));
    return { covered: list.some(used), idle: list.filter((a) => !used(a)).length };
  };
  say(probe([{ file: rel, fn: /^selfDead$/ }]).covered, 'an allowlist entry matching a miss did not excuse it');
  say(probe([{ file: rel, fn: 'selfAlive' }]).idle === 1, 'an allowlist entry matching nothing was not reported idle');
  return bad;
}

async function main() {
  if (process.argv.includes('--self')) {
    const bad = selfCheck();
    if (bad.length) {
      console.error(`coverage ✗  the merge is wrong in ${bad.length} way${bad.length === 1 ? '' : 's'}`);
      for (const b of bad) console.error(`  · ${b}`);
      process.exit(1);
    }
    console.log('coverage ✓  the merge strips queries, overwrites within a process, takes the max across them, and the allowlist answers');
    return;
  }
  let dir = USE;
  let temp = null;
  if (!dir) { dir = collect(); temp = dir; }
  const r = judge(dir);
  const problems = [];

  // 1. Nothing ships that nothing runs.
  for (const u of r.unloaded) problems.push(`${u} is never loaded by any gate, so none of it has ever run`);

  // 2. Every NAMED function is called, or excused in writing.
  for (const f of r.failures) problems.push(`${f.rel}:${f.line} ${f.name}() is never called — ${f.decl}`);

  // 3. The allowlist stays small, stays argued, and carries nothing spent.
  const CAP = 10;
  if (ALLOWED.length >= CAP) problems.push(`the allowlist carries ${ALLOWED.length} entries, at or over the cap of ${CAP}`);
  for (const a of ALLOWED) {
    if (!a.why || a.why.length < 20) problems.push(`an allowlist entry for ${a.file} carries no reason`);
  }
  for (const a of r.idle) problems.push(`the allowlist entry for ${a.file} ${a.fn} excuses nothing any more — delete it`);

  if (REPORT) {
    for (const m of r.misses.sort((a, b) => a.rel.localeCompare(b.rel) || a.line - b.line)) {
      console.log(`  ${(m.rel + ':' + m.line).padEnd(34)} ${m.name.padEnd(24)} ${m.decl}`);
    }
    console.log('');
  }
  console.log(`coverage: ${r.procs} processes merged · ${r.shipped.length - r.unloaded.length}/${r.shipped.length} shipped modules loaded`);
  console.log(`coverage: ${r.dead} of ${r.code} code lines never ran (${(r.dead / r.code * 100).toFixed(1)}%)`);
  console.log(`coverage: ${r.named} named functions never called, ${r.anon} anonymous ones not judged`);
  if (temp) rmSync(temp, { recursive: true, force: true });

  if (problems.length) {
    console.error(`\ncoverage ✗  ${problems.length} problem${problems.length === 1 ? '' : 's'}`);
    for (const p of problems.slice(0, 60)) console.error(`  · ${p}`);
    if (problems.length > 60) console.error(`  … and ${problems.length - 60} more`);
    process.exit(1);
  }
  console.log(`coverage ✓  every shipped module runs under a gate · every named function is called or excused in writing (${ALLOWED.length} of ${CAP} allowed)`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
