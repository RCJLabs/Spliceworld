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
  // A3 (audit §9.2). Nine more animals, weighted where the audit found the
  // hole: Air owned six forelimbs and three tails in the entire game, and
  // NOTHING in the head or hindlimb sockets, so every Air build had to
  // borrow somebody else's legs and then lost the vote it was borrowing
  // them for. Five of these fly.
  heron:        B(['bird',{beak:'spear',crest:false,eyeR:10}], ['wing',{span:112}], ['stilt',{len:78}], ['fan',{spread:15}], 'down', '#cfe3ea', 'eye'),
  falcon:       B(['bird',{beak:'hook',crest:false,eyeR:11}], ['wing',{span:126}], ['talon',{len:50}], ['fan',{spread:14}], 'feather', '#ffd08a', 'bolt'),
  owl:          B(['bird',{beak:'hook',crest:false,disc:true,eyeR:13}], ['wing',{span:120}], ['talon',{len:48}], ['fan',{spread:22}], 'down', '#f5e7c8', 'howl'),
  goose:        B(['bird',{beak:'straight',crest:false,eyeR:11}], ['wing',{span:116}], ['paddle',{len:44}], ['fan',{spread:17}], 'feather', '#ffb347', 'howl'),
  moth:         B(['moth',{eyeR:16}], ['membrane',{span:108}], ['hindwing',{span:86}], ['streamer',{len:66}], 'down', '#e8c8a0', 'cloud'),
  otter:        B(['mammal',{snout:20,ear:'small',skull:25,eyeR:12,teeth:true}], ['paddle',{len:42}], ['paddle',{len:46}], ['rudder',{len:60}], 'slick', '#9fd6ef', 'wave'),
  jellyfish:    B(['bell',{eyeR:15}], ['tentacle',{len:66}], ['tentacle',{len:72}], ['drift',{len:60}], 'jelly', '#dcd0ff', 'drip'),
  pufferfish:   B(['fish',{teeth:true,gills:true,eyeR:14}], ['fin',{len:40}], ['fin',{len:42}], ['finTail',{len:50}], 'spine', '#ffe86b', 'drip'),
  armadillo:    B(['mammal',{snout:26,ear:'pointed',skull:24,eyeR:9}], ['paw',{mass:15,len:44,claws:3}], ['paw',{mass:16,len:42,claws:2}], ['scute',{len:56}], 'band', '#d8b98a', 'howl'),
};

// Signature abilities from ROADMAP §4.1: [slot, part name, ability, move].
const M = (power, cost, acc, tags, keywords) => ({ power, cost, acc, tags, keywords });
const SIGNATURE = {
  bear:         ['forelimbs', 'Bear Arms', 'Haymaker', M(80, 35, 85, [], { recoil: 0.2 })],
  tiger:        ['head', 'Tiger Head', 'Pounce', M(52, 22, 95, [], { priority: true })],
  wolf:         ['organ', 'Howl Bladder', 'Rally Howl', M(0, 18, 100, ['Sonic'], { rally: 1, accUp: 1 })],
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
  shark:        ['head', 'Shark Jaws', 'Frenzy', M(50, 28, 92, [], { frenzy: true })],
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
  heron:        ['head', 'Heron Bill', 'Spearfishing', M(58, 26, 97, [], { ignoreEvasion: true })],
  falcon:       ['forelimbs', 'Falcon Wings', 'Stoop', M(84, 36, 88, ['Airborne'], { priority: true })],
  owl:          ['organ', 'Facial Disc', 'Sound Map', M(26, 16, 100, ['Sonic'], { accUp: 1, evasionUp: 1 })],
  goose:        ['head', 'Goose Head', 'Unprovoked', M(36, 18, 100, ['Sonic'], { taunt: true, accDown: 1 })],
  moth:         ['organ', 'Scale Powder', 'Powder Burst', M(28, 20, 100, ['Gas'], { accDown: 1, evasionUp: 1 })],
  otter:        ['forelimbs', 'Otter Paws', 'Rock Trick', M(56, 24, 96, [], { ignoreArmor: true })],
  jellyfish:    ['tail', 'Stinging Threads', 'Drift Net', M(32, 18, 100, ['Venomous'], { venom: 2, slow: 1 })],
  pufferfish:   ['hide', 'Inflation Reflex', 'Inflate', M(0, 16, 100, [], { guard: true, thorns: 0.3 })],
  armadillo:    ['organ', 'Scream Bladder', 'Screaming Fit', M(30, 18, 100, ['Sonic'], { powerDown: 1, accDown: 1 })],
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
  paddle: { forelimbs: 'Paddles', hindlimbs: 'Webbed Feet' }, hindwing: { hindlimbs: 'Hindwings' }, stilt: { hindlimbs: 'Stilts' },
};
const TAIL_NAMES = { bushy: 'Brush Tail', nub: 'Nub', whip: 'Whip Tail', finTail: 'Tail Fin', fan: 'Tailfan', sting: 'Sting', coil: 'Coil', flick: 'Flicker',
  rudder: 'Rudder Tail', streamer: 'Wing Streamers', drift: 'Stinging Threads', scute: 'Banded Tail' };
const HIDE_NAMES = { fur: 'Pelt', stripes: 'Striped Coat', feather: 'Plumage', scale: 'Scales', plate: 'Plating', quill: 'Quill Coat', chitin: 'Chitin', slick: 'Slick Hide', camo: 'Camo Hide',
  down: 'Down', spine: 'Spine Coat', band: 'Banded Shell', jelly: 'Jelly Mantle' };
const TAIL_ABIL = { bushy: 'Counterbalance', nub: 'Nub Wiggle', whip: 'Whip Crack', finTail: 'Tail Drive', fan: 'Tail Rudder', sting: 'Sting', coil: 'Constrict', flick: 'Happy Flick',
  rudder: 'Course Correction', streamer: 'Streamer Flutter', drift: 'Drift Net', scute: 'Armoured Sweep' };
const HIDE_ABIL = { fur: 'Thick Fur', stripes: 'Broken Outline', feather: 'Preened Feathers', scale: 'Molted Slip', plate: 'Plate Armour', quill: 'Quill Coat', chitin: 'Chitin Guard', slick: 'Slick Coat', camo: 'Camouflage',
  down: 'Muffling Down', spine: 'Spine Coat', band: 'Banded Shell', jelly: 'Pass-Through' };
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
  heron: ['Patience Gland', 'Stand Perfectly Still'], falcon: ['Dive Reflex', 'Terminal Velocity'],
  owl: ['Facial Disc', 'Sound Map'], goose: ['Grudge Sac', 'Hold a Grudge'],
  moth: ['Scale Powder', 'Powder Burst'], otter: ['Play Drive', 'Never Still'],
  jellyfish: ['Nerve Net', 'No Central Anything'], pufferfish: ['Inflation Sac', 'Puff Up'],
  armadillo: ['Scream Bladder', 'Screaming Fit'],
};

// R20 wired the dead keywords onto specific parts by hand, straight into
// data/parts.json — so this generator, which had not been run since, would
// have quietly reverted all of it. Keyed by part id rather than by species
// because that is how R20 authored it: the Thunderhead's head does NOT
// carry its base's Lock-On.
//
// A5 added the second half of it. Two of the five attack tags — Sonic and
// Gas — existed ONLY on heads, organs and hides: support slots, capped at 62
// and 28 power. So neither could ever be a creature's MAIN attack, and both
// are tags the region ladder asks for (Sonic is the only thing that goes
// through armour, and the Foundry is 9/11 Armored at armor 11–15). Four
// parts move them into damage slots, on the species whose identity they
// already are.
const KEYWORD_MOVES = {
  tiger_forelimbs:     M(46, 24, 92, [], { bleed: 1 }),
  // A5 — Sonic you can actually swing. Priced under the generic 52 because
  // ignoring armour outright is worth a few points of power.
  goose_forelimbs:     M(48, 24, 92, ['Sonic'], {}),
  armadillo_tail:      M(40, 20, 95, ['Sonic'], {}),
  // A5 — Gas in a damage slot. Gas is x1.5 on Organic and x0 on Vehicle, so
  // leaning on it is a real trade rather than a free upgrade: the same build
  // that shreds Greenfield does nothing at all to the Foundry.
  skunk_tail:          M(42, 22, 95, ['Gas'], { accDown: 1 }),
  moth_forelimbs:      M(46, 24, 92, ['Gas'], { evasionUp: 1 }),
  // Electric could only be swung from a limb by somebody who had BRED a
  // Thunderhead Eagle — both carriers were storm_eagle, a chaos variant. An
  // eel's whole body is the organ, so its tail is an honest second door.
  electric_eel_tail:   M(50, 26, 95, ['Electric'], {}),
  crocodile_forelimbs: M(46, 24, 92, [], { slow: 0.3 }),
  gorilla_head:        M(42, 22, 95, [], { rage: true }),
  eagle_head:          M(42, 22, 95, [], { ignoreEvasion: true }),
  bat_forelimbs:       M(20, 22, 92, [], { multiHit: 3 }),
  octopus_head:        M(42, 22, 95, [], { staminaDrain: 12 }),
  porcupine_forelimbs: M(44, 24, 92, [], { thorns: 0.25 }),
};

// R23: every hide and every organ does something on a turn. A stat stick
// the player can never press is a number wearing a part's name. The KIND is
// chosen per species; the numbers live here once, so tuning "Bristles"
// tunes it in all twenty places. A species whose SIGNATURE is its hide or
// its organ overrides this and uses the signature instead.
const HIDE_ACTIVE = {
  bristles: { label: 'Bristles', move: M(0, 14, 100, [], { thorns: 0.45 }) },
  slipskin: { label: 'Slipskin', move: M(0, 10, 100, [], { evasionUp: 1 }) },
  screen:   { label: 'Screen', move: M(0, 12, 100, ['Gas'], { accDown: 1 }) },
  vanish:   { label: 'Vanish', move: M(0, 12, 100, [], { evasionUp: 2 }) },
};
const ORGAN_ACTIVE = {
  spike:    { label: 'Spike', move: M(0, 14, 100, [], { powerUp: 1 }) },
  slowMend: { label: 'Slow Mend', move: M(0, 18, 100, [], { regen: 0.09 }) },
  knit:     { label: 'Knit', move: M(0, 22, 100, [], { heal: 0.3 }) },
  focus:    { label: 'Focus', move: M(0, 12, 100, [], { accUp: 1 }) },
  leech:    { label: 'Leech', move: M(0, 14, 100, [], { staminaDrain: 20 }) },
  surge:    { label: 'Surge', move: M(0, 18, 100, [], { rally: 1 }) },
  gut:      { label: 'Gut', move: M(0, 10, 100, [], { staminaRestore: 18 }) },
};
// Where a species earned a name for its active instead of "<Species> <Kind>".
// Names for the A5 damage-slot moves, so they read as the thing the species
// is famous for rather than as "<Species> Strike".
const KEYWORD_ABILITY = {
  electric_eel_tail: 'Live Wire',
  goose_forelimbs: 'Wing Buffet',
  armadillo_tail: 'Shell Knock',
  skunk_tail: 'Business End',
  moth_forelimbs: 'Scale Storm',
};
const ACTIVE_ABILITY = {
  goat_organ: 'Second Stomach', tortoise_organ: 'Shell Rebuild', frog_organ: 'Cutaneous Mend',
  heron_organ: 'Stand Perfectly Still', falcon_organ: 'Terminal Velocity',
  goose_organ: 'Hold a Grudge', otter_organ: 'Never Still',
  jellyfish_organ: 'No Central Anything', pufferfish_organ: 'Puff Up',
};
// [hide kind, organ kind]; null where the species' signature covers the slot.
const ACTIVES = {
  bear:         ['bristles', 'spike'],     tiger:        ['bristles', 'spike'],
  wolf:         ['bristles', null],        crocodile:    ['slipskin', 'knit'],
  gorilla:      ['bristles', 'spike'],     rhino:        ['bristles', 'slowMend'],
  pangolin:     ['bristles', 'slowMend'],  tortoise:     ['bristles', 'knit'],
  rhino_beetle: ['bristles', 'slowMend'],  ram:          ['bristles', 'spike'],
  eagle:        ['slipskin', 'focus'],     bat:          ['slipskin', null],
  dragonfly:    ['slipskin', 'focus'],     shark:        ['slipskin', 'knit'],
  octopus:      ['screen', 'knit'],        electric_eel: ['bristles', null],
  anglerfish:   ['slipskin', 'knit'],      frog:         ['slipskin', 'slowMend'],
  goat:         ['bristles', 'gut'],       chameleon:    ['vanish', 'spike'],
  skunk:        ['screen', null],          porcupine:    ['bristles', 'spike'],
  mantis:       ['bristles', 'spike'],     cobra:        ['bristles', 'leech'],
  scorpion:     ['bristles', 'slowMend'],
  // A3
  heron:        ['slipskin', 'focus'],     falcon:       ['slipskin', 'focus'],
  owl:          ['slipskin', null],        goose:        ['slipskin', 'spike'],
  moth:         ['slipskin', null],        otter:        ['slipskin', 'slowMend'],
  jellyfish:    ['vanish', 'slowMend'],    pufferfish:   [null, 'spike'],
  armadillo:    ['bristles', null],
  // Variants pick their own — a Thunderhead's organ rallies where its base's
  // merely focuses, and its hide is a different hide.
  alpine_ram:   ['bristles', 'slowMend'],  abyssal_shark: ['slipskin', 'knit'],
  storm_eagle:  ['bristles', 'surge'],     glider_skunk:  ['screen', null],
  iron_tortoise:['bristles', 'slowMend'],  pale_cobra:    ['bristles', 'leech'],
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
//
// A3 moved one existing family and added six. `talon` used to vote Ground,
// on the reading that a foot is a foot; but a raptor's foot is a grappling
// hook that only touches the earth at the end of a dive, and pricing it as
// a walking leg is what made the Bat — wings AND talons — read as
// Unclassed, and what left the Air column with zero hindlimbs.
const AFFINITY_FAMILY = {
  wing: 'air', membrane: 'air', fan: 'air', talon: 'air', hindwing: 'air', streamer: 'air',
  fin: 'water', finTail: 'water', hop: 'water', paddle: 'water', rudder: 'water', drift: 'water',
  paw: 'ground', hoof: 'ground', bugleg: 'ground', scythe: 'ground', stilt: 'ground', scute: 'ground',
};
// A head votes only where the anatomy is class-defining, which is why most
// heads do not vote at all: gills breathe water and a bell swims in it, a
// beak on a hollow skull is flight kit, and a horned skull is a thing you
// brace against the ground and shove with.
const HEAD_AFFINITY = { fish: 'water', bell: 'water', bird: 'air', moth: 'air', horned: 'ground' };
// Flight SURFACES grant lift; a talon votes Air but does not hold anything up.
const LIFT_FAMILY = { wing: 90, membrane: 90, hindwing: 55 };
function affinityFor(slot, sp) {
  // A variant may rewrite what a slot votes for — the Glider Skunk's
  // patagium makes its forelimbs Air, which is the entire point of it.
  if (sp.affinity && slot in sp.affinity) return sp.affinity[slot];
  const b = buildFor(sp);
  if (slot === 'forelimbs' && b.fore) return AFFINITY_FAMILY[b.fore[0]] ?? null;
  if (slot === 'hindlimbs' && b.hind) return AFFINITY_FAMILY[b.hind[0]] ?? null;
  if (slot === 'tail') return AFFINITY_FAMILY[b.tail[0]] ?? null;
  if (slot === 'head') return HEAD_AFFINITY[b.head[0]] ?? null;
  return null;
}

// The Ground ATTACK tag is pure downside: the only chart row it appears in
// is "Ground moves miss Airborne (x0)", and there is no row where it helps.
// Every hindlimb in the game carried it, so a shark's hindfin and an
// eagle's talon both whiffed completely against anything with wings. It
// now follows the anatomy: a limb that votes Ground swings Ground, and a
// talon delivered at the bottom of a dive does not.
const GENERIC_MOVE = {
  head: (sp, aff) => M(46, 22, 95, [], {}),
  forelimbs: (sp, aff) => M(52, 24, 92, [], {}),
  hindlimbs: (sp, aff) => M(44, 20, 95, aff === 'ground' ? ['Ground'] : [], {}),
  tail: (sp, aff) => M(0, 10, 100, [], { evasionUp: 1 }),
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
    let ability = isSig ? sigAbility
      : slot === 'tail' ? TAIL_ABIL[b.tail[0]]
      : slot === 'hide' ? HIDE_ABIL[b.hide]
      : slot === 'organ' ? ORGAN_NAMES[root][1]
      : slot === 'head' ? `${sp.name} Bite`
        : slot === 'hindlimbs' ? `${sp.name} Kick`
          : `${sp.name} Strike`;
    const aff = affinityFor(slot, sp);
    let move = isSig ? sigMove : GENERIC_MOVE[slot](sp, aff);
    // Hides and organs have no generic move, so an unsigned one falls to its
    // species' active kind (R23). A signature with a real move always wins.
    if ((slot === 'hide' || slot === 'organ') && !move) {
      const kinds = ACTIVES[sp.id];
      if (!kinds) throw new Error(`${sp.id} has no hide/organ actives — every one of them must do something`);
      const kind = kinds[slot === 'hide' ? 0 : 1];
      if (!kind) throw new Error(`${sp.id}.${slot} has neither a signature move nor an active kind`);
      const def = (slot === 'hide' ? HIDE_ACTIVE : ORGAN_ACTIVE)[kind];
      move = def.move;
      ability = ACTIVE_ABILITY[`${sp.id}_${slot}`] ?? `${sp.name} ${def.label}`;
    }
    if (KEYWORD_MOVES[`${sp.id}_${slot}`]) {
      move = KEYWORD_MOVES[`${sp.id}_${slot}`];
      ability = KEYWORD_ABILITY[`${sp.id}_${slot}`] ?? ability;
    }
    // A variant's `moveTag` rides on its damaging moves — the tag chart reads
    // the ATTACK side, so this is where "Thunderhead" stops being a paint job.
    if (move && sp.moveTag && move.power > 0 && !move.tags.includes(sp.moveTag)) {
      move = { ...move, tags: [...move.tags, sp.moveTag] };
    }
    const phys = { ...SLOT_BASE[slot].phys };
    const liftFamily = slot === 'forelimbs' ? b.fore?.[0] : slot === 'hindlimbs' ? b.hind?.[0] : null;
    if (aff === 'air' && LIFT_FAMILY[liftFamily]) phys.lift = LIFT_FAMILY[liftFamily];
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
// VERBATIM MEANS VERBATIM: this used to strip classAffinity off every
// salvage part on the way out, so a rotor arm that votes Air voted nothing
// the next time anybody ran the generator. Salvage is content, not output.
const existing = JSON.parse(readFileSync(join(root, 'data/parts.json'), 'utf8'));
const salvage = existing.parts.filter((p) => p.species === 'salvage');

const out = {
  // Built from a CANONICAL base, not by appending to whatever the last run
  // left behind. The old form did `existing._doc.split(' Art style')[0] + …`,
  // which re-appended the Wave 1 paragraph on every regeneration — twenty-one
  // copies of it had piled up by the time anybody looked.
  _doc: existing._doc.split(' Wave 1: parts are generated')[0] +
    ' Wave 1: parts are generated by tools/gen-parts.js from the species roster and the' +
    ' archetype shape library (tools/shapes.js) — a dev tool, not a build step; the game' +
    ' loads this JSON as-is. classAffinity is the anatomy that votes for a chimera\'s' +
    ' elemental class (see data/classes.json). Hand-authored content lives in the' +
    ' generator too — R20\'s keyword moves and R23\'s hide and organ actives — because a' +
    ' generator that reverts four phases of tuning the next time somebody runs it is a' +
    ' trap. Art style: bold flat vector — thick @outline' +
    ' strokes on masses, thinner on detail; two googly eyes with catchlights on heads;' +
    ' @white low-opacity sheen for form; @secondary for muzzles/bellies, @accent for' +
    ' horns/beaks/claws.',
  parts: [...parts, ...salvage],
};
writeFileSync(join(root, 'data/parts.json'), JSON.stringify(out, null, 2) + '\n');
const shapeCount = out.parts.reduce((n, p) => n + p.shapes.length, 0);
console.log(`generated ${parts.length} parts across ${species.filter(s => !s.synthetic).length} species (+${salvage.length} salvage) — ${shapeCount} shapes`);
