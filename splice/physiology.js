// The Physiology Panel's brain (M3). Pure: takes a frame + part tokens,
// returns numbers AND the sentences that justify them — building is
// engineering, not a slot machine (Law 4). Battle stats derived here are
// the same ones the M4 engine will consume.

import { GRADES, GRADE_INDEX } from './extract.js';

export const PHYS_TUNING = {
  massSpeedPenaltyPer: 50, // -1 speed per this much mass
  purebredAt: 4, // parts of one species for the set bonus
  instabilityPerExtraSpecies: 18,
  instabilityPerExtraGrade: 8,
  instabilityThermalChaos: 15,
  purebredStability: 20,
  settleBaseMs: 30 * 60000, // 30 min floor…
  settleMaxExtraMs: 3.5 * 3600000, // …plus up to 3.5h at instability 100
};

const P2W_RATINGS = [
  [0.35, 'Explosive'],
  [0.22, 'Strong'],
  [0.12, 'Adequate'],
  [0, 'Straining'],
];

// tokens: array of vault tokens ({partId, grade, donor}). Grade multiplies
// the part's stat block — husbandry compounds all the way into combat.
export function analyze(frameId, tokens, content) {
  const frame = content.frames[frameId];
  const rows = [];

  const stats = { hp: frame.phys.hp, power: 0, armor: 0, speed: frame.phys.speed, stamina: frame.phys.stamina, regen: frame.phys.regen };
  let mass = frame.phys.mass;
  let draw = 0;
  let lift = 0;
  const speciesCount = {};
  const gradeSet = new Set();
  const tags = new Set();

  for (const token of tokens) {
    const part = content.parts[token.partId];
    const mult = GRADES[GRADE_INDEX[token.grade]].mult;
    for (const [stat, v] of Object.entries(part.stats)) {
      stats[stat] = (stats[stat] ?? 0) + v * mult;
    }
    for (const traitId of token.traits ?? []) {
      for (const [stat, v] of Object.entries(content.traits?.[traitId]?.statBonus ?? {})) {
        stats[stat] = (stats[stat] ?? 0) + v;
      }
    }
    mass += part.phys.mass;
    draw += part.phys.draw;
    lift += (part.phys.lift ?? 0) * mult;
    speciesCount[part.species] = (speciesCount[part.species] ?? 0) + 1;
    gradeSet.add(token.grade);
    for (const t of part.tags) tags.add(t);
  }
  for (const stat of Object.keys(stats)) stats[stat] = Math.round(stats[stat]);
  lift = Math.round(lift);

  // Power-to-weight
  const p2w = stats.power / mass;
  const p2wRating = P2W_RATINGS.find(([min]) => p2w >= min)[1];
  rows.push({
    label: 'Power-to-weight',
    value: `${p2w.toFixed(2)} (${p2wRating})`,
    note: `power ${stats.power} moving ${mass} mass — ${frame.name} chassis is ${frame.phys.mass} of that.`,
  });

  // Speed after mass penalty
  const massPenalty = Math.floor(mass / PHYS_TUNING.massSpeedPenaltyPer);
  const speed = Math.max(1, stats.speed - massPenalty);
  rows.push({
    label: 'Speed',
    value: String(speed),
    note: `${stats.speed} from frame + parts, minus ${massPenalty} for hauling ${mass} mass around.`,
  });

  // Stamina pool & regen vs metabolic draw
  const regenNet = stats.regen - draw;
  rows.push({
    label: 'Stamina',
    value: `${stats.stamina} pool, ${regenNet >= 0 ? '+' : ''}${regenNet}/turn`,
    note:
      `organs regenerate ${stats.regen}, metabolism burns ${draw}. ` +
      (regenNet < 0
        ? 'This build runs HOT — it will gas out unless it paces itself.'
        : 'Sustainable. The intern is relieved.'),
  });

  // Thermal comfort band = intersection of the species bands in the mix.
  let tMin = -Infinity;
  let tMax = Infinity;
  for (const sp of Object.keys(speciesCount)) {
    const [lo, hi] = content.species[sp].thermal;
    tMin = Math.max(tMin, lo);
    tMax = Math.min(tMax, hi);
  }
  const thermalOk = tokens.length === 0 || tMin <= tMax;
  rows.push({
    label: 'Thermal comfort',
    value: thermalOk ? (tokens.length ? `${tMin}° to ${tMax}°` : '—') : 'NONE',
    note: thermalOk
      ? 'Every donor species can tolerate this range.'
      : `${Object.keys(speciesCount).map((s) => content.species[s].name).join(' and ')} disagree about weather on a cellular level. Expect instability.`,
  });

  // Flight — the acceptance row. Legal to build, physics gets a vote.
  const hasLiftSurface = lift > 0;
  const canFly = hasLiftSurface && lift >= mass;
  rows.push({
    label: 'Flight',
    value: canFly ? 'FLIGHT-CAPABLE' : hasLiftSurface ? 'FLIGHTLESS' : 'Ground unit',
    note: !hasLiftSurface
      ? 'No lift surfaces installed. The ground remains a loyal friend.'
      : canFly
        ? `Lift ${lift} comfortably hoists ${mass} mass. Cleared for takeoff.`
        : `Lift ${lift} cannot hoist ${mass} mass. The wings flap. The creature stays. Physics sends its regards — try a lighter frame or fewer dense parts.`,
  });

  // Purebred set bonus
  const purebredSpecies = Object.entries(speciesCount).find(([, n]) => n >= PHYS_TUNING.purebredAt)?.[0] ?? null;
  if (purebredSpecies) {
    const bonus = content.species[purebredSpecies].setBonus;
    rows.push({
      label: 'Purebred bonus',
      value: bonus.name,
      note: `${speciesCount[purebredSpecies]} ${content.species[purebredSpecies].name} parts: ${bonus.desc}.`,
    });
  }

  // Instability & settling forecast
  const nSpecies = Object.keys(speciesCount).length;
  let instability =
    Math.max(0, nSpecies - 1) * PHYS_TUNING.instabilityPerExtraSpecies +
    Math.max(0, gradeSet.size - 1) * PHYS_TUNING.instabilityPerExtraGrade +
    (thermalOk ? 0 : PHYS_TUNING.instabilityThermalChaos) -
    (purebredSpecies ? PHYS_TUNING.purebredStability : 0);
  instability = Math.max(0, Math.min(100, instability));
  const settlingMs = Math.round(PHYS_TUNING.settleBaseMs + (instability / 100) * PHYS_TUNING.settleMaxExtraMs);
  rows.push({
    label: 'Instability',
    value: `${instability}/100`,
    note:
      `${nSpecies} species in the mix, ${gradeSet.size} grade tier${gradeSet.size === 1 ? '' : 's'}` +
      (thermalOk ? '' : ', thermal chaos') +
      (purebredSpecies ? ', steadied by the purebred set' : '') +
      `. Settling estimate: ~${Math.round(settlingMs / 60000)} min.`,
  });

  // Combos present in this build
  const partIds = new Set(tokens.map((t) => t.partId));
  const combos = (content.combos ? Object.values(content.combos) : []).filter((c) =>
    c.parts.every((p) => partIds.has(p))
  );

  return {
    stats: { ...stats, speed },
    mass,
    draw,
    lift,
    regenNet,
    thermal: { min: tMin, max: tMax, ok: thermalOk },
    flight: { hasLiftSurface, lift, capable: canFly },
    tags: [...tags],
    speciesCount,
    purebredSpecies,
    instability,
    settlingMs,
    combos,
    rows,
  };
}
