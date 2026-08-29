// Part generator (Wave 1). Emits data/parts.json from the species roster +
// the archetype shape library. DEV TOOL: run `node tools/gen-parts.js`, commit
// the JSON. The game itself loads static data with no build step.
//
// Every part gets: stats (role-biased), phys (mass/draw/lift), tags, an
// optional move, an optional classAffinity (the anatomy that decides a
// chimera's elemental class), and generated shapes.

import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { HEADS, LIMBS, TAILS, HIDES, organ, GLYPHS } from './shapes.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const species = JSON.parse(readFileSync(join(root, 'data/species.json'), 'utf8')).species;

// family + params per slot, plus the organ glow colour and glyph.
const B = (head, fore, hind, tail, hide, glow, glyph) => ({ head, fore, hind, tail, hide, glow, glyph });
const BUILD = {
  bear:         B(['mammal',{snout:23,ear:'round',teeth:true}], ['paw',{mass:20}], ['paw',{mass:23,len:62,claws:2}], ['nub',{}], 'fur', '#f2b04e', 'zzz'),
  tiger:        B(['mammal',{snout:20,ear:'pointed',eyeR:12,skull:33,teeth:true}], ['paw',{mass:18,len:56}], ['paw',{mass:21,len:60,claws:3}], ['whip',{len:56}], 'stripes', '#ffa640', 'eye'),
  wolf:         B(['mammal',{snout:28,ear:'pointed',skull:31,teeth:true,jowl:0.8}], ['paw',{mass:16,len:58,claws:2}], ['paw',{mass:19,len:62,claws:2}], ['bushy',{len:60}], 'fur', '#9fd8ff', 'howl'),
  crocodile:    B(['reptile',{jaw:52,fangs:true,eyeR:9}], ['paw',{mass:16,len:44,claws:3}], ['fin',{len:50}], ['finTail',{len:62}], 'scale', '#8fd14f', 'wave'),
  gorilla:      B(['mammal',{snout:18,ear:'small',skull:36,mane:true}], ['paw',{mass:23,len:66,claws:2}], ['paw',{mass:20,len:48,claws:2}], ['nub',{}], 'fur', '#e8944f', 'gear'),
  rhino:        B(['horned',{horn:'nose',skull:30}], ['paw',{mass:21,len:52,claws:2}], ['paw',{mass:22,len:54,claws:2}], ['flick',{}], 'plate', '#c4cad4', 'gear'),
  pangolin:     B(['mammal',{snout:30,ear:'small',skull:26,eyeR:9}], ['paw',{mass:15,len:46,claws:3}], ['paw',{mass:16,len:44,claws:2}], ['whip',{len:56}], 'plate', '#e0c893', 'gear'),
  tortoise:     B(['reptile',{jaw:30,fangs:false,eyeR:10,frill:false}], ['fin',{len:44}], ['fin',{len:46}], ['nub',{}], 'plate', '#c2b280', 'wave'),
  rhino_beetle: B(['bug',{horn:true,eyeR:13,antennae:false}], ['bugleg',{len:52}], ['bugleg',{len:54}], ['nub',{}], 'chitin', '#8f7bb5', 'gear'),
  ram:          B(['horned',{horn:'curl'}], ['hoof',{len:50}], ['hoof',{len:54}], ['flick',{}], 'fur', '#e8dcc8', 'gear'),
  eagle:        B(['bird',{beak:'hook'}], ['wing',{span:118}], ['talon',{}], ['fan',{spread:19}], 'feather', '#ffd66e', 'feather'),
  bat:          B(['mammal',{snout:14,ear:'pointed',skull:24,eyeR:12,teeth:true}], ['membrane',{span:104}], ['talon',{len:44}], ['nub',{}], 'fur', '#c9a7d6', 'howl'),
  dragonfly:    B(['bug',{eyeR:17,mandibles:false}], ['membrane',{span:112}], ['bugleg',{len:46}], ['whip',{len:56}], 'chitin', '#d9f5f0', 'spark'),
  shark:        B(['fish',{teeth:true,gills:true,eyeR:11}], ['fin',{len:56}], ['fin',{len:52}], ['finTail',{len:62}], 'slick', '#eef2f5', 'wave'),
  octopus:      B(['blob',{}], ['tentacle',{len:64}], ['tentacle',{len:58}], ['whip',{len:56}], 'slick', '#f2c4de', 'cloud'),
  electric_eel: B(['fish',{teeth:false,gills:true,eyeR:10}], ['fin',{len:46}], ['fin',{len:44}], ['finTail',{len:62}], 'slick', '#f2e14a', 'bolt'),
  anglerfish:   B(['fish',{lure:true,teeth:true,eyeR:12}], ['fin',{len:42}], ['fin',{len:44}], ['finTail',{len:60}], 'slick', '#8ce0d8', 'eye'),
  frog:         B(['amphib',{}], ['hop',{len:38}], ['hop',{len:54}], ['nub',{}], 'slick', '#e8f5c8', 'wave'),
  goat:         B(['horned',{horn:'curl'}], ['hoof',{len:52}], ['hoof',{len:55}], ['flick',{}], 'fur', '#d4c14f', 'gear'),
  chameleon:    B(['reptile',{jaw:34,fangs:false,eyeR:12,frill:true}], ['bugleg',{len:50}], ['bugleg',{len:52}], ['coil',{}], 'camo', '#f0e68c', 'eye'),
  skunk:        B(['mammal',{snout:20,ear:'small',skull:24,eyeR:11}], ['paw',{mass:13,len:44,claws:3}], ['paw',{mass:14,len:46,claws:2}], ['bushy',{len:60}], 'fur', '#f2f0f5', 'cloud'),
  porcupine:    B(['mammal',{snout:22,ear:'small',skull:26,eyeR:10}], ['paw',{mass:14,len:44,claws:3}], ['paw',{mass:16,len:46,claws:2}], ['bushy',{len:58}], 'quill', '#d8c9a8', 'gear'),
  mantis:       B(['bug',{eyeR:15,horn:false}], ['scythe',{}], ['bugleg',{len:56}], ['whip',{len:54}], 'chitin', '#e6f7c1', 'spark'),
  cobra:        B(['reptile',{jaw:44,hood:true,fangs:true}], null, null, ['coil',{}], 'scale', '#8fd14f', 'drip'),
  scorpion:     B(['bug',{eyeR:12,mandibles:true,antennae:false}], ['scythe',{}], ['bugleg',{len:48}], ['sting',{len:66}], 'chitin', '#e8b57a', 'drip'),
};

// Signature abilities from ROADMAP §4.1: [slot, part name, ability, move].
const M = (power, cost, acc, tags, keywords) => ({ power, cost, acc, tags, keywords });
const SIGNATURE = {
  bear:         ['forelimbs', 'Bear Arms', 'Haymaker', M(80, 35, 85, [], { recoil: 0.2 })],
  tiger:        ['head', 'Tiger Head', 'Pounce', M(52, 22, 95, [], { priority: true })],
  wolf:         ['organ', 'Howl Bladder', 'Rally Howl', M(0, 15, 100, ['Sonic'], { powerUp: 1, accUp: 1 })],
  crocodile:    ['head', 'Croc Jaws', 'Chomp Lock', M(58, 28, 90, [], { trap: true })],
  gorilla:      ['forelimbs', 'Gorilla Arms', 'Suplex', M(70, 32, 90, [], { stun: 0.35 })],
  rhino:        ['head', 'Rhino Horn', 'Rhino Rush', M(95, 34, 90, ['Ground'], { charge: true })],
  pangolin:     ['hide', 'Pangolin Scales', 'Roll Up', null],
  tortoise:     ['hide', 'Shell Fortress', 'Shell Fortress', null],
  rhino_beetle: ['forelimbs', 'Beetle Horns', 'Overhead Toss', M(66, 30, 90, [], { ignoreArmor: true })],
  ram:          ['head', 'Ram Head', 'Knockback Butt', M(56, 24, 95, [], { knockback: true })],
  eagle:        ['forelimbs', 'Eagle Wings', 'Dive Bomb', M(70, 30, 90, ['Airborne'], { accUp: 1 })],
  bat:          ['organ', 'Echo Chamber', 'Echo Shriek', M(28, 16, 100, ['Sonic'], { accDown: 1 })],
  dragonfly:    ['forelimbs', 'Dragonfly Wings', 'Flicker', M(44, 18, 100, ['Airborne'], { evasionUp: 1, priority: true })],
  shark:        ['head', 'Shark Jaws', 'Frenzy', M(64, 28, 92, [], { frenzy: true })],
  octopus:      ['forelimbs', 'Eight Arms', 'Eight-Grip', M(40, 24, 95, [], { trap: true })],
  electric_eel: ['organ', 'Electric Organ', 'Discharge', M(72, 32, 95, ['Electric'], {})],
  anglerfish:   ['head', 'Angler Head', 'Lure Light', M(30, 18, 100, [], { taunt: true, accDown: 1 })],
  frog:         ['hindlimbs', 'Springlegs', 'Springboard', M(46, 20, 95, [], { evasionUp: 1 })],
  goat:         ['organ', 'Iron Gut', 'Eats Anything', null],
  chameleon:    ['hide', 'Camo Hide', 'Camouflage', null],
  skunk:        ['organ', 'Stink Gland', 'Stink Cloud', M(24, 20, 100, ['Gas'], { accDown: 1, powerDown: 1 })],
  porcupine:    ['hide', 'Quill Coat', 'Quill Coat', null],
  mantis:       ['forelimbs', 'Mantis Scythes', 'Scythe Strike', M(58, 24, 95, [], { priority: true })],
  cobra:        ['head', 'Cobra Head', 'Venom Fang', M(40, 20, 95, ['Venomous'], { venom: 1 })],
  scorpion:     ['tail', 'Scorpion Sting', 'Sting', M(48, 22, 95, ['Venomous'], { venom: 1 })],
};

// Slot stat/phys bases, scaled by the species' role bias.
// Balance pass: a chimera's health lives in its ANATOMY, not its chassis.
// Frames were carrying ~95% of a creature's HP, which made empty sockets the
// dominant strategy — you kept the health, dropped the metabolic draw, and the
// panel's "this is barely a creature" warning was simply wrong. Frames now
// grant a fraction of what they did (see frames.json) and every socket you
// fill is worth real hit points.
const SLOT_BASE = {
  head:       { stats: { power: 10, hp: 12 },             phys: { mass: 12, draw: 3 } },
  forelimbs:  { stats: { power: 9, hp: 9 },               phys: { mass: 13, draw: 3 } },
  hindlimbs:  { stats: { power: 5, speed: 3, hp: 11 },    phys: { mass: 13, draw: 3 } },
  tail:       { stats: { speed: 3, hp: 5 },               phys: { mass: 5, draw: 1 } },
  hide:       { stats: { armor: 5, hp: 20 },              phys: { mass: 10, draw: 1 } },
  organ:      { stats: { stamina: 10, regen: 4, hp: 7 },  phys: { mass: 5, draw: 3 } },
};
const ROLE_BIAS = {
  Power: { power: 1.5, speed: 0.7 }, Striker: { power: 1.25, speed: 1.2 },
  Pack: { power: 1.1, speed: 1.1 }, Bruiser: { power: 1.35, hp: 1.2, speed: 0.8 },
  Grappler: { power: 1.4, hp: 1.15, speed: 0.75 }, Charger: { power: 1.4, armor: 1.3, speed: 0.6 },
  Tank: { armor: 1.8, hp: 1.3, power: 0.7, speed: 0.7 }, Wall: { armor: 2.1, hp: 1.4, power: 0.6, speed: 0.5 },
  Lifter: { power: 1.3, armor: 1.2, speed: 0.8 }, Breaker: { power: 1.2, speed: 0.9 },
  'Aerial Striker': { speed: 1.5, power: 1.05, hp: 0.85 }, Disruptor: { speed: 1.35, power: 0.8, hp: 0.8 },
  Speedster: { speed: 1.9, power: 0.7, hp: 0.7 }, Finisher: { power: 1.45, speed: 1.1, armor: 0.8 },
  Controller: { power: 0.85, speed: 1.1, stamina: 1.2 }, Mage: { stamina: 1.5, regen: 1.3, power: 0.9, hp: 0.85 },
  Taunter: { hp: 1.2, power: 0.8, stamina: 1.2 }, Mobility: { speed: 1.6, power: 0.8, hp: 0.85 },
  Economy: { stamina: 1.3, regen: 1.2, power: 0.85 }, Ghost: { speed: 1.3, power: 0.85, armor: 0.9 },
  Debuffer: { speed: 1.15, power: 0.8, stamina: 1.15 }, Punisher: { armor: 1.5, hp: 1.15, power: 0.9 },
  Duelist: { power: 1.3, speed: 1.3, hp: 0.8 }, Poisoner: { power: 1.05, speed: 1.05 },
  Hybrid: { power: 1.1, armor: 1.2 }, Salvage: {},
};

const SLOT_NAMES = {
  paw: { forelimbs: 'Arms', hindlimbs: 'Haunches' }, hoof: { forelimbs: 'Forelegs', hindlimbs: 'Kickers' },
  wing: { forelimbs: 'Wings' }, membrane: { forelimbs: 'Wings' }, fin: { forelimbs: 'Fins', hindlimbs: 'Hindfins' },
  tentacle: { forelimbs: 'Tentacles', hindlimbs: 'Lower Arms' }, bugleg: { forelimbs: 'Foreclaws', hindlimbs: 'Hindlegs' },
  scythe: { forelimbs: 'Scythes' }, talon: { hindlimbs: 'Talons' }, hop: { forelimbs: 'Forelimbs', hindlimbs: 'Springlegs' },
};
const TAIL_NAMES = { bushy: 'Brush Tail', nub: 'Nub', whip: 'Whip Tail', finTail: 'Tail Fin', fan: 'Tailfan', sting: 'Sting', coil: 'Coil', flick: 'Flicker' };
const HIDE_NAMES = { fur: 'Pelt', stripes: 'Striped Coat', feather: 'Plumage', scale: 'Scales', plate: 'Plating', quill: 'Quill Coat', chitin: 'Chitin', slick: 'Slick Hide', camo: 'Camo Hide' };
const TAIL_ABIL = { bushy: 'Counterbalance', nub: 'Nub Wiggle', whip: 'Whip Crack', finTail: 'Tail Drive', fan: 'Tail Rudder', sting: 'Sting', coil: 'Constrict', flick: 'Happy Flick' };
const HIDE_ABIL = { fur: 'Thick Fur', stripes: 'Broken Outline', feather: 'Preened Feathers', scale: 'Molted Slip', plate: 'Plate Armour', quill: 'Quill Coat', chitin: 'Chitin Guard', slick: 'Slick Coat', camo: 'Camouflage' };
const ORGAN_NAMES = {
  bear: ['Hibernation Gland', 'Deep Snooze'], tiger: ['Predator Eye', 'Target Lock'], wolf: ['Howl Bladder', 'Rally Howl'],
  crocodile: ['Cold Heart', 'Slow Metabolism'], gorilla: ['Barrel Lungs', 'Second Wind'], rhino: ['Charge Gland', 'Wind-Up'],
  pangolin: ['Curl Reflex', 'Tuck'], tortoise: ['Slow Heart', 'Endure'], rhino_beetle: ['Lift Sac', 'Leverage'],
  ram: ['Impact Cushion', 'Shake It Off'], eagle: ['Hollow-Bone Marrow', 'Featherweight'], bat: ['Echo Chamber', 'Echo Shriek'],
  dragonfly: ['Flight Motor', 'Overclock'], shark: ['Blood Sense', 'Scent of Weakness'], octopus: ['Ink Sac', 'Ink'],
  electric_eel: ['Electric Organ', 'Discharge'], anglerfish: ['Deep Lantern', 'Lure Light'], frog: ['Moisture Sac', 'Rehydrate'],
  goat: ['Iron Gut', 'Eats Anything'], chameleon: ['Chromatophores', 'Blend'], skunk: ['Stink Gland', 'Stink Cloud'],
  porcupine: ['Bristle Root', 'Bristle'], mantis: ['Duelist Ganglion', 'Read the Blade'], cobra: ['Venom Sac', 'Extra Spicy'],
  scorpion: ['Venom Bulb', 'Top-Up'],
};

const round1 = (n) => Math.max(1, Math.round(n));
function statsFor(slot, sp) {
  const bias = ROLE_BIAS[sp.role] ?? {};
  const out = {};
  for (const [k, v] of Object.entries(SLOT_BASE[slot].stats)) {
    // Variants multiply on top of their role bias — that is where the trade
    // lives (an Iron Tortoise is 2x armour and half the speed).
    out[k] = round1(v * (bias[k] ?? 1) * (sp.statMult?.[k] ?? 1));
  }
  return out;
}

// A variant is the same stock, mutated: it inherits the base's BUILD entry
// and applies `shapeTweak` on top, so it is recognisably its parent without
// being a straight recolour. A tweak is either a params patch ({horn:'curl'})
// or a whole family swap (['membrane',{span:96}] — the Glider Skunk's
// patagium, which is the mutation the species is named for).
function buildFor(sp) {
  const base = BUILD[sp.variantOf ?? sp.id];
  if (!sp.shapeTweak) return base;
  const out = { ...base };
  for (const [key, tweak] of Object.entries(sp.shapeTweak)) {
    if (key === 'hide' || key === 'glow' || key === 'glyph') { out[key] = tweak; continue; }
    if (Array.isArray(tweak)) out[key] = tweak;
    else out[key] = [base[key][0], { ...base[key][1], ...tweak }];
  }
  return out;
}

function shapesFor(slot, sp) {
  const b = buildFor(sp);
  if (slot === 'head') return HEADS[b.head[0]](b.head[1]);
  if (slot === 'forelimbs') return b.fore ? LIMBS[b.fore[0]](b.fore[1]) : null;
  if (slot === 'hindlimbs') return b.hind ? LIMBS[b.hind[0]](b.hind[1]) : null;
  if (slot === 'tail') return TAILS[b.tail[0]](b.tail[1]);
  if (slot === 'hide') return HIDES[b.hide]();
  return organ(b.glow, GLYPHS[b.glyph](b.glow));
}

// Anatomy decides the class: wings→air, fins/gills→water, feet→ground.
const AFFINITY_FAMILY = {
  wing: 'air', membrane: 'air', fan: 'air',
  fin: 'water', finTail: 'water', hop: 'water',
  paw: 'ground', hoof: 'ground', bugleg: 'ground', talon: 'ground', scythe: 'ground',
};
function affinityFor(slot, sp) {
  // A variant may rewrite what a slot votes for — the Glider Skunk's
  // patagium makes its forelimbs Air, which is the entire point of it.
  if (sp.affinity && slot in sp.affinity) return sp.affinity[slot];
  const b = buildFor(sp);
  if (slot === 'forelimbs' && b.fore) return AFFINITY_FAMILY[b.fore[0]] ?? null;
  if (slot === 'hindlimbs' && b.hind) return AFFINITY_FAMILY[b.hind[0]] ?? null;
  if (slot === 'tail') return AFFINITY_FAMILY[b.tail[0]] ?? null;
  // Gilled heads breathe water — that counts.
  if (slot === 'head' && b.head[0] === 'fish') return 'water';
  return null;
}

const GENERIC_MOVE = {
  head: (sp) => M(46, 22, 95, [], {}),
  forelimbs: (sp) => M(52, 24, 92, [], {}),
  hindlimbs: (sp) => M(44, 20, 95, ['Ground'], {}),
  tail: (sp) => M(0, 10, 100, [], { evasionUp: 1 }),
  hide: () => null,
  organ: () => null,
};
const SLOTS = ['head', 'forelimbs', 'hindlimbs', 'tail', 'hide', 'organ'];

const parts = [];
for (const sp of species) {
  if (sp.synthetic) continue;
  const root = sp.variantOf ?? sp.id; // a variant borrows its base's tables
  const b = buildFor(sp);
  const [sigSlot, sigName, sigAbility, sigMove] = SIGNATURE[root];
  for (const slot of SLOTS) {
    const shapes = shapesFor(slot, sp);
    if (!shapes) continue; // species genuinely lacks this anatomy (cobra limbs)
    const isSig = slot === sigSlot;
    const famName = slot === 'forelimbs' ? SLOT_NAMES[b.fore[0]]?.forelimbs
      : slot === 'hindlimbs' ? SLOT_NAMES[b.hind[0]]?.hindlimbs
      : slot === 'tail' ? TAIL_NAMES[b.tail[0]]
      : slot === 'hide' ? HIDE_NAMES[b.hide]
      : slot === 'organ' ? ORGAN_NAMES[root][0] : 'Head';
    const name = isSig
      ? (sp.variantOf ? `${sp.name} ${famName === 'Head' ? 'Head' : famName}` : sigName)
      : slot === 'organ' ? famName : `${sp.name} ${famName}`;
    const ability = isSig ? sigAbility
      : slot === 'tail' ? TAIL_ABIL[b.tail[0]]
      : slot === 'hide' ? HIDE_ABIL[b.hide]
      : slot === 'organ' ? ORGAN_NAMES[root][1]
      : slot === 'head' ? `${sp.name} Bite`
        : slot === 'hindlimbs' ? `${sp.name} Kick`
          : `${sp.name} Strike`;
    let move = isSig ? sigMove : GENERIC_MOVE[slot](sp);
    // A variant's `moveTag` rides on its damaging moves — the tag chart reads
    // the ATTACK side, so this is where "Thunderhead" stops being a paint job.
    if (move && sp.moveTag && move.power > 0 && !move.tags.includes(sp.moveTag)) {
      move = { ...move, tags: [...move.tags, sp.moveTag] };
    }
    const phys = { ...SLOT_BASE[slot].phys };
    const aff = affinityFor(slot, sp);
    if (aff === 'air' && slot === 'forelimbs') phys.lift = 90;
    const part = {
      id: `${sp.id}_${slot}`, species: sp.id, slot, name, ability,
      stats: statsFor(slot, sp), phys, tags: [...sp.tags],
      ...(aff ? { classAffinity: aff } : {}),
      move, shapes,
    };
    parts.push(part);
  }
}

// Enemy-tech salvage parts are hand-authored; preserve them verbatim.
const existing = JSON.parse(readFileSync(join(root, 'data/parts.json'), 'utf8'));
const salvage = existing.parts.filter((p) => p.species === 'salvage');
for (const p of salvage) if (!('classAffinity' in p)) p.classAffinity = undefined;

const out = {
  _doc: existing._doc.split(' Art style')[0] +
    ' Wave 1: parts are generated by tools/gen-parts.js from the species roster and the' +
    ' archetype shape library (tools/shapes.js) — a dev tool, not a build step; the game' +
    ' loads this JSON as-is. classAffinity is the anatomy that votes for a chimera\'s' +
    ' elemental class (see data/classes.json). Art style: bold flat vector — thick @outline' +
    ' strokes on masses, thinner on detail; two googly eyes with catchlights on heads;' +
    ' @white low-opacity sheen for form; @secondary for muzzles/bellies, @accent for' +
    ' horns/beaks/claws.',
  parts: [...parts, ...salvage.map((p) => { const q = { ...p }; delete q.classAffinity; return q; })],
};
writeFileSync(join(root, 'data/parts.json'), JSON.stringify(out, null, 2) + '\n');
const shapeCount = out.parts.reduce((n, p) => n + p.shapes.length, 0);
console.log(`generated ${parts.length} parts across ${species.filter(s => !s.synthetic).length} species (+${salvage.length} salvage) — ${shapeCount} shapes`);
