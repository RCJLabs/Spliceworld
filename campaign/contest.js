// Region contestation (ROADMAP §3.9: "coalition counter-offensives can
// contest held regions"). Pure and DOM-free.
//
// Conquest in M5 was one-way: take a node, collect income forever. That
// makes territory a number that only goes up, which is the shape endless
// mode goes stale in (§8, risk 5). So the coalition comes back for it.
//
// Two rules keep it fair, and both are load-bearing:
//
//   1. The next counter-offensive is a SCHEDULED TIMESTAMP, never a
//      per-tick dice roll. Rolling on each tick would mean a player who
//      opens the app ten times an evening gets attacked ten times as
//      often — the frequency would measure their habits, not the world.
//
//   2. The defence window starts when you SEE the contest, not when it
//      was scheduled. Come back after a week away and the convoy is
//      rolling in *now*, with your full window ahead of you. Losing a
//      node you were never given a chance to defend is exactly the kind
//      of surprise the rescue-window house rule exists to forbid.
//
// Losing one is never final: a lost node drops back to `available` and
// can be assaulted again.

import { rngStream } from '../util/rng.js';
import { allNodes, nodeById, nodeName } from './map.js';

const HOUR = 3600000;

const DEFAULTS = {
  startsAtGen: 2,
  minHeld: 2,
  maxConcurrent: 1,
  firstDelayHours: 4.5,
  cooldownHours: 15,
  cooldownPerDefenceHours: 5.25,
  jitter: 0.25,
  windowHours: 13.5,
  escalation: 0.1,
  escalationPerDefence: 0.1,
  rewardScale: 1.6,
  notoriety: 8,
  // R63. The ceiling on the grudge multiplier — they bring at most double.
  // Mirrors regions.json (the suite holds the two equal, because the data
  // wins and a default that disagrees is a lie); a data author who wants
  // the old unbounded ramp back sets it to null. Unbounded, a node defended
  // twenty-two times faced the same garrison at 330%, and a ramp with no
  // top makes dominion a state you can only pass through. Two more dials
  // were built and measured over six 180-day walks and are deliberately
  // NOT here: a grace period after a conquest changed nothing the defence
  // window did not already cover, and a memory that forgot old defences
  // made things worse — the record also spaces the schedule, so forgetting
  // brought the convoys back faster. A dial nobody should turn is clutter.
  escalationMax: 2,
  blurb: 'They are back, and this time they brought a budget.',
  intel: 'Counter-offensive at {pct}% strength.',
  news: {},
};

export function contestTuning(content) {
  return { ...DEFAULTS, ...(content.campaignMeta?.contestation ?? {}) };
}

const line = (tmpl, nodeName) => (tmpl ?? '').replace('{node}', nodeName);

export function contestOn(state, nodeId) {
  return (state.campaign.contested ?? []).find((c) => c.nodeId === nodeId) ?? null;
}

export function isContested(state, nodeId) {
  return !!contestOn(state, nodeId);
}

export function defencesOf(state, nodeId) {
  return state.campaign.defences?.[nodeId] ?? 0;
}

export function contestRemainingMs(contest, now) {
  return Math.max(0, (contest?.deadline ?? 0) - now);
}

// Whether the world is allowed to come back for anything right now.
export function contestEligible(state, content, gen) {
  const t = contestTuning(content);
  return (
    gen >= t.startsAtGen &&
    state.campaign.heldNodes.length >= t.minHeld &&
    (state.campaign.contested?.length ?? 0) < t.maxConcurrent
  );
}

// Seeded, so the same save always faces the same schedule. `extraHours`
// carries the node's own defence record: hold a place twice and they
// take longer to work up to a third attempt.
function scheduleNext(state, content, now, extraHours = 0) {
  const t = contestTuning(content);
  state.campaign.contestCount ??= 0;
  const rng = rngStream(state.seed, 'contest:schedule', state.campaign.contestCount);
  const spread = 1 + (rng() - 0.5) * 2 * t.jitter;
  const hours = Math.max(1, (t.cooldownHours + extraHours) * spread);
  state.campaign.nextContestAt = now + Math.round(hours * HOUR);
}

// Which node they come for. Uniform across everything you hold, on
// purpose: an earlier draft weighted this by income, which reads well
// ("they go for the throat") and plays badly — your richest node is the
// commander's HQ, which is also the hardest fight on the ladder, so
// almost every counter-offensive landed on the one you were least able
// to answer. Probing anywhere spreads the difficulty the way the strip
// already spreads it.
function chooseNode(state, content) {
  const candidates = allNodes(content)
    .map((e) => e.node)
    .filter((n) => state.campaign.heldNodes.includes(n.id) && !isContested(state, n.id));
  if (!candidates.length) return null;
  const rng = rngStream(state.seed, 'contest:node', state.campaign.contestCount ?? 0);
  return candidates[Math.floor(rng() * candidates.length) % candidates.length];
}

// How much stronger this convoy is than the garrison you originally beat.
// Capped by `escalationMax` when the data sets one (R63).
export function escalationOf(state, content, nodeId) {
  const t = contestTuning(content);
  const raw = 1 + t.escalation + defencesOf(state, nodeId) * t.escalationPerDefence;
  return t.escalationMax ? Math.min(t.escalationMax, raw) : raw;
}

// The defence. It is the node's OWN garrison, at `escalation` above the
// strength you beat it at, and a little stronger again every time you
// hold the place. A new region therefore costs zero new encounter data —
// which is the whole reason contestation can be the endless-mode content
// engine §8 says it is.
//
// The escalation rides `scaleOverride` rather than a tier step. The
// authored tier ladder is a ladder of CONTENT and its rungs are uneven:
// measured against the harness's yardstick team, +1 tier took the boss
// node's defence from 30% to 5% and left mid nodes barely changed. A
// continuous dial escalates every node by the same amount.
export function contestEncounter(state, content, contest) {
  if (!contest) return null;
  const t = contestTuning(content);
  const node = nodeById(content, contest.nodeId);
  const base = content.encounters[node?.encounter];
  if (!base) return null;
  const escalation = escalationOf(state, content, contest.nodeId);
  const authored = base.tier == null ? 1 : content.tierScale?.[base.tier] ?? 1;
  return {
    ...base,
    id: `contest_${contest.nodeId}`,
    // The AI director reaches this through the encounter it came from.
    baseId: base.id,
    name: `Defend ${node.name}`,
    blurb: t.blurb,
    scaleOverride: Number((authored * escalation).toFixed(4)),
    escalation,
    intel: (t.intel ?? '').replace('{pct}', String(Math.round(escalation * 100))),
    reward: Math.round((base.reward ?? 0) * t.rewardScale),
    contestOf: contest.nodeId,
  };
}

// Elapsed contestation, computed on load like every other timer. Returns
// `{ news, missed }` instead of pushing anything, so this module never has
// to know campaign.js exists: `news` are wire lines, `missed` the convoys
// that came and went unseen (R64), which campaign.js prices.
export function tickContests(state, content, now, gen) {
  const t = contestTuning(content);
  const cam = state.campaign;
  cam.contested ??= [];
  cam.defences ??= {};
  const nameOf = (id) => nodeName(content, id);
  const news = [];

  // R64: the world keeps moving while the app is closed. Before this, a
  // month away met exactly one convoy on return and thirty days of full pay;
  // a player who opened the app daily met twenty-three. So the schedule is
  // replayed through the gap: a convoy arrives when nextContestAt fell due,
  // waits its window at the gate, and — nobody home — leaves with a stern
  // letter, the node having paid nothing while it sat there. The next one
  // rolls a cooldown after that. Only a convoy still inside its window when
  // you return is actually waiting, and it gets its full window from NOW,
  // which is R9's rule unchanged: being away never costs a node you were
  // not given the chance to defend. It costs the income, which is the
  // half a daily player was already paying.
  if (contestEligible(state, content, gen) && cam.nextContestAt == null) {
    // Eligibility has just appeared: give them a beat before the first one.
    cam.nextContestAt = now + Math.round(t.firstDelayHours * HOUR);
  }
  const missed = [];
  const windowMs = Math.round(t.windowHours * HOUR);

  // R78 — ONE TIMELINE, IN ORDER. This used to be two passes: replay every
  // arrival, then close every expired contest. Both halves were right and
  // the ORDER was wrong, because an arrival needs a free slot
  // (`maxConcurrent` is 1) and the expiry that frees it ran afterwards. So a
  // player who closed the app with a convoy at the gate had the whole gap
  // skipped: the one open contest held the only slot from the first
  // instant to the last, no convoy was replayed, and the expiry pass then
  // took the node and scheduled the next arrival from `now` — after they
  // were already back.
  //
  // Measured on `campaignWalk` seed 5150, thirty days away from day 10:
  // ZERO contest events across the month and a node gone (7 → 6), against
  // 25 or 26 events for every other seed in the sample. It needed a
  // specific empire shape to fall into — leaving with `contested.length`
  // already at the cap — which is why fifteen other seeds never showed it.
  //
  // The replay is now a single loop over the earliest thing that has not
  // happened yet, whichever kind it is. Two consequences worth stating,
  // because both are load-bearing rather than incidental:
  //   * a contest expires AT ITS OWN DEADLINE, not at `now`, so the convoy
  //     that follows it is scheduled from inside the gap and arrives inside
  //     the gap — the world keeps its own time while nobody is looking;
  //   * `armed` is re-read every iteration, because a node falling during
  //     the replay can take the empire below `minHeld` and the coalition
  //     should stop coming for someone who no longer holds enough.
  const armedNow = () => gen >= t.startsAtGen && cam.heldNodes.length >= t.minHeld;
  let guard = 0;
  while (guard++ < 400) {
    // The two things that can be due: the open contest's window running
    // out, and the next convoy rolling up.
    const expiring = cam.contested.find((c) => c.deadline <= now) ?? null;
    const arrivalDue = armedNow()
      && cam.nextContestAt != null
      && now >= cam.nextContestAt
      && (cam.contested.length ?? 0) < t.maxConcurrent;

    if (!expiring && !arrivalDue) break;
    // Earliest first. An expiry and an arrival at the same instant resolve
    // expiry-first, which is the only order that can free the slot for it.
    if (expiring && (!arrivalDue || expiring.deadline <= cam.nextContestAt)) {
      cam.contested = cam.contested.filter((c) => c !== expiring);
      cam.heldNodes = cam.heldNodes.filter((id) => id !== expiring.nodeId);
      scheduleNext(state, content, expiring.deadline);
      news.push(line(t.news.expired, nameOf(expiring.nodeId)));
      continue;
    }

    const arrivedAt = cam.nextContestAt;
    const node = chooseNode(state, content);
    if (!node) break;
    cam.contestCount = (cam.contestCount ?? 0) + 1;
    if (arrivedAt + windowMs <= now) {
      // Came, waited, left. Unseen, so no window was ever offered and no
      // node changes hands; the revenue is what went with it.
      missed.push({ nodeId: node.id, arrivedAt, leftAt: arrivedAt + windowMs });
      scheduleNext(state, content, arrivedAt + windowMs);
      continue;
    }
    cam.contested.push({
      nodeId: node.id,
      startedAt: now,
      // When the convoy actually rolled: the node stopped paying here.
      scheduledAt: arrivedAt,
      // The window opens NOW, however long the schedule sat unread.
      deadline: now + windowMs,
      gen,
    });
    cam.nextContestAt = null; // rescheduled when this one resolves
    news.push(line(t.news.opened, node.name));
  }
  if (missed.length && t.news.missed) {
    const nodeDays = missed.reduce((n, m) => n + (m.leftAt - m.arrivedAt), 0) / (24 * HOUR);
    news.push((t.news.missed ?? '').replace('{count}', String(missed.length)).replace('{days}', String(Math.round(nodeDays))));
  }

  return { news, missed };
}

// Called by resolveBattle when a defence is fought to a conclusion.
// Fleeing is not a result: the convoy is still out there and the clock
// keeps running.
export function resolveContest(state, content, nodeId, outcome, now) {
  const t = contestTuning(content);
  const name = nodeName(content, nodeId);
  const contest = contestOn(state, nodeId);
  if (!contest || outcome === 'fled') return { news: null, held: null };

  state.campaign.contested = state.campaign.contested.filter((c) => c !== contest);
  if (outcome === 'win') {
    state.campaign.defences[nodeId] = defencesOf(state, nodeId) + 1;
    state.campaign.notoriety += t.notoriety;
    scheduleNext(state, content, now, defencesOf(state, nodeId) * t.cooldownPerDefenceHours);
    return { news: line(t.news.held, name), held: true };
  }
  state.campaign.heldNodes = state.campaign.heldNodes.filter((id) => id !== nodeId);
  scheduleNext(state, content, now);
  return { news: line(t.news.lost, name), held: false };
}
