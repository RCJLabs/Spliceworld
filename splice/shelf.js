// R182 — THE VAULT'S WAY OUT WHEN THE SHELF HAS NOTHING TO SPARE.
//
// R91 made shelf space a decision: a graduation is refused when its yield
// will not fit, and the refusal sent the player to render something down or
// buy more shelf. Both halves could be unavailable at once. `surplusParts`
// spares one of every anatomy and anything carrying a gene, and the Extractor
// stops selling shelf at its last level, so a very good campaign could end on
// a full shelf with a button that had nothing to offer. Seed 4242 sat there
// from day 157 to the end of its 180, refusing every graduation.
//
// The answer is a CHOICE rather than a bigger number: any part can be
// rendered down by hand, from its own row on the Vault. This module is the
// judgement the screen and the walker share — which parts the shelf would
// miss least, and whether any shelf is still for sale — and it is lazy,
// because nothing on the first frame asks either question.
import { renderOrder, vaultCapacity } from './vault.js';
import { nextUpgrade } from './facility.js';

// Worst grade first, the order the door already renders in, but over the
// whole shelf: singletons and gene-carriers included. The Dex keeps every
// anatomy the player has held (`admitParts` records it on the way in), so
// rendering the last token of one loses the token and never the record.
// Only parts the catalogue still knows: a row has to name what it renders
// (R72's rule for a retired part), and the walker takes the same list.
export function leastMissed(state, content, want = 1) {
  return renderOrder(state, state.inventory.parts.filter((t) => content.parts?.[t.partId])).slice(0, want);
}

// The next level of whichever track sells more shelf than the vault holds
// now, or null. Found by grant rather than by track id, for the reason the
// walker's R116 note gives: the refusal is about shelf space, whichever
// track happens to sell it.
export function shelfForSale(state, content) {
  const cap = vaultCapacity(state, content).parts;
  for (const id of Object.keys(content.facility ?? {})) {
    const next = nextUpgrade(state, content, id);
    if ((next?.level?.grants?.vaultParts ?? 0) > cap) return { track: id, ...next };
  }
  return null;
}
