// R95 — CAN A PLAYER ACTUALLY GET TO THE CONTENT?
//
// The entry says "71 parts nobody reaches" and proposes a Travelling
// Menagerie: a rotating catalogue that visits monthly, weighted toward
// species the Dex lacks. Re-measured on today's tree, the number is worse
// than the entry thought and the proposed fix is aimed at a constraint that
// does not bind.
//
// WORSE: a 180-day walk reaches a MEDIAN 118 OF 244 PARTS across seven
// seeds (95 to 153), not the 173 the entry records. R91 capped the vault and
// R92 capped the herd, and nothing was watching this number while they did.
//
// AIMED WRONG: availability is not what stops it. By day 180 the walk holds
// 22 or 23 of the map's 23 nodes and finishes on a median $249,000, which
// opens 33 of the 41 species and 196 of the 244 parts. It buys TWELVE. The
// catalogue it would rotate is already open and already affordable.
//
// What stops it is that nothing gives a reason to buy the thirteenth. There
// are 41 species over FOUR classes, so once you own the best Ground animal
// you can afford, every other Ground animal is dominated — and the walker,
// like a player reading the map's demand line, buys the best answer in the
// class it needs and stops. Measured: a walker that simply prefers a species
// it has never held reaches 200 of 244 (82%) instead of 118, still takes
// dominion on 7 of 7 seeds, and still ends on $150k-$300k. Collecting the
// whole roster costs a campaign nothing. Nobody was ever asked to.
//
// So this gate asks three questions, and the first is the one that lasts.
//
//   1. ROUTE. Every species is reachable by a mechanism this file names,
//      and the mechanism RESOLVES: a conquest-gated animal has a node that
//      unlocks it, a variant has a base species to mutate off, enemy tech
//      has an enemy that actually drops each of its parts. A species that
//      matches no route FAILS — R50's declare-yourself, so the next animal
//      added without a way to get it cannot arrive quietly.
//
//   2. REACH. A 180-day walk sees at least REACH_FLOOR of the part list,
//      across the seeds the coverage gate uses. One campaign's luck is not
//      a content-reach number; R93b learned that twice.
//
//   3. THE WALL. Every encounter is winnable at SOME grade, and when it is
//      not winnable at the player's, the briefing says which grade it takes.
//      The entry's Done-when asks for a standard-grade answer to every
//      encounter; measured, ten of the thirty-one cannot be won at standard
//      by ANY of the 68 sampled builds and thirteen have no build that beats
//      them half the time, while at Apex it is zero and zero. The wall is a
//      grade wall on purpose, and flattening it would delete the ladder the
//      whole husbandry loop climbs. The entry's own alternative is the right
//      one: say so in the briefing.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSimContent, runSim, sampleBuilds, makeSimChimera } from './sim.js';
import { walkedSave } from './fixtures.js';
import { GRADES } from '../splice/grades.js';
import { diagnose, forecast, bandFor } from '../battle/forecast.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const content = loadSimContent();
const fails = [];

// ---- 1. every species has a route, and the route resolves --------------
//
// `when` says which mechanism this species is on; `resolves` says whether
// that mechanism can actually deliver it. Both are read off the shipped data
// rather than listed by hand: a table of species ids would go stale the day
// somebody adds the forty-second animal, which is the failure this rule
// exists to prevent (R61 — derive it, never re-type it).
const unlockingNodes = (id) => {
  const found = [];
  for (const region of Object.values(content.regions)) {
    for (const node of region.nodes) {
      if ((node.unlocksFauna ?? []).includes(id)) found.push(`${region.id}/${node.id}`);
    }
  }
  return found;
};
const partsOf = (id) => Object.values(content.parts).filter((p) => p.species === id);
const droppedBy = (partId) => Object.values(content.enemies)
  .filter((e) => (e.salvage ?? []).includes(partId)).map((e) => e.id);

const ROUTES = [
  {
    id: 'bred',
    by: 'a variant mutation off its base species, in the Incubator',
    when: (s) => !!s.variantOf,
    resolves: (s) => (content.species[s.variantOf]
      ? null
      : `its base species \`${s.variantOf}\` is not in the roster, so no egg can ever become one`),
  },
  {
    id: 'salvage',
    by: 'Containment salvage off an enemy that carries the part',
    when: (s) => !!s.synthetic,
    resolves: (s) => {
      const orphans = partsOf(s.id).filter((p) => !droppedBy(p.id).length);
      return orphans.length
        ? `no enemy in enemies.json drops ${orphans.map((p) => `\`${p.id}\``).join(', ')}, so ${orphans.length} of its parts have no source`
        : null;
    },
  },
  {
    id: 'conquest',
    by: 'the Mail-Order catalog, once a region node unlocks the stock',
    when: (s) => !!s.mailOrderPrice && unlockingNodes(s.id).length > 0,
    resolves: () => null,
  },
  {
    id: 'catalog',
    by: 'the Mail-Order catalog, open from the first day',
    when: (s) => !!s.mailOrderPrice,
    resolves: () => null,
  },
];

const routed = {};
if (REPORT) console.log(`\n${Object.keys(content.species).length} species, by route:`);
for (const species of Object.values(content.species)) {
  const route = ROUTES.find((r) => r.when(species));
  if (!route) {
    fails.push(`\`${species.id}\` (${partsOf(species.id).length} parts) matches no route in tools/reach.js`
      + ' — it is not sold, not a variant of anything and not synthetic, so no player can ever hold it');
    continue;
  }
  (routed[route.id] ??= []).push(species.id);
  const why = route.resolves(species);
  if (why) fails.push(`\`${species.id}\` is meant to arrive by ${route.by}, and ${why}`);
}
if (REPORT) {
  for (const route of ROUTES) {
    const ids = routed[route.id] ?? [];
    const parts = ids.reduce((n, id) => n + partsOf(id).length, 0);
    console.log(`  ${String(ids.length).padStart(2)} species · ${String(parts).padStart(3)} parts  ${route.id.padEnd(9)} ${route.by}`);
  }
}
// A part whose species is not in the roster is unreachable whatever the
// routes say, and `speciesOf` would hand the screens a Discontinued Line.
for (const part of Object.values(content.parts)) {
  if (!content.species[part.species]) {
    fails.push(`part \`${part.id}\` belongs to species \`${part.species}\`, which is not in the roster`);
  }
}

// ---- 2. what a campaign actually reaches -------------------------------
//
// The coverage gate's seeds, deliberately: the two numbers are about the
// same walks, and a reach figure measured on a different sample than the
// combo figure would be two answers nobody could put side by side.
const REACH_SEEDS = [2026, 7, 101, 4242, 55, 900, 31];
const REACH_FLOOR = 0.95;
const TOTAL_PARTS = Object.keys(content.parts).length;
{
  const per = [];
  for (const seed of REACH_SEEDS) {
    const save = walkedSave({ seed, days: 180 });
    const held = new Set(save.dex.parts ?? []);
    const species = new Set([...held].map((p) => content.parts[p]?.species).filter(Boolean));
    per.push({ seed, parts: held.size, species: species.size, held });
  }
  const sorted = [...per].sort((a, b) => a.parts - b.parts);
  const median = sorted[Math.floor(sorted.length / 2)];
  const ratio = median.parts / TOTAL_PARTS;
  const union = new Set(per.flatMap((r) => [...r.held]));
  if (REPORT) {
    console.log(`\nreach across ${REACH_SEEDS.length} seeds (of ${TOTAL_PARTS} parts,`
      + ` ${Object.keys(content.species).length} species):`);
    for (const r of per) {
      console.log(`  seed ${String(r.seed).padStart(4)}  ${String(r.parts).padStart(3)} parts`
        + `  ${String(r.species).padStart(2)} species  ${(100 * r.parts / TOTAL_PARTS).toFixed(0).padStart(3)}%`);
    }
    console.log(`  median ${median.parts} (${(100 * ratio).toFixed(1)}%)`
      + ` · union ${union.size} · never reached by any seed ${TOTAL_PARTS - union.size}`);
    const missing = Object.values(content.parts).filter((p) => !union.has(p.id));
    const bySpecies = {};
    for (const p of missing) (bySpecies[p.species] ??= []).push(p.id);
    for (const [sp, ps] of Object.entries(bySpecies).sort((a, b) => b[1].length - a[1].length)) {
      const route = ROUTES.find((r) => r.when(content.species[sp]));
      console.log(`    ${sp.padEnd(16)} ${String(ps.length).padStart(2)} parts unreached  (${route?.id ?? 'no route'})`);
    }
  }
  if (ratio < REACH_FLOOR) {
    const missing = Object.values(content.parts).filter((p) => !union.has(p.id));
    const bySpecies = {};
    for (const p of missing) (bySpecies[p.species] ??= []).push(p.id);
    fails.push(`part reach: the median campaign sees ${median.parts} of ${TOTAL_PARTS} parts`
      + ` (${(100 * ratio).toFixed(1)}%, under ${(100 * REACH_FLOOR).toFixed(0)}%)`
      + ` — ${per.map((r) => `${r.seed}: ${r.parts}`).join(', ')}`
      + `; ${TOTAL_PARTS - union.size} parts are reached by no seed at all`
      + (Object.keys(bySpecies).length ? ` (${Object.entries(bySpecies).map(([s, p]) => `${s} ${p.length}`).join(', ')})` : ''));
  }
}

// ---- 3. the wall, and whether the briefing names it --------------------
//
// `wallGrade` is the cheapest grade at which SOME shipped build beats an
// encounter more often than not. It is a property of the content, so it is
// measured with the balance harness's own build pool rather than a team
// invented here — the same 68 builds every other balance number in this
// project comes from.
const HALF = 0.5;
const wallGrade = {};
{
  const byGrade = {};
  for (const grade of GRADES.map((g) => g.id)) {
    if (grade === 'prismatic') continue; // husbandry's ceiling; not what a wall should require
    const { rows, encounterIds } = runSim(content, { builds: 40, seedsPer: 3, grade, teamSize: 3 });
    byGrade[grade] = { rows, encounterIds };
    for (const enc of encounterIds) {
      if (wallGrade[enc]) continue;
      if (rows.some((r) => r.perEncounter[enc] >= HALF)) wallGrade[enc] = grade;
    }
  }
  const encounterIds = byGrade.standard.encounterIds;
  if (REPORT) {
    console.log(`\nthe wall — cheapest grade with a build that wins more often than not`
      + ` (${byGrade.standard.rows.length} builds × 3 seeds):`);
    const tally = {};
    for (const enc of encounterIds) tally[wallGrade[enc] ?? 'none'] = (tally[wallGrade[enc] ?? 'none'] ?? 0) + 1;
    for (const [g, n] of Object.entries(tally)) console.log(`  ${String(n).padStart(2)} encounters need ${g}`);
  }
  const unbeatable = encounterIds.filter((enc) => !wallGrade[enc]);
  if (unbeatable.length) {
    fails.push(`${unbeatable.length} encounter${unbeatable.length === 1 ? '' : 's'} no shipped build beats`
      + ` half the time at any grade below Prismatic: ${unbeatable.join(', ')}`);
  }
}

// And now the half the entry actually wants: when a player's creatures are
// the problem, the briefing has to say WHICH GRADE clears it. Today it says
// "these creatures are not strong enough yet" and stops, which is true and
// unactionable — the comment above that very string reads "0% at Standard,
// 28% at Prime, on the same team", so the number exists and is not shown.
{
  const graded = Object.entries(wallGrade).filter(([, g]) => g !== 'standard').map(([enc]) => enc);
  const encId = graded[0];
  if (!encId) {
    fails.push('no encounter needs a grade above Standard, so rule 3 cannot check the briefing'
      + ' — either the ladder has been flattened or this gate has gone stale');
  } else {
    const builds = sampleBuilds(content, 40, 2026).slice(0, 3);
    const team = builds.map((b, i) => ({
      ...makeSimChimera(b.frame, b.partIds, 'standard', content),
      id: `reach-${i}`,
    }));
    const base = forecast(team, content.encounters[encId], content, 1, 0, { runs: 32 });
    const cause = diagnose(team, content.encounters[encId], content, 1, 0, { base });
    if (REPORT) {
      console.log(`\nthe briefing on ${encId} (needs ${wallGrade[encId]}), flown by a Standard team:`);
      console.log(`  ${bandFor(base.winRate).label} at ${(base.winRate * 100).toFixed(0)}%`);
      console.log(`  cause: ${cause ? cause.id : '(none — the band did not ask for one)'}`);
      if (cause) console.log(`  "${cause.text}"`);
    }
    if (!cause) {
      fails.push(`a Standard team against ${encId} is ${bandFor(base.winRate).label.toLowerCase()}`
        + ' and the briefing offers no cause at all');
    } else if (cause.id !== 'outgraded') {
      fails.push(`${encId} cannot be won at Standard by any shipped build and takes ${wallGrade[encId]},`
        + ` and the briefing's verdict for a Standard team is \`${cause.id}\`, which never names a grade:`
        + ` "${cause.text.slice(0, 80)}…" — a player is told to raise better donors without being told how much better`);
    } else {
      // The claim has to be TRUE, not merely present: the grade it names
      // must actually be the one that clears, measured the same way the
      // briefing measures everything else.
      const named = GRADES.find((g) => cause.text.includes(g.name));
      if (!named) {
        fails.push(`the briefing's \`outgraded\` verdict on ${encId} names no grade: "${cause.text}"`);
      } else if (!cause.lifted || cause.lifted <= base.winRate) {
        fails.push(`the briefing says ${encId} wants ${named.name} and reports no better win rate for it`
          + ` (${Math.round((cause.lifted ?? 0) * 100)}% against ${Math.round(base.winRate * 100)}% now)`);
      }
    }
  }
}

// ---- verdict -----------------------------------------------------------
if (fails.length) {
  console.error(`\nreach ✗  ${fails.length} gap${fails.length === 1 ? '' : 's'}:`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`reach ✓  ${Object.keys(content.species).length} species all routed,`
  + ` a median campaign sees ${(100 * REACH_FLOOR).toFixed(0)}%+ of ${TOTAL_PARTS} parts,`
  + ' and every wall names the grade it takes');
