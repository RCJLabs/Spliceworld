// R112 — THE YEARBOOK. Every counter the save keeps, on one screen, read out
// of `data/yearbook.json` rather than out of this file.
//
// The save has carried about twenty lifetime tallies since M0 and rendered
// exactly one of them (`warRecord`, on the War Room's econ row). The rest
// were written faithfully every session and never shown to anybody: 1,853
// chimeras made, 21,745 parts extracted, $445k levied. A number a player
// cannot see is not a reward, it is a serialization cost.
//
// THE RULE THIS MODULE EXISTS TO ENFORCE is CLAUDE.md's: a row is a line in
// a JSON file. Adding a counter to the Yearbook must cost one object in
// `data/yearbook.json` and nothing here — `from` is a dotted path into the
// save and `fmt` picks from the four formatters below. The one thing that
// still costs an engine edit is a NEW DERIVATION, because a statistic
// nobody has computed yet is a computation and not content; those are the
// three `DERIVE` entries, and `tools/smoke.js` asserts every `derive` a row
// names is one of them.
//
// DOM-free, like every other reader in `save/`: `runSummary` needs it in
// Node and the Dex needs it in a browser, so it renders nothing itself.

// R112 — the save's own idea of a lifetime, so `runSummary` and the
// Yearbook's "days on the books" cannot disagree about what a day is.
export function daysPlayed(state, now = Date.now()) {
  if (!state?.createdAt) return 0;
  return Math.max(0, Math.floor((now - state.createdAt) / 86400000));
}

function at(state, path) {
  let node = state;
  for (const key of String(path).split('.')) node = node?.[key];
  return node;
}

// R113 will give the whole game one `fmtMoney` through Intl; until then this
// is the same grouping the rest of the screens do by hand, in one place.
function grouped(n) {
  return Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const FMT = {
  count: (v) => grouped(v ?? 0),
  money: (v) => `$${grouped(v ?? 0)}`,
  record: (v) => `${grouped(v?.wins ?? 0)}W–${grouped(v?.losses ?? 0)}L`,
  days: (v) => `${grouped(v ?? 0)} ${Math.round(Number(v) || 0) === 1 ? 'day' : 'days'}`,
  text: (v) => (v == null || v === '' ? '—' : String(v)),
};

// The three statistics the counters cannot state, each a function of the
// save and nothing else. A row asks for one by name; smoke asserts the name
// resolves, so a typo in the data file is a red gate rather than a blank row.
const DERIVE = {
  days: (state, _content, now) => daysPlayed(state, now),
  // The one who has been here the whole time. Ties break on the older id,
  // which is the order they were made in, so the answer is stable.
  longestServing: (state) => {
    const roster = Array.isArray(state?.chimeras) ? state.chimeras : [];
    let best = null;
    for (const c of roster) {
      if (!c) continue;
      const born = Number.isFinite(c.createdAt) ? c.createdAt : Infinity;
      const bestBorn = best && Number.isFinite(best.createdAt) ? best.createdAt : Infinity;
      if (!best || born < bestBorn) best = c;
    }
    return best?.name ?? null;
  },
  // `directorStats.partUse` has been counting since day one for an AI
  // director that has not landed yet (ROADMAP §8.5). It is the only place
  // the save knows what the player actually reaches for.
  mostUsedPart: (state, content) => {
    const use = state?.directorStats?.partUse ?? {};
    let bestId = null;
    let bestN = 0;
    for (const [id, n] of Object.entries(use)) {
      if (!(Number(n) > bestN)) continue;
      bestN = Number(n);
      bestId = id;
    }
    if (!bestId) return null;
    const name = content?.parts?.[bestId]?.name ?? bestId;
    return `${name} · ${grouped(bestN)}`;
  },
  // R186 — the unique the county still talks about: this run's if it found
  // one, otherwise the last one any lab of yours brought home before a
  // relocation. Who, where, and which lab, because that is the whole story.
  legend: (state, content) => {
    const last = [...(state?.legends ?? []), ...(state?.campaign?.legendsFound ?? [])].at(-1);
    if (!last?.name) return null;
    return [last.name, content?.regions?.[last.region]?.name, last.lab].filter(Boolean).join(' · ');
  },
};

export const DERIVATIONS = Object.keys(DERIVE);

// Every row in the file, in authored order, with its value already formatted.
// `raw` travels beside it so a caller that wants the number rather than the
// string — `runSummary` does — is not left parsing its own output back.
export function yearbook(state, content, now = Date.now()) {
  const sections = content?.yearbook?.sections ?? [];
  return sections.map((section) => ({
    id: section.id,
    label: section.label,
    icon: section.icon,
    blurb: section.blurb,
    rows: (section.rows ?? []).map((row) => {
      const raw = row.derive ? DERIVE[row.derive]?.(state, content, now) ?? null : at(state, row.from);
      return {
        id: row.id,
        label: row.label,
        sub: row.sub ?? null,
        // R112 — the handful the relocation confirmation has room for. Which
        // ones is a field in the data file, not a list in `save/slots.js`,
        // or the run boundary and the Dex would drift about what a run is.
        headline: row.headline === true,
        raw,
        value: (FMT[row.fmt] ?? FMT.text)(raw),
      };
    }),
  }));
}

// One row by id, across every section — what a caller wants when it needs a
// single statistic and not the page. Null for an id the file does not carry.
export function yearbookRow(state, content, id, now = Date.now()) {
  for (const section of yearbook(state, content, now)) {
    for (const row of section.rows) if (row.id === id) return row;
  }
  return null;
}

// The few rows marked `headline` in the data file, flattened across sections
// in authored order. What a screen shows when it has one line, not a page.
export function yearbookHeadline(state, content, now = Date.now()) {
  return yearbook(state, content, now).flatMap((s) => s.rows).filter((r) => r.headline);
}
