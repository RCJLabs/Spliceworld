// R108 — THE VISITING SPECIMEN, which is the half of a card that is a game.
//
// A card that only draws is a screenshot. The point of R108 is that two
// people with no server between them can put their creatures in a room, so an
// accepted card becomes an exhibition: one fight, no purse, no notoriety, and
// nothing captured. See data/notes/cards.md.
//
// ONE VISITOR AT A TIME, and that is a bound rather than a convenience.
// R91's rule is that every list in the save has a ceiling somebody chose; a
// board of accepted cards would be an unbounded list fed by other people's
// files, which is the worst kind. The newest card replaces the last, the way
// a guest book has one page open.
//
// IT IS STORED AS A GENOME, NOT AS A UNIT. The stat block is derived on every
// read through the same `unitFromGenome` the rivals use, so a visitor cannot
// carry numbers a future balance pass would have changed — a saved stat block
// is a promise about a fight that the engine has stopped making.

import { visitingSpecimen, cardTuning, say, safeText } from '../splice/card.js';

// Take a card. Validation is the card module's, because the refusal sentences
// belong next to the format they are about; this adds the one rule that is
// about the SAVE rather than the file.
export function acceptCard(state, card, content, now = Date.now()) {
  const built = visitingSpecimen(card, content);
  if (!built.ok) return built;
  const limit = cardTuning(content).card.nameLimit;
  state.visiting = {
    // The genome, sanitised by `visitingSpecimen` on the way through.
    name: built.unit.name,
    frame: card.frame,
    tokens: Object.fromEntries(Object.entries(card.tokens).map(([socket, tok]) =>
      [socket, { partId: tok.partId, grade: tok.grade }])),
    // Whose lab it came from, for the row. Same treatment as the name.
    lab: safeText(card.lab, limit) || null,
    acceptedAt: now,
  };
  return { ok: true, name: built.unit.name, msg: say(content, 'accepted', { name: built.unit.name }) };
}

export function clearVisitor(state) {
  state.visiting = null;
}

// The exhibition, or null when nobody has handed you a card. Built fresh from
// the stored genome every time it is asked for — see the note above.
export function visitingEncounter(state, content) {
  const card = state?.visiting;
  if (!card) return null;
  const built = visitingSpecimen(card, content);
  // A visitor whose parts a later build retired stops being offerable rather
  // than throwing on the War Room's render. R79's rule.
  if (!built.ok) return null;
  const t = cardTuning(content);
  return {
    id: 'visiting_specimen',
    name: `${built.unit.name} — ${t.exhibition.title ?? 'Visiting Specimen'}`,
    blurb: card.lab
      ? say(content, 'blurb', { lab: card.lab })
      : say(content, 'blurbAnonymous'),
    // A friendly: nothing is won and nothing is taken. The exhibition exists
    // so two people can compare creatures, not so one of them farms the other.
    reward: 0,
    waves: [built.unit],
    tier: null,
    scaleOverride: null,
    exhibition: true,
  };
}
