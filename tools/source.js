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
