// Save system. SAVE_VERSION gates all saves (the Ascent rule, sacred):
// never change the save schema without bumping SAVE_VERSION and adding a
// migration function below. Never reset player saves.

import { newWorldSeed } from '../util/rng.js';

export const SAVE_VERSION = 1;
const STORAGE_KEY = 'spliceworld_save';

// migrations[n] upgrades a save from version n-1 to version n.
// Example for the future:
//   2: (save) => { save.ranch = { stock: [] }; return save; },
const migrations = {};

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
  };
}

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
