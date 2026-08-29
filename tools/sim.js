// M4.5 — Balance harness. Headless Monte Carlo over chimera builds vs. the
// enemy roster, using the exact battle engine the browser runs (that's why
// battle/ is DOM-free). Outputs win-rate tables and flags degenerate
// builds. Run: node tools/sim.js [--builds=40] [--seeds=3] [--grade=standard] [--plant]
//
// --plant injects a deliberately broken combo (Injection: power 500, cost 0)
// and proves the harness catches it — the milestone's acceptance test.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { indexContent } from '../render/renderer.js';
import { analyze } from '../splice/physiology.js';
import { createBattle, step, playerActions, playerActive } from '../battle/engine.js';
import { mulberry32, hashString, pick } from '../util/rng.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

export function loadSimContent() {
  return indexContent({
    frames: readJSON('data/frames.json'),
    parts: readJSON('data/parts.json'),
    species: readJSON('data/species.json'),
    combos: readJSON('data/combos.json'),
    enemies: readJSON('data/enemies.json'),
    keywords: readJSON('data/keywords.json'),
    classes: readJSON('data/classes.json'),
  classes: readJSON('data/classes.json'),
  });
}

// A lab-perfect chimera: settled, fully bonded, uniform grade — so the sim
// measures the BUILD, not husbandry or obedience noise.
export function makeSimChimera(frame, partIds, grade, content) {
  const tokens = {};
  for (const pid of partIds) {
    const part = content.parts[pid];
    tokens[part.slot] = {
      id: `sim-${pid}`,
      partId: pid,
      grade,
      donor: { name: 'Simulacrum', species: part.species, stars: 3, extractedAt: 0 },
    };
  }
  const report = analyze(frame, Object.values(tokens), content);
  return {
    id: `sim-${frame}-${partIds.join('+')}`,
    name: 'Simulacrum',
    frame,
    tokens,
    createdAt: 0,
    settleUntil: 0, // settled
    instability: report.instability,
    bond: 100, // fully bonded — obedience is not under test here
    temperament: null,
    injury: null,
  };
}

// Greedy pilot: strongest affordable damaging move, else rest. Deliberately
// naive and identical for every build — a fixed yardstick.
function pilotAction(battle) {
  const actions = playerActions(battle);
  if (!actions.length) return null;
  const release = actions.find((a) => a.type === 'release');
  if (release) return release;
  const moves = actions.filter((a) => a.type === 'move');
  const me = playerActive(battle);
  moves.sort((a, b) => me.moves[b.index].power - me.moves[a.index].power);
  if (moves.length && me.moves[moves[0].index].power > 0) return moves[0];
  return actions.find((a) => a.type === 'rest') ?? actions[0];
}

export function scriptedBattle(chimera, encounterId, content, seed) {
  const battle = createBattle([chimera], content.encounters[encounterId], content, seed, 1);
  let guard = 0;
  while (!battle.over && guard++ < 300) {
    const action = pilotAction(battle);
    if (!action) break;
    step(battle, action, content);
  }
  return { outcome: battle.outcome ?? 'stall', turns: battle.turn };
}

export function buildLabel(frame, partIds, grade) {
  return `${frame} · ${partIds.map((p) => p.replace('_', ':')).join(' + ')} [${grade}]`;
}

// Build pool: every purebred, every combo pairing (fleshed out with a body),
// then seeded random mixes. Heads are mandatory (engine rule).
export function sampleBuilds(content, n, seed) {
  const rng = mulberry32(hashString(`sim:${seed}`));
  const bySlot = {};
  for (const part of Object.values(content.parts)) (bySlot[part.slot] ??= []).push(part.id);
  const frames = Object.keys(content.frames);
  const builds = [];
  const seen = new Set();
  const push = (frame, partIds) => {
    const key = frame + '|' + [...partIds].sort().join(',');
    if (seen.has(key)) return;
    seen.add(key);
    builds.push({ frame, partIds: [...partIds] });
  };

  for (const sp of Object.keys(content.species)) {
    const partIds = Object.values(content.parts).filter((p) => p.species === sp).map((p) => p.id);
    push(content.species[sp].frame, partIds);
  }
  for (const combo of Object.values(content.combos)) {
    const partIds = new Set(combo.parts);
    if (![...partIds].some((p) => content.parts[p].slot === 'head')) partIds.add(pick(rng, bySlot.head));
    const filled = new Set([...partIds].map((p) => content.parts[p].slot));
    for (const slot of ['hindlimbs', 'organ']) {
      if (!filled.has(slot)) partIds.add(pick(rng, bySlot[slot]));
    }
    push(pick(rng, frames), [...partIds]);
  }
  while (builds.length < n) {
    const partIds = [pick(rng, bySlot.head)];
    const filled = new Set(['head']);
    for (const slot of ['forelimbs', 'hindlimbs', 'tail', 'hide', 'organ']) {
      if (rng() < 0.7) {
        partIds.push(pick(rng, bySlot[slot]));
        filled.add(slot);
      }
    }
    push(pick(rng, frames), partIds);
  }
  return builds;
}

export function runSim(content, { builds = 40, seedsPer = 3, grade = 'standard', seed = 2026 } = {}) {
  const pool = sampleBuilds(content, builds, seed);
  const encounterIds = Object.keys(content.encounters);
  const rows = [];

  for (const [i, build] of pool.entries()) {
    const chimera = makeSimChimera(build.frame, build.partIds, grade, content);
    const perEncounter = {};
    let wins = 0;
    let games = 0;
    let turnsInWins = 0;
    for (const enc of encounterIds) {
      let encWins = 0;
      for (let s = 0; s < seedsPer; s++) {
        const r = scriptedBattle(chimera, enc, content, hashString(`b${i}e${enc}s${s}`));
        games++;
        if (r.outcome === 'win') {
          wins++;
          encWins++;
          turnsInWins += r.turns;
        }
      }
      perEncounter[enc] = encWins / seedsPer;
    }
    rows.push({
      label: buildLabel(build.frame, build.partIds, grade),
      partIds: build.partIds,
      winRate: wins / games,
      avgWinTurns: wins ? turnsInWins / wins : null,
      perEncounter,
    });
  }
  rows.sort((a, b) => b.winRate - a.winRate);

  // Degeneracy is relative: as the roster and encounter set grow, a fixed
  // "wins 85%" bar stops catching glass cannons that one-shot everything but
  // still lose to an alpha strike. Flag absolute monsters AND peer outliers.
  const median = (xs) => {
    const v = xs.filter((x) => x != null).sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)] : null;
  };
  const medWin = median(rows.map((r) => r.winRate)) ?? 0;
  const medTurns = median(rows.map((r) => r.avgWinTurns)) ?? 99;

  const flags = [];
  for (const row of rows) {
    const turns = row.avgWinTurns ?? 99;
    const monster = row.winRate >= 0.85 && turns <= 5;
    const oneShot = row.winRate > 0 && turns <= 2.5;
    const outlier = row.winRate >= medWin + 0.3 && turns <= medTurns - 1.0;
    if (monster || oneShot || outlier) {
      const why = monster
        ? `wins ${pct(row.winRate)} in ~${turns.toFixed(1)} turns — nerf something`
        : oneShot
          ? `deletes encounters in ~${turns.toFixed(1)} turns — check its damage numbers`
          : `${pct(row.winRate)} vs peer median ${pct(medWin)} and ${turns.toFixed(1)} vs ${medTurns.toFixed(1)} turns — outlier`;
      flags.push({ kind: 'OP', label: row.label, partIds: row.partIds, why });
    } else if (row.winRate === 0) {
      flags.push({ kind: 'TRASH', label: row.label, partIds: row.partIds, why: 'cannot win anything — dead content or a hole in the curve' });
    }
  }
  return { rows, flags, encounterIds, medWin, medTurns };
}

// The planted defect for the acceptance test: a combo move with absurd
// numbers, exactly the kind of data typo the harness exists to catch.
export function plantBrokenCombo(content) {
  const mutated = structuredClone(content);
  mutated.combos.injection.move = { power: 500, cost: 0, acc: 100, tags: [], keywords: {} };
  return mutated;
}

const pct = (x) => `${Math.round(x * 100)}%`;

function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=');
      return [k, v ?? true];
    })
  );
  let content = loadSimContent();
  if (args.plant) {
    console.log('⚠ planting a broken Injection combo (power 500, cost 0)…\n');
    content = plantBrokenCombo(content);
  }
  const opts = {
    builds: Number(args.builds ?? 40),
    seedsPer: Number(args.seeds ?? 3),
    grade: args.grade ?? 'standard',
  };
  const t0 = Date.now();
  const { rows, flags, encounterIds } = runSim(content, opts);

  const encHeads = encounterIds.map((e) => e.padStart(9)).join(' ');
  console.log(`win-rate table (${rows.length} builds × ${encounterIds.length} encounters × ${opts.seedsPer} seeds, grade=${opts.grade})\n`);
  console.log(`  win%  turns ${encHeads}  build`);
  for (const row of rows) {
    const enc = encounterIds.map((e) => pct(row.perEncounter[e]).padStart(9)).join(' ');
    console.log(
      `${pct(row.winRate).padStart(6)} ${row.avgWinTurns ? row.avgWinTurns.toFixed(1).padStart(6) : '     —'} ${enc}  ${row.label}`
    );
  }
  console.log(`\n${flags.length ? 'FLAGS:' : 'no degenerate builds flagged.'}`);
  for (const f of flags) console.log(`  [${f.kind}] ${f.label} — ${f.why}`);
  console.log(`\n${rows.length * encounterIds.length * opts.seedsPer} battles in ${Date.now() - t0}ms`);

  if (args.plant) {
    const caught = flags.some(
      (f) => f.kind === 'OP' && f.partIds.includes('cobra_head') && f.partIds.includes('cobra_organ')
    );
    console.log(caught ? '\nPLANT CAUGHT ✓ — the harness flagged the broken combo.' : '\nPLANT MISSED ✗');
    process.exitCode = caught ? 0 : 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
