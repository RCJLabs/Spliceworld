// App shell: boot, tabs, offline ticking, ticker. Screens render themselves
// (ranch/ui.js, splice/theater-ui.js, splice/pens-ui.js, splice/vault-ui.js).
// The M0 free-form dev slab retired in M3 — the Theater consumes real vault
// tokens now; legacy `genome` data stays in old saves, unshown.

import { loadContent } from './data/loader.js';
import { loadSave, saveGame, SAVE_VERSION, FutureSaveError } from './save/save.js';
import { openSettings, THEMES, BASE_THEME } from './save/settings-ui.js';
import { ensureRanchSeeded, ensureDexVariants } from './ranch/ranch.js';
import { renderRanchScreen } from './ranch/ui.js';
import { renderVaultScreen } from './splice/vault-ui.js';
import { renderTheaterScreen } from './splice/theater-ui.js';
import { renderPensScreen } from './splice/pens-ui.js';
import { runExtraction } from './splice/extract-ui.js';
import { renderWarRoomScreen } from './campaign/ui.js';
import { pushNews } from './campaign/campaign.js';
import { tickWorld } from './campaign/world.js';
import { renderDexScreen } from './splice/dex-ui.js';
import * as sfx from './audio/sfx.js';
import { watchSignals, cuesFor } from './audio/sfx.js';
import { renderIcon } from './ui/icons.js';

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
  pushNews: (line) => { pushNews(state, line); updateTicker(); },
  onExtract: (animalId) =>
    runExtraction($('#overlay'), ctx, animalId, () => showScreen(state.activeScreen)),
  // A4: the Right Now panel lists things that live on other screens, so it
  // needs to be able to send you to one. Screen switching is the shell's job.
  goto: (name) => showScreen(name),
  applyTheme: () => applyTheme(),
};

const SCREENS = {
  ranch: (root) => renderRanchScreen(root, ctx),
  pens: (root) => renderPensScreen(root, ctx),
  vault: (root) => renderVaultScreen(root, ctx),
  theater: (root) => renderTheaterScreen(root, ctx),
  battle: (root) => renderWarRoomScreen(root, ctx),
  dex: (root) => renderDexScreen(root, ctx),
};

// Colour scheme. `settings.theme` picks one of the blocks in style.css
// (the list and the settings-panel UI both live in save/settings-ui.js —
// one source for what a theme id is, since this is the only other place
// that needs to know); ?theme= overrides it for previews without touching
// the save. Biohazard is the shipped scheme and lives in :root, so it
// needs no stamp — which also means a fresh load paints it before this
// ever runs.
function applyTheme() {
  const override = new URLSearchParams(location.search).get('theme');
  const name = override ?? state.settings?.theme ?? BASE_THEME;
  if (name === BASE_THEME || !THEMES.some((t) => t.id === name)) delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = name;
}

function showScreen(name) {
  if (!SCREENS[name]) name = 'ranch';
  // The single-screen battle layout locks the shell; leaving it unlocks.
  if (name !== 'battle') document.body.classList.remove('in-battle');
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
  // R59: what deserves a sound is decided in one place (audio/sfx.js) from a
  // snapshot of scalars. tick() is where every passive system advances, so
  // it is the only place that can see a job come back or a node fall while
  // nobody was looking.
  const beforeCues = watchSignals(state);
  // R64: one `now` for every system, one elapsed clock, one place that
  // decides the order (campaign/world.js). This used to read the clock
  // seven times and keep two elapsed timestamps.
  tickWorld(state, content, NOW());
  saveGame(state);
  updateTicker();
  for (const cue of cuesFor(beforeCues, watchSignals(state))) sfx.play(cue);
  const name = state.activeScreen;
  const root = $(`#screen-${name}`);
  if (root && !root.hidden) SCREENS[name](root);
}

// Latest news leads; otherwise a seeded deadpan default.
function updateTicker() {
  const line = state.news.length
    ? state.news[state.news.length - 1]
    : TICKER_LINES[Math.abs(state.seed) % TICKER_LINES.length];
  const ticker = $('#ticker');
  ticker.innerHTML = `${renderIcon('satellite', { size: 13 })}<span class="ticker-lead">BREAKING: </span>`;
  ticker.append(line);
}

// R71 — a boot that cannot proceed gets ONE screen that says so, replacing
// the whole body rather than leaving header/tabs/footer standing over a
// `<main>` that will never render into — a tab a player can tap that does
// nothing is the "half-live shell" this exists to close. Every failure
// offers a reload and nothing else: a reset button here would be a second,
// worse way to lose a save on top of whatever already went wrong.
function renderBootFailure(title, message) {
  document.body.innerHTML = `
    <div class="boot-fail">
      <div class="boot-fail-card card">
        <h1>${title}</h1>
        <p>${message}</p>
        <button type="button" id="boot-reload" class="big-btn">Reload</button>
      </div>
    </div>`;
  document.getElementById('boot-reload').addEventListener('click', () => location.reload());
}

async function boot() {
  try {
    content = await loadContent('.');
  } catch (err) {
    renderBootFailure(
      'Spliceworld won’t start',
      `Could not load content data (${err.message}). If you opened index.html directly, serve it ` +
      `instead: <code>python3 -m http.server</code>`
    );
    return;
  }

  try {
    state = loadSave();
  } catch (err) {
    if (err instanceof FutureSaveError) {
      // R71 — never a reset: the save has not been touched, and staying
      // that way is the entire point. Reloading is only useless until the
      // build actually catches up, at which point it is the fix.
      renderBootFailure(
        'This save is from a newer build',
        `This browser holds a save at v${err.foundVersion}; this build only understands up to ` +
        `v${SAVE_VERSION}. It has not been touched. Update the game — or, if it was just updated and ` +
        `this is stale, clear this site's cache — then reload, and it will pick up exactly where you left off.`
      );
    } else {
      renderBootFailure('Spliceworld won’t start', `The save could not be read (${err.message}).`);
    }
    return;
  }
  applyTheme();
  ensureRanchSeeded(state, content, NOW());
  ensureDexVariants(state, content);
  // The first tick (showScreen below runs one) settles the whole absence —
  // condition, upkeep, income and contests — from the one clock. A separate
  // applyElapsed here used to advance that clock first, which under one
  // clock would have paid nothing for the gap.

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
  document.addEventListener('pointerdown', () => sfx.initAudio(), { once: true });

  // R71: one door for sound, theme, save file and lab (save slot)
  // management — see save/settings-ui.js for all four. The footer used to
  // carry a mute button and a save-file button side by side; a slot picker
  // would have made a third.
  const settingsBtn = $('#settings');
  settingsBtn.innerHTML = renderIcon('settings');
  settingsBtn.addEventListener('click', () => openSettings($('#overlay'), ctx));

  // PWA: offline shell. Registration failure is never a problem worth
  // showing anyone.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();
