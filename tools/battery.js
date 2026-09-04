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

const VERBOSE = process.argv.includes('--verbose');

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
for (const gate of [SCOPE, HANDLERS]) {
  const r = run(gate);
  console.log(`  ${r.ok ? 'PASS' : 'FAIL'} ${gate.join(' ')}${r.ok ? '' : '\n' + r.out.split('\n').slice(0, 4).map((l) => '    ' + l).join('\n')}`);
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
