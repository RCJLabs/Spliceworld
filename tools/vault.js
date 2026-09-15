// R91 — WHAT DOES A HUNDRED AND EIGHTY DAYS WEIGH?
//
// The day-180 save is 1,843 KB and 95.5% of it is `inventory`: 9,451 part
// tokens and 2,059 vials, neither of which anything caps. `penCapacity` is
// the ONLY capacity in the game — measured by grep across `ranch/`,
// `splice/`, `campaign/` and `save/` — so every other list in the save is an
// append-only log that grows for as long as the player plays.
//
// THE FAILURE IS NEARER THAN THE ENTRY THOUGHT, AND IT IS SILENT. R91's own
// note reads "localStorage's 5 MB quota fails around 27,000 tokens — roughly
// day 500". That arithmetic is right for one campaign and the game has held
// four since R71: `MAX_SLOTS = 4`, one quota shared between them. Growth is
// dead linear at 10.4 KB a day, so four campaigns cross 5 MB on about
// **day 124** — inside what the walker already simulates. And `saveGame`
// catches the quota error, returns `false`, and none of `main.js`'s four
// call sites reads the result: the game stops saving and says nothing.
//
// So this gate asks three questions of one seeded 180-day walk.
//
// 1. WEIGHT. Under 200 KB, and under the shared quota at four slots.
// 2. BOUNDS. Every array in the save is named in `BOUNDS` below with the
//    thing that caps it, and is under that cap. An array path the table does
//    not know about FAILS — R50's declare-yourself, so the next unbounded
//    list added to a save cannot arrive quietly the way these nine did.
// 3. CHURN. The median chimera lives longer than five days. When this was
//    written it was TWO HOURS: the walk built 1,834 creatures to keep nine,
//    because parts are free and dismantling hands them straight back.
//
//    R135 — WHAT ACTUALLY HOLDS THIS UP, measured, because it is no longer
//    what the rule was written against. Splitting the table (a splice 20h,
//    a dismantle 3h) took it from 48.5 days to 74.8: creating is now the
//    only throttle, and a stronger one than the shared clock was. Nothing on
//    the dismantle side can break it — a FREE dismantle with the walker's
//    tenure guard also removed measures 87.2 days. What CAN break it is a
//    cheap splice with room to put the output: a 30-minute splice alone is
//    62.7 days, and the same with the vault +50% and the stable at 8/16 is
//    2.0 days and 460 creatures built to keep 12.
//
//    So a full vault and a full stable are the brake, not the clock. That
//    took a wrong diagnosis to learn — see tools/battery.js, where break 164
//    is retired with the numbers.
import { walkedSave } from './fixtures.js';
import { tickBreakouts } from '../campaign/breakout.js';
import { rivalList } from '../campaign/rivals.js';
import { newGameState } from '../save/save.js';
import { consolidateVault } from '../splice/vault.js';
import { loadSimContent, campaignWalk } from './sim.js';
import { MAX_SLOTS } from '../save/save.js';
import { TUNING } from '../ranch/ranch.js';

const REPORT = process.argv.includes('--report');
const KB = 1024;
const BUDGET_KB = 200;
const QUOTA_KB = 5 * 1024;      // what every browser gives localStorage
const MEDIAN_LIFE_DAYS = 5;

// EVERY ARRAY A SAVE CAN HOLD, AND WHAT CAPS IT.
//
// `max` is a number or a function of the content index — content-shaped
// lists (the Dex, the map, the guides) are bounded by the data and must be
// DERIVED rather than copied, because a hand-typed 153 goes stale the first
// time somebody adds a part (R61). `by` names the mechanism in the game, and
// is what a reader checks when a bound looks wrong.
// ONE GENERATED SPECIMEN'S LISTS, wherever a save happens to be holding it.
//
// `rivalSpecimen` builds every unit in the game that has no entry in
// enemies.json to look up, and its record carries five lists that are the
// shape of one BODY — bounded by the anatomy, not by anything a campaign
// accumulates. See the R94 note below for why they are written here once
// instead of three times in the table.
const SPECIMEN = (at) => ({
  [`${at}.moves`]:         { max: 16, by: 'one per socket, plus the combos an anatomy unlocks' },
  [`${at}.salvage`]:       { max: (c) => SOCKET_MAX(c), by: 'one part per socket' },
  [`${at}.salvageGrades`]: { max: (c) => SOCKET_MAX(c), by: 'one grade per salvaged part' },
  [`${at}.tags`]:          { max: 8,  by: 'a body is a handful of tags' },
  // Stated BEFORE a walk surfaces it. `arrayPaths` reads one record for the
  // shape of all of them, so whether this list is seen at all depends on
  // which specimen happens to be FIRST in its list — and only a specimen
  // that drew a mutation trait has one. That is not a thing a gate should
  // depend on.
  [`${at}.traits`]:        { max: 4,  by: 'the release stamps one; the shape allows a handful' },
});

const BOUNDS = {
  'inventory.parts':      { max: 400, by: 'vault capacity, sold like pens' },
  'inventory.vials':      { max: 120, by: 'vault capacity; older vials retire into the Dex' },
  'campaign.containment': { max: 40,  by: 'bay count, from the Containment track' },
  // R154 — the stable is the Theater track PLUS the paddock now, so this
  // derives both halves rather than restating one of them. The paddock's own
  // ceiling comes from `penMaxCapacity`, the same tuning `ranch.stock` two
  // lines down already reads, so a paddock that grows moves this with it.
  'chimeras':             { max: (c) => (c.facility?.theater?.levels ?? [])
                              .reduce((n, l) => Math.max(n, l.grants?.stable ?? 0), 0)
                            + Math.floor((TUNING.penMaxCapacity - (c.stallMeta?.freePens ?? 0))
                                         / (c.stallMeta?.pensPerStall || Infinity)),
                            by: 'stable capacity: the Theater track, plus a stall per `pensPerStall` pens' },
  // R154 — a bagged specimen carries a whole chimera, and the walk only
  // started reaching these once the roster could grow past twelve. Bounded
  // by what a chimera itself is bounded by, which is where they came from.
  'campaign.containment[].chimera.moveset': { max: 8, by: 'MOVE_SLOTS plus the combos a genome can unlock' },
  'campaign.containment[].chimera.scars':   { max: 12, by: 'one scar per socket, twice over' },
  // R92 — DERIVED, and with the one designed exception stated. R91 wrote
  // "40, by penCapacity" when penCapacity had no ceiling of its own, so the
  // bound was a sentence: a walk that ran the Resequencer bought 97 pen
  // upgrades and finished on 199 animals. `penMaxCapacity` is a real cap
  // now, read from the tuning rather than re-typed — and a job's livestock
  // arrives whether or not there is room (operations.js says so out loud,
  // because a reward that evaporates is worse than no reward), so the bound
  // is the paddock plus the jobs that can be in the field at once.
  //
  // R154 — AND THAT LAST CLAUSE BOUNDS THE WRONG THING. Jobs in the field
  // at once is a concurrency limit; what fills a barn is arrivals that
  // STAYED. A 180-day campaign runs about 1,189 of them, each delivering
  // unconditionally, and the only thing that takes an animal back out is
  // extraction — which costs money (ROADMAP §9.22). So the overflow has no
  // mechanical ceiling to derive from, and `+ 8` was a number that fitted
  // rather than a mechanism: measured at R154's six-pens-per-stall across
  // sixteen seeds, campaigns finish on a median of 22 head and a maximum of
  // 56, with two of sixteen past the old 48.
  //
  // So this is a DESIGN ceiling and says so. Twice the paddock is not a herd
  // that turned over slowly, it is one that stopped: the player has quit
  // extracting and the save is accumulating. That still catches R91's
  // runaway by a wide margin — 199 head is well past 80 — which is the thing
  // this bound was built for. It comes back down when §9.22 gives livestock
  // a door out that is not the Extractor.
  //
  // ONE SEED IS NOT A SAMPLE, and this gate walks seed 2026 alone. At R154's
  // ratio 2026 finishes on 38, so it would have sat green through both of
  // the seeds that breached. That is R158's problem in a second gate and is
  // filed there rather than papered over here.
  'ranch.stock':          { max: () => TUNING.penMaxCapacity * 2,
                            by: 'twice the paddock — a design ceiling on a herd that stopped turning over, not a mechanism' },
  'ranch.eggs':           { max: () => TUNING.penMaxCapacity, by: 'penMaxCapacity — an egg holds a pen slot' },
  'news':                 { max: 40,  by: 'WIRE_KEEP in campaign/wire.js' },
  'campaign.captives':    { max: 12,  by: 'one per chimera, and the stable is capped' },
  // R129 — DERIVED, because the release moved it. R82 capped the board at 4
  // and this said 12 "one per chimera"; the release raises the cap to 9, and
  // a bound that was already a sentence rather than a number would have
  // absorbed that silently. It is `maxLoose`, whichever era the save is in,
  // read from the tuning so a data edit moves it here too.
  'campaign.loose':       { max: (c) => Math.max(c.breakoutMeta?.maxLoose ?? 4,
                                                 c.breakoutMeta?.release?.maxLoose ?? 9),
                            by: 'maxLoose in data/breakout.json, before and after the release' },
  'gauntletBeaten':       { max: (c) => (c.gauntlet ?? []).length || 8, by: 'the Gauntlet has as many stages as it has' },
  'discoveredCombos':     { max: (c) => Object.keys(c.combos).length, by: 'the combo list' },
  'guidesSeen':           { max: (c) => (c.guides ?? []).length || 64, by: 'the guide list' },
  'dex.parts':            { max: (c) => Object.keys(c.parts).length, by: 'the part list' },
  // R140 — what you have BUILT with, which is a subset of what you have seen
  // and therefore capped by the same list. It cannot outgrow `dex.parts`: a
  // part has to be in the vault before it can go onto a creature.
  'dex.worn':             { max: (c) => Object.keys(c.parts).length, by: 'the part list' },
  // R97 TURNS THESE TWO FROM RATCHETS INTO BOUNDS. R91 left them at 260
  // against 42 real enemies and named the entry that owed the fix, which is
  // this one. A generated rival chimera or escapee is not a Dex page — it is
  // a sighting of a LAB — so the honest ceiling is the authored roster plus
  // one archetype per rival, derived from the content rather than typed.
  'dex.enemies':          { max: (c) => Object.keys(c.enemies).length + Object.keys(c.rivals ?? {}).length,
                            by: 'the enemy list, plus one archetype per rival lab' },
  'dex.beaten':           { max: (c) => Object.keys(c.enemies).length + Object.keys(c.rivals ?? {}).length,
                            by: 'the enemy list, plus one archetype per rival lab' },
  'dex.traits':           { max: (c) => Object.keys(c.traits ?? {}).length, by: 'the trait list' },
  // R91 — where a retired vial's donor goes. The gate caught this one on the
  // milestone that added it, which is the whole point of the rule.
  'dex.species':          { max: (c) => Object.keys(c.species ?? {}).length, by: 'the species list' },
  'dex.variants':         { max: (c) => Object.values(c.species ?? {}).filter((s) => s.variantOf).length, by: 'the variant list' },
  'campaign.heldNodes':   { max: (c) => (c.nodes ?? c.regions ?? []).length || 40, by: 'the map has as many nodes as it has' },
  'campaign.contested':   { max: (c) => (c.nodes ?? c.regions ?? []).length || 40, by: 'one per held node' },
  'campaign.operations':  { max: (c) => Object.keys(c.operations ?? {}).length || 16, by: 'the jobs board' },
  'campaign.faunaGranted': { max: (c) => Object.keys(c.species ?? {}).length, by: 'the species list' },
  'directorStats.dissections': { max: 40, by: 'one per captive, and captives are capped' },
  'directorStats.announced':   { max: 40, by: 'one per countermeasure the director has' },
  // Per-record lists. These sit inside an already-bounded array, so the cap
  // that matters is the shape of one record, not how many records there are.
  'chimeras[].moveset':   { max: 4,  by: "R30's four move slots" },
  // R143 — a CAPTIVE carries a whole chimera record, so it carries that
  // record's per-body lists too. They never showed up before because the
  // day-180 fixture happened to end with no captive held; a tighter economy
  // changed which day the walk rescues on, and the shape was there all along.
  // Same caps as the chimeras they are copies of.
  'campaign.captives[].chimera.moveset': { max: 4,  by: "R30's four move slots" },
  'campaign.captives[].chimera.scars':   { max: 12, by: 'one per socket, twice over' },
  // THREE PLACES A SAVE CAN PARK A GENERATED SPECIMEN. The gate found the
  // first (a bay) the first time a walk ended with a generated unit in bay
  // zero, which is the declare-yourself rule working on a shape nobody had
  // looked at. R129 found the second (the LOOSE board) six milestones later,
  // because a walk used to finish with an empty board — every escapee hunted
  // down before day 180 — so those lists existed in the engine and never once
  // in a snapshot. R93 added the third, the pack standing behind a leader.
  //
  // R94 — AND ALL THREE COPIES DISAGREED ABOUT WHAT A SPECIMEN IS.
  //
  // Three prefixes, three hand-typed transcriptions of one record's shape, so
  // `traits` got stated for two of them and forgotten for the third. Nothing
  // could catch that: `arrayPaths` reads ONE record for the shape of all of
  // them, so the pack's missing bound was only ever going to surface on a
  // walk that happened to put a trait-carrying specimen first in a pack.
  // R94's ratchet moved the trajectory and the pack's turn finally came up,
  // three milestones after the pack did.
  //
  // So the shape is written once, above, and parked at each prefix. A sixth
  // list on a generated body is now one line in one place, and cannot land on
  // two boards out of three. R157's break 152: one constant, one home,
  // however many readers.
  ...SPECIMEN('campaign.containment[].unit'),
  ...SPECIMEN('campaign.loose[].unit'),
  ...SPECIMEN('campaign.loose[].pack[]'),
  // The pack ITSELF is not a body, it is a list of them. `maxSize` is what
  // stands between a loose entry and a twelve-specimen wall, so the ceiling
  // is READ from the data rather than typed here: raising it in
  // data/breakout.json raises this with it, and there is no second number to
  // forget.
  'campaign.loose[].pack':                     { max: (c) => Math.max(0, (c.breakoutMeta?.pack?.maxSize ?? 1) - 1), by: 'pack.maxSize, less the leader' },
  // The release stamps at most one mutation trait per specimen; the list is
  // a list so the shape matches every other trait-bearing thing in the save.
  'campaign.loose[].traits':                   { max: 4,  by: 'a released specimen carries at most a handful' },
  'chimeras[].scars':     { max: 12, by: 'one per socket, twice over' },
  'inventory.parts[].traits':  { max: 4, by: 'a part carries at most a handful' },
  'ranch.stock[].traits':      { max: 4, by: 'an animal carries at most a handful' },
};
// A token on a chimera is `tokens.<socket>.traits`; the socket names come
// from the frame, so they are enumerated rather than listed.
const TOKEN_TRAITS = /^chimeras\[\]\.tokens\.[a-z0-9]+\.traits$/;

// The widest frame in the data decides how many sockets one body can have,
// derived rather than typed so a frame gaining a bay does not silently make
// this bound wrong (R61).
const SOCKET_MAX = (c) => Math.max(...Object.values(c.frames ?? {})
  .map((f) => (f.slots ?? []).length || 8), 8);

const bytes = (v) => Buffer.byteLength(JSON.stringify(v), 'utf8');
const fmt = (b) => (b / KB).toFixed(1) + ' KB';

function arrayPaths(v, path = '', depth = 0, out = []) {
  if (depth > 6 || v === null || typeof v !== 'object') return out;
  if (Array.isArray(v)) {
    out.push({ path, n: v.length, bytes: bytes(v) });
    // One record stands for the shape of all of them: a per-record list that
    // is unbounded is unbounded in every record, and walking 9,451 of them
    // to learn the same fact is how a gate ends up costing a minute.
    if (v.length && typeof v[0] === 'object') arrayPaths(v[0], `${path}[]`, depth + 1, out);
    return out;
  }
  for (const [k, x] of Object.entries(v)) arrayPaths(x, path ? `${path}.${k}` : k, depth + 1, out);
  return out;
}

const content = loadSimContent();
const save = walkedSave({ days: 180, seed: 2026 });
const fails = [];

// ---- 1. weight -------------------------------------------------------
const total = bytes(save);
if (REPORT) {
  console.log(`\nday-180 save: ${fmt(total)}  ·  x${MAX_SLOTS} slots = ${fmt(total * MAX_SLOTS)} of a ${QUOTA_KB / KB} MB quota`);
  for (const [k, b] of Object.entries(save).map(([k, v]) => [k, bytes(v)]).sort((a, b) => b[1] - a[1]).slice(0, 6)) {
    console.log(`  ${fmt(b).padStart(10)}  ${(b / total * 100).toFixed(1).padStart(5)}%  ${k}`);
  }
}
if (total > BUDGET_KB * KB) {
  fails.push(`the day-180 save is ${fmt(total)}, over the ${BUDGET_KB} KB budget`);
}
if (total * MAX_SLOTS > QUOTA_KB * KB) {
  fails.push(`${MAX_SLOTS} slots at ${fmt(total)} is ${fmt(total * MAX_SLOTS)}, over the ${QUOTA_KB / KB} MB localStorage quota`
    + ' — and saveGame swallows that failure');
}

// ---- 2. bounds -------------------------------------------------------
// R129 — THE SHAPE THE WALK HAPPENED NOT TO END ON.
//
// `arrayPaths` reads one record for the shape of all of them, so a list that
// is EMPTY at the moment the walk stops is a list this gate cannot see. That
// is not hypothetical: `campaign.loose` finished at 0 of 9 on the walk that
// shipped this milestone and at 8 on the walk before it, and which one you
// get moves with any change that touches the campaign's RNG. Six milestones
// of the loose board's four nested lists going unbounded is what that blind
// spot bought, and it was found by luck rather than by the rule.
//
// So the paths come from the walked save PLUS one board the release fills,
// and the SIZE numbers above still come from the walk alone — a bound is a
// claim about the shape of a record, and a record's shape does not depend on
// whether a campaign happened to leave one lying around.
function withLooseBoard(base) {
  const s = structuredClone(base);
  s.campaign.rivals = Object.fromEntries(
    rivalList(content).map((r) => [r.id, { defeats: 2, losses: 0, lastMetAt: null }])
  );
  s.campaign.loose = [];
  s.campaign.released = null;
  s.campaign.nextBreakAt = null;
  const t = s.lastTickAt ?? Date.now();
  tickBreakouts(s, content, t + 900 * 3600000, t);
  return s;
}
const populated = withLooseBoard(save);
if (!populated.campaign.loose.length) {
  fails.push('the bounds walk could not fill a loose board, so nothing checks its record shape'
    + ' — a rule with nothing to look at passes');
}
const byPath = new Map();
for (const row of [...arrayPaths(save), ...arrayPaths(populated)]) {
  const prev = byPath.get(row.path);
  if (!prev || row.n > prev.n) byPath.set(row.path, row);
}
const seen = [...byPath.values()];
if (REPORT) console.log(`\n${seen.length} array paths in the save:`);
for (const { path, n, bytes: b } of seen.sort((a, b) => b.n - a.n)) {
  const rule = BOUNDS[path] ?? (TOKEN_TRAITS.test(path) ? BOUNDS['inventory.parts[].traits'] : null);
  if (!rule) {
    fails.push(`\`${path}\` (${n} entries) is an array no bound is stated for`
      + ' — add it to BOUNDS in tools/vault.js with the thing that caps it');
    continue;
  }
  const max = typeof rule.max === 'function' ? rule.max(content) : rule.max;
  if (REPORT) console.log(`  ${String(n).padStart(6)} / ${String(max).padEnd(5)} ${fmt(b).padStart(10)}  ${path}  (${rule.by})`);
  if (n > max) fails.push(`\`${path}\` holds ${n}, over its stated bound of ${max} (${rule.by})`);
}

// ---- 3. churn --------------------------------------------------------
// The walk is re-run rather than read off the cached save because a lifetime
// is a fact about the campaign, not about the state it ends in.
const walk = campaignWalk(content, { seed: 2026, days: 180, stopAtDominion: false });
const lives = walk.chimeraLives;
const median = lives.length ? lives[Math.floor((lives.length - 1) / 2)] : 0;
if (REPORT) {
  const q = (p) => lives[Math.floor((lives.length - 1) * p)] ?? 0;
  console.log(`\nchimeras: ${walk.chimerasMade} made, ${walk.chimeras} standing`);
  console.log(`  life in days — p25 ${q(0.25).toFixed(2)}  median ${median.toFixed(2)}  p75 ${q(0.75).toFixed(2)}  max ${q(1).toFixed(1)}`);
}
if (median <= MEDIAN_LIFE_DAYS) {
  fails.push(`the median chimera lives ${median.toFixed(2)} days (${(median * 24).toFixed(1)}h), not more than ${MEDIAN_LIFE_DAYS}`
    + ` — ${walk.chimerasMade} built to keep ${walk.chimeras}`);
}

// ---- 4. a legacy save is paid, not pruned -----------------------------
//
// `consolidateVault` runs on the world tick rather than in the migration,
// because capacity comes from the facility data and a migration is handed a
// save and nothing else. That put it out of reach of `tools/saves.js`, which
// only migrates — so break 150 went MISSED: a consolidation that DELETED
// nine thousand tokens instead of selling them passed every gate in the
// tree. It is asserted here, where the rest of R91's rules live.
{
  const legacy = { ...newGameState(), seed: 5, funds: 0 };
  legacy.facility = { extractor: 4 };
  const cap = 400;
  const pids = Object.keys(content.parts).slice(0, 30);
  // One rare token of an anatomy nobody else has, plus a great many
  // duplicates: the rule has to keep the rare one and sell the rest.
  legacy.inventory.parts.push({ id: 'rare', partId: pids[0], grade: 'prismatic', traits: [],
    donor: { name: 'Only', species: 'x', stars: 5, extractedAt: 0 } });
  for (let i = 0; i < cap + 600; i++) {
    legacy.inventory.parts.push({ id: `d${i}`, partId: pids[1 + (i % 29)], grade: 'standard', traits: [],
      donor: { name: 'Dupe', species: 'x', stars: 2, extractedAt: i } });
  }
  const had = legacy.inventory.parts.length;
  const paid = consolidateVault(legacy, content);
  const kept = legacy.inventory.parts;
  if (kept.length > cap) fails.push(`consolidation left ${kept.length} parts, over the capacity of ${cap}`);
  if (!kept.some((t) => t.id === 'rare')) {
    fails.push('consolidation sold the only token of an anatomy — it is meant to keep one of everything');
  }
  if (!paid || paid.count !== had - kept.length) {
    fails.push(`consolidation did not account for what it removed (${had - kept.length} gone, ${paid?.count ?? 0} reported)`);
  }
  if (!(legacy.funds > 0) || !(paid?.paid > 0)) {
    fails.push('a save that predates the cap was PRUNED rather than paid — nothing reached the bank');
  }
}

// ---- verdict ---------------------------------------------------------
if (fails.length) {
  console.error(`\nvault ✗  ${fails.length} problem${fails.length === 1 ? '' : 's'}:`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`vault ✓  ${fmt(total)} at day 180 (${fmt(total * MAX_SLOTS)} across ${MAX_SLOTS} slots),`
  + ` ${seen.length} arrays all bounded, median chimera life ${median.toFixed(1)} days`);
