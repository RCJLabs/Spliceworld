// Save system. SAVE_VERSION gates all saves (the Ascent rule, sacred):
// never change the save schema without bumping SAVE_VERSION and adding a
// migration function below. Never reset player saves.

import { newWorldSeed } from '../util/rng.js';
import { TUNING } from '../ranch/ranch.js';

export const SAVE_VERSION = 38;
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
  // v18 (Temperament): the field has existed since M3 carrying null and a
  // comment promising it would be seeded later. Left null here on purpose —
  // migrations cannot reach content data, so every already-settled chimera
  // acquires its temperament on the next tick instead (see
  // temperament.ensureTemperaments), the same way the starter herd does.
  18: (save) => {
    for (const chimera of save.chimeras) chimera.temperament = chimera.temperament ?? null;
    return save;
  },
  // v19 (Injury scarring): §3.5's "untreated injuries can scar into
  // permanent trait tradeoffs". Nobody is retroactively scarred for
  // injuries they took before the Infirmary sold treatment — everyone
  // starts clean, and `injuryCount` seeds the roll from here on.
  19: (save) => {
    for (const chimera of save.chimeras) {
      chimera.scars = chimera.scars ?? [];
      chimera.injuryCount = chimera.injuryCount ?? 0;
      chimera.injuriesTreated = chimera.injuriesTreated ?? 0;
    }
    return save;
  },
  // v20: Knockback can no longer rotate the same side two turns running —
  // it was an unbounded lock, not a tempo move. An in-progress battle gains
  // the turn-stamp that enforces it; a save mid-fight resumes with nobody
  // recently punted, which is the safe reading.
  20: (save) => {
    if (save.battle) save.battle.knockedAt = save.battle.knockedAt ?? {};
    return save;
  },
  // v21 (R20): every keyword is live, and four of them carry battle status —
  // bleed, thorns, regen and taunt. A fight saved mid-swing predates them, so
  // the combatants get the neutral values rather than `undefined` leaking
  // into arithmetic the next time endOfTurn runs.
  21: (save) => {
    const fresh = (c) => {
      if (!c?.status) return;
      c.status.bleed = c.status.bleed ?? 0;
      c.status.thorns = c.status.thorns ?? 0;
      c.status.regen = c.status.regen ?? null;
      c.status.taunted = c.status.taunted ?? 0;
    };
    if (save.battle) {
      for (const c of save.battle.player?.team ?? []) fresh(c);
      fresh(save.battle.enemy?.active);
    }
    return save;
  },
  // v22 (R22): the opposition plays to a skill dial fixed when the fight
  // starts. A battle saved before this predates the dial; it resumes at the
  // midpoint rather than inheriting whatever today's tier table says, so a
  // reload cannot change the opponent you committed a team against.
  22: (save) => {
    if (save.battle) save.battle.aiSkill = save.battle.aiSkill ?? 0.5;
    return save;
  },
  // v23 (R21): lineage keeps two generations. Animals bred before this have
  // parents but no grandparents; they get explicit nulls rather than missing
  // keys, so the family tree renders one shape whatever era bred the animal.
  23: (save) => {
    const fill = (side) => {
      if (!side) return;
      side.sire = side.sire ?? null;
      side.dam = side.dam ?? null;
    };
    for (const animal of save.ranch?.stock ?? []) {
      fill(animal.parents?.sire);
      fill(animal.parents?.dam);
    }
    for (const egg of save.ranch?.eggs ?? []) {
      fill(egg.parents?.sire);
      fill(egg.parents?.dam);
    }
    return save;
  },

  // v24 (R26): the map went from one county to five, and the fauna that
  // used to pile up on Greenfield's last two nodes was spread across the
  // new regions to give each conquest something to unlock. Redistribution
  // is the one kind of content edit that CAN take something away from an
  // existing save: a player holding the Guard Post owned nine species that
  // now live three regions further out.
  //
  // So it doesn't. `faunaGranted` is a permanent, additive grant computed
  // from the table as it stood in v23 against the nodes this save actually
  // holds — the catalog can only ever grow. Any future reshuffle of
  // unlocksFauna is safe for the same reason.
  24: (save) => {
    const V23_UNLOCKS = {
      barn_perimeter: ['porcupine', 'skunk'],
      downtown: ['wolf', 'chameleon', 'mantis'],
      checkpoint: ['eagle', 'cobra', 'frog', 'bat'],
      precinct: ['bear', 'tiger', 'gorilla', 'rhino_beetle', 'dragonfly'],
      guard_post: [
        'rhino', 'pangolin', 'crocodile', 'shark', 'octopus',
        'electric_eel', 'anglerfish', 'tortoise', 'scorpion',
      ],
    };
    save.campaign ??= {};
    const granted = new Set(save.campaign.faunaGranted ?? []);
    for (const nodeId of save.campaign.heldNodes ?? []) {
      for (const id of V23_UNLOCKS[nodeId] ?? []) granted.add(id);
    }
    save.campaign.faunaGranted = [...granted];
    save.campaign.contested ??= [];
    save.campaign.defences ??= {};
    return save;
  },

  // v25 (R29): two small pieces of remembered UI. `guidesSeen` is the only
  // thing the field-guide system persists at all — every other question it
  // asks ("has this player bred anything? is a bay occupied? is a contest
  // running?") is derived from the save it is already reading, which is why
  // there are no tutorial flags here to go stale. This one exists solely so
  // a player can wave a note away without having to actually use the system
  // it describes.
  //
  // `ui.collapsed` remembers which cards someone folded shut. Both default
  // empty, so a save that predates them behaves exactly as it did.
  25: (save) => {
    save.guidesSeen ??= [];
    save.ui ??= { collapsed: {} };
    save.ui.collapsed ??= {};
    // R25 added four facility tracks. facilityLevel() already reads a
    // missing track as level 1, so nothing was broken — but a save whose
    // `facility` object names only two of six tracks is a save that reads
    // as half-configured to anything inspecting it directly.
    save.facility ??= {};
    for (const id of ['theater', 'containment', 'incubator', 'extractor', 'scanner', 'infirmary']) {
      save.facility[id] ??= 1;
    }
    return save;
  },

  // v26 (R27): each rival keeps its own scouting file. A rival used to
  // counter you by asking the AI director what class you favoured, which is
  // the wrong source — the director reads your whole stable continuously
  // from usage banked since M0, and a rival is one person in one building
  // who has only ever seen what walked through their door.
  //
  // Seeded EMPTY on purpose, even for a rival you have already beaten five
  // times. Back-filling from the director would be inventing observations
  // they never made, and the first thing the player would notice is a rival
  // countering a stable it has never met.
  26: (save) => {
    for (const record of Object.values(save.campaign?.rivals ?? {})) {
      record.scouted ??= { fights: 0, classes: {}, moveTags: {}, parts: {} };
    }
    return save;
  },
  // v27 (A4): the Jobs board runs as wide as the stable does, so the one
  // slot becomes a list. A job that was in flight when the save was written
  // stays in flight — it keeps its clock, its sealed outcome and its crew.
  27: (save) => {
    save.campaign ??= {};
    save.campaign.operations = save.campaign.operation ? [save.campaign.operation] : [];
    delete save.campaign.operation;
    return save;
  },

  // v28 (R30): four move slots. Anatomy still says what a chimera KNOWS;
  // `moveset` says which four it can press. Existing chimeras are given the
  // default pick rather than an empty list — nobody loads a save to find
  // their creature has forgotten how to fight — and because the pick needs
  // content this migration only stamps the field as absent-but-known. The
  // engine tops any short or stale moveset up from the default, so a save
  // that arrives here with no moveset behaves exactly as it did before.
  28: (save) => {
    for (const chimera of save.chimeras ?? []) {
      if (!Array.isArray(chimera.moveset)) chimera.moveset = [];
      chimera.lastMoveTrainAt ??= 0;
    }
    return save;
  },

  // v29 (R31): the Resequencer. Vials existed from M2 and were read by
  // nothing; spending one now grows the donor back. Old vials kept only a
  // star average, so they are left as they are — resequencer.js rebuilds
  // stats to match, which means a vial banked two years ago is worth
  // exactly what it always said it was worth. Nothing is taken from anyone.
  29: (save) => {
    save.resequencer ??= null;
    save.resequenceCount ??= 0;
    return save;
  },

  // v30 (R40): the campaign had an end and never said so. `dominionAt` is
  // the timestamp the county was first wholly held, and the only reason it
  // is stored is to fire the moment ONCE rather than on every render.
  //
  // Deliberately null on migrate rather than backfilled, including for a
  // save that already holds all 21 nodes: that player earned the moment and
  // never got it, so they get it on their next load. Nothing is taken from
  // anyone — the field is additive and every other value is untouched.
  30: (save) => {
    save.dominionAt ??= null;
    return save;
  },

  // v31 (R41): veterancy and the Sparring Ring. Every existing chimera
  // starts at 0 xp — there is no honest way to reconstruct what a creature
  // has been through from a win/loss total that never said who fought — and
  // that is not a demotion: level 0 is exactly the power every chimera had
  // yesterday, and the ring is open. Nothing is taken from anyone.
  31: (save) => {
    for (const c of save.chimeras ?? []) c.xp ??= 0;
    for (const captive of save.campaign?.captives ?? []) {
      if (captive.chimera) captive.chimera.xp ??= 0;
    }
    save.sparCount ??= 0;
    save.lastSparAt ??= 0;
    return save;
  },

  // v32 (R42): The Gauntlet. One additive list — which exhibitions have
  // fallen. A save that already holds the county finds the first stage
  // open on load, exactly as a new winner would.
  32: (save) => {
    save.gauntletBeaten ??= [];
    return save;
  },

  // v33 (R43): the Sparring Ring became a charge bucket — three held, one
  // back every ten minutes — so the single `lastSparAt` cooldown stamp
  // becomes `sparRefillAt`, the moment the bucket next stands full.
  //
  // Everyone arrives with a FULL ring rather than having their old
  // cooldown converted. Converting would be arithmetic nobody asked for
  // and would leave some players mid-wait on a mechanic that no longer
  // exists; the ring is the ladder out of a wall, and handing it over
  // full is the generous reading. Nothing is taken from anyone.
  33: (save) => {
    save.sparRefillAt ??= 0;
    delete save.lastSparAt;
    return save;
  },

  // v34 (R51): the field guide learns outcomes. One additive list, empty on
  // arrival — and empty is the honest value. Nothing in any previous save
  // recorded WHICH units a player beat (`warRecord` is a global tally), so
  // backfilling it would mean inventing a history, and leaving a veteran
  // player's shelf blank is a truth rather than a loss: the guide still
  // holds every sighting it ever did, and the next fight starts filling
  // the new column.
  //
  // The Gauntlet is the one exception and it needs no migration at all.
  // `gauntletBeaten` has recorded those four exhibitions since v32, so
  // `beatenUnits()` reads it alongside this list and a save that cleared
  // the Gauntlet years ago keeps its trophies. Recovering what the save can
  // actually prove, and inventing nothing it cannot, is the whole rule.
  34: (save) => {
    save.dex ??= {};
    save.dex.beaten ??= [];
    return save;
  },
  // R64: one elapsed clock. `campaign.lastTickAt` was a second timestamp for
  // income, kept beside `lastTickAt` for upkeep since v2, and the two
  // disagreeing over a long absence is how a closed app came back richer
  // than an open one. The ranch clock is the one that survives; if it was
  // never set, the campaign's stands in, so nobody is charged or paid twice
  // for the gap they were away.
  35: (save) => {
    save.campaign ??= {};
    if (save.lastTickAt == null && save.campaign.lastTickAt != null) save.lastTickAt = save.campaign.lastTickAt;
    delete save.campaign.lastTickAt;
    return save;
  },
  // v36 (R69): the map's fauna was lopsided — Greenfield held 16 unlocks,
  // Foundry 2, Spire 0 — so taking the final region put nothing new in the
  // catalog. Four species moved out of Greenfield's later nodes (one per
  // class, so Spire's "all three classes" demand has an unlock to match)
  // into Foundry and Spire. This is the exact redistribution v24 already
  // built the mechanism for: `faunaGranted` is a permanent, additive grant,
  // computed from the table as it stood in v35 against the nodes this save
  // actually holds, so nobody who already had dragonfly, gorilla, cobra or
  // otter loses it for being unlocked somewhere else now.
  // R75 — `resequencer.penFullSaid` marks that a waiting run has already
  // announced its full pen, so the line is said once instead of on every
  // tick. Old saves carry a run with no flag; leaving it unset is correct
  // (they get the line once more, then never again), and the migration is
  // here so the field is DECLARED rather than appearing by accident — the
  // schema is never allowed to drift without a version behind it.
  // R82 — the Breakout. Three new campaign fields hold the standing board
  // of loose specimens, the clock that puts the next one on it, and the
  // counter that seeds both. Every one of them is additive and empty: a save
  // that has never seen a breakout is a save with nothing loose, which is
  // exactly what a player mid-campaign should find. `nextBreakAt` stays null
  // rather than being dated here, because `tickBreakouts` sets the first
  // delay itself the moment the save becomes eligible — dating it in a
  // migration would start the clock for a player who has not yet beaten a
  // rival, and the gate for this whole system is that you rattled somebody.
  38: (save) => {
    save.campaign ??= {};
    save.campaign.loose ??= [];
    save.campaign.nextBreakAt ??= null;
    save.campaign.breakoutCount ??= 0;
    return save;
  },
  37: (save) => {
    if (save.resequencer) save.resequencer.penFullSaid ??= false;
    return save;
  },
  36: (save) => {
    const V35_UNLOCKS = {
      checkpoint: ['eagle', 'bat', 'dragonfly'],
      precinct: ['bear', 'tiger', 'gorilla', 'cobra'],
      guard_post: ['frog', 'crocodile', 'otter'],
    };
    save.campaign ??= {};
    const granted = new Set(save.campaign.faunaGranted ?? []);
    for (const nodeId of save.campaign.heldNodes ?? []) {
      for (const id of V35_UNLOCKS[nodeId] ?? []) granted.add(id);
    }
    save.campaign.faunaGranted = [...granted];
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
    resequencer: null,
    resequenceCount: 0,
    chimeras: [],
    chimeraCount: 0,
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
      loose: [], nextBreakAt: null, breakoutCount: 0,
      operations: [], opCooldowns: {}, opCount: 0, opReport: null, heat: 0, heatAt: null,
    },
    news: [],
    settings: { muted: false },
    // R51: `beaten` is the field guide's second dimension — `enemies` is a
    // sighting log and always was, so a unit that flattened you read
    // exactly like one you flattened.
    dex: { parts: [], enemies: [], beaten: [], traits: [], variants: [] },
    facility: { theater: 1, containment: 1, incubator: 1, extractor: 1, scanner: 1, infirmary: 1 },
    // Field-guide notes the player has waved away (R29). The guides
    // themselves are derived; this is the only thing they persist.
    guidesSeen: [],
    // Remembered UI: which cards are folded shut.
    ui: { collapsed: {} },
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

function slotKey(id) {
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
    return { saveVersion: save.saveVersion, lab: save.profile?.lab ?? null, ...runSummary(save, now) };
  } catch {
    return { empty: true, corrupt: true };
  }
}

export function loadSlot(slotId, storage = globalThis.localStorage) {
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
    migrated = migrate(save);
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
export function importSave(text) {
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
    return { ok: true, save: migrate(structuredClone(save)), from: save.saveVersion };
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
