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
