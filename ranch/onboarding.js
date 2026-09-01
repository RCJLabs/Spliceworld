// Guided onboarding. Two layers, both PURE DERIVATIONS FROM SAVE STATE —
// no tutorial flags to migrate, no scripted cage, nothing that can desync
// from the game it is describing.
//
//   1. The Path to World Domination (M7): the five-step checklist that
//      carries a new player to their first conquest, then retires itself.
//   2. Field guides (R29): one first-use note per shipped system. M7's
//      onboarding ended at conquest #1 and then eight more systems shipped
//      behind it — breeding, the chaos vat, rehabilitation, the jobs board,
//      contestation, scars, temperament, the Dex — followed by five regions,
//      six facility tracks and an upkeep economy. All of it unguided.
//
// A guide carries two condition lists. `reachable` decides whether the
// system exists for this player at all; `done` decides whether they have
// used it. It shows only when reachable AND not done, which is what makes
// "none fires before its system is reachable" a property of the data rather
// than a rule someone has to remember.

import { ageStage } from './ranch.js';
import { baseSpecies } from './breeding.js';
import { regionList, regionOpen } from '../campaign/map.js';
import { nextUpgrade, tracks } from '../splice/facility.js';
import { rivalStatus } from '../campaign/rivals.js';
import { expressedTraits } from './breeding.js';
import { analyze } from '../splice/physiology.js';

export function onboardingSteps(state, content, now) {
  const caredOnce = state.ranch.stock.some((a) =>
    Object.values(a.lastCare ?? {}).some((t) => t > 0)
  );
  const extracted = state.inventory.tokenCount > 0;
  const spliced = state.chimeraCount > 0;
  const settledOne = state.chimeras.some((c) => now >= c.settleUntil);
  const conquered = state.campaign.heldNodes.length > 0;

  return [
    {
      label: 'Care for an animal',
      hint: 'Feed, groom, exercise, or enrich anything on the Ranch. Happy donors make better parts.',
      done: caredOnce,
    },
    {
      label: 'Graduate a donor',
      hint: 'Extract an animal on the Ranch — it becomes a DNA vial and parts. (Older + better-kept = higher grade.)',
      done: extracted,
    },
    {
      label: 'Splice a chimera',
      hint: 'Open the Splice tab, put vault parts on a frame (a head is mandatory), and hit SPLICE IT.',
      done: spliced,
    },
    {
      label: 'Let it settle',
      hint: 'Fresh chimeras need to settle in the Pens. Deploying early causes Rejection. Patience is a stat.',
      done: settledOne,
    },
    {
      label: 'Conquer the Old Barn Perimeter',
      hint: 'War tab → assault the first node with your settled chimera. The clipboards never stood a chance.',
      done: conquered,
    },
    // A1. The Path used to end one node before a wall it never mentioned.
    // Combat is one active per side over a queue, so three enemy bodies
    // means grinding three health bars with one of your own — measured, the
    // second node is 0% with one chimera and 84% with three, and no amount
    // of stat-tuning moves that because it is a question of BODIES. The
    // starter herd is exactly three animals, so the answer is already in
    // the pens; nothing ever said so.
    {
      label: 'Build a stable of three',
      hint: 'One chimera cannot out-last a three-unit patrol — it is one health bar against three. Graduate your other two starter animals and splice them. (Restock the pens after: a goat is $60.)',
      done: state.chimeras.length >= STABLE,
    },
  ];
}

// How many creatures the campaign is actually built around. The balance
// harness has fought at three since M4.5; this is the same number, said out
// loud to the player for the first time.
export const STABLE = 3;

// Whether the checklist still has something to say. A1 extended it past
// the first conquest, because the wall is the node AFTER that one.
export function onboardingActive(state) {
  return state.campaign.heldNodes.length === 0 || state.chimeras.length < STABLE;
}

// Whether the Path still OWNS the screen, which is a different question and
// has a different answer. R29 suppresses field notes under the checklist so
// a new player is never reading two tutorials at once — but that rule was
// written when the Path ended at the first conquest. Now that it runs on to
// the stable, keying the suppression to `onboardingActive` would hold every
// note in the game hostage to a step a player can reasonably take their
// time over. The first conquest is still the handover.
export function pathOwnsScreen(state) {
  return state.campaign.heldNodes.length === 0;
}

// --- Field guides -------------------------------------------------------

// A dotted read into the save. Arrays count by length, plain objects by
// key count, numbers by value; anything missing falls back to `default`,
// which is how a facility track reads as level 1 rather than level 0.
function valueAt(state, dotted, fallback) {
  let node = state;
  for (const key of dotted.split('.')) {
    if (node == null) return fallback;
    node = node[key];
  }
  if (node == null) return fallback;
  if (Array.isArray(node)) return node.length;
  if (typeof node === 'object') return Object.keys(node).length;
  if (typeof node === 'number') return node;
  return node ? 1 : 0;
}

const adults = (state, content, now) =>
  state.ranch.stock.filter((a) => ageStage(a, content, now) !== 'juvenile');

// The handful of conditions that need real derivation rather than a count.
// This registry is the engine's own knowledge of its systems: adding a
// guide for something detectable here is a pure data edit, and a guide for
// a genuinely new system is exactly the case that SHOULD need a line of
// code, because the engine has to learn to see it.
export const GUIDE_HELPERS = {
  breedablePair: (state, content, now) => {
    const grown = adults(state, content, now);
    return grown.some((a) =>
      grown.some((b) =>
        a.id !== b.id &&
        a.sex !== b.sex &&
        baseSpecies(a.species, content) === baseSpecies(b.species, content)
      )
    );
  },
  bredAnimalInPens: (state) => state.ranch.stock.some((a) => a.parents),
  // R37. The class lesson retires when the player DEMONSTRATES it rather
  // than on a node count: two chimeras whose anatomy votes different ways.
  // Derived, never stored — a chimera's class comes from its parts, so a
  // resequenced creature changes class and this answer changes with it.
  mixedClassStable: (state, content) => {
    const classes = new Set(
      (state.chimeras ?? [])
        .map((c) => analyze(c.frame, Object.values(c.tokens ?? {}), content)?.creatureClass)
        .filter(Boolean)
    );
    return classes.size >= 2;
  },
  // A9. The lift equation only becomes a decision once the player owns a
  // part that MAKES lift — 61 parts say Airborne, twelve of them fly — so
  // this asks for a wing rather than for parts in general. Retired once
  // they have actually bolted one on, which is the moment the Physiology
  // Panel starts answering the question for them.
  liftPartInVault: (state, content) =>
    (state.inventory?.parts ?? []).some((t) => content.parts[t.partId]?.phys?.lift),
  flierBuilt: (state, content) =>
    (state.chimeras ?? []).some((c) =>
      Object.values(c.tokens ?? {}).some((t) => content.parts[t.partId]?.phys?.lift)
    ),
  carrierInPens: (state, content) =>
    state.ranch.stock.some((a) => {
      const carried = Object.entries(a.genotype ?? {}).filter(([, n]) => n > 0);
      if (!carried.length) return false;
      // Something it is carrying but not showing — the case the Scanner exists for.
      const shown = new Set(expressedTraits(a.genotype, content));
      return carried.some(([id]) => !shown.has(id));
    }),
  facilityAffordable: (state, content) =>
    tracks(content).some((t) => nextUpgrade(state, content, t.id)?.affordable),
  anyTrackUpgraded: (state) => Object.values(state.facility ?? {}).some((lvl) => lvl > 1),
  chimeraTempered: (state) => state.chimeras.some((c) => c.temperament),
  bondedChimera: (state) => state.chimeras.some((c) => (c.bond ?? 0) >= 50),
  chimeraInjured: (state) => state.chimeras.some((c) => c.injury),
  injuryTreated: (state) => state.chimeras.some((c) => (c.injuriesTreated ?? 0) > 0),
  chimeraScarred: (state) => state.chimeras.some((c) => (c.scars ?? []).length),
  vatEligible: (state, content, now) =>
    state.chimeras.filter((c) => now >= c.settleUntil && !c.injury).length >= 2,
  // A bay is "used" once it has become one of its two futures: enemy tech
  // in the vault, or a specimen on the roster. Salvage is the only thing
  // that ever stamps a token with the `salvage` species, so one in the
  // vault is proof something got taken apart.
  containmentUsed: (state) =>
    state.chimeras.some((c) => c.rehabilitated) ||
    (state.inventory.parts ?? []).some((t) => t.donor?.species === 'salvage'),
  rehabilitatedChimera: (state) => state.chimeras.some((c) => c.rehabilitated),
  rivalAvailable: (state, content) => rivalStatus(state, content).some((r) => r.status !== 'locked'),
  rivalBeaten: (state) => Object.values(state.campaign.rivals ?? {}).some((r) => (r.defeats ?? 0) > 0),
  contestOpen: (state) => (state.campaign.contested ?? []).length > 0,
  nodeDefended: (state) => Object.values(state.campaign.defences ?? {}).some((n) => n > 0),
  secondRegionOpen: (state, content) =>
    regionList(content).slice(1).some((r) => regionOpen(state, content, r)),
  secondRegionHeld: (state, content) =>
    regionList(content).slice(1).some((r) => r.nodes.some((n) => state.campaign.heldNodes.includes(n.id))),
};

function meets(state, content, now, condition) {
  if (condition.helper) {
    const fn = GUIDE_HELPERS[condition.helper];
    return fn ? !!fn(state, content, now) : false;
  }
  return valueAt(state, condition.path, condition.default ?? 0) >= (condition.min ?? 1);
}

const all = (state, content, now, conditions) =>
  (conditions ?? []).every((c) => meets(state, content, now, c));

export function guideList(content) {
  return Object.values(content.guides ?? {});
}

// Every guide with its state: 'locked' (system out of reach), 'ready' (in
// reach and unused), 'done' (used), 'dismissed' (waved away by hand).
export function guideStates(state, content, now) {
  const dismissed = new Set(state.guidesSeen ?? []);
  return guideList(content)
    .map((guide) => {
      const done = all(state, content, now, guide.done);
      const reachable = all(state, content, now, guide.reachable);
      let status = 'locked';
      if (done) status = 'done';
      else if (!reachable) status = 'locked';
      else if (dismissed.has(guide.id)) status = 'dismissed';
      else status = 'ready';
      return { guide, status, reachable, done };
    })
    .sort((a, b) => a.guide.order - b.guide.order);
}

// The one note a screen should show right now, or null. One at a time on
// purpose: a wall of tips is wallpaper, and wallpaper does not get read.
export function guideForScreen(state, content, now, screen) {
  // The Path owns the screen until the first conquest — two tutorials at
  // once is one tutorial too many.
  if (pathOwnsScreen(state)) return null;
  return (
    guideStates(state, content, now).find(
      (row) => row.status === 'ready' && row.guide.screen === screen
    )?.guide ?? null
  );
}

export function dismissGuide(state, guideId) {
  state.guidesSeen ??= [];
  if (!state.guidesSeen.includes(guideId)) state.guidesSeen.push(guideId);
}
