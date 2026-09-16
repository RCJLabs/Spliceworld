// R108 — A CREATURE YOU CAN HAND TO SOMEBODY.
//
// Until now there was no way to take a creature out of this app. The only
// download the game has ever produced is the save file, `navigator.share`
// appears nowhere, and a genome you spent a campaign assembling could not
// leave the device it was built on. The full reasoning is in
// data/notes/cards.md; the three rules this file obeys are below.
//
// ONE FILE, NO BACKEND. A card is a self-contained `<svg>`: portrait, name,
// lab, grades and moves drawn, the genome in `<metadata>` as JSON, and a
// short printed CODE under the portrait. Nothing here talks to a server,
// because there is no server and this milestone does not add one.
//
// TWO DOORS, BECAUSE A FILE IS A THING PHONES LOSE. The SVG is the good
// door. The code is the one a player can read down a phone to a friend, and
// it is deliberately restricted to characters that survive a URL, a chat app
// and being read aloud.
//
// AND IT ESCAPES, BECAUSE R114 HAS NOT SHIPPED. This is the first feature in
// the game that takes a file from ANOTHER PERSON, and R114 has already
// measured that 263 `.name` fields in this tree are interpolated unescaped.
// Rendering a stranger's creature name through one of those would be opening
// the exact hole R114 exists to close, one milestone early. So this file
// escapes what it draws and `campaign/visiting.js` sanitises what it keeps.
//
// Every sentence a player reads here lives in data/cards.json, including the
// refusals: a refusal is the most-read prose in an import feature, and CLAUDE
// .md's rule does not have a carve-out for error text.

import { creaturePortrait } from '../render/renderer.js';
import { chimeraGenome } from './theater.js';
import { unitFromGenome } from '../battle/statblock.js';
import { GRADE_INDEX } from './grades.js';

// The card's own, because `render/renderer.js` keeps its `esc` private and a
// second copy here is cheaper than widening that module's surface for one
// caller. Five characters, the same five.
function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const DEFAULTS = {
  card: { width: 420, height: 560, codeLimit: 120, nameLimit: 40, palette: {} },
  exhibition: {},
  refusals: {},
};

export function cardTuning(content) {
  const t = content?.cards ?? {};
  return {
    card: { ...DEFAULTS.card, ...(t.card ?? {}) },
    exhibition: t.exhibition ?? {},
    refusals: t.refusals ?? {},
  };
}

// One filler for the whole system: `{name}` in data, values here. A missing
// sentence falls back to its key rather than to `undefined`, so a data file
// that forgets a refusal still refuses.
export function say(content, key, vars = {}) {
  const line = cardTuning(content).refusals[key]
    ?? cardTuning(content).exhibition[key]
    ?? key;
  return String(line).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}

const no = (content, key, vars) => ({ ok: false, msg: say(content, key, vars) });

const GRADE_LETTER = { standard: 's', prime: 'p', apex: 'a', prismatic: 'x' };
const LETTER_GRADE = Object.fromEntries(Object.entries(GRADE_LETTER).map(([k, v]) => [v, k]));

// SOCKET ORDER IS CARRIED, NOT CANONICALISED, and the gate is why. The first
// draft sorted sockets into a fixed head-forelimbs-hindlimbs order so that
// two cards of one creature would be the same string. They already are — a
// creature is one object with one key order — and the sort cost something
// real: `movesFromTokens` walks the tokens in the order it is handed them,
// so re-sorting them handed back a creature with the same stats and a
// DIFFERENT moveset. Rule 1 of the card is that the stat block round-trips,
// and this was the round trip quietly failing it. So every path here — the
// code, the metadata and the build — keeps the order it was given.
const socketOrder = (tokens) => Object.keys(tokens ?? {});

// THE CODE. `frame~partId.grade` joined by `~`, with the part id's own
// underscores kept — the whole thing stays inside the unreserved URL set, so
// it can be pasted into a chat, a URL or a text field without escaping.
//
// THE SOCKET IS NOT IN IT, because a part already knows which one it goes in
// (`content.parts[id].slot`), and naming it twice made the code unreadable
// rather than merely long: the worst genome today's content can build ran to
// 179 characters with sockets and 138 without. A code nobody would retype is
// not a second door, and the gate measures that bound against the data
// rather than trusting this sentence.
export function genomeCode(chimera) {
  const tokens = chimera?.tokens ?? {};
  const body = socketOrder(tokens)
    .map((socket) => `${tokens[socket].partId}.${GRADE_LETTER[tokens[socket].grade] ?? 's'}`)
    .join('~');
  return `${chimera?.frame ?? '?'}~${body}`;
}

export function decodeCode(code, content) {
  if (typeof code !== 'string' || !code.trim()) return no(content, 'noCode');
  const [frame, ...rest] = code.trim().split('~');
  if (!frame || !rest.length) return no(content, 'noAnatomy');
  const tokens = {};
  for (const chunk of rest) {
    const [partId, letter] = chunk.split('.');
    if (!partId) return no(content, 'badChunk', { chunk });
    // A part this lab does not have has no slot to file itself under, so it
    // is kept under its own id and `visitingSpecimen` refuses it BY NAME —
    // which is the sentence the player can act on. Dropping it here would
    // turn a typo into a silently smaller creature.
    const socket = content?.parts?.[partId]?.slot ?? partId;
    tokens[socket] = { id: `card-${socket}`, partId, grade: LETTER_GRADE[letter] ?? 'standard', traits: [] };
  }
  return { ok: true, frame, tokens, name: null, lab: null };
}

// What the card draws under the portrait. Read from the creature through the
// same physiology the rivals use, so the card cannot disagree with the Pens
// about the same animal.
function statLines(chimera, content) {
  const unit = unitFromGenome(
    { id: 'card', name: chimera.name ?? cardTuning(content).card.nameFallback, frame: chimera.frame,
      tokens: Object.values(chimera.tokens ?? {}) },
    content
  );
  return {
    unit,
    stats: ['hp', 'power', 'armor', 'speed', 'stamina'].map((k) => `${k} ${unit[k]}`).join('  '),
    moves: (unit.moves ?? []).map((m) => content.keywords?.[m.id ?? m]?.name ?? m.id ?? m),
  };
}

// The card. A portrait the renderer already knows how to draw, the words
// around it, the code, and the genome in `<metadata>` for the importer that
// does not want to parse a picture.
export function cardSVG(chimera, state, content) {
  const t = cardTuning(content);
  const { w, h } = { w: t.card.width, h: t.card.height };
  const p = { ground: '#0e1116', rule: '#3ad17a', ink: '#e6edf3', muted: '#9fb3c8', ...t.card.palette };
  const { stats, moves } = statLines(chimera, content);
  const code = genomeCode(chimera);
  const name = chimera.name ?? t.card.nameFallback ?? 'Specimen';
  const lab = state?.profile?.lab ?? state?.starterLabName ?? t.card.labFallback ?? '';
  const grades = socketOrder(chimera.tokens ?? {})
    .map((s) => (chimera.tokens[s].grade ?? 'standard')[0].toUpperCase()).join('');
  // The portrait is the game's own renderer — `creaturePortrait` is the one
  // call that ALWAYS returns an <svg> (R79's empty crate for a chassis nobody
  // has), so a card of a creature built on retired content still draws. Its
  // inner markup is lifted out and re-placed inside this one rather than
  // nested, which Safari draws inconsistently.
  const portrait = creaturePortrait(chimeraGenome(chimera, content), content)
    .replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

  // `<metadata>` is the good door: JSON, no parsing of drawn text required.
  const meta = JSON.stringify({
    app: 'spliceworld-card',
    v: 1,
    frame: chimera.frame,
    name: chimera.name ?? null,
    lab,
    scars: (chimera.scars ?? []).length,
    tokens: Object.fromEntries(socketOrder(chimera.tokens ?? {})
      .map((s) => [s, { partId: chimera.tokens[s].partId, grade: chimera.tokens[s].grade }])),
  });

  const text = (y, size, fill, body) => `<text x="${w / 2}" y="${y}" text-anchor="middle" `
    + `fill="${fill}" font-family="monospace" font-size="${size}">${esc(body)}</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" `
    + `role="img" aria-label="Specimen card: ${esc(name)}">`
    + `<metadata>${esc(meta)}</metadata>`
    + `<rect width="${w}" height="${h}" fill="${p.ground}"/>`
    + `<rect x="10" y="10" width="${w - 20}" height="${h - 20}" fill="none" stroke="${p.rule}" stroke-width="2"/>`
    + `<g transform="translate(${w / 2} 210) scale(0.38)">${portrait}</g>`
    + text(60, 26, p.rule, name)
    + text(84, 13, p.muted, lab)
    + text(420, 14, p.ink, `${chimera.frame} · ${grades}`)
    + text(444, 12, p.muted, stats)
    + text(468, 12, p.muted, moves.join(' / '))
    + text(516, 11, p.rule, code)
    + text(538, 10, p.muted, t.card.footer ?? '')
    + '</svg>';
}

// Read a card back. The metadata first, because it is exact; the printed code
// second, because a card that has been through a screenshot and a retype
// still has its code. Never throws — a stranger's file is not a promise.
export function readCard(svgText, content) {
  if (typeof svgText !== 'string') return no(content, 'notAFile');
  const meta = svgText.match(/<metadata>([\s\S]*?)<\/metadata>/);
  if (meta) {
    const raw = meta[1]
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    try {
      const data = JSON.parse(raw);
      if (data?.app === 'spliceworld-card' && data.frame && data.tokens) {
        return {
          ok: true,
          frame: data.frame,
          name: data.name ?? null,
          lab: data.lab ?? null,
          tokens: Object.fromEntries(Object.entries(data.tokens).map(([socket, tok]) =>
            [socket, { id: `card-${socket}`, partId: tok?.partId, grade: tok?.grade ?? 'standard', traits: [] }])),
        };
      }
    } catch {
      // A card whose metadata is corrupt still has a printed code.
    }
  }
  const printed = svgText.match(/>([A-Za-z0-9._~-]*~[A-Za-z0-9._~-]+)</);
  if (printed) return decodeCode(printed[1], content);
  if (/^[A-Za-z0-9._~-]+~/.test(svgText.trim())) return decodeCode(svgText, content);
  return no(content, 'noSpecimen');
}

// VALIDATE AND BUILD, in that order, and refuse by NAME. R114 would own this
// one day; it is not here, so R108 does its own and says which id was wrong,
// because "invalid card" tells a player nothing they can act on.
export function visitingSpecimen(card, content) {
  const t = cardTuning(content);
  if (!card || typeof card !== 'object') return no(content, 'nothing');
  if (card.ok === false) return card;
  if (typeof card.frame !== 'string' || !content?.frames?.[card.frame]) {
    return no(content, 'badFrame', { frame: card.frame });
  }
  const tokens = card.tokens;
  if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens) || !Object.keys(tokens).length) {
    return no(content, 'emptyTokens');
  }
  const built = [];
  for (const socket of socketOrder(tokens)) {
    const token = tokens[socket];
    const partId = token?.partId;
    if (typeof partId !== 'string' || !content.parts?.[partId]) {
      return no(content, 'badPart', { partId, socket });
    }
    // A grade arrives as a word from the metadata or a letter from the code;
    // both are checked against the one staircase rather than against a list
    // this file keeps, so retiring a grade refuses its cards.
    const grade = LETTER_GRADE[token.grade] ?? token.grade;
    if (!(grade in GRADE_INDEX)) return no(content, 'badGrade', { grade: token.grade });
    built.push({
      id: `visitor-${socket}`,
      partId,
      grade,
      traits: [],
      donor: { name: 'Visiting', species: content.parts[partId].species, stars: 3, extractedAt: 0 },
    });
  }
  // The name is a stranger's string. It is stripped to something a screen can
  // render as text whatever R114 has not got to yet, and bounded, because a
  // creature called nine kilobytes is a layout attack as well as a script one.
  const name = safeText(card.name, t.card.nameLimit) || t.card.nameFallback || 'Visiting Specimen';
  return {
    ok: true,
    unit: unitFromGenome(
      { id: 'visiting_specimen', name, frame: card.frame, tokens: built, capturable: false,
        koLine: say(content, 'koLine', { name }) },
      content
    ),
  };
}

// The one place a stranger's words are narrowed, so there is one thing to
// audit rather than two. Markup characters out, length bounded.
export function safeText(value, limit = 40) {
  return String(value ?? '').replace(/[<>&"'`]/g, '').trim().slice(0, Math.max(1, limit));
}
