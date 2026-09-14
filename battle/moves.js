// Movesets (R30). DOM-free: the battle screen, the pens screen, the balance
// harness and the smoke suite all read the same rules.
//
// WHY THIS EXISTS. Anatomy handed a chimera one move per part plus every
// combo it unlocked — six or seven buttons, of which 41% of the roster's 271
// moves are power-0 utility. The battle screen could not fit them, so since
// R28 it has shown THREE and a "More moves" button: a four-slot grid
// apologising for a creature that did not have four moves. And a utility
// move rendered as the word "util" and nothing else, so "Nub Wiggle · 10⚡"
// never once told anybody it raises evasion.
//
// So the cap is real now. Four slots, combos included — a combo is a strong
// move you CHOOSE to carry, which is what makes discovering one a question
// rather than a free button. What a chimera knows comes from its genome;
// which four it can use is a decision you retrain.

export const MOVE_SLOTS = 4;

// Identity is WHERE A MOVE CAME FROM, never what it currently does. Grade
// sharpens power and a trait can change keywords, so keying a saved moveset
// on stats would make a chimera forget its own moves the moment you
// upgraded a part.
export const partMoveId = (partId) => `p:${partId}`;
export const comboMoveId = (comboId) => `c:${comboId}`;

// Every move this genome grants, in a stable order. `movesFromTokens` is the
// single definition of what anatomy produces (rivals are built by the same
// call), so this asks it rather than reimplementing the rules.
export function knownMoves(chimera, content, movesFrom) {
  return movesFrom(chimera).map((m) => ({ ...m, id: m.source }));
}

// The four it actually fights with. A saved moveset is filtered against what
// the genome still grants, because a part can leave: re-splicing, a scar, a
// grade change. Anything missing is topped up from the default pick, so a
// chimera is never left holding three buttons or none.
export function activeMoves(known, moveset) {
  const byId = new Map(known.map((m) => [m.id ?? m.source, m]));
  const picked = [];
  for (const id of moveset ?? []) {
    const m = byId.get(id);
    if (m && !picked.includes(m)) picked.push(m);
  }
  if (picked.length < MOVE_SLOTS) {
    for (const m of defaultPick(known)) {
      if (picked.length >= MOVE_SLOTS) break;
      if (!picked.includes(m)) picked.push(m);
    }
  }
  return picked.slice(0, MOVE_SLOTS);
}

// What a creature comes out of the vat knowing how to press, and what a
// pre-R30 save is migrated to. Not "the four biggest numbers": a build with
// four attacks and no answer to armour is worse than one that kept its
// Sonic. So it takes the best of each attack TAG first, then the best
// remaining attack, and leaves one slot for the most useful utility move.
export function defaultPick(known) {
  const attacks = known.filter((m) => m.power > 0).sort((a, b) => b.power - a.power);
  const utils = known.filter((m) => m.power === 0);

  // One attack per TAG, strongest first. The tag is the tag chart, so a move
  // carrying one nobody else carries is this build's whole answer to a row
  // of it — dropping the Gas move because it is the weakest number turns a
  // Gas build into a worse version of a generic one.
  //
  // What this deliberately does NOT do is then fill the rest with attacks.
  // Two moves sharing a tag are the same swing at a different number, and
  // measured on a pure tortoise (three untagged attacks, three actives)
  // filling with attacks scores 0% against patrol_2 where keeping the
  // actives scores 78%, against 87% for all six moves at once. The first
  // heal is worth more than the third identical swing.
  const picked = [];
  const seenTag = new Set();
  for (const m of attacks) {
    const tag = (m.tags ?? []).join(',');
    if (seenTag.has(tag)) continue;
    seenTag.add(tag);
    picked.push(m);
    if (picked.length >= MOVE_SLOTS - 1) break; // always leave room for one active
  }

  // Then the utility actually worth carrying — a heal or a guard before a
  // third evasion buff — and only then more of the same-tag attacks.
  const UTILITY_RANK = ['heal', 'regen', 'guard', 'thorns', 'staminaRestore', 'rally', 'powerUp', 'accUp', 'evasionUp'];
  for (const m of utils.slice().sort((a, b) => rankOf(b, UTILITY_RANK) - rankOf(a, UTILITY_RANK))) {
    if (picked.length >= MOVE_SLOTS) break;
    picked.push(m);
  }
  for (const m of [...attacks, ...utils]) {
    if (picked.length >= MOVE_SLOTS) break;
    if (!picked.includes(m)) picked.push(m);
  }
  return picked.slice(0, MOVE_SLOTS);
}

const rankOf = (move, order) => {
  let best = -1;
  for (const k of Object.keys(move.keywords ?? {})) {
    const i = order.indexOf(k);
    if (i >= 0) best = Math.max(best, order.length - i);
  }
  return best;
};

export function defaultMoveset(known) {
  return defaultPick(known).map((m) => m.id);
}

// --- What a move actually does -----------------------------------------

