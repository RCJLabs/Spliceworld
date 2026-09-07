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
// 3. CHURN. The median chimera lives longer than five days. Today it is TWO
//    HOURS: the walk builds 1,834 creatures to keep nine, because parts are
//    free and dismantling hands them straight back.
import { walkedSave } from './fixtures.js';
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
const BOUNDS = {
  'inventory.parts':      { max: 400, by: 'vault capacity, sold like pens' },
  'inventory.vials':      { max: 120, by: 'vault capacity; older vials retire into the Dex' },
  'campaign.containment': { max: 40,  by: 'bay count, from the Containment track' },
  'chimeras':             { max: 12,  by: 'stable capacity, from the Theater track' },
  // R92 — DERIVED, and with the one designed exception stated. R91 wrote
  // "40, by penCapacity" when penCapacity had no ceiling of its own, so the
  // bound was a sentence: a walk that ran the Resequencer bought 97 pen
  // upgrades and finished on 199 animals. `penMaxCapacity` is a real cap
  // now, read from the tuning rather than re-typed — and a job's livestock
  // arrives whether or not there is room (operations.js says so out loud,
  // because a reward that evaporates is worse than no reward), so the bound
  // is the paddock plus the jobs that can be in the field at once.
  'ranch.stock':          { max: () => TUNING.penMaxCapacity + 8, by: 'penMaxCapacity, plus livestock a job delivers over it' },
  'ranch.eggs':           { max: () => TUNING.penMaxCapacity, by: 'penMaxCapacity — an egg holds a pen slot' },
  'news':                 { max: 40,  by: 'WIRE_KEEP in campaign/wire.js' },
  'campaign.captives':    { max: 12,  by: 'one per chimera, and the stable is capped' },
  'campaign.loose':       { max: 12,  by: 'one per chimera, and the stable is capped' },
  'gauntletBeaten':       { max: (c) => (c.gauntlet ?? []).length || 8, by: 'the Gauntlet has as many stages as it has' },
  'discoveredCombos':     { max: (c) => Object.keys(c.combos).length, by: 'the combo list' },
  'guidesSeen':           { max: (c) => (c.guides ?? []).length || 64, by: 'the guide list' },
  'dex.parts':            { max: (c) => Object.keys(c.parts).length, by: 'the part list' },
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
  // A bay holding a rival's chimera carries the GENERATED unit record — the
  // one `unitFromGenome` built, because that creature has no entry in
  // enemies.json to look up. Its lists are the shape of one body, so they
  // are bounded by the anatomy rather than by anything a campaign
  // accumulates. The gate found these the first time a walk ended with a
  // generated unit in bay zero, which is the declare-yourself rule working
  // on a shape nobody had looked at.
  'campaign.containment[].unit.moves':         { max: 16, by: 'one per socket, plus the combos an anatomy unlocks' },
  'campaign.containment[].unit.salvage':       { max: (c) => SOCKET_MAX(c), by: 'one part per socket' },
  'campaign.containment[].unit.salvageGrades': { max: (c) => SOCKET_MAX(c), by: 'one grade per salvaged part' },
  'campaign.containment[].unit.tags':          { max: 8,  by: 'a body is a handful of tags' },
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
const seen = arrayPaths(save);
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
