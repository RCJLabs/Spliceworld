// R169 — a chimera AFTER the Theater is done with it. DOM-free.
//
// Everything in here was in `splice/theater.js`, and moving it is the whole
// of R169's first paint saving. The Theater is 19.5 KB of machinery for
// MAKING a creature — validate a splice, assemble tokens onto a frame, roll
// a name, train a moveset. Three things in it are not about making one at
// all, and those three were the only things the rest of the game asked it
// for eagerly:
//
//   isSettled / settleRemainingMs   the settling clock, read by operations,
//                                   temperament, chaos and the statblock
//   TRAINING                        a price and a cooldown, read by the agenda
//   renameCreature                  a list edit, read by the Ranch
//
// Boot called exactly ONE of them — `isSettled`, 73 bytes of it — and paid
// 19.5 KB to have it. The rest of the Theater ran nothing at all on either
// first paint. That is not an import worth keeping: it is R153's shape, the
// same one that took `campaign/director.js` out of the eager graph by moving
// seven lines that read nothing from it.
//
// The Theater imports TRAINING back from here rather than keeping a second
// copy — R157's break 152 is the rule that one constant has one home however
// many modules read it.

// The settling clock. A chimera comes out of the vat disoriented and is not
// yours to send anywhere until it is over; every system that asks "can this
// one work yet" asks here.
// R114 — the one cleaner. `renameCreature` below was the FIRST of three
// copies of the strip rule; util/text.js is the only one now.
import { safeText } from '../util/text.js';

export function isSettled(chimera, now) {
  return now >= chimera.settleUntil;
}

export function settleRemainingMs(chimera, now) {
  return Math.max(0, chimera.settleUntil - now);
}

// Training (M7 obedience UX): bond is earned, not assigned (§3.5). The price
// and the cooldown live here because the agenda quotes both on a screen that
// never splices anything; `trainChimera` itself is Theater work and stays
// there.
export const TRAINING = { cost: 5, bondGain: 8, cooldownHours: 15 };

// R41: a creature you keep for a whole campaign is a creature you get to
// name. Free, instant, and sanitised rather than escaped-at-forty-callsites:
// names are interpolated into markup all over the game, so the honest fix is
// to never store markup in one.
export function renameCreature(list, id, rawName) {
  const target = (list ?? []).find((c) => c.id === id);
  if (!target) return { ok: false, msg: 'No such creature.' };
  const name = safeText(rawName, 24);
  if (!name) return { ok: false, msg: 'A name needs at least one printable character. House rules.' };
  const old = target.name;
  target.name = name;
  return { ok: true, msg: `${old} is now ${name}. The paperwork has been amended and partially eaten.`, name };
}
