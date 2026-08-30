// Headless smoke test: proves the renderer runs DOM-free in Node (the same
// requirement the M4.5 balance harness will lean on) and that all content
// data is coherent. Run: node tools/smoke.js

import { readFileSync, readdirSync } from 'node:fs';
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
  playerActions, playerActive, tagMultiplier, isInjured, turnForecast, tierScaleFor,
} from '../battle/engine.js';
import { runSim, plantBrokenCombo, makeSimChimera, scriptedBattle } from './sim.js';
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
  director: readJSON('data/director.json'),
  facility: readJSON('data/facility.json'),
  philosophies: readJSON('data/philosophies.json'),
  operations: readJSON('data/operations.json'),
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
// Test helper: builds a chimera directly. These labs are about battles and
// physiology, not about the shop, so the Theater is fully equipped — the
// facility gate has its own block below, where it is the subject.
function makeChimera(state2, frame, partGrades, now) {
  state2.facility = { theater: 2 };
  for (const [pid, grade] of Object.entries(partGrades)) {
    state2.inventory.parts.push({ id: `bt-${pid}`, partId: pid, grade, donor: { name: 'Donor', species: pid.split('_')[0], stars: 3, extractedAt: now } });
  }
  const used = new Set();
  const slots = Object.fromEntries(
    Object.keys(partGrades).map((pid) => {
      const slot = content.parts[pid].slot;
      let socketId = slot;
      let n = 2;
      while (used.has(socketId)) socketId = `${slot}${n++}`;
      used.add(socketId);
      return [socketId, `bt-${pid}`];
    })
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
// GRADE_MOVE_BONUS rides on top of the stat multiplier; the balance pass
// trimmed it to +12%/tier so grades stop double-dipping so hard.
assert.equal(apexFang.power, Math.round(40 * (1 + 2 * 0.12)), 'apex grade upgrades the move (+24%)');
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
const myLine = evs.findIndex((e) => e.text.includes('Scythe Strike'));
const foeLine = evs.findIndex((e) => e.text.includes(pb.enemy.active.name) && e.text.includes('uses'));
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
assert.ok(bossRun.events.some((e) => e.text.includes('ACTIVATE THE 9000')), 'boss transforms mid-fight');
if (bossRun.b.outcome === 'win') {
  // Stage two either retires gleefully or gets bagged by the cannon — the
  // 9000 is salvageable, so capture is a legitimate second win path.
  const retired = bossRun.events.some((l) => l.text.includes('bouncy castle'));
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
  if (evs2.some((e) => e.text.includes('ignores orders'))) ignores++;
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
// The yardstick is a team of THREE — the balance pass established that tuning
// against a lone chimera measures the wrong game, and the detector is
// peer-relative, so at solo everything sits near zero and nothing stands out.
const YARDSTICK = { builds: 12, seedsPer: 2, teamSize: 3 };
const clean = runSim(content, YARDSTICK);
assert.ok(clean.rows.length >= 12);
assert.ok(clean.rows.every((r) => r.winRate >= 0 && r.winRate <= 1));
assert.ok(clean.rows.some((r) => r.perEncounter.patrol_1 === 1), 'the first patrol is beatable at standard grade');
const planted = runSim(plantBrokenCombo(content), YARDSTICK);
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
assert.deepEqual(m5.campaign, {
  heldNodes: [], notoriety: 0, captives: [], containment: [], rivals: {},
  contested: [], nextContestAt: null, defences: {}, contestCount: 0,
  operation: null, opCooldowns: {}, opCount: 0, opReport: null, heat: 0, heatAt: null,
  lastTickAt: null,
});
// Stronger than the literal above and self-maintaining: a migration that
// forgets a field a NEW game gets is the classic way an old save starts
// throwing on a screen it used to render.
assert.deepEqual(
  Object.keys(m5.campaign).sort(),
  Object.keys(newGameState().campaign).sort(),
  'a fully migrated save has exactly the campaign shape a new game does'
);
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
  // …and the other direction, which is the one that actually bites. The
  // check above only ever caught a DELETED file; two modules shipped in
  // consecutive sessions without being precached at all, which breaks the
  // offline shell in exactly the situation a PWA exists for.
  const NOT_SHIPPED = new Set(['sw.js', 'package.json']);
  const runtimeFiles = [];
  const walk = (dir) => {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const rel = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (['tools', 'docs', 'node_modules', '.git'].includes(rel)) continue;
        walk(rel);
      } else if (/\.(js|json|css|html|webmanifest)$/.test(entry.name) && !NOT_SHIPPED.has(rel)) {
        runtimeFiles.push(rel);
      }
    }
  };
  walk('');
  const precached = new Set(shellFiles);
  const unshipped = runtimeFiles.filter((f) => !precached.has(f));
  assert.deepEqual(unshipped, [], `every runtime file is precached (missing: ${unshipped.join(', ')})`);
  readFileSync(join(root, 'icon.svg')); // exists
  readFileSync(join(root, 'docs/TWA.md'));
}

// --- M7: v8 migration backfills the dex from owned tokens.
{
  const v7ish = migrate(structuredClone(v1Save)); // gives v8 empty everything
  assert.deepEqual(v7ish.settings, { muted: false });
  assert.deepEqual(v7ish.dex, { parts: [], enemies: [], traits: [], variants: [] });
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
  // …and whose lab it came out of, so the right villain can complain when
  // you eventually win it over (§3.8 `defection`).
  assert.equal(bay.rivalId, 'mantissa', 'the bay remembers who built it');

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

// --- Rehabilitation (§3.6): the OTHER future a captured chimera has.
// --- Salvage is instant and certain and hands you enemy tech. Rehab costs
// --- real-world time, money and those same parts, and pays out a whole
// --- creature you could not have built. Both must stay worth choosing.
{
  const { rivalEncounter } = await import('../campaign/rivals.js');
  const {
    rehabPlan, rehabGrants, rehabTuning, startRehab, rehabSession,
    cancelRehab, tickRehab, rehabDone, sessionReadyAt,
  } = await import('../campaign/rehab.js');
  const { buyUpgrade } = await import('../splice/facility.js');
  const { renderCreatureSVG: draw } = await import('../render/renderer.js');
  const HOUR = 3600000;
  const tune = rehabTuning(content);
  const region = Object.values(content.regions)[0];

  // A lab holding one captured rival specimen, ready to decide about it.
  const bayLab = (rivalId = 'mantissa', waveIndex = 0) => {
    const lab = { ...newGameState(), seed: 4242, funds: 6000 };
    lab.campaign.lastTickAt = t0;
    lab.campaign.heldNodes = region.nodes.map((n) => n.id);
    lab.campaign.notoriety = 999;
    lab.campaign.rivals = { [rivalId]: { defeats: 0, losses: 0 } };
    const unit = rivalEncounter(lab, content.rivals[rivalId], content).waves[waveIndex];
    lab.campaign.containment.push({ id: 'bay-a', unitId: unit.id, unit, capturedAt: t0, rehab: null });
    return { lab, unit, bay: lab.campaign.containment[0] };
  };

  // The Reorientation Wing is a purchase, not a given: level 1 Containment
  // only owns a bandsaw, and says so.
  {
    const { lab } = bayLab();
    assert.equal(lab.facility.containment, 1, 'a new lab starts with the holding bay only');
    assert.equal(rehabGrants(lab, content).enabled, false, 'and cannot rehabilitate anything');
    const refused = startRehab(lab, 'bay-a', content, t0);
    assert.ok(!refused.ok, 'rehab is refused before the wing is built');
    assert.match(refused.msg, /Reorientation Wing/, 'and the refusal names what is missing');
    assert.equal(lab.funds, 6000, 'a refused programme charges nothing');

    // It buys through the SAME facility track machinery as the Theater —
    // adding it was a data edit, so the engine must not have learned a
    // second way to sell an upgrade.
    const bought = buyUpgrade(lab, content, 'containment');
    assert.ok(bought.ok, bought.msg);
    assert.equal(lab.facility.containment, 2);
    assert.equal(rehabGrants(lab, content).enabled, true, 'the wing unlocks rehabilitation');
  }

  // You cannot befriend a van. A unit with no genome has no body plan to
  // rebuild, and the bay says why instead of offering a dead button.
  {
    const { lab } = bayLab();
    lab.facility.containment = 2;
    lab.campaign.containment.push({ id: 'bay-van', unitId: 'police_cruiser', unit: null, capturedAt: t0, rehab: null });
    const plan = rehabPlan(lab, lab.campaign.containment[1], content);
    assert.equal(plan.possible, false, 'a vehicle cannot be rehabilitated');
    assert.ok(plan.reason && plan.reason.length > 10, 'and the bay explains itself');
    assert.ok(!startRehab(lab, 'bay-van', content, t0).ok, 'starting one is refused');
    // …but it is still perfectly good salvage.
    assert.ok(salvageUnit(lab, 'bay-van', content, t0).ok, 'the bandsaw still works on it');
  }

  // The offer carries real numbers before any money moves (Law 4).
  {
    const { lab, bay, unit } = bayLab();
    lab.facility.containment = 2;
    const plan = rehabPlan(lab, bay, content);
    assert.ok(plan.possible, plan.reason ?? '');
    assert.equal(
      plan.instability,
      Math.min(100, Math.round(unit.physiology.instability + tune.wariness)),
      'it arrives warier than its old lab built it'
    );
    assert.ok(plan.hours >= 1 && plan.hours <= tune.maxHours, 'the programme has a bounded length');
    assert.ok(plan.fee > 0, 'and a price');
    assert.equal(Object.keys(plan.sockets).length, unit.salvage.length, 'every recovered part has a bay to sit in');

    // Tier III is the reason to keep investing in the track.
    lab.facility.containment = 3;
    const t3 = rehabPlan(lab, bay, content);
    assert.ok(t3.hours < plan.hours, 'the Enrichment Annexe is faster');
    assert.ok(t3.fee < plan.fee, 'and cheaper');
  }


  // A donor with two organs must fill organ AND organ2 rather than write
  // one over the other, and anything with nowhere left to sit is left
  // behind rather than crashing the intake. No rival builds this today —
  // which is exactly why the guard needs a test of its own.
  {
    const { unitFromGenome } = await import('../battle/engine.js');
    const organs = Object.values(content.parts).filter((p) => p.slot === 'organ').slice(0, 3);
    const head = Object.values(content.parts).find((p) => p.slot === 'head');
    assert.equal(organs.length, 3, 'the fixture needs three distinct organs');
    const tokens = [head, ...organs].map((part, i) => ({
      id: `tw${i}`,
      partId: part.id,
      grade: 'prime',
      donor: { name: 'Twin Gut', species: part.species, stars: 5, extractedAt: 0 },
    }));
    const unit = unitFromGenome({ id: 'twin_gut', name: 'Twin Gut', frame: 'M', tokens }, content);
    const lab = { ...newGameState(), seed: 5, funds: 6000 };
    lab.facility.containment = 2;
    lab.campaign.containment.push({ id: 'bay-twin', unitId: unit.id, unit, capturedAt: t0, rehab: null });

    const plan = rehabPlan(lab, lab.campaign.containment[0], content);
    assert.ok(plan.possible, plan.reason ?? '');
    assert.deepEqual(Object.keys(plan.sockets).sort(), ['head', 'organ', 'organ2'], 'both organs get their own bay');
    assert.equal(plan.skipped.length, 1, 'and the third has nowhere to go');
    startRehab(lab, 'bay-twin', content, t0);
    const ch = tickRehab(lab, content, t0 + plan.hours * HOUR).graduates[0];
    assert.equal(Object.keys(ch.tokens).length, 3, 'the graduate keeps everything that fit');
    assert.notEqual(ch.tokens.organ.partId, ch.tokens.organ2.partId, 'as two different organs, not one written twice');
  }

  // Enrolling spends the fee, occupies the bay, and forecloses salvage:
  // §3.6 offers two futures and you pick ONE.
  {
    const { lab, bay } = bayLab();
    lab.facility.containment = 2;
    const plan = rehabPlan(lab, bay, content);
    const funds = lab.funds;
    const started = startRehab(lab, 'bay-a', content, t0);
    assert.ok(started.ok, started.msg);
    assert.equal(lab.funds, funds - plan.fee, 'the intake fee is charged');
    assert.equal(bay.rehab.until, t0 + plan.hours * HOUR, 'the clock is a timestamp, not an interval');
    const blocked = salvageUnit(lab, 'bay-a', content, t0);
    assert.ok(!blocked.ok, 'a specimen in the programme cannot also be dismantled');
    assert.equal(lab.campaign.containment.length, 1, 'and it is still in its bay');
    assert.ok(!startRehab(lab, 'bay-a', content, t0).ok, 'nor enrolled twice');
  }

  // Pulling out is always allowed — nothing the player owns is destroyed —
  // but the fee is spent and the message admits it.
  {
    const { lab, bay } = bayLab();
    lab.facility.containment = 2;
    const plan = rehabPlan(lab, bay, content);
    startRehab(lab, 'bay-a', content, t0);
    const funds = lab.funds;
    const stopped = cancelRehab(lab, 'bay-a', content);
    assert.ok(stopped.ok, stopped.msg);
    assert.equal(bay.rehab, null, 'the bay is idle again');
    assert.equal(lab.funds, funds, `and the $${plan.fee} is not refunded`);
    assert.ok(salvageUnit(lab, 'bay-a', content, t0).ok, 'salvage is back on the table');
  }

  // The clock alone graduates it. A player who enrols one and forgets about
  // it still gets a creature — just one that has no reason to like them.
  let waryBond = null;
  let waryInstability = null;
  {
    const { lab, bay, unit } = bayLab();
    lab.facility.containment = 2;
    const plan = rehabPlan(lab, bay, content);
    startRehab(lab, 'bay-a', content, t0);
    const done = t0 + plan.hours * HOUR;

    assert.equal(rehabDone(bay, done - 1), false, 'not a minute early');
    assert.equal(tickRehab(lab, content, done - 1).graduates.length, 0);
    assert.equal(lab.chimeras.length, 0, 'and nothing has joined the roster yet');

    const out = tickRehab(lab, content, done);
    assert.equal(out.graduates.length, 1, 'the programme completes on its deadline');
    assert.equal(out.news.length, 1, 'and it makes the wire');
    assert.equal(lab.campaign.containment.length, 0, 'the bay empties');
    assert.equal(lab.chimeras.length, 1, 'a chimera walks out of it');

    const ch = lab.chimeras[0];
    waryBond = ch.bond;
    waryInstability = ch.instability;
    assert.equal(ch.name, unit.name, 'it keeps its name — it was somebody before you met it');
    assert.equal(ch.frame, unit.genome.frame, 'on the chassis its old lab built it on');
    assert.equal(ch.bond, 0, 'and no affection for you whatsoever');
    assert.equal(ch.instability, plan.instability, 'carrying the wariness the plan quoted');
    assert.ok(isSettled(ch, done), 'the programme WAS the settling — it deploys immediately');
    assert.equal(ch.injury, null);
    assert.equal(ch.rehabilitated.sessions, 0, 'the record remembers it was never worked with');

    // The parts came home whole: same ids, same grades, lineage intact.
    const gotIds = Object.values(ch.tokens).map((tk) => tk.partId);
    assert.deepEqual(gotIds.slice().sort(), unit.salvage.slice().sort(), "every one of its parts is present");
    for (const [socketId, tk] of Object.entries(ch.tokens)) {
      const i = unit.salvage.indexOf(tk.partId);
      assert.equal(tk.grade, unit.salvageGrades[i], 'at the grade its old lab raised');
      assert.equal(tk.donor.name, unit.name, 'with lineage naming where it came from');
      assert.equal(content.parts[tk.partId].slot, socketId.replace(/\d+$/, ''), 'in a socket that fits');
      assert.ok(lab.dex.parts.includes(tk.partId), 'and logged in the Splice-Dex');
    }

    // It is a real creature, not a record: it draws and it fights.
    assert.ok(draw(chimeraGenome(ch, content), content).startsWith('<svg'), 'a rehabilitated chimera renders');
    const fighter = combatantFromChimera(ch, content, done);
    assert.ok(fighter.hp > 0 && fighter.moves.length, 'and can take the field');
    assert.ok(fighter.ignoreChance > 0, 'though it will freelance until you earn its trust');
  }

  // Sessions are what the programme is actually FOR: the clock releases it,
  // the sessions decide who walks out.
  {
    const { lab, bay } = bayLab();
    lab.facility.containment = 2;
    const plan = rehabPlan(lab, bay, content);
    startRehab(lab, 'bay-a', content, t0);
    const untilBefore = bay.rehab.until;

    const first = rehabSession(lab, 'bay-a', content, t0);
    assert.ok(first.ok, first.msg);
    assert.equal(bay.rehab.bond, tune.sessionBond, 'a session buys bond');
    assert.equal(bay.rehab.instability, plan.instability - tune.sessionStability, 'and calms it down');
    assert.equal(bay.rehab.until, untilBefore, 'but never moves the release date — the clock is the other knob');

    assert.ok(!rehabSession(lab, 'bay-a', content, t0).ok, 'and not twice in a row');
    // The whole curriculum must fit inside the programme, however short it
    // is. It once did not, which made the easiest specimens the hardest
    // ones to befriend.
    for (let i = 1; i < tune.maxSessions; i++) {
      const when = sessionReadyAt(bay, content);
      assert.ok(when < bay.rehab.until, `session ${i + 1} is still reachable before graduation`);
      assert.ok(rehabSession(lab, 'bay-a', content, when).ok, `session ${i + 1} lands after the gap`);
    }
    assert.equal(bay.rehab.sessions, tune.maxSessions);
    const capped = rehabSession(lab, 'bay-a', content, sessionReadyAt(bay, content));
    assert.ok(!capped.ok, 'the curriculum runs out');

    const out = tickRehab(lab, content, bay.rehab.until);
    const ch = out.graduates[0];
    assert.ok(ch, 'a fully-worked specimen still graduates');
    assert.equal(ch.bond, tune.maxSessions * tune.sessionBond, 'arriving with the bond it was given');
    assert.ok(ch.bond > waryBond, 'which is more than the one nobody visited');
    assert.ok(ch.instability < waryInstability, 'and steadier, too');
    assert.ok(
      obediencePercent(ch, bay.rehab.until) > obediencePercent({ ...ch, bond: waryBond, instability: waryInstability }, bay.rehab.until),
      'so it actually follows orders better — the sessions bought something real'
    );
  }

  // ACCEPTANCE: the two futures are genuinely different, and rehabilitation
  // hands you something your own Theater could not have produced.
  {
    // Trench fields her second specimen on an L-class chassis, which a
    // Tier I Theater is not licensed to build on.
    const { lab: cut, unit } = bayLab('trench', 1);
    const { lab: keep } = bayLab('trench', 1);
    cut.facility.containment = 2;
    keep.facility.containment = 2;
    assert.equal(unit.genome.frame, 'L', 'the specimen under test is an L-frame');

    const salvage = salvageUnit(cut, 'bay-a', content, t0);
    assert.ok(salvage.ok, salvage.msg);
    assert.equal(cut.chimeras.length, 0, 'salvage yields parts and no creature');
    assert.equal(cut.inventory.parts.length, unit.salvage.length);

    const plan = rehabPlan(keep, keep.campaign.containment[0], content);
    startRehab(keep, 'bay-a', content, t0);
    const ch = tickRehab(keep, content, t0 + plan.hours * HOUR).graduates[0];
    assert.equal(keep.inventory.parts.length, 0, 'rehab yields a creature and no parts');
    assert.equal(keep.chimeras.length, 1);

    // Same specimen, two outcomes, and the outcome you kept is off-menu:
    // the player's own Theater cannot legally assemble this chimera.
    const asBuild = Object.fromEntries(
      Object.entries(ch.tokens).map(([socketId, tk]) => [socketId, tk.id])
    );
    for (const tk of Object.values(ch.tokens)) keep.inventory.parts.push(tk);
    const errors = validateSplice(keep, ch.frame, asBuild, content);
    assert.ok(errors.length, 'the Theater at Tier I could not have built this creature');
    assert.ok(errors.some((e) => /Theater/.test(e)), `and it is the chassis that stops it: ${errors.join(' ')}`);
  }
}

// --- Variants via mutation (§3.2). A variant is the same stock, mutated:
// --- it inherits its base's anatomy, carries its own numbers and colours,
// --- is BRED rather than bought, and breeds true once you have one.
{
  const { baseSpecies, variantsOf, isVariant, breedPair, hatchEgg, canBreed, BREEDING } =
    await import('../ranch/breeding.js');

  const variants = Object.values(content.species).filter((sp) => sp.variantOf);
  assert.ok(variants.length >= 5, 'the roster multiplier actually multiplies');

  for (const v of variants) {
    const base = content.species[v.variantOf];
    assert.ok(base, `${v.id} descends from a real species`);
    assert.ok(!base.variantOf, 'a variant of a variant is not a thing');
    assert.equal(v.frame, base.frame, `${v.id} keeps its base's chassis`);
    // Bred, never bought — that is the whole identity.
    assert.equal(v.mailOrderPrice, null, `${v.id} is not for sale`);
    // THE SIDEGRADE CONTRACT: a variant that is better at everything makes
    // its base species dead content the moment you breed one.
    const mult = v.statMult ?? {};
    assert.ok(Object.values(mult).some((m) => m < 1),
      `${v.id} gives something up (statMult ${JSON.stringify(mult)})`);
    assert.ok(Object.values(mult).some((m) => m > 1), `${v.id} gains something too`);
    // It has a body, and that body renders.
    const parts = Object.values(content.parts).filter((p) => p.species === v.id);
    assert.ok(parts.length >= 4, `${v.id} has parts of its own`);
    assert.deepEqual(
      parts.map((p) => p.slot).sort(),
      Object.values(content.parts).filter((p) => p.species === v.variantOf).map((p) => p.slot).sort(),
      `${v.id} has exactly its base's anatomy`
    );
    assert.ok(renderCreatureSVG(stockGenome(v.id, content), content).includes('<svg'));
    // Its own colours, not its base's.
    assert.notDeepEqual(v.palette, base.palette, `${v.id} does not look like its parent`);
  }

  // A variant is never in the catalog, at any stage of the campaign.
  const rich = { ...newGameState(), seed: 3 };
  rich.campaign.heldNodes = Object.values(content.regions)[0].nodes.map((n) => n.id);
  assert.ok(!catalogFor(rich, content).some((sp) => sp.variantOf), 'variants never reach the Mail-Order catalog');
  assert.ok(![...faunaUnlocked(rich, content)].some((id) => content.species[id].variantOf));

  // Lineage helpers.
  assert.equal(baseSpecies('alpine_ram', content), 'ram');
  assert.equal(baseSpecies('ram', content), 'ram');
  assert.ok(isVariant('alpine_ram', content) && !isVariant('ram', content));
  assert.ok(variantsOf('ram', content).some((v) => v.id === 'alpine_ram'));
  assert.deepEqual(variantsOf('alpine_ram', content), variantsOf('ram', content), 'a variant shares its base\'s gene pool');

  // Breeding: an Alpine Ram is still a ram, so it crosses back into the line.
  const lab = { ...newGameState(), seed: 4242 };
  const adult = (id, species, sex) => ({
    id, species, sex, name: id, birthAt: t0 - 400 * HOUR, condition: 90,
    potential: { hp: 4, power: 4, armor: 4, speed: 4, stamina: 4 },
    genotype: {}, traits: [], lastCare: {},
  });
  lab.ranch.penCapacity = 40;
  lab.ranch.stock = [adult('r1', 'ram', 'F'), adult('r2', 'ram', 'M'),
    adult('v1', 'alpine_ram', 'F'), adult('v2', 'alpine_ram', 'M'),
    adult('g1', 'goat', 'M')];
  assert.ok(canBreed(lab.ranch.stock[0], lab.ranch.stock[3], lab, content, t0).ok,
    'a ram and an alpine ram are the same stock');
  assert.ok(!canBreed(lab.ranch.stock[0], lab.ranch.stock[4], lab, content, t0).ok,
    'a ram and a goat are still not');

  // The breeding UI filters partners by base stock, not by species string —
  // canBreed has always allowed the cross, and the picker used to hide it.
  for (const a of lab.ranch.stock) {
    for (const b of lab.ranch.stock) {
      const allowed = canBreed(a, b, lab, content, t0).ok;
      const sameStock = baseSpecies(a.species, content) === baseSpecies(b.species, content);
      const pickable = a.id !== b.id && a.sex !== b.sex && sameStock;
      assert.equal(allowed, pickable, `${a.id}+${b.id}: the rule and the picker's filter agree`);
    }
  }

  // Heredity: two Alpine Rams breed true most of the time.
  const speciesOver = (sireId, damId, n) => {
    const counts = {};
    for (let i = 0; i < n; i++) {
      const s2 = { ...newGameState(), seed: 900 + i };
      s2.ranch.penCapacity = 40;
      s2.ranch.stock = structuredClone(lab.ranch.stock);
      const res = breedPair(s2, sireId, damId, content, t0);
      assert.ok(res.ok, res.msg);
      counts[res.egg.species] = (counts[res.egg.species] ?? 0) + 1;
    }
    return counts;
  };
  const trueBreeding = speciesOver('v2', 'v1', 60);
  assert.ok((trueBreeding.alpine_ram ?? 0) / 60 > 0.7,
    `two Alpine Rams breed true (${JSON.stringify(trueBreeding)})`);
  const crossed = speciesOver('v2', 'r1', 60);
  assert.ok((crossed.alpine_ram ?? 0) > 5 && (crossed.ram ?? 0) > 5,
    `a cross gives both, so the line is worth keeping either way (${JSON.stringify(crossed)})`);

  // Mutation: ordinary stock can, rarely, produce a variant from nowhere.
  const fromNothing = speciesOver('r2', 'r1', 400);
  const mutants = fromNothing.alpine_ram ?? 0;
  assert.ok(mutants > 0, 'a variant can appear out of ordinary stock');
  assert.ok(mutants / 400 < 0.1, `and it stays rare (${mutants}/400)`);

  // The hatch is a Splice-Dex trophy, once.
  const hatchLab = { ...newGameState(), seed: 7 };
  hatchLab.ranch.penCapacity = 40;
  hatchLab.ranch.stock = structuredClone(lab.ranch.stock);
  const eggRes = breedPair(hatchLab, 'v2', 'v1', content, t0);
  assert.equal(eggRes.egg.species, 'alpine_ram');
  assert.equal(eggRes.egg.variant, 'alpine_ram');
  const hatched = hatchEgg(hatchLab, eggRes.egg.id, content, eggRes.egg.hatchAt);
  assert.ok(hatched.ok, hatched.msg);
  assert.equal(hatched.hatchling.species, 'alpine_ram');
  assert.equal(hatched.variant, 'alpine_ram');
  assert.ok(hatched.firstOfItsKind, 'the first of its kind is announced');
  assert.deepEqual(hatchLab.dex.variants, ['alpine_ram']);
  const again = breedPair(hatchLab, 'v2', 'v1', content, t0);
  const hatched2 = hatchEgg(hatchLab, again.egg.id, content, again.egg.hatchAt);
  if (hatched2.variant) assert.ok(!hatched2.firstOfItsKind, 'the second is just livestock');

  // Extraction of a variant yields VARIANT parts, not its base's.
  const exLab = { ...newGameState(), seed: 11 };
  exLab.ranch.stock = [adult('x1', 'alpine_ram', 'F')];
  const grad = extractAnimal(exLab, 'x1', content, t0);
  assert.ok(grad.ok, grad.msg);
  assert.ok(grad.tokens.every((tk) => content.parts[tk.partId].species === 'alpine_ram'),
    'an Alpine Ram graduates into Alpine Ram parts');

  // A variant may rewrite what a slot votes for — and Air needed the parts.
  const airParts = Object.values(content.parts).filter((p) => p.classAffinity === 'air');
  assert.ok(airParts.some((p) => content.species[p.species].variantOf),
    'a variant contributes to the scarcest class');
  assert.ok(airParts.length >= 7, `Air is no longer four parts in the whole game (${airParts.length})`);
  assert.equal(
    Object.values(content.parts).find((p) => p.id === 'glider_skunk_forelimbs').classAffinity,
    'air',
    'the patagium is the mutation, and it votes Air'
  );

  // A variant's identity has to reach its MOVES where the chart reads them.
  const stormMoves = Object.values(content.parts)
    .filter((p) => p.species === 'storm_eagle' && p.move?.power > 0);
  assert.ok(stormMoves.every((p) => p.move.tags.includes('Electric')),
    'the Thunderhead actually attacks with Electric');
  assert.ok(!Object.values(content.parts)
    .some((p) => p.species === 'eagle' && p.move?.tags.includes('Electric')),
    'and its base does not');
}

// --- Regression: the generic forelimb and hindlimb abilities must stay
// --- distinguishable. They once shared a name, so the Tier II duplicate-move
// --- guard silently deleted every species' Ground-tagged kick.
{
  for (const sp of Object.values(content.species)) {
    if (sp.synthetic) continue;
    const fore = content.parts[`${sp.id}_forelimbs`];
    const hind = content.parts[`${sp.id}_hindlimbs`];
    if (!fore || !hind) continue;
    assert.notEqual(fore.ability, hind.ability, `${sp.id}: arms and legs are different moves`);
  }
  const tk = (partId) => ({ id: 'k' + partId, partId, grade: 'apex', donor: {} });
  const full = combatantFromChimera({
    id: 'r', name: 'R', frame: 'M', settleUntil: 0, instability: 0, bond: 100, injury: null,
    tokens: { head: tk('ram_head'), forelimbs: tk('ram_forelimbs'), hindlimbs: tk('ram_hindlimbs') },
  }, content, 1);
  assert.equal(full.moves.length, 3, 'a head, arms and legs are three moves');
  assert.ok(full.moves.some((m) => m.tags.includes('Ground')), 'and the kick keeps its Ground tag');
}

// --- Theater Tier II (§3.4 "Organ ×1, ×2 at Theater Tier 2" + §3.10 menu
// --- upgrades). A purchase that expands what you can CREATE, not a number
// --- that goes up: the L-class chassis and a second organ bay.
{
  const {
    theaterGrants, facilityLevel, nextUpgrade, buyUpgrade, levelData,
  } = await import('../splice/facility.js');
  const { SOCKETS, slotOfSocket } = await import('../render/renderer.js');

  // Socket ids vs slot types: every socket resolves to a slot a part declares.
  assert.ok(SOCKETS.includes('organ2'), 'the second organ bay exists as a socket');
  assert.equal(slotOfSocket('organ2'), 'organ', 'and an organ part is what fits it');
  for (const socketId of SOCKETS) {
    assert.ok(SLOTS.includes(slotOfSocket(socketId)), `${socketId} resolves to a real slot type`);
  }
  for (const frame of Object.values(content.frames)) {
    assert.ok(frame.sockets.organ2, `${frame.id} carries the organ2 bay — geometry is not the gate`);
  }

  const fresh = { ...newGameState(), seed: 1234 };
  assert.equal(facilityLevel(fresh, 'theater'), 1, 'a new lab starts at Tier I');
  const tier1 = theaterGrants(fresh, content);
  assert.deepEqual(tier1.frames, ['S', 'M'], 'Tier I is S and M — the Rumbler is bought, not given');
  assert.ok(!tier1.sockets.includes('organ2'), 'and one organ bay');

  // The gate: money AND territory. Law 2 — conquest expands creation.
  fresh.funds = 100000;
  const gated = nextUpgrade(fresh, content, 'theater');
  assert.ok(gated.blockers.some((b) => b.kind === 'node'), 'all the money in the world will not skip the conquest');
  assert.ok(!buyUpgrade(fresh, content, 'theater').ok);
  fresh.campaign.heldNodes = ['barn_perimeter', 'downtown', 'checkpoint'];
  fresh.funds = 10;
  assert.ok(nextUpgrade(fresh, content, 'theater').blockers.some((b) => b.kind === 'funds'), 'nor will the conquest skip the money');
  assert.ok(!buyUpgrade(fresh, content, 'theater').ok);

  const cost = levelData(content, 'theater', 2).cost;
  fresh.funds = cost + 5;
  const bought = buyUpgrade(fresh, content, 'theater');
  assert.ok(bought.ok, bought.msg);
  assert.equal(fresh.funds, 5, 'and it charges you');
  assert.equal(facilityLevel(fresh, 'theater'), 2);
  assert.equal(nextUpgrade(fresh, content, 'theater'), null, 'Tier II is the top of the track for now');

  const tier2 = theaterGrants(fresh, content);
  assert.ok(tier2.frames.includes('L'), 'Tier II buys the Rumbler chassis');
  assert.ok(tier2.sockets.includes('organ2'), 'and the second organ bay');

  // The Theater enforces both, and says why.
  const stocked = { ...newGameState(), seed: 55 };
  stocked.inventory.parts = ['goat_head', 'wolf_organ', 'goat_organ'].map((partId, i) => ({
    id: `t${i}`, partId, grade: 'standard', donor: { name: 'Doris', species: 'goat', stars: 3, extractedAt: 0 },
  }));
  const tier1Errors = validateSplice(stocked, 'L', { head: 't0', organ: 't1', organ2: 't2' }, content);
  assert.ok(tier1Errors.some((e) => e.includes(content.frames.L.name)), 'Tier I refuses the Rumbler, by name');
  assert.ok(tier1Errors.some((e) => e.includes('organ2')), 'and refuses the second bay, separately');
  assert.equal(validateSplice(stocked, 'M', { head: 't0', organ: 't1' }, content).length, 0, 'what it does own still splices');

  stocked.facility = { theater: 2 };
  assert.deepEqual(validateSplice(stocked, 'L', { head: 't0', organ: 't1', organ2: 't2' }, content), [],
    'Tier II accepts the Rumbler with two organs');
  // A part still has to fit the bay it is put in.
  assert.ok(validateSplice(stocked, 'L', { head: 't0', organ2: 't0' }, content).some((e) => e.includes('does not fit')));

  // The build that comes out is a real seven-socket creature.
  const two = spliceChimera(stocked, 'L', { head: 't0', organ: 't1', organ2: 't2' }, content, t0);
  assert.ok(two.ok, two.msg);
  assert.equal(Object.keys(two.chimera.tokens).length, 3);
  assert.equal(two.chimera.tokens.organ2.partId, 'goat_organ', 'the second bay is stored under its own socket id');
  assert.deepEqual(validateGenome(chimeraGenome(two.chimera, content), content), [], 'and it renders as a legal genome');
  assert.ok(renderCreatureSVG(chimeraGenome(two.chimera, content), content).includes('<svg'));

  // Two organs beat one — that is what the money bought.
  const tk = (partId) => ({ id: 'x' + partId, partId, grade: 'apex', donor: { name: 'D', species: 'x', stars: 3, extractedAt: 0 } });
  const one = analyze('L', [tk('gorilla_head'), tk('gorilla_hide'), tk('gorilla_organ')], content, 6);
  const both = analyze('L', [tk('gorilla_head'), tk('gorilla_hide'), tk('gorilla_organ'), tk('wolf_organ')], content, 7);
  assert.ok(both.stats.stamina > one.stats.stamina, 'a second bay is more stamina');
  assert.ok(both.stats.hp > one.stats.hp, 'and more creature');
  assert.ok(both.mass > one.mass, 'and more to carry');
  assert.equal(both.rows.find((r) => r.label === 'Chassis').value, '4/7 sockets filled',
    'and the panel counts the bay it can actually fill');

  // Duplicate organs stack stats but must not hand the player two identical
  // buttons — Tier II makes that possible for the first time.
  const twins = { id: 'tw', name: 'Twins', frame: 'L', settleUntil: 0, instability: 0, bond: 100, injury: null,
    tokens: { head: tk('gorilla_head'), organ: tk('wolf_organ'), organ2: tk('wolf_organ') } };
  const cb = combatantFromChimera(twins, content, 1);
  const names = cb.moves.map((m) => m.name);
  assert.equal(new Set(names).size, names.length, 'no duplicated move buttons');
  const single = combatantFromChimera({ ...twins, tokens: { head: tk('gorilla_head'), organ: tk('wolf_organ') } }, content, 1);
  assert.ok(cb.staminaMax > single.staminaMax, 'but the stats still stack');
}

// --- AI Director (§3.7): the world studies you and answers. The tracking
// --- data has existed since M0; this is the session it started acting.
{
  const {
    directorProfile, directorRead, directEncounter, directorNews, directorReach, classOfParts,
  } = await import('../campaign/director.js');

  const P = {
    ground: ['gorilla_head', 'gorilla_forelimbs', 'gorilla_hindlimbs', 'tiger_tail', 'pangolin_hide', 'wolf_organ'],
    air: ['eagle_head', 'eagle_forelimbs', 'eagle_tail', 'eagle_hide', 'eagle_organ'],
    water: ['shark_head', 'shark_forelimbs', 'shark_hindlimbs', 'shark_tail', 'shark_hide', 'electric_eel_organ'],
  };
  const chim = (id, parts) => ({
    id, name: id, frame: 'L',
    tokens: Object.fromEntries(parts.map((p) => [content.parts[p].slot, { id: id + p, partId: p, grade: 'apex', donor: {} }])),
  });
  const lab = (chimeras, dissections = [], nodes = 8) => ({
    seed: 4242,
    chimeras,
    directorStats: { partUse: {}, tagUse: {}, announced: [], dissections: dissections.map((parts, i) => ({ chimera: 'Lost' + i, partIds: parts, at: 1 })) },
    campaign: { heldNodes: Array.from({ length: nodes }, (_, i) => 'n' + i) },
  });

  // Class is read per CREATURE, by the same majority vote the battle engine
  // uses. Counting part affinities would be a structural lie — Ground sits
  // on far more parts than Air, so every stable would read Ground and
  // diversifying would buy nothing.
  const affinities = { air: 0, ground: 0, water: 0 };
  for (const part of Object.values(content.parts)) if (part.classAffinity) affinities[part.classAffinity]++;
  assert.ok(affinities.ground > affinities.air * 2, 'the part pool really is Ground-skewed — hence the per-creature read');
  assert.equal(classOfParts(P.air, content), 'air');
  assert.equal(classOfParts(P.water, content), 'water');
  assert.equal(classOfParts([], content), null, 'no anatomy, no read');

  // Gating: nothing to go on, the tutorial, and rival duels are all off limits.
  const blank = lab([], [], 0);
  assert.equal(directorRead(blank, content).rule, null, 'the world needs data before it has a plan');
  assert.ok(!directEncounter(blank, content.encounters.checkpoint, content).directed, 'and it does not adapt without one');
  const committed = lab([chim('a', P.ground), chim('b', P.ground), chim('c', P.ground)]);
  assert.ok(!directEncounter(committed, content.encounters.patrol_1, content).directed, 'the tutorial patrol is never adapted');
  assert.ok(!directEncounter(committed, { id: 'r', rivalId: 'x', tier: 5, waves: ['a', 'b'] }, content).directed,
    'rival duels do their own counter-biasing');

  // It reads a committed stable and sends the class that answers it.
  const read = directorRead(committed, content);
  assert.equal(read.profile.favoredClass, 'ground');
  assert.equal(read.rule.id, 'ground_stable');
  assert.equal(read.rule.reads.class, 'ground');
  assert.ok(read.rule.units.some((u) => content.enemies[u].class === 'air'),
    'and the unit it sends actually beats Ground');

  // THE ESCAPE HATCH: a stable it cannot read costs nothing to field.
  const mixed = lab([chim('a', P.ground), chim('b', P.air), chim('c', P.water)]);
  assert.equal(directorProfile(mixed, content).favoredClass, null, 'one of each reads as nothing — that is the hybrid reward');
  assert.notEqual(directorRead(mixed, content).rule?.id, 'ground_stable');

  // A dissection counts for exactly one creature you are still fielding —
  // enough to tip a balanced stable back into being legible, not enough to
  // be a permanent tax you cannot escape.
  const bereaved = lab([chim('a', P.ground), chim('b', P.air), chim('c', P.water)], [P.ground]);
  assert.equal(directorProfile(bereaved, content).favoredClass, 'ground', 'the enemy took notes on what they dissected');
  const pivoted = lab([chim('b', P.air), chim('c', P.water)], [P.ground]);
  assert.equal(directorProfile(pivoted, content).favoredClass, null, 'stop fielding it and the read goes away again');

  // Reach: one encounter at first, more as you take ground and lose creatures.
  const early = directorReach(lab([chim('a', P.ground)], [], 0), content);
  const late = directorReach(lab([chim('a', P.ground)], [P.ground, P.ground], 8), content);
  assert.equal(early.budget, 1, 'it starts with the hardest encounter only');
  assert.ok(late.budget > early.budget, 'and reaches further down as the campaign escalates');
  assert.ok(early.ids.every((id) => late.ids.includes(id)), 'the reach only grows, it never shuffles');
  const reachedTiers = late.ids.map((id) => content.encounters[id].tier);
  assert.equal(reachedTiers[0], Math.max(...reachedTiers), 'hardest first — the big budgets adapt before the beat cops');

  // The adaptation itself: seeded, legible, and never a mercy rule.
  const enc = directEncounter(committed, content.encounters.checkpoint, content);
  assert.ok(enc.directed, 'a committed stable gets answered');
  assert.ok(enc.directed.intel, 'and told about it before it commits a team');
  assert.equal(JSON.stringify(enc), JSON.stringify(directEncounter(committed, content.encounters.checkpoint, content)),
    'the same save always faces the same adaptation');
  assert.equal(enc.waves[0], content.encounters.checkpoint.waves[0], 'the encounter still opens the way it was authored');
  const heft = (id) => content.enemies[id].hp + content.enemies[id].power * 3 + content.enemies[id].armor * 2;
  for (const e of Object.values(content.encounters)) {
    const d = directEncounter(lab([chim('a', P.ground)], [P.ground, P.ground]), e, content);
    if (!d.directed) continue;
    assert.ok(d.waves.length >= e.waves.length, `${e.id}: the director never shortens a fight`);
    if (d.directed.replaced) {
      assert.ok(heft(d.directed.unitId) >= heft(d.directed.replaced),
        `${e.id}: never swaps a tough unit for a weaker "counter" — that is a mercy rule, not an adaptation`);
      assert.ok(!content.enemies[d.directed.replaced].transformInto,
        `${e.id}: a boss fight must still contain its boss`);
      assert.notEqual(d.directed.replaced, e.waves[e.waves.length - 1],
        `${e.id}: the commander is not a mook`);
    }
  }

  // A targeted case, because the live roster rarely exercises it: given a
  // heavyweight sitting in a middle slot, the director must take the flimsy
  // one. Swapping the Clampdown 9000 out for a helicopter would be a mercy
  // rule wearing an adaptation's coat.
  {
    const stacked = {
      id: 'stacked_test', name: 'Stacked', tier: 3, reward: 0,
      waves: ['riot_squad', 'clampdown_9000', 'net_trooper', 'police_cruiser'],
    };
    // Register it so the reach gate can see it, and hand the director a
    // campaign far enough along that its budget covers everything.
    const withStacked = { ...content, encounters: { ...content.encounters, stacked_test: stacked } };
    const late = lab([chim('a', P.ground), chim('b', P.ground), chim('c', P.ground)], [], 20);
    const d = directEncounter(late, stacked, withStacked);
    assert.ok(d.directed, 'a tier-3 encounter in reach gets adapted');
    assert.equal(d.directed.replaced, 'net_trooper', 'it takes the flimsiest expendable slot');
    assert.equal(d.waves[1], 'clampdown_9000', 'and leaves the heavyweight standing');
    assert.equal(d.waves[3], 'police_cruiser', 'and the final wave alone');
  }

  // It announces itself in the wire — once per rule, then it is old news.
  const wire = lab([chim('a', P.ground)]);
  wire.news = [];
  const directed = directEncounter(wire, content.encounters.military_response, content).directed;
  assert.ok(directorNews(wire, directed), 'the first time a countermeasure lands, it makes the papers');
  assert.equal(directorNews(wire, directed), null, 'the second time it is just Tuesday');
  assert.ok(wire.directorStats.announced.includes(directed.ruleId));

  // And it bites: the stable it read loses ground on the encounter it rewrote.
  {
    const hero = makeSimChimera('L', P.ground, 'apex', content);
    const plain = content.encounters.military_response;
    const adapted = directEncounter(committed, plain, content);
    assert.ok(adapted.directed, 'the hardest encounter is always in reach');
    const rate = (e, tag) => {
      let w = 0;
      for (let i = 0; i < 24; i++) if (scriptedBattle(hero, e, content, hashString(`dir${tag}${i}`), 3).outcome === 'win') w++;
      return w / 24;
    };
    assert.ok(rate(adapted, 'd') < rate(plain, 'p'), 'being predictable costs you');
  }
}

// --- Balance pass: the difficulty curve. These are the assertions that
// --- stop the shape from silently drifting back. The measured targets come
// --- from tools/sim.js at a team of THREE — the yardstick that matters,
// --- because that is what the game hands the player.
{
  // 1. The grade ladder is a staircase, not a leap. Prismatic used to be
  //    x2.0 against x1.5 apex, which turned every wall into a formality in
  //    one husbandry tier.
  const mults = GRADES.map((g) => g.mult);
  assert.deepEqual(mults, [...mults].sort((a, b) => a - b), 'grades only go up');
  const steps = mults.slice(1).map((m, i) => m - mults[i]);
  const spread = Math.max(...steps) - Math.min(...steps);
  assert.ok(spread <= 0.1, `grade steps stay even (steps ${steps.join('/')}, spread ${spread.toFixed(2)})`);

  // 2. Every encounter declares a tier the curve actually defines.
  // tierScale[0] is unused (tiers are 1-based) and tier 1 sits BELOW the
  // authored stats on purpose: it is the tutorial band, and a new player
  // fields exactly one chimera of standard parts against it.
  const curve = content.tierScale;
  const ladder = curve.slice(1);
  assert.deepEqual(ladder, [...ladder].sort((a, b) => a - b), 'the difficulty curve only rises');
  assert.ok(ladder[0] < 1, 'tier 1 is a tutorial band, gentler than the authored roster');
  assert.ok(ladder[ladder.length - 1] > 1.5, 'and the top of the ladder is a real step up');
  assert.equal(tierScaleFor({ id: 'ad_hoc', waves: [] }, content), 1, 'a tier-less encounter fights at its authored stats');
  assert.equal(tierScaleFor({ id: 'rival_x', rivalId: 'x', tier: 5, waves: [] }, content), 1, 'rivals are never tier-scaled');
  for (const enc of Object.values(content.encounters)) {
    assert.equal(typeof enc.tier, 'number', `${enc.id} declares a tier`);
    assert.ok(curve[enc.tier] != null, `${enc.id}'s tier ${enc.tier} exists in tierScale`);
  }

  // 3. Tier scaling reaches the battle, and rivals are exempt (they carry
  //    their own powerScale).
  const unit = content.enemies.riot_squad;
  assert.ok(combatantFromUnit(unit, curve[3]).maxHp > combatantFromUnit(unit, curve[1]).maxHp,
    'the same unit is tougher in a later encounter');
  assert.equal(combatantFromUnit(unit).maxHp, unit.hp, 'unscaled is the authored stat block');
  {
    const { rivalEncounter } = await import('../campaign/rivals.js');
    const st = { seed: 5, chimeras: [], campaign: { heldNodes: [], notoriety: 0, rivals: {} } };
    const enc = rivalEncounter(st, content.rivals.mantissa, content);
    const solo = makeChimera({ ...newGameState(), seed: 3 }, 'M', { goat_head: 'standard' }, t0);
    const b = createBattle([solo], enc, content, 1, solo.settleUntil);
    assert.equal(b.enemyScale, 1, 'rival chimeras are never tier-scaled on top of their own power');
    assert.equal(b.enemy.active.maxHp, enc.waves[0].hp, 'a rival specimen fights at the stats it was generated with');
  }

  // 4. THE BUG THIS PASS EXISTED TO FIX: filling sockets has to beat leaving
  //    them empty. Frames used to carry ~95% of a creature's health, so the
  //    dominant build was "biggest chassis, fewest parts" — the exact thing
  //    the physiology panel warns against.
  const hpOf = (frame, partIds) => {
    const tokens = partIds.map((id) => ({ id, partId: id, grade: 'standard', donor: {} }));
    return analyze(frame, tokens, content).stats.hp;
  };
  for (const frame of ['S', 'M', 'L']) {
    const bare = hpOf(frame, ['tiger_head']);
    const full = hpOf(frame, ['tiger_head', 'tiger_forelimbs', 'tiger_hindlimbs', 'tiger_tail', 'tiger_hide', 'tiger_organ']);
    assert.ok(full >= bare * 1.6,
      `${frame} frame: a full build must be worth building (${bare} HP bare vs ${full} HP full)`);
    assert.ok(content.frames[frame].phys.hp < full * 0.55,
      `${frame} frame is a chassis, not the health pool (${content.frames[frame].phys.hp} of ${full})`);
  }

  // 5. The shape itself, measured. Cheap seeds — this guards the ladder's
  //    ordering, not its third decimal place.
  const encWin = (grade, encId, teamSize = 3) => {
    const { rows } = runSim(content, { builds: 12, seedsPer: 3, grade, teamSize });
    const xs = rows.map((r) => r.perEncounter[encId]).sort((a, b) => a - b);
    return xs[Math.floor(xs.length / 2)];
  };
  assert.ok(encWin('standard', 'patrol_1') >= 0.6, 'the tutorial patrol is winnable on day one');
  assert.equal(encWin('standard', 'boss_clampdown'), 0, 'the boss is not');
  assert.ok(encWin('prismatic', 'boss_clampdown') >= 0.5, 'and the top of the grade ladder answers it');
  assert.ok(encWin('prismatic', 'rival_aloft') < encWin('prismatic', 'boss_clampdown'),
    'rivals sit above the human roster: they are the hardest content, not the easiest');
}

// --- Battle overhaul: step() returns a replayable stream. Each event
// --- carries the state at the instant it happened, so the arena can show
// --- one beat at a time instead of dumping a receipt. The harness and the
// --- browser must agree on that stream, so assert its shape here.
{
  const s = { ...newGameState(), seed: 8181 };
  const fighter = makeChimera(s, 'M', {
    goat_head: 'prime', goat_forelimbs: 'prime', goat_hindlimbs: 'prime', goat_organ: 'prime',
  }, t0);
  const b = createBattle([fighter], content.encounters.patrol_1, content, 31, fighter.settleUntil);
  const forecast = turnForecast(b);
  assert.equal(typeof forecast.playerFirst, 'boolean', 'the UI can say who strikes first before you commit');
  assert.equal(forecast.playerSpeed, playerActive(b).speed);
  assert.equal(forecast.enemySpeed, b.enemy.active.speed);

  const all = [];
  let guard = 0;
  while (!b.over && guard++ < 200) {
    const acts = playerActions(b);
    if (!acts.length) break;
    const evs = step(b, acts.find((a) => a.type === 'move') ?? acts[0], content);
    for (const e of evs) {
      assert.equal(typeof e.text, 'string', 'every event still carries its log line');
      assert.ok(e.kind, 'and a kind the renderer can animate');
      assert.ok(e.snap, 'and a snapshot of the moment it happened');
      const sn = e.snap;
      assert.ok(sn.player && sn.enemy, 'snapshots hold both sides');
      assert.ok(sn.player.hp <= sn.player.maxHp && sn.player.hp >= 0, 'with sane HP');
      assert.ok(sn.enemy.hp <= sn.enemy.maxHp && sn.enemy.hp >= 0);
      assert.ok(Array.isArray(sn.bench), 'and the bench, for the team tray');
      assert.equal(typeof sn.wavesLeft, 'number');
      assert.equal(typeof sn.cannon, 'number');
    }
    all.push(...evs);
  }
  assert.ok(all.length > 4, 'a fight produces a stream worth replaying');
  assert.ok(all.some((e) => e.kind === 'damage' && e.amount > 0 && e.actor && e.target), 'damage beats name an attacker, a target and a number');
  assert.ok(all.some((e) => e.kind === 'ko'), 'and somebody eventually goes down');
  assert.ok(all.every((e) => e.kind !== 'damage' || typeof e.mult === 'number'), 'damage carries its effectiveness so the number can be coloured');

  // The snapshot must be a COPY: replaying an old beat cannot show a status
  // the fighter only picked up later. The last event's snapshot describes
  // the combatant still standing, so mutating it is a direct test.
  const fresh = { ...newGameState(), seed: 8282 };
  const scout = makeChimera(fresh, 'M', { goat_head: 'prime', goat_forelimbs: 'prime' }, t0);
  const b2 = createBattle([scout], content.encounters.patrol_1, content, 77, scout.settleUntil);
  const beats = step(b2, playerActions(b2)[0], content);
  const last = beats[beats.length - 1].snap;
  const venomBefore = last.enemy.status.venom;
  const hpBefore = last.enemy.hp;
  b2.enemy.active.status.venom = 7;
  b2.enemy.active.hp = 1;
  assert.equal(last.enemy.status.venom, venomBefore, 'snapshots are frozen copies, not live references');
  assert.equal(last.enemy.hp, hpBefore, 'and their numbers do not drift either');

  // Snapshots track the log exactly — same order, same lines.
  assert.deepEqual(all.map((e) => e.text).slice(-6), b.log.slice(-6), 'the stream and the log never disagree');

  // Damage snapshots are taken AFTER the hit lands, so a bar driven from
  // them shows the damage the number just announced.
  const lethal = all.find((e) => e.kind === 'ko' && e.target === 'enemy');
  assert.equal(lethal.snap.enemy.hp, 0, 'a KO beat shows an empty bar');
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

// --- Region contestation (§3.9 "coalition counter-offensives can contest
// --- held regions"). Conquest used to be one-way, which is the shape
// --- endless mode goes stale in. Now they come back for it.
{
  const {
    contestTuning, tickContests, contestOn, isContested, contestEncounter,
    resolveContest, contestEligible, defencesOf, escalationOf,
  } = await import('../campaign/contest.js');
  const { incomeSuspended } = await import('../campaign/campaign.js');
  const ct = contestTuning(content);

  // Content coherence: every reinforcement is a real unit.
  assert.ok(content.campaignMeta.contestation, 'regions.json carries a contestation block');
  assert.ok(ct.escalation > 0, 'a defence is harder than the assault that took the place');
  assert.ok(ct.escalationPerDefence > 0, 'and harder again every time you hold it');
  assert.ok(ct.rewardScale > 1, 'and pays more than the original');
  assert.ok(ct.windowHours > 0 && ct.cooldownHours > ct.windowHours, 'the window closes well before the next one opens');
  assert.ok(ct.intel.includes('{pct}'), 'the intel line quotes the strength');
  for (const key of ['opened', 'held', 'lost', 'expired']) {
    assert.ok(ct.news[key]?.includes('{node}'), `the ${key} wire line names the node`);
  }

  // An empire at Threat Gen 2 holding four nodes, cloned per test.
  const empire = () => {
    const s = structuredClone(conq);
    s.campaign.lastTickAt = t0;
    s.campaign.contested = [];
    s.campaign.nextContestAt = null;
    s.campaign.defences = {};
    s.campaign.contestCount = 0;
    s.funds = 0;
    s.news = [];
    for (const c of s.chimeras) c.injury = null;
    return s;
  };

  // Early play is untouched: no threat generation, no counter-offensive.
  {
    const young = { ...newGameState(), seed: 31 };
    young.campaign.heldNodes = ['barn_perimeter', 'downtown'];
    assert.equal(threatGen(young, content), 1);
    assert.equal(contestEligible(young, content, 1), false, 'gen 1 is not contestable');
    assert.deepEqual(tickContests(young, content, t0 + 500 * HOUR, 1), [], 'and nothing ever fires');
    assert.equal(young.campaign.nextContestAt, null, 'not even a schedule');
    // Nor with the generation but without the territory.
    const lonely = { ...newGameState(), seed: 32 };
    lonely.campaign.heldNodes = ['barn_perimeter'];
    assert.equal(contestEligible(lonely, content, 2), false, `one node is under the ${ct.minHeld}-node floor`);
  }

  // THE load-bearing rule: the schedule is a timestamp, not a per-tick
  // roll. A player who opens the app fifty times an evening must not be
  // attacked fifty times as often — otherwise the frequency measures
  // their habits instead of the world.
  {
    const s = empire();
    assert.deepEqual(tickContests(s, content, t0, 2), [], 'the first tick only schedules');
    assert.equal(s.campaign.nextContestAt, t0 + ct.firstDelayHours * HOUR, 'a beat before the first one');
    let opened = 0;
    for (let i = 0; i < 50; i++) {
      opened += tickContests(s, content, t0 + i * 60000, 2).length;
    }
    assert.equal(opened, 0, 'fifty ticks inside the window open nothing');
    assert.equal(s.campaign.contested.length, 0);
    assert.equal(s.campaign.nextContestAt, t0 + ct.firstDelayHours * HOUR, 'and the schedule never moved');
  }

  // The window starts when you SEE it. Come back from a week away and the
  // convoy is arriving now, with the whole window ahead of you — losing a
  // node you were never given a chance to defend is exactly the surprise
  // the rescue-window house rule forbids.
  let contestedNodeId = null;
  {
    const s = empire();
    tickContests(s, content, t0, 2);
    const away = t0 + 7 * 24 * HOUR;
    const news = tickContests(s, content, away, 2);
    assert.equal(s.campaign.contested.length, 1, 'a week away means exactly one counter-offensive, not fifty');
    assert.equal(news.length, 1, 'and one wire line');
    const c = s.campaign.contested[0];
    contestedNodeId = c.nodeId;
    assert.equal(c.deadline, away + ct.windowHours * HOUR, 'the window opens when the player does');
    assert.ok(c.deadline > away, 'so it cannot already have expired');
    assert.equal(s.campaign.nextContestAt, null, 'the next one is scheduled when this resolves');
    assert.ok(s.campaign.heldNodes.includes(c.nodeId), 'the node is still HELD while contested');
    assert.equal(nodeStates(s, content).find((n) => n.node.id === c.nodeId).status, 'contested');

    // …and it costs money every hour it stands.
    const node = region.nodes.find((n) => n.id === c.nodeId);
    assert.equal(incomeSuspended(s, content), node.incomePerDay);
    assert.equal(incomePerDay(s, content), 225 - node.incomePerDay, 'a contested node earns nothing');
    assert.equal(s.campaign.contested.length, 1);
    // Force another to fall due while this one still stands: the cap, not
    // the schedule, has to be what stops it.
    s.campaign.nextContestAt = away;
    assert.deepEqual(tickContests(s, content, away + HOUR, 2), [], 'only one convoy at a time');
    assert.equal(s.campaign.contested.length, 1);
  }

  // Ignore the window and they take it — but the node comes back on the
  // map, so it is a setback, never a deletion.
  {
    const s = empire();
    tickContests(s, content, t0, 2);
    tickContests(s, content, t0 + 10 * HOUR, 2);
    const c = s.campaign.contested[0];
    assert.deepEqual(tickContests(s, content, c.deadline - 1, 2), [], 'not a minute early');
    assert.ok(s.campaign.heldNodes.includes(c.nodeId));
    const news = tickContests(s, content, c.deadline, 2);
    assert.equal(news.length, 1);
    assert.ok(news[0].includes(region.nodes.find((n) => n.id === c.nodeId).name), 'the wire names what you lost');
    assert.ok(!s.campaign.heldNodes.includes(c.nodeId), 'the node is gone');
    assert.equal(s.campaign.contested.length, 0);
    assert.ok(s.campaign.nextContestAt > c.deadline, 'and the next one is on the books');
    // Retakeable: it is an ordinary objective again.
    const status = nodeStates(s, content).find((n) => n.node.id === c.nodeId).status;
    assert.ok(status === 'available' || status === 'locked', `a lost node returns to the map (${status})`);
  }

  // The defence is the node's OWN encounter, escalated — which is why a
  // new region costs zero new encounter data.
  {
    const s = empire();
    tickContests(s, content, t0, 2);
    tickContests(s, content, t0 + 10 * HOUR, 2);
    const c = s.campaign.contested[0];
    const node = region.nodes.find((n) => n.id === c.nodeId);
    const base = content.encounters[node.encounter];
    const enc = contestEncounter(s, content, c);
    assert.equal(enc.baseId, base.id, 'the director reaches it through the encounter it came from');
    assert.deepEqual(enc.waves, base.waves, 'the same garrison, not a new encounter to author');
    assert.ok(enc.reward > base.reward, 'and worth more than the original assault');
    assert.equal(enc.escalation, 1 + ct.escalation);
    assert.ok(
      tierScaleFor(enc, content) > tierScaleFor(base, content),
      'but stronger than the garrison you beat — and it reaches the stat scale'
    );
    // The escalation is a CONTINUOUS dial, not a tier step. The authored
    // ladder is a ladder of content and its rungs are uneven: +1 tier
    // took the boss node's defence from 30% to 5% against the harness's
    // yardstick team while barely touching the mid nodes.
    assert.ok(
      Math.abs(tierScaleFor(enc, content) / tierScaleFor(base, content) - (1 + ct.escalation)) < 1e-6,
      'every node escalates by the same proportion'
    );
    assert.ok(enc.intel.includes(String(Math.round((1 + ct.escalation) * 100))), 'and the briefing says how much stronger');
    // Deterministic: the same save always faces the same convoy.
    assert.deepEqual(contestEncounter(s, content, c), enc, 'seeded from the world, not the clock');
  }

  // ACCEPTANCE: a held node can be taken off you and won back — income
  // stops, the defence is fightable, and holding the line pays out in
  // something you can BUILD with (Law 2), not just money.
  {
    const s = empire();
    // Pinned to the Checkpoint rather than taking whatever the seed
    // offers: it is a real mid-ladder garrison WITH a vehicle in it, so
    // this exercises a fight worth fighting and the impound that pays
    // for it. The seeded choice itself is covered above.
    s.campaign.contestCount = 1;
    s.campaign.contested = [{ nodeId: 'checkpoint', startedAt: t0, deadline: t0 + 18 * HOUR, gen: 2 }];
    const c = s.campaign.contested[0];
    const node = region.nodes.find((n) => n.id === c.nodeId);
    const full = 225;
    assert.equal(incomePerDay(s, content), full - node.incomePerDay, 'the money stops first');

    const enc = contestEncounter(s, content, c);
    const bays = s.campaign.containment.length;
    const notoriety = s.campaign.notoriety;
    // A derived encounter is not in enemies.json, so the aftermath cannot
    // look its waves up afterwards. Clear the Dex the conquest filled, or
    // this proves nothing.
    s.dex.enemies = [];
    s.battle = createBattle(s.chimeras.slice(0, 3), enc, content, hashString('defend'), t0 + 10 * HOUR, {
      kind: 'defend',
      nodeId: c.nodeId,
      waveIds: enc.waves.filter((w) => typeof w === 'string'),
    });
    autoplay(s.battle);
    assert.equal(s.battle.outcome, 'win', 'the prismatic army holds the line');
    const detail = resolveBattle(s, s.battle, content, t0 + 11 * HOUR);

    assert.equal(detail.defended, true);
    assert.equal(detail.node, node.name);
    assert.ok(s.campaign.heldNodes.includes(c.nodeId), 'the node is still yours');
    assert.equal(s.campaign.contested.length, 0, 'the counter-offensive is over');
    assert.equal(incomePerDay(s, content), full, 'and the money comes back on');
    assert.equal(defencesOf(s, c.nodeId), 1, 'the defence is on the record');
    assert.equal(s.campaign.notoriety, notoriety + ct.notoriety, 'holding it is notorious');
    assert.ok(s.campaign.nextContestAt > t0 + 11 * HOUR, 'they will be back');
    // Law 2: holding the line has to expand what you can BUILD with, not
    // just what you own. A garrison with a vehicle in it leaves that
    // vehicle behind — and a garrison of people walks away, which is
    // both correct and the reason this is asserted conditionally.
    const hasWreck = enc.waves.some((id) => {
      let u = content.enemies[id];
      for (let hops = 0; u && hops < 4; hops++) {
        if (u.salvage?.length) return true;
        u = content.enemies[u.transformInto];
      }
      return false;
    });
    // The cannon may also have bagged something during the fight; the
    // wreckage is impounded after those, so it is the last bay.
    assert.equal(
      s.campaign.containment.length,
      bays + detail.salvageUnits.length + (hasWreck ? 1 : 0),
      'the wreckage is impounded on top of anything the cannon took'
    );
    if (hasWreck) {
      assert.ok(detail.wreckage, `and the aftermath names it (${detail.wreckage})`);
      const wreck = s.campaign.containment[s.campaign.containment.length - 1];
      assert.equal(content.enemies[wreck.unitId].name, detail.wreckage, 'the bay holds what the aftermath named');
      assert.ok(content.enemies[wreck.unitId]?.salvage?.length, 'it is something with parts in it');
      assert.equal(wreck.rehab, null, 'arriving as an ordinary bay');
      assert.ok(salvageUnit(s, wreck.id, content, t0 + 11 * HOUR).ok, 'and it goes straight to the bandsaw');
    }
    // Whatever the garrison was made of, the defence pays more than the
    // assault that first took the place.
    assert.ok(detail.reward > content.encounters[node.encounter].reward, 'and the purse is bigger');
    for (const u of enc.waves) assert.ok(s.dex.enemies.includes(u), 'a derived encounter still fills the Splice-Dex');
    // Hold it and the next convoy is stronger again — the endless ramp
    // §3.9 asks for, opt-in and self-paced rather than front-loaded.
    assert.ok(
      escalationOf(s, content, c.nodeId) > enc.escalation,
      'a place you keep holding is a place they keep escalating'
    );

    // Hold it a second time and they take longer to work up to a third.
    const afterOne = s.campaign.nextContestAt - (t0 + 11 * HOUR);
    s.campaign.contested = [{ nodeId: c.nodeId, startedAt: t0, deadline: t0 + 99 * HOUR, gen: 2 }];
    resolveContest(s, content, c.nodeId, 'win', t0 + 11 * HOUR);
    assert.equal(defencesOf(s, c.nodeId), 2);
    assert.ok(
      s.campaign.nextContestAt - (t0 + 11 * HOUR) > afterOne,
      'a place you keep holding is a place they work up to more slowly'
    );
  }


  // The commander's SECOND STAGE is the thing you actually beat, so the
  // wreckage follows the transform. Resolved directly rather than through
  // an escalated boss fight, which the yardstick army does not win.
  {
    const s = empire();
    s.campaign.contested = [{ nodeId: 'precinct', startedAt: t0, deadline: t0 + 18 * HOUR, gen: 2 }];
    const bays = s.campaign.containment.length;
    const staged = {
      encounterId: 'contest_precinct',
      reward: 100,
      outcome: 'win',
      context: { kind: 'defend', nodeId: 'precinct', waveIds: ['riot_squad', 'captain_clampdown'] },
      player: { team: [] },
      enemy: { active: null },
      captured: [],
      units: {},
      log: [],
    };
    assert.deepEqual(content.enemies.riot_squad.salvage ?? [], [], 'a squad of people leaves nothing to impound');
    assert.deepEqual(content.enemies.captain_clampdown.salvage ?? [], [], 'and neither does the commander, until he is a vehicle');
    const d = resolveBattle(s, staged, content, t0 + HOUR);
    assert.equal(d.defended, true);
    assert.equal(s.campaign.containment.length, bays + 1);
    assert.equal(
      d.wreckage,
      content.enemies[content.enemies.captain_clampdown.transformInto].name,
      'so the bay holds the Clampdown 9000, which is what was actually left in the car park'
    );
  }

  // Losing the defence hands the node over; scampering settles nothing.
  {
    const s = empire();
    tickContests(s, content, t0, 2);
    tickContests(s, content, t0 + 10 * HOUR, 2);
    const nodeId = s.campaign.contested[0].nodeId;

    const fled = resolveContest(s, content, nodeId, 'fled', t0 + 11 * HOUR);
    assert.equal(fled.held, null, 'a tactical scamper does not resolve a siege');
    assert.ok(isContested(s, nodeId), 'the convoy is still out there');
    assert.ok(s.campaign.heldNodes.includes(nodeId));

    const lost = resolveContest(s, content, nodeId, 'loss', t0 + 12 * HOUR);
    assert.equal(lost.held, false);
    assert.ok(lost.news.includes(region.nodes.find((n) => n.id === nodeId).name));
    assert.ok(!s.campaign.heldNodes.includes(nodeId), 'losing the defence loses the node');
    assert.equal(defencesOf(s, nodeId), 0, 'and buys no credit');
    assert.ok(s.campaign.nextContestAt > t0 + 12 * HOUR, 'they regroup either way');
  }
}

// --- The monologue pass (§3.8 "Rivals & Story Architecture"). The rivals
// --- have carried a profile schema since they were written; the player
// --- now has the same one, and the slots are wired to the events that
// --- should trigger them instead of sitting in the JSON being admired.
{
  const {
    fill, profileOf, philosophyList, philosophyOf, playerLine, rivalLine,
    rollIdentities, setIdentity, setPhilosophy, duelBarks, DEFAULT_PHILOSOPHY,
  } = await import('../campaign/monologue.js');
  const { rivalEncounter } = await import('../campaign/rivals.js');
  const { startRehab, tickRehab, rehabPlan } = await import('../campaign/rehab.js');

  const PLACEHOLDERS = new Set(['rival', 'creature', 'node', 'lab', 'name']);
  // A distinctive literal fragment of a template, for asserting that THIS
  // line reached the wire. Taking the text before the first placeholder is
  // a trap — half of these lines OPEN with {creature}, and an empty prefix
  // makes `includes()` vacuously true, which is exactly how three of these
  // assertions passed while guarding nothing.
  const fragment = (template) => {
    const best = template.split(/\{\w+\}/).map((x) => x.trim()).sort((a, b) => b.length - a.length)[0];
    assert.ok(best && best.length >= 12, `no distinctive literal in: ${template}`);
    return best;
  };
  const philosophies = philosophyList(content);
  const rivals = Object.values(content.rivals);

  // Content coherence: one schema, no ragged edges. A slot that exists for
  // one voice and not another is a line that silently never fires.
  assert.ok(philosophies.length >= 3, 'the player has a real choice of voice');
  const playerSlots = Object.keys(philosophies[0].monologue).sort();
  for (const ph of philosophies) {
    assert.deepEqual(Object.keys(ph.monologue).sort(), playerSlots, `${ph.id} carries the same slots as the rest`);
    assert.ok(ph.tagline && ph.blurb && ph.name, `${ph.id} is a complete profile`);
    for (const [slot, text] of Object.entries(ph.monologue)) {
      assert.ok(text.length > 30, `${ph.id}.${slot} is prose, not a placeholder`);
      for (const [, key] of text.matchAll(/\{(\w+)\}/g)) {
        assert.ok(PLACEHOLDERS.has(key), `${ph.id}.${slot} uses an unknown placeholder {${key}}`);
      }
    }
  }
  const rivalSlots = Object.keys(rivals[0].monologue).sort();
  for (const r of rivals) {
    assert.deepEqual(Object.keys(r.monologue).sort(), rivalSlots, `${r.id} carries the same slots as the rest`);
    for (const [slot, text] of Object.entries(r.monologue)) {
      assert.ok(text.length > 30, `${r.id}.${slot} is prose, not a placeholder`);
      for (const [, key] of text.matchAll(/\{(\w+)\}/g)) {
        assert.ok(PLACEHOLDERS.has(key), `${r.id}.${slot} uses an unknown placeholder {${key}}`);
      }
    }
  }

  // A philosophy is NARRATIVE ONLY. If a flavour menu ever grows a stat
  // block it becomes an invisible modifier, which is the exact thing the
  // class triangle was built to replace.
  for (const ph of philosophies) {
    assert.deepEqual(
      Object.keys(ph).sort(),
      ['blurb', 'id', 'monologue', 'name', 'tagline'],
      `${ph.id} carries story and nothing else`
    );
  }

  // THE assertion this pass exists for. dissectionTaunt sat in rivals.json
  // for three sessions with no caller — written, shipped, never once seen
  // by a player. Every slot must be REACHED by code.
  {
    const sources = ['campaign/campaign.js', 'campaign/rivals.js', 'campaign/rehab.js',
      'campaign/ui.js', 'campaign/monologue.js', 'battle/engine.js']
      .map((f) => readFileSync(join(root, f), 'utf8'))
      .join('\n');
    for (const slot of new Set([...playerSlots, ...rivalSlots])) {
      // A caller either asks for the slot by name (playerLine(…, 'rehab'))
      // or reads it off the bark bundle (battle.barks.midFight).
      assert.ok(
        new RegExp(`(['"\`]${slot}['"\`]|\\.${slot}\\b)`).test(sources),
        `monologue slot "${slot}" is never asked for by any caller — it is dead prose`
      );
    }
  }

  // Templating: known keys substitute, unknown keys are left visible so a
  // typo reads oddly instead of printing "undefined" at the player.
  assert.equal(fill('{a} and {b}', { a: 'x', b: 'y' }), 'x and y');
  assert.equal(fill('{a} and {nope}', { a: 'x' }), 'x and {nope}');
  assert.equal(fill(null, {}), null, 'a missing slot is silence, not a crash');

  // An unnamed lab is still a lab: nothing in this game waits behind a form.
  {
    const fresh = { ...newGameState(), seed: 12 };
    const me = profileOf(fresh, content);
    assert.equal(me.named, false);
    assert.ok(me.name && me.lab && me.title, 'and it still has something to print');
    assert.equal(philosophyOf(fresh, content).id, DEFAULT_PHILOSOPHY, 'with a default voice');
    assert.equal(fresh.profile.philosophy, null, 'that is NOT stamped into the save — the default can still move');
    assert.ok(playerLine(fresh, content, 'conquest', { node: 'Somewhere' }), 'so its lines still fire');
  }

  // Names are rolled, seeded, and distinct — no keyboard, no duplicates.
  {
    const a = rollIdentities(content, 99, 6);
    assert.equal(a.length, 6);
    assert.equal(new Set(a.map((i) => i.name)).size, 6, 'six distinct candidates');
    // One roll of six from a few hundred names collides only ~5% of the
    // time, so a single sample does not test the dedupe at all.
    for (let seed = 0; seed < 200; seed++) {
      const roll = rollIdentities(content, seed, 6);
      assert.equal(new Set(roll.map((i) => i.name)).size, 6, `roll ${seed} offers no duplicate names`);
    }
    assert.deepEqual(rollIdentities(content, 99, 6), a, 'the same roll always offers the same list');
    assert.notDeepEqual(rollIdentities(content, 100, 6).map((i) => i.name), a.map((i) => i.name), 'a re-roll offers new ones');

    const s = { ...newGameState(), seed: 5 };
    setIdentity(s, a[0]);
    assert.equal(profileOf(s, content).named, true);
    assert.equal(profileOf(s, content).name, a[0].name);
    setPhilosophy(s, 'showman');
    assert.equal(philosophyOf(s, content).id, 'showman');
    assert.equal(profileOf(s, content).name, a[0].name, 'and changing one does not clear the other');
  }

  // ACCEPTANCE, part 1: a rival duel is a CONVERSATION. Both voices, both
  // attributed, so the log is a scene rather than a row of anonymous
  // quotation marks.
  {
    const lab = { ...newGameState(), seed: 3131 };
    lab.campaign.lastTickAt = t0;
    lab.campaign.heldNodes = region.nodes.map((n) => n.id);
    lab.campaign.notoriety = 999;
    lab.campaign.rivals = { mantissa: { defeats: 0, losses: 0 } };
    setIdentity(lab, { title: 'Doctor', name: 'Wren Vex', lab: 'Better Animals Ltd.' });
    setPhilosophy(lab, 'showman');
    const hero = makeChimera(lab, 'L', {
      bear_head: 'prismatic', bear_forelimbs: 'prismatic', bear_hide: 'prismatic', bear_organ: 'prismatic',
    }, t0);
    const rival = content.rivals.mantissa;
    const encounter = rivalEncounter(lab, rival, content);
    const barks = duelBarks(lab, content, rival);
    assert.ok(barks.intro.includes(rival.name), "the player's opener names who they are talking to");

    const battle = createBattle([hero], encounter, content, 7, hero.settleUntil, {
      kind: 'rival', rivalId: 'mantissa',
      playerBarks: barks,
      speakers: { enemy: rival.name, player: 'Doctor Wren Vex' },
    });
    const opening = battle.log.join('\n');
    assert.ok(opening.includes(`${rival.name}: `), 'the rival speaks, by name');
    assert.ok(opening.includes('Doctor Wren Vex: '), 'and so do you, by name');
    assert.ok(
      opening.indexOf(`${rival.name}: `) < opening.indexOf('Doctor Wren Vex: '),
      'call, then response — they open, you answer'
    );
    // The exchange is kept as its own list so the arena can put it in the
    // message box. An opening the player has to open a log overlay to find
    // is an opening nobody reads.
    assert.equal(battle.opening.length, 2, 'both halves of the exchange are addressable');
    assert.ok(battle.opening[0].startsWith(`${rival.name}: `));
    assert.ok(battle.opening[1].startsWith('Doctor Wren Vex: '));
    // The wave announcement must not look like something the rival said —
    // it used to be "Dr. Mantissa: Thorax Ultra moves in!", which reads as
    // dialogue now that dialogue is attributed exactly that way.
    const waveIn = battle.log.find((l) => l.includes('moves in!'));
    assert.ok(waveIn && !waveIn.includes(`${rival.name}: `), `the wave-in is narration, not speech: ${waveIn}`);

    // Fight it out: their defeat line and your victory line both land.
    let guard = 0;
    while (!battle.over && guard++ < 300) {
      battle.enemy.active.hp = 0;
      step(battle, playerActions(battle)[0] ?? { type: 'rest' }, content);
    }
    assert.equal(battle.outcome, 'win');
    const full = battle.log.join('\n');
    assert.ok(full.includes(fragment(rival.monologue.defeat)), 'the rival concedes in their own words');
    assert.ok(
      full.includes(fragment(content.philosophies.showman.monologue.victory)),
      'and you get the last word, in yours'
    );

    // A patrol is not a scene: silence unless somebody was handed lines.
    const quiet = createBattle([hero], content.encounters.patrol_1, content, 7, hero.settleUntil, { kind: 'assault' });
    assert.deepEqual(quiet.playerBarks, {}, 'no monologuing at a riot squad');
    assert.deepEqual(quiet.opening, [], 'and no opening exchange to sit through');
    assert.ok(!quiet.log.join('\n').includes('Doctor Wren Vex'), 'the log stays clean');
  }

  // ACCEPTANCE, part 2: the slots fire on the events they were written
  // for, in the news wire, across the whole game rather than three fights.
  {
    const lab = { ...newGameState(), seed: 4141, funds: 6000 };
    lab.campaign.lastTickAt = t0;
    setPhilosophy(lab, 'collector');
    const ph = content.philosophies.collector;
    const say = (slot) => fragment(ph.monologue[slot]);

    // Conquest speaks.
    lab.campaign.heldNodes = [];
    const army = [makeChimera(lab, 'L', {
      bear_head: 'prismatic', bear_forelimbs: 'prismatic', bear_hide: 'prismatic', bear_organ: 'prismatic',
    }, t0)];
    const tWar = army[0].settleUntil;
    lab.battle = createBattle(army, content.encounters.patrol_1, content, 21, tWar, { kind: 'assault', nodeId: 'barn_perimeter' });
    autoplay(lab.battle);
    assert.equal(lab.battle.outcome, 'win');
    resolveBattle(lab, lab.battle, content, tWar);
    assert.ok(lab.news.some((n) => n.includes('Old Barn Perimeter') && n.includes(say('conquest'))), 'taking a node is worth saying something about');

    // Losing a chimera TO A RIVAL is personal: the taunt has an author,
    // and the wire says so when the window closes on it.
    const lost = { ...newGameState(), seed: 5151 };
    lost.campaign.lastTickAt = t0;
    setPhilosophy(lost, 'collector');
    const doomed = makeChimera(lost, 'S', { goat_head: 'standard' }, t0);
    const tLoss = doomed.settleUntil;
    lost.battle = createBattle([doomed], rivalEncounter(lost, content.rivals.trench, content), content, 9, tLoss, {
      kind: 'rival', rivalId: 'trench',
    });
    let g2 = 0;
    while (!lost.battle.over && g2++ < 300) {
      lost.battle.player.team[0].hp = 0;
      step(lost.battle, playerActions(lost.battle)[0] ?? { type: 'rest' }, content);
    }
    assert.equal(lost.battle.outcome, 'loss');
    resolveBattle(lost, lost.battle, content, tLoss);
    const captive = lost.campaign.captives[0];
    assert.ok(captive, 'they took one');
    assert.equal(captive.captor, 'trench', 'and the save remembers who');
    assert.ok(
      lost.news.some((n) => n.includes(fragment(content.rivals.trench.monologue.dissectionTaunt))),
      'so the right villain gloats about it'
    );
    // …and again, differently, when the rescue window closes.
    lost.news = [];
    tickCampaign(lost, content, captive.deadline);
    assert.equal(lost.campaign.captives.length, 0);
    assert.ok(
      lost.news.some((n) => n.includes(fragment(content.rivals.trench.monologue.dissectionDone))),
      'the peer review concludes in their voice, not a generic one'
    );

    // Rehabilitating a rival's specimen: you say what you did, and the lab
    // you took it from says what they think of that.
    const won = { ...newGameState(), seed: 6161, funds: 6000 };
    won.campaign.lastTickAt = t0;
    won.facility.containment = 2;
    setPhilosophy(won, 'collector');
    won.campaign.rivals = { aloft: { defeats: 0, losses: 0 } };
    won.campaign.heldNodes = region.nodes.map((n) => n.id);
    won.campaign.notoriety = 999;
    const spec = rivalEncounter(won, content.rivals.aloft, content).waves[0];
    won.campaign.containment.push({
      id: 'bay-m', unitId: spec.id, unit: spec, rivalId: 'aloft', capturedAt: t0, rehab: null,
    });
    const started = startRehab(won, 'bay-m', content, t0);
    assert.ok(started.ok, started.msg);
    assert.ok(
      started.news.some((n) => n.includes(say('rehab'))),
      'enrolling one is worth saying something about too'
    );
    const plan = rehabPlan(won, won.campaign.containment[0], content);
    won.news = [];
    tickCampaign(won, content, t0 + (plan?.hours ?? 24) * HOUR + HOUR);
    assert.equal(won.chimeras.length, 1, 'it graduated');
    const grad = won.chimeras[0].name;
    assert.ok(
      won.news.some((n) => n.includes(say('graduation')) && n.includes(grad)),
      'you say what you did, and name who you did it to'
    );
    assert.ok(
      won.news.some((n) => n.includes(fragment(content.rivals.aloft.monologue.defection))),
      'and the Baroness has OPINIONS about losing it'
    );
  }

  // A rival who keeps losing announces it in their own voice rather than
  // as a scoreboard line.
  {
    const s = { ...newGameState(), seed: 71 };
    s.campaign.rivals = { mantissa: { defeats: 1, losses: 0 } };
    const { recordRivalResult } = await import('../campaign/rivals.js');
    const line = recordRivalResult(s, 'mantissa', 'win', content);
    assert.equal(line, content.rivals.mantissa.monologue.rematch, 'the second defeat is theirs to comment on');
    assert.ok(rivalLine(content, 'nobody', 'rematch') === null, 'an unknown rival is silence, not a crash');
  }

  // v15 migration.
  {
    const old = structuredClone(v1Save);
    const up = migrate(old);
    assert.deepEqual(up.profile, { named: false, title: null, name: null, lab: null, philosophy: null });
  }
}

// --- Operations, a.k.a. the Jobs board. It exists because the campaign
// --- had no floor: every route to money and to new fauna ran through
// --- winning battles, so a player who kept losing had $22/day, a catalog
// --- of exactly two species, and no path at all to the Water or Air
// --- anatomy the class triangle says they need in order to stop losing.
{
  const {
    operationList, opTuning, opOdds, startOperation, abortOperation,
    tickOperations, opReady, opCooldownEndsAt, activeOp, heatNow, addHeat, heatPenalty,
  } = await import('../campaign/operations.js');
  const ot = opTuning(content);
  const ops = operationList(content);

  // Content coherence.
  assert.ok(ops.length >= 5, 'there is a board, not a button');
  const TAGS = new Set(Object.values(content.parts).flatMap((p) => p.tags));
  for (const op of ops) {
    assert.ok(op.hours > 0 && op.cooldownHours > 0, `${op.id} has a clock`);
    assert.ok(op.funds[1] > op.funds[0] && op.funds[0] > 0, `${op.id} pays a range`);
    assert.ok(['none', 'optional', 'required'].includes(op.crew), `${op.id} declares its crew rule`);
    assert.ok(op.baseChance > 0 && op.baseChance < 1, `${op.id} is neither free nor impossible`);
    assert.ok(op.success && op.failure && op.blurb, `${op.id} is written, not stubbed`);
    for (const tag of op.demands.tags ?? []) assert.ok(TAGS.has(tag), `${op.id}: no part carries the tag ${tag}`);
    if (op.demands.class) assert.ok(content.classes[op.demands.class], `${op.id}: unknown class`);
    for (const sp of op.livestock?.species ?? []) {
      assert.ok(content.species[sp], `${op.id}: unknown species ${sp}`);
      assert.ok(content.species[sp].mailOrderPrice, `${op.id}: ${sp} must be a real, rearable animal`);
    }
  }

  const lab = (seed = 800, { chimera = null, funds = 300 } = {}) => {
    const s = { ...newGameState(), seed, funds };
    ensureRanchSeeded(s, content, t0);
    s.campaign.lastTickAt = t0;
    s.lastTickAt = t0;
    if (chimera) {
      const slots = {};
      for (const partId of chimera) {
        const id = `t${s.inventory.tokenCount++}`;
        s.inventory.parts.push({ id, partId, grade: 'standard', donor: { name: 'Bessie', species: content.parts[partId].species, stars: 2, extractedAt: 0 } });
        slots[content.parts[partId].slot] = id;
      }
      const res = spliceChimera(s, 'M', slots, content, t0);
      assert.ok(res.ok, res.msg);
      res.chimera.settleUntil = t0;
    }
    return s;
  };
  const GOAT = ['goat_head', 'goat_forelimbs', 'goat_hindlimbs', 'goat_hide', 'goat_organ'];
  const SHARK = ['shark_head', 'shark_forelimbs', 'shark_hindlimbs', 'shark_hide', 'shark_organ'];

  // RULE 1 — something is ALWAYS runnable. No territory, no notoriety, no
  // chimera, no anatomy. This is the floor, and it is the whole point.
  {
    const broke = lab(801, { funds: 0 });
    broke.chimeras = [];
    assert.deepEqual(broke.campaign.heldNodes, [], 'no territory');
    const runnable = ops.filter((op) => !opOdds(broke, op, null, content, t0).blocked);
    assert.ok(runnable.length >= 2, `a player with nothing can still run ${runnable.length} job(s)`);
    for (const op of runnable) {
      const odds = opOdds(broke, op, null, content, t0);
      assert.ok(odds.chance >= 0.4, `${op.id} is worth attempting solo (${odds.chance.toFixed(2)})`);
    }
    const started = startOperation(broke, runnable[0].id, null, content, t0);
    assert.ok(started.ok, started.msg);
    assert.ok(activeOp(broke), 'and it is under way');
  }

  // RULE 2 — failure never costs a creature. You cannot punish a losing
  // player for trying to stop losing.
  {
    let failures = 0;
    for (let seed = 0; seed < 120 && failures < 25; seed++) {
      const s = lab(2000 + seed, { chimera: GOAT });
      const before = s.chimeras.length;
      const stockBefore = s.ranch.stock.length;
      startOperation(s, 'reptile_house', s.chimeras[0].id, content, t0);
      const out = tickOperations(s, content, t0 + 99 * HOUR);
      if (out.result.success) continue;
      failures++;
      assert.equal(s.chimeras.length, before, 'a failed job never loses the creature');
      assert.equal(s.ranch.stock.length, stockBefore, 'nor anything in the pens');
      assert.equal(s.campaign.captives.length, 0, 'and nobody is captured');
      assert.equal(out.result.funds, 0, 'it simply pays nothing');
    }
    assert.ok(failures >= 20, `the sample actually contained failures (${failures})`);
  }

  // RULE 3 — demands improve the odds, they never gate the job. Requiring
  // Aquatic anatomy before you may rob the aquarium that would GIVE you
  // Aquatic anatomy is the same spiral in a smaller hat.
  {
    const plain = lab(803, { chimera: GOAT });
    const swimmer = lab(804, { chimera: SHARK });
    const aquarium = content.operations.aquarium;
    const dry = opOdds(plain, aquarium, plain.chimeras[0], content, t0);
    const wet = opOdds(swimmer, aquarium, swimmer.chimeras[0], content, t0);
    assert.equal(dry.blocked, null, 'a goat may attempt the aquarium');
    assert.ok(dry.chance >= 0.4, `and has a real chance of it (${dry.chance.toFixed(2)})`);
    assert.ok(wet.chance > dry.chance + 0.15, `but the right anatomy is worth having (${dry.chance.toFixed(2)} → ${wet.chance.toFixed(2)})`);
    assert.ok(wet.reasons.some((r) => r.text.includes('Aquatic')), 'and the briefing says why');
    // A job that names a crew still needs one.
    assert.ok(opOdds(plain, aquarium, null, content, t0).blocked, 'somebody has to actually go');
  }

  // RULE 4 — heat is the price, and it is a mechanic rather than a nerf:
  // it only bites the player running jobs back to back.
  {
    const s = lab(805, { chimera: GOAT });
    assert.equal(heatNow(s, content, t0), 0, 'a fresh county is calm');
    const cold = opOdds(s, content.operations.feed_coop, null, content, t0).chance;
    startOperation(s, 'petting_zoo', null, content, t0);
    assert.ok(heatNow(s, content, t0) > 0, 'a job leaves the county twitchy');
    const hot = opOdds(s, content.operations.feed_coop, null, content, t0).chance;
    assert.ok(hot < cold, 'which costs you on the next one');
    // …and it decays in real time, exponentially, so it settles at a level
    // that scales with how hard you are pushing instead of pinning to the
    // cap or draining to nothing (which is what linear decay did).
    const h0 = heatNow(s, content, t0);
    const half = heatNow(s, content, t0 + ot.heatHalfLifeHours * HOUR);
    assert.ok(Math.abs(half - h0 / 2) < 0.5, 'one half-life halves it');
    assert.ok(heatNow(s, content, t0 + 200 * HOUR) < 1, 'and it always goes away eventually');
    assert.ok(heatPenalty(s, content, t0) > 0 && heatPenalty(s, content, t0) <= ot.heatPenalty);
  }

  // The outcome is sealed at LAUNCH. Deciding it at resolution would let a
  // reload reroll a bad job, which is the one thing a timer-based game
  // must never allow.
  {
    const s = lab(806, { chimera: GOAT });
    startOperation(s, 'county_fair', s.chimeras[0].id, content, t0);
    const sealed = structuredClone(activeOp(s).outcome);
    const reloaded = JSON.parse(JSON.stringify(s));
    assert.deepEqual(activeOp(reloaded).outcome, sealed, 'a reload cannot reroll it');
    const a = tickOperations(reloaded, content, t0 + 99 * HOUR).result;
    const b = tickOperations(structuredClone(s), content, t0 + 99 * HOUR).result;
    assert.equal(a.success, b.success);
    assert.equal(a.funds, b.funds);
  }

  // One job at a time, cooldowns hold, and calling one off costs the
  // cooldown but nothing else.
  {
    const s = lab(807, { chimera: GOAT });
    assert.ok(startOperation(s, 'feed_coop', null, content, t0).ok);
    assert.ok(!startOperation(s, 'petting_zoo', null, content, t0).ok, 'one job at a time');
    const funds = s.funds;
    assert.ok(abortOperation(s, content).ok);
    assert.equal(activeOp(s), null);
    assert.equal(s.funds, funds, 'calling it off costs no money');
    assert.equal(s.chimeras.length, 1, 'and no creature');
    assert.ok(!opReady(s, 'feed_coop', t0), 'but the job goes quiet for a while');
    assert.ok(!startOperation(s, 'feed_coop', null, content, t0).ok, 'and refuses to restart');
    assert.ok(opReady(s, 'feed_coop', opCooldownEndsAt(s, 'feed_coop')), 'until the cooldown is up');
  }

  // ACCEPTANCE: a player who never wins a battle can still reach the
  // anatomy the class triangle says they need. Before this board, every
  // Water and Air species sat behind a conquest.
  {
    const gated = Object.values(content.species).filter((sp) => sp.mailOrderPrice && !sp.variantOf);
    const openAtStart = catalogFor(lab(808), content).map((sp) => sp.id);
    assert.deepEqual(openAtStart.sort(), ['goat', 'ram'], 'the catalog really is two species with no territory');

    const reachable = new Set(ops.flatMap((op) => op.livestock?.species ?? []));
    const classOf = (speciesId) =>
      Object.values(content.parts)
        .filter((p) => p.species === speciesId && p.classAffinity)
        .map((p) => p.classAffinity)[0] ?? null;
    for (const cls of ['water', 'air']) {
      const viaJobs = [...reachable].filter((sp) => classOf(sp) === cls);
      assert.ok(viaJobs.length, `${cls} anatomy is reachable without winning a battle (${viaJobs.join(', ')})`);
      assert.ok(
        viaJobs.every((sp) => !openAtStart.includes(sp)),
        `and it is anatomy the catalog would not have sold them`
      );
    }

    // Run it for real: a broke, node-less player with one goat chimera
    // robs the aquarium until something wet turns up.
    const s = lab(809, { chimera: GOAT, funds: 0 });
    let now = t0;
    let got = null;
    for (let i = 0; i < 40 && !got; i++) {
      if (!activeOp(s) && opReady(s, 'aquarium', now)) {
        startOperation(s, 'aquarium', s.chimeras[0].id, content, now);
      }
      now += 6 * HOUR;
      tickCampaign(s, content, now);
      const rep = s.campaign.opReport;
      if (rep?.animal) got = rep.animal;
      s.campaign.opReport = null;
    }
    assert.ok(got, 'the aquarium eventually hands over something');
    assert.ok(content.species[got.species], 'a real animal');
    assert.ok(s.ranch.stock.some((a) => a.id === got.id), 'that is actually in the pens');
    assert.ok(s.funds > 0, 'and they are no longer broke');
    assert.deepEqual(s.campaign.heldNodes, [], 'having won precisely nothing');
    // …and it is breedable stock like any other, which is the point.
    assert.ok(got.genotype && got.potential, 'with the husbandry fields a bred animal has');
  }

  // Conquest must stay the better deal, or this replaces the game instead
  // of supporting it: a job hands you ONE animal, sometimes, on a timer,
  // where holding a node puts the whole species in the catalog to buy.
  {
    const conquered = lab(810);
    conquered.campaign.heldNodes = region.nodes.map((n) => n.id);
    const openNow = catalogFor(conquered, content).map((sp) => sp.id);
    assert.ok(openNow.length > 20, `conquest opens the catalog properly (${openNow.length} species)`);
    const jobSpecies = new Set(ops.flatMap((op) => op.livestock?.species ?? []));
    // Measured over the WHOLE campaign rather than at an arbitrary
    // midpoint: early on the jobs deliberately overlap the catalog, because
    // handing a stuck player the ENTRY animal of each class is the entire
    // reason this board exists. The question that matters is whether
    // conquest still reaches most of the roster, and it does.
    const exclusive = openNow.filter((sp) => !jobSpecies.has(sp));
    assert.ok(
      exclusive.length >= openNow.length * 0.55,
      `and most of the roster is still beyond any job (${exclusive.length}/${openNow.length})`
    );
    // The premium fauna in particular stays behind a conquest: the jobs
    // hand over the ENTRY animal of each class, never the best one.
    const jobPrices = [...jobSpecies].map((sp) => content.species[sp].mailOrderPrice);
    const best = Math.max(...Object.values(content.species).filter((sp) => sp.mailOrderPrice && !sp.variantOf).map((sp) => sp.mailOrderPrice));
    assert.ok(Math.max(...jobPrices) < best * 0.7, `no job reaches the top of the catalog (best stolen $${Math.max(...jobPrices)} vs $${best})`);
  }
}

// Time-warp safety: a lastTickAt in the future never rewinds state.
const warp = freshRanchState();
ensureRanchSeeded(warp, content, t0);
warp.lastTickAt = t0 + 100 * HOUR;
const condBefore = warp.ranch.stock[0].condition;
applyElapsed(warp, content, t0);
assert.equal(warp.ranch.stock[0].condition, condBefore, 'negative elapsed is a no-op');

console.log(`smoke ✓  ${Object.keys(content.parts).length} parts · ${Object.keys(content.frames).length} frames · ${Object.keys(content.species).length} species · ${Object.keys(content.enemies).length} enemy units · ${Object.keys(content.rivals).length} rivals · save v${SAVE_VERSION} · M1 care: ${Math.round(cared.condition)} vs ${Math.round(neglected.condition)} · M2 grades: ${resA.grade.id}/${resB.grade.id} · M4 battle: ${runA.outcome} in ${runA.turn} turns, obedience ignores ${ignores}/60`);
