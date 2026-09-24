// R107 — WELCOME BACK. What the week did while nobody was home.
//
// R64 proved a month away pays fairly. Nothing told the player what it paid:
// measured on a walked day-25 save, a week away moves EIGHT categories and
// the wire — which keeps twelve lines — gets seven to ten of them, so the
// week arrives as a handful of petting-zoo results and no account of itself.
//
// Built from the tick's change report (R104) rather than from the wire,
// because the wire is a ring buffer of flavour and the report is the ledger.
// DOM-free on purpose: this returns lines, and the shell decides what a line
// looks like. That is what lets smoke assert the digest against the diff
// instead of against a screen.
//
// THE ONE RULE: a line exists only for a category that MOVED. No zeros, no
// "nothing happened" rows, no fixed order of headings with blanks in them —
// a digest that always says the same twelve things is the wire again.

import { fill } from '../util/text.js';

// Six hours. The ROADMAP asks for "over six hours"; the acceptance criterion
// asks for "never under an hour", and six satisfies both. Time, not movement:
// an hour away already moves funds on every save measured, so a rule keyed on
// "did the report say anything" would fire on a coffee break.
export const AWAY_MIN_MS = 6 * 3600000;

const money = (n) => `$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// One entry per category the report can carry. `key` is the snapshot field,
// so the gate can check the digest against `changesBetween` without a second
// list to keep in step. `say` receives the delta and both raw values.
//
// Tone: CLAUDE.md — gleeful, deadpan, zero death language. A KO'd specimen
// "graduates"; a convoy "leaves a stern letter".
const LINES = [
  { key: 'funds', say: (d) => (d > 0
    ? `The ranch banked ${money(d)} while you were out, upkeep already paid.`
    : `Upkeep outran the income by ${money(d)}. The accountant has notes.`) },
  { key: 'contestCount', say: (d, _a, _b, after) => {
    const waiting = after.contested;
    const came = `${plural(d, 'convoy', 'convoys')} came to the gate`;
    return waiting
      ? `${came}. ${plural(waiting, 'one is', 'some are')} still out there, engine running.`
      : `${came}, waited, and left stern letters.`;
  } },
  // `contested` has its own line as well as a clause inside the contestCount
  // sentence above, because the two say different things: how many convoys
  // CAME, and how many are still sitting there now. The synthetic pass in
  // smoke found this missing — folding it into another line left a report
  // field that could move with nothing to show for it.
  { key: 'contested', say: (d, _a, b) => (d > 0
    ? `${plural(b, 'convoy is', 'convoys are')} parked on your territory right now.`
    : `The gate is clear again.`) },
  { key: 'heldNodes', say: (d) => (d > 0
    ? `The map grew by ${plural(d, 'block', 'blocks')}. Nobody is sure how.`
    : `${plural(-d, 'block', 'blocks')} slipped back to the coalition.`) },
  { key: 'breakoutCount', say: (d, _a, _b, after) => `${plural(d, 'specimen', 'specimens')} let themselves out`
    + (after.loose ? `; ${after.loose} still at large.` : ' and were all talked back in.') },
  { key: 'loose', say: (d) => (d > 0
    ? `${plural(d, 'specimen is', 'specimens are')} loose in the county.`
    : `${plural(-d, 'stray', 'strays')} came home.`) },
  { key: 'raidCount', say: (d, _a, _b, after) => `The Compliance Task Force called ${plural(d, 'time', 'times')}`
    + (after.captives < 0 ? '.' : ' with a clipboard and a warrant.') },
  { key: 'opCount', say: (d) => `${plural(d, 'job', 'jobs')} came home. The van is unloaded.` },
  { key: 'injured', say: (d) => (d < 0
    ? `${plural(-d, 'chimera', 'chimeras')} walked out of the Infirmary clean.`
    : `${plural(d, 'chimera', 'chimeras')} came back sore from something.`) },
  { key: 'scarred', say: (d) => (d > 0
    ? `${plural(d, 'injury', 'injuries')} set into something permanent. Character, we are calling it.`
    : `${plural(-d, 'scar', 'scars')} faded out.`) },
  { key: 'agitated', say: (d) => (d > 0
    ? `${plural(d, 'chimera is', 'chimeras are')} pacing. The Pens would like a word.`
    : `${plural(-d, 'chimera', 'chimeras')} settled down on their own.`) },
  { key: 'settling', say: (d) => (d < 0
    ? `${plural(-d, 'splice', 'splices')} finished settling.`
    : `${plural(d, 'splice is', 'splices are')} still settling.`) },
  { key: 'eggs', say: (d) => (d < 0
    ? `${plural(-d, 'egg', 'eggs')} hatched without ceremony.`
    : `${plural(d, 'egg', 'eggs')} went into the incubator.`) },
  { key: 'stock', say: (d) => (d > 0
    ? `${plural(d, 'animal', 'animals')} joined the herd.`
    : `${plural(-d, 'animal', 'animals')} left the herd.`) },
  { key: 'chimeras', say: (d) => (d > 0
    ? `${plural(d, 'chimera', 'chimeras')} joined the roster.`
    : `${plural(-d, 'chimera', 'chimeras')} left the roster.`) },
  { key: 'captives', say: (d) => (d > 0
    ? `${plural(d, 'guest', 'guests')} arrived in Containment.`
    : `${plural(-d, 'guest', 'guests')} graduated out of Containment.`) },
  { key: 'bays', say: (d) => (d > 0
    ? `${plural(d, 'bay', 'bays')} filled up.`
    : `${plural(-d, 'programme', 'programmes')} finished in the Wing.`) },
  { key: 'notoriety', say: (d) => (d > 0
    ? `Notoriety climbed ${d}. Someone has been talking.`
    : `Notoriety cooled by ${-d}. The heat is off, a little.`) },
  { key: 'parts', say: (d) => (d > 0
    ? `${plural(d, 'part', 'parts')} arrived in the vault.`
    : `${plural(-d, 'part', 'parts')} left the vault.`) },
];

// `news` is deliberately absent: the wire is the thing this card exists
// because of, and "the wire moved" is not news. `tick` is the repaint
// heartbeat R104 added, not an event.

export function awayDigest(before, after, dtMs, content) {
  if (!(dtMs >= AWAY_MIN_MS) || !before || !after) return [];
  const lines = [];
  for (const { key, say } of LINES) {
    const a = before[key] ?? 0;
    const b = after[key] ?? 0;
    if (a === b) continue;
    lines.push({ key, delta: b - a, text: say(b - a, a, b, after) });
  }
  return lines.concat(staffLines(before, after, content));
}

// R181 — ONE LINE PER HIRE WHOSE TALLIES MOVED, in that henchman's own words
// from data/henchmen.json, so both sides of the quirk are on the card: what
// they did (`done`), what they left undone (`missed`), and what it cost
// (`billed`, which is `done` at the henchman's own fee and so is not stored
// twice). A retired henchman is skipped rather than printed as an id: the
// digest is for people, and the save still settles without them.
const staffLines = (before, after, content) => {
  const out = [];
  for (const key of Object.keys(after)) {
    const m = /^hire:(.+):done$/.exec(key);
    const h = m && content?.henchmen?.[m[1]];
    if (!h?.report) continue;
    const miss = `hire:${m[1]}:missed`;
    const done = after[key] - (before[key] ?? 0);
    const missed = (after[miss] ?? 0) - (before[miss] ?? 0);
    if (!done && !missed) continue;
    // The vet's fee is by the hour spent treating, which is the hours saved
    // over the speed-up it bought; the hand's is by the meal.
    const perDone = h.duty === 'infirmary' ? (h.fee ?? 0) / Math.max(1e-9, (h.rate ?? 2) - 1) : (h.fee ?? 0);
    out.push({ key, delta: done, text: fill(h.report, { name: h.name, done, missed, billed: money(done * perDone) }) });
  }
  return out;
};

// How long the player was away, phrased the way a person would say it. Used
// for the card's heading; separate from the lines so the shell can show a
// heading with no lines under it rather than an empty card.
export function awayFor(dtMs) {
  const h = Math.floor(dtMs / 3600000);
  if (h < 48) return `${plural(h, 'hour', 'hours')}`;
  const d = Math.floor(h / 24);
  return d < 14 ? `${d} days` : `${Math.floor(d / 7)} weeks`;
}
