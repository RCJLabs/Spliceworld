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
import { rivalList, rivalRecord } from '../campaign/rivals.js';
import { renderIcon } from '../ui/icons.js';
import { gauntletStages } from '../campaign/gauntlet.js';

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
  lines.push(`${cls ? `${renderIcon(cls.icon)} ${cls.name}` : '◇ Unclassed'} · ${sp.role} · ${weightWord(sp, all)}`);
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

// R51 — "have I beaten this" has TWO live records, so it gets one predicate.
// `dex.beaten` is stamped from v34 forward. `gauntletBeaten` has held the
// Gauntlet's four exhibitions since R42, which is why a save that cleared
// them before v34 keeps its trophies without the migration inventing a
// single thing: an exhibition you beat means the boss AND its escorts went
// down, and that is derivable rather than guessable.
//
// Read through gauntletStages() rather than content.gauntlet, because where
// the stage list lives is that module's business — R49's lesson about the
// spar predicate, applied before the second reader exists rather than after.
export function beatenUnits(state, content) {
  const out = new Set(state.dex?.beaten ?? []);
  const cleared = new Set(state.gauntletBeaten ?? []);
  for (const stage of gauntletStages(content)) {
    if (!cleared.has(stage.id)) continue;
    out.add(stage.unitId);
    for (const escort of stage.escorts ?? []) out.add(escort);
  }
  return out;
}

// R45 — the Dex is going behind tabs, and completion is the one thing that
// must not go with it: "how much of this have I found" is why the screen
// exists. Derived here rather than in the view so the harness can assert
// the counts without a DOM, and so the strip above the tab bar and any
// per-tab badge read the same numbers.
//
// Salvage is its own row and not folded into parts: those eight are gated
// behind the Containment Cannon, so a player without one has not FAILED to
// find them — that column is not open to them yet, and a completion figure
// that says otherwise is lying about the game.
export function dexProgress(state, content) {
  const dex = state.dex ?? {};
  const parts = dex.parts ?? [];
  const base = Object.values(content.species).filter((sp) => !sp.synthetic && !sp.variantOf);
  const variants = Object.values(content.species).filter((sp) => sp.variantOf);
  const organicParts = Object.values(content.parts).filter((p) => p.species !== 'salvage');
  const salvageParts = Object.values(content.parts).filter((p) => p.species === 'salvage');
  const rivals = rivalList(content);
  // Through rivalRecord, not state.campaign.rivals directly: where the
  // record lives is that module's business, and a second opinion about it
  // here is how the Dex ends up disagreeing with the War Room.
  const metRival = (r) => {
    const rec = rivalRecord(state, r.id);
    return rec.defeats > 0 || rec.losses > 0 || rec.lastMetAt != null;
  };

  const rows = [
    { id: 'species', tab: 'roster', label: 'Species', found: base.filter((sp) => parts.some((p) => content.parts[p]?.species === sp.id)).length, total: base.length },
    { id: 'parts', tab: 'roster', label: 'Parts', found: parts.filter((p) => content.parts[p] && content.parts[p].species !== 'salvage').length, total: organicParts.length },
    { id: 'salvage', tab: 'roster', label: 'Salvage', found: parts.filter((p) => content.parts[p]?.species === 'salvage').length, total: salvageParts.length },
    { id: 'variants', tab: 'variants', label: 'Variants', found: (dex.variants ?? []).length, total: variants.length },
    { id: 'combos', tab: 'combos', label: 'Combos', found: (state.discoveredCombos ?? []).length, total: Object.keys(content.combos).length },
    { id: 'traits', tab: 'genes', label: 'Genes', found: (dex.traits ?? []).length, total: Object.keys(content.traits).length },
    { id: 'rivals', tab: 'foes', label: 'Rivals', found: rivals.filter(metRival).length, total: rivals.length },
    { id: 'enemies', tab: 'foes', label: 'Foes', found: (dex.enemies ?? []).length, total: Object.keys(content.enemies).length },
  ];

  const found = rows.reduce((n, r) => n + Math.min(r.found, r.total), 0);
  const total = rows.reduce((n, r) => n + r.total, 0);
  // Per-tab completion, so a tab can say "done" without the view recounting.
  const byTab = {};
  for (const r of rows) {
    const t = (byTab[r.tab] ??= { found: 0, total: 0 });
    t.found += Math.min(r.found, r.total);
    t.total += r.total;
  }
  for (const t of Object.values(byTab)) t.complete = t.total > 0 && t.found >= t.total;
  return { rows, found, total, pct: total ? Math.round((found / total) * 100) : 0, byTab };
}
