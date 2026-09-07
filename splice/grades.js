// The grade staircase (M2, balanced in R3).
//
// Stat multipliers feed the battle engine in M4; Apex/Prismatic ability
// upgrades land with the keyword resolver, also M4. The ladder used to be
// 1 / 1.25 / 1.5 / 2.0, which made Prismatic a leap rather than a step —
// every encounter went from a wall to a formality in one husbandry tier.
// Even steps now, and the difficulty curve (enemies.json tierScale) answers
// each one.
//
// R91 — this lives apart from `splice/extract.js` because the vault has to
// price a rendering by grade, and the Extractor imports the vault. Two
// modules that need each other's constants is a cycle; a leaf they both read
// is not. `extract.js` re-exports both names, so nothing else moved.
export const GRADES = [
  { id: 'standard', name: 'Standard', mult: 1 },
  { id: 'prime', name: 'Prime', mult: 1.2 },
  { id: 'apex', name: 'Apex', mult: 1.4 },
  { id: 'prismatic', name: 'Prismatic', mult: 1.65 },
];
export const GRADE_INDEX = Object.fromEntries(GRADES.map((g, i) => [g.id, i]));
