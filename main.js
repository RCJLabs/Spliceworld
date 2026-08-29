// App shell: boot, tabs, offline ticking, ticker. Screens render themselves
// (ranch/ui.js, splice/theater-ui.js, splice/pens-ui.js, splice/vault-ui.js).
// The M0 free-form dev slab retired in M3 — the Theater consumes real vault
// tokens now; legacy `genome` data stays in old saves, unshown.

import { loadContent } from './data/loader.js';
import { loadSave, saveGame } from './save/save.js';
import { ensureRanchSeeded, applyElapsed } from './ranch/ranch.js';
import { renderRanchScreen } from './ranch/ui.js';
import { renderVaultScreen } from './splice/vault-ui.js';
import { renderTheaterScreen } from './splice/theater-ui.js';
import { renderPensScreen } from './splice/pens-ui.js';
import { runExtraction } from './splice/extract-ui.js';
import { renderWarRoomScreen } from './campaign/ui.js';
import { tickCampaign } from './campaign/campaign.js';
import { renderDexScreen } from './splice/dex-ui.js';
import * as sfx from './audio/sfx.js';

// Dev time-warp: ?warp=48 pretends 48 hours have passed. QA-only — the
// warp lives in the URL, never in the save, so removing it can produce a
// lastTickAt in the future; applyElapsed clamps that to zero elapsed.
const WARP_MS = (Number(new URLSearchParams(location.search).get('warp')) || 0) * 3600000;
const NOW = () => Date.now() + WARP_MS;

const TICKER_LINES = [
  'Local zoo reports goat shortage. Authorities baffled.',
  'Feed store owner retires early, thanks "one extremely loyal customer."',
  'Study finds ranch animals happiest when brushed by cackling owners.',
  'Mail-order livestock industry booming. Postal service requests hazard pay.',
  'Area geneticist "just asking questions" about eagle wingspans.',
  'Hardware store sells out of googly eyes. No one is asking why.',
  'Weather service issues advisory for "unusually confident livestock."',
  'City council votes to pretend everything is normal.',
  'Ethics board postpones meeting indefinitely, cites scheduling.',
  'Mysterious kazoo noises reported near old barn. Investigation pending.',
  'Ornithologists puzzled by goat seen "filing a flight plan."',
];

const $ = (sel) => document.querySelector(sel);

let content;
let state;

const ctx = {
  get state() { return state; },
  get content() { return content; },
  now: NOW,
  save: () => saveGame(state),
  refreshTicker: () => updateTicker(),
  onExtract: (animalId) =>
    runExtraction($('#overlay'), ctx, animalId, () => showScreen(state.activeScreen)),
};

const SCREENS = {
  ranch: (root) => renderRanchScreen(root, ctx),
  pens: (root) => renderPensScreen(root, ctx),
  vault: (root) => renderVaultScreen(root, ctx),
  theater: (root) => renderTheaterScreen(root, ctx),
  battle: (root) => renderWarRoomScreen(root, ctx),
  dex: (root) => renderDexScreen(root, ctx),
};

function showScreen(name) {
  if (!SCREENS[name]) name = 'ranch';
  state.activeScreen = name;
  saveGame(state);
  for (const s of Object.keys(SCREENS)) $(`#screen-${s}`).hidden = s !== name;
  document.querySelectorAll('#tabs button').forEach((b) => {
    b.classList.toggle('active', b.dataset.screen === name);
  });
  tick();
}

// Timestamps, not intervals: recompute elapsed effects on load, on focus,
// and on a slow display refresh (settling countdowns, care cooldowns).
function tick() {
  applyElapsed(state, content, NOW());
  tickCampaign(state, content, NOW());
  saveGame(state);
  updateTicker();
  const name = state.activeScreen;
  const root = $(`#screen-${name}`);
  if (root && !root.hidden) SCREENS[name](root);
}

// Latest news leads; otherwise a seeded deadpan default.
function updateTicker() {
  $('#ticker').textContent = state.news.length
    ? state.news[state.news.length - 1]
    : TICKER_LINES[Math.abs(state.seed) % TICKER_LINES.length];
}

async function boot() {
  try {
    content = await loadContent('.');
  } catch (err) {
    document.querySelector('main').innerHTML =
      `<p class="boot-error">Could not load content data (${err.message}). ` +
      `If you opened index.html directly, serve it instead: <code>python3 -m http.server</code></p>`;
    return;
  }

  state = loadSave();
  ensureRanchSeeded(state, content, NOW());
  applyElapsed(state, content, NOW());

  updateTicker();
  document.querySelectorAll('#tabs button').forEach((btn) => {
    btn.addEventListener('click', () => showScreen(btn.dataset.screen));
  });
  showScreen(state.activeScreen);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tick();
  });
  setInterval(() => {
    if (!document.hidden) tick();
  }, 30000);

  // Audio: context on first gesture (autoplay policy), mute persisted.
  sfx.setMuted(state.settings.muted);
  const muteBtn = $('#mute');
  const paintMute = () => { muteBtn.textContent = state.settings.muted ? '🔇' : '🔊'; };
  paintMute();
  document.addEventListener('pointerdown', () => sfx.initAudio(), { once: true });
  muteBtn.addEventListener('click', () => {
    state.settings.muted = !state.settings.muted;
    sfx.setMuted(state.settings.muted);
    saveGame(state);
    paintMute();
    if (!state.settings.muted) sfx.play('click');
  });

  // PWA: offline shell. Registration failure is never a problem worth
  // showing anyone.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();
