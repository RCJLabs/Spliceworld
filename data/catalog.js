// R79 — The catalogue a save is read against.
//
// A save outlives the build that wrote it. Every ranch animal holds a
// SPECIES id, every chimera holds a FRAME id, a containment bay holds an
// ENEMY id and a class id, and the campaign holds region NODE ids — all of
// them stamped into the save the day the player made them, and all of them
// read back weeks later against whatever data/*.json ships that day. Retire
// one and the id is still there; the record behind it is not.
//
// R72 established the shape of the answer for parts, grades and classes:
// ignore what the build no longer has rather than crash on it. This module
// is that answer for the ids R72 did not reach, in one place, because the
// alternative measured on HEAD was twenty-five separate bare reads and all
// six screens down.
//
// THE RULE THIS MODULE DRAWS:
//   VALIDATION reads `content` directly — `if (!content.frames[id])` is
//     asking a real question and must get a real no.
//   PRESENTATION and MATH read through here — they are describing something
//     the player already owns, and "you own nothing" is the wrong answer.
//
// So `speciesOf` and `frameOf` never return null: they return a RETIRED
// STAND-IN with every field the readers dereference, carrying safe values
// and `retired: true` so a screen can say so out loud. `classOf`, `enemyOf`
// and `rivalOf` DO return null, because those are rows to skip rather than
// things to describe — a foe the build no longer has is not shown, it is
// left out.
//
// Region nodes are deliberately NOT here: `nodeById` in campaign/map.js has
// answered that question since R26 and already returns null on a miss. A
// second way to ask it is the copy this module exists to avoid.

// Neutral grey. Not a species palette; deliberately not one of the shipped
// ones, so a discontinued animal reads as unfinished paperwork rather than
// as somebody else's stock.
const RETIRED_PALETTE = Object.freeze({ primary: '#8a8f98', secondary: '#6c727b', accent: '#c9ced6' });

const speciesCache = new Map();
const frameCache = new Map();

// growthHours all zero = already elder. An animal whose line was
// discontinued is not going to grow any further, and every countdown that
// reads it gets a finite number instead of NaN.
//
// thermal and setBonus are null ON PURPOSE rather than filled in: they are
// the two fields whose ABSENCE is meaningful. A band nobody can state must
// not narrow the mix's comfort range, and a bonus nobody can name must not
// be claimed. Their readers check for null; everything else can dereference.
function retiredSpecies(id) {
  let rec = speciesCache.get(id);
  if (!rec) {
    rec = Object.freeze({
      id, retired: true,
      name: 'Discontinued Line',
      role: 'Unfiled',
      tags: [],
      class: null,
      palette: RETIRED_PALETTE,
      frame: null,
      bulk: 1,
      archetype: null,
      diet: 'Whatever the paperwork allowed at the time',
      feedCost: 0,
      upkeepPerDay: 0,
      mailOrderPrice: 0,
      growthHours: Object.freeze({ adult: 0, prime: 0, elder: 0 }),
      incubationMinutes: 0,
      thermal: null,
      setBonus: null,
      flavor: 'Struck from the catalogue. The specimen was not consulted.',
    });
    speciesCache.set(id, rec);
  }
  return rec;
}

// A frame is geometry, and geometry cannot be faked — the stand-in has NO
// sockets and NO torso, so anything that draws must go through the
// renderer's own `drawableGenome` (which still refuses an unknown frame)
// rather than through here. What it does carry is a name to print and a
// phys block of zeros, so the dossier and the upkeep bill stay finite.
function retiredFrame(id) {
  let rec = frameCache.get(id);
  if (!rec) {
    rec = Object.freeze({
      id, retired: true,
      name: 'Retired Chassis',
      sizeClass: '?',
      flavor: 'This chassis is no longer manufactured. It is, however, still standing here.',
      scale: 1,
      // Shapes matter: `sockets` is an OBJECT keyed by socket name (the
      // renderer indexes it by name), and `slots` is left UNDECLARED because
      // declaring it means "only these slot types are legal here" — an empty
      // list would say this chassis accepts nothing, when what we actually
      // know is nothing about it. Three of the four shipped frames omit it
      // for the same reason.
      sockets: Object.freeze({}),
      phys: Object.freeze({ mass: 0, hp: 0, stamina: 0, regen: 0, speed: 0 }),
      form: Object.freeze([]),
    });
    frameCache.set(id, rec);
  }
  return rec;
}

export function speciesOf(content, id) {
  return content?.species?.[id] ?? retiredSpecies(id);
}

export function frameOf(content, id) {
  return content?.frames?.[id] ?? retiredFrame(id);
}

// Skip-or-show, not describe-or-stand-in. Null means "leave the row out".
export function classOf(content, id) {
  return (id && content?.classes?.[id]) || null;
}

export function enemyOf(content, id) {
  return (id && content?.enemies?.[id]) || null;
}

export function rivalOf(content, id) {
  return (id && content?.rivals?.[id]) || null;
}

export function isRetired(record) {
  return Boolean(record?.retired);
}
