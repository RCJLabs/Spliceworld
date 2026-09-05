// The agenda (audit A4) — the single place that knows what a player can
// actually DO right now.
//
// WHY THIS EXISTS. The audit filed A4 as "there is one thing to do per visit
// and it is on a cooldown". Measured against the state the criterion names —
// money, a stable, a lost fight — that was wrong: five things were open. But
// four of the five were PURCHASES (buy an animal, buy pen space, buy a
// training session, buy your way out of the Infirmary) and the fifth was a
// fifteen-hour job. Nothing you could do produced a next thing to do.
//
// And the loop the whole game is built around — graduate a donor into parts,
// splice them onto something better — was shut for the first six to twelve
// HOURS of a save, because the starter herd is born the moment you first open
// the app and nothing can graduate until it reaches adult. That is exactly
// the window the player who filed this report was living in.
//
// So the fix is not more jobs. It is opening what is already there, and then
// saying out loud what is open. This module is the saying-out-loud: DOM-free,
// so the smoke suite scores a save with the same code the Ranch renders from,
// and the acceptance criterion cannot drift away from the screen.
//
// `screen` is a key of main.js's SCREENS map, NOT a tab label — showScreen()
// silently falls back to the Ranch for anything it does not recognise, so a
// wrong id here looks wired and does nothing. The War Room is `battle` and
// the Surgery Theater is `theater`; smoke reads the real map out of main.js
// and checks these against it.
//
// `kind` is the part that matters. Three things you can buy is not three
// things to do:
//   spend    — money leaves, something arrives. Always available if solvent.
//   work     — you make something: a part, an egg, a creature, a better one.
//   campaign — you push on the world: a job, an assault, a rival.
import { careStatus, catalogFor, penUpgradeCost, ageStage } from './ranch.js';
import { canBreed } from './breeding.js';
import { nextUpgrade, tracks } from '../splice/facility.js';
import { TRAINING } from '../splice/theater.js';
import { treatmentCost } from '../splice/scars.js';
import { activeVat, vatPlan } from '../splice/chaos.js';
import { operationList, opReady, activeOps, laneFree } from '../campaign/operations.js';
import { reachableEncounterIds } from '../campaign/map.js';
import { contestRemainingMs } from '../campaign/contest.js';
import { isInjured, fitToFight } from '../battle/statblock.js';
import { sparCharges, canSpar } from '../campaign/sparring.js';
import { feralStatus } from '../splice/feral.js';
import { activeRaid, raidRemainingMs, levyOf } from '../campaign/taskforce.js';
import { gauntletState } from '../campaign/gauntlet.js';

const HOUR = 3600000;
const fit = fitToFight;

// Every entry answers one question: is there a click here right now? Order is
// the order the player should think about them in — work before spending.
export const AGENDA = [
  {
    // R87 — above even R85's, and it is the only row that has ever outranked
    // it. A creature going feral is recoverable through the Wing; a levy is
    // a quarter of everything you have, and unlike every other clock in this
    // game it bills you for doing nothing. Measured: post-dominion the
    // player has more money than they can spend and no fight they can lose,
    // and this row is both halves of the answer.
    id: 'raid', kind: 'campaign', screen: 'battle', label: 'Defend the ranch',
    hint: (state, content, now) => {
      const raid = activeRaid(state);
      if (!raid) return 'The Compliance Task Force is at the gate.';
      const hours = Math.max(0, raidRemainingMs(raid, now)) / HOUR;
      const levy = levyOf(state, content);
      return `The Compliance Task Force is at the gate. ${
        hours < 1 ? 'Under an hour' : `${Math.floor(hours)}h`
      } before they serve papers and leave with $${levy.fine}${levy.stock ? ` and ${levy.stock} of the herd` : ''}.`;
    },
    ready: (state, content, now) => !!activeRaid(state) && fit(state, now).length > 0,
  },
  {
    // R87 — the four exhibitions have been shipped and unreachable since
    // R42: they open at dominion, and nothing on any screen but the Labs tab
    // has ever mentioned that they had. Measured, the walker fought 0 of 4
    // in 180 days.
    id: 'gauntlet', kind: 'campaign', screen: 'battle', subtab: 'labs', label: 'Answer an exhibition',
    hint: (state, content) => {
      const open = gauntletState(state, content).find((r) => r.status === 'open');
      return open
        ? `${open.stage.name} is waiting. $${open.stage.reward} and the hardest fight the coalition has.`
        : 'The Gauntlet is open.';
    },
    ready: (state, content, now) =>
      gauntletState(state, content).some((r) => r.status === 'open') && fit(state, now).length > 0,
  },
  {
    // R85, and it goes above everything — including the two clocks R63 put
    // at the front — because it is the only row on this list whose deadline
    // ends with a creature off the roster. Everything else here costs you a
    // node, a purse or an opportunity; this one costs you the animal.
    //
    // `work`, not `spend`: training is one answer and it costs $5, but a
    // fight, a spar and a treatment all clear it too, and a row that reads
    // as a purchase is a row a broke player skips.
    id: 'settle', kind: 'work', screen: 'pens', label: 'Settle an agitated chimera',
    hint: (state, content, now) => {
      const pacing = (state.chimeras ?? [])
        .map((c) => ({ c, f: feralStatus(c, content, now) }))
        .filter((x) => x.f.agitated)
        .sort((a, b) => a.f.remainingMs - b.f.remainingMs);
      if (!pacing.length) return 'Somebody has been left alone too long.';
      const { c, f } = pacing[0];
      const hours = Math.max(0, f.remainingMs) / HOUR;
      const who = pacing.length === 1 ? c.name : `${c.name} and ${pacing.length - 1} other${pacing.length === 2 ? '' : 's'}`;
      return `${who} pacing the pen. ${hours < 1 ? 'Under an hour' : `${Math.floor(hours)}h`} before it stops taking your calls. Working with it at all is the fix.`;
    },
    ready: (state, content, now) =>
      (state.chimeras ?? []).some((c) => feralStatus(c, content, now).agitated),
  },
  {
    id: 'graduate', kind: 'work', screen: 'ranch', label: 'Graduate a donor',
    hint: 'A grown animal becomes six parts. This is where chimeras come from.',
    ready: (state, content, now) =>
      state.ranch.stock.some((a) => ageStage(a, content, now) !== 'juvenile'),
  },
  {
    id: 'splice', kind: 'work', screen: 'theater', label: 'Splice a chimera',
    hint: 'There are parts in the vault. Something could be wearing them.',
    ready: (state) => (state.inventory.parts ?? []).length > 0,
  },
  {
    id: 'breed', kind: 'work', screen: 'ranch', label: 'Breed a pair',
    hint: 'Two adults of a species make a better third.',
    ready: (state, content, now) => state.ranch.stock.some((x, i) =>
      state.ranch.stock.slice(i + 1).some((y) => canBreed(x, y, state, content, now).ok)),
  },
  {
    id: 'hatch', kind: 'work', screen: 'ranch', label: 'Hatch an egg',
    hint: 'The incubator has finished. Somebody is knocking.',
    ready: (state, content, now) => (state.ranch.eggs ?? []).some((e) => now >= e.hatchAt)
      && state.ranch.stock.length < state.ranch.penCapacity,
  },
  {
    id: 'care', kind: 'work', screen: 'ranch', label: 'Care for the herd',
    hint: 'Condition decides the grade a donor graduates at. It is not decoration.',
    ready: (state, content, now) =>
      state.ranch.stock.some((a) => Object.values(careStatus(a, now)).some((s) => s.ready)),
  },
  {
    id: 'vat', kind: 'work', screen: 'pens', label: 'Run the chaos vat',
    hint: 'Two finished chimeras in, one genome out that neither of them was.',
    ready: (state, content, now) => {
      if (activeVat(state)) return false;
      for (const a of state.chimeras) {
        for (const b of state.chimeras) {
          if (a === b) continue;
          try { if (vatPlan(state, a.id, b.id, content, now)?.ok) return true; } catch { /* not a pair */ }
        }
      }
      return false;
    },
  },
  {
    // R48. The ring was built for the player report that "no combination of
    // them could beat the missions in front of them", and then the only
    // thing that ever mentioned it was a button on the map — so the module
    // whose entire job is to say what is open said nothing about three
    // charges sitting in the player's pocket.
    //
    // `work`, not `campaign`: a spar pays no purse and no notoriety and
    // cannot take a node. It makes a better creature, which is what `work`
    // means here.
    id: 'spar', kind: 'work', screen: 'battle', label: 'Spar a garrison',
    hint: (state, content, now) => {
      const { charges } = sparCharges(state, now, content);
      return `${charges} charge${charges === 1 ? '' : 's'} in the ring — free xp against a garrison you already hold.`;
    },
    ready: (state, content, now) => canSpar(state, content, now).ok,
  },
  {
    // R63. The two clocks that cost a node or a creature when they run out
    // were the two things this list never mentioned. The 180-day walk lost
    // more nodes to counter-offensives than it won by assault, and the
    // panel whose job is to say what is open never said "defend". Both
    // sit ahead of the job and the assault because both are the thing a
    // player loses by doing the other two first.
    id: 'defend', kind: 'campaign', screen: 'battle', label: 'Defend a node',
    hint: (state, content, now) => {
      const soonest = Math.min(...(state.campaign.contested ?? []).map((c) => contestRemainingMs(c, now)));
      const hours = Math.max(0, soonest) / HOUR;
      return `A convoy is rolling on ${state.campaign.contested.length === 1 ? 'a node you hold' : `${state.campaign.contested.length} nodes you hold`}. ${hours < 1 ? 'Under an hour' : `${Math.floor(hours)}h`} to answer it, and the income is suspended until you do.`;
    },
    ready: (state, content, now) =>
      (state.campaign.contested ?? []).length > 0 && fit(state, now).length > 0,
  },
  {
    id: 'rescue', kind: 'campaign', screen: 'battle', label: 'Rescue a captive',
    hint: (state, content, now) => {
      const soonest = Math.min(...(state.campaign.captives ?? []).map((c) => c.deadline - now));
      const hours = Math.max(0, soonest) / HOUR;
      return `${state.campaign.captives.length === 1 ? state.campaign.captives[0].chimera.name : `${state.campaign.captives.length} of yours`} in the impound. ${hours < 1 ? 'Under an hour' : `${Math.floor(hours)}h`} before the unauthorized peer review.`;
    },
    ready: (state, content, now) =>
      (state.campaign.captives ?? []).some((c) => c.deadline > now) && fit(state, now).length > 0,
  },
  {
    id: 'job', kind: 'campaign', screen: 'battle', subtab: 'jobs', label: 'Run a job',
    hint: 'Money and livestock without winning a fight. Costs heat, not creatures.',
    // Three lanes (see operations.js): a creature can be carried somewhere,
    // you can go yourself, and paperwork needs nobody. Rule 1 — something is
    // ALWAYS runnable — lives in the last two.
    ready: (state, content, now) => operationList(content).some((op) => {
      if (!opReady(state, op.id, now)) return false;
      if (activeOps(state).some((run) => run.opId === op.id)) return false;
      if (laneFree(state, content, now, op, null)) return true;
      const free = fit(state, now).find((c) => !activeOps(state).some((r) => r.chimeraId === c.id));
      return !!free && laneFree(state, content, now, op, free);
    }),
  },
  {
    id: 'assault', kind: 'campaign', screen: 'battle', label: 'Take a node',
    hint: 'Holding it pays every day and puts its fauna in the catalog.',
    ready: (state, content, now) =>
      reachableEncounterIds(state, content).length > 0 && fit(state, now).length > 0,
  },
  {
    id: 'treat', kind: 'spend', screen: 'pens', label: 'Buy someone out of the Infirmary',
    hint: 'Cheaper the closer they are to walking out on their own.',
    ready: (state, content, now) => state.chimeras.some((c) =>
      isInjured(c, now) && state.funds >= treatmentCost(c, content, now, state)),
  },
  {
    id: 'train', kind: 'spend', screen: 'pens', label: 'Train a chimera',
    hint: 'Bond is obedience, and obedience is whether your orders happen.',
    ready: (state, content, now) => state.funds >= TRAINING.cost
      && state.chimeras.some((c) => now >= (c.lastTrainedAt ?? 0) + TRAINING.cooldownHours * HOUR),
  },
  {
    id: 'buy', kind: 'spend', screen: 'ranch', label: 'Order from the catalog',
    hint: 'New anatomy is how a losing matchup stops being one.',
    ready: (state, content) => state.ranch.stock.length < state.ranch.penCapacity
      && catalogFor(state, content).some((sp) => state.funds >= sp.mailOrderPrice),
  },
  {
    id: 'facility', kind: 'spend', screen: 'ranch', label: 'Buy a lab upgrade',
    hint: 'Bigger chassis, more bays, better odds — permanently.',
    // R83 — this row has never once appeared. It read two fields
    // `nextUpgrade` does not return: `up.cost` (the cost lives at
    // `up.level.cost`, so `funds >= undefined` was false for every player at
    // every balance) and `up.locked` (it returns `blockers`, so the lock
    // check was a no-op in the other direction). Shipped in A4 and dead
    // since: with a billion dollars and all 21 nodes held, the Ranch still
    // never suggested buying a lab upgrade.
    //
    // `affordable` is exactly the question being asked — no missing node,
    // and the money is there — so ask it rather than recomputing it.
    ready: (state, content) => tracks(content).some((t) => nextUpgrade(state, content, t.id)?.affordable),
  },
  {
    id: 'pens', kind: 'spend', screen: 'ranch', label: 'Expand the pens',
    hint: 'Room for more stock, which is room for more parts.',
    ready: (state) => state.funds >= penUpgradeCost(state),
  },
];

// What is open right now, in the order a player should consider it.
export function agenda(state, content, now) {
  return AGENDA.filter((item) => {
    try { return !!item.ready(state, content, now); } catch { return false; }
  }).map(({ id, kind, screen, subtab, label, hint }) => ({
    // R75: `subtab` travels with the entry. An agenda row names a
    // DESTINATION, and on the two screens that have sub-navigation the
    // screen alone is only half of one — "Run a job" landed on the map and
    // left the player to find the Jobs tab themselves.
    id, kind, screen, subtab, label,
    // R48: a hint may be a function of the save, because the entry that
    // needed adding is one whose whole value is a NUMBER — "3 charges in
    // the ring" is a reason to go, "you can spar" is not. Strings pass
    // through untouched, so every entry written before this still reads
    // exactly as it did.
    hint: typeof hint === 'function' ? hint(state, content, now) : hint,
  }));
}

// The shape of it, which is the half the criterion cares about: three ways to
// spend the same money is one idea wearing three hats.
export function agendaShape(state, content, now) {
  const open = agenda(state, content, now);
  const kinds = new Set(open.map((i) => i.kind));
  return {
    open,
    count: open.length,
    kinds: [...kinds],
    productive: open.filter((i) => i.kind !== 'spend').length,
  };
}
