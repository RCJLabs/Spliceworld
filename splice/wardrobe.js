// R214 — THE WARDROBE: the dyes and accessories a lab has earned, and putting
// them on a chimera. The rules are in data/notes/cosmetics.md. Lazy, with the
// Pens and the walker; the one eager line is in splice/extract.js, where a
// graduation adds its species to `wardrobe.dyes`.
//
// A LOOK NEVER BECOMES A NUMBER. Nothing in the battle, the physiology, the
// tier or the economy reads `chimera.look`. Smoke holds the tree to that, and
// `node tools/sim.js --cosmetics` fights every build dressed and undressed.

import { analyze } from './physiology.js';
import { tierOf } from './tier.js';
import { slotOf } from '../render/cosmetics.js';
import { fill } from '../util/text.js';

export const wardrobe = (state) => (state.wardrobe ??= { dyes: [], unlocked: [] });

// What each lab-wide unlock reads. All of it is already in the save, and all
// of it but the ribbons only ever goes up; an accessory is kept once earned
// (`wardrobe.unlocked`), so a ribbon that leaves with its winner does not
// take the bow tie with it.
const PROGRESS = {
  notoriety: (s) => s.campaign?.notorietyPeak ?? 0,
  commissions: (s) => s.campaign?.commissionsDone?.length ?? 0,
  ribbons: (s) => (s.chimeras ?? []).reduce((n, c) => n + (Array.isArray(c.ribbons) ? c.ribbons.length : 0), 0),
  gauntlet: (s) => s.gauntletBeaten?.length ?? 0,
};

// Every accessory in the data, each marked earned or not, with what earns it.
// Records anything newly earned. A `tier` row is a creature's own and is
// never earned by the lab; a kind this file does not know is never earned.
export function accessories(state, content) {
  const w = wardrobe(state);
  return (content.cosmetics?.accessories ?? []).map((row) => {
    const u = row.unlock ?? {};
    const earned = u.kind !== 'tier' && (w.unlocked.includes(row.id) || (PROGRESS[u.kind]?.(state) ?? -1) >= (u.min ?? 1));
    if (earned && !w.unlocked.includes(row.id)) w.unlocked.push(row.id);
    return { ...row, earned, hint: fill(content.cosmetics?.unlocks?.[u.kind] ?? '', u) };
  });
}

// A creature's letter, as the Pens show it on the fold.
function letterOf(chimera, content) {
  const tokens = Object.values(chimera.tokens ?? {}).filter((t) => content.parts[t.partId]);
  return tierOf(chimera, analyze(chimera.frame, tokens, content, tokens.length), content)?.id ?? null;
}

// Which accessories this creature may put on. `letter` is its tier id when
// the caller already has it (the Pens card does, for its fold), so a stable
// of open cards is not graded twice; otherwise it is read here, once.
export function wearable(state, content, chimera, letter) {
  const order = (content.tiers?.tiers ?? []).map((t) => t.id);
  let got = letter;
  const meets = (tier) => {
    if (got === undefined) got = letterOf(chimera, content);
    return got != null && order.includes(tier) && order.indexOf(got) >= order.indexOf(tier);
  };
  return accessories(state, content)
    .map((row) => ({ ...row, ok: row.unlock?.kind === 'tier' ? meets(row.unlock.tier) : row.earned }));
}

// The dyes the lab owns: every species that has graduated, if it still has a
// palette to lend.
export const dyesOf = (state, content) =>
  wardrobe(state).dyes.filter((id) => content.species[id]?.palette);

// A look with nothing in it is no look: the field goes, so a natural creature
// saves exactly as it did before there was a wardrobe.
function tidy(chimera) {
  const l = chimera.look;
  if (l && !l.dye && !(l.wear?.length)) delete chimera.look;
}

export function setDye(state, content, chimeraId, speciesId) {
  const ch = state.chimeras.find((c) => c.id === chimeraId);
  if (!ch) return { ok: false };
  if (speciesId && !dyesOf(state, content).includes(speciesId)) return { ok: false };
  ch.look = { ...(ch.look ?? {}), dye: speciesId || null };
  tidy(ch);
  return { ok: true };
}

// Put an accessory on, or take it off. One to a slot: a hat replaces a hat.
export function toggleWear(state, content, chimeraId, id) {
  const ch = state.chimeras.find((c) => c.id === chimeraId);
  const row = ch && wearable(state, content, ch).find((r) => r.id === id);
  if (!row) return { ok: false };
  const worn = Array.isArray(ch.look?.wear) ? ch.look.wear : [];
  if (worn.includes(id)) {
    ch.look = { ...ch.look, wear: worn.filter((x) => x !== id) };
  } else {
    if (!row.ok) return { ok: false };
    const rows = content.cosmetics.accessories;
    ch.look = { ...(ch.look ?? {}), wear: [...worn.filter((x) => slotOf(rows.find((r) => r.id === x) ?? {}) !== slotOf(row)), id] };
  }
  tidy(ch);
  return { ok: true };
}
