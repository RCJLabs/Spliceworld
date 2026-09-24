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
//      a content-reach number; R93b learned that twice. R157 learned the
//      third time that SEVEN campaigns' luck is not one either, unless you
//      average them — see `REACH_FLOOR`.
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
import { walkedSave, herdCeiling } from './fixtures.js';
import { GRADES } from '../splice/grades.js';
import { diagnose, forecast, bandFor } from '../battle/forecast.js';
// R177 — the variant lines are a species question, so ask the module that owns it.
import { isVariant } from '../ranch/breeding.js';

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
// R179 — read off the shipped tables, never a list typed here. The rule R95
// set is that a table of ids goes stale the day somebody adds the next
// animal, which is the failure this gate exists to prevent.
const expeditionRegions = (id) => Object.values(content.regions)
  .filter((r) => (r.expedition?.finds ?? []).some((f) => f.species === id))
  .map((r) => r.id);
const expTune = () => content.campaignMeta?.expeditions ?? {};
const expeditionFloor = (rarity) => expTune().rarityFloor?.[rarity] ?? null;
const expeditionHourOptions = () => expTune().hourOptions ?? [];
const expeditionCrewMax = () => expTune().crewMax ?? 0;
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
  {
    // R179 — THE ONLY ROUTE THAT IS NOT A PURCHASE. Everything above
    // `common` has no `mailOrderPrice` by contract (tools/smoke.js asserts
    // it), so the catalog can never deliver one and the region's expedition
    // table is the whole supply.
    //
    // LAST, NOT FIRST, and the first draft had it first. A common that is
    // also on a table is reached by the CATALOG — the shop is open from day
    // one and asks nobody to go anywhere — so an order that answered
    // "expedition" for all 35 of them read `catalog 0 species` and hid the
    // thing this report exists to show. A route is the way a player gets
    // one, and the cheapest way wins.
    id: 'expedition',
    by: 'an expedition into a region whose table carries it',
    when: (s) => expeditionRegions(s.id).length > 0,
    resolves: (s) => {
      const floor = expeditionFloor(s.rarity ?? 'common');
      if (!floor) return null;
      const reachable = expeditionRegions(s.id)
        .filter(() => (expeditionHourOptions().some((h) => h >= (floor.hours ?? 0))
          && (expeditionCrewMax() >= (floor.crew ?? 0))));
      return reachable.length
        ? null
        : `its rarity floor asks for ${floor.hours}h and ${floor.crew} crew, which no trip this game offers can meet`;
    },
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
// R158 — THIRTEEN, AND THE SIX EXTRA WALKS COST A THIRD OF WHAT THE ENTRY
// PRICED THEM AT. R158 was filed as blocked on the suite budget: "roughly 360
// CPU-seconds" for six more 180-day walks. Measured: one fresh walk is 20.1
// CPU-seconds and a cached one is 0.00, so six is about 121 cold and nothing
// warm. The number that blocked this for two milestones was wrong by 3x.
//
// WHAT THE SAMPLE ACTUALLY BUYS. Censused at 21 seeds on this tree, the reach
// MEAN reads 94.15% at seven and 94.89% at twenty-one — a 0.74-point climb,
// which is small until you notice the floor is 94%. At seven seeds this gate
// passed by 0.15 points, which is FOUR PARTS; at thirteen it passes by 0.74,
// which is eighteen. The sample was not wrong about the game, it was too
// small to sit that close to its own floor.
//
// Thirteen rather than twenty-one because twenty-one does not fit: +14 walks
// is 282 CPU-seconds against the 178 R156 left under the 900 ceiling, and a
// gate that has to raise the budget to measure better is not an improvement.
const REACH_SEEDS = [2026, 7, 101, 4242, 55, 900, 31, 3, 12, 77, 123, 404, 808];
// R157 — THE MEDIAN OF SEVEN CAMPAIGNS IS NOT A STATISTIC, and this gate
// spent two milestones believing it was. Censused at 21 seeds on the tree
// before R157 and the tree after, the median of the first n reads:
//
//     n         7      9     11     13     15     17     19     21
//     before  95.5%  94.3%  94.3%  95.5%  95.5%  95.5%  95.5%  95.5%
//     after   94.7%  94.7%  94.7%  95.1%  95.1%  95.1%  95.1%  95.1%
//
// The row that matters is the FIRST one: main fails its own 95% floor at
// nine seeds and at eleven. The floor was never a property of the game, it
// was a property of these seven campaigns — and R157, which moves part reach
// by a mean of +0.00 parts over 21 seeds (median +0, sd 2.85), moved that
// median by two and turned the gate red for nothing.
//
// The MEAN over the same seven walks costs nothing extra and does not do
// this: 231.7 of 244 before and 230.7 after — 94.96% and 94.6% — and across
// every sample size from 7 to 21 it stays inside 0.7 points on both trees. So the gate averages, and
// the floor is the number the average earns. It is a point lower than the
// old one because the sample is right-skewed, not because a campaign reaches
// less; break 160 — the collector rule, worth three parts — still goes red,
// which is the only thing the floor is for.
//
// R158 carries the rest: thirteen seeds is where the MEDIAN settles too, and
// it costs six more 180-day walks than the suite's CPU budget has room for.
// R173 — 0.94 -> 0.95, RE-DERIVED FROM THE CLEAN MEASUREMENT instead of from
// where three tunings ago left it. Measured across these thirteen seeds on the
// post-R114 tree: per-seed 235-242 parts (96%-99%), mean 237.2 (97.2%). Under
// break 162 the mean is 229.4 (94.0%) — so the old floor of 0.94 was false by
// `0.9402 < 0.94`, a rounding hair, and the break walked. At 0.95 the clean
// mean keeps 2.2pp of room and the break misses by a full point.
//
// The mean is still the statistic, not the median: R158's note above says why.
const REACH_FLOOR = 0.95;
// R140 — AND THE HALF THIS GATE NEVER ASKED. `dex.parts` is what a campaign
// HANDLED; `dex.worn` is what it put on a creature, and until this milestone
// nothing anywhere recorded the second. Measured on the same seven seeds: a
// median campaign saw 95% of the part list and built with 43.4% of it, and
// 34 parts were worn by no seed at all while being seen by several. That is
// not R61's orphan content, which has no route; it is content with a route
// nobody takes.
//
// THE FLOOR IS 50%, AND IT IS A DESIGN NUMBER RATHER THAN THE MEASUREMENT.
// You collect nearly everything and you build with half of it: the half you
// leave is what makes the next campaign different, and a game where every
// part ends up on a creature has no shelf left to raid. Measured at 54.9%
// after the Theater started marking what you have never bolted on and the
// walker started reading that mark.
const WORN_FLOOR = 0.50;   // R158 — R140's design floor, no longer chasing a break
// R177 — 5.5 OF 6 VARIANT LINES, and the number is the midpoint of a measured
// gap rather than a round figure: 5.92 clean, 5.15 with R95's pair-ordering
// deleted. Six species carry a variant and 34 of the 244 parts are on one, so
// a campaign that stops rolling for them loses content the part floor cannot
// see — 95.1% still clears 95%.
const VARIANT_LINE_FLOOR = 5.5;
// R116 — how many of the seeds must reach every variant line. The mean above
// stopped separating break 347 once the walker could start a line from zero;
// this is what replaced it. Derived beside the rule, not here.
const VARIANT_FULL_SEEDS = 10;
// R180 — AND THE SEED COUNT STOPPED SEPARATING TOO, for the third time and
// the same reason each time: the game keeps getting better at variant lines,
// so deleting the pair-sort costs less than it used to. This is the census
// that replaced it. Derived beside the rule below, not here.
const VARIANT_MISSED_CEILING = 2;
const TOTAL_PARTS = Object.keys(content.parts).length;
{
  const per = [];
  for (const seed of REACH_SEEDS) {
    const save = walkedSave({ seed, days: 180 });
    const held = new Set(save.dex.parts ?? []);
    const worn = new Set(save.dex.worn ?? []);
    const species = new Set([...held].map((p) => content.parts[p]?.species).filter(Boolean));
    per.push({
      seed, parts: held.size, species: species.size, held, worn,
      // R179 — how many expeditions this campaign actually mounted. A walker
      // that never mounts one is not a policy, and the species below would
      // then be unreachable for a reason no other number here would show.
      trips: save.campaign?.expeditionCount ?? 0,
      herd: save.ranch.stock.length,
    });
  }
  // R182 — AND EVERY ONE OF THEM ENDS WITH ITS PENS INSIDE THE CEILING THE
  // VAULT GATE STATES. That gate walks seed 2026 alone (R158's note on it
  // says one seed is not a sample); these are the thirteen full 180-day
  // campaigns the suite already has, so the check costs no walk. What it
  // guards is the herd a refused graduation leaves behind: seed 4242 ended on
  // 34 head with all 34 refused before the Vault had a per-part way out, and
  // R116 measured 112. Every seed, not a mean — a herd that stopped turning
  // over is a defect in the one campaign it happens to.
  for (const r of per) {
    if (r.herd > herdCeiling()) {
      fails.push(`seed ${r.seed} ends day 180 with ${r.herd} animals in the pens, past the vault gate's`
        + ` design ceiling of ${herdCeiling()} — graduation has stopped turning the herd over`);
    }
  }
  if (REPORT) console.log(`
herd at day 180: ${per.map((r) => `${r.seed}:${r.herd}`).join(' ')} (ceiling ${herdCeiling()})`);

  // The average campaign, not the middle one — see `REACH_FLOOR`.
  const mean = (xs) => xs.reduce((n, x) => n + x, 0) / xs.length;
  const meanParts = mean(per.map((r) => r.parts));
  const ratio = meanParts / TOTAL_PARTS;
  const union = new Set(per.flatMap((r) => [...r.held]));
  if (REPORT) {
    console.log(`\nreach across ${REACH_SEEDS.length} seeds (of ${TOTAL_PARTS} parts,`
      + ` ${Object.keys(content.species).length} species):`);
    for (const r of per) {
      console.log(`  seed ${String(r.seed).padStart(4)}  ${String(r.parts).padStart(3)} parts`
        + `  ${String(r.species).padStart(2)} species  ${(100 * r.parts / TOTAL_PARTS).toFixed(0).padStart(3)}%`);
    }
    console.log(`  mean ${meanParts.toFixed(1)} (${(100 * ratio).toFixed(1)}%)`
      + ` · union ${union.size} · never reached by any seed ${TOTAL_PARTS - union.size}`);
    const missing = Object.values(content.parts).filter((p) => !union.has(p.id));
    const bySpecies = {};
    for (const p of missing) (bySpecies[p.species] ??= []).push(p.id);
    for (const [sp, ps] of Object.entries(bySpecies).sort((a, b) => b[1].length - a[1].length)) {
      const route = ROUTES.find((r) => r.when(content.species[sp]));
      console.log(`    ${sp.padEnd(16)} ${String(ps.length).padStart(2)} parts unreached  (${route?.id ?? 'no route'})`);
    }
  }
  // R179 — THE VERB, AND THE THING ONLY THAT VERB REACHES. Two claims, and
  // they have to be checked together: a species whose only route is an
  // expedition is unreachable unless campaigns actually run expeditions, and
  // a walker that runs them at a tap rather than as a policy would satisfy
  // the first claim while telling you nothing about the second.
  //
  // The floor is ONE PER CAMPAIGN on the mean, deliberately low. The policy
  // sends only the bench (`tools/sim.js`), so a campaign that never grows
  // past a fighting three legitimately mounts none — the gate is here to
  // catch a walker that CANNOT, not to insist every seed collects.
  {
    const meanTrips = mean(per.map((r) => r.trips));
    if (REPORT) {
      console.log(`  expeditions: ${per.map((r) => `${r.seed}: ${r.trips}`).join(', ')}`);
      console.log(`  mean ${meanTrips.toFixed(2)} per campaign`);
    }
    if (meanTrips < 1) {
      fails.push(`expeditions: the average campaign mounts ${meanTrips.toFixed(2)} of them`
        + ' — the walker is not running the verb, so anything behind it is unreachable content');
    }
    const onlyByTrip = Object.values(content.species)
      .filter((sp) => !sp.synthetic && !sp.variantOf && !sp.mailOrderPrice);
    for (const sp of onlyByTrip) {
      const mine = Object.values(content.parts).filter((p) => p.species === sp.id).map((p) => p.id);
      const seen = per.filter((r) => mine.some((id) => r.held.has(id))).length;
      if (REPORT) console.log(`  ${sp.id}: held by ${seen} of ${per.length} campaigns`);
      if (!seen) {
        fails.push(`\`${sp.id}\` is reachable only by expedition and NO campaign in`
          + ` ${per.length} seeds ever held one of its ${mine.length} parts`);
      }
    }
  }

  // R140 — worn, on the same walks and the same statistic, so the two numbers
  // are about one campaign and can be read side by side. R157 moved both to
  // the mean, and for worn the reason is break 245 rather than the sample.
  // R158 — THIS FLOOR STOPS CHASING BREAK 245, AND GOES BACK TO BEING R140's.
  //
  // It was re-typed twice in three milestones: R157 moved it 50% -> 57% and
  // R154 57% -> 67.6%, both times so that break 245 — which deletes the
  // never-built-with tie-break — would still land under it. That is R92's
  // "number being dragged along behind the thing it was supposed to hold",
  // and the cause was that ONE NUMBER WAS DOING TWO JOBS: a design floor and
  // a break-catcher, which want opposite things. A design floor must NOT move
  // when the roster does. A break-catcher has to.
  //
  // The break-catcher moved out, and it did not need a statistic at all.
  // `bestSplice` is the function break 245 patches, and `tools/smoke.js`
  // already asserts its tie-break DIRECTLY, on two parts and no walk: with
  // both at Standard and one already built with, the Theater reaches for the
  // other — and an Apex it has used still beats a Standard it has not,
  // because the pull is half a grade step and a grade step is one. Break 245
  // is aimed there now. It reads
  //
  //     with both at Standard and bear_head already built with,
  //     the Theater reaches for tiger_head
  //
  // which is the same defect stated as a DIFFERENCE between two choices
  // rather than as a level a whole campaign has to fall under. No sample, no
  // calibration, no roster: the two parts are built by hand.
  //
  // WHAT THE LEVEL WAS WORTH AS A BREAK-CATCHER, measured at 21 seeds on both
  // trees, is the other half of the argument for moving it:
  //
  //     seeds    worn tree   worn broken    the pull   SE     pull/SE
  //        7       170.0       159.9          10.1     9.1      1.11
  //       13       172.2       150.7          21.5     7.8      2.78
  //       21       174.3       153.5          20.8     5.9      3.52
  //
  // Seven seeds measured the pull at HALF its size and one standard error
  // wide. R157 and R154 were not calibrating a floor against a defect, they
  // were calibrating it against noise, twice.
  //
  // SO 50%, WHICH IS R140's NUMBER AND R140's REASON: you collect nearly
  // everything and you build with half of it, and the half you leave is what
  // makes the next campaign different. A campaign that wears less than half
  // the list has stopped exploring, and that is the thing worth a rule.
  // Today's campaigns wear 71% (174.3 of 244 at 21 seeds), so the daylight is
  // twenty-one points and it is deliberate — a floor is a minimum, not a
  // ratchet. That the game now leaves 29% where R140's prose says "half" is a
  // DESIGN question about whether the shelf still has anything on it, not a
  // calibration; filed rather than fixed here.
  {
    const meanWorn = mean(per.map((r) => r.worn.size));
    const wornRatio = meanWorn / TOTAL_PARTS;
    const wornUnion = new Set(per.flatMap((r) => [...r.worn]));
    // A rule with nothing to look at passes: if no save carries the field,
    // every ratio is 0 and this would read as a catastrophic regression
    // rather than as a missing field. Say which it is.
    assert_worn: {
      if (per.every((r) => r.worn.size === 0)) {
        fails.push('parts worn: no save in the sample carries `dex.worn` at all'
          + ' — the field the Theater marks and the walker reads is not being written');
        break assert_worn;
      }
      if (REPORT) {
        const seenNotWorn = [...new Set(per.flatMap((r) => [...r.held]))].filter((p) => !wornUnion.has(p));
        console.log(`  worn: ${per.map((r) => `${r.seed}: ${r.worn.size}`).join(', ')}`);
        console.log(`  mean worn ${meanWorn.toFixed(1)} (${(100 * wornRatio).toFixed(1)}%)`
          + ` · union ${wornUnion.size} · seen by some seed and worn by none ${seenNotWorn.length}`);
      }
      if (wornRatio < WORN_FLOOR) {
        fails.push(`parts worn: the average campaign builds with ${meanWorn.toFixed(1)} of ${TOTAL_PARTS} parts`
          + ` (${(100 * wornRatio).toFixed(1)}%, under ${(100 * WORN_FLOOR).toFixed(1)}%)`
          + ` — ${per.map((r) => `${r.seed}: ${r.worn.size}`).join(', ')}`
          + `; ${TOTAL_PARTS - wornUnion.size} parts go onto no creature in any seed`);
      }
    }
  }

  // R177 — AND THE LINES THEMSELVES, WHICH IS A DIFFERENT QUESTION FROM PARTS.
  //
  // R95 sorts breeding candidates so a line that still owes the Splice-Dex a
  // variant pairs first. Delete that one `pairs.sort(...)` and NOTHING WENT
  // RED: mean part reach falls 237.2 -> 232.1 (95.1%), which clears the 0.95
  // floor by a tenth of a point, and the union stays 244/244 because thirteen
  // seeds between them still stumble onto every line eventually.
  //
  // So the part statistics cannot see it, and that is not a floor that needs
  // tightening — it is the WRONG SUBJECT. R95's rule is about which lines get
  // ROLLED FOR, and 34 of the 244 parts sit on six species that arrive by one
  // door: a mutation in the Incubator, on a pairing whose stock has a variant
  // to become. Measured per seed:
  //
  //                      clean      pair-sort deleted
  //     mean lines       5.92/6     5.15/6
  //     seeds at 6/6     12 of 13    4 of 13
  //     seeds at 4/6      0 of 13    2 of 13
  //     union             6/6        6/6
  //
  // THE MEAN, NOT THE MINIMUM, and that is R173's lesson applied rather than
  // repeated. The minimum separates too (5 clean, 4 broken), but the clean
  // tree's own worst seed IS 5 — seed 123 finishes without `glider_skunk` —
  // so a floor there has zero headroom and one unlucky seed false-reds it.
  // The mean sits with room on both sides: 0.42 above clean, 0.35 below the
  // break, and it tolerates five seeds each losing a line before it fires.
  //
  // R116 — AND THE MEAN STOPPED SEPARATING, so the seed COUNT is what holds
  // this rule up now. Break 347 went MISSED in R116's full battery. Nothing
  // is wrong with the break and nothing is wrong with the walker; the
  // milestone simply made the campaign better at variant lines. `mates`
  // widened from `heldOf === 1` to `heldOf < 2` so a line can be started from
  // zero, which is what fixed R116's own reach loss — and it recovers most of
  // what the pair-sort used to guarantee. Re-measured on this tree:
  //
  //                      clean      pair-sort deleted
  //     mean lines       5.85/6     5.54/6      (was 5.92 / 5.15)
  //     seeds at 6/6     12 of 13    8 of 13    (was 12 / 4)
  //
  // The break's cost in mean lines fell from 0.77 to 0.31, and 5.54 clears
  // the 5.5 floor by four hundredths. A floor inside a 0.31-wide window is
  // the zero-headroom trap this note rejected for the minimum three
  // paragraphs up, so the mean does not move: it stays as a backstop against
  // a collapse, and it is written down here that it no longer sees 347.
  //
  // The seed count is the statistic that still has room — twelve clean
  // against eight broken, and the clean twelve is exactly what R177 measured.
  // A floor of ten tolerates two seeds losing a line to content churn and
  // still fires on a break that costs four.
  //
  // The union is NOT asserted here, because it does not separate: both trees
  // reach all six lines across thirteen seeds. Saying so is cheaper than
  // letting the next reader assume it is covered.
  {
    const linesOf = (held) => new Set([...held]
      .map((id) => content.parts[id]?.species)
      .filter((sp) => sp && isVariant(sp, content)));
    const ALL_LINES = Object.values(content.species).filter((sp) => sp.variantOf).map((sp) => sp.id);
    const perLines = per.map((r) => ({ seed: r.seed, lines: linesOf(r.held) }));
    const meanLines = perLines.reduce((n, r) => n + r.lines.size, 0) / perLines.length;
    if (REPORT) {
      console.log(`  variant lines: ${perLines.map((r) => `${r.seed}: ${r.lines.size}`).join(', ')}`);
      console.log(`  mean ${meanLines.toFixed(2)} of ${ALL_LINES.length} lines`);
    }
    const short = perLines.filter((r) => r.lines.size < ALL_LINES.length)
      .map((r) => `${r.seed} missed ${ALL_LINES.filter((l) => !r.lines.has(l)).join('/')}`);
    if (meanLines < VARIANT_LINE_FLOOR) {
      fails.push(`variant lines: the average campaign rolls for ${meanLines.toFixed(2)} of`
        + ` ${ALL_LINES.length} variant lines (under ${VARIANT_LINE_FLOOR})`
        + ` — ${short.join('; ')}`);
    }
    // R180 — THE RULE THE SEED COUNT CAN NO LONGER CARRY EITHER.
    //
    // Break 347 went MISSED again, in R180's rot check. Nothing is wrong with
    // the break and nothing is wrong with the walker: R180's economy makes a
    // campaign richer, a richer campaign breeds more, and more breeding finds
    // variant lines without being steered to them. That is the THIRD time
    // this rule has been eroded from below by an unrelated improvement, and
    // the trend is the finding rather than any one reading:
    //
    //                    clean                 pair-sort deleted
    //     R177    mean 5.92, 12/13 at 6/6    mean 5.15,  4/13
    //     R116    mean 5.85, 12/13           mean 5.54,  8/13
    //     R180    mean 6.00, 13/13           mean 5.77, 11/13
    //
    // The mean stopped separating at R116 and the seed count separates by two
    // now, against a floor of ten that eleven clears. Both are kept as
    // backstops against a collapse — a walker that stops breeding entirely
    // still trips them — and it is written down that NEITHER sees 347.
    //
    // What still separates is the census: LINES MISSED across all thirteen
    // seeds, out of 78. It weights a seed that loses two lines twice, which
    // is exactly what the break does and what counting seeds throws away.
    //
    //     R177    clean 1 missed    broken 11
    //     R116    clean 2           broken  6
    //     R180    clean 0           broken  3
    //
    // A ceiling of two sits above every clean reading and below every broken
    // one, across three trees measured years apart. THE MARGIN TODAY IS ONE
    // LINE on the broken side, and saying so is the point: each milestone
    // that improves breeding shrinks the break's cost, so when a clean tree
    // reads 3 or a broken one reads 2, this statistic is finished too. At
    // that point retire break 347 or re-aim it at the Incubator door itself,
    // rather than inventing a fourth number for a defect the game has grown
    // out of noticing.
    //
    // R186 — AND THAT POINT ARRIVED. Clean 0 of 78, broken 0 of 78: every seed
    // reaches all six lines with the pair-sort deleted. Break 347 is retired,
    // as the paragraph above said it should be; the Incubator door is held by
    // 159, 162 and 193. All three clauses stay as backstops against a collapse.
    const missed = perLines.reduce((n, r) => n + (ALL_LINES.length - r.lines.size), 0);
    if (REPORT) {
      console.log(`  lines missed across the census: ${missed} of ${ALL_LINES.length * perLines.length}`);
    }
    if (missed > VARIANT_MISSED_CEILING) {
      fails.push(`variant lines: ${missed} of ${ALL_LINES.length * perLines.length} line-slots go`
        + ` unrolled across ${perLines.length} seeds (over ${VARIANT_MISSED_CEILING})`
        + ` — ${short.join('; ')}`);
    }
    // R116 — the rule the mean can no longer carry; see the note above.
    const fullSeeds = perLines.filter((r) => r.lines.size === ALL_LINES.length).length;
    if (fullSeeds < VARIANT_FULL_SEEDS) {
      fails.push(`variant lines: only ${fullSeeds} of ${perLines.length} campaigns roll for all`
        + ` ${ALL_LINES.length} lines (under ${VARIANT_FULL_SEEDS})`
        + ` — ${short.join('; ')}`);
    }
  }

  // R173 — THE SHARP SIGNAL, ASSERTED AT LAST. This number was computed and
  // PRINTED from the day the gate was written, and nothing ever compared it to
  // anything: `--report` said "never reached by any seed 0" and the run passed
  // on the mean alone.
  //
  // It is the better guard because it is CATEGORICAL. Break 162 locks the
  // buyer out of the breeder, so the variant lines are never rolled for — and
  // `pale_cobra`, a bred species, goes from reachable to unreachable. Two parts
  // crossing 0 -> 2 is a fact; 97.2% -> 94.0% is a slope, and a slope can land
  // on a floor and stop. That is R157's break-245 shape a second time: a floor
  // that does not move with the statistic it guards.
  //
  // No tolerance, deliberately. A part with no route in 180 days across
  // thirteen seeds is content nobody can have (R61's rule), and the failure
  // NAMES which parts and which species so the next reader is not left
  // counting. If a part is ever meant to be unreachable, it needs a reason
  // written here rather than a number quietly raised.
  //
  // AND THE HONEST LIMIT, because R173 looked for it and did not find it: on
  // today's tree there is NO break this catches that the mean floor misses.
  // Four trees were measured —
  //
  //     clean                97.2%  union 244/244   both pass
  //     break 162            94.0%  union 242/244   both fire
  //     break 161            89.8%  union 236/244   both fire
  //     R95's pair-sort gone 95.1%  union 244/244   NEITHER fires
  //
  // So this is defence in depth rather than a second net with its own catch.
  // What it buys is INDEPENDENCE FROM WHERE THE FLOOR SITS — break 162 passed
  // the old 0.94 floor by two hundredths of a point and this would have caught
  // it anyway — and a failure that names the stranded content instead of
  // printing a percentage. Both are worth having; neither is "it catches more".
  //
  // The fourth row is a finding in its own right and is filed as R177: losing
  // R95's pair-ordering costs five parts of mean reach and nothing goes red.
  {
    const unreached = Object.values(content.parts).filter((p) => !union.has(p.id));
    if (unreached.length) {
      const bySpecies = {};
      for (const p of unreached) (bySpecies[p.species] ??= []).push(p.id);
      fails.push(`part reach: ${unreached.length} part(s) are reached by NO seed of ${REACH_SEEDS.length}`
        + ` — ${Object.entries(bySpecies).sort((a, b) => b[1].length - a[1].length)
          .map(([sp, ps]) => `${sp} (${ps.join(', ')})`).join('; ')}`
        + `; the union is ${union.size} of ${TOTAL_PARTS}`);
    }
  }

  if (ratio < REACH_FLOOR) {
    const missing = Object.values(content.parts).filter((p) => !union.has(p.id));
    const bySpecies = {};
    for (const p of missing) (bySpecies[p.species] ??= []).push(p.id);
    fails.push(`part reach: the average campaign sees ${meanParts.toFixed(1)} of ${TOTAL_PARTS} parts`
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
  + ` an average campaign sees ${(100 * REACH_FLOOR).toFixed(0)}%+ of ${TOTAL_PARTS} parts`
  + ` and builds with ${(100 * WORN_FLOOR).toFixed(1)}%+ of them,`
  + ' and every wall names the grade it takes');
