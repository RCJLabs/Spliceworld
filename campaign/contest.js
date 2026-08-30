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
export function escalationOf(state, content, nodeId) {
  const t = contestTuning(content);
  return 1 + t.escalation + defencesOf(state, nodeId) * t.escalationPerDefence;
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
// news lines instead of pushing them, so this module never has to know
// campaign.js exists.
export function tickContests(state, content, now, gen) {
  const t = contestTuning(content);
  const cam = state.campaign;
  cam.contested ??= [];
  cam.defences ??= {};
  const nameOf = (id) => nodeName(content, id);
  const news = [];

  // Open at most ONE per tick. A player returning from a week away should
  // find the world has made a move, not fifty.
  if (contestEligible(state, content, gen)) {
    if (cam.nextContestAt == null) {
      // Eligibility has just appeared: give them a beat before the first one.
      cam.nextContestAt = now + Math.round(t.firstDelayHours * HOUR);
    } else if (now >= cam.nextContestAt) {
      const node = chooseNode(state, content);
      if (node) {
        cam.contestCount = (cam.contestCount ?? 0) + 1;
        cam.contested.push({
          nodeId: node.id,
          startedAt: now,
          // The window opens NOW, however long the schedule sat unread.
          deadline: now + Math.round(t.windowHours * HOUR),
          gen,
        });
        cam.nextContestAt = null; // rescheduled when this one resolves
        news.push(line(t.news.opened, node.name));
      }
    }
  }

  // Close anything whose window ran out. A contest opened on this very
  // tick cannot expire on it, because its deadline was set from `now`.
  for (const contest of [...cam.contested]) {
    if (now < contest.deadline) continue;
    cam.contested = cam.contested.filter((c) => c !== contest);
    cam.heldNodes = cam.heldNodes.filter((id) => id !== contest.nodeId);
    scheduleNext(state, content, now);
    news.push(line(t.news.expired, nameOf(contest.nodeId)));
  }

  return news;
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
