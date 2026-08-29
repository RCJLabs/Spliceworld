// Save system. SAVE_VERSION gates all saves (the Ascent rule, sacred):
// never change the save schema without bumping SAVE_VERSION and adding a
// migration function below. Never reset player saves.

import { newWorldSeed } from '../util/rng.js';
import { TUNING } from '../ranch/ranch.js';

export const SAVE_VERSION = 3;
const STORAGE_KEY = 'spliceworld_save';

// migrations[n] upgrades a save from version n-1 to version n.
// Migrations run before content data is loaded, so they only shape state;
// anything needing content/RNG (e.g. starter herd) happens on boot via
// seeded flags (see ranch.ensureRanchSeeded).
const migrations = {
  // v2 (M1): ranch, stock, and the upkeep economy.
  2: (save) => {
    save.funds = 300;
    save.ranch = { stock: [], penCapacity: 4, animalCount: 0, seeded: false };
    save.lastTickAt = null;
    save.activeScreen = 'ranch';
    return save;
  },
  // v3 (M2): the Extractor's output — DNA vials and part tokens with lineage.
  3: (save) => {
    save.inventory = { vials: [], parts: [], tokenCount: 0 };
    return save;
  },
};

export function newGameState() {
  return {
    saveVersion: SAVE_VERSION,
    seed: newWorldSeed(),
    createdAt: Date.now(),
    spliceCount: 0,
    // The current creature on the Surgery Theater slab.
    genome: null,
    // Stub for the AI director (ROADMAP §8.5): record tag/part usage from
    // day one so data exists when the director lands post-v0.1.
    directorStats: { partUse: {}, tagUse: {} },
    funds: TUNING.startingFunds,
    ranch: { stock: [], penCapacity: TUNING.penStartCapacity, animalCount: 0, seeded: false },
    lastTickAt: null,
    activeScreen: 'ranch',
    inventory: { vials: [], parts: [], tokenCount: 0 },
  };
}
// (The v2 migration above keeps hardcoded values on purpose: migrations
// reproduce the historical schema even if TUNING drifts later.)

export function migrate(save) {
  if (typeof save.saveVersion !== 'number') {
    throw new Error('Save has no version — refusing to guess.');
  }
  while (save.saveVersion < SAVE_VERSION) {
    const next = save.saveVersion + 1;
    const fn = migrations[next];
    if (!fn) throw new Error(`No migration to save version ${next}.`);
    save = fn(save);
    save.saveVersion = next;
  }
  return save;
}

export function loadSave(storage = globalThis.localStorage) {
  let raw;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return newGameState(); // storage unavailable (private mode etc.)
  }
  if (!raw) return newGameState();
  try {
    const save = JSON.parse(raw);
    if (save.saveVersion > SAVE_VERSION) {
      // Save from a newer build than this code — don't touch it.
      throw new Error(`Save is v${save.saveVersion}, code is v${SAVE_VERSION}.`);
    }
    return migrate(save);
  } catch (err) {
    // A corrupt save is preserved for forensics, never silently destroyed.
    console.error('Save load failed:', err);
    try {
      storage.setItem(STORAGE_KEY + '_backup_' + Date.now(), raw);
    } catch { /* storage full — nothing more we can do */ }
    return newGameState();
  }
}

export function saveGame(state, storage = globalThis.localStorage) {
  state.saveVersion = SAVE_VERSION;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.error('Save write failed:', err);
    return false;
  }
}
