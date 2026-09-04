// R76 — the gate that would have caught R60.
//
// R60 trimmed an import in `campaign/ui.js` past a symbol two call sites still
// used. `opOdds` became a free identifier: a live ReferenceError the moment a
// player pressed "Run it" on the Jobs board. It shipped. It went out through a
// 124-cell render-identity harness and a five-minute suite, because every gate
// in this repo either RENDERS a screen or CALLS a function, and a name that is
// only read inside a handler body is invisible to both. `infirmaryGrants` had
// been unbound in `campaign/campaign.js` since A1 behind an `??=` whose left
// side is never nullish — that one never threw at all, and would have waited
// for the first player unlucky enough to reach the branch.
//
// Neither needs a browser, a fixture or a click to find. Both are visible in
// the source: a name is read, and nothing in the file binds it.
//
//   node tools/scopecheck.js            # exit 1 on any free identifier
//   node tools/scopecheck.js --report   # every module, bindings and reads
//   node tools/scopecheck.js --self     # the syntax corpus, and only that
//
// NO DEPENDENCIES, per CLAUDE.md. There is no parser in the box and none is
// coming, so this is a hand-written tokenizer over 35,900 lines of ES modules
// (15,600 of them the game; the rest is this suite). That fact drives the
// whole design, below.
//
// WHAT IT CHECKS, AND WHAT IT DELIBERATELY DOES NOT.
//
// A name is reported when it is READ somewhere in a file and BOUND nowhere in
// that file, and is not a known global. That is a file-level question, not a
// scope-level one, and the difference is the whole reason this is trustworthy:
//
//   - Scope-level analysis ("read in function A, bound only in sibling B")
//     needs correct lexical scoping for every binding form, and a mistake
//     produces a FALSE BUILD FAILURE on correct code. In a gate that fails the
//     build, one false alarm is worse than several misses, because the fix for
//     a false alarm is to stop trusting the gate.
//   - File-level analysis only needs the BINDING SET to be complete. Every
//     ambiguous BINDING construct is resolved by binding MORE names, which can
//     only ever cost a miss. The bias is deliberate and it runs one direction
//     throughout this file — with one honest exception: the GLOBALS list is a
//     denylist by omission, so a real global missing from it IS a false alarm.
//     That is why `sw.js` and the browser modules get their own lists, why
//     `arguments` is in there, and why the audit's first act was to find
//     `caches` missing.
//
// Both of the bugs this exists for are file-level: neither `opOdds` nor
// `infirmaryGrants` was bound anywhere in its module. So is every import that
// gets trimmed past a live call site, which is the shape that actually recurs.
// A name bound in a sibling function and read here is a real bug this cannot
// see. `tools/handlers.js` catches SOME of those by execution — it runs every
// handler body it can reach — but only some: measured with V8 coverage, that
// walk executes about 59% of the tree's blocks, and a sibling-scope read on a
// line neither gate runs survives both. Neither would have caught
// `infirmaryGrants` by execution either; that one is caught here, statically,
// precisely because it never runs. The two halves overlap; they do not tile,
// and saying they do would be the comfortable version.
//
// The tokenizer is tested against its own corpus (`SELF_TESTS`) rather than
// against the tree, so the constructs that would break it — nested templates,
// regex-versus-division, defaults that read earlier parameters, shorthand
// versus keys — are pinned by cases that fail loudly when the tokenizer
// regresses, instead of by whatever happens to be in the codebase today.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// --- what a free identifier is NOT -----------------------------------------

// Language keywords and reserved words. A keyword in expression position is
// never an identifier read.
const KEYWORDS = new Set([
  'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
  'default', 'delete', 'do', 'else', 'enum', 'export', 'extends', 'false',
  'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof', 'let',
  'new', 'null', 'of', 'return', 'static', 'super', 'switch', 'this', 'throw',
  'true', 'try', 'typeof', 'undefined', 'var', 'void', 'while', 'with', 'yield',
  'as', 'from', 'get', 'set', 'async', 'target', 'meta',
]);

// The standard library and the host. Split by environment so a module that
// reaches for `document` in the balance harness's half of the tree is still a
// FREE IDENTIFIER here rather than a silent pass — CLAUDE.md requires battle
// logic to run headless in Node, and `tools/sim.js` is the reason.
const ECMA = [
  'globalThis', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Symbol',
  'BigInt', 'Math', 'JSON', 'Date', 'RegExp', 'Map', 'Set', 'WeakMap',
  'WeakSet', 'Promise', 'Proxy', 'Reflect', 'Error', 'TypeError', 'RangeError',
  'SyntaxError', 'ReferenceError', 'EvalError', 'URIError', 'AggregateError',
  'Intl', 'ArrayBuffer', 'DataView', 'Int8Array', 'Uint8Array',
  'Uint8ClampedArray', 'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array',
  'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array',
  'isNaN', 'isFinite', 'parseInt', 'parseFloat', 'NaN', 'Infinity',
  'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
  'structuredClone', 'queueMicrotask', 'console', 'performance',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'fetch', 'URL', 'URLSearchParams', 'TextEncoder', 'TextDecoder',
  'AbortController', 'AbortSignal', 'WebSocket', 'Blob', 'File', 'FileReader',
  'FormData', 'Headers', 'Request', 'Response', 'Atomics',
  // Not `escape`/`unescape`: nothing in this tree uses them, and allowlisting
  // an unused global turns a DELETED helper of the same name into a silent
  // pass with wrong output.
  'arguments', 'eval',
];

const BROWSER = [
  'document', 'window', 'location', 'navigator', 'history', 'screen',
  'localStorage', 'sessionStorage', 'indexedDB', 'caches', 'crypto',
  'requestAnimationFrame', 'cancelAnimationFrame',
  'requestIdleCallback', 'matchMedia', 'getComputedStyle', 'devicePixelRatio',
  'Event', 'CustomEvent', 'MutationObserver', 'ResizeObserver',
  'IntersectionObserver', 'MessageChannel', 'BroadcastChannel',
  'Node', 'Element', 'HTMLElement', 'HTMLCanvasElement', 'SVGElement',
  'DOMParser', 'XMLSerializer', 'Image', 'Audio', 'AudioContext',
  'webkitAudioContext', 'alert', 'confirm', 'prompt', 'scrollTo', 'scrollBy',
  'innerWidth', 'innerHeight', 'addEventListener', 'removeEventListener',
  'DocumentFragment', 'XMLHttpRequest', 'CSS', 'Range', 'Selection',
];

const NODE = [
  'process', 'Buffer', 'global', '__dirname', '__filename', 'module',
  'require', 'exports',
];

// A service worker's globals are its own. `caches` and `addEventListener` were
// missing and sw.js passed anyway — on the strength of a tokenizer bug that
// over-bound them, which is the worst way for a gate to be right.
const WORKER = [
  'self', 'clients', 'skipWaiting', 'registration', 'importScripts',
  'caches', 'addEventListener', 'removeEventListener',
  'ExtendableEvent', 'FetchEvent', 'ServiceWorkerGlobalScope',
];

// Which environment each file is allowed to reach for. The point is not
// tidiness: `tools/sim.js` imports the battle engine and runs it in Node, so a
// DOM global anywhere under it is a crash waiting for the harness, and this is
// the cheapest place to say so. The split makes `document` in the engine a
// FREE IDENTIFIER — the same failure, reported by the same gate.
//
// Browser-side: the shell, anything that renders (`*-ui.js`), the shared UI
// widgets under `ui/`, and the audio module, whose whole job is an
// AudioContext. Everything else is logic and must run headless in Node.
const BROWSER_FILE = /^(main\.js|ui\/|audio\/)|(^|\/)[\w-]*ui\.js$/;

function globalsFor(file) {
  const set = new Set(ECMA);
  if (file.startsWith('tools/')) {
    for (const g of NODE) set.add(g);
    // tools/a11y.js evaluates browser expressions as STRINGS inside CDP calls;
    // those never reach this tokenizer as code. Its own body is Node.
  } else if (file === 'sw.js') {
    for (const g of WORKER) set.add(g);
  } else if (BROWSER_FILE.test(file)) {
    for (const g of BROWSER) set.add(g);
  } else {
    // A logic module. `globalThis` is in ECMA, so the ONE deliberate
    // `globalThis.document?.` guard that campaign/ui.js documents still reads
    // clean, while a bare `document` in the engine does not.
  }
  return set;
}

// --- tokenizer --------------------------------------------------------------
//
// Emits `{ type, value, line }`. Comments are dropped. Strings and template
// chunks are dropped, but a template's `${…}` interpolations are tokenized
// INLINE, because this codebase renders its entire UI from nested templates
// and a read inside one is exactly as real as any other.

const PUNCT = [
  '>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=',
  '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=',
  '*=', '/=', '%=', '&=', '|=', '^=', '**', '<<', '>>',
  '{', '}', '(', ')', '[', ']', ';', ',', '<', '>', '+', '-', '*', '/', '%',
  '&', '|', '^', '!', '~', '?', ':', '=', '.', '#', '@',
];

const ID_START = /[A-Za-z_$]/;
const ID_PART = /[A-Za-z0-9_$]/;

// After these, a `/` opens a REGEX. After anything else — a name, a number, a
// string, `)`, `]` — it is division. `}` is genuinely ambiguous (end of a
// block, or end of an object literal) and is treated as regex-permitting,
// which is the reading that holds in this tree.
const REGEX_OK_WORDS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
  'case', 'do', 'else', 'yield', 'await', 'throw',
]);

export function tokenize(src) {
  const out = [];
  const n = src.length;
  let i = 0;
  let line = 1;
  let prev = null;                 // last emitted token, for the regex decision
  let braceDepth = 0;
  const tmpl = [];                 // braceDepth at each open `${`
  let mode = 'code';

  const emit = (type, value) => { const t = { type, value, line }; out.push(t); prev = t; return t; };
  const countLines = (from, to) => { for (let k = from; k < to; k++) if (src[k] === '\n') line++; };

  while (i < n) {
    if (mode === 'template') {
      // Inside a template's literal text: consume to the closing backtick or
      // the next interpolation, honouring backslash escapes.
      while (i < n) {
        const c = src[i];
        if (c === '\\') { if (src[i + 1] === '\n') line++; i += 2; continue; }
        if (c === '\n') { line++; i++; continue; }
        if (c === '`') { i++; mode = 'code'; emit('punct', '`end'); break; }
        if (c === '$' && src[i + 1] === '{') {
          i += 2; tmpl.push(braceDepth); mode = 'code'; emit('punct', '${');
          break;
        }
        i++;
      }
      continue;
    }

    const c = src[i];

    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v' || c === ' ') { i++; continue; }

    // Comments. This repo's comments are long prose that quotes code — they
    // have broken three ad-hoc scanners already, so they die here, first.
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      countLines(i, stop);
      i = stop;
      continue;
    }

    // Strings.
    if (c === '"' || c === "'") {
      const quote = c;
      const start = i;
      i++;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === quote) { i++; break; }
        if (src[i] === '\n') line++;   // only legal in a bad file, but count it
        i++;
      }
      countLines(start, i);
      emit('str', src.slice(start, i));
      continue;
    }

    // Template literals.
    if (c === '`') { i++; mode = 'template'; emit('punct', '`'); continue; }

    // Regex literal, or division.
    if (c === '/') {
      // `cfg.in / 2` is a division. The keyword list only applies to a real
      // keyword, not to a property that happens to share its spelling — which
      // is why the token before `prev` gets a vote.
      const prev2 = out.length >= 2 ? out[out.length - 2] : null;
      const keywordish = prev?.type === 'name' && REGEX_OK_WORDS.has(prev.value)
        && !(prev2?.type === 'punct' && ['.', '?.'].includes(prev2.value));
      const regexOk = prev === null
        || (prev.type === 'punct' && ![')', ']', '}', '++', '--', '`end'].includes(prev.value))
        || keywordish;
      if (regexOk) {
        const start = i;
        i++;
        let inClass = false;
        let closed = false;
        while (i < n) {
          const ch = src[i];
          if (ch === '\\') { i += 2; continue; }
          if (ch === '\n') break;              // unterminated — not a regex
          if (ch === '[') inClass = true;
          else if (ch === ']') inClass = false;
          else if (ch === '/' && !inClass) { i++; closed = true; break; }
          i++;
        }
        if (closed) {
          while (i < n && ID_PART.test(src[i])) i++;   // flags
          emit('regex', src.slice(start, i));
          continue;
        }
        i = start;                                     // fall through to punct
      }
    }

    // Numbers.
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const start = i;
      const radix = /^0[xXbBoO]/.test(src.slice(i, i + 2));
      let dot = c === '.';
      while (i < n && /[0-9a-fA-FxXoObBeE_.+-]/.test(src[i])) {
        // `+`/`-` only continue a number directly after an exponent marker.
        if ((src[i] === '+' || src[i] === '-') && !/[eE]/.test(src[i - 1])) break;
        // `0x1f.toString()` — the dot belongs to the member access, not the
        // literal, and swallowing it reported `toString` as a free name.
        if (src[i] === '.' && i > start) { if (radix || dot) break; dot = true; }
        i++;
      }
      if (src[i] === 'n') i++;                          // BigInt
      emit('num', src.slice(start, i));
      continue;
    }

    // Identifiers and keywords.
    if (ID_START.test(c)) {
      const start = i;
      while (i < n && ID_PART.test(src[i])) i++;
      emit('name', src.slice(start, i));
      continue;
    }

    // Punctuators, longest first.
    let hit = null;
    for (const p of PUNCT) {
      if (src.startsWith(p, i)) { hit = p; break; }
    }
    if (!hit) { i++; continue; }                        // unknown byte: skip
    i += hit.length;
    if (hit === '{') braceDepth++;
    else if (hit === '}') {
      if (tmpl.length && braceDepth === tmpl[tmpl.length - 1]) {
        tmpl.pop();
        mode = 'template';
        emit('punct', '}$');                            // closes `${…}`
        continue;
      }
      braceDepth--;
    }
    emit('punct', hit);
  }
  return out;
}

// --- binding and read collection -------------------------------------------

// Walk forward from `at` (a `(`) to its matching `)`. Returns the index of the
// closer, or -1.
function matchParen(toks, at, open = '(', close = ')') {
  let depth = 0;
  for (let i = at; i < toks.length; i++) {
    const t = toks[i];
    if (t.type !== 'punct') continue;
    if (t.value === open) depth++;
    else if (t.value === close) { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function matchBack(toks, at, open = '(', close = ')') {
  let depth = 0;
  for (let i = at; i >= 0; i--) {
    const t = toks[i];
    if (t.type !== 'punct') continue;
    if (t.value === close) depth++;
    else if (t.value === open) { depth--; if (depth === 0) return i; }
  }
  return -1;
}

// Bind every name inside a PATTERN, and mark the names inside any default
// initializer as reads instead. `function f(a, b = a * 2)` binds a and b, and
// reads a — the false positive the audit's own script produced, and the one
// case where over-binding would have hidden a real bug rather than a fake one.
function scanPattern(toks, from, to, bind, read) {
  let depth = 0;
  for (let i = from; i <= to && i < toks.length; i++) {
    const t = toks[i];
    if (t.type === 'punct') {
      if (['(', '[', '{'].includes(t.value)) depth++;
      else if ([')', ']', '}'].includes(t.value)) depth--;
      else if (t.value === '=' ) {
        // A default value. It runs to the `,` that returns us to this depth,
        // or to the end of the pattern.
        const at = depth;
        let j = i + 1;
        let d = depth;
        for (; j <= to && j < toks.length; j++) {
          const u = toks[j];
          if (u.type !== 'punct') continue;
          if (['(', '[', '{'].includes(u.value)) d++;
          else if ([')', ']', '}'].includes(u.value)) { if (d === at) break; d--; }
          else if (u.value === ',' && d === at) break;
        }
        readRange(toks, i + 1, j - 1, read);
        i = j - 1;
        continue;
      }
      continue;
    }
    if (t.type !== 'name') continue;
    if (KEYWORDS.has(t.value)) continue;
    // `{ a: b }` — `a` names the property and `b` is the binding. Binding both
    // is the conservative reading, and costs nothing but a possible miss.
    bind(t.value);
  }
}

// Collect identifier READS in a token range, applying the not-a-read rules.
function readRange(toks, from, to, read) {
  for (let i = Math.max(0, from); i <= to && i < toks.length; i++) {
    const t = toks[i];
    if (t.type !== 'name' || KEYWORDS.has(t.value)) continue;
    if (!isRead(toks, i)) continue;
    read(t.value, t.line);
  }
}

// The single place that decides whether a name token is an identifier READ.
function isRead(toks, i) {
  const t = toks[i];
  const p = toks[i - 1];
  const nx = toks[i + 1];

  // `a.foo`, `a?.foo`, `#foo` — a property, not a name in scope.
  if (p && p.type === 'punct' && (p.value === '.' || p.value === '?.' || p.value === '#')) return false;

  // `{ foo: … }` and `case foo:` and `label:` — a key or a label, not a read.
  // A ternary's `cond ? a : b` also puts a name before `:`, which is why the
  // token BEFORE decides: after `?` it is a value, after `{`/`,`/`;`/`}` a key.
  if (nx && nx.type === 'punct' && nx.value === ':') {
    if (!p) return false;
    if (p.type === 'punct' && ['{', ',', ';', '}', '`end'].includes(p.value)) return false;
    if (p.type === 'name' && ['case'].includes(p.value)) return true;   // `case foo:` IS a read
    if (p.type === 'punct' && p.value === '?') return true;             // ternary branch
    return true;
  }

  // A method or accessor definition: `foo() {`, `get foo() {`, `async foo() {`.
  // Distinguished from a call by what follows the closing paren — a call is
  // never followed by a bare block.
  if (nx && nx.type === 'punct' && nx.value === '(') {
    const close = matchParen(toks, i + 1);
    const after = close === -1 ? null : toks[close + 1];
    if (after && after.type === 'punct' && after.value === '{') {
      const prevName = p && p.type === 'name' ? p.value : null;
      if (p && p.type === 'punct' && ['{', ',', '}$', '`end'].includes(p.value)) return false;
      if (prevName && ['get', 'set', 'async', 'static'].includes(prevName)) return false;
    }
  }

  // `break outer` / `continue outer` — a label, not a value.
  if (p && p.type === 'name' && (p.value === 'break' || p.value === 'continue')) return false;

  // `import.meta`, `new.target` — handled by the `.` rule above for the tail;
  // the head is a keyword and never reaches here.
  return true;
}

// --- the analysis ----------------------------------------------------------

export function analyze(src, file = '<anonymous>') {
  const toks = tokenize(src);
  const bound = new Set();
  const reads = new Map();          // name -> first line it is read on
  const readCount = new Map();

  const bind = (name) => { if (name && !KEYWORDS.has(name)) bound.add(name); };
  const read = (name, line) => {
    if (!reads.has(name)) reads.set(name, line);
    readCount.set(name, (readCount.get(name) ?? 0) + 1);
  };

  // First pass: bindings, and the ranges they consume. Everything a binding
  // pass does not claim falls through to the read pass, which is why the two
  // are separate walks over the same tokens rather than one.
  const claimed = new Array(toks.length).fill(false);
  const claim = (from, to) => { for (let i = Math.max(0, from); i <= to && i < toks.length; i++) claimed[i] = true; };

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.type !== 'name') continue;
    // A PROPERTY that happens to be spelled like a keyword is not that
    // keyword. `unit.class`, `promise.catch(…)` and `io.import` were each
    // starting the binding branch below and consuming the code after them —
    // `.catch(() => ghost())` silenced `ghost` outright, in a tree where
    // `.class` appears throughout campaign/ and `.catch(` is in the shell's
    // own lazy loader. Three live false passes from one missing guard.
    const before = toks[i - 1];
    if (before?.type === 'punct' && ['.', '?.'].includes(before.value)) continue;

    // import … from '…'  /  import '…'
    if (t.value === 'import' && !(toks[i + 1]?.type === 'punct' && ['(', '.'].includes(toks[i + 1].value))) {
      let j = i + 1;
      while (j < toks.length && !(toks[j].type === 'str')) j++;
      // An import clause is the one binding form with no ambiguity, so it is
      // read exactly rather than over-bound: `import { a as b }` binds `b`
      // and NOT `a`. Binding both was the conservative default everywhere
      // else in this file, and here it hid the exact R60 shape — a trim that
      // leaves a rename behind, with the old name still read below.
      for (let k = i + 1; k < j; k++) {
        const u = toks[k];
        if (u.type !== 'name' || (KEYWORDS.has(u.value) && u.value !== 'default')) continue;
        if (toks[k + 1]?.type === 'name' && toks[k + 1].value === 'as') {
          if (toks[k + 2]?.type === 'name') bind(toks[k + 2].value);
          k += 2;
          continue;
        }
        bind(u.value);
      }
      claim(i, j);
      i = j;
      continue;
    }

    // export { a, b }  — these are READS of local names, and `export … from`
    // is a re-export that neither binds nor reads. `export const/function/class`
    // falls through to the declaration rules below.
    if (t.value === 'export' && toks[i + 1]?.type === 'punct' && toks[i + 1].value === '{') {
      const close = matchParen(toks, i + 1, '{', '}');
      const after = close === -1 ? null : toks[close + 1];
      if (after && after.type === 'name' && after.value === 'from') {
        let j = close + 1;
        while (j < toks.length && toks[j].type !== 'str') j++;
        claim(i, j);
        i = j;
      } else if (close !== -1) {
        // `export { a as b }` reads a, not b.
        for (let k = i + 2; k < close; k++) {
          const u = toks[k];
          if (u.type === 'name' && !KEYWORDS.has(u.value)) {
            if (toks[k + 1]?.type === 'name' && toks[k + 1].value === 'as') { read(u.value, u.line); k += 2; }
            else read(u.value, u.line);
          }
        }
        claim(i, close);
        i = close;
      }
      continue;
    }

    // const / let / var
    if (['const', 'let', 'var'].includes(t.value)) {
      // Declarator list. Patterns bind; initializers read.
      let j = i + 1;
      let depth = 0;
      let inInit = false;
      let patternStart = j;
      for (; j < toks.length; j++) {
        const u = toks[j];
        if (u.type === 'punct') {
          if (['(', '[', '{'].includes(u.value)) { depth++; continue; }
          if ([')', ']', '}'].includes(u.value)) {
            if (depth === 0) break;                 // `for (const x of y)` etc.
            depth--; continue;
          }
          if (depth === 0 && u.value === '=') {
            if (!inInit) { scanPattern(toks, patternStart, j - 1, bind, read); claim(patternStart, j - 1); }
            inInit = true;
            continue;
          }
          if (depth === 0 && u.value === ',') {
            if (!inInit) { scanPattern(toks, patternStart, j - 1, bind, read); claim(patternStart, j - 1); }
            inInit = false;
            patternStart = j + 1;
            continue;
          }
          if (depth === 0 && u.value === ';') break;
        }
        if (depth === 0 && u.type === 'name' && ['of', 'in'].includes(u.value) && !inInit) break;
      }
      if (!inInit) { scanPattern(toks, patternStart, j - 1, bind, read); claim(patternStart, j - 1); }
      claim(i, i);
      i = i;                                        // initializers re-walked below
      continue;
    }

    // function name(params)  /  async function*  /  a method's params
    if (t.value === 'function') {
      let j = i + 1;
      if (toks[j]?.type === 'punct' && toks[j].value === '*') j++;
      if (toks[j]?.type === 'name') { bind(toks[j].value); claim(j, j); j++; }
      if (toks[j]?.type === 'punct' && toks[j].value === '(') {
        const close = matchParen(toks, j);
        if (close !== -1) { scanPattern(toks, j + 1, close - 1, bind, read); claim(j + 1, close - 1); i = close; }
      }
      continue;
    }

    if (t.value === 'class') {
      if (toks[i + 1]?.type === 'name' && toks[i + 1].value !== 'extends') { bind(toks[i + 1].value); claim(i + 1, i + 1); }
      // A class BODY is the one place where `n = expr` declares rather than
      // assigns, and where a bare name before `(` is always a definition. The
      // tree holds exactly one class today (the recording DOM stub R75 added),
      // which is precisely why this is worth pinning: the next one will not
      // arrive with a test.
      // `class B extends mixin(Base) {` — the heritage may be a whole call
      // expression, so parens are matched rather than treated as a stop.
      let open = i + 1;
      while (open < toks.length) {
        const u = toks[open];
        if (u.type === 'punct' && u.value === '{') break;
        if (u.type === 'punct' && u.value === ';') break;
        if (u.type === 'punct' && u.value === '(') {
          const shut = matchParen(toks, open);
          if (shut === -1) break;
          open = shut + 1;
          continue;
        }
        open++;
      }
      if (toks[open]?.type === 'punct' && toks[open].value === '{') {
        const close = matchParen(toks, open, '{', '}');
        const end = close === -1 ? toks.length : close;
        // Walk the members, not the tokens: a field's INITIALIZER is ordinary
        // expression code and must reach the read pass intact.
        let k = open + 1;
        while (k < end) {
          const u = toks[k];
          if (u.type === 'name' && ['static', 'get', 'set', 'async'].includes(u.value)) { k++; continue; }
          if (u.type === 'punct' && ['*', ';', '#'].includes(u.value)) { k++; continue; }
          if (u.type !== 'name' || KEYWORDS.has(u.value)) { k++; continue; }
          const nx = toks[k + 1];
          if (nx?.type === 'punct' && nx.value === '(') {
            claimed[k] = true;                               // the method name
            const shut = matchParen(toks, k + 1);
            if (shut === -1) break;
            scanPattern(toks, k + 2, shut - 1, bind, read);
            claim(k + 2, shut - 1);
            const body = shut + 1;
            if (toks[body]?.type === 'punct' && toks[body].value === '{') {
              const bodyEnd = matchParen(toks, body, '{', '}');
              k = bodyEnd === -1 ? end : bodyEnd + 1;        // the body is code
            } else k = shut + 1;
            continue;
          }
          if (nx?.type === 'punct' && (nx.value === '=' || nx.value === ';')) {
            claimed[k] = true;                               // the field name
            // Step over the initializer without claiming it — it is ordinary
            // code and its reads are real — landing on the `;` that ends it.
            let j = k + 2;
            let d = 0;
            while (j < end) {
              const v = toks[j];
              if (v.type === 'punct') {
                if (['(', '[', '{'].includes(v.value)) d++;
                else if ([')', ']', '}'].includes(v.value)) d--;
                else if (v.value === ';' && d === 0) break;
              }
              j++;
            }
            k = j + 1;
            continue;
          }
          k++;
        }
      }
      continue;
    }

    if (t.value === 'catch' && toks[i + 1]?.type === 'punct' && toks[i + 1].value === '(') {
      const close = matchParen(toks, i + 1);
      if (close !== -1) { scanPattern(toks, i + 2, close - 1, bind, read); claim(i + 2, close - 1); i = close; }
      continue;
    }
  }

  // Arrow parameters. Found by looking BACK from every `=>`, which is the only
  // point at which a parenthesised list is known to have been a parameter list
  // rather than an expression.
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (!(t.type === 'punct' && t.value === '=>')) continue;
    const p = toks[i - 1];
    if (!p) continue;
    if (p.type === 'name' && !KEYWORDS.has(p.value)) { bind(p.value); claimed[i - 1] = true; continue; }
    if (p.type === 'punct' && p.value === ')') {
      const open = matchBack(toks, i - 1);
      if (open !== -1) { scanPattern(toks, open + 1, i - 2, bind, read); claim(open + 1, i - 2); }
    }
  }

  // A method's own parameter list, for the object-literal methods and the one
  // class in the tree: `foo(a, b) {` binds a and b.
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.type !== 'name' || KEYWORDS.has(t.value)) continue;
    const nx = toks[i + 1];
    if (!(nx && nx.type === 'punct' && nx.value === '(')) continue;
    const close = matchParen(toks, i + 1);
    if (close === -1) continue;
    const after = toks[close + 1];
    if (!(after && after.type === 'punct' && after.value === '{')) continue;
    const p = toks[i - 1];
    const isDef = (p && p.type === 'punct' && ['{', ',', '}$', '`end', ';'].includes(p.value))
      || (p && p.type === 'name' && ['get', 'set', 'async', 'static'].includes(p.value));
    if (isDef) { scanPattern(toks, i + 2, close - 1, bind, read); claim(i + 2, close - 1); }
  }

  // Second pass: reads, over everything the binding pass did not claim.
  for (let i = 0; i < toks.length; i++) {
    if (claimed[i]) continue;
    const t = toks[i];
    if (t.type !== 'name' || KEYWORDS.has(t.value)) continue;
    if (!isRead(toks, i)) continue;
    read(t.value, t.line);
  }

  const globals = globalsFor(relative(root, file).replaceAll('\\', '/'));
  const findings = [];
  for (const [name, line] of reads) {
    if (bound.has(name)) continue;
    if (globals.has(name)) continue;
    findings.push({ name, line, count: readCount.get(name) });
  }
  findings.sort((a, b) => a.line - b.line);
  return { findings, bound, reads, tokens: toks.length };
}

// Tokens that can only begin a new statement. Used to end an initializer in a
// file written without semicolons, so an ASI-style module does not lose every
// export after the first.
const STATEMENT_START = new Set([
  'export', 'import', 'const', 'let', 'var', 'function', 'class', 'return',
  'if', 'for', 'while', 'do', 'switch', 'try', 'throw',
]);

// --- what a module SAYS it has ---------------------------------------------
//
// The break battery found the hole this closes. Rename an exported function
// and leave one call site behind, and no name is ever free: the importing
// module still has `import { sparVerdict } from './warroom.js'`, which BINDS
// the name whether or not anything answers to it. The failure is a link
// error — the browser refuses to evaluate the module at all, so the game does
// not boot, and the file-level pass cannot see it because the binding is
// right there in the import.
//
// So the second question: does every imported name exist at the other end?

// Every name a module exports, and every `export … from` it forwards.
export function moduleInterface(src) {
  const toks = tokenize(src);
  const names = new Set();
  const forwards = [];   // { from, names: [..] | '*' }
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.type !== 'name' || t.value !== 'export') continue;
    const nx = toks[i + 1];
    if (!nx) continue;

    if (nx.type === 'name' && nx.value === 'default') { names.add('default'); continue; }

    // export function f / export async function f / export class C
    if (nx.type === 'name' && ['function', 'class', 'async'].includes(nx.value)) {
      let j = i + 2;
      if (nx.value === 'async') j++;                       // async function
      if (toks[j]?.type === 'punct' && toks[j].value === '*') j++;
      if (toks[j]?.type === 'name') names.add(toks[j].value);
      continue;
    }

    // export const/let/var — one or more declarators, each of which may be a
    // destructuring pattern, each of which may carry an initializer.
    //
    // The first version of this walked to the `;` and then kept going, so
    // `export const f = () => {…};` swallowed every name in the rest of the
    // file into the export set and the link pass passed everything. Found by
    // the audit; the corpus now pins it.
    if (nx.type === 'name' && ['const', 'let', 'var'].includes(nx.value)) {
      let j = i + 2;
      let depth = 0;
      let done = false;
      while (j < toks.length && !done) {
        const u = toks[j];
        if (u.type === 'punct') {
          if (['(', '[', '{'].includes(u.value)) { depth++; j++; continue; }
          if ([')', ']', '}'].includes(u.value)) { depth--; j++; continue; }
          if (depth === 0 && u.value === ';') { done = true; break; }
          if (depth === 0 && u.value === '=') {
            // Step over the initializer. It ends at a `,` (another declarator
            // follows) or a `;` (the declaration is over) — or, for a file
            // written without semicolons, at the token that starts the next
            // statement on a later line.
            const startLine = u.line;
            let d = 0;
            j++;
            for (; j < toks.length; j++) {
              const v = toks[j];
              if (v.type === 'name' && v.line > startLine && STATEMENT_START.has(v.value) && d === 0) break;
              if (v.type !== 'punct') continue;
              if (['(', '[', '{'].includes(v.value)) { d++; continue; }
              if ([')', ']', '}'].includes(v.value)) {
                if (d === 0) { done = true; break; }   // we left the declaration
                d--; continue;
              }
              if (d === 0 && v.value === ',') break;
              if (d === 0 && v.value === ';') { done = true; break; }
            }
            j++;
            continue;
          }
          j++;
          continue;
        }
        if (u.type === 'name' && !KEYWORDS.has(u.value)) names.add(u.value);
        j++;
      }
      i = j - 1;
      continue;
    }

    // export * from '…'  /  export * as ns from '…'
    if (nx.type === 'punct' && nx.value === '*') {
      let j = i + 2;
      let alias = null;
      if (toks[j]?.type === 'name' && toks[j].value === 'as') { alias = toks[j + 1]?.value; j += 2; }
      while (j < toks.length && toks[j].type !== 'str') j++;
      const from = toks[j]?.value?.slice(1, -1);
      if (alias) names.add(alias);
      else if (from) forwards.push({ from, names: '*' });
      continue;
    }

    // export { a, b as c } [from '…']
    //
    // A re-export has TWO names and they are not interchangeable:
    // `export { a as b } from './c.js'` ASKS c.js for `a` and GIVES `b`.
    // Asking for `b` — which the first version did — reports a phantom on
    // correct code, which is the false-failure direction and the worst one.
    if (nx.type === 'punct' && nx.value === '{') {
      const close = matchParen(toks, i + 1, '{', '}');
      if (close === -1) continue;
      const listed = [];
      for (let k = i + 2; k < close; k++) {
        const u = toks[k];
        // `default` is a keyword everywhere else and a name here.
        if (u.type !== 'name' || (KEYWORDS.has(u.value) && u.value !== 'default')) continue;
        if (toks[k + 1]?.type === 'name' && toks[k + 1].value === 'as') {
          listed.push({ ask: u.value, give: toks[k + 2]?.value });
          k += 2;
        } else listed.push({ ask: u.value, give: u.value });
      }
      const after = toks[close + 1];
      if (after?.type === 'name' && after.value === 'from') {
        let j = close + 1;
        while (j < toks.length && toks[j].type !== 'str') j++;
        const from = toks[j]?.value?.slice(1, -1);
        if (from) forwards.push({ from, names: listed.filter((n) => n.give) });
      } else {
        for (const n of listed) if (n.give) names.add(n.give);
      }
      i = close;
      continue;
    }
  }
  return { names, forwards };
}

// Every name a module imports, and where from.
export function moduleImports(src) {
  const toks = tokenize(src);
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.type !== 'name' || t.value !== 'import') continue;
    const nx = toks[i + 1];
    // `import('…')` and `import.meta` are not import DECLARATIONS.
    if (nx?.type === 'punct' && ['(', '.'].includes(nx.value)) continue;
    // `import './x.js'` binds nothing, but the module still has to be there.
    if (nx?.type === 'str') {
      out.push({ from: nx.value.slice(1, -1), wanted: [], line: t.line });
      continue;
    }

    const wanted = [];
    let j = i + 1;
    let ns = false;
    for (; j < toks.length && toks[j].type !== 'str'; j++) {
      const u = toks[j];
      // `* as ns` binds a namespace object and asks the far side for nothing
      // in particular, so it is skipped whole rather than read name by name.
      if (u.type === 'punct' && u.value === '*') { ns = true; j += 2; continue; }
      // `default` is a keyword everywhere else and a name here:
      // `import { default as d } from './x.js'` asks for `default`.
      if (u.type !== 'name' || (KEYWORDS.has(u.value) && u.value !== 'default')) continue;
      if (toks[j + 1]?.type === 'name' && toks[j + 1].value === 'as') {
        if (!ns) wanted.push({ imported: u.value, local: toks[j + 2]?.value, line: u.line });
        j += 2;
        ns = false;
        continue;
      }
      // A bare name directly after `import` is the DEFAULT import.
      const prev = toks[j - 1];
      const isDefault = prev?.type === 'name' && prev.value === 'import';
      wanted.push({ imported: isDefault ? 'default' : u.value, local: u.value, line: u.line });
    }
    const from = toks[j]?.value?.slice(1, -1);
    if (from) out.push({ from, wanted, line: t.line });
  }
  return out;
}

// Does every imported name exist at the other end? `modules` is a plain
// { relativePath: source } map, so this is testable with synthetic files and
// does not have to touch the disk.
export function checkImports(modules) {
  const iface = new Map();
  for (const [file, src] of Object.entries(modules)) iface.set(file, moduleInterface(src));

  const resolve = (fromFile, spec) => {
    if (!spec.startsWith('.')) return null;               // node: builtins, bare specifiers
    const parts = fromFile.split('/').slice(0, -1).concat(spec.split('/'));
    const stack = [];
    for (const p of parts) {
      if (p === '.' || p === '') continue;
      // A `..` with nothing to pop climbs OUT of the tree. Silently clamping
      // it to the root turns a broken path into a plausible one; returning
      // null says honestly that this is not a module we can see.
      if (p === '..') { if (!stack.length) return null; stack.pop(); continue; }
      stack.push(p);
    }
    return stack.length ? stack.join('/') : null;
  };

  // `export * from` and `export { x } from` chains, followed to a fixed
  // point. The result is memoised PER FILE and cycles are tracked with a
  // separate in-progress set: sharing one `seen` across sibling forwards
  // memoised a module as empty for whichever branch asked second, which the
  // audit caught.
  const done = new Map();
  const walking = new Set();
  const exportsOf = (file) => {
    if (done.has(file)) return done.get(file);
    const it = iface.get(file);
    if (!it) return null;
    if (walking.has(file)) return new Set();              // cycle: stop here
    walking.add(file);
    const all = new Set(it.names);
    for (const f of it.forwards) {
      const target = resolve(file, f.from);
      const theirs = target ? exportsOf(target) : null;
      if (!theirs) continue;
      if (f.names === '*') for (const n of theirs) all.add(n);
      else for (const n of f.names) if (theirs.has(n.ask)) all.add(n.give);
    }
    walking.delete(file);
    done.set(file, all);
    return all;
  };

  const findings = [];
  for (const [file, src] of Object.entries(modules)) {
    for (const imp of moduleImports(src)) {
      const target = resolve(file, imp.from);
      if (!target) continue;
      if (!iface.has(target)) {
        findings.push({ file, line: imp.line, name: imp.from, kind: 'missing-module' });
        continue;
      }
      const theirs = exportsOf(target);
      for (const w of imp.wanted) {
        if (!theirs.has(w.imported)) {
          findings.push({ file, line: w.line ?? imp.line, name: w.imported, from: imp.from, kind: 'phantom-import' });
        }
      }
    }
  }
  return findings;
}

// --- the corpus -------------------------------------------------------------
//
// Every case here is a construct that occurs in this tree and that a
// hand-written tokenizer gets wrong if it is careless. `expect` lists the names
// that MUST be reported; anything else reported is a false positive and fails
// just as loudly, because a gate that cries wolf is a gate that gets muted.

export const SELF_TESTS = [
  { name: 'plain unbound call', src: `export function f() { return missingFn(1); }`, expect: ['missingFn'] },
  { name: 'import binds it', src: `import { ok } from './x.js';\nexport const f = () => ok();`, expect: [] },
  { name: 'renamed import binds the alias', src: `import { a as ok } from './x.js';\nexport const f = () => ok();`, expect: [] },
  { name: 'default and namespace imports', src: `import d, * as ns from './x.js';\nexport const f = () => d(ns.k);`, expect: [] },
  { name: 'trimmed import is the R60 bug', src: `import { a } from './x.js';\nexport const f = () => a() + opOdds();`, expect: ['opOdds'] },
  { name: 'unbound behind a never-taken branch', src: `export function f(s) { s.x ??= grantsThing(s); return s; }`, expect: ['grantsThing'] },
  { name: 'default parameter reads an earlier parameter', src: `export const f = (a, b = a * 2) => a + b;`, expect: [] },
  { name: 'default parameter reads something unbound', src: `export const f = (a, b = nope * 2) => a + b;`, expect: ['nope'] },
  { name: 'destructured parameter with rename and default', src: `export const f = ({ a: b = 1, ...rest }) => b + rest.n;`, expect: [] },
  { name: 'nested array/object destructuring', src: `const [{ a }, [b = 2]] = pairs(); export const f = () => a + b;`, expect: ['pairs'] },
  { name: 'object shorthand IS a read', src: `export const f = () => ({ ghost });`, expect: ['ghost'] },
  { name: 'object key is NOT a read', src: `export const f = () => ({ ghost: 1 });`, expect: [] },
  { name: 'member access is not a read', src: `export const f = (o) => o.ghost + o?.ghost + o["ghost"];`, expect: [] },
  { name: 'computed member IS a read', src: `export const f = (o) => o[ghost];`, expect: ['ghost'] },
  { name: 'ternary branch before a colon is a read', src: `export const f = (c) => (c ? ghost : 0);`, expect: ['ghost'] },
  { name: 'method shorthand name is not a read', src: `export const o = { ping() { return 1; } };`, expect: [] },
  { name: 'getter name is not a read', src: `let v = 1; export const o = { get state() { return v; } };`, expect: [] },
  { name: 'template interpolation IS a read', src: 'export const f = () => `x ${ghost} y`;', expect: ['ghost'] },
  { name: 'nested template interpolation IS a read', src: 'export const f = (a) => `x ${a.map((q) => `<i>${ghost}</i>`).join("")} y`;', expect: ['ghost'] },
  { name: 'template text is not code', src: 'export const f = () => `const ghost = 1; // ghost`;', expect: [] },
  { name: 'a comment quoting code is not code', src: `// const ghost = 1;\n/* ghost() */\nexport const f = () => 1;`, expect: [] },
  { name: 'a comment cannot bind', src: `// import { ghost } from './x.js';\nexport const f = () => ghost();`, expect: ['ghost'] },
  { name: 'regex literal is not division', src: `export const f = (s) => /ghost/g.test(s);`, expect: [] },
  { name: 'regex with a slash in a class', src: `export const f = (s) => s.split(/[/]/).length;`, expect: [] },
  { name: 'regex containing quotes', src: `export const f = (s) => s.replace(/["']/g, "");`, expect: [] },
  { name: 'division is not a regex', src: `export const f = (a, b) => a / b / 2;`, expect: [] },
  { name: 'string containing a backtick', src: 'export const f = () => "`ghost`";', expect: [] },
  { name: 'catch binding', src: `export function f() { try { g(); } catch (err) { return err; } }`, expect: ['g'] },
  { name: 'optional catch binding', src: `export function f() { try { g(); } catch { return 1; } }`, expect: ['g'] },
  { name: 'for-of binding', src: `export function f(xs) { for (const x of xs) if (x) return x; return null; }`, expect: [] },
  { name: 'for-in binding', src: `export function f(o) { for (const k in o) if (k) return k; return null; }`, expect: [] },
  { name: 'classic for binding', src: `export function f(n) { for (let i = 0; i < n; i++) if (i > n) return i; return 0; }`, expect: [] },
  { name: 'hoisted function used before its line', src: `export const f = () => later(); function later() { return 1; }`, expect: [] },
  { name: 'named function expression', src: `export const f = function inner(n) { return n > 0 ? inner(n - 1) : 0; };`, expect: [] },
  { name: 'class declaration and extends', src: `class A {}\nclass B extends A { m() { return 1; } }\nexport const f = () => new B();`, expect: [] },
  { name: 'class field initializer', src: `class A { n = ghost; }\nexport const f = () => new A();`, expect: ['ghost'] },
  { name: 'export { a } reads a', src: `const a = 1; export { a };`, expect: [] },
  { name: 'export { ghost } reads an unbound name', src: `export { ghost };`, expect: ['ghost'] },
  { name: 're-export binds and reads nothing', src: `export { a } from './x.js';`, expect: [] },
  { name: 'async/await and generators', src: `export async function* f(xs) { for (const x of xs) yield await x; }`, expect: [] },
  { name: 'label is not a read', src: `export function f(xs) { outer: for (const x of xs) { if (x) break outer; } return 0; }`, expect: [] },
  { name: 'multiple declarators, one initializer unbound', src: `export const f = () => { const a = 1, b = ghost; return a + b; };`, expect: ['ghost'] },
  { name: 'arrow with no parens', src: `export const f = (xs) => xs.map((x) => x * 2);`, expect: [] },
  { name: 'immediately invoked arrow', src: `export const f = (() => ghost)();`, expect: ['ghost'] },
  { name: 'globals are not free', src: `export const f = () => JSON.stringify({ t: Date.now(), m: Math.PI });`, expect: [] },
  { name: 'optional call and chaining', src: `export const f = (o) => o?.a?.(1) ?? ghost;`, expect: ['ghost'] },
  { name: 'spread in call and literal', src: `export const f = (xs) => [...xs, ...ghost];`, expect: ['ghost'] },
  { name: 'shorthand inside a nested template', src: 'export const f = (xs) => `${xs.map((x) => `${x}`).join(",")}${ghost}`;', expect: ['ghost'] },

  // --- the audit's findings, each pinned by the case that was missing ------
  // Every one of these was a LIVE FALSE PASS: a real free identifier the
  // analyzer silently swallowed, in constructs this tree uses constantly.
  { name: 'a property named `class` is not a class', src: 'export const f = (op) => { if (op.demands.class) { return ghost(); } return 1; };', expect: ['ghost'] },
  { name: 'a property named `catch` is not a catch clause', src: 'export const f = (p) => p.catch(() => ghost());', expect: ['ghost'] },
  { name: 'a property named `import` is not an import', src: "export const f = (io) => { io.import; return ghost(); };", expect: ['ghost'] },
  { name: 'a property named `function` is not a declaration', src: 'export const f = (o) => o.function + ghost;', expect: ['ghost'] },
  { name: 'a property named like a regex keyword still divides', src: 'export const f = (cfg) => cfg.in / 2 + ghost / 3;', expect: ['ghost'] },
  { name: 'a renamed import binds the LOCAL name only', src: "import { a as b } from './x.js';\nexport const f = () => b + a;", expect: ['a'] },
  { name: '…and the local name is bound', src: "import { a as b } from './x.js';\nexport const f = () => b;", expect: [] },
  { name: 'a default import is bound', src: "import d from './x.js';\nexport const f = () => d;", expect: [] },
  { name: 'a namespace import is bound', src: "import * as ns from './x.js';\nexport const f = () => ns.k;", expect: [] },
  { name: 'a member access on a hex literal', src: 'export const f = () => 0x1f.toString(16);', expect: [] },
  { name: 'a member access on a decimal literal', src: 'export const f = () => 1.5.toFixed(1);', expect: [] },
  { name: '`arguments` is a binding, not a free name', src: 'export function f() { return arguments.length; }', expect: [] },
  { name: 'a class with a call expression for a heritage', src: 'const mixin = (B) => B;\nclass A {}\nclass B extends mixin(A) { m(n) { return n; } }\nexport const f = () => new B();', expect: [] },
];

// Cross-module cases, run on synthetic files so they pin the RULE rather than
// whatever this tree happens to import today.
export const LINK_TESTS = [
  {
    name: 'a named import that exists',
    files: { 'a.js': "import { go } from './b.js';\nexport const f = () => go();", 'b.js': 'export function go() { return 1; }' },
    expect: [],
  },
  {
    name: 'a renamed export leaves the call site importing a ghost',
    files: { 'a.js': "import { go } from './b.js';\nexport const f = () => go();", 'b.js': 'export function goRenamed() { return 1; }' },
    expect: ['go'],
  },
  {
    name: 'export const, including a destructured one',
    files: { 'a.js': "import { x, y } from './b.js';\nexport const f = () => x + y;", 'b.js': 'export const x = 1;\nexport const { y } = { y: 2 };' },
    expect: [],
  },
  {
    name: 'export { a as b } exports b, not a',
    files: { 'a.js': "import { b } from './b.js';\nexport const f = () => b;", 'b.js': 'const a = 1;\nexport { a as b };' },
    expect: [],
  },
  {
    name: '…and importing the pre-rename name is a ghost',
    files: { 'a.js': "import { a } from './b.js';\nexport const f = () => a;", 'b.js': 'const a = 1;\nexport { a as b };' },
    expect: ['a'],
  },
  {
    name: 'import { x as y } asks the far side for x',
    files: { 'a.js': "import { x as y } from './b.js';\nexport const f = () => y;", 'b.js': 'export const x = 1;' },
    expect: [],
  },
  {
    name: 'a default import',
    files: { 'a.js': "import d from './b.js';\nexport const f = () => d;", 'b.js': 'export default function () { return 1; }' },
    expect: [],
  },
  {
    name: 'a default import with no default export',
    files: { 'a.js': "import d from './b.js';\nexport const f = () => d;", 'b.js': 'export const x = 1;' },
    expect: ['default'],
  },
  {
    name: 'a namespace import asks for nothing in particular',
    files: { 'a.js': "import * as ns from './b.js';\nexport const f = () => ns.anything;", 'b.js': 'export const x = 1;' },
    expect: [],
  },
  {
    name: 'export * from is followed',
    files: {
      'a.js': "import { deep } from './b.js';\nexport const f = () => deep();",
      'b.js': "export * from './c.js';",
      'c.js': 'export function deep() { return 1; }',
    },
    expect: [],
  },
  {
    name: 'export { x } from is followed, and only for what it names',
    files: {
      'a.js': "import { other } from './b.js';\nexport const f = () => other();",
      'b.js': "export { one } from './c.js';",
      'c.js': 'export function one() { return 1; }\nexport function other() { return 2; }',
    },
    expect: ['other'],
  },
  {
    name: 'a relative path that climbs out of a directory',
    files: { 'ui/a.js': "import { go } from '../lib/b.js';\nexport const f = () => go();", 'lib/b.js': 'export const go = () => 1;' },
    expect: [],
  },
  {
    name: 'node: builtins and bare specifiers are not our business',
    files: { 'a.js': "import { readFileSync } from 'node:fs';\nexport const f = () => readFileSync('x');" },
    expect: [],
  },
  {
    name: 'a dynamic import is not a declaration',
    files: { 'a.js': "export const f = async () => (await import('./b.js')).go();", 'b.js': 'export const go = () => 1;' },
    expect: [],
  },

  // --- the eight the audit found, each pinned by the case that was missing --
  {
    name: 'an export const initializer does not swallow the rest of the file',
    files: {
      'a.js': "import { privateThing } from './b.js';\nexport const g = () => privateThing;",
      'b.js': 'export const f = (a) => { const hidden = 1; return hidden + a; };\nconst privateThing = 3;\n',
    },
    expect: ['privateThing'],
  },
  {
    name: '…and the declarators after a comma are still exported',
    files: { 'a.js': "import { a, b } from './b.js';\nexport const f = () => a + b;", 'b.js': 'export const a = 1, b = 2;' },
    expect: [],
  },
  {
    name: '…and a file written without semicolons keeps its later exports',
    files: { 'a.js': "import { y } from './b.js';\nexport const f = () => y;", 'b.js': 'export const x = 1\nexport const y = 2\n' },
    expect: [],
  },
  {
    name: 'a renaming re-export asks the far side for the ORIGINAL name',
    files: {
      'a.js': "import { b } from './x.js';\nexport const f = () => b;",
      'x.js': "export { a as b } from './c.js';",
      'c.js': 'export const a = 1;',
    },
    expect: [],
  },
  {
    name: '…and it gives only the renamed one',
    files: {
      'a.js': "import { a } from './x.js';\nexport const f = () => a;",
      'x.js': "export { a as b } from './c.js';",
      'c.js': 'export const a = 1;',
    },
    expect: ['a'],
  },
  {
    name: 'export { default } from is a re-export of the default',
    files: {
      'a.js': "import d from './x.js';\nexport const f = () => d;",
      'x.js': "export { default } from './c.js';",
      'c.js': 'export default function () { return 1; }',
    },
    expect: [],
  },
  {
    name: 'import { default as d } asks for default, not for d',
    files: { 'a.js': "import { default as d } from './b.js';\nexport const f = () => d;", 'b.js': 'export default function () { return 1; }' },
    expect: [],
  },
  {
    name: 'two forwards from one module do not memoise each other empty',
    files: {
      'a.js': "import { one, two } from './x.js';\nexport const f = () => one() + two();",
      'x.js': "export * from './c.js';\nexport * from './d.js';",
      'c.js': "export * from './shared.js';\nexport function one() { return 1; }",
      'd.js': "export * from './shared.js';\nexport function two() { return 2; }",
      'shared.js': 'export const shared = 1;',
    },
    expect: [],
  },
  {
    name: 'a re-export cycle terminates instead of hanging',
    files: {
      'a.js': "import { real } from './b.js';\nexport const f = () => real;",
      'b.js': "export * from './c.js';\nexport const real = 1;",
      'c.js': "export * from './b.js';",
    },
    expect: [],
  },
  {
    name: 'a side-effect import of a module that is not there',
    files: { 'a.js': "import './missing.js';\nexport const f = () => 1;" },
    expect: ['./missing.js'],
  },
  {
    name: 'a path that climbs out of the tree is not clamped into it',
    files: { 'a.js': "import { x } from '../../outside.js';\nexport const f = () => x;", 'outside.js': 'export const x = 1;' },
    expect: [],
  },
  {
    name: 'export default class and export default function both count',
    files: {
      'a.js': "import C from './b.js';\nimport g from './c.js';\nexport const f = () => new C() + g();",
      'b.js': 'export default class Thing {}',
      'c.js': 'export default function g() { return 1; }',
    },
    expect: [],
  },
  {
    name: 'export async function and export function*',
    files: {
      'a.js': "import { go, gen } from './b.js';\nexport const f = () => go() + gen();",
      'b.js': 'export async function go() { return 1; }\nexport function* gen() { yield 1; }',
    },
    expect: [],
  },
];

export function runLinkTests() {
  const failures = [];
  for (const t of LINK_TESTS) {
    const got = checkImports(t.files).map((f) => f.name).sort();
    const want = [...t.expect].sort();
    if (got.join(',') !== want.join(',')) failures.push(`${t.name}: expected [${want}] got [${got}]`);
  }
  return failures;
}

export function runSelfTests() {
  const failures = [];
  for (const t of SELF_TESTS) {
    const got = analyze(t.src, join(root, 'self-test.js')).findings.map((f) => f.name).sort();
    const want = [...t.expect].sort();
    if (got.join(',') !== want.join(',')) {
      failures.push(`${t.name}: expected [${want}] got [${got}]`);
    }
  }
  return failures;
}

// --- walking the tree -------------------------------------------------------

// `data/` holds JSON, but it also holds `data/loader.js` — skipping the whole
// directory quietly left one module unscanned, which the link pass noticed by
// reporting main.js's import of it as pointing at nothing. Only `.js` is
// collected either way, so there is nothing to skip for.
const SKIP_DIRS = new Set(['node_modules', '.git']);

export function moduleFiles(dir = root, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) moduleFiles(full, acc);
    else if (entry.endsWith('.js')) acc.push(full);
  }
  return acc;
}

export function checkTree() {
  const out = [];
  const sources = {};
  for (const file of moduleFiles().sort()) {
    const rel = relative(root, file).replaceAll('\\', '/');
    const src = readFileSync(file, 'utf8');
    sources[rel] = src;
    out.push({ file: rel, ...analyze(src, file) });
  }
  // The link pass, folded into the same findings so one gate reports both.
  const byFile = Object.fromEntries(out.map((r) => [r.file, r]));
  for (const f of checkImports(sources)) {
    const row = byFile[f.file];
    if (!row) continue;
    row.findings.push({
      name: f.name,
      line: f.line,
      count: 1,
      why: f.kind === 'missing-module'
        ? `imports '${f.name}', which is not a module in this tree`
        : `is imported from '${f.from}', which does not export it`,
    });
    row.findings.sort((a, b) => a.line - b.line);
  }
  return out;
}

// --- CLI --------------------------------------------------------------------

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const report = process.argv.includes('--report');
  const selfOnly = process.argv.includes('--self');
  const started = Date.now();

  const selfFailures = [...runSelfTests(), ...runLinkTests()];
  if (selfFailures.length) {
    console.error(`scopecheck: the tokenizer fails its own corpus (${selfFailures.length}):`);
    for (const f of selfFailures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`scopecheck: ${SELF_TESTS.length} syntax cases, ${LINK_TESTS.length} link cases pass`);
  if (selfOnly) process.exit(0);

  const results = checkTree();
  let free = 0;
  for (const r of results) {
    if (report) console.log(`  ${r.file.padEnd(28)} ${String(r.tokens).padStart(6)} tokens · ${String(r.bound.size).padStart(4)} bound · ${String(r.reads.size).padStart(4)} read`);
    for (const f of r.findings) {
      console.error(`${r.file}:${f.line}  ${f.name} ${f.why ?? `is not bound in this file (read ${f.count}×)`}`);
      free++;
    }
  }
  const ms = Date.now() - started;
  if (free) {
    console.error(`\nscopecheck ✗  ${free} unbound name${free === 1 ? '' : 's'} across ${results.length} modules (${ms}ms)`);
    process.exit(1);
  }
  console.log(`scopecheck ✓  ${results.length} modules, every name bound and every import answered (${ms}ms)`);
}
