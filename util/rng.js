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
