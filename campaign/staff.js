// R181 — the hire board: who is on the books, how many slots there are, and
// the two verbs that change it. LAZY, the split R179 and R180 made: what
// runs on every tick (the hand's shift, the vet's round, the wage) lives in
// ranch/ranch.js because the clock is eager; this is only read by the War
// Room and the walker. Why each hire is shaped the way it is, and the rule
// that no two at one price may rank, are in data/notes/henchmen.md.

import { copy } from '../util/text.js';
import { onDuty, wageOf } from '../ranch/ranch.js';

// The roster, in the order the file declares — a fifth henchman is JSON.
export function hireRoster(content) {
  return Object.entries(content.henchmen ?? {})
    .map(([id, h]) => ({ id, ...h }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

// Few, and earned by the map: one to start, one more per `nodesPerSlot`
// held blocks, never past `maxSlots`.
export function slotsOf(state, content) {
  const t = content.henchmenMeta ?? {};
  const held = state.campaign?.heldNodes?.length ?? 0;
  return Math.min(t.maxSlots ?? 1, (t.slots ?? 1) + Math.floor(held / (t.nodesPerSlot || Infinity)));
}

// How many held blocks open the next slot, or null when there is no next.
export function nextSlotAt(state, content) {
  const t = content.henchmenMeta ?? {};
  if (slotsOf(state, content) >= (t.maxSlots ?? 1) || !t.nodesPerSlot) return null;
  return (slotsOf(state, content) - (t.slots ?? 1) + 1) * t.nodesPerSlot;
}

export function hiredOf(state) {
  return Array.isArray(state.staff?.hired) ? state.staff.hired : [];
}

// Why this hire cannot happen, as a sentence, or null when it can. One
// reason at a time, the most specific first, so a refusal names the thing
// the player can actually change.
export function hireBlock(state, content, id, now = state.lastTickAt ?? 0) {
  const h = content.henchmen?.[id];
  if (!h) return copy(content, 'staff.unknown');
  if (hiredOf(state).some((r) => r.id === id)) return copy(content, 'staff.already', { name: h.name });
  // R189 — an agent a lab hired away is theirs until the file's days run out.
  const gone = poachedOf(state, id);
  if (gone && gone.until > now) {
    return copy(content, 'staff.poached', {
      name: h.name,
      rival: content.rivals?.[gone.rivalId]?.name ?? copy(content, 'staff.poached_somebody'),
      days: Math.max(1, Math.ceil((gone.until - now) / 86400000)),
    });
  }
  const taken = onDuty(state, content, h.duty);
  if (taken) return copy(content, 'staff.duty_taken', { name: taken.h.name });
  if (hiredOf(state).length >= slotsOf(state, content)) return copy(content, 'staff.no_slot');
  return null;
}

// R189 — the book of who a lab hired away, read defensively: R114 says a
// save is untrusted input, and this is a map the tick writes and a player's
// file can carry anything in.
export function poachedOf(state, id) {
  const book = state.staff?.poached;
  const entry = book && typeof book === 'object' && !Array.isArray(book) ? book[id] : null;
  return entry && typeof entry === 'object' && Number.isFinite(entry.until) ? entry : null;
}

export function hire(state, content, now, id) {
  const block = hireBlock(state, content, id, now);
  if (block) return { ok: false, msg: block };
  state.staff ??= {};
  if (poachedOf(state, id)) delete state.staff.poached[id];
  state.staff.hired = hiredOf(state);
  state.staff.hired.push({ id, at: now, done: 0, missed: 0 });
  const h = content.henchmen[id];
  return { ok: true, msg: copy(content, 'staff.hired', { name: h.name, title: h.title }) };
}

export function letGo(state, content, id) {
  const rec = hiredOf(state).find((r) => r.id === id);
  if (!rec) return { ok: false, msg: copy(content, 'staff.not_hired') };
  state.staff.hired = hiredOf(state).filter((r) => r !== rec);
  return { ok: true, msg: copy(content, 'staff.let_go', { name: content.henchmen?.[id]?.name ?? id }) };
}

// What one hire costs per day right now, for the board. The same function
// the clock bills with, so the number on the card is the number charged.
export function wageNow(state, content, id) {
  return wageOf(state, content, { id });
}
