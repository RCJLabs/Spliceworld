// Headless smoke test: proves the renderer runs DOM-free in Node (the same
// requirement the M4.5 balance harness will lean on) and that all content
// data is coherent. Run: node tools/smoke.js

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import { indexContent, renderCreatureSVG, validateGenome, SLOTS, SOCKETS, slotOfSocket } from '../render/renderer.js';
import { rngStream, hashString } from '../util/rng.js';
import { newGameState, migrate, SAVE_VERSION } from '../save/save.js';
import {
  createAnimal, ageStage, conditionTier, applyElapsed, careAction,
  careStatus, buyMailOrder, buyPenUpgrade, ensureRanchSeeded, stockGenome,
  CARE_ACTIONS, TUNING, STATS, faunaUnlocked, catalogFor, upkeepPerDay, chimeraUpkeep,
} from '../ranch/ranch.js';
import {
  GRADES, GRADE_INDEX, gradeFor, avgStars, extractAnimal,
} from '../splice/extract.js';
import { analyze } from '../splice/physiology.js';
import { spliceChimera, validateSplice, isSettled, chimeraGenome } from '../splice/theater.js';
import {
  combatantFromChimera, combatantFromUnit, createBattle, step, finishBattle,
  playerActions, playerActive, tagMultiplier, isInjured, turnForecast, tierScaleFor,
  movesFromTokens, previewMove,
} from '../battle/engine.js';
import {
  runSim, plantBrokenCombo, makeSimChimera, scriptedBattle, loadSimContent,
  regionBench, ARCHETYPES, facilityPayback, labAt, scoutedBy, fightRival,
  ladderBench, ladderRate, STARTER_BUILD, partsOnFrame,
} from './sim.js';
import { skillFor, RIVAL_SKILL, chooseMoveIndex } from '../battle/ai.js';
import {
  nodeStates, threatGen, threatLadder, regionStates, regionBlockers, regionOpen, nodeById,
  incomePerDay, incomeSuspended, regionBonusPerDay, regionComplete,
  tickCampaign, resolveBattle, salvageUnit,
} from '../campaign/campaign.js';
import { canBreed, breedPair, hatchEgg, expressedTraits, BREEDING, pairingForecast } from '../ranch/breeding.js';
import { trainChimera, TRAINING } from '../splice/theater.js';
import { obediencePercent, obedienceIgnoreChance } from '../battle/engine.js';
import {
  onboardingSteps, onboardingActive, guideStates, guideForScreen, dismissGuide, GUIDE_HELPERS,
  STABLE, pathOwnsScreen,
} from '../ranch/onboarding.js';
import { isOpen } from '../ui/cards.js';
import { forecast } from '../battle/forecast.js';
import {
  rivalDossier, rivalTeam, rivalRecord, scoutStable, counterTier, rivalEncounter,
} from '../campaign/rivals.js';
import { classMultiplier } from '../battle/engine.js';
import { overflowingParts } from './bounds.js';
import { renderDexScreen } from '../splice/dex-ui.js';
import { moveReadout } from '../battle/readout.js';
import { defaultMoveset } from '../battle/moves.js';

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
  chaos: readJSON('data/chaos.json'),
  temperament: readJSON('data/temperament.json'),
  scars: readJSON('data/scars.json'),
  guides: readJSON('data/guides.json'),
  resequencer: readJSON('data/resequencer.json'),
});

// --- Content coherence: every part references a real species + slot.
for (const part of Object.values(content.parts)) {
  assert.ok(content.species[part.species], `${part.id}: unknown species ${part.species}`);
  assert.ok(SLOTS.includes(part.slot), `${part.id}: unknown slot ${part.slot}`);
}
// A9: a frame may declare which slot types its geometry supports, so the
// invariant is no longer "every frame has every socket" — it is that a
// frame's geometry and its declaration agree in both directions. A frame
// that declares nothing supports everything, which is every frame that
// predates the Kite.
const GEOMETRY_SOCKETS = {
  head: ['head'],
  forelimbs: ['forelimb_near', 'forelimb_far'],
  hindlimbs: ['hindlimb_near', 'hindlimb_far'],
  tail: ['tail'],
  organ: ['organ'],
  hide: [], // draws in torso space; no socket of its own
};
for (const frame of Object.values(content.frames)) {
  const supported = frame.slots ?? SLOTS;
  for (const slot of supported) {
    for (const name of GEOMETRY_SOCKETS[slot] ?? []) {
      assert.ok(frame.sockets[name], `frame ${frame.id} supports ${slot} but has no ${name} socket`);
    }
  }
  // ...and nothing drawn that the frame says it does not have, or the
  // renderer puts a part somewhere the Theater would never let you bolt one.
  for (const name of Object.keys(frame.sockets)) {
    const slot = name.replace(/_(near|far)$/, 's').replace(/\d+$/, '');
    assert.ok(supported.includes(slot),
      `frame ${frame.id} draws a ${name} socket but does not support ${slot}`);
  }
  assert.ok(frame.sockets.head, `frame ${frame.id}: a head is mandatory, company policy`);
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
// R30 split these two questions apart, and they were always two questions:
// what ANATOMY grants, and which four of them the creature can press. This
// block is about the former — `combatantFromChimera` now fields a moveset,
// and on this build Venom Fang honestly loses its slot to Injection, the
// stronger Venomous combo built out of the same head.
const granted = movesFromTokens(
  Object.values(fighter.tokens),
  analyze(fighter.frame, Object.values(fighter.tokens), content),
  content
);
assert.ok(granted.some((m) => m.name === 'Venom Fang'), 'head grants its move');
assert.ok(granted.some((m) => m.name === 'Injection'), 'combo grants its move');
assert.ok(!granted.some((m) => m.name === 'Thick Fur'), 'passive hide grants no move');
assert.equal(cb.moves.length, 4, 'and it fights with four of them');
const apexFang = granted.find((m) => m.name === 'Venom Fang');
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

// --- R24: a dozen genes, each paying for what it gives.
//
// The allele machinery was generic from M6 and exactly one trait used it, so
// Mendel had nothing to be Mendel about. Two things were also quietly wrong:
// traits entered the pool ONLY through conception mutations, so a dozen of
// them would each surface about once in two hundred eggs; and the balance
// harness never loaded traits.json at all, so a gene could not be measured.
{
  const traits = Object.values(content.traits);
  assert.ok(traits.length >= 10, `a gene pool needs genes, got ${traits.length}`);

  // THE DESIGN RULE, asserted rather than remembered: every trait pays for
  // what it gives. A gene that is pure upside is a stat stick with a name on.
  for (const t of traits) {
    const bonuses = Object.values(t.statBonus ?? {});
    assert.ok(bonuses.some((v) => v > 0) || t.moveKeywords,
      `${t.id} gives nothing`);
    assert.ok(bonuses.some((v) => v < 0),
      `${t.id} costs nothing — every trait pays for what it gives`);
  }

  // Circulating genes have to actually circulate, or the Splice-Dex reads
  // ??? forever and breeding for one is impossible.
  const farm = { ...newGameState(), seed: 4242 };
  farm.ranch = { stock: [], penCapacity: 999, animalCount: 0, seeded: false, eggs: [], eggCount: 0 };
  const carriers = {};
  for (let i = 0; i < 400; i++) {
    for (const [id, n] of Object.entries(createAnimal(farm, 'goat', content, t0).genotype)) {
      if (n > 0) carriers[id] = (carriers[id] ?? 0) + 1;
    }
  }
  for (const t of traits) {
    // The two routes into the gene pool are exclusive: a gene is either out
    // there to be found or it arrives as a mutation. Both at once means the
    // "mutation only" label is a lie on the Splice-Dex.
    assert.ok(!(t.mutationOnly && t.wildChance),
      `${t.id} is mutationOnly and also seeded into wild stock — pick one`);
    if (t.wildChance) {
      assert.ok(carriers[t.id] > 0,
        `${t.id} has a wildChance but never turned up in 400 head of stock`);
    } else {
      assert.ok(!carriers[t.id],
        `${t.id} is mutationOnly and must not be sitting in mail-order stock`);
    }
  }

  // THE CRITERION: the difference shows in a fight. Same build, same grade,
  // one gene apart, on a contested matchup — a saturated one shows nothing,
  // which is why checkpoint (94% either way) was the wrong bench.
  const PARTS = ['bear_head','bear_forelimbs','bear_hindlimbs','bear_tail','bear_hide','bear_organ'];
  const fight = (traitId) => {
    const hero = makeSimChimera('M', PARTS, 'standard', content);
    if (traitId) {
      for (const tok of Object.values(hero.tokens)) {
        if (content.traits[traitId].slots.includes(content.parts[tok.partId].slot)) tok.traits = [traitId];
      }
    }
    let wins = 0;
    for (let i = 0; i < 80; i++) {
      const b = createBattle([hero, { ...hero, id: 'a', name: 'A' }, { ...hero, id: 'b', name: 'B' }],
        content.encounters.air_patrol, content, hashString(`t24${traitId}${i}`), 0);
      let g = 0;
      while (!b.over && g++ < 300) {
        const acts = playerActions(b);
        if (!acts.length) break;
        const me = playerActive(b);
        const idx = chooseMoveIndex(b, me, b.enemy.active, content, 1, () => rngStream(b.seed, 'p', b.rollCount++)());
        const act = (idx >= 0 && acts.find((a) => a.type === 'move' && a.index === idx))
          || acts.find((a) => a.type === 'rest') || acts[0];
        step(b, act, content);
      }
      if (b.outcome === 'win') wins++;
    }
    return wins / 80;
  };
  const plain = fight(null);
  const gene = fight('venom_gland');
  assert.ok(Math.abs(gene - plain) >= 0.10,
    `a gene must show in a fight: ${(plain * 100).toFixed(0)}% plain vs ${(gene * 100).toFixed(0)}% with a Venom Gland`);

  // And the harness must be able to SEE traits, which for four sessions it
  // could not — tools/sim.js never loaded traits.json, so every measurement
  // above would have quietly compared a build against itself.
  assert.ok(Object.keys(loadSimContent().traits ?? {}).length === traits.length,
    'the balance harness must load the same gene pool the game does');
}

// --- R23: two of six sockets used to contribute nothing to play.
//
// Every hide was a passive stat stick (0 of 32 carried a move) and most
// organs were too, and the passive ones were NOT compensated with better
// stats — 21.3 against 22.1 for the active ones. It was an omission, not a
// trade-off.
{
  for (const slot of ['hide', 'organ']) {
    const dead = Object.values(content.parts).filter((p) => p.slot === slot && !p.move);
    assert.deepEqual(dead.map((p) => p.id), [],
      `every ${slot} must do something on a turn — these are still stat sticks: ${dead.map((p) => p.id).join(', ')}`);
  }

  // And they have to be worth the TURN, which is the part that took three
  // attempts. Pressed is not the same as useful: the first pricing was
  // pressed constantly and cost 10.8pp on contested fights, because a turn
  // not attacking is worth about fifty damage and the effects returned far
  // less. Measured with the build's own hide and organ actives stripped out.
  const armoured = makeSimChimera('M',
    ['tortoise_head','tortoise_forelimbs','tortoise_hindlimbs','tortoise_tail','tortoise_hide','tortoise_organ'],
    'standard', content);
  // R30: makeSimChimera stamps the BENCH moveset, which is attack-led on
  // purpose — A8's floor and R26's margins are statements about the content,
  // so the harness fields what a tuned player brings. This test is about
  // something else: whether a hide and an organ change a fight. Its subject
  // is the actives, so it has to field them. That is the default pick, which
  // for a tortoise (three untagged attacks, three actives) keeps one swing
  // and all three actives — 78% here against 0% for the attack-led loadout,
  // which is the finding R30 was nearly shipped without.
  {
    const tk = Object.values(armoured.tokens);
    armoured.moveset = defaultMoveset(
      movesFromTokens(tk, analyze(armoured.frame, tk, content), content)
    );
  }
  const winRate = (strip) => {
    let wins = 0;
    for (let i = 0; i < 60; i++) {
      const b = createBattle([armoured, { ...armoured, id: 'a', name: 'A' }, { ...armoured, id: 'b', name: 'B' }],
        content.encounters.patrol_2, content, hashString(`r23${i}`), 0);
      if (strip) for (const c of b.player.team) c.moves = c.moves.filter((m) => m.power > 0);
      let g = 0;
      while (!b.over && g++ < 300) {
        const acts = playerActions(b);
        if (!acts.length) break;
        const me = playerActive(b);
        const idx = chooseMoveIndex(b, me, b.enemy.active, content, 1, () => rngStream(b.seed, 'p', b.rollCount++)());
        const act = (idx >= 0 && acts.find((a) => a.type === 'move' && a.index === idx))
          || acts.find((a) => a.type === 'rest') || acts[0];
        step(b, act, content);
      }
      if (b.outcome === 'win') wins++;
    }
    return wins / 60;
  };
  const withActives = winRate(false);
  const without = winRate(true);
  assert.ok(withActives - without >= 0.25,
    `a hide and an organ must change how a fight is played: ${(without * 100).toFixed(0)}% without them, ` +
      `${(withActives * 100).toFixed(0)}% with — a ${((withActives - without) * 100).toFixed(0)}pp difference`);

  // Nor may an archetype be decoration — R20's rule, applied to the actives
  // rather than the keywords under them.
  //
  // A3 replaced the three-build sample this used to run on. That sample was
  // sitting on exactly its own threshold: it saw two archetypes, needed two,
  // and which two it saw depended on the seed string and on whether a
  // build's kick happened to whiff. Untagging the non-Ground hindlimbs moved
  // one build off a whiff and onto its kick, and the guard went red without
  // anything about the actives having changed. It now sweeps the WHOLE pool
  // at both grades — 40 species, 0.3s — which is both a stronger guard and a
  // stable one.
  const NOUNS = ['Bristles', 'Vanish', 'Slipskin', 'Screen', 'Slow Mend', 'Knit', 'Leech', 'Focus', 'Surge', 'Spike'];
  const pressed = new Map();
  for (const speciesId of new Set(Object.values(content.parts).filter((p) => p.species !== 'salvage').map((p) => p.species))) {
    const partIds = SLOTS.map((sl) => `${speciesId}_${sl}`).filter((id) => content.parts[id]);
    if (partIds.length < 4) continue;
    for (const [grade, encId] of [['standard', 'patrol_2'], ['standard', 'checkpoint'], ['standard', 'harbor_watch'],
      ['apex', 'patrol_2'], ['apex', 'checkpoint'], ['apex', 'harbor_watch']]) {
      const hero = makeSimChimera('M', partIds, grade, content);
      // R30: the question here is whether an active is worth PRESSING when a
      // creature carries it — so the creature has to carry it. The bench
      // moveset is attack-led by design (it measures the content, not the
      // picker), which would field none of these and turn this gate into a
      // tautology about slot allocation. The default pick is what a player
      // is handed, and it keeps the actives worth having.
      {
        const tk = Object.values(hero.tokens);
        hero.moveset = defaultMoveset(movesFromTokens(tk, analyze('M', tk, content), content));
      }
      const b = createBattle([hero, { ...hero, id: 'a', name: 'A' }], content.encounters[encId], content, hashString(`arch${speciesId}${encId}${grade}`), 0);
      let g = 0;
      while (!b.over && g++ < 200) {
        const acts = playerActions(b);
        if (!acts.length) break;
        const me = playerActive(b);
        const idx = chooseMoveIndex(b, me, b.enemy.active, content, 1, () => rngStream(b.seed, 'p', b.rollCount++)());
        const act = (idx >= 0 && acts.find((a) => a.type === 'move' && a.index === idx))
          || acts.find((a) => a.type === 'rest') || acts[0];
        if (act.type === 'move') {
          const name = me.moves[act.index].name;
          for (const n of NOUNS) if (name.endsWith(n)) pressed.set(n, (pressed.get(n) ?? 0) + 1);
        }
        step(b, act, content);
      }
    }
  }
  const tally = [...pressed.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' ');
  assert.ok(pressed.size >= 5, `hide and organ actives must actually get pressed — only ${pressed.size} archetypes ever were (${tally || 'none'})`);
  assert.ok([...pressed.values()].reduce((a, b) => a + b, 0) >= 40,
    `and pressed often enough to be a real button, not a rounding error (${tally})`);
  // KNOWN GAP, not a regression: the AI never presses the three evasion
  // actives (Slipskin, Vanish, Screen) or, since A3 stopped its kick
  // whiffing, Focus. They are priced as turns spent not attacking, and
  // chooseMoveIndex values damage. That is an AI/pricing problem for its own
  // phase — the floor here is set below it deliberately so it stays visible
  // rather than being asserted away.
}

// --- R28: the number on the button is the number that lands.
//
// The audit that queued this was too strong again — the UI already drew class
// chips on both fighters and an effectiveness multiplier. What it did NOT do
// was use previewMove: the button printed `move.power`, the raw data value,
// which is not what arrives once armor, stages, scars, perks, guard, Frenzy,
// Rage and Multi-Hit have had their say. A 52-power swing into 22 armor is
// not a 52, and a readout that lies is worse than no readout.
{
  const reader = makeSimChimera('M', ['bear_head','bear_forelimbs','bear_hindlimbs','bear_tail','bear_hide','bear_organ'], 'apex', content);
  const plated = {
    id: 'platedog', name: 'Plate Dog', class: null, hp: 999999, power: 1, armor: 24, speed: 1,
    stamina: 999, regen: 99, tags: ['Organic'], koLine: 'The Plate Dog clanks off.',
    moves: [{ name: 'Nudge', power: 1, cost: 1, acc: 100, tags: [], keywords: {} }],
    shapes: [{ type: 'circle', cx: 0, cy: 0, r: 40, fill: '#888888' }],
  };
  const rContent = { ...content, enemies: { ...content.enemies, platedog: plated } };
  const b = createBattle([reader], { id: 'ro', name: 'Readout', waves: ['platedog'], reward: 0 },
    rContent, 909, reader.settleUntil);
  const me = playerActive(b), foe = b.enemy.active;
  // A PLAIN swing: this bench compares the button's promise against what
  // the engine actually deals over 120 presses, so anything that changes
  // damage per press or ends the fight early is noise. Recoil joined the
  // exclusions in R30 — the bear's four now lead with Haymaker (99 power,
  // 20% recoil), which kills the reader in five swings and left the sample
  // at 5 instead of 40.
  const plain = (m) => m.power > 0 && !Object.keys(m.keywords ?? {}).length;
  const move = me.moves.find(plain)
    ?? me.moves.find((m) => m.power > 0 && !m.keywords.multiHit && !m.keywords.frenzy && !m.keywords.recoil);
  const idx = me.moves.indexOf(move);
  const shown = moveReadout(move, me, foe, rContent);

  // The button must not simply be echoing the data value back.
  assert.ok(Math.abs(shown.damage - move.power) > 4,
    `against 24 armor the readout must differ from the listed power — showed ${shown.damage} for a ${move.power}-power move`);

  let total = 0, swings = 0;
  for (let i = 0; i < 120 && !b.over; i++) {
    const before = b.enemy.active.hp;
    playerActive(b).stamina = playerActive(b).staminaMax;
    step(b, { type: 'move', index: idx }, rContent);
    const dealt = before - b.enemy.active.hp;
    if (dealt > 0) { total += dealt; swings++; }
  }
  const actual = total / Math.max(1, swings);
  assert.ok(swings >= 40, `the readout bench needs a real sample, got ${swings}`);
  assert.ok(Math.abs(actual - shown.damage) / shown.damage < 0.08,
    `the button promised ~${shown.damage} and the engine dealt ${actual.toFixed(1)} over ${swings} swings`);

  // Two numbers on one line need a separator, or they read as a third
  // number: "~84" beside "95%" rendered as "8495%" the first time, and a
  // regex looking for /~\d+/ matched it perfectly happily.
  assert.ok(shown.hitChance >= 0 && shown.hitChance <= 100, 'hit chance is a percentage');
  const line = `~${shown.damage}${shown.hitChance < 100 ? `(${shown.hitChance}%)` : ''}`;
  assert.ok(!/^~\d{4,}/.test(line),
    `damage and accuracy must not run together into one number: "${line}"`);

  // THE CRITERION: super-effective has to be predictable BEFORE pressing, and
  // legible as to why. The old chip multiplied class and tag into one number,
  // so "×1.5" never said which of the two it was — the half a new player is
  // actually trying to learn.
  const air = makeSimChimera('S', ['eagle_head','eagle_forelimbs','eagle_hindlimbs','eagle_tail','eagle_hide','eagle_organ'], 'standard', content);
  const ground = combatantFromUnit(content.enemies.riot_squad);
  const airMe = combatantFromChimera(air, content, air.settleUntil);
  const adv = moveReadout(airMe.moves.find((m) => m.power > 0), airMe, ground, content);
  assert.ok(adv.classMult > 1, 'Air into Ground is the advantage the triangle promises');
  assert.ok(adv.chips.some(([kind, text]) => kind === 'up' && text.includes(content.classes.air.name)),
    `the advantage must be named on the button, not merged into a bare number: ${JSON.stringify(adv.chips)}`);

  // And an immunity has to read as one rather than as a small number.
  const flyer = combatantFromUnit(content.enemies.falconry_unit);
  const groundMove = airMe.moves.find((m) => m.tags.includes('Ground'));
  if (groundMove) {
    const none = moveReadout(groundMove, airMe, flyer, content);
    assert.ok(none.immune && none.damage === null,
      'a Ground move into an Airborne target must read as no effect, not as a number');
  }
}

// --- R21: everything the game announces is findable again afterwards.
//
// The audit that queued this phase was WRONG about its headline: combos are
// persisted, in `state.discoveredCombos` since the v4 migration, and the dex
// has always drawn them. Grepping for `dex.combos` and stopping there is how
// a non-bug gets scheduled. What was genuinely missing: rivals kept a full
// record — defeats, losses, when you last met — and had no page anywhere you
// could go back to, and lineage stopped at one generation.
//
// So the rule is stated once, over the RENDERED dex rather than the fields
// behind it: a discovery the player was told about has to still be there.
{
  const lab = { ...newGameState(), seed: 4321 };
  // One of each announceable discovery.
  lab.discoveredCombos = ['pack_hunt'];
  lab.dex.parts = ['wolf_organ', 'riot_plating'];
  lab.dex.enemies = ['riot_squad'];
  lab.dex.traits = ['dense_bones'];
  lab.dex.variants = ['alpine_ram'];
  lab.campaign.rivals = { mantissa: { defeats: 2, losses: 1, lastMetAt: t0 } };

  const root = { innerHTML: '' }; // the dex renders to a string; no DOM needed
  renderDexScreen(root, { state: lab, content });
  const page = root.innerHTML;

  const FINDABLE = [
    ['a discovered combo', content.combos.pack_hunt.name],
    ['a met enemy', content.enemies.riot_squad.name],
    ['a bred variant', content.species.alpine_ram.name],
    ['a known trait gene', content.traits.dense_bones.name],
    ['a rival you have fought', content.rivals.mantissa.name],
    ["that rival's record", '2 graduated'],
  ];
  for (const [what, needle] of FINDABLE) {
    assert.ok(page.includes(needle),
      `${what} must still be findable in the Splice-Dex — no sign of "${needle}"`);
  }
  // And the other half: a rival never met is a rumour, not a spoiler.
  assert.ok(!page.includes(content.rivals.aloft.name),
    'a rival you have never met must not be named in the dex');
  assert.ok(page.includes('???'), 'undiscovered entries still read as bait');
}

// --- R21: lineage keeps two generations, and cannot keep three.
{
  const farm = breedLab(909);
  const pair = (a, b, when) => {
    const res = breedPair(farm, a.id, b.id, content, when);
    assert.ok(res.ok, res.msg);
    const hatched = hatchEgg(farm, res.egg.id, content, res.egg.hatchAt);
    assert.ok(hatched.ok, hatched.msg);
    return hatched.hatchling;
  };
  const g1a = stockAnimal(farm, 'goat', 'M', 4, 900, 'g1a');
  const g1b = stockAnimal(farm, 'goat', 'F', 4, 900, 'g1b');
  const g2 = pair(g1a, g1b, t0);
  const mate = stockAnimal(farm, 'goat', 'F', 4, 900, 'mate');
  g2.sex = 'M';                  // hatchling sex is a coin flip; pin it
  g2.birthAt = t0 - 900 * HOUR;  // and grown enough to breed
  const g3 = pair(g2, mate, t0 + HOUR);

  assert.ok(g3.parents.sire.name && g3.parents.dam.name, 'a child knows its parents');
  const grandparents = [g3.parents.sire, g3.parents.dam].flatMap((s) => [s.sire, s.dam]).filter(Boolean);
  assert.ok(grandparents.length >= 2, `the tree reaches grandparents, got ${grandparents.length}`);
  assert.ok(grandparents.some((gp) => gp.name === g1a.name || gp.name === g1b.name),
    'and they are the right ones');
  // THE CAP, and it is structural rather than a rule to remember: a
  // grandparent is copied as name and stars only, so there is nowhere for a
  // great-grandparent to live. An unbounded tree doubles every generation in
  // a save that is never reset.
  for (const gp of grandparents) {
    assert.deepEqual(Object.keys(gp).sort(), ['name', 'stars'],
      `lineage must stop at two generations — a grandparent carried ${Object.keys(gp).join(', ')}`);
  }
}

// --- R22: the opposition thinks, and thinking is worth something.
//
// The old chooser was a coin flip with a 75% lean toward damage: no
// targeting, no finishing, no reading the chart. The claim this phase makes
// is that the policy PLAYS BETTER, so the test is a head-to-head — the same
// units, the same hero, the same seeds, the dial at 0 against the dial at 1.
// Anything less measures that the code runs, not that it is any good.
{
  const HERO = {
    bear: ['bear_head','bear_forelimbs','bear_hindlimbs','bear_tail','bear_hide','bear_organ'],
    shark: ['shark_head','shark_forelimbs','shark_hindlimbs','shark_tail','shark_hide','shark_organ'],
  };
  // CONTESTED pairs only. Most matchups are 100% either way at apex, and a
  // cell that is already decided cannot show a difference in play — averaging
  // them in just buries the signal under fights nobody could lose.
  const DUELS = [
    ['boss_clampdown', 'bear'], ['boss_clampdown', 'shark'],
    ['military_response', 'bear'], ['air_patrol', 'bear'],
  ];
  const playerWinRate = (hero, encId, skill, n, tag) => {
    let wins = 0;
    for (let i = 0; i < n; i++) {
      const b = createBattle([hero, { ...hero, id: 'a', name: 'A' }, { ...hero, id: 'b', name: 'B' }],
        content.encounters[encId], content, hashString(`aiskill${tag}${i}`), 0);
      b.aiSkill = skill;
      let g = 0;
      while (!b.over && g++ < 300) {
        const acts = playerActions(b);
        const mv = acts.filter((a) => a.type === 'move')
          .sort((x, y) => playerActive(b).moves[y.index].power - playerActive(b).moves[x.index].power)[0]
          ?? acts.find((a) => a.type === 'rest') ?? acts[0];
        if (!mv) break;
        step(b, mv, content);
      }
      if (b.outcome === 'win') wins++;
    }
    return wins / n;
  };
  let gain = 0;
  const detail = [];
  for (const [encId, heroName] of DUELS) {
    const hero = makeSimChimera('M', HERO[heroName], 'apex', content);
    const dumb = playerWinRate(hero, encId, 0, 150, `${encId}${heroName}`);
    const sharp = playerWinRate(hero, encId, 1, 150, `${encId}${heroName}`);
    gain += dumb - sharp;
    detail.push(`${encId}/${heroName} ${(dumb * 100).toFixed(0)}% → ${(sharp * 100).toFixed(0)}%`);
  }
  const mean = gain / DUELS.length;
  // Measured at ~10pp per contested cell. The bar sits at 4pp: four cells at
  // 150 samples put the standard error of the mean near 2.5pp, so this is
  // clear of noise without being a restatement of one lucky matchup. An
  // earlier 60-sample read of a single cell showed the policy LOSING by 5pp
  // and flipped to +9pp at 400 — one cell at small N proves nothing.
  assert.ok(mean >= 0.04,
    `the policy must beat the coin flip by a real margin — mean ${(mean * 100).toFixed(1)}pp: ${detail.join('; ')}`);

  // The pilot is a YARDSTICK, and a yardstick that wastes turns measures the
  // wrong thing. The first draft of the policy scored a capped evasion buff
  // above resting, so on a fragile Air build it chain-cast a 10-stamina buff
  // it could still afford instead of resting toward the 20-stamina attack it
  // could not — 545 presses across 80 fights, and a 51% win rate became 0%.
  // Whatever else the policy does, it must not lose to the naive rule it
  // replaced.
  {
    const flier = makeSimChimera('S', ['eagle_head','eagle_forelimbs','eagle_hindlimbs','eagle_tail','eagle_hide','eagle_organ'], 'standard', content);
    const fly = (usePolicy) => {
      let wins = 0;
      for (let i = 0; i < 60; i++) {
        const b = createBattle([flier, { ...flier, id: 'a', name: 'A' }, { ...flier, id: 'b', name: 'B' }],
          content.encounters.patrol_2, content, hashString(`pilot${i}`), 0);
        b.aiSkill = 0; // the pilot is what is under test, not the opposition
        let g = 0;
        while (!b.over && g++ < 300) {
          const acts = playerActions(b);
          if (!acts.length) break;
          const me = playerActive(b);
          let act;
          if (usePolicy) {
            const idx = chooseMoveIndex(b, me, b.enemy.active, content, 1, () => rngStream(b.seed, 'p', b.rollCount++)());
            act = (idx >= 0 && acts.find((a) => a.type === 'move' && a.index === idx))
              || acts.find((a) => a.type === 'rest') || acts[0];
          } else {
            const mv = acts.filter((a) => a.type === 'move').sort((x, y) => me.moves[y.index].power - me.moves[x.index].power)[0];
            act = (mv && me.moves[mv.index].power > 0) ? mv : (acts.find((a) => a.type === 'rest') ?? acts[0]);
          }
          step(b, act, content);
        }
        if (b.outcome === 'win') wins++;
      }
      return wins / 60;
    };
    const greedy = fly(false);
    const policy = fly(true);
    assert.ok(policy >= greedy,
      `the policy pilot must not be worse than the greedy rule it replaced: greedy ${(greedy * 100).toFixed(0)}%, policy ${(policy * 100).toFixed(0)}%`);
  }

  // The dial is the difficulty curve's new dimension, and it comes from tier
  // rather than new data. A beat cop must not fight like a response team.
  assert.ok(skillFor(content.encounters.patrol_1) < skillFor(content.encounters.military_response),
    'a tier-1 patrol plays worse than a tier-5 response');
  assert.equal(skillFor({ rivalId: 'mantissa' }), RIVAL_SKILL, 'a rival brings its A game');

  // previewMove is the shared source of truth — the AI chooses on it and the
  // battle UI will explain with it (R28) — so it has to agree with what
  // attack() actually does, or both of them are confidently wrong.
  {
    const pvHero = makeSimChimera('M', HERO.shark, 'apex', content);
    // A dummy that never guards and never dies: guard halves a hit, so a
    // target that braces turns this into a measurement of when it braced.
    const still = {
      // Heavily plated on purpose: the armor term is the easiest half of the
      // formula to drop, and at armor 7 the difference hides inside the
      // tolerance. At 22 it does not.
      id: 'pvdummy', name: 'Sandbag', class: null, hp: 999999, power: 1, armor: 22, speed: 1,
      stamina: 999, regen: 99, tags: ['Organic'], koLine: 'The Sandbag sags.',
      moves: [{ name: 'Nudge', power: 1, cost: 1, acc: 100, tags: [], keywords: {} }],
      shapes: [{ type: 'circle', cx: 0, cy: 0, r: 40, fill: '#888888' }],
    };
    const pvContent = { ...content, enemies: { ...content.enemies, pvdummy: still } };
    const b = createBattle([pvHero], { id: 'pv', name: 'Preview', waves: ['pvdummy'], reward: 0 },
      pvContent, 5150, pvHero.settleUntil);
    const move = playerActive(b).moves.find((m) => m.power > 0 && !m.keywords.multiHit && !m.keywords.frenzy);
    const idx = playerActive(b).moves.indexOf(move);
    const predicted = previewMove(playerActive(b), b.enemy.active, move, pvContent).damage;
    let total = 0, swings = 0;
    for (let i = 0; i < 120 && !b.over; i++) {
      const before = b.enemy.active.hp;
      playerActive(b).stamina = playerActive(b).staminaMax;
      step(b, { type: 'move', index: idx }, pvContent);
      const dealt = before - b.enemy.active.hp;
      if (dealt > 0) { total += dealt; swings++; }
    }
    const actual = total / Math.max(1, swings);
    assert.ok(swings >= 40, `the preview bench needs a real sample, got ${swings} swings`);
    // The engine rolls +/-10% variance per swing; over 40+ swings the mean
    // lands well inside 8%.
    assert.ok(Math.abs(actual - predicted) / predicted < 0.08,
      `previewMove must match the engine: predicted ${predicted.toFixed(1)}, engine dealt ${actual.toFixed(1)} over ${swings} swings`);
  }
}

// --- R20: no keyword may be decoration.
//
// `taunt` and `frenzy` shipped on real PLAYER parts — anglerfish "Lure Light"
// and shark "Frenzy" at 64 power — against keywords `keywords.json` itself
// marked "Reserved (post-M4)". The engine never read either, so the button
// lied. Thirteen more were reserved and eleven were on nothing at all.
//
// The half that matters is BEHAVIOURAL, not a grep for the name: a comment
// mentioning `frenzy` would satisfy any textual check. So every keyword is
// bolted onto a control move and the fight is replayed on the same seed with
// and without it. An inert keyword consumes no rolls and changes no state,
// so the two logs come back identical — which is exactly the bug, and it
// fails here.
{
  const CONTROL = { name: 'Control Swing', power: 30, cost: 8, acc: 100, tags: [], keywords: {} };
  const dummy = {
    id: 'kwdummy', name: 'Practice Dummy', class: 'ground', hp: 400, power: 9, armor: 6,
    speed: 5, stamina: 300, regen: 8, tags: ['Organic'], koLine: 'The Dummy is retired.',
    moves: [
      { name: 'Prod', power: 22, cost: 8, acc: 100, tags: [], keywords: {} },
      // It braces for real rather than having the flag forced on, because
      // performMove clears the attacker's own guard: a hand-set flag is gone
      // again before the player ever swings at it.
      { name: 'Brace', power: 0, cost: 6, acc: 100, tags: [], keywords: { guard: true } },
    ],
    shapes: [{ type: 'circle', cx: 0, cy: 0, r: 40, fill: '#888888' }],
  };
  const kwContent = { ...content, enemies: { ...content.enemies, kwdummy: dummy } };
  const kwState = { ...newGameState(), seed: 2020 };
  const solo = makeChimera(kwState, 'M', {
    bear_head: 'standard', bear_forelimbs: 'standard', bear_hide: 'standard', bear_organ: 'standard',
  }, t0);
  const play = (keywords, condition = null) => {
    const team = [solo, { ...solo, id: `${solo.id}#1`, name: 'Second' }, { ...solo, id: `${solo.id}#2`, name: 'Third' }];
    const b = createBattle(team, { id: 'kw', name: 'Keyword Bench', waves: ['kwdummy'], reward: 0, tier: 3 },
      kwContent, 4242, solo.settleUntil);
    // One move, ours, so the keyword under test is the only variable.
    for (const c of b.player.team) c.moves = [{ ...CONTROL, keywords }];
    // Hard to pin down, so ignoreEvasion has something to bypass. Nothing
    // clears an evasion stage, so once is enough — whereas a bench that never
    // creates the condition reports a live keyword as decoration, which is a
    // false alarm rather than a finding.
    b.enemy.active.stages.evasion = 2;
    let guard = 0;
    while (!b.over && guard++ < 26) {
      if (condition) condition(b);
      const acts = playerActions(b);
      const swing = acts.find((a) => a.type === 'move') ?? acts.find((a) => a.type === 'rest') ?? acts[0];
      if (!swing) break;
      step(b, swing, kwContent);
    }
    return b.log.join('\n');
  };
  // Two keywords only mean anything against a condition the bench has to
  // create, and the baseline has to run under the SAME condition or the
  // comparison measures the setup instead of the keyword. Guard is the awkward
  // one: performMove clears the attacker's own guard, so it only stands while
  // the guarding side has not acted yet — which means the player has to swing
  // first, so this cannot just be forced on in the shared bench without
  // making `priority` untestable.
  const CONDITION = {
    ignoreGuard: (b) => {
      for (const c of b.player.team) c.speed = 99;
      b.enemy.active.speed = 1;
      b.enemy.active.status.guard = true;
    },
  };
  const baseline = play({});
  const SAMPLE = {
    recoil: 0.3, venom: 2, stun: 1, sleep: 1, trap: true, guard: true, priority: true,
    charge: true, ignoreArmor: true, ignoreGuard: true, knockback: true, accUp: 2, accDown: 2,
    powerUp: 2, powerDown: 2, evasionUp: 2, staminaRestore: 30, heal: 0.3, bleed: 3, slow: 0.5,
    taunt: true, thorns: 0.5, multiHit: 4, frenzy: true, rally: 2, regen: 0.2, rage: true,
    staminaDrain: 40, ignoreEvasion: true,
  };
  const inert = [];
  for (const kw of Object.keys(content.keywords)) {
    assert.ok(kw in SAMPLE, `keywords.json gained "${kw}" with no bench value — add one here`);
    const cond = CONDITION[kw] ?? null;
    const control = cond ? play({}, cond) : baseline;
    if (play({ [kw]: SAMPLE[kw] }, cond) === control) inert.push(kw);
  }
  assert.deepEqual(inert, [], `these keywords changed nothing at all — they are decoration: ${inert.join(', ')}`);

  // And the other half: a keyword nothing carries is content that never
  // reaches a player, which is how `heal` and `staminaRestore` sat wired but
  // unreachable since M4 (organs almost never carry a move).
  const carried = new Set();
  for (const part of Object.values(content.parts)) {
    for (const k of Object.keys(part.move?.keywords ?? {})) carried.add(k);
  }
  for (const combo of Object.values(content.combos)) {
    for (const k of Object.keys(combo.move.keywords ?? {})) carried.add(k);
  }
  for (const unit of Object.values(content.enemies)) {
    for (const m of unit.moves) for (const k of Object.keys(m.keywords ?? {})) carried.add(k);
  }
  const orphans = Object.keys(content.keywords).filter((k) => !carried.has(k));
  assert.deepEqual(orphans, [], `no move in the game carries these: ${orphans.join(', ')}`);
}

// --- Knockback is a tempo move, not a lock.
//
// Knockback rotates the target's side, and the round loop drops that side's
// planned action — correct for a KO, but it handed a faster attacker an
// unbounded denial: rotate the player every turn and the player never acts
// at all. Measured before the fix, a single control unit with one knockback
// move turned a 100% win into 11% and took ZERO damage across thirteen
// turns. A side rotated last turn cannot be rotated again this turn, so the
// worst case is losing every other action.
{
  const punter = {
    // Fast and tireless so it punts EVERY turn — that is the lock under
    // test — but deliberately feeble, so the only thing that can lose this
    // fight is never being allowed to act.
    id: 'punter', name: 'Punt Unit', class: 'ground', hp: 90, power: 4, armor: 6,
    speed: 30, stamina: 200, regen: 20, tags: ['Organic'], koLine: 'The Punt Unit sits down.',
    moves: [{ name: 'Punt', power: 14, cost: 10, acc: 100, tags: [], keywords: { knockback: true } }],
    shapes: [{ type: 'circle', cx: 0, cy: 0, r: 40, fill: '#888888' }],
  };
  const kbContent = { ...content, enemies: { ...content.enemies, punter } };
  const kbState = { ...newGameState(), seed: 8181 };
  const one = makeChimera(kbState, 'M', {
    bear_head: 'standard', bear_forelimbs: 'standard', bear_hide: 'standard', bear_organ: 'standard',
  }, t0);
  const team = [one, { ...one, id: `${one.id}#1`, name: 'Spare One' }, { ...one, id: `${one.id}#2`, name: 'Spare Two' }];
  const kb = createBattle(team, { id: 'punt', name: 'Punt', waves: ['punter'], reward: 0, tier: 3 },
    kbContent, 99, one.settleUntil);
  const startHp = kb.enemy.active.hp;
  let guard = 0;
  while (!kb.over && guard++ < 80) {
    const acts = playerActions(kb);
    const best = acts.filter((a) => a.type === 'move')
      .sort((x, y) => playerActive(kb).moves[y.index].power - playerActive(kb).moves[x.index].power)[0]
      ?? acts.find((a) => a.type === 'rest') ?? acts[0];
    step(kb, best, kbContent);
  }
  assert.ok(kb.enemy.active.hp < startHp || kb.outcome === 'win',
    'a knockback attacker cannot deny every single action — the player lands damage');
  assert.equal(kb.outcome, 'win', 'and a fair fight against one punter is still winnable');
}

// --- Boss transforms into stage two, then falls for the win.
function grind(encounterId, seed) {
  const s = { ...newGameState(), seed: 99, funds: 0 };
  const f1 = makeChimera(s, 'L', { bear_head: 'prismatic', bear_forelimbs: 'prismatic', bear_hide: 'prismatic', bear_organ: 'prismatic' }, t0);
  const f2 = makeChimera(s, 'M', { goat_head: 'prismatic', goat_hindlimbs: 'prismatic', goat_organ: 'prismatic' }, t0);
  const now2 = Math.max(f1.settleUntil, f2.settleUntil);
  const b = createBattle([f1, f2], content.encounters[encounterId], content, seed, now2);
  // What is under test here is the TRANSFORM, so the dial is pinned rather
  // than left to whatever the tier says today. R22 gave Captain Clampdown a
  // policy and it now opens with accDown and stays on its best swing, which
  // is enough to end a thin squad before stage two ever appears — a real
  // difficulty change, recorded in PROGRESS, but not what this assertion is
  // for. Pinning also stops future AI tuning from silently breaking a test
  // about a KO trigger.
  b.aiSkill = 0;
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

// --- Balance gate: the harness's OWN verdict is now a build failure.
//
// The sim reported `L · wolf:organ + tiger:head + …` as an [OP] outlier on
// every run for a dozen sessions and nothing acted on it. A report nobody is
// obliged to read is not a guard, so the report is asserted here. It was
// Pack Hunt: 64 power for 26 stamina at 95 acc — the best damage-per-stamina
// of all twelve combos WHILE carrying priority and a compounding powerUp.
// Every peer pays for its upside (live_wire buys top efficiency with no
// keywords at all); Pack Hunt took both, so a two-part combo owned the game.
//
// Six pools, not one: sampleBuilds fills a combo's spare sockets at random,
// so one pool only decides which fillers Pack Hunt happens to wear — the
// same combo swings between rank 1 and rank 41 of 43 on filler alone.
//
// seedsPer 8, not the sim's default 3: at three battles per encounter a win
// rate can only land on 0/33/67/100%, and that quantisation on its own flags
// a clean roster. 4 was the other error — it under-samples, and a roster it
// calls clean at Prime is flagged by both 8 and 12. Sampling that hides an
// outlier is worse than no gate at all.
//
// R26 tripled the encounter set (8 -> 24) and with it this gate's runtime,
// and 4 was tried again on the theory that what the flag reads is a build's
// AGGREGATE rate, so three times the encounters should buy back half the
// seeds. It does not: the detector is peer-RELATIVE, and thinning the sample
// fattens the tails on both sides of the median, so 4 immediately flagged
// `L · wolf:organ + tiger:head + alpine:ram_hindlimbs` at Prime and Apex —
// a build 8 and 12 both call clean. The suite is slower than it was. That is
// the price of a bigger world, and it is cheaper than a gate that lies.
//
// Run at EVERY grade, not just Standard. R17 found a real Prime outlier that
// a Standard-only gate had never once looked at: the class triangle only
// bites once damage is high enough for a 1.5x to decide a fight, so grades
// are exactly where a matchup problem shows up first.
const BALANCE_POOLS = [2026, 77, 1312, 4242, 99, 5];
const BALANCE_GRADES = ['standard', 'prime', 'apex', 'prismatic'];
const degenerate = [];
for (const grade of BALANCE_GRADES) {
  for (const poolSeed of BALANCE_POOLS) {
    const { flags } = runSim(content, { builds: 40, seedsPer: 8, teamSize: 3, grade, seed: poolSeed });
    for (const f of flags) if (f.kind === 'OP') degenerate.push(`${grade} pool ${poolSeed}: ${f.label} — ${f.why}`);
  }
}
assert.equal(
  degenerate.length,
  0,
  `no build may dominate the roster:\n  ${degenerate.join('\n  ')}`
);

// R18: the enemy roster's class mix IS the class balance. Each player class
// preys on exactly one enemy class (Ground >> Water >> Air >> Ground), so a
// roster that is 90% one class — which this one was — turns the triangle
// from a choice into a ranking: Air was a permanent double-advantage and
// Water a permanent double-penalty, which is what made the best Air build
// top every pool. Even thirds is NOT the answer and was measured to be
// worse (20pp spread vs 12pp): the tag chart stacks its own asymmetries on
// top, Ground moves missing Airborne entirely being the big one. Ground
// stays the plurality; what matters is that no class is nearly absent.
const roster = {};
for (const e of Object.values(content.encounters)) {
  for (const ref of e.waves) {
    const unit = typeof ref === 'string' ? content.enemies[ref] : ref;
    roster[unit.class] = (roster[unit.class] ?? 0) + 1;
  }
}
const rosterTotal = Object.values(roster).reduce((a, b) => a + b, 0);
for (const cls of Object.keys(content.classes)) {
  const share = (roster[cls] ?? 0) / rosterTotal;
  assert.ok(
    share >= 0.15,
    `enemy roster is ${(share * 100).toFixed(0)}% ${cls} — under 15% and the class triangle ` +
      `stops being a choice for whoever counters it (mix: ${JSON.stringify(roster)})`
  );
}

// The opposite failure, and the reason Pack Hunt was re-priced rather than
// simply shrunk: a combo weaker than the parts that unlock it is dead
// content — the player discovers it and then never presses it. Charge and
// recoil moves are excluded because they buy their power with a drawback,
// so they are not a like-for-like comparison.
//
// Checked at EVERY grade assignment, not just Standard, and through
// movesFromTokens rather than by re-doing the arithmetic here — the point of
// the rule is what the player's move list actually says. A part's move used
// to scale 12% per grade while its combo stayed flat, so a Prismatic Pounce
// (71) overtook the Pack Hunt (58) it belongs to and the reward became the
// wrong button: 7 of 12 combos went dead at Prime or Apex. A combo now takes
// the BEST grade among the parts that unlock it, which is the only rule that
// holds — min leaves 31 of these 192 assignments dead, mean 10, max none.
const GRADE_IDS = GRADES.map((g) => g.id);
let gradeAssignmentsChecked = 0;
for (const combo of Object.values(content.combos)) {
  for (let mask = 0; mask < GRADE_IDS.length ** combo.parts.length; mask++) {
    const grades = combo.parts.map((_, i) => GRADE_IDS[Math.floor(mask / GRADE_IDS.length ** i) % GRADE_IDS.length]);
    const tokens = combo.parts.map((partId, i) => ({
      id: `dead-${partId}`, partId, grade: grades[i],
      donor: { name: 'Simulacrum', species: content.parts[partId].species, stars: 3, extractedAt: 0 },
    }));
    const moves = movesFromTokens(tokens, analyze('M', tokens, content), content);
    const comboMove = moves.find((m) => m.name === combo.name);
    assert.ok(comboMove, `combo ${combo.id} reaches the move list`);
    // Charge and recoil moves buy their power with a drawback, so they are
    // not a like-for-like comparison.
    const rivalPower = moves
      .filter((m) => m !== comboMove && !m.keywords?.charge && !m.keywords?.recoil)
      .reduce((best, m) => Math.max(best, m.power), -1);
    assert.ok(
      comboMove.power > rivalPower,
      `combo ${combo.id} at grades [${grades}] is ${comboMove.power} power but a drawback-free ` +
        `move of its own parts is ${rivalPower} — the combo is dead content at that grade`
    );
    gradeAssignmentsChecked++;
  }
}
assert.equal(gradeAssignmentsChecked, 432, 'every combo × grade assignment was actually checked');
// Grades are the power curve: each tier opens the boss further.
//
// Measured on the MEAN across builds, not the max. A max over a couple of
// seeds saturates the instant one lucky build goes two-for-two — it was
// reporting "100% at standard grade" off two coin flips, and duly broke the
// moment anything nudged the RNG stream. The mean is what the claim
// actually means, and it checks the whole ladder instead of one step.
const bossMean = (res) =>
  res.rows.reduce((sum, r) => sum + r.perEncounter.boss_clampdown, 0) / res.rows.length;
const ladder = ['standard', 'prime', 'apex'].map((grade) =>
  bossMean(runSim(content, { builds: 10, seedsPer: 4, grade, teamSize: 3 }))
);
assert.ok(
  ladder[1] > ladder[0] && ladder[2] > ladder[1],
  `each grade opens the boss further (${ladder.map((x) => Math.round(x * 100) + '%').join(' → ')})`
);

// --- M5: campaign data coherence.
const region = Object.values(content.regions)[0];
// "Conquer everything" means the whole map now, not the first county —
// R26 gave the campaign five region strips, so a fixture that only holds
// Greenfield is a fixture testing a fifth of the game.
const ALL_NODE_IDS = Object.values(content.regions).flatMap((r) => r.nodes.map((n) => n.id));
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
const regionOf0 = Object.values(content.regions)[0];
assert.equal(states[1].status, 'available');
assert.equal(states[4].status, 'locked', 'guard post needs Threat Gen 2');
// Derived, not hardcoded: A9 raised every node's income, and a literal here
// would just have to be edited again next time the economy is tuned.
assert.equal(incomePerDay(camp, content), regionOf0.nodes[0].incomePerDay,
  'one node held pays exactly that node');
camp.campaign.lastTickAt = t0;
tickCampaign(camp, content, t0 + 2 * 24 * HOUR);
assert.ok(Math.abs(camp.funds - regionOf0.nodes[0].incomePerDay * 2) < 0.01,
  `two days of one held node pays two days of that node (${camp.funds})`);
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
// A2: the last chimera on a roster is never taken, so a capture fixture
// needs somebody left at home. Not deployed — just alive, which is the
// whole condition.
makeChimera(m5lab2, 'S', { goat_head: 'standard' }, t0);
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
  // Across a handful of seeds, not one. `autoplay` is strictly greedy on
  // power — it never rests, never guards, never reads the tag chart — so a
  // single-seed win/loss here is a coin flip on data this assertion does not
  // care about, and A9 landed on exactly that: adding Ground tags to
  // patrol_2 changed what the enemy AI chose and tipped the greedy pilot
  // over. What this block is actually asserting is the BOOKKEEPING below —
  // nodes held, income paid, notoriety raised — so the combat only has to be
  // winnable, which nodeClimbability scores separately and properly.
  let won = null;
  for (let s = 0; s < 8 && !won; s++) {
    const b = createBattle(alive(), content.encounters[node.encounter], content, hashString(`${node.id}#${s}`), tWar, { kind: 'assault', nodeId: node.id });
    autoplay(b);
    if (b.outcome === 'win') won = b;
  }
  assert.ok(won, `a prismatic army takes ${node.id} on at least one of eight seeds`);
  conq.battle = won;
  resolveBattle(conq, conq.battle, content, tWar);
  for (const c of conq.chimeras) c.injury = null; // field hospital, sim-side
}
assert.equal(conq.campaign.heldNodes.length, 4);
assert.equal(conq.campaign.notoriety, 65);
assert.equal(threatGen(conq, content), 2, 'boss conquest tips Threat Gen 2');
assert.equal(nodeStates(conq, content)[4].status, 'available', 'Gen 2 node unlocked');
assert.ok(conq.news.some((n) => n.includes('THREAT LEVEL UP')));
assert.equal(incomePerDay(conq, content),
  regionOf0.nodes.slice(0, 4).reduce((a, n) => a + n.incomePerDay, 0),
  'four of five nodes held pays those four and no strip bonus');

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

  // Incubation is a real timer: goat = 22min after R24's 25% cut across
  // every real-world clock in the game, and still no early hatching.
  const egg = s.ranch.eggs[0];
  assert.equal(egg.hatchAt - egg.laidAt, 22 * 60000, 'goat eggs take 22 minutes');
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
  heldNodes: [], notoriety: 0, captives: [], containment: [], rivals: {}, faunaGranted: [],
  contested: [], nextContestAt: null, defences: {}, contestCount: 0,
  operations: [], opCooldowns: {}, opCount: 0, opReport: null, heat: 0, heatAt: null,
  lastTickAt: null,
});
// v27 (A4): the one job slot became a list, and a job that was IN FLIGHT
// when the save was written has to survive the move — it keeps its clock,
// its sealed outcome and its crew. The deliberate-break battery caught this
// as a hole: a migration that simply wrote `operations = []` passed the
// whole suite, because every other assertion only ever looked at the SHAPE.
{
  const v26 = structuredClone(v1Save);
  v26.saveVersion = 26;
  v26.campaign = {
    ...(v26.campaign ?? {}),
    operation: {
      opId: 'aquarium', chimeraId: 'c1', startedAt: t0, until: t0 + 6 * HOUR,
      chance: 0.62, outcome: { success: true, funds: 180, species: 'frog', injuryRoll: 0.9 },
    },
  };
  const moved = migrate(v26);
  assert.equal(moved.campaign.operation, undefined, 'the single slot is gone');
  assert.equal(moved.campaign.operations.length, 1, 'and the job that was out is still out');
  const run = moved.campaign.operations[0];
  assert.equal(run.opId, 'aquarium');
  assert.equal(run.chimeraId, 'c1', 'with the same crew');
  assert.equal(run.until, t0 + 6 * HOUR, 'and the same clock');
  assert.deepEqual(run.outcome, { success: true, funds: 180, species: 'frog', injuryRoll: 0.9 },
    'and the outcome sealed at launch, which a reload must not reroll');
  // A save with nothing running migrates to an empty board, not to [null].
  const idle = structuredClone(v1Save);
  idle.saveVersion = 26;
  idle.campaign = { ...(idle.campaign ?? {}), operation: null };
  assert.deepEqual(migrate(idle).campaign.operations, [], 'and an idle board stays idle');
}

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
  // A1: the Path no longer retires at the first conquest, because the wall
  // is the node AFTER it. Combat is one active per side over a queue, so a
  // three-unit patrol is three health bars against your one — measured, the
  // second node is 0% with one chimera and 84% with three. The checklist
  // now walks the player to a stable before it lets go.
  s.campaign.heldNodes.push('barn_perimeter');
  assert.ok(onboardingActive(s), 'one conquest and one chimera is not a finished tutorial');
  const steps2 = onboardingSteps(s, content, t0);
  const last = steps2[steps2.length - 1];
  assert.equal(last.label, 'Build a stable of three', 'and the Path now ends on the stable');
  assert.equal(last.done, false, 'which this save has not built');
  assert.ok(/one health bar against three/.test(last.hint), 'in the terms that actually decide the fight');
  s.chimeras = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.ok(!onboardingActive(s), 'a stable and a conquest retires it');
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

// --- A3: forty animals, and Air anatomy you can build a creature out of
//
// The audit measured the pool and found 36 Ground-affinity parts, 25 Water
// and 9 Air — and those nine Air parts were six forelimbs and three tails.
// Air had NOTHING in the head, hindlimb, hide or organ sockets anywhere in
// the game, so an Air specialist could not be assembled out of Air anatomy:
// it borrowed somebody's legs, and the borrowed legs voted against it.
//
// The criterion is deliberately NOT a species count. Nine more birds that
// all donate wings would move the headline number and change nothing, so
// this gate is per SLOT.
{
  const { classOfParts } = await import('../campaign/director.js');
  const VOTING = ['head', 'forelimbs', 'hindlimbs', 'tail'];
  const CLASSES = ['ground', 'water', 'air'];

  const animals = Object.values(content.species).filter((sp) => !sp.synthetic);
  assert.equal(animals.length, 40, `forty animals (${animals.length})`);

  const pool = Object.fromEntries(CLASSES.map((c) => [c, {}]));
  for (const part of Object.values(content.parts)) {
    if (!part.classAffinity) continue;
    (pool[part.classAffinity][part.slot] ??= []).push(part);
  }
  const per = (cls, slot) => pool[cls][slot] ?? [];
  const total = (cls) => VOTING.reduce((n, slot) => n + per(cls, slot).length, 0);
  const shape = CLASSES.map((c) => `${c} ${total(c)} (${VOTING.map((sl) => per(c, sl).length).join('/')})`).join('  ');

  // 1. No slot is structurally closed to a class. This is the one that was
  //    false: Air scored zero in two of these four.
  for (const cls of CLASSES) {
    for (const slot of VOTING) {
      assert.ok(per(cls, slot).length >= 1, `${cls} has no ${slot} anywhere in the game — ${shape}`);
    }
  }
  // 2. And the two that were starved have real CHOICE in each slot, not one
  //    forced part standing in for a column.
  for (const cls of ['water', 'air']) {
    for (const slot of VOTING) {
      assert.ok(per(cls, slot).length >= 5,
        `${cls} ${slot} is ${per(cls, slot).length} part(s) — that is a single build, not an archetype — ${shape}`);
    }
  }
  // 3. The pools are comparable. It was 4.0x; anything past 1.5x means one
  //    class is the default again and the other two are flavour.
  const totals = CLASSES.map(total);
  assert.ok(Math.max(...totals) / Math.min(...totals) <= 1.5,
    `the class pools are within a half of each other — ${shape}`);

  // 4. Buildable in practice, not only on the spreadsheet: for each class,
  //    fill all four voting sockets with parts that vote it, taken from
  //    DIFFERENT species — a purebred proves nothing about splicing — and
  //    check the engine reads the result as that class.
  for (const cls of CLASSES) {
    const used = new Set();
    const picked = VOTING.map((slot) => {
      const part = per(cls, slot).find((c) => !used.has(c.species)) ?? per(cls, slot)[0];
      used.add(part.species);
      return part.id;
    });
    assert.ok(used.size >= 3, `${cls} can be built from at least three donors (${[...used].join(', ')})`);
    assert.equal(classOfParts(picked, content), cls, `and the engine reads it as ${cls}: ${picked.join(' + ')}`);
  }

  // 5. Every new animal is REACHABLE. A species with a price that no node
  //    unlocks would be on sale from turn one and quietly break the "the
  //    catalog is two species with no territory" floor the jobs board rests
  //    on; a species with no price and no node is unobtainable.
  const unlocked = new Set(Object.values(content.regions).flatMap((r) => r.nodes).flatMap((n) => n.unlocksFauna ?? []));
  for (const sp of animals) {
    if (sp.variantOf) continue; // variants are bred, never bought
    assert.ok(sp.mailOrderPrice, `${sp.id} has a catalog price`);
    assert.ok(unlocked.has(sp.id) || ['goat', 'ram'].includes(sp.id),
      `${sp.id} is unlocked by conquering something`);
  }

  // 6. The Ground attack tag is pure downside — its only row in the chart is
  //    "Ground moves miss Airborne (x0)" and there is no row where it helps.
  //    Every hindlimb in the game used to carry it, so a shark's hindfin and
  //    an eagle's talon both whiffed completely against anything with wings.
  for (const part of Object.values(content.parts)) {
    if (!part.move?.tags?.includes('Ground')) continue;
    assert.ok(part.classAffinity === 'ground',
      `${part.id} swings a Ground move but its anatomy votes ${part.classAffinity ?? 'nothing'} — ` +
        'a Ground tag on anything but a ground limb is a free x0 against fliers');
  }
}

// --- A8: the harness measures the team a player actually has ----------
//
// The audit said `runSim` defaults to teamSize 3 and that nothing in the
// suite looks at real team sizes. Both were wrong: runSim defaults to ONE,
// and A1 already sweeps [1, 2, 3] — but only over the first strip. The gap
// was scope, and what it hid is that the ladder is climbable only at
// exactly three: at two, four of five strips have a 0% node, and the whole
// Foundry is unwinnable solo.
//
// Whether that is a bug depends on "the team size a player has when they
// reach it", which was undefined anywhere in the data — so the criterion
// was undecidable and any gate would have been asserting whatever the
// balance happened to be. `benchTeam` (per node, defaulting per strip)
// makes it a declaration, the way `benchGrade` already declares the parts
// a player arrives with.
{
  const { nodeConditions, nodeClimbability } = await import('../tools/sim.js');
  const regionsList = Object.values(content.regions);

  // 1. Every node declares what it expects, and expects something the game
  //    can actually give: the briefing caps a strike team at three.
  for (const region of regionsList) {
    for (const node of region.nodes) {
      const { team, grade } = nodeConditions(region, node);
      assert.ok(Number.isInteger(team) && team >= 1 && team <= 3,
        `${node.id} declares a team the game can field (${team})`);
      assert.ok(GRADES.some((g) => g.id === grade), `${node.id} declares a real grade (${grade})`);
    }
  }
  // The first strip has to START at one, or the game is asking for a stable
  // before it has handed the player the means to build one.
  assert.equal(nodeConditions(regionsList[0], regionsList[0].nodes[0]).team, 1,
    'the first node of the campaign is a solo fight');
  // And a solo declaration has to exist somewhere later too, or benchTeam is
  // just "3" wearing a data structure.
  const declared = regionsList.flatMap((r) => r.nodes.map((n) => nodeConditions(r, n).team));
  assert.ok(new Set(declared).size >= 2, `benchTeam actually varies (${[...new Set(declared)].sort().join(', ')})`);

  // 2. THE GATE THE CRITERION ASKS FOR: a ladder that cannot be climbed at
  //    the team size a player has when they reach it must fail here. The
  //    floor is 25% for the BEST of the archetypes — the question is
  //    whether some build a player could field gets through, not whether
  //    every build does. Measured minimum across the map is 29%
  //    (foundry/slag_gate), so this is a floor and not a fit to the data.
  for (const region of regionsList) {
    for (const node of region.nodes) {
      const { best, who, grade, team } = nodeClimbability(content, region, node, { seedsPer: 24 });
      assert.ok(best >= 0.25,
        `${region.id}/${node.id} is climbable at the ${team} chimera(s) and ${grade} parts it is tuned for ` +
        `— best of ${Object.keys(ARCHETYPES).length} archetypes is ${Math.round(best * 100)}% (${who ?? 'none'})`);
    }
  }

  // 3. AND THE FORECAST STAYS HONEST AT EVERY SIZE ON EVERY STRIP. A1
  //    asserted this over the first strip; the other four were never
  //    checked. The direction that matters is the false negative: calling a
  //    winnable fight unwinnable costs a player a fight they would have
  //    taken, and it is the only verdict that tells them to walk away.
  let cells = 0, soloCells = 0;
  for (const region of regionsList) {
    const grade = region.benchGrade ?? 'prime';
    for (const node of region.nodes) {
      for (const size of [1, 2, 3]) {
        for (const [key, arch] of Object.entries(ARCHETYPES)) {
          let wins = 0;
          const runs = 24;
          for (let s = 0; s < runs; s++) {
            const c = makeSimChimera(arch.frame, arch.partIds, grade, content);
            if (scriptedBattle(c, content.encounters[node.encounter], content,
              hashString(`a8${region.id}${node.id}${key}${size}${s}`), size).outcome === 'win') wins++;
          }
          const truth = wins / runs;
          const team = Array.from({ length: size }, (_, i) => ({
            ...makeSimChimera(arch.frame, arch.partIds, grade, content), id: `a8f${i}`,
          }));
          const f = forecast(team, content.encounters[node.encounter], content, 2026, 1);
          cells++;
          if (size === 1) soloCells++;
          assert.ok(!(f.band.id === 'hopeless' && truth >= 0.4),
            `${region.id}/${node.id} ${key} x${size}: called unwinnable but truly ` +
            `${Math.round(truth * 100)}% — that verdict is the one that must never be wrong`);
        }
      }
    }
  }
  assert.ok(soloCells >= 100, `the suite really does measure a solo player (${soloCells} solo cells)`);
  assert.equal(cells, regionsList.reduce((n, r) => n + r.nodes.length, 0) * 3 * Object.keys(ARCHETYPES).length,
    'every strip x node x team size x archetype was checked');
}

// --- A7: obedience, priced ---------------------------------------------
//
// The audit filed this as "obedience is decisive and invisible until it
// costs you", and measurement disagreed with BOTH halves.
//
// It was never invisible: every roster row on the briefing screen already
// printed it. And it is not decisive — holding settling fixed so Rejection
// never fires, and replaying the real engine 300 times a cell at pilot
// skill 1.0, a 20% ignore chance is worth one to three points and even the
// 60% cap costs about nine. A disobeying creature substitutes another move
// from its OWN list, so it loses a little optimisation and never a turn.
//
// So the fix is not to display the number harder. It is to make the number
// mean something: the briefing replays the fight with disobedience switched
// off and shows the difference, which stays honest at whatever this
// mechanic is eventually worth.
{
  const { obedienceIgnoreChance, obediencePercent } = await import('../battle/engine.js');
  const { forecast } = await import('../battle/forecast.js');

  const mk = (id, { bond = 100, settled = true, instability = 0 } = {}) => ({
    id, name: id, frame: 'M', bond, instability,
    settleUntil: settled ? t0 - HOUR : t0 + 40 * HOUR,
    temperament: { nerve: 0, temper: 0 }, injury: null,
    tokens: Object.fromEntries(SLOTS.map((sl) => [sl, {
      id: `${id}${sl}`, partId: `goat_${sl}`, grade: 'standard',
      donor: { name: 'D', species: 'goat', stars: 3, extractedAt: t0 },
    }])),
  });

  // The formula still says what §3.5 says: settling removes the big
  // penalty, bond cancels instability, and care can always reach zero.
  assert.equal(obedienceIgnoreChance(mk('a'), t0), 0, 'a settled, bonded creature always obeys');
  assert.equal(obediencePercent(mk('a'), t0), 100);
  assert.ok(obedienceIgnoreChance(mk('b', { settled: false }), t0) > 0, 'an unsettled one does not');
  assert.ok(
    obedienceIgnoreChance(mk('c', { bond: 0, instability: 100 }), t0)
    > obedienceIgnoreChance(mk('d', { bond: 100, instability: 100 }), t0),
    'and bond is the lever the player has'
  );
  assert.ok(obedienceIgnoreChance(mk('e', { bond: 0, instability: 1000 }), t0) <= 0.6,
    'the ignore chance is capped, so no build is ever uncontrollable');

  // AN IGNORE MUST ACTUALLY CHANGE THE MOVE. The improvisation pool used to
  // include the move that had just been ordered, so roughly one ignore in
  // five printed "ignores orders and improvises!" and then did exactly what
  // it was told — a combat log line that was not true.
  {
    const wild = mk('w', { bond: 0, instability: 1000 });
    const b = createBattle([wild], content.encounters.patrol_1, content, 4242, t0);
    b.player.team[0].ignoreChance = 1; // every order is ignored
    const before = b.player.team[0].moves.map((m) => m.name);
    let disobeyed = 0, sameMove = 0;
    for (let i = 0; i < 40 && !b.over; i++) {
      const acts = playerActions(b);
      const move = acts.find((a) => a.type === 'move');
      if (!move) break;
      const ordered = before[move.index];
      const evs = step(b, move, content);
      if (evs.some((e) => e.kind === 'disobey')) {
        disobeyed++;
        if (evs.some((e) => e.text?.includes(ordered) && /uses|swings/i.test(e.text ?? ''))) sameMove++;
      }
    }
    assert.ok(disobeyed > 0, 'a creature at ignoreChance 1 does disobey');
    assert.equal(sameMove, 0, 'and never "improvises" into the move it was just ordered to use');
  }

  // THE BRIEFING'S NUMBER IS A MEASUREMENT. Same team, same encounter, the
  // only difference being whether disobedience fires: the gap is the price.
  {
    const team = [0, 1, 2].map((i) => mk('t' + i, { bond: 0, instability: 1000 }));
    const enc = content.encounters.patrol_2;
    const real = forecast(team, enc, content, 7, t0, { runs: 64 });
    const perfect = forecast(team, enc, content, 7, t0, { runs: 64, obedient: true });
    assert.ok(perfect.winRate >= real.winRate - 0.02,
      `switching disobedience off never makes a team worse (${real.winRate} → ${perfect.winRate})`);
    // A team that cannot disobey must price at exactly zero, or the screen
    // would be reporting sampling noise as a cost.
    const obedient = [0, 1, 2].map((i) => mk('o' + i));
    assert.equal(obedienceIgnoreChance(obedient[0], t0), 0);
    const a = forecast(obedient, enc, content, 7, t0, { runs: 32 });
    const b2 = forecast(obedient, enc, content, 7, t0, { runs: 32, obedient: true });
    assert.equal(a.winRate, b2.winRate,
      'a team that never disobeys forecasts identically either way — the briefing shows it nothing');
  }
}

// --- A6: a combo for everybody, and a silhouette that points ---------
//
// 34 of 244 parts were in a combo and ELEVEN species were in none at all —
// gorilla, ram, porcupine, mantis, scorpion, and every one of the six chaos
// variants, which are the rarest things the game produces and had nothing
// to find. Combos are the discovery layer; most of the roster was not part
// of it.
{
  const { comboHint } = await import('../splice/theater.js');
  const { SOCKETS } = await import('../render/renderer.js');
  const combos = Object.values(content.combos);
  const partOf = (id) => content.parts[id];

  // 1. EVERY ANIMAL CAN BE IN A COMBO. Variants included: they are the
  //    hardest things to obtain, so having nothing to discover on one is
  //    the worst version of this bug, not an acceptable edge case.
  const inCombo = new Set(combos.flatMap((c) => c.parts));
  const covered = new Set([...inCombo].map((id) => partOf(id).species));
  const naked = Object.values(content.species)
    .filter((sp) => !sp.synthetic && !covered.has(sp.id)).map((sp) => sp.id);
  assert.deepEqual(naked, [], `every animal appears in a combo (missing: ${naked.join(', ')})`);

  // 2. Both halves of a combo must be REAL and in DIFFERENT sockets — a
  //    chimera has one of each, so a same-slot pair is undiscoverable.
  for (const combo of combos) {
    assert.equal(combo.parts.length, 2, `${combo.id} pairs exactly two parts`);
    for (const id of combo.parts) assert.ok(partOf(id), `${combo.id} names a real part (${id})`);
    // A same-slot pair is only discoverable where the slot has a SECOND
    // socket, and exactly one does: Theater Tier II adds `organ2`. This
    // caught A3's Full Spectrum (owl_organ + bat_organ) on the first run,
    // and the data was right — that combo is gated behind Tier II, not
    // impossible. Any other doubled slot would be undiscoverable content.
    const slots = combo.parts.map((id) => partOf(id).slot);
    const doubled = SOCKETS.filter((sk) => /\d$/.test(sk)).map((sk) => sk.replace(/\d+$/, ''));
    assert.ok(slots[0] !== slots[1] || doubled.includes(slots[0]),
      `${combo.id} is wearable: ${slots.join(' + ')} — only ${doubled.join('/')} has a second socket`);
    assert.ok(combo.keyword && combo.desc && combo.name, `${combo.id} says what it is`);
  }

  // 3. The combo pool may not pile into the support slots. The first
  //    nineteen put TEN organ parts and exactly ONE hindlimb into a combo,
  //    which is the same shape A5 found in the tag chart.
  const bySlot = {};
  for (const id of inCombo) bySlot[partOf(id).slot] = (bySlot[partOf(id).slot] ?? 0) + 1;
  for (const slot of SLOTS) {
    assert.ok((bySlot[slot] ?? 0) >= 4,
      `combos reach the ${slot} socket (${bySlot[slot] ?? 0}) — ${JSON.stringify(bySlot)}`);
  }

  // 4. A SILHOUETTE HAS TO POINT AT SOMETHING. Every undiscovered combo used
  //    to render the same sentence, so the Dex showed twenty-seven identical
  //    rows that named nothing. The hint reveals in layers, keyed to the
  //    parts the player has actually handled.
  const blank = { dex: { parts: [] }, discoveredCombos: [] };
  const sample = combos[0];
  const cold = comboHint(sample, blank, content);
  assert.equal(cold.known, 0);
  assert.ok(cold.keyword, 'a cold hint still names the keyword — that is the reason to go looking');
  for (const id of sample.parts) {
    assert.ok(!cold.text.includes(partOf(id).name), 'and it does not give the parts away');
  }
  // Distinctness is the whole point, and it has to be asserted on the TEXT
  // as well as on the pair. A first version keyed only on `keyword|text`,
  // and a deliberate break that made every unseen half read "something"
  // sailed through it — 17 distinct keywords were carrying the whole test
  // on their own, so the part the hint is actually FOR went unguarded.
  const coldAll = combos.map((c) => comboHint(c, blank, content));
  const texts = new Set(coldAll.map((h) => h.text));
  const pairs = new Set(coldAll.map((h) => `${h.keyword}|${h.text}`));
  assert.ok(texts.size >= 12,
    `the silhouette TEXT varies on its own, without leaning on the keyword (${texts.size}/${combos.length} unique)`);
  assert.ok(pairs.size >= combos.length * 0.9,
    `and almost every silhouette as a whole is distinguishable (${pairs.size}/${combos.length} unique)`);

  // Handle one half and the Dex names that half, and only that half.
  const half = { dex: { parts: [sample.parts[0]] }, discoveredCombos: [] };
  const warm = comboHint(sample, half, content);
  assert.equal(warm.known, 1);
  assert.ok(warm.text.includes(partOf(sample.parts[0]).name), 'the half you have handled is named');
  assert.ok(!warm.text.includes(partOf(sample.parts[1]).name), 'the half you have not is still a slot');

  // Handle both and it stops being coy — you are holding the answer.
  const hot = comboHint(sample, { dex: { parts: sample.parts }, discoveredCombos: [] }, content);
  assert.equal(hot.known, 2);
  for (const id of sample.parts) assert.ok(hot.text.includes(partOf(id).name), 'both halves named');
  assert.ok(/same creature/i.test(hot.text), 'and it says what to do about it');
}

// --- A5: the tag chart has to be reachable, and swingable ------------
//
// R25 invented `foghorn_array` — a 62-power Sonic organ — because the
// armour-piercing answer to the Foundry did not exist in the buyable pool.
// It then wired it as salvage from `leviathan_dredge`, a unit that appears
// in NO encounter anywhere, so no player could ever obtain it — while
// tools/sim.js went on benching the Foundry with it. Both halves of that are
// gated here.
{
  const chart = content.tagChart;
  const ATTACK_TAGS = [...new Set(chart.map((r) => r.attack))];
  const enemies = readJSON('data/enemies.json');
  const encounters = Object.fromEntries((enemies.encounters ?? []).map((e) => [e.id, e]));
  const unitsById = Object.fromEntries((enemies.units ?? []).map((u) => [u.id, u]));
  const regionsList = Object.values(content.regions);

  const wavesOf = (encId) => (encounters[encId]?.waves ?? []).flat();
  const nodeEncounters = new Set(regionsList.flatMap((r) => r.nodes.map((n) => n.encounter)));
  const inAnyEncounter = new Set(Object.values(encounters).flatMap((e) => (e.waves ?? []).flat()));
  const directorUnits = new Set(Object.values(content.director?.counters ?? readJSON('data/director.json').counters ?? [])
    .flatMap((c) => c.units ?? []));

  // 1. NO ORPHAN SALVAGE. Every enemy-tech part must have at least ONE
  //    fielded source. Per PART, not per unit: rotor_limbs is promised by
  //    both crop_duster and the parked stratofortress, and that is fine —
  //    what killed foghorn_array was that its ONLY source was parked.
  const fielded = (id) => inAnyEncounter.has(id) || directorUnits.has(id);
  const salvageParts = new Set(Object.values(unitsById).flatMap((u) => u.salvage ?? []));
  for (const partId of salvageParts) {
    assert.ok(content.parts[partId], `every promised part exists (${partId})`);
    const sources = Object.values(unitsById).filter((u) => (u.salvage ?? []).includes(partId));
    assert.ok(sources.some((u) => fielded(u.id)),
      `${partId} has a fielded source — its only sources are ${sources.map((u) => u.id).join(', ')}, ` +
      'and none of them appears in any encounter, so no player can obtain it');
  }
  // And every salvage part in the data is promised by somebody at all.
  for (const part of Object.values(content.parts)) {
    if (part.species !== 'salvage') continue;
    assert.ok(salvageParts.has(part.id), `${part.id} is dropped by some unit`);
  }

  // 2. Dead units may not accumulate. These four are drafted at boss scale
  //    (hp 118–145, armor 13–18) and do not fit any strip they could join
  //    without a rescale, so they are parked rather than fielded — but the
  //    LIST is pinned, so a fifth cannot appear unnoticed the way
  //    leviathan_dredge did.
  const unfielded = Object.values(unitsById).filter((u) => !fielded(u.id)).map((u) => u.id).sort();
  assert.deepEqual(unfielded,
    ['crucible_9000', 'leviathan_dredge', 'stratofortress', 'the_compliance_engine'],
    `the parked units are exactly the four known ones (${unfielded.join(', ')})`);


  // 3. A TAG YOU CANNOT SWING IS NOT AN ANSWER — and the slot that matters
  //    is a LIMB.
  //
  //    The first cut of this asked for carriers in any "damage slot",
  //    counting the head, and a deliberate break sailed straight through it:
  //    Sonic already had mandate_horn (60) and goose_head (36) in the head
  //    socket, so it was swingable by that definition all along. The claim
  //    was wrong, not the code. What Sonic and Gas actually lacked was any
  //    carrier in forelimbs, hindlimbs or tail — Gas could not be swung at
  //    all (hide and organ only), and Sonic only ever from the head, where
  //    the one worth pressing is Spire salvage, a strip PAST the armour wall
  //    it answers.
  //
  //    Limbs are also where a build's damage actually lives: a head is one
  //    socket competing with the species' signature, and every chimera has
  //    three limb sockets.
  const LIMB_SLOTS = ['forelimbs', 'hindlimbs', 'tail'];
  for (const tag of ATTACK_TAGS) {
    const carriers = Object.values(content.parts).filter((p) => p.move?.tags?.includes(tag) && p.move.power > 0);
    const limbs = carriers.filter((p) => LIMB_SLOTS.includes(p.slot));
    assert.ok(limbs.length >= 2,
      `${tag} can be swung from a limb (${limbs.length}: ${limbs.map((p) => `${p.id}@${p.move.power}`).join(', ') || 'none'})`);
    assert.ok(Math.max(...limbs.map((p) => p.move.power)) >= 40,
      `${tag}'s best limb move is worth pressing (${Math.max(...limbs.map((p) => p.move.power))})`);
  }

  // 4. REACHABILITY AT THE DOOR — for the tags the ladder actually DEPENDS
  //    on, which is a narrower set than "tags that help here".
  //
  //    The class triangle already hands out a x1.5, so a chart MULTIPLIER is
  //    a nicer way to do something the player could do anyway: Gas x1.5 on
  //    an organic roster, Electric x2 on an aquatic one. Bonuses, not
  //    requirements — and a first draft of this gate demanded three Gas parts
  //    before the tutorial strip, which is absurd, because Greenfield is
  //    beatable at 55-83% by every archetype without a whiff of Gas.
  //
  //    The one effect nothing else in the game reproduces is `ignoreArmor`.
  //    Armour is a flat subtraction; no class advantage goes through it. So a
  //    strip whose roster is mostly Armored genuinely depends on Sonic, and
  //    that is the case R25 hit and patched with a part nobody could obtain.
  const RULE_TAGS = chart.filter((r) => r.rule).map((r) => r);
  const speciesUpTo = (i) => {
    const open = new Set(['goat', 'ram']);
    for (const r of regionsList.slice(0, i)) for (const n of r.nodes) for (const sp of (n.unlocksFauna ?? [])) open.add(sp);
    return open;
  };
  const salvageUpTo = (i) => {
    const open = new Set();
    for (const r of regionsList.slice(0, i)) {
      for (const n of r.nodes) for (const uid of wavesOf(n.encounter)) {
        for (const pid of (unitsById[uid]?.salvage ?? [])) open.add(pid);
      }
    }
    return open;
  };
  let dependencies = 0;
  for (const [i, region] of regionsList.entries()) {
    const units = region.nodes.flatMap((n) => wavesOf(n.encounter)).map((id) => unitsById[id]).filter(Boolean);
    for (const row of RULE_TAGS) {
      const share = units.filter((u) => (u.tags ?? []).includes(row.defender)).length / units.length;
      if (share < 0.5) continue; // not what this strip is made of
      dependencies++;
      const fauna = speciesUpTo(i), scrap = salvageUpTo(i);
      const reach = Object.values(content.parts).filter((p) =>
        p.move?.tags?.includes(row.attack) && p.move.power > 0 && (fauna.has(p.species) || scrap.has(p.id)));
      assert.ok(reach.length >= 3,
        `${region.id} is ${Math.round(share * 100)}% ${row.defender} and only ${row.attack} ignores it, ` +
        `but a player can hold ${reach.length} part(s) carrying ${row.attack} when the strip opens ` +
        `(${reach.map((p) => p.id).join(', ') || 'none'}) — a team is three creatures`);
      // …and at least one of them has to be worth pressing against the armour
      // it is meant to go through. A 26-power honk is not an answer to a
      // roster wearing 11 to 15 points of plate.
      const armour = units.filter((u) => (u.tags ?? []).includes(row.defender)).map((u) => u.armor ?? 0);
      const median = armour.sort((a, b) => a - b)[Math.floor(armour.length / 2)] ?? 0;
      const best = Math.max(...reach.map((p) => p.move.power));
      assert.ok(best >= median * 3,
        `${region.id}: the best reachable ${row.attack} attack is ${best} power against a median ${median} armour — ` +
        'the player is better off swinging something else and eating the plate');
    }
  }
  assert.ok(dependencies >= 1, 'at least one strip actually depends on a chart rule, or this gate proves nothing');
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
  //
  // The filler head is a BEAR's, not a goat's. These cases each want a head
  // in the socket that does not touch the count, and A3 gave horned skulls a
  // Ground vote — so the goat head this used to pad with silently became a
  // third voter and quietly changed what every one of them was measuring.
  const wings = tk('eagle_forelimbs'), fan = tk('eagle_tail');
  const hooves = tk('goat_hindlimbs'), forelegs = tk('goat_forelimbs');
  const fins = tk('shark_hindlimbs'), finTail = tk('shark_tail'), gills = tk('shark_head');
  const mute = tk('bear_head'); // a snout is not class-defining anatomy
  assert.equal(content.parts.bear_head.classAffinity ?? null, null, 'and it really is mute');
  assert.equal(content.parts.goat_head.classAffinity, 'ground', 'while a horned skull is something you brace and shove with');
  assert.equal(content.parts.eagle_head.classAffinity, 'air', 'and a beak on a hollow skull is flight kit');
  assert.equal(analyze('S', [wings, fan, mute], content).creatureClass, 'air', 'wings + tailfan = Air');
  assert.equal(analyze('M', [hooves, forelegs, mute], content).creatureClass, 'ground', 'feet = Ground');
  assert.equal(analyze('L', [gills, fins, finTail], content).creatureClass, 'water', 'gills + fins = Water');
  // A tie is genuinely Unclassed — the hybrid's trade-off.
  assert.equal(analyze('M', [wings, hooves, mute], content).creatureClass, null, 'one wing vote vs one foot vote = Unclassed');
  assert.equal(analyze('M', [mute, tk('goat_hide')], content).creatureClass, null, 'no voting anatomy = Unclassed');
  // Adding a second air vote breaks the tie.
  assert.equal(analyze('M', [wings, fan, hooves, mute], content).creatureClass, 'air', 'majority wins');

  // The panel explains it (Law 4).
  const airRow = analyze('S', [wings, fan, mute], content).rows.find((r) => r.label === 'Class');
  assert.ok(airRow.value.includes('Air') && airRow.note.includes('Ground'), `panel explains the matchup: ${airRow.note}`);
  const tieRow = analyze('M', [wings, hooves, mute], content).rows.find((r) => r.label === 'Class');
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
  const { rivalStatus, rivalEncounter, rivalTeam, playerFavoredClass, scoutStable } = await import('../campaign/rivals.js');
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
  const region = Object.values(content.regions)[0]; // Greenfield, for the node-order fixtures
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
  const open = mkState({ campaign: { heldNodes: [...ALL_NODE_IDS], notoriety: 999, rivals: { mantissa: { defeats: 1, losses: 0 }, aloft: { defeats: 1, losses: 0 } }, captives: [], containment: [] } });
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
    // With no scouting file on record, the lead flies the rival's own flag.
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

  // R27: a rival counters from THEIR OWN FILE, and the file is written by
  // duels — not by looking in your pens. Owning an Air stable tells a rival
  // nothing until you bring it through their door.
  const airPart = (slot) => Object.values(content.parts).find((p) => p.slot === slot && p.classAffinity === 'air');
  const kite = {
    id: 'c1', name: 'Kite', frame: 'S',
    tokens: {
      head: { id: 'k0', partId: 'eagle_head', grade: 'prime', donor: {} },
      forelimbs: { id: 'k1', partId: airPart('forelimbs').id, grade: 'prime', donor: {} },
      tail: { id: 'k2', partId: airPart('tail').id, grade: 'prime', donor: {} },
    },
  };
  const airStable = structuredClone(open);
  airStable.chimeras = [kite];
  assert.equal(playerFavoredClass(airStable, content, 'aloft'), null,
    'a rival who has never met you has nothing on you, however full your pens are');
  assert.equal(rivalTeam(airStable, content.rivals.aloft, content).counterClass, null,
    'and so builds the lab they published');

  // Now fight them with it. The file is theirs alone.
  scoutStable(airStable, 'aloft', [kite], content);
  assert.equal(playerFavoredClass(airStable, content, 'aloft'), 'air', 'the duel is what teaches them');
  assert.equal(playerFavoredClass(airStable, content, 'trench'), null,
    "and it teaches nobody else — a rival's read is personal, not a broadcast");

  const biased = rivalTeam(airStable, content.rivals.aloft, content);
  assert.equal(biased.counterClass, 'water', 'a counter-biasing rival builds what beats what it saw');
  assert.equal(biased.team[1].class, 'water', 'right down to the anatomy of the second specimen');
  assert.equal(biased.team[0].class, content.rivals.aloft.classBias,
    'at one defeat the lead still flies their own flag');

  // Beaten twice, the counter moves to the LEAD — the criterion.
  const twice = structuredClone(airStable);
  twice.campaign.rivals.aloft.defeats = 2;
  const answered = rivalTeam(twice, content.rivals.aloft, content);
  assert.equal(answered.dossier.tier, 2, 'two defeats is the anatomy tier');
  assert.equal(answered.team[0].class, 'water', 'and the lead specimen is now the answer to you');

  // Dr. Mantissa does not react to the first rematch (counterBias false),
  // but the second defeat brings everyone to the table.
  const mantissaOnce = structuredClone(airStable);
  mantissaOnce.campaign.rivals.mantissa = { defeats: 1, losses: 0, scouted: structuredClone(airStable.campaign.rivals.aloft.scouted) };
  assert.equal(rivalTeam(mantissaOnce, content.rivals.mantissa, content).counterClass, null,
    'the tutorial rival lets the first rematch go');
  const mantissaTwice = structuredClone(mantissaOnce);
  mantissaTwice.campaign.rivals.mantissa.defeats = 2;
  assert.equal(rivalTeam(mantissaTwice, content.rivals.mantissa, content).counterClass, 'water',
    'but nobody lets the second one go');
}

// --- The rival payoff loop: cannon a rival's chimera, dismantle it, and
// --- receive THEIR parts at THEIR grades. Enemy tech, except the enemy is
// --- a person with opinions (ROADMAP §3.6 "Capture — theirs").
{
  const { rivalEncounter } = await import('../campaign/rivals.js');
  const region = Object.values(content.regions)[0]; // Greenfield, for the node-order fixtures
  const lab = { ...newGameState(), seed: 77 };
  lab.campaign.lastTickAt = t0;
  lab.campaign.heldNodes = [...ALL_NODE_IDS];
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
  const region = Object.values(content.regions)[0]; // Greenfield, for the node-order fixtures

  // A lab holding one captured rival specimen, ready to decide about it.
  const bayLab = (rivalId = 'mantissa', waveIndex = 0) => {
    const lab = { ...newGameState(), seed: 4242, funds: 6000 };
    lab.campaign.lastTickAt = t0;
    lab.campaign.heldNodes = [...ALL_NODE_IDS];
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
  rich.campaign.heldNodes = [...ALL_NODE_IDS];
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
  assert.deepEqual(tier1.frames, ['S', 'M'], 'Tier I is S and M — the Rumbler and the Kite are bought, not given');
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
  // A9: Tier II is a FORK, not a rung. It buys the heaviest chassis and the
  // lightest in the same purchase, so the money answers "which problem do
  // you have" rather than "are you further along".
  assert.ok(tier2.frames.includes('A'), 'Tier II buys the Kite chassis in the same breath');
  const heaviest = content.frames[[...tier2.frames].sort((a, b) => content.frames[b].phys.mass - content.frames[a].phys.mass)[0]];
  const lightest = content.frames[[...tier2.frames].sort((a, b) => content.frames[a].phys.mass - content.frames[b].phys.mass)[0]];
  assert.ok(!tier1.frames.includes(heaviest.id) && !tier1.frames.includes(lightest.id),
    `the upgrade unlocks both ends of the mass range at once (${lightest.id} and ${heaviest.id})`);
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
  // uses, never by counting part affinities across a stable.
  //
  // The original reason was that the pool was 36 Ground parts to 9 Air, so a
  // census would have read every stable as Ground. A3 fixed the pool, which
  // means the ORIGINAL justification is now false — and the rule is still
  // right for a better reason: a census counts parts, and what fights is
  // creatures. A three-creature stable of one Air specialist and two
  // two-vote Ground hybrids is an Air-and-Ground stable however the parts
  // add up. So the guard now pins the balanced pool (which A3 is on the hook
  // for keeping) and the per-creature read separately.
  const affinities = { air: 0, ground: 0, water: 0 };
  for (const part of Object.values(content.parts)) if (part.classAffinity) affinities[part.classAffinity]++;
  const spread = Math.max(...Object.values(affinities)) / Math.min(...Object.values(affinities));
  assert.ok(spread <= 1.5, `no class is the default any more — ${JSON.stringify(affinities)} is a ${spread.toFixed(2)}x spread`);
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

  // ...and it bites EVERYWHERE, not just on the one encounter this test
  // happens to pick. `weight` predicts real threat well across the roster
  // (r=0.958) but the director's promise is pairwise, and a correlation that
  // good still has local inversions: three encounter x rule pairings were
  // measured turning into mercy rules — an Air slot traded for a Ground one
  // against a Ground stable (+38pp to the player), and a 58-power unit read
  // as flimsier than a 52-power one. R18 worked around it by parking strong
  // units in the slots the director may not cut, which meant a wave order
  // was silently load-bearing. This measures the promise instead, so slot
  // order is free again.
  {
    const hero = makeSimChimera('L', P.ground, 'apex', content);
    const N = 60;
    const rateOf = (e, tag) => {
      let w = 0;
      for (let i = 0; i < N; i++) if (scriptedBattle(hero, e, content, hashString(`mercy${tag}${i}`), 3).outcome === 'win') w++;
      return w / N;
    };
    const mercies = [];
    for (const e of Object.values(content.encounters)) {
      const plainRate = rateOf(e, `p${e.id}`);
      for (const ruleId of Object.keys(content.directorRules)) {
        // Field a stable the rule actually reads, so the director commits.
        const reader = lab([chim('a', P.ground), chim('b', P.ground), chim('c', P.ground)], [P.ground, P.ground]);
        const d = directEncounter(reader, e, content);
        if (!d.directed) continue;
        const adaptedRate = rateOf(d, `a${e.id}${ruleId}`);
        // Tolerance covers sampling noise at N=60; every measured mercy was
        // +18pp or worse, so this cannot miss a real one.
        if (adaptedRate > plainRate + 0.10) {
          mercies.push(`${e.id} / ${d.directed.ruleId} -> ${d.directed.unitId}: ` +
            `${(plainRate * 100).toFixed(0)}% became ${(adaptedRate * 100).toFixed(0)}%`);
        }
      }
    }
    assert.equal(mercies.length, 0,
      `the director may never make a fight easier:\n  ${mercies.join('\n  ')}`);
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
    // Derived from the holdings, not a literal: A9 raised every node's
    // income, and a hardcoded total here would just have to be edited again
    // the next time the economy is tuned.
    const heldTotal = region.nodes
      .filter((n) => s.campaign.heldNodes.includes(n.id))
      .reduce((a, n) => a + n.incomePerDay, 0);
    assert.equal(incomeSuspended(s, content), node.incomePerDay);
    assert.equal(incomePerDay(s, content), heldTotal - node.incomePerDay, 'a contested node earns nothing');
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
    // Derived from what this empire actually holds — a literal here was a
    // pre-A9 total, and would be stale again after the next economy tune.
    const full = region.nodes
      .filter((n) => s.campaign.heldNodes.includes(n.id))
      .reduce((a, n) => a + n.incomePerDay, 0);
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
    lab.campaign.heldNodes = [...ALL_NODE_IDS];
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
    // A2: a lone chimera is never taken, so a capture fixture keeps a
    // spare on the roster.
    makeChimera(lost, 'S', { ram_head: 'standard' }, t0);
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
    won.campaign.heldNodes = [...ALL_NODE_IDS];
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
    conquered.campaign.heldNodes = [...ALL_NODE_IDS];
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

// --- Chaos-breeding: two finished chimeras into a vat, one genome out
// --- that neither of them was. Ranch breeding pairs two ANIMALS of one
// --- species and produces a predictable hybrid; this is the other thing,
// --- and the problem it has to solve is economic rather than genetic.
{
  const {
    chaosTuning, vatPlan, startVat, cancelVat, tickVat, activeVat,
    isExhausted, gradeStepsOf, vatRemainingMs,
  } = await import('../splice/chaos.js');
  const ct = chaosTuning(content);

  const vatLab = (seed, grade = 'prime') => {
    const s = { ...newGameState(), seed, funds: 9999 };
    s.facility = { theater: 2, containment: 1 };
    s.dex.parts = Object.keys(content.parts).filter((p) => content.parts[p].species !== 'salvage');
    const mk = (frame, partIds) => {
      const slots = {};
      for (const partId of partIds) {
        const id = `t${s.inventory.tokenCount++}`;
        s.inventory.parts.push({ id, partId, grade, donor: { name: 'Bessie', species: content.parts[partId].species, stars: 5, extractedAt: 0 } });
        slots[content.parts[partId].slot] = id;
      }
      const res = spliceChimera(s, frame, slots, content, t0);
      assert.ok(res.ok, res.msg);
      res.chimera.settleUntil = t0;
      return res.chimera;
    };
    mk('M', ['goat_head', 'goat_forelimbs', 'goat_hindlimbs', 'goat_hide', 'goat_organ']);
    mk('M', ['wolf_head', 'wolf_forelimbs', 'wolf_hindlimbs', 'wolf_hide', 'wolf_organ']);
    return s;
  };
  const gradeOf = (c) => Object.values(c.tokens).map((tk) => GRADE_INDEX[tk.grade]);
  const powerOf = (c) => {
    const rep = analyze(c.frame, Object.values(c.tokens), content);
    return rep.stats.hp + rep.stats.power * 3 + rep.stats.armor * 2;
  };

  // Content coherence.
  assert.ok(content.chaosNames?.length >= 8, 'the vat has names for what it produces');
  for (const key of ['start', 'decant', 'chaos', 'socket', 'news']) {
    assert.ok(content.chaosLines?.[key], `the ${key} line is written`);
  }
  assert.ok(ct.gradeDownChance > ct.gradeUpChance, 'regression is likelier than hybrid vigour');

  // Gates: two DIFFERENT, settled, rested, uninjured chimeras.
  {
    const s = vatLab(900);
    const [a, b] = s.chimeras;
    assert.ok(vatPlan(s, a.id, b.id, content, t0).ok);
    assert.ok(!vatPlan(s, a.id, a.id, content, t0).ok, 'it needs two different ones');
    assert.ok(!vatPlan(s, a.id, 'nope', content, t0).ok, 'and two real ones');
    a.settleUntil = t0 + 99 * HOUR;
    assert.ok(!vatPlan(s, a.id, b.id, content, t0).ok, 'an unsettled chimera stays out of the vat');
    a.settleUntil = t0;
    a.injury = { name: 'x', until: t0 + HOUR };
    assert.ok(!vatPlan(s, a.id, b.id, content, t0).ok, 'so does an injured one');
  }

  // THE economic rule. A chimera costs vault tokens permanently and carries
  // no upkeep, so an offspring bought with only money and time would be a
  // duplication glitch. The price is paid in GRADES, on both parents, and
  // it is not recoverable.
  {
    const s = vatLab(901, 'prismatic');
    const [a, b] = s.chimeras;
    const before = [...gradeOf(a), ...gradeOf(b)];
    const plan = vatPlan(s, a.id, b.id, content, t0);
    assert.equal(plan.gradeSteps, before.filter((g) => g > 0).length, 'the plan quotes the real cost');
    assert.ok(plan.fee > 0 && plan.hours > 0);
    const funds = s.funds;

    assert.ok(startVat(s, a.id, b.id, content, t0).ok);
    assert.equal(s.funds, funds - plan.fee, 'the fee is charged');
    const after = [...gradeOf(a), ...gradeOf(b)];
    assert.deepEqual(after, before.map((g) => Math.max(0, g - 1)), 'every part on both parents drops one grade');
    // …but the CHILD was conceived from the parents as they were before
    // they paid. Degrade first and the offspring inherits the damage, the
    // operation becomes strictly destructive, and nobody would ever use
    // the vat. This pins the ordering so a refactor cannot quietly undo it.
    const decanted = tickVat(s, content, t0 + 999 * HOUR).child;
    assert.ok(decanted, 'it decanted');
    const kidGrade = gradeOf(decanted).reduce((x, y) => x + y, 0) / gradeOf(decanted).length;
    const parentGrade = after.reduce((x, y) => x + y, 0) / after.length;
    assert.ok(
      kidGrade > parentGrade,
      `the child comes out better than the parents it cost (${kidGrade.toFixed(2)} vs ${parentGrade.toFixed(2)})`
    );
    // And the whole exchange is still deflationary: ten grade steps in,
    // about five out.
    assert.ok(
      gradeOf(decanted).length < before.length,
      'because one creature came out of two'
    );
    assert.ok(isExhausted(a, t0) && isExhausted(b, t0), 'and they both need time off');
    assert.ok(!isExhausted(a, t0 + (ct.exhaustionHours + 1) * HOUR), 'which does run out');

    // Draining it does NOT give the grades back, and the message says so.
    const later = t0 + 999 * HOUR;
    assert.ok(startVat(s, a.id, b.id, content, later).ok, 'a second gestation, to drain');
    const paid = [...gradeOf(a), ...gradeOf(b)];
    const paidFunds = s.funds;
    const drained = cancelVat(s);
    assert.ok(drained.ok);
    assert.equal(activeVat(s), null, 'the vat is empty again');
    assert.deepEqual([...gradeOf(a), ...gradeOf(b)], paid, 'cancelling gives back not one grade');
    assert.equal(s.funds, paidFunds, 'nor the fee');
    assert.equal(s.chimeras.length, 3, 'and nothing is decanted from a drained vat');
  }

  // Standard-grade parents have nothing left to give, so the fee is what
  // stops cheap junk being free.
  {
    const s = vatLab(902, 'standard');
    const [a, b] = s.chimeras;
    const plan = vatPlan(s, a.id, b.id, content, t0);
    assert.equal(plan.gradeSteps, 0, 'nothing left to degrade');
    assert.ok(plan.fee > 0, 'but it still costs money');
  }

  // The conception is sealed when the parents go in: a reload must never
  // be able to reroll a gestation.
  {
    const s = vatLab(903);
    startVat(s, s.chimeras[0].id, s.chimeras[1].id, content, t0);
    const sealed = structuredClone(s.vat.conception);
    const reloaded = JSON.parse(JSON.stringify(s));
    assert.deepEqual(reloaded.vat.conception, sealed);
    const x = tickVat(reloaded, content, t0 + 99 * HOUR).child;
    const y = tickVat(structuredClone(s), content, t0 + 99 * HOUR).child;
    assert.deepEqual(
      Object.entries(x.tokens).map(([k, v]) => [k, v.partId, v.grade]),
      Object.entries(y.tokens).map(([k, v]) => [k, v.partId, v.grade]),
      'the same genome comes out either way'
    );
    assert.equal(x.frame, y.frame);
  }

  // Decanting produces a real chimera: it renders, it fights, and its
  // parts are real vault-shaped tokens.
  {
    const s = vatLab(904);
    const [a, b] = s.chimeras;
    startVat(s, a.id, b.id, content, t0);
    assert.equal(tickVat(s, content, t0 + 1).child, null, 'not before the clock');
    assert.ok(activeVat(s), 'still gestating');
    const out = tickVat(s, content, t0 + 99 * HOUR);
    const child = out.child;
    assert.ok(child, 'something is decanted');
    assert.equal(activeVat(s), null, 'and the vat is free');
    assert.ok(s.chimeras.includes(child), 'it joins the roster');
    assert.ok(out.news.length, 'and it makes the wire');
    assert.ok(Object.keys(child.tokens).length >= 2);
    for (const [socketId, token] of Object.entries(child.tokens)) {
      assert.ok(content.parts[token.partId], 'a real part');
      assert.equal(content.parts[token.partId].slot, socketId.replace(/\d+$/, ''), 'in a socket that fits');
      assert.ok(token.id && token.grade && token.donor, 'as a proper vault-shaped token');
      assert.ok(s.dex.parts.includes(token.partId), 'logged in the Splice-Dex');
    }
    assert.equal(child.bond, 0, 'nobody has raised it yet');
    assert.ok(child.settleUntil > t0 + 99 * HOUR, 'and it has to settle like anything else');
    assert.ok(child.instability >= ct.extraInstability, 'it is measurably unrulier for having been assembled by nobody');
    assert.deepEqual(child.vatBorn.parents, [a.name, b.name], 'and it remembers where it came from');
    assert.ok(renderCreatureSVG(chimeraGenome(child, content), content).startsWith('<svg'), 'it draws');
    const fighter = combatantFromChimera(child, content, child.settleUntil);
    assert.ok(fighter.hp > 0 && fighter.moves.length, 'and it fights');
  }

  // ACCEPTANCE, part 1: a line DECAYS. This is what stops the vat being a
  // duplication economy — breed your best repeatedly and you get more
  // chimeras, each one worse, until you cross fresh stock back in.
  {
    const s = vatLab(905, 'prismatic');
    let now = t0;
    const founders = s.chimeras.map(powerOf);
    const gen0 = Math.max(...founders);
    let last = null;
    for (let gen = 0; gen < 5; gen++) {
      const rested = s.chimeras
        .filter((c) => now >= (c.exhaustedUntil ?? 0) && now >= c.settleUntil)
        .sort((x, y) => powerOf(y) - powerOf(x));
      if (rested.length < 2) break;
      const plan = vatPlan(s, rested[0].id, rested[1].id, content, now);
      if (!plan.ok) break;
      startVat(s, rested[0].id, rested[1].id, content, now);
      now += plan.hours * HOUR + 1000;
      last = tickVat(s, content, now).child;
      now += (ct.exhaustionHours + 1) * HOUR;
      for (const c of s.chimeras) c.settleUntil = Math.min(c.settleUntil, now);
    }
    assert.ok(last, 'five generations ran');
    assert.ok(powerOf(last) < gen0, `the line is weaker than its founders (${Math.round(powerOf(last))} vs ${Math.round(gen0)})`);
    const roster = s.chimeras.flatMap(gradeOf);
    assert.ok(
      roster.reduce((x, y) => x + y, 0) / roster.length < GRADE_INDEX.prismatic,
      'and the whole roster has slid down the grade ladder'
    );
  }

  // ACCEPTANCE, part 2: the vat does not read your permits, and it is a
  // lottery rather than a downgrade machine. Measured over many seeds
  // because any single gestation proves nothing.
  {
    let beat = 0, chaos = 0, newSocket = 0, newFrame = 0, runs = 0;
    for (let seed = 0; seed < 200; seed++) {
      const s = vatLab(3000 + seed);
      const [a, b] = s.chimeras;
      const best = Math.max(powerOf(a), powerOf(b));
      const sockets = new Set([...Object.keys(a.tokens), ...Object.keys(b.tokens)]);
      if (!startVat(s, a.id, b.id, content, t0).ok) continue;
      const child = tickVat(s, content, t0 + 99 * HOUR).child;
      if (!child) continue;
      runs++;
      if (powerOf(child) > best) beat++;
      if (child.vatBorn.chaosParts.length) chaos++;
      if (Object.keys(child.tokens).some((k) => !sockets.has(k))) newSocket++;
      if (child.frame !== a.frame && child.frame !== b.frame) newFrame++;
    }
    assert.ok(runs > 150, 'the sample ran');
    // A lottery: usually a sidegrade tilted down, sometimes a winner.
    assert.ok(beat / runs > 0.03, `a child can beat its best parent (${Math.round((beat / runs) * 100)}%)`);
    assert.ok(beat / runs < 0.4, `but usually does not (${Math.round((beat / runs) * 100)}%)`);
    assert.ok(chaos / runs > 0.2, `chaos parts turn up often enough to matter (${Math.round((chaos / runs) * 100)}%)`);
    // The clause that makes this more than recombination. It measured ZERO
    // before extraSocketChance existed, because the union of two
    // five-socket parents is, inevitably, five sockets.
    assert.ok(
      newSocket / runs > 0.05,
      `the vat can install a socket neither parent had (${Math.round((newSocket / runs) * 100)}%)`
    );
    assert.ok(newFrame > 0, 'and occasionally a frame neither parent used');
  }

  // Hybrid vigour is real, not just a tuning value nobody reads: a token
  // can come out a grade ABOVE the parent it was inherited from.
  {
    let up = 0, down = 0, sampled = 0;
    for (let seed = 0; seed < 200; seed++) {
      const s = vatLab(4000 + seed);
      const [a, b] = s.chimeras;
      const parentGrade = {};
      for (const [socketId, tk] of Object.entries(a.tokens)) parentGrade[socketId] = GRADE_INDEX[tk.grade];
      for (const [socketId, tk] of Object.entries(b.tokens)) parentGrade[socketId] = GRADE_INDEX[tk.grade];
      if (!startVat(s, a.id, b.id, content, t0).ok) continue;
      const child = tickVat(s, content, t0 + 99 * HOUR).child;
      if (!child) continue;
      for (const [socketId, tk] of Object.entries(child.tokens)) {
        if (parentGrade[socketId] == null) continue; // a socket the vat added
        sampled++;
        if (GRADE_INDEX[tk.grade] > parentGrade[socketId]) up++;
        if (GRADE_INDEX[tk.grade] < parentGrade[socketId]) down++;
      }
    }
    assert.ok(sampled > 500, 'the sample ran');
    assert.ok(up > 0, 'a part can come out better than the parent it came from');
    assert.ok(down > up, `but regression is the commoner way (${down} down vs ${up} up)`);
  }

  // A socket only ONE parent filled does not always carry over — this is
  // where a child comes out simpler than either parent, and it is the
  // honest half of "chaos". Needs asymmetric parents to test at all: two
  // five-socket builds share every socket, so the rule never runs.
  {
    let kept = 0, dropped = 0;
    for (let seed = 0; seed < 200; seed++) {
      const s = { ...newGameState(), seed: 6000 + seed, funds: 9999 };
      s.facility = { theater: 2, containment: 1 };
      s.dex.parts = Object.keys(content.parts).filter((p) => content.parts[p].species !== 'salvage');
      const mk = (partIds) => {
        const slots = {};
        for (const partId of partIds) {
          const id = `t${s.inventory.tokenCount++}`;
          s.inventory.parts.push({ id, partId, grade: 'prime', donor: { name: 'X', species: content.parts[partId].species, stars: 5, extractedAt: 0 } });
          slots[content.parts[partId].slot] = id;
        }
        const res = spliceChimera(s, 'M', slots, content, t0);
        res.chimera.settleUntil = t0;
        return res.chimera;
      };
      // Only one of them has a tail.
      const a = mk(['goat_head', 'goat_forelimbs', 'goat_tail']);
      const b = mk(['wolf_head', 'wolf_forelimbs']);
      if (!startVat(s, a.id, b.id, content, t0).ok) continue;
      const child = tickVat(s, content, t0 + 99 * HOUR).child;
      if (!child) continue;
      // Ignore the rare gestation where the vat installed its own tail.
      if (child.vatBorn.extraSockets.includes('tail')) continue;
      if (child.tokens.tail) kept++; else dropped++;
    }
    assert.ok(kept > 0 && dropped > 0, `a one-parent socket sometimes carries and sometimes does not (${kept} kept, ${dropped} dropped)`);
    assert.ok(kept > dropped, `though it usually carries (${kept} vs ${dropped})`);
  }

  // The wild card draws from the SPLICE-DEX, not from the whole roster. A
  // vat that hands a day-one player a shark spine is not chaotic, it is
  // broken — the chaos is only ever anatomy you have already seen.
  {
    const known = new Set();
    let chaosSeen = 0;
    for (let seed = 0; seed < 120; seed++) {
      const s = vatLab(5000 + seed);
      // A player who has only ever met goats and wolves.
      s.dex.parts = Object.keys(content.parts).filter(
        (p) => ['goat', 'wolf'].includes(content.parts[p].species)
      );
      for (const p of s.dex.parts) known.add(p);
      const [a, b] = s.chimeras;
      if (!startVat(s, a.id, b.id, content, t0).ok) continue;
      const child = tickVat(s, content, t0 + 99 * HOUR).child;
      if (!child) continue;
      for (const partId of child.vatBorn.chaosParts) {
        chaosSeen++;
        assert.ok(known.has(partId), `the vat produced ${partId}, which this player has never seen`);
      }
      for (const socketId of child.vatBorn.extraSockets) {
        assert.ok(known.has(child.tokens[socketId].partId), 'and neither did it install one');
      }
    }
    assert.ok(chaosSeen > 10, `the sample actually contained wild cards (${chaosSeen})`);
  }
}

// --- Chimera extraction (§3.3 "chimeras can also be extracted — returns a
// --- SUBSET of parts, one grade degraded. Salvage, not free recycling").
// --- The Surgery Theater's missing undo: splicing consumed vault tokens
// --- permanently, so a chimera was a one-way sink.
{
  const { salvagePreview, extractChimera, CHIMERA_SALVAGE } = await import('../splice/extract.js');

  const dismLab = (seed, grade = 'apex') => {
    const s = { ...newGameState(), seed, funds: 500 };
    s.facility = { theater: 2, containment: 1 };
    const slots = {};
    for (const partId of ['goat_head', 'goat_forelimbs', 'goat_hindlimbs', 'goat_tail', 'goat_hide', 'goat_organ']) {
      const id = `t${s.inventory.tokenCount++}`;
      s.inventory.parts.push({ id, partId, grade, donor: { name: 'Bessie', species: 'goat', stars: 4, extractedAt: 0 } });
      slots[content.parts[partId].slot] = id;
    }
    const res = spliceChimera(s, 'M', slots, content, t0);
    assert.ok(res.ok, res.msg);
    res.chimera.settleUntil = t0;
    return s;
  };

  // Salvage, not recycling: SOME of it back, a grade poorer.
  {
    const s = dismLab(700);
    const ch = s.chimeras[0];
    const sockets = Object.keys(ch.tokens).length;
    const preview = salvagePreview(s, ch, content);
    assert.ok(preview.tokens.length >= 1 && preview.tokens.length < sockets, `a subset comes back (${preview.tokens.length}/${sockets})`);
    assert.equal(preview.tokens.length + preview.lose.length, sockets, 'and the rest is accounted for');
    for (const spec of preview.tokens) {
      assert.equal(GRADE_INDEX[spec.grade], GRADE_INDEX[spec.wasGrade] - 1, 'each one a grade poorer');
    }
    // Deterministic, so the confirmation a player is shown cannot disagree
    // with what they get.
    assert.deepEqual(salvagePreview(s, ch, content), preview, 'the preview is stable');

    const before = s.inventory.parts.length;
    const out = extractChimera(s, ch.id, content, t0);
    assert.ok(out.ok, out.msg);
    assert.equal(s.chimeras.length, 0, 'the chimera leaves the roster for good');
    assert.equal(s.inventory.parts.length, before + preview.tokens.length, 'and only the subset reaches the vault');
    for (const [i, token] of s.inventory.parts.slice(before).entries()) {
      assert.equal(token.partId, preview.tokens[i].partId, 'exactly what the preview promised');
      assert.equal(token.grade, preview.tokens[i].grade);
      assert.equal(token.donor.name, 'Bessie', 'lineage survives the creature');
      assert.ok(s.dex.parts.includes(token.partId));
    }
    // The recovered tokens are real: they can be spliced straight back.
    const slots = Object.fromEntries(
      s.inventory.parts.slice(before).map((tk) => [content.parts[tk.partId].slot, tk.id])
    );
    if (slots.head) assert.deepEqual(validateSplice(s, 'M', slots, content), [], 'and they build');
  }

  // Standard-grade parts have nothing left to lose, so salvage floors out
  // rather than deleting them.
  {
    const s = dismLab(701, 'standard');
    const preview = salvagePreview(s, s.chimeras[0], content);
    for (const spec of preview.tokens) assert.equal(spec.grade, 'standard', 'the floor holds');
  }

  // Guards: not mid-battle, and not while they are in the vat.
  {
    const s = dismLab(702);
    s.battle = { fake: true };
    assert.ok(!extractChimera(s, s.chimeras[0].id, content, t0).ok, 'not during a battle');
    s.battle = null;
    s.vat = { parents: [s.chimeras[0].id], parentNames: ['x'], until: t0 + 99 * HOUR, conception: {} };
    assert.ok(!extractChimera(s, s.chimeras[0].id, content, t0).ok, 'nor while they are in the vat');
    s.vat = null;
    assert.ok(extractChimera(s, s.chimeras[0].id, content, t0).ok, 'otherwise, fine');
    assert.ok(!extractChimera(s, 'nope', content, t0).ok, 'and an unknown id is refused');
  }

  // It is a LOSS overall — that is what makes it salvage. Never a way to
  // launder a build into a better one.
  {
    let recovered = 0, consumed = 0;
    for (let seed = 0; seed < 60; seed++) {
      const s = dismLab(1500 + seed, 'prismatic');
      const ch = s.chimeras[0];
      consumed += Object.values(ch.tokens).reduce((sum, tk) => sum + GRADE_INDEX[tk.grade] + 1, 0);
      const before = s.inventory.parts.length;
      extractChimera(s, ch.id, content, t0);
      recovered += s.inventory.parts.slice(before).reduce((sum, tk) => sum + GRADE_INDEX[tk.grade] + 1, 0);
    }
    assert.ok(recovered < consumed * 0.75, `dismantling returns well under what it consumed (${recovered} vs ${consumed})`);
  }
}

// --- Temperament (§3.5): two axes, seeded by the dominant donor species
// --- and drifted by how you raise them. The field has carried `null` and a
// --- comment promising "seeded on settling" since M3.
{
  const {
    seedTemperament, ensureTemperaments, describe, perksOf, dominantSpecies,
    biasFor, driftFromTraining, driftFromBattle, tempTuning,
  } = await import('../splice/temperament.js');
  const tt = tempTuning(content);

  // Content coherence: every species' role has a bias, and the axes stay
  // inside the range the labels are written for.
  for (const species of Object.values(content.species)) {
    const bias = biasFor(species.id, content);
    assert.ok(bias, `${species.id} has a temperament bias`);
    for (const axis of ['nerve', 'temper']) {
      assert.ok(Number.isFinite(bias[axis]), `${species.id}.${axis} is a number`);
      assert.ok(Math.abs(bias[axis]) <= 100, `${species.id}.${axis} is in range`);
    }
  }
  for (const axis of ['nerve', 'temper']) {
    for (const band of ['high', 'low', 'mid']) {
      assert.ok(content.temperamentLabels[axis][band].name, `${axis}.${band} is labelled`);
      assert.ok(content.temperamentLabels[axis][band].perk, 'and its perk is described');
    }
  }

  const tempLab = (seed, partIds, grade = 'prime') => {
    const s = { ...newGameState(), seed, funds: 500 };
    const slots = {};
    for (const partId of partIds) {
      const id = `t${s.inventory.tokenCount++}`;
      s.inventory.parts.push({ id, partId, grade, donor: { name: 'X', species: content.parts[partId].species, stars: 4, extractedAt: 0 } });
      slots[content.parts[partId].slot] = id;
    }
    const res = spliceChimera(s, 'M', slots, content, t0);
    assert.ok(res.ok, res.msg);
    return s;
  };

  // It is SEEDED BY THE ANATOMY. A bear-heavy build is fierce because it is
  // mostly bear — the same promise class and tags already make.
  {
    const s = tempLab(710, ['bear_head', 'bear_forelimbs', 'bear_hindlimbs', 'bear_hide', 'goat_organ']);
    const ch = s.chimeras[0];
    assert.equal(dominantSpecies(ch, content), 'bear', 'the dominant donor is the one that put the most parts in');
    // …by COUNT, not by name. A wolf-heavy build carrying one bear part is
    // a wolf, and alphabetical order would say otherwise.
    const wolfish = tempLab(717, ['wolf_head', 'wolf_forelimbs', 'wolf_hindlimbs', 'wolf_hide', 'bear_organ']);
    assert.equal(dominantSpecies(wolfish.chimeras[0], content), 'wolf', 'four wolf parts beat one bear part');
    assert.equal(ch.temperament, null, 'an unsettled chimera has no opinions yet');
    assert.deepEqual(ensureTemperaments(s, content, t0), [], 'and does not get any while it settles');
    ch.settleUntil = t0;
    const seeded = ensureTemperaments(s, content, t0);
    assert.equal(seeded.length, 1, 'settling is when it acquires them');
    assert.equal(ch.temperament.from, 'bear');
    const bias = biasFor('bear', content);
    assert.ok(Math.abs(ch.temperament.nerve - bias.nerve) <= tt.spread + 1, 'near its species bias');
    assert.ok(Math.abs(ch.temperament.temper - bias.temper) <= tt.spread + 1);
    assert.deepEqual(ensureTemperaments(s, content, t0), [], 'and it only happens once');
    // Seeded, so the same save always produces the same animal.
    assert.deepEqual(seedTemperament(ch, content, s.seed), seedTemperament(ch, content, s.seed));

    const shown = describe(ch, content);
    assert.ok(shown.label.includes('·'), `it reads as two axes (${shown.label})`);
  }

  // A tortoise build and a shark build are different animals.
  {
    const calm = tempLab(711, ['tortoise_head', 'tortoise_forelimbs', 'tortoise_hindlimbs', 'tortoise_hide']);
    const savage = tempLab(712, ['shark_head', 'shark_forelimbs', 'shark_hindlimbs', 'shark_hide']);
    for (const s of [calm, savage]) { s.chimeras[0].settleUntil = t0; ensureTemperaments(s, content, t0); }
    assert.ok(
      savage.chimeras[0].temperament.temper > calm.chimeras[0].temperament.temper + 40,
      'the shark is markedly fiercer than the tortoise'
    );
    assert.equal(describe(savage.chimeras[0], content).temper.id, 'fierce');
    assert.equal(describe(calm.chimeras[0], content).temper.id, 'gentle');
  }

  // Perks are PASSIVE STAT EFFECTS ONLY. §3.5's "never removes player
  // control" rules out anything that takes a turn away — obedience already
  // occupies that space and is the only thing allowed to.
  {
    const s = tempLab(713, ['shark_head', 'shark_forelimbs', 'shark_hindlimbs', 'shark_hide']);
    const ch = s.chimeras[0];
    ch.settleUntil = t0;
    ensureTemperaments(s, content, t0);
    const perks = perksOf(ch, content);
    assert.deepEqual(
      Object.keys(perks).sort(),
      ['critChance', 'critMult', 'evasion', 'guardLoss', 'lastStandAt', 'power', 'regen'],
      'the perk surface is stats and nothing else'
    );
    assert.ok(perks.power > 0, 'a fierce creature hits harder');
    assert.ok(perks.guardLoss > 0, 'and guards worse for it');
    // …and the combatant carries them, while enemy units carry nothing.
    const mine = combatantFromChimera(ch, content, t0);
    assert.ok(mine.perks.power > 0);
    assert.equal(mine.ignoreChance, obedienceIgnoreChance(ch, t0), 'control is still obedience’s job alone');
    const theirs = combatantFromUnit(content.enemies.riot_squad);
    assert.equal(theirs.perks.power, 0, 'nothing about the opposition changed');
    assert.equal(theirs.perks.critChance, 0);
  }

  // Expressed only past the threshold, and scaled by how far past — one
  // point over the line is not a whole perk.
  {
    const s = tempLab(714, ['goat_head', 'goat_forelimbs']);
    const ch = s.chimeras[0];
    ch.temperament = { nerve: 0, temper: 0, from: 'goat' };
    assert.equal(perksOf(ch, content).power, 0, 'an even creature gets nothing');
    assert.equal(describe(ch, content).perks.length, 0, 'and is described as having no strong feelings');
    ch.temperament.temper = tt.expressAt;
    assert.equal(perksOf(ch, content).power, 0, 'crossing the line is worth nothing on its own');
    ch.temperament.temper = 100;
    assert.ok(Math.abs(perksOf(ch, content).power - tt.fiercePowerAt100) < 1e-9, 'the extreme is worth the full perk');
    ch.temperament.temper = Math.round((100 + tt.expressAt) / 2);
    assert.ok(Math.abs(perksOf(ch, content).power - tt.fiercePowerAt100 / 2) < 0.01, 'and halfway is worth half');
  }

  // DRIFT: every existing verb now shapes who the creature becomes.
  {
    const s = tempLab(715, ['goat_head', 'goat_forelimbs', 'goat_hindlimbs']);
    const ch = s.chimeras[0];
    ch.settleUntil = t0;
    ensureTemperaments(s, content, t0);
    const before = { ...ch.temperament };

    driftFromTraining(ch, content);
    assert.equal(ch.temperament.nerve, before.nerve + tt.driftTrainNerve, 'training makes them braver');
    assert.equal(ch.temperament.temper, before.temper + tt.driftTrainTemper, 'and gentler with it');

    driftFromBattle(ch, content, { won: true, knockedOut: false });
    assert.equal(ch.temperament.temper, before.temper + tt.driftTrainTemper + tt.driftPerWin, 'winning makes them fiercer');
    driftFromBattle(ch, content, { won: false, knockedOut: true });
    assert.equal(ch.temperament.nerve, before.nerve + tt.driftTrainNerve + tt.driftPerKO, 'going down makes them warier');

    // The axes are bounded, so a long career cannot run away.
    for (let i = 0; i < 200; i++) driftFromBattle(ch, content, { won: true, knockedOut: true });
    assert.ok(Math.abs(ch.temperament.temper) <= 100 && Math.abs(ch.temperament.nerve) <= 100, 'and bounded');
  }

  // …and it happens through the verbs the player actually uses, not just
  // when the drift functions are called directly.
  {
    const s = tempLab(718, ['goat_head', 'goat_forelimbs', 'goat_hindlimbs'], 'apex');
    const ch = s.chimeras[0];
    ch.settleUntil = t0;
    ensureTemperaments(s, content, t0);
    s.funds = 500;

    const nerveBefore = ch.temperament.nerve;
    const trained = trainChimera(s, ch.id, t0, content);
    assert.ok(trained.ok, trained.msg);
    assert.ok(ch.temperament.nerve > nerveBefore, 'TRAINING shapes them, through trainChimera itself');

    // A won battle, resolved the way the game resolves one.
    const temperBefore = ch.temperament.temper;
    s.campaign.lastTickAt = t0;
    s.battle = createBattle([ch], content.encounters.patrol_1, content, 3, t0, { kind: 'assault', nodeId: null });
    let guard = 0;
    while (!s.battle.over && guard++ < 200) {
      s.battle.enemy.active.hp = 0;
      step(s.battle, playerActions(s.battle)[0] ?? { type: 'rest' }, content);
    }
    assert.equal(s.battle.outcome, 'win');
    resolveBattle(s, s.battle, content, t0);
    assert.ok(ch.temperament.temper > temperBefore, 'and A CAREER shapes them, through the real aftermath');
  }

  // ACCEPTANCE: the perks actually reach the fight. A Fierce creature hits
  // measurably harder than the identical creature without the temperament.
  {
    const mk = (temper) => {
      const s = tempLab(716, ['bear_head', 'bear_forelimbs', 'bear_hindlimbs', 'bear_hide'], 'apex');
      const ch = s.chimeras[0];
      ch.settleUntil = t0;
      ch.temperament = { nerve: 0, temper, from: 'bear' };
      return { s, ch };
    };
    const damageOver = (temper, seeds = 24) => {
      let total = 0;
      for (let seed = 0; seed < seeds; seed++) {
        const { s, ch } = mk(temper);
        const battle = createBattle([ch], content.encounters.patrol_1, content, seed + 1, t0, {});
        const foe = battle.enemy.active;
        // The foe has to SURVIVE the hit or the measurement reads the next
        // wave's health instead of the damage dealt — which is exactly how
        // this returned an identical number for both temperaments first time.
        foe.maxHp = 9999;
        foe.hp = 9999;
        const hp0 = foe.hp;
        const act = playerActions(battle).filter((a) => a.type === 'move')
          .sort((x, y) => playerActive(battle).moves[y.index].power - playerActive(battle).moves[x.index].power)[0];
        step(battle, act, content);
        total += hp0 - battle.enemy.active.hp;
      }
      return total / seeds;
    };
    const even = damageOver(0);
    const fierce = damageOver(100);
    assert.ok(fierce > even, `a Fierce creature hits harder in the actual engine (${even.toFixed(1)} → ${fierce.toFixed(1)})`);
    assert.ok(fierce < even * 1.4, 'but not absurdly so');
  }
}

// --- Injury scarring (§3.5: "untreated injuries can scar into permanent
// --- trait tradeoffs"). An injury has always opened an Infirmary timer and
// --- then quietly expired. Now there is something to do about it, and a
// --- consequence for not doing it.
{
  const {
    scarTuning, scarList, scarsOf, flatModifiers, scarEffects, againstTags,
    describeScar, treatInjury, treatmentCost, tickScars,
  } = await import('../splice/scars.js');
  const st = scarTuning(content);
  const scars = scarList(content);

  // Content coherence, and the rule the whole design rests on: EVERY scar
  // is two-sided. A scar is character, not a punishment — which is what
  // makes "leave it and see" a real choice rather than a mistake.
  const UNIT_TAGS = new Set(Object.values(content.enemies).flatMap((u) => u.tags));
  assert.ok(scars.length >= 6, 'there is a pool worth rolling from');
  for (const scar of scars) {
    assert.ok(scar.name && scar.line?.includes('{name}'), `${scar.id} is written and names the creature`);
    const values = Object.values(scar.effects);
    assert.ok(values.length >= 2, `${scar.id} has at least two effects`);
    assert.ok(values.some((v) => v > 0), `${scar.id} gives something`);
    assert.ok(values.some((v) => v < 0), `${scar.id} takes something — no scar is a pure penalty, or a free upgrade`);
    for (const tag of scar.vs ?? []) {
      assert.ok(UNIT_TAGS.has(tag), `${scar.id}: nothing in the enemy roster carries the tag ${tag}`);
    }
  }
  // The roadmap's own example has to be expressible.
  const jeep = content.scars.jeep_shy;
  assert.ok(jeep && jeep.vs.includes('Vehicle') && jeep.effects.evasion > 0 && jeep.effects.acc < 0,
    'ROADMAP §3.5’s "fears jeeps: +Evasion vs. vehicles, −Accuracy vs. vehicles" is data');

  const scarLab = (seed) => {
    const s = { ...newGameState(), seed, funds: 2000 };
    const slots = {};
    for (const partId of ['bear_head', 'bear_forelimbs', 'bear_hindlimbs', 'bear_hide']) {
      const id = `t${s.inventory.tokenCount++}`;
      s.inventory.parts.push({ id, partId, grade: 'apex', donor: { name: 'X', species: 'bear', stars: 4, extractedAt: 0 } });
      slots[content.parts[partId].slot] = id;
    }
    const res = spliceChimera(s, 'M', slots, content, t0);
    assert.ok(res.ok, res.msg);
    res.chimera.settleUntil = t0;
    return s;
  };
  const hurt = (ch, hours = 4) => { ch.injury = { name: 'Sprained Everything', until: t0 + hours * HOUR }; };

  // Treatment buys CERTAINTY, not healing: the injury still had to happen,
  // and what you are paying for is that it leaves nothing behind.
  {
    const s = scarLab(760);
    const ch = s.chimeras[0];
    hurt(ch);
    const early = treatmentCost(ch, content, t0);
    const late = treatmentCost(ch, content, t0 + 3 * HOUR);
    assert.ok(early > late, `an early visit costs more than sweeping up at the end (${early} → ${late})`);

    const funds = s.funds;
    const out = treatInjury(s, ch.id, content, t0);
    assert.ok(out.ok, out.msg);
    assert.equal(s.funds, funds - early, 'and it is charged');
    assert.equal(ch.injury, null, 'the injury is gone');
    assert.ok(!isInjured(ch, t0), 'and they are cleared for deployment');
    // …and it cannot scar, because there is nothing left to scar.
    for (let i = 0; i < 50; i++) tickScars(s, content, t0 + (i + 1) * HOUR);
    assert.deepEqual(ch.scars, [], 'a treated injury never sets badly');
    assert.equal(ch.injuriesTreated, 1, 'the record remembers you paid');

    assert.ok(!treatInjury(s, ch.id, content, t0).ok, 'nothing to treat twice');
    hurt(ch);
    assert.ok(!treatInjury(s, ch.id, content, t0 + 99 * HOUR).ok, 'and too late is too late');
    s.funds = 0;
    assert.ok(!treatInjury(s, ch.id, content, t0).ok, 'the Infirmary does not take promises');
  }

  // Left alone, an injury runs its course and may set. Either way the
  // creature is deployable again — a scar is not a second injury.
  {
    let scarredRuns = 0;
    let cleanRuns = 0;
    for (let seed = 0; seed < 120; seed++) {
      const s = scarLab(2500 + seed);
      const ch = s.chimeras[0];
      hurt(ch);
      assert.deepEqual(tickScars(s, content, t0 + HOUR).scarred, [], 'nothing resolves while it is still healing');
      assert.ok(isInjured(ch, t0 + HOUR));
      const out = tickScars(s, content, t0 + 5 * HOUR);
      assert.equal(ch.injury, null, 'the injury always clears when its time is up');
      assert.ok(!isInjured(ch, t0 + 5 * HOUR), 'and a scar never keeps them benched');
      if (out.scarred.length) {
        scarredRuns++;
        assert.equal(out.news.length, 1, 'a scar makes the wire');
        assert.ok(out.news[0].includes(ch.name), 'and names the creature');
        assert.equal(ch.scars.length, 1);
      } else {
        cleanRuns++;
        assert.deepEqual(ch.scars, []);
      }
    }
    assert.ok(scarredRuns > 0 && cleanRuns > 0, `it is a risk, not a certainty (${scarredRuns} scarred, ${cleanRuns} clean of 120)`);
    const rate = scarredRuns / 120;
    assert.ok(Math.abs(rate - st.scarChance) < 0.12, `and lands near the tuned rate (${(rate * 100).toFixed(0)}% vs ${st.scarChance * 100}%)`);
  }

  // Bounded: never the same scar twice, never more than the cap.
  {
    // Across many careers, because three draws from a pool of ten collide
    // about a quarter of the time — one career proves nothing.
    let everScarred = 0;
    for (let seed = 0; seed < 80; seed++) {
      const s = scarLab(4400 + seed);
      const ch = s.chimeras[0];
      for (let i = 0; i < 40; i++) {
        hurt(ch);
        tickScars(s, content, t0 + (i + 1) * 10 * HOUR);
      }
      assert.ok(ch.scars.length <= st.maxScars, `at most ${st.maxScars} scars (${ch.scars.length})`);
      assert.equal(new Set(ch.scars).size, ch.scars.length, `never the same scar twice (${ch.scars.join(', ')})`);
      if (ch.scars.length) everScarred++;
    }
    assert.ok(everScarred > 70, `and forty injuries do leave a mark (${everScarred}/80 careers)`);
  }

  // ACCEPTANCE: "fears jeeps" is a real number in a real fight. The same
  // creature, the same seed, the same move — against a Vehicle and against
  // something Organic — behaves differently, and ONLY against the Vehicle.
  {
    // 200 seeds, not 30: the gap this is asserting is about nine points,
    // which a thirty-sample run can lose in the noise entirely.
    const measure = (scarIds, foeId, seeds = 200) => {
      let hits = 0, damage = 0, tries = 0;
      for (let seed = 0; seed < seeds; seed++) {
        const s = scarLab(3300 + seed);
        const ch = s.chimeras[0];
        ch.scars = scarIds;
        const enc = { id: 'probe', name: 'Probe', waves: [foeId], reward: 0 };
        const battle = createBattle([ch], enc, content, seed + 1, t0, {});
        const foe = battle.enemy.active;
        foe.maxHp = 99999;
        foe.hp = 99999;
        const before = foe.hp;
        const act = playerActions(battle).filter((a) => a.type === 'move')
          .sort((x, y) => playerActive(battle).moves[y.index].power - playerActive(battle).moves[x.index].power)[0];
        step(battle, act, content);
        tries++;
        const dealt = before - battle.enemy.active.hp;
        if (dealt > 0) { hits++; damage += dealt; }
      }
      return { hitRate: hits / tries, avg: damage / Math.max(1, hits) };
    };
    // police_cruiser is a Vehicle; riot_squad is Organic.
    const cleanVsVan = measure([], 'police_cruiser');
    const shyVsVan = measure(['jeep_shy'], 'police_cruiser');
    const cleanVsMen = measure([], 'riot_squad');
    const shyVsMen = measure(['jeep_shy'], 'riot_squad');
    assert.ok(
      shyVsVan.hitRate < cleanVsVan.hitRate,
      `a jeep-shy creature misses vans more (${(cleanVsVan.hitRate * 100).toFixed(0)}% → ${(shyVsVan.hitRate * 100).toFixed(0)}%)`
    );
    assert.equal(
      shyVsMen.hitRate,
      cleanVsMen.hitRate,
      'and is completely unchanged against everything else — the scar is about VANS'
    );

    // The other half of the same scar: it is harder to hit, but only by a van.
    const hitBy = (scarIds, foeId, seeds = 150) => {
      let landed = 0;
      for (let seed = 0; seed < seeds; seed++) {
        const s = scarLab(3400 + seed);
        const ch = s.chimeras[0];
        ch.scars = scarIds;
        const enc = { id: 'probe', name: 'Probe', waves: [foeId], reward: 0 };
        const battle = createBattle([ch], enc, content, seed + 7, t0, {});
        const me = playerActive(battle);
        me.maxHp = 99999;
        me.hp = 99999;
        const before = me.hp;
        step(battle, { type: 'rest' }, content);
        if (playerActive(battle).hp < before) landed++;
      }
      return landed / seeds;
    };
    const takenClean = hitBy([], 'police_cruiser');
    const takenShy = hitBy(['jeep_shy'], 'police_cruiser');
    assert.ok(takenShy < takenClean, `and dodges them better (${(takenClean * 100).toFixed(0)}% → ${(takenShy * 100).toFixed(0)}% landed)`);
  }

  // Unconditional scars reach the stats directly, and enemies carry none.
  {
    const s = scarLab(762);
    const ch = s.chimeras[0];
    const base = combatantFromChimera(ch, content, t0);
    ch.scars = ['reinforced_limp'];
    const limped = combatantFromChimera(ch, content, t0);
    assert.equal(limped.speed, Math.max(1, base.speed + content.scars.reinforced_limp.effects.speed), 'a flat scar moves the stat');
    assert.deepEqual(flatModifiers({ scars: ['jeep_shy'] }, content), { speed: 0, regen: 0 }, 'a conditional one does not');
    assert.deepEqual(combatantFromUnit(content.enemies.riot_squad).scars, [], 'and the opposition has no scars at all');
    // Summing: two scars against one opponent add up; the wrong tag adds nothing.
    const both = againstTags(scarEffects({ scars: ['jeep_shy', 'kazoo_tinnitus'] }, content), ['Vehicle']);
    const onlyRinging = againstTags(scarEffects({ scars: ['jeep_shy', 'kazoo_tinnitus'] }, content), ['Organic']);
    assert.ok(both.acc < onlyRinging.acc, 'the van scar only counts against vans');
    assert.equal(onlyRinging.acc, content.scars.kazoo_tinnitus.effects.acc, 'leaving just the unconditional one');
  }

  // It reads as character: a description a player can act on.
  {
    const shown = describeScar(content.scars.jeep_shy, 'Chompers');
    assert.ok(shown.line.startsWith('Chompers'), 'the line is about this creature');
    assert.ok(shown.summary.includes('vs Vehicle'), `and says what it applies to (${shown.summary})`);
    assert.ok(/evasion/.test(shown.summary) && /accuracy/.test(shown.summary), 'and states both sides of the trade');
  }
}

// --- War Room sub-navigation. Thirteen cards in one column became five
// --- views behind a tab bar, and the whole restructure rests on one rule:
// --- ALERTS NEVER GO BEHIND A TAB.
{
  const src = readFileSync(join(root, 'campaign/ui.js'), 'utf8');
  const viewsAt = src.indexOf('const views = {');
  const htmlAt = src.indexOf('root.innerHTML');
  const handlerAt = src.indexOf("button[data-war-tab]");
  assert.ok(viewsAt > 0 && htmlAt > viewsAt && handlerAt > htmlAt, 'the War Room still has a view map, a template and a tab handler');

  const viewMap = src.slice(viewsAt, htmlAt);
  const template = src.slice(htmlAt, handlerAt);

  // A rescue window and a counter-offensive both carry live countdowns
  // that cost a creature or a node when they run out. Putting either
  // inside a tab view would recreate exactly the failure mode region
  // contestation was designed to avoid.
  for (const alert of ['contests', 'captives']) {
    assert.ok(
      !viewMap.includes('${' + alert),
      `the ${alert} alert must not live inside a tab view — it would be invisible from four of the five`
    );
    assert.ok(template.includes('${' + alert), `the ${alert} alert is still rendered`);
    assert.ok(
      template.indexOf('${' + alert) < template.indexOf('${subtabBar'),
      `and sits above the tab bar, so it shows on every view`
    );
  }

  // Every tab the bar offers has somewhere to go.
  const ids = [...src.matchAll(/\{ id: '(\w+)', icon:/g)].map((m) => m[1]);
  assert.ok(ids.length >= 4, `the bar has tabs (${ids.join(', ')})`);
  for (const id of ids) {
    assert.ok(new RegExp(`(^|\\W)${id}:`).test(viewMap), `tab "${id}" has a view`);
  }
  // …and the fallback means an unknown tab can never render nothing.
  assert.ok(template.includes('?? views.map'), 'an unrecognised tab falls back to the map rather than a blank screen');
}

const pctOf = (x) => `${Math.round(x * 100)}%`;
const classOfSpecies = (id) => content.species[id]?.class ?? null;

// --- A1/A2: the solo cliff, and never being stranded on it -------------
//
// The audit measured the second node of the campaign at a flat 0% for a
// player with one chimera and 79% with three, and found the cause was not
// numeric: combat is one active per side over a queue, so three enemy
// bodies means grinding three health bars with one of your own. patrol_2 at
// TIER-1 stats and three waves is still 0%; the same fight at full tier-2
// stats and two waves is 28%. Bodies, not numbers — so no stat pass fixes
// it, and the fix is that the game has to SAY so and must never strand the
// player who finds out late.
{
  const region = Object.values(content.regions)[0];

  // --- The curve the audit found is still the curve. If a future balance
  // pass flattens it, this section's whole premise is gone and it should
  // fail loudly rather than keep guarding a problem that moved.
  const curve = ladderBench(content, { seedsPer: 24 });
  const first = curve[0];
  const second = curve[1];
  assert.ok(first.bySize[0] >= 0.9, `the first node is a solo win (${pctOf(first.bySize[0])})`);
  assert.ok(second.bySize[0] <= 0.05, `the second is not (${pctOf(second.bySize[0])} solo)`);
  assert.ok(second.bySize[2] >= 0.5,
    `and it is a real fight with a stable (${pctOf(second.bySize[2])} at three) — bodies, not numbers`);

  // --- THE FIX. The briefing runs the actual fight and reports what it
  // found, so the game can no longer present an unwinnable assault as
  // though it were a choice. Two properties, and the second matters more:
  //
  //   1. a fight that cannot be won must be called unwinnable, and
  //   2. a fight that CAN be won must never be called unwinnable —
  //
  // because that verdict is the only one that tells a player to walk away,
  // and a false one costs them a fight they would have taken.
  for (const node of region.nodes) {
    for (const size of [1, 2, 3]) {
      const truth = ladderRate(content, node.encounter, size, { seedsPer: 32 });
      const team = Array.from({ length: size }, (_, i) => ({
        ...makeSimChimera(STARTER_BUILD.frame, STARTER_BUILD.partIds, 'standard', content),
        id: `fc${i}`,
      }));
      const f = forecast(team, content.encounters[node.encounter], content, 2026, 1);
      const where = `${node.id} with ${size}`;
      if (truth === 0) {
        assert.equal(f.band.id, 'hopeless',
          `${where}: a 0% fight must be called unwinnable, not ${f.band.label} (${pctOf(f.winRate)})`);
      }
      if (truth >= 0.4) {
        assert.notEqual(f.band.id, 'hopeless',
          `${where}: ${pctOf(truth)} is winnable and must never be called unwinnable`);
      }
      assert.equal(f.waves, content.encounters[node.encounter].waves.length, `${where}: the wave count is real`);
      assert.equal(f.outnumberedBy, Math.max(0, f.waves - size), `${where}: and the game says who is outnumbered`);
    }
  }

  // Determinism: a reload mid-briefing must not reroll the verdict.
  //
  // Measured against a matchup with real variance in it, not a 0% one —
  // two chimeras at the Checkpoint sits around 45%, so an unseeded forecast
  // gives a different answer every render. patrol_2 solo would pass this
  // test with `Math.random()` driving the seeds, because 0% is 0% however
  // you roll it.
  {
    const team = [0, 1].map((i) => ({
      ...makeSimChimera(STARTER_BUILD.frame, STARTER_BUILD.partIds, 'standard', content), id: `d${i}`,
    }));
    const enc = content.encounters.checkpoint;
    const runs = [0, 1, 2, 3, 4].map(() => forecast(team, enc, content, 77, 1).winRate);
    assert.equal(new Set(runs).size, 1,
      `the same team, seed and fight forecasts the same way every time (${runs.map(pctOf).join(' ')})`);
    assert.ok(runs[0] > 0 && runs[0] < 1,
      `and the fixture has variance to detect (${pctOf(runs[0])}) — a 0% matchup would pass this blind`);
    // A different world seed is a different world, and may legitimately
    // differ; what must not differ is the same one twice.
    assert.equal(forecast(team, enc, content, 77, 1).winRate, runs[0]);
  }
  // An empty team is a real state (the briefing renders before you pick).
  assert.equal(forecast([], content.encounters.patrol_1, content, 1, 1).band.id, 'hopeless');

  // --- The Path now walks to a stable, and the stable is the number the
  // ladder actually needs.
  {
    const s = { ...newGameState(), seed: 606 };
    ensureRanchSeeded(s, content, t0);
    assert.equal(STABLE, 3, 'the number the harness has fought at since M4.5');
    assert.ok(second.bySize[STABLE - 1] > second.bySize[0],
      'and it is the number that turns the wall into a fight');
    // The starter herd has to be able to BUILD what the Path asks for, or
    // the checklist ends on a step the player cannot take.
    assert.ok(s.ranch.stock.length >= STABLE,
      `the starter herd can supply the stable (${s.ranch.stock.length} animals for ${STABLE} chimeras)`);
    const steps = onboardingSteps(s, content, t0);
    assert.equal(steps[steps.length - 1].label, 'Build a stable of three', 'the Path ends on it');
    s.campaign.heldNodes = ['barn_perimeter'];
    assert.ok(onboardingActive(s), 'and does not retire at the first conquest any more');
    assert.ok(!pathOwnsScreen(s), 'though it does hand the screen back, so field notes can start');
    s.chimeras = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    assert.ok(!onboardingActive(s), 'a stable plus a conquest finishes it');
  }
}

// --- A2: the last one on the roster is never taken --------------------
// A rescue raid needs a team. Take the only chimera a player owns and the
// nine-hour window has no door in it — the vault is empty too, because
// those parts went into the creature that just got taken.
{
  const mk = (lab, head) => makeChimera(lab, 'S', { [head]: 'standard' }, t0);
  const lose = (lab, team) => {
    const battle = createBattle(team, content.encounters.patrol_2, content, 21, t0, {
      kind: 'assault', nodeId: 'downtown',
    });
    battle.over = true;
    battle.outcome = 'loss';
    for (const c of battle.player.team) c.hp = 0;
    return resolveBattle(lab, battle, content, t0 + HOUR);
  };

  // Two on the roster: the capture works exactly as it always has.
  const pair = { ...newGameState(), seed: 4141 };
  pair.campaign.lastTickAt = t0;
  const a = mk(pair, 'goat_head');
  mk(pair, 'ram_head');
  const took = lose(pair, [a]);
  assert.ok(took.capturedChimera, 'with a spare at home, they still take one');
  assert.equal(pair.chimeras.length, 1, 'and it leaves the roster');
  assert.equal(pair.campaign.captives.length, 1, 'with a rescue window');

  // One on the roster: it comes home instead.
  const solo = { ...newGameState(), seed: 4141 };
  solo.campaign.lastTickAt = t0;
  const only = mk(solo, 'goat_head');
  const held = lose(solo, [only]);
  assert.equal(held.capturedChimera, null, 'the last one is not taken');
  assert.equal(solo.campaign.captives.length, 0, 'so there is no window to fail to enter');
  assert.equal(solo.chimeras.length, 1, 'it is still yours');
  assert.ok(solo.chimeras[0].injury, 'and it is hurt, which is the whole of the punishment');
  assert.equal(held.lastStand, only.name, 'the aftermath says so');
  assert.ok(solo.news.some((n) => /limped back|last one on the roster/.test(n)),
    'and the wire tells the story rather than reporting a rule');
  // Zero death language, in the worst moment the game has.
  assert.ok(!solo.news.some((n) => /\b(dead|died|kill|killed|dies)\b/i.test(n)));

  // The state the audit actually found: a lone chimera, an empty vault, and
  // a loss. It must always leave something the player can act on.
  assert.equal(solo.inventory.parts.length, 0, 'vault spent on the creature');
  assert.ok(solo.chimeras.length > 0, 'and the roster is never empty after a loss');
}

// --- R27: a rival who has beaten you twice has read you ---------------
//
// The criterion is "a rival you have beaten twice fields something built to
// answer your ACTUAL STABLE", and the trap in measuring it is obvious once
// you look: a rival at two defeats is also stronger and better graded, so
// "the rematch got harder" proves nothing whatsoever.
//
// So the instrument holds the escalation fixed and varies only the file.
// Two copies of the same rival, both beaten exactly twice, both at the same
// power and grade — one spent those duels watching the archetype that beats
// them, the other watching something else entirely. Then that archetype
// fights both. The gap between the two is the counter, and nothing else.
{
  const RIVAL_SEEDS = [2026, 77, 1312, 4242, 99, 5];
  const G = 'prismatic';
  const keys = Object.keys(ARCHETYPES);

  // --- The scouting file is written by DUELS, and by nothing else. This is
  // the whole difference from the AI director, which reads the stable you
  // own from usage banked since M0. A rival is one person in one building.
  {
    const lab = { ...newGameState(), seed: 4242 };
    const kite = makeSimChimera(ARCHETYPES.wings.frame, ARCHETYPES.wings.partIds, 'apex', content);
    lab.chimeras = [kite];
    assert.equal(rivalDossier(lab, content.rivals.aloft, content).topClass, null,
      'owning a stable tells a rival nothing — they have to have met it');
    scoutStable(lab, 'aloft', [kite], content);
    const file = lab.campaign.rivals.aloft.scouted;
    assert.equal(file.fights, 1, 'one duel, one entry');
    assert.ok(file.classes.air > 0, 'and they wrote down what class walked in');
    assert.ok(Object.keys(file.parts).length >= 4, 'and which parts it was wearing');
    assert.equal(rivalDossier(lab, content.rivals.trench, content).topClass, null,
      "and it is filed in ONE lab — a rival's read is personal, not a broadcast");

    // They record what was DEPLOYED, not what is owned. A stable of five
    // where you only ever send the same one is a stable a rival knows one
    // fifth of, and that asymmetry is the whole point of the file.
    const bench = makeSimChimera(ARCHETYPES.boots.frame, ARCHETYPES.boots.partIds, 'apex', content);
    lab.chimeras = [kite, bench];
    scoutStable(lab, 'aloft', [kite], content);
    assert.ok(!file.classes.ground,
      'a chimera left at home was never seen, however loudly it sits in the pens');
    // Losing to a stable is the best possible reason to study it, so the
    // file is written on every duel rather than only on defeats.
    assert.equal(rivalRecord(lab, 'aloft').defeats, 0, 'nothing was won here');
    assert.ok(file.fights > 0, 'and they took notes anyway');
  }

  // --- The ladder. Everyone reaches the anatomy tier by the second defeat;
  // counterBias only decides whether they react to the first.
  for (const rival of Object.values(content.rivals)) {
    assert.equal(counterTier(rival, content.rivalMeta, 0), 0, `${rival.id} publishes an honest opening build`);
    assert.ok(counterTier(rival, content.rivalMeta, 2) >= content.rivalMeta.anatomyCounterTier,
      `${rival.id} reaches the anatomy tier at two defeats — that IS the criterion`);
    assert.ok(counterTier(rival, content.rivalMeta, 4) >= counterTier(rival, content.rivalMeta, 2),
      `${rival.id}'s ladder never goes backwards`);
  }
  assert.equal(counterTier(content.rivals.mantissa, content.rivalMeta, 1), 0,
    'the tutorial rival lets the first rematch go');
  assert.ok(counterTier(content.rivals.aloft, content.rivalMeta, 1) > 0,
    'a counter-biasing one does not');

  // --- The mechanism, checked directly rather than inferred from win rates.
  // A rival who has watched a Ground kit twice brings Airborne anatomy,
  // because Ground-tagged moves miss Airborne outright.
  {
    const st = scoutedBy(content, 'trench', 'boots', { grade: G, defeats: 2 });
    const dossier = rivalDossier(st, content.rivals.trench, content);
    assert.equal(dossier.topTag, 'Ground', 'they noticed what you actually swing');
    assert.deepEqual(dossier.seek, ['Airborne'], 'and looked up the answer to it');
    assert.ok(dossier.counterLeads, 'at two defeats the counter leads the team');
    const { team } = rivalTeam(st, content.rivals.trench, content);
    assert.ok(team[0].tags.includes('Airborne'),
      `the lead specimen actually took off (${team[0].tags.join(', ')})`);
    assert.equal(team[0].class, 'air', 'and flies the class that beats what they saw');
    // A9: taking off is now a physics claim, so the lab has to have bought
    // a chassis that can lift the build — its authored frame list is a
    // style, and answering you overrides it. But ONLY for the specimen
    // built to answer: a fix that just used the lightest frame everywhere
    // would pass the assertion above and quietly erase every rival's taste.
    assert.ok(analyze(team[0].genome.frame,
      Object.entries(team[0].genome.parts).map(([, partId]) => ({ partId, grade: 'apex', donor: {} })),
      content).flight.capable !== undefined, 'the lead is a real genome');
    const styled = team.slice(1).map((u) => u.genome.frame);
    assert.ok(styled.every((f) => content.rivals.trench.frames.includes(f)),
      `the rest of the lab keeps its own chassis (${styled.join(', ')} vs authored ${content.rivals.trench.frames.join(', ')})`);

    // Avoidance is the other half: a Sonic kit ignores armour, so armour
    // spent against it is money wasted, and they stop spending it.
    const vsNoise = scoutedBy(content, 'trench', 'noise', { grade: G, defeats: 2 });
    const noiseDossier = rivalDossier(vsNoise, content.rivals.trench, content);
    assert.equal(noiseDossier.topTag, 'Sonic');
    assert.deepEqual(noiseDossier.avoid, ['Armored'], 'they stop buying plate against a Sonic kit');
    const armoured = (t) => t.team.filter((u) => u.tags.includes('Armored')).length;
    assert.ok(armoured(rivalTeam(vsNoise, content.rivals.trench, content)) <= armoured(rivalTeam(st, content.rivals.trench, content)),
      'and the plate count goes down, not up');

    // …and at tier 3 they simply take one of your parts.
    const grudge = structuredClone(vsNoise);
    grudge.campaign.rivals.trench.defeats = 4;
    const mirrored = rivalDossier(grudge, content.rivals.trench, content);
    assert.ok(mirrored.mirror && content.parts[mirrored.mirror], 'four defeats and they field your own anatomy');
    assert.ok(rivalTeam(grudge, content.rivals.trench, content).team[0].salvage.includes(mirrored.mirror),
      `and it is really on the field (${mirrored.mirror})`);
  }

  // --- THE CRITERION, measured. Averaged over six world seeds: a rival's
  // team is re-rolled per defeat count, so a single seed swings widely
  // (0-75pp) while the mean is steady.
  const ANSWERS = {};
  const penalties = [];
  const escalations = [];
  for (const rival of Object.values(content.rivals)) {
    // Whichever archetype beats them before they know anything about you.
    const fresh = keys.map((k) => [k, fightRival(
      content, scoutedBy(content, rival.id, k, { grade: G, defeats: 0, fights: 0 }), rival.id, k,
      { grade: G, seedsPer: 12 }
    )]).sort((a, b) => b[1] - a[1]);
    const [answer, freshRate] = fresh[0];
    ANSWERS[rival.id] = answer;
    assert.ok(freshRate >= 0.5,
      `${rival.id} is beatable by the right anatomy before they learn you (${answer} ${pctOf(freshRate)})`);

    const other = keys.find((k) => k !== answer);
    let studiedMe = 0;
    let studiedThem = 0;
    for (const seed of RIVAL_SEEDS) {
      studiedMe += fightRival(content, scoutedBy(content, rival.id, answer, { grade: G, defeats: 2, seed }), rival.id, answer, { grade: G, seedsPer: 12 });
      studiedThem += fightRival(content, scoutedBy(content, rival.id, other, { grade: G, defeats: 2, seed }), rival.id, answer, { grade: G, seedsPer: 12 });
    }
    studiedMe /= RIVAL_SEEDS.length;
    studiedThem /= RIVAL_SEEDS.length;
    const penalty = studiedThem - studiedMe;
    penalties.push(penalty);
    escalations.push(freshRate - studiedThem);

    // Observed means: 26pp (Mantissa), 40pp (Aloft), 40pp (Trench).
    assert.ok(penalty >= 0.15,
      `${rival.id}: beaten twice, they answer the stable that did it — ${answer} drops ${pctOf(studiedThem)} -> ${pctOf(studiedMe)} (${Math.round(penalty * 100)}pp) against the same rival at the same power`);
  }

  // And the rematch is hard because they LEARNED you, not because the
  // numbers went up: across the ladder the counter costs more than the
  // escalation does. Observed 35pp of counter against 15pp of ramp.
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  assert.ok(mean(penalties) > mean(escalations),
    `the counter outweighs the power ramp (${Math.round(mean(penalties) * 100)}pp vs ${Math.round(mean(escalations) * 100)}pp)`);

  // --- The wiring, end to end. Everything above tests scoutStable
  // directly; this is the only assertion that proves resolveBattle actually
  // CALLS it, which is precisely the line a refactor drops without anything
  // going red.
  {
    const lab = { ...newGameState(), seed: 909 };
    lab.campaign.heldNodes = [...ALL_NODE_IDS];
    lab.campaign.notoriety = 999;
    lab.campaign.lastTickAt = t0;
    const hero = makeChimera(lab, 'L', {
      bear_head: 'prismatic', bear_forelimbs: 'prismatic', bear_hide: 'prismatic', bear_organ: 'prismatic',
    }, t0);
    const encounter = rivalEncounter(lab, content.rivals.mantissa, content);
    const battle = createBattle([hero], encounter, content, 11, hero.settleUntil, {
      kind: 'rival', rivalId: 'mantissa',
    });
    assert.equal(rivalRecord(lab, 'mantissa').scouted, undefined, 'nothing on file before the bell');
    battle.over = true;
    battle.outcome = 'loss';
    resolveBattle(lab, battle, content, t0 + HOUR);
    const file = lab.campaign.rivals.mantissa.scouted;
    assert.ok(file?.fights >= 1, 'the duel wrote into their file');
    assert.ok(Object.keys(file.parts).length >= 3,
      'and it recorded the anatomy that walked in, not a summary of it');
    assert.ok(file.parts.bear_head >= 1, `including the head you led with (${Object.keys(file.parts).join(', ')})`);
  }

  // A save from before any of this starts with an EMPTY file, even for a
  // rival already beaten five times. Back-filling from the director would
  // be inventing observations they never made, and the first thing a player
  // would notice is a rival countering a stable it has never met.
  {
    const veteran = { ...newGameState(), saveVersion: 25 };
    veteran.campaign.rivals = { trench: { defeats: 5, losses: 2, lastMetAt: t0 } };
    const migrated = migrate(structuredClone(veteran));
    const file = migrated.campaign.rivals.trench.scouted;
    assert.deepEqual(file, { fights: 0, classes: {}, moveTags: {}, parts: {} },
      'a rival beaten five times before R27 has still never watched you fight');
    assert.equal(rivalDossier(migrated, content.rivals.trench, content).counterClass, null,
      'so they field the lab they published until you show them something');
  }

  // The three rivals answer to three different anatomies, which is what
  // makes keeping a stable better than perfecting one build.
  assert.equal(new Set(Object.values(ANSWERS)).size, 3,
    `each rival has its own answer (${Object.entries(ANSWERS).map(([r, a]) => `${r}=${a}`).join(' ')})`);
}

// --- R29: every shipped system gets one first-use note ----------------
//
// Onboarding shipped in M7 as a five-step Path ending at the first
// conquest, and then eight more systems shipped behind it — breeding, the
// chaos vat, rehabilitation, the jobs board, contestation, scars,
// temperament, the Dex — followed by five regions, six facility tracks and
// an upkeep economy. All of it unguided.
//
// "Every shipped system has a first-use guide derived from state, and none
// fires before its system is reachable." Both halves are checkable, and
// both are checked by walking a save forward one system at a time.
{
  const guides = Object.values(content.guides);
  const SCREENS = ['ranch', 'pens', 'theater', 'battle', 'dex'];

  // --- Shape. A guide with no `done` nags forever; one with no `reachable`
  // fires on turn one, which is the exact failure the phase exists to fix.
  for (const g of guides) {
    assert.ok(SCREENS.includes(g.screen), `${g.id}: lives on a real screen (${g.screen})`);
    assert.ok(g.title && g.body && g.icon, `${g.id}: has something to say`);
    assert.ok(g.body.length > 80, `${g.id}: says enough to be worth a card`);
    assert.ok(g.reachable?.length, `${g.id}: declares when its system exists`);
    assert.ok(g.done?.length, `${g.id}: declares when it has been understood, or it nags forever`);
    for (const cond of [...g.reachable, ...g.done]) {
      if (cond.helper) {
        assert.ok(GUIDE_HELPERS[cond.helper], `${g.id}: helper ${cond.helper} exists`);
      } else {
        assert.ok(typeof cond.path === 'string' && cond.path.includes('.') === cond.path.includes('.'),
          `${g.id}: ${JSON.stringify(cond)} reads a save path`);
      }
    }
  }
  assert.equal(new Set(guides.map((g) => g.id)).size, guides.length, 'guide ids are unique');
  assert.equal(new Set(guides.map((g) => g.order)).size, guides.length, 'orders are unique, so the queue is deterministic');
  for (const screen of SCREENS) {
    assert.ok(guides.some((g) => g.screen === screen), `${screen} has at least one note`);
  }

  // --- COVERAGE. A hand-maintained roll of what this game has shipped. It
  // is deliberately a literal list rather than something derived: the whole
  // point is that a future phase adding a system has to come here and say
  // so, which is the only mechanism that keeps "every shipped system" true
  // a year from now.
  const SHIPPED_SYSTEMS = [
    'stable',
    'breeding', 'incubator', 'genes', 'pairing', 'facility', 'upkeep', 'catalog',
    'temperament', 'bond', 'infirmary', 'scars',
    'combos', 'chaos', 'flight',
    'jobs', 'containment', 'rehab', 'rivals', 'rescue', 'contest', 'regions', 'director',
    'dex',
  ];
  const covered = new Set(guides.map((g) => g.id));
  const missing = SHIPPED_SYSTEMS.filter((id) => !covered.has(id));
  assert.deepEqual(missing, [], `every shipped system has a note (missing: ${missing.join(', ')})`);
  const orphans = [...covered].filter((id) => !SHIPPED_SYSTEMS.includes(id));
  assert.deepEqual(orphans, [], `and every note names a system on the roll (${orphans.join(', ')})`);

  // --- THE CRITERION. Walk one save forward, switching on one system at a
  // time, and check each note appears at exactly the step that makes its
  // system real — never before it.
  const lab = { ...newGameState(), seed: 4242 };
  ensureRanchSeeded(lab, content, t0);
  const readyNow = () => new Set(
    guideStates(lab, content, t0).filter((r) => r.status === 'ready').map((r) => r.guide.id)
  );

  // Nothing at all while the Path still owns the screen. Two tutorials at
  // once is one tutorial too many.
  //
  // Tested against a save that HAS ready notes rather than a fresh one: a
  // brand-new save has nothing ready anyway, so asserting over it would
  // pass whether the suppression works or not. This lab has a settled
  // chimera and an egg — several notes are live — and has conquered
  // nothing, so the Path still owns every screen.
  {
    const onPath = { ...newGameState(), seed: 99 };
    ensureRanchSeeded(onPath, content, t0);
    for (const a of onPath.ranch.stock) a.birthAt = t0 - 200 * HOUR;
    onPath.ranch.eggCount = 2;
    onPath.chimeras = [{ id: 'c1', frame: 'M', tokens: {}, settleUntil: 0, bond: 5, temperament: { a: 1 }, scars: [] }];
    assert.ok(onboardingActive(onPath), 'nothing conquered, so the Path is still running');
    const live = guideStates(onPath, content, t0).filter((r) => r.status === 'ready');
    assert.ok(live.length >= 3, `and notes are genuinely ready underneath it (${live.length})`);
    for (const screen of SCREENS) {
      assert.equal(guideForScreen(onPath, content, t0, screen), null,
        `${screen}: the Path owns the screen, so no field note fires under it`);
    }
  }

  const STEPS = [
    ['first conquest', () => { lab.campaign.heldNodes = ['barn_perimeter']; }, ['catalog', 'jobs', 'stable']],
    ['the herd grows up', () => { for (const a of lab.ranch.stock) a.birthAt = t0 - 200 * HOUR; }, ['breeding']],
    ['an egg is laid', () => { lab.ranch.eggCount = 1; lab.ranch.eggs = [{ id: 'e0' }]; }, ['incubator', 'genes']],
    ['a chimera exists', () => {
      lab.chimeras = [{ id: 'c1', frame: 'M', tokens: {}, settleUntil: 0, bond: 5, temperament: { a: 1 }, scars: [] }];
    }, ['upkeep', 'temperament', 'bond']],
    ['parts in the vault', () => {
      lab.inventory.parts = [{ id: 't0', partId: 'goat_head' }, { id: 't1', partId: 'goat_tail' }, { id: 't2', partId: 'goat_hide' }];
    }, ['combos']],
    // A9: goat parts are not a flight lesson. The lift equation only becomes
    // a decision once the player owns something that MAKES lift — 61 parts
    // say Airborne and twelve of them fly.
    ['a wing turns up', () => {
      lab.inventory.parts.push({ id: 't3', partId: 'eagle_forelimbs' });
    }, ['flight']],
    ['a second settled chimera', () => {
      lab.chimeras.push({ id: 'c2', frame: 'M', tokens: {}, settleUntil: 0, bond: 5, scars: [] });
    }, ['chaos']],
    ['something gets hurt', () => { lab.chimeras[0].injury = { name: 'Sprained Everything', until: t0 + HOUR }; }, ['infirmary']],
    ['and it sets badly', () => { lab.chimeras[0].scars = ['gun_shy']; }, ['scars']],
    ['a bay is occupied', () => { lab.campaign.containment = [{ id: 'bay-0', unitId: 'riot_squad' }]; }, ['containment']],
    // Money alone does not open the Facility note: every track past level 1
    // is gated on territory as well, which is the point of the track. And it
    // has to come BEFORE the Wing, because buying any upgrade is precisely
    // what retires this note.
    ['money and a second node', () => { lab.funds = 5000; lab.campaign.heldNodes.push('downtown'); }, ['facility']],
    ['the Reorientation Wing opens', () => { lab.facility.containment = 2; }, ['rehab']],
    ['a captive to rescue', () => {
      lab.campaign.captives = [{ id: 'cap-1', chimera: { name: 'Gerald' }, deadline: t0 + 9 * HOUR }];
    }, ['rescue']],
    ['a few wins on the board', () => { lab.warRecord = { wins: 4, losses: 1 }; }, ['director']],
    ['the Dex fills up', () => { lab.dex.parts = Object.keys(content.parts).slice(0, 8); }, ['dex']],
    // Dr. Mantissa is gated on the Highway Checkpoint, so the rival note
    // opens on the same push that opens Kestrel Reach.
    ['Greenfield falls', () => {
      lab.campaign.heldNodes = ['barn_perimeter', 'downtown', 'checkpoint', 'precinct'];
      lab.campaign.notoriety = 65;
    }, ['regions', 'rivals']],
    ['a convoy is on the road', () => {
      lab.campaign.contested = [{ nodeId: 'downtown', deadline: t0 + 13 * HOUR }];
    }, ['contest']],
    ['the Pairing Suite is installed', () => { lab.facility.scanner = 3; }, ['pairing']],
  ];

  const firstSeen = {};
  let before = readyNow();
  for (const [label, mutate, expected] of STEPS) {
    for (const id of expected) {
      assert.ok(!before.has(id),
        `"${id}" must not fire before ${label} — that is the whole criterion`);
    }
    mutate();
    const after = readyNow();
    for (const id of expected) {
      assert.ok(after.has(id), `${label}: unlocks the "${id}" note`);
      firstSeen[id] = label;
    }
    // A step may retire notes (breeding is done once an egg exists) but it
    // must never light one it was not supposed to.
    const surprises = [...after].filter((id) => !before.has(id) && !expected.includes(id));
    assert.deepEqual(surprises, [],
      `${label}: lights exactly what it should (also lit: ${surprises.join(', ')})`);
    before = after;
  }
  assert.equal(Object.keys(firstSeen).length, guides.length,
    `every note is reachable somewhere in a real campaign (${guides.length - Object.keys(firstSeen).length} never fired)`);

  // --- One at a time, lowest `order` first. Several notes are ready at once
  // by the end of that walk.
  //
  // The expected note is computed from the AUTHORED order in the content
  // file, not from guideStates' own sort — deriving it from the thing under
  // test is how an assertion passes no matter which way the sort runs.
  {
    const readySet = readyNow();
    for (const screen of SCREENS) {
      const candidates = guides
        .filter((g) => g.screen === screen && readySet.has(g.id))
        .sort((a, b) => a.order - b.order);
      const shown = guideForScreen(lab, content, t0, screen);
      if (!candidates.length) {
        assert.equal(shown, null, `${screen}: nothing ready, nothing shown`);
      } else {
        assert.equal(shown?.id, candidates[0].id,
          `${screen}: shows the lowest-order ready note (${candidates[0].id}), not ${shown?.id ?? 'nothing'}`);
      }
    }
  }

  // --- Dismissal is the only thing this system persists, and it sticks.
  const ranchNote = guideForScreen(lab, content, t0, 'ranch');
  assert.ok(ranchNote, 'the ranch has a note to dismiss');
  dismissGuide(lab, ranchNote.id);
  assert.notEqual(guideForScreen(lab, content, t0, 'ranch')?.id, ranchNote.id, 'dismissing it moves on');
  assert.ok(lab.guidesSeen.includes(ranchNote.id), 'and the save remembers');
  // …and a dismissed note never comes back, even though its system is still unused.
  assert.equal(
    guideStates(lab, content, t0).find((r) => r.guide.id === ranchNote.id).status,
    'dismissed',
    'a waved-away note stays waved away'
  );
}

// --- R29: fold-away cards remember their state ------------------------
// R25 and R26 made two screens very long — six facility tracks and five
// region strips in one column. Collapse state lives in the save rather than
// a module variable, so folding a card shut survives the reload the
// Definition of Done requires every feature to survive.
{
  const lab = { ...newGameState() };
  // Absent means "use the card's own judgement", which is how the War Room
  // can open the strip you are fighting in and shut the four you are not.
  assert.equal(isOpen(lab, 'facility', false), false, 'no stored value defers to the default');
  assert.equal(isOpen(lab, 'region:kestrel', true), true, 'in both directions');
  lab.ui.collapsed['facility'] = false;
  assert.equal(isOpen(lab, 'facility', false), true, 'a stored value always wins');
  lab.ui.collapsed['region:kestrel'] = true;
  assert.equal(isOpen(lab, 'region:kestrel', true), false, 'in both directions');

  // It survives the round trip, which is the only reason it is in the save.
  const reloaded = migrate(structuredClone(lab));
  assert.equal(isOpen(reloaded, 'facility', false), true, 'and it survives a reload');
  assert.equal(isOpen(reloaded, 'region:kestrel', true), false);

  // A save from before any of this reads as "use the defaults" rather than
  // throwing on a missing object.
  const old = migrate(structuredClone({ ...newGameState(), saveVersion: 24, ui: undefined, guidesSeen: undefined }));
  assert.deepEqual(old.ui.collapsed, {}, 'a migrated save gets an empty fold record');
  assert.deepEqual(old.guidesSeen, [], 'and no dismissed notes');
  assert.equal(isOpen(old, 'facility', false), false, 'so every card falls back to its own default');
  for (const id of ['theater', 'containment', 'incubator', 'extractor', 'scanner', 'infirmary']) {
    assert.equal(old.facility[id], 1, `${id} reads as level 1 in a migrated save`);
  }
}

// --- R25: the second money sink, and what each track buys --------------
//
// "Money has a second sink that changes the loop, and each track pays back
// measurably." The first half is arithmetic — the tracks cost what they
// cost. The second half is a claim, so it is measured, by tools/sim.js
// running the game's own breeding rule, grade thresholds and clocks.
{
  const pay = facilityPayback(content);

  // Every track must be a ladder that goes somewhere, and every level-1
  // must be free — a facility that opens by charging you for what you
  // already had is a facility that punishes a live save for existing.
  const NEW_TRACKS = ['incubator', 'extractor', 'scanner', 'infirmary'];
  for (const id of [...NEW_TRACKS, 'theater', 'containment']) {
    const track = content.facility[id];
    assert.ok(track, `${id} track exists`);
    assert.equal(track.levels[0].cost, 0, `${id} level 1 is the world as it already was, at no charge`);
    assert.ok(track.levels.every((l, i) => l.level === i + 1), `${id} levels are contiguous`);
    for (const level of track.levels.slice(1)) {
      assert.ok(level.cost > 0 && level.blurb && level.grants, `${id} L${level.level} is priced and described`);
      assert.ok(level.unlockLine && level.news, `${id} L${level.level} says something when it lands`);
      for (const nodeId of level.requiresNodes ?? []) {
        assert.ok(nodeById(content, nodeId), `${id} L${level.level} gates on a real node (${nodeId})`);
      }
    }
    // Costs climb; a later tier is never the cheaper buy.
    for (let i = 2; i < track.levels.length; i++) {
      assert.ok(track.levels[i].cost > track.levels[i - 1].cost, `${id} L${i + 1} costs more than L${i}`);
    }
  }

  // The sink has to be big enough to matter against what R26's map pays.
  const sink = Object.values(content.facility)
    .flatMap((t) => t.levels.map((l) => l.cost))
    .reduce((a, b) => a + b, 0);
  assert.ok(sink >= 18000, `the facility is a real sink ($${sink} across every track)`);

  // --- Incubator. Bays are NOT the payback: pen capacity is the real
  // bottleneck, so queueing more eggs changes nothing on its own. What has
  // to move is how often an egg carries something nobody bred for, because
  // that is where variants and the mutation-only genes enter the game.
  const inc = pay.incubator;
  assert.ok(inc[2].slots > inc[0].slots, `bays grow (${inc[0].slots} -> ${inc[2].slots})`);
  assert.ok(inc[2].hoursPerEgg < inc[0].hoursPerEgg, 'and eggs come out sooner');
  assert.ok(inc[2].mutationsPer100 >= inc[0].mutationsPer100 * 1.6,
    `Hatchery Row genuinely changes what hatches (${inc[0].mutationsPer100.toFixed(1)} -> ${inc[2].mutationsPer100.toFixed(1)} mutations per 100 eggs)`);

  // --- Extractor. The same donor population, graded by three different
  // machines. Measured: prime+ 50 -> 72%, apex+ 4 -> 13%.
  const ext = pay.extractor;
  assert.ok(ext[1].primePlus > ext[0].primePlus && ext[2].primePlus > ext[1].primePlus,
    `each Extractor tier grades better (${ext.map((x) => Math.round(x.primePlus * 100) + '%').join(' -> ')})`);
  assert.ok(ext[2].apexPlus >= ext[0].apexPlus * 2,
    `and the top tier at least doubles apex yield (${Math.round(ext[0].apexPlus * 100)}% -> ${Math.round(ext[2].apexPlus * 100)}%)`);
  // It is a thumb on the scale, not a replacement for husbandry: a neglected
  // runt must not grade prismatic because you bought a centrifuge.
  const runt = { species: 'goat', condition: 30, birthAt: 0, potential: { hp: 1, power: 1, armor: 1, speed: 1, stamina: 1 } };
  assert.equal(gradeFor(runt, content, t0, labAt({ extractor: 3 })).id, 'standard',
    'the best Extractor in the world cannot launder a neglected runt');

  // --- Gene Scanner. It sells information, so its payback is search speed:
  // pairings needed to fix a recessive, blind versus informed. Measured
  // 111-400 blind against 5-8 informed.
  assert.ok(pay.scanner.length >= 2, 'there are recessives to hunt');
  for (const row of pay.scanner) {
    assert.ok(row.informed * 3 <= row.blind,
      `${row.trait}: the Suite is at least three times the breeder blind luck is (${row.blind.toFixed(1)} -> ${row.informed.toFixed(1)} pairings)`);
  }
  // And the numbers it quotes are the numbers the game actually breeds by.
  {
    const dominant = Object.values(content.traits).find((tr) => tr.dominant);
    const recessive = Object.values(content.traits).find((tr) => !tr.dominant);
    const carrier = { genotype: { [dominant.id]: 1, [recessive.id]: 1 } };
    const rows = pairingForecast(carrier, carrier, content);
    const dom = rows.find((r) => r.trait.id === dominant.id);
    const rec = rows.find((r) => r.trait.id === recessive.id);
    // Two heterozygotes: 3/4 of offspring carry, 1/4 are homozygous.
    assert.ok(Math.abs(dom.carrier - 0.75) < 1e-9, `carrier odds are Mendel's (${dom.carrier})`);
    assert.ok(Math.abs(dom.express - 0.75) < 1e-9, 'a dominant shows the moment it is carried');
    assert.ok(Math.abs(rec.express - 0.25) < 1e-9, 'a recessive needs both copies');
    assert.ok(rec.carrier > rec.express, 'and the gap between carrying and showing is the whole game');
    // A pairing with nothing to say says nothing, rather than a wall of 0%.
    assert.deepEqual(pairingForecast({ genotype: {} }, { genotype: {} }, content), []);
  }

  // --- Infirmary. Time and certainty, not power.
  const inf = pay.infirmary;
  assert.ok(inf[2].meanDowntimeHours <= inf[0].meanDowntimeHours * 0.6,
    `the Regenerative Suite more than a third off convalescence (${inf[0].meanDowntimeHours.toFixed(1)}h -> ${inf[2].meanDowntimeHours.toFixed(1)}h)`);
  assert.ok(inf[2].scarChance < inf[0].scarChance, 'and an untreated injury sets badly less often');
  assert.ok(inf[2].scarChance > 0,
    'but never zero — treatment stays the only guarantee, or the Infirmary stops selling certainty and starts giving it away');
  assert.ok(inf[2].treatScale < inf[0].treatScale, 'and treating one costs less');
}

// --- R25: a stable is no longer free to own ---------------------------
// Chimeras cost nothing to keep until R25, so territory income was a score
// rather than a budget: the only question money ever asked was how long you
// were willing to wait.
{
  const build = (grade, frame = 'M') =>
    makeSimChimera(frame, ARCHETYPES.boots.partIds, grade, content);

  const byGrade = ['standard', 'prime', 'apex', 'prismatic'].map((g) => chimeraUpkeep(build(g), content));
  for (let i = 1; i < byGrade.length; i++) {
    assert.ok(byGrade[i] > byGrade[i - 1], `upkeep climbs with grade (${byGrade.join(' -> ')})`);
  }
  assert.ok(byGrade[3] >= byGrade[0] * 4,
    `and a prismatic specimen is a premium animal (\$${byGrade[0]} -> \$${byGrade[3]}/day)`);

  // THE FLOOR (R11's rule, and the reason the flat terms are small): the
  // onboarding path is care -> extract -> splice -> battle -> conquer, so a
  // player reaches their first chimera having conquered NOTHING. If that
  // creature costs more than the stipend can carry, the guided first loop
  // walks a new player straight into insolvency.
  //
  // Modelled the way the game actually gets there: graduating an animal
  // takes it OUT of the herd, so the herd shrinks as the chimera arrives.
  const starter = { ...newGameState() };
  ensureRanchSeeded(starter, content, t0);
  starter.ranch.stock[0].birthAt = t0 - 100 * HOUR;
  extractAnimal(starter, starter.ranch.stock[0].id, content, t0);
  starter.chimeras = [build('standard')];
  const drain = upkeepPerDay(starter, content);
  assert.ok(drain < TUNING.stipendPerDay,
    `the first chimera stays inside the stipend (\$${drain} vs \$${TUNING.stipendPerDay})`);

  // …and a shelf of prismatic monsters does not. That is the whole point:
  // the top of the game has to need the territory R26 built.
  const rich = { ...newGameState() };
  ensureRanchSeeded(rich, content, t0);
  rich.chimeras = Array.from({ length: 6 }, () => build('prismatic', 'L'));
  const heavy = upkeepPerDay(rich, content);
  assert.ok(heavy > TUNING.stipendPerDay * 8,
    `six prismatic Rumblers need territory, not a stipend (\$${heavy}/day)`);

  // The drain is charged, not merely reported. A chimera-only lab with no
  // stock still pays.
  const ticking = { ...newGameState(), lastTickAt: t0, funds: 5000 };
  ticking.chimeras = [build('prismatic')];
  applyElapsed(ticking, content, t0 + 24 * HOUR);
  const expected = 5000 + TUNING.stipendPerDay - chimeraUpkeep(ticking.chimeras[0], content);
  assert.ok(Math.abs(ticking.funds - expected) < 1,
    `a day of upkeep actually leaves the account (\$${Math.round(ticking.funds)} vs \$${Math.round(expected)})`);

  // And it can never dig a hole: funds floor at zero, because a player who
  // was away for a fortnight must come back to a poor lab, not a ruined one.
  const broke = { ...newGameState(), lastTickAt: t0, funds: 10 };
  broke.chimeras = Array.from({ length: 4 }, () => build('prismatic', 'L'));
  applyElapsed(broke, content, t0 + 30 * 24 * HOUR);
  assert.equal(broke.funds, 0, 'absence empties the account and stops there');
  assert.equal(broke.chimeras.length, 4, 'and never costs a creature');
}

// --- R26: five regions, and the only claim that matters --------------
//
// The acceptance criterion is not "there are more fights". It is that
// taking Greenfield opens a region whose fights need DIFFERENT ANATOMY
// than the one that won the first. So this section measures it, using
// tools/sim.js's region bench: one archetype per axis of the combat
// model, each a legal build
// committing to one axis of the combat model, run over every node of
// every strip.
//
// The bar is set below what seven independent base seeds actually produce
// (numbers in the comments), because a gate with no headroom is a gate
// that fails on a Tuesday for no reason.
{
  // Two independent base seeds at sixteen games a cell. Seven seeds were
  // walked by hand while the bars below were set (the observed ranges are
  // quoted at each one); two is what the suite can afford to run every time.
  const BENCH_SEEDS = [2026, 4242];
  const SEEDS_PER = 16;
  const arch = Object.keys(ARCHETYPES);

  // Every archetype must be buildable out of parts that still exist —
  // otherwise the instrument silently measures a smaller creature.
  for (const [key, a] of Object.entries(ARCHETYPES)) {
    assert.ok(content.frames[a.frame], `${key}: frame ${a.frame} exists`);
    const slots = new Set();
    for (const id of a.partIds) {
      assert.ok(content.parts[id], `${key}: part ${id} exists`);
      assert.ok(!slots.has(content.parts[id].slot), `${key}: one part per socket (${id})`);
      slots.add(content.parts[id].slot);
    }
    assert.ok(slots.has('head'), `${key}: has a head (engine rule)`);
  }

  for (const benchSeed of BENCH_SEEDS) {
    const rows = regionBench(content, { grade: 'apex', seedsPer: SEEDS_PER, seed: benchSeed, stable: false });
    assert.equal(rows.length, 5, 'five regions on the bench');
    const [greenfield, ...later] = rows;
    const rateIn = (row, key) => row.byArchetype[key].winRate;

    // Greenfield is the tutorial county and is meant to be forgiving: more
    // than one anatomy clears it. That set is the baseline the criterion
    // measures every later region against.
    const clearers = arch.filter((k) => rateIn(greenfield, k) >= 0.8);
    assert.ok(clearers.length >= 2,
      `Greenfield takes more than one answer (${clearers.map((k) => `${k} ${pctOf(rateIn(greenfield, k))}`).join(', ')})`);

    for (const row of later) {
      // THE CRITERION. Something that walked through Greenfield has to hit
      // a wall here, or this strip is just Greenfield with bigger numbers.
      // Observed across seven seeds: 32-45pp (Kestrel), 57-67 (Drowned),
      // 56-61 (Foundry), 36-42 (Spire).
      const drop = Math.max(...clearers.map((k) => rateIn(greenfield, k) - rateIn(row, k)));
      assert.ok(drop >= 0.25,
        `${row.region.id}: a build that cleared Greenfield must fall over here (worst drop ${Math.round(drop * 100)}pp)`);
    }

    // Rank ANATOMIES, not archetypes. A9 added a sixth archetype that shares
    // an anatomy with an existing one — `kite` and `wings` are the same Air
    // build on two chassis, which is the whole point of the pair — so a
    // ranking over archetypes would count Air twice and report a region as
    // having "two answers" when both entries are the same answer. This
    // criterion has always been about anatomy; it just never had two
    // archetypes sharing one before.
    const bestPerAnatomy = (row) => {
      const best = {};
      for (const k of arch) {
        const a = ARCHETYPES[k].anatomy ?? k;
        best[a] = Math.max(best[a] ?? 0, rateIn(row, k));
      }
      return best;
    };
    const rank = (row) => Object.values(bestPerAnatomy(row)).sort((a, b) => b - a);

    // Three of the four later strips ask a SPECIFIC question, and each asks
    // a different one. Observed spreads: 13-19, 17-27, 20-33pp.
    const shaped = later.filter((r) => r.region.answer !== 'mixed');
    assert.equal(shaped.length, 3, 'three shaped regions and one that is deliberately not');
    for (const row of shaped) {
      const [top, second] = rank(row);
      assert.ok(top - second >= 0.1,
        `${row.region.id}: one anatomy answers it decisively (+${Math.round((top - second) * 100)}pp over the next)`);
    }
    const champions = new Set(shaped.map((r) => r.champion));
    assert.equal(champions.size, 3,
      `and the three answers are three different anatomies (${shaped.map((r) => `${r.region.id}=${r.champion}`).join(' ')})`);

    // The finale's claim is the opposite one: nothing is comfortable, and no
    // single build runs away with it. Observed top 58-66%, spread 2-8pp.
    const finale = later.find((r) => r.region.answer === 'mixed');
    const [fTop, fSecond] = rank(finale);
    assert.ok(fTop <= 0.75, `${finale.region.id}: no mono-build strolls through the finale (best ${pctOf(fTop)})`);
    assert.ok(fTop - fSecond <= 0.15,
      `${finale.region.id}: and no single anatomy owns it (+${Math.round((fTop - fSecond) * 100)}pp)`);
  }

  // Reachability, measured at the grade a player plausibly holds when each
  // region opens. A ladder whose fourth rung cannot be climbed is not a
  // ladder. Observed champions: 63-71, 89-95, 83-94, 66-72, 58-66%.
  for (const region of Object.values(content.regions)) {
    assert.ok(['standard', 'prime', 'apex', 'prismatic'].includes(region.benchGrade),
      `${region.id} declares a bench grade`);
    const [row] = regionBench(content, {
      grade: region.benchGrade, seedsPer: SEEDS_PER, seed: 2026, only: [region.id], stable: false,
    });
    const best = row.byArchetype[row.champion].winRate;
    assert.ok(best >= 0.5,
      `${region.id} is clearable at ${region.benchGrade} (best ${pctOf(best)} — ${row.champion})`);
  }
}

// --- R26: the region ladder's structure -------------------------------
// The measurement above proves the fights differ. These prove the map they
// hang on cannot be authored into a dead end, because "adding a region must
// never require an engine edit" only holds if the data is checkable.
{
  const regions = Object.values(content.regions);
  const nodeIds = new Set();
  const encounterUse = {};
  assert.ok(regions.length >= 5, `five region strips (${regions.length})`);

  for (const [i, region] of regions.entries()) {
    assert.ok(region.name && region.demand && region.answer, `${region.id}: named, and says what it asks for`);
    assert.ok(region.nodes.length >= 4, `${region.id}: a strip, not a stub`);
    for (const node of region.nodes) {
      assert.ok(!nodeIds.has(node.id), `node id ${node.id} is unique across the whole map`);
      nodeIds.add(node.id);
      assert.ok(content.encounters[node.encounter], `${node.id} -> a real encounter`);
      (encounterUse[node.encounter] ??= []).push(node.id);
      assert.ok(node.incomePerDay > 0 && node.notoriety > 0, `${node.id} pays and is noticed`);
      assert.ok(node.blurb, `${node.id} has a blurb`);
    }
    assert.ok(region.nodes.some((n) => n.boss), `${region.id} ends on a boss`);

    // The ladder is reachable: a region may only require nodes that appear
    // in an EARLIER strip, or the map contains a region nothing can open.
    const earlier = new Set(regions.slice(0, i).flatMap((r) => r.nodes.map((n) => n.id)));
    for (const nodeId of region.requires?.nodes ?? []) {
      assert.ok(earlier.has(nodeId), `${region.id} requires ${nodeId}, which an earlier region provides`);
    }
    assert.equal(i === 0, !region.requires, 'the first region is the only one that opens for free');
  }

  // Two nodes sharing an encounter would let the AI director and the
  // contestation system disagree about which place they are defending.
  for (const [encId, users] of Object.entries(encounterUse)) {
    assert.equal(users.length, 1, `${encId} belongs to exactly one node (${users.join(', ')})`);
  }

  // Every tier a node reaches for has a scale behind it.
  for (const enc of Object.values(content.encounters)) {
    if (enc.tier == null) continue;
    assert.ok(content.tierScale[enc.tier] != null, `${enc.id}: tier ${enc.tier} has a scale`);
    for (const unitId of enc.waves) assert.ok(content.enemies[unitId], `${enc.id} -> ${unitId} exists`);
  }

  // THE PLAYABILITY GUARANTEE: a region may never ask for an anatomy the
  // catalog cannot sell you by the time you have to answer it. Walk the
  // ladder in order and, at each region's BOSS, check that the class which
  // answers that region is already in the Mail-Order list.
  //
  // The boss rather than the region entrance, because Greenfield is the
  // one region you enter owning nothing: it hands you wings at its third
  // node, which is exactly the shape a tutorial should have — you meet the
  // problem, then you are shown the answer, then you are tested on it.
  {
    const held = [];
    for (const region of regions) {
      const bossAt = region.nodes.findIndex((n) => n.boss);
      for (const [i, node] of region.nodes.entries()) {
        if (i === bossAt && region.answer !== 'mixed') {
          const base = newGameState();
          const state = { ...base, campaign: { ...base.campaign, heldNodes: [...held], notoriety: 9999 } };
          const answering = catalogFor(state, content)
            .map((sp) => sp.id)
            .filter((id) => classOfSpecies(id) === region.answer);
          assert.ok(answering.length > 0,
            `${region.id} answers to ${region.answer}, and the catalog sells it before ${node.id} (${answering.slice(0, 4).join(', ') || 'NOTHING'})`);
        }
        held.push(node.id);
      }
    }
  }

  // LAW 2: a conquest has to expand what you can CREATE, not just what you
  // own. Every region past the first introduces something new to build
  // with — fauna in the catalog, or enemy tech you can only get by taking
  // the place apart.
  const seenSpecies = new Set();
  const seenTech = new Set();
  for (const [i, region] of regions.entries()) {
    const fauna = region.nodes.flatMap((n) => n.unlocksFauna ?? []).filter((id) => !seenSpecies.has(id));
    const tech = region.nodes
      .flatMap((n) => content.encounters[n.encounter].waves)
      .flatMap((unitId) => {
        const out = [];
        let unit = content.enemies[unitId];
        for (let hops = 0; unit && hops < 4; hops++) {
          out.push(...(unit.salvage ?? []));
          unit = content.enemies[unit.transformInto];
        }
        return out;
      })
      .filter((id) => !seenTech.has(id));
    assert.ok(fauna.length + tech.length > 0,
      `${region.id} teaches you to build something new (${[...fauna, ...tech].join(', ') || 'NOTHING'})`);
    for (const id of fauna) seenSpecies.add(id);
    for (const id of tech) seenTech.add(id);
    if (i > 0) void 0;
  }
  for (const id of seenTech) assert.ok(content.parts[id], `salvage ${id} is a real part`);
}

// --- R26: redistributing fauna must never repossess it ----------------
// Spreading the catalog across five regions is the one content edit that can
// take something away from a live save: a player holding the Guard Post owned
// nine species that now live three regions out. The v24 migration grants
// whatever the v23 table would have opened, permanently, and the catalog can
// only ever grow from there.
{
  const v23 = {
    ...newGameState(),
    saveVersion: 23,
    campaign: { ...newGameState().campaign, heldNodes: ['barn_perimeter', 'downtown', 'checkpoint', 'precinct', 'guard_post'], notoriety: 85 },
  };
  delete v23.campaign.faunaGranted;
  const migrated = migrate(structuredClone(v23));
  assert.equal(migrated.saveVersion, SAVE_VERSION);

  // Everything the v23 table opened at those five nodes.
  const OWED = [
    'porcupine', 'skunk', 'wolf', 'chameleon', 'mantis', 'eagle', 'cobra', 'frog', 'bat',
    'bear', 'tiger', 'gorilla', 'rhino_beetle', 'dragonfly', 'rhino', 'pangolin', 'crocodile',
    'shark', 'octopus', 'electric_eel', 'anglerfish', 'tortoise', 'scorpion',
  ];
  const catalog = new Set(catalogFor(migrated, content).map((sp) => sp.id));
  const lost = OWED.filter((id) => !catalog.has(id));
  assert.deepEqual(lost, [], `a migrated save keeps every species it had earned (lost: ${lost.join(', ')})`);

  // Five of those now live in regions this save has never seen, which is the
  // whole point — without the grant they would have vanished from the shop.
  const moved = ['shark', 'octopus', 'electric_eel', 'anglerfish', 'tortoise'];
  const fresh = { ...newGameState(), campaign: { ...newGameState().campaign, heldNodes: [...v23.campaign.heldNodes], notoriety: 85 } };
  const freshCatalog = new Set(catalogFor(fresh, content).map((sp) => sp.id));
  for (const id of moved) {
    assert.ok(!freshCatalog.has(id), `${id} really did move out of Greenfield (otherwise this test proves nothing)`);
  }

  // The grant is additive, never a replacement. A save that held the whole
  // county was owed the whole catalog, so it gains nothing further — which is
  // exactly right, and also proves nothing about additivity. A save that
  // stopped at Downtown is the one that shows it: it keeps its five, and
  // taking Greenfield's remaining nodes still opens the rest.
  migrated.campaign.heldNodes.push('crop_strip', 'radio_mast', 'cloudbase', 'aerodrome', 'sunken_marina');
  const grown = new Set(catalogFor(migrated, content).map((sp) => sp.id));
  for (const id of catalog) assert.ok(grown.has(id), `${id} survives further conquest`);

  const partial = { ...newGameState(), saveVersion: 23,
    campaign: { ...newGameState().campaign, heldNodes: ['barn_perimeter', 'downtown'], notoriety: 25 } };
  delete partial.campaign.faunaGranted;
  const early = migrate(structuredClone(partial));
  const owedEarly = ['porcupine', 'skunk', 'wolf', 'chameleon', 'mantis'];
  assert.deepEqual([...early.campaign.faunaGranted].sort(), [...owedEarly].sort(),
    'a half-conquered save is granted exactly what it had earned');
  const beforeCatalog = new Set(catalogFor(early, content).map((sp) => sp.id));
  early.campaign.heldNodes.push('checkpoint', 'precinct');
  const afterCatalog = new Set(catalogFor(early, content).map((sp) => sp.id));
  for (const id of beforeCatalog) assert.ok(afterCatalog.has(id), `${id} survives conquest`);
  assert.ok(afterCatalog.size > beforeCatalog.size,
    `and conquest still adds to it (${beforeCatalog.size} -> ${afterCatalog.size})`);
}

// --- The War Room's headline row must not collide with itself ---------
// Four columns fitted while the numbers were small. A fully conquered map
// reads "+$2385/day" beside "128W-12L", and at 380px those two overlapped
// mid-glyph — while every measurement in this suite reported four cells of
// equal height, because overflowing text does not change a box. The fix is
// two columns on phone widths; this pins the breakpoint above the 380px the
// Definition of Done names, so it cannot drift back down.
{
  const css = readFileSync(join(root, 'style.css'), 'utf8');
  const m = css.match(/@media \(max-width: (\d+)px\) \{\s*\.econ-row \{ grid-template-columns: repeat\(2/);
  assert.ok(m, 'the econ row still has a two-column breakpoint');
  assert.ok(Number(m[1]) >= 380, `and it fires at or above 380px (found ${m[1]}px)`);
}

// --- R26: the Threat Generation ladder --------------------------------
{
  const ladder = threatLadder(content);
  assert.ok(ladder.length >= 3, `three Threat Generations (${ladder.map((r) => r.gen).join(', ')})`);
  assert.equal(ladder[0].at, 0, 'Generation 1 is where everybody starts');
  for (let i = 1; i < ladder.length; i++) {
    assert.ok(ladder[i].at > ladder[i - 1].at, 'the ladder climbs');
    assert.ok(ladder[i].gen === ladder[i - 1].gen + 1, 'and it climbs one rung at a time');
    assert.ok(ladder[i].announce, `Gen ${ladder[i].gen} announces itself in the wire`);
  }

  const gen = (notoriety) => threatGen({ campaign: { notoriety } }, content);
  assert.equal(gen(0), 1);
  for (const rung of ladder.slice(1)) {
    assert.equal(gen(rung.at - 1), rung.gen - 1, `just short of ${rung.at} is still Gen ${rung.gen - 1}`);
    assert.equal(gen(rung.at), rung.gen, `${rung.at} notoriety is Gen ${rung.gen}`);
  }

  // Every gen-gated node must be reachable: the notoriety banked by
  // everything that opens BEFORE it has to clear the rung it asks for,
  // or the node is a locked door with the key inside.
  const regions = Object.values(content.regions);
  let banked = 0;
  for (const region of regions) {
    for (const node of region.nodes) {
      const need = node.threatGen ?? 1;
      const at = ladder.find((r) => r.gen === need)?.at ?? 0;
      assert.ok(banked >= at,
        `${node.id} needs Gen ${need} (${at}), and the map before it banks ${banked}`);
      banked += node.notoriety;
    }
    const req = region.requires ?? {};
    if (req.threatGen) {
      const at = ladder.find((r) => r.gen === req.threatGen)?.at ?? 0;
      const before = regions.slice(0, regions.indexOf(region)).flatMap((r) => r.nodes)
        .reduce((sum, n) => sum + n.notoriety, 0);
      assert.ok(before >= at, `${region.id} needs Gen ${req.threatGen} (${at}), and the strips before it bank ${before}`);
    }
  }
}

// --- A4: a visit is more than one click and a wait -------------------
//
// The audit filed this as "there is one thing to do per visit and it is on
// a cooldown". Measured against the state the criterion names, that was
// WRONG — five things were open. But four of the five were purchases (buy
// an animal, buy pen space, buy a training session, buy your way out of the
// Infirmary) and the fifth was a fifteen-hour job. Nothing a player could
// do produced a next thing to do.
//
// So the gate is not a count. Three ways to spend the same money is one
// idea wearing three hats, and a criterion that a bank balance can satisfy
// measures the bank balance.
{
  const { agenda, agendaShape, AGENDA } = await import('../ranch/agenda.js');
  const { startOperation, activeOps, jobSlots, crewedOps, opTuning: opTune, tickOperations: tickOps } =
    await import('../campaign/operations.js');
  const { extractAnimal } = await import('../splice/extract.js');

  const stableOf = (now, hurt) => ['a', 'b', 'c'].map((k, i) => ({
    id: 'c' + k, name: 'Chimera ' + k, frame: 'M', bond: 40, xp: 0, level: 2,
    settledAt: t0 - 40 * HOUR, temperament: { nerve: 0, temper: 0 },
    ...(hurt ? { injury: { name: 'Dragged Itself Home', until: now + 3 * HOUR } } : {}),
    tokens: Object.fromEntries(SLOTS.map((sl) => [sl, {
      id: `t${i}${sl}`, partId: `goat_${sl}`, grade: 'standard',
      donor: { name: 'D', species: 'goat', stars: 3, extractedAt: t0 },
    }])),
  }));

  // Every entry has to be reachable in principle, or the panel is a list of
  // things that are permanently greyed out.
  // The screen ids are read out of main.js's own SCREENS map rather than
  // listed here, because showScreen() falls back to the Ranch for anything
  // it does not recognise — so a wrong id renders a button that looks wired
  // and quietly does nothing. That is exactly what shipped in the first cut
  // of this panel: `war` and `splice` are tab LABELS; the keys are `battle`
  // and `theater`, and every row silently went home to the Ranch.
  const shell = readFileSync(join(root, 'main.js'), 'utf8');
  const screensBlock = shell.slice(shell.indexOf('const SCREENS = {'));
  const realScreens = [...screensBlock.slice(0, screensBlock.indexOf('};')).matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);
  assert.ok(realScreens.length >= 5, `found the shell's screen map (${realScreens.join(', ')})`);
  for (const item of AGENDA) {
    assert.ok(item.id && item.label && item.hint, `${item.id}: says what it is`);
    assert.ok(['work', 'campaign', 'spend'].includes(item.kind), `${item.id}: has a kind`);
    assert.ok(realScreens.includes(item.screen),
      `${item.id} points at a screen the shell actually has (${item.screen} not in ${realScreens.join(', ')})`);
  }

  // THE CRITERION: money, a stable, and a lost fight — everyone hurt, and
  // the one job they launched still out.
  const now = t0 + 2 * HOUR;
  const lost = freshRanchState();
  ensureRanchSeeded(lost, content, t0);
  lost.funds = 900;
  lost.campaign.heldNodes = ['barn_perimeter'];
  lost.chimeras = stableOf(now, true);
  lost.campaign.operations = [{
    opId: 'petting_zoo', chimeraId: null, startedAt: now - HOUR, until: now + HOUR / 2,
    chance: 0.5, outcome: { success: false, funds: 0, species: null, injuryRoll: 1 },
  }];
  for (const a of lost.ranch.stock) for (const k of Object.keys(a.lastCare)) a.lastCare[k] = now;

  const shape = agendaShape(lost, content, now);
  const listed = shape.open.map((i) => `${i.kind}:${i.id}`).join(' ');
  assert.ok(shape.count >= 3, `three distinct things to do (${shape.count}: ${listed})`);
  assert.ok(shape.kinds.length >= 3,
    `and they are three KINDS of thing, not three ways to spend the same money (${listed})`);
  assert.ok(shape.productive >= 1,
    `at least one of them makes something rather than spending (${listed})`);

  // Rule 1 of the jobs board, which A4 broke and then fixed: something is
  // ALWAYS runnable. Slots scale with the creatures fit to work, so a stable
  // entirely in the Infirmary has none — and the crewless job must not need
  // one, or the guarantee dies exactly where it is needed.
  assert.equal(jobSlots(lost, content, now), 0, 'a stable in the Infirmary crews nothing');
  assert.ok(shape.open.some((i) => i.id === 'job'), 'and paperwork is still on the board');
  const paper = startOperation(lost, 'grant_application', null, content, now);
  assert.ok(paper.ok, `the crewless job actually starts: ${paper.msg}`);
  assert.equal(activeOps(lost).length, 2, 'alongside the one already out');

  // THE POINT: a thing you can do produces a NEXT thing to do. Before A4 the
  // husbandry loop — graduate a donor, splice what comes out — was shut for
  // the first six to twelve hours of every save, because every starter
  // animal was born the moment the app first opened.
  const before = agenda(lost, content, now).map((i) => i.id);
  assert.ok(before.includes('graduate'), `a donor is grown on day one (${before.join(', ')})`);
  assert.ok(!before.includes('splice'), 'and the vault is empty until you use it');
  const donor = lost.ranch.stock.find((a) => ageStage(a, content, now) !== 'juvenile');
  const grad = extractAnimal(lost, donor.id, content, now);
  assert.ok(grad.ok, `graduating works: ${grad.msg}`);
  const after = agenda(lost, content, now).map((i) => i.id);
  assert.ok(after.includes('splice'), `and it opens the next thing (${after.join(', ')})`);

  // Concurrency scales with the stable, and stops. A board that grows without
  // limit is an idle game, and conquest has to stay the better deal.
  const fit = freshRanchState();
  ensureRanchSeeded(fit, content, t0);
  fit.funds = 900;
  fit.chimeras = stableOf(now, false);
  assert.equal(jobSlots(fit, content, now), 3, 'three fit creatures, three crews');
  fit.chimeras = [...stableOf(now, false), { ...stableOf(now, false)[0], id: 'cd', name: 'Chimera d' }];
  assert.equal(jobSlots(fit, content, now), opTune(content).maxJobs, 'and it caps');

  // Two crewed jobs at once, and the same creature cannot be in both places.
  const two = freshRanchState();
  ensureRanchSeeded(two, content, t0);
  two.funds = 900;
  two.chimeras = stableOf(now, false);
  assert.ok(startOperation(two, 'county_fair', 'ca', content, now).ok, 'first crewed job');
  assert.equal(startOperation(two, 'aquarium', 'ca', content, now).ok, false, 'the same crew cannot go twice');
  assert.ok(startOperation(two, 'aquarium', 'cb', content, now).ok, 'a second creature can');
  assert.equal(crewedOps(two, content).length, 2, 'two crews out');
  assert.ok(startOperation(two, 'aviary', 'cc', content, now).ok, 'and a third, at the cap');
  assert.equal(startOperation(two, 'reptile_house', 'ca', content, now).ok, false, 'but not a fourth');

  // Several finishing at once must ALL resolve. Dropping the rest would be a
  // reward the player earned and cannot see.
  const done = tickOps(two, content, now + 99 * HOUR);
  assert.equal(done.results.length, 3, `every finished job resolves (${done.results.length})`);
  assert.equal(activeOps(two).length, 0, 'and the board empties');
}

// --- A9: the frame is a decision, not a ladder -------------------------
//
// The audit item said frames "set base stats and socket count" and are "the
// widest lever in the builder". Measured over 105 (node x archetype) cells:
// bigger was better in 92% of them, the S frame was strictly best in
// exactly ZERO, and all three frames declared the identical eight sockets —
// socket count was a facility grant, never a frame property.
//
// The cause was that mass cost only turn order, while hp/stamina/regen were
// unconditional. The one categorical payoff for staying light — flight —
// was computed in physiology and read by NOTHING; and separately, the
// Airborne DEFENDER tag came from ancestry, so 61 bird parts handed out
// Ground-immunity at any mass on any chassis. Worse, no enemy in the game
// threw a Ground-tagged move at all: `Ground -> Airborne x0` was a one-way
// rule that only ever punished the player's own 20 Ground moves.
{
  const { ARCHETYPES, partsOnFrame, scriptedBattle, nodeConditions } = await import('../tools/sim.js');
  const { theaterGrants } = await import('../splice/facility.js');
  const frames = Object.values(content.frames);

  // 1. Airborne is a claim about PHYSICS now. Same parts, four chassis: the
  //    tag has to follow the lift equation, or mass is free again.
  const birdParts = ['eagle_head', 'eagle_forelimbs', 'eagle_tail', 'bat_hide', 'bear_organ'];
  const airborneOn = (frameId, grade) => {
    const ids = partsOnFrame(content, frameId, birdParts);
    const tokens = ids.map((partId) => ({ id: `t-${partId}`, partId, grade, donor: { species: content.parts[partId].species } }));
    const rep = analyze(frameId, tokens, content, ids.length);
    return { tag: rep.tags.includes('Airborne'), flies: rep.flight.capable, mass: rep.mass, lift: rep.lift };
  };
  for (const f of frames) {
    for (const g of GRADES) {
      const r = airborneOn(f.id, g.id);
      assert.equal(r.tag, r.flies,
        `${f.id}/${g.id}: the Airborne tag tracks actual flight (lift ${r.lift} vs mass ${r.mass})`);
    }
  }
  // And it has to actually DISCRIMINATE, or the rule is decorative.
  const flightGrid = frames.flatMap((f) => GRADES.map((g) => airborneOn(f.id, g.id).flies));
  assert.ok(flightGrid.some(Boolean) && flightGrid.some((x) => !x),
    'some frame/grade combinations fly and some do not');

  // 2. The coalition has to fight at ground level, or the x0 row is a rule
  //    that only ever costs the player. Measured before A9: 0 of 85.
  const enemyMoves = Object.values(content.enemies).flatMap((u) => u.moves ?? []);
  const groundMoves = enemyMoves.filter((m) => (m.tags ?? []).includes('Ground'));
  assert.ok(groundMoves.length / enemyMoves.length >= 0.15,
    `the coalition fights at ground level (${groundMoves.length}/${enemyMoves.length} moves are Ground)`);
  // ...but never so much that one wing pair switches a unit off.
  for (const unit of Object.values(content.enemies)) {
    const attacks = (unit.moves ?? []).filter((m) => (m.power ?? 0) > 0);
    if (!attacks.length) continue;
    assert.ok(!attacks.every((m) => (m.tags ?? []).includes('Ground')),
      `${unit.id} keeps an answer to a flier (not every attack is Ground)`);
  }
  // The air region cannot ALSO be the one that punishes flying, or every
  // strip has the same answer.
  const groundDensity = (region) => {
    let g = 0, t = 0;
    for (const node of region.nodes) {
      for (const ref of content.encounters[node.encounter].waves ?? []) {
        const u = typeof ref === 'string' ? content.enemies[ref] : ref;
        for (const m of u?.moves ?? []) { t++; if ((m.tags ?? []).includes('Ground')) g++; }
      }
    }
    return t ? g / t : 0;
  };
  const densities = Object.values(content.regions).map((r) => ({ id: r.id, d: groundDensity(r) }));
  const spread = Math.max(...densities.map((x) => x.d)) - Math.min(...densities.map((x) => x.d));
  assert.ok(spread >= 0.1,
    `how much the ground fights back varies by strip (${densities.map((x) => `${x.id} ${(x.d * 100).toFixed(0)}%`).join(', ')})`);

  // 3. A frame may declare which slots its geometry supports, which is the
  //    lever this file's own summary always claimed frames had. The Theater
  //    must refuse a part the chassis has nowhere to bolt.
  const declaring = frames.filter((f) => f.slots);
  assert.ok(declaring.length, 'at least one frame declares its own slots');
  for (const f of declaring) {
    for (const slot of f.slots) {
      assert.ok(SLOTS.includes(slot), `${f.id} declares a real slot (${slot})`);
    }
    // (geometry-vs-declaration agreement is asserted for every frame in the
    //  content-coherence block above.)
  }
  {
    const st = freshRanchState();
    ensureRanchSeeded(st, content, t0);
    st.facility = { theater: 2 };
    const kite = frames.find((f) => f.slots && !f.slots.includes('hindlimbs'));
    assert.ok(kite, 'a chassis exists that gives up a slot');
    const grantsKite = theaterGrants(st, content, kite.id);
    const grantsM = theaterGrants(st, content, 'M');
    assert.ok(!grantsKite.sockets.some((x) => slotOfSocket(x) === 'hindlimbs'),
      `${kite.id} offers no hindlimb bay`);
    assert.ok(grantsM.sockets.some((x) => slotOfSocket(x) === 'hindlimbs'),
      'M still does');
    assert.ok(grantsKite.sockets.length < grantsM.sockets.length,
      `the chassis costs a socket (${grantsKite.sockets.length} vs ${grantsM.sockets.length})`);
    // And an old frame that declares nothing is untouched — every save that
    // predates the Kite still builds exactly what it always built.
    assert.deepEqual(theaterGrants(st, content, 'L').sockets, theaterGrants(st, content).sockets,
      'a frame with no declared slots is unrestricted');
  }

  // 3b. Nothing may put a part in a socket the chassis does not have. The
  //     renderer silently SKIPS such a part, so it would draw nowhere and
  //     still pay its stats — a free limb rather than a joke. The vat is the
  //     one generator that picks a frame and a part list independently, and
  //     it is explicitly allowed to hand you a chassis you do not own.
  {
    const { startVat, tickVat } = await import('../splice/chaos.js');
    const kite = frames.find((f) => f.slots && !f.slots.includes('hindlimbs'));
    let sawRestricted = 0;
    for (let i = 0; i < 60; i++) {
      const s2 = freshRanchState();
      ensureRanchSeeded(s2, content, t0);
      s2.seed = 7000 + i;
      s2.facility = { theater: 2 };
      s2.funds = 99999;
      // Two parents, one already on the slot-restricted chassis, so the
      // vat has a real chance of choosing it AND of carrying a hindlimb
      // across from the other parent.
      const mkTokens = (sp, slots) => Object.fromEntries(slots.map((sl) => [sl,
        { id: `v${i}-${sl}`, partId: `${sp}_${sl}`, grade: 'standard',
          donor: { name: 'Vat', species: sp, stars: 3, extractedAt: 0 } }]));
      s2.chimeras = [
        { id: 'va', name: 'Alpha', frame: 'M', createdAt: t0, settleUntil: t0, instability: 5, bond: 100,
          tokens: mkTokens('goat', ['head', 'forelimbs', 'hindlimbs', 'tail', 'hide', 'organ']),
          temperament: null, injury: null },
        { id: 'vb', name: 'Beta', frame: kite.id, createdAt: t0, settleUntil: t0, instability: 5, bond: 100,
          tokens: mkTokens('wolf', ['head', 'forelimbs', 'tail', 'hide', 'organ']),
          temperament: null, injury: null },
      ];
      s2.dex.parts = Object.keys(content.parts);
      if (!startVat(s2, 'va', 'vb', content, t0).ok) continue;
      const child = tickVat(s2, content, t0 + 999 * HOUR).child;
      if (!child) continue;
      const slots = content.frames[child.frame]?.slots;
      if (!slots) continue;
      sawRestricted++;
      for (const socketId of Object.keys(child.tokens)) {
        assert.ok(slots.includes(slotOfSocket(socketId)),
          `the vat bolted a ${slotOfSocket(socketId)} to the ${child.frame} chassis, which has none`);
      }
    }
    assert.ok(sawRestricted > 0,
      `the vat actually produced a slot-restricted chassis to check (${sawRestricted}/60)`);
  }

  // 4. THE GATE THE CRITERION ASKS FOR. "The frame choice is a real decision
  //    at more than one point in the campaign" means: no chassis is the
  //    right answer everywhere, and which one is right has to depend on
  //    WHERE you are. Anything less is a ladder wearing four rungs.
  const FRAMES = frames.map((f) => f.id);
  // R32 raised this from 12. At 12 the per-region winner was decided by ties:
  // on the PRE-R32 tree three of the five strips came out exactly level
  // (kestrel M/L 3-3, drowned A/L 3-3, spire M/L 4-4), so whether this section
  // passed turned on sampling error rather than on the content. Re-measured at
  // 48 on both trees, the picture is identical — L takes 41 of ~75 decided
  // cells before and after — which is what says R32 did not move the ladder.
  // 48 costs 5.3s against 2.0s; a gate that resolves on coin flips costs more.
  const SEEDS = 48;
  const rate = (frameId, arch, region, node, grade, team) => {
    const ids = partsOnFrame(content, frameId, arch.partIds);
    let w = 0;
    for (let i = 0; i < SEEDS; i++) {
      const c = makeSimChimera(frameId, ids, grade, content);
      if (scriptedBattle(c, content.encounters[node.encounter], content,
        hashString(`a9g${region.id}${node.id}${frameId}${i}`), team).outcome === 'win') w++;
    }
    return w / SEEDS;
  };
  const bestByRegion = {};
  const bestOverall = Object.fromEntries(FRAMES.map((f) => [f, 0]));
  for (const region of Object.values(content.regions)) {
    bestByRegion[region.id] = Object.fromEntries(FRAMES.map((f) => [f, 0]));
    for (const node of region.nodes) {
      const { grade, team } = nodeConditions(region, node);
      for (const arch of Object.values(ARCHETYPES)) {
        const r = Object.fromEntries(FRAMES.map((f) => [f, rate(f, arch, region, node, grade, team)]));
        const mx = Math.max(...Object.values(r));
        const winners = FRAMES.filter((f) => r[f] === mx);
        if (winners.length === 1) { bestByRegion[region.id][winners[0]]++; bestOverall[winners[0]]++; }
      }
    }
  }
  const summary = FRAMES.map((f) => `${f} ${bestOverall[f]}`).join(', ');
  // Every chassis has to be the right answer SOMEWHERE. Before A9 the S
  // frame won zero cells out of 105 — that is the failure this catches.
  for (const f of FRAMES) {
    assert.ok(bestOverall[f] > 0, `the ${f} chassis is the best answer somewhere (${summary})`);
  }
  // And no chassis may be the answer to the whole map.
  // Threshold at 0.6 rather than 0.5 deliberately: this runs at 12 seeds
  // where the audit used 24, so the exact share moves. The failure it has to
  // catch is the pre-A9 world, where one chassis took 60 of 66 decided cells
  // (91%) — a 60% line catches that by a mile without knife-edging on noise.
  const decided = Object.values(bestOverall).reduce((a, b) => a + b, 0);
  const top = Math.max(...Object.values(bestOverall));
  assert.ok(top / decided < 0.6,
    `no chassis is the answer everywhere (best takes ${top}/${decided} = ${Math.round(top / decided * 100)}%)`);
  // "At more than one point in the campaign": NO STRIP may be a one-chassis
  // strip. This used to read "the best chassis must differ between strips",
  // which sounds stronger and measured less: at 48 seeds the map's best is L
  // on four strips and an A/L tie on the fifth, on the pre-R32 tree as much as
  // this one, so that form only ever passed by counting a tie as a second
  // answer. What A9 actually cares about is that every strip leaves the other
  // chassis real work — measured minimum 29% (kestrel) here and 35% (greenfield)
  // pre-R32, against the world this exists to catch, where one chassis took
  // 60 of 66 decided cells and would leave ~9%.
  const best = FRAMES.reduce((a, b) => (bestOverall[a] >= bestOverall[b] ? a : b));
  for (const [id, t] of Object.entries(bestByRegion)) {
    const total = Object.values(t).reduce((a, b) => a + b, 0);
    if (!total) continue;
    const others = total - t[best];
    assert.ok(others / total >= 0.2,
      `${id} is not a one-chassis strip: something other than ${best} wins there ` +
      `(${FRAMES.map((f) => `${f} ${t[f]}`).join(', ')})`);
  }
}

// --- A9: territory pays, and finishing a strip pays extra ---------------
{
  const regionsList = Object.values(content.regions);
  const st = freshRanchState();
  ensureRanchSeeded(st, content, t0);
  st.campaign.heldNodes = [];

  // Every region declares a completion bonus, and it is worth enough to be
  // a reason to take the last cheap outpost — at least the strip's median
  // node, or it is a rounding error with a headline.
  for (const region of regionsList) {
    assert.ok(region.completionBonus > 0, `${region.id} pays a completion bonus`);
    const incomes = region.nodes.map((n) => n.incomePerDay).sort((a, b) => a - b);
    const median = incomes[Math.floor(incomes.length / 2)];
    assert.ok(region.completionBonus >= median,
      `${region.id}'s strip bonus ($${region.completionBonus}) beats its median node ($${median})`);
  }

  const first = regionsList[0];
  // Hold all but one: nodes pay, the bonus does not.
  st.campaign.heldNodes = first.nodes.slice(0, -1).map((n) => n.id);
  const partial = incomePerDay(st, content);
  const partialNodes = first.nodes.slice(0, -1).reduce((s, n) => s + n.incomePerDay, 0);
  assert.equal(partial, partialNodes, 'an unfinished strip pays only its nodes');
  assert.equal(regionBonusPerDay(st, content), 0, 'and no bonus');

  // Take the last one: the bonus lands.
  st.campaign.heldNodes = first.nodes.map((n) => n.id);
  const full = incomePerDay(st, content);
  assert.equal(regionBonusPerDay(st, content), first.completionBonus, 'a finished strip pays its bonus');
  assert.equal(full, partialNodes + first.nodes.at(-1).incomePerDay + first.completionBonus,
    'and income is nodes plus bonus');

  // A contest anywhere in the strip suspends the bonus too — which is what
  // makes defending the cheapest node worth as much as defending the best.
  st.campaign.contested = [{ nodeId: first.nodes[0].id, until: t0 + 6 * HOUR, defended: 0 }];
  assert.equal(regionBonusPerDay(st, content), 0, 'a contested node suspends the whole strip bonus');
  assert.ok(incomeSuspended(st, content) >= first.completionBonus,
    'and the War Room counts the lost bonus as suspended');
  st.campaign.contested = [];

  // The raise itself: territory has to have actually gone up, or "increase
  // the income" was a comment. Measured against the pre-A9 map total of
  // 2385/day in NODE income.
  //
  // The break battery caught this one asserting the wrong thing: it summed
  // nodes AND bonuses against a node-only baseline, so rolling every node
  // back to its pre-A9 value still passed — the 1210/day of strip bonuses
  // covered the difference on their own. Two separate claims were shipped,
  // so two separate assertions.
  const nodeTotal = regionsList.reduce(
    (s, r) => s + r.nodes.reduce((a, n) => a + n.incomePerDay, 0), 0);
  const bonusTotal = regionsList.reduce((s, r) => s + r.completionBonus, 0);
  assert.ok(nodeTotal >= 2385 * 1.4,
    `node income alone is up on pre-A9 (${nodeTotal}/day vs 2385)`);
  assert.ok(bonusTotal > 0 && bonusTotal >= nodeTotal * 0.2,
    `and strip bonuses are worth holding a whole region for (${bonusTotal}/day on ${nodeTotal})`);
  // Node income still climbs strip by strip, or the ladder stopped meaning
  // anything when the numbers moved.
  const avg = regionsList.map((r) => r.nodes.reduce((a, n) => a + n.incomePerDay, 0) / r.nodes.length);
  for (let i = 1; i < avg.length; i++) {
    assert.ok(avg[i] > avg[i - 1],
      `strip ${i + 1} pays better per node than strip ${i} (${Math.round(avg[i - 1])} -> ${Math.round(avg[i])})`);
  }
}

// --- A10: every real-world clock, reconciled ---------------------------
//
// R24 cut every wall-clock timer by a quarter. The item named one survivor
// (`operations.json` still carrying `injuryHours: [2, 5]` against a code
// default already at [1.5, 3.75]) and the audit found the mechanism behind
// it, plus two more of the same shape:
//
//   1. CODE DEFAULT vs DATA DRIFT. Seven modules merge {...DEFAULTS, ...data}
//      so a Node tool with a partial bundle still behaves. The data always
//      wins, so a default that disagrees with it is a lie that never runs --
//      and a global retune that edits one and not the other leaves no trace.
//      That is exactly how injuryHours survived: the cut touched the code.
//   2. `growthHours` was cut for ZERO of 32 species while `incubationMinutes`
//      was cut for all of them -- the egg timer shortened, the growing-up
//      timer left alone, in the same pipeline.
//   3. The rehab formula's per-unit coefficients were missed while its base
//      and cap were cut, so that clock fell only to 0.86-0.93 -- and least of
//      all for the strongest units, which are the ones you wait longest on.
{
  const { opTuning } = await import('../campaign/operations.js');
  const { chaosTuning } = await import('../splice/chaos.js');
  const { upkeepTuning } = await import('../splice/facility.js');
  const { scarTuning } = await import('../splice/scars.js');
  const { resequencerTuning } = await import('../splice/resequencer.js');

  // 1. THE INVARIANT THAT WOULD HAVE CAUGHT IT. Every knob a module defaults
  //    AND the data also sets must agree. Calling each tuning function with
  //    an empty bundle yields the pure code defaults; the data is read
  //    straight from the file it merges from.
  const PAIRS = [
    ['operations', opTuning, content.operationMeta],
    ['chaos', chaosTuning, content.chaosMeta],
    ['upkeep', upkeepTuning, content.upkeepMeta],
    ['scars', scarTuning, content.scarMeta],
    ['resequencer', resequencerTuning, content.resequencerMeta],
  ];
  // Numbers only. Copy strings are SUPPOSED to differ — the data is the
  // source of truth for wording and the code default is a fallback for a
  // partial bundle. Numbers are what a retune touches.
  const numeric = (v) =>
    typeof v === 'number' ||
    (Array.isArray(v) && v.length && v.every((x) => typeof x === 'number')) ||
    (v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).length &&
     Object.values(v).every((x) => typeof x === 'number'));
  let compared = 0;
  for (const [name, fn, data] of PAIRS) {
    const defaults = fn({});
    for (const [k, v] of Object.entries(data ?? {})) {
      if (!(k in defaults) || !numeric(v) || !numeric(defaults[k])) continue;
      compared++;
      assert.deepEqual(v, defaults[k],
        `${name}.${k}: the data and the code default disagree (${JSON.stringify(v)} vs ${JSON.stringify(defaults[k])}) — the data wins, so the default is a lie`);
    }
  }
  assert.ok(compared >= 12, `enough knobs are actually double-declared to make this check mean something (${compared})`);

  // The two that do not go through a tuning() helper, checked directly.
  {
    const { contestTuning } = await import('../campaign/contest.js');
    const dc = content.campaignMeta?.contestation ?? {};
    for (const [k, v] of Object.entries(dc)) {
      if (!(k in contestTuning({})) || !numeric(v)) continue;
      assert.deepEqual(v, contestTuning({})[k], `contest.${k}: data and code default disagree`);
    }
    const { rehabTuning } = await import('../campaign/rehab.js');
    const dr = content.facility?.containment?.tuning ?? {};
    for (const [k, v] of Object.entries(dr)) {
      if (!(k in rehabTuning({})) || !numeric(v)) continue;
      assert.deepEqual(v, rehabTuning({})[k], `rehab.${k}: data and code default disagree`);
    }
  }

  // 2. THE ROLL. Every real-world clock in the data, by path and value. It
  //    is deliberately a literal, like R29's SHIPPED_SYSTEMS: a new clock has
  //    to come here and say so, and the next global retune gets one list to
  //    walk plus a suite that names every value it missed. R24 had neither,
  //    which is the whole reason A10 exists.
  const CLOCKS = {
    'chaos.tuning.gestationBaseHours': 3.75,
    'chaos.tuning.gestationPerSocketHours': 1.12,
    'chaos.tuning.exhaustionHours': 15,
    'facility.containment.baseHours': 4.5,
    'facility.containment.maxHours': 22.5,
    'facility.containment.hoursPerPower': 0.0675,
    'facility.containment.hoursPerInstability': 0.0375,
    'operations.heatHalfLifeHours': 13.5,
    'operations.injuryHours.min': 1.5,
    'operations.injuryHours.max': 3.75,
    'contestation.firstDelayHours': 4.5,
    'contestation.cooldownHours': 15,
    'contestation.cooldownPerDefenceHours': 5.25,
    'contestation.windowHours': 13.5,
    'resequencer.hours': 2,
  };
  const actual = {
    'chaos.tuning.gestationBaseHours': content.chaosMeta.gestationBaseHours,
    'chaos.tuning.gestationPerSocketHours': content.chaosMeta.gestationPerSocketHours,
    'chaos.tuning.exhaustionHours': content.chaosMeta.exhaustionHours,
    'facility.containment.baseHours': content.facility.containment.tuning.baseHours,
    'facility.containment.maxHours': content.facility.containment.tuning.maxHours,
    'facility.containment.hoursPerPower': content.facility.containment.tuning.hoursPerPower,
    'facility.containment.hoursPerInstability': content.facility.containment.tuning.hoursPerInstability,
    'operations.heatHalfLifeHours': content.operationMeta.heatHalfLifeHours,
    'operations.injuryHours.min': content.operationMeta.injuryHours[0],
    'operations.injuryHours.max': content.operationMeta.injuryHours[1],
    'contestation.firstDelayHours': content.campaignMeta.contestation.firstDelayHours,
    'contestation.cooldownHours': content.campaignMeta.contestation.cooldownHours,
    'contestation.cooldownPerDefenceHours': content.campaignMeta.contestation.cooldownPerDefenceHours,
    'contestation.windowHours': content.campaignMeta.contestation.windowHours,
    'resequencer.hours': content.resequencerMeta.hours,
  };
  for (const [k, want] of Object.entries(CLOCKS)) {
    assert.equal(actual[k], want, `${k} drifted from the roll (${actual[k]} vs ${want})`);
  }
  // Every job carries two clocks of its own, and they are the ones a player
  // waits on most, so they are rolled per job rather than in bulk.
  const JOB_CLOCKS = {
    petting_zoo: [1.5, 4.5], feed_coop: [3, 6.75], grant_application: [15, 22.5],
    county_fair: [4.5, 7.5], aquarium: [6, 10.5], aviary: [6, 10.5],
    reptile_house: [7.5, 13.5],
  };
  for (const [id, [hours, cooldown]] of Object.entries(JOB_CLOCKS)) {
    const op = content.operations[id];
    assert.ok(op, `${id} is still a job`);
    assert.equal(op.hours, hours, `${id}.hours drifted from the roll`);
    assert.equal(op.cooldownHours, cooldown, `${id}.cooldownHours drifted from the roll`);
  }
  assert.equal(Object.keys(content.operations).length, Object.keys(JOB_CLOCKS).length,
    'a new job has to come to the roll and declare its clocks');

  // 3. SPECIES GROWTH. `incubationMinutes` was cut and `growthHours` was not,
  //    in the same pipeline. Now both are on the same scale — except `elder`,
  //    which is deliberately exempt and has to STAY exempt: it is when the
  //    extraction penalty lands (AGE_FACTOR 0.8 against prime's 1.0), so
  //    shortening it would make every animal in every live save decline
  //    sooner. Cutting the waits and not the penalty widens the prime window
  //    rather than narrowing it, which is the direction a retune may move.
  for (const sp of Object.values(content.species)) {
    const g = sp.growthHours;
    assert.ok(g.adult >= 1 && g.adult < g.prime && g.prime < g.elder,
      `${sp.id}: growth stages are ordered and non-zero (${g.adult}/${g.prime}/${g.elder})`);
    assert.ok(g.elder - g.prime >= g.prime - g.adult,
      `${sp.id}: the prime window is not the shortest stage (${g.prime}->${g.elder})`);
  }
  // ...and every species' four clocks are rolled, not just well-ordered.
  // The break battery is why: reverting growth to its pre-A10 scale was
  // caught only by the goat's pin and by a rounding artefact on the
  // synthetic  species, which means a retune that reverted any
  // OTHER animal would have sailed through — the exact shape of the bug
  // this phase exists to close. 41 species x [adult, prime, elder, egg].
  const GROWTH = {
    bear: [9, 27, 96, 45],
    tiger: [8, 24, 90, 41],
    wolf: [8, 21, 84, 34],
    crocodile: [11, 30, 100, 49],
    gorilla: [10, 29, 96, 45],
    rhino: [11, 32, 104, 52],
    pangolin: [8, 23, 84, 38],
    tortoise: [12, 36, 120, 56],
    rhino_beetle: [5, 15, 60, 26],
    ram: [5, 15, 64, 26],
    eagle: [6, 18, 72, 34],
    bat: [5, 15, 60, 26],
    dragonfly: [4, 12, 48, 22],
    shark: [10, 29, 96, 49],
    octopus: [7, 20, 72, 34],
    electric_eel: [8, 23, 80, 38],
    anglerfish: [7, 20, 76, 34],
    frog: [5, 14, 56, 22],
    goat: [5, 14, 60, 22],
    chameleon: [7, 20, 76, 34],
    skunk: [5, 15, 64, 26],
    porcupine: [6, 18, 72, 30],
    mantis: [5, 14, 56, 22],
    cobra: [8, 23, 80, 30],
    scorpion: [6, 18, 72, 30],
    goose: [5, 15, 60, 26],
    moth: [4, 12, 48, 24],
    heron: [6, 18, 70, 33],
    owl: [6, 18, 72, 32],
    falcon: [5, 17, 66, 30],
    jellyfish: [3, 11, 44, 22],
    pufferfish: [5, 14, 58, 28],
    otter: [5, 16, 64, 31],
    armadillo: [6, 18, 70, 30],
    salvage: [1, 2, 3, 1],
    alpine_ram: [5, 15, 64, 39],
    abyssal_shark: [10, 29, 96, 51],
    storm_eagle: [6, 18, 72, 40],
    glider_skunk: [5, 15, 64, 33],
    iron_tortoise: [12, 36, 120, 56],
    pale_cobra: [8, 23, 80, 38],
  };
  for (const [id, [adult, prime, elder, egg]] of Object.entries(GROWTH)) {
    const sp = content.species[id];
    assert.ok(sp, `${id} is still a species`);
    assert.deepEqual(sp.growthHours, { adult, prime, elder },
      `${id} growth drifted from the roll (${JSON.stringify(sp.growthHours)})`);
    assert.equal(sp.incubationMinutes, egg, `${id} egg timer drifted from the roll`);
  }
  assert.equal(Object.keys(content.species).length, Object.keys(GROWTH).length,
    'a new species has to come to the roll and declare its clocks');
}

// --- R30: four moves, and every one of them says what it does ----------
//
// Anatomy handed a chimera one move per part plus every combo it unlocked —
// six or seven buttons, and 41% of the roster's 271 moves are power-0
// utility. The battle screen could not fit them, so since R28 it showed
// THREE plus a "More moves" button: a four-slot grid apologising for a
// creature that did not have four moves. And a utility move rendered as the
// word "util" and nothing else, so "Nub Wiggle · 10⚡" never told anyone it
// raises evasion — the sentence existed in keywords.json and was shown to
// nobody.
{
  const {
    MOVE_SLOTS, activeMoves, defaultPick, defaultMoveset,
    moveSummary, moveDetail, keywordEffect,
  } = await import('../battle/moves.js');
  const { movesFromTokens, combatantFromChimera } = await import('../battle/engine.js');
  const { setMoveset, moveTrainingReady, MOVE_TRAINING } = await import('../splice/theater.js');

  const knownOf = (ch) => {
    const tokens = Object.values(ch.tokens);
    return movesFromTokens(tokens, analyze(ch.frame, tokens, content), content)
      .map((m) => ({ ...m, id: m.source }));
  };

  // 1. EVERY move in the game can say what it does. This is the criterion's
  //    first half, and it is checked over the whole roster rather than a
  //    sample: a part authored tomorrow with a keyword nobody described
  //    fails here.
  let utility = 0, total = 0;
  for (const part of Object.values(content.parts)) {
    if (!part.move) continue;
    total++;
    if (part.move.power === 0) utility++;
    const move = { ...part.move, name: part.ability };
    const summary = moveSummary(move, content);
    assert.ok(summary && summary.length > 3, `${part.id}: its move says something (${summary})`);
    for (const [k, v] of Object.entries(part.move.keywords ?? {})) {
      const line = keywordEffect(k, v, content);
      assert.ok(line, `${part.id}: keyword ${k} has an effect sentence in keywords.json`);
      // The magnitude has to actually reach the sentence, or every Venom
      // move reads the same regardless of how much venom it applies.
      assert.ok(!/\{n\}|\{pct\}/.test(line), `${part.id}/${k}: the magnitude was substituted (${line})`);
    }
  }
  for (const combo of Object.values(content.combos)) {
    for (const [k, v] of Object.entries(combo.move.keywords ?? {})) {
      assert.ok(keywordEffect(k, v, content), `combo ${combo.id}: keyword ${k} is described`);
    }
  }
  assert.ok(utility / total > 0.3,
    `utility moves really are most of the problem (${utility}/${total} carry no power)`);
  // ...and a utility move's summary must not be the generic fallback, or
  // "util" has just been replaced by a longer way of saying nothing.
  for (const part of Object.values(content.parts)) {
    if (!part.move || part.move.power > 0) continue;
    const summary = moveSummary({ ...part.move, name: part.ability }, content);
    assert.notEqual(summary, 'Does nothing on its own.',
      `${part.id} is a utility move, so it must describe its effect`);
  }

  // 2. THE CAP IS REAL. A chimera fields exactly four moves, whatever its
  //    anatomy grants — including combos, which compete for the slots
  //    rather than riding along free.
  {
    const st = freshRanchState();
    ensureRanchSeeded(st, content, t0);
    st.facility = { theater: 2 };
    const grade = 'prime';
    // Seven parts filling seven bays, so the build knows more moves than it
    // can carry: cobra head + cobra organ is the Injection combo, and the
    // second organ bay takes a DIFFERENT organ (the same token cannot be
    // installed twice — the Theater says so, and it is right).
    st.inventory.parts = ['cobra_head', 'cobra_organ', 'bear_organ', 'gorilla_forelimbs', 'rhino_hindlimbs', 'bear_tail', 'pangolin_hide']
      .map((partId, i) => ({ id: `mv${i}`, partId, grade,
        donor: { name: 'Doris', species: content.parts[partId].species, stars: 3, extractedAt: t0 } }));
    const byPart = Object.fromEntries(st.inventory.parts.map((tk) => [tk.partId, tk.id]));
    const slots = {
      head: byPart.cobra_head, forelimbs: byPart.gorilla_forelimbs,
      hindlimbs: byPart.rhino_hindlimbs, tail: byPart.bear_tail,
      hide: byPart.pangolin_hide, organ: byPart.cobra_organ, organ2: byPart.bear_organ,
    };
    const res = spliceChimera(st, 'M', slots, content, t0);
    assert.ok(res.ok, res.msg);
    const ch = res.chimera;
    const known = knownOf(ch);
    assert.ok(known.length > MOVE_SLOTS,
      `this build knows more than it can carry (${known.length}), or the cap is not under test`);
    assert.equal(ch.moveset.length, MOVE_SLOTS, 'a fresh chimera is born with four chosen');
    const unit = combatantFromChimera(ch, content, t0);
    assert.equal(unit.moves.length, MOVE_SLOTS,
      `it fights with exactly ${MOVE_SLOTS} (${unit.moves.map((m) => m.name).join(', ')})`);

    // A combo is a move like any other: it can be carried and it can be cut.
    const combo = known.find((m) => m.id.startsWith('c:'));
    if (combo) {
      const without = known.filter((m) => m.id !== combo.id).slice(0, MOVE_SLOTS).map((m) => m.id);
      const r = setMoveset(st, ch.id, without, known, t0 + 99 * HOUR, content);
      assert.ok(r.ok, r.msg);
      assert.ok(!combatantFromChimera(ch, content, t0).moves.some((m) => m.name === combo.name),
        'a combo can be left out — it competes for a slot rather than riding along');
    }

    // 3. LEARNING COSTS, AND SOMETHING HAS TO GO.
    const fresh = knownOf(ch);
    const five = fresh.slice(0, MOVE_SLOTS + 1).map((m) => m.id);
    assert.equal(setMoveset(st, ch.id, five, fresh, t0 + 200 * HOUR, content).ok, false,
      'five moves is refused');
    assert.equal(setMoveset(st, ch.id, [], fresh, t0 + 200 * HOUR, content).ok, false,
      'and so is none');
    assert.equal(setMoveset(st, ch.id, ['p:not_a_part'], fresh, t0 + 200 * HOUR, content).ok, false,
      'and so is a move it does not know');

    // Reordering what it already carries is free; learning is not.
    const carried = activeMoves(fresh, ch.moveset).map((m) => m.id);
    const fundsBefore = st.funds;
    const shuffle = setMoveset(st, ch.id, [...carried].reverse(), fresh, t0 + 300 * HOUR, content);
    assert.ok(shuffle.ok && shuffle.free, 'reordering the four it has is free');
    assert.equal(st.funds, fundsBefore, 'and costs nothing');

    const newOne = fresh.find((m) => !carried.includes(m.id));
    assert.ok(newOne, 'there is something left to learn');
    const swap = [newOne.id, ...carried.slice(0, MOVE_SLOTS - 1)];
    st.funds = 0;
    assert.equal(setMoveset(st, ch.id, swap, fresh, t0 + 400 * HOUR, content).ok, false,
      'learning a move needs money');
    st.funds = 500;
    const learned = setMoveset(st, ch.id, swap, fresh, t0 + 400 * HOUR, content);
    assert.ok(learned.ok, learned.msg);
    assert.equal(st.funds, 500 - MOVE_TRAINING.cost, 'and spends it');
    assert.ok(/forgets/.test(learned.msg), `the swap says what was given up (${learned.msg})`);
    // THE MIGRATED SAVE. A v27 chimera stores `moveset: []` and is topped
    // up from the default pick at battle time, so it has been fighting with
    // four moves it never chose. Comparing against the STORED array tells
    // that player they are learning all four and charges them for it — the
    // browser QA caught this, and the battery then proved the suite could
    // not. It is checked here now.
    {
      const old = { ...ch, id: 'migrated', moveset: [], lastMoveTrainAt: 0 };
      st.chimeras.push(old);
      const oldKnown = knownOf(old);
      const carried = activeMoves(oldKnown, old.moveset).map((m) => m.id);
      assert.equal(carried.length, MOVE_SLOTS, 'a migrated chimera still fields four');
      const before = st.funds;
      // Re-picking exactly what it is already fighting with is not learning.
      const same = setMoveset(st, 'migrated', carried, oldKnown, t0 + 500 * HOUR, content);
      assert.ok(same.ok && same.free,
        'a migrated save is not charged for the moves it already had');
      assert.equal(st.funds, before, 'and its funds are untouched');
      // One genuine swap costs once, and names one move each way.
      const fresh2 = oldKnown.find((m) => !carried.includes(m.id));
      const one = setMoveset(st, 'migrated', [fresh2.id, ...carried.slice(0, MOVE_SLOTS - 1)],
        oldKnown, t0 + 500 * HOUR, content);
      assert.ok(one.ok, one.msg);
      assert.equal(st.funds, before - MOVE_TRAINING.cost, 'one swap, one fee');
      // Assert the STATE, not the prose. The first version of this counted
      // " and " in the message and failed on the correct message, because
      // "learns X, and promptly forgets Y" contains one legitimately.
      const learnedNow = old.moveset.filter((mid) => !carried.includes(mid));
      assert.equal(learnedNow.length, 1,
        `exactly one move was learned, not four (${learnedNow.join(', ')} — "${one.msg}")`);
      assert.equal(old.moveset.length, MOVE_SLOTS, 'and it still carries four');
    }

    // ...and immediately after, the cooldown bites.
    const again = fresh.find((m) => !swap.includes(m.id));
    assert.equal(setMoveset(st, ch.id, [again.id, ...swap.slice(0, MOVE_SLOTS - 1)], fresh, t0 + 400 * HOUR, content).ok,
      false, 'a second lesson has to wait');
    assert.ok(!moveTrainingReady(ch, t0 + 400 * HOUR, content).ready, 'which is what the button reports');
  }

  // 4. A MOVESET CAN NEVER LEAVE A CREATURE SHORT. Parts leave — a
  //    re-splice, a lost token, a save written before this system existed.
  //    Whatever the moveset says, four buttons come out.
  {
    const st = freshRanchState();
    ensureRanchSeeded(st, content, t0);
    st.inventory.parts = ['bear_head', 'bear_forelimbs', 'bear_hindlimbs', 'bear_tail', 'bear_hide', 'bear_organ']
      .map((partId, i) => ({ id: `k${i}`, partId, grade: 'standard',
        donor: { name: 'Doris', species: 'bear', stars: 3, extractedAt: t0 } }));
    const slots = Object.fromEntries(st.inventory.parts.map((tk) => [content.parts[tk.partId].slot, tk.id]));
    const ch = spliceChimera(st, 'M', slots, content, t0).chimera;
    const known = knownOf(ch);
    for (const bad of [undefined, [], ['p:nonsense'], ['p:bear_head'], known.map((m) => m.id)]) {
      const got = activeMoves(known, bad);
      assert.equal(got.length, Math.min(MOVE_SLOTS, known.length),
        `a moveset of ${JSON.stringify(bad)} still yields four`);
      assert.equal(new Set(got.map((m) => m.id)).size, got.length, 'and no duplicates');
    }
  }

  // 5. THE DEFAULT PICK IS NOT "THE FOUR BIGGEST NUMBERS". A build with four
  //    attacks and no answer to armour is worse than one that kept its
  //    Sonic, so the pick takes the best of each tag first. Checked on the
  //    harness archetypes, whose whole purpose is to commit to one axis.
  for (const [key, arch] of Object.entries(ARCHETYPES)) {
    const ids = partsOnFrame(content, arch.frame, arch.partIds);
    const ch = makeSimChimera(arch.frame, ids, 'prime', content);
    const known = knownOf(ch);
    const picked = defaultPick(known);
    assert.equal(picked.length, Math.min(MOVE_SLOTS, known.length), `${key}: four picked`);
    const knownTags = new Set(known.filter((m) => m.power > 0).flatMap((m) => m.tags ?? []));
    const pickedTags = new Set(picked.filter((m) => m.power > 0).flatMap((m) => m.tags ?? []));
    for (const tag of knownTags) {
      assert.ok(pickedTags.has(tag),
        `${key}: the default pick keeps its ${tag} answer (${picked.map((m) => m.name).join(', ')})`);
    }
    assert.ok(picked.some((m) => m.power > 0), `${key}: and something that hits`);
  }

  // 6. THE DETAIL SHEET HAS SOMETHING TO SHOW for every move a player can
  //    hold down, and the tag notes are read off the chart rather than
  //    remembered — so a new row in keywords.json turns up here for free.
  {
    const ch = makeSimChimera('M', partsOnFrame(content, 'M', ARCHETYPES.fumes.partIds), 'prime', content);
    for (const move of knownOf(ch)) {
      const d = moveDetail(move, content);
      assert.ok(d.name && d.cost >= 0 && d.acc > 0, `${move.name}: the sheet has its numbers`);
      assert.ok(d.effects.length || d.power > 0,
        `${move.name}: a utility move must have at least one effect to explain`);
      for (const e of d.effects) assert.ok(e.name && e.text, `${move.name}: each effect is named and explained`);
    }
    const gasNote = moveDetail({ name: 'x', power: 10, cost: 1, acc: 100, tags: ['Gas'], keywords: {} }, content).tagNotes;
    assert.ok(gasNote.some((n) => /Organic/.test(n) && /Vehicle/.test(n)),
      `Gas explains both of its chart rows (${gasNote.join(' ')})`);
  }
}

// --- R31: the Resequencer, which is what a DNA vial is FOR ------------
//
// A vial has been produced by every extraction since M2 and read by
// NOTHING. The Gene Vault listed them and that was the end of it: a pile of
// inventory that grew forever and did nothing. Worse, it hid a real loss —
// `potential` and `genotype` live on the animal, so graduating your best
// recessive carrier destroyed those genes. Extraction was the one
// irreversible act in the game.
{
  const {
    resequencePlan, startResequence, cancelResequence, tickResequencer,
    activeResequence, resequencerTuning,
  } = await import('../splice/resequencer.js');

  const donorState = (seed, tweak = {}) => {
    const st = { ...newGameState(), seed };
    ensureRanchSeeded(st, content, t0);
    const a = st.ranch.stock[0];
    a.birthAt = t0 - 200 * HOUR;
    Object.assign(a, tweak);
    return { st, a };
  };

  // 1. THE VIAL CARRIES THE DONOR. Without this the feature cannot exist:
  //    a vial that stores only a star average cannot grow anybody back.
  {
    const { st, a } = donorState(9001, {
      genotype: { dense_bones: 2 },
      potential: { hp: 5, power: 4, armor: 4, speed: 3, stamina: 4 },
    });
    const vial = extractAnimal(st, a.id, content, t0).vial;
    assert.deepEqual(vial.genotype, { dense_bones: 2 }, 'the vial banks the donor genotype');
    assert.deepEqual(vial.potential, { hp: 5, power: 4, armor: 4, speed: 3, stamina: 4 },
      'and its star potential');
    // ...and it is a COPY. Aliasing the animal's object would let anything
    // that touched the vial edit a creature that has already left the herd.
    assert.notEqual(vial.genotype, a.genotype, 'banked by value, not by reference');
  }

  // 2. THE ODDS ARE QUOTED BEFORE THE PLAYER COMMITS. This game shows its
  //    arithmetic (R28, A7); a one-in-four loss nobody was told about is a
  //    different feature from one they accepted.
  {
    const { st, a } = donorState(9002, { potential: { hp: 5, power: 5, armor: 5, speed: 5, stamina: 5 } });
    const vial = extractAnimal(st, a.id, content, t0).vial;
    const plan = resequencePlan(st, vial.id, content, t0);
    assert.ok(plan.ok, plan.msg);
    const t = resequencerTuning(content);
    assert.equal(plan.successChance, t.successBase, 'the take chance is quoted');
    assert.ok(plan.hours > 0, 'and the clock');
    assert.ok(plan.mutationChance > 0 && plan.mutationChance < 1, 'and the odds of a new gene');
    // Quality buys UPSIDE, not safety: a better vial mutates more often and
    // fails exactly as often.
    const { st: st2, a: a2 } = donorState(9003, { potential: { hp: 1, power: 1, armor: 1, speed: 1, stamina: 1 } });
    const poor = resequencePlan(st2, extractAnimal(st2, a2.id, content, t0).vial.id, content, t0);
    assert.ok(plan.mutationChance > poor.mutationChance,
      `a five-star vial is likelier to throw a new gene (${plan.mutationChance.toFixed(2)} vs ${poor.mutationChance.toFixed(2)})`);
    assert.equal(plan.successChance, poor.successChance,
      'but it is no safer — quality is upside, not insurance');
  }

  // 3. THE OUTCOME IS SEALED AT LAUNCH. Reloading must not reroll a failure
  //    into a success — the same law the vat and the jobs board run under.
  {
    const { st, a } = donorState(9004);
    const vial = extractAnimal(st, a.id, content, t0).vial;
    startResequence(st, vial.id, content, t0);
    const sealed = JSON.stringify(activeResequence(st).outcome);
    const reloaded = JSON.parse(JSON.stringify(st));
    assert.equal(JSON.stringify(reloaded.resequencer.outcome), sealed,
      'the outcome survives a save/load unchanged');
    assert.equal(st.inventory.vials.length, 0, 'and the vial is committed, not held');
  }

  // 4. THE DONOR COMES BACK WHOLE. This is the entire point: the genes that
  //    used to be destroyed by extraction are the ones that must return.
  {
    let took = 0, mutated = 0, keptTheGene = 0, runs = 200;
    for (let i = 0; i < runs; i++) {
      const { st, a } = donorState(9100 + i, {
        genotype: { dense_bones: 2 },
        potential: { hp: 4, power: 4, armor: 4, speed: 4, stamina: 4 },
      });
      const vial = extractAnimal(st, a.id, content, t0).vial;
      const donorName = vial.donorName;
      startResequence(st, vial.id, content, t0);
      const res = tickResequencer(st, content, t0 + 99 * HOUR);
      if (!res.result?.ok) continue;
      took++;
      if (res.result.mutated) mutated++;
      const back = res.result.animal;
      assert.equal(back.species, vial.species, 'the same species comes back');
      assert.equal(back.name, donorName, 'under the same name');
      if ((back.genotype.dense_bones ?? 0) >= 2) keptTheGene++;
      assert.ok(st.ranch.stock.includes(back), 'and it lands in the pens');
    }
    const t = resequencerTuning(content);
    assert.ok(Math.abs(took / runs - t.successBase) < 0.12,
      `about ${Math.round(t.successBase * 100)}% take (${took}/${runs})`);
    assert.ok(took - keptTheGene <= mutated,
      `the donor's recessive survives every run that did not mutate it away (${keptTheGene}/${took})`);
    assert.ok(mutated > 0, `and some runs throw a new gene (${mutated}/${took})`);
  }

  // 5. A FAILURE COSTS THE VIAL AND NOTHING ELSE. No creature is harmed —
  //    the house rule since R11 is that failure costs time and a bruise.
  {
    let checked = 0;
    for (let i = 0; i < 60 && checked < 1; i++) {
      const { st, a } = donorState(9300 + i);
      const vial = extractAnimal(st, a.id, content, t0).vial;
      const herd = st.ranch.stock.length;
      const funds = st.funds;
      startResequence(st, vial.id, content, t0);
      if (activeResequence(st).outcome.succeeded) continue;
      const res = tickResequencer(st, content, t0 + 99 * HOUR);
      checked++;
      assert.equal(res.result.ok, false, 'a collapsed run reports failure');
      assert.equal(st.resequencer, null, 'and clears');
      assert.equal(st.ranch.stock.length, herd, 'the herd is untouched');
      assert.equal(st.funds, funds, 'and so is the money');
      assert.equal(st.inventory.vials.length, 0, 'the vial is spent, which is the risk');
      assert.ok(res.news.length, 'and the wire says so');
    }
    assert.equal(checked, 1, 'a failing run was actually found to check');
  }

  // 6. ABORTING RETURNS THE SAMPLE, NOT THE OUTCOME. Writing the outcome
  //    back would let a player abort-cycle a mutation into the vial for
  //    free — they cannot see the roll, but the genome would still ratchet
  //    upward on every aborted run. Measured before the fix: a 3/3/3/3/3
  //    donor walked to 3/4/4/5/3 over 60 cycles without completing one.
  {
    const { st, a } = donorState(9500, {
      genotype: { dense_bones: 1 },
      potential: { hp: 3, power: 3, armor: 3, speed: 3, stamina: 3 },
    });
    const vial = extractAnimal(st, a.id, content, t0).vial;
    const before = JSON.stringify({ p: vial.potential, g: vial.genotype });
    for (let i = 0; i < 40; i++) {
      assert.ok(startResequence(st, st.inventory.vials[0].id, content, t0).ok, 'restartable');
      assert.equal(st.inventory.vials.length, 0, 'the vial is in the machine');
      assert.ok(cancelResequence(st, content).ok, 'and comes back on abort');
      assert.equal(st.inventory.vials.length, 1, 'exactly once');
    }
    const after = JSON.stringify({ p: st.inventory.vials[0].potential, g: st.inventory.vials[0].genotype });
    assert.equal(after, before, `40 abort cycles change nothing (${before} vs ${after})`);
  }

  // 7. A FULL PEN WAITS. Losing a successful decant to a housekeeping
  //    problem the player could not see coming is exactly the surprise this
  //    project's house rules forbid.
  {
    let checked = 0;
    for (let i = 0; i < 40 && !checked; i++) {
      const { st, a } = donorState(9700 + i);
      const vial = extractAnimal(st, a.id, content, t0).vial;
      startResequence(st, vial.id, content, t0);
      if (!activeResequence(st).outcome.succeeded) continue;
      while (st.ranch.stock.length < st.ranch.penCapacity) {
        st.ranch.stock.push(createAnimal(st, 'goat', content, t0));
      }
      const res = tickResequencer(st, content, t0 + 99 * HOUR);
      checked++;
      assert.ok(res.waiting, 'a full pen makes the run wait');
      assert.ok(activeResequence(st), 'the run is still in flight');
      assert.equal(res.result, null, 'and nothing was decanted');
      // Free a pen and it comes out.
      st.ranch.stock.pop();
      const after = tickResequencer(st, content, t0 + 99 * HOUR);
      assert.ok(after.result?.ok, 'freeing a pen releases it');
      assert.equal(activeResequence(st), null, 'and the machine clears');
    }
    assert.equal(checked, 1, 'a successful run was found to stall');
  }

  // 8. ONE AT A TIME, and only on a vial you own.
  {
    const { st, a } = donorState(9900);
    const vial = extractAnimal(st, a.id, content, t0).vial;
    assert.equal(resequencePlan(st, 'v-nonsense', content, t0).ok, false, 'an unknown vial is refused');
    assert.ok(startResequence(st, vial.id, content, t0).ok);
    assert.equal(startResequence(st, vial.id, content, t0).ok, false, 'the machine takes one at a time');
  }
}

// Time-warp safety: a lastTickAt in the future never rewinds state.
const warp = freshRanchState();
ensureRanchSeeded(warp, content, t0);
warp.lastTickAt = t0 + 100 * HOUR;
const condBefore = warp.ranch.stock[0].condition;
applyElapsed(warp, content, t0);
assert.equal(warp.ranch.stock[0].condition, condBefore, 'negative elapsed is a no-op');


// --- R32: a part finally says what animal it came from ------------------
//
// Mass was a CONSTANT. Every one of the 41 species' anatomy totalled exactly
// 58 — head 12, forelimbs 13, hindlimbs 13, tail 5, hide 10, organ 5, for a
// moth and for a rhino alike. That was survivable while mass only bought turn
// order; A9 made it gate flight outright and cost a point of speed per 50, so
// the whole chassis decision was being priced in a currency that carried no
// information. `bulk` (what the animal weighs) x DENSITY (what the part is
// made of) is the fix, and these gates are the properties it has to hold.
{
  const { partsOnFrame } = await import('../tools/sim.js');
  const natural = Object.values(content.species).filter((s) => !s.synthetic);
  const partsOf = (id) => Object.values(content.parts).filter((p) => p.species === id);
  const massOf = (ps) => ps.reduce((a, p) => a + p.phys.mass, 0);

  // 1. Anatomy mass has to SPREAD, or nothing above this line matters. The
  //    pre-R32 roster would fail on the first assertion alone: one value, 41
  //    times.
  const totals = natural.map((s) => massOf(partsOf(s.id)));
  assert.ok(Math.max(...totals) >= 3 * Math.min(...totals),
    `the heaviest anatomy outweighs the lightest 3x (${Math.min(...totals)}..${Math.max(...totals)})`);
  const commonest = Math.max(...Object.values(totals.reduce((m, t) => ({ ...m, [t]: (m[t] ?? 0) + 1 }), {})));
  assert.ok(commonest <= natural.length * 0.25,
    `no single anatomy mass is the roster's default (${commonest}/${natural.length} species share one total)`);
  // Per slot too — a uniform head mass is the same lie one level down.
  for (const slot of ['head', 'forelimbs', 'hindlimbs', 'tail', 'hide']) {
    const v = natural.map((s) => partsOf(s.id).find((p) => p.slot === slot)).filter(Boolean).map((p) => p.phys.mass);
    assert.ok(new Set(v).size >= 5, `${slot} mass varies by species (${new Set(v).size} distinct values)`);
  }

  // 1b. And DENSITY has to carry its own half. The two assertions above pass
  //     on `bulk` alone — flatten every DENSITY to 1 and mass still varies,
  //     because the animals still differ in size. The break battery found
  //     exactly that: flattening density was caught only by the flight gates,
  //     four sections down, and never by the mass ones. Divide bulk out and
  //     what is left is the material: within one slot, the densest part must
  //     outweigh the flimsiest by well more than their animals explain.
  //     Measured 3.0x (forelimbs) to 6.5x (hide); flat density gives 1.0x.
  const bulkOf = (id) => content.species[id]?.bulk
    ?? (content.species[id]?.variantOf ? content.species[content.species[id].variantOf]?.bulk : undefined) ?? 1;
  for (const slot of ['head', 'forelimbs', 'hindlimbs', 'tail', 'hide']) {
    const d = natural.flatMap((s) => partsOf(s.id).filter((p) => p.slot === slot))
      .map((p) => p.phys.mass / bulkOf(p.species));
    const ratio = Math.max(...d) / Math.min(...d);
    assert.ok(ratio >= 2.5,
      `${slot}: what the part is MADE of moves its mass, not just how big the animal is ` +
      `(densest/flimsiest = ${ratio.toFixed(1)}x with bulk divided out)`);
  }

  // 2. Every species' parts fit the chassis it is declared on. The cobra has
  //    no limbs and rode a quadruped frame; now it rides the Kite. A species
  //    whose parts a frame cannot hold would silently lose them.
  for (const s of natural) {
    const slots = content.frames[s.frame].slots;
    if (!slots) continue;
    for (const p of partsOf(s.id)) {
      assert.ok(slots.includes(p.slot), `${s.id} is on the ${s.frame} frame, which has no ${p.slot} socket for ${p.id}`);
    }
  }

  // 3. Every natural species' own anatomy votes for its declared class.
  //    Measured before R32: the octopus, the cobra and the pale cobra voted
  //    for NOTHING (tentacles, a blob head and a coil were in no table) and
  //    the dragonfly tied itself out of Air with a pair of bug legs.
  for (const s of natural) {
    const rep = analyze(s.frame, partsOf(s.id).map((p) => tk(p.id)), content);
    assert.equal(rep.creatureClass, s.class,
      `a purebred ${s.id} is ${s.class} by its own anatomy (votes ${JSON.stringify(rep.classVotes)})`);
  }

  // 4. Flight. A flier is a species that owns a lift surface.
  const report = (frameId, ps) => {
    const ids = partsOnFrame(content, frameId, ps.map((p) => p.id));
    return analyze(frameId, ids.map((id) => tk(id)), content, ids.length);
  };
  const fliers = natural.filter((s) => partsOf(s.id).some((p) => p.phys.lift));
  assert.ok(fliers.length >= 8, `the roster has fliers to measure (${fliers.length})`);
  for (const s of fliers) {
    // 4a. A purebred flier flies on its own chassis, at the lowest grade.
    //     Every one of them failed this by 1-4 mass on the first cut.
    const home = report(s.frame, partsOf(s.id));
    assert.ok(home.flight.capable,
      `a purebred ${s.id} gets off the ground on its own ${s.frame} frame (lift ${home.lift} vs mass ${home.mass})`);
    // 4b. ...and never on the big chassis, or mass is free again.
    for (const heavy of ['M', 'L']) {
      assert.ok(!report(heavy, partsOf(s.id)).flight.capable,
        `${s.id} anatomy cannot fly a ${heavy} chassis`);
    }
  }
  // 4c. One dense import is the whole decision: swap a flier's head or hide
  //     for the heaviest one on the roster and the small chassis says no.
  //     The Kite is what you buy to carry that weight, so it must clear at
  //     least half of the loads the Scamper refuses.
  let kiteCarries = 0;
  let kiteCases = 0;
  for (const s of fliers) {
    for (const slot of ['head', 'hide']) {
      const heaviest = natural.filter((h) => h.id !== s.id)
        .map((h) => partsOf(h.id).find((p) => p.slot === slot))
        .filter(Boolean).sort((a, b) => b.phys.mass - a.phys.mass)[0];
      const mixed = partsOf(s.id).filter((p) => p.slot !== slot).concat(heaviest);
      assert.ok(!report('S', mixed).flight.capable,
        `${s.id} + ${heaviest.id} is too dense for the Scamper to lift`);
      kiteCases += 1;
      if (report('A', mixed).flight.capable) kiteCarries += 1;
    }
  }
  assert.ok(kiteCarries * 2 >= kiteCases,
    `the Kite is a flight chassis, not a lighter Scamper (carries ${kiteCarries}/${kiteCases} heavy-import builds)`);

  // 5. A limb is named for its anatomy, not its socket. Every unsigned
  //    hindlimb in the game was a "<Species> Kick" — including the moth's,
  //    which is a hindwing, and the heron's, which is a stilt.
  const verbs = new Set(Object.values(content.parts)
    .filter((p) => p.slot === 'hindlimbs' && p.species !== 'salvage')
    .map((p) => p.ability.replace(content.species[p.species].name, '').trim()));
  assert.ok(verbs.size >= 4, `hindlimb abilities follow the limb, not the slot (${verbs.size} distinct verbs)`);
  for (const p of Object.values(content.parts)) {
    if (!p.phys.lift) continue;
    assert.ok(!/Kick|Stomp|Swipe/.test(p.ability), `${p.id} is a wing; it does not ${p.ability}`);
  }
}


// --- R33: the chimera dossier ------------------------------------------
//
// The Physiology Panel computes eight rows and the Theater shows them WHILE
// YOU BUILD. Measured across the four screens a player sees after the
// creature exists: class reaches them (the briefing icon, the battle chip)
// and instability reaches them (the pens card); flight, speed, mass, lift,
// power-to-weight, the thermal band and the field tags reached them
// NOWHERE. R32 had just made the first of those decide a fight.
{
  const { dossierRows, dossierSummary } = await import('../splice/dossier.js');
  const { renderPensScreen } = await import('../splice/pens-ui.js');
  const build = (frame, species) => {
    const ids = Object.values(content.parts).filter((p) => p.species === species).map((p) => p.id);
    return analyze(frame, ids.map((id) => tk(id)), content, ids.length);
  };

  // 1. Every row the dossier states has to be a number the PANEL agrees
  //    with. They are written in different voices on purpose — the panel
  //    advises a builder, the dossier describes a creature — and the whole
  //    point of reading one report is that the two can never disagree about
  //    a fact.
  for (const [frame, sp] of [['S', 'eagle'], ['L', 'rhino'], ['M', 'octopus'], ['A', 'cobra']]) {
    const rep = build(frame, sp);
    const rows = dossierRows(rep, content);
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    assert.equal(by.speed.value, String(rep.stats.speed), `${sp}: dossier speed matches the report`);
    assert.ok(by.stamina.value.startsWith(String(rep.stats.stamina)), `${sp}: dossier stamina pool matches`);
    // A creature with no lift surface has no lift EQUATION, so the flight row
    // has nothing to quote — the first cut of this assertion demanded the
    // mass there anyway and failed on the rhino, which is a ground unit and
    // correct. Where there IS an equation, both sides of it have to be real.
    if (rep.flight.hasLiftSurface) {
      assert.ok(by.flight.note.includes(String(rep.mass)) && by.flight.note.includes(String(rep.lift)),
        `${sp}: the flight row quotes the real lift and mass`);
    }
    // Mass has to reach the player SOMEWHERE regardless — it is the number
    // R32 made decisive and the one nothing outside the Theater showed.
    assert.ok(rows.some((r) => r.note.includes(String(rep.mass))),
      `${sp}: the dossier states the creature's mass`);
    const cls = rep.creatureClass ? content.classes[rep.creatureClass].name : null;
    assert.ok(cls ? by.class.value.includes(cls) : by.class.value.includes('Unclassed'),
      `${sp}: dossier class matches the report`);
  }

  // 2. Flight is the row this phase exists for, and it has to say which of
  //    the three states the creature is actually in.
  const flightOf = (frame, sp) => dossierRows(build(frame, sp), content).find((r) => r.key === 'flight');
  assert.ok(flightOf('S', 'eagle').value.includes('Airborne'), 'a flying eagle is reported airborne');
  assert.ok(flightOf('L', 'eagle').value === 'Flightless',
    'eagle anatomy on a Rumbler is reported flightless, not grounded-by-design');
  assert.equal(flightOf('L', 'rhino').value, 'Ground unit', 'a rhino is a ground unit, not a failed flier');
  // ...and the airborne one has to explain the consequence, or the row is a badge.
  assert.ok(/underneath|under it/.test(flightOf('S', 'eagle').note),
    'the airborne row says what being airborne DOES');

  // 3. The tag rules are READ from data/keywords.json's chart, never
  //    restated. Add a row to the chart and the dossier must pick it up; the
  //    failure this catches is a second copy of the chart going stale.
  {
    const withRule = structuredClone(content);
    withRule.tagChart = [...content.tagChart,
      { attack: 'Sonic', defender: 'Airborne', mult: 3, note: 'test row' }];
    const rows = dossierRows(build('S', 'eagle'), withRule);
    const field = rows.find((r) => r.key === 'tags');
    assert.ok(field && /Sonic attacks do 3/.test(field.note),
      `a new chart row reaches the dossier without an engine edit (${field?.note})`);
    // And the real chart's rules are all present for a creature that has them.
    const real = dossierRows(build('M', 'octopus'), content).find((r) => r.key === 'tags');
    for (const rule of content.tagChart.filter((r) => r.attack === 'Gas')) {
      assert.ok(real.note.includes(rule.defender),
        `the octopus's Gas rules name ${rule.defender}`);
    }
  }

  // 4. The class row names the class that beats it. Physiology's own note
  //    says "weak to whatever beats it", which is the one fact a player
  //    cannot work out from the screen.
  for (const [frame, sp] of [['S', 'eagle'], ['M', 'octopus'], ['L', 'rhino']]) {
    const rep = build(frame, sp);
    const row = dossierRows(rep, content).find((r) => r.key === 'class');
    const beatenBy = Object.values(content.classes).find((c) => c.beats === rep.creatureClass);
    assert.ok(row.note.includes(beatenBy.name), `${sp}: the class row names ${beatenBy.name} as the counter`);
    assert.ok(!/whatever beats it/.test(row.note), `${sp}: and does not punt on it`);
  }

  // 5. The dossier must not promise the purebred SET BONUS. It is read by
  //    the panel and the Dex and by nothing in the battle engine — all 41
  //    are prose — so a dossier that quoted one would be lying about what
  //    the creature does. It states the instability discount instead, which
  //    physiology actually applies.
  const pure = dossierRows(build('S', 'eagle'), content).find((r) => r.key === 'purebred');
  assert.ok(pure, 'a purebred build says so');
  assert.ok(!pure.note.includes(content.species.eagle.setBonus.desc),
    'the dossier does not quote a set bonus the engine never reads');
  assert.ok(/instability/.test(pure.note), 'it states the effect physiology does apply');

  // 6. The shut fold has to carry the facts worth a glance, or nobody opens it.
  const sum = dossierSummary(build('S', 'eagle'), content);
  assert.ok(/Air/.test(sum) && /Airborne/.test(sum) && /speed \d/.test(sum),
    `the summary carries class, flight and speed (${sum})`);

  // 7. It renders on the pens screen, folded, for a chimera the GAME made.
  //    Hand-authoring the object was the first attempt and it quietly built
  //    a shape the game never produces — `settleUntil` missing, so browser QA
  //    showed "Settling... NaNd NaNh remaining" beside a perfectly good
  //    dossier. A fixture that has drifted from the real shape tests the
  //    fixture, so this one goes through spliceChimera like a player would.
  {
    const { spliceChimera } = await import('../splice/theater.js');
    const s2 = { ...newGameState(), seed: 909 };
    ensureRanchSeeded(s2, content, t0);
    const parts = Object.values(content.parts).filter((p) => p.species === 'eagle');
    s2.inventory.parts = parts.map((p, i) => ({
      id: `d${i}`, partId: p.id, grade: 'prime', traits: [],
      donor: { name: 'Test', species: 'eagle', stars: 3, extractedAt: 0 },
    }));
    const made = spliceChimera(s2, 'S', Object.fromEntries(parts.map((p, i) => [p.slot, `d${i}`])), content, t0);
    assert.ok(made.ok, `the fixture splices cleanly (${made.msg ?? ''})`);
    assert.ok(made.chimera.settleUntil > t0, 'and carries the settling clock the real shape has');

    const root = { innerHTML: '', querySelectorAll: () => [], querySelector: () => null };
    renderPensScreen(root, { state: s2, content, now: () => t0, save: () => {} });
    assert.ok(root.innerHTML.includes('class="dossier"'), 'the pens card renders a dossier');
    assert.ok(!/<details class="dossier" open/.test(root.innerHTML), 'folded shut by default');
    assert.ok(root.innerHTML.includes('Airborne'), 'and the flying eagle says so on its card');
    // Nothing on that card may print a NaN at the player.
    assert.ok(!/NaN/.test(root.innerHTML), 'no NaN reaches the pens card');
  }
}

console.log(`smoke ✓  ${Object.keys(content.parts).length} parts · ${Object.keys(content.frames).length} frames · ${Object.keys(content.species).length} species · ${Object.keys(content.enemies).length} enemy units · ${Object.keys(content.rivals).length} rivals · save v${SAVE_VERSION} · M1 care: ${Math.round(cared.condition)} vs ${Math.round(neglected.condition)} · M2 grades: ${resA.grade.id}/${resB.grade.id} · M4 battle: ${runA.outcome} in ${runA.turn} turns, obedience ignores ${ignores}/60`);
