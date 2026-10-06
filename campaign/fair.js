// R213 — THE COUNTY FAIR. For a few days at each season's turn the county
// holds a race and a Best in Show, and a lab may enter its chimeras against
// the locals' livestock: purebred catalogue animals, built and scored by the
// same physiology the battle reads.
//
// Pure and lazy: the War Room card and the walker read it, and the only
// eager piece is the window (`fairWindow` in campaign/calendar.js), which the
// Ranch's agenda asks on the first frame. An event is run the moment the
// player enters it — one shot per fair — so the result is written with the
// entry and nothing waits on a tick. Every roll is keyed by the save, the
// fair and the runner, so the same entries at the same fair replay the same
// result in any order. data/notes/fair.md has the rules and the tuning.

import { fairWindow, seasonOf } from './calendar.js';
import { homeChimeras } from './commissions.js';
import { analyze } from '../splice/physiology.js';
import { isInjured } from '../battle/statblock.js';
import { GRADE_INDEX } from '../splice/grades.js';
import { admitParts } from '../splice/vault.js';
import { stockGenome } from '../ranch/ranch.js';
import { rngStream, pick } from '../util/rng.js';
import { speciesOf } from '../data/catalog.js';
import { copy, fmtMoney } from '../util/text.js';


// Who can be entered: home, and not in the Infirmary.
export function fairCandidates(state, now) {
  return homeChimeras(state).filter((c) => !isInjured(c, now));
}

// Today's course: one per fair, from the save and the fair.
export function courseOf(state, content, k) {
  const courses = content.fair?.race?.courses ?? [];
  return pick(rngStream(state.seed, 'fair:course', k), courses) ?? { id: 'oval', name: 'the Oval', stamina: 60, class: {} };
}

// The county's entries: purebred livestock from the catalogue, owned by
// somebody local. Each lane is the best of `picks` animals for this event and
// course — the county sends runners to a race — and the county's breeders get
// better every fair, up the `grades` ladder. Seeded per fair and event, so the
// field is the same on every screen and every reload.
export function localsFor(state, content, k, event, count) {
  const rng = rngStream(state.seed, `fair:${event}:locals`, k);
  const species = Object.values(content.species).filter((s) => s.mailOrderPrice);
  const t = content.fair?.locals ?? {};
  const owners = t.owners ?? ['A neighbour’s'];
  const grades = t.grades ?? ['standard'];
  const grade = grades[Math.min(Math.max(0, k - 1), grades.length - 1)];
  const course = courseOf(state, content, k);
  const rate = (sp) => {
    const body = bodyOf(content, { species: sp.id, grade });
    return event === 'race' ? -raceTime(content, course, body, 0.5) : showScore(content, body, 0.5);
  };
  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    const sp = Array.from({ length: Math.max(1, t.picks ?? 1) }, () => pick(rng, species))
      .map((s) => ({ s, v: rate(s) })).sort((a, b) => b.v - a.v)[0].s;
    return { id: null, local: i, species: sp.id, name: `${pick(rng, owners)} ${sp.name}`, grade };
  });
}

// A runner's body, chimera or local, as the physiology reads it.
function bodyOf(content, entrant, chimera) {
  if (chimera) {
    const tokens = Object.values(chimera.tokens ?? {}).filter((t) => content.parts[t.partId]);
    return { frame: chimera.frame, tokens, scars: Array.isArray(chimera.scars) ? chimera.scars.length : 0 };
  }
  const genome = stockGenome(entrant.species, content);
  return { frame: genome.frame, tokens: Object.values(genome.parts).map((partId) => ({ partId, grade: entrant.grade })), scars: 0 };
}

const rollFor = (state, k, event, entrant) => rngStream(state.seed, `fair:${k}:${event}:${entrant.id ?? `local${entrant.local}`}`)();

// The race: pace from speed, the course's terrain against the runner's class,
// its frame, and whether its stamina lasts the course; a seeded stumble each.
export function raceTime(content, course, body, roll) {
  const t = content.fair?.race ?? {};
  const report = analyze(body.frame, body.tokens, content, body.tokens.length);
  const terrain = (course.class ?? {})[report.creatureClass] ?? 1;
  const chassis = (course.frame ?? {})[body.frame] ?? 1;
  const legs = Math.sqrt(Math.min(1, (report.stats.stamina ?? 0) / (course.stamina || 1)));
  const pace = Math.max(0.5, ((report.stats.speed ?? 0) + (t.base ?? 4)) * terrain * chassis * legs);
  return ((t.distance ?? 100) / pace) * (1 + (t.jitter ?? 0.06) * (2 * roll - 1));
}

// Best in Show: grade, a purebred set, species variety and combos for, scars
// against, and a judge with opinions.
export function showScore(content, body, roll) {
  const w = content.fair?.show?.weights ?? {};
  const report = analyze(body.frame, body.tokens, content, body.tokens.length);
  const grade = body.tokens.reduce((n, tok) => n + (GRADE_INDEX[tok.grade] ?? 0), 0) / Math.max(1, body.tokens.length);
  const score = (w.grade ?? 3) * grade + (report.purebredSpecies ? (w.set ?? 4) : 0)
    + (w.variety ?? 0.6) * Object.keys(report.speciesCount ?? {}).length
    + (w.combo ?? 1.5) * (report.combos?.length ?? 0) - (w.scar ?? 2) * body.scars
    + (content.fair?.show?.jitter ?? 1) * (2 * roll - 1);
  return Math.round(score * 100) / 100;
}

// The whole field and its order. Entrants are the player's chimeras by id,
// in any order; the county fills the remaining lanes.
export function fairField(state, content, k, event, ids) {
  const spec = content.fair?.[event] ?? {};
  const course = event === 'race' ? courseOf(state, content, k) : null;
  const mine = ids.map((id) => state.chimeras.find((c) => c.id === id)).filter(Boolean)
    .map((c) => ({ id: c.id, name: c.name, chimera: c }));
  const field = [...mine, ...localsFor(state, content, k, event, (spec.lanes ?? 6) - mine.length)].map((e) => {
    const body = bodyOf(content, e, e.chimera);
    const roll = rollFor(state, k, event, e);
    return event === 'race'
      ? { id: e.id, name: e.name, species: e.species ?? null, time: Math.round(raceTime(content, course, body, roll) * 100) / 100 }
      : { id: e.id, name: e.name, species: e.species ?? null, score: showScore(content, body, roll) };
  });
  field.sort(event === 'race' ? (a, b) => a.time - b.time : (a, b) => b.score - a.score);
  return { course: course?.id ?? null, field: field.map((e, i) => ({ ...e, place: i + 1 })) };
}

// The player's candidates for an event, best first, on the event's own
// arithmetic with the luck taken out: what a trainer would expect.
export function fairRank(state, content, k, event, chimeras) {
  const course = courseOf(state, content, k);
  const rate = (c) => (event === 'race' ? -raceTime(content, course, bodyOf(content, c, c), 0.5) : showScore(content, bodyOf(content, c, c), 0.5));
  return chimeras.map((c) => ({ c, v: rate(c) })).sort((a, b) => b.v - a.v).map(({ c }) => c);
}

// Enter an event. One shot per fair: the result is written with the entry,
// prizes are paid and ribbons pinned on the spot.
export function enterFair(state, content, now, event, ids) {
  const w = fairWindow(state, content, now);
  const spec = content.fair?.[event];
  if (!spec || !w.open) return { ok: false, msg: copy(content, 'fair.closed') };
  const cam = state.campaign;
  if (cam.fair?.k === w.k && cam.fair[event]) return { ok: false, msg: copy(content, 'fair.already') };
  const able = new Set(fairCandidates(state, now).map((c) => c.id));
  const entries = [...new Set(ids)].filter((id) => able.has(id)).slice(0, spec.entries ?? 2);
  if (!entries.length) return { ok: false, msg: copy(content, 'fair.pick') };
  const result = fairField(state, content, w.k, event, entries);
  const season = seasonOf(state, content, w.opensAt).id;
  const keep = content.fair?.ribbons?.keep ?? 6;
  const prizes = [];
  for (const row of result.field) {
    const prize = row.id && (spec.prizes ?? []).find((p) => p.place === row.place);
    if (!prize) continue;
    const chimera = state.chimeras.find((c) => c.id === row.id);
    state.funds += prize.funds ?? 0;
    let partId = null;
    if (prize.part) {
      const pool = Object.values(content.parts).filter((p) => speciesOf(content, p.species).mailOrderPrice);
      partId = pick(rngStream(state.seed, `fair:${w.k}:${event}:prize`), pool)?.id ?? null;
      if (partId) {
        admitParts(state, content, [{ id: `t${state.inventory.tokenCount++}`, partId, grade: prize.part, traits: [],
          donor: { name: copy(content, 'fair.donor'), species: content.parts[partId].species, stars: 4, extractedAt: now } }]);
      }
    }
    chimera.ribbons = [{ k: w.k, season, event, place: row.place }, ...(Array.isArray(chimera.ribbons) ? chimera.ribbons : [])].slice(0, keep);
    prizes.push({ id: row.id, place: row.place, funds: prize.funds ?? 0, partId });
  }
  cam.fair = { ...(cam.fair?.k === w.k ? cam.fair : { race: null, show: null }), k: w.k, season, [event]: { ...result, prizes } };
  return { ok: true, result: cam.fair[event], msg: prizeLine(content, state, cam.fair[event]) };
}

// What the event paid, in a sentence.
export function prizeLine(content, state, result) {
  if (!result?.prizes?.length) return copy(content, 'fair.no_prize');
  return result.prizes.map((p) => copy(content, 'fair.prize', {
    name: state.chimeras.find((c) => c.id === p.id)?.name ?? '?',
    ribbon: content.fair?.ribbons?.places?.[p.place]?.name ?? '',
    funds: fmtMoney(p.funds),
    part: p.partId ? copy(content, 'fair.prize_part', { part: content.parts[p.partId]?.name ?? p.partId }) : '',
  })).join(' ');
}

// How long the fair has left, for the card.
export const fairLeftMs = (state, content, now) => Math.max(0, fairWindow(state, content, now).closesAt - now);
