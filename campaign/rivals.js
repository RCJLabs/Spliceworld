// Rival geneticists (ROADMAP §3.8). Pure and DOM-free so tools/sim.js can
// fight them headless.
//
// The point of this module: a rival's chimeras are built the same way
// yours are. We pick parts, hand them to unitFromGenome, and physiology
// decides the stats, the tags and — crucially — the elemental class. A
// rival who commits to Water is Water because of the gills, not because a
// designer typed "water" into a table. Everything here is seeded: the
// same save always faces the same team, so a reload mid-briefing shows
// the identical opposition.

import { rngStream, pick } from '../util/rng.js';
import { unitFromGenome } from '../battle/engine.js';

// Slots a rival will try to fill, in the order they commit to them. Head
// first (mandatory), then the limbs that carry classAffinity votes.
const BUILD_ORDER = ['head', 'forelimbs', 'tail', 'hide', 'organ', 'hindlimbs'];

export function rivalList(content) {
  return Object.values(content.rivals ?? {});
}

function nodeLabel(content, nodeId) {
  for (const region of Object.values(content.regions ?? {})) {
    const node = region.nodes.find((n) => n.id === nodeId);
    if (node) return node.name;
  }
  return nodeId;
}

export function rivalRecord(state, rivalId) {
  return state.campaign.rivals?.[rivalId] ?? { defeats: 0, losses: 0, lastMetAt: null };
}

// Unlock gate: hold the named nodes and carry the notoriety. Rivals are
// ordered so each answers the class you just farmed off the last one.
export function rivalStatus(state, content) {
  return rivalList(content).map((rival) => {
    const record = rivalRecord(state, rival.id);
    const missingNodes = (rival.requiresNodes ?? []).filter((n) => !state.campaign.heldNodes.includes(n));
    const missingRivals = (rival.requiresRivals ?? []).filter((r) => rivalRecord(state, r).defeats === 0);
    const notorious = state.campaign.notoriety >= (rival.notorietyAt ?? 0);
    const open = !missingNodes.length && !missingRivals.length && notorious;
    const status = open ? (record.defeats > 0 ? 'rematch' : 'available') : 'locked';
    const need = [];
    for (const nodeId of missingNodes) need.push(`hold ${nodeLabel(content, nodeId)}`);
    for (const rivalId of missingRivals) need.push(`beat ${content.rivals[rivalId]?.name ?? rivalId}`);
    if (!notorious) need.push(`notoriety ${rival.notorietyAt}`);
    return { rival, record, status, need };
  });
}

// The player's dominant class, from what they actually field. Rivals with
// counterBias build the class that beats it — the first real use of the
// director stats we have been recording since M0.
export function playerFavoredClass(state, content) {
  const votes = { air: 0, ground: 0, water: 0 };
  for (const chimera of state.chimeras) {
    for (const token of Object.values(chimera.tokens)) {
      const affinity = content.parts[token.partId]?.classAffinity;
      if (affinity) votes[affinity] += 1;
    }
  }
  const ranked = Object.entries(votes).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return null;
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return null; // no read
  return ranked[0][0];
}

function counterClassOf(target, content) {
  if (!target) return null;
  return Object.values(content.classes).find((c) => c.beats === target)?.id ?? null;
}

// Grade ladder: a rival who keeps losing keeps upgrading.
function gradeFor(rival, meta, defeats, index, rng) {
  const base = rival.grades[Math.min(index, rival.grades.length - 1)];
  const ladder = meta.gradeLadder;
  const at = ladder.indexOf(base);
  const stepped = Math.min(ladder.length - 1, at + Math.floor(defeats / 2));
  // A little spread so a team isn't uniform — but never below its base.
  return rng() < 0.75 ? ladder[stepped] : ladder[Math.max(at, stepped - 1)];
}

// Choose one part per slot. Favored species first; class-affinity parts win
// ties so the rival's philosophy actually shows up in the anatomy. A slot
// with no acceptable candidate is left EMPTY on purpose — that is how an
// Air specialist ends up with no hind legs, and physiology charges them
// for it exactly as it would charge the player.
function chooseParts(rival, targetClass, content, rng) {
  const byId = Object.values(content.parts).filter((p) => p.species !== 'salvage');
  // A rival's philosophy usually supplies the anatomy they want. When it
  // cannot — an aviarist ordered to field Water has no gills in the house —
  // they go shopping outside their own lab, which is exactly the story we
  // want to tell about someone who has decided to beat you specifically.
  const homeGrown = byId.some(
    (p) => p.classAffinity === targetClass && rival.favoredSpecies.includes(p.species)
  );
  const species = homeGrown
    ? rival.favoredSpecies
    : [...new Set([...rival.favoredSpecies, ...byId.filter((p) => p.classAffinity === targetClass).map((p) => p.species)])];

  const tokens = [];
  let classVotes = 0;
  for (const slot of BUILD_ORDER) {
    const inSlot = byId.filter((p) => p.slot === slot);
    const favored = inSlot.filter((p) => species.includes(p.species));
    const onClass = favored.filter((p) => p.classAffinity === targetClass);
    const offClass = favored.filter((p) => p.classAffinity && p.classAffinity !== targetClass);
    const neutral = favored.filter((p) => !p.classAffinity);

    let pool;
    if (onClass.length) pool = onClass;
    else if (neutral.length) pool = neutral;
    else if (slot === 'head') pool = inSlot.filter((p) => !p.classAffinity || p.classAffinity === targetClass);
    else if (slot !== 'hindlimbs' && classVotes < 2) pool = inSlot.filter((p) => p.classAffinity === targetClass);
    else pool = null; // an off-class limb would dilute the vote: skip it

    // Once the class is locked in by two votes, an off-class limb is a
    // fair trade for the stats — commit first, then optimise.
    if (!pool && offClass.length && classVotes >= 2) pool = offClass;
    if (!pool || !pool.length) continue;

    const part = pick(rng, pool);
    if (part.classAffinity === targetClass) classVotes += 1;
    tokens.push(part);
  }
  return tokens;
}

// A lab that ships two specimens with the same designation is not a lab
// anyone should fear. Retry, then fall back to a numeral.
function creatureName(rival, rng, taken) {
  for (let i = 0; i < 8; i++) {
    const name = `${pick(rng, rival.nameParts.prefixes)} ${pick(rng, rival.nameParts.suffixes)}`;
    if (!taken.has(name)) return name;
  }
  return `${pick(rng, rival.nameParts.prefixes)} ${taken.size + 1}`;
}

// The rival's current team, as unit records. Deterministic from the world
// seed, the rival, and how many times they have already lost to you.
export function rivalTeam(state, rival, content) {
  const meta = content.rivalMeta;
  const record = rivalRecord(state, rival.id);
  const rng = rngStream(state.seed, `rival:${rival.id}`, record.defeats);

  const counter = rival.counterBias ? counterClassOf(playerFavoredClass(state, content), content) : null;
  const powerScale = Math.min(
    meta.powerCap,
    rival.powerScale * (1 + record.defeats * meta.powerPerDefeat)
  );
  const size = Math.min(
    meta.teamCap,
    rival.teamSize + Math.floor(record.defeats / meta.teamGrowthEvery)
  );

  const team = [];
  const names = new Set();
  for (let i = 0; i < size; i++) {
    // The lead specimen always flies the rival's flag; a counter-biased
    // rival answers your stable with its second.
    const targetClass = i === 1 && counter ? counter : rival.classBias;
    const frame = rival.frames[Math.min(i, rival.frames.length - 1)];
    const parts = chooseParts(rival, targetClass, content, rng);
    const tokens = parts.map((part, n) => ({
      id: `${rival.id}-${i}-${n}`,
      partId: part.id,
      grade: gradeFor(rival, meta, record.defeats, i, rng),
      donor: { name: rival.name, species: part.species, stars: 5, extractedAt: 0 },
    }));
    const name = creatureName(rival, rng, names);
    names.add(name);
    team.push(
      unitFromGenome(
        {
          id: `${rival.id}_spec${i}_${record.defeats}`,
          name,
          frame,
          tokens,
          powerScale,
          koLine: `${name} folds neatly and is collected by ${rival.name}'s very patient intern.`,
        },
        content
      )
    );
  }
  return { team, powerScale, counterClass: counter };
}

// A full encounter in the enemies.json shape, with the units inline.
export function rivalEncounter(state, rival, content) {
  const { team, powerScale, counterClass } = rivalTeam(state, rival, content);
  const record = rivalRecord(state, rival.id);
  const rematch = record.defeats > 0;
  return {
    id: `rival_${rival.id}`,
    rivalId: rival.id,
    name: rematch ? `${rival.name} — Rematch ${record.defeats + 1}` : rival.name,
    blurb: rival.philosophy,
    waves: team,
    reward: Math.round(rival.reward * (1 + record.defeats * 0.25)),
    barks: rival.monologue,
    powerScale,
    counterClass,
  };
}

// Called by resolveBattle on a rival fight. Records the result so the
// rival iterates, and hands back news lines for the wire.
export function recordRivalResult(state, rivalId, outcome, content) {
  state.campaign.rivals ??= {};
  const record = (state.campaign.rivals[rivalId] ??= { defeats: 0, losses: 0, lastMetAt: null });
  const rival = content.rivals[rivalId];
  if (outcome === 'win') {
    record.defeats += 1;
    state.campaign.notoriety += rival.notoriety;
    return record.defeats === 1
      ? `${rival.name} defeated. Their lab is already ordering more petri dishes — and better ones.`
      : `${rival.name} beaten again (${record.defeats}×). They are taking this personally and it shows in the budget.`;
  }
  record.losses += 1;
  return `${rival.name} wins the exchange and issues a press release about it. Rude.`;
}
