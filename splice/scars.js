// Injury scarring (ROADMAP §3.5: "untreated injuries can scar into
// permanent trait tradeoffs"). Pure and DOM-free.
//
// A battle injury has always opened an Infirmary timer and then quietly
// expired. Now there is something to do about it, and a consequence for
// not doing it: treat the injury and it clears clean, ignore it and it
// may set badly and stay set.
//
// EVERY SCAR IS TWO-SIDED, and that is the whole design. A scar is
// character rather than a punishment, so a player who was asleep through
// the treatment window gets something interesting rather than something
// ruinous — and because some scars are net GOOD for a given build,
// "leave it and see what happens" is a real strategy rather than a
// mistake. The Infirmary sells certainty, not power.

import { rngStream, pick } from '../util/rng.js';
import { infirmaryGrants } from './facility.js';
import { attend } from './feral.js';
import { rushPrice } from './rush.js';

const HOUR = 3600000;

const DEFAULTS = { scarChance: 0.34, maxScars: 3 };

export function scarTuning(content) {
  return { ...DEFAULTS, ...(content.scarMeta ?? {}) };
}

export function scarList(content) {
  return Object.values(content.scars ?? {});
}

export function scarsOf(chimera, content) {
  return (chimera?.scars ?? []).map((id) => content.scars?.[id]).filter(Boolean);
}

// What a scarred creature is worth in flat stats — applied once, when the
// combatant is built.
export function flatModifiers(chimera, content) {
  const out = { speed: 0, regen: 0 };
  for (const scar of scarsOf(chimera, content)) {
    if (scar.vs) continue; // conditional scars are resolved per opponent
    out.speed += scar.effects.speed ?? 0;
    out.regen += scar.effects.regen ?? 0;
  }
  return out;
}

// The rest, kept as a list the engine can consult once it knows who is on
// the other side. An unconditional scar simply matches everyone.
export function scarEffects(chimera, content) {
  return scarsOf(chimera, content).map((scar) => ({
    id: scar.id,
    tags: scar.vs ?? null,
    acc: scar.effects.acc ?? 0,
    evasion: scar.effects.evasion ?? 0,
    power: scar.effects.power ?? 0,
    armor: scar.effects.armor ?? 0,
  }));
}

// Summed effects against a particular opponent. This is where "fears
// jeeps" becomes a number.
export function againstTags(effects, opponentTags) {
  const out = { acc: 0, evasion: 0, power: 0, armor: 0 };
  for (const e of effects ?? []) {
    if (e.tags && !e.tags.some((tag) => (opponentTags ?? []).includes(tag))) continue;
    out.acc += e.acc;
    out.evasion += e.evasion;
    out.power += e.power;
    out.armor += e.armor;
  }
  return out;
}

export function describeScar(scar, chimeraName) {
  const bits = [];
  const pct = (n) => `${n > 0 ? '+' : ''}${Math.round(n * 100)}%`;
  const pts = (n) => `${n > 0 ? '+' : ''}${n}`;
  if (scar.effects.acc) bits.push(`${pts(scar.effects.acc)} accuracy`);
  if (scar.effects.evasion) bits.push(`${pct(scar.effects.evasion)} evasion`);
  if (scar.effects.power) bits.push(`${pct(scar.effects.power)} damage`);
  if (scar.effects.armor) bits.push(`${pct(scar.effects.armor)} armour`);
  if (scar.effects.speed) bits.push(`${pts(scar.effects.speed)} speed`);
  if (scar.effects.regen) bits.push(`${pts(scar.effects.regen)} regen`);
  const scope = scar.vs ? ` vs ${scar.vs.join('/')}` : '';
  return {
    id: scar.id,
    name: scar.name,
    line: (scar.line ?? '').replace(/\{name\}/g, chimeraName ?? 'It'),
    summary: `${bits.join(', ')}${scope}`,
  };
}

// --- Treatment ------------------------------------------------------------

// The bill scales with how much of the injury is left, so an early visit
// costs more than sweeping up at the end. The Infirmary is selling
// CERTAINTY, not healing: what you are buying is the guarantee that it
// does not set badly.
// `state` is optional so a preview built without a save still prices an
// injury the way the game always did.
export function treatmentCost(chimera, content, now, state = null) {
  if (!chimera?.injury) return 0;
  const scale = state ? infirmaryGrants(state, content).treatScale : 1;
  // R86: the Infirmary's price IS the rush price — a call-out plus the hours
  // left — and it lives in splice/rush.js now, where the four other clocks
  // you can pay to hurry read the same two numbers. One rule, one place.
  return rushPrice(chimera.injury.until - now, content, scale);
}

export function treatInjury(state, chimeraId, content, now) {
  const chimera = state.chimeras.find((c) => c.id === chimeraId);
  if (!chimera) return { ok: false, msg: 'No such chimera.' };
  if (!chimera.injury) return { ok: false, msg: 'Nothing to treat. They are simply like that.' };
  if (now >= chimera.injury.until) {
    return { ok: false, msg: 'Too late — that one has already healed, one way or the other.' };
  }
  const cost = treatmentCost(chimera, content, now, state);
  if (state.funds < cost) return { ok: false, msg: `Short by $${Math.ceil(cost - state.funds)}. The Infirmary does not take promises.` };

  state.funds -= cost;
  const name = chimera.injury.name;
  chimera.injury = null;
  attend(chimera, now); // R85: paying the Infirmary bill is paying attention
  chimera.injuriesTreated = (chimera.injuriesTreated ?? 0) + 1;
  return { ok: true, cost, msg: `${chimera.name} is patched up properly. ${name} will leave no trace, which is the expensive option.` };
}

// --- Setting badly --------------------------------------------------------

// Resolved on every tick. An injury that runs its course unattended may
// set into something permanent — seeded, so the same save always produces
// the same creature, and capped so a long career does not bury a chimera
// under ten of them.
export function tickScars(state, content, now) {
  const t = scarTuning(content);
  const pool = scarList(content);
  const news = [];
  const scarred = [];
  for (const chimera of state.chimeras ?? []) {
    if (!chimera.injury || now < chimera.injury.until) continue;
    const injury = chimera.injury;
    chimera.injury = null;
    chimera.scars ??= [];
    if (!pool.length || chimera.scars.length >= t.maxScars) continue;

    // R65: the tally is advanced where the injury is INFLICTED
    // (battle/engine.js applyInjury), so one number means one thing —
    // how many injuries this creature has taken — and both the name roll
    // and this scar roll key off it in their own namespaces.
    const rng = rngStream(state.seed, `scar:${chimera.id}`, chimera.injuryCount ?? 0);
    // A Regenerative Suite does not stop an untreated injury setting badly,
    // it makes it rarer. Treatment is still the only guarantee — the
    // Infirmary sells certainty, and a track that sold certainty for free
    // would retire the decision this whole system exists to pose.
    if (rng() >= t.scarChance * infirmaryGrants(state, content).scarChanceScale) continue;
    // Never the same scar twice on one creature.
    const available = pool.filter((s) => !chimera.scars.includes(s.id));
    if (!available.length) continue;
    const scar = pick(rng, available);
    chimera.scars.push(scar.id);
    scarred.push({ chimera, scar, injury: injury.name });
    news.push(describeScar(scar, chimera.name).line);
  }
  return { news, scarred };
}
