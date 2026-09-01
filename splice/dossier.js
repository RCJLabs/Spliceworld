// R33 — the chimera dossier. DOM-free, so the suite can assert every line
// without a browser.
//
// The Physiology Panel (physiology.js `rows`) already computes eight rows,
// and the Theater shows them while you build. None of it survives the
// splice: measured across the four screens a player sees AFTER the creature
// exists, class reaches them (the briefing's icon, the battle chip) and
// instability reaches them (the pens card) — and flight, speed, mass, lift,
// power-to-weight, the thermal band and the field tags reach them NOWHERE.
// R32 made mass gate flight and anatomy decide class, which turned six
// invisible numbers into six invisible DECISIONS.
//
// This does not re-render `report.rows`, because three of those notes are
// written for somebody still building:
//
//   Flight     "Try a lighter frame or fewer dense parts." — you cannot
//              re-frame a chimera that already exists.
//   Instability "Settling estimate: ~N min." — stale the moment it settles.
//   Chassis    "One extraction gives you all six parts of a donor; use
//              them." — advice for a build still on the bench.
//
// So the dossier composes its own copy from the report's STRUCTURED fields.
// Same numbers, different voice — and because they come from the same
// report, the panel and the dossier can never disagree about a fact.

const P2W_WORD = [
  [0.35, 'explosive'],
  [0.22, 'strong'],
  [0.12, 'adequate'],
  [0, 'straining'],
];

// A tag only means something if the reader knows what it does. The rules
// live in data/keywords.json `tagChart`, so they are READ rather than
// restated: hardcoding "Electric hits Aquatic twice as hard" here would be
// a second copy of the chart that goes stale the first time somebody edits
// the real one. A tag with no chart row is reported as carrying no rule,
// which is the truth rather than a blank.
// The chart's own `note` is a table caption ("Gas \u226b organic") and reads
// like one in a sentence, so the clause is built from the MECHANICS instead —
// still read from the data, never a second copy of it.
function effectWord(rule) {
  if (rule.rule === 'ignoreArmor') return 'go straight through armour';
  if (rule.mult === 0) return 'do nothing at all';
  if (rule.mult < 1) return `do ${rule.mult === 0.5 ? 'half' : `${rule.mult}\u00d7`} damage`;
  if (rule.mult === 1.5) return 'do half again';
  return `do ${rule.mult}\u00d7 damage`;
}
function tagRules(tag, chart) {
  return {
    taking: chart.filter((r) => r.defender === tag)
      .map((r) => `${r.attack} attacks ${effectWord(r)} against it`),
    dealing: chart.filter((r) => r.attack === tag)
      .map((r) => `its ${r.attack} attacks ${effectWord(r)} to anything ${r.defender}`),
  };
}

export function dossierRows(report, content) {
  const rows = [];

  // 1. Class. Visible elsewhere, but the dossier is where you find out
  //    WHY — the vote is the thing a player can act on next time.
  const cls = report.creatureClass ? content.classes?.[report.creatureClass] : null;
  // The triangle is a cycle in the data, so who beats YOU is a lookup, not a
  // constant: physiology's own note says "weak to whatever beats it", which
  // is the one fact a player cannot work out from the screen.
  const beatenBy = cls
    ? Object.values(content.classes ?? {}).find((c) => c.beats === report.creatureClass)
    : null;
  const votes = Object.entries(report.classVotes)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => `${n}× ${content.classes?.[c]?.name ?? c}`)
    .join(', ');
  rows.push({
    key: 'class',
    label: 'Class',
    value: cls ? `${cls.icon} ${cls.name}` : '◇ Unclassed',
    note: cls
      ? `${votes} — strong against ${content.classes[cls.beats].name}${
        beatenBy ? `, weak to ${beatenBy.name}` : ''
      }.`
      : votes
        ? `${votes} — tied, so nothing dominates. Neutral in every matchup: nothing to exploit, nothing to be exploited.`
        : 'No wings, fins or feet in the mix. Neutral in every matchup.',
  });

  // 2. Flight — the one R32 made decisive and the one nothing showed.
  rows.push({
    key: 'flight',
    label: 'Flight',
    value: report.flight.capable ? '✈ Airborne' : report.flight.hasLiftSurface ? 'Flightless' : 'Ground unit',
    note: report.flight.capable
      ? `Lift ${report.lift} carries ${report.mass} mass. It fights in the air, so ground-level attacks pass underneath it.`
      : report.flight.hasLiftSurface
        ? `Lift ${report.lift} cannot carry ${report.mass} mass. The wings are real; the altitude is not, and Ground attacks land.`
        : 'Nothing here makes lift. It fights with its feet on the floor, and Ground attacks land.',
  });

  // 3. Speed, and what the mass cost.
  rows.push({
    key: 'speed',
    label: 'Speed',
    value: String(report.stats.speed),
    note: `Decides who moves first. ${report.mass} mass of creature is what it has to move.`,
  });

  // 4. Power-to-weight.
  const p2w = report.stats.power / report.mass;
  rows.push({
    key: 'p2w',
    label: 'Power-to-weight',
    value: `${p2w.toFixed(2)}`,
    // Total by construction. `find` on a NaN matches nothing — NaN >= 0 is
    // false — and indexing the miss THREW, which on a display module means
    // the whole Pens screen goes blank rather than one wrong number showing.
    // The break battery found this by feeding it a NaN on purpose.
    note: `${report.stats.power} power moving ${report.mass} mass — ${
      (P2W_WORD.find(([m]) => p2w >= m) ?? P2W_WORD[P2W_WORD.length - 1])[1]
    }.`,
  });

  // 5. The stamina economy. A build that runs a deficit loses long fights
  //    and nothing outside the Theater ever said so.
  rows.push({
    key: 'stamina',
    label: 'Stamina',
    value: `${report.stats.stamina} pool, ${report.regenNet >= 0 ? '+' : ''}${report.regenNet}/turn`,
    note: report.regenNet < 0
      ? 'It burns more than it recovers. Long fights are not its friend — open with what matters.'
      : report.regenNet === 0
        ? 'It recovers exactly what it burns. It can hold this pace, and not a turn faster.'
        : 'It recovers faster than it burns. It can keep pressing.',
  });

  // 6. Thermal.
  rows.push({
    key: 'thermal',
    label: 'Thermal comfort',
    value: report.thermal.ok ? `${report.thermal.min}° to ${report.thermal.max}°` : 'NONE',
    note: report.thermal.ok
      ? 'Every donor in the mix tolerates this range.'
      : 'The donors disagree about weather on a cellular level. That is where the instability came from.',
  });

  // 7. Field tags, each with the chart row it actually triggers.
  const tags = [...report.tags];
  if (tags.length) {
    const chart = content.tagChart ?? [];
    const lines = tags.map((t) => {
      const { taking, dealing } = tagRules(t, chart);
      const parts = [...taking, ...dealing];
      return `${t} — ${parts.length ? parts.join('; ') : 'no chart rule of its own'}`;
    });
    rows.push({
      key: 'tags',
      label: 'In the field',
      value: tags.join(' · '),
      note: lines.join('. ') + '.',
    });
  }

  // 8. Purebred. R33 refused to name the set bonus here, because all 41 were
  //    read by the panel and the Dex and by nothing in the battle engine —
  //    quoting one would have been a lie about what the creature does. R34
  //    wired them, so the dossier says it: the NAME the player is chasing,
  //    what it actually does, and the instability discount that was the only
  //    real part of it before.
  if (report.purebredSpecies) {
    const sp = content.species[report.purebredSpecies];
    const bonus = sp.setBonus;
    rows.push({
      key: 'purebred',
      label: 'Purebred',
      value: bonus?.effect ? bonus.name : sp.name,
      note: `${report.speciesCount[report.purebredSpecies]} ${sp.name} parts pulling together${
        bonus?.effect ? ` — ${bonus.desc}` : ''
      }, and steadier than a mixed build by 20 instability.`,
    });
  }

  return rows;
}

// What the fold says while it is shut: the three facts worth a glance.
export function dossierSummary(report, content) {
  const cls = report.creatureClass ? content.classes?.[report.creatureClass] : null;
  return [
    cls ? `${cls.icon} ${cls.name}` : '◇ Unclassed',
    report.flight.capable ? '✈ Airborne' : report.flight.hasLiftSurface ? 'flightless' : 'ground unit',
    `speed ${report.stats.speed}`,
  ].join(' · ');
}
