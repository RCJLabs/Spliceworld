// R110/R174 — THE ONE READER FOR COPY IN DATA, AND THE ONE FILLER. A leaf on
// purpose: copy is read by the battle engine, the ranch, the save system and
// every screen, so its reader cannot live in any of them. Eager for that
// reason, and MODULE_CAP carries the line. R174 found six fillers where the
// entry said two and three disagreed; the contract is in tools/smoke.js, which
// counts the `.replace()` SHAPE because three of the six were anonymous.
// ROADMAP R174.

// Replace {placeholder} with a value. An unknown key is left ALONE rather than
// printed as "undefined" — R62's rule for the wire, for the same reason: a
// typo should read oddly, not break the sentence it is in.
export function fill(template, vars = {}) {
  if (!template) return null;
  return String(template).replace(/\{(\w+)\}/g, (whole, key) => (
    vars[key] != null ? String(vars[key]) : whole
  ));
}

// One sentence out of `data/copy.json`, by dotted id, filled.
//
// Returns null for an id the file does not carry, which is what makes the
// missing-id gate possible: a caller that asks for copy nobody wrote gets
// nothing rather than a plausible-looking blank, and smoke walks every id in
// the file against every id asked for in the source.
export function copy(content, id, vars = {}) {
  let at = content?.copy;
  for (const key of String(id).split('.')) at = at?.[key];
  return typeof at === 'string' ? fill(at, vars) : null;
}

// R113 — the one money formatter. `$153249` was printed at 72 sites.
export function fmtMoney(n) {
  const v = Math.round(Number(n) || 0);
  return `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US')}`;
}

// R114 — THE ONE CLEANER AND THE ONE ESCAPER, and the only place either is
// explained. The tree had FIVE escapers and THREE copies of the strip rule;
// they disagreed, and the weakest of each was the one with the most callers.
//
// Two rules, not one, because they are asked at two moments. A name is CLEANED
// where a person types it or a file hands it over, so the save never carries a
// character that could open a tag. Everything is ESCAPED at the moment of
// printing, so a field nobody thought to clean still renders as text. Either
// alone is one forgotten field, or one forgotten site, from the same defect.

// Typed text, narrowed. Markup characters are REMOVED rather than escaped —
// `renameCreature`'s rule since M3: a name is a label, not a document, and a
// stored `&amp;` reads as `&amp;` everywhere that is not HTML.
export function safeText(value, limit = 40) {
  return String(value ?? '')
    .replace(/[<>&"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, Math.max(1, limit));
}

// The printing side. All five characters: screens interpolate into single- and
// double-quoted attributes as well as text, and the copy with 26 callers
// escaped neither `>` nor `'`.
const ENTITY = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ENTITY[c]);
}
