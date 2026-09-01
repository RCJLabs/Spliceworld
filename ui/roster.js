// Ordering for the screens that list creatures. R45 put the Dex's combos
// into three groups because twenty-seven rows in file order buried the two
// you had found among the twenty-five you had not; the Ranch and the Pens
// had the same problem in a worse place — those are working screens, so a
// row you cannot find is a chore you do not do.
//
// The rule is the same on all three and lives here so they cannot drift
// into different opinions about it: GROUP BY WHAT YOU WOULD DO ABOUT A ROW,
// with the band you can act on first and the band that is only waiting
// last. Bands are declared in render order and an empty one disappears —
// a heading over nothing is worse than no heading.

// `bandOf` returns a band id; anything unrecognised falls into the last
// band rather than vanishing, because a creature that stops being listed
// is the failure mode this whole idea introduces.
export function banded(items, bands, bandOf) {
  const buckets = new Map(bands.map((b) => [b.id, []]));
  const last = bands[bands.length - 1];
  for (const item of items) {
    const id = bandOf(item);
    (buckets.get(id) ?? buckets.get(last.id)).push(item);
  }
  return bands
    .map((b) => ({ ...b, items: buckets.get(b.id) }))
    .filter((b) => b.items.length);
}

// The heading itself. Carries its own count because the whole point of a
// band is to say how much of your herd is in this state.
export function bandHead(label, n) {
  return `<p class="list-group">${label} <span class="lineage">${n}</span></p>`;
}

// Bands rendered straight through, for a screen whose rows are already
// self-contained markup (the Ranch and the Pens fold each creature into
// its own card, so there is nothing to wrap them in).
export function bandedHtml(items, bands, bandOf, rowOf) {
  return banded(items, bands, bandOf)
    .map((b) => bandHead(b.label, b.items.length) + b.items.map(rowOf).join(''))
    .join('');
}
