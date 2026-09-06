// R86 — PAYING A CLOCK TO HURRY (ROADMAP §3.9).
//
// §3.9 promised since M0 that every timer is skippable with an EARNED
// currency — a second economy, no real money. Measured before building,
// the premise was wrong twice over. "No timer is skippable at any price" — the Infirmary is, for
// $25 + $18 an hour, and the vat can be drained. "Load-bearing for the TWA
// pitch" — docs/TWA.md does not mention a skip, a currency or a purchase.
// And the pacing problem it was designed for does not show up: the 180-day
// walker's longest stretch with nothing productive to do is ZERO hours, and
// its stable is 64% free in week one and 82% after, the biggest "wait" being
// the fifteen-hour training cooldown — which is not a wait at all, it is
// where bond comes from.
//
// So R86 shipped the model the game already had rather than a second
// economy: THE INFIRMARY'S PRICE, APPLIED TO EVERY PURE WAIT. And "pure
// wait" has a definition the engine itself supplies. Four clocks in this
// game are SEALED when they start — the vat ("a reload must not be able to
// reroll it"), the resequencer ("every die is thrown here, and tick only
// reads the answer"), an egg (genotype, potential and sex fixed when it is
// laid) and a settling chimera (its temperament comes from the world seed,
// not from how long it sat). During each of them nothing is being decided;
// the answer is already in the save and the player is waiting to read it.
// Those four are for sale, by the hour, and a rush can only ever buy time —
// never a different creature. Smoke proves that literally: a rushed vat and
// a waited vat decant the same child.
//
// Everything else is not for sale, and the refusal is a rule rather than an
// omission. A training or care cooldown IS husbandry — Law 3 says bond and
// grade come from showing up, and a cooldown you can buy is bond you can
// buy. Growth IS the animal. A rehab programme IS its curriculum. A job IS
// its duration. And the world's own clocks — convoys, dissections, the
// agitation window, a breakout — are threats, not waits.
//
// Injury is the one clock that is neither: the scar is rolled when it HEALS
// and treatment changes that outcome, which is why `treatInjury` keeps its
// own meaning and only lends its price. The formula lives here now and the
// Infirmary reads it, so "priced like the Infirmary" is one rule in one
// place rather than two numbers that agree until somebody retunes one.
//
// DOM-free: the walker rushes through the same function the buttons do.

import { speciesOf } from '../data/catalog.js';
import { attend } from './feral.js';
import { renderIcon } from '../ui/icons.js';

const HOUR = 3600000;
const DEFAULTS = { base: 25, perHour: 18 };

export function rushTuning(content) {
  return { ...DEFAULTS, ...(content.rushMeta ?? {}) };
}

export function rushLines(content) {
  return content.rushKinds ?? {};
}

// The price of not waiting: a flat call-out plus the hours left. `scale` is
// the Infirmary's facility discount; nothing else has one, because the other
// three clocks are already shortened at the source by their own tracks.
export function rushPrice(msLeft, content, scale = 1) {
  const t = rushTuning(content);
  const hoursLeft = Math.max(0, msLeft) / HOUR;
  return Math.round((t.base + hoursLeft * t.perHour) * scale);
}

// THE REGISTRY. A kind is here because its outcome is sealed before its
// clock starts — see the header — and smoke holds this set to exactly these
// four. Each entry finds its target, reads its clock and moves it. Nothing
// here RESOLVES anything: every one of these already has a resolver that
// stamps its output with the clock it read (R65), so moving the clock to
// `now` is precisely "it ended now", and the next tick does the rest.
const RUSHABLE = {
  settle: {
    list: (state) => (state.chimeras ?? []).map((c) => c.id),
    find: (state, id) => (state.chimeras ?? []).find((c) => c.id === id) ?? null,
    name: (target) => target.name,
    until: (target) => target.settleUntil ?? 0,
    set: (target, now) => {
      target.settleUntil = now;
      // R85: paying for a creature's peace and quiet is paying attention to
      // it, the same way paying its Infirmary bill is.
      attend(target, now);
    },
  },
  vat: {
    list: (state) => (state.vat ? ['vat'] : []),
    find: (state) => state.vat ?? null,
    name: (target) => target.parentNames?.join(' × ') ?? 'the vat',
    until: (target) => target.until ?? 0,
    set: (target, now) => { target.until = now; },
  },
  resequencer: {
    list: (state) => (state.resequencer ? ['resequencer'] : []),
    find: (state) => state.resequencer ?? null,
    name: (target) => target.donorName ?? 'the sample',
    until: (target) => target.until ?? 0,
    set: (target, now) => { target.until = now; },
  },
  egg: {
    list: (state) => (state.ranch?.eggs ?? []).map((e) => e.id),
    find: (state, id) => (state.ranch?.eggs ?? []).find((e) => e.id === id) ?? null,
    name: (target, content) => `the ${speciesOf(content, target.species)?.name ?? target.species} egg`,
    until: (target) => target.hatchAt ?? 0,
    set: (target, now) => { target.hatchAt = now; },
  },
};

export const RUSH_KINDS = Object.freeze(Object.keys(RUSHABLE));

// One clock, priced. Null when nothing is running under that id.
export function rushQuote(state, kind, id, content, now) {
  const def = RUSHABLE[kind];
  if (!def) return null;
  const target = def.find(state, id);
  if (!target) return null;
  const msLeft = Math.max(0, def.until(target) - now);
  const price = rushPrice(msLeft, content);
  return { kind, id, name: def.name(target, content), msLeft, price, affordable: (state.funds ?? 0) >= price };
}

// Everything the player could pay to hurry right now, soonest first.
export function rushable(state, content, now) {
  const out = [];
  for (const [kind, def] of Object.entries(RUSHABLE)) {
    for (const id of def.list(state)) {
      const q = rushQuote(state, kind, id, content, now);
      if (q && q.msLeft > 0) out.push(q);
    }
  }
  return out.sort((a, b) => a.msLeft - b.msLeft);
}

export function rush(state, kind, id, content, now) {
  const lines = rushLines(content);
  const def = RUSHABLE[kind];
  if (!def) return { ok: false, msg: lines.refusal ?? 'That clock is not for sale.' };
  const target = def.find(state, id);
  if (!target) return { ok: false, msg: 'Nothing is running there.' };
  const msLeft = def.until(target) - now;
  if (msLeft <= 0) return { ok: false, msg: 'That one has already finished. Patience was free.' };
  const price = rushPrice(msLeft, content);
  if ((state.funds ?? 0) < price) {
    return { ok: false, msg: `Short by $${Math.ceil(price - state.funds)}. Time is the one thing here that does not take promises.` };
  }
  state.funds -= price;
  def.set(target, now);
  state.rushCount = (state.rushCount ?? 0) + 1;
  const name = def.name(target, content);
  const msg = (lines[kind]?.line ?? '{name} hurried along for ${price}.')
    .replace('{name}', name)
    .replace('{price}', String(price));
  return { ok: true, cost: price, kind, id, msg };
}

// --- the button, and the one binder every screen shares --------------------
//
// A string rather than a node, like every other card in this codebase, and
// `data-rush="kind:id"` as one attribute rather than two so the handler gate
// (R76) sees one control that carries its parameter, not a control and a
// sibling it has to correlate.
export function rushButton(quote) {
  if (!quote || quote.msLeft <= 0) return '';
  const short = !quote.affordable;
  const title = short
    ? `Short by $${Math.ceil(quote.price - 0)} — the rest of the wait is free`
    : 'Pay for the rest of the wait. Same answer, sooner.';
  return `<button type="button" class="care-train rush-btn" data-rush="${quote.kind}:${quote.id}"${
    short ? ' disabled' : ''} title="${title}">${renderIcon('lightning')} Hurry ($${quote.price})</button>`;
}

export function bindRush(root, ctx, onMsg, redraw) {
  root.querySelectorAll('button[data-rush]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [kind, id] = String(btn.dataset.rush).split(':');
      const res = rush(ctx.state, kind, id, ctx.content, ctx.now());
      onMsg?.(res.msg);
      if (res.ok) ctx.save();
      // The shell's tick is what decants a rushed vat or empties a rushed
      // tank, and it repaints when it is done; a headless caller has no
      // tick and just needs the repaint.
      if (res.ok && ctx.tick) ctx.tick();
      else redraw();
    });
  });
}
