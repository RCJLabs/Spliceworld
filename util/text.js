// R110 — THE ONE READER FOR COPY THAT LIVES IN DATA.
//
// CLAUDE.md has said "all content is data" since M0. R109 found 1,265 wire
// lines written inside engine modules and moved them; counting the rest found
// **5,043 more words** of player-facing prose in JS string literals, a quarter
// of everything this game says. This is the function that lets a module stop
// holding its own sentences.
//
// A LEAF ON PURPOSE. Copy is read by the battle engine, the ranch, the save
// system and every screen, so its reader cannot live in any of them — putting
// it in `campaign/` would point the battle engine at the campaign for one
// regex, which is the objection `splice/resequencer.js` raised when it kept a
// local filler rather than import one.
//
// WHY `fill` IS STILL DUPLICATED IN campaign/monologue.js, which is the thing
// this module was supposed to end: the eager import graph is at **49 of 49**
// against `MODULE_CAP`, and `monologue.js` is eager, so importing from here
// would make this module the fiftieth and fail the budget. R169 spent a whole
// milestone getting one module OUT of that graph; putting one back is a cap
// argument, not a paragraph at the end of an unrelated migration. Filed as
// R174 with the two lines that have to move. Until then this module is
// reached only by LAZY modules, and the two `fill`s are held equal by the gate
// in tools/smoke.js rather than by anybody remembering.

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
