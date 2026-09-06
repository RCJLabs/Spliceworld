// R125 — WHAT IS THIS CHIMERA WORTH? The letter on the card, F through S.
//
// Asked for directly: a grade that says which creatures to keep, which to
// dismantle, and which to feed to the chaos vat. The hard part was never the
// letter — it was making the letter MEAN something, because this game
// already has three opinions about a creature (the class triangle, the
// briefing's forecast, and R123's team suggestion) and a fourth one that
// disagreed with them would only teach the player which to distrust.
//
// So the tier is not a weighted guess. It is a PREDICTION OF ONE MEASURED
// NUMBER: how often this build wins, alone, across every encounter the game
// ships. The model in `data/tiers.json` was fitted against 420 creatures
// fought over the whole 26-encounter table at 8 seeds each — 87,360 fights —
// and it explains R² = 0.79 of the variance. A letter is a band of that
// rate, so "B" is not a vibe, it is "clears about a quarter of the table on
// its own".
//
// That is also what makes the scale ABSOLUTE, which is the property the
// decision needs. The reference is the shipped encounter table, not your
// roster, so nothing you build elsewhere can re-letter a creature you did
// not touch. A grade you cannot trust to sit still is no use for deciding
// what to keep forever.
//
// WHAT THE MEASURING SAID, because three of the four things this was
// expected to weigh turned out to behave differently:
//
//   * TRAITS ARE THE BIGGEST LEVER IN THE GAME, and nobody had priced them.
//     Applied to every part at apex: thick_hide +12.2pp, dense_bones +8.2,
//     deep_lungs +7.3 — and hyperthyroid −21.8pp, which is a creature that
//     wins NOTHING, because stamina −10 six times over leaves it unable to
//     act. All twelve at once is +40.2pp. Traits reach the tier through the
//     stats they alter, which is also how the battle engine reads them.
//   * PART GRADES are second: standard → prismatic moves the solo rate 4% →
//     27%, a 23pp swing, and `gradeMult` is the single strongest term here.
//   * A COMBO is worth about +5.9pp — real, and worth naming on the card.
//   * THE MOVESET IS VERY NEARLY INERT: best-against-worst picks moved the
//     rate 1.0pp at standard and 2.6pp at apex. The reason is arithmetic
//     rather than design — the move pool averages 6.0 and you choose 4, so
//     there is hardly room to choose badly. It is therefore NOT a term in
//     the score. Folding a 2pp effect into a letter that spans 35pp would be
//     dressing noise up as a judgement. It is reported as a lever instead,
//     with its measured worth attached, which is the honest shape: "your
//     moves are costing you about 3pp" is a true and useful sentence, and
//     "this is a C because of your moves" is not.
//
// DOM-free, like the rest of the engine: the Theater previews an unbuilt
// splice through the same function the Pens grade a finished creature with,
// and the harness can price a build without a browser. R61 — one answer.
import { GRADES, GRADE_INDEX } from './extract.js';

// The letters, the cuts and the weights all live in `data/tiers.json`.
// Nothing here knows that the top one is called S: add a tier, move a cut or
// reweight a term as a data edit and this file does not change.
const tierData = (content) => content?.tiers ?? null;

// A build's predicted solo clear rate over the shipped encounter table.
// Everything it reads comes from the physiology report — the same report the
// dossier prints and the statblock fights from — so the tier cannot drift
// away from the creature it describes.
export function predictClearRate(report, tokens, content) {
  const data = tierData(content);
  if (!data || !report) return null;
  const w = data.model?.weights ?? {};
  const stats = report.stats ?? {};
  const feature = {
    gradeMult: meanGradeMult(tokens),
    hp: stats.hp ?? 0,
    armor: stats.armor ?? 0,
    power: stats.power ?? 0,
    stamina: stats.stamina ?? 0,
    speed: stats.speed ?? 0,
    combos: (report.combos ?? []).length,
    purebred: report.purebredSpecies ? 1 : 0,
  };
  let p = data.model?.intercept ?? 0;
  for (const [k, v] of Object.entries(w)) p += v * (feature[k] ?? 0);
  // A rate, so it cannot leave [0, 1] however the weights are edited.
  return { rate: Math.min(1, Math.max(0, p)), feature };
}

// The mean grade multiplier across the parts actually fitted. A missing or
// retired grade id resolves to Standard rather than throwing — R72's rule,
// because a save outlives the build that wrote it.
function meanGradeMult(tokens) {
  const list = [...(tokens ?? [])];
  if (!list.length) return GRADES[0].mult;
  let sum = 0;
  for (const t of list) {
    const idx = GRADE_INDEX[t?.grade];
    sum += (GRADES[idx] ?? GRADES[0]).mult;
  }
  return sum / list.length;
}

// Which band a rate falls in. Ordered by `min`, lowest first, with the
// bottom tier's `min` null so the scale always has a floor.
export function tierForRate(rate, content) {
  const data = tierData(content);
  const tiers = data?.tiers ?? [];
  if (!tiers.length) return null;
  let found = tiers[0];
  for (const t of tiers) {
    if (t.min === null || t.min === undefined) continue;
    if (rate >= t.min) found = t;
  }
  return found;
}

// THE ONE ENTRY POINT, and it takes a BUILD rather than a chimera so the
// Theater can ask about a splice that does not exist yet. `tierOf` below is
// the thin wrapper for a creature that does.
export function tierOfBuild(report, tokens, content, { moveset = null, known = null } = {}) {
  const p = predictClearRate(report, tokens, content);
  if (!p) return null;
  const band = tierForRate(p.rate, content);
  if (!band) return null;
  return {
    id: band.id,
    name: band.name,
    blurb: band.blurb,
    rate: p.rate,
    feature: p.feature,
    reasons: reasonsFor(p.feature, report, content),
    lever: leverFor(p.feature, report, content, moveset, known),
  };
}

export function tierOf(chimera, report, content, opts = {}) {
  const tokens = Object.values(chimera?.tokens ?? {});
  return tierOfBuild(report, tokens, content, { moveset: chimera?.moveset, ...opts });
}

// WHAT IS CARRYING THIS CREATURE, read off the same feature vector the score
// used rather than re-derived — a second opinion about a number we already
// have is how two explanations of one creature start disagreeing.
//
// Contributions, not raw values: `armor` has the largest weight per point
// but a build carries far more hp, so ranking by weight alone would tell
// every player the same thing about every creature.
function reasonsFor(feature, report, content) {
  const w = tierData(content)?.model?.weights ?? {};
  const parts = Object.entries(feature)
    .filter(([k]) => k !== 'purebred' && k !== 'combos')
    .map(([k, v]) => ({ k, share: (w[k] ?? 0) * v }))
    .sort((a, b) => b.share - a.share);
  const out = [];
  const top = parts[0];
  if (top) out.push(NICE[top.k] ?? top.k);
  if (feature.combos > 0) {
    const names = (report.combos ?? []).map((c) => c.name ?? c.id).filter(Boolean);
    out.push(names.length ? `${names.join(' + ')} firing` : `${feature.combos} combo${feature.combos === 1 ? '' : 's'} firing`);
  }
  if (feature.purebred) out.push(`a matched ${report.purebredSpecies} set`);
  return out;
}

const NICE = {
  gradeMult: 'the grade of its parts',
  hp: 'the bulk it carries',
  armor: 'its armour',
  power: 'raw power',
  stamina: 'stamina to keep swinging',
  speed: 'speed',
};

// THE ONE THING MOST WORTH DOING NEXT, priced. Every number quoted is
// measured: the grade step is what R84 guarantees a grade is worth, the
// moveset figure is R125's own best-against-worst measurement, and neither
// is a guess about this particular creature.
//
// The moveset lever exists precisely BECAUSE it is not in the score. It is
// small, it is real, and it is the only one of the four the player can act
// on without another extraction — so it belongs on the card as advice even
// though it does not belong in the letter.
function leverFor(feature, report, content, moveset, known) {
  const data = tierData(content);
  const worth = data?.movesetWorth ?? 0;
  const out = [];
  const idx = GRADE_INDEX[bestGradeId(feature)];
  if (feature.gradeMult < GRADES[GRADES.length - 1].mult) {
    out.push({
      id: 'grade',
      text: 'better-graded parts are the biggest single step — raise a donor before you extract it',
    });
  }
  if (!feature.combos && !feature.purebred) {
    out.push({ id: 'combo', text: 'no combo and no matched set — a combo is worth about 6 points of clear rate' });
  }
  if (Array.isArray(known) && Array.isArray(moveset) && known.length > moveset.length) {
    out.push({
      id: 'moveset',
      text: `its four moves are worth about ${Math.round(worth * 100)} points of clear rate all told — worth a look, but it will not move the letter`,
    });
  }
  void idx;
  return out;
}

function bestGradeId(feature) {
  // The nearest grade id to the mean multiplier, for reporting only.
  let best = GRADES[0].id;
  let gap = Infinity;
  for (const g of GRADES) {
    const d = Math.abs(g.mult - feature.gradeMult);
    if (d < gap) { gap = d; best = g.id; }
  }
  return best;
}
