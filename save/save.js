// Save system. SAVE_VERSION gates all saves (the Ascent rule, sacred):
// never change the save schema without bumping SAVE_VERSION and adding a
// migration function below. Never reset player saves.

import { newWorldSeed } from '../util/rng.js';
import { TUNING } from '../ranch/ranch.js';

export const SAVE_VERSION = 49;
// R101 — exported for `save/slots.js`, which was carved out of this file
// and still addresses the same keys. Nothing outside the save system
// reads either one.
export const STORAGE_KEY = 'spliceworld_save';

export function newGameState() {
  return {
    saveVersion: SAVE_VERSION,
    seed: newWorldSeed(),
    // R119 — null until the player picks a founding lab. The seeder will
    // not run without one, so a brand-new save cannot reach the Theater
    // holding somebody else's animals.
    starterLab: null,
    createdAt: Date.now(),
    spliceCount: 0,
    // The current creature on the Surgery Theater slab.
    genome: null,
    // Stub for the AI director (ROADMAP §8.5): record tag/part usage from
    // day one so data exists when the director lands post-v0.1.
    directorStats: { partUse: {}, tagUse: {}, dissections: [], announced: [] },
    funds: TUNING.startingFunds,
    ranch: { stock: [], penCapacity: TUNING.penStartCapacity, animalCount: 0, seeded: false, eggs: [], eggCount: 0 },
    lastTickAt: null,
    activeScreen: 'ranch',
    inventory: { vials: [], parts: [], tokenCount: 0 },
    resequencer: null,
    resequenceCount: 0,
    chimeras: [],
    chimeraCount: 0,
    // R91 — the Surgery Theater is a room with one table in it. Splicing and
    // dismantling both occupy it, so a chimera is a decision rather than a
    // draft: a 180-day walk used to build 1,834 creatures to keep nine,
    // median life two hours. A timestamp like every other clock in this
    // game, and rushable like every other clock since R86.
    theater: { busyUntil: 0 },
    // How many times the player has cleared shelf space on purpose. The
    // vault guide's done-condition reads it, the same way `rushCount` backs
    // R86's.
    renderCount: 0,
    discoveredCombos: [],
    battle: null,
    warRecord: { wins: 0, losses: 0 },
    // R40: when the whole county was first held. Null until it is.
    dominionAt: null,
    // R41/R43: the Sparring Ring's seed counter, and the moment its charge
    // bucket next stands full (0 = full now).
    sparCount: 0,
    sparRefillAt: 0,
    // R42: which Gauntlet exhibitions have fallen.
    gauntletBeaten: [],
    campaign: {
      heldNodes: [], notoriety: 0, captives: [], containment: [], rivals: {}, faunaGranted: [],
      contested: [], nextContestAt: null, defences: {}, contestCount: 0,
      loose: [], nextBreakAt: null, breakoutCount: 0, released: null,
      operations: [], opCooldowns: {}, opCount: 0, opReport: null, heat: 0, heatAt: null,
      // R87: the Compliance Task Force. `raid` is the one at the gate,
      // `nextRaidAt` the schedule R9's rule requires, and the counters are
      // what the escalation and the wire read.
      raid: null, nextRaidAt: null, raidCount: 0, raidsHeld: 0, leviedTotal: 0, notorietyCapped: false,
    },
    news: [],
    settings: { muted: false, battleSpeed: 1 },
    // R51: `beaten` is the field guide's second dimension — `enemies` is a
    // sighting log and always was, so a unit that flattened you read
    // exactly like one you flattened.
    // R97 — `sightings` counts a lab's generated specimens under the same
    // `lab:{id}` key. The lists say what you met; this says how often.
    dex: { parts: [], enemies: [], beaten: [], traits: [], variants: [], sightings: {} },
    facility: { theater: 1, containment: 1, incubator: 1, extractor: 1, scanner: 1, infirmary: 1 },
    // Field-guide notes the player has waved away (R29). The guides
    // themselves are derived; this is the only thing they persist.
    guidesSeen: [],
    // Remembered UI: which cards are folded shut, and how many pages of a
    // long list the player has asked for (R131 — a Ranch that bounced back
    // to page one on every care action would be worse than the long screen).
    ui: { collapsed: {}, tierRead: false, pages: {} },
    // The §3.8 profile: the player's half of the story schema. Unnamed
    // until they choose — nothing in this game waits behind a form.
    profile: { named: false, title: null, name: null, lab: null, philosophy: null },
    // Chaos-breeding: one gestation at a time.
    vat: null,
    vatCount: 0,
    // R86: how many clocks this player has paid to hurry. The field guide
    // retires on it, and it is the only thing the mechanic persists.
    rushCount: 0,
    sentCount: 0,
  };
}
// (The v2 migration above keeps hardcoded values on purpose: migrations
// reproduce the historical schema even if TUNING drifts later.)

// R85 — `now` is threaded through because the v39 step is the first
// migration that needs a clock: it seeds a "last attended" stamp, and a
// migration that quietly reads Date.now() inside itself is one a test can
// only check approximately. Defaulted, so every existing caller is unchanged.
export async function migrate(save, now = Date.now()) {
  if (typeof save.saveVersion !== 'number') {
    throw new Error('Save has no version — refusing to guess.');
  }
  // R101 — THE WHOLE POINT OF THE SPLIT IS THIS LINE. A save already on the
  // current version needs no step, so it must not pay for the table: the
  // import below never happens for it, and the common load — every player,
  // every reload after the first one following an update — touches 26 KB
  // less. A save that IS behind waits one module for a migration it was
  // always going to run, once, before it is current forever after.
  if (save.saveVersion >= SAVE_VERSION) return save;
  const { migrations } = await import('./migrations.js');
  while (save.saveVersion < SAVE_VERSION) {
    const next = save.saveVersion + 1;
    const fn = migrations[next];
    if (!fn) throw new Error(`No migration to save version ${next}.`);
    save = fn(save, now);
    save.saveVersion = next;
  }
  return save;
}

// R71 — a save from a newer build must never be silently discarded. It used
// to fall into the same catch as a genuinely corrupt file: backed up under a
// timestamped key, and the player opened the app onto a brand-new ranch. A
// stale service-worker cache serving old code against a new save was enough
// to trigger it, and "your progress is gone" is not a refusal, it is the
// exact failure R55 exists to prevent happening any OTHER way.
//
// A future save gets its own, distinguishable outcome: `loadSlot` THROWS
// rather than returning a fresh game, and — the actual fix — touches
// NOTHING. No backup key, no rewrite, nothing. The save sits at its slot's
// key exactly as it arrived, so the day the build catches up, an ordinary
// reload finds it untouched. Corrupt JSON and an unparseable save are a
// different failure (there is no later build that will fix a broken file)
// and keep the old backup-and-start-fresh behaviour.
export class FutureSaveError extends Error {
  constructor(foundVersion) {
    super(`Save is v${foundVersion}, code is v${SAVE_VERSION}.`);
    this.name = 'FutureSaveError';
    this.foundVersion = foundVersion;
  }
}

// R71 — multiple save slots. `STORAGE_KEY` stays the literal key for slot 1
// forever: every save that has ever existed lives there, and finding it
// needs no migration or copy step that could go wrong — a slot 2 and up
// gets its own suffixed key instead. `SLOTS_KEY` holds the small registry
// (which slots exist, which is active); it is synthesized on first read for
// a player who has never opened the slot picker, so a save from before this
// phase is discovered as "slot 1" with zero action needed from anyone.
export const SLOTS_KEY = 'spliceworld_slots';
export const MAX_SLOTS = 4;

export function slotKey(id) {
  return id === 1 ? STORAGE_KEY : `${STORAGE_KEY}_${id}`;
}

export function loadSlotRegistry(storage = globalThis.localStorage) {
  try {
    const raw = storage.getItem(SLOTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.slots) && parsed.slots.length && typeof parsed.activeId === 'number') {
        return parsed;
      }
    }
  } catch { /* fall through to a synthesized single-slot registry */ }
  return { slots: [{ id: 1, name: null, createdAt: Date.now() }], activeId: 1 };
}

export function saveSlotRegistry(registry, storage = globalThis.localStorage) {
  try {
    storage.setItem(SLOTS_KEY, JSON.stringify(registry));
    return true;
  } catch {
    return false;
  }
}

// Self-healing against a registry whose active pointer somehow names a slot
// that no longer exists: falls back to whatever slot IS there rather than
// loading nothing.
export function activeSlotId(storage = globalThis.localStorage) {
  const reg = loadSlotRegistry(storage);
  if (reg.slots.some((s) => s.id === reg.activeId)) return reg.activeId;
  return reg.slots[0]?.id ?? 1;
}

export async function loadSlot(slotId, storage = globalThis.localStorage) {
  const key = slotKey(slotId);
  const fresh = () => {
    const s = newGameState();
    s.slotId = slotId;
    return s;
  };
  let raw;
  try {
    raw = storage.getItem(key);
  } catch {
    return fresh(); // storage unavailable (private mode etc.)
  }
  if (!raw) return fresh();
  let save;
  try {
    save = JSON.parse(raw);
  } catch (err) {
    console.error('Save load failed:', err);
    try {
      storage.setItem(`${key}_backup_${Date.now()}`, raw);
    } catch { /* storage full — nothing more we can do */ }
    return fresh();
  }
  if (typeof save.saveVersion === 'number' && save.saveVersion > SAVE_VERSION) {
    throw new FutureSaveError(save.saveVersion); // see FutureSaveError above — nothing is touched
  }
  let migrated;
  try {
    migrated = await migrate(save);
  } catch (err) {
    // A corrupt save is preserved for forensics, never silently destroyed.
    console.error('Save load failed:', err);
    try {
      storage.setItem(`${key}_backup_${Date.now()}`, raw);
    } catch { /* storage full — nothing more we can do */ }
    return fresh();
  }
  migrated.slotId = slotId;
  // Best-effort "last opened" stamp for the slot picker — cosmetic only,
  // so a failure here never affects the load it is riding along with.
  try {
    const reg = loadSlotRegistry(storage);
    const entry = reg.slots.find((s) => s.id === slotId);
    if (entry) {
      entry.lastPlayedAt = Date.now();
      saveSlotRegistry(reg, storage);
    }
  } catch { /* cosmetic only */ }
  return migrated;
}

export function loadSave(storage = globalThis.localStorage) {
  return loadSlot(activeSlotId(storage), storage);
}

// R54 — a save that cannot leave the browser is one cleared-site-data away
// from gone. `SAVE_VERSION` and the migration table protect a save from
// THIS CODE changing under it; nothing protected it from the browser it
// lives in, from a new phone, or from installing the TWA. A completionist
// save is ~38 KB, so size was never the obstacle — nobody had built the
// door.
//
// All three functions are DOM-free on purpose: the harness can round-trip a
// save and exercise every refusal without a browser, which is the only way
// the refusals get tested at all.

export function saveGame(state, storage = globalThis.localStorage) {
  state.saveVersion = SAVE_VERSION;
  try {
    storage.setItem(slotKey(state.slotId ?? activeSlotId(storage)), JSON.stringify(state));
    return true;
  } catch (err) {
    console.error('Save write failed:', err);
    return false;
  }
}
