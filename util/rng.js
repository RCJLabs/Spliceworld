// Seeded RNG (mulberry32). No bare Math.random() in game logic — every
// splice/battle/breed outcome must be reproducible from a seed so the
// balance harness (M4.5) and async ghosts can replay them.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a — turns string seeds ("splice:42") into 32-bit ints.
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Derive an independent stream from the world seed + a label + a counter,
// e.g. rngStream(state.seed, 'splice', state.spliceCount).
export function rngStream(worldSeed, label, counter = 0) {
  return mulberry32(hashString(`${worldSeed}:${label}:${counter}`));
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

// Fresh world seed for a brand-new save. Seed *creation* is the one place
// nondeterminism is allowed; everything downstream derives from it.
export function newWorldSeed() {
  if (globalThis.crypto?.getRandomValues) {
    const buf = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buf);
    return buf[0];
  }
  return (Date.now() ^ (performance?.now?.() * 1000 || 0)) >>> 0;
}

// R41: pick, but prefer a value nobody in `taken` is already using — only
// when the whole pool is spoken for does a repeat happen, and then as a
// lineage (Chompers II) rather than a duplicate. Fifteen chimera names over
// a nine-creature stable was a collision machine, per the player report
// that queued the phase.
export function pickFresh(rng, pool, taken) {
  const inUse = new Set(taken);
  const free = pool.filter((v) => !inUse.has(v));
  if (free.length) return pick(rng, free);
  const base = pick(rng, pool);
  for (const numeral of ['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']) {
    if (!inUse.has(`${base} ${numeral}`)) return `${base} ${numeral}`;
  }
  return `${base} ${1 + Math.floor(rng() * 998)}`;
}
