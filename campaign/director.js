// The AI Director (ROADMAP §3.7). Pure and DOM-free, so tools/sim.js can
// measure what it does to the difficulty curve.
//
// The world studies you. It reads three things, in rising order of how
// much they sting:
//   1. the anatomy you actually field right now (your live stable),
//   2. the parts you keep splicing (directorStats, recorded since M0),
//   3. every chimera you let the enemy finish dissecting — the roadmap's
//      promise that losing the rescue window costs you twice.
//
// Then it swaps ONE wave slot for something that answers you. Never the
// opening beat, never the tutorial tier, never a rival duel (rivals do
// their own counter-biasing), and never silently: every adaptation hands
// back an `intel` line the briefing shows you before you commit a team.
// A director you cannot see is just a difficulty knob (Law 4).

import { rngStream, pick } from '../util/rng.js';
import { reachableEncounterIds } from './map.js';

const DEFAULT_TUNING = {
  minSamples: 4,
  biasAt: 0.3,
  minTier: 2,
  // A dissected creature counts for exactly one you are still fielding:
  // the enemy took notes, but notes are not more real than the thing in
  // front of them. That is what makes "stop fielding what they dissected"
  // a working answer instead of a permanent tax.
  liveStableWeight: 3,
  spliceHistoryWeight: 1,
  dissectionWeight: 3,
  // How many encounters the world has bothered to rewrite. It starts with
  // one — the hardest, where the budget is — and reaches further down the
  // ladder as you take territory and, especially, as you lose creatures to
  // the dissection table. A budget rather than a tier threshold, because
  // tiers are lumpy: four encounters share tier 3, and crossing into it
  // wholesale turns a pressure into a wall.
  reachBase: 1,
  reachPerNode: 0.5,
  reachPerDissection: 0.75,
};

const tuningOf = (content) => ({ ...DEFAULT_TUNING, ...(content.directorMeta ?? {}) });

// A creature's class, by the same majority vote the game itself uses
// (splice/physiology.js). Counting raw part affinities instead would be a
// structural lie: ~32 parts vote Ground and only 4 vote Air, so every
// stable would read as Ground and diversifying would buy you nothing.
export function classOfParts(partIds, content) {
  // R72 - derived, not typed out: see splice/physiology.js, which runs the
  // same election on the same rule. A hardcoded trio here made a fourth class
  // invisible to the director specifically, so the world would never learn to
  // counter it.
  const votes = {};
  for (const id of partIds) {
    const affinity = content.parts[id]?.classAffinity;
    if (affinity && content.classes?.[affinity]) votes[affinity] = (votes[affinity] ?? 0) + 1;
  }
  const ranked = Object.entries(votes).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return null;
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return null; // tie: Unclassed
  return ranked[0][0];
}

// What the world has learned about you. Weighted so that the thing you are
// holding right now matters more than a splice you made a week ago, and a
// dissection matters most of all. Tags are counted per PART (a Gas build
// fields Gas parts); class is counted per CREATURE, because that is how the
// battle engine resolves it — and it is what makes diversifying a real
// answer rather than a cosmetic one.
export function directorProfile(state, content) {
  const t = tuningOf(content);
  const tags = {};
  const classes = {}; // R72: see classOfParts above - the data says how many.
  let samples = 0;

  const observeTags = (partId, weight) => {
    const part = content.parts[partId];
    if (!part) return;
    for (const tag of part.tags) tags[tag] = (tags[tag] ?? 0) + weight;
    samples += weight;
  };
  const observeCreature = (partIds, weight) => {
    const cls = classOfParts(partIds, content);
    if (cls) classes[cls] = (classes[cls] ?? 0) + weight;
  };

  for (const chimera of state.chimeras ?? []) {
    const partIds = Object.values(chimera.tokens).map((tk) => tk.partId);
    for (const partId of partIds) observeTags(partId, t.liveStableWeight);
    observeCreature(partIds, t.liveStableWeight);
  }
  for (const [partId, n] of Object.entries(state.directorStats?.partUse ?? {})) {
    observeTags(partId, n * t.spliceHistoryWeight);
  }
  for (const record of state.directorStats?.dissections ?? []) {
    const partIds = record.partIds ?? [];
    for (const partId of partIds) observeTags(partId, t.dissectionWeight);
    observeCreature(partIds, t.dissectionWeight);
  }

  const ranked = Object.entries(tags).sort((a, b) => b[1] - a[1]);
  const classRanked = Object.entries(classes).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const classTotal = classRanked.reduce((sum, [, n]) => sum + n, 0);

  return {
    samples,
    tags,
    classes,
    topTags: ranked.slice(0, 3).map(([tag, n]) => ({ tag, share: samples ? n / samples : 0 })),
    // A tie tells the director nothing — that is the hybrid's reward.
    favoredClass:
      classRanked.length && (classRanked.length === 1 || classRanked[0][1] > classRanked[1][1])
        ? classRanked[0][0]
        : null,
    classShare: classRanked.length && classTotal ? classRanked[0][1] / classTotal : 0,
    dissections: (state.directorStats?.dissections ?? []).length,
  };
}

// How well one counter rule answers this profile, 0..1.
function scoreRule(rule, profile) {
  let score = 0;
  for (const tag of rule.reads.tags ?? []) {
    score = Math.max(score, (profile.tags[tag] ?? 0) / (profile.samples || 1));
  }
  if (rule.reads.class && profile.favoredClass === rule.reads.class) {
    score = Math.max(score, profile.classShare);
  }
  return score;
}

// The rule the world would pick, or null if it has not learned enough.
export function directorRead(state, content) {
  const t = tuningOf(content);
  const profile = directorProfile(state, content);
  if (profile.samples < t.minSamples) return { profile, rule: null, score: 0 };

  let best = null;
  let bestScore = 0;
  for (const rule of Object.values(content.directorRules ?? {})) {
    // A rule whose units were removed from the roster is simply skipped.
    if (!rule.units.some((u) => content.enemies[u])) continue;
    const score = scoreRule(rule, profile);
    if (score > bestScore) {
      best = rule;
      bestScore = score;
    }
  }
  return { profile, rule: bestScore >= t.biasAt ? best : null, score: bestScore };
}

// How many encounters the world currently bothers to rewrite, and which.
// Hardest first: the units with the biggest budget adapt before the beat
// cops do. Ties break on id so the list is stable across reloads.
export function directorReach(state, content) {
  const t = tuningOf(content);
  // Only what the player can actually walk to today. "Hardest first" was a
  // fine definition of where the world adapts while there was one county;
  // across five regions it would spend the whole budget rewriting the
  // Compliance Spire while the player is still arguing with a parking
  // warden in Greenfield.
  const reachable = new Set(reachableEncounterIds(state, content));
  const eligible = Object.values(content.encounters ?? {})
    .filter((e) => (e.tier ?? 0) >= t.minTier && reachable.has(e.id))
    .sort((a, b) => (b.tier ?? 0) - (a.tier ?? 0) || (a.id < b.id ? -1 : 1));
  const budget = Math.min(
    eligible.length,
    Math.floor(
      t.reachBase +
        (state.campaign?.heldNodes?.length ?? 0) * t.reachPerNode +
        (state.directorStats?.dissections?.length ?? 0) * t.reachPerDissection
    )
  );
  return { budget, ids: eligible.slice(0, budget).map((e) => e.id) };
}

// Adapt one encounter. Returns the encounter unchanged when the director
// has nothing to say, so callers can use it unconditionally.
export function directEncounter(state, encounter, content) {
  const t = tuningOf(content);
  if (!encounter || encounter.rivalId) return encounter;
  if (encounter.tier == null || encounter.tier < t.minTier) return encounter;
  // A derived encounter (a contested node's defence) is reached through
  // the encounter it was derived from — it is the same enemy at the same
  // place, and a counter-offensive is the last thing the world should be
  // forbidden from adapting.
  const reachId = encounter.baseId ?? encounter.id;
  if (!directorReach(state, content).ids.includes(reachId)) return encounter;
  if (encounter.waves.length < 2) return encounter;

  const { rule, score, profile } = directorRead(state, content);
  if (!rule) return encounter;

  // Seeded on the node, so the same save always faces the same adaptation
  // and a reload mid-briefing shows the identical opposition.
  const rng = rngStream(state.seed, `director:${reachId}`, profile.dissections);
  const pool = rule.units.filter((u) => content.enemies[u]);
  const unitId = pick(rng, pool);

  // The director may only ever make a fight HARDER. Replacing a tough unit
  // with a "counter" that happens to be weaker is how an adaptive system
  // accidentally becomes a mercy rule — so pick the flimsiest slot after
  // the first (the encounter still opens the way it was authored), skip any
  // slot that already fields this counter, and if nothing there is weaker
  // than the incoming unit, send it as an EXTRA wave instead.
  const weight = (id) => {
    const u = content.enemies[id];
    return u ? u.hp + u.power * 3 + u.armor * 2 : 0;
  };
  // Prefer to replace something that is NOT already an answer to this
  // profile — swapping one Vehicle for another Vehicle against a Gas build
  // changes the sprite and nothing else.
  const alreadyCounters = (id) => rule.units.includes(id);
  // `weight` predicts a unit's real threat well across the roster (measured
  // at r=0.958) but the guarantee it is asked for is PAIRWISE, and no
  // correlation that good is free of local inversions. Three encounter x
  // rule pairings were measured turning an adaptation into a mercy rule,
  // and every one of them shares a cause `weight` cannot see: it reads
  // hp/power/armor and never looks at what the unit actually swings.
  // gunship_80 (weight 118, a 58-power move) reads flimsier than
  // attack_chopper (130, 52) and is not. So a slot that hits harder than
  // the counter coming in is never expendable, whatever the stat line says
  // — which takes mercy rules from three to none with no margin constant
  // to tune, and costs only 5 of 21 swaps.
  const bestMove = (id) => {
    const u = content.enemies[id];
    return u ? Math.max(0, ...u.moves.map((m) => m.power)) : 0;
  };
  // A commander is not a mook. Never cut the opening beat, the final wave,
  // or anything that transforms — a boss fight that no longer contains its
  // boss is not an adaptation, it is a content bug.
  const expendable = ({ id, i }) =>
    i > 0 &&
    i < encounter.waves.length - 1 &&
    !content.enemies[id]?.transformInto &&
    id !== unitId &&
    weight(id) <= weight(unitId) &&
    bestMove(id) <= bestMove(unitId);
  const candidates = encounter.waves
    .map((id, i) => ({ id, i }))
    .filter(expendable)
    .sort((a, b) =>
      Number(alreadyCounters(a.id)) - Number(alreadyCounters(b.id)) || weight(a.id) - weight(b.id)
    );

  const waves = [...encounter.waves];
  let replaced = null;
  if (candidates.length) {
    replaced = candidates[0].id;
    waves[candidates[0].i] = unitId;
  } else {
    waves.push(unitId); // nothing here is expendable — they sent more instead
  }

  return {
    ...encounter,
    waves,
    directed: {
      ruleId: rule.id,
      unitId,
      replaced,
      added: replaced === null,
      score,
      intel: rule.intel,
      news: rule.news,
      dissections: profile.dissections,
    },
  };
}

// The world announces itself once per rule, in the news wire. Returns the
// line to push, or null if this rule has already made the papers.
export function directorNews(state, directed) {
  if (!directed?.news) return null;
  state.directorStats.announced ??= [];
  if (state.directorStats.announced.includes(directed.ruleId)) return null;
  state.directorStats.announced.push(directed.ruleId);
  return directed.news;
}
