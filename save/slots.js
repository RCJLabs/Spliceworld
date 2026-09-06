// R101 — EVERYTHING BEHIND THE ONE DOOR, which is not the first paint.
//
// The slot picker, the export file and the new-run ceremony. All of it is
// reached from `save/settings-ui.js` and nowhere else — R81 already made
// that panel lazy, and this code was riding into the first paint purely
// because it shared a file with `loadSave`.
//
// The split is by WHO NEEDS IT WHEN, not by subject: `loadSlot`, the slot
// registry and `saveGame` stay in `save/save.js` because booting the game
// needs them on the first frame; creating, renaming, deleting, exporting,
// importing and retiring a lab are all things a player does through a
// panel they opened on purpose, and can wait for the module to arrive.
import {
  SAVE_VERSION, STORAGE_KEY, MAX_SLOTS, slotKey,
  newGameState, migrate, loadSlot, loadSlotRegistry, saveSlotRegistry, activeSlotId,
} from './save.js';

// A lightweight, on-demand summary of a slot's own stored save. Read
// straight from storage rather than cached in the registry, so it can never
// go stale the way a cached copy would the moment the slot is played again
// without the picker open to update it.
export function slotSummary(slotId, storage = globalThis.localStorage, now = Date.now()) {
  let raw;
  try {
    raw = storage.getItem(slotKey(slotId));
  } catch {
    raw = null;
  }
  if (!raw) return { empty: true };
  try {
    const save = JSON.parse(raw);
    // `empty` comes from runSummary, not a hardcoded `false`: a save that
    // exists but has never actually been played (0 chimeras, 0 stock, no
    // nodes) should read as empty to the picker the same way it already
    // does everywhere else "empty" is asked about. `now` is threaded through
    // rather than left to runSummary's own Date.now() default so a dev
    // ?warp= session sees every slot's day-count agree, not just the active
    // one.
    // R119's founding lab travels with the summary too. `lab` is the
    // PROFILE's rolled laboratory name, which is what the picker titles a
    // slot with; `foundedIn` is which of the five starter labs it was
    // founded in, and they are different questions — two slots can both be
    // "The Institute for Applied Regret" and have started from a bear and a
    // tortoise. Comparing those openings is the whole reason to keep two
    // slots at once, and the picker could not tell you which was which.
    return {
      saveVersion: save.saveVersion,
      lab: save.profile?.lab ?? null,
      foundedIn: save.starterLab ?? null,
      ...runSummary(save, now),
    };
  } catch {
    return { empty: true, corrupt: true };
  }
}

// Up to MAX_SLOTS labs. `carryForward` is the same device-preference list
// R55 built for a reset — sound and the field notes already read should not
// reset themselves just because the player opened a second lab.
export function createSlot(currentState, storage = globalThis.localStorage) {
  const reg = loadSlotRegistry(storage);
  if (reg.slots.length >= MAX_SLOTS) {
    return { ok: false, reason: 'max-slots', msg: `You can run ${MAX_SLOTS} labs at once. Delete one to make room for another.` };
  }
  const used = new Set(reg.slots.map((s) => s.id));
  let id = 1;
  while (used.has(id)) id++;
  const fresh = carryForward(newGameState(), currentState);
  fresh.slotId = id;
  try {
    storage.setItem(slotKey(id), JSON.stringify(fresh));
  } catch (err) {
    return { ok: false, reason: 'write-failed', msg: `The new lab could not be written: ${err.message}` };
  }
  reg.slots.push({ id, name: null, createdAt: Date.now(), lastPlayedAt: Date.now() });
  reg.activeId = id;
  if (!saveSlotRegistry(reg, storage)) {
    return { ok: false, reason: 'write-failed', msg: 'The new lab was written, but its listing could not be saved.' };
  }
  return { ok: true, slotId: id };
}

export function switchSlot(slotId, storage = globalThis.localStorage) {
  const reg = loadSlotRegistry(storage);
  if (!reg.slots.some((s) => s.id === slotId)) {
    return { ok: false, reason: 'no-such-slot', msg: 'That lab no longer exists.' };
  }
  reg.activeId = slotId;
  if (!saveSlotRegistry(reg, storage)) {
    return { ok: false, reason: 'write-failed', msg: 'Could not switch labs — storage refused the write.' };
  }
  return { ok: true };
}

// Never the active slot (there is no "which game am I looking at" answer if
// it goes), and never the last one standing.
export function deleteSlot(slotId, storage = globalThis.localStorage) {
  const reg = loadSlotRegistry(storage);
  if (!reg.slots.some((s) => s.id === slotId)) {
    return { ok: false, reason: 'no-such-slot', msg: 'That lab is already gone.' };
  }
  if (reg.slots.length <= 1) {
    return { ok: false, reason: 'last-slot', msg: 'At least one lab has to exist.' };
  }
  if (reg.activeId === slotId) {
    return { ok: false, reason: 'active-slot', msg: 'You cannot delete the lab you are currently in. Switch to another one first.' };
  }
  reg.slots = reg.slots.filter((s) => s.id !== slotId);
  if (!saveSlotRegistry(reg, storage)) {
    return { ok: false, reason: 'write-failed', msg: 'Could not update the lab listing.' };
  }
  try {
    storage.removeItem(slotKey(slotId));
  } catch { /* best effort — the listing no longer names it either way */ }
  return { ok: true };
}

export function renameSlot(slotId, name, storage = globalThis.localStorage) {
  const reg = loadSlotRegistry(storage);
  const entry = reg.slots.find((s) => s.id === slotId);
  if (!entry) return { ok: false, reason: 'no-such-slot', msg: 'That lab no longer exists.' };
  entry.name = name.trim().slice(0, 40) || null;
  if (!saveSlotRegistry(reg, storage)) return { ok: false, reason: 'write-failed', msg: 'Could not save the new name.' };
  return { ok: true };
}

const APP_ID = 'spliceworld';

export const EXPORT_FORMAT = 1;

export function exportSave(state) {
  return JSON.stringify({
    app: APP_ID,
    format: EXPORT_FORMAT,
    exportedAt: Date.now(),
    // Restated outside the save so a human reading the file, or a future
    // importer refusing it, does not have to parse the whole thing first.
    saveVersion: state.saveVersion,
    save: state,
  }, null, 2);
}

// Named for a human looking at a downloads folder six months from now.
export function exportFilename(state, now = Date.now()) {
  const lab = String(state.profile?.lab ?? '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `spliceworld-${lab || 'lab'}-v${state.saveVersion}-${new Date(now).toISOString().slice(0, 10)}.json`;
}

// Every refusal names the rule it broke, because "invalid file" tells a
// player nothing about whether their game is recoverable.
export async function importSave(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not-json', msg: 'That file is not JSON. The centrifuge declines to spin it.' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'not-json', msg: 'That file is JSON, but not an object. Nothing to restore from it.' };
  }
  // The wrapper this build writes, or a bare save — someone's raw
  // localStorage dump is plainly readable and refusing it would be
  // pedantry rather than safety.
  const wrapped = typeof parsed.app === 'string' || parsed.save !== undefined;
  if (wrapped && parsed.app !== APP_ID) {
    return { ok: false, reason: 'not-spliceworld', msg: `That is a save from "${parsed.app}", not Spliceworld.` };
  }
  const save = wrapped ? parsed.save : parsed;
  if (!save || typeof save !== 'object' || Array.isArray(save)) {
    return { ok: false, reason: 'not-spliceworld', msg: 'The file carries no save.' };
  }
  if (typeof save.saveVersion !== 'number') {
    return { ok: false, reason: 'no-version', msg: 'That save has no version — refusing to guess what it is.' };
  }
  // `seed` has been on every save since v1, so this rules out a JSON file
  // that merely happens to carry a number called saveVersion without
  // rejecting a genuinely ancient one.
  if (typeof save.seed !== 'number') {
    return { ok: false, reason: 'not-spliceworld', msg: 'That save has no world seed. Every Spliceworld save has had one since the first build.' };
  }
  if (save.saveVersion > SAVE_VERSION) {
    return {
      ok: false, reason: 'from-the-future',
      msg: `That save is v${save.saveVersion} and this build reads v${SAVE_VERSION}. Update the game rather than downgrading the save.`,
    };
  }
  try {
    return { ok: true, save: await migrate(structuredClone(save)), from: save.saveVersion };
  } catch (err) {
    return { ok: false, reason: 'migration-failed', msg: `That save could not be brought forward: ${err.message}` };
  }
}

// Adopting an imported save is the only operation in the game that replaces
// a running one, so the running one is set aside FIRST — the same forensics
// rule loadSave applies to a corrupt save, applied to a deliberate act.
//
// And if the backup cannot be written, the import is REFUSED rather than
// completed. An import that destroys the game it replaced is the one
// outcome this feature exists to prevent, so a full disk loses the import,
// never the save.
// R55 — a reset was reachable only by clearing site data, which is
// indistinguishable from losing your game by accident. The sacred rule is
// that a save is never DESTROYED by migration; it was never that a player
// may only ever have one run.
//
// Building it forced a category the save has always had and never named:
// three fields are not part of the run at all. `settings` is a device
// preference — wiping it un-mutes somebody's phone because they started a
// new game. `guidesSeen` is 22 field notes already dismissed, and R37 put
// every lesson behind the wall it explains, so a fresh save re-fires all of
// them as the player re-reaches each system. `ui.collapsed` is which cards
// they like shut.
//
// The list governs BOTH a reset and an import, because two answers to "what
// is a run" is how the two paths drift apart.
export const CARRIED_ACROSS_RUNS = ['settings', 'guidesSeen', 'ui'];

function carryForward(fresh, previous) {
  for (const key of CARRIED_ACROSS_RUNS) {
    if (previous?.[key] !== undefined) fresh[key] = structuredClone(previous[key]);
  }
  return fresh;
}

export function startNewRun(state) {
  return carryForward(newGameState(), state);
}

// What the confirmation has to say out loud. DOM-free so the numbers a
// player is asked to give up are asserted rather than eyeballed.
export function runSummary(state, now = Date.now()) {
  const days = state?.createdAt ? Math.max(0, Math.floor((now - state.createdAt) / 86400000)) : 0;
  return {
    chimeras: state?.chimeras?.length ?? 0,
    animals: state?.ranch?.stock?.length ?? 0,
    nodes: state?.campaign?.heldNodes?.length ?? 0,
    parts: state?.inventory?.parts?.length ?? 0,
    days,
    // A brand-new save has nothing to lose, and asking a player to confirm
    // the destruction of nothing is how a confirmation stops being read.
    empty: (state?.chimeras?.length ?? 0) === 0
      && (state?.ranch?.stock?.length ?? 0) === 0
      && (state?.campaign?.heldNodes?.length ?? 0) === 0,
  };
}

// R71 — slot-aware, but the two-argument call every existing caller and
// test already makes is untouched: `slotId` defaults to whatever the
// registry says is active, which is slot 1 on a device that has never
// opened the slot picker — exactly `STORAGE_KEY` as before this phase.
export function adoptSave(save, storage = globalThis.localStorage, slotId = activeSlotId(storage)) {
  const key = slotKey(slotId);
  let current = null;
  try {
    current = storage.getItem(key);
  } catch {
    return { ok: false, reason: 'no-storage', msg: 'This browser will not let the game read its own storage.' };
  }
  if (current) {
    try {
      storage.setItem(`${key}_backup_${Date.now()}`, current);
    } catch {
      return {
        ok: false, reason: 'backup-failed',
        msg: 'There was no room to set the current game aside first, so the import was refused. Nothing was lost.',
      };
    }
  }
  // R55: device preferences do not travel with a run. Importing a muted
  // friend's save must not mute this phone, and the same list decides it
  // that decides what survives a reset.
  let landing = save;
  if (current) {
    try {
      landing = carryForward({ ...save }, JSON.parse(current));
    } catch { /* unreadable local save — the import stands on its own */ }
  }
  landing.slotId = slotId;
  try {
    storage.setItem(key, JSON.stringify(landing));
  } catch (err) {
    return { ok: false, reason: 'write-failed', msg: `The save could not be written: ${err.message}` };
  }
  return { ok: true, replaced: current !== null };
}
