// Save system. SAVE_VERSION gates all saves (the Ascent rule, sacred):
// never change the save schema without bumping SAVE_VERSION and adding a
// migration function below. Never reset player saves.

import { newWorldSeed } from '../util/rng.js';
import { TUNING } from '../ranch/ranch.js';

export const SAVE_VERSION = 17;
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
  // v4 (M3): chimeras + Splice-Dex combo discoveries. The old dev-slab
  // screen became the Theater; the legacy free-form `genome` field is
  // retained untouched (never destroy player data), just no longer shown.
  4: (save) => {
    save.chimeras = [];
    save.chimeraCount = 0;
    save.discoveredCombos = [];
    if (save.activeScreen === 'slab') save.activeScreen = 'theater';
    return save;
  },
  // v5 (M4): battles. Serialized in-progress battle (survives reload),
  // win/loss record, and Infirmary injuries on chimeras (Law 1).
  5: (save) => {
    save.battle = null;
    save.warRecord = { wins: 0, losses: 0 };
    for (const chimera of save.chimeras) chimera.injury = chimera.injury ?? null;
    return save;
  },
  // v6 (M5): campaign shell — regions, notoriety, captives, containment,
  // news. In-progress v5 battles gain the new cannon/capture fields.
  6: (save) => {
    save.campaign = { heldNodes: [], notoriety: 0, captives: [], containment: [], lastTickAt: null };
    save.news = [];
    save.directorStats.dissections = [];
    if (save.battle) {
      save.battle.context = save.battle.context ?? {};
      save.battle.cannon = save.battle.cannon ?? { charge: 0 };
      save.battle.captured = save.battle.captured ?? [];
      if (save.battle.enemy?.active) save.battle.enemy.active.capturable = save.battle.enemy.active.capturable ?? false;
    }
    return save;
  },
  // v7 (M6): breeding — incubator eggs, trait genotypes, lineage.
  7: (save) => {
    save.ranch.eggs = [];
    save.ranch.eggCount = 0;
    for (const animal of save.ranch.stock) {
      animal.genotype = animal.genotype ?? {};
      animal.parents = animal.parents ?? null;
    }
    return save;
  },
  // v8 (M7): Splice-Dex tracking, settings, chimera training. The dex
  // backfills from what the save already owns — no discovery is lost.
  8: (save) => {
    save.settings = { muted: false };
    save.dex = { parts: [], enemies: [], traits: [] };
    const seenParts = new Set([
      ...save.inventory.parts.map((t) => t.partId),
      ...save.chimeras.flatMap((c) => Object.values(c.tokens).map((t) => t.partId)),
    ]);
    save.dex.parts = [...seenParts];
    for (const chimera of save.chimeras) chimera.lastTrainedAt = chimera.lastTrainedAt ?? 0;
    return save;
  },
  // v9 (Rivals): rival geneticists keep a per-rival record so their labs
  // can iterate on you. Containment bays gain an optional inline `unit`
  // for captured rival chimeras, whose stats are generated rather than
  // listed in enemies.json — existing bays keep resolving by unitId.
  9: (save) => {
    save.campaign.rivals = {};
    for (const entry of save.campaign.containment) entry.unit = entry.unit ?? null;
    if (save.battle) {
      save.battle.units = save.battle.units ?? {};
      save.battle.barks = save.battle.barks ?? {};
    }
    return save;
  },
  // v10 (AI Director): the world now acts on the tracking data it has been
  // collecting since M0. `announced` keeps a counter-rule from making the
  // news wire twice; the rest of directorStats is unchanged and its history
  // is exactly what the director reads.
  10: (save) => {
    save.directorStats.announced = [];
    save.directorStats.partUse ??= {};
    save.directorStats.tagUse ??= {};
    save.directorStats.dissections ??= [];
    return save;
  },
  // v11 (Theater Tier II): facility upgrade levels. The L-class Rumbler
  // chassis used to be free to everyone, so anyone who has already built on
  // one is GRANDFATHERED to Tier II rather than having a frame taken away —
  // never reset player progress, and never quietly delete it either.
  11: (save) => {
    const builtLarge = save.chimeras.some((c) => c.frame === 'L');
    save.facility = { theater: builtLarge ? 2 : 1 };
    return save;
  },
  // v12 (Variants): the Splice-Dex records variant species you have bred.
  // Migrations run before content loads, so they only shape state — the
  // backfill from stock the player already owns happens on boot (see
  // ranch.ensureDexVariants), the same way the starter herd does.
  12: (save) => {
    save.dex.variants = [];
    return save;
  },
  // v13 (Rehabilitation): the Containment facility track, and bays that can
  // hold a behavioural programme instead of a bandsaw. Existing bays gain a
  // stable id — the War Room addresses them by id now that one bay can sit
  // in the Reorientation Wing while the list around it changes — and an
  // empty `rehab`. Nothing already impounded is disturbed.
  13: (save) => {
    save.facility.containment = 1;
    save.campaign.containment.forEach((entry, i) => {
      entry.id ??= `bay-${i}-${entry.capturedAt ?? 0}`;
      entry.rehab = entry.rehab ?? null;
    });
    return save;
  },
  // v14 (Region contestation): the coalition can come back for a node you
  // already hold. `contested` holds the live counter-offensives, and
  // `nextContestAt` is a scheduled timestamp rather than a per-tick roll —
  // null means "not eligible yet", and the first tick that finds the save
  // eligible sets it. `defences` is the per-node record that makes them
  // slower to try the same place twice. Nothing already held is touched:
  // an existing empire simply becomes contestable when its threat
  // generation says so.
  14: (save) => {
    save.campaign.contested = [];
    save.campaign.nextContestAt = null;
    save.campaign.defences = {};
    save.campaign.contestCount = 0;
    return save;
  },
  // v15 (Monologue pass): the player gets the same profile schema the
  // rivals have had since §3.8 was written. `philosophy` is left NULL
  // rather than stamped with today's default, so changing the default
  // stays a one-line change instead of something every existing lab is
  // pinned against (the same rule the colour scheme follows). Captives
  // remember who took them so the right villain can gloat about it, and
  // containment bays remember whose lab a specimen came from so the
  // right villain can complain when you win it over.
  15: (save) => {
    save.profile = { named: false, title: null, name: null, lab: null, philosophy: null };
    for (const captive of save.campaign.captives) captive.captor = captive.captor ?? null;
    for (const entry of save.campaign.containment) entry.rivalId = entry.rivalId ?? null;
    if (save.battle) {
      save.battle.playerBarks = save.battle.playerBarks ?? {};
      save.battle.speakers = save.battle.speakers ?? {};
    }
    return save;
  },
  // v16 (Jobs board): non-combat operations. `operation` is the one job in
  // flight (its outcome sealed at launch so a reload cannot reroll it),
  // `opCooldowns` keeps a job quiet after it runs, and `opReport` holds the
  // result until the player has actually seen it — a job that finishes
  // while they are away must still be reportable when they come back.
  16: (save) => {
    save.campaign.operation = null;
    save.campaign.opCooldowns = {};
    save.campaign.opCount = 0;
    save.campaign.opReport = null;
    save.campaign.heat = 0;
    save.campaign.heatAt = null;
    return save;
  },
  // v17 (Chaos-breeding): the vat. `vat` is the one gestation in flight —
  // its conception sealed at the moment the parents went in, so a reload
  // cannot reroll it — and every chimera gains an `exhaustedUntil`, since
  // giving a grade away is meant to cost a recovery as well.
  17: (save) => {
    save.vat = null;
    save.vatCount = 0;
    for (const chimera of save.chimeras) chimera.exhaustedUntil = chimera.exhaustedUntil ?? 0;
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
    directorStats: { partUse: {}, tagUse: {}, dissections: [], announced: [] },
    funds: TUNING.startingFunds,
    ranch: { stock: [], penCapacity: TUNING.penStartCapacity, animalCount: 0, seeded: false, eggs: [], eggCount: 0 },
    lastTickAt: null,
    activeScreen: 'ranch',
    inventory: { vials: [], parts: [], tokenCount: 0 },
    chimeras: [],
    chimeraCount: 0,
    discoveredCombos: [],
    battle: null,
    warRecord: { wins: 0, losses: 0 },
    campaign: {
      heldNodes: [], notoriety: 0, captives: [], containment: [], rivals: {},
      contested: [], nextContestAt: null, defences: {}, contestCount: 0,
      operation: null, opCooldowns: {}, opCount: 0, opReport: null, heat: 0, heatAt: null,
      lastTickAt: null,
    },
    news: [],
    settings: { muted: false },
    dex: { parts: [], enemies: [], traits: [], variants: [] },
    facility: { theater: 1, containment: 1 },
    // The §3.8 profile: the player's half of the story schema. Unnamed
    // until they choose — nothing in this game waits behind a form.
    profile: { named: false, title: null, name: null, lab: null, philosophy: null },
    // Chaos-breeding: one gestation at a time.
    vat: null,
    vatCount: 0,
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
