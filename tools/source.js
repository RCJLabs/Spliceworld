// R171 — ONE stripComments, ONE HOME, HOWEVER MANY READERS.
//
// R157's break 152 as a function rather than a constant. Five tools were
// stripping comments to read source, each with its own regex, and they did not
// agree: across the 48-module eager graph they left 307.0 KB, 306.6 KB and
// 303.3 KB standing — a 3.7 KB spread between tools that all believe they are
// asking the same question.
//
// AND ONE OF THEM IS WRONG ABOUT STRINGS. `tools/smoke.js` used
// `/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g`, which has no idea what a string literal is,
// so it ate `"http://www.w3.org/2000/svg"` out of `render/renderer.js` five
// times — the SVG namespace, without which nothing in this game draws. That is
// currently harmless because the three assertions using it search for
// identifiers in files that do not contain a URL. It is harmless by luck, and
// luck is what this repo writes gates instead of.
//
// SO THIS IS A SCANNER, NOT A REGEX. Comments are the one thing a regex cannot
// find in JavaScript without knowing where it is: `//` inside a string is text,
// `/*` inside a template is text, and `/` can begin a regex literal whose own
// contents may contain anything at all. Forty lines of state beats a clever
// pattern, and it can be asserted rather than hoped for — see the R171 block in
// tools/smoke.js, which requires the namespace to survive.
//
// R171 needed this because it weighs prose: `PROSE_CAP` is the difference
// between a file and this function's output, so an inaccurate stripper is an
// inaccurate budget in both directions at once.

// Whether a `/` at position i starts a regex literal rather than dividing.
// Decided by the last meaningful character: after a value (identifier, number,
// closing bracket) a slash is division; after an operator, a keyword or the
// start of input it opens a regex. Wrong only in corners that do not occur in
// this repo — `return/re/` is fine, `a++/b/c` is not, and nothing here writes
// the second.
function regexCanFollow(src, i) {
  for (let j = i - 1; j >= 0; j--) {
    const c = src[j];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') continue;
    if (c === ')' || c === ']' || c === '}') return false;
    if (/[\w$]/.test(c)) {
      // A keyword can precede a regex (`return /x/`), a variable cannot
      // (`a / b`). Read the whole word back and ask.
      let k = j;
      while (k >= 0 && /[\w$]/.test(src[k])) k--;
      return /^(return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/
        .test(src.slice(k + 1, j + 1));
    }
    return true;             // an operator, a comma, a brace — regex position
  }
  return true;               // start of file
}

// Replace every comment with a single space, so tokens that were separated
// only by a comment do not fuse into one identifier. Everything else — strings,
// templates, regex literals, whitespace — is returned byte for byte.
export function stripComments(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];

    if (c === '/' && d === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      out += ' ';
      continue;
    }
    if (c === '/' && d === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? src.length : end + 2;
      out += ' ';
      continue;
    }
    if (c === '"' || c === "'") {
      const start = i;
      i++;
      while (i < src.length && src[i] !== c) {
        if (src[i] === '\\') i++;
        if (src[i] === '\n') break;            // unterminated; bail rather than eat the file
        i++;
      }
      i++;
      out += src.slice(start, i);
      continue;
    }
    if (c === '`') {
      // A template can nest `${ … }` containing anything, comments included.
      // Depth-tracked rather than matched, because the closing backtick of an
      // inner template is not the closing backtick of the outer one.
      const start = i;
      i++;
      let depth = 0;
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (depth === 0 && src[i] === '`') { i++; break; }
        if (src[i] === '$' && src[i + 1] === '{') { depth++; i += 2; continue; }
        if (depth > 0 && src[i] === '}') { depth--; i++; continue; }
        i++;
      }
      out += src.slice(start, i);
      continue;
    }
    if (c === '/' && regexCanFollow(src, i)) {
      const start = i;
      i++;
      let inClass = false;
      while (i < src.length && src[i] !== '\n') {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '[') inClass = true;
        else if (src[i] === ']') inClass = false;
        else if (src[i] === '/' && !inClass) { i++; break; }
        i++;
      }
      while (i < src.length && /[dgimsuvy]/.test(src[i])) i++;   // flags
      out += src.slice(start, i);
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

// What the comments in a file weigh, which is the number `PROSE_CAP` is made
// of. Derived from the stripper rather than counted separately, so the two can
// never disagree about what a comment is.
export function proseBytes(src) {
  return Buffer.byteLength(src, 'utf8') - Buffer.byteLength(stripComments(src), 'utf8');
}

// R110 — THE COPY SCANNER. What the player reads, found in the source rather
// than trusted to a grep.
//
// `proseBytes` above weighs the comments, which are for the developer. This
// weighs the STRING LITERALS, which are for the player, and it exists because
// CLAUDE.md's "all content is data" had never been counted: 5,012 words of
// player-facing prose were living in JS, invisible to the data rule, to the
// tone sweep, and to R98's terse mode, which has nowhere to switch off a
// sentence that is not in a file it can read.
//
// Built on `stripComments` for the same reason every other reader is: a regex
// cannot tell a string from a comment from a regex literal in JavaScript, and
// the one place that knows how is forty lines up.

// A template hole. U+0001 because no source file contains one, so it cannot
// collide with anything the scanner is reading.
const HOLE = String.fromCharCode(1);

// Every string literal in a module, as {text, kind, line}. A template literal
// yields its STATIC chunks with each ${...} replaced by the sentinel: a hole is
// a value the player never reads, and it has to be a word BOUNDARY rather than
// a deletion, or `${a}and${b}` fuses into one word that was never written.
export function stringLiterals(src) {
  const s = stripComments(src);
  const out = [];
  let i = 0;
  let line = 1;
  while (i < s.length) {
    const c = s[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      let text = '';
      while (j < s.length && s[j] !== quote) {
        if (s[j] === '\\') { text += s[j + 1] === 'n' ? ' ' : s[j + 1]; j += 2; continue; }
        if (s[j] === '\n') break;                  // unterminated; give up on it
        text += s[j++];
      }
      out.push({ text, kind: 'quote', line });
      i = j + 1;
      continue;
    }
    if (c === '`') {
      let j = i + 1;
      let text = '';
      const startLine = line;
      while (j < s.length) {
        if (s[j] === '\\') { text += s[j + 1]; j += 2; continue; }
        if (s[j] === '`') break;
        if (s[j] === '$' && s[j + 1] === '{') {
          let depth = 1;
          j += 2;
          while (j < s.length && depth > 0) {
            if (s[j] === '{') depth++;
            else if (s[j] === '}') depth--;
            else if (s[j] === '\n') line++;
            j++;
          }
          text += ` ${HOLE} `;
          continue;
        }
        if (s[j] === '\n') line++;
        text += s[j++];
      }
      out.push({ text, kind: 'template', line: startLine });
      i = j + 1;
      continue;
    }
    i++;
  }
  return out;
}

// The words a player would actually read in one literal: markup out, template
// holes out, entities out, {placeholders} out.
//
// TOKENISED ON WHITESPACE, which is the whole difference between a measurement
// and a number. The first draft matched letter runs, so `save/migrations.js`
// scored three words and sw.js's precache manifest reported 372 words of
// player-facing prose. A word is a thing with space on both sides of it.
export function proseWords(text) {
  const plain = String(text)
    .replace(/<[^>]*>/g, ' ')                      // tags, never their contents
    .split(HOLE).join(' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\{[^}]*\}/g, ' ');                   // the wire's own placeholders
  return plain.split(/\s+/)
    .filter((t) => /^[A-Za-z][A-Za-z'’]*[.,!?:;—-]?$/.test(t) && t.length > 1);
}

// What one module says to the player: the words in every literal carrying at
// least `floor` of them. Three is the bar R110 was filed with and the one the
// scopecheck rule uses — under it a literal is a label, a class list or an
// aria string, and this repo has plenty of those that are not copy.
export function copyWords(src, floor = 3) {
  let words = 0;
  const found = [];
  for (const lit of stringLiterals(src)) {
    const w = proseWords(lit.text);
    if (w.length >= floor) { words += w.length; found.push({ ...lit, words: w.length }); }
  }
  return { words, found };
}
