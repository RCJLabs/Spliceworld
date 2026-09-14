// R96/R167 — THE DESCRIPTION HALF OF R30'S MOVESETS, SPLIT OUT.
const pct = (v) => `${Math.round(v * 100)}%`;

//
// `battle/moves.js` is eager: `statblock.js` and `engine.js` read MOVE_SLOTS,
// activeMoves, defaultPick, partMoveId and comboMoveId synchronously to
// describe a creature, so the whole 7.2 KB module was compiled before the
// first paint. `tools/boot.js` excused it in RUNS_NOTHING_BUT_BELONGS on the
// grounds that it "has more than one eager importer" — true, and never the
// question. These four functions turn a move into WORDS, and the only things
// that want words are `battle/ui.js` and `splice/pens-ui.js`, both of which
// R74 already made lazy.
//
// So the leaf the engine reads stays eager and the prose the screens read
// arrives with the screen. R153's move, one step further.


// One keyword, rendered with THIS move's magnitude. The sentence lives in
// keywords.json so a new keyword needs no engine edit (Law: all content is
// data); this only substitutes.
export function keywordEffect(id, value, content) {
  const kw = content.keywords?.[id];
  if (!kw?.effect) return null;
  const n = typeof value === 'number' ? value : 1;
  return kw.effect
    .replace('{pct}', pct(n > 1 ? n / 100 : n))
    .replace('{n}', String(n))
    .replace(/\bby (\d+) stage\b/, (s, d) => `by ${d} stage${Number(d) === 1 ? '' : 's'}`);
}

// The line under a move's name on the button. For an attack the damage
// preview already carries the number, so this says what ELSE it does; for a
// utility move it is the only thing standing between the player and the
// word "util".
export function moveSummary(move, content) {
  const effects = Object.entries(move.keywords ?? {})
    .map(([k, v]) => keywordEffect(k, v, content))
    .filter(Boolean);
  if (!effects.length) return move.power > 0 ? 'A plain, honest swing.' : 'Does nothing on its own.';
  return effects[0];
}

// Everything, for the sheet a long press opens.
export function moveDetail(move, content) {
  const lines = Object.entries(move.keywords ?? {}).map(([k, v]) => ({
    name: content.keywords?.[k]?.name ?? k,
    text: keywordEffect(k, v, content) ?? content.keywords?.[k]?.desc ?? '',
  })).filter((l) => l.text);
  return {
    name: move.name,
    power: move.power,
    cost: move.cost,
    acc: move.acc,
    tags: move.tags ?? [],
    source: move.sourceLabel ?? null,
    kind: move.power > 0 ? 'attack' : 'utility',
    // Tags are the half of the damage rules a player can act on, so they are
    // spelled out rather than left as three words in a row.
    tagNotes: (move.tags ?? []).map((t) => tagNote(t, content)).filter(Boolean),
    effects: lines,
  };
}

// What carrying this attack tag means, read off the chart rather than
// remembered — so a new row in keywords.json shows up here for free.
export function tagNote(tag, content) {
  const rows = (content.tagChart ?? []).filter((r) => r.attack === tag);
  if (!rows.length) return null;
  const parts = rows.map((r) =>
    r.rule === 'ignoreArmor' ? `ignores Armor on ${r.defender} targets`
      : r.mult === 0 ? `does nothing at all to ${r.defender} targets`
      : `×${r.mult} against ${r.defender} targets`);
  return `${tag}: ${parts.join(', ')}.`;
}
