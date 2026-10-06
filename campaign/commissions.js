// R212 — COMMISSIONS. Shady clients ask for a creature built a particular way,
// by its anatomy, and pay to be shown one; the creature stays home.
//
// Pure and lazy: the War Room card and the harness read it, and the agenda
// counts the board from the clock alone (`commissionWindows` in
// campaign/mission.js). The board at any instant is the seed, the clock and
// the filled ids, so a deadline settles on load by being read, and nothing
// about a commission is stored until it is filled.
//
// EVERY REQUEST IS SATISFIABLE BY CONSTRUCTION. A commission starts as a
// WITNESS — a body put together from parts a player can order, on a frame and
// in bays the lowest Theater tier that builds that frame opens — and the
// request is read off what that body turned out to be. New species and frames
// therefore make new commissions without new data. data/notes/commissions.md
// has the rules and the tuning.

import { commissionWindows } from './mission.js';
import { analyze } from '../splice/physiology.js';
import { movesFromTokens } from '../battle/statblock.js';
import { theaterGrants, levelData } from '../splice/facility.js';
import { socketFits } from '../render/renderer.js';
import { admitParts } from '../splice/vault.js';
import { rngStream, pick, randInt } from '../util/rng.js';
import { speciesOf, classOf } from '../data/catalog.js';
import { copy, fill, fmtMoney } from '../util/text.js';

const an = (word) => (/^[aeiou]/i.test(String(word)) ? 'an' : 'a');

// The lowest Theater tier that builds on this frame, and the bays it opens.
export function tierFor(content, frameId) {
  for (let level = 1; levelData(content, 'theater', level); level++) {
    const g = theaterGrants({ facility: { theater: level } }, content, frameId);
    if (g.frames.includes(frameId)) return { level, sockets: g.sockets };
  }
  return content.facility?.theater ? null : { level: 1, sockets: theaterGrants({}, content, frameId).sockets };
}

// Parts a player can get on a shelf: every species the catalogue sells.
const stocked = (content) => Object.values(content.parts).filter((p) => speciesOf(content, p.species).mailOrderPrice);

function witnessFor(content, rng, kind) {
  const board = content.commissions.board;
  const first = levelData(content, 'theater', 1)?.grants?.frames;
  const frames = (kind === 'frame' || !first ? Object.keys(content.frames) : first)
    .filter((id) => content.frames[id] && tierFor(content, id));
  const frame = pick(rng, frames);
  if (!frame) return null;
  const { level, sockets } = tierFor(content, frame);
  const pool = stocked(content);
  const parts = {};
  for (const socket of sockets) {
    if (socket !== 'head' && rng() < (board.skip ?? 0.3)) continue;
    const part = pick(rng, pool.filter((p) => socketFits(socket, p.slot)));
    if (part) parts[socket] = part.id;
  }
  if (!parts.head) return null;
  const tokens = Object.values(parts).map((partId, i) => ({ id: `w${i}`, partId, grade: 'standard', traits: [] }));
  return { frame, level, parts, tokens };
}

// What the client asks for, read off the witness. Null when this body has
// nothing of the kind to ask about, and the caller builds another.
function askOf(content, kind, w, report, rng) {
  if (kind === 'anatomy') {
    const pairs = w.tokens.flatMap((t) => (content.parts[t.partId].tags ?? [])
      .map((tag) => ({ slot: content.parts[t.partId].slot, tag })));
    const a = pick(rng, pairs);
    const b = a && pick(rng, pairs.filter((x) => x.slot !== a.slot));
    return b ? { kind, want: [a, b] } : null;
  }
  if (kind === 'class') {
    // A Ground creature with a Ground move is not a request, it is a description.
    const tags = [...new Set(movesFromTokens(w.tokens, report, content).flatMap((m) => m.tags ?? []))]
      .filter((t) => t.toLowerCase() !== report.creatureClass);
    return report.creatureClass && tags.length ? { kind, cls: report.creatureClass, move: pick(rng, tags) } : null;
  }
  if (kind === 'frame') {
    const step = content.commissions.board.massStep ?? 10;
    return { kind, frame: w.frame, under: (Math.floor(report.mass / step) + 1) * step };
  }
  if (kind === 'species') {
    const kinds = Object.keys(report.speciesCount);
    return kinds.length > 1 ? { kind, count: kinds.length, species: pick(rng, kinds) } : null;
  }
  return null;
}

function rewardOf(content, rng, ask) {
  const spec = content.commissions;
  const table = spec.rewards ?? [];
  let roll = rng() * table.reduce((n, r) => n + (r.weight ?? 1), 0);
  const r = table.find((x) => (roll -= x.weight ?? 1) < 0) ?? table[0];
  if (r?.kind === 'part') return { kind: 'part', partId: pick(rng, stocked(content)).id, grade: r.grade ?? 'prime' };
  if (r?.kind === 'notoriety') return { kind: 'notoriety', amount: randInt(rng, r.min, r.max) };
  const funds = randInt(rng, r?.min ?? 200, r?.max ?? 400) * (spec.pay?.[ask.kind] ?? 1);
  return { kind: 'funds', amount: Math.round(funds / 10) * 10 };
}

// One window's commission. Seeded by the save and the window, so it reads the
// same on every screen, every load and every step of the walk.
const memo = new WeakMap();
export function commissionOf(state, content, win) {
  const spec = content.commissions;
  if (!spec?.board) return null;
  const seen = memo.get(content) ?? new Map();
  memo.set(content, seen);
  const key = `${state.seed}:${win.k}`;
  if (seen.has(key)) return { ...seen.get(key), ...win };
  const rng = rngStream(state.seed, 'commission', win.k);
  const kinds = spec.kinds?.length ? spec.kinds : ['anatomy'];
  const drawn = pick(rng, kinds);
  let job = null;
  for (const kind of [drawn, ...new Set(kinds.filter((k) => k !== drawn))]) {
    for (let i = 0; !job && i < (spec.board.tries ?? 12); i++) {
      const w = witnessFor(content, rng, kind);
      const ask = w && askOf(content, kind, w, analyze(w.frame, w.tokens, content, w.tokens.length), rng);
      if (ask) {
        job = { ask, witness: { frame: w.frame, level: w.level, parts: w.parts },
          client: pick(rng, spec.clients ?? ['A client']), reward: rewardOf(content, rng, ask) };
      }
    }
    if (job) break;
  }
  if (seen.size > 64) seen.clear();
  seen.set(key, job);
  return job ? { ...job, ...win } : null;
}

// The open commissions, soonest deadline first.
export function commissionBoard(state, content, now) {
  return commissionWindows(state, content, now).filter((w) => !w.done)
    .map((w) => commissionOf(state, content, w)).filter(Boolean)
    .sort((a, b) => a.deadline - b.deadline);
}

// Who can be shown: everybody not out on a job, an expedition or a mission.
// Injured counts — a client can visit the Infirmary.
export function homeChimeras(state) {
  const cam = state.campaign ?? {};
  const away = new Set([...(cam.operations ?? []).map((r) => r.chimeraId),
    ...(cam.expedition?.crew ?? []), cam.mission?.chimeraId].filter(Boolean));
  return (state.chimeras ?? []).filter((c) => !away.has(c.id));
}

// Does this creature answer the request? The same physiology the battle reads.
export function fits(content, ask, chimera) {
  const tokens = Object.values(chimera?.tokens ?? {}).filter((t) => content.parts[t.partId]);
  const parts = tokens.map((t) => content.parts[t.partId]);
  if (ask.kind === 'anatomy') {
    return ask.want.every(({ slot, tag }) => parts.some((p) => p.slot === slot && (p.tags ?? []).includes(tag)));
  }
  if (ask.kind === 'species') {
    const kinds = new Set(parts.map((p) => p.species));
    return kinds.size === ask.count && kinds.has(ask.species);
  }
  if (ask.kind === 'frame' && chimera.frame !== ask.frame) return false;
  const report = analyze(chimera.frame, tokens, content, tokens.length);
  if (ask.kind === 'frame') return report.mass < ask.under;
  return report.creatureClass === ask.cls
    && movesFromTokens(tokens, report, content).some((m) => (m.tags ?? []).includes(ask.move));
}

const noun = (content, { slot, tag }) => content.commissions?.nouns?.[`${slot}:${tag}`]
  ?? (content.commissions?.slots?.[slot]
    ? fill(content.commissions.slots[slot], { a: an(tag), tag: tag.toLowerCase() })
    : copy(content, 'commission.noun', { tag: tag.toLowerCase(), slot }));

// The request in the client's words.
export function askText(content, ask) {
  if (ask.kind === 'anatomy') {
    return copy(content, 'commission.ask_anatomy', { a: noun(content, ask.want[0]), b: noun(content, ask.want[1]) });
  }
  if (ask.kind === 'class') {
    const cls = classOf(content, ask.cls)?.name ?? ask.cls;
    return copy(content, 'commission.ask_class', { an: an(cls), cls, an2: an(ask.move), move: ask.move });
  }
  if (ask.kind === 'frame') {
    return copy(content, 'commission.ask_frame', { mass: ask.under, frame: content.frames[ask.frame]?.name ?? ask.frame });
  }
  const species = speciesOf(content, ask.species).name.toLowerCase();
  return copy(content, 'commission.ask_species', { count: ask.count, an: an(species), species });
}

export function rewardText(content, reward) {
  if (reward.kind === 'part') {
    return copy(content, 'commission.reward_part', { grade: reward.grade, part: content.parts[reward.partId]?.name ?? reward.partId });
  }
  if (reward.kind === 'notoriety') return copy(content, 'commission.reward_notoriety', { n: reward.amount });
  return copy(content, 'commission.reward_funds', { amount: fmtMoney(reward.amount) });
}

// Show the client a creature. Pays and closes the commission; the creature
// stays home. A part comes in through the Vault's door for a yield that
// cannot be refused, so a full shelf renders it and pays for it.
export function fulfilCommission(state, content, now, id, chimeraId) {
  const job = commissionBoard(state, content, now).find((c) => c.id === id);
  if (!job) return { ok: false, msg: copy(content, 'commission.gone') };
  const chimera = homeChimeras(state).find((c) => c.id === chimeraId);
  if (!chimera || !fits(content, job.ask, chimera)) return { ok: false, msg: copy(content, 'commission.no_fit') };
  const cam = state.campaign;
  const live = new Set(commissionWindows(state, content, now).map((w) => w.id));
  cam.commissionsDone = [...(cam.commissionsDone ?? []).filter((d) => live.has(d)), id];
  cam.commissionCount = (cam.commissionCount ?? 0) + 1;
  const { reward } = job;
  if (reward.kind === 'funds') state.funds += reward.amount;
  else if (reward.kind === 'notoriety') cam.notoriety = (cam.notoriety ?? 0) + reward.amount;
  else if (content.parts[reward.partId]) {
    admitParts(state, content, [{
      id: `t${state.inventory.tokenCount++}`, partId: reward.partId, grade: reward.grade, traits: [],
      donor: { name: job.client, species: content.parts[reward.partId].species, stars: 3, extractedAt: now },
    }]);
  }
  return { ok: true, job, msg: copy(content, 'commission.done', { client: job.client, name: chimera.name, reward: rewardText(content, reward) }) };
}
