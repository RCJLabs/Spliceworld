// Chaos-breeding: two finished chimeras into a vat, one genome out that
// neither of them was. Pure and DOM-free.
//
// Ranch breeding (ranch/breeding.js) pairs two ANIMALS of one species and
// produces a predictable hybrid of their stats. This is the other thing,
// and the design problem it has to solve is economic rather than genetic.
//
// A chimera costs vault tokens permanently, and — unlike livestock — it
// carries no upkeep. So an offspring bought with only money and time
// would be a duplication glitch: breed two, breed the two you got, and
// field an army you never paid for. The cost is therefore paid in
// GRADES, which is this game's real power currency. Both parents drop
// one grade on every token, permanently. A line gets weaker each
// generation unless you keep crossing fresh, well-raised stock back into
// it — which is precisely the ranch loop the whole game is built on.
//
// What makes it worth doing anyway: THE VAT DOES NOT READ YOUR PERMITS.
// It will hand you a socket layout your Surgery Theater is not licensed
// to build, a frame you do not own, and occasionally a part from neither
// parent — drawn from the Splice-Dex, so it is always something you have
// seen and never a gift from the end of the game.

import { rngStream, pick } from '../util/rng.js';
import { SOCKETS, slotOfSocket } from '../render/renderer.js';
import { GRADES, gradeIndexOf } from './extract.js';
import { analyze } from './physiology.js';
import { isSettled } from './theater.js';

const HOUR = 3600000;

const DEFAULTS = {
  gestationBaseHours: 3.75,
  gestationPerSocketHours: 1.12,
  feeBase: 90,
  feePerGradeStep: 55,
  exhaustionHours: 15,
  carryChance: 0.78,
  chaosChance: 0.16,
  frameChaosChance: 0.12,
  extraSocketChance: 0.18,
  gradeUpChance: 0.08,
  gradeDownChance: 0.22,
  extraInstability: 14,
  minSockets: 2,
};

export function chaosTuning(content) {
  return { ...DEFAULTS, ...(content.chaosMeta ?? {}) };
}

export function activeVat(state) {
  return state.vat ?? null;
}

export function vatRemainingMs(state, now) {
  return state.vat ? Math.max(0, state.vat.until - now) : 0;
}

export function isExhausted(chimera, now) {
  return now < (chimera?.exhaustedUntil ?? 0);
}

// How many grade steps this pair is about to give up. It is the fee, it is
// the cost, and it is the number the confirmation has to show.
export function gradeStepsOf(pair, content) {
  let steps = 0;
  for (const chimera of pair) {
    for (const token of Object.values(chimera?.tokens ?? {})) {
      if (gradeIndexOf(token.grade) > 0) steps += 1;
    }
  }
  return steps;
}

// Whether this pair can go in, and what it will cost. Everything the
// player needs in order to decide, before any of it happens (Law 4).
export function vatPlan(state, sireId, damId, content, now) {
  const t = chaosTuning(content);
  const a = state.chimeras.find((c) => c.id === sireId);
  const b = state.chimeras.find((c) => c.id === damId);
  if (!a || !b) return { ok: false, msg: 'Two chimeras required. The vat is not interested in one.' };
  if (a.id === b.id) return { ok: false, msg: 'It needs two DIFFERENT ones. This is the whole idea.' };
  if (activeVat(state)) return { ok: false, msg: 'The vat is occupied. It is a vat, not a facility.' };
  for (const c of [a, b]) {
    if (!isSettled(c, now)) return { ok: false, msg: `${c.name} has not settled yet. Do not put an unsettled chimera in a vat.` };
    if (isExhausted(c, now)) return { ok: false, msg: `${c.name} gave at the office. Let them recover.` };
    if (c.injury && now < c.injury.until) return { ok: false, msg: `${c.name} is in the Infirmary.` };
  }

  const sockets = new Set([...Object.keys(a.tokens), ...Object.keys(b.tokens)]);
  if (sockets.size < t.minSockets) {
    return { ok: false, msg: 'There is not enough anatomy between them to make anything at all.' };
  }
  const steps = gradeStepsOf([a, b], content);
  const fee = Math.round(t.feeBase + steps * t.feePerGradeStep);
  const hours = Math.round(t.gestationBaseHours + sockets.size * t.gestationPerSocketHours);
  return {
    ok: true,
    a,
    b,
    fee,
    hours,
    gradeSteps: steps,
    sockets: [...sockets],
    affordable: state.funds >= fee,
  };
}

// Everything the child could inherit, socket by socket, resolved by one
// seeded stream so a reload can never reroll a gestation.
function conceive(plan, state, content, rng, t) {
  const { a, b } = plan;
  const parts = {};
  const chaosParts = [];

  // The Splice-Dex is the wild-card pool on purpose: chaos can only ever
  // produce anatomy you have already SEEN. A vat that hands a day-one
  // player a shark spine is not chaotic, it is broken.
  const knownBySlot = {};
  for (const partId of state.dex.parts ?? []) {
    const part = content.parts[partId];
    if (!part) continue;
    (knownBySlot[part.slot] ??= []).push(partId);
  }

  for (const socketId of SOCKETS) {
    const fromA = a.tokens[socketId] ?? null;
    const fromB = b.tokens[socketId] ?? null;
    if (!fromA && !fromB) continue;

    let token = fromA && fromB ? (rng() < 0.5 ? fromA : fromB) : fromA ?? fromB;
    // A socket only one parent filled does not always carry over. This is
    // where a child ends up simpler than either parent, which is the
    // honest half of "chaos".
    if (!(fromA && fromB) && rng() >= t.carryChance) continue;

    let partId = token.partId;
    let grade = token.grade;
    const pool = knownBySlot[slotOfSocket(socketId)] ?? [];
    if (pool.length && rng() < t.chaosChance) {
      partId = pick(rng, pool);
      if (partId !== token.partId) chaosParts.push(partId);
    }
    // Hybrid vigour, and its opposite. Mostly the parent's grade.
    const roll = rng();
    let at = gradeIndexOf(grade);
    if (roll < t.gradeUpChance) at = Math.min(GRADES.length - 1, at + 1);
    else if (roll < t.gradeUpChance + t.gradeDownChance) at = Math.max(0, at - 1);
    grade = GRADES[at].id;

    parts[socketId] = { partId, grade, donor: token.donor };
  }

  // THE VAT DOES NOT READ YOUR PERMITS. This is the clause that makes the
  // whole feature more than recombination: it can install a socket
  // neither parent had and your Surgery Theater may not be licensed to
  // fill — a second organ bay before you own Tier II, say. Measured at
  // zero before this existed, because the union of two five-socket
  // parents is, inevitably, five sockets.
  const extraSockets = [];
  if (rng() < t.extraSocketChance) {
    const free = SOCKETS.filter((sid) => !parts[sid] && (knownBySlot[slotOfSocket(sid)] ?? []).length);
    if (free.length) {
      const socketId = pick(rng, free);
      const partId = pick(rng, knownBySlot[slotOfSocket(socketId)]);
      // Volunteered by nobody, so it arrives at the bottom of the ladder.
      parts[socketId] = { partId, grade: GRADES[0].id, donor: null };
      extraSockets.push(socketId);
    }
  }

  let frame = rng() < 0.5 ? a.frame : b.frame;
  const frames = Object.keys(content.frames ?? {});
  if (frames.length && rng() < t.frameChaosChance) frame = pick(rng, frames);

  // A9: a frame may have nowhere to bolt a given slot (the Kite has no
  // hindquarters). The vat is allowed to be a lunatic, not to violate
  // geometry — a part in a socket the chassis lacks would draw nowhere and
  // still pay its stats, which is a free limb rather than a joke.
  const slots = content.frames?.[frame]?.slots;
  if (slots) {
    for (const socketId of Object.keys(parts)) {
      if (!slots.includes(slotOfSocket(socketId))) delete parts[socketId];
    }
  }

  return { frame, parts, chaosParts, extraSockets: extraSockets.filter((sid) => parts[sid]) };
}

export function startVat(state, sireId, damId, content, now) {
  const t = chaosTuning(content);
  const plan = vatPlan(state, sireId, damId, content, now);
  if (!plan.ok) return { ok: false, msg: plan.msg };
  if (!plan.affordable) {
    return { ok: false, msg: `Short by $${Math.ceil(plan.fee - state.funds)}. The vat runs on electricity and denial.` };
  }

  state.vatCount = (state.vatCount ?? 0) + 1;
  const rng = rngStream(state.seed, 'vat', state.vatCount);
  const conception = conceive(plan, state, content, rng, t);
  if (!Object.keys(conception.parts).length) {
    // Vanishingly rare, but a gestation that produces nothing at all would
    // charge a player for a hole in the ground.
    return { ok: false, msg: 'Nothing took. Nothing was charged. Everyone agrees never to mention it.' };
  }

  state.funds -= plan.fee;
  // ORDER MATTERS, and it is deliberate: the child was conceived above,
  // from the parents as they were BEFORE they paid. So the offspring
  // comes out at roughly full strength and the two parents come out a
  // grade poorer — which is what makes the trade worth taking at all.
  // Degrade first and the child inherits the damage, the operation
  // becomes strictly destructive, and nobody would ever use the vat.
  // The accounting is still deflationary: a five-socket pair gives up ten
  // grade steps and returns five, so a line running on its own output
  // slides down the ladder generation by generation.
  for (const parent of [plan.a, plan.b]) {
    for (const token of Object.values(parent.tokens)) {
      token.grade = GRADES[Math.max(0, gradeIndexOf(token.grade) - 1)].id;
    }
    parent.exhaustedUntil = now + Math.round(t.exhaustionHours * HOUR);
  }

  state.vat = {
    parents: [plan.a.id, plan.b.id],
    parentNames: [plan.a.name, plan.b.name],
    startedAt: now,
    until: now + Math.round(plan.hours * HOUR),
    fee: plan.fee,
    // Sealed at conception: a reload must not be able to reroll it.
    conception,
  };
  return { ok: true, plan, vat: state.vat, msg: `The vat is sealed. ${plan.hours}h.` };
}

// Pulling the plug. The parents keep the grades they already gave up —
// that is not recoverable and the message says so — but nothing further
// is taken and the vat is free again.
export function cancelVat(state) {
  if (!state.vat) return { ok: false, msg: 'The vat is empty.' };
  const names = state.vat.parentNames.join(' and ');
  state.vat = null;
  return { ok: true, msg: `Vat drained. ${names} are already out a grade apiece and nobody is getting that back.` };
}

// Elapsed gestation, computed on load like every other timer. Returns the
// wire lines rather than pushing them, so this module never has to know
// what a news feed is.
export function tickVat(state, content, now) {
  const vat = state.vat;
  if (!vat || now < vat.until) return { news: [], child: null };
  const t = chaosTuning(content);
  state.vat = null;

  // R65: everything below is stamped with `vat.until`, when the vat actually
  // opened, not with the tick that noticed. A child decanted on Tuesday has
  // been settling since Tuesday; stamping it `now` restarted its settling
  // clock on the player's return and made a week's absence cost a day.
  const decantedAt = vat.until;
  const { frame, parts, chaosParts, extraSockets = [] } = vat.conception;
  const tokens = {};
  for (const [socketId, spec] of Object.entries(parts)) {
    if (!content.parts[spec.partId]) continue; // retired part id
    tokens[socketId] = {
      id: `t${state.inventory.tokenCount++}`,
      partId: spec.partId,
      grade: spec.grade,
      donor: spec.donor ?? { name: 'the vat', species: content.parts[spec.partId].species, stars: 3, extractedAt: decantedAt },
    };
    if (!state.dex.parts.includes(spec.partId)) state.dex.parts.push(spec.partId);
  }
  if (!Object.keys(tokens).length) return { news: [], child: null };

  const report = analyze(frame, Object.values(tokens), content);
  const rng = rngStream(state.seed, 'vat:name', state.vatCount ?? 0);
  const names = content.chaosNames ?? ['The Result'];
  const n = state.chimeraCount++;
  const child = {
    id: `c${n}`,
    name: pick(rng, names),
    frame,
    tokens,
    createdAt: decantedAt,
    settleUntil: decantedAt + report.settlingMs,
    // Whatever physiology already thinks of this mess, plus a little for
    // having been assembled by nobody.
    instability: Math.min(100, report.instability + t.extraInstability),
    bond: 0,
    temperament: null,
    injury: null,
    lastTrainedAt: 0,
    exhaustedUntil: 0,
    scars: [],
    injuryCount: 0,
    vatBorn: { parents: vat.parentNames, at: decantedAt, chaosParts, extraSockets },
  };
  state.chimeras.push(child);

  const lines = content.chaosLines ?? {};
  const fill = (s, vars) => (s ?? '').replace(/\{(\w+)\}/g, (whole, k) => (vars[k] != null ? String(vars[k]) : whole));
  const news = [];
  const decant = fill(lines.decant, {
    child: child.name,
    sockets: Object.keys(tokens).length,
    n: Object.keys(tokens).length - chaosParts.length,
  });
  if (decant) news.push(decant);
  if (chaosParts.length) {
    const line = fill(lines.chaos, { child: child.name, part: content.parts[chaosParts[0]]?.name ?? 'something' });
    if (line) news.push(line);
  }
  if (extraSockets.length) {
    const line = fill(lines.socket, { child: child.name, slot: slotOfSocket(extraSockets[0]) });
    if (line) news.push(line);
  }
  if (lines.news) news.push(lines.news);
  return { news, child, chaosParts, extraSockets };
}
