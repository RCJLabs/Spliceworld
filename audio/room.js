// R111 — THE ROOM, AND THE BUZZ. Everything R111 added that is not a note.
//
// The Ranch, Pens, Vault, Theater and Dex made no sound at all between one
// press and the next: nineteen stingers fired on events and the rest was
// silence. A bed is filtered noise at a couple of percent — a barn on a windy
// afternoon, a lab extractor two rooms away — under its own toggle, because
// ambient sound is the setting people turn off first and a room tone nobody
// can stop is worse than no room tone at all.
//
// LAZY, AND THE BUDGET IS WHY. `audio/sfx.js` is eager because main.js needs
// the mute state on the first frame. None of THIS is first-frame work: there
// is no AudioContext until a gesture, so a bed cannot start before one, and a
// buzz answers a KO. Shipped inside sfx.js it cost 2.6 KB of eager code and
// 3.3 KB of eager prose and took KB_CAP over — and the note beside that cap
// says the answer to a third raise is to find the lever, not the number.
// This is the lever: a player who never turns the sound on never fetches it.
//
// `audio/sfx.js` owns the CONTEXT and the four preferences, and passes both
// in. Nothing here reads a setting or decides whether it is allowed to make a
// noise — that judgement stays in one file, beside the mute.

import { mulberry32 } from '../util/rng.js';

// One bed at a time, keyed by the screen it belongs to, so arriving at the
// Ranch twice does not restart the barn. `showScreen` calls in on every
// navigation; a bed that restarted on each one would be a click track.
let bed = null;

let noiseBuf = null;
function noise(ctx) {
  if (noiseBuf) return noiseBuf;
  const n = Math.floor(ctx.sampleRate * 2);
  noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  // Brownian-ish: a random walk reads warmer than white and costs one add.
  // SEEDED, and not because anything replays it — two seconds of looped hiss
  // is the one place in this repo where nobody could tell. CLAUDE.md's rule
  // has no "unless it does not matter" clause, and a file that keeps one bare
  // `Math.random()` because it seemed harmless is how the next one arrives
  // somewhere that does.
  const rnd = mulberry32(0x5eed);
  let last = 0;
  for (let i = 0; i < n; i++) {
    last = (last + (rnd() * 2 - 1) * 0.08) * 0.985;
    d[i] = last;
  }
  return noiseBuf;
}

export function stopAmbience() {
  if (!bed) return;
  try { bed.src.stop(); } catch { /* already gone */ }
  bed = null;
}

// A screen with no entry in the table is SILENT rather than broken, which is
// what lets a screen ship without one — the same rule `cuesFor` applies to a
// moment nobody wrote a stinger for.
export function startAmbience(ctx, screen, content, volume) {
  const spec = content?.voice?.ambience?.[screen];
  if (!spec) { stopAmbience(); return; }
  if (bed?.screen === screen) return;
  stopAmbience();
  try {
    const src = ctx.createBufferSource();
    const filt = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    src.buffer = noise(ctx);
    src.loop = true;
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(spec.cut ?? 500, ctx.currentTime);
    gain.gain.setValueAtTime(Math.max(0.0001, (spec.vol ?? 0.02) * volume), ctx.currentTime);
    src.connect(filt).connect(gain).connect(ctx.destination);
    src.start();
    bed = { screen, src };
  } catch { /* no bed today; the game is unchanged */ }
}

// HAPTICS, on the three moments that are worth a buzz and no others. A KO, a
// capture and a conquest: each is a thing the player had happen TO them, not
// a thing they tapped — the same rule `cuesFor` already applies to sound, and
// the reason the patterns live in `data/voice.json` beside it.
//
// `navigator.vibrate` is absent on desktop and refused inside some iframes,
// so this never assumes it worked.
export function buzz(kind, content) {
  const pattern = content?.voice?.haptics?.[kind];
  if (!pattern) return;
  try { navigator.vibrate?.(pattern); } catch { /* not every device shakes */ }
}
