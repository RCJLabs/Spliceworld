// The tag chart, in words. DOM-free.
//
// data/keywords.json's `tagChart` is the whole second matchup layer — the
// one underneath the class triangle — and every screen that wants to explain
// it needs the same sentences. R33 wrote them for the Physiology dossier;
// R35 needs them again on the briefing. Two copies of a chart is how a chart
// goes stale, so they live here and both screens read one implementation.
//
// The chart's own `note` field is a table caption ("Gas ≫ organic") and reads
// like one in a sentence, so a clause is built from the rule's MECHANICS
// instead: still read from the data, never a second copy of it. A rule shape
// nobody has authored yet still produces a sentence rather than a blank.
export function effectWord(rule) {
  if (rule.rule === 'ignoreArmor') return 'go straight through armour';
  if (rule.mult === 0) return 'do nothing at all';
  if (rule.mult < 1) return `do ${rule.mult === 0.5 ? 'half' : `${rule.mult}×`} damage`;
  if (rule.mult === 1.5) return 'do half again';
  return `do ${rule.mult}× damage`;
}

// What carrying `tag` means, split by which side of the rule the tag is on.
export function tagRules(tag, chart = []) {
  return {
    taking: chart.filter((r) => r.defender === tag)
      .map((r) => `${r.attack} attacks ${effectWord(r)} against it`),
    dealing: chart.filter((r) => r.attack === tag)
      .map((r) => `its ${r.attack} attacks ${effectWord(r)} to anything ${r.defender}`),
  };
}

// The same rule from the OTHER chair: what this defender's tag means for
// somebody choosing who to send at it. "Armored — Sonic attacks go straight
// through armour" is the line a player needs before they commit a team, and
// it is the same chart row the dossier phrases for the creature's own side.
export function foeTagClause(tag, chart = []) {
  const rules = chart.filter((r) => r.defender === tag);
  if (!rules.length) return null;
  return `${tag} — ${rules.map((r) => `${r.attack} ${effectWord(r)}`).join(', ')}`;
}
