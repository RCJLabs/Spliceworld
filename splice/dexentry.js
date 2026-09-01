// R36 — a species entry worth opening. DOM-free.
//
// The Dex has seven sections and most of them are generous: rival dossiers
// carry what that rival will field NEXT, undiscovered combos carry A6's
// hints, variants carry class, tags and their set bonus, enemy units carry
// their tags. The 34 BASE species — the roster the whole game is spent
// collecting — carried a name, a role and a parts count. Measured against
// its own mutations, a base species showed strictly less than a variant of
// itself.
//
// Everything the last four phases made real was missing from it: the tags
// R35 put on the briefing, the set bonus R34 wired into the engine, the
// bulk R32 made decide flight. This is that entry.

import { PHYS_TUNING } from './physiology.js';

// A weight class in words, derived from the roster rather than hardcoded,
// so it stays true if the bulks are ever retuned. R32's lesson: the number
// lives in data, and the engine must not keep a second opinion about it.
export function weightWord(species, all) {
  // The base roster only: the six bred variants inherit their parent's build
  // and three of them carry no bulk of their own, so counting them would
  // stack phantom 1.0s in the middle of the scale.
  const bulks = all.filter((s) => !s.synthetic && !s.variantOf).map((s) => s.bulk ?? 1).sort((a, b) => a - b);
  const at = (q) => bulks[Math.floor((bulks.length - 1) * q)];
  const b = species.bulk ?? 1;
  if (b <= at(0.25)) return 'featherweight';
  if (b <= at(0.5)) return 'light';
  if (b <= at(0.75)) return 'middleweight';
  return 'heavy';
}

// The lines above the parts list: what this animal IS, and what four of its
// parts would buy you.
export function speciesLines(sp, content) {
  const all = Object.values(content.species);
  const cls = content.classes?.[sp.class];
  const lines = [];
  lines.push(`${cls ? `${cls.icon} ${cls.name}` : '◇ Unclassed'} · ${sp.role} · ${weightWord(sp, all)}`);
  if (sp.tags?.length) lines.push(`Tags: ${sp.tags.join(', ')}`);
  // The set bonus with what it DOES, not just its name. R34 made all 41
  // real; the Dex was still printing the name alone for variants and
  // nothing at all for the base roster.
  if (sp.setBonus) {
    // The threshold is read, not restated. physiology.js decides what counts
    // as purebred; a `4+` typed here would go on promising four long after
    // the engine wanted five.
    lines.push(
      `<strong>${sp.setBonus.name}</strong> — ${sp.setBonus.desc}, ` +
      `with ${PHYS_TUNING.purebredAt}+ ${sp.name} parts`
    );
  }
  lines.push(`Comfortable ${sp.thermal[0]}° to ${sp.thermal[1]}° · eats ${sp.diet.toLowerCase()}`);
  return lines;
}

// Its six parts, and whether you have met them. An undiscovered part still
// names its slot, because "you are missing a hide" is a lead and "???" is
// not.
export function speciesParts(sp, content, dexParts = []) {
  const SLOTS = ['head', 'forelimbs', 'hindlimbs', 'tail', 'hide', 'organ'];
  const mine = new Set(dexParts);
  const out = [];
  for (const slot of SLOTS) {
    const part = Object.values(content.parts).find((p) => p.species === sp.id && p.slot === slot);
    if (!part) continue;
    const found = mine.has(part.id);
    out.push({
      id: part.id,
      slot,
      found,
      label: found ? part.name : `${slot[0].toUpperCase()}${slot.slice(1)} — not yet extracted`,
      sub: found
        ? `${part.ability}${part.move?.power ? ` · ${part.move.power} power` : ''}${
            part.phys?.lift ? ` · ${part.phys.lift} lift` : ''
          } · ${part.phys.mass} mass`
        : 'graduate one of these and it lands in the vault',
    });
  }
  return out;
}
