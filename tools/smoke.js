// Headless smoke test: proves the renderer runs DOM-free in Node (the same
// requirement the M4.5 balance harness will lean on) and that all content
// data is coherent. Run: node tools/smoke.js

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import { indexContent, renderCreatureSVG, validateGenome, SLOTS } from '../render/renderer.js';
import { rngStream } from '../util/rng.js';
import { newGameState, migrate, SAVE_VERSION } from '../save/save.js';
import {
  createAnimal, ageStage, conditionTier, applyElapsed, careAction,
  careStatus, buyMailOrder, buyPenUpgrade, ensureRanchSeeded, stockGenome,
  CARE_ACTIONS, TUNING,
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

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const content = indexContent({
  frames: readJSON('data/frames.json'),
  parts: readJSON('data/parts.json'),
  species: readJSON('data/species.json'),
  combos: readJSON('data/combos.json'),
  enemies: readJSON('data/enemies.json'),
  keywords: readJSON('data/keywords.json'),
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
assert.deepEqual(migrated.ranch, { stock: [], penCapacity: 4, animalCount: 0, seeded: false });
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
assert.ok(!buyMailOrder(econ, 'bear', content, t0).ok, 'bears are conquest-only');
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
const heavyS = [tk('bear_head'), tk('eagle_forelimbs'), tk('bear_hide'), tk('bear_hindlimbs')];
const heavyApex = [tk('bear_head'), tk('eagle_forelimbs', 'apex'), tk('bear_hide'), tk('bear_hindlimbs')];
assert.ok(!analyze('S', heavyS, content).flight.capable && analyze('S', heavyApex, content).flight.capable,
  'apex wings out-lift standard wings');

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
const prioFighter = makeChimera(prioState, 'L', { goat_forelimbs: 'standard', goat_head: 'standard', bear_hide: 'standard' }, t0);
const pb = createBattle([prioFighter], content.encounters.patrol_2, content, 31, prioFighter.settleUntil);
playerActive(pb).speed = 1; // slower than everything
const trample = playerActions(pb).find((a) => a.label === 'Trample Tap');
const evs = step(pb, trample, content);
const myLine = evs.findIndex((e) => e.includes('Trample Tap'));
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
  let guard = 0;
  while (!b.over && guard++ < 400) {
    const acts = playerActions(b);
    const best = acts.filter((a) => a.type === 'move')
      .sort((x, y) => playerActive(b).moves[y.index].power - playerActive(b).moves[x.index].power)[0] ?? acts[0];
    step(b, best, content);
  }
  return { s, b, now2 };
}
const bossRun = grind('boss_clampdown', 12345);
assert.ok(bossRun.b.over, 'boss battle terminates');
assert.ok(bossRun.b.log.some((l) => l.includes('ACTIVATE THE 9000')), 'boss transforms mid-fight');
if (bossRun.b.outcome === 'win') {
  assert.ok(bossRun.b.log.some((l) => l.includes('bouncy castle')), 'stage two retires gleefully');
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

// --- v1 → v5 chain.
const m5 = migrate(structuredClone(v1Save));
assert.equal(m5.saveVersion, SAVE_VERSION);
assert.equal(m5.battle, null);
assert.deepEqual(m5.warRecord, { wins: 0, losses: 0 });

// Time-warp safety: a lastTickAt in the future never rewinds state.
const warp = freshRanchState();
ensureRanchSeeded(warp, content, t0);
warp.lastTickAt = t0 + 100 * HOUR;
const condBefore = warp.ranch.stock[0].condition;
applyElapsed(warp, content, t0);
assert.equal(warp.ranch.stock[0].condition, condBefore, 'negative elapsed is a no-op');

console.log(`smoke ✓  ${Object.keys(content.parts).length} parts · ${Object.keys(content.frames).length} frames · ${Object.keys(content.species).length} species · ${Object.keys(content.enemies).length} enemy units · save v${SAVE_VERSION} · M1 care: ${Math.round(cared.condition)} vs ${Math.round(neglected.condition)} · M2 grades: ${resA.grade.id}/${resB.grade.id} · M4 battle: ${runA.outcome} in ${runA.turn} turns, obedience ignores ${ignores}/60`);
