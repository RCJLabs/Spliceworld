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
import { analyze } from '../splice/physiology.js';
import { rivalLine } from './monologue.js';

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

// --- Scouting (R27) ------------------------------------------------------
//
// A rival used to counter you by asking the AI director what class you
// favoured. That is the wrong source: the director watches your WHOLE
// stable, continuously, from usage banked since M0 — it is the world
// noticing you. A rival is one person in one building who has only ever
// seen what walked through their door.
//
// So each rival keeps their own file, written only by duels against them.
// Two rivals who have fought you at different times hold different reads,
// which is the point: their counters are personal, not a shared broadcast.

const bump = (bag, key, n = 1) => { if (key) bag[key] = (bag[key] ?? 0) + n; };
const topOf = (bag) => {
  const rows = Object.entries(bag ?? {}).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return rows.length ? rows[0][0] : null;
};

export function emptyFile() {
  return { fights: 0, classes: {}, moveTags: {}, parts: {} };
}

// Record one duel. `deployed` is the chimeras the player actually brought —
// not the stable they own, which a rival has no way of seeing.
export function scoutStable(state, rivalId, deployed, content) {
  state.campaign.rivals ??= {};
  const record = (state.campaign.rivals[rivalId] ??= { defeats: 0, losses: 0, lastMetAt: null });
  const file = (record.scouted ??= emptyFile());
  file.fights += 1;
  for (const chimera of deployed ?? []) {
    const tokens = Object.values(chimera.tokens ?? {});
    if (!tokens.length) continue;
    const report = analyze(chimera.frame, tokens, content, tokens.length);
    bump(file.classes, report.creatureClass);
    for (const token of tokens) {
      bump(file.parts, token.partId);
      for (const tag of content.parts[token.partId]?.move?.tags ?? []) bump(file.moveTags, tag);
    }
  }
  return file;
}

// How far along a rival's counter ladder they are, from how many times you
// have beaten them. Everyone reaches the anatomy tier by the second defeat;
// `counterBias` only decides whether they react from the first.
export function counterTier(rival, meta, defeats) {
  const ladder = meta.tierAtDefeats ?? [0, 1, 2, 2, 3];
  let tier = ladder[Math.min(defeats, ladder.length - 1)];
  if (tier === (meta.classCounterTier ?? 1) && !rival.counterBias) tier = 0;
  return tier;
}

function counterClassOf(target, content) {
  if (!target) return null;
  return Object.values(content.classes).find((c) => c.beats === target)?.id ?? null;
}

// Everything a rival has worked out about you, and what they intend to do
// about it. Pure — the briefing screen and the team builder read the same
// answer, so what the player is warned about is what they actually face.
export function rivalDossier(state, rival, content) {
  const meta = content.rivalMeta;
  const record = rivalRecord(state, rival.id);
  const file = record.scouted ?? emptyFile();
  const tier = counterTier(rival, meta, record.defeats);
  const enough = file.fights >= (meta.minFightsToCounter ?? 1);

  const topClass = topOf(file.classes);
  const topTag = topOf(file.moveTags);
  const counterClass = tier >= (meta.classCounterTier ?? 1) && enough
    ? counterClassOf(topClass, content)
    : null;
  const rule = tier >= (meta.anatomyCounterTier ?? 2) && enough
    ? (meta.counters ?? []).find((c) => c.when === topTag) ?? null
    : null;
  const mirror = tier >= (meta.mirrorTier ?? 3) && enough ? topOf(file.parts) : null;

  return {
    tier,
    fights: file.fights,
    topClass,
    topTag,
    counterClass,
    seek: rule?.seek ?? [],
    avoid: rule?.avoid ?? [],
    mirror,
    intel: rule?.intel ?? null,
    // Whether the LEAD specimen is the one built for you rather than the one
    // flying their flag. This is about the TIER, not about whether a class
    // counter exists: an unclassed stable gives them nothing to answer on
    // the triangle, but they can still lead with anatomy that blunts your
    // kit — and if the answer went to the second specimen instead, a rival
    // would quietly stop reacting to exactly the builds that are hardest to
    // read.
    counterLeads: tier >= (meta.anatomyCounterTier ?? 2),
  };
}

// Kept for callers that only want the headline. Reads the rival's own file
// rather than the director, which is the whole change.
export function playerFavoredClass(state, content, rivalId) {
  const record = rivalRecord(state, rivalId);
  return topOf(record.scouted?.classes ?? {});
}

// Grade ladder: a rival who keeps losing keeps upgrading.
function gradeFor(rival, meta, defeats, index, rng) {
  const base = rival.grades[Math.min(index, rival.grades.length - 1)];
  const ladder = meta.gradeLadder;
  const at = ladder.indexOf(base);
  // Grade steps every third defeat, not every second (R27). Stacked on the
  // power ramp AND the counter tier, a step at two turned the first real
  // rematch into a wall: the anatomy that cleared a rival at 92-100% cleared
  // the same rival at 0-8% two defeats later, which is not a ladder, it is
  // a door. The escalation now leaves room for the COUNTER to be the thing
  // that makes a rematch hard.
  const stepped = Math.min(ladder.length - 1, at + Math.floor(defeats / (meta.gradeStepEvery ?? 3)));
  // A little spread so a team isn't uniform — but never below its base.
  return rng() < 0.75 ? ladder[stepped] : ladder[Math.max(at, stepped - 1)];
}

// Choose one part per slot. Favored species first; class-affinity parts win
// ties so the rival's philosophy actually shows up in the anatomy. A slot
// with no acceptable candidate is left EMPTY on purpose — that is how an
// Air specialist ends up with no hind legs, and physiology charges them
// for it exactly as it would charge the player.
function chooseParts(rival, targetClass, content, rng, dossier = null) {
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

    // The anatomy counter (R27). A rival at tier 2 has read which tag you
    // actually swing and picks limbs that blunt it: Airborne against a
    // Ground kit, nothing wet against Electric, nothing plated against
    // Sonic. Applied as a PREFERENCE inside the slot's existing pool, so a
    // rival never abandons their own philosophy to chase you — they are
    // still an aviarist, they are just an aviarist who has met you.
    if (dossier) {
      const wanted = pool.filter((p) => {
        const tags = p.tags ?? [];
        if (dossier.avoid.some((t) => tags.includes(t))) return false;
        if (dossier.seek.length) return dossier.seek.some((t) => tags.includes(t));
        return true;
      });
      if (wanted.length) pool = wanted;
      else if (dossier.avoid.length) {
        // Nothing in this slot seeks what they want, but they can still
        // decline what hurts.
        const safe = pool.filter((p) => !dossier.avoid.some((t) => (p.tags ?? []).includes(t)));
        if (safe.length) pool = safe;
      }
    }

    const part = pick(rng, pool);
    if (part.classAffinity === targetClass) classVotes += 1;
    tokens.push(part);
  }

  // The mirror (tier 3): one of your own signature parts, fielded back at
  // you. It replaces whatever they had in that socket — a lab that has lost
  // to the same head four times will simply take the head.
  if (dossier?.mirror && content.parts[dossier.mirror]) {
    const mine = content.parts[dossier.mirror];
    const at = tokens.findIndex((t) => t.slot === mine.slot);
    if (at >= 0) tokens[at] = mine;
    else tokens.push(mine);
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

  const dossier = rivalDossier(state, rival, content);
  const counter = dossier.counterClass;
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
    // Tier 1: the lead still flies their flag and the SECOND specimen
    // answers you. Tier 2 and up: the counter moves to the lead, because a
    // lab that has lost to you twice has stopped treating you as a variable
    // and started treating you as the problem.
    const counterSlot = dossier.counterLeads ? 0 : 1;
    const targetClass = counter && i === counterSlot ? counter : rival.classBias;
    // Only the specimen built to answer you carries the anatomy counter;
    // the rest of the lab is still the lab.
    const parts = chooseParts(rival, targetClass, content, rng, i === counterSlot ? dossier : null);
    const tokens = parts.map((part, n) => ({
      id: `${rival.id}-${i}-${n}`,
      partId: part.id,
      grade: gradeFor(rival, meta, record.defeats, i, rng),
      donor: { name: rival.name, species: part.species, stars: 5, extractedAt: 0 },
    }));
    // A9: a rival's authored `frames` list is their STYLE; answering you is
    // a decision. Since Airborne became a claim about physics rather than
    // ancestry, a lab that looked up "get above their Ground kit" and then
    // bolted the wings to its usual Rumbler has bought wings and stayed on
    // the ground — the exact mistake the rules now punish the player for.
    // So the countering specimen takes the lightest chassis that actually
    // gets this build off the ground, and every other specimen keeps the
    // lab's own taste.
    let frame = rival.frames[Math.min(i, rival.frames.length - 1)];
    const wantsAir = i === counterSlot && (dossier.seek ?? []).includes('Airborne');
    if (wantsAir && !analyze(frame, tokens, content).flight.capable) {
      const lifted = Object.values(content.frames)
        .slice()
        .sort((a, b) => a.phys.mass - b.phys.mass)
        .find((f) => analyze(f.id, tokens, content).flight.capable);
      if (lifted) frame = lifted.id;
    }
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
  return { team, powerScale, counterClass: counter, dossier };
}

// A full encounter in the enemies.json shape, with the units inline.
export function rivalEncounter(state, rival, content) {
  const { team, powerScale, counterClass, dossier } = rivalTeam(state, rival, content);
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
    dossier,
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
    if (record.defeats === 1) {
      return `${rival.name} defeated. Their lab is already ordering more petri dishes — and better ones.`;
    }
    // Every rematch after the first is announced in their OWN voice: a
    // lab that keeps losing to you should sound like it, not like a
    // scoreboard (§3.8 `rematch`).
    return (
      rivalLine(content, rivalId, 'rematch') ??
      `${rival.name} beaten again (${record.defeats}×). They are taking this personally and it shows in the budget.`
    );
  }
  record.losses += 1;
  return `${rival.name} wins the exchange and issues a press release about it. Rude.`;
}
