// R125 — DOES THE LETTER PREDICT THE FIGHT?
//
// The tier claims a creature graded A wins more than one graded B. That is a
// claim about the battle engine, not about the scoring code, and the only
// instrument that can settle it is the engine itself. So this builds a fresh
// population of random legal chimeras, grades each one, fights every one of
// them across the whole shipped encounter table, and asks whether the bands
// come out in order.
//
// HELD OUT ON PURPOSE. The model in `data/tiers.json` was fitted on a
// population drawn from seed 'fit2'; this one draws from 'gate125'. Scoring
// a model on the sample it was fitted to measures memorisation, and the cut
// points are exactly the part most at risk: tuned against the fitting sample
// they reached zero middle-50% overlap, and on a held-out draw three of the
// five seams overlap again. That is what overfitting a threshold looks like,
// and it is why the bar below is MONOTONICITY rather than separation.
//
// What monotonicity buys is the thing the player is promised: a higher
// letter is a better creature, every time, on a sample nobody tuned against.
// What it does not promise is that every A beats every B — the bands overlap
// at their edges, the letters are six buckets over a continuum, and claiming
// otherwise would be the kind of precision this measurement cannot support.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { indexContent } from '../render/renderer.js';
import { CONTENT_FILES } from '../data/loader.js';
import { analyze } from '../splice/physiology.js';
import { knownMoves } from '../battle/moves.js';
import { movesFromTokens } from '../battle/statblock.js';
import { GRADES } from '../splice/extract.js';
import { tierOfBuild } from '../splice/tier.js';
import { makeSimChimera, scriptedBattle, benchMoveset } from './sim.js';
import { hashString, mulberry32 } from '../util/rng.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const N = Number(process.argv.find((a) => /^--n=/.test(a))?.slice(4) ?? 300);
const SEEDS = 8;

// Every adjacent pair must separate by at least this much. A bar rather than
// a fingerprint: 3pp is comfortably under the 4.9pp the shipped scale
// actually manages, so ordinary noise cannot fail it — but a band that stops
// meaning anything collapses the gap and does.
const MIN_GAP = 0.03;

const raw = {};
for (const f of CONTENT_FILES) raw[f] = JSON.parse(readFileSync(join(root, 'data', `${f}.json`), 'utf8'));
const content = indexContent(raw);

const LADDER = Object.keys(content.encounters);
const LETTERS = (content.tiers?.tiers ?? []).map((t) => t.id);
const traitIds = Object.keys(content.traits ?? {});
const bySlot = {};
for (const p of Object.values(content.parts)) (bySlot[p.slot] ??= []).push(p);
const frames = Object.keys(content.frames);
const rng = mulberry32(hashString('gate125'));
const pick = (a) => a[Math.floor(rng() * a.length)];

const byTier = {};
for (let i = 0; i < N; i++) {
  const frame = pick(frames);
  const slots = content.frames[frame]?.slots ?? Object.keys(bySlot);
  // Sometimes purebred, so the matched-set term is exercised rather than
  // being a column of zeroes.
  const pure = rng() < 0.3 ? pick(Object.keys(content.species)) : null;
  const partIds = slots.map((s) => {
    const pool = pure ? (bySlot[s] ?? []).filter((p) => p.species === pure) : bySlot[s];
    return pool && pool.length ? pick(pool).id : null;
  }).filter(Boolean);
  if (partIds.length < 4) continue;
  const c = makeSimChimera(frame, partIds, pick(GRADES).id, content);
  // Traits are the biggest lever in the game and `makeSimChimera` sets none,
  // which is how R125's first calibration ran blind to them. Set here.
  for (const tk of Object.values(c.tokens)) {
    const k = Math.floor(rng() * 3);
    tk.traits = Array.from({ length: k }, () => pick(traitIds)).filter((v, j, a) => a.indexOf(v) === j);
  }
  const tokens = Object.values(c.tokens);
  const report = analyze(frame, tokens, content, tokens.length);
  c.instability = report.instability;
  c.moveset = benchMoveset(knownMoves(c, content, () => movesFromTokens(tokens, report, content)));
  const tier = tierOfBuild(report, tokens, content, { moveset: c.moveset });
  if (!tier) { console.error('tier ✗  tierOfBuild returned nothing — data/tiers.json is not reaching the engine'); process.exit(1); }
  let wins = 0;
  let fights = 0;
  for (const e of LADDER) {
    for (let s = 0; s < SEEDS; s++) {
      if (scriptedBattle(c, content.encounters[e], content, hashString(`g${e}${s}${i}`), 1).outcome === 'win') wins++;
      fights++;
    }
  }
  (byTier[tier.id] ??= []).push(wins / fights);
}

const problems = [];
const stat = {};
for (const L of LETTERS) {
  const ws = (byTier[L] ?? []).sort((a, b) => a - b);
  if (ws.length < 5) { problems.push(`tier ${L} drew ${ws.length} creatures — too few to say anything about it`); continue; }
  stat[L] = {
    n: ws.length,
    mean: ws.reduce((a, b) => a + b, 0) / ws.length,
    p25: ws[Math.floor(0.25 * (ws.length - 1))],
    p75: ws[Math.floor(0.75 * (ws.length - 1))],
  };
}
if (REPORT) {
  for (const L of LETTERS) {
    const s = stat[L];
    if (!s) continue;
    console.log(`  ${L}  n=${String(s.n).padStart(3)}  measured ${(s.mean * 100).toFixed(1)}%  IQR ${(s.p25 * 100).toFixed(0)}-${(s.p75 * 100).toFixed(0)}%`);
  }
  console.log('');
}
let gapMin = Infinity;
for (let i = 0; i < LETTERS.length - 1; i++) {
  const a = stat[LETTERS[i]];
  const b = stat[LETTERS[i + 1]];
  if (!a || !b) continue;
  const gap = b.mean - a.mean;
  gapMin = Math.min(gapMin, gap);
  if (gap <= 0) {
    problems.push(`${LETTERS[i + 1]} (${(b.mean * 100).toFixed(1)}%) does not beat ${LETTERS[i]} (${(a.mean * 100).toFixed(1)}%) — the scale is out of order`);
  } else if (gap < MIN_GAP) {
    problems.push(`${LETTERS[i]} to ${LETTERS[i + 1]} is only ${(gap * 100).toFixed(1)}pp, under the ${(MIN_GAP * 100).toFixed(0)}pp a band has to be worth`);
  }
}

if (problems.length) {
  console.error(`tier ✗  ${problems.length} problem${problems.length === 1 ? '' : 's'}`);
  for (const p of problems) console.error(`  · ${p}`);
  process.exit(1);
}
const lo = stat[LETTERS[0]];
const hi = stat[LETTERS[LETTERS.length - 1]];
console.log(`tier ✓  ${LETTERS.join(' < ')} in order on a held-out draw of ${N}`
  + ` · ${(lo.mean * 100).toFixed(0)}% at ${LETTERS[0]} to ${(hi.mean * 100).toFixed(0)}% at ${LETTERS[LETTERS.length - 1]}`
  + ` · smallest step ${(gapMin * 100).toFixed(1)}pp`);
