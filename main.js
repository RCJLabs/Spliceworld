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
import { pushNews } from './campaign/campaign.js';
import { tickWorld } from './campaign/world.js';
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

// R74 — the two heaviest screens load on FIRST USE rather than at boot.
// Measured: they pull in 8 modules and 133 KB reachable no other way (the
// War Room and the Dex, and through the War Room the whole battle UI, the
// forecast, the readout and the subtab bar), out of an eager graph of 55
// modules and 701 KB with no dynamic imports in it at all — against
// CLAUDE.md's own "lazy-init heavy systems".
//
// What this buys is PARSE AND EXECUTE time, not download: sw.js precaches
// the whole shell on purpose, so the bytes are already on the device for
// offline play. That is the honest version of the win — the boot stops
// compiling a battle engine's worth of UI before it can paint a ranch.
//
// A screen is rendered by whatever it is: a function that paints now, or a
// loader that paints as soon as the module arrives. Callers cannot tell,
// which is why showScreen and tick stay synchronous.
const warmScreens = new Map();
const loadingScreens = new Map();
function lazy(load, exportName) {
  return (root) => {
    const ready = warmScreens.get(exportName);
    if (ready) { ready(root, ctx); return; }
    // Already loading: the continuation below was attached when the import
    // started and paints this same container, so there is nothing to add.
    // Attaching another here would render N times for N calls — and three
    // separate things call this during a cold load (a tab tap, the 30s
    // interval, and visibilitychange), each one a full re-render of the
    // heaviest screen in the game at the moment it is already slowest.
    if (loadingScreens.has(exportName)) return;

    // A tab that is lit, un-hidden and empty is precisely the "half-live
    // shell" main.js's own boot-failure comment exists to rule out. Before
    // this phase the render landed in the same task as the tab highlight, so
    // the state could not occur; it can now, for as long as the fetch takes.
    root.innerHTML = '<section class="card"><p class="ranch-msg">Warming up the lab…</p></section>';

    const inFlight = load();
    loadingScreens.set(exportName, inFlight);
    // Two-argument `then`, NOT `.then(...).catch(...)`: a catch chained after
    // the render handler also catches anything the RENDER throws, which would
    // blame the network for a bug in the War Room and tell the player to check
    // their connection. The rejection path here can only be the import.
    inFlight.then(
      (mod) => {
        warmScreens.set(exportName, mod[exportName]);
        // If the player moved on while this was loading there is nothing to
        // paint that anyone can see — the same predicate tick() uses to decide
        // whether a screen is worth rendering at all. The next tap renders
        // synchronously off the warm cache.
        if (!root.hidden) mod[exportName](root, ctx);
      },
      () => {
        // Offline with a cold cache is the only way here, and the recovery is
        // a RELOAD, not another tap: a dynamic import that fails to fetch is
        // recorded as failed in the document's module map, so importing the
        // same specifier again rejects immediately without touching the
        // network. Verified in this project's own Chromium — second attempt,
        // server back up, zero further requests. The first version of this
        // card told the player to tap the tab again, which could never have
        // worked. Same shape as renderBootFailure, for the same reason.
        loadingScreens.delete(exportName);
        root.innerHTML = '<section class="card"><p class="ranch-msg">This screen could not be loaded.</p>'
          + '<p class="fine-print">It needs one more piece than the rest of the game, and that piece did'
          + ' not arrive. Reloading will fetch it again.</p>'
          + '<button type="button" class="big-btn" id="lazy-reload">Reload</button></section>';
        root.querySelector('#lazy-reload').addEventListener('click', () => location.reload());
      }
    );
  };
}

const SCREENS = {
  ranch: (root) => renderRanchScreen(root, ctx),
  pens: (root) => renderPensScreen(root, ctx),
  vault: (root) => renderVaultScreen(root, ctx),
  theater: (root) => renderTheaterScreen(root, ctx),
  battle: lazy(() => import('./campaign/ui.js'), 'renderWarRoomScreen'),
  dex: lazy(() => import('./splice/dex-ui.js'), 'renderDexScreen'),
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
    const on = b.dataset.screen === name;
    b.classList.toggle('active', on);
    // R73 — which screen you are on was said in colour and nothing else.
    if (on) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
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

// R73 — the overlay is a DIALOG, made one in a single place. Nine call sites
// across four modules open it the same hand-rolled way (`overlay.hidden =
// false; overlay.innerHTML = …`), and teaching all nine about focus, Escape
// and labelling would have taught the tenth nothing. This watches the
// element instead, so every overlay the game has — and every one it grows —
// behaves like a dialog without its author thinking about it:
//   · an accessible name, taken from the heading the panel already writes
//   · focus moved inside on open and RESTORED to the opener on close, which
//     is the difference between a keyboard user continuing and being dumped
//     at the top of the document
//   · Escape closes it, the same thing every one of these panels already
//     offers as a Cancel button
//   · Tab cycles within it while it is open (`aria-modal` is a promise to
//     assistive tech; the trap is what makes it true for everyone else)
function installDialogBehaviour(overlay) {
  const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]),'
    + ' textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  let opener = null;

  // The picker sheet is its own modal with its own Escape and its own focus,
  // and it opens ON TOP of a panel (the settings panel picks a theme that
  // way). While it is up, this dialog stands down rather than fighting it
  // for the Tab key.
  const pickerUp = () => !document.getElementById('picker')?.hidden;

  const onKey = (e) => {
    if (overlay.hidden || pickerUp()) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      overlay.hidden = true;
      overlay.innerHTML = '';
      return;
    }
    if (e.key !== 'Tab') return;
    const items = [...overlay.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', onKey);

  // `hidden` is toggled directly by nine call sites across five modules, and
  // every one of them closes by hand. So the ATTRIBUTE is the event, in both
  // directions — which is the whole reason this lives here instead of in a
  // close() helper the callers would have to remember to call. The first
  // version of this only restored focus down its own Escape path, and every
  // Close button in the game silently kept the old behaviour.
  new MutationObserver((records) => {
    const toggled = records.some((r) => r.type === 'attributes');
    if (overlay.hidden) {
      if (!toggled) return;
      // Restoring focus is the half that is always forgotten: without it a
      // keyboard user is dumped at the top of the document, several screens
      // from the control they opened.
      if (opener && document.contains(opener)) opener.focus();
      opener = null;
      return;
    }
    if (toggled) {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    const heading = overlay.querySelector('h1, h2, h3, h4');
    overlay.setAttribute('aria-label', heading?.textContent?.trim() || 'Dialog');
    // Only pull focus in when it is not already inside: these panels
    // re-render in place (the settings panel walks four screens without ever
    // closing), and stealing focus back to the top on every repaint would
    // undo the player's own Tab.
    if (!overlay.contains(document.activeElement)) {
      overlay.querySelector(FOCUSABLE)?.focus();
    }
  }).observe(overlay, { attributes: true, attributeFilter: ['hidden'], childList: true });
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
  installDialogBehaviour($('#overlay'));

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
