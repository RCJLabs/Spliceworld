// Headless smoke test: proves the renderer runs DOM-free in Node (the same
// requirement the M4.5 balance harness will lean on) and that all content
// data is coherent. Run: node tools/smoke.js

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import { indexContent, renderCreatureSVG, validateGenome, SLOTS } from '../render/renderer.js';
import { rngStream, hashString } from '../util/rng.js';
import { newGameState, migrate, SAVE_VERSION } from '../save/save.js';
import {
  createAnimal, ageStage, conditionTier, applyElapsed, careAction,
  careStatus, buyMailOrder, buyPenUpgrade, ensureRanchSeeded, stockGenome,
  CARE_ACTIONS, TUNING, STATS, faunaUnlocked, catalogFor,
} from '../ranch/ranch.js';
import {
  GRADES, GRADE_INDEX, gradeFor, avgStars, extractAnimal,
} from '../splice/extract.js';
import { analyze } from '../splice/physiology.js';
import { spliceChimera, validateSplice, isSettled, chimeraGenome } from '../splice/theater.js';
import {
  combatantFromChimera, combatantFromUnit, createBattle, step, finishBattle,
  playerActions, playerActive, tagMultiplier, isInjured,
} from '../battle/engine.js';
import { runSim, plantBrokenCombo } from './sim.js';
import {
  nodeStates, threatGen, incomePerDay, tickCampaign, resolveBattle, salvageUnit,
} from '../campaign/campaign.js';
import { canBreed, breedPair, hatchEgg, expressedTraits, BREEDING } from '../ranch/breeding.js';
import { trainChimera, TRAINING } from '../splice/theater.js';
import { obediencePercent } from '../battle/engine.js';
import { onboardingSteps, onboardingActive } from '../ranch/onboarding.js';
import { classMultiplier } from '../battle/engine.js';
import { overflowingParts } from './bounds.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const content = indexContent({
  frames: readJSON('data/frames.json'),
  parts: readJSON('data/parts.json'),
  species: readJSON('data/species.json'),
  combos: readJSON('data/combos.json'),
  enemies: readJSON('data/enemies.json'),
  keywords: readJSON('data/keywords.json'),
  classes: readJSON('data/classes.json'),
  regions: readJSON('data/regions.json'),
  traits: readJSON('data/traits.json'),
  rivals: readJSON('data/rivals.json'),
});

// --- Content coherence: every part references a real species + slot.
for (const part of Object.values(content.parts)) {
  assert.ok(content.species[part.species], `${part.id}: unknown species ${part.species}`);
  assert.ok(SLOTS.includes(part.slot), `${part.id}: unknown slot ${part.slot}`);
}
for (const frame of Object.values(content.frames)) {
  for (const name of ['head', 'forelimb_near', 'forelimb_far', 'hindlimb_near', 'hindlimb_far', 'tail', 'organ']) {
    assert.ok(frame.sockets[name], `frame ${frame.id}: missing socket ${name}`);
  }
}

// --- The M0 acceptance genome renders.
const acceptance = {
  frame: 'M',
  parts: {
    head: 'bear_head',
    forelimbs: 'eagle_forelimbs',
    hindlimbs: 'goat_hindlimbs',
    tail: 'goat_tail',
    hide: 'goat_hide',
    organ: 'goat_organ',
  },
};
assert.deepEqual(validateGenome(acceptance, content), []);
const svg = renderCreatureSVG(acceptance, content);
assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'), 'render is a complete <svg>');
assert.ok(!svg.includes('@primary') && !svg.includes('@outline'), 'no unresolved color tokens');
assert.ok(svg.includes('clip-path'), 'hide overlay is clipped to torso');

// --- Every part renders in every frame (any part fits any socket).
for (const frame of Object.keys(content.frames)) {
  for (const part of Object.values(content.parts)) {
    const g = { frame, parts: { [part.slot]: part.id } };
    const out = renderCreatureSVG(g, content);
    assert.ok(out.length > 100, `${part.id} in frame ${frame} rendered`);
  }
}

// --- Bad genomes are rejected, not silently drawn.
assert.ok(validateGenome({ frame: 'XL', parts: {} }, content).length > 0);
assert.ok(validateGenome({ frame: 'M', parts: { head: 'goat_tail' } }, content).length > 0);

// --- Determinism: same seed, same stream.
const a = rngStream(1234, 'splice', 7);
const b = rngStream(1234, 'splice', 7);
assert.equal(a(), b());
assert.notEqual(rngStream(1234, 'splice', 8)(), rngStream(1234, 'splice', 7)());

// --- Save versioning: current saves pass through migrate untouched, and a
// --- real v1 save (M0 era) migrates up to v2 with ranch fields intact.
const fresh = newGameState();
assert.equal(fresh.saveVersion, SAVE_VERSION);
assert.equal(migrate(structuredClone(fresh)).saveVersion, SAVE_VERSION);
assert.throws(() => migrate({ noVersion: true }), /no version/);

const v1Save = {
  saveVersion: 1,
  seed: 42,
  createdAt: 1700000000000,
  spliceCount: 3,
  genome: acceptance,
  directorStats: { partUse: { bear_head: 3 }, tagUse: {} },
};
const migrated = migrate(structuredClone(v1Save));
assert.equal(migrated.saveVersion, SAVE_VERSION, 'v1 chains all the way up');
assert.equal(migrated.funds, 300);
assert.deepEqual(migrated.ranch, { stock: [], penCapacity: 4, animalCount: 0, seeded: false, eggs: [], eggCount: 0 });
assert.deepEqual(migrated.inventory, { vials: [], parts: [], tokenCount: 0 });
assert.equal(migrated.spliceCount, 3, 'migration preserves existing progress');
assert.deepEqual(migrated.genome, acceptance, 'migration preserves the slab creature');
const v2Save = { ...structuredClone(v1Save), saveVersion: 2, funds: 512, ranch: { stock: [], penCapacity: 6, animalCount: 2, seeded: true }, lastTickAt: 1, activeScreen: 'slab' };
const m2 = migrate(structuredClone(v2Save));
assert.equal(m2.saveVersion, SAVE_VERSION);
assert.equal(m2.funds, 512, 'v2→v3 leaves ranch/economy untouched');

// --- M1 ranch: species carry the required husbandry data.
for (const sp of Object.values(content.species)) {
  assert.ok(content.frames[sp.frame], `${sp.id}: unknown frame ${sp.frame}`);
  assert.ok(sp.feedCost > 0 && sp.upkeepPerDay > 0, `${sp.id}: economy fields`);
  assert.ok(
    sp.growthHours.adult < sp.growthHours.prime && sp.growthHours.prime < sp.growthHours.elder,
    `${sp.id}: growth stages ordered`
  );
  const svg = renderCreatureSVG(stockGenome(sp.id, content), content, { idPrefix: sp.id });
  assert.ok(svg.length > 200, `${sp.id}: purebred portrait renders`);
}

// --- M1 acceptance: neglect vs. good care, two simulated real days.
const HOUR = 3600000;
const t0 = 1700000000000;
function freshRanchState() {
  const s = { ...newGameState(), seed: 777, funds: 10000 };
  s.ranch = { stock: [], penCapacity: 8, animalCount: 0, seeded: false };
  s.lastTickAt = t0;
  return s;
}
const sim = freshRanchState();
const cared = createAnimal(sim, 'goat', content, t0);
const neglected = createAnimal(sim, 'goat', content, t0);
sim.ranch.stock.push(cared, neglected);

for (let hour = 1; hour <= 48; hour++) {
  const now = t0 + hour * HOUR;
  applyElapsed(sim, content, now);
  // The caring rancher runs every action the moment its cooldown is up.
  for (const action of CARE_ACTIONS) {
    if (careStatus(cared, now)[action].ready) {
      const r = careAction(sim, cared.id, action, content, now);
      assert.ok(r.ok, r.msg);
    }
  }
}
assert.ok(cared.condition >= TUNING.gleamingAt, `cared goat gleams (${cared.condition})`);
assert.ok(neglected.condition <= TUNING.scruffyAt, `neglected goat is scruffy (${neglected.condition})`);
assert.equal(conditionTier(cared.condition), 'gleaming');
assert.equal(conditionTier(neglected.condition), 'scruffy');
assert.ok(neglected.condition >= TUNING.conditionFloor, 'soft floor holds — nothing breaks from absence');

// The difference is *visible*: overlays differ in the rendered SVG.
const caredSVG = renderCreatureSVG(stockGenome('goat', content), content, { condition: 'gleaming' });
const scruffySVG = renderCreatureSVG(stockGenome('goat', content), content, { condition: 'scruffy' });
const plainSVG = renderCreatureSVG(stockGenome('goat', content), content, {});
assert.ok(caredSVG.includes('#ffe9a3'), 'gleaming portrait has sparkles');
assert.ok(scruffySVG.includes('#6e5a3f'), 'scruffy portrait has dirt');
assert.ok(!plainSVG.includes('#ffe9a3') && !plainSVG.includes('#6e5a3f'), 'fine portrait has neither');

// Age stages advance on the same clock (goat: adult 6h, prime 18h, elder 60h).
assert.equal(ageStage(cared, content, t0), 'juvenile');
assert.equal(ageStage(cared, content, t0 + 7 * HOUR), 'adult');
assert.equal(ageStage(cared, content, t0 + 20 * HOUR), 'prime');
assert.equal(ageStage(cared, content, t0 + 61 * HOUR), 'elder');

// --- Economy: upkeep drains, stipend pays, purchases gate correctly.
const econ = freshRanchState();
econ.funds = 100;
ensureRanchSeeded(econ, content, t0); // 2 goats + 1 bear = $18/day upkeep vs $40 stipend
assert.equal(econ.ranch.stock.length, 3);
applyElapsed(econ, content, t0 + 24 * HOUR);
assert.ok(Math.abs(econ.funds - 122) < 0.01, `stipend minus upkeep (${econ.funds})`);
const beforeFeed = econ.funds;
const fed = careAction(econ, econ.ranch.stock[0].id, 'feed', content, t0 + 24 * HOUR);
assert.ok(fed.ok && econ.funds === beforeFeed - content.species[econ.ranch.stock[0].species].feedCost);
econ.funds = 5;
assert.ok(!buyMailOrder(econ, 'goat', content, t0).ok, 'no credit at the catalog');
assert.ok(!buyPenUpgrade(econ).ok, 'no funds, no pens');
econ.funds = 1000;
const order = buyMailOrder(econ, 'goat', content, t0);
assert.ok(order.ok && econ.ranch.stock.length === 4);
assert.ok(!buyMailOrder(econ, 'bear', content, t0).ok, 'bears are locked until the Precinct falls');
// …and conquest opens the catalog.
econ.campaign.heldNodes.push('precinct');
assert.ok(faunaUnlocked(econ, content).has('bear'), 'holding the Precinct stocks bears');
const bearBuy = buyMailOrder(econ, 'bear', content, t0);
assert.ok(bearBuy.ok, bearBuy.msg);
assert.ok(catalogFor(econ, content).some((s) => s.id === 'bear'), 'catalog lists the unlock');
assert.ok(!faunaUnlocked(econ, content).has('shark'), 'guard-post fauna still gated');
econ.campaign.heldNodes.pop();
econ.ranch.penCapacity = 4;
assert.ok(!buyMailOrder(econ, 'goat', content, t0).ok, 'full pens block orders');
assert.ok(buyPenUpgrade(econ).ok && econ.ranch.penCapacity === 6);

// Determinism: same seed → identical starter herd.
const herdA = freshRanchState();
const herdB = freshRanchState();
ensureRanchSeeded(herdA, content, t0);
ensureRanchSeeded(herdB, content, t0);
assert.deepEqual(herdA.ranch.stock, herdB.ranch.stock);
ensureRanchSeeded(herdA, content, t0 + HOUR);
assert.equal(herdA.ranch.stock.length, 3, 'seeding is one-time');

// --- M2 acceptance: same donor, Juvenile vs. raised-to-Prime extraction.
const m2sim = freshRanchState();
const donorA = createAnimal(m2sim, 'goat', content, t0);
const donorB = structuredClone(donorA); // genetically identical twin
donorB.id = 'a-twin';
m2sim.ranch.stock.push(donorA, donorB);

// A goes straight into the Extractor as a fresh Juvenile.
const juvenileGrade = gradeFor(donorA, content, t0);
const resA = extractAnimal(m2sim, donorA.id, content, t0);
assert.ok(resA.ok);
assert.equal(resA.grade.id, 'standard', `juvenile extraction is Standard (got ${resA.grade.id})`);

// B is raised to Prime with diligent care (goat: prime at 18h).
for (let hour = 1; hour <= 20; hour++) {
  const now = t0 + hour * HOUR;
  applyElapsed(m2sim, content, now);
  for (const action of CARE_ACTIONS) {
    if (careStatus(donorB, now)[action].ready) careAction(m2sim, donorB.id, action, content, now);
  }
}
const tB = t0 + 20 * HOUR;
assert.equal(ageStage(donorB, content, tB), 'prime');
const resB = extractAnimal(m2sim, donorB.id, content, tB);
assert.ok(resB.ok);
assert.ok(
  GRADE_INDEX[resB.grade.id] > GRADE_INDEX[resA.grade.id],
  `raised donor beats juvenile: ${resB.grade.id} > ${resA.grade.id}`
);
assert.ok(resB.grade.mult > resA.grade.mult, 'higher grade carries a bigger stat multiplier');

// Extraction bookkeeping: donor leaves the herd, lineage is permanent.
assert.equal(m2sim.ranch.stock.length, 0, 'both donors graduated out of the herd');
const goatPartCount = Object.values(content.parts).filter((p) => p.species === 'goat').length;
assert.equal(resA.tokens.length, goatPartCount, 'one token per species part');
assert.equal(m2sim.inventory.parts.length, goatPartCount * 2);
assert.equal(m2sim.inventory.vials.length, 2);
for (const token of m2sim.inventory.parts) {
  assert.equal(token.donor.name, donorA.name, 'token remembers its donor');
  assert.ok(token.donor.stars > 0 && content.parts[token.partId]);
}
const ids = m2sim.inventory.parts.map((t) => t.id).concat(m2sim.inventory.vials.map((v) => v.id));
assert.equal(new Set(ids).size, ids.length, 'token ids are unique');
assert.ok(!extractAnimal(m2sim, 'nope', content, tB).ok, 'unknown animal refused');

// Grade formula edges: care has teeth (Law 3), Prime is the peak, and
// Prismatic demands genetics + timing + husbandry all at once.
const model = structuredClone(donorA);
for (const stat of Object.keys(model.potential)) model.potential[stat] = 3;
const at = (stage, cond) => {
  const a = structuredClone(model);
  const g = content.species.goat.growthHours;
  a.birthAt = t0 - (stage === 'juvenile' ? 0 : g[stage] * HOUR);
  a.condition = cond;
  return gradeFor(a, content, t0).id;
};
assert.equal(at('prime', 95), 'apex', '3★ pampered Prime → Apex');
assert.equal(at('prime', 41), 'standard', 'neglect voids a Prime donor (care has teeth)');
assert.equal(at('adult', 95), 'prime', 'well-kept Adult sits between');
assert.ok(GRADE_INDEX[at('elder', 95)] < GRADE_INDEX[at('prime', 95)], 'past peak: Elder < Prime');
const star5 = structuredClone(model);
for (const stat of Object.keys(star5.potential)) star5.potential[stat] = 5;
star5.birthAt = t0 - content.species.goat.growthHours.prime * HOUR;
star5.condition = 100;
assert.equal(gradeFor(star5, content, t0).id, 'prismatic', 'the perfect goat exists');
assert.equal(Math.round(avgStars(star5)), 5);

// --- M3 acceptance: the panel explains why the flightless hippo can't fly.
// Our hippo: eagle wings on the L Rumbler frame stacked with dense parts.
const tk = (partId, grade = 'standard') => ({
  id: `tk-${partId}-${grade}`, partId, grade,
  donor: { name: 'Testie', species: partId.split('_')[0], stars: 3, extractedAt: t0 },
});
const hippoTokens = [tk('bear_head'), tk('eagle_forelimbs'), tk('bear_hindlimbs'), tk('bear_hide')];
const hippo = analyze('L', hippoTokens, content);
assert.ok(hippo.flight.hasLiftSurface && !hippo.flight.capable, 'wings on a rumbler: flightless');
const flightRow = hippo.rows.find((r) => r.label === 'Flight');
assert.equal(flightRow.value, 'FLIGHTLESS');
assert.ok(
  flightRow.note.includes(`Lift ${hippo.lift}`) && flightRow.note.includes(`${hippo.mass} mass`),
  `panel explains with the actual numbers: "${flightRow.note}"`
);
assert.ok(hippo.lift < hippo.mass);

// The same wings on a light build fly; no wings stays grounded politely.
const lightBird = analyze('S', [tk('eagle_head'), tk('eagle_forelimbs')], content);
assert.ok(lightBird.flight.capable, `light build flies (lift ${lightBird.flight.lift} vs mass ${lightBird.mass})`);
assert.equal(lightBird.rows.find((r) => r.label === 'Flight').value, 'FLIGHT-CAPABLE');
const grounded = analyze('M', [tk('goat_head')], content);
assert.ok(!grounded.flight.hasLiftSurface);
assert.equal(grounded.rows.find((r) => r.label === 'Flight').value, 'Ground unit');
// Grade quality lifts harder: apex wings can hoist what standard cannot.
assert.ok(
  analyze('S', [tk('eagle_forelimbs', 'apex')], content).lift >
  analyze('S', [tk('eagle_forelimbs')], content).lift,
  'grade scales lift — better husbandry hoists more'
);
// Somewhere on the mass curve, that difference decides flight.
const liftFlip = ['S', 'M', 'L'].some((f) => {
  const set = (g) => [tk('bear_head', g), tk('eagle_forelimbs', g), tk('bear_hide', g), tk('bear_hindlimbs', g)];
  return !analyze(f, set('standard'), content).flight.capable && analyze(f, set('prismatic'), content).flight.capable;
});
assert.ok(liftFlip, 'grade flips a build from flightless to airborne on some frame');

// Instability: purebred calm vs four-species chaos; thermal conflict bites.
const purebred = analyze('M', [tk('goat_head'), tk('goat_forelimbs'), tk('goat_hindlimbs'), tk('goat_hide')], content);
assert.equal(purebred.purebredSpecies, 'goat');
assert.equal(purebred.instability, 0, 'purebred set steadies the splice');
assert.ok(purebred.rows.some((r) => r.label === 'Purebred bonus' && r.value === 'Cast-Iron Constitution'));
const chaos = analyze('M', [tk('bear_head'), tk('eagle_forelimbs', 'apex'), tk('goat_hindlimbs'), tk('cobra_hide', 'prime')], content);
assert.ok(chaos.instability > purebred.instability);
assert.ok(!chaos.thermal.ok, 'bear + cobra cannot agree on a temperature');
assert.ok(chaos.settlingMs > purebred.settlingMs, 'instability stretches settling');
assert.ok(chaos.settlingMs <= 4 * HOUR + 1);

// --- Splicing: tokens leave the vault, chimera settles on a timer.
const lab = { ...newGameState(), seed: 321 };
lab.inventory.parts = [tk('cobra_head'), tk('cobra_organ'), tk('goat_hindlimbs'), tk('goat_head')];
assert.ok(validateSplice(lab, 'M', {}, content).length, 'headless splices are rejected');
const born = spliceChimera(
  lab, 'S',
  { head: 'tk-cobra_head-standard', organ: 'tk-cobra_organ-standard', hindlimbs: 'tk-goat_hindlimbs-standard' },
  content, t0
);
assert.ok(born.ok, born.msg);
assert.equal(lab.inventory.parts.length, 1, 'consumed tokens left the vault');
assert.equal(lab.chimeras.length, 1);
const c = lab.chimeras[0];
assert.ok(!isSettled(c, t0) && isSettled(c, c.settleUntil), 'settling flips exactly on time');
assert.ok(c.settleUntil - c.createdAt >= 30 * 60000, 'settling has a 30min floor');
assert.deepEqual(lab.discoveredCombos, ['injection'], 'cobra head + venom sac discovers Injection');
assert.equal(born.newCombos[0].name, 'Injection');
const svgChim = renderCreatureSVG(chimeraGenome(c, content), content, { idPrefix: 'chz' });
assert.ok(svgChim.length > 200, 'chimera renders from its tokens');
// Splicing the same combo again is not a re-discovery.
lab.inventory.parts.push(tk('cobra_head', 'prime'), tk('cobra_organ', 'prime'));
const again = spliceChimera(lab, 'S', { head: 'tk-cobra_head-prime', organ: 'tk-cobra_organ-prime' }, content, t0);
assert.ok(again.ok && again.newCombos.length === 0 && lab.discoveredCombos.length === 1);
// Determinism: same seed & order → same chimera names.
const lab2 = { ...newGameState(), seed: 321 };
lab2.inventory.parts = [tk('goat_head')];
const born2 = spliceChimera(lab2, 'M', { head: 'tk-goat_head-standard' }, content, t0);
assert.equal(born2.chimera.name, born.chimera.name, 'chimera naming is seed-deterministic');

// --- v1 → v4 chain still carries everything forward.
const m4 = migrate(structuredClone(v1Save));
assert.equal(m4.saveVersion, SAVE_VERSION);
assert.deepEqual(m4.chimeras, []);
assert.deepEqual(m4.discoveredCombos, []);
const slabUser = migrate({ ...structuredClone(v2Save), activeScreen: 'slab' });
assert.equal(slabUser.activeScreen, 'theater', 'slab dwellers wake up in the Theater');

// --- M4: enemies data coherence.
for (const unit of Object.values(content.enemies)) {
  assert.ok(unit.hp > 0 && unit.moves.length > 0 && unit.koLine && unit.shapes.length, unit.id);
  if (unit.transformInto) assert.ok(content.enemies[unit.transformInto], `${unit.id} transform target`);
}
for (const enc of Object.values(content.encounters)) {
  for (const w of enc.waves) assert.ok(content.enemies[w], `${enc.id}: unknown unit ${w}`);
}

// --- M4: physiology → combatant mapping (moves from parts + combos).
function makeChimera(state2, frame, partGrades, now) {
  for (const [pid, grade] of Object.entries(partGrades)) {
    state2.inventory.parts.push({ id: `bt-${pid}`, partId: pid, grade, donor: { name: 'Donor', species: pid.split('_')[0], stars: 3, extractedAt: now } });
  }
  const slots = Object.fromEntries(
    Object.keys(partGrades).map((pid) => [content.parts[pid].slot, `bt-${pid}`])
  );
  const res = spliceChimera(state2, frame, slots, content, now);
  assert.ok(res.ok, res.msg);
  return res.chimera;
}
const war = { ...newGameState(), seed: 4242 };
const fighter = makeChimera(war, 'M', {
  cobra_head: 'apex', bear_forelimbs: 'standard', goat_hindlimbs: 'standard',
  cobra_organ: 'standard', bear_hide: 'standard', goat_tail: 'standard',
}, t0);
const settledAt = fighter.settleUntil;
let cb = combatantFromChimera(fighter, content, settledAt);
assert.ok(!cb.rejection && cb.ignoreChance >= 0);
assert.ok(cb.moves.some((m) => m.name === 'Venom Fang'), 'head grants its move');
assert.ok(cb.moves.some((m) => m.name === 'Injection'), 'combo grants its move');
assert.ok(!cb.moves.some((m) => m.name === 'Thick Fur'), 'passive hide grants no move');
const apexFang = cb.moves.find((m) => m.name === 'Venom Fang');
assert.equal(apexFang.power, Math.round(40 * 1.3), 'apex grade upgrades the move (+30%)');
const report = analyze(fighter.frame, Object.values(fighter.tokens), content);
assert.equal(cb.maxHp, report.stats.hp, 'battle HP = physiology HP');
assert.equal(cb.staminaMax, report.stats.stamina, 'stamina pool from physiology');
assert.equal(cb.regen, report.regenNet, 'regen minus metabolic draw carries into battle');
// Rejection: same chimera before settling fights weaker.
const unsettledCb = combatantFromChimera(fighter, content, fighter.createdAt);
assert.ok(unsettledCb.rejection && unsettledCb.power < cb.power && unsettledCb.speed < cb.speed);
assert.ok(unsettledCb.ignoreChance > cb.ignoreChance, 'unsettled chimeras obey less');

// --- Tag chart: data-driven effectiveness.
assert.equal(tagMultiplier(['Ground'], ['Airborne'], content.tagChart).mult, 0, 'Ground misses Airborne');
assert.equal(tagMultiplier(['Electric'], ['Aquatic'], content.tagChart).mult, 2, 'Electric ≫ Aquatic');
assert.ok(tagMultiplier(['Sonic'], ['Armored'], content.tagChart).ignoreArmor, 'Sonic ignores Armor');
assert.equal(tagMultiplier(['Gas'], ['Vehicle'], content.tagChart).mult, 0, 'vehicles do not breathe');
assert.equal(tagMultiplier([], ['Armored'], content.tagChart).mult, 1);

// --- Deterministic full battle: same seed + same script → same outcome.
function playScripted(seed) {
  const s = { ...newGameState(), seed: 4242 };
  const f = makeChimera(s, 'M', {
    cobra_head: 'apex', bear_forelimbs: 'standard', goat_hindlimbs: 'standard',
    cobra_organ: 'standard', bear_hide: 'standard', goat_tail: 'standard',
  }, t0);
  const b = createBattle([f], content.encounters.patrol_1, content, seed, f.settleUntil);
  let guard = 0;
  while (!b.over && guard++ < 200) {
    const acts = playerActions(b);
    assert.ok(acts.length, 'always at least one legal action');
    // Greedy: strongest affordable damaging move, else first action.
    const best = acts.filter((a) => a.type === 'move')
      .sort((a, b2) => playerActive(b).moves[b2.index].power - playerActive(b).moves[a.index].power)[0] ?? acts[0];
    step(b, best, content);
  }
  assert.ok(b.over, 'battle terminates');
  return b;
}
const runA = playScripted(777);
const runB = playScripted(777);
assert.deepEqual(runA.log, runB.log, 'battles are reproducible from a seed');
assert.notDeepEqual(playScripted(778).log, runA.log, 'different seed, different fight');
assert.ok(runA.log.some((l) => l.includes('parachutes') || l.includes('hoisted')), 'zero death language: they leave in style');

// --- Stamina economy: costs drain, unaffordable moves vanish, rest restores.
const stamState = { ...newGameState(), seed: 9 };
const stamFighter = makeChimera(stamState, 'S', { bear_forelimbs: 'standard', goat_head: 'standard' }, t0);
const sb = createBattle([stamFighter], content.encounters.patrol_1, content, 5, stamFighter.settleUntil);
const meCb = playerActive(sb);
meCb.stamina = 12; // below Haymaker's 35
const actsNow = playerActions(sb);
assert.ok(!actsNow.some((a) => a.label === 'Haymaker'), 'unaffordable moves are off the menu');
assert.ok(actsNow.some((a) => a.type === 'rest'), 'Catch Breath is always there');
const before = meCb.stamina;
step(sb, actsNow.find((a) => a.type === 'rest'), content);
assert.ok(meCb.stamina > before, 'rest restores stamina');

// --- Priority beats speed; switching costs the turn.
const slowCbBase = combatantFromUnit(content.enemies.riot_squad);
assert.ok(slowCbBase.speed >= 0); // sanity
const prioState = { ...newGameState(), seed: 11 };
const prioFighter = makeChimera(prioState, 'L', { mantis_forelimbs: 'standard', goat_head: 'standard', bear_hide: 'standard' }, t0);
const pb = createBattle([prioFighter], content.encounters.patrol_2, content, 31, prioFighter.settleUntil);
playerActive(pb).speed = 1; // slower than everything
const trample = playerActions(pb).find((a) => a.label === 'Scythe Strike');
assert.ok(trample, 'the duelist has its priority move');
const evs = step(pb, trample, content);
const myLine = evs.findIndex((e) => e.includes('Scythe Strike'));
const foeLine = evs.findIndex((e) => e.includes(pb.enemy.active.name) && e.includes('uses'));
assert.ok(myLine !== -1 && (foeLine === -1 || myLine < foeLine), 'priority move goes first despite speed 1');

// --- Boss transforms into stage two, then falls for the win.
function grind(encounterId, seed) {
  const s = { ...newGameState(), seed: 99, funds: 0 };
  const f1 = makeChimera(s, 'L', { bear_head: 'prismatic', bear_forelimbs: 'prismatic', bear_hide: 'prismatic', bear_organ: 'prismatic' }, t0);
  const f2 = makeChimera(s, 'M', { goat_head: 'prismatic', goat_hindlimbs: 'prismatic', goat_organ: 'prismatic' }, t0);
  const now2 = Math.max(f1.settleUntil, f2.settleUntil);
  const b = createBattle([f1, f2], content.encounters[encounterId], content, seed, now2);
  s.battle = b;
  const events = [];
  let guard = 0;
  while (!b.over && guard++ < 400) {
    const acts = playerActions(b);
    if (!acts.length) break;
    const best = acts.filter((a) => a.type === 'move')
      .sort((x, y) => playerActive(b).moves[y.index].power - playerActive(b).moves[x.index].power)[0] ?? acts[0];
    events.push(...step(b, best, content));
  }
  return { s, b, now2, events };
}
const bossRun = grind('boss_clampdown', 12345);
assert.ok(bossRun.b.over, 'boss battle terminates');
assert.ok(bossRun.events.some((l) => l.includes('ACTIVATE THE 9000')), 'boss transforms mid-fight');
if (bossRun.b.outcome === 'win') {
  // Stage two either retires gleefully or gets bagged by the cannon — the
  // 9000 is salvageable, so capture is a legitimate second win path.
  const retired = bossRun.events.some((l) => l.includes('bouncy castle'));
  const bagged = bossRun.b.captured.includes('clampdown_9000');
  assert.ok(retired || bagged, 'stage two is either retired or impounded');
}

// --- Law 1: losing (or winning ugly) sends chimeras to the Infirmary.
const law1 = grind('patrol_1', 55);
const result = finishBattle(law1.s, law1.b, content, law1.now2);
assert.equal(law1.s.battle, null, 'battle cleared after aftermath');
if (result.outcome === 'win') assert.ok(law1.s.funds > 0, 'victory pays');
const koCount = law1.b.player.team.filter((c) => c.hp <= 0).length;
assert.equal(result.injuries.length, koCount, 'every KO becomes an Infirmary stay');
for (const inj of result.injuries) {
  const ch = law1.s.chimeras.find((x) => x.name === inj.chimera);
  assert.ok(isInjured(ch, law1.now2), 'injured now');
  assert.ok(!isInjured(ch, ch.injury.until + 1), 'and healed after the timer');
}

// A guaranteed loss also feeds back (weak unsettled fighter vs the boss).
const loseState = { ...newGameState(), seed: 66 };
const weakling = makeChimera(loseState, 'S', { goat_tail: 'standard', goat_head: 'standard' }, t0);
const lb = createBattle([weakling], content.encounters.boss_clampdown, content, 8, t0); // unsettled: t0 < settleUntil
assert.ok(playerActive(lb).rejection, 'deploying before settling brings Rejection');
loseState.battle = lb;
let guard = 0;
while (!lb.over && guard++ < 300) {
  const acts = playerActions(lb);
  step(lb, acts[0], content);
}
assert.equal(lb.outcome, 'loss');
const lossResult = finishBattle(loseState, lb, content, t0);
assert.equal(lossResult.injuries.length, 1, 'the fallen get Infirmary timers');
assert.equal(loseState.warRecord.losses, 1);

// --- Obedience: high-instability unsettled chimeras freelance sometimes.
let ignores = 0;
for (let i = 0; i < 60; i++) {
  const os = { ...newGameState(), seed: 1000 + i };
  const of = makeChimera(os, 'M', { cobra_head: 'apex', bear_forelimbs: 'standard', goat_hindlimbs: 'prime' }, t0);
  const ob = createBattle([of], content.encounters.patrol_1, content, i, t0);
  const move = playerActions(ob).find((a) => a.type === 'move');
  const evs2 = step(ob, move, content);
  if (evs2.some((e) => e.includes('ignores orders'))) ignores++;
}
assert.ok(ignores > 2 && ignores < 40, `obedience wavers believably (${ignores}/60 ignored)`);

// --- Mid-battle serialization: JSON round-trip continues identically.
const serA = playScriptedPartial(4321, 3);
const serB = playScriptedPartial(4321, 3, true);
assert.deepEqual(serA.log, serB.log, 'save/reload mid-battle changes nothing');
function playScriptedPartial(seed, pauseAt, roundTrip = false) {
  const s = { ...newGameState(), seed: 4242 };
  const f = makeChimera(s, 'M', { cobra_head: 'apex', bear_forelimbs: 'standard', goat_hindlimbs: 'standard', cobra_organ: 'standard', bear_hide: 'standard', goat_tail: 'standard' }, t0);
  let b = createBattle([f], content.encounters.patrol_2, content, seed, f.settleUntil);
  let guard = 0;
  while (!b.over && guard++ < 200) {
    if (guard === pauseAt && roundTrip) b = JSON.parse(JSON.stringify(b));
    const acts = playerActions(b);
    const best = acts.filter((a) => a.type === 'move')
      .sort((x, y) => playerActive(b).moves[y.index].power - playerActive(b).moves[x.index].power)[0] ?? acts[0];
    step(b, best, content);
  }
  return b;
}

// --- M4.5: the balance harness runs, and it catches the planted combo.
const clean = runSim(content, { builds: 12, seedsPer: 2 });
assert.ok(clean.rows.length >= 12);
assert.ok(clean.rows.every((r) => r.winRate >= 0 && r.winRate <= 1));
assert.ok(clean.rows.some((r) => r.perEncounter.patrol_1 === 1), 'the first patrol is beatable at standard grade');
assert.ok(!clean.flags.some((f) => f.kind === 'OP'), 'clean data has no OP builds at standard grade');
const planted = runSim(plantBrokenCombo(content), { builds: 12, seedsPer: 2 });
assert.ok(
  planted.flags.some(
    (f) => f.kind === 'OP' && f.partIds.includes('cobra_head') && f.partIds.includes('cobra_organ')
  ),
  'the harness catches a deliberately broken combo'
);
// Grades are the power curve: apex builds crack encounters standard cannot.
const apex = runSim(content, { builds: 8, seedsPer: 2, grade: 'apex' });
const bossAtApex = Math.max(...apex.rows.map((r) => r.perEncounter.boss_clampdown));
const bossAtStd = Math.max(...clean.rows.map((r) => r.perEncounter.boss_clampdown));
assert.ok(bossAtApex > bossAtStd, `grades move the boss ceiling (${bossAtStd} → ${bossAtApex})`);

// --- M5: campaign data coherence.
const region = Object.values(content.regions)[0];
for (const node of region.nodes) {
  assert.ok(content.encounters[node.encounter], `${node.id}: unknown encounter`);
  assert.ok(node.incomePerDay > 0 && node.notoriety > 0, node.id);
}
assert.ok(content.encounters[content.campaignMeta.rescueEncounter], 'rescue template exists');
for (const unit of Object.values(content.enemies)) {
  for (const p of unit.salvage ?? []) assert.ok(content.parts[p], `${unit.id}: unknown salvage part ${p}`);
}
assert.ok(content.parts.riot_plating && content.parts.v8_heart, 'enemy-tech parts exist');
assert.ok(content.species.salvage, 'salvage pseudo-species exists');

// --- M5: node progression, income, threat generations.
const camp = { ...newGameState(), seed: 777, funds: 0 };
let states = nodeStates(camp, content);
assert.equal(states[0].status, 'available');
assert.ok(states.slice(1).every((s) => s.status === 'locked'), 'strip unlocks in order');
camp.campaign.heldNodes.push('barn_perimeter');
states = nodeStates(camp, content);
assert.equal(states[1].status, 'available');
assert.equal(states[4].status, 'locked', 'guard post needs Threat Gen 2');
assert.equal(incomePerDay(camp, content), 25);
camp.campaign.lastTickAt = t0;
tickCampaign(camp, content, t0 + 2 * 24 * HOUR);
assert.ok(Math.abs(camp.funds - 50) < 0.01, `held nodes pay income (${camp.funds})`);
camp.campaign.notoriety = 65; // past threatGen2At
assert.equal(threatGen(camp, content), 2);
assert.equal(nodeStates(camp, content)[4].status, 'locked', 'still strip-gated behind the boss');

// --- M5 ACCEPTANCE: losing a battle creates a rescue mission with a live timer.
const m5lab = { ...newGameState(), seed: 505 };
m5lab.campaign.lastTickAt = t0;
const doomed = makeChimera(m5lab, 'S', { goat_head: 'standard', goat_tail: 'standard' }, t0);
const strong1 = makeChimera(m5lab, 'L', { bear_head: 'prismatic', bear_forelimbs: 'prismatic', bear_hide: 'prismatic', bear_organ: 'prismatic' }, t0);
const strong2 = makeChimera(m5lab, 'M', { goat_head: 'prismatic', goat_hindlimbs: 'prismatic', goat_organ: 'prismatic' }, t0);
const tReady = Math.max(doomed.settleUntil, strong1.settleUntil, strong2.settleUntil);

function autoplay(battle) {
  let guard = 0;
  while (!battle.over && guard++ < 400) {
    const acts = playerActions(battle);
    const cap = acts.find((a) => a.type === 'capture');
    const best = cap ?? acts.filter((a) => a.type === 'move')
      .sort((x, y) => playerActive(battle).moves[y.index].power - playerActive(battle).moves[x.index].power)[0] ?? acts[0];
    step(battle, best, content);
  }
  return battle;
}

m5lab.battle = createBattle([doomed], content.encounters.boss_clampdown, content, 41, tReady, { kind: 'assault', nodeId: 'precinct' });
autoplay(m5lab.battle);
assert.equal(m5lab.battle.outcome, 'loss');
const lossDetail = resolveBattle(m5lab, m5lab.battle, content, tReady);
assert.equal(lossDetail.capturedChimera, doomed.name, 'a downed chimera is captured on loss');
assert.equal(m5lab.campaign.captives.length, 1, 'rescue mission exists');
const captive = m5lab.campaign.captives[0];
assert.ok(!m5lab.chimeras.some((c) => c.id === doomed.id), 'captive left the roster');
const windowH = (captive.deadline - tReady) / HOUR;
assert.ok(windowH >= 12 && windowH <= 24, `live rescue window of ${windowH}h`);
tickCampaign(m5lab, content, tReady + HOUR);
assert.equal(m5lab.campaign.captives.length, 1, 'window still open — timer is live, not instant');
assert.ok(m5lab.news.some((n) => n.includes('CAPTURED')), 'the ticker knows');

// Rescue raid: win it, get the creature back (injured, fonder of you).
m5lab.battle = createBattle([strong1, strong2], content.encounters[content.campaignMeta.rescueEncounter], content, 42, tReady + HOUR, { kind: 'rescue', captiveId: captive.id });
autoplay(m5lab.battle);
assert.equal(m5lab.battle.outcome, 'win', 'the prismatic rescue squad delivers');
const rescueDetail = resolveBattle(m5lab, m5lab.battle, content, tReady + HOUR);
assert.equal(rescueDetail.freed, doomed.name);
assert.equal(m5lab.campaign.captives.length, 0);
const freed = m5lab.chimeras.find((c) => c.id === doomed.id);
assert.ok(freed && isInjured(freed, tReady + HOUR) && freed.bond === 10, 'home, bandaged, bonded');

// Expiry path: ignore a captive past its deadline → lost + the enemy learns.
const m5lab2 = { ...newGameState(), seed: 506 };
m5lab2.campaign.lastTickAt = t0;
const doomed2 = makeChimera(m5lab2, 'S', { cobra_head: 'standard' }, t0);
m5lab2.battle = createBattle([doomed2], content.encounters.boss_clampdown, content, 43, doomed2.settleUntil, { kind: 'assault', nodeId: 'precinct' });
autoplay(m5lab2.battle);
assert.equal(m5lab2.battle.outcome, 'loss');
resolveBattle(m5lab2, m5lab2.battle, content, doomed2.settleUntil);
assert.equal(m5lab2.campaign.captives.length, 1);
tickCampaign(m5lab2, content, doomed2.settleUntil + 25 * HOUR);
assert.equal(m5lab2.campaign.captives.length, 0, 'the window closed');
assert.equal(m5lab2.directorStats.dissections.length, 1, 'dissection recorded for the AI director');
assert.ok(m5lab2.directorStats.dissections[0].partIds.includes('cobra_head'));
assert.ok(m5lab2.news.some((n) => n.includes('internship')), 'zero death language, even in defeat');

// --- M5: conquest holds nodes, pays, raises notoriety to Threat Gen 2.
const conq = { ...newGameState(), seed: 900, funds: 0 };
conq.campaign.lastTickAt = t0;
const army = [
  makeChimera(conq, 'L', { bear_head: 'prismatic', bear_forelimbs: 'prismatic', bear_hide: 'prismatic', bear_organ: 'prismatic' }, t0),
  makeChimera(conq, 'M', { goat_head: 'prismatic', goat_hindlimbs: 'prismatic', goat_organ: 'prismatic' }, t0),
  makeChimera(conq, 'M', { cobra_head: 'prismatic', cobra_organ: 'prismatic', goat_hindlimbs: 'prismatic' }, t0),
];
const tWar = Math.max(...army.map((c) => c.settleUntil));
for (const { node } of nodeStates(conq, content)) {
  if (node.threatGen === 2) continue;
  const alive = () => conq.chimeras.filter((c) => !isInjured(c, tWar));
  conq.battle = createBattle(alive(), content.encounters[node.encounter], content, hashString(node.id), tWar, { kind: 'assault', nodeId: node.id });
  autoplay(conq.battle);
  assert.equal(conq.battle.outcome, 'win', `prismatic army takes ${node.id}`);
  resolveBattle(conq, conq.battle, content, tWar);
  for (const c of conq.chimeras) c.injury = null; // field hospital, sim-side
}
assert.equal(conq.campaign.heldNodes.length, 4);
assert.equal(conq.campaign.notoriety, 65);
assert.equal(threatGen(conq, content), 2, 'boss conquest tips Threat Gen 2');
assert.equal(nodeStates(conq, content)[4].status, 'available', 'Gen 2 node unlocked');
assert.ok(conq.news.some((n) => n.includes('THREAT LEVEL UP')));
assert.equal(incomePerDay(conq, content), 225);

// --- M5: Containment Cannon + salvage.
const capLab = { ...newGameState(), seed: 911 };
// A tanky hunter with a deliberately weak jab — the restraint minigame.
const hunter = makeChimera(capLab, 'L', { bear_head: 'prime', goat_forelimbs: 'prime', bear_hide: 'prime', goat_organ: 'prime' }, t0);
const capEncounter = { id: 'test_capture', name: 'Impound Bait', waves: ['riot_squad', 'police_cruiser'], reward: 10 };
let captured = false;
for (let seed = 70; seed < 100 && !captured; seed++) {
  capLab.battle = createBattle([hunter], capEncounter, content, seed, hunter.settleUntil, { kind: 'assault', nodeId: null });
  let guard5 = 0;
  while (!capLab.battle.over && guard5++ < 200) {
    const acts = playerActions(capLab.battle);
    const cap = acts.find((a) => a.type === 'capture');
    if (cap) {
      step(capLab.battle, cap, content);
      captured = true;
      continue;
    }
    const weakest = acts.filter((a) => a.type === 'move')
      .sort((x, y) => playerActive(capLab.battle).moves[x.index].power - playerActive(capLab.battle).moves[y.index].power)
      .find((a) => playerActive(capLab.battle).moves[a.index].power > 0);
    step(capLab.battle, weakest ?? acts.find((a) => a.type === 'rest'), content);
  }
}
assert.ok(captured, 'the cannon charged and fired');
assert.deepEqual(capLab.battle.captured, ['police_cruiser']);
const capDetail = resolveBattle(capLab, capLab.battle, content, hunter.settleUntil);
assert.equal(capLab.campaign.containment.length, 1, 'impounded unit reached Containment');
assert.ok(capDetail.outcome === 'win', 'capturing the last wave wins the battle');
const salvaged = salvageUnit(capLab, 0, content, hunter.settleUntil);
assert.ok(salvaged.ok && salvaged.tokens.length === 1 && salvaged.tokens[0].partId === 'v8_heart');
assert.equal(capLab.campaign.containment.length, 0);
assert.ok(capLab.inventory.parts.some((tk) => tk.partId === 'v8_heart'), 'enemy tech in the vault');
assert.ok(!salvageUnit(capLab, 5, content, t0).ok, 'empty bay refused');

// --- M6: breeding validation gates.
function breedLab(seed = 606) {
  const s = { ...newGameState(), seed };
  s.ranch = { stock: [], penCapacity: 20, animalCount: 0, seeded: false, eggs: [], eggCount: 0 };
  return s;
}
function stockAnimal(s, species, sex, stars, ageHours, id) {
  const a = createAnimal(s, species, content, t0 - ageHours * HOUR);
  a.sex = sex;
  if (id) a.id = id;
  for (const st of Object.keys(a.potential)) a.potential[st] = stars;
  s.ranch.stock.push(a);
  return a;
}
{
  const s = breedLab();
  const nanny = stockAnimal(s, 'goat', 'F', 3, 24);
  const billy = stockAnimal(s, 'goat', 'M', 3, 24);
  const bear = stockAnimal(s, 'bear', 'M', 3, 48);
  const nanny2 = stockAnimal(s, 'goat', 'F', 3, 24);
  const kid = stockAnimal(s, 'goat', 'M', 3, 1); // juvenile
  assert.ok(canBreed(nanny, billy, s, content, t0).ok);
  assert.ok(!canBreed(nanny, bear, s, content, t0).ok, 'no cross-species eggs');
  assert.ok(!canBreed(nanny, nanny2, s, content, t0).ok, 'same-sex pair: friendship only');
  assert.ok(!canBreed(nanny, kid, s, content, t0).ok, 'juveniles are off-limits');
  assert.ok(!canBreed(nanny, nanny, s, content, t0).ok);
  for (let i = 0; i < BREEDING.incubatorSlots; i++) {
    assert.ok(breedPair(s, nanny.id, billy.id, content, t0).ok);
  }
  assert.ok(!breedPair(s, nanny.id, billy.id, content, t0).ok, 'incubator caps eggs');

  // Incubation is a real timer: goat = 30min, no early hatching.
  const egg = s.ranch.eggs[0];
  assert.equal(egg.hatchAt - egg.laidAt, 30 * 60000, 'goat eggs take 30 minutes');
  assert.ok(!hatchEgg(s, egg.id, content, egg.hatchAt - 1).ok, 'no peeking');
  const hatched = hatchEgg(s, egg.id, content, egg.hatchAt + 1);
  assert.ok(hatched.ok);
  assert.equal(ageStage(hatched.hatchling, content, egg.hatchAt + 1), 'juvenile');
  assert.deepEqual(hatched.hatchling.potential, egg.potential, 'genetics decided at conception');
  assert.equal(hatched.hatchling.parents.sire.name, billy.name, 'family tree records the lineage');
  // Pen capacity gates hatching.
  s.ranch.penCapacity = s.ranch.stock.length;
  assert.ok(!hatchEgg(s, s.ranch.eggs[0].id, content, t0 + HOUR).ok, 'no homeless hatchlings');
  // Determinism: same seed + same egg counter → identical egg.
  const s2 = breedLab();
  stockAnimal(s2, 'goat', 'F', 3, 24, nanny.id);
  stockAnimal(s2, 'goat', 'M', 3, 24, billy.id);
  const eggA = breedPair(s2, nanny.id, billy.id, content, t0).egg;
  const s3 = breedLab();
  stockAnimal(s3, 'goat', 'F', 3, 24, nanny.id);
  stockAnimal(s3, 'goat', 'M', 3, 24, billy.id);
  const eggB = breedPair(s3, nanny.id, billy.id, content, t0).egg;
  assert.deepEqual(eggA.potential, eggB.potential, 'eggs are seed-deterministic');
}

// --- M6 ACCEPTANCE: two starred parents produce a measurably better egg.
function meanEggStars(stars, seedBase, n = 150) {
  let total = 0;
  let mutations = 0;
  for (let i = 0; i < n; i++) {
    const s = breedLab(seedBase + i);
    const dam = stockAnimal(s, 'goat', 'F', stars, 24);
    const sire = stockAnimal(s, 'goat', 'M', stars, 24);
    const { egg } = breedPair(s, sire.id, dam.id, content, t0);
    total += STATS.reduce((sum, st) => sum + egg.potential[st], 0) / STATS.length;
    if (egg.mutationNote) mutations++;
  }
  return { mean: total / n, mutations };
}
const fiveStar = meanEggStars(5, 10000);
const twoStar = meanEggStars(2, 20000);
assert.ok(fiveStar.mean > 4.4, `5★ parents breed near the ceiling (${fiveStar.mean.toFixed(2)})`);
assert.ok(twoStar.mean < 2.8, `2★ parents stay modest (${twoStar.mean.toFixed(2)})`);
assert.ok(fiveStar.mean - twoStar.mean > 1.5, 'starred parents are MEASURABLY better');
// And better than the mail-order lottery (E≈3):
const s4 = breedLab(999);
let catalogTotal = 0;
for (let i = 0; i < 150; i++) {
  const a = createAnimal(s4, 'goat', content, t0);
  catalogTotal += STATS.reduce((sum, st) => sum + a.potential[st], 0) / STATS.length;
}
assert.ok(fiveStar.mean > catalogTotal / 150 + 1, 'selective breeding beats the catalog');
// Mutation rate lands near the configured 8%.
const totalMut = fiveStar.mutations + twoStar.mutations; // 300 eggs
assert.ok(totalMut >= 8 && totalMut <= 50, `mutations occur at a sane rate (${totalMut}/300)`);

// --- M6: trait genetics — Mendel with a lab coat.
{
  const s = breedLab(707);
  const dam = stockAnimal(s, 'goat', 'F', 3, 24);
  const sire = stockAnimal(s, 'goat', 'M', 3, 24);
  sire.genotype = { dense_bones: 2 }; // homozygous sire passes always
  sire.traits = expressedTraits(sire.genotype, content);
  assert.deepEqual(sire.traits, ['dense_bones'], 'dominant trait expresses with one+ allele');
  const { egg } = breedPair(s, sire.id, dam.id, content, t0);
  assert.ok((egg.genotype.dense_bones ?? 0) >= 1, 'homozygous parent always passes the allele');
  const kid = hatchEgg(s, egg.id, content, egg.hatchAt + 1).hatchling;
  assert.ok(kid.traits.includes('dense_bones'), 'hatchling expresses the inherited trait');

  // The trait has teeth: extraction stamps it, physiology pays it out.
  kid.birthAt = t0 - 100 * HOUR; // fast-forward to elder for extraction
  const res = extractAnimal(s, kid.id, content, t0);
  const headTok = res.tokens.find((tk) => content.parts[tk.partId].slot === 'head');
  const organTok = res.tokens.find((tk) => content.parts[tk.partId].slot === 'organ');
  assert.deepEqual(headTok.traits, ['dense_bones'], 'head token stamped');
  assert.deepEqual(organTok.traits, [], 'organ token unstamped (trait is head/hide only)');
  const plain = { ...headTok, traits: [] };
  const armorWith = analyze('M', [headTok], content).stats.armor;
  const armorWithout = analyze('M', [plain], content).stats.armor;
  assert.equal(armorWith - armorWithout, 3, 'Dense Bones = +3 armor in the physiology engine');
}

// Starter herd is always a breedable goat pair (tutorial guarantee).
{
  const s = { ...newGameState(), seed: 31337 };
  ensureRanchSeeded(s, content, t0);
  assert.equal(s.ranch.stock[0].sex, 'F');
  assert.equal(s.ranch.stock[1].sex, 'M');
  assert.equal(s.ranch.stock[0].species, 'goat');
  assert.equal(s.ranch.stock[1].species, 'goat');
}

// --- v1 → v9 chain.
const m5 = migrate(structuredClone(v1Save));
assert.equal(m5.saveVersion, SAVE_VERSION);
assert.equal(m5.battle, null);
assert.deepEqual(m5.warRecord, { wins: 0, losses: 0 });
assert.deepEqual(m5.campaign, { heldNodes: [], notoriety: 0, captives: [], containment: [], rivals: {}, lastTickAt: null });
assert.deepEqual(m5.news, []);
assert.deepEqual(m5.directorStats.dissections, []);
const v5WithBattle = {
  ...structuredClone(v1Save),
  saveVersion: 5,
  chimeras: [],
  funds: 300,
  ranch: { stock: [], penCapacity: 4, animalCount: 0, seeded: false },
  inventory: { vials: [], parts: [], tokenCount: 0 },
  battle: { enemy: { active: {} }, log: [] },
};
const patched = migrate(v5WithBattle);
assert.deepEqual(patched.battle.cannon, { charge: 0 }, 'in-flight v5 battles gain cannon fields');

// --- M7: Splice-Dex recording rides the existing flows.
assert.ok(m2sim.dex.parts.includes('goat_head'), 'extraction records dex parts');
assert.ok(m5lab.dex.enemies.includes('riot_squad') && m5lab.dex.enemies.includes('captain_clampdown'), 'battles record dex enemies');
assert.ok(capLab.dex.parts.includes('v8_heart'), 'salvage records dex parts');

// --- M7: training raises bond; obedience rises with it.
{
  const s = { ...newGameState(), seed: 808, funds: 100 };
  const trainee = makeChimera(s, 'M', { cobra_head: 'apex', bear_forelimbs: 'standard', goat_hindlimbs: 'prime' }, t0);
  const tSet = trainee.settleUntil;
  const before = obediencePercent(trainee, tSet);
  const r1 = trainChimera(s, trainee.id, tSet);
  assert.ok(r1.ok && trainee.bond === TRAINING.bondGain);
  assert.ok(!trainChimera(s, trainee.id, tSet + HOUR).ok, 'training has a cooldown');
  assert.ok(trainChimera(s, trainee.id, tSet + 21 * HOUR).ok, 'cooldown expires');
  assert.ok(obediencePercent(trainee, tSet) > before, 'bond raises obedience');
  s.funds = 0;
  assert.ok(!trainChimera(s, trainee.id, tSet + 48 * HOUR).ok, 'treats cost money');
  const unsettledPct = obediencePercent(trainee, trainee.createdAt);
  assert.ok(unsettledPct < obediencePercent(trainee, tSet), 'unsettled chimeras obey less');
}

// --- M7: onboarding derives purely from state.
{
  const s = { ...newGameState(), seed: 55 };
  ensureRanchSeeded(s, content, t0);
  assert.ok(onboardingActive(s));
  let steps = onboardingSteps(s, content, t0);
  assert.equal(steps.filter((x) => x.done).length, 0);
  assert.equal(steps.find((x) => !x.done).label, 'Care for an animal');
  careAction(s, s.ranch.stock[0].id, 'groom', content, t0);
  steps = onboardingSteps(s, content, t0);
  assert.ok(steps[0].done && !steps[1].done);
  s.ranch.stock[0].birthAt = t0 - 100 * HOUR;
  extractAnimal(s, s.ranch.stock[0].id, content, t0);
  assert.ok(onboardingSteps(s, content, t0)[1].done, 'extraction advances the path');
  s.campaign.heldNodes.push('barn_perimeter');
  assert.ok(!onboardingActive(s), 'the checklist retires after first conquest');
  assert.ok(onboardingActive(conq) === false, 'conquered fixtures agree');
}

// --- M7: PWA shell — manifest valid, sw precache list matches real files.
{
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'));
  assert.ok(manifest.name === 'Spliceworld' && manifest.display === 'standalone' && manifest.icons.length);
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  assert.ok(sw.includes(`spliceworld-v${SAVE_VERSION}`), 'sw cache version tracks SAVE_VERSION');
  const shellFiles = [...sw.matchAll(/'([^']+\.(?:js|json|css|html|svg|webmanifest))'/g)].map((m) => m[1]);
  assert.ok(shellFiles.length > 20, 'precache list is populated');
  for (const f of shellFiles) {
    assert.ok(readFileSync(join(root, f)), `sw precaches a real file: ${f}`);
  }
  readFileSync(join(root, 'icon.svg')); // exists
  readFileSync(join(root, 'docs/TWA.md'));
}

// --- M7: v8 migration backfills the dex from owned tokens.
{
  const v7ish = migrate(structuredClone(v1Save)); // gives v8 empty everything
  assert.deepEqual(v7ish.settings, { muted: false });
  assert.deepEqual(v7ish.dex, { parts: [], enemies: [], traits: [] });
  const richV7 = { ...structuredClone(v1Save) };
  const chain = migrate(richV7); // walk to v8 baseline shape…
  // …then simulate a v7 save that owned things:
  const owned = {
    ...structuredClone(chain),
    saveVersion: 7,
    inventory: { vials: [], tokenCount: 2, parts: [{ id: 't0', partId: 'goat_head', grade: 'prime', donor: {} }] },
    chimeras: [{ id: 'c0', tokens: { organ: { partId: 'cobra_organ' } }, bond: 0 }],
  };
  delete owned.settings;
  delete owned.dex;
  const back = migrate(owned);
  assert.ok(back.dex.parts.includes('goat_head') && back.dex.parts.includes('cobra_organ'), 'dex backfilled from vault + chimeras');
  assert.equal(back.chimeras[0].lastTrainedAt, 0, 'training field patched in');
}

// --- Resilience: a save holding a token for a part that no longer exists
// --- must be ignored, not crash the vault/theater/physiology.
{
  const ghost = { id: 'ghost', partId: 'pterodactyl_wings', grade: 'prime', donor: { name: 'Ghost', species: 'x', stars: 1, extractedAt: 0 } };
  const r = analyze('M', [ghost, tk('goat_head')], content);
  assert.ok(r.stats.hp > 0, 'physiology skips the unknown part and still reports');
  assert.equal(r.rows.find((x) => x.label === 'Chassis').value, '2/6 sockets filled');
}

// --- Audit follow-up: the panel warns before you field a head-only chimera.
{
  const thin = analyze('M', [tk('goat_head')], content).rows.find((r) => r.label === 'Chassis');
  assert.ok(thin && thin.note.includes('not survive'), 'head-only build is called out');
  const full = analyze('M', [tk('goat_head'), tk('goat_forelimbs'), tk('goat_hindlimbs'),
    tk('goat_tail'), tk('goat_hide'), tk('goat_organ')], content);
  assert.ok(!full.rows.some((r) => r.label === 'Chassis'), 'a complete build gets no warning');
}

// --- Wave 1: no part may reach past the viewBox on any frame. A tail that
// --- overflows gets cropped to a "trumpet" and nobody notices for a week.
{
  const bad = overflowingParts();
  assert.deepEqual(bad, [], `parts cropped by the viewBox: ${bad.map((b) => `${b.part}@${b.frame}+${b.over}`).join(', ')}`);
}

// --- Wave 1: the elemental class triangle, derived from anatomy.
{
  const cls = readJSON('data/classes.json');
  assert.equal(cls.classes.length, 3);
  // The triangle must be a cycle, not a hierarchy.
  const beats = Object.fromEntries(cls.classes.map((c) => [c.id, c.beats]));
  assert.equal(beats[beats[beats.ground]], 'ground', 'ground → water → air → ground closes the loop');
  assert.equal(new Set(Object.values(beats)).size, 3, 'every class is beaten by exactly one other');

  // Multipliers read off the chart.
  assert.equal(classMultiplier('ground', 'water', content), cls.advantage);
  assert.equal(classMultiplier('water', 'ground', content), cls.disadvantage);
  assert.equal(classMultiplier('air', 'air', content), 1, 'mirror is neutral');
  assert.equal(classMultiplier(null, 'air', content), 1, 'Unclassed neither exploits…');
  assert.equal(classMultiplier('air', null, content), 1, '…nor is exploited');

  // Class comes from PARTS, not species: anatomy votes.
  const wings = tk('eagle_forelimbs'), fan = tk('eagle_tail');
  const hooves = tk('goat_hindlimbs'), forelegs = tk('goat_forelimbs');
  const fins = tk('shark_hindlimbs'), finTail = tk('shark_tail'), gills = tk('shark_head');
  assert.equal(analyze('S', [wings, fan, tk('goat_head')], content).creatureClass, 'air', 'wings + tailfan = Air');
  assert.equal(analyze('M', [hooves, forelegs, tk('goat_head')], content).creatureClass, 'ground', 'feet = Ground');
  assert.equal(analyze('L', [gills, fins, finTail], content).creatureClass, 'water', 'gills + fins = Water');
  // A tie is genuinely Unclassed — the hybrid's trade-off.
  assert.equal(analyze('M', [wings, hooves, tk('goat_head')], content).creatureClass, null, 'one wing vote vs one foot vote = Unclassed');
  assert.equal(analyze('M', [tk('goat_head'), tk('goat_hide')], content).creatureClass, null, 'no limbs = Unclassed');
  // Adding a second air vote breaks the tie.
  assert.equal(analyze('M', [wings, fan, hooves, tk('goat_head')], content).creatureClass, 'air', 'majority wins');

  // The panel explains it (Law 4).
  const airRow = analyze('S', [wings, fan, tk('goat_head')], content).rows.find((r) => r.label === 'Class');
  assert.ok(airRow.value.includes('Air') && airRow.note.includes('Ground'), `panel explains the matchup: ${airRow.note}`);
  const tieRow = analyze('M', [wings, hooves, tk('goat_head')], content).rows.find((r) => r.label === 'Class');
  assert.equal(tieRow.value, 'Unclassed');
  assert.ok(tieRow.note.includes('tied'), 'panel explains why it is Unclassed');

  // …and it changes damage in a real fight.
  const mk = (parts) => {
    const st = { ...newGameState(), seed: 4242 };
    return makeChimera(st, 'M', parts, t0);
  };
  const airChimera = mk({ eagle_forelimbs: 'standard', eagle_tail: 'standard', goat_head: 'standard' });
  const groundFoe = content.enemies.riot_squad;
  const airCb = combatantFromChimera(airChimera, content, airChimera.settleUntil);
  assert.equal(airCb.creatureClass, 'air');
  assert.equal(combatantFromUnit(groundFoe).creatureClass, 'ground');
  assert.equal(classMultiplier(airCb.creatureClass, 'ground', content), cls.advantage, 'Air chimera beats Ground squad');
  assert.equal(classMultiplier('water', airCb.creatureClass, content), cls.advantage, 'and the Harbor Skiff answers it');

  // Every enemy declares a class; the new air/water units exist.
  for (const u of Object.values(content.enemies)) {
    assert.ok(['air', 'ground', 'water'].includes(u.class), `${u.id} has a class`);
  }
  assert.equal(content.enemies.attack_chopper.class, 'air');
  assert.equal(content.enemies.harbor_skiff.class, 'water');
}

// --- Wave 1: every tag-chart rule is now reachable by a player build.
{
  const playerMoveTags = new Set();
  const playerBodyTags = new Set();
  for (const p of Object.values(content.parts)) {
    for (const t of p.tags) playerBodyTags.add(t);
    if (p.move) for (const t of p.move.tags) playerMoveTags.add(t);
  }
  for (const c of Object.values(content.combos)) for (const t of c.move.tags) playerMoveTags.add(t);
  const enemyTags = new Set(['Organic']);
  for (const u of Object.values(content.enemies)) for (const t of u.tags) enemyTags.add(t);

  for (const rule of content.tagChart) {
    assert.ok(playerMoveTags.has(rule.attack), `a player move can deal ${rule.attack} (${rule.note})`);
    assert.ok(enemyTags.has(rule.defender), `an enemy is ${rule.defender} (${rule.note})`);
  }
}

// --- Rivals (§3.8): geneticists who field CHIMERAS, generated from real
// --- parts under the player's own physiology, gated so their counter-class
// --- anatomy is always obtainable first, and iterating on every defeat.
{
  const { rivalStatus, rivalEncounter, rivalTeam, playerFavoredClass } = await import('../campaign/rivals.js');
  const { unitFor } = await import('../battle/engine.js');
  const mkState = (over = {}) => ({
    seed: 4242,
    chimeras: [],
    campaign: { heldNodes: [], notoriety: 0, rivals: {}, captives: [], containment: [] },
    ...over,
  });

  assert.ok(Object.keys(content.rivals).length >= 3, 'at least one rival per elemental class');
  const classesCovered = new Set(Object.values(content.rivals).map((r) => r.classBias));
  assert.deepEqual([...classesCovered].sort(), ['air', 'ground', 'water'], 'the ladder spans the whole triangle');

  // Locked on a fresh save; the gate names what is missing.
  const fresh = rivalStatus(mkState(), content);
  assert.ok(fresh.every((r) => r.status === 'locked'), 'no rival is available on a fresh save');
  assert.ok(fresh.every((r) => r.need.length), 'every locked rival says what it needs');

  // Gate rule: you are never asked to beat a class before the anatomy that
  // answers it is obtainable. A rival's counter-class parts must be unlocked
  // by the nodes their gate requires (or available from the start).
  const region = Object.values(content.regions)[0];
  for (const rival of Object.values(content.rivals)) {
    const counter = Object.values(content.classes).find((c) => c.beats === rival.classBias).id;
    const gateIndex = Math.max(
      ...rival.requiresNodes.map((id) => region.nodes.findIndex((n) => n.id === id))
    );
    // Use the real catalog rule, not a re-implementation of it.
    const fauna = faunaUnlocked(
      { campaign: { heldNodes: region.nodes.slice(0, gateIndex + 1).map((n) => n.id) } },
      content
    );
    const counterParts = Object.values(content.parts).filter(
      (p) => p.classAffinity === counter && fauna.has(p.species)
    );
    assert.ok(
      counterParts.length >= 2,
      `${rival.name} (${rival.classBias}) is gated behind fauna that can build ${counter} — found ${counterParts.length} parts`
    );
  }

  // Fully unlocked: teams are generated, classed by anatomy, and stable.
  const open = mkState({ campaign: { heldNodes: region.nodes.map((n) => n.id), notoriety: 999, rivals: { mantissa: { defeats: 1, losses: 0 }, aloft: { defeats: 1, losses: 0 } }, captives: [], containment: [] } });
  for (const { rival, status } of rivalStatus(open, content)) {
    assert.notEqual(status, 'locked', `${rival.name} opens once the ladder is cleared`);
    const enc = rivalEncounter(open, rival, content);
    assert.ok(enc.waves.length >= 2, `${rival.name} fields a team`);
    for (const unit of enc.waves) {
      assert.ok(unit.hp > 0 && unit.power > 0, 'generated units carry real stats');
      assert.ok(unit.moves.length >= 2, 'generated units have moves from their anatomy');
      assert.ok(unit.salvage.length === unit.salvageGrades.length, 'every salvage part carries its grade');
      assert.ok(unit.genome.parts.head, 'a head is mandatory for rivals too');
      for (const partId of unit.salvage) assert.ok(content.parts[partId], 'rivals only field real parts');
      assert.equal(unitFor(content, unit), unit, 'inline units resolve to themselves');
    }
    // The lead specimen always flies the rival's own flag.
    assert.equal(enc.waves[0].class, rival.classBias, `${rival.name}'s lead is ${rival.classBias}`);
  }

  // Determinism: the same save always faces the same team.
  const a = JSON.stringify(rivalEncounter(open, content.rivals.trench, content));
  const b = JSON.stringify(rivalEncounter(open, content.rivals.trench, content));
  assert.equal(a, b, 'rival teams are seeded, not rolled fresh each render');

  // Iteration: every defeat makes the lab stronger and the purse bigger.
  const veteran = structuredClone(open);
  veteran.campaign.rivals.trench = { defeats: 4, losses: 0 };
  const before = rivalEncounter(open, content.rivals.trench, content);
  const after = rivalEncounter(veteran, content.rivals.trench, content);
  assert.ok(after.powerScale > before.powerScale, 'a beaten rival comes back stronger');
  assert.ok(after.reward > before.reward, 'and pays more for the trouble');
  assert.ok(after.waves.length >= before.waves.length, 'and eventually fields more');

  // Counter-bias: a rival who reads your stable answers it. Feed a pure Air
  // stable and the counter-biased rivals field Water in the second slot.
  const airPart = (slot) => Object.values(content.parts).find((p) => p.slot === slot && p.classAffinity === 'air');
  const airStable = structuredClone(open);
  airStable.chimeras = [{
    id: 'c1', name: 'Kite', frame: 'S',
    tokens: {
      head: { id: 'k0', partId: 'eagle_head', grade: 'prime', donor: {} },
      forelimbs: { id: 'k1', partId: airPart('forelimbs').id, grade: 'prime', donor: {} },
      tail: { id: 'k2', partId: airPart('tail').id, grade: 'prime', donor: {} },
    },
  }];
  assert.equal(playerFavoredClass(airStable, content), 'air', 'the director reads the stable it can see');
  const biased = rivalTeam(airStable, content.rivals.aloft, content);
  assert.equal(biased.counterClass, 'water', 'and a counter-biasing rival builds what beats it');
  assert.equal(biased.team[1].class, 'water', 'right down to the anatomy of the second specimen');
  // Mantissa is the tutorial rival and stays honest.
  assert.equal(rivalTeam(airStable, content.rivals.mantissa, content).counterClass, null);
}

// --- The rival payoff loop: cannon a rival's chimera, dismantle it, and
// --- receive THEIR parts at THEIR grades. Enemy tech, except the enemy is
// --- a person with opinions (ROADMAP §3.6 "Capture — theirs").
{
  const { rivalEncounter } = await import('../campaign/rivals.js');
  const region = Object.values(content.regions)[0];
  const lab = { ...newGameState(), seed: 77 };
  lab.campaign.lastTickAt = t0;
  lab.campaign.heldNodes = region.nodes.map((n) => n.id);
  lab.campaign.notoriety = 999;
  lab.campaign.rivals = { mantissa: { defeats: 0, losses: 0 } };
  const hero = makeChimera(lab, 'L', {
    gorilla_head: 'prismatic', gorilla_forelimbs: 'prismatic', gorilla_hindlimbs: 'prismatic',
    pangolin_hide: 'prismatic', wolf_organ: 'prismatic',
  }, t0);
  const tRival = hero.settleUntil;

  const encounter = rivalEncounter(lab, content.rivals.mantissa, content);
  const battle = createBattle([hero], encounter, content, 9, tRival, {
    kind: 'rival',
    rivalId: 'mantissa',
  });
  assert.ok(battle.barks.intro, 'a rival duel opens with their monologue');
  assert.ok(battle.log.some((l) => l.includes(content.rivals.mantissa.monologue.intro)), 'and it reaches the log');
  assert.ok(Object.keys(battle.units).length === encounter.waves.length, 'generated units are indexed for containment');

  // Restrain, then fire: soften the lead below 40% with the cannon charged.
  const foe = battle.enemy.active;
  assert.ok(foe.capturable, "a rival's chimera is a legal cannon target");
  foe.hp = Math.floor(foe.maxHp * 0.3);
  battle.cannon.charge = 100;
  const capture = playerActions(battle).find((a) => a.type === 'capture');
  assert.ok(capture, 'the cannon offers itself at a weakened rival specimen');
  step(battle, capture, content);
  assert.deepEqual(battle.captured, [foe.refId], 'the specimen is bagged');

  // Clear the rest so the fight resolves as a win.
  let guard = 0;
  while (!battle.over && guard++ < 200) {
    battle.enemy.active.hp = 0;
    step(battle, playerActions(battle)[0] ?? { type: 'rest' }, content);
  }
  const detail = resolveBattle(lab, battle, content, tRival);
  assert.equal(detail.outcome, 'win');
  assert.equal(lab.campaign.rivals.mantissa.defeats, 1, 'the defeat is recorded so the lab iterates');
  assert.equal(lab.campaign.containment.length, 1, 'the captured specimen reaches Containment');
  const bay = lab.campaign.containment[0];
  assert.ok(bay.unit, 'a generated unit rides along in the bay — enemies.json has no entry for it');
  assert.ok(!content.enemies[bay.unitId], 'confirming there is nothing to look it up by');

  const before = lab.inventory.parts.length;
  const salvage = salvageUnit(lab, 0, content, tRival);
  assert.ok(salvage.ok, salvage.msg);
  const gained = lab.inventory.parts.slice(before);
  assert.equal(gained.length, bay.unit.salvage.length, "every one of the rival's parts comes home");
  for (const [i, token] of gained.entries()) {
    assert.equal(token.partId, bay.unit.salvage[i]);
    assert.equal(token.grade, bay.unit.salvageGrades[i], 'at the grade the rival actually raised');
    assert.equal(token.donor.name, bay.unit.name, 'with lineage naming the specimen');
    assert.ok(content.parts[token.partId], 'and they are real, splice-able parts');
    assert.ok(lab.dex.parts.includes(token.partId), 'logged in the Splice-Dex');
  }
  assert.equal(lab.campaign.containment.length, 0, 'the bay empties');
}

// --- UI chrome: no native form control may reach the player. A <select> on
// --- Android opens the OS wheel and an <input type=checkbox> draws the
// --- platform's checkbox — both break the frame. Everything goes through
// --- ui/picker.js instead, so guard the rule rather than trusting memory.
{
  const uiFiles = [
    'index.html', 'ranch/ui.js', 'splice/theater-ui.js', 'splice/vault-ui.js',
    'splice/pens-ui.js', 'splice/extract-ui.js', 'splice/dex-ui.js',
    'campaign/ui.js', 'battle/ui.js',
  ];
  for (const f of uiFiles) {
    const src = readFileSync(join(root, f), 'utf8');
    assert.ok(!/<select\b/.test(src), `${f} renders no native <select>`);
    assert.ok(!/<input\b/.test(src), `${f} renders no native <input>`);
    assert.ok(!/<textarea\b/.test(src), `${f} renders no native <textarea>`);
  }
  // The sheet needs somewhere to mount, and the shell must ship the module.
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  assert.ok(html.includes('id="picker"'), 'index.html hosts the picker sheet');
  assert.ok(readFileSync(join(root, 'sw.js'), 'utf8').includes("'ui/picker.js'"), 'sw precaches ui/picker.js');
}

// Time-warp safety: a lastTickAt in the future never rewinds state.
const warp = freshRanchState();
ensureRanchSeeded(warp, content, t0);
warp.lastTickAt = t0 + 100 * HOUR;
const condBefore = warp.ranch.stock[0].condition;
applyElapsed(warp, content, t0);
assert.equal(warp.ranch.stock[0].condition, condBefore, 'negative elapsed is a no-op');

console.log(`smoke ✓  ${Object.keys(content.parts).length} parts · ${Object.keys(content.frames).length} frames · ${Object.keys(content.species).length} species · ${Object.keys(content.enemies).length} enemy units · ${Object.keys(content.rivals).length} rivals · save v${SAVE_VERSION} · M1 care: ${Math.round(cared.condition)} vs ${Math.round(neglected.condition)} · M2 grades: ${resA.grade.id}/${resB.grade.id} · M4 battle: ${runA.outcome} in ${runA.turn} turns, obedience ignores ${ignores}/60`);
