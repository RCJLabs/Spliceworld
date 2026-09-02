// App shell: boot, tabs, offline ticking, ticker. Screens render themselves
// (ranch/ui.js, splice/theater-ui.js, splice/pens-ui.js, splice/vault-ui.js).
// The M0 free-form dev slab retired in M3 — the Theater consumes real vault
// tokens now; legacy `genome` data stays in old saves, unshown.

import { loadContent } from './data/loader.js';
import { loadSave, saveGame, exportSave, exportFilename, importSave, adoptSave, startNewRun, runSummary } from './save/save.js';
import { ensureRanchSeeded, ensureDexVariants, applyElapsed } from './ranch/ranch.js';
import { renderRanchScreen } from './ranch/ui.js';
import { renderVaultScreen } from './splice/vault-ui.js';
import { renderTheaterScreen } from './splice/theater-ui.js';
import { renderPensScreen } from './splice/pens-ui.js';
import { runExtraction } from './splice/extract-ui.js';
import { renderWarRoomScreen } from './campaign/ui.js';
import { tickCampaign, pushNews } from './campaign/campaign.js';
import { tickVat } from './splice/chaos.js';
import { tickResequencer } from './splice/resequencer.js';
import { ensureTemperaments } from './splice/temperament.js';
import { tickScars } from './splice/scars.js';
import { renderDexScreen } from './splice/dex-ui.js';
import * as sfx from './audio/sfx.js';
import { watchSignals, cuesFor } from './audio/sfx.js';

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
};

const SCREENS = {
  ranch: (root) => renderRanchScreen(root, ctx),
  pens: (root) => renderPensScreen(root, ctx),
  vault: (root) => renderVaultScreen(root, ctx),
  theater: (root) => renderTheaterScreen(root, ctx),
  battle: (root) => renderWarRoomScreen(root, ctx),
  dex: (root) => renderDexScreen(root, ctx),
};

// Colour scheme. `settings.theme` picks one of the blocks in style.css;
// ?theme= overrides it for previews without touching the save.
// Biohazard is the shipped scheme and lives in :root, so it needs no stamp —
// which also means a fresh load paints it before this ever runs.
const BASE_THEME = 'biohazard';
const THEMES = [BASE_THEME, 'lab', 'vivarium', 'blueprint', 'saturday'];
function applyTheme() {
  const override = new URLSearchParams(location.search).get('theme');
  const name = override ?? state.settings?.theme ?? BASE_THEME;
  if (name === BASE_THEME || !THEMES.includes(name)) delete document.documentElement.dataset.theme;
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
  applyElapsed(state, content, NOW());
  for (const line of tickVat(state, content, NOW()).news) pushNews(state, line);
  // A resequencing run finishes on its own clock, whether or not anyone is
  // watching — and waits politely if the pens are full.
  for (const line of tickResequencer(state, content, NOW()).news) pushNews(state, line);
  // A chimera that has finished settling acquires opinions (§3.5).
  ensureTemperaments(state, content, NOW());
  // An injury left to run its course may set badly and stay (§3.5).
  for (const line of tickScars(state, content, NOW()).news) pushNews(state, line);
  tickCampaign(state, content, NOW());
  saveGame(state);
  updateTicker();
  for (const cue of cuesFor(beforeCues, watchSignals(state))) sfx.play(cue);
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
  applyTheme();
  ensureRanchSeeded(state, content, NOW());
  ensureDexVariants(state, content);
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

  // R54: the save file panel. The three verbs live in save.js and are
  // DOM-free; everything here is the door, not the lock.
  const saveFileBtn = $('#savefile');
  // One downloader, two callers: the panel and the reset confirmation. The
  // confirmation is where it matters most, so it cannot be the copy that
  // drifts.
  const downloadSave = () => {
    const blob = new Blob([exportSave(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFilename(state);
    a.click();
    // Revoked on the next frame: revoking synchronously races the download
    // in some browsers and silently produces an empty file.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    sfx.play('click');
  };
  const openSaveFile = (note = '') => {
    const overlay = $('#overlay');
    overlay.hidden = false;
    overlay.innerHTML = `
      <div class="ceremony card">
        <h3>💾 Save File</h3>
        <p class="fine-print">This game lives in this browser. Clear the site data, change phones, or
          reinstall, and it is gone — unless you have carried it out first.</p>
        ${note ? `<p class="ranch-msg" id="sf-note">${note}</p>` : ''}
        <button type="button" id="sf-export" class="big-btn">⬇ Download my save</button>
        <p class="fine-print">Importing replaces the game in progress. The one it replaces is kept
          in this browser as a backup, and if it cannot be kept the import is refused instead.</p>
        <label for="sf-file" class="care-train" id="sf-pick">⬆ Load a save file…</label>
        <input type="file" id="sf-file" accept="application/json,.json" hidden>
        <hr class="sf-rule">
        <button type="button" id="sf-reset" class="pen-dismantle">Start a new run…</button>
        <button type="button" id="sf-close" class="care-train">Close</button>
      </div>`;
    overlay.querySelector('#sf-close').addEventListener('click', () => {
      overlay.hidden = true;
      overlay.innerHTML = '';
    });
    overlay.querySelector('#sf-export').addEventListener('click', () => {
      downloadSave();
      const el = overlay.querySelector('.fine-print');
      if (el) el.textContent = `Saved as ${exportFilename(state)}. Keep it somewhere that is not this phone.`;
    });
    overlay.querySelector('#sf-reset').addEventListener('click', () => {
      // Nothing to lose means nothing to confirm: a dialogue that guards an
      // empty ranch is how a player learns to tap through the one that
      // guards a real run.
      if (runSummary(state).empty) {
        const written = adoptSave(startNewRun(state));
        if (!written.ok) return openSaveFile(written.msg);
        return location.reload();
      }
      confirmNewRun();
    });
    overlay.querySelector('#sf-file').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const read = await file.text().catch(() => null);
      if (read === null) return openSaveFile('That file could not be read.');
      const parsed = importSave(read);
      if (!parsed.ok) return openSaveFile(parsed.msg);
      const written = adoptSave(parsed.save);
      if (!written.ok) return openSaveFile(written.msg);
      // Reload rather than swapping state in place: every screen, timer and
      // module-level cache in the game was built against the old save, and
      // a boot is the one path already proven to set all of them up.
      location.reload();
    });
  };
  // R55: the reset. Two taps, and the second one is only ever reached after
  // the first has said out loud what it costs — with the download button
  // repeated inside the confirmation, because "there is a backup in this
  // browser" is not a plan a player can hold.
  const confirmNewRun = () => {
    const overlay = $('#overlay');
    const sum = runSummary(state);
    overlay.hidden = false;
    overlay.innerHTML = `
      <div class="ceremony card">
        <h3>⚠ Start a new run?</h3>
        <p class="ranch-msg">This ends the current one: <strong>${sum.chimeras}</strong> chimera${sum.chimeras === 1 ? '' : 's'},
          <strong>${sum.animals}</strong> animal${sum.animals === 1 ? '' : 's'} on the ranch,
          <strong>${sum.parts}</strong> part token${sum.parts === 1 ? '' : 's'},
          <strong>${sum.nodes}</strong> node${sum.nodes === 1 ? '' : 's'} held, over ${sum.days} day${sum.days === 1 ? '' : 's'}.</p>
        <p class="fine-print">The run is kept in this browser as a backup — but a backup you cannot
          see is not a plan. Take the file first.</p>
        <button type="button" id="sf-export2" class="big-btn">⬇ Download it first</button>
        <p class="fine-print">Your sound setting and the field notes you have already read carry over.
          Everything else starts again from an empty ranch.</p>
        <button type="button" id="sf-go" class="pen-dismantle">Yes, start over</button>
        <button type="button" id="sf-back" class="care-train">Cancel</button>
      </div>`;
    overlay.querySelector('#sf-back').addEventListener('click', () => openSaveFile());
    overlay.querySelector('#sf-export2').addEventListener('click', () => downloadSave());
    overlay.querySelector('#sf-go').addEventListener('click', () => {
      const written = adoptSave(startNewRun(state));
      if (!written.ok) return openSaveFile(written.msg);
      location.reload();
    });
  };

  saveFileBtn.addEventListener('click', () => openSaveFile());

  // PWA: offline shell. Registration failure is never a problem worth
  // showing anyone.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();
