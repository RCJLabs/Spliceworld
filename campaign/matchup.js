// R35 — what a creature does against THIS enemy. DOM-free.
//
// The briefing already showed the class triangle: a class icon per roster
// row, the opposition's classes, and a "type advantage here" flag. What it
// never showed was the OTHER matchup layer. Measured across the 24
// encounters: 96% carry a tag beyond Organic (Vehicle in 19, Airborne in 13,
// Armored and Aquatic in 11 each) and 71% throw at least one Ground move.
//
// And that layer decides fights. Isolated with the same build on both sides
// of the chart — the first attempt compared different builds and measured
// the builds instead — `Ground misses Airborne` is worth 3.7pp to a flier in
// the encounters that throw Ground, and `Sonic ignores Armor` is worth 7.4pp
// against armoured opposition. None of it was on the screen where a player
// picks who goes.
//
// Every clause is derived from data/keywords.json's chart, never restated,
// so a new chart row shows up on the briefing with no engine edit.

// The tags a creature ATTACKS with — only from moves it can actually press,
// because a move it knows and cannot field is not an answer to anything.
export function attackTags(moves) {
  return new Set(moves.filter((m) => (m.power ?? 0) > 0).flatMap((m) => m.tags ?? []));
}

// One line per rule that actually fires between this creature and this foe.
// `kind` is 'good' when the rule helps the player and 'bad' when it costs
// them — a briefing that only lists upsides is a sales brochure, and A1's
// whole lesson was that the game must not present a losing pick as a choice.
// Every chimera is stamped `Organic` by the engine (`tags: ['Organic',
// ...report.tags]`), so a rule that fires on Organic fires on every possible
// pick — "their Gas hits it harder" appeared on all four rows of nearly every
// encounter. True, and useless: a note that cannot distinguish one choice
// from another is not information for choosing. It belongs on the opposition
// line, said once, and this is where it stops being said four times.
const UNIVERSAL = new Set(['Organic']);

export function matchupNotes({ myTags, myAttackTags, foeTags, foeAttackTags }, chart = []) {
  const notes = [];
  for (const rule of chart) {
    // My attacks into their body.
    if (myAttackTags.has(rule.attack) && foeTags.has(rule.defender)) {
      const dead = rule.mult === 0;
      const weak = rule.mult != null && rule.mult < 1;
      notes.push({
        kind: dead || weak ? 'bad' : 'good',
        key: `out:${rule.attack}:${rule.defender}`,
        text: dead
          ? `its ${rule.attack} attacks do nothing to ${rule.defender}`
          : weak
            ? `its ${rule.attack} attacks are blunted by ${rule.defender}`
            : rule.rule === 'ignoreArmor'
              ? `${rule.attack} goes through their armour`
              : `${rule.attack} hits ${rule.defender} harder`,
      });
    }
    // Their attacks into my body.
    if (foeAttackTags.has(rule.attack) && myTags.has(rule.defender) && !UNIVERSAL.has(rule.defender)) {
      const dead = rule.mult === 0;
      const weak = rule.mult != null && rule.mult < 1;
      notes.push({
        kind: dead || weak ? 'good' : 'bad',
        key: `in:${rule.attack}:${rule.defender}`,
        text: dead
          ? `their ${rule.attack} attacks miss it entirely`
          : weak
            ? `their ${rule.attack} attacks are blunted`
            : rule.rule === 'ignoreArmor'
              ? `their ${rule.attack} goes through its armour`
              : `their ${rule.attack} hits it harder`,
      });
    }
  }
  // No deduplication here, deliberately. The first cut had a filter and a
  // comment claiming "several waves can carry the same tag" — but the caller
  // collapses waves into Sets before this is ever reached, and the chart is
  // walked exactly once, so a repeated key cannot arise. Measured across all
  // 24 encounters against a maximal tag set: zero duplicates. The break
  // battery reported removing the filter as a MISS, which is what dead code
  // guarded by a gate looks like.
  return notes;
}

// The opposition's tags, and what each one means for whoever you send.
export function foeTagLines(foeTags, chart = [], foeAttackTags = new Set()) {
  const lines = [];
  // Said once, here, rather than on every roster row: the rules that fire
  // against a tag every chimera carries.
  for (const rule of chart) {
    if (foeAttackTags.has(rule.attack) && UNIVERSAL.has(rule.defender)) {
      lines.push(`they throw ${rule.attack}, and everything you own is ${rule.defender} — it ${effectWordShort(rule)}`);
    }
  }
  for (const tag of foeTags) {
    const rules = chart.filter((r) => r.defender === tag);
    if (!rules.length) continue;
    // Whose attack, explicitly. "Gas hits harder" on an Organic foe reads as
    // a threat when it is an opportunity; the reader is the one choosing who
    // to send, so every clause is from their chair.
    lines.push(`${tag}: ${rules.map((r) => (
      r.rule === 'ignoreArmor' ? `your ${r.attack} goes straight through it`
        : r.mult === 0 ? `your ${r.attack} does nothing`
          : r.mult < 1 ? `your ${r.attack} is halved`
            : `your ${r.attack} hits ${r.mult}× as hard`
    )).join(', ')}`);
  }
  return lines;
}

function effectWordShort(rule) {
  if (rule.rule === 'ignoreArmor') return 'goes straight through armour';
  if (rule.mult === 0) return 'does nothing';
  if (rule.mult < 1) return 'is halved';
  return `hits ${rule.mult}× as hard`;
}
