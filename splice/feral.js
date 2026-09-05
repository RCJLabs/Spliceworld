// R85 — THE TOP OF THE INSTABILITY SCALE (ROADMAP §3.4).
//
// Designed since M0 and unshipped until now. Measured before building:
// instability cost a longer settle, an obedience penalty and upkeep, and at
// 100 it cost exactly those and nothing more. Worse, the obedience penalty is
// `instability/100 × 0.2` minus `bond/100 × 0.2` — so a trained creature at
// instability 100 has a 0% ignore chance. The whole price of the top of the
// scale was a one-time three-hour settle and $8/day.
//
// WHY THE TRIGGER IS NEGLECT AND NOT ANATOMY. A six-species chimera — the
// bear-headed, eagle-winged goat this game exists to let you build — scores
// 90 instability, and every chimera is spliced at bond 0. A snapshot trigger
// on "unstable and unbonded" would therefore send the game's own premise to
// Containment the moment it was made, which is not a mechanic, it is a
// punishment for playing. So what tips a creature over is being LEFT ALONE:
// unstable, unbonded, and nobody has worked with it in three days.
//
// AND WHY THERE IS A WINDOW. R9 established the shape and the reason: a
// scheduled deadline the player can SEE and answer, never a per-tick roll,
// so how often you open the app cannot change what happens to your creatures.
// An agitated chimera is a countdown on the Pens with an obvious answer —
// train it, fight with it, treat it — and only a missed window is a loss.
// Two chances before anything is taken, and even then it is recoverable
// through R8's Reorientation Wing, which has been shipped and idle for
// exactly this since.
//
// Law 3 holds: care fixes it. Zero death language: the creature has not gone
// anywhere, it is simply no longer taking your calls.
//
// DOM-free and timestamp-driven, so the balance harness and the smoke suite
// score it with the same code the Pens renders from.

const HOUR = 3600000;

export function feralTuning(content) {
  return {
    instabilityAt: 100,
    bondFloor: 40,
    neglectHours: 72,
    windowHours: 24,
    ...(content.feralMeta ?? {}),
  };
}

export function feralLines(content) {
  return content.feralLines ?? {};
}

// When was this creature last given any attention at all? `lastAttendedAt`
// is stamped wherever the player does something WITH a chimera rather than
// to the world — training, retraining, a fight, a rescue, a treatment. It is
// seeded to `createdAt` for a fresh splice and by the v39 migration for a
// creature that predates the field, so nobody's roster is retroactively
// neglected by an update.
export function lastAttended(chimera) {
  return Math.max(chimera.lastAttendedAt ?? 0, chimera.createdAt ?? 0, chimera.lastTrainedAt ?? 0);
}

// Everything the UI needs to explain itself, in one place, so the Pens and
// the agenda cannot disagree about whether a creature is in trouble.
export function feralStatus(chimera, content, now) {
  const t = feralTuning(content);
  const unstable = (chimera.instability ?? 0) >= t.instabilityAt;
  const unbonded = (chimera.bond ?? 0) < t.bondFloor;
  const aloneMs = now - lastAttended(chimera);
  const neglected = aloneMs >= t.neglectHours * HOUR;
  const atRisk = unstable && unbonded && neglected;

  const agitatedAt = chimera.agitatedAt ?? null;
  const deadline = agitatedAt ? agitatedAt + t.windowHours * HOUR : null;
  return {
    // The three conditions, reported separately, because "why is this
    // happening" is the question the panel has to answer.
    unstable,
    unbonded,
    neglected,
    atRisk,
    agitated: !!agitatedAt,
    deadline,
    remainingMs: deadline ? Math.max(0, deadline - now) : null,
    // What ends it. Bonding is the durable answer and attention is the
    // immediate one; either clears the agitation.
    bondNeeded: Math.max(0, t.bondFloor - (chimera.bond ?? 0)),
  };
}

// Anything the player does WITH a creature counts as attending to it.
//
// This stamps and nothing else: `tickFeral` owns `agitatedAt`, start to
// finish. Clearing the flag here as well would have been one line shorter
// and would have made the "talked round" line unreachable — the tick would
// arrive to find nothing to announce, and R10's rule is that prose with no
// caller is prose nobody ever sees. The player is not kept waiting for it
// either: `feralStatus` recomputes `atRisk` from this stamp, so the warning
// leaves the card the instant they act, and the tick tidies up behind them.
export function attend(chimera, now) {
  if (!chimera) return;
  chimera.lastAttendedAt = now;
}

// The passive half, run from tickWorld on the one clock. Returns the news
// lines rather than pushing them, so this module never imports the wire.
export function tickFeral(state, content, now) {
  const t = feralTuning(content);
  const lines = feralLines(content);
  const say = (key, creature) => (lines[key] ?? '').replace('{creature}', creature);
  const news = [];
  const gone = [];

  for (const chimera of [...(state.chimeras ?? [])]) {
    const status = feralStatus(chimera, content, now);

    // Fixed it. The creature was pacing and somebody went and sat with it.
    if (status.agitated && !status.atRisk) {
      chimera.agitatedAt = null;
      if (say('settled', chimera.name)) news.push(say('settled', chimera.name));
      continue;
    }
    if (!status.atRisk) continue;

    // First notice. The clock starts WHEN THE CONDITION IS MET rather than
    // when the player next opens the app — R65's rule — but the window is
    // long enough that a whole cycle of being away cannot cost a creature
    // that was fine when you left.
    if (!status.agitated) {
      chimera.agitatedAt = now;
      if (say('agitated', chimera.name)) news.push(say('agitated', chimera.name));
      continue;
    }

    if (now >= chimera.agitatedAt + t.windowHours * HOUR) {
      gone.push(chimera);
      if (say('feral', chimera.name)) news.push(say('feral', chimera.name));
    }
  }

  return { news, gone };
}
