// R91 — THE VAULT HAS A BOTTOM.
//
// Every list in this game was bounded except the ones that mattered.
// `penCapacity` was the only capacity anywhere — measured by grep across
// `ranch/`, `splice/`, `campaign/` and `save/` — so a day-180 save carried
// 9,451 part tokens and 2,059 vials and weighed 1.8 MB, of which 95.5% was
// `inventory`. Four save slots share one 5 MB localStorage quota, so four
// campaigns crossed it around day 124, and `saveGame` swallowed the failure:
// the game stopped saving and said nothing.
//
// So parts and vials are shelf space now, sold by the Extractor track the
// same way pens are sold by the ranch. Everything that puts something in the
// vault comes through here, because five push sites with five different
// ideas about capacity is how the first cap gets lost.
//
// TWO DOORS, TWO RULES. A yield you ASKED for is refused when it will not
// fit — that is the pens model, and it makes capacity a decision rather than
// a tax. A yield you were GIVEN (battle salvage, a Wing graduation) cannot
// be refused, because you never pressed a button: it is rendered down at the
// door and paid for, and the wire says so. Nothing is ever silently
// destroyed, which is the same promise `SAVE_VERSION` makes about saves.
import { extractorGrants } from './facility.js';
import { GRADE_INDEX } from './grades.js';

// What a part fetches when it is rendered down. A grade is worth more, which
// is the same staircase the rest of the game prices things on; the numbers
// are deliberately below what the same part is worth INSTALLED, because
// rendering is a relief valve and not an income stream (Law 2).
const RENDER_BASE = 12;
const RENDER_PER_GRADE = 22;

export function vaultCapacity(state, content) {
  const g = extractorGrants(state, content);
  return { parts: g.vaultParts, vials: g.vaultVials };
}

export function vaultRoom(state, content) {
  const cap = vaultCapacity(state, content);
  return {
    parts: Math.max(0, cap.parts - state.inventory.parts.length),
    vials: Math.max(0, cap.vials - state.inventory.vials.length),
    capacity: cap,
  };
}

// What one token is worth at the rendering door.
export function renderValue(token) {
  const tier = GRADE_INDEX[token.grade] ?? 0;
  return RENDER_BASE + tier * RENDER_PER_GRADE;
}

// WHICH PARTS GO FIRST when something has to. Worst grade first, and among
// equals the ones the Dex already remembers — so a rendering never takes the
// only token of an anatomy the player has not recorded yet.
function renderOrder(state, tokens) {
  const seen = new Set(state.dex?.parts ?? []);
  return [...tokens].sort((a, b) =>
    (GRADE_INDEX[a.grade] ?? 0) - (GRADE_INDEX[b.grade] ?? 0)
    || (seen.has(b.partId) ? 1 : 0) - (seen.has(a.partId) ? 1 : 0)
    || (a.traits?.length ?? 0) - (b.traits?.length ?? 0)
  );
}

// The door for a yield the player asked for. Returns what fits and what does
// not; the CALLER decides whether to refuse, because only the caller knows
// whether a button was pressed.
export function vaultFit(state, content, count) {
  const room = vaultRoom(state, content).parts;
  return { fits: count <= room, room, short: Math.max(0, count - room) };
}

// The door for a yield that cannot be refused. Admits what fits, renders the
// rest down at the door and pays for it.
export function admitParts(state, content, tokens) {
  const room = vaultRoom(state, content).parts;
  const admitted = tokens.slice(0, room);
  const rendered = tokens.slice(room);
  state.inventory.parts.push(...admitted);
  for (const token of admitted.concat(rendered)) {
    if (!state.dex.parts.includes(token.partId)) state.dex.parts.push(token.partId);
  }
  const paid = rendered.reduce((n, t) => n + renderValue(t), 0);
  state.funds += paid;
  return { admitted: admitted.length, rendered: rendered.length, paid };
}

// Render parts down on purpose, from the Vault screen. Ids rather than
// objects, because that is what a button can carry.
export function renderDown(state, content, ids) {
  const wanted = new Set(ids);
  const going = state.inventory.parts.filter((t) => wanted.has(t.id));
  if (!going.length) return { ok: false, msg: 'Nothing selected. The vat is idle and slightly disappointed.' };
  state.inventory.parts = state.inventory.parts.filter((t) => !wanted.has(t.id));
  const paid = going.reduce((n, t) => n + renderValue(t), 0);
  state.funds += paid;
  return {
    ok: true, count: going.length, paid,
    msg: `${going.length} part${going.length === 1 ? '' : 's'} rendered down for $${paid}. The shelves can breathe.`,
  };
}

// The Vault screen's one-tap relief valve: clear the worst of it.
//
// SURPLUS MEANS DUPLICATE, NOT CHEAP. The first rule here was "standard
// grade only", and on a real day-180 vault it found NOTHING: 152 prime, 98
// apex, 7 prismatic and 3 standard, because a player who raises animals well
// does not own bottom-grade parts. A relief valve that never opens is worse
// than none, so the rule is duplication — worst grade first among the
// duplicates, never the last token of an anatomy, never one carrying a
// trait. You cannot lose something you only had one of.
export function surplusParts(state, content, want = 1) {
  const byPart = new Map();
  for (const t of state.inventory.parts) byPart.set(t.partId, (byPart.get(t.partId) ?? 0) + 1);
  const keep = new Map();
  // Walk worst-first and spare exactly one of each anatomy — the BEST one,
  // which falls out of the order for free.
  const spare = [];
  for (const t of renderOrder(state, state.inventory.parts).reverse()) {
    if (!keep.has(t.partId)) { keep.set(t.partId, t); continue; }
    if ((t.traits ?? []).length) continue;
    spare.push(t);
  }
  return renderOrder(state, spare).slice(0, want);
}

// A VIAL RETIRES INTO THE DEX. The entry's own idea and the right one: a
// vial is a by-product the player rarely chooses, so a hard refusal would
// only ever be an obstruction. Past capacity the oldest retires, and its
// species is recorded — the donor's genes stay REMEMBERED when the vial is
// gone, which is what the Dex is for.
export function admitVial(state, content, vial) {
  const inv = state.inventory;
  inv.vials.push(vial);
  const cap = vaultCapacity(state, content).vials;
  const retired = [];
  while (inv.vials.length > cap) {
    // Never the one just handed over. `cancelResequence` returns a vial the
    // player already owned and whose `extractedAt` is its ORIGINAL draw, so
    // without this the relief valve would eat exactly the thing it is
    // giving back.
    const others = inv.vials.filter((v) => v !== vial);
    if (!others.length) break;
    const oldest = others.reduce((a, b) => ((a.extractedAt ?? 0) <= (b.extractedAt ?? 0) ? a : b));
    inv.vials.splice(inv.vials.indexOf(oldest), 1);
    retired.push(oldest);
    state.dex.species ??= [];
    if (!state.dex.species.includes(oldest.species)) state.dex.species.push(oldest.species);
  }
  return { retired: retired.length, species: retired.map((v) => v.species) };
}

// R91 — how full is it, in a sentence a screen or an agenda row can use.
export function vaultPressure(state, content) {
  const cap = vaultCapacity(state, content);
  const parts = state.inventory.parts.length;
  return {
    parts, vials: state.inventory.vials.length, capacity: cap,
    full: parts >= cap.parts,
    tight: parts >= Math.floor(cap.parts * 0.85),
    free: Math.max(0, cap.parts - parts),
  };
}

// R91 — A SAVE THAT PREDATES THE CAP IS PAID, NOT PRUNED.
//
// Every save written before v46 could hold anything: a day-180 one carries
// 9,451 tokens against a capacity of 400. Deleting nine thousand of them on
// load is exactly the silent loss `SAVE_VERSION` exists to prevent, so they
// are rendered down instead and the money goes into the bank at the same
// price the Vault screen's own button pays.
//
// `surplusParts` decides what goes, so the rule is the one already written
// down: worst duplicates first, one of every anatomy kept, nothing carrying
// a trait. A player landing here keeps one of everything they ever collected
// plus the best of the rest, and is paid for the difference.
//
// This runs on the world tick rather than in the migration because capacity
// comes from `data/facility.json` and a migration is handed a save and
// nothing else. It also means the rule reaches any over-capacity save
// however it got there, not only one that came through the v45 door.
export function consolidateVault(state, content) {
  const over = state.inventory.parts.length - vaultCapacity(state, content).parts;
  if (over <= 0) return null;
  const going = surplusParts(state, content, over);
  if (!going.length) return null;
  const r = renderDown(state, content, going.map((t) => t.id));
  return r.ok ? { count: r.count, paid: r.paid } : null;
}
