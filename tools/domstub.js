// A DOM stub that RECORDS. R75 built it inline in the smoke suite to fire
// every handler a screen binds; R76 needs the same stub to walk the surfaces
// a single render cannot reach, and two copies of a DOM stub is how two gates
// drift apart — the argument `ui/tabs.js` already makes about sub-navigation.
//
// WHY A RECORDING STUB AT ALL. Every other stub in the suite answers
// `querySelectorAll` with `[]`, so the binding loops iterate an empty list and
// nothing is ever registered. The renders are exercised constantly; the bodies
// of the functions those renders BIND had never been executed once, which is
// how R60's `opOdds` ReferenceError shipped past a 124-cell render harness.
//
// This one answers from the HTML the screen actually painted: it finds the
// `data-*` attribute the selector asks about in `innerHTML`, walks out to the
// enclosing tag, and hands back an element carrying THE WHOLE TAG's dataset,
// its `disabled`, its `value` and its `id`. That last part matters more than
// it sounds: a handler selected by `[data-act]` that then reads
// `btn.dataset.care` used to get `undefined` and take the wrong branch, so the
// gate was firing the handler and measuring the else.

const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

// A class, so `x instanceof HTMLElement` is true for these and a handler takes
// the branch it takes in a browser rather than the else.
export class StubEl {}

export function makeEl(dataset = {}, tag = 'button') {
  return Object.assign(new StubEl(), {
    tagName: tag.toUpperCase(), dataset, value: '', textContent: '', innerHTML: '',
    hidden: false, checked: false, disabled: false, files: [], id: '',
    style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, appendChild() {}, removeChild() {},
    remove() {}, focus() {}, blur() {}, click() {}, scrollIntoView() {},
    insertAdjacentHTML() {}, setAttribute() {}, getAttribute: () => null,
    hasAttribute: () => false, closest: () => null, select() {}, setSelectionRange() {},
    querySelector: () => makeEl(), querySelectorAll: () => [],
    parentElement: null, offsetParent: null,
    getBoundingClientRect: () => ({ width: 40, height: 40, top: 0, left: 0, right: 40, bottom: 40 }),
  });
}

// Every `data-*` name that appears in a chunk of painted HTML. This is the
// DENOMINATOR of the coverage gate: a control the game renders is a control
// the suite has to press, and deriving it from what was actually painted means
// a new one counts the day it lands rather than the day somebody adds it to a
// list.
export function dataAttrsIn(html) {
  const out = new Set();
  for (const m of String(html).matchAll(/\bdata-([a-z][\w-]*)=/g)) out.add(m[1]);
  return out;
}

// A tiny query engine over painted HTML. Every stub before this one answered
// only `[data-x]` selectors, which quietly meant that `#thtr-frames button`,
// `.pick-row` and `[data-action]` bound NOTHING — the frame chooser, the
// picker sheet and the whole arena move bar were invisible to the suite, and
// invisible in the one way that looks like success: no error, no handler, no
// failure. Supporting the selector shapes this codebase actually uses (comma
// groups, descendant chains, tag/id/class/attribute, and `:not([disabled])`)
// is ~70 lines and turns "the gate fires what it can find" into "the gate
// fires what the browser would".
const VOID = new Set(['br', 'img', 'input', 'hr', 'meta', 'link', 'source', 'track', 'use', 'stop']);

export function parseHTML(html) {
  const nodes = [];
  const stack = [];
  const re = /<(\/)?([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>])*?)(\/)?>/g;
  let m;
  while ((m = re.exec(html))) {
    const [full, closing, tag, attrText, selfShut] = m;
    const name = tag.toLowerCase();
    if (closing) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === name) { stack[i].end = m.index; stack.length = i; break; }
      }
      continue;
    }
    // Double-quoted, single-quoted, unquoted, or bare. Reading only the
    // double-quoted form let a single-quoted value's words masquerade as
    // attribute NAMES on the same tag.
    const attrs = {};
    for (const a of attrText.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
      if (a[1]) attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? '';
    }
    const node = {
      tag: name, attrs, at: m.index,
      id: attrs.id ?? '',
      classes: new Set((attrs.class ?? '').split(/\s+/).filter(Boolean)),
      data: Object.fromEntries(Object.entries(attrs)
        .filter(([k]) => k.startsWith('data-'))
        .map(([k, v]) => [k.slice(5), v])),
      disabled: 'disabled' in attrs,
      value: attrs.value ?? '',
      ancestors: stack.map((n) => n),
      contentStart: m.index + full.length,
      end: m.index + full.length,
    };
    nodes.push(node);
    if (!selfShut && !VOID.has(name)) stack.push(node);
  }
  return nodes;
}

// `button[data-x="y"]:not([disabled])` → the predicate it describes.
function simpleMatcher(part) {
  const tests = [];
  let rest = part;
  // Every `:not()`, not just the first, and each may hold a selector LIST.
  for (const not of [...rest.matchAll(/:not\(([^)]*)\)/g)]) {
    const inners = not[1].split(',').map((x) => simpleMatcher(x.trim()));
    tests.push((n) => !inners.some((t) => t(n)));
  }
  rest = rest.replace(/:not\([^)]*\)/g, '');
  rest = rest.replace(/:[\w-]+(\([^)]*\))?/g, '');       // other pseudo-classes: ignored
  for (const a of rest.matchAll(/\[([\w-]+)(?:([~^$*|]?=)["']?([^"'\]]*)["']?)?\]/g)) {
    const [, name, op, want] = a;
    tests.push((n) => {
      if (want === undefined) return name in n.attrs;
      const have = n.attrs[name];
      if (have === undefined) return false;
      switch (op) {
        case '~=': return have.split(/\s+/).includes(want);
        case '^=': return have.startsWith(want);
        case '$=': return have.endsWith(want);
        case '*=': return have.includes(want);
        case '|=': return have === want || have.startsWith(`${want}-`);
        default: return have === want;
      }
    });
  }
  rest = rest.replace(/\[[^\]]*\]/g, '');
  for (const c of rest.matchAll(/\.([\w-]+)/g)) tests.push((n) => n.classes.has(c[1]));
  rest = rest.replace(/\.[\w-]+/g, '');
  const idAt = rest.match(/#([\w-]+)/);
  if (idAt) { tests.push((n) => n.id === idAt[1]); rest = rest.replace(idAt[0], ''); }
  const tag = rest.trim().toLowerCase();
  if (tag && tag !== '*') tests.push((n) => n.tag === tag);
  return (n) => tests.every((t) => t(n));
}

export function queryAll(nodes, selector) {
  const out = new Set();
  for (const group of String(selector).split(',')) {
    // `a > b` is a direct child; `a b` any descendant. This tree uses no
    // child combinator today, but parsing `>` as a TAG NAME (which is what
    // splitting on whitespace does) silently matches nothing, and a stub
    // that binds nothing is a gate that passes.
    const raw = group.trim().replace(/\s*>\s*/g, ' > ').split(/\s+/).filter(Boolean);
    const steps = [];
    let direct = false;
    for (const piece of raw) {
      if (piece === '>') { direct = true; continue; }
      steps.push({ test: simpleMatcher(piece), direct });
      direct = false;
    }
    if (!steps.length) continue;
    const last = steps[steps.length - 1];
    for (const n of nodes) {
      if (!last.test(n)) continue;
      let ok = true;
      let at = n.ancestors.length - 1;
      for (let i = steps.length - 2; i >= 0 && ok; i--) {
        const step = steps[i + 1];             // the combinator belongs to the RIGHT side
        if (step.direct) {
          ok = at >= 0 && steps[i].test(n.ancestors[at]);
          at--;
          continue;
        }
        let found = false;
        while (at >= 0) {
          if (steps[i].test(n.ancestors[at])) { found = true; at--; break; }
          at--;
        }
        ok = found;
      }
      if (ok) out.add(n);
    }
  }
  // Document order, not selector-group order: `querySelector('h1, h2, h3')`
  // must return the first heading on the page, not the first h1 anywhere.
  return [...out].sort((a, b) => a.at - b.at);
}

export function recordingRoot() {
  const bound = [];
  let html = '';
  let nodes = [];
  const painted = new Set();

  const elFor = (node) => {
    const dataset = {};
    for (const [k, v] of Object.entries(node.data)) dataset[camel(k)] = v;
    const el = makeEl(dataset, node.tag);
    el.disabled = node.disabled;
    el.value = node.value;
    el.id = node.id;
    el.checked = 'checked' in node.attrs;
    el.textContent = html.slice(node.contentStart, node.end).replace(/<[^>]*>/g, '').trim();
    el.classList = {
      add() {}, remove() {}, toggle() {},
      contains: (c) => node.classes.has(c),
    };
    el.getAttribute = (a) => node.attrs[String(a).toLowerCase()] ?? null;
    el.hasAttribute = (a) => String(a).toLowerCase() in node.attrs;
    el.closest = (sel) => {
      const test = simpleMatcher(String(sel).trim());
      for (let i = node.ancestors.length - 1; i >= 0; i--) {
        if (test(node.ancestors[i])) return elFor(node.ancestors[i]);
      }
      return test(node) ? el : null;
    };
    el.addEventListener = (type, fn) => bound.push({ type, fn, el, sel: String(node.tag) });
    // An element handed back by a query is itself queryable, and its results
    // RECORD. Without this a handler that reaches inside its own row —
    // `btn.closest('.card').querySelector('input').addEventListener(…)` —
    // binds nothing at all, which reads as coverage rather than as a hole.
    //
    // …and an element whose innerHTML is REPLACED has to become queryable
    // again, which is how the arena's "tap to skip" button works: `cmd`
    // paints a button into itself and then binds it. Assigning the string
    // and stopping there returned null and the handler threw.
    let ownNodes = null;
    let ownHTML = '';
    Object.defineProperty(el, 'innerHTML', {
      get: () => (ownNodes ? ownHTML : html.slice(node.contentStart, node.end)),
      set: (v) => { ownHTML = String(v); ownNodes = parseHTML(ownHTML); for (const a of dataAttrsIn(ownHTML)) painted.add(a); },
      configurable: true,
    });
    const inside = (sel) => (ownNodes
      ? queryAll(ownNodes, sel)
      : queryAll(nodes.filter((n) => n.ancestors.includes(node)), sel));
    el.querySelectorAll = (sel) => inside(sel).map((n) => {
      const child = elFor(n);
      child.addEventListener = (type, fn) => bound.push({ type, fn, el: child, sel });
      return child;
    });
    el.querySelector = (sel) => el.querySelectorAll(sel)[0] ?? null;
    return el;
  };

  const collect = (sel) => queryAll(nodes, sel).map((n) => {
    const el = elFor(n);
    el.addEventListener = (type, fn) => bound.push({ type, fn, el, sel });
    return el;
  });

  const host = {
    get innerHTML() { return html; },
    set innerHTML(v) {
      html = String(v);
      nodes = parseHTML(html);
      for (const a of dataAttrsIn(html)) painted.add(a);
    },
    querySelectorAll: collect,
    // A selector that matches nothing still has to hand back something
    // bindable, or the handler is never registered and the gate silently
    // under-counts instead of failing.
    querySelector: (sel) => {
      const hit = collect(sel)[0];
      if (hit) return hit;
      const el = makeEl();
      el.id = String(sel).startsWith('#') ? String(sel).slice(1) : '';
      el.addEventListener = (type, fn) => bound.push({ type, fn, el, sel });
      return el;
    },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener(type, fn) { bound.push({ type, fn, el: host, sel: 'root' }); },
    // A host that cannot be UNbound is a host that crashes any handler which
    // cleans up after itself — the move sheet's backdrop, for one, which R75
    // rewrote to remove-then-add precisely so it survives a re-render.
    removeEventListener(type, fn) {
      const at = bound.findIndex((h) => h.type === type && h.fn === fn);
      if (at !== -1) bound.splice(at, 1);
    },
    dispatchEvent() { return true; },
    insertAdjacentHTML(_where, more) { host.innerHTML = html + String(more); },
    contains: () => false, focus() {}, blur() {}, scrollIntoView() {},
    setAttribute() {}, getAttribute: () => null, hasAttribute: () => false,
    closest: () => null,
    style: {}, dataset: {}, hidden: false, appendChild() {}, remove() {},
  };
  return { host, bound, painted };
}

// The `data-*` names a fired handler's element actually carried. Coverage is
// counted on the ELEMENT, not the selector, because that is the question worth
// asking: did a handler run holding this attribute?
export function attrsOfFire(h) {
  const out = new Set();
  for (const k of Object.keys(h.el?.dataset ?? {})) out.add(kebab(k));
  const sel = String(h.sel).match(/\[data-([\w-]+)/);
  if (sel) out.add(sel[1]);
  return out;
}

// A synthetic event that satisfies every shape the handlers read.
export function fakeEvent(el) {
  return {
    preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {},
    key: 'Enter', code: 'Enter', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false,
    target: el, currentTarget: el, detail: 1,
  };
}

// Installs `document`, `location` and `HTMLElement` for the length of a gate
// and hands back the restore. Nothing downstream should inherit a half-real
// DOM, which is why this returns a function rather than leaving it installed.
// A localStorage that behaves. The save layer reads and writes real keys, and
// with no storage at all every read throws and `loadSlotRegistry` quietly
// synthesises a one-slot registry — so the settings panel renders one row and
// the Switch and Delete buttons, which only exist beside an INACTIVE slot,
// were never drawn for any gate to press.
export function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    // The walk shares one storage across every surface, so a run that writes
    // (New slot does) changes what the next one renders. `reset()` puts the
    // seed back, which is what "each handler is fired against a screen
    // rendered fresh for it" has to mean for state that lives outside the
    // save object too.
    reset: () => { map.clear(); for (const [k, v] of Object.entries(seed)) map.set(k, v); },
    getItem: (k) => (map.has(String(k)) ? map.get(String(k)) : null),
    setItem: (k, v) => { map.set(String(k), String(v)); },
    removeItem: (k) => { map.delete(String(k)); },
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  };
}

// One install at a time. Restoring out of order would leave the timer wrapper
// and the storage stub behind for everything downstream, and a half-real DOM
// inherited by the next gate is the kind of thing that gets debugged twice.
let installed = false;

export function installDom({ overlay, picker, storage, docBound } = {}) {
  if (installed) throw new Error('installDom: a DOM stub is already installed — restore it first');
  installed = true;
  const saved = {
    doc: globalThis.document, loc: globalThis.location,
    el: globalThis.HTMLElement, win: globalThis.window,
    store: globalThis.localStorage,
  };
  if (storage) globalThis.localStorage = storage;
  // Nothing the gate starts may outlive it. The arena's long press arms a
  // 500 ms timer; that timer fired after the walk had put the real (absent)
  // `document` back and crashed the process AFTER the suite had printed its
  // tick. Every timer started under the stub is tracked and cancelled on
  // restore — the gate fires handlers, it does not run the clock.
  const timers = new Set();
  const realSetTimeout = globalThis.setTimeout;
  const realSetInterval = globalThis.setInterval;
  globalThis.setTimeout = (...args) => { const id = realSetTimeout(...args); timers.add(id); return id; };
  globalThis.setInterval = (...args) => { const id = realSetInterval(...args); timers.add(id); return id; };
  globalThis.HTMLElement = StubEl;
  globalThis.location = { reload() {}, search: '', href: '', hash: '' };
  globalThis.document = {
    body: makeEl({}, 'body'),
    documentElement: makeEl({}, 'html'),
    activeElement: null,
    createElement: (t) => makeEl({}, t),
    querySelector: (sel) => {
      if (sel === '#overlay' && overlay) return overlay.host;
      if (sel === '#picker' && picker) return picker.host;
      return makeEl();
    },
    querySelectorAll: () => [],
    // A document-level listener is a real handler with no screen behind it —
    // the picker sheet's Escape-and-Tab trap is bound this way, and a no-op
    // here meant it was never fired by anything. Recorded like any other.
    addEventListener(type, fn) { docBound?.push({ type, fn, el: null, sel: 'document' }); },
    removeEventListener(type, fn) {
      if (!docBound) return;
      const at = docBound.findIndex((h) => h.type === type && h.fn === fn);
      if (at !== -1) docBound.splice(at, 1);
    },
    contains: () => false,
  };
  return () => {
    installed = false;
    for (const id of timers) { clearTimeout(id); clearInterval(id); }
    timers.clear();
    globalThis.setTimeout = realSetTimeout;
    globalThis.setInterval = realSetInterval;
    globalThis.document = saved.doc;
    globalThis.location = saved.loc;
    globalThis.HTMLElement = saved.el;
    globalThis.window = saved.win;
    if (storage) globalThis.localStorage = saved.store;
  };
}
