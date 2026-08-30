// What a move button says before you press it (R28). DOM-free on purpose:
// the numbers are what the acceptance criterion is about, so they get tested
// directly in smoke rather than scraped out of rendered HTML.
//
// The button used to show `move.power` — the raw data value. That is not the
// number that lands. Armor, power stages, scars, perks, guard, Frenzy, Rage
// and Multi-Hit all sit between the two, and a 52-power swing into 22 armor
// is not a 52. previewMove already computes the honest figure for the AI
// (R22); this is the same call, so the player and the opposition are reading
// the same board.
import { previewMove } from './engine.js';
import { classMultiplier } from './engine.js';

// Split, not merged. The old chip multiplied class and tag together and
// printed one number, so "×1.5" never said whether it was the triangle or
// the chart — which is the half a new player is trying to learn.
export function moveReadout(move, me, foe, content) {
  const p = previewMove(me, foe, move, content);
  const cls = classMultiplier(me.creatureClass, foe.creatureClass, content);
  const tag = p.tagMult;
  const chips = [];

  if (move.power > 0) {
    if (p.immune || tag === 0) {
      chips.push(['null', 'no effect']);
    } else {
      if (cls > 1) chips.push(['up', `${content.classes[me.creatureClass].name} ▸`]);
      else if (cls < 1) chips.push(['down', `◂ ${content.classes[foe.creatureClass].name}`]);
      if (tag > 1) chips.push(['up', `×${tag % 1 ? tag.toFixed(1) : tag} tag`]);
      else if (tag < 1) chips.push(['down', `×${tag.toFixed(1)} tag`]);
    }
  }
  if (p.tagMult !== 0 && (move.keywords?.ignoreArmor)) chips.push(['up', 'armor ✗']);
  if (move.keywords?.priority) chips.push(['fast', '⚡']);
  if (move.keywords?.charge) chips.push(['slow', '2-turn']);
  if (move.keywords?.multiHit) chips.push(['up', `×${move.keywords.multiHit} hits`]);

  return {
    // Expected damage, rounded, or null for a utility move.
    damage: move.power > 0 && !p.immune ? Math.round(p.damage) : null,
    hitChance: Math.round(p.hitChance * 100),
    lethal: p.lethal && !p.immune,
    immune: p.immune || (move.power > 0 && tag === 0),
    classMult: cls,
    tagMult: tag,
    chips,
  };
}
